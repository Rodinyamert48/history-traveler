import type { CollisionWorld } from "./CollisionWorld";

interface NavNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}

/**
 * Simple pathfinding: a sparse grid of walkable nav points (validated against colliders
 * and water) connected to their neighbours when the straight segment is clear, searched
 * with A*. Good enough for camp patrols, wandering workers and soldiers on the field.
 */
export class NavGraph {
  private nodes: NavNode[] = [];
  private grid = new Map<string, number>();

  constructor(
    private readonly world: CollisionWorld,
    private readonly spacing: number,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  /** Adds grid points inside the rectangle (skipping blocked/water points). */
  addRegion(minX: number, minZ: number, maxX: number, maxZ: number): void {
    const s = this.spacing;
    for (let x = Math.ceil(minX / s) * s; x <= maxX; x += s) {
      for (let z = Math.ceil(minZ / s) * s; z <= maxZ; z += s) {
        const key = `${x}|${z}`;
        if (this.grid.has(key)) continue;
        const y = this.groundAt(x, z);
        if (this.world.isDeepWater(x, z, y, 0.5)) continue;
        // Reject points inside solid colliders (probe a small move).
        const probe = this.world.move(x, z, 0, 0, 0.45, y, 1.8, 0.5);
        if (Math.hypot(probe.x - x, probe.z - z) > 0.05) continue;
        const id = this.nodes.length;
        this.nodes.push({ id, x, z, edges: [] });
        this.grid.set(key, id);
      }
    }
  }

  /** Connects 8-neighbours with unobstructed straight segments. */
  build(): void {
    const s = this.spacing;
    for (const n of this.nodes) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const other = this.grid.get(`${n.x + dx * s}|${n.z + dz * s}`);
          if (other === undefined || other < n.id) continue;
          const o = this.nodes[other];
          const y = this.groundAt(n.x, n.z) + 1;
          if (this.world.segmentBlocked(n.x, n.z, o.x, o.z, y)) continue;
          n.edges.push(o.id);
          o.edges.push(n.id);
        }
      }
    }
  }

  get size(): number {
    return this.nodes.length;
  }

  nearest(x: number, z: number): NavNode | null {
    let best: NavNode | null = null;
    let bestD = Infinity;
    // Check the local neighbourhood first, fall back to a full scan.
    const s = this.spacing;
    const cx = Math.round(x / s) * s;
    const cz = Math.round(z / s) * s;
    for (let r = 0; r <= 3 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const id = this.grid.get(`${cx + dx * s}|${cz + dz * s}`);
          if (id === undefined) continue;
          const n = this.nodes[id];
          const d = Math.hypot(n.x - x, n.z - z);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    if (best) return best;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  randomNodeNear(x: number, z: number, radius: number, rnd: () => number): [number, number] | null {
    for (let tries = 0; tries < 12; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      const n = this.nearest(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (n && n.edges.length) return [n.x, n.z];
    }
    return null;
  }

  /** A* path from (sx,sz) to (tx,tz); returns waypoints including the exact goal. */
  findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] {
    const start = this.nearest(sx, sz);
    const goal = this.nearest(tx, tz);
    if (!start || !goal) return [[tx, tz]];
    if (start === goal) return [[tx, tz]];
    const open = new Set<number>([start.id]);
    const came = new Map<number, number>();
    const g = new Map<number, number>([[start.id, 0]]);
    const f = new Map<number, number>([[start.id, Math.hypot(start.x - goal.x, start.z - goal.z)]]);
    let iterations = 0;
    while (open.size && iterations++ < 4000) {
      let current = -1;
      let bestF = Infinity;
      for (const id of open) {
        const v = f.get(id) ?? Infinity;
        if (v < bestF) {
          bestF = v;
          current = id;
        }
      }
      if (current === goal.id) {
        const path: [number, number][] = [];
        let c: number | undefined = current;
        while (c !== undefined) {
          path.unshift([this.nodes[c].x, this.nodes[c].z]);
          c = came.get(c);
        }
        path.shift();
        path.push([tx, tz]);
        return path;
      }
      open.delete(current);
      const cn = this.nodes[current];
      for (const nid of cn.edges) {
        const nn = this.nodes[nid];
        const tentative = (g.get(current) ?? Infinity) + Math.hypot(nn.x - cn.x, nn.z - cn.z);
        if (tentative < (g.get(nid) ?? Infinity)) {
          came.set(nid, current);
          g.set(nid, tentative);
          f.set(nid, tentative + Math.hypot(nn.x - goal.x, nn.z - goal.z));
          open.add(nid);
        }
      }
    }
    return [[tx, tz]];
  }
}
