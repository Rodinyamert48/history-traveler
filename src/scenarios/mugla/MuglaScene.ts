import { Color3, TransformNode, Vector3, type PBRMaterial } from "@babylonjs/core";
import { heldSack, keskekBowl, stirPaddle, tokmak } from "../../assets/PrefabsMugla";
import type { MusicTheme } from "../../audio/AudioManager";
import type { GameServices } from "../../core/GameServices";
import { LOOKS } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { DibekMinigame } from "../../minigames/DibekMinigame";
import { FireMinigame } from "../../minigames/FireMinigame";
import { ForestGatherMinigame } from "../../minigames/ForestGatherMinigame";
import { StirMinigame } from "../../minigames/StirMinigame";
import type { MinigameKind } from "../../missions/types";
import type { AtmospherePhase } from "../../rendering/Atmosphere";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { wait } from "../../utils/async";
import { Noise2D } from "../../utils/noise";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { LAYOUT } from "./layout";
import { buildMuglaWorld, type MuglaWorld } from "./MuglaWorld";

const PHASES = {
  afternoon: (): AtmospherePhase => ({ sky: SKY_PRESETS.muglaAfternoon(), sunIntensity: 3.2, ambientIntensity: 0.85, environmentIntensity: 0.75, fogDensity: 0.0013 }),
  dusk: (): AtmospherePhase => ({ sky: SKY_PRESETS.muglaDusk(), sunIntensity: 1.9, ambientIntensity: 0.6, environmentIntensity: 0.42, fogDensity: 0.0021 }),
  night: (): AtmospherePhase => ({
    sky: SKY_PRESETS.muglaNight(),
    sunIntensity: 0.55,
    ambientIntensity: 0.36,
    environmentIntensity: 0.14,
    fogDensity: 0.0026,
    fogColor: new Color3(0.05, 0.07, 0.12),
  }),
  dawn: (): AtmospherePhase => ({ sky: SKY_PRESETS.muglaDawn(), sunIntensity: 2.8, ambientIntensity: 0.78, environmentIntensity: 0.62, fogDensity: 0.002 }),
  /** Clear wedding morning: the afternoon palette with the sun in the east. */
  morning: (): AtmospherePhase => {
    const sky = SKY_PRESETS.muglaAfternoon();
    sky.sunDirection = new Vector3(0.6, 0.5, -0.3).normalize();
    sky.sunColor = Color3.FromHexString("#fff0d8").toLinearSpace();
    return { sky, sunIntensity: 3.3, ambientIntensity: 0.88, environmentIntensity: 0.75, fogDensity: 0.0013 };
  },
};

/** Where the player (re)spawns when a mission is resumed from the save. */
const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  mugla_m01: { x: LAYOUT.spawn.x, z: LAYOUT.spawn.z, yaw: LAYOUT.spawn.yaw },
  mugla_m02: { x: -4, z: -6, yaw: -1.1 },
  mugla_m03: { x: -5.5, z: -9, yaw: -1.1 },
  mugla_m04: { x: 1, z: 18, yaw: 0 },
  mugla_m05: { x: 2, z: 2, yaw: 2.4 },
  mugla_m06: { x: 4, z: 3, yaw: 0.8 },
  mugla_m07: { x: 4, z: 3, yaw: 0.8 },
  mugla_m08: { x: 1, z: -6, yaw: 0.5 },
};

const CHATTER = {
  villager: [
    "Bu yıl harman bereketli geçti, çok şükür.",
    "Ayşe Nine yine bir şey kuruyor; kokusu şimdiden burnumda.",
    "Yarın düğünde zeybeğe kalkmazsam bana gücensinler!",
    "Çamlıktaki kovanların balı bu yıl pek güzel oldu.",
    "Menteşe Beyi'nin adamları da düğüne gelecekmiş, duydun mu?",
  ],
  woman: [
    "Gelinin çeyizini dün serdik, maşallah dillere destan.",
    "Çeşmenin suyu buz gibi, ta Asar dağından gelir.",
    "Yazmamın oyasını kendim işledim, beğendin mi?",
    "Bu akşam kına gecesi var; sen de gel, türkü söyleriz.",
  ],
  child: ["Düğünde bize de pay verecekler mi?", "Ebem dedi, gece kazan başında türkü söylenecekmiş!", "Kovanlara yaklaşma, arılar sokar!"],
  musician: ["Davul bizden, oyun sizden!", "Zeybek havası çalınmadan düğün olmaz gari."],
};

/**
 * Muğla · Menteşe — "Keşkeğin Keşfi": a folk-tale chapter about the night keşkek was born.
 * Hull wheat in the dibek, gather wood in the pine forest, fire the hearth, stir all night
 * and serve the wedding. Dusk → night → dawn lighting follows the story.
 */
export class MuglaScene extends FpsScenario<MuglaWorld> {
  private ayse!: NPC;
  private hasan!: NPC;
  private halil!: NPC;
  private nightHelpers: NPC[] = [];
  private weddingCrowd: NPC[] = [];
  private games = new Map<MinigameKind, BaseMinigame>();
  private playerMallet: TransformNode | null = null;
  private partnerMallet: TransformNode | null = null;
  private paddle: TransformNode | null = null;
  /** Hearth strength outside the fire minigame (story driven). */
  private hearthIdle = { heat: 0, boil: 0 };
  private hearthOverride = false;
  private flicker = new Noise2D(5);
  private night = false;

  private constructor(services: GameServices) {
    super(services, {
      scenarioId: "mugla_keskek",
      missionsPath: "data/scenarios/mugla_keskek.json",
      atmosphere: PHASES.afternoon(),
      postFx: { exposure: 1.06, contrast: 1.12, vignette: 2.2, grain: 4 },
      bounds: LAYOUT.bounds,
      music: "mugla",
      populateText: "Köylüler meydanda toplanıyor",
      chatter: CHATTER,
      nameplates: [
        { npc: "ayse", name: "Ayşe Nine", role: "Köyün aşçıbaşısı" },
        { npc: "hasan", name: "Hasan Emmi", role: "Dibekçi" },
        { npc: "halil", name: "Halil Ağa", role: "Köyün ihtiyarı · gelinin dedesi" },
      ],
    });
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<MuglaScene> {
    return FpsScenario.createInstance(new MuglaScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<MuglaWorld> {
    return buildMuglaWorld(ctx);
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.mugla_m01;
  }

  protected introPath(): IntroPath {
    // From the pine hills in the north, over the forest and the white roofs, down to the street.
    return this.introToPlayer(
      [new Vector3(60, 95, 200), new Vector3(30, 55, 95), new Vector3(-20, 30, 20)],
      [new Vector3(0, 10, 20), new Vector3(0, 10, 0), new Vector3(0, 10, -30)],
      8,
    );
  }

  protected override voicePitch(speaker: string): number {
    if (speaker.startsWith("Ayşe")) return 1.28;
    if (speaker.startsWith("Halil")) return 0.78;
    if (speaker === "Anlatıcı") return 0.9;
    return super.voicePitch(speaker);
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    const r = this.rnd;
    const w = this.world;
    const hf = w.hearth;
    // Ayşe Nine beside the hearth, Hasan Emmi at the dibek (west side, facing east).
    const side = new Vector3(Math.cos(hf.facing), 0, -Math.sin(hf.facing)).scale(1.7);
    this.ayse = this.spawn("woman", LOOKS.aysheNine(), hf.front.x + side.x, hf.front.z + side.z, hf.facing + Math.PI, { type: "pose", anim: "idle" }, "Ayşe Nine", "ayse");
    this.hasan = this.spawn("villager", { ...LOOKS.villager(1), hat: "keche", hatColor: "#3a2e24" }, L.dibek.x - 1.4, L.dibek.z, Math.PI / 2, { type: "pose", anim: "idle" }, "Hasan Emmi", "hasan");
    this.halil = this.spawn("elder", LOOKS.elder(), L.cinar.x, L.cinar.z - 2.7, Math.PI, { type: "pose", anim: "sit" }, "Halil Ağa", "halil");
    // Market.
    this.spawn("villager", { ...LOOKS.villager(4), sash: "#efe6d2" }, L.kasap.x + 1.1, L.kasap.z, -Math.PI / 2, { type: "pose", anim: "work" }, "Kasap Mustafa", "kasap");
    this.spawn("villager", LOOKS.villager(2), L.bakkal.x - 1.1, L.bakkal.z, Math.PI / 2, { type: "pose", anim: "idle" }, "Bakkal Rıza", "bakkal");
    // Women at the fountain and by the gates.
    this.spawn("woman", LOOKS.woman(0), L.cesme.x - 2.4, L.cesme.z + 1.6, -1.2, { type: "pose", anim: "talk" }, "Fatma Bacı");
    this.spawn("woman", LOOKS.woman(1), L.cesme.x - 2.6, L.cesme.z - 1.2, -2.2, { type: "pose", anim: "idle" }, "Zeynep Bacı");
    for (let i = 0; i < Math.round(3 * density) + 1; i++) {
      const a = r.range(0, Math.PI * 2);
      const x = Math.cos(a) * r.range(18, 24);
      const z = Math.sin(a) * r.range(18, 24);
      this.spawn("woman", LOOKS.woman(i + 2), x, z, Math.atan2(-x, -z), { type: "pose", anim: "sit" }, "Köylü Kadın");
    }
    // Old men on the seki under the plane tree.
    for (const a of [0.9, 2.2]) this.spawn("villager", LOOKS.villager(3 + Math.round(a)), L.cinar.x + Math.cos(a) * 2.8, L.cinar.z + Math.sin(a) * 2.8, a + Math.PI / 2 + Math.PI, { type: "pose", anim: "sit" }, "Köylü");
    // Children playing around the square.
    for (let i = 0; i < Math.round(3 * density) + 1; i++) this.spawn("child", LOOKS.child(i), r.range(-8, 8), r.range(-8, 8), r.range(0, 6), { type: "wander", cx: 0, cz: -2, radius: 13 }, "Çocuk");
    // Villagers in the streets and at the threshing floor.
    for (let i = 0; i < Math.round(7 * density) + 2; i++) {
      const a = r.range(0, Math.PI * 2);
      this.spawn("villager", LOOKS.villager(i), Math.cos(a) * 30, Math.sin(a) * 30, r.range(0, 6), { type: "wander", cx: 0, cz: 0, radius: 60 }, "Köylü");
    }
    for (let i = 0; i < 2; i++) this.spawn("villager", LOOKS.villager(i + 5), L.harman.x + r.range(-4, 4), L.harman.z + r.range(-4, 4), r.range(0, 6), { type: "pose", anim: "work" }, "Harmancı");
    // The shepherd at the forest path knows where the dry wood is.
    this.spawn("villager", { ...LOOKS.villager(0), kaftan: "#4a3a2c", hat: "keche", hatColor: "#2a2420" }, L.forestGate.x + 3, L.forestGate.z - 3, Math.PI, { type: "pose", anim: "idle" }, "Çoban Ali", "coban");
  }

  protected override afterPopulate(): void {
    const L = LAYOUT;
    // Çoban Ali: hints about the forest.
    const lines = [
      [
        { speaker: "Çoban Ali", text: "Odun mu arıyorsun? Yolu takip et, yukarıda devrik çamların dalları kupkuru." },
        { speaker: "Çoban Ali", text: "Çırayı da kırık kütüklerde bulursun; reçinesi parlar, kokusundan tanırsın." },
      ],
      [
        { speaker: "Çoban Ali", text: "Bu çamlığın arıları dünyanın en güzel balını yapar. Çam balı derler." },
        { speaker: "Çoban Ali", text: "Kovanlara dokunma ama; arı kızarsa çoban da kaçar!" },
      ],
    ];
    let li = 0;
    this.interactions.add({
      id: "talk:coban",
      position: new Vector3(L.forestGate.x + 3, 0, L.forestGate.z - 3),
      key: "E",
      prompt: "Konuş — Çoban Ali",
      enabled: () => !this.minigame && !this.inDialogue,
      onInteract: () => void this.playLines(lines[li++ % lines.length], this.npcs.get("coban")),
    });
    this.dynamicInteractables.set("talk:coban", () => this.npcs.get("coban")!.position.add(new Vector3(0, 1.5, 0)));
    // A drink at the fountain.
    const cesme = this.world.anchors.get("cesme")!;
    this.interactions.add({
      id: "drink:cesme",
      position: cesme.add(new Vector3(0, 1, 0)),
      key: "E",
      prompt: "Çeşmeden su iç",
      enabled: () => !this.minigame && !this.isInteractTarget("cesme"),
      onInteract: () => {
        this.services.audio.play("splash", { volume: 0.25, pitch: 1.6 });
        this.services.ui.hud.toast("Buz gibi dağ suyu! Asar'ın karından gelir.");
      },
    });
  }

  private isInteractTarget(id: string): boolean {
    const o = this.missions?.objective;
    return !!o && o.type === "interact" && o.targets.includes(id);
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    let game = this.games.get(kind);
    if (!game) {
      game = this.buildMinigame(kind);
      this.games.set(kind, game);
    }
    if (kind === "dibek") this.partnerMallet!.setEnabled(true);
    if (kind === "fire" || kind === "stir") this.hearthOverride = kind === "fire";
    return game;
  }

  private buildMinigame(kind: MinigameKind): BaseMinigame {
    const { ui, input, audio } = this.services;
    const w = this.world;
    const common = { layer: ui.hud.minigameLayer, input, audio, hud: ui.hud, mobile: ui.mobile, player: this.player, fx: this.fx };
    switch (kind) {
      case "dibek": {
        this.playerMallet = new TransformNode("fp-mallet", this.scene);
        this.playerMallet.parent = this.player.hand;
        this.playerMallet.position.set(0.05, -0.22, -0.1);
        this.playerMallet.scaling.setAll(0.6);
        for (const m of this.prefabs.buildUnique("fp-mallet", tokmak(), this.playerMallet, false)) m.renderingGroupId = 1;
        this.playerMallet.setEnabled(false);
        this.partnerMallet = new TransformNode("hasan-mallet", this.scene);
        this.partnerMallet.parent = this.hasan.rig.armR;
        this.partnerMallet.position.set(0.02, -0.6, 0.04);
        this.partnerMallet.rotation.x = Math.PI;
        this.prefabs.buildUnique("hasan-mallet", tokmak(), this.partnerMallet);
        return new DibekMinigame({
          ...common,
          camFx: this.camFx,
          center: w.dibek.center,
          rimY: w.dibek.top,
          wheat: w.dibek.wheat,
          partner: this.hasan,
          mallet: this.playerMallet,
        });
      }
      case "forest":
        return new ForestGatherMinigame({
          ...common,
          scene: this.scene,
          modal: ui.modal,
          prefabs: this.prefabs,
          pipeline: this.pipeline,
          zone: LAYOUT.forestZone,
          groundAt: (x, z) => w.terrain.heightAt(x, z),
          isFree: (x, z) => {
            const y = w.terrain.heightAt(x, z);
            const probe = w.collision.move(x, z, 0, 0, 0.9, y, 1.8, 0.5);
            return Math.hypot(probe.x - x, probe.z - z) < 0.05 && w.terrain.slopeAt(x, z) > 0.85;
          },
        });
      case "fire":
        return new FireMinigame({
          ...common,
          camFx: this.camFx,
          hearth: { front: w.hearth.front, facing: w.hearth.facing, center: w.hearth.center, setFire: (h, b) => this.setHearth(h, b) },
        });
      default: {
        this.paddle = new TransformNode("stir-paddle", this.scene);
        this.prefabs.buildUnique("stir-paddle", stirPaddle(), this.paddle);
        this.paddle.setEnabled(false);
        const kazan = w.hearth.kazan;
        return new StirMinigame({
          ...common,
          camFx: this.camFx,
          front: w.hearth.step,
          facing: w.hearth.facing,
          surface: kazan.position.add(new Vector3(0, 0.52, 0)),
          paddle: this.paddle,
          contents: w.hearth.contents.parent as TransformNode,
          contentsMaterial: w.hearth.contents.material as PBRMaterial,
          onMilestone: (step) => {
            const lines = [
              "Ayşe Nine: Et kemikten ayrıldı, aferin! Kepçe durmasın.",
              "Ayşe Nine: Buğday erimeye başladı. Bak, kepçeyle uzayıp geliyor!",
              "Ayşe Nine: Az kaldı yavrım, tan ağarıyor. Bir solukta bitir!",
            ];
            this.services.ui.hud.toast(lines[step - 1], "success", 4200);
            this.services.audio.play("murmur", { volume: 0.5, pitch: 1.28 });
          },
        });
      }
    }
  }

  protected override afterMinigame(kind: MinigameKind, ok: boolean): void {
    if (kind === "dibek") this.partnerMallet?.setEnabled(false);
    if (kind === "fire") {
      this.hearthOverride = false;
      if (!ok) this.hearthIdle = { heat: 0.25, boil: 0 };
    }
    super.afterMinigame(kind, ok);
  }

  // ================================================================== hearth
  /** Drives flames, glow light, fire/smoke particles and steam from heat & boil (0..1). */
  private setHearth(heat: number, boil: number): void {
    const h = this.world.hearth;
    const lit = heat > 0.02;
    h.flames.setEnabled(lit);
    const flick = 1 + this.flicker.noise(this.time * 6, 1) * 0.12;
    h.flames.scaling.set(0.35 + heat * 0.8, (0.2 + heat * 1.1) * flick, 0.35 + heat * 0.8);
    h.light.intensity = lit ? heat * (this.night ? 3.4 : 1.6) * flick : 0;
    const q = this.fx.quality;
    h.fire.fire.emitRate = lit ? (4 + heat * 26) * q : 0;
    h.fire.smoke.emitRate = lit ? (1 + heat * 6) * q : 0;
    h.steam.emitRate = boil > 0.05 ? (2 + boil * 12) * q : 0;
  }

  protected override onPlayingUpdate(): void {
    if (!this.hearthOverride) this.setHearth(this.hearthIdle.heat, this.hearthIdle.boil);
  }

  // ================================================================== hooks
  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const instant = phase === "resume";
    const w = this.world;
    switch (id) {
      case "ayse:ocak":
        this.ayse.setBehavior({ type: "pose", anim: "idle" });
        break;
      case "dibek:wheat":
        w.dibek.wheat.setEnabled(true);
        for (const s of w.dibek.sacks) s.setEnabled(true);
        break;
      case "wood:stacked":
        w.hearth.logPile.setEnabled(true);
        break;
      case "kazan:filled":
        (w.hearth.contents.parent as TransformNode).setEnabled(true);
        break;
      case "time:dusk":
        this.atmosphere.transition(PHASES.dusk(), instant ? 0 : 10);
        w.windowGlow.setEnabled(true);
        this.services.audio.setAmbience({ wind: 0.35, forest: 0.35, camp: 0.15 });
        break;
      case "time:night":
        this.night = true;
        this.atmosphere.transition(PHASES.night(), instant ? 0 : 8);
        this.hearthIdle = { heat: 0.7, boil: 0.6 };
        this.spawnNightHelpers();
        // Ayşe Nine keeps the kazan company and tells stories all night.
        this.ayse.setBehavior({ type: "pose", anim: "talk" });
        this.services.audio.setAmbience({ wind: 0.25, forest: 0.12, camp: 0.55 });
        break;
      case "time:dawn": {
        this.night = false;
        this.atmosphere.transition(PHASES.dawn(), instant ? 0 : 9);
        w.windowGlow.setEnabled(false);
        this.hearthIdle = { heat: 0.3, boil: 0.25 };
        const contents = w.hearth.contents.parent as TransformNode;
        contents.setEnabled(true);
        contents.position.y = 0.56;
        (w.hearth.contents.material as PBRMaterial).albedoColor = Color3.FromHexString("#efe2c2").toLinearSpace();
        this.services.audio.setAmbience({ wind: 0.3, forest: 0.45, camp: 0.3 });
        break;
      }
      case "wedding:setup":
        this.setupWedding(instant);
        break;
      case "wedding:served":
        this.services.audio.play("cheer", { volume: 1 });
        this.halil.setBehavior({ type: "pose", anim: "cheer" });
        for (const n of [...this.weddingCrowd, ...this.nightHelpers]) if (n.behavior.type === "pose" && n.behavior.anim === "sit") n.setBehavior({ type: "pose", anim: "cheer" });
        break;
    }
  }

  private spawnNightHelpers(): void {
    if (this.nightHelpers.length) return;
    const h = this.world.hearth;
    // Young men sitting in a half circle around the hearth, one plays the davul softly.
    for (let i = 0; i < 5; i++) {
      const a = h.facing + Math.PI + (i - 2) * 0.55;
      const x = h.center.x + Math.sin(a) * 4.2;
      const z = h.center.z + Math.cos(a) * 4.2;
      const n = this.spawn("villager", LOOKS.villager(i + 2), x, z, Math.atan2(h.center.x - x, h.center.z - z), { type: "pose", anim: i === 4 ? "play" : "sit" }, "Delikanlı");
      this.nightHelpers.push(n);
    }
  }

  private setupWedding(instant: boolean): void {
    const L = LAYOUT;
    const w = this.world;
    for (const n of w.wedding) n.setEnabled(true);
    this.ayse.setBehavior({ type: "pose", anim: "idle" });
    this.atmosphere.transition(PHASES.morning(), instant ? 0 : 14);
    this.currentMusic = "dugun" satisfies MusicTheme;
    if (!instant) this.services.audio.playMusic("dugun");
    this.services.audio.setAmbience({ wind: 0.25, forest: 0.3, camp: 0.6 });
    if (this.weddingCrowd.length) return;
    // Night helpers become wedding guests.
    for (const n of this.nightHelpers) n.visible = false;
    const sofras: [number, number][] = [...L.sofras, [10, -2], [-2, -13]];
    sofras.forEach(([sx, sz], si) => {
      const seats = si < L.sofras.length ? 3 : 4;
      for (let k = 0; k < seats; k++) {
        const a = (k / 6) * Math.PI * 2 + si;
        const x = sx + Math.cos(a) * 1.45;
        const z = sz + Math.sin(a) * 1.45;
        const look = k % 2 ? LOOKS.woman(si + k) : LOOKS.villager(si * 2 + k);
        this.weddingCrowd.push(this.spawn(k % 2 ? "woman" : "villager", look, x, z, Math.atan2(sx - x, sz - z), { type: "pose", anim: "sit" }, "Misafir"));
      }
    });
    // Davul & zurna by the plane tree, zeybek dancers in the middle of the square.
    this.weddingCrowd.push(this.spawn("musician", LOOKS.musician(0), L.cinar.x + 3.2, L.cinar.z - 3.6, Math.PI * 0.85, { type: "pose", anim: "play" }, "Davulcu"));
    this.weddingCrowd.push(this.spawn("musician", LOOKS.musician(1), L.cinar.x + 4.6, L.cinar.z - 2.6, Math.PI * 0.85, { type: "pose", anim: "play" }, "Zurnacı"));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const d = this.spawn("villager", { ...LOOKS.villager(i + 1), kaftan: ["#2c4a75", "#7a1f1f", "#3d5a35"][i], sash: "#d6a540" }, 1 + Math.cos(a) * 2.6, -3 + Math.sin(a) * 2.6, a + Math.PI / 2, { type: "pose", anim: "dance" }, "Zeybek");
      d.lookAtPlayer = false;
      this.weddingCrowd.push(d);
    }
    // The bride (red veil) and groom by the wedding flag.
    this.weddingCrowd.push(this.spawn("woman", { ...LOOKS.woman(0), kaftan: "#9e1a1f", hat: "yazma", hatColor: "#c8282a", sash: "#e2b84f" }, L.weddingFlag.x + 1.2, L.weddingFlag.z - 1, 2.4, { type: "pose", anim: "idle" }, "Gelin"));
    this.weddingCrowd.push(this.spawn("villager", { ...LOOKS.villager(2), kaftan: "#1f3a5a", sash: "#d6a540", hat: "turban", hatColor: "#f4efe4" }, L.weddingFlag.x + 2.4, L.weddingFlag.z - 0.2, 2.4, { type: "pose", anim: "idle" }, "Damat"));
  }

  protected carrySpec(item: string): CarrySpec {
    if (item === "sack") return { parts: heldSack(), position: [0.0, -0.02, -0.05], rotation: [0.2, 0.3, 0] };
    return { parts: keskekBowl(), position: [-0.22, 0.04, 0.05], rotation: [0.25, 0, 0] };
  }

  override onTargetDone(targetId: string): void {
    const { audio, ui } = this.services;
    const [anchor, n] = targetId.split(":");
    if (anchor === "dibek" && n) {
      this.world.dibek.sacks[Number(n) - 1]?.setEnabled(true);
      audio.play("drop", { volume: 0.5 });
      return;
    }
    if (anchor.startsWith("sofra_")) {
      const idx = Number(anchor.split("_")[1]) - 1;
      this.world.servedBowls[idx]?.setEnabled(true);
      audio.play("cheer", { volume: 0.4 });
      return;
    }
    const items: Record<string, string> = {
      kasap: "Kasap Mustafa: Al evladım, en güzel kemikli kuzu eti. Düğün hayrına!",
      cesme: "İki bakraç buz gibi çeşme suyu doldurdun.",
      bakkal: "Bakkal Rıza: Tuzun, tereyağın hazır. Afiyet olsun şimdiden!",
    };
    if (items[targetId]) {
      ui.hud.toast(items[targetId], "info", 4200);
      audio.play(targetId === "cesme" ? "splash" : "pickup", { volume: targetId === "cesme" ? 0.3 : 0.7, pitch: targetId === "cesme" ? 1.5 : 1 });
    }
  }

  // ===================================================================== ending
  protected async showEnding(): Promise<void> {
    const c = new Vector3(0, this.world.terrain.heightAt(0, 0) + 2, -2);
    this.beginEndingOrbit(c, 24, 8, -1.2);
    await wait(3500);
    this.services.ui.modal.show(
      "",
      `<div class="ending"><div class="e-date">MENTEŞE · DÜĞÜN SABAHI</div><h1>KEŞKEK DOĞDU</h1>
       <div class="ornament-line"></div>
       <p>Buğdayı dibekte dövdün, çamlıktan odun taşıdın, ocağı harladın ve kazanı bütün gece karıştırdın.
       Ayşe Nine'nin fikriyle bir kazan bütün köyü, yaylayı ve yolcuları doyurdu.</p>
       <p style="font-size:13px">Keşkek; dövülmüş buğday ve etin uzun saatler birlikte pişirilip dövülerek kıvamlandırıldığı, Anadolu'da düğün ve bayramların imece yemeğidir.
       "Keşkek Geleneği" 2011'de UNESCO İnsanlığın Somut Olmayan Kültürel Mirası Temsili Listesi'ne alınmıştır.</p>
       <p style="font-size:12px;color:var(--ink-faint)">Bu bölümdeki hikâye, keşkeğin köy düğünlerindeki yerini anlatan kurgusal bir rivayettir.</p>
       <p style="font-size:12px">Bu oturumda oynama süresi: ~${this.playMinutes()} dk · 8/8 görev tamamlandı</p></div>`,
      this.endingButtons(),
    );
  }

  override dispose(): void {
    this.games.clear();
    super.dispose();
  }
}
