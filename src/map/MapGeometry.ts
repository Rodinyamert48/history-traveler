import earcut from "earcut";
import type { GeoBuilder, RGBA } from "../assets/GeoBuilder";
import { signedArea } from "./GeoProjection";

/**
 * Extrudes a (multi-ring) 2D polygon into a flat-topped prism: earcut-triangulated top,
 * vertical side walls, optional dark "skirt" colour for the walls.
 */
export function extrudePolygon(
  b: GeoBuilder,
  rings: [number, number][][],
  yBottom: number,
  yTop: number,
  topColor: RGBA,
  sideColor: RGBA,
): void {
  if (!rings.length || rings[0].length < 3) return;
  const flat: number[] = [];
  const holes: number[] = [];
  rings.forEach((ring, i) => {
    if (i > 0) holes.push(flat.length / 2);
    for (const [x, z] of ring) flat.push(x, z);
  });
  const tris = earcut(flat, holes.length ? holes : undefined, 2);
  const uv = (x: number, z: number): [number, number] => [x * 0.05, z * 0.05];
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 2;
    const c = tris[i + 1] * 2;
    const d = tris[i + 2] * 2;
    b.tri(
      [flat[a], yTop, flat[a + 1]],
      [flat[c], yTop, flat[c + 1]],
      [flat[d], yTop, flat[d + 1]],
      uv(flat[a], flat[a + 1]),
      uv(flat[c], flat[c + 1]),
      uv(flat[d], flat[d + 1]),
      [0, 1, 0],
      topColor,
    );
  }
  rings.forEach((ring, ri) => {
    const ccw = signedArea(ring) > 0;
    // Outer rings face outward, holes face inward.
    const outwardSign = (ri === 0) === ccw ? 1 : -1;
    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[(i + 1) % ring.length];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const out: [number, number, number] = [dz * outwardSign, 0, -dx * outwardSign];
      b.quad([x1, yBottom, z1], [x2, yBottom, z2], [x2, yTop, z2], [x1, yTop, z1], [0, 0, 1, 1], out, sideColor);
    }
  });
}

/** Flat ribbon (line with width) lying on y, with miter joins. */
export function ribbon(b: GeoBuilder, pts: [number, number][], width: number, y: number, closed: boolean, color: RGBA): void {
  const n = pts.length;
  if (n < 2) return;
  const hw = width / 2;
  const offsets: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    const cur = pts[i];
    let d1x = cur[0] - prev[0];
    let d1z = cur[1] - prev[1];
    let d2x = next[0] - cur[0];
    let d2z = next[1] - cur[1];
    const l1 = Math.hypot(d1x, d1z) || 1;
    const l2 = Math.hypot(d2x, d2z) || 1;
    d1x /= l1;
    d1z /= l1;
    d2x /= l2;
    d2z /= l2;
    if (i === 0 && !closed) {
      d1x = d2x;
      d1z = d2z;
    }
    if (i === n - 1 && !closed) {
      d2x = d1x;
      d2z = d1z;
    }
    let tx = d1x + d2x;
    let tz = d1z + d2z;
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-6) {
      tx = d1x;
      tz = d1z;
    } else {
      tx /= tl;
      tz /= tl;
    }
    // Normal of tangent; miter length limited to avoid spikes on sharp corners.
    const nx = -tz;
    const nz = tx;
    const cos = Math.max(0.35, nx * -d1z + nz * d1x);
    const m = hw / cos;
    offsets.push([nx * m, nz * m]);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const a = pts[i];
    const c = pts[j];
    const oa = offsets[i];
    const oc = offsets[j];
    b.quad(
      [a[0] - oa[0], y, a[1] - oa[1]],
      [c[0] - oc[0], y, c[1] - oc[1]],
      [c[0] + oc[0], y, c[1] + oc[1]],
      [a[0] + oa[0], y, a[1] + oa[1]],
      [0, 0, 1, 1],
      [0, 1, 0],
      color,
    );
  }
}
