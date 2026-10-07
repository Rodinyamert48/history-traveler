import { Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.fire;

/** What the fire minigame drives on the hearth (implemented by the scene). */
export interface HearthControl {
  front: Vector3;
  /** Yaw looking from the front into the hearth. */
  facing: number;
  center: Vector3;
  /** 0..1 fire strength → flames, light, particles; 0..1 boil → steam & bubbles. */
  setFire(heat01: number, boil01: number): void;
}

export interface FireMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  hearth: HearthControl;
}

/**
 * MINIGAME — "Ocağı Harla".
 * Bring the big copper cauldron to a steady boil. Heat follows the fuel in the hearth: logs
 * (E) feed it slowly, the bellows (SPACE) give a quick boost, pulling embers (Q) cools it.
 * Boiling only advances while the heat is inside the golden band; too much heat makes the
 * kazan boil over and lose progress. Evening gusts of wind knock the fire down.
 */
export class FireMinigame extends BaseMinigame {
  private heat: number = CFG.startHeat;
  private fuel: number = CFG.startFuel;
  private boost = 0;
  private boil = 0;
  private logCooldown = 0;
  private gustTimer = 14;
  private gust = 0;
  private overflow = 0;
  private bubbleTimer = 0;
  private done = 0;
  private rnd = new Random(5);
  private heatFill!: HTMLDivElement;
  private heatMarker!: HTMLDivElement;
  private fuelFill!: HTMLDivElement;
  private boilFill!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private status!: HTMLDivElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: FireMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, hearth } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(hearth.front.x, hearth.front.y, hearth.front.z);
    player.yaw = hearth.facing;
    player.pitch = 0.42;
    player.yawLimit = { center: hearth.facing, range: 0.6 };
    player.pitchLimit = { min: 0.1, max: 0.8 };
    this.heat = Math.max(this.heat, CFG.startHeat);
    mobile.setActionButtons([
      { label: "KÖRÜK", action: "jump" },
      { label: "ODUN", action: "interact" },
      { label: "KOR", action: "aimDown" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback", u);
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "OCAĞI HARLA · KAZANI KAYNAT");
    this.pct = el("span", "mg-value", row, "0%");
    el("div", "hud-label", panel, "ATEŞ");
    const heatBar = el("div", "mg-bar heat", panel);
    const band = el("div", "mg-band", heatBar);
    band.style.left = `${CFG.bandMin}%`;
    band.style.width = `${CFG.bandMax - CFG.bandMin}%`;
    const over = el("div", "mg-band over", heatBar);
    over.style.left = `${CFG.overflowAt}%`;
    over.style.width = `${100 - CFG.overflowAt}%`;
    this.heatFill = el("div", "mg-bar-fill fire", heatBar);
    this.heatMarker = el("div", "mg-marker", heatBar);
    el("div", "hud-label", panel, "ODUN");
    const fuelBar = el("div", "mg-bar thin", panel);
    this.fuelFill = el("div", "mg-bar-fill wood", fuelBar);
    el("div", "hud-label", panel, "KAYNAMA");
    const boilBar = el("div", "mg-bar", panel);
    this.boilFill = el("div", "mg-bar-fill", boilBar);
    el("div", "mg-bar-ticks", boilBar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.status = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "KÖRÜK: ateşi canlandır · ODUN: odun at · KOR: közü çek. Ateşi altın bantta tut."
        : "SPACE: körük · E: odun at · Q: közü çek · F: bırak — ateşi altın bantta tut.",
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
    const { input, player, audio, fx, hearth } = this.d;
    if (this.done) {
      this.done += dt;
      hearth.setFire(clamp(this.heat / 100, 0, 1), 1);
      player.syncCamera(dt, 0);
      if (this.done > 1.8) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    // Controls.
    this.logCooldown -= dt;
    if (input.wasPressed("interact") && this.logCooldown <= 0) {
      this.logCooldown = CFG.logCooldown;
      this.fuel = Math.min(100, this.fuel + CFG.fuelPerLog);
      audio.play("woodKnock", { volume: 0.8, pitch: 0.8 });
      audio.play("fireCrackle", { volume: 0.7 });
      fx.dustPuff(hearth.center.add(new Vector3(0, 0.3, 0)), 3);
      this.showFeedback("+ ODUN", "#e8c27a");
    }
    if (input.wasPressed("jump")) {
      this.boost = Math.min(40, this.boost + CFG.bellowsBoost);
      audio.play("bellows", { volume: 0.8 });
      this.d.camFx.addTrauma(0.05);
    }
    if (input.wasPressed("aimDown") && this.fuel > 2) {
      this.fuel = Math.max(0, this.fuel - CFG.emberPull);
      this.heat = Math.max(0, this.heat - 6);
      audio.play("sizzle", { volume: 0.5 });
      this.showFeedback("KÖZ ÇEKİLDİ", "#9cc4e0");
    }

    // Wind gusts.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = this.rnd.range(CFG.gustEvery[0], CFG.gustEvery[1]);
      this.gust = 2;
      audio.play("whoosh", { volume: 0.5, pitch: 0.7 });
      this.showFeedback("RÜZGÂR! ATEŞ SÖNÜYOR", "#e2655a");
    }
    const gustCooling = this.gust > 0 ? 9 : 0;
    this.gust = Math.max(0, this.gust - dt);

    // Simple fire model: heat chases what the fuel (+ bellows) can sustain.
    this.boost = Math.max(0, this.boost - dt * 22);
    const sustain = clamp(this.fuel * 1.05 + this.boost, 0, 110);
    this.heat += (sustain - this.heat) * 0.42 * dt - gustCooling * dt;
    this.heat = clamp(this.heat, 0, 105);
    this.fuel = Math.max(0, this.fuel - dt * (2.4 + this.heat * 0.03));

    // Boiling progress.
    const inBand = this.heat >= CFG.bandMin && this.heat <= CFG.bandMax;
    if (this.heat >= CFG.overflowAt) {
      this.overflow += dt;
      this.boil = Math.max(0, this.boil - dt * 1.6);
      if (this.overflow > 0.4 && Math.random() < dt * 3) {
        audio.play("sizzle", { volume: 0.6 });
        this.showFeedback("KAZAN TAŞIYOR!", "#e2655a");
      }
    } else {
      this.overflow = 0;
      if (inBand) this.boil = Math.min(100, this.boil + CFG.boilPerSecond * dt);
    }
    // Bubbling sound once warm.
    this.bubbleTimer -= dt;
    if (this.heat > CFG.bandMin - 8 && this.bubbleTimer <= 0) {
      this.bubbleTimer = 0.25 + Math.random() * (inBand ? 0.4 : 0.9);
      audio.play("bubble", { volume: 0.35 + this.boil / 300, at: hearth.center, refDistance: 6 });
    }
    hearth.setFire(clamp(this.heat / 100, 0, 1), this.boil / 100);
    if (this.boil >= 100) {
      this.done = 0.001;
      this.showFeedback("KAZAN KAYNADI!", "#9fd26b");
      audio.play("cheer", { volume: 0.5 });
      audio.play("objective", { volume: 0.8 });
    }

    player.updateLook();
    player.setShake(this.d.camFx.update(dt));
    player.syncCamera(dt, 0);
    this.updateUi(inBand);
  }

  private updateUi(inBand: boolean): void {
    this.heatFill.style.width = `${clamp(this.heat, 0, 100).toFixed(1)}%`;
    this.heatMarker.style.left = `${clamp(this.heat, 0, 100).toFixed(1)}%`;
    this.fuelFill.style.width = `${this.fuel.toFixed(1)}%`;
    this.boilFill.style.width = `${this.boil.toFixed(1)}%`;
    setText(this.ascii, asciiBar(this.boil / 100));
    setText(this.pct, `${Math.round(this.boil)}%`);
    const state =
      this.heat >= CFG.overflowAt ? `<b style="color:var(--bad)">Çok harlı — köz çek!</b>` : inBand ? `<b style="color:var(--good)">Tam kıvamında, kaynıyor</b>` : this.heat > CFG.bandMax ? `<b style="color:var(--warn)">Fazla harlı</b>` : `<b style="color:var(--warn)">Ateş zayıf — odun at, körükle</b>`;
    this.status.innerHTML = `Durum: ${state}`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }
}
