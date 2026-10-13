import { PBRMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import * as K from "../../assets/PrefabsCanakkale";
import { GAME_CONFIG } from "../../config/gameConfig";
import type { GameServices } from "../../core/GameServices";
import { LOOKS } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { BataryaMinigame } from "../../minigames/BataryaMinigame";
import { NusretMinigame } from "../../minigames/NusretMinigame";
import { SeyitMinigame } from "../../minigames/SeyitMinigame";
import type { MinigameKind } from "../../missions/types";
import type { AtmospherePhase } from "../../rendering/Atmosphere";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { Water } from "../../rendering/Water";
import { wait } from "../../utils/async";
import { clamp, easeInOutCubic } from "../../utils/math";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { CanakkaleFleet } from "./CanakkaleFleet";
import { buildCanakkaleWorld, type CanakkaleWorld } from "./CanakkaleWorld";
import { bw, FACING, LAYOUT } from "./layout";

const SCENARIO_ID = "canakkale_1915";

/** 18 March 1915 was a clear, calm spring day; the sun high over the Asian shore. */
function clearNoon(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.istanbulMorning();
  sky.sunDirection = new Vector3(0.45, 0.72, -0.52).normalize();
  return { sky, sunIntensity: shadows ? 5.2 : 3.4, ambientIntensity: 1.05, environmentIntensity: 0.95, fogDensity: 0.00022 };
}

function afternoon(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.muglaAfternoon();
  sky.sunDirection = new Vector3(-0.35, 0.45, -0.82).normalize();
  return { sky, sunIntensity: shadows ? 4.6 : 3.0, ambientIntensity: 1.0, environmentIntensity: 0.9, fogDensity: 0.00026 };
}

function spawnL(u: number, v: number, yawLocal: number): { x: number; z: number; yaw: number } {
  const [x, z] = bw(u, v);
  return { x, z, yaw: FACING + yawLocal };
}

const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  canakkale_m01: spawnL(LAYOUT.spawn.u, LAYOUT.spawn.v, 0),
  canakkale_m02: spawnL(30, 4, 0),
  canakkale_m03: spawnL(-2, -8, Math.PI),
  canakkale_m04: spawnL(4, 2, 0),
  canakkale_m05: spawnL(-3, -8, Math.PI),
  canakkale_m06: spawnL(4, 3, 0),
};

const CHATTER = {
  janissary: [
    "Mermiler ağır ama yüreğimiz daha ağır, kardaş.",
    "Anam mektup yazmış: 'Oğul, Boğaz'ı düşmana bırakma' diyor.",
    "Kilitbahir'in topları da hazır; karşı yakada Çimenlik de bekliyor.",
    "Şu gemiler ne kadar büyük… Ama Boğaz dar, akıntı sert.",
    "Sabah ezanıyla kalktık, akşam ezanını Boğaz'ı tutarak okuyacağız.",
  ],
  worker: ["Barut sandıkları kuru, merak etme.", "Telgraf hattı karargâha bağlı; her isabet haber veriliyor."],
};

/**
 * Çanakkale · 18 Mart 1915 — the naval victory at the Narrows, played inside Rumeli Mecidiye
 * Tabyası. A young gunner sees the Allied fleet come in, relives Nusret's minelaying night
 * (2D), carries shells, lays the Krupp gun on the battleships, becomes Seyit Onbaşı for the
 * 276 kg shell, and holds on through the afternoon until Bouvet, Irresistible and Ocean strike
 * Nusret's mines and the fleet withdraws.
 */
export class CanakkaleScene extends FpsScenario<CanakkaleWorld> {
  private games = new Map<MinigameKind, BaseMinigame>();
  private fleet!: CanakkaleFleet;
  private crew: NPC[] = [];
  private seyitNpc: NPC | null = null;
  private heldShell: TransformNode | null = null;
  private shadows: boolean;

  private constructor(services: GameServices) {
    const shadows = services.save.settings.shadows && services.preset().shadows !== "off";
    super(services, {
      scenarioId: SCENARIO_ID,
      missionsPath: "data/scenarios/canakkale_1915.json",
      atmosphere: clearNoon(shadows),
      postFx: { exposure: 1.04, contrast: 1.12, vignette: 2.4, grain: 7 },
      bounds: LAYOUT.bounds,
      music: "canakkale",
      populateText: "Topçular mevzilerine geçiyor",
      chatter: CHATTER,
      nameplates: [
        { npc: "yuzbasi", name: "Yüzbaşı Hasan Bey", role: "Tabya komutanı" },
        { npc: "seyit", name: "Seyit Onbaşı", role: "Topçu" },
        { npc: "mulazim", name: "Mülazım Hakkı Efendi", role: "Telemetre subayı" },
      ],
    });
    this.shadows = shadows;
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<CanakkaleScene> {
    return FpsScenario.createInstance(new CanakkaleScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<CanakkaleWorld> {
    return buildCanakkaleWorld(ctx);
  }

  protected override afterWorld(): void {
    const preset = this.services.preset();
    const r = LAYOUT.terrainRect;
    const waterRect: [number, number, number, number] = [r.minX, r.minZ, r.sizeX, r.sizeZ];
    this.water = new Water(
      this.scene,
      {
        extent: preset.waterExtent,
        cells: preset.waterCells,
        level: LAYOUT.waterLevel,
        waveAmplitude: 0.35,
        waveFrequency: 0.5,
        deepColor: "#0f3a58",
        shallowColor: "#2e7a8a",
        foamColor: "#f4f1e8",
        foamAmount: 0.6,
        fogColor: this.scene.fogColor,
        fogDensity: GAME_CONFIG.world.fogDensity,
        depth: { data: this.world.terrain.depthMap(256, waterRect, 8, LAYOUT.waterLevel), width: 256, height: 256, rect: waterRect },
        animate: preset.waterCells > 80,
      },
      this.sky.params,
    );
    this.fleet = new CanakkaleFleet(this.scene, this.prefabs, this.fx, this.services.audio);
    this.fleet.onIncoming = (at, dist) => this.incoming(at, dist);
    // The 276 kg shell on Seyit Onbaşı's shoulder (first person).
    this.heldShell = new TransformNode("held-shell", this.scene);
    this.heldShell.parent = this.player.camera;
    this.heldShell.position.set(0.05, -0.12, 0.55);
    for (const m of this.prefabs.buildUnique("held-shell", K.heldShell(), this.heldShell, false)) m.renderingGroupId = 1;
    this.heldShell.setEnabled(false);
  }

  protected override afterPopulate(): void {
    for (const m of this.scene.materials) if (m instanceof PBRMaterial) m.maxSimultaneousLights = 6;
    this.services.audio.setAmbience({ wind: 0.22, sea: 0.14, camp: 0.08 });
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.canakkale_m01;
  }

  protected introPath(): IntroPath {
    // From over Erenköy Bay, up the strait past the fleet's waters to the battery on its hill.
    const y = this.world.plateauY;
    return this.introToPlayer(
      [new Vector3(700, 140, -900), new Vector3(420, 80, -420), new Vector3(140, y + 40, -120)],
      [new Vector3(400, 0, -500), new Vector3(60, y, 0), new Vector3(0, y + 3, 0)],
      12,
    );
  }

  protected override voicePitch(speaker: string): number {
    if (speaker.startsWith("Yüzbaşı")) return 0.8;
    if (speaker.startsWith("Seyit")) return 0.74;
    if (speaker.startsWith("Mülazım")) return 1.0;
    if (speaker === "Anlatıcı") return 0.9;
    return super.voicePitch(speaker);
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    const sp = (role: Parameters<FpsScenario<CanakkaleWorld>["spawn"]>[0], look: Parameters<FpsScenario<CanakkaleWorld>["spawn"]>[1], u: number, v: number, rot: number, anim: "idle" | "guard" | "load" | "point" | "work" | "sit" | "stir" | "talk", name: string, id?: string) => {
      const [x, z] = bw(u, v);
      return this.spawn(role, look, x, z, FACING + rot, { type: "pose", anim }, name, id);
    };
    sp("commander", LOOKS.subay1919(0), 3, -8, Math.PI, "idle", "Yüzbaşı Hasan Bey", "yuzbasi");
    sp("commander", LOOKS.subay1919(1), L.telemetre.u - 1.4, L.telemetre.v - 0.6, 0, "point", "Mülazım Hakkı Efendi", "mulazim");
    this.seyitNpc = sp("janissary", LOOKS.seyitOnbasi(), L.depot.u + 4.2, L.depot.v + 5.4, Math.PI * 0.85, "idle", "Seyit Onbaşı", "seyit");
    // Gun crews: two at each gun (the third gun's crew stands to its side).
    L.guns.forEach((u, i) => {
      for (const du of [-1.8, 1.8]) {
        if (i === L.mainGun && du < 0) continue;
        const n = sp("janissary", LOOKS.topcu1915(i * 2 + (du > 0 ? 1 : 0)), u + du, 8.4, 0, "guard", "Topçu");
        n.lookAtPlayer = i !== L.mainGun;
        if (i === L.mainGun) this.crew.push(n);
      }
    });
    // Riflemen behind the parapet's flanks, signalman, cook, men by the tents.
    for (const [u, v, r] of [
      [-36, 12, 0],
      [37, 12, 0],
      [-38, -20, -Math.PI / 2],
    ] as const)
      sp("janissary", { ...LOOKS.asker1919(Math.abs(Math.round(u))), rightItem: "rifle" }, u, v, r, "guard", "Nöbetçi");
    sp("worker", LOOKS.topcu1915(7), -14, -20, 0.4, "work", "Telgrafçı");
    sp("worker", { ...LOOKS.topcu1915(5), apron: "#d8ccb0" }, L.kitchen.u + 1.4, L.kitchen.v + 0.6, -0.6, "stir", "Aşçı");
    const extra = Math.max(2, Math.round(5 * density));
    for (let i = 0; i < extra; i++) {
      const u = -18 + i * 9;
      sp("janissary", LOOKS.topcu1915(i + 11), u, L.tents.v + 4, Math.PI + (i % 2) * 0.4, i % 2 ? "sit" : "talk", "Topçu");
    }
  }

  protected override onPlayingUpdate(dt: number): void {
    this.fleet.update(dt, this.batteryCenter());
  }

  private batteryCenter(): Vector3 {
    const [x, z] = bw(0, 4);
    return new Vector3(x, LAYOUT.plateauY, z);
  }

  /** Enemy shells landing around the battery outside the firing minigames. */
  private incoming(at: Vector3, dist: number): void {
    const p = this.player.position;
    const y = this.world.terrain.heightAt(at.x, at.z);
    const pt = new Vector3(at.x, Math.max(0.5, y), at.z);
    if (y < 0.5) this.fx.splash(pt);
    else if (Math.hypot(at.x - p.x, at.z - p.z) > 14) this.fx.impact(pt, dist < 40);
    this.services.audio.play("impactStone", { volume: clamp(1 - dist / 100, 0.15, 0.7), pitch: 0.6 });
    this.camFx.addTrauma(clamp(0.4 - dist / 150, 0.04, 0.3));
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    let game = this.games.get(kind);
    if (game) return game;
    const { ui, input, audio } = this.services;
    const common = { layer: ui.hud.minigameLayer, input, audio, hud: ui.hud, mobile: ui.mobile, player: this.player };
    const w = this.world;
    if (kind === "nusret") game = new NusretMinigame(common);
    else if (kind === "seyit")
      game = new SeyitMinigame({
        ...common,
        fx: this.fx,
        camFx: this.camFx,
        shell: w.seyit.shell,
        held: this.heldShell!,
        path: w.seyit.path,
        groundAt: (x, z) => w.groundAt(x, z),
      });
    else
      game = new BataryaMinigame({
        ...common,
        scene: this.scene,
        fx: this.fx,
        camFx: this.camFx,
        stand: w.gunStand,
        facing: w.gunFacing,
        gun: w.guns[LAYOUT.mainGun],
        fleet: this.fleet,
        crew: this.crew,
        mode: kind === "filo" ? "final" : "first",
      });
    this.games.set(kind, game);
    return game;
  }

  // ================================================================== hooks
  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const instant = phase === "resume";
    const w = this.world;
    switch (id) {
      case "filo:approach":
        this.fleet.prepare("approach");
        break;
      case "bogaz:look":
        if (!instant) {
          const p = this.player.position;
          this.player.yaw = Math.atan2(420 - p.x, -900 - p.z);
          this.player.pitch = 0.02;
        }
        break;
      case "filo:first":
        this.fleet.prepare("first");
        this.fleet.bombard = true;
        break;
      case "vinc:broken": {
        w.crane.intact.setEnabled(false);
        w.crane.broken.setEnabled(true);
        if (!instant) {
          const c = w.crane.broken.position;
          this.fx.impact(c.add(new Vector3(0.6, 0.3, 0.4)), true);
          this.services.audio.play("impactStone", { volume: 0.9, pitch: 0.5 });
          this.services.audio.play("metalClank", { volume: 0.7, pitch: 0.6 });
          this.camFx.addTrauma(0.7);
        }
        this.fx.smokeColumn(w.crane.broken.position.add(new Vector3(0, 0.5, 0)), 0.2);
        break;
      }
      case "filo:final":
        this.fleet.prepare("final");
        this.fleet.bombard = true;
        this.atmosphere.transition(afternoon(this.shadows), instant ? 0 : 40);
        break;
      case "seyit:play":
        if (this.seyitNpc) this.seyitNpc.visible = false;
        break;
      case "seyit:done":
        if (this.seyitNpc) {
          const [x, z] = bw(LAYOUT.guns[LAYOUT.mainGun] - 2.6, 7.4);
          this.seyitNpc.visible = true;
          this.npcs.relocate(this.seyitNpc, x, z, FACING);
          this.seyitNpc.setBehavior({ type: "pose", anim: "guard" });
        }
        w.seyit.shell.setEnabled(false);
        break;
    }
  }

  protected carrySpec(item: string): CarrySpec {
    void item;
    return { parts: K.heldShell(), position: [0.05, -0.5, 0.75], rotation: [0, 0, 0] };
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
    this.fleet.bombard = false;
    this.fleet.retreatAll();
    for (const n of this.npcs.npcs) if (n.role === "janissary" && n.visible) n.setBehavior({ type: "pose", anim: "cheer" });
    audio.playMusic("victory");
    // Up over the parapet: the strait, the smoke over Erenköy Bay, the fleet turning away.
    const cam = this.player.camera;
    const from = cam.position.clone();
    const lookFrom = from.add(this.player.forward().scale(6));
    const [fx, fz] = bw(LAYOUT.guns[LAYOUT.mainGun], 20);
    const to = new Vector3(fx, LAYOUT.plateauY + 9, fz);
    const target = new Vector3(LAYOUT.minefield.x, 6, LAYOUT.minefield.z);
    const flag = this.world.flagNode;
    let t = 0;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
      t += dt;
      this.fleet.update(dt, this.batteryCenter());
      const k = easeInOutCubic(clamp(t / 8, 0, 1));
      cam.position.copyFrom(Vector3.Lerp(from, to, k));
      cam.setTarget(Vector3.Lerp(lookFrom, target, easeInOutCubic(clamp(t / 5, 0, 1))));
      flag.rotation.z = Math.sin(t * 2.2) * 0.05;
    });
    audio.play("fanfare", { volume: 0.6 });
    window.setTimeout(() => audio.play("cheer", { volume: 0.7 }), 1400);
    ui.hud.toast("18 Mart 1915 — Bouvet, Irresistible ve Ocean battı; İtilaf donanması geri çekildi.", "success", 7000);
    await wait(10000);
    audio.stopMusic(6);
    await ui.cinematic.fade(1, 4, true);
    ui.cinematic.showQuote("“Ey şehid oğlu şehid, isteme benden makber, / Sana âgûşunu açmış duruyor Peygamber.”", "Mehmet Âkif Ersoy · Çanakkale Şehitlerine", {
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
    this.fleet?.dispose();
    void this.services.ui.cinematic.hideQuote(0);
    super.dispose();
  }
}
