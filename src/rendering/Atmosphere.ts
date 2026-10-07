import { Color3, Vector3, type Scene } from "@babylonjs/core";
import type { SkyEnvironment } from "./SkyEnvironment";
import { fogColorFromSky, type SkyParams } from "./SkyModel";

/** A complete lighting mood: sky colours, sun, fog and image-based light strength. */
export interface AtmospherePhase {
  sky: SkyParams;
  sunIntensity: number;
  ambientIntensity: number;
  environmentIntensity: number;
  fogDensity: number;
  /** Explicit fog colour; derived from the sky's horizon when omitted. */
  fogColor?: Color3;
}

/**
 * Smoothly blends the live sky dome, sun, hemispheric fill, fog and environment intensity
 * between lighting phases (e.g. afternoon → dusk → night → dawn). The baked reflection cube
 * stays as is; only its intensity follows the phase, which is enough for stylized PBR.
 */
export class AtmosphereController {
  private from: AtmospherePhase;
  private to: AtmospherePhase;
  private t = 1;
  private duration = 1;
  private current: AtmospherePhase;
  /** Called whenever fog changes (e.g. to keep a water shader's fog in sync). */
  onFogChanged: ((color: Color3, density: number) => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly sky: SkyEnvironment,
    initial: AtmospherePhase,
  ) {
    this.from = initial;
    this.to = initial;
    this.current = initial;
  }

  get phase(): AtmospherePhase {
    return this.current;
  }

  get transitioning(): boolean {
    return this.t < 1;
  }

  /** Starts a blend to `target` over `seconds` (0 = instant). */
  transition(target: AtmospherePhase, seconds: number): void {
    this.from = this.current;
    this.to = target;
    this.duration = Math.max(0.001, seconds);
    this.t = seconds <= 0 ? 1 : 0;
    this.apply(seconds <= 0 ? target : this.current);
  }

  update(dt: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.t * this.t * (3 - 2 * this.t);
    this.apply(blendPhase(this.from, this.to, k));
  }

  private apply(p: AtmospherePhase): void {
    this.current = p;
    const { sky, scene } = this;
    const s = p.sky;
    const m = sky.material;
    m.setColor3("zenith", s.zenith);
    m.setColor3("horizon", s.horizon);
    m.setColor3("groundColor", s.ground);
    m.setColor3("sunColor", s.sunColor);
    m.setVector3("sunDir", s.sunDirection);
    m.setFloat("sunIntensity", s.sunIntensity);
    m.setFloat("haze", s.hazeIntensity);
    sky.sun.direction = s.sunDirection.scale(-1);
    sky.sun.position = s.sunDirection.scale(300);
    sky.sun.diffuse = s.sunColor;
    sky.sun.specular = s.sunColor;
    sky.sun.intensity = p.sunIntensity;
    sky.ambient.diffuse = Color3.Lerp(s.zenith, s.horizon, 0.5);
    sky.ambient.groundColor = s.ground.scale(0.9);
    sky.ambient.intensity = p.ambientIntensity * (scene.environmentTexture ? 0.45 : 1);
    if (scene.environmentTexture) scene.environmentIntensity = p.environmentIntensity;
    scene.fogColor = p.fogColor ?? fogColorFromSky(s);
    scene.fogDensity = p.fogDensity;
    this.onFogChanged?.(scene.fogColor, scene.fogDensity);
  }
}

function blendSky(a: SkyParams, b: SkyParams, k: number): SkyParams {
  return {
    zenith: Color3.Lerp(a.zenith, b.zenith, k),
    horizon: Color3.Lerp(a.horizon, b.horizon, k),
    ground: Color3.Lerp(a.ground, b.ground, k),
    sunColor: Color3.Lerp(a.sunColor, b.sunColor, k),
    sunDirection: Vector3.Lerp(a.sunDirection, b.sunDirection, k).normalize(),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k,
    hazeIntensity: a.hazeIntensity + (b.hazeIntensity - a.hazeIntensity) * k,
  };
}

function blendPhase(a: AtmospherePhase, b: AtmospherePhase, k: number): AtmospherePhase {
  const sky = blendSky(a.sky, b.sky, k);
  const fa = a.fogColor ?? fogColorFromSky(a.sky);
  const fb = b.fogColor ?? fogColorFromSky(b.sky);
  return {
    sky,
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k,
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * k,
    environmentIntensity: a.environmentIntensity + (b.environmentIntensity - a.environmentIntensity) * k,
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * k,
    fogColor: Color3.Lerp(fa, fb, k),
  };
}
