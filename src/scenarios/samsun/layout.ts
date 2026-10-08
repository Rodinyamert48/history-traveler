import { hexColor, mixColor, shade, type RGBA } from "../../assets/GeoBuilder";
import { distanceToPolyline, lerp, smoothstep } from "../../utils/math";
import { Noise2D } from "../../utils/noise";

/**
 * Samsun, 19 May 1919 — a hilltop army post (karakol) above the town. The hills fall away
 * north to the coastal plain, the town and the harbour; the Black Sea lies beyond, where the
 * Bandırma steamer arrives at dawn. Coordinates in meters, +x = east, +z = north (the sea).
 *
 *   z ▲   Karadeniz · İngiliz savaş gemisi · Bandırma vapuru        z ≈ 400…
 *     │   Samsun · iskele · camiler (kıyı ovası)                     z ≈ 290…370
 *     │   kuzey yamacı · gözetleme siperi (dürbün)                  z ≈ 34
 *     │   atış alanı ← KARAKOL (bayrak, çadırlar, içtima alanı) → doğu tepeleri
 *     │   köy yolu ↙ çiftlik
 *     └────────────────────────────────────────────────────────► x
 */
export const LAYOUT = {
  bounds: { minX: -125, maxX: 125, minZ: -120, maxZ: 112 },
  terrainRect: { minX: -560, minZ: -420, sizeX: 1120, sizeZ: 1020 },
  waterLevel: 0,

  plateauRadius: 42,
  flag: { x: 0, z: 4 },
  barrack: { x: -16, z: -12, rot: 0.15 },
  tents: { x0: 8, x1: 30, z0: -24, z1: -10 },
  /** Parade ground: soldiers line up along z = line facing the commander (north). */
  parade: { x: 16, z: 8, line: 6, commanderZ: 13.5 },
  lookout: { x: 0, z: 34 },
  /** Firing line faces west, targets stand down the slope. */
  range: { x: -30, z: 4 },
  targets: [
    [-55, -4],
    [-60, 12],
    [-68, 2],
    [-76, 15],
    [-84, -6],
    [-95, 8],
  ] as [number, number][],
  gun: { x: 22, z: 30 },
  koyYolu: { x: -40, z: -52 },
  farm: { x: -68, z: -86 },
  spawn: { x: 6, z: -18, yaw: 0 },

  /** Harbour (iskele) and the anchorage. */
  pier: { x: 40, z: 368 },
  ships: {
    warship: { x: 190, z: 470, rot: -0.3 },
    steamer: { x: -110, z: 455, rot: 0.4 },
    bandirmaFrom: { x: -720, z: 470 },
    bandirmaTo: { x: 46, z: 420 },
  },
};

/** Dirt paths around the post. */
export const PATHS: [number, number][][] = [
  // Gate road coming up from the south-east.
  [
    [118, -110],
    [70, -70],
    [36, -36],
    [10, -14],
  ],
  // To the lookout trench.
  [
    [0, 0],
    [0, 32],
  ],
  // To the firing line.
  [
    [-4, 0],
    [-30, 4],
  ],
  // Down to the village and the farm.
  [
    [-10, -12],
    [-30, -36],
    [-40, -52],
    [-56, -72],
    [-68, -86],
  ],
];

const noise = new Noise2D(1919);

function raw(x: number, z: number): number {
  // Rolling green hills of the Canik mountains.
  let h = 28 + noise.fbm(x * 0.006, z * 0.006, 4) * 14;
  // The post's hill is the highest point around, falling away on every side.
  h += 64 * Math.exp(-(x * x + z * z) / (2 * 125 * 125));
  h += 30 * Math.exp(-((x - 280) ** 2 + (z + 40) ** 2) / (2 * 110 * 110));
  h += 32 * Math.exp(-((x + 310) ** 2 + (z - 10) ** 2) / (2 * 120 * 120));
  h += smoothstep(-160, -420, z) * 80 * (0.7 + 0.4 * noise.fbm(x * 0.008 + 5, z * 0.008, 3));
  // Down to the coastal plain where the town lies, then the sea.
  h = lerp(h, 4 + noise.fbm(x * 0.02, z * 0.02, 2) * 1.5, smoothstep(170, 285, z));
  h = lerp(h, -9, smoothstep(355, 395, z));
  return h;
}

const PLATEAU = raw(0, 0);

export function samsunHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const h = raw(x, z);
  // The post sits on a levelled hilltop.
  const flat = 1 - smoothstep(LAYOUT.plateauRadius - 10, LAYOUT.plateauRadius + 8, r);
  let y = lerp(h, PLATEAU + noise.fbm(x * 0.05, z * 0.05, 2) * 0.3, flat);
  // The firing range: a levelled spur running west, rising gently toward the target berm.
  const shelf = smoothstep(28, 18, Math.abs(z - 5)) * smoothstep(-124, -112, x) * smoothstep(-18, -30, x);
  y = lerp(y, PLATEAU + Math.max(0, -30 - x) * 0.03, shelf);
  return y;
}

export const PLATEAU_Y = PLATEAU;

const C = {
  grass: hexColor("#6f8f3e"),
  grassLush: hexColor("#557a32"),
  meadow: hexColor("#8a9a4a"),
  forest: hexColor("#3f5a2e"),
  dirt: hexColor("#8a7050"),
  trampled: hexColor("#9a8a62"),
  rock: hexColor("#8a867a"),
  sand: hexColor("#cdbb8e"),
  town: hexColor("#a89878"),
};

export function onPath(x: number, z: number, d: number): boolean {
  return PATHS.some((p) => distanceToPolyline(x, z, p) < d);
}

/** Per-face terrain colouring. */
export function samsunColor(x: number, z: number, h: number, slope: number): RGBA {
  const n = noise.noise(x * 0.06, z * 0.06);
  const n2 = noise.noise(x * 0.012 + 40, z * 0.012);
  let c: RGBA = mixColor(C.grass, n2 > 0 ? C.grassLush : C.meadow, Math.abs(n2) * 1.3);
  // Darker woods on the far slopes.
  const r = Math.hypot(x, z);
  c = mixColor(c, C.forest, smoothstep(140, 220, r) * (z < 200 ? 0.7 : 0.2) * (0.6 + 0.4 * Math.max(0, n)));
  if (slope < 0.82) c = mixColor(c, C.rock, smoothstep(0.82, 0.62, slope));
  // The trampled camp ground on the plateau.
  c = mixColor(c, C.trampled, (1 - smoothstep(LAYOUT.plateauRadius - 18, LAYOUT.plateauRadius - 4, r)) * 0.55);
  if (onPath(x, z, 2.2)) c = mixColor(c, C.dirt, 0.8);
  // Town ground and the beach.
  c = mixColor(c, C.town, smoothstep(280, 300, z) * (1 - smoothstep(345, 360, z)) * 0.55);
  if (h < 2.5 && z > 300) c = mixColor(c, C.sand, smoothstep(2.5, 0.5, h));
  return shade(c, 1 + n * 0.06);
}
