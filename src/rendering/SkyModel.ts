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
  /** Golden late afternoon over the Menteşe pine hills (sun low in the west). */
  muglaAfternoon: (): SkyParams => ({
    zenith: lin("#4b82bd"),
    horizon: lin("#e4dccb"),
    ground: lin("#5e5a44"),
    sunColor: lin("#ffe6c0"),
    sunDirection: new Vector3(-0.62, 0.45, 0.3).normalize(),
    sunIntensity: 9,
    hazeIntensity: 0.42,
  }),
  muglaDusk: (): SkyParams => ({
    zenith: lin("#34497a"),
    horizon: lin("#f09a62"),
    ground: lin("#4a3a30"),
    sunColor: lin("#ff9850"),
    sunDirection: new Vector3(-0.92, 0.1, 0.35).normalize(),
    sunIntensity: 7,
    hazeIntensity: 0.65,
  }),
  /** Moonlit night: the "sun" becomes a cool, dim moon high in the east. */
  muglaNight: (): SkyParams => ({
    zenith: lin("#0a1326"),
    horizon: lin("#25314d"),
    ground: lin("#0e1016"),
    sunColor: lin("#a9bcff"),
    sunDirection: new Vector3(0.45, 0.62, -0.25).normalize(),
    sunIntensity: 1.6,
    hazeIntensity: 0.12,
  }),
  muglaDawn: (): SkyParams => ({
    zenith: lin("#5a80b2"),
    horizon: lin("#f5c79c"),
    ground: lin("#5a4a3a"),
    sunColor: lin("#ffd09a"),
    sunDirection: new Vector3(0.82, 0.24, -0.2).normalize(),
    sunIntensity: 8,
    hazeIntensity: 0.5,
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
