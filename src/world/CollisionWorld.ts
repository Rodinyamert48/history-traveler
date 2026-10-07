/**
 * Lightweight character collision (no physics engine needed):
 *  - colliders are vertical prisms: oriented boxes, circles and ramps, each with a y-range;
 *  - a collider whose top is within `stepHeight` of the character's feet becomes walkable
 *    ground (stairs, platforms, piers), otherwise it blocks horizontally;
 *  - terrain height comes from a callback; deep water is blocked unless a floor covers it.
 * A uniform spatial hash keeps queries O(nearby colliders). Used by the player and NPCs.
 */
export interface ColliderBase {
  id: number;
  yMin: number;
  yMax: number;
  /** When false the collider never acts as a wall (pure floor, e.g. ramps & decks). */
  solid: boolean;
  /** When false it's never a floor (e.g. tall smooth walls you shouldn't land on). */
  walkable: boolean;
  enabled: boolean;
  tag?: string;
}

export interface BoxCollider extends ColliderBase {
  kind: "box";
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** Rotation around Y in radians. */
  rot: number;
  cos: number;
  sin: number;
}

export interface CircleCollider extends ColliderBase {
  kind: "circle";
  cx: number;
  cz: number;
  r: number;
}

/** Rectangular footprint whose floor height varies linearly along its local +z axis. */
export interface RampCollider extends ColliderBase {
  kind: "ramp";
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  rot: number;
  cos: number;
  sin: number;
  h0: number;
  h1: number;
}

export type Collider = BoxCollider | CircleCollider | RampCollider;

export interface MoveResult {
  x: number;
  z: number;
  blocked: boolean;
}

const CELL = 16;

export class CollisionWorld {
  private grid = new Map<number, Collider[]>();
  private nextId = 1;
  private visited = new Uint32Array(1);
  private stamp = 0;
  private all: Collider[] = [];

  constructor(
    private readonly terrainHeight: (x: number, z: number) => number,
    readonly waterLevel: number,
    readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    readonly maxWadeDepth = 0.55,
  ) {}

  private key(ix: number, iz: number): number {
    return (ix + 2048) * 4096 + (iz + 2048);
  }

  private insert(c: Collider, minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = this.key(ix, iz);
        let list = this.grid.get(k);
        if (!list) {
          list = [];
          this.grid.set(k, list);
        }
        list.push(c);
      }
    }
    this.all.push(c);
    if (this.visited.length <= c.id) {
      const v = new Uint32Array(Math.max(c.id + 1, this.visited.length * 2));
      v.set(this.visited);
      this.visited = v;
    }
  }

  addBox(
    cx: number,
    cz: number,
    width: number,
    depth: number,
    rot: number,
    yMin: number,
    yMax: number,
    opts: { solid?: boolean; walkable?: boolean; tag?: string } = {},
  ): BoxCollider {
    const c: BoxCollider = {
      kind: "box",
      id: this.nextId++,
      cx,
      cz,
      hx: width / 2,
      hz: depth / 2,
      rot,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      yMin,
      yMax,
      solid: opts.solid ?? true,
      walkable: opts.walkable ?? true,
      enabled: true,
      tag: opts.tag,
    };
    const r = Math.hypot(c.hx, c.hz);
    this.insert(c, cx - r, cx + r, cz - r, cz + r);
    return c;
  }

  addCircle(cx: number, cz: number, r: number, yMin: number, yMax: number, opts: { solid?: boolean; walkable?: boolean; tag?: string } = {}): CircleCollider {
    const c: CircleCollider = {
      kind: "circle",
      id: this.nextId++,
      cx,
      cz,
      r,
      yMin,
      yMax,
      solid: opts.solid ?? true,
      walkable: opts.walkable ?? true,
      enabled: true,
      tag: opts.tag,
    };
    this.insert(c, cx - r, cx + r, cz - r, cz + r);
    return c;
  }

  /** Ramp/stairs: floor rises from h0 (local -z edge) to h1 (local +z edge). */
  addRamp(cx: number, cz: number, width: number, length: number, rot: number, h0: number, h1: number, tag?: string): RampCollider {
    const c: RampCollider = {
      kind: "ramp",
      id: this.nextId++,
      cx,
      cz,
      hx: width / 2,
      hz: length / 2,
      rot,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      h0,
      h1,
      yMin: Math.min(h0, h1) - 3,
      yMax: Math.max(h0, h1),
      solid: false,
      walkable: true,
      enabled: true,
      tag,
    };
    const r = Math.hypot(c.hx, c.hz);
    this.insert(c, cx - r, cx + r, cz - r, cz + r);
    return c;
  }

  private forEachNear(x: number, z: number, radius: number, fn: (c: Collider) => void): void {
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.visited.fill(0);
      this.stamp = 1;
    }
    for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
      for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
        const list = this.grid.get(this.key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (!c.enabled || this.visited[c.id] === this.stamp) continue;
          this.visited[c.id] = this.stamp;
          fn(c);
        }
      }
    }
  }

  private toLocal(c: BoxCollider | RampCollider, x: number, z: number): [number, number] {
    const dx = x - c.cx;
    const dz = z - c.cz;
    // Inverse rotation (Babylon's rotation.y rotates +z toward +x).
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }

  /** Floor height of a collider at (x, z) or null if the point is outside it. */
  private floorAt(c: Collider, x: number, z: number, pad = 0): number | null {
    if (c.kind === "circle") {
      return Math.hypot(x - c.cx, z - c.cz) <= c.r + pad ? c.yMax : null;
    }
    const [lx, lz] = this.toLocal(c, x, z);
    if (Math.abs(lx) > c.hx + pad || Math.abs(lz) > c.hz + pad) return null;
    if (c.kind === "box") return c.yMax;
    const t = Math.min(1, Math.max(0, (lz + c.hz) / (2 * c.hz)));
    return c.h0 + (c.h1 - c.h0) * t;
  }

  /**
   * Ground height under a character whose feet are at `feetY`: the highest walkable surface
   * that is not above feetY + stepHeight.
   */
  groundHeight(x: number, z: number, feetY: number, stepHeight: number): number {
    let best = this.terrainHeight(x, z);
    this.forEachNear(x, z, 1, (c) => {
      if (!c.walkable) return;
      const h = this.floorAt(c, x, z, 0.05);
      if (h === null) return;
      if (h <= feetY + stepHeight + 0.01 && h > best) best = h;
    });
    return best;
  }

  /** Is there a walkable floor (pier, deck, bridge) above the water at this point? */
  private hasFloor(x: number, z: number, feetY: number, stepHeight: number): boolean {
    let found = false;
    this.forEachNear(x, z, 1, (c) => {
      if (found || !c.walkable) return;
      const h = this.floorAt(c, x, z, 0.2);
      if (h !== null && h > this.waterLevel - 1 && h <= feetY + stepHeight + 0.01) found = true;
    });
    return found;
  }

  /**
   * Moves a vertical cylinder (radius, feetY..feetY+height) from (x, z) by (dx, dz),
   * sliding along walls. Returns the resolved position.
   */
  move(x: number, z: number, dx: number, dz: number, radius: number, feetY: number, height: number, stepHeight: number): MoveResult {
    let nx = x + dx;
    let nz = z + dz;
    let blocked = false;
    const b = this.bounds;
    if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ) {
      nx = Math.min(b.maxX, Math.max(b.minX, nx));
      nz = Math.min(b.maxZ, Math.max(b.minZ, nz));
      blocked = true;
    }
    // Deep water: refuse the step (try sliding along each axis).
    if (this.isDeepWater(nx, nz, feetY, stepHeight)) {
      blocked = true;
      if (!this.isDeepWater(nx, z, feetY, stepHeight)) nz = z;
      else if (!this.isDeepWater(x, nz, feetY, stepHeight)) nx = x;
      else {
        nx = x;
        nz = z;
      }
    }
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      this.forEachNear(nx, nz, radius + 2, (c) => {
        if (!c.solid) return;
        // Ignore colliders entirely below the step height (they're floors) or above the head.
        if (c.yMax <= feetY + stepHeight || c.yMin >= feetY + height) return;
        if (c.kind === "circle") {
          const ddx = nx - c.cx;
          const ddz = nz - c.cz;
          const d = Math.hypot(ddx, ddz);
          const min = c.r + radius;
          if (d < min) {
            const k = d > 1e-5 ? (min - d) / d : 1;
            nx += d > 1e-5 ? ddx * k : min;
            nz += d > 1e-5 ? ddz * k : 0;
            pushed = true;
          }
          return;
        }
        if (c.kind !== "box") return;
        const [lx, lz] = this.toLocal(c, nx, nz);
        const qx = Math.max(-c.hx, Math.min(c.hx, lx));
        const qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ox = lx - qx;
        let oz = lz - qz;
        let d = Math.hypot(ox, oz);
        if (d >= radius) return;
        if (d < 1e-6) {
          // Center inside the box: push out along the shallowest axis.
          const px = c.hx - Math.abs(lx);
          const pz = c.hz - Math.abs(lz);
          if (px < pz) {
            ox = Math.sign(lx) || 1;
            oz = 0;
            d = -px;
          } else {
            ox = 0;
            oz = Math.sign(lz) || 1;
            d = -pz;
          }
          const push = radius - d;
          const wx = ox * push;
          const wz = oz * push;
          nx += wx * c.cos + wz * c.sin;
          nz += -wx * c.sin + wz * c.cos;
        } else {
          const push = (radius - d) / d;
          const wx = ox * push;
          const wz = oz * push;
          nx += wx * c.cos + wz * c.sin;
          nz += -wx * c.sin + wz * c.cos;
        }
        pushed = true;
      });
      if (!pushed) break;
      blocked = true;
    }
    return { x: nx, z: nz, blocked };
  }

  isDeepWater(x: number, z: number, feetY: number, stepHeight: number): boolean {
    const h = this.terrainHeight(x, z);
    if (h > this.waterLevel - this.maxWadeDepth) return false;
    return !this.hasFloor(x, z, feetY, stepHeight);
  }

  /** Ray-ish line of sight check in 2D against solid colliders taller than `atY`. */
  segmentBlocked(ax: number, az: number, bx: number, bz: number, atY: number): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      let hit = false;
      this.forEachNear(x, z, 0.5, (c) => {
        if (hit || !c.solid || c.yMax < atY || c.yMin > atY) return;
        if (this.floorAt(c, x, z) !== null) hit = true;
      });
      if (hit) return true;
    }
    return false;
  }

  get count(): number {
    return this.all.length;
  }
}
