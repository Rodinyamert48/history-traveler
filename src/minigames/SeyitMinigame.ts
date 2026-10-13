import { Vector3, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { Noise2D } from "../utils/noise";
import { BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.seyit;

export interface SeyitMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  /** The shell lying by the magazine door, and the one carried on the shoulder (first person). */
  shell: TransformNode;
  held: TransformNode;
  /** From the magazine door to the gun's breech. */
  path: Vector3[];
  groundAt: (x: number, z: number) => number;
}

type Phase = "lift" | "carry" | "load" | "done";

/**
 * MINIGAME — "Seyit Onbaşı".
 * The crane is broken and the gun is silent. Lift the 276 kg shell onto your back (alternate
 * A and D as fast as you can), carry it across the battery keeping your balance (the load
 * sways; lean against it with A/D), and at the breech push it home (E or SPACE when the marker
 * is in the middle).
 */
export class SeyitMinigame extends BaseMinigame {
  private phase: Phase = "lift";
  private lift = 0;
  private lastKey: "left" | "right" | null = null;
  private tilt = 0;
  private tiltVel = 0;
  private dist = 0;
  private total = 0;
  private stumbles = 0;
  private stumbleT = 0;
  private loadT = 0;
  private tries = 0;
  private endT = 0;
  private stepT = 0;
  private noise = new Noise2D(276);
  private feedback!: HTMLDivElement;
  private liftRow!: HTMLDivElement;
  private liftFill!: HTMLDivElement;
  private tiltRow!: HTMLDivElement;
  private tiltNeedle!: HTMLDivElement;
  private loadRow!: HTMLDivElement;
  private loadMarker!: HTMLDivElement;
  private stats!: HTMLDivElement;
  private hint!: HTMLDivElement;

  constructor(private readonly d: SeyitMinigameDeps) {
    super(d.layer);
  }

  protected onStart(): void {
    const { player, mobile, hud, path, shell, held } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = false;
    const p0 = path[0];
    player.position.set(p0.x, p0.y, p0.z);
    const s = shell.position;
    player.yaw = Math.atan2(s.x - p0.x, s.z - p0.z);
    player.pitch = 0.7;
    mobile.setActionButtons([
      { label: "◀ A", action: "left" },
      { label: "D ▶", action: "right" },
      { label: "YERLEŞTİR", action: "interact" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(false);
    this.phase = "lift";
    this.lift = 0;
    this.lastKey = null;
    this.tilt = 0;
    this.tiltVel = 0;
    this.dist = 0;
    this.stumbles = 0;
    this.tries = 0;
    this.endT = 0;
    this.total = 0;
    for (let i = 1; i < path.length; i++) this.total += Vector3.Distance(path[i - 1], path[i]);
    shell.setEnabled(true);
    held.setEnabled(false);
    this.buildUi();
    this.setPhase("lift");
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high long", u);
    const panel = el("div", "mg-panel seyit-panel", u);
    const r = el("div", "mg-row", panel);
    el("div", "mg-title", r, "SEYİT ONBAŞI");
    el("span", "mg-value", r, "276 kg");
    this.liftRow = el("div", "sy-row", panel);
    el("span", "", this.liftRow, "KALDIR");
    const lt = el("div", "sy-track", this.liftRow);
    this.liftFill = el("div", "sy-lift", lt);
    this.tiltRow = el("div", "sy-row", panel);
    el("span", "", this.tiltRow, "DENGE");
    const tt = el("div", "sy-track sy-balance", this.tiltRow);
    el("div", "sy-safe", tt);
    this.tiltNeedle = el("div", "sy-needle", tt);
    this.loadRow = el("div", "sy-row", panel);
    el("span", "", this.loadRow, "YERLEŞTİR");
    const ld = el("div", "sy-track sy-load", this.loadRow);
    el("div", "sy-zone", ld);
    this.loadMarker = el("div", "sy-needle", ld);
    this.stats = el("div", "mg-stats", panel);
    this.hint = el("div", "hint-line", panel);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.liftRow.style.display = p === "lift" ? "" : "none";
    this.tiltRow.style.display = p === "carry" ? "" : "none";
    this.loadRow.style.display = p === "load" ? "" : "none";
    const touch = this.d.input.isTouch;
    const hints: Record<Phase, string> = {
      lift: touch ? "◀ A ve D ▶ düğmelerine sırayla, hızlı hızlı bas — mermiyi sırtına al!" : "A ve D tuşlarına sırayla, hızlı hızlı bas — mermiyi sırtına al! · F: bırak",
      carry: touch ? "Yük sallanıyor: ibre hangi yana kayarsa öbür yana yaslan (◀ / ▶)" : "Yük sallanıyor: ibre hangi yana kayarsa öbür yana yaslan (A / D)",
      load: touch ? "İbre ortadaki yeşil bölgedeyken YERLEŞTİR" : "İbre ortadaki yeşil bölgedeyken E veya SPACE: mermiyi kamaya sür",
      done: "",
    };
    setText(this.hint, hints[p]);
  }

  private showFeedback(html: string, color: string): void {
    this.feedback.innerHTML = html;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  /** Point and direction `d` meters along the path. */
  private along(d: number): { p: Vector3; yaw: number } {
    const path = this.d.path;
    let left = d;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const len = Vector3.Distance(a, b);
      if (left <= len || i === path.length - 1) {
        const k = clamp(left / len, 0, 1);
        return { p: Vector3.Lerp(a, b, k), yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      }
      left -= len;
    }
    const n = path.length;
    return { p: path[n - 1].clone(), yaw: Math.atan2(path[n - 1].x - path[n - 2].x, path[n - 1].z - path[n - 2].z) };
  }

  protected update(dt: number): void {
    const { input, player, audio, camFx, held, shell, groundAt } = this.d;
    dt = Math.min(dt, 1 / 20);
    if (this.endT) {
      this.endT += dt;
      player.setShake(camFx.update(dt));
      player.syncCamera(dt, 0);
      if (this.endT > 2.4) this.finish(true);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    if (this.phase === "lift") {
      const step = (k: "left" | "right") => {
        if (this.lastKey === k) return;
        this.lastKey = k;
        this.lift = Math.min(1, this.lift + CFG.liftStep);
        camFx.addTrauma(0.05);
        if (Math.random() < 0.35) audio.play("land", { volume: 0.25, pitch: 0.6 });
      };
      if (input.wasPressed("left")) step("left");
      if (input.wasPressed("right")) step("right");
      this.lift = Math.max(0, this.lift - CFG.liftDecay * dt * (1 - this.lift * 0.5));
      // Bent over the shell, straightening up as it comes up.
      player.pitch = lerp(0.7, 0.12, this.lift);
      if (this.lift >= 0.97) {
        shell.setEnabled(false);
        held.setEnabled(true);
        audio.play("land", { volume: 0.7, pitch: 0.5 });
        camFx.addTrauma(0.3);
        this.showFeedback("YA ALLAH!<small>276 kiloluk mermi Seyit Onbaşı'nın sırtında.</small>", "#ffd36a");
        this.setPhase("carry");
      }
      this.liftFill.style.width = `${this.lift * 100}%`;
      // From the ground in front of him up onto his right shoulder, nose forward.
      held.position.set(lerp(0.05, 0.44, this.lift), lerp(-1.2, -0.06, this.lift), lerp(0.55, 0.32, this.lift));
      held.rotation.y = lerp(0, Math.PI / 2 - 0.12, this.lift);
    } else if (this.phase === "carry") {
      this.stumbleT = Math.max(0, this.stumbleT - dt);
      // The load sways and wants to keep going the way it leans.
      const n = this.noise.noise(this.elapsed * 0.9, 3.7) * CFG.wobble + Math.sin(this.elapsed * 1.7) * 0.15;
      let lean = 0;
      if (input.isDown("left")) lean -= 1;
      if (input.isDown("right")) lean += 1;
      this.tiltVel += (this.tilt * 1.15 + n + lean * 2.1) * dt;
      this.tiltVel *= 1 - 1.6 * dt;
      this.tilt += this.tiltVel * dt;
      if (Math.abs(this.tilt) > CFG.tip) {
        this.stumbles++;
        this.tilt = 0;
        this.tiltVel = 0;
        this.stumbleT = 1.4;
        this.dist = Math.max(0, this.dist - 1);
        camFx.addTrauma(0.5);
        audio.play("land", { volume: 0.6, pitch: 0.5 });
        this.showFeedback("SENDELEDİ!<small>Dizini yere vurdu — doğrulup devam ediyor.</small>", "#f0b54a");
      }
      if (this.stumbleT <= 0) this.dist += CFG.walkSpeed * (1 - Math.min(0.6, Math.abs(this.tilt) * 0.5)) * dt;
      this.stepT += dt;
      if (this.stepT > 0.62 && this.stumbleT <= 0) {
        this.stepT = 0;
        audio.play("footstepWood", { volume: 0.25, pitch: 0.7 });
        camFx.addTrauma(0.06);
      }
      const at = this.along(this.dist);
      player.position.set(at.p.x, groundAt(at.p.x, at.p.z), at.p.z);
      player.yaw = lerp(player.yaw, at.yaw + this.tilt * 0.12, clamp(dt * 3, 0, 1));
      player.pitch = lerp(player.pitch, 0.18 + Math.abs(this.tilt) * 0.08, clamp(dt * 3, 0, 1));
      held.position.set(0.44 + this.tilt * 0.06, -0.06 - Math.abs(this.tilt) * 0.05, 0.32);
      held.rotation.z = this.tilt * 0.35;
      this.tiltNeedle.style.left = `${clamp(0.5 + this.tilt / (CFG.tip * 2), 0, 1) * 100}%`;
      this.tiltNeedle.classList.toggle("danger", Math.abs(this.tilt) > CFG.tip * 0.65);
      if (this.dist >= this.total - 0.05) {
        this.setPhase("load");
        this.loadT = 0;
        player.pitch = 0.3;
      }
    } else if (this.phase === "load") {
      this.loadT += dt;
      const m = 0.5 + Math.sin(this.loadT * 2.6) * 0.5;
      this.loadMarker.style.left = `${m * 100}%`;
      if (input.wasPressed("interact") || input.wasPressed("jump")) {
        if (Math.abs(m - 0.5) < 0.11) {
          held.setEnabled(false);
          audio.play("metalClank", { volume: 0.8, pitch: 0.7 });
          audio.play("cheer", { volume: 0.5 });
          camFx.addTrauma(0.2);
          this.showFeedback("MERMİ KAMADA!<small>Mecidiye'nin topu yeniden konuşacak.</small>", "#9fd26b");
          this.phase = "done";
          this.endT = 0.001;
        } else {
          this.tries++;
          audio.play("metalClank", { volume: 0.4, pitch: 1.2 });
          this.showFeedback("YERİNE OTURMADI — BİR DAHA!", "#f0b54a");
        }
      }
    }
    setText(this.stats, this.phase === "lift" ? `Kaldırılan: ${Math.round(this.lift * 100)}%` : `Topa kalan: ${Math.max(0, this.total - this.dist).toFixed(1)} m · Sendeleme: ${this.stumbles}`);
    player.setShake(camFx.update(dt));
    player.syncCamera(dt, 0);
  }

  protected onEnd(success: boolean): void {
    const { player, mobile, hud, held, shell } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    held.setEnabled(false);
    held.rotation.set(0, 0, 0);
    if (!success) shell.setEnabled(true);
  }

  /** QA helper for the test bot. */
  get qa(): { phase: Phase; lift: number; tilt: number; tiltVel: number; dist: number; total: number; load: number } {
    return { phase: this.phase, lift: this.lift, tilt: this.tilt, tiltVel: this.tiltVel, dist: this.dist, total: this.total, load: 0.5 + Math.sin(this.loadT * 2.6) * 0.5 };
  }
}
