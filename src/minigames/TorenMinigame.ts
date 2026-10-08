import type { Vector3 } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { GameAction, InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.toren;

export interface TorenMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  stand: Vector3;
  facing: number;
  commander: NPC;
  /** The rest of the rank (they follow every command too). */
  rank: NPC[];
}

interface Command {
  id: "hazir" | "rahat" | "saga" | "sola" | "selam";
  ihtar: string;
  icra: string;
  action: GameAction;
  key: string;
  label: string;
}

const COMMANDS: Command[] = [
  { id: "hazir", ihtar: "HAZIIIR…", icra: "OL!", action: "forward", key: "↑", label: "Hazır ol" },
  { id: "rahat", ihtar: "RAHAAA…", icra: "…AT!", action: "back", key: "↓", label: "Rahat" },
  { id: "saga", ihtar: "SAĞAAA…", icra: "BAK!", action: "right", key: "→", label: "Sağa bak" },
  { id: "sola", ihtar: "SOLAAA…", icra: "BAK!", action: "left", key: "←", label: "Sola bak" },
  { id: "selam", ihtar: "SELAAAM…", icra: "DUR!", action: "jump", key: "SPACE", label: "Selam dur" },
];
const ACTIONS: GameAction[] = ["forward", "back", "right", "left", "jump"];

/**
 * MINIGAME — "Karşılama Talimi".
 * The company drills before welcoming the Paşa. Every command has a warning part (ihtar,
 * drawn out: "Sağaaa…") and an execution word (icra: "BAK!"). Act on the execution word —
 * not before it — with the right key, and in time.
 */
export class TorenMinigame extends BaseMinigame {
  private index = 0;
  private correct = 0;
  private cmd: Command | null = null;
  private phase: "wait" | "ihtar" | "icra" | "after" = "wait";
  private timer = 0;
  private window = 0;
  private headYaw = 0;
  private headPitch = 0;
  private done = 0;
  private rnd = new Random(1919);
  private order: Command[] = [];
  private shout!: HTMLDivElement;
  private keyEl!: HTMLDivElement;
  private feedback!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;

  constructor(private readonly d: TorenMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing, commander } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.02;
    mobile.setActionButtons([
      { label: "←", action: "left" },
      { label: "↑", action: "forward" },
      { label: "↓", action: "back" },
      { label: "→", action: "right" },
      { label: "SELAM", action: "jump" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    commander.setBehavior({ type: "pose", anim: "idle" });
    commander.lookAtPlayer = false;
    this.index = 0;
    this.correct = 0;
    this.done = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    // Shuffle so that no command repeats twice in a row.
    this.order = [];
    let last: Command | null = null;
    for (let i = 0; i < CFG.commands; i++) {
      let c = this.rnd.pick(COMMANDS);
      if (c === last) c = COMMANDS[(COMMANDS.indexOf(c) + 1) % COMMANDS.length];
      this.order.push(c);
      last = c;
    }
    this.phase = "wait";
    this.timer = 1.6;
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    this.shout = el("div", "toren-shout", u);
    this.keyEl = el("div", "toren-key", u);
    this.feedback = el("div", "rhythm-feedback high", u);
    const legend = el("div", "toren-legend", u);
    legend.innerHTML = COMMANDS.map((c) => `<span><b>${c.key}</b> ${c.label}</span>`).join("");
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "KARŞILAMA TALİMİ");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el("div", "hint-line", panel, "İhtarda (uzayan kısım) bekle, icrada (kısa emir) hemen doğru tuşa bas. Erken davranan sırayı bozar!");
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private pressed(): GameAction | null {
    for (const a of ACTIONS) if (this.d.input.wasPressed(a)) return a;
    return null;
  }

  private next(): void {
    if (this.index >= this.order.length) {
      const ok = this.correct >= CFG.needed;
      this.done = ok ? 0.001 : -0.001;
      this.shout.className = "toren-shout";
      setText(this.shout, ok ? "AFERİN BÖLÜK!" : "BİR DAHA!");
      this.showFeedback(ok ? "BÖLÜK HAZIR!" : `${this.correct}/${CFG.commands} — YETERSİZ`, ok ? "#9fd26b" : "#e2655a");
      this.d.audio.play(ok ? "fanfare" : "miss", { volume: 0.7 });
      return;
    }
    this.cmd = this.order[this.index];
    this.phase = "ihtar";
    this.timer = this.rnd.range(0.9, 1.7);
    this.shout.className = "toren-shout ihtar";
    setText(this.shout, this.cmd.ihtar);
    setText(this.keyEl, "");
    this.d.commander.setBehavior({ type: "pose", anim: "talk" });
    this.d.audio.play("chant", { volume: 0.55, pitch: 0.7 });
  }

  /** The rank (and the player's view) perform the command. */
  private perform(c: Command, success: boolean): void {
    const target = { hazir: [0, -0.04], rahat: [0, 0.06], saga: [0.55, 0], sola: [-0.55, 0], selam: [0, -0.02] }[c.id];
    if (success) [this.headYaw, this.headPitch] = target;
    for (const n of this.d.rank) {
      n.setBehavior({ type: "pose", anim: c.id === "selam" ? "point" : c.id === "rahat" ? "idle" : "guard" });
      n.heading = this.d.facing + target[0];
      n.applyTransform();
    }
    this.d.audio.play("land", { volume: 0.5, pitch: 1.4 });
  }

  protected update(dt: number): void {
    const { player, audio } = this.d;
    // The player's head follows the commands.
    player.yaw = lerp(player.yaw, this.d.facing + this.headYaw, clamp(dt * 10, 0, 1));
    player.pitch = lerp(player.pitch, 0.02 + this.headPitch, clamp(dt * 10, 0, 1));
    player.syncCamera(dt, 0);
    if (this.done) {
      this.done += Math.sign(this.done) * dt;
      if (Math.abs(this.done) > 2.2) this.finish(this.done > 0);
      return;
    }
    if (this.d.input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    const key = this.pressed();
    this.timer -= dt;
    switch (this.phase) {
      case "wait":
        if (this.timer <= 0) this.next();
        break;
      case "ihtar":
        if (key) {
          this.showFeedback("ERKEN! İCRAYI BEKLE", "#e2655a");
          audio.play("miss", { volume: 0.4 });
          this.resolve(false);
        } else if (this.timer <= 0) {
          this.phase = "icra";
          this.window = lerp(CFG.window[0], CFG.window[1], this.index / Math.max(1, CFG.commands - 1));
          this.timer = this.window;
          this.shout.className = "toren-shout icra";
          setText(this.shout, this.cmd!.icra);
          setText(this.keyEl, this.cmd!.key);
          this.d.commander.setBehavior({ type: "pose", anim: "point" });
          audio.play("chant", { volume: 0.8, pitch: 0.95 });
        }
        break;
      case "icra":
        if (key) {
          const ok = key === this.cmd!.action;
          if (ok) {
            const fast = this.timer > this.window * 0.5;
            this.showFeedback(fast ? "ŞAK!" : "TAMAM", fast ? "#ffd36a" : "#9fd26b");
            audio.play(fast ? "perfect" : "good", { volume: 0.45 });
          } else {
            this.showFeedback("YANLIŞ HAREKET", "#e2655a");
            audio.play("miss", { volume: 0.4 });
          }
          this.resolve(ok);
        } else if (this.timer <= 0) {
          this.showFeedback("GEÇ KALDIN", "#f0b54a");
          this.resolve(false);
        }
        break;
      case "after":
        if (this.timer <= 0) {
          this.phase = "wait";
          this.timer = 0.15;
        }
        break;
    }
    this.updateUi();
  }

  private resolve(ok: boolean): void {
    if (ok) this.correct++;
    this.perform(this.cmd!, ok);
    this.index++;
    this.phase = "after";
    this.timer = 0.9;
    this.shout.className = "toren-shout";
    setText(this.keyEl, "");
  }

  private updateUi(): void {
    const k = this.index / CFG.commands;
    this.bar.style.width = `${(k * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(k));
    setText(this.pct, `${Math.round(k * 100)}%`);
    this.stats.innerHTML = `Doğru: <b>${this.correct}</b> · Emir: <b>${this.index}/${CFG.commands}</b> · Gerekli: <b>${CFG.needed}</b>`;
  }

  protected onEnd(): void {
    const { player, mobile, hud, commander } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    commander.setBehavior({ type: "pose", anim: "idle" });
    for (const n of this.d.rank) {
      n.heading = this.d.facing;
      n.setBehavior({ type: "pose", anim: "guard" });
      n.applyTransform();
    }
  }

  /** QA helper for the test bot. */
  get qa(): { phase: string; action: GameAction | null } {
    return { phase: this.phase, action: this.cmd?.action ?? null };
  }
}
