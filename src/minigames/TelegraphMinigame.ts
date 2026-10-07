import type { TransformNode, Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { lerp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.telegraph;

/** International Morse code (the telegraph lines of 1920 used Latin letters for Morse). */
const MORSE: Record<string, string> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
};

export interface TelegraphMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  /** Where the operator stands and which way they face the key. */
  stand: Vector3;
  facing: number;
  lever: TransformNode;
}

/**
 * MINIGAME — "Telgrafhane".
 * Send the circular announcing the Assembly to the provinces in Morse code. Tap SPACE (or
 * the big TUŞ button) for a dot, hold it for a dash. A wrong symbol clears the current
 * letter; letters are spaced automatically once complete.
 */
export class TelegraphMinigame extends BaseMinigame {
  private letters: { ch: string; code: string; word: number }[] = [];
  private index = 0;
  private typed = "";
  private downTime = -1;
  private mistakes = 0;
  private flash = 0;
  private done = 0;
  private wordsEl!: HTMLDivElement;
  private codeEl!: HTMLDivElement;
  private holdEl!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: TelegraphMinigameDeps) {
    super(d.layer);
    CFG.words.forEach((w, wi) => {
      for (const ch of w) if (MORSE[ch]) this.letters.push({ ch, code: MORSE[ch], word: wi });
    });
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.62;
    player.yawLimit = { center: facing, range: 0.55 };
    player.pitchLimit = { min: 0.2, max: 0.9 };
    mobile.setActionButtons([
      { label: "TUŞ", action: "jump" },
      { label: "BIRAK", action: "action" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.typed = "";
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high", u);
    const card = el("div", "morse-card", u);
    el("div", "mc-title", card, "TAMİM · VİLAYETLERE");
    this.wordsEl = el("div", "mc-words", card);
    this.codeEl = el("div", "mc-code", card);
    this.holdEl = el("div", "mc-hold", card);
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "TELGRAFLA MORS GÖNDER");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    el("div", "mg-bar-ticks", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch ? "TUŞ'a kısa dokun: nokta (·) · basılı tut: çizgi (—)" : "SPACE'e kısa bas: nokta (·) · basılı tut: çizgi (—) · F: bırak",
    );
    this.renderCard();
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private symbol(sym: "." | "-"): void {
    const cur = this.letters[this.index];
    if (!cur) return;
    const expected = cur.code[this.typed.length];
    if (sym !== expected) {
      this.mistakes++;
      this.typed = "";
      this.flash = 0.4;
      this.showFeedback(`YANLIŞ — "${cur.ch}" baştan`, "#e2655a");
      this.d.audio.play("miss", { volume: 0.4 });
      this.renderCard();
      return;
    }
    this.typed += sym;
    if (this.typed === cur.code) {
      this.index++;
      this.typed = "";
      this.d.audio.play("keyClick", { volume: 0.5, pitch: 0.8 });
      const next = this.letters[this.index];
      if (!next) {
        this.done = 0.001;
        this.showFeedback("TAMİM GÖNDERİLDİ!", "#9fd26b");
        this.d.audio.play("objective", { volume: 0.8 });
      } else if (next.word !== cur.word) this.showFeedback(`"${CFG.words[cur.word]}" GİTTİ`, "#ffd36a");
    }
    this.renderCard();
  }

  private renderCard(): void {
    const cur = this.letters[this.index];
    // Words with sent letters highlighted.
    let html = "";
    let i = 0;
    CFG.words.forEach((w, wi) => {
      html += `<span class="mc-word">`;
      for (const ch of w) {
        if (!MORSE[ch]) {
          html += `<span class="mc-gap"> </span>`;
          continue;
        }
        const cls = i < this.index ? "sent" : i === this.index ? "cur" : "";
        html += `<span class="mc-ch ${cls}">${ch}</span>`;
        i++;
      }
      html += `</span>${wi < CFG.words.length - 1 ? '<span class="mc-sep">·</span>' : ""}`;
    });
    this.wordsEl.innerHTML = html;
    if (!cur) {
      this.codeEl.innerHTML = "";
      return;
    }
    this.codeEl.innerHTML = `<span class="mc-letter">${cur.ch}</span>${[...cur.code]
      .map((c, k) => `<span class="mc-sym ${k < this.typed.length ? "ok" : ""}">${c === "." ? "●" : "▬"}</span>`)
      .join("")}`;
  }

  protected update(dt: number): void {
    const { input, player, audio } = this.d;
    if (this.done) {
      this.done += dt;
      this.d.lever.rotation.x = lerp(this.d.lever.rotation.x, 0, 0.3);
      player.syncCamera(dt, 0);
      if (this.done > 1.6) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    // Key down/up timing in game time (works the same for keyboard and the touch button).
    if (input.wasPressed("jump") && this.downTime < 0) {
      this.downTime = 0;
      audio.setTone(true);
      audio.play("keyClick", { volume: 0.4 });
    }
    if (this.downTime >= 0) {
      this.downTime += dt;
      const held = input.isDown("jump");
      this.holdEl.style.width = `${Math.min(100, (this.downTime / (CFG.dashThreshold * 2)) * 100).toFixed(0)}%`;
      this.holdEl.classList.toggle("dash", this.downTime >= CFG.dashThreshold);
      if (!held) {
        audio.setTone(false);
        this.symbol(this.downTime >= CFG.dashThreshold ? "-" : ".");
        this.downTime = -1;
        this.holdEl.style.width = "0%";
      }
    }
    this.d.lever.rotation.x = lerp(this.d.lever.rotation.x, this.downTime >= 0 ? 0.12 : 0, 0.5);
    this.flash = Math.max(0, this.flash - dt);
    player.updateLook();
    player.syncCamera(dt, 0);
    this.updateUi();
  }

  private updateUi(): void {
    const k = this.letters.length ? this.index / this.letters.length : 0;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `Harf: <b>${this.index}/${this.letters.length}</b> · Hata: <b>${this.mistakes}</b>`;
  }

  protected onEnd(): void {
    const { player, mobile, hud, audio } = this.d;
    audio.setTone(false);
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    this.d.lever.rotation.x = 0;
  }
}
