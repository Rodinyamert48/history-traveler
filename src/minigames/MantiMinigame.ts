import type { TransformNode, Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { GameAction, InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { lerp } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.manti;

export interface MantiMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  stand: Vector3;
  facing: number;
  /** Rolled dough on the board (shrinks as it is used up). */
  sheet: TransformNode;
  /** Rows of four mantı on the tray, shown one by one. */
  rows: TransformNode[];
}

type Dir = "up" | "down" | "left" | "right";
const DIR_ACTION: Record<Dir, GameAction> = { up: "forward", down: "back", left: "left", right: "right" };
const DIR_GLYPH: Record<Dir, string> = { up: "↑", down: "↓", left: "←", right: "→" };
const DIRS: Dir[] = ["up", "right", "down", "left"];

/**
 * MINIGAME — "Kırk Mantı Bir Kaşığa".
 * Kayseri mantı is famously tiny: forty of them should fit in one spoon. First cut the rolled
 * dough into even strips (SPACE when the knife passes the guide line), then pinch the four
 * corners of each little square in the order shown (arrow keys / WASD) before time runs out.
 */
export class MantiMinigame extends BaseMinigame {
  private phase: "cut" | "fold" = "cut";
  private knife = 0;
  private knifeDir = 1;
  private cuts = 0;
  private round = 0;
  private seq: Dir[] = [];
  private seqIndex = 0;
  private timeLeft = 0;
  private mistakes = 0;
  private perfectCuts = 0;
  private done = 0;
  private rnd = new Random(38);
  private board!: HTMLDivElement;
  private knifeEl!: HTMLDivElement;
  private guides: HTMLDivElement[] = [];
  private foldEl!: HTMLDivElement;
  private seqEl!: HTMLDivElement;
  private timerEl!: HTMLDivElement;
  private spoonEl!: HTMLDivElement;
  private feedback!: HTMLDivElement;
  private title!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;
  private hint!: HTMLDivElement;

  constructor(private readonly d: MantiMinigameDeps) {
    super(d.layer);
  }

  private get roundTime(): number {
    return lerp(CFG.roundTime[0], CFG.roundTime[1], this.round / Math.max(1, CFG.rounds - 1));
  }

  protected onStart(): void {
    const { player, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.72;
    player.yawLimit = { center: facing, range: 0.5 };
    player.pitchLimit = { min: 0.35, max: 0.95 };
    hud.setCrosshair(false);
    this.phase = "cut";
    this.knife = 0;
    this.knifeDir = 1;
    this.cuts = 0;
    this.round = 0;
    this.mistakes = 0;
    this.perfectCuts = 0;
    this.done = 0;
    for (const r of this.d.rows) r.setEnabled(false);
    this.d.sheet.setEnabled(true);
    this.d.sheet.scaling.x = 1;
    this.buildUi();
    this.setButtons();
  }

  private setButtons(): void {
    const { mobile } = this.d;
    if (this.phase === "cut")
      mobile.setActionButtons([
        { label: "KES", action: "jump" },
        { label: "BIRAK", action: "action" },
      ]);
    else
      mobile.setActionButtons([
        { label: "←", action: "left" },
        { label: "↑", action: "forward" },
        { label: "↓", action: "back" },
        { label: "→", action: "right" },
      ]);
    mobile.setLayout("action");
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high", u);
    const card = el("div", "manti-card", u);
    this.title = el("div", "mc-title", card, "HAMURU KES");
    this.board = el("div", "manti-board", card);
    this.guides = [];
    for (let i = 0; i < CFG.cuts; i++) {
      const g = el("div", "mt-guide", this.board);
      g.style.left = `${((i + 1) / (CFG.cuts + 1)) * 100}%`;
      this.guides.push(g);
    }
    this.knifeEl = el("div", "mt-knife", this.board);
    this.foldEl = el("div", "manti-fold", card);
    el("div", "mf-square", this.foldEl);
    this.seqEl = el("div", "mf-seq", this.foldEl);
    const t = el("div", "mf-timer", this.foldEl);
    this.timerEl = el("div", "mf-timer-fill", t);
    this.foldEl.style.display = "none";
    this.spoonEl = el("div", "manti-spoon", card);
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "KIRK MANTI BİR KAŞIĞA");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill wheat", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    this.hint = el("div", "hint-line", panel);
    this.renderHint();
    this.renderSpoon();
  }

  private renderHint(): void {
    const touch = this.d.input.isTouch;
    setText(
      this.hint,
      this.phase === "cut"
        ? touch
          ? "Bıçak parlayan çizginin üstüne gelince KES'e dokun."
          : "Bıçak parlayan çizginin üstüne gelince SPACE. Eğri kesersen şerit bozulur · F: bırak"
        : touch
          ? "Köşeleri gösterilen sırayla kapat (oklara dokun)."
          : "Köşeleri gösterilen sırayla kapat: ok tuşları veya W A S D",
    );
  }

  private renderSpoon(): void {
    const n = this.round * 4;
    this.spoonEl.innerHTML = `Kaşıkta: <b>${n}</b>/40 mantı`;
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private cut(): void {
    const { audio } = this.d;
    const target = (this.cuts + 1) / (CFG.cuts + 1);
    const off = Math.abs(this.knife - target);
    if (off <= CFG.cutTolerance) {
      const perfect = off <= CFG.cutTolerance / 2;
      if (perfect) this.perfectCuts++;
      this.guides[this.cuts].classList.add("cut");
      this.cuts++;
      audio.play("knifeChop", { volume: 0.7 });
      this.showFeedback(perfect ? "DÜMDÜZ!" : "İYİ KESİM", perfect ? "#ffd36a" : "#f3ead8");
      if (this.cuts >= CFG.cuts) this.startFolding();
    } else {
      this.mistakes++;
      audio.play("knifeChop", { volume: 0.5, pitch: 0.8 });
      audio.play("miss", { volume: 0.3 });
      this.showFeedback(this.knife < target ? "ERKEN — EĞRİ KESTİN" : "GEÇ — EĞRİ KESTİN", "#e2655a");
    }
  }

  private startFolding(): void {
    this.phase = "fold";
    this.board.style.display = "none";
    this.foldEl.style.display = "";
    setText(this.title, "KÖŞELERİ KAPAT");
    this.newSequence();
    this.setButtons();
    this.renderHint();
  }

  private newSequence(): void {
    const start = this.rnd.int(0, 3);
    const dir = this.rnd.chance(0.5) ? 1 : 3;
    this.seq = [0, 1, 2, 3].map((k) => DIRS[(start + k * dir) % 4]);
    // Later rounds sometimes cross over (harder to read).
    if (this.round >= 5 && this.rnd.chance(0.5)) [this.seq[1], this.seq[2]] = [this.seq[2], this.seq[1]];
    this.seqIndex = 0;
    this.timeLeft = this.roundTime;
    this.renderSeq();
  }

  private renderSeq(): void {
    this.seqEl.innerHTML = this.seq.map((d, i) => `<span class="mf-key ${i < this.seqIndex ? "ok" : i === this.seqIndex ? "cur" : ""}">${DIR_GLYPH[d]}</span>`).join("");
  }

  private pressed(): Dir | null {
    for (const d of DIRS) if (this.d.input.wasPressed(DIR_ACTION[d])) return d;
    return null;
  }

  private failRound(text: string): void {
    this.mistakes++;
    this.d.audio.play("miss", { volume: 0.35 });
    this.showFeedback(text, "#e2655a");
    this.newSequence();
  }

  protected update(dt: number): void {
    const { input, player, audio } = this.d;
    if (this.done) {
      this.done += dt;
      player.syncCamera(dt, 0);
      if (this.done > 1.6) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    if (this.phase === "cut") {
      this.knife += this.knifeDir * CFG.knifeSpeed * dt;
      if (this.knife > 1) {
        this.knife = 1;
        this.knifeDir = -1;
      } else if (this.knife < 0) {
        this.knife = 0;
        this.knifeDir = 1;
      }
      this.knifeEl.style.left = `${(this.knife * 100).toFixed(2)}%`;
      this.guides.forEach((g, i) => g.classList.toggle("next", i === this.cuts));
      if (input.wasPressed("jump") || input.wasPressed("fire")) this.cut();
    } else {
      this.timeLeft -= dt;
      const dir = this.pressed();
      if (dir) {
        if (dir === this.seq[this.seqIndex]) {
          this.seqIndex++;
          audio.play("penScratch", { volume: 0.25, pitch: 0.5 + this.seqIndex * 0.08 });
          if (this.seqIndex >= this.seq.length) {
            this.d.rows[this.round]?.setEnabled(true);
            this.round++;
            audio.play("pickup", { volume: 0.4, pitch: 1.4 });
            this.d.sheet.scaling.x = Math.max(0.08, 1 - (this.round / CFG.rounds) * 0.92);
            this.renderSpoon();
            if (this.round >= CFG.rounds) {
              this.done = 0.001;
              this.showFeedback("KIRK MANTI BİR KAŞIĞA SIĞDI!", "#9fd26b");
              audio.play("objective", { volume: 0.8 });
            } else {
              this.showFeedback(this.timeLeft > this.roundTime * 0.5 ? "TIKIR TIKIR!" : "KAPANDI", "#ffd36a");
              this.newSequence();
            }
          } else this.renderSeq();
        } else this.failRound("MANTI AÇILDI!");
      } else if (this.timeLeft <= 0) this.failRound("YETİŞEMEDİN!");
      this.timerEl.style.width = `${Math.max(0, (this.timeLeft / this.roundTime) * 100).toFixed(1)}%`;
    }
    player.updateLook();
    player.syncCamera(dt, 0);
    const k = (this.cuts / CFG.cuts) * 0.25 + (this.round / CFG.rounds) * 0.75;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = this.phase === "cut" ? `Kesik: <b>${this.cuts}/${CFG.cuts}</b> · Düzgün: <b>${this.perfectCuts}</b> · Hata: <b>${this.mistakes}</b>` : `Mantı: <b>${this.round * 4}/40</b> · Hata: <b>${this.mistakes}</b>`;
  }

  protected onEnd(success: boolean): void {
    const { player, mobile, hud } = this.d;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    if (!success) {
      for (const r of this.d.rows) r.setEnabled(false);
      this.d.sheet.scaling.x = 1;
    }
  }

  /** QA helper: what the bot should press next. */
  get qa(): { phase: string; knife: number; target: number; next: string | null } {
    return { phase: this.phase, knife: this.knife, target: (this.cuts + 1) / (CFG.cuts + 1), next: this.seq[this.seqIndex] ?? null };
  }
}
