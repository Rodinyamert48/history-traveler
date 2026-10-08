import { hexColor, mixColor, shade, type RGBA } from "../../assets/GeoBuilder";
import { distanceToPolyline, lerp, smoothstep } from "../../utils/math";
import { Noise2D } from "../../utils/noise";

/**
 * Bursa, spring 1326 — Balabancık Hisarı, one of the siege forts (havale) Osman Gazi built
 * to blockade Bursa. The game stays inside its walls; from the ramparts you see the road
 * the fort guards, Bursa's citadel on its hill to the south and snowy Uludağ behind it.
 * Coordinates in meters, +x = east, +z = north.
 *
 *   z ▲         köyler (İnegöl, Yenişehir) ↑ yol
 *     │   ┌──────── Balabancık Hisarı ────────┐
 *     │ yol kapı ▸  avlu · kuyu · otağ (Orhan Gazi)
 *     │   │  mutfak (çevirme)   ahır · koğuş   │
 *     │   └─────────── iç kale (burç) ─────────┘
 *     │            ↓ yol → Bursa (hisar), Uludağ
 *     └──────────────────────────────────────────► x
 */
export const LAYOUT = {
  bounds: { minX: -27, maxX: 27, minZ: -22, maxZ: 22 },
  terrainRect: { minX: -900, minZ: -1250, sizeX: 1800, sizeZ: 1900 },
  /** Fortress curtain wall (inner faces) and its height. */
  wall: { x0: -26, x1: 26, z0: -21, z1: 21, h: 8, t: 2.4 },
  /** Gate in the west wall, opening onto the road. */
  gate: { z0: -3, z1: 3 },
  /** Checkpoint barrier just inside the gate; carts stop outside it. */
  barrier: { x: -24.2 },
  /** Rampart walk on the west wall (stairs at the south-west). */
  walk: { y: 6.2 },
  road: { x: -46 },
  keep: { x: 12, z: -13, w: 12, d: 10, h: 13 },
  otag: { x: 10, z: 8 },
  warTable: { x: 6.2, z: 5.4 },
  kitchen: { x: -16, z: -15 },
  spit: { x: -16, z: -12.6 },
  well: { x: -2, z: 2 },
  stable: { x: 20, z: 14 },
  barracks: { x: -14, z: 15 },
  armory: { x: 1, z: -16 },
  spawn: { x: -5, z: -1, yaw: 1.85 },

  /** Bursa: the Byzantine citadel on its hill, south-east beyond the plain. */
  bursa: { x: 150, z: -540, r: 72 },
  uludag: { x: 210, z: -1030 },
  /** The road the fort guards: from the villages in the north, past the gate, on to Bursa. */
  roadPath: [
    [-60, 600],
    [-50, 250],
    [-46, 60],
    [-46, -40],
    [-30, -200],
    [60, -400],
    [120, -470],
  ] as [number, number][],
};

const noise = new Noise2D(1326);
const MOUND_Y = 6;

/** Plain of Bursa with low hills, the fort on a low mound, and the citadel's hill. */
export function bursaHeight(x: number, z: number): number {
  let h = 2 + noise.fbm(x * 0.004, z * 0.004, 4) * 10;
  // Rolling hills to the north and west.
  h += smoothstep(200, 700, z) * 30 * (0.6 + 0.4 * noise.fbm(x * 0.006 + 3, z * 0.006, 3));
  h += smoothstep(-300, -700, x) * 24 * (0.6 + 0.4 * noise.fbm(x * 0.006, z * 0.006 + 8, 3));
  // Foothills of Uludağ rising to the south.
  h += smoothstep(-560, -900, z) * 120 * (0.7 + 0.3 * noise.fbm(x * 0.004 + 1, z * 0.004, 3));
  // The citadel hill.
  const b = LAYOUT.bursa;
  h += 30 * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * 75 * 75));
  // The fort's mound, levelled inside the walls.
  const r = Math.hypot(x / 1.2, z);
  const mound = 1 - smoothstep(34, 70, r);
  h = lerp(h, MOUND_Y + Math.max(0, h - MOUND_Y) * 0.2, mound);
  const inside = 1 - smoothstep(30, 36, r);
  return lerp(h, MOUND_Y, inside);
}

export const GROUND_Y = MOUND_Y;

const C = {
  grass: hexColor("#7a9a48"),
  grassLush: hexColor("#5f8a3a"),
  meadow: hexColor("#9aa45a"),
  field: hexColor("#b8a868"),
  forest: hexColor("#3f5a2e"),
  dirt: hexColor("#9a7a52"),
  courtyard: hexColor("#a89070"),
  rock: hexColor("#8a867a"),
  snow: hexColor("#eef0f4"),
};

export function bursaColor(x: number, z: number, h: number, slope: number): RGBA {
  const n = noise.noise(x * 0.05, z * 0.05);
  const n2 = noise.noise(x * 0.008 + 40, z * 0.008);
  let c: RGBA = mixColor(C.grass, n2 > 0 ? C.grassLush : C.meadow, Math.abs(n2) * 1.4);
  // Patchwork of fields on the plain.
  const fx = Math.floor(x / 60);
  const fz = Math.floor(z / 45);
  if ((((fx * 7 + fz * 13) % 5) + 5) % 5 === 0 && z > -480 && Math.hypot(x, z) > 60) c = mixColor(c, C.field, 0.6);
  // Forest on Uludağ's slopes, snow above.
  c = mixColor(c, C.forest, smoothstep(30, 90, h) * 0.85);
  c = mixColor(c, C.snow, smoothstep(120, 150, h));
  if (slope < 0.8) c = mixColor(c, C.rock, smoothstep(0.8, 0.6, slope) * 0.8);
  if (distanceToPolyline(x, z, LAYOUT.roadPath) < 4) c = mixColor(c, C.dirt, 0.85);
  const r = Math.hypot(x / 1.2, z);
  c = mixColor(c, C.courtyard, 1 - smoothstep(28, 32, r));
  return shade(c, 1 + n * 0.06);
}
