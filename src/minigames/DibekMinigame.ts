import { Color4, Vector3, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.dibek;

export interface DibekMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  /** Ground centre of the stone mortar and the height of its rim. */
  center: Vector3;
  rimY: number;
  wheat: TransformNode;
  partner: NPC;
  /** First-person mallet (child of the player's hand node). */
  mallet: TransformNode;
}

type Grade = "perfect" | "good" | "early" | "late" | "clash" | "spam";

/**
 * MINIGAME — "Dibekte Buğday Dövme".
 * Two people hull the wheat in a stone mortar with heavy wooden mallets, striking in turn.
 * Hasan Emmi strikes on the even beats; the player must strike on the odd beats in between.
 * Striking on his beat makes the mallets clash (combo lost, a little progress lost); a missed
 * beat costs nothing but time. The tempo rises slowly as the wheat softens.
 */
export class DibekMinigame extends BaseMinigame {
  private progress = 0;
  private combo = 0;
  private bestCombo = 0;
  /** Beat position (in beats); advanced by dt / interval so tempo changes never jump the phase. */
  private pos = 0;
  private beat = -1;
  private lastScored = -1;
  private swing = 0;
  private partnerSwing = 0;
  private done = 0;
  private bar!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private ascii!: HTMLDivElement;
  private comboEl!: HTMLElement;
  private turnEl!: HTMLDivElement;
  private ring!: HTMLDivElement;
  private target!: HTMLDivElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: DibekMinigameDeps) {
    super(d.layer);
  }

  /** Current beat interval: speeds up from `startInterval` to `endInterval` with progress. */
  private get interval(): number {
    return lerp(CFG.startInterval, CFG.endInterval, this.progress / 100);
  }

  protected onStart(): void {
    const { player, mobile, hud, partner, center } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    // Stand across the mortar from Hasan Emmi.
    const dx = partner.position.x - center.x;
    const dz = partner.position.z - center.z;
    const len = Math.hypot(dx, dz) || 1;
    player.position.set(center.x - (dx / len) * 1.45, center.y, center.z - (dz / len) * 1.45);
    player.yaw = Math.atan2(dx, dz);
    player.pitch = 0.38;
    player.yawLimit = { center: player.yaw, range: 0.7 };
    player.pitchLimit = { min: 0.05, max: 0.75 };
    partner.setBehavior({ type: "scripted" });
    partner.heading = Math.atan2(-dx, -dz);
    partner.anim = "pound";
    partner.lookAtPlayer = false;
    partner.applyTransform();
    this.d.mallet.setEnabled(true);
    this.d.wheat.setEnabled(true);
    mobile.setActionButtons([
      { label: "VUR", action: "jump" },
      { label: "BIRAK", action: "action" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    const rhythm = el("div", "rhythm high", u);
    this.target = el("div", "rhythm-target", rhythm);
    this.ring = el("div", "rhythm-ring", rhythm);
    el("div", "rhythm-key", rhythm, this.d.input.isTouch ? "VUR" : "SPACE");
    this.turnEl = el("div", "dibek-turn", u);
    this.feedback = el("div", "rhythm-feedback high", u);
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "DİBEKTE BUĞDAY DÖVME");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill wheat", bar);
    el("div", "mg-bar-ticks", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    const stats = el("div", "mg-stats", panel);
    this.comboEl = el("span", "", stats, "Kombo: <b>0</b>");
    el("span", "", stats, this.d.input.isTouch ? "VUR → tokmak · BIRAK → çık" : "SPACE / Sol tık → tokmak · F → bırak");
    el("div", "hint-line", panel, "Hasan Emmi vurunca tokmağını kaldır; halka çembere oturunca sen vur. Aynı anda vurursanız tokmaklar çarpışır!");
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  /** Player beats are the odd ones; grade against the nearest of them. */
  private grade(): Grade {
    const I = this.interval;
    const pos = this.pos;
    const nearestOdd = Math.round((pos - 1) / 2) * 2 + 1;
    const nearestEven = Math.round(pos / 2) * 2;
    const offOdd = (pos - nearestOdd) * I;
    const offEven = (pos - nearestEven) * I;
    if (Math.abs(offEven) < CFG.clashWindow && Math.abs(offEven) < Math.abs(offOdd)) return "clash";
    if (nearestOdd === this.lastScored) return "spam";
    this.lastScored = nearestOdd;
    const a = Math.abs(offOdd);
    if (a <= CFG.perfectWindow) return "perfect";
    if (a <= CFG.goodWindow) return "good";
    return offOdd < 0 ? "early" : "late";
  }

  private strike(): void {
    const { audio, fx, camFx } = this.d;
    this.swing = 1;
    const g = this.grade();
    const top = new Vector3(this.d.center.x, this.d.rimY, this.d.center.z);
    let gain = 0;
    switch (g) {
      case "perfect":
        this.combo++;
        gain = CFG.perfectGain * (1 + Math.min(0.5, this.combo * 0.04));
        this.showFeedback(this.combo >= 3 ? `MÜKEMMEL! x${this.combo}` : "MÜKEMMEL!", "#ffd36a");
        audio.play("pound", { volume: 0.9 });
        audio.play("perfect", { volume: 0.4 });
        break;
      case "good":
        this.combo++;
        gain = CFG.goodGain;
        this.showFeedback("İYİ", "#f3ead8");
        audio.play("pound", { volume: 0.8 });
        break;
      case "early":
      case "late":
        this.combo = 0;
        gain = CFG.weakGain;
        this.showFeedback(g === "early" ? "ERKEN" : "GEÇ", "#f0b54a");
        audio.play("pound", { volume: 0.55, pitch: 1.1 });
        break;
      case "clash":
        this.combo = 0;
        gain = -CFG.clashPenalty;
        this.showFeedback("TOKMAKLAR ÇARPIŞTI!", "#e2655a");
        audio.play("woodClash", { volume: 0.9 });
        camFx.addTrauma(0.25);
        break;
      default:
        this.showFeedback("ACELE ETME", "#e2655a");
        return;
    }
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.progress = clamp(this.progress + gain, 0, 100);
    if (gain > 0) {
      fx.dustPuff(top, 5, new Color4(0.93, 0.84, 0.6, 0.55));
      camFx.addTrauma(g === "perfect" ? 0.12 : 0.07);
    }
  }

  protected update(dt: number): void {
    const { input, player, partner, audio } = this.d;
    if (this.done) {
      this.done += dt;
      this.pos += dt / this.interval;
      this.animate(dt);
      player.syncCamera(dt, 0);
      if (this.done > 1.6) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    this.pos += dt / this.interval;
    const idx = Math.floor(this.pos);
    if (idx !== this.beat) {
      this.beat = idx;
      if (idx % 2 === 0) {
        // Hasan Emmi's strike lands.
        audio.play("pound", { volume: 0.7, pitch: 0.92 });
        this.d.fx.dustPuff(new Vector3(this.d.center.x, this.d.rimY, this.d.center.z), 3, new Color4(0.93, 0.84, 0.6, 0.45));
      } else {
        // The player's beat: pulse the target ring.
        this.target.animate([{ transform: "translate(-50%,-50%) scale(1.25)" }, { transform: "translate(-50%,-50%) scale(1)" }], { duration: 180 });
      }
    }
    if (input.wasPressed("jump") || input.wasPressed("fire")) this.strike();
    if (this.progress >= 100) {
      this.done = 0.001;
      this.showFeedback("BUĞDAY DÖVÜLDÜ!", "#9fd26b");
      audio.play("cheer", { volume: 0.6 });
      partner.anim = "cheer";
    }
    this.animate(dt);
    player.updateLook();
    player.setShake(this.d.camFx.update(dt));
    player.syncCamera(dt, 0);
    this.updateUi();
  }

  private animate(dt: number): void {
    // Partner swing: strike lands exactly on even beats, mallet raised on odd beats.
    const phase = this.pos % 2; // 0 = his strike, 1 = player's strike
    const k = phase < 1 ? phase : 2 - phase;
    this.partnerSwing = this.done ? 0 : 1 - k;
    this.d.partner.strike = clamp(this.partnerSwing * 1.15 - 0.1, 0, 1) ** 0.6;
    // Player mallet: snaps down on a strike, then lifts back up.
    this.swing = Math.max(0, this.swing - dt * 4.5);
    const s = this.swing > 0.7 ? (1 - this.swing) / 0.3 : this.swing / 0.7;
    // Held low on the right: raised, the head leaves the top of the view; struck, it swings
    // forward and down into the mortar.
    const m = this.d.mallet;
    const swing = clamp(s, 0, 1);
    m.rotation.x = lerp(-0.25, 1.55, swing);
    m.rotation.z = 0.35;
    m.position.y = lerp(-0.2, -0.32, swing);
    // The wheat level settles as it is hulled.
    this.d.wheat.position.y = this.d.rimY - 0.24 + (1 - this.progress / 100) * 0.12;
  }

  private updateUi(): void {
    const prog = this.progress / 100;
    this.bar.style.width = `${(prog * 100).toFixed(1)}%`;
    setText(this.pct, `${Math.round(prog * 100)}%`);
    setText(this.ascii, asciiBar(prog));
    this.comboEl.innerHTML = `Kombo: <b>${this.combo}</b> · En iyi: <b>${this.bestCombo}</b>`;
    const I = this.interval;
    const pos = this.pos;
    // Ring closes on the next odd (player) beat.
    const nextOdd = Math.floor((pos - 1) / 2) * 2 + 3;
    const toNext = (nextOdd - pos) * I;
    const span = 2 * I;
    const scale = 1 + 1.7 * clamp(toNext / span, 0, 1);
    this.ring.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
    this.ring.style.opacity = String(clamp(1.25 - toNext / span, 0.15, 1));
    const yourTurn = toNext < I * 0.55;
    setText(this.turnEl, yourTurn ? "SIRA SENDE — VUR!" : "HASAN EMMİ VURUYOR…");
    this.turnEl.classList.toggle("yours", yourTurn);
  }

  protected onEnd(success: boolean): void {
    const { player, mobile, hud, partner } = this.d;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    this.d.mallet.setEnabled(false);
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    partner.strike = 0;
    partner.setBehavior({ type: "pose", anim: success ? "cheer" : "idle" });
    partner.lookAtPlayer = true;
  }
}
