import { PBRMaterial, Vector3 } from "@babylonjs/core";
import * as B from "../../assets/PrefabsBursa";
import type { GameServices } from "../../core/GameServices";
import { LOOKS } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { CevirmeMinigame } from "../../minigames/CevirmeMinigame";
import { IskenderMinigame } from "../../minigames/IskenderMinigame";
import { KapiMinigame } from "../../minigames/KapiMinigame";
import { OrduMinigame } from "../../minigames/OrduMinigame";
import type { MinigameKind } from "../../missions/types";
import type { AtmospherePhase } from "../../rendering/Atmosphere";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { wait } from "../../utils/async";
import { clamp, easeInOutCubic } from "../../utils/math";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { buildBursaWorld, type BursaWorld } from "./BursaWorld";
import { GROUND_Y, LAYOUT } from "./layout";

const SCENARIO_ID = "bursa_1326";

/** A clear spring morning on the plain of Bursa; the sun in the south-east lights Uludağ's snow. */
function springMorning(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.istanbulMorning();
  sky.sunDirection = new Vector3(0.45, 0.62, -0.64).normalize();
  return { sky, sunIntensity: shadows ? 5 : 3.2, ambientIntensity: 1.05, environmentIntensity: 0.9, fogDensity: 0.00028 };
}

/** Late afternoon for the finale, the light going golden over the city. */
function goldenHour(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.muglaAfternoon();
  sky.sunDirection = new Vector3(-0.7, 0.3, -0.5).normalize();
  return { sky, sunIntensity: shadows ? 4.2 : 2.8, ambientIntensity: 0.95, environmentIntensity: 0.85, fogDensity: 0.0003 };
}

const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  bursa_m01: LAYOUT.spawn,
  bursa_m02: { x: -18, z: 1, yaw: -Math.PI / 2 },
  bursa_m03: { x: -12, z: -6, yaw: Math.PI },
  bursa_m04: { x: -15, z: -8, yaw: Math.PI },
  bursa_m05: { x: -16, z: -10.7, yaw: Math.PI },
  bursa_m06: { x: -13, z: -9, yaw: 0.6 },
  bursa_m07: { x: 0, z: 5, yaw: Math.PI / 2 },
};

const CHATTER = {
  janissary: [
    "Osman Gazi hazretleri hasta yatıyormuş; Bursa'nın fethini görmek en büyük dileği.",
    "Tekfur'un askerleri artık surlardan bile seyrek bakıyor.",
    "Gece Aktimur Hisarı'ndan meşale ile haber verdiler: her şey yolunda.",
    "Akıncılar yine Mudanya yolunda bir kafile yakalamış.",
    "Uludağ'ın karı erimeden Bursa bizim olur, inşallah.",
  ],
  worker: ["Atlara arpa verdim; Turgut Alp'in atı yine huysuz.", "Ok demetlerini saydım, okçulara yeter."],
  villager: ["Tarlamızı ekebiliyoruz artık; gazilerin sayesinde yol güvenli.", "Bursa'ya giden yol kapalı ama köylerin yolu açık."],
};

/**
 * Bursa · 1326 — the conquest of Bursa, played inside Balabancık Hisarı, one of the siege forts
 * Osman Gazi built around the city. A young gazi keeps the road blockaded, helps roast a lamb
 * for Orhan Gazi's table (and, in a flash-forward to 1867, watches İskender Efendi stand the
 * çevirme on its end), then commands the final siege on a 2D map at the war table.
 */
export class BursaScene extends FpsScenario<BursaWorld> {
  private games = new Map<MinigameKind, BaseMinigame>();
  private drivers: NPC[] = [];
  private orhan: NPC | null = null;
  private asci: NPC | null = null;
  private shadows: boolean;

  private constructor(services: GameServices) {
    const shadows = services.save.settings.shadows && services.preset().shadows !== "off";
    super(services, {
      scenarioId: SCENARIO_ID,
      missionsPath: "data/scenarios/bursa_1326.json",
      atmosphere: springMorning(shadows),
      postFx: { exposure: 1.05, contrast: 1.1, vignette: 2.2, grain: 5 },
      bounds: LAYOUT.bounds,
      music: "bursa",
      populateText: "Gaziler hisarda nöbete duruyor",
      chatter: CHATTER,
      nameplates: [
        { npc: "balabancik", name: "Balabancık Bey", role: "Hisar komutanı" },
        { npc: "asci", name: "Aşçı Hızır Usta", role: "Hisarın aşçısı" },
        { npc: "orhan", name: "Orhan Gazi", role: "Osmanlı Beyi" },
        { npc: "akcakoca", name: "Akçakoca", role: "Akıncı beyi" },
        { npc: "konur", name: "Konur Alp", role: "Alp" },
      ],
    });
    this.shadows = shadows;
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<BursaScene> {
    return FpsScenario.createInstance(new BursaScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<BursaWorld> {
    return buildBursaWorld(ctx);
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.bursa_m01;
  }

  protected introPath(): IntroPath {
    // From above Bursa's citadel, across the plain to the fort on its mound.
    const b = LAYOUT.bursa;
    const y = GROUND_Y;
    return this.introToPlayer(
      [new Vector3(b.x + 40, 120, b.z - 60), new Vector3(b.x - 40, 70, b.z + 160), new Vector3(-40, y + 40, -90)],
      [new Vector3(b.x, 30, b.z), new Vector3(b.x, 20, b.z), new Vector3(0, y + 2, 0)],
      12,
    );
  }

  protected override voicePitch(speaker: string): number {
    if (speaker.startsWith("Orhan")) return 0.82;
    if (speaker.startsWith("Balabancık")) return 0.78;
    if (speaker.startsWith("Aşçı")) return 0.9;
    if (speaker.startsWith("Akçakoca")) return 0.86;
    if (speaker === "Anlatıcı") return 0.9;
    return super.voicePitch(speaker);
  }

  protected override afterPopulate(): void {
    // Sun + sky + the roasting fire and the camp fire.
    for (const m of this.scene.materials) if (m instanceof PBRMaterial) m.maxSimultaneousLights = 6;
    this.services.audio.setAmbience({ camp: 0.32, wind: 0.12 });
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    const wt = L.warTable;
    this.spawn("commander", LOOKS.balabancik(), 6, -4, -Math.PI / 2, { type: "pose", anim: "idle" }, "Balabancık Bey", "balabancik");
    this.asci = this.spawn("worker", LOOKS.asciHizir(), L.spit.x + 2.8, L.spit.z + 0.6, -Math.PI / 2, { type: "pose", anim: "idle" }, "Aşçı Hızır Usta", "asci");
    // Orhan Gazi and his alps at the war table before the otağ.
    this.orhan = this.spawn("commander", LOOKS.orhanGazi(), wt.x + 1.5, wt.z, -Math.PI / 2, { type: "pose", anim: "idle" }, "Orhan Gazi", "orhan");
    this.orhan.lookAtPlayer = true;
    this.spawn("commander", { ...LOOKS.gazi(1), longKaftan: true, kaftan: "#7a2a1f", hat: "bork" }, wt.x + 0.6, wt.z - 1.9, -0.6, { type: "pose", anim: "idle" }, "Akçakoca", "akcakoca");
    this.spawn("commander", { ...LOOKS.gazi(2), longKaftan: true, kaftan: "#3f4a2a" }, wt.x + 0.6, wt.z + 1.9, -2.4, { type: "pose", anim: "idle" }, "Konur Alp", "konur");
    // Guards before the otağ, at the gate and on the walls.
    for (const dz of [-3.6, 3.6]) this.spawn("janissary", LOOKS.gazi(dz > 0 ? 0 : 2), L.otag.x - 5.6, L.otag.z + dz * 0.7, -Math.PI / 2, { type: "pose", anim: "guard" }, "Muhafız");
    for (const dz of [-3.9, 3.9]) this.spawn("janissary", LOOKS.gazi(dz > 0 ? 3 : 4), L.barrier.x + 1.6, dz, dz > 0 ? -2.4 : -0.7, { type: "pose", anim: "guard" }, "Kapı nöbetçisi");
    const W = L.wall;
    for (const [x, z, h] of [
      [W.x0 - 1.0, 12, -Math.PI / 2],
      [W.x0 - 1.0, -17.5, -Math.PI / 2],
      [-8, W.z0 - 1.2, Math.PI],
      [10, W.z0 - 1.2, Math.PI],
      [-10, W.z1 + 1.2, 0],
      [12, W.z1 + 1.2, 0],
      [W.x1 + 1.2, -6, Math.PI / 2],
      [W.x1 + 1.2, 8, Math.PI / 2],
    ] as const)
      this.spawn("janissary", LOOKS.gazi(Math.round(x + z)), x, z, h, { type: "pose", anim: "guard" }, "Sur nöbetçisi");
    // Gazis about the courtyard, by the camp fire, grooms at the stable.
    const extra = Math.max(3, Math.round(8 * density));
    for (let i = 0; i < extra; i++) {
      const sit = i % 3 === 0;
      const a = (i / extra) * Math.PI * 2;
      const x = sit ? -2 + Math.cos(a) * 2.4 : 2 + Math.cos(a) * 6;
      const z = sit ? 14 + Math.sin(a) * 2.4 : 2 + Math.sin(a) * 6;
      this.spawn("janissary", LOOKS.gazi(i + 5), x, z, a + Math.PI, sit ? { type: "pose", anim: "sit" } : { type: "wander", cx: 2, cz: 0, radius: 9 }, "Gazi");
    }
    this.spawn("worker", { ...LOOKS.villager(2), rightItem: "none" }, L.stable.x - 1.2, L.stable.z - 1.6, Math.PI, { type: "pose", anim: "work" }, "Seyis");
    this.spawn("worker", { ...LOOKS.villager(4), rightItem: "none" }, L.armory.x + 2.6, L.armory.z + 1.6, 0.4, { type: "pose", anim: "work" }, "Cebeci");
    this.spawn("worker", { ...LOOKS.gazi(7), apron: "#d8ccb0" }, -2.6, 15.6, 2.6, { type: "pose", anim: "stir" }, "Kazancı");
    // Cart drivers for the checkpoint (shown only while the gate minigame runs).
    for (const look of [LOOKS.villager(1), LOOKS.merchant(1)]) {
      const n = this.spawn("villager", look, -46, 40, Math.PI, { type: "scripted" }, "Yolcu");
      n.visible = false;
      n.lookAtPlayer = false;
      this.drivers.push(n);
    }
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    let game = this.games.get(kind);
    if (game) return game;
    const { ui, input, audio } = this.services;
    const common = { layer: ui.hud.minigameLayer, input, audio, hud: ui.hud, mobile: ui.mobile, player: this.player };
    const w = this.world;
    if (kind === "kapi") {
      const c = w.checkpoint;
      game = new KapiMinigame({
        ...common,
        stand: c.stand,
        facing: c.facing,
        cartStop: c.cartStop,
        cartFrom: c.cartFrom,
        cartTo: c.cartTo,
        carts: w.carts,
        drivers: this.drivers,
        groundY: (x, z) => w.terrain.heightAt(x, z),
      });
    } else if (kind === "cevirme") {
      const r = w.roast;
      game = new CevirmeMinigame({ ...common, fx: this.fx, stand: r.stand, facing: r.facing, spit: r.spit, lamb: r.lamb, material: r.material, light: r.light, fire: r.fire, smoke: r.smoke });
    } else if (kind === "iskender") {
      game = new IskenderMinigame(common);
    } else {
      game = new OrduMinigame(common);
    }
    this.games.set(kind, game);
    return game;
  }

  // ================================================================== hooks
  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const instant = phase === "resume";
    const w = this.world;
    switch (id) {
      case "bursa:look":
        // Turn to the besieged city on its hill under Uludağ.
        if (!instant) {
          const p = this.player.position;
          const b = LAYOUT.bursa;
          this.player.yaw = Math.atan2(b.x - p.x, b.z - p.z);
          this.player.pitch = -0.02;
        }
        break;
      case "kuzu:roasted":
        // The lamb stays golden on the spit, the Usta proud beside it.
        w.roast.material.albedoColor.set(0.39, 0.15, 0.04);
        w.props.logs.forEach((l) => l.setEnabled(true));
        if (this.asci && !instant) {
          this.asci.anim = "cheer";
          window.setTimeout(() => this.asci && (this.asci.anim = "idle"), 2500);
        }
        break;
      case "kebap:served":
        w.props.tray.setEnabled(true);
        this.atmosphere.transition(goldenHour(this.shadows), instant ? 0 : 30);
        break;
    }
  }

  override onTargetDone(targetId: string): void {
    const { audio } = this.services;
    const [anchor, n] = targetId.split(":");
    if (anchor === "ocak") {
      this.world.props.logs[Math.min(1, Number(n) - 1)]?.setEnabled(true);
      audio.play("drop", { volume: 0.6 });
      audio.play("fireCrackle", { volume: 0.4 });
    } else if (anchor === "otag_sofra") {
      this.world.props.tray.setEnabled(true);
      audio.play("drop", { volume: 0.5 });
      if (this.orhan) {
        this.orhan.anim = "talk";
        window.setTimeout(() => this.orhan && (this.orhan.anim = "idle"), 3000);
      }
    }
  }

  protected carrySpec(item: string): CarrySpec {
    if (item === "logs") return { parts: B.heldLogs(), position: [0.28, -0.36, 0.62], rotation: [0.1, 0.5, 0.15] };
    return { parts: B.kebapTray(), position: [0, -0.42, 0.66], rotation: [0.12, 0, 0] };
  }

  // ===================================================================== ending
  protected async showEnding(): Promise<void> {
    const { ui, audio, save, input } = this.services;
    save.completeScenario(SCENARIO_ID);
    this.playing = false;
    this.player.controlEnabled = false;
    input.exitPointerLock();
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    this.atmosphere.transition(goldenHour(this.shadows), 0);
    audio.playMusic("victory");
    // The banners go up on every wall, gazis cheer.
    for (const n of this.npcs.npcs) if (n.role === "janissary" && n.visible && n.behavior.type === "pose") n.setBehavior({ type: "pose", anim: "cheer" });
    const flags = this.world.props.sancaks;
    const flagY = flags.map((f) => f.position.y);
    // Up onto the rampart and out across the plain to Bursa under Uludağ.
    const cam = this.player.camera;
    const from = cam.position.clone();
    const lookFrom = from.add(this.player.forward().scale(6));
    const r = this.world.rampart;
    const b = LAYOUT.bursa;
    const to = new Vector3(r.x - 1.5, r.y + 3.2, r.z + 4);
    const target = new Vector3(b.x, 30, b.z);
    let t = 0;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      t += Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
      const k = easeInOutCubic(clamp(t / 7, 0, 1));
      cam.position.copyFrom(Vector3.Lerp(from, to, k));
      cam.setTarget(Vector3.Lerp(lookFrom, target, easeInOutCubic(clamp(t / 5, 0, 1))));
      flags.forEach((f, i) => (f.position.y = flagY[i] + Math.min(1.5, t * 0.4)));
    });
    audio.play("fanfare", { volume: 0.6 });
    window.setTimeout(() => audio.play("cheer", { volume: 0.7 }), 1200);
    ui.hud.toast("6 Nisan 1326 — Bursa teslim oldu. Orhan Gazi şehre girdi.", "success", 6000);
    await wait(9000);
    audio.stopMusic(6);
    await ui.cinematic.fade(1, 4, true);
    ui.cinematic.showQuote("“Oğul! Ben öldüğümde beni Bursa'da şu Gümüşlü Kubbe'nin altına koyasın.”", "Osman Gazi'nin Orhan Bey'e vasiyeti (rivayet) · Bursa, Osmanlı'nın ilk başkenti oldu", {
      dark: true,
      actionsDelay: 6000,
      actions: this.endingButtons().map((btn) => ({
        ...btn,
        onClick: () => {
          void ui.cinematic.hideQuote(0.3);
          btn.onClick();
        },
      })),
    });
  }

  override dispose(): void {
    this.games.clear();
    void this.services.ui.cinematic.hideQuote(0);
    super.dispose();
  }
}
