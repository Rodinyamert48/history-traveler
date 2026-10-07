import {
  Color4,
  GPUParticleSystem,
  Mesh,
  ParticleSystem,
  PointLight,
  Color3,
  Vector3,
  type AbstractMesh,
  type BaseTexture,
  type InstancedMesh,
  type Scene,
} from "@babylonjs/core";
import { createFlareTexture, createPuffTexture } from "../rendering/ProceduralTextures";
import { GeoBuilder, hexColor } from "../assets/GeoBuilder";
import type { MaterialLibrary } from "../rendering/MaterialLibrary";

void GPUParticleSystem;

interface Debris {
  mesh: InstancedMesh;
  vel: Vector3;
  spin: Vector3;
  life: number;
}

/**
 * Pooled, stylized particle effects. Every system's capacity/emit-rate is multiplied by
 * the quality preset's particle factor (0 on "Partiküller: kapalı" → only essential bursts).
 * Debris chunks are pooled instanced meshes (no allocations during gameplay).
 */
export class ParticleFX {
  private puff: BaseTexture;
  private flare: BaseTexture;
  private smokePool: ParticleSystem[] = [];
  private dustPool: ParticleSystem[] = [];
  private flashPool: ParticleSystem[] = [];
  private ambient: ParticleSystem[] = [];
  private debris: Debris[] = [];
  private debrisSource: Mesh;
  private flashLight: PointLight;
  private flashTime = 0;

  constructor(
    private readonly scene: Scene,
    materials: MaterialLibrary,
    private factor: number,
  ) {
    this.puff = createPuffTexture(scene);
    this.flare = createFlareTexture(scene);
    const b = new GeoBuilder();
    b.box(0, 0, 0, 0.5, 0.35, 0.4, { color: hexColor("#b8ae9c"), jitter: 0.15 });
    this.debrisSource = b.toMesh("debris-src", scene);
    this.debrisSource.material = materials.get("stone");
    this.debrisSource.isVisible = false;
    this.debrisSource.isPickable = false;
    for (let i = 0; i < 48; i++) {
      const inst = this.debrisSource.createInstance(`debris#${i}`);
      inst.setEnabled(false);
      inst.isPickable = false;
      this.debris.push({ mesh: inst, vel: new Vector3(), spin: new Vector3(), life: 0 });
    }
    this.flashLight = new PointLight("muzzle-flash", Vector3.Zero(), scene);
    this.flashLight.diffuse = new Color3(1, 0.7, 0.35);
    this.flashLight.intensity = 0;
    this.flashLight.range = 40;
  }

  /** Quality multiplier for emit rates (for callers that drive their own emitters). */
  get quality(): number {
    return Math.max(0.15, this.factor);
  }

  setFactor(f: number): void {
    this.factor = f;
    for (const ps of this.ambient) ps.emitRate = (ps as ParticleSystem & { baseRate?: number }).baseRate! * Math.max(0.15, f);
  }

  private sizeGradient(ps: ParticleSystem, start: number, end: number): void {
    if (ps.getSizeGradients()?.length) return;
    ps.addSizeGradient(0, start);
    ps.addSizeGradient(1, end);
  }

  private makeSystem(name: string, capacity: number, texture: BaseTexture): ParticleSystem {
    const ps = new ParticleSystem(name, Math.max(8, Math.round(capacity)), this.scene);
    ps.particleTexture = texture;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.isLocal = false;
    ps.preventAutoStart = true;
    return ps;
  }

  private takeFromPool(pool: ParticleSystem[], create: () => ParticleSystem): ParticleSystem {
    const free = pool.find((p) => !p.isAlive() && !p.isStarted());
    if (free) return free;
    const ps = create();
    pool.push(ps);
    return ps;
  }

  /** Thick stylized cannon smoke rolling forward from the muzzle. */
  cannonSmoke(at: Vector3, dir: Vector3): void {
    const ps = this.takeFromPool(this.smokePool, () => this.makeSystem("cannon-smoke", 140, this.puff));
    ps.reset();
    ps.emitter = at.clone();
    ps.minEmitBox = new Vector3(-0.3, -0.3, -0.3);
    ps.maxEmitBox = new Vector3(0.3, 0.3, 0.3);
    ps.direction1 = dir.scale(6).add(new Vector3(-1.5, 0.5, -1.5));
    ps.direction2 = dir.scale(14).add(new Vector3(1.5, 3, 1.5));
    ps.minEmitPower = 0.6;
    ps.maxEmitPower = 1.2;
    ps.minLifeTime = 2.5;
    ps.maxLifeTime = 5;
    ps.minSize = 1.6;
    ps.maxSize = 3.6;
    this.sizeGradient(ps, 0.6, 3.4);
    ps.color1 = new Color4(0.93, 0.9, 0.84, 0.85);
    ps.color2 = new Color4(0.8, 0.77, 0.72, 0.75);
    ps.colorDead = new Color4(0.75, 0.72, 0.68, 0);
    ps.gravity = new Vector3(0.6, 0.6, 0);
    ps.minAngularSpeed = -0.6;
    ps.maxAngularSpeed = 0.6;
    ps.updateSpeed = 0.016;
    ps.manualEmitCount = Math.max(20, Math.round(90 * this.factor));
    ps.disposeOnStop = false;
    ps.targetStopDuration = 0.4;
    ps.start();
  }

  muzzleFlash(at: Vector3, dir: Vector3): void {
    const ps = this.takeFromPool(this.flashPool, () => this.makeSystem("muzzle", 40, this.flare));
    ps.reset();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.emitter = at.clone();
    ps.direction1 = dir.scale(6).add(new Vector3(-1, -1, -1));
    ps.direction2 = dir.scale(14).add(new Vector3(1, 1, 1));
    ps.minLifeTime = 0.08;
    ps.maxLifeTime = 0.22;
    ps.minSize = 1.2;
    ps.maxSize = 2.6;
    ps.color1 = new Color4(1, 0.85, 0.45, 1);
    ps.color2 = new Color4(1, 0.55, 0.2, 1);
    ps.colorDead = new Color4(0.4, 0.1, 0, 0);
    ps.manualEmitCount = 24;
    ps.targetStopDuration = 0.15;
    ps.start();
    this.flashLight.position.copyFrom(at);
    this.flashLight.intensity = 60;
    this.flashTime = 0.18;
  }

  /** Dust + stone chunks when a shot hits masonry. */
  impact(at: Vector3, big = false): void {
    const ps = this.takeFromPool(this.dustPool, () => this.makeSystem("impact-dust", 120, this.puff));
    ps.reset();
    ps.emitter = at.clone();
    ps.minEmitBox = new Vector3(-1, -0.5, -1);
    ps.maxEmitBox = new Vector3(1, 0.5, 1);
    ps.direction1 = new Vector3(-4, 2, -4);
    ps.direction2 = new Vector3(4, 7, 4);
    ps.minEmitPower = 0.8;
    ps.maxEmitPower = 1.8;
    ps.minLifeTime = 1.5;
    ps.maxLifeTime = 3.5;
    ps.minSize = big ? 2 : 1.2;
    ps.maxSize = big ? 5 : 3;
    this.sizeGradient(ps, 0.5, 2.5);
    ps.color1 = new Color4(0.82, 0.74, 0.62, 0.9);
    ps.color2 = new Color4(0.7, 0.62, 0.5, 0.8);
    ps.colorDead = new Color4(0.7, 0.65, 0.58, 0);
    ps.gravity = new Vector3(0, -1.5, 0);
    ps.manualEmitCount = Math.max(16, Math.round((big ? 90 : 55) * this.factor));
    ps.targetStopDuration = 0.3;
    ps.start();
    const chunks = big ? 14 : 8;
    let spawned = 0;
    for (const d of this.debris) {
      if (d.life > 0) continue;
      d.mesh.setEnabled(true);
      d.mesh.position.copyFrom(at);
      d.vel.set((Math.random() - 0.5) * 12, 4 + Math.random() * 9, (Math.random() - 0.5) * 12);
      d.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.mesh.scaling.setAll(0.6 + Math.random() * (big ? 1.4 : 0.9));
      d.life = 3 + Math.random();
      if (++spawned >= chunks) break;
    }
  }

  /** Small puff of dust (footfalls of the crew, rope pulls, ship hull scraping). */
  dustPuff(at: Vector3, amount = 10, tint?: Color4): void {
    if (this.factor <= 0) return;
    const ps = this.takeFromPool(this.dustPool, () => this.makeSystem("impact-dust", 120, this.puff));
    ps.reset();
    ps.emitter = at.clone();
    ps.minEmitBox = new Vector3(-0.8, 0, -0.8);
    ps.maxEmitBox = new Vector3(0.8, 0.2, 0.8);
    ps.direction1 = new Vector3(-1, 0.5, -1);
    ps.direction2 = new Vector3(1, 1.5, 1);
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.8;
    ps.minSize = 0.6;
    ps.maxSize = 1.4;
    ps.color1 = tint ?? new Color4(0.75, 0.66, 0.5, 0.5);
    ps.color2 = tint ? new Color4(tint.r * 0.92, tint.g * 0.92, tint.b * 0.92, tint.a * 0.8) : new Color4(0.7, 0.62, 0.48, 0.4);
    ps.colorDead = tint ? new Color4(tint.r, tint.g, tint.b, 0) : new Color4(0.7, 0.62, 0.48, 0);
    ps.gravity = new Vector3(0, -0.4, 0);
    ps.manualEmitCount = Math.round(amount * this.factor);
    ps.targetStopDuration = 0.2;
    ps.start();
  }

  splash(at: Vector3): void {
    const ps = this.takeFromPool(this.dustPool, () => this.makeSystem("impact-dust", 120, this.puff));
    ps.reset();
    ps.emitter = at.clone();
    ps.minEmitBox = new Vector3(-2, 0, -2);
    ps.maxEmitBox = new Vector3(2, 0.2, 2);
    ps.direction1 = new Vector3(-2, 5, -2);
    ps.direction2 = new Vector3(2, 9, 2);
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.6;
    ps.minSize = 0.8;
    ps.maxSize = 2;
    ps.color1 = new Color4(0.95, 0.97, 1, 0.9);
    ps.color2 = new Color4(0.85, 0.92, 0.95, 0.8);
    ps.colorDead = new Color4(0.9, 0.95, 1, 0);
    ps.gravity = new Vector3(0, -9, 0);
    ps.manualEmitCount = Math.max(12, Math.round(60 * this.factor));
    ps.targetStopDuration = 0.2;
    ps.start();
  }

  // ------------------------------------------------------------------ ambient emitters
  private ambientSystem(name: string, capacity: number, rate: number, texture: BaseTexture, emitter: Vector3 | AbstractMesh): ParticleSystem {
    const ps = this.makeSystem(name, capacity * Math.max(0.3, this.factor), texture);
    (ps as ParticleSystem & { baseRate?: number }).baseRate = rate;
    ps.emitRate = rate * Math.max(0.15, this.factor);
    ps.emitter = emitter;
    this.ambient.push(ps);
    return ps;
  }

  /** Fire + smoke emitters; returned so callers can drive their strength (e.g. a hearth). */
  campfire(at: Vector3): { fire: ParticleSystem; smoke: ParticleSystem } {
    const fire = this.ambientSystem("fire", 40, 18, this.flare, at.add(new Vector3(0, 0.3, 0)));
    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.minEmitBox = new Vector3(-0.3, 0, -0.3);
    fire.maxEmitBox = new Vector3(0.3, 0.2, 0.3);
    fire.direction1 = new Vector3(-0.2, 1.5, -0.2);
    fire.direction2 = new Vector3(0.2, 2.5, 0.2);
    fire.minLifeTime = 0.3;
    fire.maxLifeTime = 0.7;
    fire.minSize = 0.35;
    fire.maxSize = 0.8;
    fire.color1 = new Color4(1, 0.7, 0.3, 1);
    fire.color2 = new Color4(1, 0.45, 0.15, 1);
    fire.colorDead = new Color4(0.3, 0.05, 0, 0);
    fire.start();
    const smoke = this.ambientSystem("campsmoke", 60, 6, this.puff, at.add(new Vector3(0, 1.2, 0)));
    smoke.minEmitBox = new Vector3(-0.2, 0, -0.2);
    smoke.maxEmitBox = new Vector3(0.2, 0, 0.2);
    smoke.direction1 = new Vector3(-0.2, 1.2, -0.2);
    smoke.direction2 = new Vector3(0.4, 2, 0.4);
    smoke.minLifeTime = 4;
    smoke.maxLifeTime = 7;
    smoke.minSize = 0.8;
    smoke.maxSize = 1.6;
    this.sizeGradient(smoke, 0.6, 3.5);
    smoke.color1 = new Color4(0.55, 0.52, 0.5, 0.35);
    smoke.color2 = new Color4(0.45, 0.43, 0.42, 0.28);
    smoke.colorDead = new Color4(0.6, 0.58, 0.56, 0);
    smoke.gravity = new Vector3(0.25, 0.1, 0.1);
    smoke.start();
    return { fire, smoke };
  }

  /** Steam rising from a cauldron; emit rate is driven by the caller. */
  steam(at: Vector3, radius: number): ParticleSystem {
    const ps = this.ambientSystem("steam", 50, 0, this.puff, at);
    ps.minEmitBox = new Vector3(-radius, 0, -radius);
    ps.maxEmitBox = new Vector3(radius, 0.05, radius);
    ps.direction1 = new Vector3(-0.15, 0.9, -0.15);
    ps.direction2 = new Vector3(0.2, 1.4, 0.2);
    ps.minLifeTime = 1.6;
    ps.maxLifeTime = 3;
    ps.minSize = 0.5;
    ps.maxSize = 1.1;
    this.sizeGradient(ps, 0.5, 2.6);
    ps.color1 = new Color4(0.95, 0.95, 0.93, 0.32);
    ps.color2 = new Color4(0.9, 0.9, 0.9, 0.24);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.gravity = new Vector3(0.15, 0.2, 0.05);
    ps.start();
    return ps;
  }

  /** Large lazy smoke column (burning siege area / city). */
  smokeColumn(at: Vector3, scale = 1): ParticleSystem {
    const ps = this.ambientSystem("column", 70, 5 * scale, this.puff, at);
    ps.minEmitBox = new Vector3(-2, 0, -2);
    ps.maxEmitBox = new Vector3(2, 1, 2);
    ps.direction1 = new Vector3(-0.5, 2, -0.5);
    ps.direction2 = new Vector3(0.8, 3.5, 0.8);
    ps.minLifeTime = 8;
    ps.maxLifeTime = 14;
    ps.minSize = 3 * scale;
    ps.maxSize = 6 * scale;
    this.sizeGradient(ps, 0.5, 3);
    ps.color1 = new Color4(0.42, 0.4, 0.38, 0.4);
    ps.color2 = new Color4(0.35, 0.33, 0.32, 0.3);
    ps.colorDead = new Color4(0.5, 0.48, 0.46, 0);
    ps.gravity = new Vector3(0.5, 0.3, 0.2);
    ps.start();
    return ps;
  }

  /** Floating dust motes around the camera (gives depth to sunlight). */
  environmentDust(follow: AbstractMesh | Vector3): void {
    const ps = this.ambientSystem("motes", 120, 14, this.flare, follow);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.minEmitBox = new Vector3(-14, -2, -14);
    ps.maxEmitBox = new Vector3(14, 6, 14);
    ps.direction1 = new Vector3(-0.2, -0.05, -0.2);
    ps.direction2 = new Vector3(0.3, 0.1, 0.3);
    ps.minLifeTime = 4;
    ps.maxLifeTime = 8;
    ps.minSize = 0.02;
    ps.maxSize = 0.06;
    ps.color1 = new Color4(1, 0.9, 0.7, 0.5);
    ps.color2 = new Color4(1, 0.95, 0.85, 0.3);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.start();
  }

  /** Low drifting haze/fog banks (e.g. over the Golden Horn in the morning). */
  fogBank(at: Vector3, size: number): void {
    const ps = this.ambientSystem("fogbank", 30, 1.2, this.puff, at);
    ps.minEmitBox = new Vector3(-size, 0, -size * 0.4);
    ps.maxEmitBox = new Vector3(size, 2, size * 0.4);
    ps.direction1 = new Vector3(0.3, 0, -0.1);
    ps.direction2 = new Vector3(0.6, 0.05, 0.1);
    ps.minLifeTime = 18;
    ps.maxLifeTime = 26;
    ps.minSize = 14;
    ps.maxSize = 24;
    ps.color1 = new Color4(0.95, 0.93, 0.88, 0.14);
    ps.color2 = new Color4(0.9, 0.9, 0.88, 0.1);
    ps.colorDead = new Color4(0.95, 0.95, 0.9, 0);
    ps.preWarmCycles = 60;
    ps.preWarmStepOffset = 10;
    ps.start();
  }

  /** Foam/spray at a moving hull (sea foam). */
  createWake(emitter: AbstractMesh): ParticleSystem {
    const ps = this.ambientSystem("wake", 50, 0, this.puff, emitter);
    ps.minEmitBox = new Vector3(-2, -0.4, -6);
    ps.maxEmitBox = new Vector3(2, 0, 6);
    ps.direction1 = new Vector3(-1, 0.6, -1);
    ps.direction2 = new Vector3(1, 1.4, 1);
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 1.4;
    ps.minSize = 0.8;
    ps.maxSize = 1.8;
    ps.color1 = new Color4(0.97, 0.98, 1, 0.8);
    ps.color2 = new Color4(0.9, 0.95, 0.97, 0.7);
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.gravity = new Vector3(0, -3, 0);
    ps.start();
    return ps;
  }

  update(dt: number): void {
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flashLight.intensity = Math.max(0, (this.flashTime / 0.18) * 60);
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vel.y -= 18 * dt;
      d.mesh.position.addInPlace(d.vel.scale(dt));
      d.mesh.rotation.addInPlace(d.spin.scale(dt));
      if (d.mesh.position.y < -2 || d.life <= 0) {
        d.life = 0;
        d.mesh.setEnabled(false);
      }
    }
  }

  dispose(): void {
    for (const ps of [...this.smokePool, ...this.dustPool, ...this.flashPool, ...this.ambient]) ps.dispose();
    this.flashLight.dispose();
    this.puff.dispose();
    this.flare.dispose();
  }
}

export function hexColor3(hex: string): Color3 {
  return Color3.FromHexString(hex);
}
