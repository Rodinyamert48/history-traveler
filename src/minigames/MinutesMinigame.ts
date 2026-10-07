import type { Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, escapeHtml, setText } from "../ui/dom";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.minutes;

/** Turkish letters may be typed with their ASCII base letter (keyboards without ç ğ ı ö ş ü). */
function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/[çc]/g, "c")
    .replace(/[ğg]/g, "g")
    .replace(/[ıiîİ]/g, "i")
    .replace(/[öo]/g, "o")
    .replace(/[şs]/g, "s")
    .replace(/[üuû]/g, "u")
    .replace(/[âa]/g, "a");
}

export interface MinutesMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  stand: Vector3;
  facing: number;
  /** Sentences of the speech being recorded. */
  lines: string[];
  /** Called when a sentence has been written down (the speaker can say it). */
  onLine(index: number): void;
}

/**
 * MINIGAME — "Zabıt Kâtibi".
 * As the oldest deputy opens the Assembly, the clerk takes down the minutes. Type each word of
 * the speech; Turkish letters can be typed with their plain equivalents (ş → s). On touch
 * screens pick the right word among three. Mistakes splash ink but never fail the scene.
 */
export class MinutesMinigame extends BaseMinigame {
  private words: { text: string; line: number }[] = [];
  private index = 0;
  private typed = "";
  private mistakes = 0;
  private blots = 0;
  private wordMistakes = 0;
  private done = 0;
  private rnd = new Random(23);
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private page!: HTMLDivElement;
  private current!: HTMLDivElement;
  private choices!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;

  constructor(private readonly d: MinutesMinigameDeps) {
    super(d.layer);
    d.lines.forEach((line, li) => {
      for (const w of line.split(/\s+/)) if (w) this.words.push({ text: w, line: li });
    });
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.15;
    player.yawLimit = { center: facing, range: 0.6 };
    player.pitchLimit = { min: -0.2, max: 0.7 };
    mobile.setLayout("hidden");
    hud.setCrosshair(false);
    this.buildUi();
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener("keydown", this.keyHandler);
  }

  private buildUi(): void {
    const u = this.ui;
    const book = el("div", "minutes-book", u);
    el("div", "mb-head", book, "ZABIT CERİDESİ · 23 NİSAN 1920 · BİRİNCİ İÇTİMA");
    this.page = el("div", "mb-page", book);
    this.current = el("div", "mb-current", book);
    this.choices = el("div", "mb-choices", book);
    const panel = el("div", "mg-panel compact", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "ZABIT KÂTİBİ");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el("div", "hint-line", panel, this.d.input.isTouch ? "Konuşmadaki doğru kelimeye dokun." : "Kelimeleri yaz (ş→s, ğ→g, ı→i gibi yazabilirsin). Yanlış harfler mürekkep lekesi bırakır.");
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || this.paused || this.done || this.d.input.isTouch) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
    const word = this.words[this.index];
    if (!word) return;
    const target = fold(word.text.replace(/[.,;:!?"'’]/g, ""));
    const next = fold(this.typed + e.key);
    if (target.startsWith(next)) {
      this.typed += e.key;
      this.d.audio.play("penScratch", { volume: 0.4, pitch: 0.9 + Math.random() * 0.2 });
      if (next === target) this.completeWord();
    } else {
      this.mistakes++;
      this.wordMistakes++;
      this.d.audio.play("miss", { volume: 0.25 });
      if (this.wordMistakes % CFG.blotEvery === 0) this.blots++;
    }
    this.render();
  }

  private pick(choice: string): void {
    const word = this.words[this.index];
    if (!word || this.done) return;
    if (choice === word.text) this.completeWord();
    else {
      this.mistakes++;
      this.blots++;
      this.d.audio.play("miss", { volume: 0.3 });
    }
    this.render();
  }

  private completeWord(): void {
    const word = this.words[this.index];
    this.index++;
    this.typed = "";
    this.wordMistakes = 0;
    const next = this.words[this.index];
    if (!next || next.line !== word.line) this.d.onLine(word.line);
    if (!next) {
      this.done = 0.001;
      this.d.audio.play("objective", { volume: 0.8 });
    }
  }

  private render(): void {
    // Written text so far, grouped by sentence.
    let html = "";
    let line = -1;
    for (let i = 0; i < this.index; i++) {
      const w = this.words[i];
      if (w.line !== line) {
        if (line >= 0) html += "</p>";
        html += "<p>";
        line = w.line;
      }
      html += `${escapeHtml(w.text)} `;
    }
    if (line >= 0) html += "</p>";
    if (this.blots) html += `<div class="mb-blots">${"●".repeat(Math.min(this.blots, 12))}</div>`;
    this.page.innerHTML = html;
    const word = this.words[this.index];
    if (!word) {
      this.current.innerHTML = `<span class="mb-done">Zabıt tamamlandı.</span>`;
      this.choices.innerHTML = "";
      return;
    }
    const t = word.text;
    const typedLen = this.typed.length;
    this.current.innerHTML = `<span class="mb-typed">${escapeHtml(t.slice(0, typedLen))}</span><span class="mb-rest">${escapeHtml(t.slice(typedLen))}</span>`;
    if (this.d.input.isTouch) {
      const pool = this.words.map((w) => w.text).filter((w) => w !== t);
      const options = [t, this.rnd.pick(pool), this.rnd.pick(pool)].sort(() => this.rnd.next() - 0.5);
      this.choices.innerHTML = "";
      for (const o of options) {
        const b = el("button", "btn secondary", this.choices, o);
        b.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          this.pick(o);
        });
      }
    }
  }

  protected update(dt: number): void {
    const { player } = this.d;
    if (this.done) {
      this.done += dt;
      player.syncCamera(dt, 0);
      if (this.done > 1.2) this.finish(true);
      return;
    }
    player.updateLook();
    player.syncCamera(dt, 0);
    const k = this.words.length ? this.index / this.words.length : 0;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `Kelime: <b>${this.index}/${this.words.length}</b> · Hata: <b>${this.mistakes}</b>`;
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    if (this.keyHandler) window.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
  }

  /** QA helper: the next word the player has to write. */
  get nextWord(): string | null {
    return this.words[this.index]?.text ?? null;
  }
}
