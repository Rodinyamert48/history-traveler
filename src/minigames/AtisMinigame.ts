import { Color4, Vector3, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { Player } from "../entities/Player";
import type { RangeTarget } from "../scenarios/samsun/SamsunWorld";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, lerp } from "../utils/math";
import { Random } from "../utils/random";
import { asciiBar, BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.atis;

export interface AtisMinigameDeps {
  layer: HTMLElement;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  stand: Vector3;
  facing: number;
  targets: RangeTarget[];
  /** First-person Mauser (child of the player's hand). */
  rifle: TransformNode;
}

const RINGS: [number, number][] = [
  [0.1, 10],
  [0.27, 8],
  [0.45, 6],
  [0.62, 4],
  [0.8, 2],
];

/**
 * MINIGAME — "Nişan Talimi".
 * Target boards flip up one at a time down the slope (25–80 m). Aim with the mouse, fire
 * (click / ATEŞ), work the bolt, and reload after five rounds. The aim sways with your
 * breathing; hold SHIFT (NEFES) to steady it for a few seconds.
 */
export class AtisMinigame extends BaseMinigame {
  private popups = 0;
  private hits = 0;
  private points = 0;
  private ammo = 0;
  private inClip = 0;
  private bolt = 0;
  private reload = 0;
  private breath = 0;
  private holding = false;
  private current = -1;
  private upLeft = 0;
  private gap = 0;
  private kick = 0;
  private lastSway: [number, number] = [0, 0];
  private done = 0;
  private rnd = new Random(519);
  private faces: number[] = [];
  private feedback!: HTMLDivElement;
  private ammoEl!: HTMLDivElement;
  private breathFill!: HTMLDivElement;
  private bar!: HTMLDivElement;
  private ascii!: HTMLDivElement;
  private pct!: HTMLSpanElement;
  private stats!: HTMLDivElement;

  constructor(private readonly d: AtisMinigameDeps) {
    super(d.layer);
  }

  private get upTime(): number {
    return lerp(CFG.upTime[0], CFG.upTime[1], this.popups / CFG.popups);
  }

  protected onStart(): void {
    const { player, mobile, hud, stand, facing } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    player.position.set(stand.x, stand.y, stand.z);
    player.yaw = facing;
    player.pitch = 0.08;
    player.yawLimit = { center: facing, range: 0.75 };
    player.pitchLimit = { min: -0.15, max: 0.5 };
    mobile.setActionButtons([
      { label: "ATEŞ", action: "fire" },
      { label: "NEFES", action: "sprint" },
      { label: "BIRAK", action: "action" },
    ]);
    mobile.setLayout("action");
    hud.setCrosshair(true);
    this.popups = 0;
    this.hits = 0;
    this.points = 0;
    this.ammo = CFG.ammo;
    this.inClip = CFG.clip;
    this.bolt = 0;
    this.reload = 0;
    this.breath = CFG.breathMax;
    this.current = -1;
    this.gap = 1.6;
    this.done = 0;
    this.faces = this.d.targets.map(() => -Math.PI / 2);
    this.lastSway = [0, 0];
    for (const t of this.d.targets) t.face.rotation.x = -Math.PI / 2;
    this.d.rifle.setEnabled(true);
    this.buildUi();
  }

  private buildUi(): void {
    const u = this.ui;
    this.feedback = el("div", "rhythm-feedback high", u);
    const side = el("div", "atis-side", u);
    this.ammoEl = el("div", "atis-ammo", side);
    const br = el("div", "atis-breath", side);
    el("span", "", br, "NEFES");
    const track = el("div", "atis-breath-track", br);
    this.breathFill = el("div", "atis-breath-fill", track);
    const panel = el("div", "mg-panel", u);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "NİŞAN TALİMİ");
    this.pct = el("span", "mg-value", row, "0%");
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    this.ascii = el("div", "mg-ascii", panel, asciiBar(0));
    this.stats = el("div", "mg-stats", panel);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "Ekranı sürükleyerek nişan al · ATEŞ · NEFES'i basılı tut: titreme azalır"
        : "Fareyle nişan al · Sol tık: ateş · SHIFT basılı: nefesini tut · E: şarjör değiştir · F: bırak",
    );
  }

  private showFeedback(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private popNext(): void {
    if (this.popups >= CFG.popups) return;
    let i = this.rnd.int(0, this.d.targets.length - 1);
    if (i === this.current) i = (i + 1) % this.d.targets.length;
    this.current = i;
    this.popups++;
    this.upLeft = this.upTime;
    this.d.audio.play("woodCreak", { volume: 0.4, at: this.d.targets[i].center, refDistance: 30 });
  }

  private dropCurrent(hit: boolean): void {
    if (this.current < 0) return;
    if (!hit) this.showFeedback("HEDEF KAÇTI", "#f0b54a");
    this.current = -1;
    this.gap = this.rnd.range(0.7, 1.4);
  }

  private shoot(): void {
    const { audio, player, camFx, fx } = this.d;
    if (this.reload > 0 || this.bolt > 0) return;
    if (this.inClip <= 0) {
      audio.play("uiClick", { volume: 0.4, pitch: 0.6 });
      this.startReload();
      return;
    }
    this.inClip--;
    this.ammo--;
    this.bolt = CFG.boltTime;
    this.kick = 1;
    audio.play("rifleShot", { volume: 0.9 });
    camFx.addTrauma(0.18);
    window.setTimeout(() => this.active && audio.play("boltAction", { volume: 0.5 }), 260);
    // Ray through the crosshair (the sway moves the view itself, so what you see is where it goes).
    const cam = player.camera;
    const dir = cam.getDirection(new Vector3(0, 0, 1)).normalize();
    const origin = cam.globalPosition.clone();
    if (this.current >= 0 && this.faces[this.current] > -0.25) {
      const t = this.d.targets[this.current];
      const denom = Vector3.Dot(dir, t.normal);
      if (Math.abs(denom) > 1e-4) {
        const dist = Vector3.Dot(t.center.subtract(origin), t.normal) / denom;
        const p = origin.add(dir.scale(dist));
        const off = Vector3.Distance(p, t.center);
        const ring = RINGS.find(([r]) => off <= r);
        if (ring && dist > 0) {
          this.hits++;
          this.points += ring[1];
          fx.dustPuff(p, 6, new Color4(0.85, 0.78, 0.6, 0.7));
          audio.play("woodKnock", { volume: 0.7, pitch: 1.3 });
          audio.play(ring[1] >= 8 ? "perfect" : "good", { volume: 0.45 });
          this.showFeedback(ring[1] === 10 ? "TAM ON İKİDEN!" : `İSABET · ${ring[1]} PUAN`, ring[1] >= 8 ? "#ffd36a" : "#9fd26b");
          this.dropCurrent(true);
          this.checkEnd();
          return;
        }
      }
    }
    this.showFeedback("ISKA", "#e2655a");
    // A puff of dust where the bullet hits the slope.
    for (let s = 10; s < 140; s += 4) {
      const q = origin.add(dir.scale(s));
      if (q.y < player.position.y - 30) break;
      const gy = this.groundY(q.x, q.z);
      if (q.y <= gy) {
        fx.dustPuff(new Vector3(q.x, gy, q.z), 5, new Color4(0.55, 0.45, 0.32, 0.7));
        break;
      }
    }
    this.checkEnd();
  }

  /** Terrain height from the scene's ground function (set by the hosting scene). */
  groundY: (x: number, z: number) => number = () => -999;

  private startReload(): void {
    if (this.reload > 0 || this.inClip === CFG.clip || this.ammo <= 0) return;
    this.reload = CFG.reloadTime;
    this.d.audio.play("reload", { volume: 0.6 });
  }

  private sway(): [number, number] {
    const steady = this.holding ? CFG.breathSteady : 1;
    const a = CFG.sway * steady;
    const t = this.elapsed;
    return [Math.sin(t * 1.3) * a + Math.sin(t * 3.1) * a * 0.3, Math.sin(t * 1.7 + 1) * a * 0.8];
  }

  private checkEnd(): void {
    if (this.hits >= CFG.hitsNeeded) {
      this.end(true);
      return;
    }
    const remaining = CFG.popups - this.popups + (this.current >= 0 ? 1 : 0);
    if (this.hits + Math.min(remaining, this.ammo) < CFG.hitsNeeded) this.end(false);
  }

  private end(ok: boolean): void {
    if (this.done) return;
    this.done = ok ? 0.001 : -0.001;
    this.showFeedback(ok ? "ÇAVUŞ: AFERİN EVLAT!" : "ÇAVUŞ: OLMADI, BİR DAHA!", ok ? "#9fd26b" : "#e2655a");
    this.d.audio.play(ok ? "objective" : "miss", { volume: 0.8 });
  }

  protected update(dt: number): void {
    const { input, player, rifle } = this.d;
    if (this.done) {
      this.done += Math.sign(this.done) * dt;
      player.syncCamera(dt, 0);
      if (Math.abs(this.done) > 1.8) this.finish(this.done > 0);
      return;
    }
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }
    // Breath: hold to steady the aim, it runs out and refills.
    this.holding = input.isDown("sprint") && this.breath > 0;
    this.breath = clamp(this.breath + (this.holding ? -dt : dt * 0.6), 0, CFG.breathMax);
    if (this.bolt > 0) this.bolt = Math.max(0, this.bolt - dt);
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) {
        this.reload = 0;
        this.inClip = Math.min(CFG.clip, this.ammo);
        this.d.audio.play("boltAction", { volume: 0.6 });
      }
    }
    if (input.wasPressed("fire")) this.shoot();
    if (input.wasPressed("interact")) this.startReload();
    if (this.inClip <= 0 && this.ammo > 0 && this.reload <= 0) this.startReload();

    // Targets: flip the current one up, the others down; time them out.
    if (this.current >= 0) {
      this.upLeft -= dt;
      if (this.upLeft <= 0) {
        this.dropCurrent(false);
        this.checkEnd();
      }
    } else if (this.popups < CFG.popups) {
      this.gap -= dt;
      if (this.gap <= 0) this.popNext();
    } else this.checkEnd();
    this.d.targets.forEach((t, i) => {
      const want = i === this.current ? 0 : -Math.PI / 2;
      this.faces[i] = lerp(this.faces[i], want, clamp(dt * (want === 0 ? 9 : 6), 0, 1));
      t.face.rotation.x = this.faces[i];
    });

    // Recoil; the breathing sway drifts the view itself.
    this.kick = Math.max(0, this.kick - dt * 5);
    const [sx, sy] = this.sway();
    player.yaw += sx - this.lastSway[0];
    player.pitch += sy - this.lastSway[1];
    this.lastSway = [sx, sy];
    rifle.position.set(0.14, -0.17 - (this.reload > 0 ? 0.12 : 0), 0.32 - this.kick * 0.08);
    rifle.rotation.set(-this.kick * 0.18 + (this.reload > 0 ? 0.5 : 0), 0, 0);
    player.updateLook();
    player.pitch += this.kick * dt * 0.6;
    player.setShake(this.d.camFx.update(dt));
    player.syncCamera(dt, 0);
    this.updateUi();
  }

  private updateUi(): void {
    const k = this.hits / CFG.hitsNeeded;
    this.bar.style.width = `${(clamp(k, 0, 1) * 100).toFixed(1)}%`;
    setText(this.ascii, asciiBar(clamp(k, 0, 1)));
    setText(this.pct, `${Math.round(clamp(k, 0, 1) * 100)}%`);
    this.stats.innerHTML = `İsabet: <b>${this.hits}/${CFG.hitsNeeded}</b> · Hedef: <b>${this.popups}/${CFG.popups}</b> · Puan: <b>${this.points}</b>`;
    const rounds = "▮".repeat(this.inClip) + "▯".repeat(CFG.clip - this.inClip);
    this.ammoEl.innerHTML = this.reload > 0 ? "ŞARJÖR DEĞİŞİYOR…" : `${rounds}<span>Mühimmat: ${this.ammo}</span>`;
    this.breathFill.style.width = `${(this.breath / CFG.breathMax) * 100}%`;
    this.breathFill.classList.toggle("holding", this.holding);
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.lookEnabled = true;
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    this.d.rifle.setEnabled(false);
    for (const t of this.d.targets) t.face.rotation.x = -Math.PI / 2;
  }

  /** QA helper: the standing target's centre (or null). */
  get qa(): { target: Vector3 | null; up: boolean; hits: number; popups: number; ready: boolean } {
    const t = this.current >= 0 ? this.d.targets[this.current] : null;
    return { target: t ? t.center : null, up: this.current >= 0 && this.faces[this.current] > -0.25, hits: this.hits, popups: this.popups, ready: this.bolt <= 0 && this.reload <= 0 && this.inClip > 0 };
  }
}
