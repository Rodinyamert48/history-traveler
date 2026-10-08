import { Matrix } from "@babylonjs/core";
import { Random } from "../utils/random";
import { GeoBuilder, hexColor, mixColor, shade, type RGBA } from "./GeoBuilder";
import { PartSet, type PrefabDef } from "./Prefabs";

/**
 * Props of Balabancık Hisarı, an Ottoman siege fort before Bursa (1326): the checkpoint
 * barrier at the gate, the kitchen's spit roast, horses in the stable, the war table by
 * Orhan Gazi's tent, the barracks, a well — and on the horizon the Byzantine citadel of
 * Bursa and snowy Uludağ. Origin on the ground, +z is the front.
 */

const C = {
  wood: hexColor("#8a6440"),
  woodDark: hexColor("#4e3820"),
  stone: hexColor("#a49a88"),
  stoneDark: hexColor("#7a7264"),
  iron: hexColor("#2e2c2a"),
  red: hexColor("#a8181f"),
  white: hexColor("#efe6d2"),
  horse: [hexColor("#6a4a30"), hexColor("#3a2a1e"), hexColor("#a8885e")] as RGBA[],
  meat: hexColor("#c8806a"),
};

/** Checkpoint barrier: a striped pole across the gate on two posts. Pole along x. */
export function barrier(len: number): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (const x of [-len / 2, len / 2]) w.box(x, 0.6, 0, 0.3, 1.2, 0.3, { color: C.woodDark });
  for (let i = 0; i < 8; i++) {
    const x0 = -len / 2 + (i / 8) * len;
    p.get("matte").box(x0 + len / 16, 1.1, 0, len / 8 + 0.01, 0.16, 0.16, { color: i % 2 ? C.white : C.red });
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Low-poly horse standing (+z = head). */
export function horse(variant: number): PrefabDef {
  const p = new PartSet();
  const col = C.horse[variant % C.horse.length];
  const m = p.get("matte");
  // Legs.
  for (const [x, z] of [
    [-0.22, 0.65],
    [0.22, 0.65],
    [-0.22, -0.65],
    [0.22, -0.65],
  ])
    m.box(x, 0.45, z, 0.14, 0.9, 0.16, { topScale: 1.2, color: shade(col, 0.9) });
  // Body, neck, head, tail, mane.
  m.box(0, 1.25, 0, 0.6, 0.62, 1.7, { topScale: 0.92, color: col });
  m.push(Matrix.RotationX(-0.75).multiply(Matrix.Translation(0, 1.55, 0.85)));
  m.box(0, 0.3, 0, 0.32, 0.8, 0.36, { topScale: 0.8, color: col });
  m.pop();
  m.box(0, 2.0, 1.25, 0.26, 0.28, 0.62, { topScale: 0.85, color: col });
  m.box(0, 1.95, 1.55, 0.2, 0.2, 0.12, { color: shade(col, 0.7) });
  m.box(0, 1.95, 0.95, 0.06, 0.4, 0.4, { color: hexColor("#1a1612") });
  m.push(Matrix.RotationX(0.35).multiply(Matrix.Translation(0, 1.3, -0.9)));
  m.box(0, -0.35, 0, 0.12, 0.7, 0.12, { color: hexColor("#1a1612") });
  m.pop();
  // Saddle cloth.
  p.get("fabric").box(0, 1.58, -0.05, 0.66, 0.08, 0.7, { color: variant % 2 ? C.red : hexColor("#2a4a6e") });
  return { parts: p, cullDistance: 220, castShadows: true };
}

/** Stone well with a timber frame and a bucket. */
export function well(): PrefabDef {
  const p = new PartSet();
  p.get("stone").cylinder(0, 0, 0, 0.95, 0.95, 0.85, { segments: 10, topCap: false, color: C.stone });
  p.get("matte").cylinder(0, 0.75, 0, 0.75, 0.75, 0.02, { segments: 10, color: hexColor("#1a2830") });
  const w = p.get("darkWood");
  for (const x of [-0.85, 0.85]) w.box(x, 1.3, 0, 0.12, 2.6, 0.12, { color: C.woodDark });
  w.cylinderX(-0.9, 2.3, 0, 1.8, 0.07, 0.07, { segments: 6, color: C.wood });
  p.get("rope").box(0, 1.75, 0, 0.03, 1.1, 0.03, {});
  p.get("darkWood").cylinder(0, 1.1, 0, 0.14, 0.18, 0.24, { segments: 8, color: C.wood });
  return { parts: p, cullDistance: 180, castShadows: true };
}

/** War table by Orhan Gazi's tent: a map of Bursa with markers, on trestles. */
export function warTable(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.88, 0, 2.4, 0.08, 1.5, { color: C.wood });
  for (const x of [-1, 1]) for (const z of [-0.6, 0.6]) w.box(x, 0.44, z, 0.1, 0.88, 0.1, { color: C.woodDark });
  // Map parchment: plain, a city ring with gates, roads.
  const m = p.get("matte");
  m.box(0, 0.925, 0, 2.1, 0.01, 1.3, { color: hexColor("#d8c8a0") });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    m.box(0.3 + Math.cos(a) * 0.32, 0.935, -0.1 + Math.sin(a) * 0.32, 0.12, 0.01, 0.04, { color: hexColor("#5a4a3a") });
  }
  m.box(-0.5, 0.935, 0.2, 1.2, 0.01, 0.03, { color: hexColor("#8a6a4a") });
  for (const [x, z, col] of [
    [-0.7, 0.3, C.red],
    [-0.1, -0.45, C.red],
    [0.75, 0.25, C.red],
    [0.3, -0.1, hexColor("#4a2a6a")],
  ] as [number, number, RGBA][])
    m.cylinder(x, 0.93, z, 0.04, 0.03, 0.09, { segments: 6, color: col });
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** Long timber barracks with a tiled roof. */
export function barracks(): PrefabDef {
  const p = new PartSet();
  const w = 14;
  const d = 5;
  p.get("stone").box(0, 0.5, 0, w, 1, d, { uvScale: 3, skipBottom: true, color: C.stoneDark });
  p.get("wood").box(0, 2.0, 0, w, 2.0, d, { uvScale: 2, color: hexColor("#7a5636") });
  const r = p.get("roof");
  const ov = 0.5;
  r.quad([-w / 2 - ov, 3, -d / 2 - ov], [w / 2 + ov, 3, -d / 2 - ov], [w / 2 + ov, 4.6, 0], [-w / 2 - ov, 4.6, 0], [0, 0, w / 2, 2], [0, 0.8, -1]);
  r.quad([w / 2 + ov, 3, d / 2 + ov], [-w / 2 - ov, 3, d / 2 + ov], [-w / 2 - ov, 4.6, 0], [w / 2 + ov, 4.6, 0], [0, 0, w / 2, 2], [0, 0.8, 1]);
  for (const s of [-1, 1]) p.get("wood").tri([s * w / 2, 3, -d / 2], [s * w / 2, 3, d / 2], [s * w / 2, 4.6, 0], [0, 0], [1, 0], [0.5, 1], [s, 0, 0], hexColor("#7a5636"));
  const m = p.get("matte");
  for (const x of [-4.5, 0, 4.5]) m.box(x, 1.6, d / 2 + 0.03, 1.1, 2.0, 0.06, { color: C.woodDark });
  for (const x of [-6, -2.2, 2.2, 6]) m.box(x, 2.3, d / 2 + 0.03, 0.6, 0.5, 0.05, { color: hexColor("#1e1a16") });
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** Bundles of arrows and a rack of shields (armory stock). */
export function armoryStock(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(31);
  for (let k = 0; k < 4; k++) {
    const x = -1.2 + k * 0.8;
    p.get("wood").cylinder(x, 0, 0, 0.18, 0.2, 0.8, { segments: 8, color: hexColor("#6a4a2a") });
    for (let a = 0; a < 6; a++) p.get("fabric").box(x + rnd.range(-0.1, 0.1), 0.9, rnd.range(-0.1, 0.1), 0.06, 0.12, 0.02, { color: a % 2 ? C.white : C.red });
  }
  for (let k = 0; k < 3; k++) {
    p.get("wood").push(Matrix.RotationX(-0.25).multiply(Matrix.Translation(-0.9 + k * 0.9, 0.55, -0.6)));
    p.get("wood").cylinder(0, 0, 0, 0.45, 0.45, 0.06, { segments: 12, color: k % 2 ? C.red : hexColor("#8a6a3a") });
    p.get("wood").pop();
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Roasting pit: a long ember trench with two forked uprights holding the spit. */
export function roastPit(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  for (let k = 0; k < 12; k++) {
    const x = -1.3 + (k % 6) * 0.52;
    const z = k < 6 ? -0.5 : 0.5;
    s.sphere(x, 0.12, z, 0.22, { segments: 5, rings: 3, scaleY: 0.7, color: shade(C.stone, 0.8 + (k % 3) * 0.08) });
  }
  p.get("matte").box(0, 0.02, 0, 2.6, 0.04, 0.8, { color: hexColor("#2a1e16") });
  const w = p.get("darkWood");
  for (const x of [-1.5, 1.5]) {
    w.box(x, 0.55, 0, 0.12, 1.1, 0.12, { color: C.woodDark });
    w.box(x, 1.12, 0.08, 0.06, 0.18, 0.06, { color: C.woodDark });
    w.box(x, 1.12, -0.08, 0.06, 0.18, 0.06, { color: C.woodDark });
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Embers in the pit (fire material). */
export function embers(): PartSet {
  const p = new PartSet();
  const rnd = new Random(5);
  for (let k = 0; k < 14; k++) p.get("fire").box(rnd.range(-1.1, 1.1), 0.05, rnd.range(-0.25, 0.25), rnd.range(0.12, 0.22), 0.05, rnd.range(0.1, 0.2), { jitter: 0.2 });
  return p;
}

/** The spit with a whole lamb; rotates around the x axis (origin on the spit axis). */
export function spitLamb(): { spit: PartSet; lamb: PartSet } {
  const spit = new PartSet();
  spit.get("iron").cylinderX(-1.7, 0, 0, 3.4, 0.025, 0.025, { segments: 6, color: C.iron });
  spit.get("iron").box(1.75, -0.12, 0, 0.04, 0.24, 0.04, { color: C.iron });
  const lamb = new PartSet();
  const m = lamb.get("matte");
  m.sphere(0, 0, 0, 0.42, { segments: 9, rings: 6, scaleY: 0.62, color: [1, 1, 1, 1], jitter: 0.05 });
  m.push(Matrix.Translation(0, 0, 0));
  m.box(0.55, 0, 0, 0.5, 0.36, 0.4, { topScale: 0.7, color: [1, 1, 1, 1] });
  m.box(-0.55, 0, 0, 0.5, 0.34, 0.4, { topScale: 0.7, color: [1, 1, 1, 1] });
  m.pop();
  for (const [x, z] of [
    [0.75, 0.18],
    [0.75, -0.18],
    [-0.75, 0.18],
    [-0.75, -0.18],
  ])
    m.box(x + Math.sign(x) * 0.2, -0.1, z, 0.4, 0.08, 0.08, { color: [0.85, 0.85, 0.85, 1] });
  return { spit, lamb };
}

/** A snowy mountain massif (Uludağ) built as one big mesh; radius/height in meters. */
export function mountain(R: number, H: number, seed: number, peaks = 3): GeoBuilder {
  const b = new GeoBuilder();
  const rnd = new Random(seed);
  const rock = hexColor("#7a7c86");
  const forest = hexColor("#4a5e44");
  const snow = hexColor("#f2f4f8");
  const rings = [
    [1.25, -0.3],
    [1.0, 0],
    [0.78, 0.25],
    [0.58, 0.48],
    [0.4, 0.68],
    [0.24, 0.85],
    [0.08, 1.0],
  ];
  const seg = 28;
  const jit = rings.map(() => Array.from({ length: seg }, () => rnd.range(0.85, 1.15)));
  const ridge = Array.from({ length: peaks }, () => rnd.range(0, Math.PI * 2));
  const pt = (ri: number, k: number): [number, number, number] => {
    const [r, h] = rings[ri];
    const a = ((k % seg) / seg) * Math.PI * 2;
    // Uludağ is a long ridge rather than a cone: stretch it along x.
    const j = jit[ri][k % seg];
    let lift = 0;
    for (const pa of ridge) lift += Math.max(0, Math.cos(a - pa)) * (ri >= 4 ? 25 : 0);
    return [Math.cos(a) * R * r * j * 1.8, H * h + lift, Math.sin(a) * R * r * j];
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < seg; k++) {
      const a = pt(ri, k);
      const bb = pt(ri, k + 1);
      const c = pt(ri + 1, k + 1);
      const d = pt(ri + 1, k);
      const hm = (a[1] + c[1]) / 2 / H;
      const col = hm > 0.6 ? snow : hm > 0.42 ? mixColor(rock, snow, (hm - 0.42) / 0.18 + rnd.range(-0.25, 0.25)) : hm > 0.18 ? shade(rock, rnd.range(0.88, 1.08)) : shade(forest, rnd.range(0.85, 1.1));
      b.quad(a, bb, c, d, [0, 0, 1, 1], [(a[0] + bb[0]) / 2, 0.4 * R, (a[2] + bb[2]) / 2], col);
    }
  }
  return b;
}

/** Copper tray with the roast lamb carved in pieces on flatbread (served to Orhan Gazi). */
export function kebapTray(): PartSet {
  const p = new PartSet();
  const rnd = new Random(1326);
  p.get("bronze").cylinder(0, 0, 0, 0.32, 0.34, 0.03, { segments: 16, color: hexColor("#c87a3a") });
  p.get("matte").cylinder(0, 0.03, 0, 0.28, 0.28, 0.02, { segments: 14, color: hexColor("#d8b070") });
  for (let i = 0; i < 9; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = rnd.range(0, 0.18);
    p.get("matte").box(Math.cos(a) * r, 0.07, Math.sin(a) * r, rnd.range(0.07, 0.12), 0.06, rnd.range(0.05, 0.09), { color: shade(hexColor("#8a4a20"), rnd.range(0.85, 1.15)), jitter: 0.2 });
  }
  p.get("matte").sphere(0.2, 0.06, -0.12, 0.04, { segments: 6, rings: 4, color: hexColor("#3a7a2a") });
  return p;
}

/** A bundle of split logs carried on the shoulder (first person). */
export function heldLogs(): PartSet {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (const [y, z] of [
    [0, -0.07],
    [0, 0.07],
    [0.11, 0],
  ])
    w.cylinderX(-0.45, y, z, 0.9, 0.06, 0.06, { segments: 7, color: C.wood });
  p.get("fabric").box(-0.2, 0.05, 0, 0.04, 0.24, 0.24, { color: hexColor("#6a5a40") });
  p.get("fabric").box(0.2, 0.05, 0, 0.04, 0.24, 0.24, { color: hexColor("#6a5a40") });
  return p;
}
