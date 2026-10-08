import { Color3, Color4, Scene, TransformNode, Vector3, type AbstractMesh, type Observer } from "@babylonjs/core";
import { AssetLoader } from "../../assets/AssetLoader";
import { PrefabLibrary } from "../../assets/PrefabLibrary";
import type { PartSet } from "../../assets/Prefabs";
import type { MusicTheme } from "../../audio/AudioManager";
import { GAME_CONFIG } from "../../config/gameConfig";
import type { QualityPreset } from "../../config/qualityPresets";
import type { GameServices } from "../../core/GameServices";
import type { Settings } from "../../core/SaveManager";
import { HumanoidFactory, type HumanoidLook } from "../../entities/HumanoidFactory";
import type { NPC, NpcBehavior, NpcRole } from "../../entities/NPC";
import { NPCManager } from "../../entities/NPCManager";
import { Player, type Surface } from "../../entities/Player";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { MissionManager } from "../../missions/MissionManager";
import type { MinigameKind, MissionHost, ScenarioMissionFile } from "../../missions/types";
import { AtmosphereController, type AtmospherePhase } from "../../rendering/Atmosphere";
import { MaterialLibrary } from "../../rendering/MaterialLibrary";
import { RenderPipeline } from "../../rendering/RenderPipeline";
import { createSkyEnvironment, type SkyEnvironment } from "../../rendering/SkyEnvironment";
import type { Water } from "../../rendering/Water";
import { CameraFX } from "../../systems/CameraFX";
import { InteractionSystem } from "../../systems/InteractionSystem";
import { ParticleFX } from "../../systems/ParticleFX";
import { projectWaypoint } from "../../systems/Waypoint";
import type { DialogueLine } from "../../ui/DialogueUI";
import { fetchJson, nextFrame } from "../../utils/async";
import { clamp, easeInOutCubic, lerp } from "../../utils/math";
import { Random } from "../../utils/random";
import { CollisionWorld, type Bounds } from "../../world/CollisionWorld";
import type { NavGraph } from "../../world/NavGraph";
import type { ScenarioCreateOptions, ScenarioInstance } from "../types";

/** What every explorable scenario world provides to the shared FPS layer. */
export interface ScenarioWorld {
  collision: CollisionWorld;
  nav: NavGraph;
  anchors: Map<string, Vector3>;
  groundAt(x: number, z: number, feetY?: number): number;
  surfaceAt(x: number, z: number, feetY: number): Surface;
}

export interface WorldBuildContext {
  scene: Scene;
  prefabs: PrefabLibrary;
  materials: MaterialLibrary;
  pipeline: RenderPipeline;
  fx: ParticleFX;
  preset: QualityPreset;
  progress(f: number, s: string): void;
  yieldFrame(): Promise<void>;
}

export interface FpsScenarioConfig {
  scenarioId: string;
  missionsPath: string;
  /** Initial lighting (the sky dome / reflection bake use its sky colours). */
  atmosphere: AtmospherePhase;
  postFx: { exposure: number; contrast: number; vignette: number; grain: number };
  bounds: Bounds;
  music: MusicTheme;
  /** Status line while the NPCs are spawned. */
  populateText: string;
  /** Ambient one-liners per NPC role for "Konuş" interactions. */
  chatter: Partial<Record<NpcRole, string[]>>;
  /** Characters that get a floating nameplate when the player is near. */
  nameplates: { npc: string; name: string; role: string }[];
}

export interface CarrySpec {
  parts: PartSet;
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface IntroPath {
  points: Vector3[];
  look: Vector3[];
  duration: number;
}

/**
 * Shared first-person scenario layer: player, sky/lighting, post-processing, NPCs, dialogue,
 * interactions, HUD waypoints and the MissionHost bridge to the data-driven mission system.
 * A city scenario only builds its world, populates it and supplies its minigames and hooks.
 */
export abstract class FpsScenario<W extends ScenarioWorld = ScenarioWorld> implements ScenarioInstance, MissionHost {
  readonly scene: Scene;
  onExitToMap: (() => void) | null = null;
  onRequestPause: (() => void) | null = null;
  protected materials!: MaterialLibrary;
  protected pipeline!: RenderPipeline;
  protected sky!: SkyEnvironment;
  protected atmosphere!: AtmosphereController;
  protected water: Water | null = null;
  protected fx!: ParticleFX;
  protected prefabs!: PrefabLibrary;
  protected world!: W;
  protected humanoids!: HumanoidFactory;
  protected npcs!: NPCManager;
  protected player!: Player;
  protected interactions = new InteractionSystem();
  protected dynamicInteractables = new Map<string, () => Vector3>();
  protected missions!: MissionManager;
  protected camFx = new CameraFX();
  protected minigame: BaseMinigame | null = null;
  protected paused = false;
  protected playing = false;
  protected inDialogue = false;
  protected missionData!: ScenarioMissionFile;
  protected disposers: (() => void)[] = [];
  protected rnd = new Random(7);
  protected time = 0;
  protected renderObserver: Observer<Scene> | null = null;
  protected startedAt = performance.now();
  protected resumeMissionId = "";
  protected currentMusic: MusicTheme;
  private carryNode: TransformNode | null = null;
  private carryMeshes: AbstractMesh[] = [];
  private lockHintShown = false;
  private lastHudMission = "";

  protected constructor(
    protected readonly services: GameServices,
    protected readonly cfg: FpsScenarioConfig,
  ) {
    this.scene = new Scene(services.engine);
    this.scene.clearColor = new Color4(0.8, 0.78, 0.72, 1);
    this.scene.skipPointerMovePicking = true;
    this.scene.ambientColor = new Color3(0.2, 0.2, 0.2);
    this.currentMusic = cfg.music;
  }

  /** Builds a scenario, never leaking a half-built scene (GPU resources) when loading fails. */
  protected static async createInstance<T extends FpsScenario>(instance: T, opts: ScenarioCreateOptions): Promise<T> {
    try {
      await instance.build(opts);
    } catch (err) {
      instance.scene.dispose();
      throw err;
    }
    return instance;
  }

  // ===================================================================== hooks
  protected abstract buildWorld(ctx: WorldBuildContext): Promise<W>;
  /** Runs after the world exists and before NPCs spawn (e.g. water planes). */
  protected afterWorld(): void {}
  protected abstract populate(density: number): void;
  /** Runs once NPCs and missions exist (scenario-specific interactions). */
  protected afterPopulate(): void {}
  protected abstract resumeSpawn(missionId: string): { x: number; z: number; yaw: number };
  protected abstract introPath(): IntroPath;
  protected abstract createMinigame(kind: MinigameKind): BaseMinigame;
  abstract runHook(id: string, phase: "start" | "complete" | "resume"): void;
  protected abstract carrySpec(item: string): CarrySpec;
  protected abstract showEnding(): Promise<void>;
  onTargetDone(targetId: string): void {
    void targetId;
  }
  /** Per-frame scenario logic while playing (after the player/minigame update). */
  protected onPlayingUpdate(dt: number): void {
    void dt;
  }
  /** Called when a minigame ends; restores the exploration music by default. */
  protected afterMinigame(kind: MinigameKind, ok: boolean): void {
    void kind;
    void ok;
    this.services.audio.playMusic(this.currentMusic);
  }

  // =====================================================================  BUILD
  private async build(opts: ScenarioCreateOptions): Promise<void> {
    const { services, cfg } = this;
    const preset = services.preset();
    const scene = this.scene;
    const progress = opts.onProgress;
    progress(0.02, "Görevler yükleniyor");
    this.missionData = await fetchJson<ScenarioMissionFile>(cfg.missionsPath);

    this.materials = new MaterialLibrary(scene, preset.textureSize);
    progress(0.05, "Dokular üretiliyor");
    for (const k of ["terrain", "stone", "wood", "props", "roof", "plaster", "cloth"] as const) {
      this.materials.get(k);
      await nextFrame();
    }

    const phase = cfg.atmosphere;
    scene.fogMode = Scene.FOGMODE_EXP2;
    const maxZ = Math.min(GAME_CONFIG.camera.farPlane, preset.drawDistance + 400);
    this.sky = await createSkyEnvironment(scene, phase.sky, {
      // The dome must sit inside the camera's far plane.
      domeRadius: maxZ * 0.88,
      reflections: preset.environmentReflections,
      envSize: 64,
      sunIntensity: phase.sunIntensity,
      ambientIntensity: phase.ambientIntensity,
      environmentIntensity: phase.environmentIntensity,
    });
    this.atmosphere = new AtmosphereController(scene, this.sky, phase);
    this.atmosphere.transition(phase, 0);
    this.atmosphere.onFogChanged = (color, density) => this.water?.setFog(color, density);

    // The real collision world is bound once the level is built (see bindWorld below).
    const placeholder = new CollisionWorld(() => 0, -100, cfg.bounds);
    this.materials.adaptToEnvironment(!!scene.environmentTexture);
    this.player = new Player(scene, placeholder, services.input, services.audio, services.save.settings, () => "dirt");
    scene.activeCamera = this.player.camera;
    this.player.camera.maxZ = maxZ;
    this.pipeline = new RenderPipeline(scene, this.player.camera, this.sky.sun, cfg.postFx, true);
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

    this.world = await this.buildWorld({
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
    this.afterWorld();

    progress(0.82, cfg.populateText);
    await nextFrame();
    this.humanoids = new HumanoidFactory(scene, this.materials, this.pipeline);
    this.npcs = new NPCManager(this.humanoids, world.collision, world.nav, (x, z, y) => world.groundAt(x, z, y + 0.5), this.player.position);
    this.populate(preset.npcDensity);

    progress(0.88, "Görev sistemi hazırlanıyor");
    this.missions = new MissionManager(this.missionData, this, services.save);
    this.missions.onScenarioComplete = () => void this.showEnding();
    this.afterPopulate();
    this.setupChatter();
    this.carryNode = new TransformNode("carry", scene);
    this.carryNode.parent = this.player.hand;

    // Start/resume point.
    const resume = opts.resumeMissionId && this.missions.missionIds.includes(opts.resumeMissionId) ? opts.resumeMissionId : this.missionData.firstMission;
    this.resumeMissionId = resume;
    this.missions.fastForwardTo(resume);
    const spawn = this.resumeSpawn(resume);
    this.player.teleport(spawn.x, spawn.z, spawn.yaw);

    this.fx.environmentDust(this.player.camera.position);
    this.setupInputHooks();

    progress(0.94, "Shader'lar derleniyor");
    await scene.whenReadyAsync();
    progress(1, "Hazır");
  }

  // ================================================================== NPCs
  protected spawn(role: NpcRole, look: HumanoidLook, x: number, z: number, heading: number, behavior?: NpcBehavior, name = "", id?: string): NPC {
    return this.npcs.spawn({ id, role, name, look, x, z, heading, behavior });
  }

  private setupChatter(): void {
    for (const npc of this.npcs.npcs) {
      const lines = this.cfg.chatter[npc.role];
      if (!lines || !npc.displayName || this.cfg.nameplates.some((n) => n.npc === npc.id) || npc.behavior.type === "scripted") continue;
      if (npc.behavior.type === "pose" && npc.behavior.anim === "sit" && this.rnd.chance(0.5)) continue;
      const id = `chat:${npc.id}`;
      this.interactions.add({
        id,
        position: npc.position.clone(),
        key: "E",
        prompt: `Konuş — ${npc.displayName}`,
        enabled: () => !this.minigame && !this.inDialogue && !this.isMissionTalkTarget(npc.id) && npc.visible,
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
      if (this.playing && !this.paused && !this.services.ui.isMenuOpen && !(this.minigame?.active && this.minigame.freeCursor)) input.requestPointerLock();
    };
    canvas.addEventListener("click", onClick);
    this.disposers.push(() => canvas.removeEventListener("click", onClick));
    const offLock = input.onPointerLockChange((locked) => {
      if (!locked && this.playing && !this.paused && !input.isTouch && !this.services.ui.isMenuOpen && !(this.minigame?.active && this.minigame.freeCursor)) this.onRequestPause?.();
    });
    this.disposers.push(offLock);
  }

  // =========================================================== ScenarioInstance
  async playIntro(): Promise<void> {
    const { ui, audio } = this.services;
    const cam = this.player.camera;
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    audio.playMusic(this.currentMusic);
    const path = this.introPath();
    let skipped = false;
    let t = 0;
    const haze = ui.cinematic.fade(0, 1.8);
    window.setTimeout(() => void ui.cinematic.hideTitle(), 1600);
    ui.cinematic.setSkipHint(true, "Atla · Space");
    await new Promise<void>((resolve) => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
        t += dt;
        if (this.services.input.wasPressed("skip") || this.services.input.wasPressed("pause")) skipped = true;
        const k = skipped ? 1 : easeInOutCubic(clamp(t / path.duration, 0, 1));
        cam.position.copyFrom(catmull(path.points, k));
        cam.setTarget(catmull(path.look, k));
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

  /** Camera path helper for intros: from high above down to the player's eyes. */
  protected introToPlayer(points: Vector3[], look: Vector3[], duration: number): IntroPath {
    const eye = this.player.eyePosition.clone();
    const fwd = this.player.forward();
    return {
      points: [...points, new Vector3(eye.x + 14, eye.y + 14, eye.z + 10), eye],
      look: [...look, eye.add(fwd.scale(20)), eye.add(fwd.scale(20))],
      duration,
    };
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
      this.water?.setAnimated(preset.waterCells > 80);
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
    this.water?.update(dt, cam);
    this.fx.update(dt);
    this.atmosphere.update(dt);
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
      if (!this.minigame.freeRoam) ui.hud.setInteraction(null);
      this.minigame.tick(dt);
    } else {
      this.player.update(dt);
      this.player.setShake(this.camFx.update(dt));
      for (const [id, fn] of this.dynamicInteractables) {
        const it = this.interactions.get(id);
        if (it) it.position.copyFrom(fn());
      }
      const prompt = this.interactions.update(dt, this.player.eyePosition, this.player.forward(), (a) => input.isDown(a), (a) => input.wasPressed(a));
      ui.hud.setInteraction(prompt);
      ui.hud.setCrosshair(true, !!prompt);
      this.missions.update();
    }
    this.onPlayingUpdate(dt);
    this.updateHud();
  }

  private updateNameplate(): void {
    const hud = this.services.ui.hud;
    if (this.inDialogue || this.minigame?.active) {
      hud.setNameplate(null);
      return;
    }
    let best: { npc: NPC; name: string; role: string; d: number } | null = null;
    for (const n of this.cfg.nameplates) {
      const npc = this.npcs.get(n.npc);
      if (!npc || !npc.visible || !npc.rig.root.isEnabled()) continue;
      const d = Math.hypot(npc.position.x - this.player.position.x, npc.position.z - this.player.position.z);
      if (d <= 16 && (!best || d < best.d)) best = { npc, name: n.name, role: n.role, d };
    }
    if (!best) {
      hud.setNameplate(null);
      return;
    }
    const head = best.npc.position.add(new Vector3(0, 2.35 * best.npc.rig.scale, 0));
    const p = projectWaypoint(this.scene, this.player.camera, head);
    if (p.offscreen) {
      hud.setNameplate(null);
      return;
    }
    hud.setNameplate({ name: best.name, role: best.role, x: p.x, y: p.y, opacity: clamp((16 - best.d) / 5, 0, 1) });
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
    const game = this.minigame?.active ? this.minigame : null;
    if (game && !game.freeRoam) {
      hud.setObjective(null);
      hud.setWaypoint(null);
      return;
    }
    if (game) {
      const text = game.objectiveText();
      if (text) hud.setObjective(text);
    } else hud.setObjective(this.missions.objectiveText() || null);
    const wp = game ? game.waypoint() : this.missions.waypoint();
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

  /** Voice pitch for a speaker's murmur (lower for elders/rulers). */
  protected voicePitch(speaker: string): number {
    void speaker;
    return 1 + Math.random() * 0.15;
  }

  protected async playLines(lines: DialogueLine[], focus?: NPC): Promise<void> {
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
      audio.play("murmur", { volume: 0.5, pitch: this.voicePitch(line.speaker) });
    });
    if (focus) {
      focus.lookTarget = null;
      if (prevBehavior && focus.behavior.type !== "scripted") focus.setBehavior(prevBehavior);
    }
    this.inDialogue = false;
    ui.mobile.setLayout(layout === "hidden" ? "explore" : layout);
    if (!this.minigame?.active) this.player.controlEnabled = true;
  }

  protected turnPlayerTo(yaw: number): void {
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
    const game = this.createMinigame(kind);
    this.minigame = game;
    ui.hud.setInteraction(null);
    ui.hud.setWaypoint(null);
    const ok = await game.run();
    this.minigame = null;
    if (!ok) ui.hud.toast("Hazır olduğunda tekrar deneyebilirsin.");
    this.afterMinigame(kind, ok);
    return ok;
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
    const spec = this.carrySpec(item);
    this.carryNode.position.set(...spec.position);
    this.carryNode.rotation.set(...spec.rotation);
    this.carryMeshes = this.prefabs.buildUnique(`carry-${item}`, spec.parts, this.carryNode, false);
    for (const m of this.carryMeshes) m.renderingGroupId = 1;
    this.player.speedMultiplier = GAME_CONFIG.player.carrySpeedMultiplier;
    this.services.audio.play("pickup", { volume: 0.7 });
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
  /** Common ending: save, freeze gameplay and slowly orbit the camera around `center`. */
  protected beginEndingOrbit(center: Vector3, radius: number, height: number, startAngle: number): void {
    const { ui, save, input } = this.services;
    save.completeScenario(this.cfg.scenarioId);
    this.playing = false;
    this.player.controlEnabled = false;
    input.exitPointerLock();
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    let t = 0;
    const cam = this.player.camera;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const a = startAngle + t * 0.12;
      cam.position.set(center.x + Math.cos(a) * radius, center.y + height + Math.sin(t * 0.2) * 3, center.z + Math.sin(a) * radius);
      cam.setTarget(center);
    });
  }

  protected playMinutes(): number {
    return Math.max(1, Math.round((performance.now() - this.startedAt) / 60000));
  }

  /** "Haritaya Dön" / "Bölümü Tekrar Oyna" buttons shared by every ending screen. */
  protected endingButtons(): { label: string; primary?: boolean; onClick: () => void }[] {
    return [
      { label: "Haritaya Dön", primary: true, onClick: () => this.onExitToMap?.() },
      {
        label: "Bölümü Tekrar Oyna",
        onClick: () => {
          this.services.save.resetScenario(this.cfg.scenarioId, this.missions.missionIds);
          this.onExitToMap?.();
        },
      },
    ];
  }

  dispose(): void {
    this.minigame?.abort();
    for (const d of this.disposers) d();
    if (this.renderObserver) this.scene.onBeforeRenderObservable.remove(this.renderObserver);
    this.services.ui.hud.minigameLayer.innerHTML = "";
    this.services.ui.hud.setNameplate(null);
    this.services.ui.cinematic.setLetterbox(false);
    this.services.ui.modal.hide();
    this.fx.dispose();
    this.pipeline.dispose();
    this.water?.dispose();
    this.sky.dispose();
    this.materials.dispose();
    this.scene.dispose();
  }
}

/** Centripetal-ish Catmull-Rom through all points, k ∈ [0, 1]. */
export function catmull(points: Vector3[], k: number): Vector3 {
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
