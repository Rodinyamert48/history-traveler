import { Matrix } from "@babylonjs/core";
import { Random } from "../utils/random";
import { hexColor, mixColor, shade, type RGBA } from "./GeoBuilder";
import { PartSet, type PrefabDef } from "./Prefabs";

/**
 * Procedural models for the Muğla / Menteşe chapter: whitewashed old Muğla houses with tall
 * white chimneys and "kabalak" gate roofs, Turkish red pines, the village plane tree,
 * fountain, stone mortar (dibek), keşkek hearth with copper cauldron and wedding props.
 * Same conventions as Prefabs.ts: origin on the ground, +z is the front.
 */

const C = {
  white: hexColor("#f4f1ea"),
  whiteWarm: hexColor("#efe8da"),
  stone: hexColor("#a59d90"),
  stoneDark: hexColor("#7a7368"),
  wood: hexColor("#8a6240"),
  woodDark: hexColor("#5a3e28"),
  shutter: hexColor("#4a6a7a"),
  shutterGreen: hexColor("#4f6a46"),
  glass: hexColor("#2a221a"),
  roof: hexColor("#b8644a"),
  pineBark: hexColor("#5e4434"),
  // Slightly blue greens so the warm afternoon sun doesn't turn the canopy khaki.
  pineNeedle: hexColor("#2a4a30"),
  pineNeedleLight: hexColor("#3a5e34"),
  planeLeaf: hexColor("#6e8f3c"),
  planeBark: hexColor("#b3a58a"),
  copper: hexColor("#c27a48"),
  /** Vertex tint for parts drawn with the copper material (which supplies the colour). */
  copperTint: hexColor("#f2e8e0"),
  straw: hexColor("#d9b86a"),
  red: hexColor("#b3141c"),
  gold: hexColor("#d8ad48"),
  clay: hexColor("#b0603a"),
};

/** Hip roof of alaturka tiles with deep eaves (saçak), sitting at height `h`. */
function hipRoof(p: PartSet, w: number, d: number, h: number, rh: number, ov: number): void {
  const r = p.get("roof");
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
  // Wooden soffit under the eaves.
  p.get("darkWood").box(0, h - 0.06, 0, w + ov * 2 - 0.1, 0.1, d + ov * 2 - 0.1, { uvScale: 2, skipTop: true, color: C.woodDark });
}

/** The famous tall white Muğla chimney with a pointed cap. */
function chimney(p: PartSet, x: number, z: number, baseY: number, height: number): void {
  const pl = p.get("plaster");
  pl.box(x, baseY + height / 2, z, 0.62, height, 0.62, { uvScale: 2, color: C.white });
  pl.box(x, baseY + height + 0.06, z, 0.8, 0.12, 0.8, { uvScale: 2, color: C.white });
  // Little openings for the smoke under the cap.
  const m = p.get("matte");
  for (const [dx, dz] of [
    [0.31, 0],
    [-0.31, 0],
    [0, 0.31],
    [0, -0.31],
  ])
    m.box(x + dx, baseY + height - 0.25, z + dz, Math.abs(dz) > 0 ? 0.26 : 0.03, 0.22, Math.abs(dx) > 0 ? 0.26 : 0.03, { color: hexColor("#2a2420") });
  pl.cylinder(x, baseY + height + 0.12, z, 0.5, 0, 0.75, { segments: 4, color: C.white });
}

function windowWithShutters(p: PartSet, x: number, y: number, z: number, face: 1 | -1, shutter: RGBA, axis: "z" | "x" = "z"): void {
  const m = p.get("matte");
  const put = (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: RGBA) => {
    if (axis === "z") m.box(x + lx, y + ly, z + lz * face, w, h, d, { color });
    else m.box(x + lz * face, y + ly, z + lx, d, h, w, { color });
  };
  put(0, 0, 0.02, 0.86, 1.12, 0.08, C.woodDark);
  put(0, 0, 0.05, 0.68, 0.94, 0.06, C.glass);
  // Iron-grille look: two thin vertical bars.
  put(-0.12, 0, 0.09, 0.03, 0.94, 0.03, hexColor("#2a2a2a"));
  put(0.12, 0, 0.09, 0.03, 0.94, 0.03, hexColor("#2a2a2a"));
  // Open shutters on both sides.
  put(-0.72, 0, 0.06, 0.5, 1.02, 0.05, shutter);
  put(0.72, 0, 0.06, 0.5, 1.02, 0.05, shutter);
}

/**
 * Old Muğla house: whitewashed stone, two storeys, a wooden "hayat" gallery on the courtyard
 * side, deep eaves, red tiles and a tall white chimney.
 */
export function muglaHouseSize(variant: number): { w: number; d: number } {
  const rnd = new Random(300 + variant * 7);
  return { w: rnd.range(7.5, 9.5), d: rnd.range(6, 7.5) };
}

export function muglaHouse(variant: number): PrefabDef {
  const rnd = new Random(300 + variant * 7);
  const p = new PartSet();
  const w = rnd.range(7.5, 9.5);
  const d = rnd.range(6, 7.5);
  const floor = 2.9;
  const h = floor * 2;
  const pl = p.get("plaster");
  pl.box(0, h / 2, 0, w, h, d, { uvScale: 4, skipBottom: true, jitter: 0.02, color: C.white });
  // Grey stone plinth that also reaches down for sloped ground.
  p.get("stone").box(0, 0.05, 0, w + 0.16, 1.1, d + 0.16, { uvScale: 5, skipBottom: true, color: C.stone });
  // Floor band between storeys.
  p.get("darkWood").box(0, floor, 0, w + 0.08, 0.14, d + 0.08, { uvScale: 2, color: C.woodDark });
  hipRoof(p, w, d, h, rnd.range(1.4, 1.9), 0.9);
  const shutter = variant % 2 ? C.shutter : C.shutterGreen;
  // Windows: street side (-z) gets fewer, high windows; courtyard side (+z) the gallery.
  for (const x of [-w * 0.27, w * 0.27]) windowWithShutters(p, x, floor + 1.45, -d / 2, -1, shutter);
  windowWithShutters(p, 0, 1.6, -d / 2, -1, shutter);
  for (const side of [-1, 1] as const) windowWithShutters(p, 0, floor + 1.45, side * (w / 2), side, shutter, "x");
  // Courtyard door.
  const m = p.get("matte");
  m.box(-w * 0.25, 1.1, d / 2 + 0.03, 1.2, 2.2, 0.08, { color: C.woodDark });
  m.box(-w * 0.25, 1.1, d / 2 + 0.07, 1.0, 2.0, 0.05, { color: hexColor("#6a4a2e") });
  windowWithShutters(p, w * 0.22, 1.55, d / 2, 1, shutter);
  // Upper gallery (hayat): wooden floor projection, posts and railing.
  const wd = p.get("wood");
  const gz = d / 2 + 0.75;
  wd.box(0, floor + 0.02, gz, w - 0.6, 0.16, 1.5, { uvScale: 2, color: C.wood });
  for (let i = 0; i <= 4; i++) {
    const x = -w / 2 + 0.5 + (i / 4) * (w - 1);
    wd.box(x, floor + 1.45, gz + 0.6, 0.16, 2.8, 0.16, { color: C.woodDark });
    wd.box(x, floor / 2, gz + 0.6, 0.18, floor, 0.18, { color: C.woodDark });
  }
  wd.box(0, floor + 0.95, gz + 0.6, w - 0.8, 0.08, 0.08, { color: C.woodDark });
  for (let i = 0; i < 14; i++) wd.box(-w / 2 + 0.7 + (i / 13) * (w - 1.4), floor + 0.55, gz + 0.6, 0.05, 0.8, 0.05, { color: C.wood });
  // Gallery doors.
  for (const x of [-w * 0.2, w * 0.2]) m.box(x, floor + 1.1, d / 2 + 0.03, 0.9, 2, 0.06, { color: hexColor("#6a4a2e") });
  chimney(p, w * 0.28 * (variant % 2 ? 1 : -1), -d * 0.18, h - 0.4, rnd.range(2.6, 3.3));
  const lod = new PartSet();
  lod.get("plaster").box(0, h / 2, 0, w, h, d, { uvScale: 4, skipBottom: true, color: C.white });
  hipRoof(lod, w, d, h, 1.6, 0.9);
  chimney(lod, w * 0.28 * (variant % 2 ? 1 : -1), -d * 0.18, h - 0.4, 3);
  return { parts: p, lod: { distance: 85, parts: lod }, cullDistance: 900, castShadows: true, tintable: true };
}

/** Courtyard gate with a "kabalak": a small tiled roof on wooden brackets over the double door. */
export function kabalakGate(): PrefabDef {
  const p = new PartSet();
  const pl = p.get("plaster");
  const width = 2.2;
  // Gate piers.
  for (const s of [-1, 1]) pl.box(s * (width / 2 + 0.3), 1.35, 0, 0.6, 2.7, 0.6, { uvScale: 2, color: C.white });
  pl.box(0, 2.85, 0, width + 1.2, 0.3, 0.6, { uvScale: 2, color: C.white });
  // Double wooden door with iron studs.
  const m = p.get("matte");
  for (const s of [-1, 1]) {
    m.box(s * (width / 4), 1.25, 0, width / 2 - 0.04, 2.5, 0.1, { color: hexColor("#5e3e24") });
    for (let i = 0; i < 3; i++) m.box(s * (width / 4), 0.5 + i * 0.8, 0.06, width / 2 - 0.2, 0.06, 0.03, { color: hexColor("#2a2420") });
  }
  // Kabalak roof.
  const r = p.get("roof");
  const y0 = 3.0;
  const ov = 0.75;
  const hw = width / 2 + 0.85;
  r.quad([-hw, y0, -ov], [hw, y0, -ov], [hw, y0 + 0.7, 0], [-hw, y0 + 0.7, 0], [0, 0, 2, 0.7], [0, 1, -1]);
  r.quad([hw, y0, ov], [-hw, y0, ov], [-hw, y0 + 0.7, 0], [hw, y0 + 0.7, 0], [0, 0, 2, 0.7], [0, 1, 1]);
  r.tri([-hw, y0, ov], [-hw, y0, -ov], [-hw, y0 + 0.7, 0], [0, 0], [1, 0], [0.5, 0.5], [-1, 0, 0]);
  r.tri([hw, y0, -ov], [hw, y0, ov], [hw, y0 + 0.7, 0], [0, 0], [1, 0], [0.5, 0.5], [1, 0, 0]);
  const wd = p.get("darkWood");
  for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) wd.box(s * (hw - 0.3), y0 - 0.1, z, 0.14, 0.2, 0.5, { color: C.woodDark });
  wd.box(0, y0 - 0.02, 0, hw * 2, 0.08, ov * 2, { color: C.woodDark });
  return { parts: p, cullDistance: 500, castShadows: true, tintable: true };
}

/** Turkish red pine (kızılçam): tall orange-grey trunk, irregular flat-topped crown clumps. */
export function redPine(seed: number, young = false): PrefabDef {
  const rnd = new Random(seed * 53 + (young ? 7 : 0));
  const p = new PartSet();
  const trunkH = young ? rnd.range(2.5, 4) : rnd.range(6, 8.5);
  const lean = rnd.range(-0.08, 0.08);
  const bark = p.get("wood");
  bark.push(Matrix.RotationZ(lean));
  bark.cylinder(0, 0, 0, young ? 0.14 : 0.3, young ? 0.08 : 0.16, trunkH, { segments: 6, color: C.pineBark });
  bark.pop();
  const f = p.get("foliage");
  const topX = -Math.sin(lean) * trunkH;
  if (young) {
    f.cylinder(topX * 0.5, trunkH * 0.35, 0, 1.3, 0.2, trunkH * 0.9, { segments: 6, color: C.pineNeedle, jitter: 0.08 });
  } else {
    // Mature red pines lose their lower branches: a few broad, flattened clumps up top.
    const clumps = rnd.int(5, 7);
    for (let i = 0; i < clumps; i++) {
      const a = rnd.range(0, Math.PI * 2);
      const rr = i === 0 ? 0 : rnd.range(1.2, 2.4);
      const y = trunkH - rnd.range(-0.4, 2.6) + (i === 0 ? 1 : 0);
      f.sphere(topX + Math.cos(a) * rr, y, Math.sin(a) * rr, rnd.range(1.8, 2.6), {
        segments: 6,
        rings: 4,
        scaleY: 0.55,
        color: shade(i % 2 ? C.pineNeedle : C.pineNeedleLight, rnd.range(0.85, 1.1)),
        jitter: 0.1,
      });
      // Bare branch stubs leading to the clumps.
      if (i > 0) {
        bark.push(Matrix.RotationY(-a).multiply(Matrix.Translation(topX, y - 0.6, 0)));
        bark.cylinderX(0, 0, 0, rr, 0.07, 0.04, { segments: 4, color: C.pineBark });
        bark.pop();
      }
    }
  }
  const lod = new PartSet();
  lod.get("wood").cylinder(0, 0, 0, young ? 0.14 : 0.28, 0.14, trunkH, { segments: 4, color: C.pineBark });
  if (young) lod.get("foliage").cylinder(0, trunkH * 0.35, 0, 1.3, 0.2, trunkH * 0.9, { segments: 4, color: shade(C.pineNeedle, 0.7) });
  // Far crowns get no self-shadowing/AO, so their colour is darkened to match the near ones.
  else lod.get("foliage").sphere(topX, trunkH + 0.2, 0, 3.4, { segments: 6, rings: 3, scaleY: 0.6, color: shade(C.pineNeedle, 0.5) });
  return { parts: p, lod: { distance: 70, parts: lod }, cullDistance: 650, castShadows: true, tintable: true };
}

/** The village plane tree (çınar) with a round stone bench (seki) around its trunk. */
export function cinar(): PrefabDef {
  const rnd = new Random(1375);
  const p = new PartSet();
  const bark = p.get("wood");
  bark.cylinder(0, 0, 0, 0.95, 0.65, 5.5, { segments: 9, color: C.planeBark, uvScale: 2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    bark.push(Matrix.RotationZ(0.55).multiply(Matrix.RotationY(a)).multiply(Matrix.Translation(0, 4.6, 0)));
    bark.cylinder(0, 0, 0, 0.45, 0.25, 4.5, { segments: 6, color: C.planeBark });
    bark.pop();
  }
  const f = p.get("foliage");
  for (let i = 0; i < 11; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const rr = i === 0 ? 0 : rnd.range(2.5, 6.5);
    f.sphere(Math.cos(a) * rr, rnd.range(8.5, 12) - rr * 0.2, Math.sin(a) * rr, rnd.range(3, 4.4), {
      segments: 7,
      rings: 5,
      scaleY: 0.7,
      color: shade(C.planeLeaf, rnd.range(0.8, 1.12)),
      jitter: 0.08,
    });
  }
  // Seki: low whitewashed circular bench.
  const st = p.get("plaster");
  st.cylinder(0, 0, 0, 2.6, 2.6, 0.5, { segments: 14, color: C.whiteWarm, uvScale: 2 });
  p.get("stone").cylinder(0, 0.5, 0, 2.7, 2.7, 0.08, { segments: 14, color: C.stone });
  return { parts: p, cullDistance: 1500, castShadows: true };
}

/** Stone village fountain (çeşme): wall with a pointed-arch niche, spout and trough. */
export function cesme(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  s.box(0, 1.5, 0, 3.2, 3, 0.9, { uvScale: 3, color: hexColor("#c9bea8") });
  s.box(0, 3.08, 0, 3.5, 0.18, 1.1, { uvScale: 3, color: hexColor("#b3a890") });
  // Pointed arch niche (dark recess) with a marble panel.
  const m = p.get("matte");
  m.box(0, 1.35, 0.42, 1.5, 1.7, 0.1, { color: hexColor("#6d6658") });
  m.tri([-0.75, 2.2, 0.48], [0.75, 2.2, 0.48], [0, 2.75, 0.48], [0, 0], [1, 0], [0.5, 1], [0, 0, 1], hexColor("#6d6658"));
  p.get("plaster").box(0, 2.6, 0.47, 1.0, 0.28, 0.05, { color: hexColor("#f2eee4") });
  // Brass spout.
  p.get("bronze").cylinderX(0, 1.25, 0.6, 0.35, 0.04, 0.035, { segments: 6 });
  // Trough.
  s.box(0, 0.35, 0.95, 2.6, 0.7, 0.9, { uvScale: 3, color: hexColor("#b8ad98") });
  m.box(0, 0.66, 0.95, 2.3, 0.05, 0.62, { color: hexColor("#3d6a78") });
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** Large stone mortar (dibek taşı) used to hull wheat for keşkek. */
export function dibekStone(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  s.cylinder(0, 0, 0, 0.62, 0.52, 0.72, { segments: 10, topCap: false, color: hexColor("#9a9284"), uvScale: 2 });
  // Rim and the hollow inside.
  s.cylinder(0, 0.72, 0, 0.52, 0.36, 0.03, { segments: 10, caps: false, color: hexColor("#8a8274") });
  // Dark floor of the hollow; the wheat level sits on top of it.
  p.get("matte").cylinder(0, 0.46, 0, 0.42, 0.42, 0.02, { segments: 10, color: hexColor("#2e2924") });
  // Flat stone it sits on.
  s.cylinder(0, -0.05, 0, 1.0, 1.05, 0.08, { segments: 9, color: hexColor("#8a8478") });
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Wheat filling the mortar (raised as it is pounded). */
export function dibekWheat(): PartSet {
  const p = new PartSet();
  p.get("foliage").cylinder(0, 0, 0, 0.35, 0.33, 0.06, { segments: 10, color: C.straw });
  return p;
}

/** The long wooden keşkek mallet (tokmak), origin at the grip. */
export function tokmak(): PartSet {
  const p = new PartSet();
  const w = p.get("wood");
  w.cylinder(0, -0.2, 0, 0.035, 0.035, 1.25, { segments: 6, color: hexColor("#9a7350") });
  w.cylinder(0, 1.0, 0, 0.12, 0.11, 0.36, { segments: 8, color: hexColor("#6e4a2c") });
  return p;
}

/** U-shaped stone hearth (ocak) for the big keşkek cauldron. */
export function ocak(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  const col = hexColor("#8e867a");
  s.box(0, 0.45, -0.95, 2.4, 0.9, 0.5, { uvScale: 2, color: col, jitter: 0.06 });
  for (const x of [-0.95, 0.95]) s.box(x, 0.45, 0.1, 0.5, 0.9, 1.6, { uvScale: 2, color: col, jitter: 0.06 });
  // Soot-blackened inside and ash bed.
  p.get("matte").box(0, 0.03, 0, 1.4, 0.06, 1.6, { color: hexColor("#2a2420") });
  p.get("matte").box(0, 0.6, -0.69, 1.4, 0.6, 0.02, { color: hexColor("#1f1a16") });
  return { parts: p, cullDistance: 350, castShadows: true };
}

/** Big hammered copper cauldron (bakır kazan). Origin at its base. */
export function copperKazan(): PartSet {
  const p = new PartSet();
  const c = p.get("bronze");
  c.cylinder(0, 0, 0, 0.62, 0.86, 0.75, { segments: 14, topCap: false, color: C.copperTint });
  c.cylinder(0, 0.75, 0, 0.86, 0.92, 0.1, { segments: 14, caps: false, color: shade(C.copperTint, 1.1) });
  c.cylinder(0, 0.85, 0, 0.92, 0.84, 0.03, { segments: 14, caps: false, color: shade(C.copperTint, 1.1) });
  for (const s of [-1, 1]) {
    c.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(s * 0.95, 0.72, 0)));
    c.cylinder(0, -0.08, 0, 0.09, 0.09, 0.16, { segments: 6, caps: false, color: shade(C.copperTint, 0.8) });
    c.pop();
  }
  return p;
}

/** Contents of the cauldron: a disc whose height/colour the stir minigame animates. */
export function kazanContents(): PartSet {
  const p = new PartSet();
  p.get("matte").cylinder(0, 0, 0, 0.8, 0.8, 0.04, { segments: 14, color: [1, 1, 1, 1] });
  return p;
}

/** Long wooden stirring paddle (keşkek kepçesi), origin at the blade end. */
export function stirPaddle(): PartSet {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.18, 0, 0.18, 0.36, 0.04, { color: hexColor("#7a5a3a") });
  w.cylinder(0, 0.34, 0, 0.03, 0.03, 2.1, { segments: 5, color: hexColor("#9a7350") });
  return p;
}

/** Lean-to (sundurma) on four posts with a single-pitch tile roof. */
export function sundurma(): PrefabDef {
  const p = new PartSet();
  const wd = p.get("darkWood");
  for (const [x, z, h] of [
    [-2.2, -1.6, 3.1],
    [2.2, -1.6, 3.1],
    [-2.2, 1.6, 2.6],
    [2.2, 1.6, 2.6],
  ])
    wd.box(x, h / 2, z, 0.16, h, 0.16, { color: C.woodDark });
  wd.box(0, 3.05, -1.6, 4.7, 0.14, 0.14, { color: C.woodDark });
  wd.box(0, 2.55, 1.6, 4.7, 0.14, 0.14, { color: C.woodDark });
  const r = p.get("roof");
  r.quad([-2.6, 3.15, -2.1], [2.6, 3.15, -2.1], [2.6, 2.55, 2.1], [-2.6, 2.55, 2.1], [0, 0, 3, 2], [0, 1, 0.15]);
  r.quad([-2.6, 3.1, -2.1], [2.6, 3.1, -2.1], [2.6, 2.5, 2.1], [-2.6, 2.5, 2.1], [0, 0, 3, 2], [0, -1, -0.15]);
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** Village granary: stone ground floor, big wooden door, tiled roof. */
export function ambar(): PrefabDef {
  const p = new PartSet();
  const w = 7;
  const d = 5.5;
  const h = 3.6;
  p.get("stone").box(0, h / 2, 0, w, h, d, { uvScale: 3, skipBottom: true, color: hexColor("#b5aa96"), jitter: 0.03 });
  hipRoof(p, w, d, h, 1.3, 0.6);
  const m = p.get("matte");
  m.box(0, 1.3, d / 2 + 0.03, 2.2, 2.6, 0.1, { color: C.woodDark });
  m.box(0, 1.3, d / 2 + 0.08, 0.06, 2.5, 0.04, { color: hexColor("#2a2420") });
  m.box(w * 0.3, 2.6, d / 2 + 0.03, 0.5, 0.4, 0.06, { color: C.glass });
  return { parts: p, cullDistance: 700, castShadows: true };
}

/** Market stall with a striped awning: "kasap" (meat hooks) or "bakkal" (jars, salt). */
export function stall(kind: "kasap" | "bakkal"): PrefabDef {
  const p = new PartSet();
  const wd = p.get("darkWood");
  for (const x of [-1.5, 1.5]) for (const z of [-0.9, 0.9]) wd.box(x, 1.2, z, 0.12, 2.4, 0.12, { color: C.woodDark });
  p.get("wood").box(0, 0.85, 0.6, 3.2, 0.12, 0.8, { uvScale: 2, color: C.wood });
  p.get("wood").box(0, 0.42, 0.95, 3.2, 0.84, 0.08, { uvScale: 2, color: C.woodDark });
  // Striped awning.
  const f = p.get("fabric");
  for (let i = 0; i < 6; i++) {
    const x0 = -1.7 + (i / 6) * 3.4;
    const x1 = -1.7 + ((i + 1) / 6) * 3.4;
    f.quad([x0, 2.5, -1.1], [x1, 2.5, -1.1], [x1, 2.1, 1.5], [x0, 2.1, 1.5], [0, 0, 1, 1], [0, 1, 0], i % 2 ? hexColor("#efe6d2") : kind === "kasap" ? C.red : hexColor("#2e5f7a"));
  }
  const m = p.get("matte");
  if (kind === "kasap") {
    m.box(0, 2.15, 0.3, 2.8, 0.05, 0.05, { color: hexColor("#3a3a3a") });
    for (const x of [-0.9, -0.2, 0.6]) {
      m.box(x, 1.75, 0.3, 0.32, 0.6, 0.2, { color: hexColor("#9a2a24"), jitter: 0.1 });
      m.box(x, 1.55, 0.3, 0.3, 0.12, 0.18, { color: hexColor("#efe0cc") });
    }
    // Chopping block (kütük).
    p.get("wood").cylinder(1.0, 0.92, 0.55, 0.3, 0.3, 0.25, { segments: 8, color: hexColor("#a07a52") });
  } else {
    for (const [x, col] of [
      [-1.1, C.clay],
      [-0.4, hexColor("#c9a060")],
      [0.4, C.clay],
    ] as [number, RGBA][])
      p.get("matte").cylinder(x, 0.91, 0.55, 0.16, 0.12, 0.34, { segments: 7, color: col });
    p.get("fabric").sphere(1.05, 1.05, 0.55, 0.28, { segments: 6, rings: 4, scaleY: 0.75, color: hexColor("#f2f0ea") });
  }
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Traditional log beehives (karakovan) on a low stone bench — Muğla is pine-honey land. */
export function beehives(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(9);
  p.get("stone").box(0, 0.2, 0, 3.4, 0.4, 0.9, { uvScale: 2, color: C.stoneDark });
  for (let i = 0; i < 4; i++) {
    const x = -1.2 + i * 0.8;
    p.get("darkWood").cylinder(x, 0.4, 0, 0.26, 0.26, 0.62, { segments: 8, color: shade(C.woodDark, rnd.range(0.9, 1.15)) });
    // Flat stone lid and the small flight entrance.
    p.get("stone").cylinder(x, 1.02, 0, 0.32, 0.3, 0.06, { segments: 8, color: hexColor("#9a9284") });
    p.get("matte").box(x, 0.55, 0.26, 0.08, 0.06, 0.02, { color: hexColor("#1a1612") });
  }
  return { parts: p, cullDistance: 220, castShadows: true };
}

/** Harvest sheaf (demet) and a haystack (tınaz). */
export function sheaf(): PrefabDef {
  const p = new PartSet();
  const f = p.get("foliage");
  f.cylinder(0, 0, 0, 0.32, 0.18, 0.9, { segments: 7, color: C.straw, jitter: 0.06 });
  f.cylinder(0, 0.9, 0, 0.18, 0.35, 0.35, { segments: 7, color: shade(C.straw, 1.1), jitter: 0.06 });
  p.get("rope").cylinder(0, 0.55, 0, 0.22, 0.22, 0.06, { segments: 7 });
  return { parts: p, cullDistance: 220, castShadows: false };
}

export function haystack(): PrefabDef {
  const p = new PartSet();
  p.get("foliage").cylinder(0, 0, 0, 2, 0.4, 3.2, { segments: 9, color: C.straw, jitter: 0.07 });
  p.get("darkWood").cylinder(0, 2.6, 0, 0.05, 0.05, 1.4, { segments: 4, color: C.woodDark });
  return { parts: p, cullDistance: 500, castShadows: true };
}

/** Low round wedding table (sofra) with a copper tray and floor cushions. */
export function sofra(): PrefabDef {
  const p = new PartSet();
  p.get("wood").cylinder(0, 0, 0, 0.45, 0.5, 0.32, { segments: 10, color: C.woodDark });
  p.get("bronze").cylinder(0, 0.32, 0, 0.9, 0.9, 0.04, { segments: 16, color: C.copper });
  p.get("bronze").cylinder(0, 0.36, 0, 0.92, 0.92, 0.03, { segments: 16, caps: false, color: shade(C.copper, 1.1) });
  const cols = [hexColor("#8e1a20"), hexColor("#2e4f6e"), hexColor("#a8761e"), hexColor("#4f6a3a")];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.get("fabric").box(Math.cos(a) * 1.45, 0.1, Math.sin(a) * 1.45, 0.62, 0.2, 0.62, { color: cols[i % cols.length] });
  }
  // Kilim under the table.
  p.get("fabric").box(0, 0.015, 0, 3.6, 0.03, 3.6, { color: hexColor("#7a1a1e") });
  p.get("fabric").box(0, 0.02, 0, 3.2, 0.03, 3.2, { color: hexColor("#b8862e") });
  p.get("fabric").box(0, 0.025, 0, 2.8, 0.03, 2.8, { color: hexColor("#8e1418") });
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** A copper bowl (sahan) of keşkek with melted butter and red pepper. */
export function keskekBowl(): PartSet {
  const p = new PartSet();
  p.get("bronze").cylinder(0, 0, 0, 0.13, 0.19, 0.09, { segments: 10, topCap: false, color: C.copper });
  p.get("matte").cylinder(0, 0.07, 0, 0.175, 0.175, 0.02, { segments: 10, color: hexColor("#efe2c4") });
  p.get("matte").cylinder(0, 0.085, 0, 0.08, 0.08, 0.01, { segments: 8, color: hexColor("#d0702a") });
  return p;
}

/** A filled bowl standing on a sofra (shown once served). */
export function servedBowl(): PrefabDef {
  return { parts: keskekBowl(), cullDistance: 120 };
}

/** Wheat sack carried on the shoulder. */
export function heldSack(): PartSet {
  const p = new PartSet();
  p.get("fabric").sphere(0, 0, 0, 0.32, { segments: 7, rings: 5, scaleY: 0.72, color: hexColor("#c4a874"), jitter: 0.06 });
  p.get("rope").cylinder(0, 0.18, 0, 0.12, 0.08, 0.1, { segments: 6 });
  return p;
}

/** Wedding flag: red cloth on a tall pole topped with an apple (düğün bayrağı). */
export function weddingFlag(): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").cylinder(0, 0, 0, 0.06, 0.04, 6.5, { segments: 6, color: C.woodDark });
  p.get("matte").sphere(0, 6.6, 0, 0.13, { segments: 7, rings: 5, color: hexColor("#c8282a") });
  const f = p.get("fabric");
  for (let i = 0; i < 5; i++) {
    const x0 = (i / 5) * 1.6;
    const x1 = ((i + 1) / 5) * 1.6;
    f.quad([x0, 5.2 - i * 0.03, 0], [x1, 5.2 - (i + 1) * 0.03, 0], [x1, 6.2 - (i + 1) * 0.05, 0], [x0, 6.2 - i * 0.05, 0], [0, 0, 1, 1], [0, 0, 1], i === 4 ? C.gold : C.red);
  }
  return { parts: p, cullDistance: 600, castShadows: true };
}

/** Small village mescit with a short stone minaret. */
export function mescit(): PrefabDef {
  const p = new PartSet();
  const w = 7;
  const d = 8;
  const h = 4.2;
  p.get("plaster").box(0, h / 2, 0, w, h, d, { uvScale: 4, skipBottom: true, color: C.whiteWarm });
  p.get("stone").box(0, 0.3, 0, w + 0.2, 0.6, d + 0.2, { uvScale: 4, skipBottom: true, color: C.stone });
  hipRoof(p, w, d, h, 1.5, 0.6);
  const m = p.get("matte");
  for (const z of [-2, 0, 2]) for (const s of [-1, 1]) m.box(s * (w / 2 + 0.02), 2.5, z, 0.06, 1.3, 0.7, { color: C.glass });
  m.box(0, 1.2, d / 2 + 0.03, 1.3, 2.4, 0.08, { color: C.woodDark });
  // Minaret.
  const s = p.get("stone");
  const mx = w / 2 + 1.2;
  const mz = -d / 2 + 1.4;
  s.box(mx, 1.5, mz, 1.8, 3, 1.8, { uvScale: 2, color: C.stone });
  s.cylinder(mx, 3, mz, 0.75, 0.68, 6.5, { segments: 10, uvScale: 2, color: hexColor("#c4baa6") });
  s.cylinder(mx, 8.2, mz, 1.0, 1.0, 0.25, { segments: 10, color: hexColor("#b3a890") });
  s.cylinder(mx, 8.45, mz, 0.6, 0.6, 1.4, { segments: 10, color: hexColor("#c4baa6") });
  p.get("iron").cylinder(mx, 9.85, mz, 0.68, 0, 2.2, { segments: 10, color: hexColor("#7d858a") });
  p.get("gold").cylinder(mx, 12, mz, 0.03, 0.03, 0.6, { segments: 4 });
  return { parts: p, cullDistance: 1200, castShadows: true };
}

/** Dry-stone field wall segment (4 m), common on Menteşe hillsides. */
export function dryStoneWall(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(17);
  const s = p.get("stone");
  for (let i = 0; i < 9; i++) {
    const x = -1.8 + i * 0.45 + rnd.range(-0.05, 0.05);
    s.box(x, 0.3, rnd.range(-0.05, 0.05), rnd.range(0.4, 0.55), rnd.range(0.5, 0.7), 0.6, { color: shade(C.stone, rnd.range(0.75, 1.05)), jitter: 0.12 });
    s.box(x + 0.2, 0.8, 0, rnd.range(0.35, 0.5), rnd.range(0.3, 0.42), 0.5, { color: shade(C.stone, rnd.range(0.75, 1.05)), jitter: 0.12 });
  }
  return { parts: p, cullDistance: 260, castShadows: true };
}

/** Clay water jar (testi) and storage jar (küp). */
export function clayJar(big: boolean): PrefabDef {
  const p = new PartSet();
  const c = p.get("matte");
  const col = mixColor(C.clay, hexColor("#c9864a"), big ? 0.3 : 0);
  if (big) {
    c.cylinder(0, 0, 0, 0.3, 0.55, 0.6, { segments: 9, color: col, topCap: false });
    c.cylinder(0, 0.6, 0, 0.55, 0.28, 0.5, { segments: 9, color: col, caps: false });
    c.cylinder(0, 1.1, 0, 0.28, 0.32, 0.1, { segments: 9, color: shade(col, 0.9) });
  } else {
    c.cylinder(0, 0, 0, 0.12, 0.2, 0.28, { segments: 8, color: col, topCap: false });
    c.cylinder(0, 0.28, 0, 0.2, 0.06, 0.22, { segments: 8, color: col, caps: false });
    c.cylinder(0, 0.5, 0, 0.06, 0.08, 0.08, { segments: 8, color: col });
  }
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Bundle of dry pine branches (kuru dal) — forest collectible. */
export function branchBundle(): PartSet {
  const p = new PartSet();
  const rnd = new Random(31);
  const w = p.get("wood");
  for (let i = 0; i < 6; i++) {
    w.push(Matrix.RotationY(rnd.range(-0.4, 0.4)).multiply(Matrix.Translation(0, 0.08 + i * 0.03, rnd.range(-0.15, 0.15))));
    w.cylinderX(-0.6, 0, 0, 1.2 + rnd.range(-0.2, 0.2), 0.045, 0.03, { segments: 4, color: shade(hexColor("#8a6a48"), rnd.range(0.8, 1.15)) });
    w.pop();
  }
  p.get("rope").cylinder(0, 0.0, 0, 0.16, 0.16, 0.28, { segments: 6, caps: false });
  return p;
}

/** Resin-soaked pine kindling (çıra): glowing amber chunk. */
export function ciraChunk(): PartSet {
  const p = new PartSet();
  p.get("wood").box(0, 0.12, 0, 0.5, 0.18, 0.2, { color: hexColor("#c08a3a"), jitter: 0.1 });
  p.get("fire").box(0.05, 0.22, 0, 0.3, 0.04, 0.12, {});
  return p;
}
