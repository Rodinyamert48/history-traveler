import { Mesh, type Material, type Scene } from "@babylonjs/core";
import { GeoBuilder, type RGBA } from "../assets/GeoBuilder";

export interface TerrainOptions {
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
  cell: number;
  height(x: number, z: number): number;
  color(x: number, z: number, h: number, slope: number): RGBA;
  chunkCells: number;
  /** Distance at which chunks switch to the half-resolution LOD mesh. */
  lodDistance: number;
  /** World units per repeat of the detail texture. */
  uvScale: number;
}

/**
 * Faceted low-poly heightfield. The same triangle layout is used for rendering and for
 * `heightAt`, so characters stand exactly on the visible surface. Chunked meshes give
 * frustum culling + a half-resolution LOD level with skirts to hide LOD seams.
 */
export class HeightfieldTerrain {
  readonly nx: number;
  readonly nz: number;
  readonly heights: Float32Array;
  readonly meshes: Mesh[] = [];

  constructor(readonly opts: TerrainOptions) {
    this.nx = Math.ceil(opts.sizeX / opts.cell);
    this.nz = Math.ceil(opts.sizeZ / opts.cell);
    this.heights = new Float32Array((this.nx + 1) * (this.nz + 1));
    for (let j = 0; j <= this.nz; j++) {
      for (let i = 0; i <= this.nx; i++) {
        this.heights[j * (this.nx + 1) + i] = opts.height(opts.minX + i * opts.cell, opts.minZ + j * opts.cell);
      }
    }
  }

  private h(i: number, j: number): number {
    i = Math.max(0, Math.min(this.nx, i));
    j = Math.max(0, Math.min(this.nz, j));
    return this.heights[j * (this.nx + 1) + i];
  }

  /** Height on the rendered (triangulated) surface. */
  heightAt(x: number, z: number): number {
    const o = this.opts;
    const fx = (x - o.minX) / o.cell;
    const fz = (z - o.minZ) / o.cell;
    if (fx < 0 || fz < 0 || fx >= this.nx || fz >= this.nz) return o.height(x, z);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h00 = this.h(i, j);
    const h10 = this.h(i + 1, j);
    const h01 = this.h(i, j + 1);
    const h11 = this.h(i + 1, j + 1);
    if (u >= v) return h00 + (h10 - h00) * u + (h11 - h10) * v;
    return h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  /** Surface normal Y component (1 = flat) — used for slope-based decisions. */
  slopeAt(x: number, z: number): number {
    const e = this.opts.cell * 0.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return 1 / Math.hypot(dx / (2 * e), dz / (2 * e), 1);
  }

  private buildChunk(ci: number, cj: number, step: number): GeoBuilder {
    const o = this.opts;
    const b = new GeoBuilder();
    const i0 = ci * o.chunkCells;
    const j0 = cj * o.chunkCells;
    const i1 = Math.min(this.nx, i0 + o.chunkCells);
    const j1 = Math.min(this.nz, j0 + o.chunkCells);
    const P = (i: number, j: number): [number, number, number] => [o.minX + i * o.cell, this.h(i, j), o.minZ + j * o.cell];
    const uv = (p: [number, number, number]): [number, number] => [p[0] / o.uvScale, p[2] / o.uvScale];
    for (let j = j0; j < j1; j += step) {
      for (let i = i0; i < i1; i += step) {
        const ie = Math.min(i + step, i1);
        const je = Math.min(j + step, j1);
        const a = P(i, j);
        const bb = P(ie, j);
        const c = P(ie, je);
        const d = P(i, je);
        // Triangle 1 (a, b, c) and triangle 2 (a, c, d) — matches heightAt().
        for (const [p, q, r] of [
          [a, bb, c],
          [a, c, d],
        ] as const) {
          const cx = (p[0] + q[0] + r[0]) / 3;
          const cz = (p[2] + q[2] + r[2]) / 3;
          const ch = (p[1] + q[1] + r[1]) / 3;
          // Face normal y for slope colouring.
          const ux = q[0] - p[0];
          const uy = q[1] - p[1];
          const uz = q[2] - p[2];
          const vx = r[0] - p[0];
          const vy = r[1] - p[1];
          const vz = r[2] - p[2];
          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;
          const slope = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
          b.tri(p, q, r, uv(p), uv(q), uv(r), [0, 1, 0], o.color(cx, cz, ch, slope));
        }
      }
    }
    // Skirts along chunk borders hide cracks between LOD levels.
    const skirt = 4;
    const edge = (pa: [number, number, number], pb: [number, number, number], out: [number, number, number]) => {
      b.quad([pa[0], pa[1] - skirt, pa[2]], [pb[0], pb[1] - skirt, pb[2]], [pb[0], pb[1], pb[2]], [pa[0], pa[1], pa[2]], [0, 0, 1, 1], out, o.color(pa[0], pa[2], pa[1], 0.5));
    };
    for (let i = i0; i < i1; i += step) {
      const ie = Math.min(i + step, i1);
      edge(P(i, j0), P(ie, j0), [0, 0, -1]);
      edge(P(i, j1), P(ie, j1), [0, 0, 1]);
    }
    for (let j = j0; j < j1; j += step) {
      const je = Math.min(j + step, j1);
      edge(P(i0, j), P(i0, je), [-1, 0, 0]);
      edge(P(i1, j), P(i1, je), [1, 0, 0]);
    }
    return b;
  }

  /** Builds chunk meshes (+ LOD) and yields to the browser between rows. */
  async build(scene: Scene, material: Material, yieldFn?: () => Promise<void>): Promise<Mesh[]> {
    const o = this.opts;
    const cx = Math.ceil(this.nx / o.chunkCells);
    const cz = Math.ceil(this.nz / o.chunkCells);
    for (let cj = 0; cj < cz; cj++) {
      for (let ci = 0; ci < cx; ci++) {
        const hi = this.buildChunk(ci, cj, 1).toMesh(`terrain-${ci}-${cj}`, scene);
        hi.material = material;
        hi.receiveShadows = true;
        hi.isPickable = true;
        hi.checkCollisions = false;
        const lo = this.buildChunk(ci, cj, 2).toMesh(`terrain-${ci}-${cj}-lod`, scene);
        lo.material = material;
        lo.receiveShadows = true;
        lo.isPickable = false;
        hi.addLODLevel(o.lodDistance, lo);
        hi.freezeWorldMatrix();
        lo.freezeWorldMatrix();
        this.meshes.push(hi);
      }
      if (yieldFn) await yieldFn();
    }
    return this.meshes;
  }

  /**
   * Normalized water depth map for the water shader (0 = shoreline/land, 1 = deep).
   */
  depthMap(resolution: number, rect: [number, number, number, number], maxDepth: number, waterLevel: number): Uint8Array {
    const out = new Uint8Array(resolution * resolution);
    for (let j = 0; j < resolution; j++) {
      for (let i = 0; i < resolution; i++) {
        const x = rect[0] + ((i + 0.5) / resolution) * rect[2];
        const z = rect[1] + ((j + 0.5) / resolution) * rect[3];
        const inside = x >= this.opts.minX && z >= this.opts.minZ && x <= this.opts.minX + this.opts.sizeX && z <= this.opts.minZ + this.opts.sizeZ;
        const h = inside ? this.heightAt(x, z) : this.opts.height(x, z);
        const d = Math.max(0, Math.min(1, (waterLevel - h) / maxDepth));
        out[j * resolution + i] = Math.round(d * 255);
      }
    }
    return out;
  }
}

export function isMesh(m: unknown): m is Mesh {
  return m instanceof Mesh;
}
