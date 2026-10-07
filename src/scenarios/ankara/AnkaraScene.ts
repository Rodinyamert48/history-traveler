import { Vector3 } from "@babylonjs/core";
import { heldChair } from "../../assets/PrefabsAnkara";
import type { GameServices } from "../../core/GameServices";
import { LOOKS } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { LampMinigame } from "../../minigames/LampMinigame";
import { MinutesMinigame } from "../../minigames/MinutesMinigame";
import { TelegraphMinigame } from "../../minigames/TelegraphMinigame";
import type { MinigameKind } from "../../missions/types";
import type { AtmospherePhase } from "../../rendering/Atmosphere";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { wait } from "../../utils/async";
import { clamp, easeInOutCubic } from "../../utils/math";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { buildAnkaraWorld, type AnkaraWorld, type Seat } from "./AnkaraWorld";
import { LAYOUT } from "./layout";

const SCENARIO_ID = "ankara_1920";

/** Spring afternoon light falling through the windows (no fog indoors). */
function afternoon(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.istanbulMorning();
  sky.sunDirection = new Vector3(-0.45, 0.62, -0.64).normalize();
  // Without shadow maps the roof cannot block the sun, so keep it soft.
  return { sky, sunIntensity: shadows ? 3.6 : 0.7, ambientIntensity: 1.1, environmentIntensity: 0.7, fogDensity: 0 };
}

const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  ankara_m01: LAYOUT.spawn,
  ankara_m02: { x: 3.5, z: -2, yaw: 1.4 },
  ankara_m03: { x: 0, z: -1.5, yaw: 0 },
  ankara_m04: { x: -6, z: -2, yaw: -2.4 },
  ankara_m05: { x: 0, z: -5, yaw: Math.PI },
  ankara_m06: { x: -2, z: 1.6, yaw: 0 },
  ankara_m07: { x: LAYOUT.clerkDesk.x - 1.25, z: LAYOUT.clerkDesk.z, yaw: 1.2 },
};

/** Opening speech of the oldest deputy, Şerif Bey (simplified summary). */
const SPEECH = [
  "İstanbul'un yabancı kuvvetlerce geçici olarak işgal edildiği bilinmektedir.",
  "Bu duruma boyun eğmek, milletimizi yabancı esaretine razı etmek demektir.",
  "Büyük Millet Meclisi'ni açıyorum.",
];

const GREETED = [
  { id: "mebus_1", name: "Konya Mebusu", look: 2 },
  { id: "mebus_2", name: "Erzurum Mebusu", look: 1 },
  { id: "mebus_3", name: "Kastamonu Mebusu", look: 3 },
];

const CHATTER = {
  villager: [
    "Hacı Bayram'dan buraya kadar halk bizi dualarla uğurladı.",
    "Günlerce at sırtında, kağnıyla yol aldık; çok şükür yetiştik.",
    "İstanbul işgal altında; milletin sesi artık bu çatı altından yükselecek.",
    "Sıralar okul sırası ama burada bir devletin temeli atılıyor.",
  ],
  commander: ["Kapıda nöbetteyiz efendim, içerisi emin ellerde.", "Ankara bugün bayram yeri gibi.", "Kuvâ-yi Milliye uyanık, siz gönlünüzü ferah tutun."],
  worker: ["Sıraları sabaha kadar mekteplerden taşıdık.", "Sobayı yaktım; nisan ama salon serin oluyor.", "Gaz tenekeleri depoda, lambalar sende."],
};

/**
 * Ankara · 23 Nisan 1920 — the opening of the Grand National Assembly, played entirely inside
 * the first Assembly building. Lamps, telegraph and minutes minigames lead to the opening,
 * Mustafa Kemal Paşa's words at the lectern and a slow fade to his words on the youth.
 */
export class AnkaraScene extends FpsScenario<AnkaraWorld> {
  private games = new Map<MinigameKind, BaseMinigame>();
  private mk: NPC | null = null;
  private serif: NPC | null = null;
  private greeted: NPC[] = [];
  private deputies: NPC[] = [];
  private walkers: { npc: NPC; seat: Seat; started: number }[] = [];
  private lampLevel = 0;
  private freeSeats: Seat[] = [];

  private constructor(services: GameServices) {
    const shadows = services.save.settings.shadows && services.preset().shadows !== "off";
    super(services, {
      scenarioId: SCENARIO_ID,
      missionsPath: "data/scenarios/ankara_1920.json",
      atmosphere: afternoon(shadows),
      postFx: { exposure: 1.18, contrast: 1.12, vignette: 2.8, grain: 8 },
      bounds: LAYOUT.bounds,
      music: "ankara",
      populateText: "Meclis binası hazırlanıyor",
      chatter: CHATTER,
      nameplates: [
        { npc: "mk", name: "Mustafa Kemal Paşa", role: "Ankara Mebusu" },
        { npc: "serif", name: "Şerif Bey", role: "Sinop Mebusu · en yaşlı üye" },
        { npc: "baskatip", name: "Başkâtip Nuri Efendi", role: "Meclis kâtibi" },
        { npc: "telgrafci", name: "Hamdi Efendi", role: "Telgrafçı" },
      ],
    });
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<AnkaraScene> {
    return FpsScenario.createInstance(new AnkaraScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<AnkaraWorld> {
    return buildAnkaraWorld(ctx);
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.ankara_m01;
  }

  protected introPath(): IntroPath {
    // Inside only: from the dais over the desks, through the hall door down to the entrance.
    const eye = this.player.eyePosition.clone();
    const fwd = this.player.forward();
    return {
      points: [new Vector3(-9, 3.7, 13.6), new Vector3(6, 3.3, 5), new Vector3(0, 2.5, 0.8), new Vector3(0, 1.9, -4.5), eye],
      look: [new Vector3(0, 1.2, 7), new Vector3(0, 1.5, 12.5), new Vector3(0, 1.7, -3), new Vector3(0, 1.7, -10), eye.add(fwd.scale(10))],
      duration: 9,
    };
  }

  protected override voicePitch(speaker: string): number {
    if (speaker.startsWith("Şerif")) return 0.75;
    if (speaker.startsWith("Mustafa")) return 0.85;
    if (speaker === "Anlatıcı") return 0.9;
    return super.voicePitch(speaker);
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    this.freeSeats = [...this.world.seats];
    this.spawn("worker", LOOKS.clerk1920(0), 2.6, -2.2, -2.2, { type: "pose", anim: "idle" }, "Başkâtip Nuri Efendi", "baskatip");
    const tg = L.telegraph;
    this.spawn("worker", { ...LOOKS.clerk1920(1), hat: "kalpak", hatColor: "#2e2a26" }, tg.x + 0.95, tg.z - 0.7, -Math.PI / 2, { type: "pose", anim: "sit" }, "Telgrafçı Hamdi Efendi", "telgrafci");
    for (const x of [-2.1, 2.1]) {
      const g = this.spawn("commander", LOOKS.soldier1920(x > 0 ? 1 : 0), x, -10.2, 0, { type: "pose", anim: "guard" }, "Nöbetçi");
      g.lookAtPlayer = true;
    }
    for (const x of [-2.5, 2.5]) this.spawn("commander", LOOKS.soldier1920(1), x, -0.9, Math.PI, { type: "pose", anim: "guard" }, "Nöbetçi");
    // Attendants (hademe) still busy in the hall.
    for (let i = 0; i < Math.max(2, Math.round(3 * density)); i++) {
      this.spawn("worker", { ...LOOKS.worker(i), hat: "fes", hatColor: "#9e1a1f" }, -6 + i * 5, 6 + (i % 2) * 2, i, { type: "wander", cx: 0, cz: 6, radius: 7 }, "Hademe");
    }
  }

  private takeSeat(prefer?: (s: Seat) => number): Seat {
    let idx = 0;
    if (prefer) {
      let best = Infinity;
      this.freeSeats.forEach((s, i) => {
        const v = prefer(s);
        if (v < best) {
          best = v;
          idx = i;
        }
      });
    } else idx = Math.floor(this.rnd.next() * this.freeSeats.length);
    return this.freeSeats.splice(idx, 1)[0];
  }

  private seatNpc(npc: NPC, seat: Seat): void {
    this.npcs.relocate(npc, seat.x, seat.z, seat.heading);
    npc.setBehavior({ type: "pose", anim: "sit" });
    npc.lookAtPlayer = false;
  }

  private spawnArrivals(): void {
    if (this.greeted.length) return;
    GREETED.forEach((g, i) => {
      const a = this.world.anchors.get(g.id)!;
      const n = this.spawn("villager", LOOKS.deputy(g.look), a.x, a.z, Math.PI, { type: "pose", anim: "idle" }, g.name, `deputy_${i}`);
      this.greeted.push(n);
    });
    // Mustafa Kemal Paşa and Şerif Bey arrive with the others and wait by the hall door.
    this.mk = this.spawn("elder", LOOKS.mustafaKemal(), -1.4, -2.0, Math.PI * 0.9, { type: "pose", anim: "talk" }, "Mustafa Kemal Paşa", "mk");
    this.serif = this.spawn("elder", { ...LOOKS.deputy(2), beard: "#e8e2d6", longKaftan: true, hat: "turban", hatColor: "#f2ede2", kaftan: "#2e3a46" }, 1.2, -2.2, -Math.PI * 0.8, { type: "pose", anim: "idle" }, "Şerif Bey", "serif");
  }

  private seated = false;

  private seatEveryone(instant: boolean): void {
    if (this.seated) return;
    this.seated = true;
    this.spawnArrivals();
    const L = LAYOUT;
    // Mustafa Kemal Paşa in the front row by the aisle, Şerif Bey at the lectern.
    const mkSeat = this.takeSeat((s) => Math.hypot(s.x + 4.35, s.z - (L.deskRows[4] - 0.34)));
    this.seatNpc(this.mk!, mkSeat);
    this.npcs.relocate(this.serif!, L.lectern.x, L.lectern.z + 0.65, Math.PI);
    this.serif!.place(L.lectern.x, this.world.daisY, L.lectern.z + 0.65, Math.PI);
    this.serif!.setBehavior({ type: "pose", anim: "idle" });
    // The three greeted deputies walk in; everyone else is already seated.
    this.greeted.forEach((n) => {
      const seat = this.takeSeat((s) => s.z + Math.abs(s.x) * 0.2);
      if (instant) this.seatNpc(n, seat);
      else {
        // "idle" (not "scripted") so the NPC actually follows its path.
        n.setBehavior({ type: "idle" });
        n.moveTo(this.npcs.context, seat.x, seat.z - 1.2, false);
        this.walkers.push({ npc: n, seat, started: this.time });
      }
    });
    if (this.deputies.length) return;
    const n = Math.min(this.freeSeats.length, Math.round(26 * Math.max(0.55, this.services.preset().npcDensity)));
    for (let i = 0; i < n; i++) {
      const seat = this.takeSeat();
      const d = this.spawn("villager", LOOKS.deputy(i + 4), seat.x, seat.z, 0, { type: "pose", anim: "sit" }, "Mebus");
      this.seatNpc(d, seat);
      this.deputies.push(d);
    }
    this.services.audio.setAmbience({ camp: 0.45, wind: 0.08 });
  }

  protected override onPlayingUpdate(): void {
    // Deputies walking to their seats.
    this.walkers = this.walkers.filter((w) => {
      const p = w.npc.position;
      const arrived = !w.npc.isMoving && Math.hypot(p.x - w.seat.x, p.z - (w.seat.z - 1.2)) < 1.2;
      if (arrived || this.time - w.started > 25) {
        this.seatNpc(w.npc, w.seat);
        return false;
      }
      return true;
    });
    // Mustafa Kemal Paşa walking to the lectern.
    if (this.mkWalking) {
      const p = this.mk!.position;
      if ((!this.mk!.isMoving && Math.hypot(p.x - LAYOUT.lectern.x, p.z - (LAYOUT.lectern.z - 1.6)) < 1.5) || this.time - this.mkWalking > 20) this.placeMkAtLectern();
    }
  }

  private mkWalking = 0;

  private placeMkAtLectern(): void {
    const L = LAYOUT;
    this.mkWalking = 0;
    const mk = this.mk!;
    mk.setBehavior({ type: "scripted" });
    mk.place(L.lectern.x, this.world.daisY, L.lectern.z + 0.65, Math.PI);
    mk.anim = "talk";
    mk.lookAtPlayer = false;
    mk.applyTransform();
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    let game = this.games.get(kind);
    if (game) return game;
    const { ui, input, audio } = this.services;
    const common = { layer: ui.hud.minigameLayer, input, audio, hud: ui.hud, mobile: ui.mobile, player: this.player };
    const w = this.world;
    if (kind === "lamps") {
      game = new LampMinigame({
        ...common,
        fx: this.fx,
        lamps: w.lamps.map((l) => ({
          position: l.position,
          get lit() {
            return l.lit;
          },
          set lit(v: boolean) {
            l.lit = v;
          },
          light: () => l.flame.setEnabled(true),
        })),
        onProgress: (n) => this.setLampLevel(n / w.lamps.length),
      });
    } else if (kind === "telegraph") {
      game = new TelegraphMinigame({ ...common, stand: w.morse.stand, facing: w.morse.facing, lever: w.morse.lever });
    } else {
      game = new MinutesMinigame({
        ...common,
        stand: w.clerk.stand,
        facing: w.clerk.facing,
        lines: SPEECH,
        onLine: (i) => {
          if (this.serif) this.serif.setBehavior({ type: "pose", anim: i === SPEECH.length - 1 ? "point" : "talk" });
          audio.play("murmur", { volume: 0.6, pitch: 0.75 });
          ui.hud.toast(`Şerif Bey: “${SPEECH[i]}”`, "info", 4200);
        },
      });
    }
    this.games.set(kind, game);
    return game;
  }

  private setLampLevel(level: number): void {
    this.lampLevel = clamp(level, 0, 1);
    const base = [1.7, 1.7, 1.3];
    this.world.hallLights.forEach((l, i) => (l.intensity = base[i] * this.lampLevel));
  }

  // ================================================================== hooks
  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const instant = phase === "resume";
    const { audio } = this.services;
    switch (id) {
      case "chairs:placed":
        for (const c of this.world.presidencyChairs) c.setEnabled(true);
        break;
      case "lamps:lit":
        for (const l of this.world.lamps) {
          l.lit = true;
          l.flame.setEnabled(true);
        }
        this.setLampLevel(1);
        break;
      case "deputies:arrive":
        this.spawnArrivals();
        if (!instant) {
          audio.play("distantShout", { volume: 0.7 });
          audio.play("cheer", { volume: 0.5 });
        }
        break;
      case "deputies:seated":
        this.seatEveryone(instant);
        break;
      case "assembly:opened":
        if (!instant) {
          audio.play("applause", { volume: 1 });
          window.setTimeout(() => audio.play("applause", { volume: 0.8 }), 1800);
        }
        break;
      case "mk:lectern": {
        this.seatEveryone(true);
        // Şerif Bey steps back to the presidency table; the Paşa walks to the lectern.
        const L = LAYOUT;
        this.serif!.place(0, this.world.daisY, L.presidency.z + 0.95, Math.PI);
        this.serif!.setBehavior({ type: "pose", anim: "idle" });
        if (instant) this.placeMkAtLectern();
        else {
          const mk = this.mk!;
          mk.setBehavior({ type: "idle" });
          mk.moveTo(this.npcs.context, L.lectern.x - 1.2, L.lectern.z - 1.6, false);
          this.mkWalking = this.time;
        }
        break;
      }
    }
  }

  protected carrySpec(): CarrySpec {
    return { parts: heldChair(), position: [-0.12, -0.2, 0.25], rotation: [0.35, 0.5, 0] };
  }

  override onTargetDone(targetId: string): void {
    const { audio, ui } = this.services;
    const [anchor] = targetId.split(":");
    if (anchor.startsWith("baskanlik_")) {
      this.world.presidencyChairs[Number(anchor.split("_")[1]) - 1]?.setEnabled(true);
      audio.play("woodKnock", { volume: 0.6 });
      return;
    }
    const g = GREETED.findIndex((x) => x.id === targetId);
    if (g >= 0) {
      const npc = this.greeted[g];
      npc.setBehavior({ type: "pose", anim: "bow" });
      audio.play("murmur", { volume: 0.6, pitch: 0.85 + g * 0.08 });
      ui.hud.toast(`${GREETED[g].name}: “Sağ ol evladım. Hayırlı olsun, millete hayırlı olsun!”`, "info", 3600);
    }
  }

  // ===================================================================== ending
  protected async showEnding(): Promise<void> {
    const { ui, audio, save, input } = this.services;
    const L = LAYOUT;
    save.completeScenario(SCENARIO_ID);
    this.playing = false;
    this.player.controlEnabled = false;
    input.exitPointerLock();
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    this.placeMkAtLectern();
    this.mk!.anim = "point";
    // Slow push-in from the clerk's desk toward the lectern.
    const cam = this.player.camera;
    const from = cam.position.clone();
    const to = new Vector3(L.lectern.x - 0.9, 1.85, L.lectern.z - 3.4);
    const target = new Vector3(L.lectern.x, this.world.daisY + 1.85, L.lectern.z + 0.65);
    // The FPS camera is driven by yaw/pitch, so start looking where the player was looking.
    const lookFrom = from.add(this.player.forward().scale(6));
    let t = 0;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      t += Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
      const k = easeInOutCubic(clamp(t / 9, 0, 1));
      cam.position.copyFrom(Vector3.Lerp(from, to, k));
      cam.setTarget(Vector3.Lerp(lookFrom, target, easeInOutCubic(clamp(t / 2.5, 0, 1))));
    });
    await wait(1800);
    audio.play("murmur", { volume: 0.7, pitch: 0.82 });
    ui.cinematic.showQuote("“Egemenlik kayıtsız şartsız milletindir.”", "Mustafa Kemal Paşa");
    await wait(4200);
    audio.play("applause", { volume: 1 });
    window.setTimeout(() => audio.play("applause", { volume: 0.9 }), 1500);
    window.setTimeout(() => audio.play("applause", { volume: 0.7 }), 3200);
    for (const d of [...this.deputies, ...this.greeted]) d.setBehavior({ type: "pose", anim: "cheer" });
    await wait(3500);
    void ui.cinematic.hideQuote(1.6);
    audio.stopMusic(7);
    await ui.cinematic.fade(1, 6, true);
    ui.cinematic.showQuote(
      "“Biz her şeyi gençliğe bırakacağız… Geleceğin ümidi, ışıklı çiçekleri onlardır. Bütün ümidim gençliktedir.”",
      "Mustafa Kemal Atatürk",
      {
        dark: true,
        actionsDelay: 6500,
        actions: this.endingButtons().map((b) => ({
          ...b,
          onClick: () => {
            void ui.cinematic.hideQuote(0.3);
            b.onClick();
          },
        })),
      },
    );
  }

  override dispose(): void {
    this.games.clear();
    void this.services.ui.cinematic.hideQuote(0);
    this.services.audio.setTone(false);
    super.dispose();
  }
}
