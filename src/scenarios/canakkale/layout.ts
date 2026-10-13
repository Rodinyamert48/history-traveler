import { hexColor, mixColor, shade, type RGBA } from "../../assets/GeoBuilder";
import { lerp, smoothstep } from "../../utils/math";
import { Noise2D } from "../../utils/noise";

/**
 * Çanakkale, 18 March 1915 — Rumeli Mecidiye Tabyası, a coastal battery on the European
 * shore of the Dardanelles just south of Kilitbahir. The battery sits on a levelled shoulder of
 * the hill above the water; the Narrows run north–south in front of it, the Asian shore with
 * Çanakkale and Çimenlik Kalesi lies across, and to the south-east opens Erenköy Bay where the
 * Allied fleet comes in. Distances across the water are compressed to keep the fleet in view.
 * Coordinates in meters, +x = east (across the strait), +z = north (toward the Narrows).
 *
 *   z ▲   Kilitbahir Kalesi ·  ·  ·  Boğaz  ·  ·  ·  Çimenlik Kalesi, Çanakkale
 *     │   TABYA ▸ (topçu hattı yüzü güneydoğuya)        Anadolu yakası
 *     │                 İtilaf donanması  ·  ·  Erenköy Koyu (Nusret'in mayınları)
 *     └──────────────────────────────────────────────────────────────► x
 */

/** The battery's frame: it faces south-east across the water. */
export const FACING = 2.25;
const SF = Math.sin(FACING);
const CF = Math.cos(FACING);

/** Battery-local (u = right, v = forward) → world (x, z). */
export function bw(u: number, v: number): [number, number] {
  return [u * CF + v * SF, -u * SF + v * CF];
}

/** World (x, z) → battery-local (u, v). */
export function bl(x: number, z: number): [number, number] {
  return [x * CF - z * SF, x * SF + z * CF];
}

export const LAYOUT = {
  bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
  terrainRect: { minX: -420, minZ: -1200, sizeX: 1720, sizeZ: 2000 },
  waterLevel: 0,
  /** Height of the levelled battery ground. */
  plateauY: 26,
  /** Battery-local extents (u across, v forward) of the levelled ground. */
  local: { u0: -40, u1: 40, v0: -36, v1: 18 },
  /** Front parapet line (v) and the four gun pits along it (u); gun 3 is ours. */
  parapetV: 16,
  guns: [-24, -8, 8, 24],
  mainGun: 2,
  depot: { u: -6, v: -16 },
  crane: { u: 12.6, v: 8.4 },
  telemetre: { u: 32, v: 8 },
  flag: { u: 0, v: -6 },
  tents: { u0: -26, u1: 26, v: -28 },
  kitchen: { u: -32, v: -22 },
  spawn: { u: 9, v: -15 },

  kilitbahir: { x: 70, z: 470 },
  cimenlik: { x: 700, z: 470 },
  /** Where Nusret's mines lie in Erenköy Bay; the Bouvet runs onto them. */
  minefield: { x: 520, z: -470 },
};

const noise = new Noise2D(1915);

/** European shoreline (x of the water's edge) along z. */
export function coastEU(z: number): number {
  let x = 64 + Math.sin(z / 170) * 22 + noise.noise(z * 0.01, 3) * 10;
  if (z < -120) x -= (-120 - z) * 0.32;
  return x;
}

/** Asian shoreline; Erenköy Bay opens to the south-east. */
export function coastAS(z: number): number {
  let x = 640 + Math.sin(z / 140 + 1) * 18 + noise.noise(z * 0.012, 9) * 12;
  if (z < -260) x += Math.min(260, (-260 - z) * 0.55);
  return x;
}

function raw(x: number, z: number): number {
  const ce = coastEU(z);
  const ca = coastAS(z);
  const mid = (ce + ca) / 2;
  if (x < mid) {
    const d = ce - x;
    if (d < 0) return lerp(-1.5, -24, smoothstep(0, 70, -d));
    // Gallipoli's scrubby hills rising behind the shore.
    return 1 + smoothstep(0, 46, d) * 26 + smoothstep(60, 420, d) * 70 * (0.7 + 0.5 * noise.fbm(x * 0.006, z * 0.006, 3)) + noise.fbm(x * 0.03, z * 0.03, 2) * 2;
  }
  const d = x - ca;
  if (d < 0) return lerp(-1.5, -24, smoothstep(0, 70, -d));
  return 1 + smoothstep(0, 70, d) * 12 + smoothstep(80, 700, d) * 80 * (0.6 + 0.5 * noise.fbm(x * 0.005 + 4, z * 0.005, 3));
}

export function canakkaleHeight(x: number, z: number): number {
  const [u, v] = bl(x, z);
  const L = LAYOUT.local;
  // The battery's levelled ground, blending out over a few meters.
  const inside = smoothstep(-8, 0, -Math.max(u - L.u1, L.u0 - u, v - L.v1, L.v0 - v));
  const y = lerp(raw(x, z), LAYOUT.plateauY, inside);
  // In front of the parapet the ground falls steeply toward the shore.
  const front = smoothstep(L.v1, L.v1 + 30, v) * (1 - smoothstep(L.u1 + 10, L.u1 + 40, Math.abs(u)));
  return lerp(y, Math.min(y, LAYOUT.plateauY - (v - L.v1) * 0.9), front);
}

const C = {
  scrub: hexColor("#7a8a4a"),
  scrubDark: hexColor("#5a6a38"),
  dry: hexColor("#a89a64"),
  earth: hexColor("#9a8058"),
  trampled: hexColor("#a89070"),
  rock: hexColor("#8a8478"),
  sand: hexColor("#cdbb8e"),
  town: hexColor("#b0a080"),
};

export function canakkaleColor(x: number, z: number, h: number, slope: number): RGBA {
  const n = noise.noise(x * 0.05, z * 0.05);
  const n2 = noise.noise(x * 0.01 + 30, z * 0.01);
  let c: RGBA = mixColor(C.scrub, n2 > 0 ? C.scrubDark : C.dry, Math.abs(n2) * 1.4);
  if (slope < 0.8) c = mixColor(c, C.rock, smoothstep(0.8, 0.55, slope));
  if (h < 2.2 && h > -3) c = mixColor(c, C.sand, smoothstep(2.2, 0.4, h));
  const [u, v] = bl(x, z);
  const L = LAYOUT.local;
  const inBattery = u > L.u0 - 2 && u < L.u1 + 2 && v > L.v0 - 2 && v < L.v1 + 2;
  if (inBattery) c = mixColor(c, C.trampled, 0.75);
  // The town across the water.
  if (x > coastAS(z) + 30 && z > 300 && z < 760) c = mixColor(c, C.town, 0.45);
  return shade(c, 1 + n * 0.07);
}
