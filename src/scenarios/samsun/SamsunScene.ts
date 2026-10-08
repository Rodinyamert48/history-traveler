import { TransformNode, Vector3 } from "@babylonjs/core";
import * as SP from "../../assets/PrefabsSamsun";
import { GAME_CONFIG } from "../../config/gameConfig";
import type { GameServices } from "../../core/GameServices";
import { LOOKS } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import { AtisMinigame } from "../../minigames/AtisMinigame";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { DuelloMinigame } from "../../minigames/DuelloMinigame";
import { DurbunMinigame } from "../../minigames/DurbunMinigame";
import { TorenMinigame } from "../../minigames/TorenMinigame";
import type { MinigameKind } from "../../missions/types";
import type { AtmospherePhase } from "../../rendering/Atmosphere";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { Water } from "../../rendering/Water";
import { wait } from "../../utils/async";
import { clamp, easeInOutCubic } from "../../utils/math";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { LAYOUT } from "./layout";
import { buildSamsunWorld, type SamsunWorld } from "./SamsunWorld";

const SCENARIO_ID = "samsun_1919";

/** First light over the Black Sea: the sun rises in the east, low and golden. */
function dawn(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.muglaDawn();
  sky.sunDirection = new Vector3(0.86, 0.2, 0.28).normalize();
  return { sky, sunIntensity: shadows ? 3.6 : 2.4, ambientIntensity: 0.85, environmentIntensity: 0.8, fogDensity: 0.00035 };
}

function morning(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.istanbulMorning();
  sky.sunDirection = new Vector3(0.62, 0.55, 0.36).normalize();
  return { sky, sunIntensity: shadows ? 5 : 3.2, ambientIntensity: 1.0, environmentIntensity: 0.9, fogDensity: 0.00025 };
}

const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  samsun_m01: LAYOUT.spawn,
  samsun_m02: { x: -18, z: 4, yaw: -Math.PI / 2 },
  samsun_m03: { x: 2, z: 24, yaw: 0 },
  samsun_m04: { x: -10, z: -18, yaw: -2.4 },
  samsun_m05: { x: 16, z: 0, yaw: 0 },
  samsun_m06: { x: 6, z: 26, yaw: 0 },
};

const CHATTER = {
  janissary: [
    "Mondros'tan beri ordu terhis ediliyor, silahlar toplanıyor… Ama bu tepeyi bırakmayız.",
    "Şehirde İngiliz askerleri dolaşıyor; limanda gemileri demirli.",
    "Köylerde silahlı çeteler var; geceleri nöbeti iki katına çıkardık.",
    "Karadeniz'in sabahı bir başka güzel, değil mi?",
    "Memleketten mektup geldi; anam 'gözün arkada kalmasın' diyor.",
  ],
  commander: ["Nöbetinize dikkat! Bugün önemli bir gün.", "Tüfeklerin temizliği tamam mı?"],
  worker: ["Çorba kaynıyor; nöbetten dönen aç kalmasın.", "Cephane sandıklarını saydım, eksik yok."],
};

/**
 * Samsun · 19 Mayıs 1919 — the start of the National Struggle, played on a hilltop army
 * post above the town. A young soldier drills, shoots, keeps the lookout until the Bandırma
 * comes in, stops a band raiding the villages (a 2D pixel-art boss fight) and salutes
 * Mustafa Kemal Paşa; the chapter ends on an old-photograph tableau and words from Nutuk.
 */
export class SamsunScene extends FpsScenario<SamsunWorld> {
  private games = new Map<MinigameKind, BaseMinigame>();
  private rank: NPC[] = [];
  private tegmen: NPC | null = null;
  private eleni: NPC | null = null;
  private cete: NPC | null = null;
  private prisoner: NPC[] = [];
  private mk: NPC | null = null;
  private staff: NPC[] = [];
  private mkWalking = 0;
  private bandirma: { moving: boolean; t: number } = { moving: false, t: 0 };
  private rifleNode: TransformNode | null = null;
  private shadows: boolean;

  private constructor(services: GameServices) {
    const shadows = services.save.settings.shadows && services.preset().shadows !== "off";
    super(services, {
      scenarioId: SCENARIO_ID,
      missionsPath: "data/scenarios/samsun_1919.json",
      atmosphere: dawn(shadows),
      postFx: { exposure: 1.08, contrast: 1.12, vignette: 2.6, grain: 7 },
      bounds: LAYOUT.bounds,
      music: "samsun",
      populateText: "Karakol sabah içtimasına hazırlanıyor",
      chatter: CHATTER,
      nameplates: [
        { npc: "yuzbasi", name: "Yüzbaşı Rıza Bey", role: "Karakol komutanı" },
        { npc: "cavus", name: "Çavuş Hasan", role: "Atış talimi" },
        { npc: "tegmen", name: "Teğmen Kemal Efendi", role: "Bölük subayı" },
        { npc: "eleni", name: "Eleni Hanım", role: "Köyden komşu" },
        { npc: "cete", name: "Çete reisi Yorgos", role: "Silahlı çete" },
        { npc: "mk", name: "Mustafa Kemal Paşa", role: "9. Ordu Müfettişi" },
      ],
    });
    this.shadows = shadows;
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<SamsunScene> {
    return FpsScenario.createInstance(new SamsunScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<SamsunWorld> {
    return buildSamsunWorld(ctx);
  }

  protected override afterWorld(): void {
    const preset = this.services.preset();
    const waterRect: [number, number, number, number] = [-700, 200, 1400, 1400];
    this.water = new Water(
      this.scene,
      {
        extent: preset.waterExtent,
        cells: preset.waterCells,
        level: LAYOUT.waterLevel,
        waveAmplitude: 0.5,
        waveFrequency: 0.6,
        deepColor: "#123a52",
        shallowColor: "#3a7f86",
        foamColor: "#f4f1e8",
        foamAmount: 0.8,
        fogColor: this.scene.fogColor,
        fogDensity: GAME_CONFIG.world.fogDensity,
        depth: { data: this.world.terrain.depthMap(256, waterRect, 8, LAYOUT.waterLevel), width: 256, height: 256, rect: waterRect },
        animate: preset.waterCells > 80,
      },
      this.sky.params,
    );
    // First-person Mauser for the firing range.
    this.rifleNode = new TransformNode("held-rifle", this.scene);
    this.rifleNode.parent = this.player.hand;
    for (const m of this.prefabs.buildUnique("held-rifle", SP.heldRifle(), this.rifleNode, false)) m.renderingGroupId = 1;
    this.rifleNode.setEnabled(false);
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.samsun_m01;
  }

  protected introPath(): IntroPath {
    // From over the sea at dawn, past the harbour and up the slope to the post.
    const y = this.world.plateauY;
    return this.introToPlayer([new Vector3(-60, 40, 520), new Vector3(30, 30, 330), new Vector3(10, y + 30, 120)], [new Vector3(40, 5, 380), new Vector3(0, y, 0), new Vector3(0, y + 4, 0)], 11);
  }

  protected override voicePitch(speaker: string): number {
    if (speaker.startsWith("Mustafa")) return 0.85;
    if (speaker.startsWith("Yüzbaşı")) return 0.8;
    if (speaker.startsWith("Eleni")) return 1.25;
    if (speaker.startsWith("Çete")) return 0.7;
    if (speaker === "Anlatıcı") return 0.9;
    return super.voicePitch(speaker);
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    const y = (x: number, z: number) => this.world.groundAt(x, z);
    void y;
    this.spawn("commander", LOOKS.subay1919(0), L.barrack.x + 1.5, L.barrack.z + 5.2, 0.4, { type: "pose", anim: "idle" }, "Yüzbaşı Rıza Bey", "yuzbasi");
    this.spawn("janissary", { ...LOOKS.asker1919(1), hat: "kalpak", hatColor: "#3a3430" }, L.range.x + 2.5, L.range.z + 2.2, -Math.PI / 2, { type: "pose", anim: "point" }, "Çavuş Hasan", "cavus");
    this.tegmen = this.spawn("commander", LOOKS.subay1919(1), L.parade.x, L.parade.commanderZ, Math.PI, { type: "pose", anim: "idle" }, "Teğmen Kemal Efendi", "tegmen");
    // The rank on the parade ground (the player fills the gap in the middle).
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const n = this.spawn("janissary", { ...LOOKS.asker1919(i + 3), rightItem: "rifle" }, L.parade.x + i * 1.3, L.parade.line, 0, { type: "pose", anim: "guard" }, "Er");
      n.lookAtPlayer = false;
      this.rank.push(n);
    }
    // Lookout, sentries on the road, gunners, men by the tents.
    this.spawn("janissary", LOOKS.asker1919(2), L.lookout.x - 2, L.lookout.z + 0.4, 0, { type: "pose", anim: "guard" }, "Nöbetçi");
    for (const [x, z, h] of [
      [24, -26, 2.4],
      [30, -30, 2.4],
    ] as const)
      this.spawn("janissary", LOOKS.asker1919(Math.round(x)), x, z, h, { type: "pose", anim: "guard" }, "Nöbetçi");
    this.spawn("worker", LOOKS.asker1919(3), L.gun.x - 1.6, L.gun.z - 1.2, 0.4, { type: "pose", anim: "work" }, "Topçu");
    this.spawn("worker", LOOKS.asker1919(4), L.gun.x + 2.2, L.gun.z - 2.6, -0.5, { type: "pose", anim: "load" }, "Topçu");
    const extra = Math.max(3, Math.round(7 * density));
    for (let i = 0; i < extra; i++) {
      const x = L.tents.x0 + (i % 4) * 6 + 2.5;
      const z = L.tents.z0 + Math.floor(i / 4) * 7 + 3.4;
      this.spawn("janissary", LOOKS.asker1919(i + 5), x, z, i, i % 3 === 0 ? { type: "pose", anim: "sit" } : { type: "wander", cx: 18, cz: -14, radius: 9 }, "Er");
    }
    this.spawn("worker", { ...LOOKS.asker1919(6), apron: "#d8ccb0", rightItem: "none" }, L.barrack.x - 4, L.barrack.z + 4.6, 0.2, { type: "pose", anim: "stir" }, "Aşçı");
  }

  protected override onPlayingUpdate(dt: number): void {
    // The Bandırma steams in from the west and drops anchor off the pier.
    const w = this.world;
    const ship = w.ships.find((s) => s.id === "bandirma")!;
    if (this.bandirma.moving) {
      const to = LAYOUT.ships.bandirmaTo;
      const p = ship.node.position;
      const dx = to.x - p.x;
      const dz = to.z - p.z;
      const d = Math.hypot(dx, dz);
      const v = clamp(d * 0.12, 1.5, 10);
      if (d > 1) {
        p.x += (dx / d) * v * dt;
        p.z += (dz / d) * v * dt;
        ship.node.rotation.y = Math.atan2(dx, dz);
      } else this.bandirma.moving = false;
      const funnel = p.add(new Vector3(0, 9, 0));
      (w.bandirmaSmoke.emitter as Vector3).copyFrom(funnel);
    }
    // Mustafa Kemal Paşa walking up to the overlook; the salute point walks with him.
    if (this.mkWalking && this.mk) {
      const o = w.overlook;
      const p = this.mk.position;
      w.anchors.get("selam")?.set(p.x, p.y, p.z - 2.6);
      if ((!this.mk.isMoving && Math.hypot(p.x - o.x, p.z - o.z) < 2.5) || this.time - this.mkWalking > 30) this.placeMk();
    }
  }

  private revealBandirma(): void {
    const ship = this.world.ships.find((s) => s.id === "bandirma")!;
    if (ship.node.isEnabled()) return;
    ship.node.setEnabled(true);
    ship.node.position.set(-430, 0, 476);
    ship.node.rotation.y = Math.PI / 2;
    this.bandirma.moving = true;
  }

  private dockBandirma(): void {
    const ship = this.world.ships.find((s) => s.id === "bandirma")!;
    const to = LAYOUT.ships.bandirmaTo;
    ship.node.setEnabled(true);
    ship.node.position.set(to.x, 0, to.z);
    ship.node.rotation.y = 1.2;
    this.bandirma.moving = false;
    (this.world.bandirmaSmoke.emitter as Vector3).set(to.x, 9, to.z);
  }

  private placeMk(): void {
    const mk = this.mk!;
    const o = this.world.overlook;
    this.mkWalking = 0;
    this.world.anchors.get("selam")?.set(o.x, o.y, o.z - 2.6);
    mk.setBehavior({ type: "scripted" });
    mk.place(o.x, o.y, o.z, 0.55);
    mk.anim = "idle";
    mk.lookAtPlayer = false;
    mk.applyTransform();
    this.staff.forEach((s, i) => {
      this.npcs.relocate(s, o.x - 2.2 - i * 1.4, o.z - 2.4 - (i % 2) * 0.8, 0.3);
      s.setBehavior({ type: "pose", anim: "idle" });
    });
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    let game = this.games.get(kind);
    if (game) return game;
    const { ui, input, audio } = this.services;
    const common = { layer: ui.hud.minigameLayer, input, audio, hud: ui.hud, mobile: ui.mobile, player: this.player };
    const w = this.world;
    if (kind === "atis") {
      const g = new AtisMinigame({ ...common, fx: this.fx, camFx: this.camFx, stand: w.range.stand, facing: w.range.facing, targets: w.targets, rifle: this.rifleNode! });
      g.groundY = (x, z) => w.terrain.heightAt(x, z);
      game = g;
    } else if (kind === "durbun") {
      game = new DurbunMinigame({ ...common, stand: w.lookout.stand, facing: w.lookout.facing, ships: w.ships, revealBandirma: () => this.revealBandirma() });
    } else if (kind === "toren") {
      game = new TorenMinigame({ ...common, stand: w.parade.stand, facing: w.parade.facing, commander: this.tegmen!, rank: this.rank });
    } else {
      game = new DuelloMinigame({ ...common, bossName: "Çete reisi Yorgos" });
    }
    this.games.set(kind, game);
    return game;
  }

  // ================================================================== hooks
  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const instant = phase === "resume";
    const { audio, ui } = this.services;
    const L = LAYOUT;
    switch (id) {
      case "bandirma:spotted":
        if (instant) this.dockBandirma();
        else this.revealBandirma();
        this.atmosphere.transition(morning(this.shadows), instant ? 0 : 40);
        break;
      case "koy:alarm":
        if (!this.eleni) {
          const p = this.player.position;
          const ex = instant ? L.barrack.x + 4 : clamp(p.x - 3, -30, 30);
          const ez = instant ? L.barrack.z + 7 : clamp(p.z - 4, -30, 30);
          this.eleni = this.spawn("woman", { ...LOOKS.woman(1), hatColor: "#1e1c20", kaftan: "#3a2a3a", apron: "#d8ccb0" }, ex, ez, 0.6, { type: "pose", anim: "point" }, "Eleni Hanım", "eleni");
        }
        if (!this.cete) {
          this.cete = this.spawn("villager", LOOKS.ceteReisi(), L.koyYolu.x - 5, L.koyYolu.z - 8, 0.6, { type: "pose", anim: "guard" }, "Çete reisi Yorgos", "cete");
          this.cete.lookAtPlayer = true;
        }
        if (!instant) audio.play("distantShout", { volume: 0.7 });
        break;
      case "cete:captured":
        if (this.cete) this.cete.visible = false;
        if (!this.prisoner.length) {
          const bx = L.barrack.x + 6;
          const bz = L.barrack.z + 6.5;
          const p = this.spawn("villager", LOOKS.ceteReisi(), bx, bz, Math.PI * 0.8, { type: "pose", anim: "sit" }, "Tutuklu çete reisi");
          p.lookAtPlayer = false;
          this.prisoner.push(p);
          for (const dx of [-1.2, 1.2]) this.prisoner.push(this.spawn("janissary", LOOKS.asker1919(dx > 0 ? 2 : 3), bx + dx, bz - 0.8, Math.PI * 0.85, { type: "pose", anim: "guard" }, "Muhafız"));
        }
        if (this.eleni) {
          this.npcs.relocate(this.eleni, L.barrack.x + 3.6, L.barrack.z + 7.5, 0.2);
          this.eleni.setBehavior({ type: "pose", anim: "idle" });
        }
        break;
      case "pasa:arrive":
        this.dockBandirma();
        if (!this.mk) {
          // He comes up past the parade ground, along the line of saluting soldiers.
          const start = instant ? this.world.overlook : new Vector3(16, 0, 16);
          this.mk = this.spawn("commander", LOOKS.mustafaKemal1919(), start.x, start.z, -0.8, { type: "idle" }, "Mustafa Kemal Paşa", "mk");
          for (let i = 0; i < 3; i++) this.staff.push(this.spawn("commander", LOOKS.subay1919(i), start.x + 1.4 + i, start.z - 1.5 - i, -0.8, { type: "follow", target: () => this.mk?.position ?? null, distance: 2.2 + i * 1.1 }, "Karargâh subayı"));
          if (instant) this.placeMk();
          else {
            this.mk.moveTo(this.npcs.context, this.world.overlook.x, this.world.overlook.z - 1, false);
            this.mkWalking = this.time;
            audio.play("drum", { volume: 0.8 });
            ui.hud.toast("Mustafa Kemal Paşa ve karargâhı karakola çıkıyor!", "info", 4200);
          }
        }
        // The company lines up along the path to the overlook.
        this.rank.forEach((n, i) => {
          this.npcs.relocate(n, 6 + (i % 3) * 1.4, 18 + Math.floor(i / 3) * 5, -Math.PI / 2);
          n.setBehavior({ type: "pose", anim: "guard" });
        });
        break;
    }
  }

  override onTargetDone(targetId: string): void {
    if (targetId !== "selam" || !this.mk) return;
    // The Paşa turns round to the soldier saluting him.
    if (this.mkWalking) this.placeMk();
    const p = this.player.position;
    const m = this.mk.position;
    this.mk.heading = Math.atan2(p.x - m.x, p.z - m.z);
    this.mk.anim = "talk";
    this.mk.applyTransform();
    this.services.audio.play("land", { volume: 0.5, pitch: 1.4 });
  }

  protected carrySpec(): CarrySpec {
    return { parts: SP.heldRifle(), position: [0.14, -0.17, 0.32], rotation: [0, 0, 0] };
  }

  // ===================================================================== ending
  protected async showEnding(): Promise<void> {
    const { ui, audio, save, input, canvas } = this.services;
    save.completeScenario(SCENARIO_ID);
    this.playing = false;
    this.player.controlEnabled = false;
    input.exitPointerLock();
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    if (this.mk) this.placeMk();
    for (const s of this.staff) s.setBehavior({ type: "pose", anim: "idle" });
    // Slow move round to a three-quarter view of the Paşa on the hilltop, the sea behind him.
    const o = this.world.overlook;
    const cam = this.player.camera;
    const from = cam.position.clone();
    const lookFrom = from.add(this.player.forward().scale(6));
    // From just beyond the trench, low (looking up at him), his face toward the sea and us.
    const to = new Vector3(o.x + 1.7, o.y + 1.4, o.z + 2.3);
    const target = new Vector3(o.x - 0.2, o.y + 1.72, o.z);
    let t = 0;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      t += Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
      const k = easeInOutCubic(clamp(t / 8, 0, 1));
      cam.position.copyFrom(Vector3.Lerp(from, to, k));
      cam.setTarget(Vector3.Lerp(lookFrom, target, easeInOutCubic(clamp(t / 3, 0, 1))));
    });
    audio.play("fanfare", { volume: 0.6 });
    await wait(7500);
    // The scene slowly becomes an old photograph.
    ui.cinematic.showPhoto(canvas, "Mustafa Kemal Paşa · Samsun, Mayıs 1919", 6);
    await wait(9000);
    audio.stopMusic(6);
    await ui.cinematic.fade(1, 5, true);
    ui.cinematic.hidePhoto(canvas);
    ui.cinematic.showQuote("“1335 senesi Mayısının 19'uncu günü Samsun'a çıktım.”", "Mustafa Kemal Atatürk · Nutuk (1927)", {
      dark: true,
      actionsDelay: 6000,
      actions: this.endingButtons().map((b) => ({
        ...b,
        onClick: () => {
          void ui.cinematic.hideQuote(0.3);
          b.onClick();
        },
      })),
    });
  }

  override dispose(): void {
    this.games.clear();
    void this.services.ui.cinematic.hideQuote(0);
    this.services.ui.cinematic.hidePhoto(this.services.canvas);
    super.dispose();
  }
}
