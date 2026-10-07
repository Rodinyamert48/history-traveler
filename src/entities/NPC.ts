import { Vector3 } from "@babylonjs/core";
import { GAME_CONFIG } from "../config/gameConfig";
import type { CollisionWorld } from "../world/CollisionWorld";
import type { NavGraph } from "../world/NavGraph";
import { angleDelta, clamp, damp, lerp } from "../utils/math";
import type { HumanoidRig } from "./HumanoidFactory";

export type NpcAnim =
  | "idle"
  | "walk"
  | "run"
  | "push"
  | "pull"
  | "cheer"
  | "sit"
  | "work"
  | "carry"
  | "point"
  | "talk"
  | "thrust"
  | "guard"
  | "load"
  | "bow"
  | "pound"
  | "stir"
  | "dance"
  | "play";

export type NpcBehavior =
  | { type: "idle"; lookAround?: boolean }
  | { type: "wander"; cx: number; cz: number; radius: number }
  | { type: "patrol"; points: [number, number][]; index?: number }
  | { type: "pose"; anim: NpcAnim }
  | { type: "follow"; target: () => Vector3 | null; distance: number; run?: boolean }
  | { type: "scripted" };

export type NpcRole =
  | "janissary"
  | "sipahi"
  | "worker"
  | "sailor"
  | "gunner"
  | "byzantine"
  | "commander"
  | "fatih"
  | "boatman"
  | "villager"
  | "woman"
  | "child"
  | "elder"
  | "musician";

const NPCC = GAME_CONFIG.npc;

export interface NpcContext {
  world: CollisionWorld;
  nav: NavGraph | null;
  groundAt(x: number, z: number, feetY: number): number;
  player: Vector3;
  rnd(): number;
}

/**
 * One character: behaviour state machine + procedural pose animation on an instanced rig.
 */
export class NPC {
  readonly position = new Vector3();
  heading = 0;
  anim: NpcAnim = "idle";
  animTime = Math.random() * 10;
  /** Animation playback speed multiplier (e.g. sync with rhythm). */
  animSpeed = 1;
  behavior: NpcBehavior = { type: "idle" };
  lookTarget: Vector3 | null = null;
  lookAtPlayer = true;
  path: [number, number][] = [];
  moveSpeed: number = NPCC.walkSpeed;
  private waitTimer = Math.random() * 3;
  private headYaw = 0;
  private headPitch = 0;
  /** Extra per-frame offsets the minigames can use (e.g. lean into the rope). */
  lean = 0;
  /** Mallet swing for the "pound" pose: 0 = raised overhead, 1 = struck down (driven by minigames). */
  strike = 0;
  visible = true;
  lodLevel = 0;
  private animAccum = 0;
  private lookAroundTimer = 2 + Math.random() * 4;
  private lookAroundYaw = 0;

  constructor(
    readonly id: string,
    readonly role: NpcRole,
    readonly displayName: string,
    readonly rig: HumanoidRig,
  ) {}

  place(x: number, y: number, z: number, heading: number): void {
    this.position.set(x, y, z);
    this.heading = heading;
    this.path = [];
    this.applyTransform();
  }

  setBehavior(b: NpcBehavior): void {
    this.behavior = b;
    this.path = [];
    this.waitTimer = 0;
    if (b.type === "pose") this.anim = b.anim;
  }

  moveTo(ctx: NpcContext, x: number, z: number, run = false): void {
    this.path = ctx.nav ? ctx.nav.findPath(this.position.x, this.position.z, x, z) : [[x, z]];
    this.moveSpeed = run ? NPCC.runSpeed : NPCC.walkSpeed;
  }

  get isMoving(): boolean {
    return this.path.length > 0;
  }

  update(dt: number, ctx: NpcContext, distanceToCamera: number): void {
    this.think(dt, ctx);
    this.locomotion(dt, ctx, distanceToCamera);
    this.applyTransform();
    // Animation LOD: full rate near, reduced further away, frozen far.
    let animDt = dt;
    if (distanceToCamera > NPCC.animReducedDistance) {
      this.animAccum += dt;
      if (this.animAccum < 0.25) return;
      animDt = this.animAccum;
      this.animAccum = 0;
    } else if (distanceToCamera > NPCC.animFullDistance) {
      this.animAccum += dt;
      if (this.animAccum < 0.066) return;
      animDt = this.animAccum;
      this.animAccum = 0;
    }
    this.animate(animDt, ctx, distanceToCamera);
  }

  private think(dt: number, ctx: NpcContext): void {
    const b = this.behavior;
    if (b.type === "wander") {
      if (!this.path.length) {
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) {
          const target = ctx.nav?.randomNodeNear(b.cx, b.cz, b.radius, ctx.rnd);
          if (target) this.moveTo(ctx, target[0], target[1]);
          this.waitTimer = 3 + ctx.rnd() * 6;
        }
      }
    } else if (b.type === "patrol") {
      if (!this.path.length) {
        this.waitTimer -= dt;
        if (this.waitTimer <= 0) {
          b.index = ((b.index ?? -1) + 1) % b.points.length;
          const [x, z] = b.points[b.index];
          this.moveTo(ctx, x, z);
          this.waitTimer = 1.5 + ctx.rnd() * 3;
        }
      }
    } else if (b.type === "follow") {
      const t = b.target();
      if (t) {
        const d = Math.hypot(t.x - this.position.x, t.z - this.position.z);
        if (d > b.distance + 1.5) {
          this.path = [[t.x, t.z]];
          this.moveSpeed = b.run || d > b.distance + 8 ? NPCC.runSpeed : NPCC.walkSpeed;
        } else if (d < b.distance) {
          this.path = [];
        }
      }
    }
  }

  private locomotion(dt: number, ctx: NpcContext, distanceToCamera: number): void {
    if (this.behavior.type === "scripted") return;
    if (this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.position.x;
      const dz = tz - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) {
        this.path.shift();
      } else {
        const step = Math.min(d, this.moveSpeed * dt);
        let nx = this.position.x + (dx / d) * step;
        let nz = this.position.z + (dz / d) * step;
        if (distanceToCamera < 70) {
          const r = ctx.world.move(this.position.x, this.position.z, nx - this.position.x, nz - this.position.z, 0.32, this.position.y, 1.8, 0.5);
          nx = r.x;
          nz = r.z;
        }
        this.position.x = nx;
        this.position.z = nz;
        this.position.y = ctx.groundAt(nx, nz, this.position.y);
        const targetHeading = Math.atan2(dx, dz);
        this.heading += angleDelta(this.heading, targetHeading) * damp(NPCC.turnSpeed, dt);
      }
      this.anim = this.moveSpeed > NPCC.walkSpeed + 0.5 ? "run" : "walk";
    } else if (this.behavior.type === "pose") {
      this.anim = this.behavior.anim;
    } else if (this.anim === "walk" || this.anim === "run") {
      this.anim = "idle";
    }
  }

  applyTransform(): void {
    const r = this.rig.root;
    r.position.copyFrom(this.position);
    r.rotation.y = this.heading;
  }

  /** Procedural pose animation. */
  private animate(dt: number, ctx: NpcContext, distanceToCamera: number): void {
    this.animTime += dt * this.animSpeed;
    const t = this.animTime;
    const { hips, torso, head, armL, armR, legL, legR } = this.rig;
    let hipY = 0.95;
    let torsoX = 0;
    let torsoY = 0;
    let aLx = 0;
    let aLz = 0.08;
    let aRx = 0;
    let aRz = -0.08;
    let lLx = 0;
    let lRx = 0;
    const lean = this.lean;
    switch (this.anim) {
      case "idle": {
        const br = Math.sin(t * 1.6);
        torsoX = br * 0.015;
        aLx = br * 0.03;
        aRx = -br * 0.03;
        break;
      }
      case "guard": {
        aRx = -0.25;
        aRz = -0.05;
        torsoX = Math.sin(t * 1.4) * 0.012;
        break;
      }
      case "walk":
      case "carry": {
        const ph = t * 7 * (this.moveSpeed / NPCC.walkSpeed) * 0.85;
        const s = Math.sin(ph);
        lLx = s * 0.5;
        lRx = -s * 0.5;
        hipY = 0.95 + Math.abs(Math.cos(ph)) * 0.04;
        if (this.anim === "carry") {
          aLx = -1.1;
          aRx = -1.1;
          aLz = 0.25;
          aRz = -0.25;
        } else {
          aLx = -s * 0.4;
          aRx = s * 0.4;
        }
        torsoX = 0.04;
        break;
      }
      case "run": {
        const ph = t * 10.5;
        const s = Math.sin(ph);
        lLx = s * 0.9;
        lRx = -s * 0.9;
        aLx = -s * 0.9 - 0.3;
        aRx = s * 0.9 - 0.3;
        hipY = 0.95 + Math.abs(Math.cos(ph)) * 0.08;
        torsoX = 0.16;
        break;
      }
      case "push": {
        const ph = t * 6;
        const s = Math.sin(ph);
        torsoX = 0.45 + lean * 0.3;
        aLx = -1.45 + s * 0.12;
        aRx = -1.45 - s * 0.12;
        lLx = s * 0.45 - 0.2;
        lRx = -s * 0.45 - 0.2;
        hipY = 0.88;
        break;
      }
      case "pull": {
        const ph = t * 6;
        const s = Math.sin(ph);
        torsoX = 0.35 + lean * 0.35;
        aLx = -0.9 + Math.max(0, s) * 0.5;
        aRx = -1.0 + Math.max(0, s) * 0.5;
        lLx = s * 0.4 - 0.15;
        lRx = -s * 0.4 - 0.15;
        hipY = 0.9;
        break;
      }
      case "cheer": {
        const s = Math.sin(t * 9);
        aLx = -2.7 + s * 0.25;
        aRx = -2.8 - s * 0.25;
        aLz = 0.35;
        aRz = -0.35;
        hipY = 0.95 + Math.max(0, Math.sin(t * 4.5)) * 0.12;
        break;
      }
      case "sit": {
        hipY = 0.42;
        lLx = -1.45;
        lRx = -1.35;
        aLx = -0.7;
        aRx = -0.6 + Math.sin(t * 0.8) * 0.1;
        torsoX = 0.08;
        break;
      }
      case "work": {
        const s = Math.sin(t * 5);
        torsoX = 0.3;
        aRx = -1.4 + s * 0.8;
        aLx = -0.7;
        lLx = 0.15;
        lRx = -0.25;
        break;
      }
      case "load": {
        const s = Math.sin(t * 3);
        torsoX = 0.35 + s * 0.1;
        aLx = -1.3 + s * 0.3;
        aRx = -1.3 + s * 0.3;
        lLx = 0.25;
        lRx = -0.3;
        break;
      }
      case "point": {
        aRx = -1.55;
        aRz = -0.1;
        aLx = Math.sin(t * 1.2) * 0.03;
        break;
      }
      case "talk": {
        aRx = -0.5 + Math.sin(t * 2.3) * 0.25;
        aLx = -0.3 + Math.sin(t * 1.7 + 1) * 0.15;
        aRz = -0.2;
        torsoY = Math.sin(t * 0.9) * 0.08;
        break;
      }
      case "thrust": {
        const s = Math.max(0, Math.sin(t * 4));
        aRx = -1.0 - s * 0.6;
        torsoX = 0.15 + s * 0.15;
        lLx = 0.3;
        lRx = -0.35;
        break;
      }
      case "bow": {
        torsoX = 0.55;
        aLx = -0.4;
        aRx = -0.4;
        break;
      }
      case "pound": {
        // Two-handed mallet: arms from overhead (-2.9) down to the mortar (-0.9).
        const k = this.strike;
        aLx = lerp(-2.9, -0.95, k);
        aRx = lerp(-2.9, -0.95, k);
        aLz = 0.12;
        aRz = -0.12;
        torsoX = lerp(-0.08, 0.32, k);
        hipY = 0.95 - k * 0.05;
        lLx = 0.2;
        lRx = -0.25;
        break;
      }
      case "stir": {
        // Long paddle in a cauldron: arms forward, torso rocking in a slow circle.
        const s = Math.sin(t * 2.2);
        const c = Math.cos(t * 2.2);
        torsoX = 0.28 + c * 0.08;
        torsoY = s * 0.22;
        aLx = -1.2 + c * 0.25;
        aRx = -1.05 + c * 0.25;
        aLz = 0.15;
        aRz = -0.15;
        lLx = 0.2;
        lRx = -0.2;
        break;
      }
      case "dance": {
        // Zeybek: arms spread and raised, slow heavy steps with deep knee bends and turns.
        const ph = t * 1.9;
        const s = Math.sin(ph);
        aLz = 1.35 + s * 0.12;
        aRz = -1.35 + s * 0.12;
        aLx = -0.35;
        aRx = -0.35;
        hipY = 0.92 - Math.max(0, Math.sin(ph * 2)) * 0.16;
        lLx = s * 0.55;
        lRx = -Math.max(0, s) * 0.3;
        torsoY = s * 0.3;
        torsoX = -0.05;
        break;
      }
      case "play": {
        // Musician: davul stick / zurna held up, rhythmic bounce.
        const s = Math.sin(t * 8);
        aRx = -1.25 + Math.max(0, s) * 0.5;
        aLx = -1.1;
        aLz = 0.3;
        hipY = 0.95 + Math.abs(s) * 0.02;
        torsoY = Math.sin(t * 1.2) * 0.12;
        break;
      }
    }
    const k = damp(14, dt);
    hips.position.y = lerp(hips.position.y, hipY, k);
    torso.rotation.x = lerp(torso.rotation.x, torsoX, k);
    torso.rotation.y = lerp(torso.rotation.y, torsoY, k);
    armL.rotation.x = lerp(armL.rotation.x, aLx, k);
    armL.rotation.z = lerp(armL.rotation.z, aLz, k);
    armR.rotation.x = lerp(armR.rotation.x, aRx, k);
    armR.rotation.z = lerp(armR.rotation.z, aRz, k);
    legL.rotation.x = lerp(legL.rotation.x, lLx, k);
    legR.rotation.x = lerp(legR.rotation.x, lRx, k);

    // Head: look at a target / the player when close, otherwise glance around.
    let tYaw = 0;
    let tPitch = 0;
    const target = this.lookTarget ?? (this.lookAtPlayer && distanceToCamera < NPCC.lookAtDistance ? ctx.player : null);
    if (target) {
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      tYaw = clamp(angleDelta(this.heading, Math.atan2(dx, dz)), -1.1, 1.1);
      const dy = target.y - (this.position.y + 1.6 * this.rig.scale);
      tPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5);
    } else if (this.anim === "idle" || this.anim === "guard") {
      this.lookAroundTimer -= dt;
      if (this.lookAroundTimer <= 0) {
        this.lookAroundTimer = 2 + ctx.rnd() * 5;
        this.lookAroundYaw = (ctx.rnd() - 0.5) * 1.4;
      }
      tYaw = this.lookAroundYaw;
    }
    this.headYaw = lerp(this.headYaw, tYaw - torso.rotation.y, damp(5, dt));
    this.headPitch = lerp(this.headPitch, tPitch - torso.rotation.x * 0.6, damp(5, dt));
    head.rotation.y = this.headYaw;
    head.rotation.x = this.headPitch;
  }
}
