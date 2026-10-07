import { Color3, Vector3, type AbstractMesh } from "@babylonjs/core";
import { flagHeld, heldCannonball } from "../../assets/Prefabs";
import { GAME_CONFIG } from "../../config/gameConfig";
import type { GameServices } from "../../core/GameServices";
import { LOOKS } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { CannonMinigame } from "../../minigames/CannonMinigame";
import { ShipTransportMinigame } from "../../minigames/ShipTransportMinigame";
import { SiegeMinigame, type SiegeZone } from "../../minigames/SiegeMinigame";
import type { MinigameKind } from "../../missions/types";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { Water } from "../../rendering/Water";
import { wait } from "../../utils/async";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { buildIstanbulWorld, type IstanbulWorld } from "./IstanbulWorld";
import { LAYOUT } from "./layout";

/** Where the player (re)spawns when a mission is resumed from the save. */
const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  mission_001: { x: LAYOUT.spawn.x, z: LAYOUT.spawn.z, yaw: LAYOUT.spawn.yaw },
  mission_002: { x: -224, z: -8, yaw: 0.6 },
  mission_003: { x: -148, z: 150, yaw: 0.2 },
  mission_004: { x: -140, z: 140, yaw: 0.5 },
  mission_005: { x: -168, z: 66, yaw: 2.6 },
  mission_006: { x: -116, z: -46, yaw: 1.4 },
  mission_007: { x: -112, z: -30, yaw: 1.57 },
  mission_008: { x: 29, z: -68, yaw: 0 },
};

const CHATTER = {
  janissary: [
    "Sultanımız için canımız feda!",
    "Surlar ne kadar yüksek olsa da bir gün yıkılacak.",
    "Mehterin sesini duydukça yorgunluğumu unutuyorum.",
    "Bu gece de nöbet bizde. Gözünü dört aç, yiğidim.",
  ],
  worker: ["Kütükleri bütün gece taşıdık, ellerim nasır tuttu.", "Don yağı az kalmasın, gemiler kaymazsa iş zor.", "Bu yolu kim düşündüyse dâhiymiş!"],
  gunner: ["Şahi'yi doldurmak saatler sürer ama vurduğunu yıkar.", "Barutu kuru tutun! Nem en büyük düşmanımız.", "Kulağın sağır olmasın diye ağzını aç, öyle ateşle!"],
  sailor: ["Denizde doğduk, şimdi karada kürek çekiyoruz!", "Zincir dediğin nedir ki? Biz de dağı aşarız."],
  commander: ["Saflarınızı sıkı tutun!", "Sultanın emri kesindir: şafakla hücum!"],
};

/**
 * The playable İstanbul 1453 scenario: Golden Horn world, Fatih and the army, the ship /
 * cannon / siege minigames and the banner finale on top of the shared FPS layer.
 */
export class IstanbulScene extends FpsScenario<IstanbulWorld> {
  private shipGame: ShipTransportMinigame | null = null;
  private cannonGame: CannonMinigame | null = null;
  private siegeGame: SiegeMinigame | null = null;
  private fatih!: NPC;
  private fatihGuards: NPC[] = [];
  private shipCrew: NPC[] = [];
  private drummer: NPC | null = null;
  private gunners: NPC[] = [];
  private defenders: NPC[] = [];
  private allies: NPC[] = [];

  private constructor(services: GameServices) {
    super(services, {
      scenarioId: "istanbul_1453",
      missionsPath: "data/scenarios/istanbul_1453.json",
      atmosphere: {
        sky: SKY_PRESETS.istanbulMorning(),
        sunIntensity: 3.4,
        ambientIntensity: 0.85,
        environmentIntensity: 0.75,
        fogDensity: GAME_CONFIG.world.fogDensity,
      },
      postFx: { exposure: 1.05, contrast: 1.16, vignette: 2.4, grain: 5 },
      bounds: LAYOUT.bounds,
      music: "istanbul",
      populateText: "Askerler toplanıyor",
      chatter: { ...CHATTER, sipahi: CHATTER.janissary, boatman: CHATTER.sailor },
      nameplates: [{ npc: "fatih", name: "Fatih Sultan Mehmet", role: "Osmanlı Padişahı" }],
    });
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<IstanbulScene> {
    return FpsScenario.createInstance(new IstanbulScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<IstanbulWorld> {
    return buildIstanbulWorld(ctx);
  }

  protected override afterWorld(): void {
    const preset = this.services.preset();
    const waterRect: [number, number, number, number] = [-700, -700, 1400, 1400];
    this.water = new Water(
      this.scene,
      {
        extent: preset.waterExtent,
        cells: preset.waterCells,
        level: LAYOUT.waterLevel,
        waveAmplitude: 0.42,
        waveFrequency: 0.7,
        deepColor: "#0f3d52",
        shallowColor: "#3f8f8c",
        foamColor: "#f4f1e8",
        foamAmount: 0.85,
        fogColor: this.scene.fogColor,
        fogDensity: GAME_CONFIG.world.fogDensity,
        depth: { data: this.world.terrain.depthMap(256, waterRect, 6, LAYOUT.waterLevel), width: 256, height: 256, rect: waterRect },
        animate: preset.waterCells > 80,
      },
      this.sky.params,
    );
  }

  protected override afterPopulate(): void {
    this.setupFerry();
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.mission_001;
  }

  protected introPath(): IntroPath {
    // High above the Golden Horn, over the walls and the camp, down to eye level.
    const L = LAYOUT;
    return this.introToPlayer(
      [new Vector3(120, 260, 150), new Vector3(-20, 140, 70), new Vector3(-140, 60, -10)],
      [new Vector3(L.hagiaSophia.x, 20, L.hagiaSophia.z), new Vector3(30, 10, -30), new Vector3(L.otag.x, 4, L.otag.z)],
      7.5,
    );
  }

  protected override voicePitch(speaker: string): number {
    return speaker.startsWith("Fatih") ? 0.85 : super.voicePitch(speaker);
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    const r = this.rnd;
    // Fatih Sultan Mehmet + guards.
    this.fatih = this.spawn("fatih", LOOKS.fatih(), L.fatihCamp.x, L.fatihCamp.z, Math.PI / 2, { type: "pose", anim: "idle" }, "Fatih Sultan Mehmet", "fatih");
    this.fatih.lookAtPlayer = true;
    for (let i = 0; i < 2; i++) {
      const g = this.spawn("janissary", { ...LOOKS.janissary(1), rightItem: "spear" }, L.fatihCamp.x - 2, L.fatihCamp.z + (i ? 2.4 : -2.4), Math.PI / 2, { type: "pose", anim: "guard" });
      g.lookAtPlayer = false;
      this.fatihGuards.push(g);
    }
    // Otağ guards.
    for (const [dx, dz] of [
      [10, -3],
      [10, 3],
      [16, -10],
      [16, 10],
    ]) {
      const g = this.spawn("janissary", { ...LOOKS.janissary(0), rightItem: "spear" }, L.otag.x + dx, L.otag.z + dz, Math.PI / 2, { type: "pose", anim: "guard" }, "Yeniçeri");
      g.lookAtPlayer = true;
    }
    // Campfire circles (matches IstanbulWorld campfires).
    const fires: [number, number][] = [
      [-205, -45],
      [-262, -66],
      [-215, 22],
      [-280, -15],
      [-245, -98],
      [-180, -10],
    ];
    for (const [fx, fz] of fires) {
      const n = Math.max(2, Math.round(4 * density));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
        const x = fx + Math.cos(a) * 2.2;
        const z = fz + Math.sin(a) * 2.2;
        const heading = Math.atan2(fx - x, fz - z);
        this.spawn("janissary", LOOKS.janissary(r.int(0, 5)), x, z, heading, { type: "pose", anim: "sit" }, "Yeniçeri");
      }
    }
    // Wandering soldiers & workers in the camp.
    for (let i = 0; i < Math.round(16 * density); i++) {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(10, 75);
      const x = L.camp.x + Math.cos(a) * d;
      const z = L.camp.z + Math.sin(a) * d;
      const isWorker = i % 3 === 0;
      this.spawn(isWorker ? "worker" : "janissary", isWorker ? LOOKS.worker(i) : LOOKS.janissary(i), x, z, r.range(0, 6), { type: "wander", cx: L.camp.x, cz: L.camp.z, radius: 70 }, isWorker ? "İşçi" : "Yeniçeri");
    }
    // Patrol along the camp road.
    this.spawn("sipahi", LOOKS.sipahi(0), -230, -40, 0, {
      type: "patrol",
      points: [
        [-290, -40],
        [-180, -40],
        [-200, 20],
        [-260, 10],
      ],
    }, "Sipahi");
    // Workers at the supply depot and cooks.
    for (let i = 0; i < Math.round(4 * density) + 1; i++) this.spawn("worker", LOOKS.worker(i + 1), -200 + r.range(-6, 6), -90 + r.range(-4, 4), r.range(0, 6), { type: "pose", anim: "work" }, "İşçi");
    this.spawn("worker", LOOKS.worker(2), -201, -41, -1.2, { type: "pose", anim: "work" }, "Aşçı");
    this.spawn("worker", LOOKS.worker(4), -211, 25, 1.4, { type: "pose", anim: "work" }, "Aşçı");

    // Battery crews + gunner chief.
    for (const [x, z] of [
      [-104, -42],
      [-106, -35],
      [-110, -40],
    ]) {
      const g = this.spawn("gunner", LOOKS.gunner(this.gunners.length), x, z, Math.PI / 2, { type: "pose", anim: "guard" }, "Topçu");
      this.gunners.push(g);
    }
    this.spawn("commander", { ...LOOKS.commander(), kaftan: "#5a1f16" }, -112, -46, 1.2, { type: "pose", anim: "talk" }, "Topçubaşı", "topcubasi");
    for (const z of [-84, -64, -16, 4]) {
      this.spawn("gunner", LOOKS.gunner(1), -100, z + 1.6, Math.PI / 2, { type: "pose", anim: r.chance(0.5) ? "load" : "guard" }, "Topçu");
    }
    for (let i = 0; i < Math.round(5 * density); i++) {
      this.spawn("janissary", LOOKS.janissary(i + 2), -130 + r.range(-10, 10), -40 + r.range(-40, 40), r.range(0, 6), { type: "wander", cx: -120, cz: -40, radius: 35 }, "Yeniçeri");
    }

    // Slipway: foreman, crew, drummer, captain, sailors on the Bosphorus shore.
    this.spawn("worker", { ...LOOKS.worker(3), hat: "turban", hatColor: "#d8c070" }, -138, 168, -1.5, { type: "pose", anim: "talk" }, "Kızak Ustası", "usta");
    const ss = LAYOUT.shipStart;
    for (let i = 0; i < 8; i++) {
      const isSailor = i % 2 === 1;
      const n = this.spawn(isSailor ? "sailor" : "worker", isSailor ? LOOKS.sailor(i) : LOOKS.worker(i), ss.x + r.range(-6, 6), ss.z - 12 - i * 1.5, Math.PI, { type: "pose", anim: "idle" }, isSailor ? "Levent" : "İşçi");
      this.shipCrew.push(n);
    }
    this.drummer = this.spawn("janissary", { ...LOOKS.janissary(1), rightItem: "hammer" }, ss.x, ss.z - 4, Math.PI, { type: "pose", anim: "idle" }, "Davulcu");
    this.spawn("sailor", { ...LOOKS.sailor(0), hat: "turban", hatColor: "#f0ead8", kaftan: "#7d1418" }, -142, 132, 2.6, { type: "pose", anim: "talk" }, "Kadırga Reisi", "reis");
    for (let i = 0; i < Math.round(5 * density); i++) {
      this.spawn("sailor", LOOKS.sailor(i), -100 + r.range(-25, 25), 322 + r.range(-6, 4), r.range(0, 6), { type: "wander", cx: -95, cz: 315, radius: 22 }, "Levent");
    }

    // Boatmen.
    this.spawn("boatman", LOOKS.sailor(1), L.boatmanSouth.x, L.boatmanSouth.z, 0, { type: "pose", anim: "idle" }, "Kayıkçı", "boatman_s");
    this.spawn("boatman", LOOKS.sailor(1), L.boatmanNorth.x, L.boatmanNorth.z, Math.PI, { type: "pose", anim: "idle" }, "Kayıkçı", "boatman_n");

    // Byzantine defenders on the walls.
    const spots = this.world.defenderSpots;
    const count = Math.min(spots.length, Math.round(10 * Math.max(0.6, density)));
    for (let i = 0; i < count; i++) {
      const s = spots[Math.floor((i / count) * spots.length)];
      const d = this.npcs.spawn({ role: "byzantine", name: "Bizans Askeri", look: LOOKS.byzantine(i), x: s.x, z: s.z, heading: -Math.PI / 2, behavior: { type: "scripted" } });
      d.place(s.x, s.y, s.z, -Math.PI / 2);
      d.anim = "guard";
      d.lookAtPlayer = false;
      this.defenders.push(d);
    }
  }

  // ================================================================== ferry
  private setupFerry(): void {
    const L = LAYOUT;
    const cross = async (toNorth: boolean) => {
      if (this.inDialogue || this.minigame) return;
      const ui = this.services.ui;
      this.player.controlEnabled = false;
      this.inDialogue = true;
      this.services.audio.play("boatOars", { volume: 0.8 });
      await ui.cinematic.fade(1, 0.5, true);
      const dest = toNorth ? { x: L.northPier.x + 0.5, z: L.northPier.z + 2, yaw: 0.15 } : { x: L.southPier.x + 0.5, z: L.southPier.z - 4, yaw: Math.PI - 0.3 };
      this.player.teleport(dest.x, dest.z, dest.yaw);
      ui.hud.toast(toNorth ? "Haliç'in kuzey kıyısına (Galata) geçtin." : "Haliç'in güney kıyısına (ordugâh) geçtin.");
      await wait(400);
      await ui.cinematic.fade(0, 0.6, true);
      this.inDialogue = false;
      this.player.controlEnabled = true;
    };
    this.interactions.add({
      id: "ferry_south",
      position: new Vector3(L.boatmanSouth.x, 0, L.boatmanSouth.z),
      key: "E",
      prompt: "Karşıya geç — Kayıkçı",
      enabled: () => !this.minigame,
      onInteract: () => void cross(true),
    });
    this.interactions.add({
      id: "ferry_north",
      position: new Vector3(L.boatmanNorth.x, 0, L.boatmanNorth.z),
      key: "E",
      prompt: "Karşıya geç — Kayıkçı",
      enabled: () => !this.minigame,
      onInteract: () => void cross(false),
    });
    this.dynamicInteractables.set("ferry_south", () => this.npcs.get("boatman_s")!.position.add(new Vector3(0, 1.5, 0)));
    this.dynamicInteractables.set("ferry_north", () => this.npcs.get("boatman_n")!.position.add(new Vector3(0, 1.5, 0)));
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    if (kind === "ship") return (this.shipGame ??= this.createShipGame());
    if (kind === "cannon") return (this.cannonGame ??= this.createCannonGame());
    return (this.siegeGame ??= this.createSiegeGame());
  }

  protected override afterMinigame(kind: MinigameKind, ok: boolean): void {
    // The siege keeps its battle music running into the banner finale.
    if (kind !== "siege") super.afterMinigame(kind, ok);
  }

  private createShipGame(): ShipTransportMinigame {
    const sw = LAYOUT.slipway;
    const path: [number, number][] = [...sw].reverse();
    let goal = 0;
    for (let i = 1; i < path.length; i++) goal += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    path.push([sw[0][0] - 2, sw[0][1] - 24]);
    const ui = this.services.ui;
    return new ShipTransportMinigame({
      layer: ui.hud.minigameLayer,
      input: this.services.input,
      audio: this.services.audio,
      hud: ui.hud,
      modal: ui.modal,
      mobile: ui.mobile,
      player: this.player,
      fx: this.fx,
      ship: this.world.ship,
      rope: this.world.rope,
      path,
      goalDistance: goal,
      startDistance: 10,
      groundAt: (x, z) => this.world.terrain.heightAt(x, z),
      crew: this.shipCrew,
      drummer: this.drummer,
    });
  }

  private createCannonGame(): CannonMinigame {
    const ui = this.services.ui;
    const w = this.world;
    return new CannonMinigame({
      layer: ui.hud.minigameLayer,
      scene: this.scene,
      input: this.services.input,
      audio: this.services.audio,
      hud: ui.hud,
      mobile: ui.mobile,
      player: this.player,
      fx: this.fx,
      camFx: this.camFx,
      materials: this.materials,
      base: w.sahi.base,
      yaw: w.sahi.yaw,
      pitch: w.sahi.pitch,
      recoil: w.sahi.recoil,
      muzzle: w.sahi.muzzle,
      targets: w.targets,
      solids: w.wallSolids,
      groundAt: (x, z) => w.terrain.heightAt(x, z),
      crew: this.gunners,
      onTargetDestroyed: (id) => {
        if (id === "wallSection") this.applyBreach(false);
      },
    });
  }

  private createSiegeGame(): SiegeMinigame {
    const ui = this.services.ui;
    const w = this.world;
    const zones: SiegeZone[] = LAYOUT.captureZones.map((z, i) => ({
      id: z.id,
      name: z.name,
      position: w.anchors.get(`zone_${z.id}`)!,
      ring: w.zoneRings[i],
      byzFlag: w.captureFlags[i].byz,
      ottFlag: w.captureFlags[i].ott,
    }));
    return new SiegeMinigame({
      layer: ui.hud.minigameLayer,
      scene: this.scene,
      audio: this.services.audio,
      hud: ui.hud,
      player: this.player,
      fx: this.fx,
      camFx: this.camFx,
      materials: this.materials,
      zones,
      allies: this.allies,
      defenders: this.defenders,
      groundAt: (x, z) => w.terrain.heightAt(x, z),
      moveNpc: (npc, x, z, run) => npc.moveTo(this.npcs.context, x, z, run),
    });
  }

  /** Fatih's next position; applied only when the player can't see the "teleport". */
  private pendingFatih: { x: number; z: number; heading: number } | null = null;

  private moveFatihNow(x: number, z: number, heading: number): void {
    this.npcs.relocate(this.fatih, x, z, heading);
    this.fatihGuards.forEach((g, i) => this.npcs.relocate(g, x - Math.sin(heading) * 2 + (i ? 1.6 : -1.6) * Math.cos(heading), z - Math.cos(heading) * 2 - (i ? 1.6 : -1.6) * Math.sin(heading), heading));
    this.pendingFatih = null;
  }

  protected override onPlayingUpdate(): void {
    const t = this.pendingFatih;
    if (!t) return;
    const p = this.player.position;
    const dNow = Math.hypot(this.fatih.position.x - p.x, this.fatih.position.z - p.z);
    const dTarget = Math.hypot(t.x - p.x, t.z - p.z);
    if (dNow > 45 && dTarget > 30) this.moveFatihNow(t.x, t.z, t.heading);
  }

  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const L = LAYOUT;
    const placeFatih = (x: number, z: number, heading: number) => {
      if (phase === "resume") this.moveFatihNow(x, z, heading);
      else this.pendingFatih = { x, z, heading };
    };
    switch (id) {
      case "fatih:camp":
        this.moveFatihNow(L.fatihCamp.x, L.fatihCamp.z, Math.PI / 2);
        break;
      case "fatih:slipway":
        placeFatih(L.fatihSlipway.x, L.fatihSlipway.z, -0.4);
        break;
      case "fatih:battery":
        placeFatih(L.fatihBattery.x, L.fatihBattery.z, 1.5);
        break;
      case "ships:launched": {
        for (const s of this.world.launchedShips) s.setEnabled(true);
        if (phase === "resume") {
          const ship = this.world.ship;
          ship.position.set(L.slipway[0][0] - 1, 0.15, L.slipway[0][1] - 18);
          ship.rotation.set(0, Math.PI + 0.1, 0);
          for (const npc of this.shipCrew) npc.visible = false;
          if (this.drummer) this.drummer.visible = false;
        }
        break;
      }
      case "walls:breached":
        this.applyBreach(phase === "resume");
        break;
      case "siege:begin":
        placeFatih(-82, -12, 1.5);
        this.setDawn();
        this.spawnAllies();
        break;
      case "flag:carry":
        // The defenders have left the walls by now.
        for (const d of this.defenders) d.visible = false;
        if (phase !== "resume") this.setCarry("flag");
        break;
      case "flag:planted":
        this.world.finalFlag.setEnabled(true);
        this.services.audio.play("cheer", { volume: 1 });
        this.services.audio.play("fanfare", { volume: 1 });
        this.services.audio.playMusic("victory");
        for (const a of this.allies) a.setBehavior({ type: "pose", anim: "cheer" });
        for (const d of this.defenders) d.visible = false;
        this.setCarry(null);
        break;
    }
  }

  private applyBreach(instant: boolean): void {
    const b = this.world.breach;
    if (instant) for (const m of b.intact) m.setEnabled(false);
    else window.setTimeout(() => b.intact.forEach((m) => m.setEnabled(false)), 1700);
    b.wallCollider.enabled = false;
    for (const m of b.rubble) m.setEnabled(true);
    for (const c of b.rubbleColliders) c.enabled = true;
    for (const m of b.scaffold) m.setEnabled(true);
    for (const c of b.scaffoldColliders) c.enabled = true;
    if (instant) {
      for (const t of this.world.targets) {
        t.hp = 0;
        for (const m of t.breakable) m.setEnabled(false);
      }
    }
  }

  private spawnAllies(): void {
    if (this.allies.length) return;
    const n = Math.max(8, Math.round(14 * this.services.preset().npcDensity));
    for (let i = 0; i < n; i++) {
      const x = -72 + this.rnd.range(-6, 6);
      const z = -30 + (i - n / 2) * 2.2;
      this.allies.push(this.spawn("janissary", { ...LOOKS.janissary(i), rightItem: "spear", leftItem: i % 3 === 0 ? "shield" : undefined }, x, z, Math.PI / 2, { type: "pose", anim: "guard" }, "Yeniçeri"));
    }
    this.spawn("commander", LOOKS.commander(), -64, -26, Math.PI / 2, { type: "pose", anim: "point" }, "Bölük Ağası", "aga");
    for (const d of this.defenders) d.anim = "thrust";
  }

  /** Final assault happens at dawn: warmer, lower sun and denser haze. */
  private setDawn(): void {
    const base = this.cfg.atmosphere;
    this.atmosphere.transition(
      {
        ...base,
        sky: { ...base.sky, horizon: new Color3(0.95, 0.62, 0.42), sunColor: new Color3(1, 0.62, 0.38) },
        sunIntensity: 2.6,
        fogColor: new Color3(0.86, 0.66, 0.5),
        fogDensity: GAME_CONFIG.world.fogDensity * 1.5,
      },
      4,
    );
  }

  protected carrySpec(item: string): CarrySpec {
    // The banner pole is held low and to the side so it frames the view instead of blocking it.
    if (item === "cannonball") return { parts: heldCannonball(), position: [0, 0, 0], rotation: [0, 0, 0] };
    return { parts: flagHeld(), position: [0.1, -1.15, 0.1], rotation: [0.12, 0, -0.18] };
  }

  override onTargetDone(targetId: string): void {
    const marks = this.world.greaseMarks.get(targetId);
    if (marks) {
      for (const m of marks) m.setEnabled(true);
      this.services.audio.play("woodKnock", { volume: 0.6 });
      this.fx.dustPuff(m0(marks).position, 6);
      return;
    }
    if (targetId.startsWith("sahi_drop:")) {
      const n = Number(targetId.split(":")[1]);
      const ball = this.world.sahi.deliveredBalls[n - 1];
      ball?.setEnabled(true);
      this.services.audio.play("drop", { volume: 0.8 });
    }
  }

  // ===================================================================== ending
  protected async showEnding(): Promise<void> {
    // Slow orbit around the tower with the planted sancak.
    this.beginEndingOrbit(this.world.finalFlag.getAbsolutePosition().clone(), 38, 10, -2.4);
    await wait(3500);
    this.services.ui.modal.show(
      "",
      `<div class="ending"><div class="e-date">29 MAYIS 1453</div><h1>İSTANBUL FETHEDİLDİ</h1>
       <div class="ornament-line"></div>
       <p>Gemileri karadan yürüttün, Şahi topuyla surlarda gedik açtın ve hücumda sancağı burca diktin.
       Fatih Sultan Mehmet'in emriyle şehir halkı emana alındı; İstanbul yeni bir çağa uyandı.</p>
       <p style="font-size:12px">Bu oturumda oynama süresi: ~${this.playMinutes()} dk · 8/8 görev tamamlandı</p>
       <p style="font-size:12px;color:var(--gold)">Haritada yeni bir yolculuk seni bekliyor: Muğla · Keşkeğin Keşfi</p></div>`,
      this.endingButtons(),
    );
  }
}

function m0(arr: AbstractMesh[]): AbstractMesh {
  return arr[0];
}
