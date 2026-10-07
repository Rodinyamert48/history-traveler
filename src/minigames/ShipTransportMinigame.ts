import { Quaternion, Vector3, type InstancedMesh, type Mesh, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { Modal } from "../ui/Modals";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, formatTime, lerp } from "../utils/math";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.ship;
/** Speed impulse (m/s) of one "good" pull. */
const IMPULSE = 3.2;
const FRICTION = 1.25;
const SLOPE_GRAVITY = 3;

export interface ShipMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  modal: Modal;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  ship: TransformNode;
  rope: Mesh;
  /** Path from the Bosphorus shore to the Golden Horn shore (+ a short in-water extension). */
  path: [number, number][];
  /** Distance along `path` where the slipway meets the Golden Horn. */
  goalDistance: number;
  startDistance: number;
  groundAt(x: number, z: number): number;
  crew: NPC[];
  drummer: NPC | null;
}

type Grade = "perfect" | "good" | "early" | "late" | "spam";

/**
 * MINIGAME 1 — "Gemileri Karadan Yürütme".
 * Rhythm-based hauling: the davul beats every ~1 s; pressing SPACE (or the big ÇEK button)
 * on the beat gives a strong pull (+combo), early/late presses give weak pulls. The ship has
 * real momentum along the slipway: friction slows it and the uphill half pulls it back, so
 * slow play loses ground — but a timeout only offers more time, never a hard fail.
 */
export class ShipTransportMinigame extends BaseMinigame {
  private s = 0;
  private speed = 0;
  private timeLeft: number = CFG.duration;
  private combo = 0;
  private bestCombo = 0;
  private beatIndex = -1;
  private lastScoredBeat = -1;
  private beatClock = 0;
  private finishing = 0;
  private splashed = false;
  private pathLen: number[] = [];
  private totalLen = 0;
  private ropes: InstancedMesh[] = [];
  private pulse = 0;
  private dustTimer = 0;
  private timeoutOpen = false;
  // UI
  private bar!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private ascii!: HTMLDivElement;
  private timer!: HTMLElement;
  private comboEl!: HTMLElement;
  private ring!: HTMLDivElement;
  private target!: HTMLDivElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: ShipMinigameDeps) {
    super(d.layer);
    const p = d.path;
    this.pathLen = [0];
    for (let i = 1; i < p.length; i++) this.pathLen.push(this.pathLen[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    this.totalLen = this.pathLen[this.pathLen.length - 1];
    this.s = d.startDistance;
  }

  get progress(): number {
    return clamp((this.s - this.d.startDistance) / (this.d.goalDistance - this.d.startDistance), 0, 1);
  }

  private sample(dist: number): { x: number; z: number; dx: number; dz: number } {
    const p = this.d.path;
    const s = clamp(dist, 0, this.totalLen - 0.001);
    for (let i = 1; i < p.length; i++) {
      if (this.pathLen[i] >= s) {
        const seg = this.pathLen[i] - this.pathLen[i - 1];
        const t = (s - this.pathLen[i - 1]) / seg;
        const dx = (p[i][0] - p[i - 1][0]) / seg;
        const dz = (p[i][1] - p[i - 1][1]) / seg;
        return { x: lerp(p[i - 1][0], p[i][0], t), z: lerp(p[i - 1][1], p[i][1], t), dx, dz };
      }
    }
    const n = p.length - 1;
    return { x: p[n][0], z: p[n][1], dx: 0, dz: 1 };
  }

  private heightAt(dist: number): number {
    const q = this.sample(dist);
    return Math.max(this.d.groundAt(q.x, q.z) + 0.55, 0.12);
  }

  protected onStart(): void {
    const { player, mobile, hud, audio } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    mobile.setLayout("ship");
    hud.setCrosshair(false);
    audio.stopMusic(1);
    this.timeLeft = Math.max(this.timeLeft, 30);
    this.beatClock = 0;
    this.beatIndex = -1;
    this.lastScoredBeat = -1;
    this.buildUi();
    for (let i = 0; i < 4; i++) {
      const r = this.d.rope.createInstance(`rope#${i}`);
      r.isPickable = false;
      this.ropes.push(r);
    }
    this.d.rope.setEnabled(true);
    this.d.rope.isVisible = false;
    for (const npc of this.d.crew) npc.setBehavior({ type: "scripted" });
    if (this.d.drummer) this.d.drummer.setBehavior({ type: "scripted" });
    const q = this.sample(this.s);
    player.yaw = Math.atan2(q.dx, q.dz) + 0.32;
    player.pitch = 0.04;
    this.placeActors(0);
  }

  private buildUi(): void {
    const u = this.ui;
    const rhythm = el("div", "rhythm", u);
    this.target = el("div", "rhythm-target", rhythm);
    this.ring = el("div", "rhythm-ring", rhythm);
    el("div", "rhythm-key", rhythm, this.d.input.isTouch ? "ÇEK" : "SPACE");
    this.feedback = el("div", "rhythm-feedback", u);
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "GEMİYİ HALİÇ'E ULAŞTIR");
    this.timer = el("div", "mg-value", row, "1:20");
    const row2 = el("div", "mg-row", panel);
    el("div", "hud-label", row2, "SHIP PROGRESS · GEMİ İLERLEMESİ");
    this.pct = el("span", "mg-value", row2, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    el("div", "mg-bar-ticks", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    const stats = el("div", "mg-stats", panel);
    this.comboEl = el("span", "", stats, "Kombo: <b>0</b>");
    el("span", "", stats, this.d.input.isTouch ? "ÇEK → kürek çek / it" : "SPACE → kürek çek / it");
    el("div", "hint-line", panel, "Davulun vuruşuna denk getir: halka hedef çembere oturduğunda bas!");
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private grade(): Grade {
    const I = CFG.beatInterval;
    const nearest = Math.round(this.beatClock / I);
    const offset = this.beatClock - nearest * I;
    if (nearest === this.lastScoredBeat) return "spam";
    this.lastScoredBeat = nearest;
    const a = Math.abs(offset);
    if (a <= CFG.perfectWindow) return "perfect";
    if (a <= CFG.goodWindow) return "good";
    return offset < 0 ? "early" : "late";
  }

  private onPull(): void {
    const g = this.grade();
    let power: number;
    switch (g) {
      case "perfect":
        power = CFG.perfectPower;
        this.combo++;
        this.showFeedback(this.combo >= 3 ? `MÜKEMMEL! x${this.combo}` : "MÜKEMMEL!", "#ffd36a");
        this.d.audio.play("perfect", { volume: 0.7 });
        this.d.audio.play("chant", { volume: 0.7, pitch: 0.95 + Math.random() * 0.1 });
        break;
      case "good":
        power = CFG.goodPower;
        this.combo++;
        this.showFeedback("İYİ", "#f3ead8");
        this.d.audio.play("good", { volume: 0.5 });
        this.d.audio.play("chant", { volume: 0.5 });
        break;
      case "early":
        power = CFG.weakPower;
        this.combo = 0;
        this.showFeedback("ERKEN", "#f0b54a");
        this.d.audio.play("miss", { volume: 0.4 });
        break;
      case "late":
        power = CFG.weakPower;
        this.combo = 0;
        this.showFeedback("GEÇ", "#f0b54a");
        this.d.audio.play("miss", { volume: 0.4 });
        break;
      default:
        power = 0.2;
        this.showFeedback("ÇOK HIZLI", "#e2655a");
    }
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const comboBonus = Math.min(CFG.maxComboBonus, this.combo * CFG.comboBonusStep);
    this.speed += power * IMPULSE * (1 + comboBonus);
    this.pulse = 1;
    if (power >= 1) this.d.audio.play("woodCreak", { volume: 0.5, pitch: 0.8 + Math.random() * 0.4 });
  }

  protected update(dt: number): void {
    const { input, player } = this.d;
    if (this.timeoutOpen) return;
    const I = CFG.beatInterval;
    this.beatClock += dt;
    const idx = Math.floor(this.beatClock / I);
    if (idx !== this.beatIndex) {
      this.beatIndex = idx;
      if (!this.finishing) this.d.audio.play("drum", { volume: 0.9 });
      this.target.animate([{ transform: "translate(-50%,-50%) scale(1.25)" }, { transform: "translate(-50%,-50%) scale(1)" }], { duration: 180 });
    }
    if (!this.finishing && input.wasPressed("jump")) this.onPull();

    // Ship physics along the path.
    const slope = (this.heightAt(this.s + 4) - this.heightAt(this.s - 4)) / 8;
    this.speed *= Math.exp(-FRICTION * dt);
    this.speed -= slope * SLOPE_GRAVITY * dt;
    if (this.finishing) this.speed = Math.max(this.speed, 3.2);
    this.speed = clamp(this.speed, -0.7, 9);
    this.s = clamp(this.s + this.speed * dt, this.d.startDistance - 3, this.totalLen - 0.5);

    if (!this.finishing) {
      this.timeLeft -= dt;
      if (this.s >= this.d.goalDistance) {
        this.finishing = 0.001;
        this.d.audio.play("cheer", { volume: 0.9 });
        this.d.audio.play("fanfare", { volume: 0.8 });
        this.showFeedback("HALİÇ'E İNİYOR!", "#9fd26b");
      } else if (this.timeLeft <= 0) {
        this.onTimeout();
        return;
      }
    } else {
      this.finishing += dt;
      if (!this.splashed && this.heightAt(this.s) <= 0.2) {
        this.splashed = true;
        const p = this.d.ship.position;
        this.d.fx.splash(new Vector3(p.x, 0.2, p.z));
        this.d.audio.play("splash", { volume: 1 });
      }
      if (this.finishing > 4.2 || this.s >= this.totalLen - 1) {
        this.finish(true);
        return;
      }
    }

    this.placeActors(dt);
    player.updateLook();
    player.syncCamera(dt, this.finishing ? 0 : Math.abs(this.speed));
    this.updateUi();
  }

  private onTimeout(): void {
    this.timeoutOpen = true;
    this.d.player.lookEnabled = false;
    this.d.modal.show(
      "SÜRE DOLDU",
      `<p>Gemi henüz Haliç'e ulaşmadı (${Math.round(this.progress * 100)}%). Ekip yorulmadı — devam edebilirsin!</p>`,
      [
        {
          label: "Devam Et (+30 sn)",
          primary: true,
          onClick: () => {
            this.d.modal.hide();
            this.timeLeft = 30;
            this.timeoutOpen = false;
            this.d.player.lookEnabled = true;
          },
        },
        {
          label: "Vazgeç",
          onClick: () => {
            this.d.modal.hide();
            this.timeoutOpen = false;
            this.finish(false);
          },
        },
      ],
    );
    // The modal needs a visible cursor; it is open, so releasing the lock won't pause the game.
    this.d.input.exitPointerLock();
  }

  /** Positions ship, crew, ropes and the player from the current path distance. */
  private placeActors(dt: number): void {
    const q = this.sample(this.s);
    const heading = Math.atan2(q.dx, q.dz);
    const hBack = this.heightAt(this.s - 7);
    const hFront = this.heightAt(this.s + 7);
    const ship = this.d.ship;
    ship.position.set(q.x, this.heightAt(this.s), q.z);
    ship.rotation.y = heading;
    ship.rotation.x = -Math.atan2(hFront - hBack, 14);
    ship.computeWorldMatrix(true);
    const m = ship.getWorldMatrix();
    const local = (x: number, y: number, z: number) => Vector3.TransformCoordinates(new Vector3(x, y, z), m);
    const groundPoint = (lx: number, lz: number) => {
      const p = local(lx, 0, lz);
      p.y = this.d.groundAt(p.x, p.z);
      return p;
    };
    this.pulse = Math.max(0, this.pulse - dt * 3);
    const moving = Math.abs(this.speed) > 0.25;
    // Crew: 4 pullers ahead (ropes), 4 pushers at the stern.
    const slots: [number, number, "pull" | "push"][] = [
      [-1.6, 17, "pull"],
      [1.6, 18.5, "pull"],
      [-1.8, 21, "pull"],
      [1.8, 22.5, "pull"],
      [-2.9, -9, "push"],
      [2.9, -9.5, "push"],
      [-2.9, -6, "push"],
      [2.9, -6.5, "push"],
    ];
    this.d.crew.forEach((npc, i) => {
      const [lx, lz, anim] = slots[i % slots.length];
      const p = groundPoint(lx, lz);
      npc.position.copyFrom(p);
      npc.heading = heading;
      npc.anim = moving || this.pulse > 0 ? anim : "idle";
      npc.animSpeed = 0.8 + Math.abs(this.speed) * 0.2;
      npc.lean = this.pulse;
      npc.applyTransform();
    });
    if (this.d.drummer) {
      const p = local(0, 1.9, -6);
      this.d.drummer.position.copyFrom(p);
      this.d.drummer.heading = heading;
      this.d.drummer.anim = "work";
      this.d.drummer.animSpeed = 1.2;
      this.d.drummer.applyTransform();
    }
    // Ropes from the bow to each puller's hands.
    const bow = local(0, 1.6, 11.5);
    this.ropes.forEach((rope, i) => {
      const npc = this.d.crew[i];
      if (!npc) {
        rope.setEnabled(false);
        return;
      }
      const hand = npc.position.add(new Vector3(0, 1.05, 0));
      const dir = hand.subtract(bow);
      const len = dir.length();
      dir.normalize();
      rope.position.copyFrom(bow);
      rope.scaling.set(1, len, 1);
      rope.rotationQuaternion = rope.rotationQuaternion ?? new Quaternion();
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, rope.rotationQuaternion);
    });
    // Player walks alongside (port side, clear of the oars) a little ahead of midship.
    const playerS = Math.min(this.s + 5, this.d.goalDistance - 2);
    const pq = this.sample(playerS);
    const ph = Math.atan2(pq.dx, pq.dz);
    const px = pq.x - Math.cos(ph) * 9.5;
    const pz = pq.z + Math.sin(ph) * 9.5;
    this.d.player.position.set(px, this.d.groundAt(px, pz), pz);
    // Dust where the hull rides the rollers.
    this.dustTimer -= dt;
    if (moving && this.dustTimer <= 0 && this.heightAt(this.s) > 0.6) {
      this.dustTimer = 0.35;
      this.d.fx.dustPuff(groundPoint(0, -8), 6);
    }
  }

  private updateUi(): void {
    const prog = this.progress;
    this.bar.style.width = `${(prog * 100).toFixed(1)}%`;
    setText(this.pct, `${Math.round(prog * 100)}%`);
    setText(this.ascii, asciiBar(prog));
    setText(this.timer, formatTime(this.timeLeft));
    this.timer.style.color = this.timeLeft < 15 ? "#e2655a" : "";
    this.comboEl.innerHTML = `Kombo: <b>${this.combo}</b> · En iyi: <b>${this.bestCombo}</b>`;
    const I = CFG.beatInterval;
    const toNext = I - (this.beatClock % I);
    const scale = 1 + 1.7 * (toNext / I);
    this.ring.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
    this.ring.style.opacity = String(clamp(1.25 - toNext / I, 0.15, 1));
  }

  protected onEnd(success: boolean): void {
    const { player, mobile, hud } = this.d;
    for (const r of this.ropes) r.dispose();
    this.ropes = [];
    this.d.rope.setEnabled(false);
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    player.controlEnabled = true;
    player.lookEnabled = true;
    for (const npc of this.d.crew) {
      npc.lean = 0;
      npc.animSpeed = 1;
      npc.setBehavior({ type: "pose", anim: success ? "cheer" : "idle" });
    }
    if (this.d.drummer) this.d.drummer.setBehavior({ type: "pose", anim: success ? "cheer" : "idle" });
    if (!success) return;
    // Settle the ship afloat in the Golden Horn.
    const p = this.d.ship.position;
    p.y = 0.15;
    this.d.ship.rotation.x = 0;
  }

  get bestComboValue(): number {
    return this.bestCombo;
  }
}
