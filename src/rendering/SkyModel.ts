import { Color3, Vector3 } from "@babylonjs/core";

/**
 * Analytic stylized sky. The exact same formula is evaluated:
 *  - on the GPU by the sky-dome shader, and
 *  - on the CPU to bake the HDR environment cube used for PBR reflections / irradiance,
 * so lighting always matches what the player sees.
 */
export interface SkyParams {
  zenith: Color3;
  horizon: Color3;
  ground: Color3;
  sunColor: Color3;
  sunDirection: Vector3;
  sunIntensity: number;
  hazeIntensity: number;
}

const lin = (hex: string) => Color3.FromHexString(hex).toLinearSpace();

export const SKY_PRESETS = {
  /** Warm late-morning light over the Bosphorus. */
  istanbulMorning: (): SkyParams => ({
    zenith: lin("#5f8fc4"),
    horizon: lin("#e9d9bd"),
    ground: lin("#6d6150"),
    sunColor: lin("#fff1d6"),
    sunDirection: new Vector3(-0.42, 0.62, 0.48).normalize(),
    sunIntensity: 9,
    hazeIntensity: 0.35,
  }),
  /** Cleaner, cooler daylight for the map table. */
  mapDay: (): SkyParams => ({
    zenith: lin("#3d6fa6"),
    horizon: lin("#c9d6dc"),
    ground: lin("#3b3a36"),
    sunColor: lin("#fff4e0"),
    sunDirection: new Vector3(-0.35, 0.78, -0.4).normalize(),
    sunIntensity: 6,
    hazeIntensity: 0.25,
  }),
};

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** CPU evaluation of the sky color for a normalized direction. Output is linear HDR. */
export function sampleSky(p: SkyParams, dx: number, dy: number, dz: number, includeSunDisc: boolean, out: number[]): void {
  const up = Math.max(dy, 0);
  const t = Math.pow(up, 0.5);
  let r = p.horizon.r + (p.zenith.r - p.horizon.r) * t;
  let g = p.horizon.g + (p.zenith.g - p.horizon.g) * t;
  let b = p.horizon.b + (p.zenith.b - p.horizon.b) * t;
  if (dy < 0) {
    const k = smooth(0, 0.22, -dy);
    r = p.horizon.r * 0.85 + (p.ground.r - p.horizon.r * 0.85) * k;
    g = p.horizon.g * 0.85 + (p.ground.g - p.horizon.g * 0.85) * k;
    b = p.horizon.b * 0.85 + (p.ground.b - p.horizon.b * 0.85) * k;
  }
  const haze = p.hazeIntensity * Math.exp(-Math.abs(dy) * 9);
  r += haze * p.horizon.r;
  g += haze * p.horizon.g;
  b += haze * p.horizon.b;
  const s = p.sunDirection;
  const d = Math.max(0, dx * s.x + dy * s.y + dz * s.z);
  const glow = Math.pow(d, 10) * 0.45 + Math.pow(d, 90) * 1.2;
  const disc = includeSunDisc ? smooth(0.9994, 0.99975, d) * p.sunIntensity : 0;
  r += p.sunColor.r * (glow + disc);
  g += p.sunColor.g * (glow + disc);
  b += p.sunColor.b * (glow + disc);
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

export function fogColorFromSky(p: SkyParams): Color3 {
  const tmp = [0, 0, 0];
  sampleSky(p, 0, 0.02, 1, false, tmp);
  return new Color3(tmp[0], tmp[1], tmp[2]);
}
