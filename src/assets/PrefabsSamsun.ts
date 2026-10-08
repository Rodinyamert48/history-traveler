import { Matrix } from "@babylonjs/core";
import { Random } from "../utils/random";
import { hexColor, shade, type RGBA } from "./GeoBuilder";
import { PartSet, type PrefabDef } from "./Prefabs";

/**
 * Props of a hilltop army post above Samsun in May 1919: the stone-and-timber karakol,
 * bell tents, sandbag trenches, the firing range, a field gun, the lookout's binoculars, and
 * down in the harbour the old Bandırma steamer, a British warship and the town's mosques.
 * Origin on the ground, +z is the front.
 */

const C = {
  khaki: hexColor("#8a8460"),
  khakiDark: hexColor("#6a6446"),
  canvas: hexColor("#cfc4a2"),
  sand: hexColor("#b8a47a"),
  wood: hexColor("#8a6440"),
  woodDark: hexColor("#4e3820"),
  stone: hexColor("#a39c8e"),
  iron: hexColor("#2e2c2a"),
  gunGrey: hexColor("#5a5e58"),
  white: hexColor("#f2ede2"),
  red: hexColor("#b3141c"),
  black: hexColor("#1a1a1c"),
  roof: hexColor("#9a4a2a"),
};

/** Gabled roof between x0..x1 / z0..z1 rising to `rise` above `y` (ridge along x). */
function gable(p: PartSet, w: number, d: number, y: number, rise: number, ov = 0.4): void {
  const r = p.get("roof");
  const x0 = -w / 2 - ov;
  const x1 = w / 2 + ov;
  const z0 = -d / 2 - ov;
  const z1 = d / 2 + ov;
  r.quad([x0, y, z0], [x1, y, z0], [x1, y + rise, 0], [x0, y + rise, 0], [0, 0, w / 2, rise], [0, 0.7, -1]);
  r.quad([x1, y, z1], [x0, y, z1], [x0, y + rise, 0], [x1, y + rise, 0], [0, 0, w / 2, rise], [0, 0.7, 1]);
  const g = p.get("plaster");
  g.tri([-w / 2, y, d / 2], [-w / 2, y, -d / 2], [-w / 2, y + rise, 0], [0, 0], [1, 0], [0.5, 1], [-1, 0, 0], hexColor("#e8e0cc"));
  g.tri([w / 2, y, -d / 2], [w / 2, y, d / 2], [w / 2, y + rise, 0], [0, 0], [1, 0], [0.5, 1], [1, 0, 0], hexColor("#e8e0cc"));
}

/** The karakol: stone ground floor, whitewashed timber upper floor, tiled gable roof. */
export function karakol(): PrefabDef {
  const p = new PartSet();
  const w = 12;
  const d = 7;
  p.get("stone").box(0, 1.5, 0, w, 3, d, { uvScale: 3, skipBottom: true, color: C.stone, jitter: 0.03 });
  p.get("plaster").box(0, 4.4, 0, w + 0.4, 2.8, d + 0.4, { uvScale: 4, color: hexColor("#ece4d2") });
  // Timber frame (hımış) on the upper floor.
  const t = p.get("darkWood");
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 2) {
    for (const z of [-d / 2 - 0.22, d / 2 + 0.22]) t.box(x, 4.4, z, 0.16, 2.8, 0.06, { color: C.woodDark });
  }
  for (const z of [-d / 2 - 0.22, d / 2 + 0.22]) {
    t.box(0, 3.06, z, w + 0.4, 0.16, 0.06, { color: C.woodDark });
    t.box(0, 5.76, z, w + 0.4, 0.16, 0.06, { color: C.woodDark });
  }
  gable(p, w + 0.4, d + 0.4, 5.8, 2.2, 0.6);
  // Door, windows, the post's sign board.
  const m = p.get("matte");
  m.box(0, 1.15, d / 2 + 0.03, 1.3, 2.3, 0.08, { color: C.woodDark });
  for (const x of [-4, -2, 2, 4]) {
    m.box(x, 4.4, d / 2 + 0.25, 0.9, 1.1, 0.05, { color: hexColor("#2a2420") });
    m.box(x, 4.4, -d / 2 - 0.25, 0.9, 1.1, 0.05, { color: hexColor("#2a2420") });
    if (Math.abs(x) > 3) m.box(x, 1.7, d / 2 + 0.03, 0.7, 0.8, 0.06, { color: hexColor("#2a2420") });
  }
  t.box(0, 2.6, d / 2 + 0.06, 2.2, 0.45, 0.06, { color: hexColor("#2e4a2e") });
  // Chimney.
  p.get("stone").box(3.5, 7.4, 0, 0.6, 2.2, 0.6, { color: shade(C.stone, 0.9) });
  return { parts: p, cullDistance: 600, castShadows: true };
}

/** Ottoman bell tent (çan çadırı). */
export function bellTent(): PrefabDef {
  const p = new PartSet();
  const f = p.get("cloth");
  f.cylinder(0, 0, 0, 2.0, 2.0, 0.9, { segments: 12, topCap: false, color: C.canvas });
  f.cylinder(0, 0.9, 0, 2.05, 0.08, 2.2, { segments: 12, bottomCap: false, color: shade(C.canvas, 1.04) });
  // Door flap and the pole tip.
  p.get("matte").box(0, 0.75, 1.98, 0.8, 1.5, 0.03, { topScale: 0.4, color: hexColor("#3a3428") });
  p.get("darkWood").cylinder(0, 3.0, 0, 0.04, 0.03, 0.4, { segments: 5, color: C.woodDark });
  // Guy ropes and pegs.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    p.get("rope").push(Matrix.RotationY(-a).multiply(Matrix.Translation(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5)));
    p.get("rope").push(Matrix.RotationZ(0.75));
    p.get("rope").box(0, 0.75, 0, 0.02, 1.5, 0.02, {});
    p.get("rope").pop();
    p.get("rope").pop();
  }
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** A wall of stacked sandbags, `len` meters long along x. */
export function sandbags(len: number, rows = 3): PrefabDef {
  const p = new PartSet();
  const f = p.get("fabric");
  const rnd = new Random(Math.round(len * 10) + rows);
  for (let r = 0; r < rows; r++) {
    const y = 0.13 + r * 0.24;
    const off = r % 2 ? 0.3 : 0;
    for (let x = -len / 2 + 0.3 + off; x < len / 2 - 0.2; x += 0.6) {
      f.box(x + rnd.range(-0.03, 0.03), y, rnd.range(-0.03, 0.03), 0.58, 0.26, 0.42, { topScale: 0.88, color: shade(C.sand, rnd.range(0.86, 1.08)), jitter: 0.05 });
    }
  }
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Target board on posts: white face with black rings. The face is built separately (it flips up). */
export function targetStand(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (const x of [-1.0, 1.0]) w.box(x, 0.45, 0, 0.1, 0.9, 0.1, { color: C.woodDark });
  // An earth berm behind it.
  p.get("terrain").box(0, 0.6, -1.2, 3.4, 1.2, 1.4, { topScale: 0.6, color: hexColor("#7a6a4a") });
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Round target face (radius 0.8) facing +z; origin at its bottom edge (hinge), centre 0.9 above. */
export function targetFace(): PartSet {
  const p = new PartSet();
  p.get("wood").box(0, 0.9, -0.03, 1.9, 1.8, 0.04, { color: C.wood });
  const m = p.get("matte");
  const rings: [number, RGBA][] = [
    [0.8, C.white],
    [0.62, C.black],
    [0.45, C.white],
    [0.27, C.black],
    [0.1, C.red],
  ];
  rings.forEach(([r, col], i) => {
    m.push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, 0.9, i * 0.004)));
    m.cylinder(0, 0, 0, r, r, 0.01, { segments: 18, color: col });
    m.pop();
  });
  return p;
}

/** Spotting binoculars on a wooden tripod (the lookout's post). */
export function binocularTripod(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    w.push(Matrix.RotationZ(Math.cos(a) * 0.25).multiply(Matrix.RotationX(Math.sin(a) * 0.25)).multiply(Matrix.Translation(Math.sin(a) * -0.18, 0.62, Math.cos(a) * 0.18)));
    w.box(0, 0, 0, 0.04, 1.3, 0.04, { color: C.woodDark });
    w.pop();
  }
  const i = p.get("iron");
  for (const x of [-0.06, 0.06]) {
    i.push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(x, 1.3, 0)));
    i.cylinder(0, -0.12, 0, 0.035, 0.045, 0.24, { segments: 8, color: C.iron });
    i.pop();
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** 1910-era 75 mm field gun with shield, spoked wheels and a split trail. Barrel points +z. */
export function fieldGun(): PrefabDef {
  const p = new PartSet();
  const g = p.get("iron");
  g.push(Matrix.RotationX(Math.PI / 2 - 0.08).multiply(Matrix.Translation(0, 1.05, 0)));
  g.cylinder(0, -0.4, 0, 0.07, 0.055, 2.4, { segments: 10, color: C.gunGrey });
  g.cylinder(0, -0.6, 0, 0.12, 0.12, 0.6, { segments: 10, color: shade(C.gunGrey, 0.85) });
  g.pop();
  // Shield.
  g.box(0, 1.15, 0.25, 1.5, 1.0, 0.04, { topScale: 0.85, color: C.gunGrey });
  // Wheels.
  const w = p.get("wood");
  for (const s of [-1, 1]) {
    w.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(s * 0.8, 0.65, 0)));
    w.cylinder(0, -0.05, 0, 0.65, 0.65, 0.1, { segments: 16, caps: false, color: C.woodDark });
    w.cylinder(0, -0.06, 0, 0.12, 0.12, 0.12, { segments: 8, color: C.iron });
    w.pop();
    for (let k = 0; k < 6; k++) {
      w.push(Matrix.RotationX((k / 6) * Math.PI).multiply(Matrix.Translation(s * 0.8, 0.65, 0)));
      w.box(0, 0, 0, 0.04, 1.25, 0.05, { color: C.woodDark });
      w.pop();
    }
  }
  // Trail resting on the ground behind.
  g.push(Matrix.RotationX(-0.32).multiply(Matrix.Translation(0, 0.4, -1.1)));
  g.box(0, 0, 0, 0.25, 0.14, 2.2, { color: C.gunGrey });
  g.pop();
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Rifles leaned together in a pyramid (çatı). */
export function rifleStack(): PrefabDef {
  const p = new PartSet();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const w = p.get("wood");
    w.push(Matrix.RotationZ(Math.cos(a) * 0.3).multiply(Matrix.RotationX(Math.sin(a) * -0.3)).multiply(Matrix.Translation(Math.cos(a) * 0.25, 0.62, Math.sin(a) * 0.25)));
    w.box(0, -0.35, 0, 0.05, 0.5, 0.07, { color: C.wood });
    p.get("iron").push(Matrix.RotationZ(Math.cos(a) * 0.3).multiply(Matrix.RotationX(Math.sin(a) * -0.3)).multiply(Matrix.Translation(Math.cos(a) * 0.25, 0.62, Math.sin(a) * 0.25)));
    p.get("iron").cylinder(0, -0.1, 0, 0.012, 0.012, 0.7, { segments: 4, color: C.iron });
    p.get("iron").pop();
    w.pop();
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** Ammunition boxes stacked by the gun. */
export function ammoBoxes(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(3);
  for (let k = 0; k < 5; k++) {
    const x = (k % 3) * 0.7 - 0.7;
    const y = k < 3 ? 0.18 : 0.54;
    const xx = k < 3 ? x : x + 0.35;
    p.get("wood").box(xx, y, rnd.range(-0.05, 0.05), 0.62, 0.36, 0.4, { color: shade(hexColor("#7a6a3a"), rnd.range(0.9, 1.1)) });
    p.get("iron").box(xx, y + 0.1, 0.21, 0.5, 0.03, 0.01, { color: C.iron });
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Telegraph pole with a crossbar and porcelain insulators. */
export function telegraphPole(): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").cylinder(0, 0, 0, 0.11, 0.08, 6.5, { segments: 6, color: C.woodDark });
  p.get("darkWood").box(0, 6.1, 0, 1.4, 0.1, 0.1, { color: C.woodDark });
  for (const x of [-0.55, -0.2, 0.2, 0.55]) p.get("matte").cylinder(x, 6.15, 0, 0.04, 0.03, 0.12, { segments: 6, color: hexColor("#e8e8e2") });
  return { parts: p, cullDistance: 500, castShadows: true };
}

/** Split-rail fence segment (4 m along x). */
export function fence(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (const x of [-2, 0, 2]) w.box(x, 0.55, 0, 0.1, 1.1, 0.1, { color: C.woodDark });
  for (const y of [0.45, 0.9]) w.box(0, y, 0, 4.1, 0.07, 0.06, { color: C.wood });
  return { parts: p, cullDistance: 200, castShadows: true };
}

/** Black Sea farmhouse: stone ground floor, timber-framed upper floor, low hipped roof. */
export function farmhouse(): PrefabDef {
  const p = new PartSet();
  const w = 8;
  const d = 6;
  p.get("stone").box(0, 1.2, 0, w, 2.4, d, { uvScale: 3, skipBottom: true, color: C.stone, jitter: 0.04 });
  p.get("wood").box(0, 3.6, 0, w + 0.6, 2.4, d + 0.6, { uvScale: 2, color: hexColor("#7a5636") });
  const t = p.get("darkWood");
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.4) for (const z of [-d / 2 - 0.32, d / 2 + 0.32]) t.box(x, 3.6, z, 0.12, 2.4, 0.04, { color: C.woodDark });
  gable(p, w + 0.6, d + 0.6, 4.8, 1.6, 0.8);
  const m = p.get("matte");
  m.box(-1.5, 1.0, d / 2 + 0.03, 1.1, 2.0, 0.06, { color: C.woodDark });
  for (const x of [-2.2, 0.6, 2.6]) m.box(x, 3.6, d / 2 + 0.34, 0.8, 0.9, 0.04, { color: hexColor("#2a2420") });
  // The serender (raised granary) beside it.
  const g = p.get("wood");
  for (const x of [w / 2 + 1.6, w / 2 + 3.6]) for (const z of [-1, 1]) g.box(x, 0.8, z, 0.16, 1.6, 0.16, { color: C.woodDark });
  g.box(w / 2 + 2.6, 2.2, 0, 2.6, 1.4, 2.6, { color: hexColor("#8a6440") });
  p.get("roof").box(w / 2 + 2.6, 3.1, 0, 3.2, 0.3, 3.2, { topScale: 0.4, color: C.roof });
  return { parts: p, cullDistance: 600, castShadows: true };
}

/** Town mosque: square prayer hall, drum and dome, a slender minaret. */
export function mosque(): PrefabDef {
  const p = new PartSet();
  const s = p.get("plaster");
  s.box(0, 4, 0, 12, 8, 12, { uvScale: 4, skipBottom: true, color: hexColor("#efe8da") });
  s.cylinder(0, 8, 0, 5.2, 5.2, 1.2, { segments: 16, color: hexColor("#e6dfd0") });
  p.get("iron").sphere(0, 9.2, 0, 5.2, { segments: 16, rings: 8, scaleY: 0.7, color: hexColor("#7d8288") });
  s.cylinder(7.5, 0, -5, 0.9, 0.85, 20, { segments: 10, color: hexColor("#efe8da") });
  s.cylinder(7.5, 15.5, -5, 1.25, 1.25, 0.5, { segments: 10, color: hexColor("#e2dbcc") });
  p.get("iron").cylinder(7.5, 20, -5, 0.9, 0.0, 4, { segments: 10, color: hexColor("#7d8288") });
  return { parts: p, cullDistance: 1600, castShadows: true };
}

/** Harbour warehouse with a tiled roof. */
export function warehouse(): PrefabDef {
  const p = new PartSet();
  p.get("stone").box(0, 2.5, 0, 16, 5, 9, { uvScale: 4, skipBottom: true, color: hexColor("#b8ad98") });
  gable(p, 16, 9, 5, 2.4, 0.5);
  for (const x of [-5, 0, 5]) p.get("matte").box(x, 1.6, 4.53, 2.2, 3.2, 0.06, { color: C.woodDark });
  return { parts: p, cullDistance: 1600, castShadows: true };
}

interface SteamshipStyle {
  length: number;
  beam: number;
  hull: string;
  house: string;
  funnel: string;
  band?: string;
  funnels: number;
  guns?: boolean;
}

/** Low-poly steamship; bow toward +z. Origin at the waterline. */
function steamship(st: SteamshipStyle): PrefabDef {
  const p = new PartSet();
  const L = st.length;
  const B = st.beam;
  const hull = hexColor(st.hull);
  const h = p.get("matte");
  // Hull: a tapered box with a pointed bow.
  h.box(0, 0.4, -L * 0.06, B, 3.2, L * 0.82, { topScale: 1.05, topScaleZ: 1.02, color: hull });
  h.push(Matrix.Translation(0, 0.4, L * 0.35));
  h.prism(
    [
      [-B / 2, 0],
      [0, L * 0.16],
      [B / 2, 0],
    ],
    -1.2,
    2.0,
    { color: hull },
  );
  h.pop();
  // Red boot topping just above the waterline.
  h.box(0, -0.6, -L * 0.06, B + 0.04, 0.5, L * 0.82, { color: hexColor("#7a1a1a") });
  // Deck and superstructure.
  p.get("wood").box(0, 2.02, -L * 0.04, B - 0.3, 0.06, L * 0.86, { color: hexColor("#b89a72") });
  const house = hexColor(st.house);
  p.get("plaster").box(0, 3.3, -L * 0.06, B * 0.7, 2.5, L * 0.38, { color: house });
  p.get("plaster").box(0, 5.0, L * 0.06, B * 0.55, 1.0, L * 0.12, { color: house });
  for (let k = 0; k < 8; k++) p.get("matte").box(B * 0.351, 3.4, -L * 0.22 + k * (L * 0.045), 0.02, 0.5, 0.6, { color: hexColor("#2a3038") });
  // Funnels.
  for (let f = 0; f < st.funnels; f++) {
    const z = -L * 0.08 - f * L * 0.14 + (st.funnels > 1 ? L * 0.07 : 0);
    p.get("iron").cylinder(0, 4.5, z, 0.85, 0.8, 4.2, { segments: 10, color: hexColor(st.funnel) });
    if (st.band) p.get("matte").cylinder(0, 7.2, z, 0.86, 0.86, 0.6, { segments: 10, caps: false, color: hexColor(st.band) });
  }
  // Masts and rigging.
  for (const z of [L * 0.32, -L * 0.36]) {
    p.get("darkWood").cylinder(0, 2, z, 0.12, 0.08, 11, { segments: 5, color: C.woodDark });
    p.get("darkWood").box(0, 9.5, z, 3, 0.1, 0.1, { color: C.woodDark });
  }
  if (st.guns) {
    for (const z of [L * 0.26, -L * 0.3]) {
      p.get("iron").cylinder(0, 2.1, z, 1.3, 1.1, 0.9, { segments: 10, color: hexColor(st.hull) });
      p.get("iron").push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, 2.6, z + (z > 0 ? 0.9 : -0.9))));
      p.get("iron").cylinder(0, -1.6, 0, 0.14, 0.12, 3.2, { segments: 6, color: hexColor(st.hull) });
      p.get("iron").pop();
    }
  }
  return { parts: p, cullDistance: 3000, castShadows: true };
}

/** The Bandırma: an old, small passenger-cargo steamer — black hull, one tall black funnel. */
export function bandirma(): PrefabDef {
  return steamship({ length: 46, beam: 7.4, hull: "#1c1c1e", house: "#ece6d8", funnel: "#1a1a1a", band: "#b8902e", funnels: 1 });
}

/** British warship at anchor (grey, two funnels, gun turrets). */
export function warship(): PrefabDef {
  return steamship({ length: 92, beam: 11, hull: "#6a7078", house: "#7a8088", funnel: "#5a6068", funnels: 2, guns: true });
}

/** A merchant steamer (şilep): rust-brown hull, buff funnel. */
export function merchantShip(): PrefabDef {
  return steamship({ length: 60, beam: 9, hull: "#4a3428", house: "#d8ccb0", funnel: "#c8a060", band: "#1a1a1a", funnels: 1 });
}

/** Mauser held at the shoulder (first person); barrel toward +z, origin at the grip. */
export function heldRifle(): PartSet {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, -0.02, -0.18, 0.05, 0.11, 0.42, { color: hexColor("#6a4426") });
  w.box(0, 0.0, 0.3, 0.045, 0.06, 0.62, { color: hexColor("#7a5030") });
  const i = p.get("iron");
  i.push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, 0.04, 0.02)));
  i.cylinder(0, 0, 0, 0.012, 0.011, 0.9, { segments: 6, color: C.iron });
  i.pop();
  i.box(0, 0.06, 0.06, 0.03, 0.03, 0.14, { color: C.iron });
  // Bolt handle and the front sight.
  i.box(0.05, 0.05, 0.02, 0.06, 0.015, 0.015, { color: C.iron });
  i.box(0, 0.07, 0.9, 0.006, 0.025, 0.01, { color: C.iron });
  return p;
}

/** Oak / hazel shrub for the green slopes (lighter than the 1453 broad tree). */
export function hazelBush(seed: number): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(seed);
  const f = p.get("foliage");
  for (let k = 0; k < 4; k++) f.sphere(rnd.range(-0.6, 0.6), 0.6 + rnd.range(0, 0.5), rnd.range(-0.6, 0.6), rnd.range(0.6, 0.95), { segments: 6, rings: 4, color: shade(hexColor("#4f7a32"), rnd.range(0.85, 1.1)), jitter: 0.1 });
  return { parts: p, cullDistance: 260, castShadows: false };
}

