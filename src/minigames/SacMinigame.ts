import { Color4, Vector3, type PointLight } from "@babylonjs/core";
import { bakeColor } from "../assets/PrefabsKayseri";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { SacSlot } from "../scenarios/kayseri/KayseriWorld";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.sac;

export interface SacMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  stand: Vector3;
  facing: number;
  sacs: SacSlot[];
  light: PointLight;
}

interface Slot {
  phase: "empty" | "side1" | "side2";
  d1: number;
  d2: number;
  rate: number;
  wait: number;
  flip: number;
  smoke: number;
}

/**
 * MINIGAME — "Sac Başında Yağlama".
 * Three yufkas bake at once on three domed sacs, each at its own pace. Pick a sac (A/D or ←/→),
 * flip the yufka (SPACE) when its underside turns golden, then take it off the same way when
 * the second side is done. Too early and it stays raw, too late and it burns. Eight good
 * yufkas make a tray of Kayseri yağlama.
 */
export class SacMinigame extends BaseMinigame {
  private slots: Slot[] = [];
  private sel = 1;
  private good = 0;
  private perfect = 0;
  private burnt = 0;
  private raw = 0;
  private done = 0;
  private failed = 0;
  private sizzle = 0;
  private rnd = new Random(1390);
  private gauges: { root: HTMLDivElement; needle: HTMLDivElement; side: HTMLDivElement }[] = [];
  private feedback!: HTMLDivElement;
  private stackEl!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;

  constructor(private readonly d: SacMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.55;
    mobile.setActionButtons([
      { label: "◀", action: "left" },
      { label: "ÇEVİR", action: "jump" },
      { label: "▶", action: "right" },
      { label: "BIRAK", action: "action" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.slots = this.d.sacs.map((_, i) => ({ phase: "empty", d1: 0, d2: 0, rate: CFG.rates[i], wait: 0.3 + i * 0.7, flip: 0, smoke: 0 }));
    this.sel = 1;
    this.good = 0;
    this.perfect = 0;
    this.burnt = 0;
    this.raw = 0;
    this.done = 0;
    this.failed = 0;
    for (const s of this.d.sacs) s.node.setEnabled(false);
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high", u);
    const row = el("div", "sac-gauges", u);
    this.gauges = this.d.sacs.map((_, i) => {
      const root = el("div", "sac-gauge", row);
      el("div", "sg-label", root, `${i + 1}. SAC`);
      const track = el("div", "sg-track", root);
      const good = el("div", "sg-good", track);
      good.style.left = `${((1 - CFG.good) / CFG.burn) * 100}%`;
      good.style.width = `${((2 * CFG.good) / CFG.burn) * 100}%`;
      const perfect = el("div", "sg-perfect", track);
      perfect.style.left = `${((1 - CFG.perfect) / CFG.burn) * 100}%`;
      perfect.style.width = `${((2 * CFG.perfect) / CFG.burn) * 100}%`;
      const needle = el("div", "sg-needle", track);
      const side = el("div", "sg-side", root);
      return { root, needle, side };
    });
    this.stackEl = el("div", "sac-stack", u);
    const panel = el("div", "mg-panel", u);
    const r = el("div", "mg-row", panel);
    el("div", "mg-title", r, "SAC BAŞINDA YAĞLAMA");
    this.pct = el("span", "mg-value", r, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill wheat", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "◀ ▶ ile sacı seç · ÇEVİR: altı kızarınca çevir, ikinci yüzü de kızarınca al."
        : "A/D veya ←/→: sac seç · SPACE: altı kızarınca çevir, ikinci yüzü kızarınca al · F: bırak",
    );
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private inProgress(): number {
    return this.slots.filter((s) => s.phase !== "empty").length;
  }

  private act(i: number): void {
    const s = this.slots[i];
    const { audio } = this.d;
    if (s.phase === "empty") {
      this.showFeedback("YUFKA AÇILIYOR…", "#f3ead8");
      return;
    }
    if (s.phase === "side1") {
      s.phase = "side2";
      s.flip = 1;
      audio.play("flip", { volume: 0.6 });
      const off = Math.abs(s.d1 - 1);
      this.showFeedback(off <= CFG.perfect ? "TAM KIVAMINDA!" : off <= CFG.good ? "ÇEVRİLDİ" : s.d1 < 1 ? "ERKEN ÇEVİRDİN" : "BİRAZ YANIK", off <= CFG.good ? "#ffd36a" : "#f0b54a");
      return;
    }
    // Take it off the sac and judge both sides.
    const ok1 = Math.abs(s.d1 - 1) <= CFG.good;
    const ok2 = Math.abs(s.d2 - 1) <= CFG.good;
    const node = this.d.sacs[i].node;
    node.setEnabled(false);
    s.phase = "empty";
    s.wait = 0.8;
    if (ok1 && ok2) {
      this.good++;
      const perfect = Math.abs(s.d1 - 1) <= CFG.perfect && Math.abs(s.d2 - 1) <= CFG.perfect;
      if (perfect) this.perfect++;
      audio.play(perfect ? "perfect" : "good", { volume: 0.5 });
      this.showFeedback(perfect ? "ALTIN GİBİ!" : "YUFKA TAMAM", perfect ? "#ffd36a" : "#9fd26b");
      if (this.good >= CFG.needed) {
        this.done = 0.001;
        this.showFeedback("YAĞLAMA HAZIR!", "#9fd26b");
        audio.play("objective", { volume: 0.8 });
      }
    } else {
      this.raw++;
      audio.play("miss", { volume: 0.4 });
      this.showFeedback(s.d2 < 1 - CFG.good || s.d1 < 1 - CFG.good ? "ÇİĞ KALDI — YAĞLAMAYA GİRMEZ" : "FAZLA PİŞMİŞ", "#e2655a");
    }
  }

  protected update(dt: number): void {
    const { input, player, audio, fx, sacs } = this.d;
    if (this.done || this.failed) {
      const t = (this.done || this.failed) + dt;
      if (this.done) this.done = t;
      else this.failed = t;
      player.syncCamera(dt, 0);
      if (t > 1.8) this.finish(!!this.done);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    if (input.wasPressed("left")) this.sel = Math.max(0, this.sel - 1);
    if (input.wasPressed("right")) this.sel = Math.min(sacs.length - 1, this.sel + 1);
    if (input.wasPressed("jump") || input.wasPressed("fire")) this.act(this.sel);

    let cooking = 0;
    this.slots.forEach((s, i) => {
      const sac = sacs[i];
      if (s.phase === "empty") {
        s.wait -= dt;
        if (s.wait <= 0 && this.good + this.inProgress() < CFG.needed + 1) {
          s.phase = "side1";
          s.d1 = 0;
          s.d2 = 0;
          s.rate = CFG.rates[i] * this.rnd.range(0.9, 1.12);
          sac.node.setEnabled(true);
          sac.node.rotation.x = 0;
          audio.play("sizzle", { volume: 0.3 });
        }
        return;
      }
      cooking++;
      if (s.phase === "side1") s.d1 += s.rate * dt;
      else s.d2 += s.rate * dt;
      const cur = s.phase === "side1" ? s.d1 : s.d2;
      // Smoke as it starts to scorch.
      if (cur > 1 + CFG.good) {
        s.smoke -= dt;
        if (s.smoke <= 0) {
          s.smoke = 0.25;
          fx.dustPuff(sac.position.add(new Vector3(0, 0.05, 0)), 2, new Color4(0.3, 0.28, 0.26, 0.6));
        }
      }
      if (cur >= CFG.burn) {
        this.burnt++;
        s.phase = "empty";
        s.wait = 1.0;
        sac.node.setEnabled(false);
        audio.play("fireCrackle", { volume: 0.6 });
        audio.play("miss", { volume: 0.4 });
        this.showFeedback(`${i + 1}. SACTAKİ YUFKA YANDI!`, "#e2655a");
        if (this.burnt >= CFG.maxBurnt) {
          this.failed = 0.001;
          this.showFeedback("UN BİTTİ — BAŞTAN!", "#e2655a");
        }
        return;
      }
      // Visible top: raw dough while the first side bakes, then the baked first side.
      const top = s.phase === "side1" ? bakeColor(Math.min(0.45, s.d1 * 0.3)) : bakeColor(s.d1);
      sac.material.albedoColor.set(top[0], top[1], top[2]);
      // Flip animation: half turn up and over.
      if (s.flip > 0) {
        s.flip = Math.max(0, s.flip - dt * 4);
        const k = 1 - s.flip;
        sac.node.rotation.x = Math.PI * k;
        sac.node.position.y = sac.position.y + Math.sin(k * Math.PI) * 0.18;
        if (s.flip === 0) sac.node.rotation.x = 0;
      } else sac.node.position.y = sac.position.y;
    });
    this.sizzle -= dt;
    if (cooking > 0 && this.sizzle <= 0) {
      this.sizzle = 0.9;
      audio.play("sizzle", { volume: 0.12 + cooking * 0.05 });
    }
    this.d.light.intensity = 1.6 + Math.sin(this.elapsed * 13) * 0.15 + Math.sin(this.elapsed * 7.3) * 0.1;

    // Look at the selected sac.
    const target = sacs[this.sel].position;
    const yaw = Math.atan2(target.x - player.position.x, target.z - player.position.z);
    player.yaw = lerp(player.yaw, yaw, clamp(dt * 8, 0, 1));
    player.pitch = lerp(player.pitch, 0.55, clamp(dt * 4, 0, 1));
    player.syncCamera(dt, 0);
    this.updateUi();
  }

  private updateUi(): void {
    this.slots.forEach((s, i) => {
      const g = this.gauges[i];
      const cur = s.phase === "side1" ? s.d1 : s.phase === "side2" ? s.d2 : 0;
      g.needle.style.left = `${clamp(cur / CFG.burn, 0, 1) * 100}%`;
      g.root.classList.toggle("sel", i === this.sel);
      g.root.classList.toggle("hot", cur > 1 + CFG.good);
      setText(g.side, s.phase === "empty" ? "boş" : s.phase === "side1" ? "1. yüz pişiyor" : "2. yüz pişiyor");
    });
    this.stackEl.innerHTML = `Yağlama katı: <b>${this.good}</b>/${CFG.needed}`;
    const k = this.good / CFG.needed;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `Altın gibi: <b>${this.perfect}</b> · Çiğ: <b>${this.raw}</b> · Yanan: <b>${this.burnt}/${CFG.maxBurnt}</b>`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    for (const s of this.d.sacs) s.node.setEnabled(false);
    this.d.light.intensity = 1.6;
  }

  /** QA helper: doneness of each sac's current side. */
  get qa(): { sel: number; slots: { phase: string; cur: number }[]; good: number } {
    return { sel: this.sel, good: this.good, slots: this.slots.map((s) => ({ phase: s.phase, cur: s.phase === "side1" ? s.d1 : s.d2 })) };
  }
}
