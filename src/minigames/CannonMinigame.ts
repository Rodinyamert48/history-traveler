import { Mesh, Vector3, type InstancedMesh, type Scene, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GeoBuilder, hexColor } from "../assets/GeoBuilder";
import { GAME_CONFIG } from "../config/gameConfig";
import type { InputManager } from "../core/InputManager";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { MaterialLibrary } from "../rendering/MaterialLibrary";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import type { MobileControls } from "../ui/MobileControls";
import { el, setText } from "../ui/dom";
import { clamp, degToRad, radToDeg } from "../utils/math";
import type { BoxCollider } from "../world/CollisionWorld";
import { BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.cannon;

export interface CannonTargetRef {
  id: string;
  name: string;
  center: Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  breakable: { setEnabled(v: boolean): void; position: Vector3; rotation: Vector3; scaling: Vector3 }[];
  marker: { setEnabled(v: boolean): void };
}

export interface CannonMinigameDeps {
  layer: HTMLElement;
  scene: Scene;
  input: InputManager;
  audio: AudioManager;
  hud: HUD;
  mobile: MobileControls;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  materials: MaterialLibrary;
  base: TransformNode;
  yaw: TransformNode;
  pitch: TransformNode;
  recoil: TransformNode;
  muzzle: TransformNode;
  targets: CannonTargetRef[];
  solids: BoxCollider[];
  groundAt(x: number, z: number): number;
  crew: NPC[];
  /** Called when a target is destroyed (scenario reacts: breach, rubble…). */
  onTargetDestroyed(id: string): void;
}

interface Shot {
  mesh: Mesh;
  pos: Vector3;
  vel: Vector3;
  alive: boolean;
  trail: number;
}

/**
 * MINIGAME 2 — "Topçuluk". The player mans the Şahi bombard: mouse = direction (barrel
 * follows the view yaw), mouse wheel or Q/E = elevation, left click = fire. Ballistic
 * projectile with gravity and light drag, hit tests against the wall targets, stylized
 * smoke / muzzle flash / debris, camera shake and short/long feedback for adjusting aim.
 */
export class CannonMinigame extends BaseMinigame {
  private elevation = degToRad(10);
  private reload = 0;
  private shots: Shot[] = [];
  private shotCount = 0;
  private preview: InstancedMesh[] = [];
  private previewSource: Mesh;
  private ballSource: Mesh;
  private recoilT = 0;
  private winTimer = 0;
  private baseYaw = Math.PI / 2;
  // UI
  private gaugeFill!: HTMLDivElement;
  private gaugeLabel!: HTMLDivElement;
  private info!: HTMLDivElement;
  private reloadFill!: HTMLDivElement;
  private list!: HTMLUListElement;
  private feedback!: HTMLDivElement;

  constructor(private readonly d: CannonMinigameDeps) {
    super(d.layer);
    const b = new GeoBuilder();
    b.sphere(0, 0, 0, 0.36, { segments: 8, rings: 6, color: hexColor("#9d968a") });
    this.ballSource = b.toMesh("cannonball-src", d.scene);
    this.ballSource.material = d.materials.get("stone");
    this.ballSource.isVisible = false;
    const pb = new GeoBuilder();
    pb.sphere(0, 0, 0, 0.12, { segments: 5, rings: 3, color: [1, 1, 1, 1] });
    this.previewSource = pb.toMesh("aim-preview", d.scene);
    this.previewSource.material = d.materials.get("fire");
    this.previewSource.isVisible = false;
    this.previewSource.isPickable = false;
  }

  get remaining(): number {
    return this.d.targets.filter((t) => t.hp > 0).length;
  }

  protected onStart(): void {
    const { player, mobile, hud, base } = this.d;
    player.controlEnabled = false;
    player.lookEnabled = true;
    this.baseYaw = base.rotation.y + Math.PI / 2;
    player.yaw = this.baseYaw;
    player.pitch = degToRad(2);
    player.yawLimit = { center: this.baseYaw, range: degToRad(CFG.yawLimitDeg) };
    player.pitchLimit = { min: -0.45, max: 0.35 };
    // Stand on the gun's rear step, slightly left of the barrel, so the walls stay visible.
    const bp = base.getAbsolutePosition();
    player.position.set(bp.x - 4.4, this.d.groundAt(bp.x - 4.4, bp.z + 1.1) + 0.75, bp.z + 1.1);
    mobile.setLayout("cannon");
    hud.setCrosshair(false);
    this.d.audio.playMusic("tension");
    for (const t of this.d.targets) t.marker.setEnabled(t.hp > 0);
    for (let i = 0; i < 14; i++) {
      const m = this.previewSource.createInstance(`aim#${i}`);
      m.isPickable = false;
      this.preview.push(m);
    }
    for (const npc of this.d.crew) npc.setBehavior({ type: "pose", anim: "guard" });
    this.buildUi();
  }

  private buildUi(): void {
    const u = el("div", "cannon-hud", this.ui);
    el("div", "cannon-reticle", u);
    const gauge = el("div", "elevation-gauge", u);
    this.gaugeFill = el("div", "elevation-gauge-fill", gauge);
    this.gaugeLabel = el("div", "elevation-gauge-label", gauge);
    const rb = el("div", "reload-bar", u);
    this.reloadFill = el("div", "reload-bar-fill", rb);
    const tl = el("div", "target-list", u);
    el("div", "hud-label", tl, "Hedefler");
    this.list = el("ul", "", tl);
    this.feedback = el("div", "rhythm-feedback", u);
    this.feedback.style.top = "32%";
    const panel = el("div", "mg-panel", this.ui);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "ŞAHİ TOPU");
    this.info = el("div", "mg-value", row);
    el(
      "div",
      "hint-line",
      panel,
      this.d.input.isTouch
        ? "Sürükle: yön · ▲▼: açı · ATEŞ: ateş et · ÇIK: toptan ayrıl"
        : "Fare: yön · Tekerlek veya Q/E: açı · Sol tık: ATEŞ · F: toptan ayrıl",
    );
    this.renderList();
  }

  private renderList(): void {
    this.list.innerHTML = "";
    for (const t of this.d.targets) {
      const li = el("li", t.hp <= 0 ? "done" : "", this.list);
      el("span", "", li, t.name);
      el("span", "", li, t.hp <= 0 ? "✓" : `${t.hp}/${t.maxHp}`);
    }
  }

  private flash(text: string, color: string): void {
    this.feedback.textContent = text;
    this.feedback.style.color = color;
    this.feedback.classList.remove("show");
    void this.feedback.offsetWidth;
    this.feedback.classList.add("show");
  }

  private muzzleState(): { pos: Vector3; dir: Vector3 } {
    this.d.recoil.computeWorldMatrix(true);
    this.d.muzzle.computeWorldMatrix(true);
    const pos = this.d.muzzle.getAbsolutePosition().clone();
    const back = this.d.pitch.getAbsolutePosition();
    const dir = pos.subtract(back).normalize();
    return { pos, dir };
  }

  protected update(dt: number): void {
    const { input, player } = this.d;
    player.updateLook();
    // Elevation: wheel, Q/E or touch ▲▼.
    const wheel = input.consumeWheel();
    let elev = this.elevation - wheel * degToRad(CFG.elevationStepDeg);
    if (input.isDown("aimUp")) elev += degToRad(7) * dt;
    if (input.isDown("aimDown")) elev -= degToRad(7) * dt;
    this.elevation = clamp(elev, degToRad(CFG.minElevationDeg), degToRad(CFG.maxElevationDeg));
    this.d.yaw.rotation.y = player.yaw - this.baseYaw;
    this.d.pitch.rotation.z = this.elevation;
    // Recoil spring.
    this.recoilT = Math.max(0, this.recoilT - dt * 1.4);
    this.d.recoil.position.x = -Math.sin(Math.min(1, this.recoilT) * Math.PI) * 0.7;

    this.reload = Math.max(0, this.reload - dt);
    if (this.reload <= 0 && this.winTimer <= 0 && input.wasPressed("fire")) this.fire();
    if (input.wasPressed("action")) {
      this.finish(false);
      return;
    }

    this.updateShots(dt);
    this.updatePreview();
    player.setShake(this.d.camFx.update(dt, CFG.shakeIntensity * 3));
    player.syncCamera(dt, 0);
    for (const npc of this.d.crew) npc.anim = this.reload > 0.3 ? "load" : "guard";

    if (this.winTimer > 0) {
      this.winTimer -= dt;
      if (this.winTimer <= 0) this.finish(true);
    }
    // UI
    const deg = radToDeg(this.elevation);
    this.gaugeFill.style.height = `${(deg / CFG.maxElevationDeg) * 100}%`;
    setText(this.gaugeLabel, `${deg.toFixed(1)}°`);
    const yawDeg = radToDeg(player.yaw - this.baseYaw);
    const range = this.estimateRange();
    setText(this.info, `AÇI ${deg.toFixed(1)}° · YÖN ${yawDeg >= 0 ? "+" : ""}${yawDeg.toFixed(1)}° · MENZİL ~${Math.round(range)} m · ATIŞ ${this.shotCount}`);
    this.reloadFill.style.width = `${(1 - this.reload / CFG.reloadTime) * 100}%`;
  }

  private estimateRange(): number {
    const { pos, dir } = this.muzzleState();
    const v = dir.scale(CFG.muzzleSpeed);
    const groundY = this.d.groundAt(pos.x + dir.x * 140, pos.z + dir.z * 140) + 6;
    const h = pos.y - groundY;
    const g = CFG.gravity;
    const t = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 2 * g * h))) / g;
    return Math.hypot(v.x, v.z) * t;
  }

  private fire(): void {
    const { pos, dir } = this.muzzleState();
    this.shotCount++;
    this.reload = CFG.reloadTime;
    this.recoilT = 1;
    const mesh = this.ballSource.clone(`ball#${this.shotCount}`);
    mesh.isVisible = true;
    mesh.position.copyFrom(pos);
    this.shots.push({ mesh, pos: pos.clone(), vel: dir.scale(CFG.muzzleSpeed), alive: true, trail: 0 });
    this.d.fx.muzzleFlash(pos.add(dir.scale(0.6)), dir);
    this.d.fx.cannonSmoke(pos.add(dir.scale(1.2)), dir);
    this.d.fx.dustPuff(this.d.base.getAbsolutePosition(), 24);
    this.d.audio.play("cannonFire", { volume: 1 });
    this.d.camFx.addTrauma(0.75);
    window.setTimeout(() => this.d.audio.play("reload", { volume: 0.6 }), 900);
  }

  private updateShots(dt: number): void {
    const g = CFG.gravity;
    for (const s of this.shots) {
      if (!s.alive) continue;
      const steps = 3;
      const h = dt / steps;
      for (let i = 0; i < steps && s.alive; i++) {
        const prev = s.pos.clone();
        s.vel.y -= g * h;
        s.vel.scaleInPlace(1 - 0.012 * h);
        s.pos.addInPlace(s.vel.scale(h));
        this.collide(s, prev);
      }
      s.mesh.position.copyFrom(s.pos);
      s.trail -= dt;
      if (s.alive && s.trail <= 0) {
        s.trail = 0.06;
        this.d.fx.dustPuff(s.pos, 2);
      }
    }
    this.shots = this.shots.filter((s) => {
      if (!s.alive) s.mesh.dispose();
      return s.alive;
    });
  }

  private collide(s: Shot, prev: Vector3): void {
    // Targets: segment vs sphere.
    for (const t of this.d.targets) {
      if (t.hp <= 0) continue;
      if (segmentSphere(prev, s.pos, t.center, t.radius)) {
        this.hitTarget(t, s.pos.clone());
        s.alive = false;
        return;
      }
    }
    // Masonry (walls/towers): any solid box containing the point.
    for (const c of this.d.solids) {
      if (!c.enabled) continue;
      const dx = s.pos.x - c.cx;
      const dz = s.pos.z - c.cz;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz && s.pos.y >= c.yMin && s.pos.y <= c.yMax) {
        this.miss(s.pos.clone(), true);
        s.alive = false;
        return;
      }
    }
    const gy = this.d.groundAt(s.pos.x, s.pos.z);
    if (s.pos.y <= gy) {
      s.pos.y = gy;
      this.miss(s.pos.clone(), false);
      s.alive = false;
      return;
    }
    if (s.pos.y < -20) s.alive = false;
  }

  private hitTarget(t: CannonTargetRef, at: Vector3): void {
    t.hp--;
    this.d.fx.impact(at, true);
    this.d.audio.play("impactStone", { at, refDistance: 60, volume: 1 });
    this.d.audio.play("debris", { at, refDistance: 50 });
    this.d.camFx.addTrauma(0.15);
    if (t.hp <= 0) {
      this.flash(`${t.name.toLocaleUpperCase("tr-TR")} YIKILDI!`, "#9fd26b");
      t.marker.setEnabled(false);
      this.collapse(t);
      this.d.onTargetDestroyed(t.id);
      this.d.audio.play("cheer", { volume: 0.5 });
      if (this.remaining === 0) {
        this.winTimer = 2.4;
        this.d.audio.play("fanfare", { volume: 0.8 });
      }
    } else {
      this.flash(`İSABET! ${t.name}`, "#ffd36a");
    }
    this.renderList();
  }

  private collapse(t: CannonTargetRef): void {
    const parts = t.breakable;
    let time = 0;
    const start = parts.map((p) => ({ y: p.position.y, s: p.scaling.clone() }));
    const obs = this.d.scene.onBeforeRenderObservable.add(() => {
      time += this.d.scene.getEngine().getDeltaTime() / 1000;
      const k = Math.min(1, time / 1.6);
      parts.forEach((p, i) => {
        p.position.y = start[i].y - k * k * 6;
        p.rotation.z = k * 0.25;
        p.rotation.x = k * 0.12;
      });
      if (time > 0.3 && time < 0.4) this.d.fx.impact(t.center, true);
      if (k >= 1) {
        for (const p of parts) p.setEnabled(false);
        this.d.scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }

  private miss(at: Vector3, masonry: boolean): void {
    this.d.fx.impact(at, false);
    this.d.audio.play(masonry ? "impactStone" : "land", { at, refDistance: 60, volume: masonry ? 0.8 : 1 });
    // Tell the player how to correct: short/long/left/right relative to the closest target.
    const origin = this.d.base.getAbsolutePosition();
    let best: CannonTargetRef | null = null;
    let bestD = Infinity;
    for (const t of this.d.targets) {
      if (t.hp <= 0) continue;
      const d = Vector3.Distance(t.center, at);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return;
    const toT = best.center.subtract(origin);
    const toHit = at.subtract(origin);
    const distT = Math.hypot(toT.x, toT.z);
    const distH = Math.hypot(toHit.x, toHit.z);
    const cross = (toT.x * toHit.z - toT.z * toHit.x) / Math.max(1, distT);
    let msg = "ISKA";
    if (distH < distT - 6) msg = `KISA KALDI · ${Math.round(distT - distH)} m`;
    else if (distH > distT + 6) msg = `UZUN GİTTİ · ${Math.round(distH - distT)} m`;
    else if (Math.abs(cross) > 3) msg = cross > 0 ? "SOLA KAÇTI" : "SAĞA KAÇTI";
    this.flash(msg, "#f0b54a");
  }

  private updatePreview(): void {
    const { pos, dir } = this.muzzleState();
    const v = dir.scale(CFG.muzzleSpeed);
    const range = this.estimateRange();
    const totalT = range / Math.max(1, Math.hypot(v.x, v.z));
    const showT = totalT * CFG.trajectoryPreviewFraction;
    this.preview.forEach((m, i) => {
      const t = ((i + 1) / this.preview.length) * showT;
      m.position.set(pos.x + v.x * t, pos.y + v.y * t - 0.5 * CFG.gravity * t * t, pos.z + v.z * t);
      m.setEnabled(this.reload <= 0);
    });
  }

  protected onEnd(): void {
    const { player, mobile, hud } = this.d;
    player.yawLimit = null;
    player.pitchLimit = null;
    player.controlEnabled = true;
    player.setShake(Vector3.Zero());
    mobile.setLayout("explore");
    hud.setCrosshair(true);
    for (const m of this.preview) m.dispose();
    this.preview = [];
    for (const s of this.shots) s.mesh.dispose();
    this.shots = [];
    for (const t of this.d.targets) t.marker.setEnabled(false);
    for (const npc of this.d.crew) npc.setBehavior({ type: "pose", anim: "guard" });
    // Step back from the gun so the player isn't stuck inside its collider.
    const bp = this.d.base.getAbsolutePosition();
    player.position.set(bp.x - 4.6, this.d.groundAt(bp.x - 4.6, bp.z + 1.5), bp.z + 1.5);
    this.d.audio.playMusic("istanbul");
  }
}

function segmentSphere(a: Vector3, b: Vector3, c: Vector3, r: number): boolean {
  const ab = b.subtract(a);
  const ac = c.subtract(a);
  const len2 = ab.lengthSquared();
  const t = len2 > 0 ? clamp(Vector3.Dot(ac, ab) / len2, 0, 1) : 0;
  const closest = a.add(ab.scale(t));
  return Vector3.DistanceSquared(closest, c) <= r * r;
}
