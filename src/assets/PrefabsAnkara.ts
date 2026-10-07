import { Matrix } from "@babylonjs/core";
import { Random } from "../utils/random";
import { hexColor, shade, type RGBA } from "./GeoBuilder";
import { PartSet, type PrefabDef } from "./Prefabs";

/**
 * Interior props of the first Grand National Assembly building (Ankara, April 1920): the
 * school desks brought in for the deputies, the presidency table, the speaker's lectern,
 * hanging oil lamps, the wood stove, telegraph instruments and the 1920 flag.
 * Origin on the floor, +z is the front (the side a seated person faces).
 */

const C = {
  desk: hexColor("#7a5434"),
  deskDark: hexColor("#4e3420"),
  deskTop: hexColor("#5e3e24"),
  green: hexColor("#2f5a3a"),
  brass: hexColor("#c8a050"),
  iron: hexColor("#2e2c2a"),
  glass: hexColor("#e8f0ee"),
  red: hexColor("#c8102e"),
  white: hexColor("#f5f2ea"),
  paper: hexColor("#ece2c8"),
  ink: hexColor("#1c1a22"),
};

/** Two-seat school desk with a sloped top and an attached bench (the famous 1920 sıralar). */
export function schoolDesk(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  const width = 2.3;
  // Sloped writing top.
  w.push(Matrix.RotationX(-0.12).multiply(Matrix.Translation(0, 0.78, 0.18)));
  w.box(0, 0, 0, width, 0.05, 0.5, { uvScale: 1.5, color: C.deskTop });
  w.pop();
  w.box(0, 0.82, 0.43, width, 0.04, 0.1, { color: C.deskTop });
  // Front panel and sides.
  w.box(0, 0.45, 0.42, width, 0.62, 0.04, { uvScale: 1.5, color: C.desk });
  for (const s of [-1, 1]) {
    w.box(s * (width / 2 - 0.03), 0.38, 0, 0.06, 0.76, 1.1, { color: C.deskDark });
  }
  // Bench + backrest.
  w.box(0, 0.44, -0.35, width - 0.1, 0.05, 0.34, { uvScale: 1.5, color: C.desk });
  w.box(0, 0.75, -0.54, width - 0.1, 0.26, 0.04, { uvScale: 1.5, color: C.desk });
  // Inkwells.
  p.get("matte").cylinder(-0.55, 0.83, 0.42, 0.03, 0.03, 0.03, { segments: 6, color: C.ink });
  p.get("matte").cylinder(0.55, 0.83, 0.42, 0.03, 0.03, 0.03, { segments: 6, color: C.ink });
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** Long presidency table with a green baize cloth. */
export function presidencyTable(): PrefabDef {
  const p = new PartSet();
  p.get("fabric").box(0, 0.78, 0, 6.4, 0.06, 1.2, { color: C.green });
  p.get("fabric").box(0, 0.55, 0.61, 6.4, 0.46, 0.02, { color: shade(C.green, 0.85) });
  for (const s of [-1, 1]) p.get("fabric").box(s * 3.21, 0.55, 0, 0.02, 0.46, 1.22, { color: shade(C.green, 0.85) });
  const w = p.get("darkWood");
  for (const x of [-3, 3]) for (const z of [-0.5, 0.5]) w.box(x, 0.38, z, 0.1, 0.76, 0.1, { color: C.deskDark });
  // Papers, inkstand and a hand bell.
  p.get("matte").box(-1.2, 0.82, 0.1, 0.5, 0.01, 0.35, { color: C.paper });
  p.get("matte").box(1.4, 0.82, -0.1, 0.4, 0.01, 0.3, { color: C.paper });
  p.get("bronze").box(0.3, 0.86, 0.05, 0.36, 0.08, 0.18, { color: C.brass });
  p.get("bronze").cylinder(-0.4, 0.81, 0.1, 0.06, 0.03, 0.1, { segments: 8, color: C.brass });
  return { parts: p, cullDistance: 200, castShadows: true };
}

/** Speaker's lectern (kürsü). */
export function lectern(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.55, 0, 1.1, 1.1, 0.7, { uvScale: 1.5, color: C.desk });
  w.push(Matrix.RotationX(-0.25).multiply(Matrix.Translation(0, 1.18, -0.05)));
  w.box(0, 0, 0, 1.2, 0.06, 0.62, { uvScale: 1.5, color: C.deskTop });
  w.pop();
  p.get("darkWood").box(0, 0.05, 0, 1.25, 0.1, 0.8, { color: C.deskDark });
  p.get("fabric").box(0, 0.65, 0.36, 0.8, 0.7, 0.02, { color: C.red });
  p.get("matte").box(0, 1.24, -0.04, 0.42, 0.01, 0.3, { color: C.paper });
  return { parts: p, cullDistance: 200, castShadows: true };
}

/** Plain wooden chair. */
export function chair(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 0.45, 0, 0.46, 0.05, 0.44, { color: C.desk });
  for (const x of [-0.2, 0.2]) for (const z of [-0.19, 0.19]) w.box(x, 0.22, z, 0.045, 0.45, 0.045, { color: C.deskDark });
  for (const x of [-0.2, 0.2]) w.box(x, 0.72, -0.19, 0.045, 0.55, 0.045, { color: C.deskDark });
  w.box(0, 0.88, -0.19, 0.44, 0.14, 0.03, { color: C.desk });
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** A chair carried in the hands (first person). */
export function heldChair(): PartSet {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.push(Matrix.RotationX(Math.PI).multiply(Matrix.Translation(0, 0.4, 0)));
  w.box(0, 0.45, 0, 0.46, 0.05, 0.44, { color: C.desk });
  for (const x of [-0.2, 0.2]) for (const z of [-0.19, 0.19]) w.box(x, 0.22, z, 0.045, 0.45, 0.045, { color: C.deskDark });
  w.pop();
  return p;
}

/** Stack of chairs for the depot. */
export function chairStack(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  const rnd = new Random(4);
  for (let i = 0; i < 5; i++) {
    w.push(Matrix.RotationY(rnd.range(-0.15, 0.15)).multiply(Matrix.Translation(rnd.range(-0.05, 0.05), i * 0.18, 0)));
    w.box(0, 0.45, 0, 0.46, 0.05, 0.44, { color: C.desk });
    for (const x of [-0.2, 0.2]) for (const z of [-0.19, 0.19]) w.box(x, 0.22, z, 0.045, 0.45, 0.045, { color: C.deskDark });
    w.box(0, 0.72, -0.19, 0.44, 0.5, 0.03, { color: C.desk });
    w.pop();
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** Hanging oil lamp: ceiling chain, brass font, glass chimney (flame added separately). */
export function hangingLamp(chain: number): PartSet {
  const p = new PartSet();
  p.get("iron").cylinder(0, 0.55, 0, 0.012, 0.012, chain, { segments: 4, color: C.iron });
  const b = p.get("bronze");
  b.cylinder(0, 0, 0, 0.06, 0.16, 0.14, { segments: 10, color: C.brass });
  b.cylinder(0, 0.14, 0, 0.16, 0.1, 0.06, { segments: 10, color: C.brass });
  // Reflector shade above the chimney.
  b.cylinder(0, 0.5, 0, 0.32, 0.06, 0.08, { segments: 12, caps: false, color: shade(C.brass, 0.85) });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.get("iron").box(Math.cos(a) * 0.13, 0.32, Math.sin(a) * 0.13, 0.012, 0.4, 0.012, { color: C.iron });
  }
  p.get("matte").cylinder(0, 0.2, 0, 0.055, 0.04, 0.24, { segments: 8, caps: false, color: C.glass });
  return p;
}

export function lampFlame(): PartSet {
  const p = new PartSet();
  p.get("fire").cylinder(0, 0.22, 0, 0.03, 0, 0.11, { segments: 5, caps: false });
  return p;
}

/** Cast-iron wood stove (soba) with its pipe to the ceiling. */
export function woodStove(height: number): PrefabDef {
  const p = new PartSet();
  const i = p.get("iron");
  i.cylinder(0, 0.15, 0, 0.32, 0.32, 0.9, { segments: 12, color: C.iron });
  i.cylinder(0, 1.05, 0, 0.36, 0.25, 0.12, { segments: 12, color: C.iron });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    i.box(Math.cos(a) * 0.24, 0.07, Math.sin(a) * 0.24, 0.06, 0.15, 0.06, { color: C.iron });
  }
  i.cylinder(0, 1.17, 0, 0.08, 0.08, height - 1.17, { segments: 8, color: shade(C.iron, 1.2) });
  p.get("bronze").box(0, 0.6, 0.31, 0.22, 0.18, 0.03, { color: C.brass });
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Telegraph table: Morse register, battery jars, sounder and wires (the key is separate). */
export function telegraphTable(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.76, 0, 1.8, 0.05, 0.8, { uvScale: 1.5, color: C.deskTop });
  for (const x of [-0.85, 0.85]) for (const z of [-0.35, 0.35]) w.box(x, 0.38, z, 0.06, 0.76, 0.06, { color: C.deskDark });
  // Morse register (paper tape recorder).
  p.get("bronze").box(-0.45, 0.88, -0.15, 0.45, 0.2, 0.28, { color: C.brass });
  p.get("iron").cylinder(-0.45, 0.98, -0.15, 0.07, 0.07, 0.04, { segments: 10, color: C.iron });
  p.get("matte").box(-0.1, 0.82, -0.1, 0.4, 0.005, 0.03, { color: C.paper });
  // Sounder.
  p.get("bronze").box(0.45, 0.86, -0.2, 0.25, 0.12, 0.14, { color: C.brass });
  // Battery jars.
  for (const x of [-0.7, -0.55]) p.get("matte").cylinder(x, 0.78, 0.25, 0.06, 0.06, 0.18, { segments: 8, color: hexColor("#9ab8b0") });
  // Telegram forms.
  p.get("matte").box(0.35, 0.79, 0.2, 0.3, 0.005, 0.22, { color: C.paper });
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Morse key; `lever` is the moving arm (pivot at its origin). */
export function morseKeyBase(): PartSet {
  const p = new PartSet();
  p.get("darkWood").box(0, 0.015, 0, 0.12, 0.03, 0.26, { color: C.deskDark });
  p.get("bronze").box(0, 0.05, -0.06, 0.03, 0.05, 0.03, { color: C.brass });
  return p;
}

export function morseKeyLever(): PartSet {
  const p = new PartSet();
  p.get("bronze").box(0, 0, 0.06, 0.025, 0.02, 0.22, { color: C.brass });
  p.get("matte").cylinder(0, 0.01, 0.16, 0.025, 0.025, 0.03, { segments: 10, color: hexColor("#141210") });
  return p;
}

/** Shelf with ledgers and files. */
export function shelf(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 1, -0.17, 1.6, 2, 0.04, { color: C.deskDark });
  for (const s of [-1, 1]) w.box(s * 0.78, 1, 0, 0.04, 2, 0.38, { color: C.deskDark });
  const rnd = new Random(12);
  for (let level = 0; level < 4; level++) {
    const y = 0.1 + level * 0.5;
    w.box(0, y, 0, 1.52, 0.03, 0.36, { color: C.desk });
    let x = -0.7;
    while (x < 0.65) {
      const bw = rnd.range(0.05, 0.11);
      const bh = rnd.range(0.26, 0.38);
      const col: RGBA = rnd.pick([hexColor("#6a2a20"), hexColor("#2a3a4a"), hexColor("#4a3a2a"), hexColor("#2e4a34"), C.paper]);
      p.get("matte").box(x + bw / 2, y + 0.015 + bh / 2, 0.02, bw, bh, 0.26, { color: col });
      x += bw + 0.005;
    }
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** Kerosene cans (gaz tenekesi) and a crate. */
export function oilCans(): PrefabDef {
  const p = new PartSet();
  for (const [x, z] of [
    [0, 0],
    [0.3, 0.05],
    [0.15, 0.32],
  ])
    p.get("iron").box(x, 0.18, z, 0.24, 0.36, 0.24, { color: hexColor("#8a8478") });
  p.get("props").box(-0.5, 0.25, 0.1, 0.5, 0.5, 0.5, { uvRect: [0, 0, 0.5, 0.5] });
  return { parts: p, cullDistance: 100, castShadows: true };
}

/** Wall clock. */
export function wallClock(): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").box(0, 0, 0, 0.5, 0.9, 0.12, { color: C.deskDark });
  p.get("matte").cylinder(0, 0.2, 0.065, 0.17, 0.17, 0.01, { segments: 14, color: C.white });
  p.get("matte").box(0, 0.25, 0.075, 0.015, 0.11, 0.01, { color: C.ink });
  p.get("matte").box(0.04, 0.2, 0.075, 0.09, 0.015, 0.01, { color: C.ink });
  p.get("bronze").cylinder(0, -0.22, 0.065, 0.07, 0.07, 0.01, { segments: 10, color: C.brass });
  return { parts: p, cullDistance: 80 };
}

/** Coat stand. */
export function coatStand(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.cylinder(0, 0, 0, 0.04, 0.035, 1.9, { segments: 6, color: C.deskDark });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    w.box(Math.cos(a) * 0.18, 0.05, Math.sin(a) * 0.18, 0.36, 0.04, 0.04, { color: C.deskDark });
    w.box(Math.cos(a) * 0.1, 1.75, Math.sin(a) * 0.1, 0.2, 0.03, 0.03, { color: C.deskDark });
  }
  p.get("fabric").box(0.12, 1.25, 0, 0.12, 0.8, 0.35, { color: hexColor("#2a2a2e") });
  p.get("fabric").cylinder(-0.08, 1.9, 0, 0.12, 0.14, 0.18, { segments: 8, color: hexColor("#3a3632") });
  return { parts: p, cullDistance: 80, castShadows: true };
}

/** Flag of 1920 (red field, white crescent and star) on a wall-mounted pole. Faces +z. */
export function flag1920(width = 2.4): PrefabDef {
  const p = new PartSet();
  const h = width * (2 / 3);
  const f = p.get("fabric");
  // Gentle folds.
  const folds = 6;
  for (let i = 0; i < folds; i++) {
    const x0 = -width / 2 + (i / folds) * width;
    const x1 = -width / 2 + ((i + 1) / folds) * width;
    const z0 = Math.sin(i * 1.3) * 0.04;
    const z1 = Math.sin((i + 1) * 1.3) * 0.04;
    f.quad([x0, -h / 2, z0], [x1, -h / 2, z1], [x1, h / 2, z1], [x0, h / 2, z0], [0, 0, 1, 1], [0, 0, 1], C.red);
  }
  // Crescent: a white disc covered by an offset red disc, then the star.
  const disc = (cx: number, r: number, dz: number, col: RGBA) => {
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      f.tri([cx, 0, dz], [cx + Math.cos(a1) * r, Math.sin(a1) * r, dz], [cx + Math.cos(a0) * r, Math.sin(a0) * r, dz], [0, 0], [1, 0], [1, 1], [0, 0, 1], col);
    }
  };
  // Proportions after the flag law (G = height): crescent circles G/2 and 0.4·G wide,
  // 1/16·G apart, star on a circle of G/4 whose centre is G/3 beyond the outer circle's.
  const G = h;
  const hoist = -width / 2;
  disc(hoist + 0.5 * G, 0.25 * G, 0.07, C.white);
  disc(hoist + 0.5 * G + G / 16, 0.2 * G, 0.075, C.red);
  const sx = hoist + 0.5 * G + G / 3;
  const ro = 0.125 * G;
  const ri = ro * 0.38;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i / 5) * Math.PI * 2;
    const a1 = a + Math.PI / 5;
    const a2 = a - Math.PI / 5;
    const tip: [number, number, number] = [sx + Math.cos(a) * ro, Math.sin(a) * ro, 0.08];
    const in1: [number, number, number] = [sx + Math.cos(a1) * ri, Math.sin(a1) * ri, 0.08];
    const in2: [number, number, number] = [sx + Math.cos(a2) * ri, Math.sin(a2) * ri, 0.08];
    f.tri([sx, 0, 0.08], in1, tip, [0, 0], [1, 0], [1, 1], [0, 0, 1], C.white);
    f.tri([sx, 0, 0.08], tip, in2, [0, 0], [1, 0], [1, 1], [0, 0, 1], C.white);
  }
  p.get("darkWood").cylinder(-width / 2 - 0.05, -h / 2 - 0.2, 0.02, 0.03, 0.03, h + 0.5, { segments: 6, color: C.deskDark });
  p.get("bronze").sphere(-width / 2 - 0.05, h / 2 + 0.33, 0.02, 0.06, { segments: 6, rings: 4, color: C.brass });
  return { parts: p, cullDistance: 200 };
}

/** Wooden railing for the listeners' gallery. */
export function railing(length: number): PartSet {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 0.95, 0, length, 0.08, 0.1, { color: C.deskDark });
  w.box(0, 0.08, 0, length, 0.08, 0.1, { color: C.deskDark });
  const n = Math.max(2, Math.round(length / 0.3));
  for (let i = 0; i <= n; i++) w.box(-length / 2 + (i / n) * length, 0.5, 0, 0.05, 0.84, 0.05, { color: C.desk });
  return p;
}

/** Bench for the corridor. */
export function bench(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.45, 0, 1.8, 0.06, 0.4, { color: C.desk });
  for (const x of [-0.8, 0.8]) w.box(x, 0.22, 0, 0.06, 0.44, 0.36, { color: C.deskDark });
  return { parts: p, cullDistance: 100, castShadows: true };
}

/** A minutes ledger lying open on the clerk's desk. */
export function ledger(): PartSet {
  const p = new PartSet();
  p.get("matte").box(0, 0.01, 0, 0.5, 0.02, 0.34, { color: hexColor("#5a2a20") });
  p.get("matte").box(-0.12, 0.025, 0, 0.23, 0.01, 0.31, { color: C.paper });
  p.get("matte").box(0.12, 0.025, 0, 0.23, 0.01, 0.31, { color: C.paper });
  return p;
}
