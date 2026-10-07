import { hexColor, mixColor, shade, type RGBA } from "../../assets/GeoBuilder";
import { clamp, distanceToPolyline, lerp, smoothstep } from "../../utils/math";
import { Noise2D } from "../../utils/noise";

/**
 * "Temsili İstanbul" — a compact, explorable representation of the 1453 siege theatre.
 * Coordinates in meters, +x = east, +z = north. (Not to scale; distances are compressed
 * for gameplay, but the relative geography follows history.)
 *
 *   z ▲   Boğaz (Bosphorus) ───────────────────────────────  z ≈ 335
 *     │   Galata ridge · slipway (kızak yolu) · Galata Tower
 *     │   Haliç (Golden Horn) ════════════════════ chain ═══  z ≈ 85…128
 *     │   Ottoman camp │ battery │ moat ║ outer ║ inner wall ║  City (Constantinople)
 *     │   Marmara ─────────────────────────────────────────  z ≈ -170
 *     └──────────────────────────────────────────────────────► x
 */
export const LAYOUT = {
  bounds: { minX: -390, maxX: 390, minZ: -250, maxZ: 390 },
  terrainRect: { minX: -420, minZ: -280, sizeX: 840, sizeZ: 700 },
  waterLevel: 0,

  camp: { x: -240, z: -40, radius: 92 },
  otag: { x: -238, z: -12 },
  spawn: { x: -196, z: -70, yaw: -2.25 },
  fatihCamp: { x: -228.5, z: -11.5 },

  southPier: { x: -172, z: 76 },
  northPier: { x: -160, z: 140 },
  boatmanSouth: { x: -172, z: 70 },
  boatmanNorth: { x: -160, z: 146 },

  /** Overland ship road: Golden Horn end → ridge → Bosphorus end. */
  slipway: [
    [-150, 128],
    [-144, 160],
    [-133, 192],
    [-124, 222],
    [-114, 252],
    [-104, 282],
    [-96, 308],
    [-92, 330],
  ] as [number, number][],
  greaseStations: [
    [-143, 165],
    [-126, 216],
    [-108, 270],
  ] as [number, number][],
  shipStart: { x: -93, z: 324 },
  fatihSlipway: { x: -132, z: 146 },

  battery: { x: -108, z: -42 },
  sahi: { x: -104, z: -38 },
  ammoDepot: { x: -132, z: -66 },
  fatihBattery: { x: -122, z: -14 },

  moat: { x0: 4, x1: 16 },
  outerWallX: 23,
  innerWallX: 39,
  wallZMin: -184,
  wallZMax: 92,
  outerWallHeight: 8,
  innerWallHeight: 12,
  breachZ: -30,
  towerT: { x: 39, z: -8 },
  wallBaseY: 4,

  captureZones: [
    { id: "A", name: "Öncü Siper", x: -30, z: -30 },
    { id: "B", name: "Hendek Geçidi", x: 10, z: -30 },
    { id: "C", name: "Sur Gediği", x: 30, z: -30 },
  ],
  /** Siege scaffold south of the breach, reaching the inner wall walk next to tower z=-44. */
  stairs: { x: 31.5, z0: -64, z1: -38, width: 3.4 },
  flagSpot: { x: 39, z: -8 },

  goldenHorn: { tipX: -262, zCenter: 106 },
  hagiaSophia: { x: 236, z: -64 },
  galataTower: { x: 34, z: 214 },
  chainX: 292,
} as const;

const noise = new Noise2D(1453);

/** Signed distance to water (negative = inside water). */
function waterSDF(x: number, z: number): number {
  const n = noise.noise(x * 0.018, z * 0.018) * 7;
  const marmara = z - (-172 + n);
  const north = 336 + n - z;
  const east = 308 + n * 0.8 - x;
  // Golden Horn: a long inlet with a rounded western tip.
  const hornCenter = LAYOUT.goldenHorn.zCenter + Math.sin(x * 0.012) * 4;
  const halfWidth = 19 + Math.max(0, x + 255) * 0.022;
  let horn = Math.abs(z - hornCenter) - halfWidth - n * 0.35;
  if (x < LAYOUT.goldenHorn.tipX) horn = Math.max(horn, Math.hypot(x - LAYOUT.goldenHorn.tipX, z - hornCenter) - halfWidth);
  return Math.min(marmara, north, east, horn);
}

function gauss(x: number, z: number, cx: number, cz: number, r: number, h: number): number {
  const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r);
  return h * Math.exp(-d2);
}

/** Ridge profile used both for terrain and the slipway road. */
function galataRidge(x: number, z: number): number {
  const across = Math.exp(-(((z - 232) / 58) ** 2));
  const eastFade = 1 - smoothstep(220, 300, x);
  return 22 * across * eastFade + gauss(x, z, LAYOUT.galataTower.x, LAYOUT.galataTower.z, 70, 6);
}

function rawLand(x: number, z: number): number {
  let h = 3.2 + noise.fbm(x * 0.007, z * 0.007, 4) * 3.2 + noise.fbm(x * 0.035, z * 0.035, 2) * 0.7;
  // Seven hills of the city.
  if (x > 40 && z < 90) {
    h += gauss(x, z, 92, -98, 45, 9) + gauss(x, z, 150, -36, 50, 12) + gauss(x, z, 220, -112, 40, 8);
    h += gauss(x, z, 246, 4, 46, 11) + gauss(x, z, 112, 42, 36, 7) + gauss(x, z, 182, 52, 38, 9) + gauss(x, z, 66, -146, 30, 5);
  }
  if (z > 120) h += galataRidge(x, z);
  // Hills behind the camp.
  h += gauss(x, z, -340, -120, 70, 8) + gauss(x, z, -330, 40, 60, 6);
  return h;
}

const SLIPWAY_PROFILE: number[] = LAYOUT.slipway.map(([x, z], i, arr) => {
  const t = i / (arr.length - 1);
  const ends = Math.min(t, 1 - t);
  return 1.4 + galataRidge(x, z) * smoothstep(0, 0.25, ends) * 0.92 + 2.5 * smoothstep(0, 0.2, ends);
});

/** Height of the slipway road at the closest point to (x, z) and the distance to it. */
export function slipwayInfo(x: number, z: number): { dist: number; height: number; t: number } {
  const pts = LAYOUT.slipway;
  let best = Infinity;
  let bestH = 0;
  let bestT = 0;
  let acc = 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      bestH = lerp(SLIPWAY_PROFILE[i], SLIPWAY_PROFILE[i + 1], t);
      bestT = (acc + len * t) / total;
    }
    acc += len;
  }
  return { dist: best, height: bestH, t: bestT };
}

/** Roads (dirt) — used for flattening and colouring. */
export const ROADS: [number, number][][] = [
  [
    [-238, 6],
    [-220, 30],
    [-196, 58],
    [-176, 72],
  ],
  [
    [-210, -30],
    [-170, -36],
    [-130, -40],
    [-90, -34],
    [-40, -30],
    [0, -30],
  ],
  [
    [-238, -40],
    [-238, -100],
  ],
  [
    [-300, -40],
    [-180, -40],
  ],
  [
    [-160, 150],
    [-150, 132],
  ],
];

function flattenTo(h: number, target: number, w: number): number {
  return h + (target - h) * clamp(w, 0, 1);
}

/** The full analytic height function for the İstanbul 1453 map. */
export function istanbulHeight(x: number, z: number): number {
  let h = rawLand(x, z);
  const L = LAYOUT;
  // Ottoman camp plateau.
  const campD = Math.hypot(x - L.camp.x, z - L.camp.z);
  h = flattenTo(h, 3.6 + noise.noise(x * 0.05, z * 0.05) * 0.25, 1 - smoothstep(L.camp.radius - 10, L.camp.radius + 25, campD));
  // Battery terrace and the field toward the walls.
  const inBattery = 1 - smoothstep(0, 18, Math.max(Math.abs(x - L.battery.x) - 40, Math.abs(z - L.battery.z) - 50, 0));
  h = flattenTo(h, 4.4, inBattery);
  const field = smoothstep(-160, -120, x) * (1 - smoothstep(0, 6, x - 46)) * (1 - smoothstep(0, 30, Math.max(0, Math.abs(z + 45) - 120)));
  h = flattenTo(h, lerp(4.2, 4.0, clamp((x + 80) / 120, 0, 1)), field);
  // Moat between the field and the outer wall.
  if (x > L.moat.x0 - 3 && x < L.moat.x1 + 3 && z > L.wallZMin && z < L.wallZMax) {
    const m = Math.min(smoothstep(L.moat.x0 - 3, L.moat.x0 + 1, x), 1 - smoothstep(L.moat.x1 - 1, L.moat.x1 + 3, x));
    h -= 3.2 * m;
  }
  // Slipway road over the Galata ridge.
  const sw = slipwayInfo(x, z);
  h = flattenTo(h, sw.height, 1 - smoothstep(5, 16, sw.dist));
  // Dirt roads: gentle flattening only.
  for (const road of ROADS) {
    const d = distanceToPolyline(x, z, road);
    if (d < 10) h = flattenTo(h, Math.max(1.2, h * 0.85 + 0.4), (1 - smoothstep(2, 10, d)) * 0.4);
  }
  // Shorelines.
  const sd = waterSDF(x, z);
  if (sd < 0) {
    return Math.max(-11, -1.2 + sd * 0.55);
  }
  const beach = smoothstep(0, 16, sd);
  return lerp(0.5, h, beach) - (1 - smoothstep(0, 3, sd)) * 1.2;
}

const C = {
  grass: hexColor("#7d8f45"),
  grassDry: hexColor("#a49a55"),
  grassDark: hexColor("#5d733a"),
  dirt: hexColor("#9a7a52"),
  campDirt: hexColor("#a58a62"),
  sand: hexColor("#d2bb8a"),
  rock: hexColor("#8b8176"),
  seabed: hexColor("#6e6a52"),
  road: hexColor("#8c6c48"),
  slipway: hexColor("#7a5a3a"),
  moat: hexColor("#6f5a3e"),
};

/** Per-face terrain colouring (biomes). */
export function istanbulColor(x: number, z: number, h: number, slope: number): RGBA {
  const n = noise.noise(x * 0.06, z * 0.06);
  const n2 = noise.noise(x * 0.013 + 40, z * 0.013);
  let c: RGBA = mixColor(C.grass, n2 > 0 ? C.grassDry : C.grassDark, Math.abs(n2) * 1.2);
  if (h < 0.2) c = mixColor(C.seabed, C.sand, smoothstep(-3, 0.2, h));
  else if (h < 1.6) c = mixColor(C.sand, c, smoothstep(0.6, 1.6, h));
  if (slope < 0.82) c = mixColor(c, C.rock, smoothstep(0.82, 0.62, slope));
  const L = LAYOUT;
  const campD = Math.hypot(x - L.camp.x, z - L.camp.z);
  c = mixColor(c, C.campDirt, (1 - smoothstep(L.camp.radius * 0.55, L.camp.radius + 10, campD)) * 0.7);
  if (Math.abs(x - L.battery.x) < 45 && Math.abs(z - L.battery.z) < 55) c = mixColor(c, C.dirt, 0.65);
  if (x > -70 && x < 20 && Math.abs(z + 35) < 110) c = mixColor(c, C.dirt, 0.35 + 0.25 * Math.max(0, n));
  if (x > L.moat.x0 - 2 && x < L.moat.x1 + 2 && z > L.wallZMin && z < L.wallZMax) c = mixColor(c, C.moat, 0.8);
  if (x > 18 && x < 45 && z > L.wallZMin && z < L.wallZMax) c = mixColor(c, C.dirt, 0.6);
  const sw = slipwayInfo(x, z);
  if (sw.dist < 5) c = mixColor(c, C.slipway, 0.85);
  for (const road of ROADS) {
    if (distanceToPolyline(x, z, road) < 3.2) c = mixColor(c, C.road, 0.75);
  }
  return shade(c, 1 + n * 0.06);
}
