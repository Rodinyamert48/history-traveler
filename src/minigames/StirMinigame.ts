import { Color3, Color4, Vector3, type PBRMaterial, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { angleDelta, clamp, damp, lerp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.stir;
const RAW = Color3.FromHexString("#9a8a62").toLinearSpace();
const CREAMY = Color3.FromHexString("#efe2c2").toLinearSpace();

export interface StirMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  /** Where the player stands (in front of the hearth) and the yaw toward the kazan. */
  front: Vector3;
  facing: number;
  /** Centre of the cauldron's surface. */
  surface: Vector3;
  /** Node holding the long paddle (blade at its origin, handle along +y). */
  paddle: TransformNode;
  contents: TransformNode;
  contentsMaterial: PBRMaterial;
  /** Lines from Ayşe Nine at 25 / 50 / 75 %. */
  onMilestone(step: 1 | 2 | 3): void;
}

/**
 * MINIGAME — "Gece Boyu Karıştır".
 * Keşkek cooks all night and must be stirred without pause. Draw circles with the mouse
 * (or alternate A / D, or drag circles on a touch screen) to turn the long paddle. Inside the
 * ideal speed band the wheat and meat melt into a smooth paste; too slow and it catches on
 * the bottom, too fast and it splashes out of the kazan.
 */
export class StirMinigame extends BaseMinigame {
  private cursor = { x: 1, y: 0 };
  private angle = 0;
  private omega = 0;
  private keyPush = 0;
  private lastKey: "left" | "right" | null = null;
  private progress = 0;
  private burn = 0;
  private slowTime = 0;
  private milestone = 0;
  private stirSoundAcc = 0;
  private done = 0;
  private bar!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private ascii!: HTMLDivElement;
  private burnFill!: HTMLDivElement;
  private speedFill!: HTMLDivElement;
  private status!: HTMLDivElement;
  private feedback!: HTMLDivElement;
  private dial!: HTMLDivElement;
  private dialDot!: HTMLDivElement;

  constructor(private readonly d: StirMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, front, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    player.position.set(front.x, front.y, front.z);
    player.yaw = facing;
    player.pitch = 0.72;
    this.d.paddle.setEnabled(true);
    this.d.contents.setEnabled(true);
    mobile.setActionButtons([{ label: "BIRAK", action: "action" }]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.d.input.consumeLook();
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback", u);
    this.dial = el("div", "stir-dial", u);
    el("div", "stir-ring", this.dial);
    this.dialDot = el("div", "stir-dot", this.dial);
    el("div", "stir-label", this.dial, this.d.input.isTouch ? "Daire çiz" : "Fareyle daire çiz");
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "GECE BOYU KARIŞTIR");
    this.pct = el("span", "mg-value", row, "0%");
    el("div", "hud-label", panel, "KIVAM");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill keskek", bar);
    el("div", "mg-bar-ticks", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    el("div", "hud-label", panel, "KARIŞTIRMA HIZI");
    const speed = el("div", "mg-bar thin", panel);
    const maxRps = CFG.maxRps * 1.6;
    const band = el("div", "mg-band", speed);
    band.style.left = `${(CFG.minRps / maxRps) * 100}%`;
    band.style.width = `${((CFG.maxRps - CFG.minRps) / maxRps) * 100}%`;
    this.speedFill = el("div", "mg-marker", speed);
    el("div", "hud-label", panel, "DİBİ TUTMA");
    const burn = el("div", "mg-bar thin", panel);
    this.burnFill = el("div", "mg-bar-fill fire", burn);
    this.status = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch ? "Ekranda parmağınla daireler çiz · BIRAK: çık" : "Fareyle daireler çiz (veya A / D'ye sırayla bas) · F: bırak",
    );
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  protected update(dt: number): void {
    const { input, player, audio, fx } = this.d;
    if (this.done) {
      this.done += dt;
      this.omega = lerp(this.omega, 1.5, damp(2, dt));
      this.angle += this.omega * dt;
      this.animate();
      player.syncCamera(dt, 0);
      if (this.done > 2) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    // Mouse / touch: a virtual cursor orbiting the dial; its angular motion turns the paddle.
    const look = input.consumeLook();
    this.cursor.x += look.x * 0.012;
    this.cursor.y += look.y * 0.012;
    const len = Math.hypot(this.cursor.x, this.cursor.y);
    if (len > 1) {
      this.cursor.x /= len;
      this.cursor.y /= len;
    }
    let target = 0;
    if (len > 0.35) {
      const a = Math.atan2(this.cursor.y, this.cursor.x);
      const prev = this.cursorAngle;
      this.cursorAngle = a;
      if (prev !== null) target = Math.abs(angleDelta(prev, a)) / Math.max(dt, 1 / 240);
    } else this.cursorAngle = null;
    // Keyboard: alternating A / D pushes the paddle round.
    const left = input.wasPressed("left");
    const right = input.wasPressed("right");
    if ((left && this.lastKey !== "left") || (right && this.lastKey !== "right")) {
      this.keyPush = Math.min(this.keyPush + 2.6, 9);
      this.lastKey = left ? "left" : "right";
    }
    this.keyPush = Math.max(0, this.keyPush - dt * 5);
    target = Math.max(target, this.keyPush);
    // Thick paste: speed follows the input with some inertia.
    this.omega = lerp(this.omega, clamp(target, 0, 14), damp(target > this.omega ? 4 : 1.6, dt));
    this.angle += this.omega * dt;

    const rps = this.omega / (Math.PI * 2);
    const inBand = rps >= CFG.minRps && rps <= CFG.maxRps;
    if (inBand) {
      this.progress = Math.min(100, this.progress + CFG.progressPerSecond * dt);
      this.burn = Math.max(0, this.burn - dt * 6);
      this.slowTime = 0;
    } else if (rps < CFG.minRps) {
      this.slowTime += dt;
      if (this.slowTime > 1.5) this.burn += CFG.burnPerSecond * dt;
    } else {
      this.progress = Math.max(0, this.progress - CFG.splashLossPerSecond * dt);
      if (Math.random() < dt * 4) {
        fx.dustPuff(this.d.surface.add(new Vector3(0, 0.1, 0)), 3, new Color4(0.95, 0.9, 0.78, 0.7));
        audio.play("stir", { volume: 0.4, pitch: 1.4 });
      }
    }
    if (this.burn >= 100) {
      this.burn = 0;
      this.progress = Math.max(0, this.progress - CFG.burnPenalty);
      this.showFeedback("DİBİ TUTTU! Ayşe Nine kazıdı", "#e2655a");
      audio.play("sizzle", { volume: 0.7 });
      this.d.camFx.addTrauma(0.15);
    }
    // Paddle swish sound paced by the rotation.
    this.stirSoundAcc += this.omega * dt;
    if (this.stirSoundAcc > Math.PI) {
      this.stirSoundAcc = 0;
      audio.play("stir", { volume: 0.55 });
    }
    // Milestones.
    const step = Math.floor(this.progress / 25);
    if (step > this.milestone && step <= 3) {
      this.milestone = step;
      this.d.onMilestone(step as 1 | 2 | 3);
    }
    if (this.progress >= 100) {
      this.done = 0.001;
      this.showFeedback("KEŞKEK KIVAMINI BULDU!", "#9fd26b");
      audio.play("cheer", { volume: 0.7 });
      audio.play("objective", { volume: 0.8 });
    }
    this.animate();
    player.setShake(this.d.camFx.update(dt));
    player.syncCamera(dt, 0);
    this.updateUi(rps, inBand);
  }

  private cursorAngle: number | null = null;

  private animate(): void {
    const s = this.d.surface;
    const r = 0.42;
    const p = this.d.paddle;
    p.position.set(s.x + Math.cos(this.angle) * r, s.y - 0.12, s.z + Math.sin(this.angle) * r);
    // Lean the handle back toward the cook.
    p.rotation.set(0, 0, 0);
    const toPlayer = new Vector3(this.d.front.x - p.position.x, 0, this.d.front.z - p.position.z).normalize();
    p.rotation.x = toPlayer.z * 0.5;
    p.rotation.z = -toPlayer.x * 0.5;
    p.rotation.y = -this.angle;
    const k = this.progress / 100;
    this.d.contents.rotation.y = -this.angle * 0.35;
    this.d.contents.position.y = 0.48 + k * 0.08;
    this.d.contentsMaterial.albedoColor = Color3.Lerp(RAW, CREAMY, k);
    this.d.contents.scaling.setAll(1 + k * 0.04);
  }

  private updateUi(rps: number, inBand: boolean): void {
    const k = this.progress / 100;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.pct, `${Math.round(this.progress)}%`);
    setText(this.ascii, asciiBar(k));
    this.burnFill.style.width = `${clamp(this.burn, 0, 100).toFixed(1)}%`;
    this.speedFill.style.left = `${clamp((rps / (CFG.maxRps * 1.6)) * 100, 0, 100).toFixed(1)}%`;
    this.dialDot.style.transform = `translate(${(this.cursor.x * 46).toFixed(1)}px, ${(this.cursor.y * 46).toFixed(1)}px)`;
    const state = inBand
      ? `<b style="color:var(--good)">Güzel, böyle devam</b>`
      : rps < CFG.minRps
        ? `<b style="color:var(--warn)">Çok yavaş — dibi tutacak!</b>`
        : `<b style="color:var(--bad)">Çok hızlı — taşırıyorsun!</b>`;
    this.status.innerHTML = `Durum: ${state}`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    player.pitch = 0.1;
    this.d.paddle.setEnabled(false);
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }
}
