import { Mesh, Vector3, type InstancedMesh, type Scene, type TransformNode } from "@babylonjs/core";
import type { AudioManager } from "../audio/AudioManager";
import { GeoBuilder, hexColor } from "../assets/GeoBuilder";
import { GAME_CONFIG } from "../config/gameConfig";
import type { NPC } from "../entities/NPC";
import type { Player } from "../entities/Player";
import type { MaterialLibrary } from "../rendering/MaterialLibrary";
import type { CameraFX } from "../systems/CameraFX";
import type { ParticleFX } from "../systems/ParticleFX";
import type { HUD } from "../ui/HUD";
import { el, setText } from "../ui/dom";
import { clamp } from "../utils/math";
import { Random } from "../utils/random";
import { BaseMinigame } from "./BaseMinigame";

const CFG = GAME_CONFIG.minigames.siege;

export interface SiegeZone {
  id: string;
  name: string;
  position: Vector3;
  ring: Mesh;
  byzFlag: TransformNode;
  ottFlag: TransformNode;
}

export interface SiegeMinigameDeps {
  layer: HTMLElement;
  scene: Scene;
  audio: AudioManager;
  hud: HUD;
  player: Player;
  fx: ParticleFX;
  camFx: CameraFX;
  materials: MaterialLibrary;
  zones: SiegeZone[];
  allies: NPC[];
  defenders: NPC[];
  groundAt(x: number, z: number): number;
  moveNpc(npc: NPC, x: number, z: number, run: boolean): void;
}

interface Arrow {
  mesh: InstancedMesh;
  from: Vector3;
  to: Vector3;
  t: number;
  duration: number;
  flying: boolean;
  stuck: number;
  atPlayer: boolean;
}

/**
 * MINIGAME 3 — "Sur Kuşatması". Advance with the janissaries and capture the three points
 * of the breach in order. Standing inside a zone captures it; every ally inside speeds it up.
 * Defenders loose (stylized, bloodless) arrows: a hit only stuns/slows you briefly.
 */
export class SiegeMinigame extends BaseMinigame {
  private zoneIndex = 0;
  private progress = 0;
  private arrows: Arrow[] = [];
  private arrowSource: Mesh;
  private arrowTimer = 1.5;
  private stun = 0;
  private winTimer = 0;
  private rnd = new Random(29);
  private pills: { el: HTMLDivElement; fill: HTMLDivElement }[] = [];
  private bar!: HTMLDivElement;
  private label!: HTMLDivElement;
  private allyText!: HTMLDivElement;
  private zoneFlagLift = 0;

  constructor(private readonly d: SiegeMinigameDeps) {
    super(d.layer);
    const b = new GeoBuilder();
    b.cylinder(0, -0.45, 0, 0.018, 0.018, 0.9, { segments: 4, color: hexColor("#6a4a2a") });
    b.cylinder(0, 0.45, 0, 0.03, 0, 0.1, { segments: 4, color: hexColor("#5a5550") });
    b.box(0, -0.4, 0, 0.12, 0.14, 0.01, { color: hexColor("#e8e0cc") });
    this.arrowSource = b.toMesh("arrow-src", d.scene);
    this.arrowSource.material = d.materials.get("matte");
    this.arrowSource.isVisible = false;
    this.arrowSource.isPickable = false;
  }

  get currentZone(): SiegeZone | null {
    return this.d.zones[this.zoneIndex] ?? null;
  }

  protected onStart(): void {
    const { player, audio } = this.d;
    player.controlEnabled = true;
    player.lookEnabled = true;
    audio.playMusic("tension");
    audio.setAmbience({ sea: 0.2, wind: 0.3, camp: 0.1, battle: 0.9 });
    for (let i = 0; i < 12; i++) {
      const m = this.arrowSource.createInstance(`arrow#${i}`);
      m.setEnabled(false);
      m.isPickable = false;
      this.arrows.push({ mesh: m, from: new Vector3(), to: new Vector3(), t: 0, duration: 1, flying: false, stuck: 0, atPlayer: false });
    }
    for (const d of this.d.defenders) d.setBehavior({ type: "pose", anim: "thrust" });
    this.buildUi();
    this.activateZone(0);
  }

  private buildUi(): void {
    const panel = el("div", "mg-panel", this.ui);
    const row = el("div", "mg-row", panel);
    el("div", "mg-title", row, "SUR KUŞATMASI");
    this.label = el("div", "mg-value", row);
    const bar = el("div", "mg-bar", panel);
    this.bar = el("div", "mg-bar-fill", bar);
    const zones = el("div", "capture-zones", panel);
    for (const z of this.d.zones) {
      const pill = el("div", "capture-zone", zones);
      const fill = el("div", "cz-fill", pill);
      el("span", "", pill, `${z.id} · ${z.name}`);
      pill.style.zIndex = "0";
      this.pills.push({ el: pill, fill });
    }
    this.allyText = el("div", "mg-stats", panel);
    el("div", "hint-line", panel, "Bölgenin içinde kal. Yanındaki her asker ele geçirmeyi hızlandırır. Oklardan kaçın!");
  }

  private activateZone(i: number): void {
    this.zoneIndex = i;
    this.progress = 0;
    this.d.zones.forEach((z, k) => z.ring.setEnabled(k === i));
    const z = this.currentZone;
    if (!z) return;
    // Send allies to the zone, spread around it.
    this.d.allies.forEach((npc, k) => {
      const a = (k / this.d.allies.length) * Math.PI * 2;
      const r = 2.5 + (k % 3) * 1.6;
      npc.setBehavior({ type: "idle" });
      this.d.moveNpc(npc, z.position.x + Math.cos(a) * r, z.position.z + Math.sin(a) * r, true);
    });
    this.d.hud.setObjective(`${z.id} noktasını ele geçir: ${z.name}`, true);
    this.d.audio.play("drum", { volume: 0.8 });
  }

  private captureZone(): void {
    const z = this.currentZone;
    if (!z) return;
    z.byzFlag.setEnabled(false);
    z.ottFlag.setEnabled(true);
    this.zoneFlagLift = 0;
    this.d.audio.play("cheer", { volume: 0.9 });
    this.d.audio.play("objective", { volume: 0.7 });
    this.d.hud.toast(`${z.name} ele geçirildi!`, "success");
    this.pills[this.zoneIndex].el.classList.add("done");
    for (const npc of this.d.allies) npc.setBehavior({ type: "pose", anim: "cheer" });
    if (this.zoneIndex >= this.d.zones.length - 1) {
      this.winTimer = 2.2;
      for (const d of this.d.defenders) d.visible = false;
      this.d.audio.play("fanfare", { volume: 0.9 });
      this.d.zones.forEach((zz) => zz.ring.setEnabled(false));
      return;
    }
    const next = this.zoneIndex + 1;
    window.setTimeout(() => {
      if (this.active) this.activateZone(next);
    }, 1400);
  }

  protected update(dt: number): void {
    const { player } = this.d;
    player.speedMultiplier = this.stun > 0 ? 0.45 : 1;
    this.stun = Math.max(0, this.stun - dt);
    player.update(dt);
    player.setShake(this.d.camFx.update(dt));

    if (this.winTimer > 0) {
      this.winTimer -= dt;
      this.updateArrows(dt);
      if (this.winTimer <= 0) this.finish(true);
      return;
    }
    const z = this.currentZone;
    if (!z) return;
    const pp = player.position;
    const inZone = Math.hypot(pp.x - z.position.x, pp.z - z.position.z) < CFG.captureRadius;
    let allies = 0;
    for (const npc of this.d.allies) {
      if (Math.hypot(npc.position.x - z.position.x, npc.position.z - z.position.z) < CFG.captureRadius + 1) {
        allies++;
        if (!npc.isMoving && npc.behavior.type !== "pose") npc.setBehavior({ type: "pose", anim: "thrust" });
      }
    }
    const bonus = Math.min(CFG.maxAllyBonus, allies * CFG.allyBonusPerSoldier);
    if (inZone) {
      this.progress += (dt / CFG.captureTime) * (1 + bonus);
      if (this.progress >= 1 && this.pills[this.zoneIndex] && !this.pills[this.zoneIndex].el.classList.contains("done")) this.captureZone();
    }
    this.progress = clamp(this.progress, 0, 1);
    // Ring pulses; brighter while capturing.
    const s = 1 + Math.sin(this.elapsed * 4) * 0.03;
    z.ring.scaling.set(s, 1, s);
    z.ring.visibility = inZone ? 1 : 0.6;

    this.arrowTimer -= dt;
    if (this.arrowTimer <= 0) {
      this.arrowTimer = CFG.arrowInterval * (0.6 + this.rnd.next() * 0.8);
      this.shootArrow();
    }
    this.updateArrows(dt);

    // UI
    this.bar.style.width = `${(this.progress * 100).toFixed(1)}%`;
    setText(this.label, inZone ? `ELE GEÇİRİLİYOR ${Math.round(this.progress * 100)}%` : `${z.id} noktasına git`);
    this.pills.forEach((p, i) => {
      p.el.classList.toggle("active", i === this.zoneIndex);
      p.fill.style.width = `${i < this.zoneIndex ? 100 : i === this.zoneIndex ? this.progress * 100 : 0}%`;
    });
    setText(this.allyText, `Yanındaki asker: ${allies} (+${Math.round(bonus * 100)}% hız)`);
    this.zoneFlagLift += dt;
  }

  private shootArrow(): void {
    const shooters = this.d.defenders.filter((d) => d.visible);
    if (!shooters.length) return;
    const arrow = this.arrows.find((a) => !a.flying && a.stuck <= 0);
    if (!arrow) return;
    const from = this.rnd.pick(shooters).position.add(new Vector3(0, 1.6, 0));
    const atPlayer = this.rnd.chance(0.55);
    const target = atPlayer ? this.d.player.position.clone() : (this.rnd.pick(this.d.allies)?.position.clone() ?? this.d.player.position.clone());
    // Aim error so most arrows miss — stylized threat, not punishment.
    target.x += this.rnd.range(-3, 3);
    target.z += this.rnd.range(-3, 3);
    target.y = this.d.groundAt(target.x, target.z);
    arrow.from.copyFrom(from);
    arrow.to.copyFrom(target);
    arrow.t = 0;
    arrow.duration = 0.9 + Vector3.Distance(from, target) / 45;
    arrow.flying = true;
    arrow.atPlayer = atPlayer;
    arrow.mesh.setEnabled(true);
    this.d.audio.play("arrowWhoosh", { at: from, refDistance: 25, volume: 0.6 });
  }

  private updateArrows(dt: number): void {
    for (const a of this.arrows) {
      if (a.flying) {
        a.t += dt / a.duration;
        const t = Math.min(1, a.t);
        const p = Vector3.Lerp(a.from, a.to, t);
        const arc = 4 + Vector3.Distance(a.from, a.to) * 0.08;
        p.y += Math.sin(t * Math.PI) * arc;
        const next = Vector3.Lerp(a.from, a.to, Math.min(1, t + 0.02));
        next.y += Math.sin(Math.min(1, t + 0.02) * Math.PI) * arc;
        a.mesh.position.copyFrom(p);
        const dir = next.subtract(p);
        if (dir.lengthSquared() > 1e-6) a.mesh.lookAt(next, 0, Math.PI / 2, 0);
        if (t >= 1) {
          a.flying = false;
          a.stuck = 4;
          this.d.audio.play("arrowHit", { at: a.to, refDistance: 18, volume: 0.6 });
          const pp = this.d.player.position;
          if (Math.hypot(pp.x - a.to.x, pp.z - a.to.z) < 1.3) this.onPlayerHit();
        }
      } else if (a.stuck > 0) {
        a.stuck -= dt;
        if (a.stuck <= 0) a.mesh.setEnabled(false);
      }
    }
  }

  private onPlayerHit(): void {
    this.stun = CFG.stunDuration;
    this.d.hud.damageFlash();
    this.d.camFx.addTrauma(0.35);
    this.d.audio.play("stun", { volume: 0.6 });
  }

  protected onEnd(): void {
    this.d.player.speedMultiplier = 1;
    this.d.player.setShake(Vector3.Zero());
    for (const a of this.arrows) a.mesh.dispose();
    this.arrows = [];
    this.d.zones.forEach((z) => z.ring.setEnabled(false));
    this.d.audio.setAmbience({ sea: 0.3, wind: 0.3, camp: 0.2, battle: 0.4 });
  }
}
