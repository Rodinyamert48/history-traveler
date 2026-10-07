import { Matrix } from "@babylonjs/core";
import type { MaterialKey } from "../rendering/MaterialLibrary";
import { ATLAS_RECTS } from "../rendering/ProceduralTextures";
import { Random } from "../utils/random";
import { GeoBuilder, hexColor, shade, type RGBA } from "./GeoBuilder";

/**
 * Procedural low-poly model library ("placeholder" art that is meant to look finished).
 * Every builder returns geometry grouped by material so a model costs 1 draw call per
 * material, and all instances of a model share those draw calls.
 */
export class PartSet {
  readonly parts = new Map<MaterialKey, GeoBuilder>();
  get(key: MaterialKey): GeoBuilder {
    let b = this.parts.get(key);
    if (!b) {
      b = new GeoBuilder();
      this.parts.set(key, b);
    }
    return b;
  }
}

export interface PrefabDef {
  parts: PartSet;
  /** Optional simplified version and the distance at which it kicks in. */
  lod?: { distance: number; parts: PartSet };
  /** Instances further than this are not drawn at all. */
  cullDistance?: number;
  castShadows?: boolean;
  /** Enables a per-instance colour multiplier (e.g. tent/house colour variations). */
  tintable?: boolean;
}

const COL = {
  wood: hexColor("#9a6b40"),
  woodDark: hexColor("#5e4128"),
  woodLight: hexColor("#b58a5a"),
  rope: hexColor("#b59a6a"),
  stone: hexColor("#9c958a"),
  stoneDark: hexColor("#6d675e"),
  iron: hexColor("#3d3b38"),
  gold: hexColor("#d6a540"),
  red: hexColor("#a8181f"),
  redDark: hexColor("#6e0d12"),
  white: hexColor("#efe6d2"),
  green: hexColor("#4f6b2e"),
  greenDark: hexColor("#34502a"),
  cypress: hexColor("#2f4a2a"),
  trunk: hexColor("#5a4430"),
  burlap: hexColor("#b49a6a"),
  fire: hexColor("#ffb347"),
  soil: hexColor("#7a6040"),
  blackHair: hexColor("#1c1814"),
};

const W = (r: RGBA) => r;

// ------------------------------------------------------------------------ camp props
export function soldierTent(): PrefabDef {
  const p = new PartSet();
  const cloth = p.get("props");
  const rect = ATLAS_RECTS.tentFabric;
  const r = 2.5;
  const wallH = 1.0;
  // Wall band (red trim) and cone roof both sample the tent fabric region.
  cloth.cylinder(0, 0, 0, r, r, wallH, { segments: 8, caps: false, uvRect: [rect[0], rect[1] + (rect[3] - rect[1]) * 0.7, rect[2], rect[3]] });
  cloth.cylinder(0, wallH, 0, r * 1.06, 0, 2.5, { segments: 8, caps: false, uvRect: [rect[0], rect[1], rect[2], rect[1] + (rect[3] - rect[1]) * 0.7] });
  const wood = p.get("wood");
  wood.cylinder(0, 0, 0, 0.06, 0.05, 3.9, { segments: 5, color: COL.woodDark });
  p.get("gold").sphere(0, 3.9, 0, 0.12, { segments: 5, rings: 3 });
  // Door: dark triangle flap.
  p.get("matte").tri([-0.5, 0.02, r + 0.02], [0.5, 0.02, r + 0.02], [0, 1.5, r * 0.92 + 0.02], [0, 0], [1, 0], [0.5, 1], [0, 0, 1], hexColor("#3a2a1c"));
  const lod = new PartSet();
  lod.get("props").cylinder(0, 0, 0, r, 0, 3.4, { segments: 6, caps: false, uvRect: rect });
  return { parts: p, lod: { distance: 70, parts: lod }, cullDistance: 420, castShadows: true, tintable: true };
}

export function otag(): PrefabDef {
  // Sultan's ceremonial tent: large, crimson with gold medallions, canopy over the door.
  const p = new PartSet();
  const cloth = p.get("props");
  const rect = ATLAS_RECTS.otagFabric;
  const r = 7;
  cloth.cylinder(0, 0, 0, r, r, 3.2, { segments: 12, caps: false, uvRect: rect });
  cloth.cylinder(0, 3.2, 0, r * 1.08, 0.6, 3.4, { segments: 12, caps: false, uvRect: rect });
  cloth.cylinder(0, 6.6, 0, 0.6, 0, 1.6, { segments: 12, caps: false, uvRect: rect });
  // Gilded valance ring.
  p.get("gold").cylinder(0, 3.05, 0, r * 1.09, r * 1.09, 0.25, { segments: 12, caps: false });
  p.get("gold").cylinder(0, 8.2, 0, 0.1, 0.06, 1.2, { segments: 6 });
  p.get("gold").sphere(0, 9.5, 0, 0.32, { segments: 7, rings: 4 });
  // Door canopy facing +z.
  const canopy = p.get("props");
  const cr = ATLAS_RECTS.otagFabric;
  canopy.quad([-2.6, 3.4, r - 0.2], [2.6, 3.4, r - 0.2], [2.8, 2.9, r + 3.4], [-2.8, 2.9, r + 3.4], [cr[0], cr[1], cr[2], cr[3]], [0, 1, 0]);
  canopy.quad([-2.6, 3.4, r - 0.2], [2.6, 3.4, r - 0.2], [2.8, 2.9, r + 3.4], [-2.8, 2.9, r + 3.4], [cr[0], cr[1], cr[2], cr[3]], [0, -1, 0]);
  const wood = p.get("darkWood");
  wood.cylinder(-2.7, 0, r + 3.3, 0.09, 0.08, 3, { segments: 6 });
  wood.cylinder(2.7, 0, r + 3.3, 0.09, 0.08, 3, { segments: 6 });
  // Carpet in front of the entrance.
  p.get("fabric").box(0, 0.03, r + 2, 3.2, 0.05, 4.2, { color: hexColor("#7a1218") });
  p.get("fabric").box(0, 0.035, r + 2, 2.6, 0.05, 3.6, { color: hexColor("#b8862e") });
  p.get("fabric").box(0, 0.04, r + 2, 2.2, 0.05, 3.2, { color: hexColor("#8e1418") });
  return { parts: p, castShadows: true };
}

export function crate(size = 1): PrefabDef {
  const p = new PartSet();
  p.get("props").box(0, size / 2, 0, size, size, size, { uvRect: ATLAS_RECTS.crate });
  return { parts: p, cullDistance: 150, castShadows: true };
}

export function barrel(): PrefabDef {
  const p = new PartSet();
  const b = p.get("props");
  const rect = ATLAS_RECTS.barrel;
  b.cylinder(0, 0, 0, 0.42, 0.48, 0.55, { segments: 10, caps: false, uvRect: [rect[0], rect[1] + (rect[3] - rect[1]) * 0.5, rect[2], rect[3]] });
  b.cylinder(0, 0.55, 0, 0.48, 0.42, 0.55, { segments: 10, caps: false, uvRect: [rect[0], rect[1], rect[2], rect[1] + (rect[3] - rect[1]) * 0.5] });
  p.get("wood").cylinder(0, 1.08, 0, 0.4, 0.4, 0.03, { segments: 10, color: COL.wood });
  return { parts: p, cullDistance: 150, castShadows: true };
}

export function sacks(): PrefabDef {
  const p = new PartSet();
  const m = p.get("fabric");
  const rnd = new Random(4);
  for (let i = 0; i < 5; i++) {
    const x = (i % 3) * 0.6 - 0.6 + rnd.range(-0.1, 0.1);
    const y = i < 3 ? 0.3 : 0.75;
    const z = i < 3 ? 0 : 0.0 + rnd.range(-0.1, 0.1);
    m.sphere(x + (i >= 3 ? 0.3 : 0), y, z, 0.38, { segments: 6, rings: 4, scaleY: 0.75, color: shade(COL.burlap, rnd.range(0.85, 1.05)), jitter: 0.06 });
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

export function cannonballPile(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  const r = 0.32;
  const layers = [
    [3, 3],
    [2, 2],
    [1, 1],
  ];
  layers.forEach(([nx, nz], li) => {
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = (i - (nx - 1) / 2) * r * 2;
        const z = (j - (nz - 1) / 2) * r * 2;
        s.sphere(x, r + li * r * 1.45, z, r, { segments: 7, rings: 5, color: hexColor("#a8a196") });
      }
  });
  return { parts: p, cullDistance: 160, castShadows: true };
}

export function cart(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.95, 0, 1.6, 0.12, 2.8, { uvScale: 1.5 });
  w.box(-0.78, 1.25, 0, 0.08, 0.5, 2.8, { uvScale: 1.5 });
  w.box(0.78, 1.25, 0, 0.08, 0.5, 2.8, { uvScale: 1.5 });
  w.box(0, 1.25, -1.38, 1.6, 0.5, 0.08, { uvScale: 1.5 });
  w.box(-0.25, 0.8, 2.6, 0.08, 0.08, 2.6, {});
  w.box(0.25, 0.8, 2.6, 0.08, 0.08, 2.6, {});
  const dw = p.get("darkWood");
  for (const x of [-0.95, 0.95]) {
    dw.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(x + (x > 0 ? -0.06 : 0.06), 0.62, 0.3)));
    dw.cylinder(0, -0.06, 0, 0.62, 0.62, 0.12, { segments: 10 });
    dw.pop();
  }
  dw.box(0, 0.62, 0.3, 2, 0.1, 0.1, {});
  // A load of sacks.
  const f = p.get("fabric");
  f.sphere(-0.3, 1.25, -0.4, 0.4, { segments: 6, rings: 4, scaleY: 0.7, color: COL.burlap });
  f.sphere(0.35, 1.25, 0.2, 0.42, { segments: 6, rings: 4, scaleY: 0.7, color: shade(COL.burlap, 0.9) });
  return { parts: p, cullDistance: 180, castShadows: true };
}

export function smallCannon(): PrefabDef {
  const p = new PartSet();
  const br = p.get("bronze");
  br.cylinderX(-1.2, 1.05, 0, 2.6, 0.24, 0.2, { segments: 10 });
  br.cylinderX(1.3, 1.05, 0, 0.2, 0.27, 0.27, { segments: 10 });
  const w = p.get("darkWood");
  w.box(0, 0.65, 0, 2.2, 0.35, 0.8, { uvScale: 1.2 });
  for (const z of [-0.5, 0.5]) {
    w.push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(-0.5, 0.45, z)));
    w.cylinder(0, -0.06, 0, 0.45, 0.45, 0.12, { segments: 10 });
    w.pop();
  }
  return { parts: p, cullDistance: 260, castShadows: true };
}

/** The great Şahi bombard: barrel (pivots) + sled (static). Barrel points along +x. */
export function sahiBarrel(): PartSet {
  const p = new PartSet();
  const br = p.get("bronze");
  br.cylinderX(-2.4, 0, 0, 1.2, 0.42, 0.44, { segments: 14 });
  br.cylinderX(-1.2, 0, 0, 3.6, 0.5, 0.56, { segments: 14 });
  br.cylinderX(2.4, 0, 0, 0.35, 0.66, 0.66, { segments: 14 });
  for (const x of [-1.4, -0.2, 1.2]) br.cylinderX(x, 0, 0, 0.18, 0.58, 0.58, { segments: 14 });
  // Dark muzzle bore.
  p.get("matte").cylinderX(2.76, 0, 0, 0.01, 0.4, 0.4, { segments: 12, color: hexColor("#0c0a08") });
  return p;
}

export function sahiSled(): PartSet {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 0.35, -0.55, 5.4, 0.7, 0.4, { uvScale: 1.5 });
  w.box(0, 0.35, 0.55, 5.4, 0.7, 0.4, { uvScale: 1.5 });
  for (const x of [-2.2, -0.8, 0.8, 2.2]) w.box(x, 0.6, 0, 0.4, 0.5, 1.5, { uvScale: 1.5 });
  // Rear wedge / quoin to adjust elevation.
  p.get("wood").box(-2.6, 0.8, 0, 0.8, 0.5, 1.0, { topScale: 0.7, uvScale: 1 });
  // Iron straps.
  const i = p.get("iron");
  for (const x of [-1.5, 0.6]) i.box(x, 0.72, 0, 0.1, 0.06, 1.55, {});
  return p;
}

export function mantlet(): PrefabDef {
  // Wooden screen protecting the gun crews.
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 1.5, 0, 4, 3, 0.18, { uvScale: 2, topScale: 1 });
  const d = p.get("darkWood");
  d.box(-1.6, 1.2, -0.7, 0.14, 2.6, 0.14, {});
  d.box(1.6, 1.2, -0.7, 0.14, 2.6, 0.14, {});
  d.box(0, 2.95, 0, 4.1, 0.12, 0.24, {});
  return { parts: p, cullDistance: 320, castShadows: true };
}

export function gabion(): PrefabDef {
  const p = new PartSet();
  p.get("wood").cylinder(0, 0, 0, 0.7, 0.75, 1.5, { segments: 9, caps: false, color: COL.woodLight, uvScale: 1.2 });
  p.get("terrain").cylinder(0, 1.38, 0, 0.66, 0.4, 0.3, { segments: 9, color: COL.soil });
  return { parts: p, cullDistance: 260, castShadows: true };
}

export function palisade(): PrefabDef {
  // 4 m segment of sharpened stakes along x.
  const p = new PartSet();
  const w = p.get("wood");
  const rnd = new Random(9);
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 0.5;
    const h = rnd.range(2.2, 2.7);
    w.cylinder(x, 0, 0, 0.17, 0.17, h, { segments: 6, caps: false, color: shade(COL.wood, rnd.range(0.85, 1.1)) });
    w.cylinder(x, h, 0, 0.17, 0, 0.45, { segments: 6, caps: false, color: COL.woodLight });
  }
  p.get("darkWood").box(0, 1.2, -0.2, 4.4, 0.16, 0.12, {});
  return { parts: p, cullDistance: 300, castShadows: true };
}

export function ladder(length = 7): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(-0.32, length / 2, 0, 0.1, length, 0.1, { uvScale: 2 });
  w.box(0.32, length / 2, 0, 0.1, length, 0.1, { uvScale: 2 });
  for (let y = 0.4; y < length; y += 0.45) w.box(0, y, 0, 0.64, 0.06, 0.06, {});
  return { parts: p, cullDistance: 260, castShadows: true };
}

export function weaponRack(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(-1, 0.9, 0, 0.1, 1.8, 0.1, {});
  w.box(1, 0.9, 0, 0.1, 1.8, 0.1, {});
  w.box(0, 1.5, 0, 2.1, 0.08, 0.12, {});
  w.box(0, 0.5, 0, 2.1, 0.08, 0.12, {});
  const i = p.get("iron");
  for (let k = 0; k < 5; k++) {
    const x = -0.8 + k * 0.4;
    p.get("wood").cylinder(x, 0.05, 0.08, 0.025, 0.025, 2.4, { segments: 4 });
    i.cylinder(x, 2.45, 0.08, 0.05, 0, 0.3, { segments: 4 });
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

export function campfire(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(2);
  const s = p.get("stone");
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    s.sphere(Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9, rnd.range(0.18, 0.26), { segments: 5, rings: 3, scaleY: 0.7, color: shade(COL.stone, rnd.range(0.7, 1)) });
  }
  const w = p.get("darkWood");
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    w.push(Matrix.RotationY(a).multiply(Matrix.Translation(0, 0.2, 0)));
    w.cylinderX(-0.6, 0, 0, 1.2, 0.08, 0.08, { segments: 5, color: hexColor("#3a2a1c") });
    w.pop();
  }
  const f = p.get("fire");
  f.cylinder(0, 0.15, 0, 0.42, 0, 0.9, { segments: 5, caps: false });
  f.cylinder(0.15, 0.15, 0.1, 0.25, 0, 0.6, { segments: 4, caps: false });
  return { parts: p, cullDistance: 300 };
}

export function kazan(): PrefabDef {
  // Janissary cauldron on a tripod — a famous symbol of the corps.
  const p = new PartSet();
  const i = p.get("iron");
  i.cylinder(0, 0.6, 0, 0.45, 0.7, 0.75, { segments: 10, topCap: false });
  i.cylinder(0, 1.35, 0, 0.72, 0.72, 0.06, { segments: 10, caps: false });
  const w = p.get("darkWood");
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    w.push(Matrix.RotationZ(0.35).multiply(Matrix.RotationY(a)).multiply(Matrix.Translation(Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65)));
    w.cylinder(0, 0, 0, 0.05, 0.05, 2.1, { segments: 4 });
    w.pop();
  }
  p.get("fire").cylinder(0, 0.05, 0, 0.35, 0, 0.55, { segments: 5, caps: false });
  return { parts: p, cullDistance: 200, castShadows: true };
}

export function flagPole(region: "flagOttoman" | "flagByzantine" = "flagOttoman", height = 6): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").cylinder(0, 0, 0, 0.07, 0.05, height, { segments: 6 });
  p.get("gold").sphere(0, height + 0.1, 0, 0.14, { segments: 6, rings: 4 });
  const [u0, v0, u1, v1] = ATLAS_RECTS[region];
  const segs = 5;
  const len = 2.4;
  const fh = 1.5;
  const f = p.get("props");
  for (let i = 0; i < segs; i++) {
    const x0 = (i / segs) * len;
    const x1 = ((i + 1) / segs) * len;
    const z0 = Math.sin((i / segs) * Math.PI * 1.5) * 0.25;
    const z1 = Math.sin(((i + 1) / segs) * Math.PI * 1.5) * 0.25;
    f.quad(
      [x0 + 0.06, height - fh, z0],
      [x1 + 0.06, height - fh, z1],
      [x1 + 0.06, height - 0.05, z1],
      [x0 + 0.06, height - 0.05, z0],
      [u0 + ((u1 - u0) * i) / segs, v1, u0 + ((u1 - u0) * (i + 1)) / segs, v0],
      [0, 0, -1],
    );
  }
  return { parts: p, cullDistance: 500, castShadows: true };
}

export function tug(): PrefabDef {
  // Horse-tail standard (tuğ) with gilded crescent finial.
  const p = new PartSet();
  p.get("darkWood").cylinder(0, 0, 0, 0.06, 0.05, 4.6, { segments: 6 });
  p.get("gold").sphere(0, 4.75, 0, 0.18, { segments: 7, rings: 4 });
  const g = p.get("gold");
  g.push(Matrix.Translation(0, 5.15, 0));
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7;
    const a1 = Math.PI * 0.15 + ((i + 1) / 6) * Math.PI * 0.7;
    g.quad([Math.cos(a0) * 0.32, Math.sin(a0) * 0.32 - 0.2, 0], [Math.cos(a1) * 0.32, Math.sin(a1) * 0.32 - 0.2, 0], [Math.cos(a1) * 0.22, Math.sin(a1) * 0.22 - 0.2, 0], [Math.cos(a0) * 0.22, Math.sin(a0) * 0.22 - 0.2, 0], [0, 0, 1, 1], [0, 0, 1]);
    g.quad([Math.cos(a0) * 0.32, Math.sin(a0) * 0.32 - 0.2, 0], [Math.cos(a1) * 0.32, Math.sin(a1) * 0.32 - 0.2, 0], [Math.cos(a1) * 0.22, Math.sin(a1) * 0.22 - 0.2, 0], [Math.cos(a0) * 0.22, Math.sin(a0) * 0.22 - 0.2, 0], [0, 0, 1, 1], [0, 0, -1]);
  }
  g.pop();
  const hair = p.get("fabric");
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    hair.cylinder(Math.cos(a) * 0.08, 3.3, Math.sin(a) * 0.08, 0.02, 0.15, 1.35, { segments: 6, caps: false, color: i === 1 ? hexColor("#d9cfbf") : hexColor("#3a2a1e") });
  }
  p.get("gold").cylinder(0, 4.55, 0, 0.16, 0.12, 0.18, { segments: 6 });
  return { parts: p, cullDistance: 400, castShadows: true };
}

export function logStack(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  const rnd = new Random(8);
  const rows = [5, 4, 3];
  rows.forEach((n, ri) => {
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * 0.5;
      w.cylinderX(-1.8, 0.25 + ri * 0.42, z, 3.6, 0.24, 0.24, { segments: 7, color: shade(COL.wood, rnd.range(0.8, 1.1)), uvScale: 2 });
    }
  });
  return { parts: p, cullDistance: 200, castShadows: true };
}

/** One greased roller log of the slipway (lies across the road, along x). */
export function slipwayLog(): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").cylinderX(-2.6, 0.18, 0, 5.2, 0.2, 0.2, { segments: 6, uvScale: 2 });
  return { parts: p, cullDistance: 220, castShadows: false };
}

export function greaseBarrel(): PrefabDef {
  const def = barrel();
  def.parts.get("matte").cylinder(0, 1.09, 0, 0.36, 0.36, 0.02, { segments: 10, color: hexColor("#e8dcc0") });
  return def;
}

export function pier(length: number, width: number): PartSet {
  const p = new PartSet();
  const w = p.get("wood");
  const planks = Math.round(length / 0.5);
  const rnd = new Random(3);
  for (let i = 0; i < planks; i++) {
    w.box(0, 0, -length / 2 + (i + 0.5) * (length / planks), width, 0.12, length / planks - 0.04, { color: shade(COL.wood, rnd.range(0.8, 1.05)), uvScale: 2 });
  }
  const d = p.get("darkWood");
  for (let z = -length / 2 + 0.5; z <= length / 2; z += 3) {
    for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) d.cylinder(x, -4, z, 0.14, 0.14, 4, { segments: 6, caps: false });
  }
  return p;
}

// ------------------------------------------------------------------------------ boats
/**
 * Ottoman galley (kadırga): lofted hull, deck, mast with lateen sail, oar banks.
 * Origin at the waterline, bow toward +z.
 */
export function galley(scale = 1, withSail = true, hullColor = "#5c3b22"): PrefabDef {
  const p = new PartSet();
  const hull = p.get("darkWood");
  const len = 24 * scale;
  const halfW = 2.4 * scale;
  const stations = 9;
  const profile = (t: number) => {
    // t: 0 stern → 1 bow
    const width = halfW * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.6);
    const deck = (1.5 + Math.pow(Math.abs(t - 0.45) * 1.6, 3) * 1.4) * scale;
    const keel = -0.9 * scale * Math.sin(Math.PI * Math.min(1, 0.05 + t)) - 0.05;
    return { width, deck, keel, z: (t - 0.5) * len };
  };
  const hc = hexColor(hullColor);
  const trim = hexColor("#a8261f");
  const goldTrim = COL.gold;
  for (let i = 0; i < stations; i++) {
    const a = profile(i / stations);
    const b = profile((i + 1) / stations);
    for (const side of [-1, 1]) {
      // Lower hull (to keel), upper strake with red trim, gold rail.
      hull.quad([side * a.width * 0.55, a.keel, a.z], [side * b.width * 0.55, b.keel, b.z], [side * b.width, b.deck * 0.55, b.z], [side * a.width, a.deck * 0.55, a.z], [0, 0, 1, 1], [side, -0.3, 0], hc);
      hull.quad([side * a.width, a.deck * 0.55, a.z], [side * b.width, b.deck * 0.55, b.z], [side * b.width * 1.02, b.deck * 0.85, b.z], [side * a.width * 1.02, a.deck * 0.85, a.z], [0, 0, 1, 1], [side, 0, 0], trim);
      hull.quad([side * a.width * 1.02, a.deck * 0.85, a.z], [side * b.width * 1.02, b.deck * 0.85, b.z], [side * b.width, b.deck, b.z], [side * a.width, a.deck, a.z], [0, 0, 1, 1], [side, 0.2, 0], i % 2 ? hc : shade(hc, 0.85));
      hull.quad([side * a.width, a.deck, a.z], [side * b.width, b.deck, b.z], [side * b.width * 0.94, b.deck + 0.12, b.z], [side * a.width * 0.94, a.deck + 0.12, a.z], [0, 0, 1, 1], [0, 1, 0], goldTrim);
    }
    // Bottom.
    hull.quad([-a.width * 0.55, a.keel, a.z], [a.width * 0.55, a.keel, a.z], [b.width * 0.55, b.keel, b.z], [-b.width * 0.55, b.keel, b.z], [0, 0, 1, 1], [0, -1, 0], shade(hc, 0.6));
    // Deck.
    p.get("wood").quad([-a.width, a.deck - 0.05, a.z], [a.width, a.deck - 0.05, a.z], [b.width, b.deck - 0.05, b.z], [-b.width, b.deck - 0.05, b.z], [0, (a.z / 2) % 1, 2.4, ((a.z / 2) % 1) + 1.2], [0, 1, 0]);
  }
  // Stern transom & ram at the bow.
  const s = profile(0);
  hull.quad([-s.width, s.keel, s.z], [s.width, s.keel, s.z], [s.width, s.deck, s.z], [-s.width, s.deck, s.z], [0, 0, 1, 1], [0, 0, -1], shade(hc, 0.8));
  const bow = profile(1);
  hull.cylinder(0, bow.deck * 0.4, bow.z, 0.18 * scale, 0.02, 0.1, { segments: 4 });
  hull.push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, bow.deck * 0.45, bow.z - 0.2)));
  hull.cylinder(0, 0, 0, 0.22 * scale, 0.04, 3.4 * scale, { segments: 5, color: shade(hc, 0.7) });
  hull.pop();
  // Stern castle (köşk) with red canopy.
  const sc = profile(0.08);
  p.get("darkWood").box(0, sc.deck + 0.6 * scale, sc.z + 1.2 * scale, 3 * scale, 1.2 * scale, 3 * scale, { color: shade(hc, 0.9), uvScale: 1.5 });
  p.get("fabric").box(0, sc.deck + 1.95 * scale, sc.z + 1.2 * scale, 3.4 * scale, 0.12, 3.4 * scale, { color: hexColor("#9e1a1f") });
  // Oars.
  const oars = p.get("wood");
  for (let i = 0; i < 12; i++) {
    const t = 0.22 + (i / 11) * 0.6;
    const st = profile(t);
    for (const side of [-1, 1]) {
      oars.push(Matrix.RotationZ(side * 1.25).multiply(Matrix.Translation(side * st.width, st.deck * 0.8, st.z)));
      oars.box(0, -2.1 * scale, 0, 0.08, 4.2 * scale, 0.1, { color: COL.woodLight });
      oars.pop();
    }
  }
  if (withSail) {
    const mz = profile(0.6).z;
    const md = profile(0.6).deck;
    p.get("darkWood").cylinder(0, md, mz, 0.16 * scale, 0.1 * scale, 11 * scale, { segments: 6 });
    // Lateen yard and triangular sail.
    const yard = p.get("darkWood");
    const a: [number, number, number] = [0, md + 3 * scale, mz - 9 * scale];
    const b: [number, number, number] = [0, md + 13 * scale, mz + 6 * scale];
    yard.push(Matrix.RotationX(Math.atan2(b[2] - a[2], b[1] - a[1])).multiply(Matrix.Translation(0.2, a[1], a[2])));
    yard.cylinder(0, 0, 0, 0.09, 0.06, Math.hypot(b[1] - a[1], b[2] - a[2]), { segments: 5 });
    yard.pop();
    const sail = p.get("cloth");
    const c: [number, number, number] = [0.3, md + 1.4 * scale, mz + 3.5 * scale];
    const mid: [number, number, number] = [1.1 * scale, md + 6 * scale, mz - 0.5 * scale];
    sail.tri([0.25, a[1] + 0.2, a[2] + 0.4], mid, c, [0, 0], [0.5, 1], [1, 0], [1, 0, 0], hexColor("#efe6d2"));
    sail.tri([0.25, b[1] - 0.2, b[2] - 0.4], c, mid, [0, 0], [1, 0], [0.5, 1], [1, 0, 0], hexColor("#e6d9bd"));
    sail.tri([0.25, a[1] + 0.2, a[2] + 0.4], [0.25, b[1] - 0.2, b[2] - 0.4], mid, [0, 0], [1, 0], [0.5, 1], [1, 0, 0], hexColor("#efe6d2"));
    // Stern flag.
    const fl = flagPole("flagOttoman", 3.2 * scale);
    for (const [k, bld] of fl.parts.parts) {
      const tgt = p.get(k);
      tgt.push(Matrix.Translation(0, sc.deck + 1.9 * scale, sc.z));
      tgt.append(bld);
      tgt.pop();
    }
  }
  const lod = new PartSet();
  lod.get("darkWood").box(0, 0.6 * scale, 0, halfW * 1.6, 2 * scale, len * 0.9, { topScale: 1.1, topScaleZ: 1.15, color: hc });
  if (withSail) lod.get("cloth").tri([0.3, 3, -8 * scale], [0.3, 14 * scale, 5 * scale], [0.3, 2.6, 6 * scale], [0, 0], [1, 0], [0, 1], [1, 0, 0], hexColor("#efe6d2"));
  return { parts: p, lod: { distance: 160, parts: lod }, cullDistance: 1200, castShadows: true };
}

export function rowingBoat(): PrefabDef {
  const p = new PartSet();
  const h = p.get("darkWood");
  const len = 5.2;
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6;
    const t1 = (i + 1) / 6;
    const w0 = Math.sin(Math.PI * (0.08 + t0 * 0.84)) * 0.85;
    const w1 = Math.sin(Math.PI * (0.08 + t1 * 0.84)) * 0.85;
    const z0 = (t0 - 0.5) * len;
    const z1 = (t1 - 0.5) * len;
    for (const s of [-1, 1]) h.quad([s * w0 * 0.5, -0.3, z0], [s * w1 * 0.5, -0.3, z1], [s * w1, 0.45, z1], [s * w0, 0.45, z0], [0, 0, 1, 1], [s, -0.2, 0], COL.wood);
    h.quad([-w0 * 0.5, -0.3, z0], [w0 * 0.5, -0.3, z0], [w1 * 0.5, -0.3, z1], [-w1 * 0.5, -0.3, z1], [0, 0, 1, 1], [0, -1, 0], COL.woodDark);
    p.get("wood").quad([-w0 * 0.8, 0.0, z0], [w0 * 0.8, 0.0, z0], [w1 * 0.8, 0.0, z1], [-w1 * 0.8, 0.0, z1], [0, 0, 1, 1], [0, 1, 0]);
  }
  p.get("wood").box(0, 0.25, 0.4, 1.5, 0.08, 0.35, {});
  return { parts: p, cullDistance: 300, castShadows: true };
}

// ------------------------------------------------------------------------ architecture
export function towerDef(width: number, height: number, depth = width, crenelColor?: RGBA): PartSet {
  const p = new PartSet();
  const s = p.get("stone");
  s.box(0, height / 2, 0, width, height, depth, { uvScale: 6, skipBottom: true });
  // Corbel ring and battlements.
  s.box(0, height + 0.25, 0, width + 0.6, 0.5, depth + 0.6, { uvScale: 6 });
  const merlon = (x: number, z: number) => s.box(x, height + 1.0, z, 0.8, 1.0, 0.8, { uvScale: 6, color: crenelColor ?? W([1, 1, 1, 1]) });
  const nx = Math.max(2, Math.round(width / 1.6));
  const nz = Math.max(2, Math.round(depth / 1.6));
  for (let i = 0; i < nx; i++) {
    const x = -width / 2 + (i + 0.5) * (width / nx);
    merlon(x, -depth / 2);
    merlon(x, depth / 2);
  }
  for (let j = 1; j < nz - 1; j++) {
    const z = -depth / 2 + (j + 0.5) * (depth / nz);
    merlon(-width / 2, z);
    merlon(width / 2, z);
  }
  // Arrow slits (dark recesses) on every face.
  const m = p.get("matte");
  const dark = hexColor("#1a1612");
  for (const y of [height * 0.45, height * 0.75]) {
    m.box(0, y, -depth / 2 - 0.02, 0.35, 1.4, 0.05, { color: dark });
    m.box(0, y, depth / 2 + 0.02, 0.35, 1.4, 0.05, { color: dark });
    m.box(-width / 2 - 0.02, y, 0, 0.05, 1.4, 0.35, { color: dark });
    m.box(width / 2 + 0.02, y, 0, 0.05, 1.4, 0.35, { color: dark });
  }
  return p;
}

/** Straight wall along z (from z0 to z1) with battlements on both sides. */
export function wallDef(length: number, height: number, thickness: number, battlementsFront = true, battlementsBack = false): PartSet {
  const p = new PartSet();
  const s = p.get("stone");
  s.box(0, height / 2, 0, thickness, height, length, { uvScale: 6, skipBottom: true });
  const n = Math.max(1, Math.round(length / 1.8));
  for (let i = 0; i < n; i++) {
    const z = -length / 2 + (i + 0.5) * (length / n);
    if (battlementsFront) s.box(-thickness / 2 + 0.3, height + 0.6, z, 0.6, 1.2, 0.9, { uvScale: 6 });
    if (battlementsBack) s.box(thickness / 2 - 0.3, height + 0.6, z, 0.6, 1.2, 0.9, { uvScale: 6 });
  }
  return p;
}

export function houseDef(variant: number): PrefabDef {
  const rnd = new Random(100 + variant);
  const p = new PartSet();
  const w = rnd.range(5.5, 8.5);
  const d = rnd.range(5.5, 8);
  const floors = variant % 3 === 0 ? 2 : 1;
  const h = floors * 3.2 + rnd.range(0, 0.6);
  p.get("plaster").box(0, h / 2, 0, w, h, d, { uvScale: 4, skipBottom: true, jitter: 0.04 });
  // Stone plinth.
  p.get("stone").box(0, 0.4, 0, w + 0.2, 0.8, d + 0.2, { uvScale: 6, skipBottom: true });
  // Hip roof.
  const r = p.get("roof");
  const rh = rnd.range(1.6, 2.4);
  const ov = 0.45;
  const x0 = -w / 2 - ov;
  const x1 = w / 2 + ov;
  const z0 = -d / 2 - ov;
  const z1 = d / 2 + ov;
  const ridge = Math.max(0.3, (w - d) / 2);
  const top0: [number, number, number] = [-ridge, h + rh, 0];
  const top1: [number, number, number] = [ridge, h + rh, 0];
  r.quad([x0, h, z0], [x1, h, z0], top1, top0, [0, 0, w / 2, rh], [0, 0.6, -1]);
  r.quad([x1, h, z1], [x0, h, z1], top0, top1, [0, 0, w / 2, rh], [0, 0.6, 1]);
  r.tri([x0, h, z1], [x0, h, z0], top0, [0, 0], [d / 2, 0], [d / 4, rh], [-1, 0.6, 0]);
  r.tri([x1, h, z0], [x1, h, z1], top1, [0, 0], [d / 2, 0], [d / 4, rh], [1, 0.6, 0]);
  // Windows & door.
  const m = p.get("matte");
  const win = hexColor("#2a221a");
  const frame = hexColor("#5b3d22");
  for (let f = 0; f < floors; f++) {
    const y = 1.7 + f * 3.1;
    for (const x of [-w * 0.25, w * 0.25]) {
      m.box(x, y, -d / 2 - 0.03, 0.9, 1.1, 0.06, { color: frame });
      m.box(x, y, -d / 2 - 0.06, 0.7, 0.9, 0.06, { color: win });
    }
  }
  m.box(0, 1.05, d / 2 + 0.04, 1.1, 2.1, 0.08, { color: frame });
  if (floors === 2 && variant % 2 === 0) {
    // Projecting wooden upper storey (cumba-like bay).
    p.get("darkWood").box(0, 4.6, -d / 2 - 0.6, w * 0.5, 2.2, 1.2, { uvScale: 2 });
    m.box(0, 4.7, -d / 2 - 1.22, w * 0.3, 0.9, 0.05, { color: win });
  }
  return { parts: p, cullDistance: 900, castShadows: true, tintable: true };
}

/** Byzantine cross-in-square church with drum and dome. */
export function churchDef(): PrefabDef {
  const p = new PartSet();
  const s = p.get("plaster");
  s.box(0, 5, 0, 14, 10, 18, { uvScale: 5, skipBottom: true });
  s.box(0, 4, 10, 7, 8, 3, { uvScale: 5, skipBottom: true });
  const stone = p.get("stone");
  stone.cylinder(0, 10, 0, 3.6, 3.6, 3, { segments: 12, uvScale: 6 });
  p.get("roof").sphere(0, 13, 0, 3.8, { segments: 12, rings: 6, scaleY: 0.85 });
  const r = p.get("roof");
  r.box(0, 10.2, 0, 14.4, 0.5, 18.4, { uvScale: 4 });
  r.cylinder(0, 8, 11.5, 3.6, 0.5, 1.6, { segments: 8 });
  const m = p.get("matte");
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    m.box(Math.cos(a) * 3.62, 11.4, Math.sin(a) * 3.62, 0.4, 1.2, 0.4, { color: hexColor("#2a221a") });
  }
  p.get("gold").cylinder(0, 16.2, 0, 0.06, 0.06, 1.4, { segments: 4 });
  p.get("gold").box(0, 17.1, 0, 0.8, 0.12, 0.12, {});
  return { parts: p, cullDistance: 1500, castShadows: true };
}

/** Hagia Sophia as it stood in 1453: great dome on pendentives, semi-domes, buttresses, no minarets. */
export function hagiaSophiaDef(): PrefabDef {
  const p = new PartSet();
  const pl = p.get("plaster");
  const tint = hexColor("#e2c9a6");
  pl.box(0, 11, 0, 62, 22, 70, { uvScale: 8, skipBottom: true, color: tint });
  // Buttress towers.
  for (const [x, z] of [
    [-34, -20],
    [34, -20],
    [-34, 20],
    [34, 20],
  ])
    pl.box(x, 15, z, 8, 30, 10, { uvScale: 8, topScale: 0.85, color: shade(tint, 0.95) });
  // Square base for the dome + drum with windows.
  pl.box(0, 26, 0, 36, 8, 36, { uvScale: 8, color: tint });
  const stone = p.get("stone");
  stone.cylinder(0, 30, 0, 16.5, 16.5, 3.4, { segments: 24, uvScale: 8 });
  const m = p.get("matte");
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    m.box(Math.cos(a) * 16.55, 31.6, Math.sin(a) * 16.55, 1.1, 1.8, 1.1, { color: hexColor("#2b2620") });
  }
  const roof = p.get("roof");
  roof.sphere(0, 33.2, 0, 16.6, { segments: 20, rings: 8, scaleY: 0.48, color: hexColor("#8b9aa3") });
  // East & west semi-domes.
  for (const dir of [-1, 1]) {
    roof.push(Matrix.Translation(0, 24, dir * 18));
    roof.sphere(0, 0, 0, 14, { segments: 16, rings: 6, scaleY: 0.5, color: hexColor("#8b9aa3") });
    roof.pop();
    pl.box(0, 12, dir * 18, 30, 24, 16, { uvScale: 8, color: tint });
  }
  roof.box(0, 22.3, 0, 62.6, 0.8, 70.6, { uvScale: 6, color: hexColor("#8b9aa3") });
  p.get("gold").cylinder(0, 41, 0, 0.12, 0.12, 3, { segments: 4 });
  p.get("gold").box(0, 43.4, 0, 1.6, 0.2, 0.2, {});
  return { parts: p, cullDistance: 3000, castShadows: true };
}

export function galataTowerDef(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  s.cylinder(0, 0, 0, 5, 4.4, 30, { segments: 14, uvScale: 6 });
  s.cylinder(0, 30, 0, 5.2, 5.2, 1, { segments: 14, uvScale: 6 });
  const m = p.get("matte");
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    m.box(Math.cos(a) * 4.5, 28, Math.sin(a) * 4.5, 0.7, 1.6, 0.7, { color: hexColor("#1f1a15") });
    if (i % 3 === 0) m.box(Math.cos(a) * 4.8, 14 + (i % 2) * 6, Math.sin(a) * 4.8, 0.4, 1.2, 0.4, { color: hexColor("#1f1a15") });
  }
  p.get("roof").cylinder(0, 31, 0, 5.4, 0, 7, { segments: 14, color: hexColor("#6f7c84") });
  return { parts: p, cullDistance: 3000, castShadows: true };
}

// ------------------------------------------------------------------------------ nature
export function cypress(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(77);
  p.get("wood").cylinder(0, 0, 0, 0.18, 0.12, 1.4, { segments: 5, color: COL.trunk });
  const f = p.get("foliage");
  f.cylinder(0, 0.9, 0, 0.9, 0.75, 3.2, { segments: 7, color: COL.cypress, jitter: 0.08 });
  f.cylinder(0, 4.1, 0, 0.75, 0.45, 3.2, { segments: 7, color: shade(COL.cypress, 1.08), jitter: 0.08 });
  f.cylinder(0, 7.3, 0, 0.45, 0, 2.6, { segments: 7, color: shade(COL.cypress, 1.15), jitter: 0.08 });
  void rnd;
  const lod = new PartSet();
  lod.get("foliage").cylinder(0, 0, 0, 0.9, 0, 9.8, { segments: 5, color: COL.cypress });
  return { parts: p, lod: { distance: 90, parts: lod }, cullDistance: 900, castShadows: true, tintable: true };
}

export function broadTree(seed = 1): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(seed * 31);
  const trunkH = rnd.range(2.2, 3.2);
  p.get("wood").cylinder(0, 0, 0, 0.32, 0.22, trunkH, { segments: 6, color: COL.trunk });
  const f = p.get("foliage");
  const clumps = rnd.int(3, 5);
  for (let i = 0; i < clumps; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const rr = i === 0 ? 0 : rnd.range(0.9, 1.6);
    f.sphere(Math.cos(a) * rr, trunkH + rnd.range(0.6, 1.8), Math.sin(a) * rr, rnd.range(1.4, 2.1), {
      segments: 6,
      rings: 4,
      scaleY: 0.8,
      color: shade(i % 2 ? COL.green : COL.greenDark, rnd.range(0.9, 1.15)),
      jitter: 0.1,
    });
  }
  const lod = new PartSet();
  lod.get("foliage").sphere(0, trunkH + 1.2, 0, 2.4, { segments: 5, rings: 3, scaleY: 0.85, color: COL.green });
  lod.get("wood").cylinder(0, 0, 0, 0.3, 0.2, trunkH, { segments: 4, color: COL.trunk });
  return { parts: p, lod: { distance: 80, parts: lod }, cullDistance: 700, castShadows: true, tintable: true };
}

export function bush(): PrefabDef {
  const p = new PartSet();
  const f = p.get("foliage");
  f.sphere(0, 0.5, 0, 0.8, { segments: 6, rings: 4, scaleY: 0.7, color: COL.greenDark, jitter: 0.1 });
  f.sphere(0.6, 0.4, 0.2, 0.55, { segments: 5, rings: 3, scaleY: 0.7, color: COL.green, jitter: 0.1 });
  return { parts: p, cullDistance: 160, castShadows: false, tintable: true };
}

export function rock(seed = 1): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(seed * 13);
  p.get("stone").sphere(0, 0.3, 0, 1, { segments: 6, rings: 4, scaleY: rnd.range(0.45, 0.75), color: shade(COL.stone, rnd.range(0.75, 1)), jitter: 0.12 });
  return { parts: p, cullDistance: 260, castShadows: true, tintable: true };
}

// ---------------------------------------------------------------------- held items
export function heldCannonball(): PartSet {
  const p = new PartSet();
  p.get("stone").sphere(0, 0, 0, 0.3, { segments: 8, rings: 6, color: hexColor("#a8a196") });
  return p;
}

export function bucket(): PartSet {
  const p = new PartSet();
  p.get("wood").cylinder(0, 0, 0, 0.17, 0.2, 0.32, { segments: 8, topCap: false, color: COL.wood });
  p.get("matte").cylinder(0, 0.25, 0, 0.17, 0.17, 0.02, { segments: 8, color: hexColor("#e8dcc0") });
  p.get("iron").box(0, 0.42, 0, 0.42, 0.03, 0.03, {});
  return p;
}

export function flagHeld(): PartSet {
  const fl = flagPole("flagOttoman", 2.6);
  return fl.parts;
}
