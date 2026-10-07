import { GAME_CONFIG } from "../config/gameConfig";
import type { LonLat } from "../data/types";

const { originLon, originLat, unitsPerDegree } = GAME_CONFIG.map;
const cosLat = Math.cos((originLat * Math.PI) / 180);

/** Equirectangular projection centred on Türkiye (x = east, z = north). */
export function project(lon: number, lat: number): [number, number] {
  return [(lon - originLon) * cosLat * unitsPerDegree, (lat - originLat) * unitsPerDegree];
}

export function projectRing(ring: readonly LonLat[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lon, lat] of ring) {
    const p = project(lon, lat);
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-4) out.push(p);
  }
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4) out.pop();
  }
  return out;
}

export function signedArea(ring: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function centroid(ring: readonly [number, number][]): [number, number] {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return [x / ring.length, z / ring.length];
}
