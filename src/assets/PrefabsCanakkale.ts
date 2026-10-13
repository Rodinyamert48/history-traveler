import { Matrix } from "@babylonjs/core";
import { Random } from "../utils/random";
import { hexColor, shade } from "./GeoBuilder";
import { PartSet, type PrefabDef } from "./Prefabs";

/**
 * Props of Rumeli Mecidiye Tabyası (18 March 1915): earthen parapets and traverses, Krupp
 * coastal guns in their pits, the ammunition magazine, shells, the hand crane, a rangefinder
 * post; on the shores Kilitbahir and Çimenlik castles, and on the water the Allied
 * pre-dreadnought battleships. Origin on the ground (ships: the waterline), +z is the front.
 */

const C = {
  earth: hexColor("#8a7452"),
  earthDark: hexColor("#6e5c40"),
  sand: hexColor("#b8a47a"),
  stone: hexColor("#a49c8a"),
  stoneLight: hexColor("#c8bea8"),
  wood: hexColor("#8a6440"),
  woodDark: hexColor("#4e3820"),
  gun: hexColor("#3e443e"),
  gunDark: hexColor("#2a2e2a"),
  iron: hexColor("#2e2c2a"),
  brass: hexColor("#b8903a"),
  copper: hexColor("#b0602e"),
  shell: hexColor("#5a5e58"),
  red: hexColor("#a8181f"),
};

/** Earthen parapet along x; the slope faces +z (the sea), sandbags on the crest. */
export function parapet(len: number): PrefabDef {
  const p = new PartSet();
  const m = p.get("matte");
  m.box(0, 0.65, 0, len, 1.3, 5, { topScale: 1, topScaleZ: 0.35, color: C.earth, jitter: 0.06 });
  m.box(0, 0.2, 2.3, len, 0.4, 2.2, { topScaleZ: 0.4, color: C.earthDark, jitter: 0.05 });
  const f = p.get("fabric");
  const rnd = new Random(Math.round(len * 7));
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 0.62) f.box(x, 1.42, -0.2 + rnd.range(-0.05, 0.05), 0.58, 0.26, 0.42, { topScale: 0.88, color: shade(C.sand, rnd.range(0.86, 1.08)), jitter: 0.05 });
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** Earth traverse between two gun pits (along z). */
export function traverse(): PrefabDef {
  const p = new PartSet();
  p.get("matte").box(0, 1.6, 0, 3.6, 3.2, 11, { topScale: 0.45, topScaleZ: 0.9, color: C.earth, jitter: 0.07 });
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** The gun pit: a round stone floor with the pivot ring. */
export function gunPit(): PrefabDef {
  const p = new PartSet();
  p.get("stone").cylinder(0, 0, 0, 4.2, 4.2, 0.12, { segments: 16, color: C.stone });
  p.get("stone").cylinder(0, 0.12, 0, 2.2, 2.2, 0.12, { segments: 14, color: C.stoneLight });
  p.get("iron").cylinder(0, 0.24, 0, 1.9, 1.9, 0.06, { segments: 14, color: C.iron });
  return { parts: p, cullDistance: 300, castShadows: false };
}

/** Rotating carriage of the Krupp coastal gun (yaw node); trunnions at y = 2.1. */
export function gunCarriage(): PartSet {
  const p = new PartSet();
  const g = p.get("iron");
  g.cylinder(0, 0.24, 0, 1.6, 1.7, 0.4, { segments: 14, color: C.gunDark });
  for (const x of [-0.75, 0.75]) {
    g.push(Matrix.Translation(x, 0, 0));
    g.prism(
      [
        [-0.12, -1.4],
        [0.12, -1.4],
        [0.12, 1.2],
        [-0.12, 1.2],
      ],
      0.6,
      1.6,
      { color: C.gun },
    );
    g.box(0, 1.85, 0.2, 0.26, 0.6, 1.2, { color: C.gun });
    g.pop();
  }
  // Elevation wheel and a step for the layer.
  g.cylinderX(0.9, 1.3, -0.4, 0.06, 0.32, 0.32, { segments: 10, color: C.gunDark });
  p.get("wood").box(0, 0.7, -1.9, 1.8, 0.12, 0.7, { color: C.wood });
  return p;
}

/** Barrel (pitch node): origin at the trunnions, muzzle toward +z at z ≈ 6.4. */
export function gunBarrel(): PartSet {
  const p = new PartSet();
  const g = p.get("iron");
  g.push(Matrix.RotationX(Math.PI / 2));
  g.cylinder(0, -1.6, 0, 0.42, 0.34, 2.6, { segments: 14, color: C.gun });
  g.cylinder(0, 1.0, 0, 0.3, 0.22, 5.4, { segments: 14, color: C.gun });
  for (const y of [-1.0, 0.0, 0.9]) g.cylinder(0, y, 0, 0.45, 0.45, 0.14, { segments: 14, color: C.gunDark });
  g.cylinder(0, 6.25, 0, 0.26, 0.26, 0.18, { segments: 14, color: C.gunDark });
  g.pop();
  g.cylinderX(-0.62, 0, 0, 1.24, 0.14, 0.14, { segments: 8, color: C.gunDark });
  p.get("bronze").box(0, 0, -1.72, 0.5, 0.5, 0.2, { color: C.brass });
  return p;
}

/** A 24 cm shell standing on its base (≈ 0.9 m tall, 276 kg). */
function shellParts(p: PartSet, x: number, y: number, z: number, lying = false): void {
  const g = p.get("iron");
  if (lying) g.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(x, y + 0.12, z)));
  else g.push(Matrix.Translation(x, y, z));
  g.cylinder(0, 0, 0, 0.12, 0.12, 0.6, { segments: 10, color: C.shell });
  g.cylinder(0, 0.6, 0, 0.12, 0.02, 0.3, { segments: 10, color: C.shell });
  g.pop();
  const b = p.get("bronze");
  if (lying) b.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(x, y + 0.12, z)));
  else b.push(Matrix.Translation(x, y, z));
  b.cylinder(0, 0.08, 0, 0.125, 0.125, 0.06, { segments: 10, color: C.copper });
  b.pop();
}

/** Shells racked up in the magazine and by the guns. */
export function shellRack(n: number): PrefabDef {
  const p = new PartSet();
  p.get("wood").box(0, 0.06, 0, n * 0.3 + 0.2, 0.12, 0.5, { color: C.woodDark });
  for (let i = 0; i < n; i++) shellParts(p, -((n - 1) * 0.3) / 2 + i * 0.3, 0.12, 0);
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** One shell lying on the ground (the one Seyit Onbaşı lifts). */
export function shellLying(): PartSet {
  const p = new PartSet();
  shellParts(p, 0, 0, 0, true);
  return p;
}

/** The shell carried on the back/shoulder (first person); long axis along x. */
export function heldShell(): PartSet {
  const p = new PartSet();
  const g = p.get("iron");
  g.push(Matrix.RotationZ(Math.PI / 2));
  g.cylinder(0, -0.45, 0, 0.12, 0.12, 0.6, { segments: 12, color: C.shell });
  g.cylinder(0, 0.15, 0, 0.12, 0.02, 0.3, { segments: 12, color: C.shell });
  g.pop();
  p.get("bronze").push(Matrix.RotationZ(Math.PI / 2));
  p.get("bronze").cylinder(0, -0.37, 0, 0.125, 0.125, 0.06, { segments: 12, color: C.copper });
  p.get("bronze").pop();
  return p;
}

/** Ammunition magazine: a stone front dug into an earth mound; door at +z. */
export function depot(): PrefabDef {
  const p = new PartSet();
  p.get("matte").box(0, 1.8, -2.4, 11, 3.6, 8, { topScale: 0.7, topScaleZ: 0.6, color: C.earth, jitter: 0.06 });
  const s = p.get("stone");
  s.box(0, 1.5, 1.6, 7.4, 3, 0.8, { uvScale: 2, color: C.stone });
  s.box(-1.25, 1.2, 2.05, 0.4, 2.4, 0.2, { color: C.stoneLight });
  s.box(1.25, 1.2, 2.05, 0.4, 2.4, 0.2, { color: C.stoneLight });
  s.box(0, 2.5, 2.05, 2.9, 0.4, 0.2, { color: C.stoneLight });
  p.get("matte").box(0, 1.15, 2.01, 2.1, 2.3, 0.04, { color: hexColor("#1a1612") });
  p.get("darkWood").box(-1.6, 1.15, 2.2, 0.12, 2.3, 1.0, { color: C.woodDark });
  // Inscription plate.
  p.get("plaster").box(0, 2.9, 2.06, 1.6, 0.28, 0.04, { color: hexColor("#e8e0cc") });
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Hand crane (vinç) that lifts shells to the breech; `broken` = jib snapped and hanging. */
export function crane(broken: boolean): PrefabDef {
  const p = new PartSet();
  const g = p.get("iron");
  g.cylinder(0, 0, 0, 0.5, 0.5, 0.2, { segments: 8, color: C.gunDark });
  g.cylinder(0, 0.2, 0, 0.1, 0.09, 3.2, { segments: 6, color: C.gun });
  if (!broken) {
    g.push(Matrix.RotationZ(-0.12).multiply(Matrix.Translation(0, 3.3, 0)));
    g.box(-1.1, 0, 0, 2.4, 0.14, 0.14, { color: C.gun });
    g.pop();
    p.get("rope").box(-2.2, 2.4, 0, 0.03, 1.6, 0.03, { color: hexColor("#3a3632") });
    p.get("iron").box(-2.2, 1.55, 0, 0.18, 0.12, 0.18, { color: C.gunDark });
  } else {
    g.push(Matrix.RotationZ(1.1).multiply(Matrix.Translation(-0.2, 3.0, 0)));
    g.box(-1.0, 0, 0, 2.2, 0.14, 0.14, { color: hexColor("#1e1e1c") });
    g.pop();
  }
  g.cylinderX(-0.25, 1.1, 0.18, 0.5, 0.18, 0.18, { segments: 8, color: C.gunDark });
  return { parts: p, cullDistance: 200, castShadows: true };
}

/** The rangefinder (telemetre) on its tripod, inside a ring of sandbags. */
export function rangefinderPost(): PrefabDef {
  const p = new PartSet();
  const f = p.get("fabric");
  const rnd = new Random(3);
  for (let r = 0; r < 3; r++) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r % 2) * 0.17;
      if (a > 4.3 && a < 5.1) continue; // gap at the back
      f.push(Matrix.RotationY(-a).multiply(Matrix.Translation(Math.cos(a) * 2.6, 0.13 + r * 0.24, Math.sin(a) * 2.6)));
      f.box(0, 0, 0, 0.42, 0.26, 0.6, { topScale: 0.88, color: shade(C.sand, rnd.range(0.86, 1.08)), jitter: 0.05 });
      f.pop();
    }
  }
  const w = p.get("darkWood");
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    w.push(Matrix.RotationX(0.22).multiply(Matrix.RotationY(a)).multiply(Matrix.Translation(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2)));
    w.box(0, 0.7, 0, 0.05, 1.4, 0.05, { color: C.woodDark });
    w.pop();
  }
  const b = p.get("bronze");
  b.cylinderX(-0.75, 1.48, 0, 1.5, 0.07, 0.07, { segments: 8, color: hexColor("#2e2c28") });
  b.box(0, 1.48, 0, 0.2, 0.2, 0.18, { color: C.brass });
  return { parts: p, cullDistance: 200, castShadows: true };
}

/** A lean-to of planks (the crew's shelter behind the guns). */
export function shelter(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (const x of [-2, 2]) for (const z of [-1, 1]) w.box(x, 1.0, z, 0.16, 2.0 + (z < 0 ? 0.4 : 0), 0.16, { color: C.woodDark });
  p.get("wood").push(Matrix.RotationX(-0.18).multiply(Matrix.Translation(0, 2.2, 0)));
  p.get("wood").box(0, 0, 0, 4.6, 0.12, 2.8, { color: C.wood, jitter: 0.08 });
  p.get("wood").pop();
  return { parts: p, cullDistance: 200, castShadows: true };
}

/**
 * Kilitbahir Kalesi: the heart-shaped (trefoil) inner castle with the tall Sarı Kule, inside an
 * outer curtain wall with round towers. Base at the shore.
 */
export function kilitbahir(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  const col = hexColor("#b8ad94");
  // Trefoil inner keep.
  const outline: [number, number][] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 14 + 5 * Math.cos(3 * a);
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  s.prism(outline, 0, 16, { color: col, uvScale: 4 });
  // Sarı Kule.
  s.box(0, 16, 0, 9, 18, 9, { color: shade(col, 1.05), uvScale: 4 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    s.box(Math.cos(a) * 4.2, 34.6, Math.sin(a) * 4.2, 1.2, 1.2, 1.2, { color: col });
  }
  // Outer wall with round towers.
  const R = 34;
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2;
    const a1 = ((i + 1) / 10) * Math.PI * 2;
    const x0 = Math.cos(a0) * R;
    const z0 = Math.sin(a0) * R * 0.8;
    const x1 = Math.cos(a1) * R;
    const z1 = Math.sin(a1) * R * 0.8;
    const len = Math.hypot(x1 - x0, z1 - z0);
    s.push(Matrix.RotationY(-Math.atan2(z1 - z0, x1 - x0)).multiply(Matrix.Translation((x0 + x1) / 2, 0, (z0 + z1) / 2)));
    s.box(0, 4.5, 0, len, 9, 3, { color: shade(col, 0.95), uvScale: 4 });
    s.pop();
    s.cylinder(x0, 0, z0, 4, 3.6, 12, { segments: 10, color: col });
  }
  return { parts: p, cullDistance: 3000, castShadows: true };
}

/** Çimenlik Kalesi (Kale-i Sultaniye) across the water: a square keep within a low curtain wall. */
export function cimenlik(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  const col = hexColor("#b4a68a");
  s.box(0, 11, 0, 26, 22, 26, { color: col, uvScale: 4 });
  for (let i = 0; i < 8; i++) s.box(-11 + i * 3.1, 22.7, 13, 1.4, 1.4, 1.2, { color: col });
  for (const [x, z] of [
    [-34, -30],
    [34, -30],
    [-34, 30],
    [34, 30],
  ]) {
    s.box(x / 2, 4, z, Math.abs(x) * 2 - 6, 8, 3, { color: shade(col, 0.95) });
    s.box(x, 4, z / 2, 3, 8, Math.abs(z) * 2, { color: shade(col, 0.95) });
    s.cylinder(x, 0, z, 4.4, 4, 10, { segments: 10, color: col });
  }
  return { parts: p, cullDistance: 3000, castShadows: false };
}

export interface BattleshipStyle {
  length: number;
  beam: number;
  hull: string;
  upper: string;
  funnel: string;
  funnels: number;
  /** French ships: tall "fighting masts" and a heavy upperworks. */
  french?: boolean;
}

/** A pre-dreadnought battleship of 1915; bow toward +z, origin at the waterline. */
export function battleship(st: BattleshipStyle): PrefabDef {
  const p = new PartSet();
  const L = st.length;
  const B = st.beam;
  const hull = hexColor(st.hull);
  const upper = hexColor(st.upper);
  const h = p.get("matte");
  // Hull with a ram bow and a rounded stern.
  h.box(0, 0.8, -L * 0.04, B, 6.4, L * 0.78, { topScale: 1.04, topScaleZ: 1.0, color: hull, jitter: 0.02 });
  h.push(Matrix.Translation(0, 0, L * 0.35));
  h.prism(
    [
      [-B / 2, 0],
      [0, L * 0.15],
      [B / 2, 0],
    ],
    -2.4,
    4.0,
    { color: hull },
  );
  h.pop();
  h.push(Matrix.Translation(0, 0, -L * 0.43));
  h.prism(
    [
      [B / 2, 0],
      [B * 0.3, -L * 0.05],
      [-B * 0.3, -L * 0.05],
      [-B / 2, 0],
    ],
    -2.4,
    4.0,
    { color: hull },
  );
  h.pop();
  // Red below the waterline, a dark boot topping.
  h.box(0, -1.4, -L * 0.04, B + 0.05, 1.2, L * 0.78, { color: hexColor("#6a1a1a") });
  h.box(0, -0.6, -L * 0.04, B + 0.08, 0.4, L * 0.78, { color: hexColor("#1e1e20") });
  p.get("wood").box(0, 4.03, -L * 0.04, B - 0.4, 0.06, L * 0.84, { color: hexColor("#a89a80") });
  // Upperworks.
  const u = p.get("plaster");
  u.box(0, 5.6, -L * 0.04, B * 0.7, 3.2, L * 0.36, { color: upper });
  u.box(0, 8.4, L * 0.12, B * 0.45, 2.6, L * 0.08, { color: upper });
  if (st.french) u.box(0, 9.2, -L * 0.04, B * 0.55, 2.4, L * 0.2, { color: upper });
  // Bridge.
  u.box(0, 10.2, L * 0.15, B * 0.7, 0.3, L * 0.05, { color: shade(upper, 0.9) });
  // Casemate guns along both sides.
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const z = -L * 0.16 + k * L * 0.09;
      u.box((s * B) / 2, 2.6, z, 0.4, 1.2, 1.6, { color: shade(hull, 0.92) });
      p.get("iron").box(s * (B / 2 + 1.2), 2.6, z, 2.4, 0.18, 0.18, { color: hexColor("#2a2c2e") });
    }
  // Main turrets fore and aft with twin guns.
  for (const [z, dir] of [
    [L * 0.29, 1],
    [-L * 0.33, -1],
  ] as const) {
    const t = p.get("iron");
    t.cylinder(0, 4.0, z, B * 0.3, B * 0.28, 2.6, { segments: 12, color: shade(hull, 1.05) });
    for (const x of [-0.7, 0.7]) {
      t.push(Matrix.RotationX((dir * Math.PI) / 2).multiply(Matrix.Translation(x, 5.6, z + dir * B * 0.25)));
      t.cylinder(0, 0, 0, 0.32, 0.24, L * 0.11, { segments: 8, color: hexColor("#3a3e42") });
      t.pop();
    }
  }
  // Funnels.
  for (let f = 0; f < st.funnels; f++) {
    const z = L * 0.03 - f * L * 0.09;
    p.get("iron").cylinder(0, 7, z, 1.4, 1.3, 8.5, { segments: 12, color: hexColor(st.funnel) });
    p.get("matte").cylinder(0, 14.9, z, 1.42, 1.42, 0.6, { segments: 12, caps: false, color: hexColor("#1a1a1a") });
  }
  // Masts with fighting tops.
  for (const [z, ht] of [
    [L * 0.2, st.french ? 30 : 26],
    [-L * 0.24, st.french ? 26 : 22],
  ] as const) {
    p.get("iron").cylinder(0, 7, z, st.french ? 1.1 : 0.4, 0.3, ht - 7, { segments: 8, color: shade(upper, 0.85) });
    p.get("iron").cylinder(0, ht * 0.75, z, 1.6, 1.6, 1.3, { segments: 10, color: shade(upper, 0.8) });
    p.get("darkWood").box(0, ht - 3, z, 6, 0.16, 0.16, { color: C.woodDark });
  }
  return { parts: p, cullDistance: 3000, castShadows: true };
}

export const SHIP_STYLES: Record<string, BattleshipStyle> = {
  british: { length: 118, beam: 22, hull: "#6e747a", upper: "#7c8288", funnel: "#62686e", funnels: 2 },
  britishBig: { length: 140, beam: 24, hull: "#666c72", upper: "#767c82", funnel: "#5a6066", funnels: 2 },
  french: { length: 112, beam: 21, hull: "#4e5458", upper: "#6a6e70", funnel: "#3e4244", funnels: 2, french: true },
  french3: { length: 116, beam: 21, hull: "#545a5e", upper: "#70747a", funnel: "#40464a", funnels: 3, french: true },
};
