import { Color3, Color4, Scene, TransformNode, Vector3, type AbstractMesh, type Observer } from "@babylonjs/core";
import { AssetLoader } from "../../assets/AssetLoader";
import { PrefabLibrary } from "../../assets/PrefabLibrary";
import { flagHeld, heldCannonball } from "../../assets/Prefabs";
import { GAME_CONFIG } from "../../config/gameConfig";
import type { GameServices } from "../../core/GameServices";
import type { Settings } from "../../core/SaveManager";
import { HumanoidFactory, LOOKS, type HumanoidLook } from "../../entities/HumanoidFactory";
import type { NPC, NpcRole } from "../../entities/NPC";
import { NPCManager } from "../../entities/NPCManager";
import { Player } from "../../entities/Player";
import { CannonMinigame } from "../../minigames/CannonMinigame";
import { ShipTransportMinigame } from "../../minigames/ShipTransportMinigame";
import { SiegeMinigame, type SiegeZone } from "../../minigames/SiegeMinigame";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { MissionManager } from "../../missions/MissionManager";
import type { MinigameKind, MissionHost, ScenarioMissionFile } from "../../missions/types";
import { MaterialLibrary } from "../../rendering/MaterialLibrary";
import { RenderPipeline } from "../../rendering/RenderPipeline";
import { createSkyEnvironment, type SkyEnvironment } from "../../rendering/SkyEnvironment";
import { fogColorFromSky, SKY_PRESETS } from "../../rendering/SkyModel";
import { Water } from "../../rendering/Water";
import { CameraFX } from "../../systems/CameraFX";
import { InteractionSystem } from "../../systems/InteractionSystem";
import { ParticleFX } from "../../systems/ParticleFX";
import { projectWaypoint } from "../../systems/Waypoint";
import type { DialogueLine } from "../../ui/DialogueUI";
import { fetchJson, nextFrame, wait } from "../../utils/async";
import { clamp, easeInOutCubic, lerp } from "../../utils/math";
import { Random } from "../../utils/random";
import type { ScenarioCreateOptions, ScenarioInstance } from "../types";
import { buildIstanbulWorld, type IstanbulWorld } from "./IstanbulWorld";
import { LAYOUT } from "./layout";
import { CollisionWorld } from "../../world/CollisionWorld";

const SCENARIO_ID = "istanbul_1453";

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

const CHATTER: Record<string, string[]> = {
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
 * The playable İstanbul 1453 scenario. Wires the world, player, NPCs, missions, minigames,
 * audio and HUD together, and implements MissionHost for the data-driven mission system.
 */
export class IstanbulScene implements ScenarioInstance, MissionHost {
  readonly scene: Scene;
  onExitToMap: (() => void) | null = null;
  onRequestPause: (() => void) | null = null;
  private materials!: MaterialLibrary;
  private pipeline!: RenderPipeline;
  private sky!: SkyEnvironment;
  private water!: Water;
  private fx!: ParticleFX;
  private prefabs!: PrefabLibrary;
  private world!: IstanbulWorld;
  private humanoids!: HumanoidFactory;
  private npcs!: NPCManager;
  private player!: Player;
  private interactions = new InteractionSystem();
  private dynamicInteractables = new Map<string, () => Vector3>();
  private missions!: MissionManager;
  private camFx = new CameraFX();
  private minigame: BaseMinigame | null = null;
  private shipGame: ShipTransportMinigame | null = null;
  private cannonGame: CannonMinigame | null = null;
  private siegeGame: SiegeMinigame | null = null;
  private paused = false;
  private playing = false;
  private inDialogue = false;
  private carryNode: TransformNode | null = null;
  private carryMeshes: AbstractMesh[] = [];
  private missionData!: ScenarioMissionFile;
  private fatih!: NPC;
  private fatihGuards: NPC[] = [];
  private shipCrew: NPC[] = [];
  private drummer: NPC | null = null;
  private gunners: NPC[] = [];
  private defenders: NPC[] = [];
  private allies: NPC[] = [];
  private lockHintShown = false;
  private disposers: (() => void)[] = [];
  private rnd = new Random(7);
  private lastHudMission = "";
  private time = 0;
  private atmosphere = { t: 1, from: 0, to: 0 };
  private renderObserver: Observer<Scene> | null = null;
  private startedAt = performance.now();

  private constructor(private readonly services: GameServices) {
    this.scene = new Scene(services.engine);
    this.scene.clearColor = new Color4(0.8, 0.78, 0.72, 1);
    this.scene.skipPointerMovePicking = true;
    this.scene.ambientColor = new Color3(0.2, 0.2, 0.2);
  }

  static async create(services: GameServices, opts: ScenarioCreateOptions): Promise<IstanbulScene> {
    const s = new IstanbulScene(services);
    try {
      await s.build(opts);
    } catch (err) {
      // Never leak a half-built scene (GPU resources) when loading fails.
      s.scene.dispose();
      throw err;
    }
    return s;
  }

  // =====================================================================  BUILD
  private async build(opts: ScenarioCreateOptions): Promise<void> {
    const { services } = this;
    const preset = services.preset();
    const scene = this.scene;
    const progress = opts.onProgress;
    progress(0.02, "Görevler yükleniyor");
    this.missionData = await fetchJson<ScenarioMissionFile>("data/scenarios/istanbul_1453.json");

    this.materials = new MaterialLibrary(scene, preset.textureSize);
    progress(0.05, "Dokular üretiliyor");
    for (const k of ["terrain", "stone", "wood", "props", "roof", "plaster", "cloth"] as const) {
      this.materials.get(k);
      await nextFrame();
    }

    const skyParams = SKY_PRESETS.istanbulMorning();
    const fog = fogColorFromSky(skyParams);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = fog;
    scene.fogDensity = GAME_CONFIG.world.fogDensity;
    const maxZ = Math.min(GAME_CONFIG.camera.farPlane, preset.drawDistance + 400);
    this.sky = await createSkyEnvironment(scene, skyParams, {
      // The dome must sit inside the camera's far plane.
      domeRadius: maxZ * 0.88,
      reflections: preset.environmentReflections,
      envSize: 64,
      sunIntensity: 3.4,
      ambientIntensity: 0.85,
      environmentIntensity: 0.75,
    });

    // The real collision world is bound once the level is built (see bindWorld below).
    const placeholder = new CollisionWorld(() => 0, -100, LAYOUT.bounds);
    this.materials.adaptToEnvironment(!!scene.environmentTexture);
    this.player = new Player(scene, placeholder, services.input, services.audio, services.save.settings, () => "dirt");
    scene.activeCamera = this.player.camera;
    this.player.camera.maxZ = maxZ;
    this.pipeline = new RenderPipeline(scene, this.player.camera, this.sky.sun, { exposure: 1.05, contrast: 1.16, vignette: 2.4, grain: 5 }, true);
    this.pipeline.apply(preset, services.save.settings);
    this.fx = new ParticleFX(scene, this.materials, preset.particles);
    this.prefabs = new PrefabLibrary(scene, this.materials, this.pipeline, preset.propCullDistance / 260);

    // Optional authored GLB models (none by default → procedural fallbacks).
    const loader = new AssetLoader(scene);
    const report = await loader.loadAll((f, k) => progress(0.08 + f * 0.02, `Model: ${k}`));
    for (const key of report.loaded) {
      const c = await loader.load(key);
      if (c) this.prefabs.overrideWithContainer(key, c);
    }

    this.world = await buildIstanbulWorld({
      scene,
      prefabs: this.prefabs,
      materials: this.materials,
      pipeline: this.pipeline,
      fx: this.fx,
      preset,
      progress: (f, s) => progress(0.1 + f * 0.7, s),
      yieldFrame: nextFrame,
    });
    const world = this.world;
    this.player.bindWorld(world.collision, world.surfaceAt);

    const waterRect: [number, number, number, number] = [-700, -700, 1400, 1400];
    this.water = new Water(
      scene,
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
        fogColor: fog,
        fogDensity: GAME_CONFIG.world.fogDensity,
        depth: { data: world.terrain.depthMap(256, waterRect, 6, LAYOUT.waterLevel), width: 256, height: 256, rect: waterRect },
        animate: preset.waterCells > 80,
      },
      this.sky.params,
    );

    progress(0.82, "Askerler toplanıyor");
    await nextFrame();
    this.humanoids = new HumanoidFactory(scene, this.materials, this.pipeline);
    this.npcs = new NPCManager(this.humanoids, world.collision, world.nav, (x, z, y) => world.groundAt(x, z, y + 0.5), this.player.position);
    this.populate(preset.npcDensity);

    progress(0.88, "Görev sistemi hazırlanıyor");
    this.missions = new MissionManager(this.missionData, this, services.save);
    this.missions.onScenarioComplete = () => void this.showEnding();
    this.setupFerry();
    this.setupChatter();
    this.carryNode = new TransformNode("carry", scene);
    this.carryNode.parent = this.player.hand;

    // Start/resume point.
    const resume = opts.resumeMissionId && this.missions.missionIds.includes(opts.resumeMissionId) ? opts.resumeMissionId : this.missionData.firstMission;
    this.resumeMissionId = resume;
    this.missions.fastForwardTo(resume);
    const spawn = RESUME_SPAWNS[resume] ?? RESUME_SPAWNS.mission_001;
    this.player.teleport(spawn.x, spawn.z, spawn.yaw);

    this.fx.environmentDust(this.player.camera.position);
    this.setupInputHooks();

    progress(0.94, "Shader'lar derleniyor");
    await scene.whenReadyAsync();
    progress(1, "Hazır");
  }

  private resumeMissionId = "mission_001";

  // ================================================================== NPCs
  private spawn(role: NpcRole, look: HumanoidLook, x: number, z: number, heading: number, behavior?: Parameters<NPCManager["spawn"]>[0]["behavior"], name = "", id?: string): NPC {
    return this.npcs.spawn({ id, role, name, look, x, z, heading, behavior });
  }

  private populate(density: number): void {
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

  // ================================================================ ferry & chatter
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

  private setupChatter(): void {
    for (const npc of this.npcs.npcs) {
      const lines = CHATTER[npc.role === "sipahi" ? "janissary" : npc.role === "boatman" ? "sailor" : npc.role];
      if (!lines || !npc.displayName || npc.id === "fatih" || npc.behavior.type === "scripted") continue;
      if (npc.behavior.type === "pose" && npc.behavior.anim === "sit" && this.rnd.chance(0.5)) continue;
      const id = `chat:${npc.id}`;
      this.interactions.add({
        id,
        position: npc.position.clone(),
        key: "E",
        prompt: `Konuş — ${npc.displayName}`,
        enabled: () => !this.minigame && !this.inDialogue && !this.isMissionTalkTarget(npc.id),
        onInteract: () => {
          const line = lines[Math.floor(Math.random() * lines.length)];
          void this.playLines([{ speaker: npc.displayName, text: line }], npc);
        },
      });
      this.dynamicInteractables.set(id, () => npc.position.add(new Vector3(0, 1.5, 0)));
    }
  }

  private isMissionTalkTarget(id: string): boolean {
    const o = this.missions?.objective;
    return !!o && o.type === "talk" && o.npc === id;
  }

  // ================================================================== input
  private setupInputHooks(): void {
    const { input, canvas } = this.services;
    const onClick = () => {
      if (this.playing && !this.paused && !this.services.ui.isMenuOpen) input.requestPointerLock();
    };
    canvas.addEventListener("click", onClick);
    this.disposers.push(() => canvas.removeEventListener("click", onClick));
    const offLock = input.onPointerLockChange((locked) => {
      if (!locked && this.playing && !this.paused && !input.isTouch && !this.services.ui.isMenuOpen) this.onRequestPause?.();
    });
    this.disposers.push(offLock);
  }

  // =========================================================== ScenarioInstance
  async playIntro(): Promise<void> {
    const { ui, audio } = this.services;
    const cam = this.player.camera;
    const L = LAYOUT;
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    audio.playMusic("istanbul");
    // Camera path: high above the Golden Horn, over the walls and the camp, down to eye level.
    const eye = this.player.eyePosition.clone();
    const fwd = this.player.forward();
    const p: Vector3[] = [
      new Vector3(120, 260, 150),
      new Vector3(-20, 140, 70),
      new Vector3(-140, 60, -10),
      new Vector3(eye.x + 14, eye.y + 14, eye.z + 10),
      eye,
    ];
    const look: Vector3[] = [
      new Vector3(L.hagiaSophia.x, 20, L.hagiaSophia.z),
      new Vector3(30, 10, -30),
      new Vector3(L.otag.x, 4, L.otag.z),
      eye.add(fwd.scale(20)),
      eye.add(fwd.scale(20)),
    ];
    let skipped = false;
    const duration = 7.5;
    let t = 0;
    const haze = ui.cinematic.fade(0, 1.8);
    window.setTimeout(() => void ui.cinematic.hideTitle(), 1600);
    ui.cinematic.setSkipHint(true, "Atla · Space");
    await new Promise<void>((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
        t += dt;
        if (this.services.input.wasPressed("skip") || this.services.input.wasPressed("pause")) skipped = true;
        const k = skipped ? 1 : easeInOutCubic(clamp(t / duration, 0, 1));
        cam.position.copyFrom(catmull(p, k));
        cam.setTarget(catmull(look, k));
        if (k >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
    await haze;
    ui.cinematic.setSkipHint(false);
    ui.cinematic.setFadeInstant(0);
    ui.cinematic.setLetterbox(false);
    this.player.syncCamera(0);
    ui.hud.show();
    ui.mobile.setLayout("explore");
    this.playing = true;
    this.player.controlEnabled = true;
    this.player.lookEnabled = true;
    this.services.input.gameplayEnabled = true;
    if (!this.services.input.isTouch && !this.lockHintShown) {
      this.lockHintShown = true;
      ui.hud.toast("Fareyle etrafa bakmak için oyun alanına tıkla. WASD: hareket · Shift: koş · E: etkileşim · ESC: menü", "info", 7000);
    }
    // Not awaited: a mission intro dialogue must not block the "playing" state (pause, input).
    void this.missions.start(this.resumeMissionId);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.minigame) this.minigame.paused = paused;
    if (paused) this.services.input.resetState();
  }

  applySettings(settings: Settings, changed: (keyof Settings)[]): void {
    this.player.applySettings(settings);
    const preset = this.services.preset();
    if (changed.some((c) => c === "quality" || c === "resolutionScale" || c === "postProcessing" || c === "shadows")) {
      this.materials.unfreezeAll();
      this.pipeline.apply(preset, settings);
      this.water.setAnimated(preset.waterCells > 80);
      window.setTimeout(() => this.materials.freezeAll(), 1500);
    }
    if (changed.includes("particles") || changed.includes("quality")) this.fx.setFactor(preset.particles);
    if (changed.includes("quality")) this.services.ui.hud.toast("Kalite değişti. Doku ve arazi çözünürlüğü bir sonraki yüklemede güncellenir.");
  }

  // ===================================================================== update
  update(dt: number): void {
    this.time += dt;
    const { input, ui } = this.services;
    const cam = this.player.camera;
    this.water.update(dt, cam);
    this.fx.update(dt);
    this.updateAtmosphere(dt);
    if (!this.playing || this.paused) return;

    this.npcs.update(dt, cam);
    if (this.inDialogue) {
      if (input.wasPressed("interact") || input.wasPressed("skip") || input.wasPressed("fire")) ui.dialogue.advance();
      this.player.updateLook();
      this.player.syncCamera(dt, 0);
      ui.hud.setInteraction(null);
      ui.hud.setWaypoint(null);
      return;
    }
    if (this.minigame?.active) {
      if (this.minigame !== this.siegeGame) ui.hud.setInteraction(null);
      this.minigame.tick(dt);
    } else {
      this.player.update(dt);
      this.player.setShake(this.camFx.update(dt));
      // Interactions.
      for (const [id, fn] of this.dynamicInteractables) {
        const it = this.interactions.get(id);
        if (it) it.position.copyFrom(fn());
      }
      const prompt = this.interactions.update(dt, this.player.eyePosition, this.player.forward(), (a) => input.isDown(a), (a) => input.wasPressed(a));
      ui.hud.setInteraction(prompt);
      ui.hud.setCrosshair(true, !!prompt);
      this.missions.update();
    }
    this.updatePendingRelocation();
    this.updateHud();
  }

  private updateNameplate(): void {
    const hud = this.services.ui.hud;
    const f = this.fatih;
    const d = Math.hypot(f.position.x - this.player.position.x, f.position.z - this.player.position.z);
    if (this.inDialogue || this.minigame?.active || d > 16 || !f.rig.root.isEnabled()) {
      hud.setNameplate(null);
      return;
    }
    const head = f.position.add(new Vector3(0, 2.35 * f.rig.scale, 0));
    const p = projectWaypoint(this.scene, this.player.camera, head);
    if (p.offscreen) {
      hud.setNameplate(null);
      return;
    }
    hud.setNameplate({ name: "Fatih Sultan Mehmet", role: "Osmanlı Padişahı", x: p.x, y: p.y, opacity: clamp((16 - d) / 5, 0, 1) });
  }

  private updateHud(): void {
    const hud = this.services.ui.hud;
    this.updateNameplate();
    const m = this.missions.current;
    const key = m ? `${m.id}` : "";
    if (key !== this.lastHudMission) {
      this.lastHudMission = key;
      hud.setMission(m?.title ?? null, m?.description ?? "");
    }
    if (this.minigame?.active && this.minigame !== this.siegeGame) {
      hud.setObjective(null);
      hud.setWaypoint(null);
      return;
    }
    if (this.minigame !== this.siegeGame || !this.siegeGame?.active) hud.setObjective(this.missions.objectiveText() || null);
    const wp = this.siegeGame?.active ? (this.siegeGame.currentZone?.position ?? null) : this.missions.waypoint();
    if (wp) {
      const target = wp.add(new Vector3(0, 2.2, 0));
      const proj = projectWaypoint(this.scene, this.player.camera, target);
      hud.setWaypoint(proj.distance > 3 ? proj : null);
      hud.setObjectiveDistance(proj.distance);
    } else {
      hud.setWaypoint(null);
      hud.setObjectiveDistance(null);
    }
  }

  // ================================================================ MissionHost
  anchor(id: string): Vector3 | null {
    return this.world.anchors.get(id) ?? null;
  }

  npcPosition(id: string): Vector3 | null {
    return this.npcs.get(id)?.position ?? null;
  }

  npcName(id: string): string {
    return this.npcs.get(id)?.displayName ?? id;
  }

  playerPosition(): Vector3 {
    return this.player.position;
  }

  async playDialogue(id: string, speakerNpc?: string): Promise<void> {
    const lines = this.missionData.dialogues[id];
    if (!lines?.length) return;
    const npc = speakerNpc ? this.npcs.get(speakerNpc) : undefined;
    await this.playLines(lines, npc);
  }

  private async playLines(lines: DialogueLine[], focus?: NPC): Promise<void> {
    const { ui, audio } = this.services;
    this.inDialogue = true;
    this.player.controlEnabled = false;
    const prevBehavior = focus?.behavior;
    if (focus) {
      focus.lookTarget = this.player.camera.position;
      if (focus.behavior.type !== "scripted") focus.setBehavior({ type: "pose", anim: "talk" });
      // Turn the player toward the speaker.
      const dx = focus.position.x - this.player.position.x;
      const dz = focus.position.z - this.player.position.z;
      this.turnPlayerTo(Math.atan2(dx, dz));
    }
    ui.hud.setInteraction(null);
    const layout = ui.mobile.currentLayout;
    ui.mobile.setLayout("hidden");
    await ui.dialogue.play(lines, (line) => {
      if (line.speaker === "Sen") return;
      audio.play("murmur", { volume: 0.5, pitch: line.speaker.startsWith("Fatih") ? 0.85 : 1 + Math.random() * 0.15 });
    });
    if (focus) {
      focus.lookTarget = null;
      if (prevBehavior && focus.behavior.type !== "scripted") focus.setBehavior(prevBehavior);
    }
    this.inDialogue = false;
    ui.mobile.setLayout(layout === "hidden" ? "explore" : layout);
    if (!this.minigame?.active) this.player.controlEnabled = true;
  }

  private turnPlayerTo(yaw: number): void {
    const start = this.player.yaw;
    let delta = yaw - start;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const startPitch = this.player.pitch;
    let t = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000 / 0.45;
      const k = easeInOutCubic(Math.min(1, t));
      this.player.yaw = start + delta * k;
      this.player.pitch = lerp(startPitch, 0.05, k);
      if (t >= 1) this.scene.onBeforeRenderObservable.remove(obs);
    });
  }

  async startMinigame(kind: MinigameKind): Promise<boolean> {
    const ui = this.services.ui;
    let game: BaseMinigame;
    if (kind === "ship") game = this.shipGame ??= this.createShipGame();
    else if (kind === "cannon") game = this.cannonGame ??= this.createCannonGame();
    else game = this.siegeGame ??= this.createSiegeGame();
    this.minigame = game;
    ui.hud.setInteraction(null);
    ui.hud.setWaypoint(null);
    const ok = await game.run();
    this.minigame = null;
    if (!ok) ui.hud.toast("Hazır olduğunda tekrar deneyebilirsin.");
    if (kind !== "siege") this.services.audio.playMusic("istanbul");
    return ok;
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

  private updatePendingRelocation(): void {
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
    this.atmosphere = { t: 0, from: 0, to: 1 };
  }

  private updateAtmosphere(dt: number): void {
    if (this.atmosphere.t >= 1) return;
    this.atmosphere.t = Math.min(1, this.atmosphere.t + dt / 4);
    const k = this.atmosphere.t;
    const sun = this.sky.sun;
    sun.diffuse = Color3.Lerp(this.sky.params.sunColor, new Color3(1, 0.62, 0.38), k);
    sun.intensity = lerp(3.4, 2.6, k);
    this.scene.fogColor = Color3.Lerp(fogColorFromSky(this.sky.params), new Color3(0.86, 0.66, 0.5), k);
    this.scene.fogDensity = lerp(GAME_CONFIG.world.fogDensity, GAME_CONFIG.world.fogDensity * 1.5, k);
    this.water.setFog(this.scene.fogColor, this.scene.fogDensity);
    this.sky.material.setColor3("horizon", Color3.Lerp(this.sky.params.horizon, new Color3(0.95, 0.62, 0.42), k));
  }

  addInteractable(def: Parameters<MissionHost["addInteractable"]>[0]): void {
    const pos = def.position().clone();
    this.interactions.add({ id: def.id, position: pos, key: def.key, prompt: def.prompt, holdTime: def.holdTime, enabled: def.enabled, onInteract: def.onInteract });
    this.dynamicInteractables.set(def.id, def.position);
  }

  removeInteractable(id: string): void {
    this.interactions.remove(id);
    this.dynamicInteractables.delete(id);
  }

  setCarry(item: string | null): void {
    for (const m of this.carryMeshes) m.dispose();
    this.carryMeshes = [];
    this.player.speedMultiplier = 1;
    if (!item || !this.carryNode) return;
    const isFlag = item !== "cannonball";
    const parts = isFlag ? flagHeld() : heldCannonball();
    // The banner pole is held low and to the side so it frames the view instead of blocking it.
    this.carryNode.position.set(isFlag ? 0.1 : 0, isFlag ? -1.15 : 0, isFlag ? 0.1 : 0);
    this.carryNode.rotation.set(isFlag ? 0.12 : 0, 0, isFlag ? -0.18 : 0);
    this.carryMeshes = this.prefabs.buildUnique(`carry-${item}`, parts, this.carryNode, false);
    for (const m of this.carryMeshes) m.renderingGroupId = 1;
    this.player.speedMultiplier = GAME_CONFIG.player.carrySpeedMultiplier;
    this.services.audio.play("pickup", { volume: 0.7 });
  }

  onTargetDone(targetId: string): void {
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

  notify(kind: "mission" | "objective" | "complete" | "toast", title: string, subtitle?: string): void {
    const { hud } = this.services.ui;
    const audio = this.services.audio;
    if (kind === "mission") {
      hud.banner(subtitle ?? "YENİ GÖREV", title);
      audio.play("drum", { volume: 0.7 });
      hud.setObjective(this.missions.objectiveText(), true);
    } else if (kind === "objective") {
      hud.setObjective(title, true);
      audio.play("objective", { volume: 0.6 });
    } else if (kind === "complete") {
      hud.banner("GÖREV TAMAMLANDI", title);
      if (subtitle) hud.toast(subtitle, "success");
      audio.play("objective", { volume: 0.8 });
    } else {
      hud.toast(title);
    }
  }

  // ===================================================================== ending
  private async showEnding(): Promise<void> {
    const { ui, save, input } = this.services;
    save.completeScenario(SCENARIO_ID);
    this.playing = false;
    this.player.controlEnabled = false;
    input.exitPointerLock();
    ui.hud.hide();
    ui.cinematic.setLetterbox(true);
    // Slow orbit around the tower with the planted sancak.
    const center = this.world.finalFlag.getAbsolutePosition().clone();
    let t = 0;
    const cam = this.player.camera;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const a = -2.4 + t * 0.12;
      cam.position.set(center.x + Math.cos(a) * 38, center.y + 10 + Math.sin(t * 0.2) * 3, center.z + Math.sin(a) * 38);
      cam.setTarget(center);
    });
    await wait(3500);
    const minutes = Math.max(1, Math.round((performance.now() - this.startedAt) / 60000));
    ui.modal.show(
      "",
      `<div class="ending"><div class="e-date">29 MAYIS 1453</div><h1>İSTANBUL FETHEDİLDİ</h1>
       <div class="ornament-line"></div>
       <p>Gemileri karadan yürüttün, Şahi topuyla surlarda gedik açtın ve hücumda sancağı burca diktin.
       Fatih Sultan Mehmet'in emriyle şehir halkı emana alındı; İstanbul yeni bir çağa uyandı.</p>
       <p style="font-size:12px">Bu oturumda oynama süresi: ~${minutes} dk · 8/8 görev tamamlandı</p>
       <p style="font-size:12px;color:var(--gold)">Yeni şehirler ve dönemler yakında: Bursa 1326 · Çanakkale 1915 · Ankara 1920 · İzmir 1922…</p></div>`,
      [
        { label: "Haritaya Dön", primary: true, onClick: () => this.onExitToMap?.() },
        {
          label: "Bölümü Tekrar Oyna",
          onClick: () => {
            save.resetScenario(SCENARIO_ID, this.missions.missionIds);
            this.onExitToMap?.();
          },
        },
      ],
    );
  }

  dispose(): void {
    this.minigame?.abort();
    for (const d of this.disposers) d();
    if (this.renderObserver) this.scene.onBeforeRenderObservable.remove(this.renderObserver);
    this.services.ui.hud.minigameLayer.innerHTML = "";
    this.services.ui.cinematic.setLetterbox(false);
    this.services.ui.modal.hide();
    this.fx.dispose();
    this.pipeline.dispose();
    this.water.dispose();
    this.sky.dispose();
    this.materials.dispose();
    this.scene.dispose();
  }
}

function m0(arr: AbstractMesh[]): AbstractMesh {
  return arr[0];
}

/** Centripetal-ish Catmull-Rom through all points, k ∈ [0, 1]. */
function catmull(points: Vector3[], k: number): Vector3 {
  const n = points.length - 1;
  const f = clamp(k, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  return Vector3.CatmullRom(p0, p1, p2, p3, t);
}
