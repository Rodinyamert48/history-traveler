import { Color4, Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.lamps;

export interface LampTarget {
  position: Vector3;
  lit: boolean;
  light(): void;
}

export interface LampMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  lamps: LampTarget[];
  onProgress(lit: number): void;
}

/**
 * MINIGAME — "Gaz Lambaları".
 * The hall is dim; walk under each hanging lamp and light it with the long wick pole. A needle
 * sweeps across the wick gauge: stop it inside the golden zone (E / SPACE / click) for a clean
 * flame. Too low and it goes out, too high and the chimney soots up — try again.
 */
export class LampMinigame extends BaseMinigame {
  override readonly freeRoam = true;
  private gaugeFor: LampTarget | null = null;
  private needle = 0;
  private needleDir = 1;
  private zone = { a: 0.45, b: 0.61 };
  private rnd = new Random(1920);
  private doneTimer = 0;
  private gauge!: HTMLDivElement;
  private gaugeNeedle!: HTMLDivElement;
  private gaugeZone!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private count!: HTMLDivElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: LampMinigameDeps) {
    super(d.layer);
  }

  private get litCount(): number {
    return this.d.lamps.filter((l) => l.lit).length;
  }

  override objectiveText(): string {
    return `Gaz lambalarını yak (${this.litCount}/${this.d.lamps.length})`;
  }

  override waypoint(): Vector3 | null {
    const me = this.d.player.position;
    let best: LampTarget | null = null;
    let bestD = Infinity;
    for (const l of this.d.lamps) {
      if (l.lit) continue;
      const dd = Math.hypot(l.position.x - me.x, l.position.z - me.z);
      if (dd < bestD) {
        bestD = dd;
        best = l;
      }
    }
    return best ? new Vector3(best.position.x, 0, best.position.z) : null;
  }

  protected onStart(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    this.buildUi();
    hud.toast("Lambanın altına geç ve E ile fitili yak. İbre altın bölgedeyken bas.", "info", 5000);
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high", u);
    this.gauge = el("div", "wick-gauge hidden", u);
    el("div", "wg-label", this.gauge, "FİTİL");
    const track = el("div", "wg-track", this.gauge);
    this.gaugeZone = el("div", "wg-zone", track);
    this.gaugeNeedle = el("div", "wg-needle", track);
    el("div", "wg-hint", this.gauge, this.d.input.isTouch ? "E: fitili bırak" : "E / SPACE / Sol tık: fitili bırak");
    const panel = el("div", "mg-panel compact", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "GAZ LAMBALARI");
    this.count = el("div", "mg-value", row, "0/8");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill fire", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    el("div", "hint-line", panel, "Salon loş; mebuslar gelmeden bütün lambalar yanmalı.");
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private openGauge(lamp: LampTarget): void {
    this.gaugeFor = lamp;
    this.needle = 0;
    this.needleDir = 1;
    const w = CFG.zoneWidth - this.litCount * 0.008;
    const a = this.rnd.range(0.25, 0.85 - w);
    this.zone = { a, b: a + w };
    this.gaugeZone.style.left = `${(a * 100).toFixed(1)}%`;
    this.gaugeZone.style.width = `${(w * 100).toFixed(1)}%`;
    this.gauge.classList.remove("hidden");
    this.d.player.controlEnabled = false;
    this.d.audio.play("pickup", { volume: 0.4 });
  }

  private closeGauge(): void {
    this.gaugeFor = null;
    this.gauge.classList.add("hidden");
    this.d.player.controlEnabled = true;
  }

  private release(): void {
    const lamp = this.gaugeFor!;
    const { audio, fx } = this.d;
    if (this.needle >= this.zone.a && this.needle <= this.zone.b) {
      lamp.light();
      lamp.lit = true;
      audio.play("lampLight", { volume: 0.8 });
      this.showFeedback("LAMBA YANDI", "#ffd36a");
      this.d.onProgress(this.litCount);
      if (this.litCount >= this.d.lamps.length) {
        this.doneTimer = 0.001;
        this.showFeedback("SALON AYDINLANDI!", "#9fd26b");
        audio.play("objective", { volume: 0.8 });
      }
    } else if (this.needle < this.zone.a) {
      this.showFeedback("FİTİL SÖNDÜ", "#f0b54a");
      audio.play("miss", { volume: 0.5 });
    } else {
      this.showFeedback("İS YAPTI! TEKRAR DENE", "#e2655a");
      audio.play("sizzle", { volume: 0.4 });
      fx.dustPuff(lamp.position.add(new Vector3(0, 0.3, 0)), 4, new Color4(0.15, 0.13, 0.12, 0.55));
    }
    this.closeGauge();
  }

  protected update(dt: number): void {
    const { input, player, hud } = this.d;
    if (this.doneTimer > 0) {
      this.doneTimer += dt;
      player.update(dt);
      hud.setInteraction(null);
      if (this.doneTimer > 1.4) this.finish(true);
      return;
    }
    if (this.gaugeFor) {
      const speed = CFG.sweepSpeed + this.litCount * CFG.sweepGain;
      this.needle += this.needleDir * speed * dt;
      if (this.needle >= 1) {
        this.needle = 1;
        this.needleDir = -1;
      } else if (this.needle <= 0) {
        this.needle = 0;
        this.needleDir = 1;
      }
      this.gaugeNeedle.style.left = `${(this.needle * 100).toFixed(1)}%`;
      player.updateLook();
      player.syncCamera(dt, 0);
      hud.setInteraction(null);
      if (input.wasPressed("interact") || input.wasPressed("jump") || input.wasPressed("fire")) this.release();
      this.updateUi();
      return;
    }
    player.update(dt);
    let near: LampTarget | null = null;
    let nearD: number = CFG.reach;
    for (const l of this.d.lamps) {
      if (l.lit) continue;
      const dd = Math.hypot(l.position.x - player.position.x, l.position.z - player.position.z);
      if (dd < nearD) {
        nearD = dd;
        near = l;
      }
    }
    hud.setInteraction(near ? { key: "E", text: "Lambayı yak" } : null);
    hud.setCrosshair(true, !!near);
    if (near && input.wasPressed("interact")) this.openGauge(near);
    this.updateUi();
  }

  private updateUi(): void {
    const n = this.d.lamps.length;
    const lit = this.litCount;
    this.bar.style.width = `${((lit / n) * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(lit / n));
    setText(this.count, `${lit}/${n}`);
  }

  protected onEnd(): void {
    this.closeGauge();
    this.d.hud.setInteraction(null);
  }
}
