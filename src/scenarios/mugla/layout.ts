import { hexColor, mixColor, shade, type RGBA } from "../../assets/GeoBuilder";
import { distanceToPolyline, lerp, smoothstep } from "../../utils/math";
import { Noise2D } from "../../utils/noise";

/**
 * "Temsili Menteşe köyü" — a hillside village in the Muğla highlands of the Menteşe
 * Beyliği era. Coordinates in meters, +x = east, +z = north.
 *
 *   z ▲   Asar dağları · kızılçam ormanı (pine forest)            z ≈ 90…220
 *     │   kovanlar · orman yolu
 *     │   ambar · gelin evi │ kuzey sokağı │ Ayşe Nine'nin evi
 *     │   mescit · dibek ── MEYDAN (çınar, ocak, çeşme) ── doğu sokağı
 *     │   bakkal │ güney sokağı │ kasap
 *     │   harman yeri · anız tarlaları (harvested fields)          z ≈ -80…-200
 *     └──────────────────────────────────────────────────────────► x
 */
export const LAYOUT = {
  bounds: { minX: -235, maxX: 235, minZ: -235, maxZ: 235 },
  terrainRect: { minX: -280, minZ: -280, sizeX: 560, sizeZ: 560 },

  square: { x: 0, z: 0, radius: 15 },
  cinar: { x: -3, z: 3 },
  cesme: { x: 13.5, z: -8.5, rot: -Math.PI / 2 },
  dibek: { x: -10, z: -6 },
  ocak: { x: 9, z: 9 },
  sundurma: { x: 15.5, z: 12.5 },
  ambar: { x: -38, z: 16, rot: Math.PI / 2 },
  mescit: { x: -31, z: -13, rot: Math.PI / 2 },
  kasap: { x: 8.5, z: -27, rot: -Math.PI / 2 },
  bakkal: { x: -8.5, z: -27, rot: Math.PI / 2 },
  weddingFlag: { x: -13, z: 13 },
  forestGate: { x: 0, z: 86 },
  /** Area where dry branches / çıra spawn in the gathering minigame. */
  forestZone: { minX: -70, maxX: 70, minZ: 96, maxZ: 168 },
  beehives: { x: 24, z: 80 },
  harman: { x: -46, z: -96 },
  spawn: { x: 1.5, z: -52, yaw: 0 },

  /** Wedding tables around the square for the finale. */
  sofras: [
    [-7, -10],
    [6.5, -12],
    [-12, 4.5],
  ] as [number, number][],

  /** Places kept free of house lots. */
  reserved: [
    { x: 9, z: 9, r: 9 },
    { x: 15.5, z: 12.5, r: 6 },
    { x: -38, z: 16, r: 10 },
    { x: -31, z: -13, r: 10 },
    { x: 8.5, z: -27, r: 6 },
    { x: -8.5, z: -27, r: 6 },
    { x: 0, z: 86, r: 10 },
  ],
};

/** Cobbled streets (Arnavut kaldırımı) radiating from the square. */
export const STREETS: [number, number][][] = [
  // North: square → forest path.
  [
    [0, 14],
    [1.5, 40],
    [-1, 62],
    [0, 86],
  ],
  // South: square → market → fields.
  [
    [0, -14],
    [0.5, -40],
    [2.5, -70],
    [4, -96],
  ],
  // East.
  [
    [14, 0],
    [40, 1.5],
    [70, -1],
    [92, 2],
  ],
  // West.
  [
    [-14, 0],
    [-40, -1.5],
    [-70, 1],
    [-92, -2],
  ],
];

/** Footpath into the forest (dirt, not cobbled). */
export const FOREST_PATH: [number, number][] = [
  [0, 86],
  [-6, 104],
  [4, 122],
  [-3, 140],
  [6, 160],
];

const noise = new Noise2D(1375);

export function muglaHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  // Rolling Menteşe uplands.
  let h = 10 + noise.fbm(x * 0.007, z * 0.007, 4) * 9;
  // The village sits on a gently north-rising shelf.
  const plane = 10 + z * 0.03 + noise.fbm(x * 0.03 + 9, z * 0.03, 2) * 0.35;
  h = lerp(h, plane, 1 - smoothstep(95, 135, r));
  // Pine-covered hills to the north.
  h += smoothstep(84, 240, z) * 40 * (0.75 + 0.35 * noise.fbm(x * 0.012 + 3, z * 0.012, 3));
  // Mountains ringing the basin.
  h += smoothstep(175, 275, r) * 75 * (0.65 + 0.45 * noise.fbm(x * 0.01 - 7, z * 0.01 + 2, 3));
  // Fields to the south settle a little lower.
  h -= smoothstep(-70, -140, z) * (1 - smoothstep(160, 220, r)) * 2.5;
  return h;
}

const C = {
  grassDry: hexColor("#a39a5c"),
  grass: hexColor("#808a48"),
  scrub: hexColor("#66703c"),
  dirt: hexColor("#a88a62"),
  street: hexColor("#b59878"),
  needles: hexColor("#5e5236"),
  understory: hexColor("#4a5a32"),
  rock: hexColor("#8f887c"),
  stubble: hexColor("#c9a65e"),
  stubbleDark: hexColor("#a98a4a"),
  harman: hexColor("#b8a888"),
};

export function inForest(x: number, z: number): number {
  const edge = 88 + noise.noise(x * 0.04, 3) * 6;
  return smoothstep(edge - 4, edge + 8, z) * (1 - smoothstep(200, 230, Math.abs(x)));
}

/** Per-face terrain colouring (biomes). */
export function muglaColor(x: number, z: number, h: number, slope: number): RGBA {
  const n = noise.noise(x * 0.07, z * 0.07);
  const n2 = noise.noise(x * 0.015 + 40, z * 0.015);
  let c: RGBA = mixColor(C.grassDry, n2 > 0 ? C.grass : C.scrub, Math.abs(n2) * 1.3);
  // Pine-covered hills all around: needle litter and maquis tint the ground.
  const r0 = Math.hypot(x, z);
  const forest = Math.max(inForest(x, z), smoothstep(100, 135, r0) * (z < -70 && r0 < 175 ? 0 : 0.75));
  if (forest > 0) c = mixColor(c, mixColor(C.needles, C.understory, Math.max(0, n) * 0.8 + 0.2), forest);
  if (z < -72) {
    // Harvested wheat: stubble in plough rows.
    const rows = 0.5 + 0.5 * Math.sin(x * 0.9 + n * 2);
    const field = smoothstep(-72, -84, z) * (1 - smoothstep(150, 190, Math.hypot(x, z)));
    c = mixColor(c, mixColor(C.stubble, C.stubbleDark, rows * 0.6), field);
  }
  if (slope < 0.8 || h > 70) c = mixColor(c, C.rock, Math.max(smoothstep(0.8, 0.6, slope), smoothstep(70, 95, h)));
  const r = Math.hypot(x, z);
  c = mixColor(c, C.dirt, (1 - smoothstep(16, 30, r)) * 0.7);
  for (const s of STREETS) if (distanceToPolyline(x, z, s) < 4.2) c = mixColor(c, C.street, 0.8);
  if (distanceToPolyline(x, z, FOREST_PATH) < 2.2) c = mixColor(c, C.dirt, 0.75);
  if (Math.hypot(x - LAYOUT.harman.x, z - LAYOUT.harman.z) < 9) c = mixColor(c, C.harman, 0.85);
  return shade(c, 1 + n * 0.06);
}

export function nearStreet(x: number, z: number, d: number): boolean {
  return STREETS.some((s) => distanceToPolyline(x, z, s) < d);
}
