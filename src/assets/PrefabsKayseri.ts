import { Matrix } from "@babylonjs/core";
import { Random } from "../utils/random";
import { GeoBuilder, hexColor, mixColor, shade, type RGBA } from "./GeoBuilder";
import { PartSet, type PrefabDef } from "./Prefabs";

/**
 * Props of a Kayseri market around 1390: the yağlama/mantı shop (counter, sac griddles on a
 * stone hearth, dough table), the trades of the arasta (copper, cloth, spices, pastırma,
 * carpets, pottery, saddles, scales), the caravanserai courtyard (şadırvan, camels, bales)
 * and Kadı Burhaneddin's divan. Origin on the floor, +z is the front.
 */

const C = {
  wood: hexColor("#8a5e3a"),
  woodDark: hexColor("#4e3420"),
  woodLight: hexColor("#b08458"),
  copper: hexColor("#d07a48"),
  brass: hexColor("#c8a050"),
  iron: hexColor("#2a2826"),
  stone: hexColor("#6e655c"),
  stoneLight: hexColor("#9a8c7c"),
  tuff: hexColor("#a87e6a"),
  dough: hexColor("#efe2c4"),
  flour: hexColor("#f4efe2"),
  meat: hexColor("#7a2a20"),
  yogurt: hexColor("#f6f2ea"),
  butter: hexColor("#c8501e"),
  burlap: hexColor("#b49a6a"),
  clay: hexColor("#b0663e"),
  red: hexColor("#9e1a1f"),
  blue: hexColor("#2a4a6e"),
  gold: hexColor("#d6a540"),
  green: hexColor("#3a5a3a"),
  camel: hexColor("#b8946a"),
};

// ------------------------------------------------------------------------ our shop
/** Shop counter (tezgâh): solid wooden front, worn top. `len` along x. */
export function tezgah(len: number): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.47, 0, len, 0.94, 0.7, { uvScale: 1.6, color: C.woodDark });
  w.box(0, 0.96, 0.02, len + 0.08, 0.06, 0.8, { uvScale: 1.4, color: C.wood });
  // Panels on the customer side.
  const n = Math.max(2, Math.round(len / 0.9));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    p.get("darkWood").box(x, 0.47, 0.36, len / n - 0.12, 0.7, 0.03, { color: shade(C.wood, 0.85) });
  }
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Long stone hearth bench (ocak) with an ember channel; the sac griddles sit on it. */
export function longOcak(len: number): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  s.box(0, 0.3, 0, len, 0.6, 1.0, { uvScale: 1.6, color: C.stoneLight, jitter: 0.05 });
  s.box(0, 0.63, -0.42, len, 0.06, 0.16, { color: shade(C.stoneLight, 0.9) });
  s.box(0, 0.63, 0.42, len, 0.06, 0.16, { color: shade(C.stoneLight, 0.9) });
  // Soot-black channel and ember bed.
  p.get("matte").box(0, 0.605, 0, len - 0.1, 0.02, 0.68, { color: hexColor("#1c1612") });
  // Glowing embers: a broken row of coals rather than one bright strip.
  const rnd = new Random(77);
  for (let x = -len / 2 + 0.25; x < len / 2 - 0.2; x += 0.22) p.get("fire").box(x + rnd.range(-0.04, 0.04), 0.615, rnd.range(-0.1, 0.1), rnd.range(0.1, 0.18), 0.03, rnd.range(0.12, 0.24), { jitter: 0.2 });
  // Plastered smoke hood above, rising to the ceiling.
  const h = p.get("plaster");
  h.box(0, 2.15, -0.25, len + 0.3, 0.12, 1.05, { color: hexColor("#d8ccb8") });
  h.box(0, 2.85, -0.38, len * 0.7, 1.3, 0.75, { topScale: 0.6, color: hexColor("#cfc2ac") });
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Domed iron griddle (sac) on three legs. Origin on top of the hearth. */
export function sacGriddle(): PrefabDef {
  const p = new PartSet();
  const i = p.get("iron");
  i.cylinder(0, 0.16, 0, 0.44, 0.3, 0.07, { segments: 16, color: C.iron });
  i.cylinder(0, 0.155, 0, 0.44, 0.44, 0.01, { segments: 16, caps: false, color: shade(C.iron, 0.8) });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    i.box(Math.cos(a) * 0.32, 0.08, Math.sin(a) * 0.32, 0.04, 0.16, 0.04, { color: C.iron });
  }
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** A yufka disc (its material colour is driven by the sac minigame). */
export function yufkaDisc(): PartSet {
  const p = new PartSet();
  p.get("matte").cylinder(0, 0, 0, 0.36, 0.34, 0.012, { segments: 14, color: [1, 1, 1, 1] });
  return p;
}

/** Dough table: big wooden board, rolled-out dough sheet, oklava and a flour bowl. */
export function doughTable(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.78, 0, 1.9, 0.06, 1.0, { uvScale: 1.5, color: C.woodLight });
  for (const x of [-0.85, 0.85]) for (const z of [-0.4, 0.4]) w.box(x, 0.39, z, 0.07, 0.78, 0.07, { color: C.woodDark });
  w.box(0, 0.25, 0, 1.75, 0.04, 0.85, { color: C.woodDark });
  // Oklava (long thin rolling pin) along the back edge.
  w.cylinderX(-0.85, 0.84, -0.43, 1.1, 0.018, 0.018, { segments: 6, color: hexColor("#c49a6a") });
  return { parts: p, cullDistance: 140, castShadows: true };
}

/** Rolled dough sheet on the board (separate so it can be hidden once cut). */
export function doughSheet(): PartSet {
  const p = new PartSet();
  // Slightly domed, uneven edges like hand-rolled dough.
  p.get("matte").box(0, 0.006, 0, 0.98, 0.012, 0.6, { color: hexColor("#ecd9b0"), topScale: 0.98 });
  p.get("matte").box(0.02, 0.013, -0.01, 0.9, 0.004, 0.52, { color: hexColor("#f2e4c0") });
  return p;
}

/** A row of four folded mantı (the minigame adds rows to the tray one by one). */
export function mantiRow(): PartSet {
  const p = new PartSet();
  const m = p.get("matte");
  for (let i = 0; i < 4; i++) {
    const x = -0.075 + i * 0.05;
    m.box(x, 0.008, 0, 0.032, 0.016, 0.032, { topScale: 0.45, color: C.dough });
    m.box(x, 0.02, 0, 0.012, 0.01, 0.012, { color: shade(C.dough, 0.92) });
  }
  return p;
}

/** Wooden tray (tepsi) the finished mantı are laid on. */
export function mantiTray(): PrefabDef {
  const p = new PartSet();
  p.get("wood").box(0, 0.015, 0, 0.62, 0.03, 0.42, { color: C.woodLight });
  p.get("matte").box(0, 0.032, 0, 0.56, 0.004, 0.36, { color: hexColor("#d8c49a") });
  return { parts: p, cullDistance: 80, castShadows: false };
}

/** Copper sahan of mantı with garlic yoğurt, red-pepper butter and dried mint. */
export function mantiSahan(): PartSet {
  const p = new PartSet();
  p.get("bronze").cylinder(0, 0, 0, 0.12, 0.17, 0.05, { segments: 12, topCap: false, color: C.copper });
  p.get("matte").cylinder(0, 0.04, 0, 0.155, 0.155, 0.015, { segments: 12, color: C.yogurt });
  p.get("matte").cylinder(0.02, 0.05, -0.01, 0.07, 0.06, 0.008, { segments: 8, color: C.butter });
  return p;
}

/** Yağlama: stacked yufka layers with spiced minced meat between, topped with yoğurt, cut in wedges. */
export function yaglamaTray(served = true): PartSet {
  const p = new PartSet();
  p.get("bronze").cylinder(0, 0, 0, 0.36, 0.38, 0.03, { segments: 18, color: C.copper });
  p.get("bronze").cylinder(0, 0.03, 0, 0.38, 0.38, 0.02, { segments: 18, caps: false, color: shade(C.copper, 1.1) });
  const m = p.get("matte");
  for (let i = 0; i < 5; i++) {
    m.cylinder(0, 0.035 + i * 0.022, 0, 0.32, 0.32, 0.01, { segments: 18, color: hexColor("#e2c48a") });
    m.cylinder(0, 0.045 + i * 0.022, 0, 0.31, 0.31, 0.011, { segments: 18, color: C.meat });
  }
  if (served) {
    m.cylinder(0, 0.15, 0, 0.18, 0.12, 0.02, { segments: 12, color: C.yogurt });
    // Cut lines (wedges).
    // Cut lines (wedges) pressed into the top layer.
    for (let k = 0; k < 4; k++) {
      m.push(Matrix.RotationY((k / 4) * Math.PI));
      m.box(0, 0.148, 0, 0.6, 0.006, 0.008, { color: hexColor("#6a2a1a") });
      m.pop();
    }
  }
  return p;
}

export function yaglamaDisplay(): PrefabDef {
  return { parts: yaglamaTray(true), cullDistance: 90, castShadows: false };
}

export function mantiDisplay(): PrefabDef {
  return { parts: mantiSahan(), cullDistance: 90, castShadows: false };
}

/** The yağlama tray carried with both hands (first person). */
export function heldTray(): PartSet {
  return yaglamaTray(true);
}

/** Minced meat (kıyma) wrapped in a cloth on a wooden board. */
export function heldMeat(): PartSet {
  const p = new PartSet();
  p.get("wood").box(0, 0, 0, 0.42, 0.03, 0.3, { color: C.woodLight });
  p.get("matte").sphere(0, 0.07, 0, 0.14, { segments: 7, rings: 4, scaleY: 0.5, color: C.meat, jitter: 0.08 });
  p.get("fabric").box(0.05, 0.05, 0.08, 0.3, 0.02, 0.2, { color: hexColor("#efe6d2") });
  return p;
}

/** Hanging balance (terazi): post, beam and two copper pans. */
export function terazi(): PrefabDef {
  return { parts: teraziParts(), cullDistance: 100, castShadows: true };
}

export function teraziParts(): PartSet {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 0.02, 0, 0.32, 0.04, 0.2, { color: C.woodDark });
  w.cylinder(0, 0.04, 0, 0.018, 0.018, 0.62, { segments: 6, color: C.woodDark });
  const b = p.get("bronze");
  b.box(0, 0.66, 0, 0.62, 0.018, 0.018, { color: C.brass });
  b.box(0, 0.72, 0, 0.012, 0.1, 0.012, { color: C.brass });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      p.get("iron").push(Matrix.RotationZ(Math.cos(a) * 0.18).multiply(Matrix.RotationX(Math.sin(a) * 0.18)).multiply(Matrix.Translation(s * 0.3, 0.52, 0)));
      p.get("iron").box(0, 0, 0, 0.004, 0.27, 0.004, { color: C.iron });
      p.get("iron").pop();
    }
    b.cylinder(s * 0.3, 0.37, 0, 0.1, 0.12, 0.03, { segments: 10, color: C.copper });
  }
  // Stack of iron weights.
  for (let k = 0; k < 3; k++) p.get("iron").cylinder(0.12, 0.04 + k * 0.03, 0.06, 0.03 - k * 0.006, 0.03 - k * 0.006, 0.03, { segments: 8, color: C.iron });
  return p;
}

/** Big public steelyard of the kapan: tripod, beam with sliding weight, hanging hook. */
export function kapanScale(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    w.push(Matrix.RotationZ(Math.cos(a) * 0.32).multiply(Matrix.RotationX(Math.sin(a) * 0.32)).multiply(Matrix.Translation(Math.sin(a) * -0.55, 1.25, Math.cos(a) * 0.55)));
    w.box(0, 0, 0, 0.1, 2.6, 0.1, { color: C.woodDark });
    w.pop();
  }
  const i = p.get("iron");
  i.box(0, 2.35, 0, 0.03, 0.3, 0.03, { color: C.iron });
  i.box(0.3, 2.18, 0, 1.4, 0.05, 0.05, { color: C.iron });
  i.cylinder(0.75, 1.95, 0, 0.09, 0.07, 0.2, { segments: 8, color: C.iron });
  i.box(-0.32, 1.7, 0, 0.02, 0.9, 0.02, { color: C.iron });
  // A grain sack on the hook and stone weights around.
  p.get("fabric").sphere(-0.32, 1.0, 0, 0.3, { segments: 7, rings: 5, scaleY: 1.2, color: C.burlap, jitter: 0.05 });
  for (const [x, z, r] of [
    [0.6, 0.5, 0.14],
    [0.85, 0.35, 0.1],
    [0.7, 0.75, 0.08],
  ])
    p.get("stone").cylinder(x, 0, z, r, r * 0.9, r * 1.2, { segments: 8, color: hexColor("#4a4440") });
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Carried balance (first person). */
export function heldScale(): PartSet {
  return teraziParts();
}

// --------------------------------------------------------------- arasta trades
/** Wall shelf with copper: sahans, cauldrons, ibrik and trays — the coppersmith's stock. */
export function copperShelf(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 1.1, -0.2, 2.6, 2.2, 0.04, { color: C.woodDark });
  for (const s of [-1, 1]) w.box(s * 1.28, 1.1, 0, 0.05, 2.2, 0.42, { color: C.woodDark });
  const b = p.get("bronze");
  const rnd = new Random(31);
  for (let level = 0; level < 3; level++) {
    const y = 0.35 + level * 0.65;
    w.box(0, y, 0, 2.5, 0.04, 0.4, { color: C.wood });
    let x = -1.1;
    while (x < 1.05) {
      const kind = rnd.int(0, 2);
      const col = shade(C.copper, rnd.range(0.85, 1.15));
      if (kind === 0) {
        b.cylinder(x + 0.14, y + 0.02, 0, 0.12, 0.16, 0.12, { segments: 10, color: col });
        x += 0.36;
      } else if (kind === 1) {
        // Ibrik (ewer).
        b.cylinder(x + 0.1, y + 0.02, 0, 0.08, 0.1, 0.16, { segments: 8, color: col });
        b.cylinder(x + 0.1, y + 0.18, 0, 0.1, 0.03, 0.12, { segments: 8, color: col });
        b.cylinderX(x + 0.16, y + 0.12, 0, 0.12, 0.012, 0.008, { segments: 4, color: col });
        x += 0.3;
      } else {
        // Plate standing against the back.
        b.push(Matrix.RotationX(-1.3).multiply(Matrix.Translation(x + 0.2, y + 0.2, -0.12)));
        b.cylinder(0, 0, 0, 0.19, 0.19, 0.02, { segments: 14, color: col });
        b.pop();
        x += 0.42;
      }
    }
  }
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Coppersmith's floor display: cauldrons stacked by size, a big tray and an anvil. */
export function copperFloor(): PrefabDef {
  const p = new PartSet();
  const b = p.get("bronze");
  b.cylinder(0, 0, 0, 0.42, 0.52, 0.5, { segments: 12, topCap: false, color: C.copper });
  b.cylinder(0, 0.5, 0, 0.3, 0.38, 0.36, { segments: 12, topCap: false, color: shade(C.copper, 1.1) });
  b.cylinder(0.8, 0, 0.1, 0.28, 0.34, 0.34, { segments: 12, topCap: false, color: shade(C.copper, 0.9) });
  b.push(Matrix.RotationX(-1.2).multiply(Matrix.Translation(-0.8, 0.5, -0.25)));
  b.cylinder(0, 0, 0, 0.5, 0.5, 0.03, { segments: 18, color: shade(C.copper, 1.05) });
  b.pop();
  p.get("iron").box(0.9, 0.25, -0.6, 0.25, 0.5, 0.25, { topScale: 0.7, color: C.iron });
  p.get("iron").box(0.9, 0.55, -0.6, 0.5, 0.12, 0.2, { color: C.iron });
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Bolts of cloth on shelves and a few unrolled on the bench. */
export function fabricBolts(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 1.1, -0.25, 2.6, 2.2, 0.04, { color: C.woodDark });
  const cols = ["#8e1a20", "#2a4a6e", "#c49a2a", "#3f6a4a", "#efe6d2", "#6a3a5a", "#b0482a", "#2e3a5a"].map((c) => hexColor(c));
  const rnd = new Random(8);
  for (let level = 0; level < 3; level++) {
    const y = 0.45 + level * 0.6;
    w.box(0, y - 0.03, -0.05, 2.5, 0.04, 0.42, { color: C.wood });
    // Bolts lie front-to-back, their round ends facing the street.
    const f = p.get("fabric");
    for (let i = 0; i < 9; i++) {
      f.push(Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(-1.08 + i * 0.27, y + 0.12, -0.24)));
      f.cylinder(0, 0, 0, 0.12, 0.12, 0.4, { segments: 7, color: rnd.pick(cols) });
      f.pop();
    }
  }
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Open spice sacks with coloured mounds (pul biber, kimyon, sumak, zerdeçal). */
export function spiceSacks(): PrefabDef {
  const p = new PartSet();
  const cols = ["#b0281a", "#8a6a3a", "#6a1a2a", "#d8a020", "#5a4a2a", "#c4581a"].map((c) => hexColor(c));
  for (let i = 0; i < 6; i++) {
    const x = (i % 3) * 0.62 - 0.62;
    const z = Math.floor(i / 3) * 0.6 - 0.3;
    p.get("fabric").cylinder(x, 0, z, 0.26, 0.24, 0.5, { segments: 9, topCap: false, color: C.burlap });
    p.get("fabric").cylinder(x, 0.5, z, 0.24, 0.3, 0.08, { segments: 9, caps: false, color: shade(C.burlap, 1.1) });
    p.get("matte").cylinder(x, 0.44, z, 0.24, 0.02, 0.16, { segments: 9, color: cols[i] });
  }
  // Brass scoop and a small balance on a stool.
  p.get("bronze").box(0.9, 0.52, 0.2, 0.08, 0.03, 0.2, { color: C.brass });
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Pastırma slabs and sucuk loops hanging from a rail. */
export function pastirmaRack(): PrefabDef {
  const p = new PartSet();
  const i = p.get("iron");
  i.box(0, 2.3, 0, 2.6, 0.04, 0.04, { color: C.iron });
  const rnd = new Random(5);
  for (let k = 0; k < 8; k++) {
    const x = -1.15 + k * 0.33;
    i.box(x, 2.2, 0, 0.01, 0.2, 0.01, { color: C.iron });
    if (k % 3 === 2) {
      // Sucuk: a horseshoe of dark sausage.
      for (const s of [-1, 1]) p.get("matte").box(x + s * 0.05, 1.85, 0, 0.05, 0.5, 0.05, { color: hexColor("#5a1a14") });
      p.get("matte").box(x, 1.6, 0, 0.15, 0.05, 0.05, { color: hexColor("#5a1a14") });
    } else {
      // Pastırma: flat slab with a red çemen coating.
      p.get("matte").box(x, 1.75, 0, 0.22, rnd.range(0.55, 0.75), 0.06, { topScale: 0.85, color: hexColor("#9a3a1a"), jitter: 0.08 });
    }
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Kilims hung on the back wall and rolled carpets leaning against it. */
export function kilimWall(): PrefabDef {
  const p = new PartSet();
  const pal = [
    ["#8e1418", "#c49a2a", "#2a3a5a"],
    ["#6a1a2a", "#e8dcc0", "#2a5a4a"],
    ["#b0482a", "#3a2a1a", "#d8b060"],
  ].map((row) => row.map((c) => hexColor(c)));
  for (let k = 0; k < 3; k++) {
    const x = -1.0 + k * 1.0;
    const [a, b, c] = pal[k];
    const f = p.get("fabric");
    f.box(x, 1.75, -0.18, 0.9, 1.6, 0.02, { color: a });
    for (let s = 0; s < 5; s++) f.box(x, 1.1 + s * 0.32, -0.165, 0.78, 0.08, 0.02, { color: s % 2 ? b : c });
    // Central göz (lozenge) motif.
    f.push(Matrix.RotationZ(Math.PI / 4).multiply(Matrix.Translation(x, 1.75, -0.16)));
    f.box(0, 0, 0, 0.32, 0.32, 0.02, { color: b });
    f.box(0, 0, 0.003, 0.16, 0.16, 0.02, { color: c });
    f.pop();
  }
  const rnd = new Random(3);
  for (let k = 0; k < 4; k++) {
    p.get("fabric").push(Matrix.RotationZ(rnd.range(-0.25, 0.25)).multiply(Matrix.Translation(-1.0 + k * 0.6, 0, 0.2)));
    p.get("fabric").cylinder(0, 0, 0, 0.13, 0.13, 1.5, { segments: 8, color: rnd.pick(pal.flat()) });
    p.get("fabric").pop();
  }
  return { parts: p, cullDistance: 160, castShadows: true };
}

/** Pottery: big küp jars, testi (water jugs) and bowls. */
export function pottery(): PrefabDef {
  const p = new PartSet();
  const m = p.get("matte");
  const rnd = new Random(19);
  for (let k = 0; k < 7; k++) {
    const x = rnd.range(-1.1, 1.1);
    const z = rnd.range(-0.5, 0.5);
    const big = k < 2;
    const col = shade(C.clay, rnd.range(0.85, 1.1));
    if (big) {
      m.cylinder(x, 0, z, 0.2, 0.36, 0.5, { segments: 10, color: col });
      m.cylinder(x, 0.5, z, 0.36, 0.18, 0.4, { segments: 10, color: col });
    } else {
      m.cylinder(x, 0, z, 0.1, 0.16, 0.2, { segments: 9, color: col });
      m.cylinder(x, 0.2, z, 0.16, 0.05, 0.2, { segments: 9, color: col });
      m.cylinder(x, 0.4, z, 0.04, 0.05, 0.08, { segments: 6, color: col });
    }
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Saddles and harnesses on a wooden rack (saraç). */
export function saddleRack(): PrefabDef {
  const p = new PartSet();
  const w = p.get("darkWood");
  w.box(0, 0.9, 0, 2.4, 0.1, 0.1, { color: C.woodDark });
  for (const x of [-1.1, 1.1]) w.box(x, 0.45, 0, 0.1, 0.9, 0.4, { color: C.woodDark });
  for (const x of [-0.6, 0.3]) {
    p.get("matte").box(x, 1.02, 0, 0.55, 0.16, 0.6, { topScale: 0.8, color: hexColor("#6a3a1e") });
    p.get("fabric").box(x, 0.85, 0, 0.6, 0.3, 0.66, { color: x < 0 ? C.red : C.blue });
  }
  p.get("rope").box(0.9, 1.3, -0.2, 0.05, 0.8, 0.05, {});
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Jeweller's small counter with boxes, a fine balance and a little brazier. */
export function jewelerCounter(): PrefabDef {
  const p = new PartSet();
  const w = p.get("wood");
  w.box(0, 0.4, 0, 1.6, 0.8, 0.6, { uvScale: 1.5, color: C.woodDark });
  p.get("fabric").box(0, 0.81, 0, 1.5, 0.02, 0.55, { color: hexColor("#2e2a4a") });
  for (let k = 0; k < 4; k++) p.get("gold").box(-0.5 + k * 0.25, 0.84, 0.05, 0.12, 0.04, 0.12, {});
  p.get("bronze").cylinder(0.5, 0.82, 0, 0.12, 0.1, 0.12, { segments: 8, color: C.brass });
  p.get("fire").cylinder(0.5, 0.94, 0, 0.06, 0.04, 0.02, { segments: 6 });
  return { parts: p, cullDistance: 120, castShadows: true };
}

/** Sherbet seller: tall copper jugs (güğüm), cups and a low bench. */
export function sherbetStand(): PrefabDef {
  const p = new PartSet();
  const b = p.get("bronze");
  for (const [x, s] of [
    [-0.6, 1],
    [0, 1.15],
    [0.6, 0.9],
  ]) {
    b.cylinder(x, 0, 0, 0.18 * s, 0.24 * s, 0.4 * s, { segments: 10, color: C.copper });
    b.cylinder(x, 0.4 * s, 0, 0.24 * s, 0.07 * s, 0.3 * s, { segments: 10, color: C.copper });
    b.cylinder(x, 0.7 * s, 0, 0.07 * s, 0.1 * s, 0.12 * s, { segments: 8, color: shade(C.copper, 1.1) });
  }
  p.get("wood").box(0, 0.25, 0.6, 1.8, 0.06, 0.4, { color: C.wood });
  for (let k = 0; k < 4; k++) p.get("matte").cylinder(-0.5 + k * 0.33, 0.28, 0.6, 0.04, 0.05, 0.08, { segments: 6, color: hexColor("#e8e0d0") });
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Butcher's block and hooks (the kıyma for the shop is bought here). */
export function kasapCounter(): PrefabDef {
  const p = new PartSet();
  p.get("wood").cylinder(0, 0, 0, 0.42, 0.45, 0.85, { segments: 10, color: hexColor("#a07a52") });
  p.get("matte").cylinder(0, 0.85, 0, 0.42, 0.42, 0.02, { segments: 10, color: hexColor("#b8906a") });
  p.get("iron").box(0.1, 0.88, 0.1, 0.3, 0.02, 0.1, { color: hexColor("#9a9a9a") });
  const i = p.get("iron");
  i.box(0, 2.25, -0.3, 2.2, 0.04, 0.04, { color: C.iron });
  for (const x of [-0.8, -0.2, 0.5]) {
    i.box(x, 2.1, -0.3, 0.01, 0.25, 0.01, { color: C.iron });
    p.get("matte").box(x, 1.7, -0.3, 0.32, 0.6, 0.2, { color: hexColor("#9a2a24"), jitter: 0.1 });
    p.get("matte").box(x, 1.5, -0.3, 0.3, 0.12, 0.18, { color: hexColor("#efe0cc") });
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

/** Wooden shop sign board over the bay (plain, painted). */
export function shopSign(color: string): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").box(0, 0, 0, 1.6, 0.36, 0.05, { color: C.woodDark });
  p.get("matte").box(0, 0, 0.03, 1.45, 0.24, 0.01, { color: hexColor(color) });
  return { parts: p, cullDistance: 120, castShadows: false };
}

/** Bronze oil lamp (kandil) hanging from three chains; flame added separately. */
export function kandil(chain: number): PartSet {
  const p = new PartSet();
  const b = p.get("bronze");
  b.cylinder(0, 0, 0, 0.04, 0.16, 0.08, { segments: 10, color: C.brass });
  b.cylinder(0, 0.08, 0, 0.16, 0.14, 0.03, { segments: 10, caps: false, color: shade(C.brass, 1.1) });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    p.get("iron").push(Matrix.RotationZ(Math.cos(a) * -0.18).multiply(Matrix.RotationX(Math.sin(a) * 0.18)).multiply(Matrix.Translation(Math.cos(a) * 0.07, 0.3, Math.sin(a) * 0.07)));
    p.get("iron").box(0, 0, 0, 0.008, 0.42, 0.008, { color: C.iron });
    p.get("iron").pop();
  }
  p.get("iron").cylinder(0, 0.5, 0, 0.01, 0.01, chain, { segments: 4, color: C.iron });
  return p;
}

export function kandilFlame(): PartSet {
  const p = new PartSet();
  for (const [x, z] of [
    [0.09, 0],
    [-0.045, 0.078],
    [-0.045, -0.078],
  ])
    p.get("fire").cylinder(x, 0.1, z, 0.022, 0, 0.09, { segments: 5, caps: false });
  return p;
}

// ------------------------------------------------------------------- han courtyard
/** Octagonal şadırvan: basin, central column with spouts, and a small dome on eight posts. */
export function sadirvan(): PrefabDef {
  const p = new PartSet();
  const s = p.get("stone");
  const marble = hexColor("#d8d2c4");
  s.cylinder(0, 0, 0, 2.2, 2.2, 0.75, { segments: 8, color: C.stoneLight, uvScale: 2 });
  p.get("matte").cylinder(0, 0.74, 0, 1.95, 1.95, 0.02, { segments: 8, color: hexColor("#3d6a78") });
  s.cylinder(0, 0.75, 0, 2.2, 2.05, 0.06, { segments: 8, caps: false, color: marble });
  s.cylinder(0, 0.76, 0, 0.32, 0.26, 1.1, { segments: 8, color: marble });
  s.cylinder(0, 1.86, 0, 0.42, 0.42, 0.12, { segments: 8, color: marble });
  // Brass spouts all around the column.
  const br = p.get("bronze");
  for (let k = 0; k < 8; k++) {
    br.push(Matrix.RotationY((k / 8) * Math.PI * 2));
    br.cylinderX(0.25, 1.3, 0, 0.3, 0.03, 0.025, { segments: 5 });
    br.pop();
  }
  // Eight slender posts and a lead-grey dome.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    s.cylinder(Math.cos(a) * 2.35, 0, Math.sin(a) * 2.35, 0.14, 0.12, 3.6, { segments: 6, color: C.stone });
  }
  s.cylinder(0, 3.6, 0, 2.7, 2.7, 0.3, { segments: 8, color: C.stone });
  // Lead-covered conical roof (külah) with a painted wooden ceiling underneath.
  p.get("iron").cylinder(0, 3.9, 0, 2.9, 0.12, 1.6, { segments: 8, bottomCap: false, color: hexColor("#7d8288") });
  p.get("wood").cylinder(0, 3.58, 0, 2.6, 2.6, 0.02, { segments: 8, color: hexColor("#6a3a22") });
  p.get("gold").cylinder(0, 5.45, 0, 0.05, 0.02, 0.5, { segments: 5 });
  return { parts: p, cullDistance: 500, castShadows: true };
}

/** Kadı's divan: raised seki with kilims, floor cushions, bolsters and a low rahle. */
export function divan(width: number): PrefabDef {
  const p = new PartSet();
  const h = 0.55;
  p.get("stone").box(0, h / 2, 0, width, h, 3.2, { uvScale: 2, color: C.stoneLight });
  const f = p.get("fabric");
  f.box(0, h + 0.01, 0, width - 0.4, 0.02, 2.9, { color: hexColor("#7a1218") });
  f.box(0, h + 0.02, 0, width - 0.9, 0.02, 2.4, { color: hexColor("#b8862e") });
  f.box(0, h + 0.03, 0, width - 1.2, 0.02, 2.1, { color: hexColor("#8e1418") });
  // Back cushions along the wall and the seat of honour (minder) in the middle.
  for (let k = 0; k < 5; k++) {
    const x = -width / 2 + 0.9 + k * ((width - 1.8) / 4);
    f.box(x, h + 0.35, -1.3, 0.9, 0.55, 0.28, { color: k === 2 ? hexColor("#2e5a3a") : hexColor("#6a1a24") });
    f.box(x, h + 0.1, -0.95, 0.9, 0.16, 0.7, { color: k === 2 ? hexColor("#3a6a46") : hexColor("#7a2a2a") });
  }
  // Rahle (book rest) with an open defter.
  const w = p.get("darkWood");
  w.box(1.2, h + 0.18, -0.2, 0.5, 0.3, 0.35, { color: C.woodDark });
  p.get("matte").box(1.2, h + 0.35, -0.2, 0.42, 0.01, 0.3, { color: hexColor("#ece2c8") });
  // Steps in front.
  p.get("stone").box(0, 0.14, 1.8, 2.2, 0.28, 0.45, { uvScale: 2, color: C.stoneLight });
  return { parts: p, cullDistance: 400, castShadows: true };
}

/** Kneeling (çöken) camel, optionally with its load. */
export function camel(loaded: boolean): PrefabDef {
  const p = new PartSet();
  const m = p.get("matte");
  const c = C.camel;
  // Folded legs, body and hump.
  m.box(0, 0.2, 0, 0.9, 0.4, 1.7, { topScale: 0.9, color: shade(c, 0.85) });
  m.sphere(0, 0.75, 0, 0.62, { segments: 9, rings: 6, scaleY: 0.62, color: c, jitter: 0.04 });
  m.box(0, 0.55, 0.05, 1.0, 0.5, 1.6, { topScale: 0.85, color: c });
  m.sphere(0, 1.15, -0.05, 0.36, { segments: 8, rings: 5, scaleY: 0.9, color: shade(c, 1.05) });
  // Neck curving up, head.
  m.push(Matrix.RotationX(-0.55).multiply(Matrix.Translation(0, 0.9, 0.95)));
  m.box(0, 0.25, 0, 0.24, 0.8, 0.28, { topScale: 0.8, color: c });
  m.pop();
  m.box(0, 1.42, 1.38, 0.24, 0.24, 0.5, { topScale: 0.85, color: shade(c, 1.05) });
  m.box(0, 1.36, 1.66, 0.18, 0.16, 0.12, { color: shade(c, 0.8) });
  m.box(-0.1, 1.58, 1.24, 0.05, 0.08, 0.05, { color: shade(c, 0.8) });
  m.box(0.1, 1.58, 1.24, 0.05, 0.08, 0.05, { color: shade(c, 0.8) });
  // Tail.
  m.box(0, 0.6, -0.86, 0.06, 0.4, 0.06, { color: shade(c, 0.7) });
  if (loaded) {
    // Saddle blanket and two bales.
    p.get("fabric").box(0, 1.2, -0.05, 1.3, 0.12, 0.9, { color: hexColor("#8e1418") });
    for (const s of [-1, 1]) {
      p.get("fabric").box(s * 0.75, 0.95, -0.05, 0.42, 0.7, 0.8, { color: C.burlap, jitter: 0.05 });
      p.get("rope").box(s * 0.75, 0.95, -0.05, 0.44, 0.06, 0.82, {});
    }
  }
  return { parts: p, cullDistance: 300, castShadows: true };
}

/** Caravan bales (denk) roped and stacked. */
export function bales(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(14);
  const cols = [C.burlap, hexColor("#9a7a5a"), hexColor("#c4b08a")];
  for (let k = 0; k < 5; k++) {
    const x = (k % 3) * 0.8 - 0.8;
    const y = k < 3 ? 0 : 0.55;
    const xx = k < 3 ? x : x + 0.4;
    p.get("fabric").box(xx, y + 0.27, 0, 0.75, 0.55, 0.6, { color: rnd.pick(cols), jitter: 0.05 });
    p.get("rope").box(xx, y + 0.27, 0, 0.77, 0.05, 0.62, {});
    p.get("rope").box(xx, y + 0.27, 0, 0.05, 0.57, 0.62, {});
  }
  return { parts: p, cullDistance: 250, castShadows: true };
}

/** Flour sacks piled by the han storeroom (pickup point). */
export function flourSacks(): PrefabDef {
  const p = new PartSet();
  const rnd = new Random(6);
  for (let k = 0; k < 6; k++) {
    const x = (k % 3) * 0.55 - 0.55;
    const y = k < 3 ? 0.28 : 0.68;
    p.get("fabric").sphere(x + (k >= 3 ? 0.27 : 0), y, rnd.range(-0.08, 0.08), 0.34, { segments: 7, rings: 5, scaleY: 0.75, color: shade(hexColor("#e2d8c2"), rnd.range(0.9, 1.05)), jitter: 0.05 });
  }
  return { parts: p, cullDistance: 150, castShadows: true };
}

export function heldFlourSack(): PartSet {
  const p = new PartSet();
  p.get("fabric").sphere(0, 0, 0, 0.3, { segments: 7, rings: 5, scaleY: 0.75, color: hexColor("#e2d8c2"), jitter: 0.05 });
  p.get("rope").cylinder(0, 0.17, 0, 0.1, 0.07, 0.1, { segments: 6 });
  return p;
}

/** Banner of the Kadı's retinue: a crimson standard with a gold crescent finial. */
export function sancak(): PrefabDef {
  const p = new PartSet();
  p.get("darkWood").cylinder(0, 0, 0, 0.04, 0.035, 3.6, { segments: 6, color: C.woodDark });
  p.get("gold").sphere(0, 3.65, 0, 0.08, { segments: 6, rings: 4 });
  p.get("fabric").quad([0.04, 3.4, 0], [1.3, 3.25, 0], [1.2, 2.5, 0], [0.04, 2.4, 0], [0, 0, 1, 1], [0, 0, 1], C.red);
  p.get("fabric").quad([0.04, 3.4, 0], [1.3, 3.25, 0], [1.2, 2.5, 0], [0.04, 2.4, 0], [0, 0, 1, 1], [0, 0, -1], C.red);
  return { parts: p, cullDistance: 300, castShadows: true };
}

/**
 * Mount Erciyes on the horizon: a snow-capped volcanic cone, built once as a big low-poly
 * mesh. Seen over the han walls; it never casts shadows.
 */
export function erciyes(): GeoBuilder {
  const b = new GeoBuilder();
  const rnd = new Random(38);
  // Atmospheric perspective: distant rock reads blue-grey.
  const rock = hexColor("#8a8c96");
  const snow = hexColor("#f4f6fa");
  const rings = [
    // A skirt reaching below the horizon so the base never shows.
    [1.25, -0.45],
    [1.0, 0],
    [0.72, 0.28],
    [0.5, 0.52],
    [0.34, 0.7],
    [0.2, 0.86],
    [0.06, 1.0],
  ];
  const seg = 22;
  const R = 280;
  const H = 330;
  const jitter = rings.map(() => Array.from({ length: seg }, () => rnd.range(0.88, 1.12)));
  const pt = (ri: number, k: number): [number, number, number] => {
    const [r, h] = rings[ri];
    const a = ((k % seg) / seg) * Math.PI * 2;
    const j = jitter[ri][k % seg];
    // The twin summit: lift one side of the top ring.
    const lift = ri >= 5 ? Math.max(0, Math.cos(a - 0.8)) * 30 : 0;
    return [Math.cos(a) * R * r * j, H * h + lift, Math.sin(a) * R * r * j];
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < seg; k++) {
      const a = pt(ri, k);
      const bb = pt(ri, k + 1);
      const c = pt(ri + 1, k + 1);
      const d = pt(ri + 1, k);
      const hMid = (a[1] + c[1]) / 2 / H;
      const col = hMid > 0.62 ? snow : hMid > 0.48 ? mixColor(rock, snow, (hMid - 0.48) / 0.14 + rnd.range(-0.3, 0.3)) : shade(rock, rnd.range(0.85, 1.1));
      const out: [number, number, number] = [(a[0] + bb[0]) / 2, 0.3 * R, (a[2] + bb[2]) / 2];
      b.quad(a, bb, c, d, [0, 0, 1, 1], out, col);
    }
  }
  return b;
}

/** Colour of a yufka/dough at a doneness (0 raw → 1 golden → 1.6 burnt). */
export function bakeColor(k: number): RGBA {
  const raw = hexColor("#efe2c4");
  const golden = hexColor("#d8a050");
  const burnt = hexColor("#3a2414");
  return k <= 1 ? mixColor(raw, golden, k) : mixColor(golden, burnt, Math.min(1, (k - 1) / 0.6));
}
