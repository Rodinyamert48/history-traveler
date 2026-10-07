import { Color3, Mesh, Matrix, Quaternion, Vector3, VertexData, type Scene } from "@babylonjs/core";

export type RGBA = [number, number, number, number];
export type V3 = [number, number, number];

/** sRGB hex → linear RGBA (vertex colors are multiplied in linear space by PBR). */
export function hexColor(hex: string, alpha = 1): RGBA {
  const c = Color3.FromHexString(hex).toLinearSpace();
  return [c.r, c.g, c.b, alpha];
}

export function shade(c: RGBA, f: number): RGBA {
  return [c[0] * f, c[1] * f, c[2] * f, c[3]];
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

export interface BoxOptions {
  color?: RGBA;
  /** World units per texture repeat for planar box mapping (0 = 0..1 per face). */
  uvScale?: number;
  /** Explicit UV rect [u0, v0, u1, v1] used on every face (atlas mapping). */
  uvRect?: readonly [number, number, number, number];
  skipBottom?: boolean;
  skipTop?: boolean;
  /** Scale of the top face relative to the bottom (tapered boxes, e.g. towers, roofs). */
  topScale?: number;
  topScaleZ?: number;
  /** Per-face color variation amplitude (stylized faceting). */
  jitter?: number;
}

export interface CylinderOptions {
  color?: RGBA;
  segments?: number;
  caps?: boolean;
  topCap?: boolean;
  bottomCap?: boolean;
  uvScale?: number;
  uvRect?: readonly [number, number, number, number];
  jitter?: number;
}

let jitterSeed = 1;
function jitterValue(): number {
  jitterSeed = (jitterSeed * 16807) % 2147483647;
  return (jitterSeed / 2147483647) * 2 - 1;
}

/**
 * Flat-shaded low-poly geometry accumulator. Every triangle gets its own vertices so
 * faces stay crisp (the "faceted" stylized look), with vertex colors + UVs.
 * Many primitives are appended to one builder and emitted as a single mesh → few draw calls.
 */
export class GeoBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  color: RGBA = [1, 1, 1, 1];
  private matrixStack: Matrix[] = [];
  private current: Matrix | null = null;

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  /** Applies a transform to everything added until pop(). Nested transforms compose. */
  push(m: Matrix): this {
    this.matrixStack.push(m);
    this.current = this.current ? m.multiply(this.current) : m.clone();
    return this;
  }

  pushTRS(x: number, y: number, z: number, rotY = 0, scale = 1, rotX = 0, rotZ = 0): this {
    const m = Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.RotationYawPitchRoll(rotY, rotX, rotZ), new Vector3(x, y, z));
    return this.push(m);
  }

  pop(): this {
    this.matrixStack.pop();
    this.current = null;
    for (const m of this.matrixStack) this.current = this.current ? m.multiply(this.current) : m.clone();
    return this;
  }

  private tf(p: V3): V3 {
    if (!this.current) return p;
    const v = Vector3.TransformCoordinatesFromFloatsToRef(p[0], p[1], p[2], this.current, TMP_V);
    return [v.x, v.y, v.z];
  }

  /** Adds a triangle. `outward` (optional) forces the face normal to point that way. */
  tri(a: V3, b: V3, c: V3, uvA: [number, number] = [0, 0], uvB: [number, number] = [1, 0], uvC: [number, number] = [1, 1], outward?: V3, color?: RGBA): void {
    let A = this.tf(a);
    let B = this.tf(b);
    let C = this.tf(c);
    let uA = uvA;
    let uB = uvB;
    let uC = uvC;
    // Babylon front face convention: normal = (C - A) × (B - A)
    let nx = (C[1] - A[1]) * (B[2] - A[2]) - (C[2] - A[2]) * (B[1] - A[1]);
    let ny = (C[2] - A[2]) * (B[0] - A[0]) - (C[0] - A[0]) * (B[2] - A[2]);
    let nz = (C[0] - A[0]) * (B[1] - A[1]) - (C[1] - A[1]) * (B[0] - A[0]);
    if (outward) {
      const o = this.current ? this.tfDir(outward) : outward;
      if (nx * o[0] + ny * o[1] + nz * o[2] < 0) {
        [B, C] = [C, B];
        [uB, uC] = [uC, uB];
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) return;
    nx /= len;
    ny /= len;
    nz /= len;
    const col = color ?? this.color;
    const base = this.positions.length / 3;
    for (const [p, uv] of [
      [A, uA],
      [B, uB],
      [C, uC],
    ] as const) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(col[0], col[1], col[2], col[3]);
      this.uvs.push(uv[0], uv[1]);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  private tfDir(d: V3): V3 {
    const v = Vector3.TransformNormalFromFloatsToRef(d[0], d[1], d[2], this.current!, TMP_V);
    return [v.x, v.y, v.z];
  }

  /** Quad a-b-c-d (in order around the face). */
  quad(a: V3, b: V3, c: V3, d: V3, uv: readonly [number, number, number, number] = [0, 0, 1, 1], outward?: V3, color?: RGBA): void {
    const [u0, v0, u1, v1] = uv;
    this.tri(a, b, c, [u0, v0], [u1, v0], [u1, v1], outward, color);
    this.tri(a, c, d, [u0, v0], [u1, v1], [u0, v1], outward, color);
  }

  /** Axis-aligned (optionally tapered) box centered on (cx, cy, cz), bottom at cy - h/2. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, opts: BoxOptions = {}): this {
    const col = opts.color ?? this.color;
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;
    const ts = opts.topScale ?? 1;
    const tsz = opts.topScaleZ ?? ts;
    const b0: V3 = [cx - hw, cy - hh, cz - hd];
    const b1: V3 = [cx + hw, cy - hh, cz - hd];
    const b2: V3 = [cx + hw, cy - hh, cz + hd];
    const b3: V3 = [cx - hw, cy - hh, cz + hd];
    const t0: V3 = [cx - hw * ts, cy + hh, cz - hd * tsz];
    const t1: V3 = [cx + hw * ts, cy + hh, cz - hd * tsz];
    const t2: V3 = [cx + hw * ts, cy + hh, cz + hd * tsz];
    const t3: V3 = [cx - hw * ts, cy + hh, cz + hd * tsz];
    const s = opts.uvScale ?? 0;
    const uvFor = (lenU: number, lenV: number): [number, number, number, number] => {
      if (opts.uvRect) return [opts.uvRect[0], opts.uvRect[3], opts.uvRect[2], opts.uvRect[1]];
      return s > 0 ? [0, 0, lenU / s, lenV / s] : [0, 0, 1, 1];
    };
    const face = (a: V3, b: V3, c: V3, dd: V3, out: V3, lu: number, lv: number) => {
      const j = opts.jitter ? 1 + jitterValue() * opts.jitter : 1;
      this.quad(a, b, c, dd, uvFor(lu, lv), out, j === 1 ? col : shade(col, j));
    };
    face(b0, b1, t1, t0, [0, 0, -1], w, h); // front (-z)
    face(b2, b3, t3, t2, [0, 0, 1], w, h); // back (+z)
    face(b3, b0, t0, t3, [-1, 0, 0], d, h); // left
    face(b1, b2, t2, t1, [1, 0, 0], d, h); // right
    if (!opts.skipTop) face(t0, t1, t2, t3, [0, 1, 0], w, d);
    if (!opts.skipBottom) face(b3, b2, b1, b0, [0, -1, 0], w, d);
    return this;
  }

  /** Vertical cylinder / frustum; base at y, height h. */
  cylinder(cx: number, y: number, cz: number, rBottom: number, rTop: number, h: number, opts: CylinderOptions = {}): this {
    const seg = opts.segments ?? 8;
    const col = opts.color ?? this.color;
    const s = opts.uvScale ?? 0;
    const circ = Math.PI * 2 * Math.max(rBottom, rTop);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const p0: V3 = [cx + c0 * rBottom, y, cz + s0 * rBottom];
      const p1: V3 = [cx + c1 * rBottom, y, cz + s1 * rBottom];
      const p2: V3 = [cx + c1 * rTop, y + h, cz + s1 * rTop];
      const p3: V3 = [cx + c0 * rTop, y + h, cz + s0 * rTop];
      const mid = (a0 + a1) / 2;
      const out: V3 = [Math.cos(mid), 0, Math.sin(mid)];
      let uv: [number, number, number, number];
      if (opts.uvRect) {
        const [u0, v0, u1, v1] = opts.uvRect;
        uv = [u0 + ((u1 - u0) * i) / seg, v1, u0 + ((u1 - u0) * (i + 1)) / seg, v0];
      } else if (s > 0) {
        uv = [((i / seg) * circ) / s, 0, (((i + 1) / seg) * circ) / s, h / s];
      } else {
        uv = [i / seg, 0, (i + 1) / seg, 1];
      }
      const j = opts.jitter ? 1 + jitterValue() * opts.jitter : 1;
      const fc = j === 1 ? col : shade(col, j);
      if (rTop <= 1e-5) {
        this.tri(p0, p1, p2, [uv[0], uv[1]], [uv[2], uv[1]], [(uv[0] + uv[2]) / 2, uv[3]], out, fc);
      } else {
        this.quad(p0, p1, p2, p3, uv, out, fc);
      }
      const top = opts.topCap ?? opts.caps ?? true;
      const bottom = opts.bottomCap ?? opts.caps ?? true;
      if (top && rTop > 1e-5) this.tri([cx, y + h, cz], p3, p2, [0.5, 0.5], [0, 0], [1, 0], [0, 1, 0], col);
      if (bottom && rBottom > 1e-5) this.tri([cx, y, cz], p0, p1, [0.5, 0.5], [0, 0], [1, 0], [0, -1, 0], col);
    }
    return this;
  }

  /** Cylinder lying along the X axis (barrels on their side, logs, cannon barrels). */
  cylinderX(x0: number, cy: number, cz: number, length: number, r0: number, r1: number, opts: CylinderOptions = {}): this {
    this.push(Matrix.RotationZ(-Math.PI / 2).multiply(Matrix.Translation(x0, cy, cz)));
    this.cylinder(0, 0, 0, r0, r1, length, opts);
    return this.pop();
  }

  /** Low-poly ico-ish sphere (latitude/longitude with few segments). */
  sphere(cx: number, cy: number, cz: number, r: number, opts: { color?: RGBA; segments?: number; rings?: number; scaleY?: number; jitter?: number } = {}): this {
    const seg = opts.segments ?? 7;
    const rings = opts.rings ?? 5;
    const sy = opts.scaleY ?? 1;
    const col = opts.color ?? this.color;
    const pt = (ri: number, si: number): V3 => {
      const phi = (ri / rings) * Math.PI;
      const th = (si / seg) * Math.PI * 2;
      return [cx + Math.sin(phi) * Math.cos(th) * r, cy + Math.cos(phi) * r * sy, cz + Math.sin(phi) * Math.sin(th) * r];
    };
    for (let ri = 0; ri < rings; ri++) {
      for (let si = 0; si < seg; si++) {
        const a = pt(ri, si);
        const b = pt(ri, si + 1);
        const c = pt(ri + 1, si + 1);
        const d = pt(ri + 1, si);
        const mid: V3 = [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cy, (a[2] + c[2]) / 2 - cz];
        const j = opts.jitter ? 1 + jitterValue() * opts.jitter : 1;
        const fc = j === 1 ? col : shade(col, j);
        if (ri === 0) this.tri(a, c, d, [0, 0], [1, 1], [0, 1], mid, fc);
        else if (ri === rings - 1) this.tri(a, b, d, [0, 0], [1, 0], [0, 1], mid, fc);
        else this.quad(a, b, c, d, [0, 0, 1, 1], mid, fc);
      }
    }
    return this;
  }

  /** Extrudes a closed 2D outline (x, z) between y0 and y1 (prism walls + caps via fan). */
  prism(outline: readonly [number, number][], y0: number, y1: number, opts: { color?: RGBA; uvScale?: number; caps?: boolean } = {}): this {
    const col = opts.color ?? this.color;
    const s = opts.uvScale ?? 0;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of outline) {
      cx += x;
      cz += z;
    }
    cx /= outline.length;
    cz /= outline.length;
    let run = 0;
    for (let i = 0; i < outline.length; i++) {
      const [ax, az] = outline[i];
      const [bx, bz] = outline[(i + 1) % outline.length];
      const len = Math.hypot(bx - ax, bz - az);
      const out: V3 = [(ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz];
      const uv: [number, number, number, number] = s > 0 ? [run / s, y0 / s, (run + len) / s, y1 / s] : [0, 0, 1, 1];
      this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], uv, out, col);
      run += len;
    }
    if (opts.caps !== false) {
      for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i];
        const [bx, bz] = outline[(i + 1) % outline.length];
        this.tri([cx, y1, cz], [ax, y1, az], [bx, y1, bz], [0.5, 0.5], [0, 0], [1, 0], [0, 1, 0], col);
      }
    }
    return this;
  }

  /** Appends another builder's geometry (optionally transformed by the current matrix). */
  append(other: GeoBuilder): this {
    const base = this.positions.length / 3;
    if (!this.current) {
      this.positions.push(...other.positions);
      this.normals.push(...other.normals);
    } else {
      for (let i = 0; i < other.positions.length; i += 3) {
        const p = this.tf([other.positions[i], other.positions[i + 1], other.positions[i + 2]]);
        this.positions.push(p[0], p[1], p[2]);
        const n = this.tfDir([other.normals[i], other.normals[i + 1], other.normals[i + 2]]);
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        this.normals.push(n[0] / l, n[1] / l, n[2] / l);
      }
    }
    this.colors.push(...other.colors);
    this.uvs.push(...other.uvs);
    for (const i of other.indices) this.indices.push(i + base);
    return this;
  }

  toVertexData(): VertexData {
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.normals = this.normals;
    vd.colors = this.colors;
    vd.uvs = this.uvs;
    vd.indices = this.indices;
    return vd;
  }

  toMesh(name: string, scene: Scene, updatable = false): Mesh {
    const mesh = new Mesh(name, scene);
    this.toVertexData().applyToMesh(mesh, updatable);
    mesh.hasVertexAlpha = false;
    return mesh;
  }
}

const TMP_V = new Vector3();
