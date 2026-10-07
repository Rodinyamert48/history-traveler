import { Color3, PBRMaterial, TransformNode, Vector3, type InstancedMesh, type Scene } from "@babylonjs/core";
import { GeoBuilder } from "../assets/GeoBuilder";
import type { PrefabLibrary } from "../assets/PrefabLibrary";
import { branchBundle, ciraChunk } from "../assets/PrefabsMugla";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { RenderPipeline } from "../rendering/RenderPipeline";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { Modal } from "../ui/Modals";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { formatTime } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.forest;

export interface ForestMinigameDeps {
  layer: HTMLElement;
  scene: Scene;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  modal: Modal;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  prefabs: PrefabLibrary;
  pipeline: RenderPipeline;
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
  groundAt(x: number, z: number): number;
  /** True when a point is free of colliders and walkable. */
  isFree(x: number, z: number): boolean;
}

interface Pickup {
  kind: "dal" | "cira";
  position: Vector3;
  node: TransformNode;
  beacon: InstancedMesh;
  taken: boolean;
}

/**
 * MINIGAME — "Çam Ormanında Odun".
 * Free-roam gathering in the pine forest: dry branch bundles for the all-night fire and
 * resinous çıra (pine kindling) to light it. Golden light beams mark the pickups; every
 * bundle on your back slows you a little. Time runs out only to offer more time.
 */
export class ForestGatherMinigame extends BaseMinigame {
  override readonly freeRoam = true;
  private pickups: Pickup[] = [];
  private timeLeft: number = CFG.duration;
  private timeoutOpen = false;
  private doneTimer = 0;
  private panelCount!: HTMLDivElement;
  private timer!: HTMLElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: ForestMinigameDeps) {
    super(d.layer);
  }

  private count(kind: Pickup["kind"]): number {
    return this.pickups.filter((p) => p.kind === kind && p.taken).length;
  }

  private get collected(): number {
    return this.pickups.filter((p) => p.taken).length;
  }

  override objectiveText(): string {
    return `Kuru dal ${this.count("dal")}/${CFG.branches} · Çıra ${this.count("cira")}/${CFG.cira}`;
  }

  override waypoint(): Vector3 | null {
    const me = this.d.player.position;
    let best: Pickup | null = null;
    let bestD = Infinity;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const dd = Math.hypot(p.position.x - me.x, p.position.z - me.z);
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    return best?.position ?? null;
  }

  protected onStart(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    this.timeLeft = CFG.duration;
    if (!this.pickups.length) this.spawnPickups();
    // A retry keeps what was already gathered.
    for (const p of this.pickups) {
      p.node.setEnabled(!p.taken);
      p.beacon.setEnabled(!p.taken);
    }
    player.speedMultiplier = Math.max(CFG.minSpeed, 1 - this.collected * CFG.weightPerItem);
    this.buildUi();
    hud.toast("Altın ışıklar kuru dalları ve çırayı gösteriyor. Yaklaş ve E ile topla.", "info", 5000);
  }

  private spawnPickups(): void {
    const { scene, prefabs, zone, groundAt, isFree, pipeline } = this.d;
    const rnd = new Random(88);
    const mat = new PBRMaterial("forest-beacon", scene);
    mat.albedoColor = Color3.Black();
    mat.emissiveColor = Color3.FromHexString("#ffcf6a").toLinearSpace();
    mat.emissiveIntensity = 1.2;
    mat.disableLighting = true;
    mat.alpha = 0.35;
    mat.backFaceCulling = false;
    const b = new GeoBuilder();
    b.cylinder(0, 0, 0, 0.18, 0.04, 3.2, { segments: 6, caps: false, color: [1, 1, 1, 1] });
    const beaconSrc = b.toMesh("forest-beacon-src", scene);
    beaconSrc.material = mat;
    beaconSrc.isPickable = false;
    beaconSrc.isVisible = false;
    pipeline.glowLayer?.addIncludedOnlyMesh(beaconSrc);
    const kinds: Pickup["kind"][] = [...Array<Pickup["kind"]>(CFG.branches).fill("dal"), ...Array<Pickup["kind"]>(CFG.cira).fill("cira")];
    let guard = 0;
    for (const kind of kinds) {
      let x = 0;
      let z = 0;
      do {
        x = rnd.range(zone.minX, zone.maxX);
        z = rnd.range(zone.minZ, zone.maxZ);
        guard++;
      } while (guard < 4000 && (!isFree(x, z) || this.pickups.some((p) => Math.hypot(p.position.x - x, p.position.z - z) < 9)));
      const y = groundAt(x, z);
      const node = new TransformNode(`pickup-${kind}-${this.pickups.length}`, scene);
      node.position.set(x, y + 0.02, z);
      node.rotation.y = rnd.range(0, Math.PI * 2);
      prefabs.buildUnique(`pickup-${kind}`, kind === "dal" ? branchBundle() : ciraChunk(), node);
      const beacon = beaconSrc.createInstance(`beacon-${this.pickups.length}`);
      beacon.position.set(x, y, z);
      beacon.isPickable = false;
      this.pickups.push({ kind, position: new Vector3(x, y, z), node, beacon, taken: false });
    }
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback", u);
    const panel = el("div", "mg-panel compact", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "ÇAM ORMANINDA ODUN");
    this.timer = el("div", "mg-value", row, "2:30");
    this.panelCount = el("div", "mg-stats", panel);
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill wood", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    el("div", "hint-line", panel, "Kuru dallar ateşi bütün gece besler, çıra ise tutuşturur.");
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  protected update(dt: number): void {
    const { input, player, hud } = this.d;
    if (this.timeoutOpen) return;
    player.update(dt);
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.beacon.rotation.y += dt * 0.8;
      p.node.position.y = p.position.y + 0.02 + Math.max(0, Math.sin(this.elapsed * 3 + p.position.x)) * 0.04;
    }
    if (this.doneTimer > 0) {
      this.doneTimer += dt;
      hud.setInteraction(null);
      if (this.doneTimer > 1.2) this.finish(true);
      return;
    }
    // Nearest pickup in reach.
    let near: Pickup | null = null;
    let nearD: number = CFG.pickRadius;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const dd = Math.hypot(p.position.x - player.position.x, p.position.z - player.position.z);
      if (dd < nearD) {
        nearD = dd;
        near = p;
      }
    }
    hud.setInteraction(near ? { key: "E", text: near.kind === "dal" ? "Kuru dalları topla" : "Çırayı al" } : null);
    hud.setCrosshair(true, !!near);
    if (near && input.wasPressed("interact")) this.take(near);

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.onTimeout();
      return;
    }
    this.updateUi();
  }

  private take(p: Pickup): void {
    const { audio, fx, player } = this.d;
    p.taken = true;
    p.node.setEnabled(false);
    p.beacon.setEnabled(false);
    audio.play(p.kind === "dal" ? "branchSnap" : "pickup", { volume: 0.8 });
    fx.dustPuff(p.position.add(new Vector3(0, 0.2, 0)), 4);
    player.speedMultiplier = Math.max(CFG.minSpeed, 1 - this.collected * CFG.weightPerItem);
    this.showFeedback(p.kind === "dal" ? "+ KURU DAL" : "+ ÇIRA", p.kind === "dal" ? "#f3ead8" : "#ffcf6a");
    this.d.hud.setObjective(this.objectiveText(), true);
    if (this.collected >= this.pickups.length) {
      this.doneTimer = 0.001;
      this.showFeedback("SIRTIN DOLDU!", "#9fd26b");
      audio.play("objective", { volume: 0.8 });
    }
  }

  private onTimeout(): void {
    this.timeoutOpen = true;
    this.d.player.lookEnabled = false;
    this.d.modal.show(
      "HAVA KARARIYOR",
      `<p>Daha ${this.pickups.length - this.collected} demet eksik. Güneş batmadan biraz daha toplayabilirsin.</p>`,
      [
        {
          label: `Devam Et (+${CFG.extraTime} sn)`,
          primary: true,
          onClick: () => {
            this.d.modal.hide();
            this.timeLeft = CFG.extraTime;
            this.timeoutOpen = false;
            this.d.player.lookEnabled = true;
          },
        },
        {
          label: "Vazgeç",
          onClick: () => {
            this.d.modal.hide();
            this.timeoutOpen = false;
            this.finish(false);
          },
        },
      ],
    );
    this.d.input.exitPointerLock();
  }

  private updateUi(): void {
    const total = this.pickups.length;
    const frac = total ? this.collected / total : 0;
    this.bar.style.width = `${(frac * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(frac));
    setText(this.timer, formatTime(Math.max(0, this.timeLeft)));
    this.timer.style.color = this.timeLeft < 20 ? "#e2655a" : "";
    this.panelCount.innerHTML = `Kuru dal: <b>${this.count("dal")}/${CFG.branches}</b> · Çıra: <b>${this.count("cira")}/${CFG.cira}</b> · Yük: <b>${Math.round((1 - this.d.player.speedMultiplier) * 100)}%</b>`;
  }

  protected onEnd(success: boolean): void {
    const { player, hud } = this.d;
    player.speedMultiplier = 1;
    hud.setInteraction(null);
    // Beacons only guide an active search; leftover bundles stay on the forest floor.
    for (const p of this.pickups) {
      p.beacon.setEnabled(false);
      if (success) p.node.setEnabled(false);
    }
  }
}
