import { Color3, PBRMaterial, PointLight, TransformNode, Vector3, type Mesh, type ParticleSystem } from "@babylonjs/core";
import { GeoBuilder, hexColor, shade, type RGBA } from "../../assets/GeoBuilder";
import type { PrefabLibrary } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import * as K from "../../assets/PrefabsKayseri";
import type { Surface } from "../../entities/Player";
import type { MaterialKey } from "../../rendering/MaterialLibrary";
import { CollisionWorld } from "../../world/CollisionWorld";
import { NavGraph } from "../../world/NavGraph";
import type { ScenarioWorld, WorldBuildContext } from "../common/FpsScenario";
import { bayCenter, LAYOUT, SHOPS, type ShopKind } from "./layout";

export interface SacSlot {
  /** Ground position of the griddle top (where the yufka lies). */
  position: Vector3;
  node: TransformNode;
  material: PBRMaterial;
}

export interface KayseriWorld extends ScenarioWorld {
  sacs: SacSlot[];
  hearth: { light: PointLight; fire: ParticleSystem; smoke: ParticleSystem; center: Vector3 };
  sacStand: { stand: Vector3; facing: number };
  dough: { sheet: TransformNode; rows: TransformNode[]; stand: Vector3; facing: number };
  counter: { stand: Vector3; facing: number; customer: Vector3 };
  /** Things that appear as the story goes on. */
  props: {
    flour: TransformNode[];
    meat: TransformNode;
    yaglama: TransformNode;
    manti: TransformNode;
    terazi: TransformNode;
    kapanTerazi: TransformNode;
    sancaks: TransformNode[];
    kadiTray: TransformNode;
  };
  /** Coppersmith's anvil (hammering sounds come from here). */
  bakirci: Vector3;
  divanY: number;
}

interface Arch {
  /** Opening interval along the wall (local x). */
  a: number;
  b: number;
  /** Height where the arch springs and its rise above that. */
  spring: number;
  rise: number;
  /** Fill the arch (e.g. a closed gate) instead of leaving it open. */
  filled?: RGBA;
}

const L = LAYOUT;
const STONE: RGBA = hexColor("#6e655c");
const STONE_DARK: RGBA = hexColor("#5a524a");
const TUFF: RGBA = hexColor("#b08a72");
const TRIM: RGBA = hexColor("#a8998a");

/** Height of a two-centred pointed arch over its springing line at offset u from its centre. */
function pointedY(u: number, half: number, rise: number): number {
  const R = (rise * rise + half * half) / (2 * half);
  const e = Math.abs(u) + R - half;
  return Math.sqrt(Math.max(0, R * R - e * e));
}

/**
 * Builds the bazaar: the vaulted arasta with its shop bays, the two-storey caravanserai
 * courtyard with arcades, iwan and şadırvan, our yağlama/mantı shop, lights, colliders and
 * the nav graph. Kayseri's buildings are of dark volcanic stone with reddish tuff trims.
 */
export async function buildKayseriWorld(ctx: WorldBuildContext): Promise<KayseriWorld> {
  const { scene, prefabs, materials, pipeline, fx } = ctx;
  ctx.progress(0.05, "Çarşı duvarları örülüyor");
  const ground = () => 0;
  const collision = new CollisionWorld(ground, -100, L.bounds);
  const anchors = new Map<string, Vector3>();
  const statics = new Map<MaterialKey, GeoBuilder>();
  const S = (key: MaterialKey) => {
    let b = statics.get(key);
    if (!b) {
      b = new GeoBuilder();
      statics.set(key, b);
    }
    return b;
  };
  registerPrefabs(prefabs);

  /**
   * A straight wall in local space (running along +x from `from` to `to`, centred on z = 0)
   * with pointed-arch openings, alternating dark/tuff voussoirs and an optional fill.
   * Returns the solid intervals for colliders.
   */
  const archedWall = (b: GeoBuilder, from: number, to: number, y0: number, height: number, thick: number, arches: Arch[], color = STONE): [number, number][] => {
    const solids: [number, number][] = [];
    const sorted = [...arches].sort((p, q) => p.a - q.a);
    let cur = from;
    const top = y0 + height;
    for (const o of sorted) {
      if (o.a > cur) {
        b.box((cur + o.a) / 2, (y0 + top) / 2, 0, o.a - cur, height, thick, { uvScale: 2.5, color });
        solids.push([cur, o.a]);
      }
      const half = (o.b - o.a) / 2;
      const c = (o.a + o.b) / 2;
      const springY = y0 + o.spring;
      // Spandrel slices above the arch curve.
      const n = Math.max(6, Math.round((o.b - o.a) / 0.22));
      for (let i = 0; i < n; i++) {
        const u0 = o.a + (i / n) * (o.b - o.a);
        const u1 = o.a + ((i + 1) / n) * (o.b - o.a);
        const yc = springY + (pointedY(u0 - c, half, o.rise) + pointedY(u1 - c, half, o.rise)) / 2;
        if (top - yc > 0.01) b.box((u0 + u1) / 2, (yc + top) / 2, 0, u1 - u0 + 0.002, top - yc, thick, { uvScale: 2.5, color });
        if (o.filled) b.box((u0 + u1) / 2, (springY + yc) / 2, 0, u1 - u0 + 0.002, yc - springY, thick * 0.3, { color: o.filled });
      }
      // Voussoirs along the curve, alternating dark stone and reddish tuff (Seljuk style).
      const k = Math.max(7, Math.round(((o.b - o.a) * 1.6) / 0.35));
      for (let i = 0; i < k; i++) {
        const u0 = o.a + (i / k) * (o.b - o.a);
        const u1 = o.a + ((i + 1) / k) * (o.b - o.a);
        const p0 = [u0, springY + pointedY(u0 - c, half, o.rise)];
        const p1 = [u1, springY + pointedY(u1 - c, half, o.rise)];
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        b.pushTRS((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0, 0, 1, 0, ang);
        b.box(0, 0.13, 0, len + 0.02, 0.26, thick + 0.06, { color: i % 2 ? TUFF : STONE_DARK });
        b.pop();
      }
      // Jambs.
      for (const x of [o.a, o.b]) b.box(x, y0 + o.spring / 2, 0, 0.12, o.spring, thick + 0.06, { color: TRIM });
      cur = o.b;
    }
    if (to > cur) {
      b.box((cur + to) / 2, (y0 + top) / 2, 0, to - cur, height, thick, { uvScale: 2.5, color });
      solids.push([cur, to]);
    }
    return solids;
  };

  /** Wall along x at fixed z (dir "x") or along z at fixed x (dir "z"), with colliders. */
  const wallX = (z: number, x0: number, x1: number, height: number, thick: number, arches: Arch[] = [], color = STONE, y0 = 0, collide = true) => {
    const b = S("stone");
    b.pushTRS(0, 0, z);
    const solids = archedWall(b, x0, x1, y0, height, thick, arches, color);
    b.pop();
    if (collide) for (const [a, c] of solids) collision.addBox((a + c) / 2, z, c - a, thick, 0, -1, y0 + height + 1, { walkable: false });
  };
  const wallZ = (x: number, z0: number, z1: number, height: number, thick: number, arches: Arch[] = [], color = STONE, y0 = 0, collide = true) => {
    const b = S("stone");
    // Local +x → world +z.
    b.pushTRS(x, 0, 0, -Math.PI / 2);
    const solids = archedWall(b, z0, z1, y0, height, thick, arches, color);
    b.pop();
    if (collide) for (const [a, c] of solids) collision.addBox(x, (a + c) / 2, thick, c - a, 0, -1, y0 + height + 1, { walkable: false });
  };

  /** Pointed barrel vault along z between x0..x1 (box segments so it casts real shadows). */
  const vault = (x0: number, x1: number, z0: number, z1: number, spring: number, rise: number, skylightEvery = 0) => {
    const b = S("stone");
    const half = (x1 - x0) / 2;
    const c = (x0 + x1) / 2;
    const seg = 14;
    const sectionLen = 2;
    const sections = Math.round((z1 - z0) / sectionLen);
    for (let s = 0; s < sections; s++) {
      const zc = z0 + (s + 0.5) * sectionLen;
      const sky = skylightEvery > 0 && s % skylightEvery === 1;
      for (let i = 0; i < seg; i++) {
        // Leave the crown open for a skylight (the light shafts of the arasta).
        if (sky && (i === seg / 2 - 1 || i === seg / 2)) continue;
        const u0 = -half + (i / seg) * 2 * half;
        const u1 = -half + ((i + 1) / seg) * 2 * half;
        const y0 = spring + pointedY(u0, half, rise);
        const y1 = spring + pointedY(u1, half, rise);
        const len = Math.hypot(u1 - u0, y1 - y0);
        const ang = Math.atan2(y1 - y0, u1 - u0);
        b.pushTRS(c + (u0 + u1) / 2, (y0 + y1) / 2, zc, 0, 1, 0, ang);
        b.box(0, 0.16, 0, len + 0.04, 0.32, sectionLen + 0.01, { uvScale: 2.5, color: s % 2 ? STONE : shade(STONE, 0.94) });
        b.pop();
      }
      if (sky) {
        // Lantern curb around the opening.
        const w = (2 * half) / seg;
        const yTop = spring + rise + 0.3;
        for (const sx of [-1, 1]) b.box(c + sx * (w + 0.1), yTop, zc, 0.2, 0.5, sectionLen, { color: TRIM });
      }
      // Transverse ribs every section in tuff.
      if (s > 0) {
        for (let i = 0; i < seg; i++) {
          const u0 = -half + (i / seg) * 2 * half;
          const u1 = -half + ((i + 1) / seg) * 2 * half;
          if (sky && (i === seg / 2 - 1 || i === seg / 2)) continue;
          const y0 = spring + pointedY(u0, half, rise);
          const y1 = spring + pointedY(u1, half, rise);
          const ang = Math.atan2(y1 - y0, u1 - u0);
          b.pushTRS(c + (u0 + u1) / 2, (y0 + y1) / 2, zc - sectionLen / 2, 0, 1, 0, ang);
          b.box(0, -0.06, 0, Math.hypot(u1 - u0, y1 - y0) + 0.03, 0.14, 0.32, { color: TUFF });
          b.pop();
        }
      }
    }
  };

  // ================================================================== the arasta
  const A = L.arasta;
  const sx = A.streetX;
  const ox = A.outerX;
  // Floors: cobbled street, stone-slab shop floors.
  S("cobble").box(0, -0.1, (A.z0 + A.z1) / 2, 2 * sx, 0.2, A.z1 - A.z0, { uvScale: 1.6, color: hexColor("#8a8076") });
  for (const s of [-1, 1]) S("stone").box(s * (sx + ox) / 2, -0.08, (A.z0 + A.z1) / 2, ox - sx, 0.2, A.z1 - A.z0, { uvScale: 1.2, color: hexColor("#8e8478") });
  // Shop fronts with a pointed arch per bay.
  for (const s of [-1, 1]) {
    const arches: Arch[] = [];
    for (let bay = 0; bay < A.bays.length - 1; bay++) {
      const c = bayCenter(bay);
      arches.push({ a: c - 1.55, b: c + 1.55, spring: 2.5, rise: 0.95 });
    }
    // Entrance bay (z -20..-18) has no shop: plain wall there.
    if (s === -1) wallZ(-sx, A.bays[0], A.z1, A.vaultSpring, 0.5, arches);
    else wallZ(sx, A.bays[0], A.z1, A.vaultSpring, 0.5, arches);
    if (s === -1) wallZ(-sx, A.z0, A.bays[0], A.vaultSpring, 0.5);
    else wallZ(sx, A.z0, A.bays[0], A.vaultSpring, 0.5);
    // Back walls and shop roofs.
    wallZ(s * ox, A.z0, A.z1, A.shopHeight + 0.3, 0.5);
    S("stone").box(s * (sx + ox) / 2, A.shopHeight + 0.15, (A.z0 + A.z1) / 2, ox - sx, 0.3, A.z1 - A.z0, { uvScale: 2.5, color: shade(STONE, 0.9) });
    // Shop ceilings: wooden beams under the slab.
    for (let z = A.bays[0] + 0.5; z < A.z1; z += 1) S("darkWood").box(s * (sx + ox) / 2, A.shopHeight - 0.08, z, ox - sx - 0.2, 0.14, 0.14, { color: hexColor("#4e3420") });
    // Dividers between bays (except inside our merged shop).
    for (let i = 0; i < A.bays.length; i++) {
      const z = A.bays[i];
      // z = 2 lies inside our merged shop; the last boundary is the han's wall.
      if ((s === -1 && z === 2) || i === A.bays.length - 1) continue;
      wallX(z, Math.min(s * sx, s * ox), Math.max(s * sx, s * ox), A.shopHeight, 0.4);
    }
  }
  vault(-sx, sx, A.z0, A.z1, A.vaultSpring, A.vaultApex - A.vaultSpring, 3);
  // Closed south gate of the market (çarşı kapısı).
  wallX(A.z0, -ox, ox, A.vaultApex + 0.4, 0.7, [{ a: -1.7, b: 1.7, spring: 2.6, rise: 1.2, filled: hexColor("#4a2e1a") }]);
  collision.addBox(0, A.z0, 3.4, 0.7, 0, -1, 4.5, { walkable: false });
  for (const s of [-1, 1]) {
    S("darkWood").box(s * 0.84, 1.3, A.z0 + 0.4, 1.66, 2.6, 0.1, { color: hexColor("#5a3a22") });
    for (let k = 0; k < 4; k++) S("iron").box(s * 0.84, 0.4 + k * 0.6, A.z0 + 0.46, 1.6, 0.06, 0.02, { color: hexColor("#2a2826") });
  }
  // End walls of the side rooms at the south (above the shop roofs).
  // North: the han's south wall with the passage into the courtyard (built with the han).

  // Shop signs and contents.
  ctx.progress(0.22, "Dükkânlar donatılıyor");
  await ctx.yieldFrame();
  const signColors = ["#8e1a20", "#2a4a6e", "#3f6a4a", "#b8862e", "#6a3a5a"];
  let bakirci = new Vector3();
  SHOPS.forEach((shop, i) => {
    const zc = bayCenter(shop.bay);
    const xFront = shop.side * (sx + 0.35);
    const xBack = shop.side * (ox - 0.55);
    const face = shop.side < 0 ? Math.PI / 2 : -Math.PI / 2; // faces the street
    prefabs.place(`sign`, shop.side * (sx - 0.3), 3.75, zc, { rotY: face, tint: hexColor(signColors[i % signColors.length]) });
    furnishShop(shop.kind, shop.side, zc, xFront, xBack, face);
    if (shop.kind === "bakirci") bakirci = new Vector3(shop.side * 4.2, 0.6, zc);
  });

  function furnishShop(kind: ShopKind, side: number, zc: number, xFront: number, xBack: number, face: number) {
    const back = (name: string, h = 2.2) => {
      prefabs.place(name, xBack, 0, zc, { rotY: face });
      collision.addBox(xBack, zc, 0.6, 2.6, 0, -1, h, { walkable: false });
    };
    const mid = side * 4.3;
    switch (kind) {
      case "bakirci":
        back("copperShelf");
        prefabs.place("copperFloor", mid, 0, zc + 0.3, { rotY: face });
        collision.addCircle(mid, zc + 0.3, 0.9, -1, 1, { walkable: false });
        break;
      case "kumasci":
        back("fabricBolts");
        prefabs.place("bench", mid + side * 0.2, 0, zc, { rotY: face });
        break;
      case "baharatci":
        prefabs.place("spices", mid, 0, zc, { rotY: face });
        collision.addBox(mid, zc, 1.5, 2.0, 0, -1, 0.7, { walkable: false });
        back("jarsShelf", 1.2);
        break;
      case "kasap":
        prefabs.place("kasap", mid, 0, zc, { rotY: face });
        collision.addCircle(mid, zc, 0.5, -1, 1, { walkable: false });
        break;
      case "kilimci":
        back("kilims");
        break;
      case "sarac":
        prefabs.place("saddles", mid, 0, zc, { rotY: face });
        collision.addBox(mid, zc, 0.6, 2.4, 0, -1, 1.2, { walkable: false });
        break;
      case "pastirmaci":
        prefabs.place("pastirma", xBack + side * 0.1, 0, zc, { rotY: face });
        prefabs.place("tezgahSmall", mid - side * 0.6, 0, zc, { rotY: face });
        collision.addBox(mid - side * 0.6, zc, 0.8, 2.4, 0, -1, 1, { walkable: false });
        break;
      case "attar":
        back("jarsShelf", 1.2);
        prefabs.place("pottery", mid, 0, zc - 0.6, { rotY: face, scale: 0.7 });
        break;
      case "kuyumcu":
        prefabs.place("jeweler", mid - side * 0.3, 0, zc, { rotY: face });
        collision.addBox(mid - side * 0.3, zc, 0.7, 1.7, 0, -1, 1, { walkable: false });
        break;
      case "kapan":
        prefabs.place("kapan", mid + side * 0.2, 0, zc + 0.6, { rotY: face });
        collision.addCircle(mid + side * 0.2, zc + 0.6, 0.6, -1, 2.5, { walkable: false });
        prefabs.place("sacks", xBack, 0, zc - 1.0, { rotY: face, scale: 0.8 });
        break;
      case "comlekci":
        prefabs.place("pottery", mid, 0, zc, { rotY: face });
        collision.addBox(mid, zc, 1.6, 2.6, 0, -1, 1, { walkable: false });
        break;
      case "serbetci":
        prefabs.place("sherbet", mid, 0, zc, { rotY: face });
        collision.addBox(mid, zc, 1.2, 2.0, 0, -1, 1, { walkable: false });
        break;
    }
    void xFront;
  }

  // ================================================================== our shop
  ctx.progress(0.38, "Yağlamacı dükkânı kuruluyor");
  await ctx.yieldFrame();
  const sh = L.shop;
  const counterLen = sh.counter.z1 - sh.counter.z0;
  const counterZ = (sh.counter.z0 + sh.counter.z1) / 2;
  prefabs.place("tezgah", sh.counterX, 0, counterZ, { rotY: Math.PI / 2 });
  collision.addBox(sh.counterX, counterZ, 0.75, counterLen + 0.1, 0, -1, 1.0, { walkable: false });
  // Shop sign in red & gold.
  prefabs.place("sign", -(sx - 0.3), 3.75, 2, { rotY: Math.PI / 2, tint: hexColor("#b8862e") });
  // Hearth with three sacs along the back wall.
  const ocakLen = 3.6;
  const ocakZ = (sh.sacZ[0] + sh.sacZ[2]) / 2;
  prefabs.place("ocak", sh.sacX, 0, ocakZ, { rotY: Math.PI / 2 });
  collision.addBox(sh.sacX, ocakZ, 1.0, ocakLen, 0, -1, 1.0, { walkable: false });
  const sacs: SacSlot[] = sh.sacZ.map((z, i) => {
    prefabs.place("sac", sh.sacX, 0.6, z, {});
    const node = new TransformNode(`yufka-${i}`, scene);
    node.position.set(sh.sacX, 0.6 + 0.235, z);
    const mat = materials.variant("matte", `yufka-${i}`);
    mat.albedoColor = Color3.FromHexString("#efe2c4").toLinearSpace();
    for (const m of prefabs.buildUnique(`yufka-${i}`, K.yufkaDisc(), node, false)) m.material = mat;
    node.setEnabled(false);
    return { position: new Vector3(sh.sacX, 0.6 + 0.235, z), node, material: mat };
  });
  const hearthCenter = new Vector3(sh.sacX, 0.62, ocakZ);
  const hearthLight = new PointLight("hearth-light", new Vector3(sh.sacX + 0.9, 1.4, ocakZ), scene);
  hearthLight.diffuse = new Color3(1, 0.6, 0.3);
  hearthLight.range = 9;
  hearthLight.intensity = 1.6;
  const hearthFire = fx.campfire(new Vector3(sh.sacX, 0.35, ocakZ));
  hearthFire.fire.emitRate = 6;
  hearthFire.fire.minSize = 0.12;
  hearthFire.fire.maxSize = 0.3;
  hearthFire.smoke.emitRate = 1.5;
  const sacStand = new Vector3(sh.sacX + 1.5, 0, sh.sacZ[1]);
  anchors.set("sac", sacStand.clone());

  // Dough table, dough sheet and the mantı tray.
  const dt = sh.dough;
  prefabs.place("doughTable", dt.x, 0, dt.z, { rotY: Math.PI });
  collision.addBox(dt.x, dt.z, 2.0, 1.1, 0, -1, 0.9, { walkable: false });
  const sheet = new TransformNode("dough-sheet", scene);
  sheet.position.set(dt.x - 0.35, 0.818, dt.z);
  prefabs.buildUnique("dough-sheet", K.doughSheet(), sheet, false);
  const trayNode = new TransformNode("manti-tray", scene);
  trayNode.position.set(dt.x + 0.5, 0.81, dt.z + 0.02);
  prefabs.buildUnique("manti-tray", K.mantiTray().parts, trayNode, false);
  const rows: TransformNode[] = [];
  for (let i = 0; i < 10; i++) {
    const r = new TransformNode(`manti-row-${i}`, scene);
    r.parent = trayNode;
    r.position.set(0, 0.034, 0.16 - i * 0.035);
    prefabs.buildUnique(`manti-row-${i}`, K.mantiRow(), r, false);
    r.setEnabled(false);
    rows.push(r);
  }
  const doughStand = new Vector3(dt.x, 0, dt.z - 1.05);
  anchors.set("hamur_tahtasi", doughStand.clone());

  // Shelves, flour corner, terazi and displays on the counter.
  prefabs.place("copperShelf", -4.4, 0, sh.z0 + 0.32, { scale: 0.8 });
  collision.addBox(-4.4, sh.z0 + 0.32, 2.1, 0.4, 0, -1, 1.8, { walkable: false });
  const flour: TransformNode[] = [];
  for (let i = 0; i < 2; i++) {
    const n = new TransformNode(`flour-${i}`, scene);
    n.position.set(-5.95, 0.22 + i * 0.36, 3.45 + i * 0.1);
    prefabs.buildUnique(`flour-${i}`, K.heldFlourSack(), n);
    n.setEnabled(false);
    flour.push(n);
  }
  anchors.set("un_yeri", new Vector3(-5.1, 0, 3.4));
  const onCounter = (name: string, parts: ReturnType<typeof K.yaglamaTray>, z: number, show: boolean) => {
    const n = new TransformNode(name, scene);
    n.position.set(sh.counterX, 0.99, z);
    prefabs.buildUnique(name, parts, n, false);
    n.setEnabled(show);
    return n;
  };
  const meat = onCounter("counter-meat", K.heldMeat(), -0.8, false);
  const yaglama = onCounter("counter-yaglama", K.yaglamaTray(true), 0.05, false);
  const manti = onCounter("counter-manti", (() => {
    const p = K.mantiSahan();
    return p;
  })(), 1.6, false);
  // Second sahan beside the first.
  const manti2 = new TransformNode("counter-manti-2", scene);
  manti2.parent = manti;
  manti2.position.set(0.05, 0, 0.4);
  prefabs.buildUnique("counter-manti-2", K.mantiSahan(), manti2, false);
  anchors.set("tezgah", new Vector3(-4.0, 0, -0.6));
  const terazi = new TransformNode("terazi", scene);
  terazi.position.set(sh.counterX, 0.99, 2.75);
  terazi.rotation.y = Math.PI / 2;
  prefabs.buildUnique("terazi", K.teraziParts(), terazi);
  anchors.set("terazi", new Vector3(-4.0, 0, 2.75));
  const sellerStand = new Vector3(L.sellerSpot.x, 0, L.sellerSpot.z);
  anchors.set("satis", sellerStand.clone());

  // Kasap pickup (kıyma).
  anchors.set("kasap", new Vector3(-3.4, 0, bayCenter(3)));
  // Kapan: the muhtesib's public scale; our terazi is checked here.
  const kapanTerazi = new TransformNode("kapan-terazi", scene);
  const kz = L.kapan.z - 0.8;
  kapanTerazi.position.set(sx + 0.9, 0.99, kz);
  prefabs.place("tezgahSmall", sx + 0.9, 0, kz, { rotY: -Math.PI / 2 });
  collision.addBox(sx + 0.9, kz, 0.8, 2.3, 0, -1, 1, { walkable: false });
  kapanTerazi.rotation.y = -Math.PI / 2;
  prefabs.buildUnique("kapan-terazi", K.teraziParts(), kapanTerazi);
  kapanTerazi.setEnabled(false);
  anchors.set("kapan", new Vector3(sx - 0.3, 0, kz));

  // Hanging kandils along the street (with glowing flames) and warm fill lights.
  for (let z = A.bays[0] + 1; z < A.z1; z += 4) {
    const node = new TransformNode(`kandil-${z}`, scene);
    node.position.set(0, 3.3, z);
    prefabs.buildUnique(`kandil-${z}`, K.kandil(A.vaultApex - 3.3 - 0.5), node);
    const fl = new TransformNode(`kandil-flame-${z}`, scene);
    fl.parent = node;
    for (const m of prefabs.buildUnique(`kandil-flame-${z}`, K.kandilFlame(), fl, false)) pipeline.glowLayer?.addIncludedOnlyMesh(m);
  }
  const lights: PointLight[] = [];
  // Few point lights: with the sun and the sky light, materials allow six (see KayseriScene).
  for (const [x, y, z, r] of [
    [0, 3.4, -11, 13],
    [0, 3.4, 4, 12],
  ]) {
    const l = new PointLight(`arasta-light-${z}`, new Vector3(x, y, z), scene);
    l.diffuse = new Color3(1, 0.76, 0.48);
    l.specular = new Color3(0.3, 0.22, 0.14);
    l.range = r;
    l.intensity = 0.9;
    lights.push(l);
  }

  // ================================================================== the han
  ctx.progress(0.55, "Han avlusu ve revaklar");
  await ctx.yieldFrame();
  const H = L.han;
  const ar = H.arcade;
  S("cobble").box(0, -0.1, (H.z0 + H.z1) / 2, H.maxX - H.minX, 0.2, H.z1 - H.z0, { uvScale: 1.8, color: hexColor("#948a7e") });
  // Paved cross paths.
  S("stone").box(0, 0.005, (H.z0 + H.z1) / 2, 2.6, 0.02, H.z1 - H.z0 - 2 * ar, { uvScale: 1.2, color: hexColor("#a89a88") });
  S("stone").box(0, 0.006, L.fountain.z, H.maxX - H.minX - 2 * ar, 0.02, 2.6, { uvScale: 1.2, color: hexColor("#a89a88") });
  // Outer walls (two storeys) — the south one has the passage from the arasta.
  wallX(H.z0, H.minX, H.maxX, H.height, 0.8, [{ a: L.hanGate.x0, b: L.hanGate.x1, spring: 3.2, rise: 1.4 }]);
  wallX(H.z1, H.minX, H.maxX, H.height, 0.8);
  wallZ(H.minX, H.z0, H.z1, H.height, 0.8);
  wallZ(H.maxX, H.z0, H.z1, H.height, 0.8);
  // Crenellated parapet on top.
  for (let x = H.minX; x < H.maxX; x += 1.2) {
    for (const z of [H.z0, H.z1]) S("stone").box(x + 0.3, H.height + 0.3, z, 0.6, 0.6, 0.8, { color: STONE_DARK });
  }
  for (let z = H.z0; z < H.z1; z += 1.2) for (const x of [H.minX, H.maxX]) S("stone").box(x, H.height + 0.3, z + 0.3, 0.8, 0.6, 0.6, { color: STONE_DARK });

  // Arcades: ground floor and gallery, on all four sides of the courtyard.
  const inner = { x0: H.minX + ar, x1: H.maxX - ar, z0: H.z0 + ar, z1: H.z1 - ar };
  const arcadeArches = (from: number, to: number, n: number, spring: number, rise: number, pier = 0.8): Arch[] => {
    const out: Arch[] = [];
    const len = (to - from) / n;
    for (let i = 0; i < n; i++) out.push({ a: from + i * len + pier / 2, b: from + (i + 1) * len - pier / 2, spring, rise });
    return out;
  };
  const storey = (y0: number, h: number, spring: number, rise: number, collide: boolean) => {
    wallX(inner.z0, inner.x0, inner.x1, h, 0.7, arcadeArches(inner.x0, inner.x1, 5, spring, rise), STONE, y0, collide);
    wallZ(inner.x0, inner.z0, inner.z1, h, 0.7, arcadeArches(inner.z0, inner.z1, 5, spring, rise), STONE, y0, collide);
    wallZ(inner.x1, inner.z0, inner.z1, h, 0.7, arcadeArches(inner.z0, inner.z1, 5, spring, rise), STONE, y0, collide);
    const pw = 5.2;
    wallX(inner.z1, inner.x0, -pw, h, 0.7, arcadeArches(inner.x0, -pw, 2, spring, rise), STONE, y0, collide);
    wallX(inner.z1, pw, inner.x1, h, 0.7, arcadeArches(pw, inner.x1, 2, spring, rise), STONE, y0, collide);
  };
  storey(0, 4.1, 2.5, 1.05, true);
  storey(4.4, 3.2, 1.9, 0.8, false);
  // Gallery floor and roof slabs over the arcades.
  const slab = (y: number, t: number) => {
    S("stone").box((H.minX + inner.x0) / 2, y, (H.z0 + H.z1) / 2, ar, t, H.z1 - H.z0, { uvScale: 2.5, color: shade(STONE, 0.85) });
    S("stone").box((H.maxX + inner.x1) / 2, y, (H.z0 + H.z1) / 2, ar, t, H.z1 - H.z0, { uvScale: 2.5, color: shade(STONE, 0.85) });
    S("stone").box(0, y, (H.z0 + inner.z0) / 2, inner.x1 - inner.x0, t, ar, { uvScale: 2.5, color: shade(STONE, 0.85) });
    for (const s of [-1, 1]) S("stone").box(s * (5.2 + inner.x1) / 2, y, (H.z1 + inner.z1) / 2, inner.x1 - 5.2, t, ar, { uvScale: 2.5, color: shade(STONE, 0.85) });
  };
  slab(4.25, 0.3);
  slab(7.75, 0.4);
  // Gallery balustrade (between the upper piers).
  // Room doors along the walls behind the arcades, both storeys.
  const doors = S("darkWood");
  for (let z = H.z0 + ar + 1.7; z < H.z1 - ar; z += 3.4) {
    for (const s of [-1, 1]) {
      for (const y of [1.15, 5.45]) doors.box(s * (H.maxX - 0.42), y, z, 0.06, 2.1, 1.1, { color: hexColor("#4a2e1a") });
    }
  }
  for (let x = H.minX + ar + 2.1; x < H.maxX - ar; x += 4.2) {
    if (Math.abs(x) < 3) continue;
    for (const y of [1.15, 5.45]) doors.box(x, y, H.z0 + 0.42, 1.1, 2.1, 0.06, { color: hexColor("#4a2e1a") });
  }

  // The iwan with its tall portal (pishtaq) and the Kadı's divan.
  const iw = L.iwan;
  wallX(iw.z0 - 0.5, -5.2, 5.2, 10, 1.0, [{ a: iw.x0 + 0.4, b: iw.x1 - 0.4, spring: 4.4, rise: 2.6 }], STONE);
  // Portal border in tuff.
  for (const x of [-4.9, 4.9]) S("stone").box(x, 5, iw.z0 - 1.02, 0.3, 10, 0.08, { color: TUFF });
  S("stone").box(0, 9.85, iw.z0 - 1.02, 10.1, 0.3, 0.08, { color: TUFF });
  // Mukarnas hint: stepped niches under the portal's top.
  for (let k = 0; k < 7; k++) S("stone").box(-3 + k, 8.6, iw.z0 - 1.05, 0.7, 0.5, 0.1, { topScale: 1.25, color: k % 2 ? TRIM : TUFF });
  wallZ(iw.x0 - 0.4, iw.z0 - 0.5, H.z1, iw.height, 0.8);
  wallZ(iw.x1 + 0.4, iw.z0 - 0.5, H.z1, iw.height, 0.8);
  vault(iw.x0, iw.x1, iw.z0, H.z1, 4.6, 2.5);
  S("stone").box(0, -0.08, (iw.z0 + H.z1) / 2, iw.x1 - iw.x0, 0.2, H.z1 - iw.z0, { uvScale: 1.2, color: hexColor("#9a8e80") });
  const dv = L.divan;
  prefabs.place("divan", dv.x, 0, dv.z, { rotY: Math.PI });
  collision.addBox(dv.x, dv.z, 6, 3.2, 0, -1, dv.height, { walkable: true, tag: "stone" });
  collision.addRamp(dv.x, dv.z - 1.82, 2.2, 0.5, 0, 0, dv.height, "stone");
  const sancaks: TransformNode[] = [];
  for (const s of [-1, 1]) {
    const n = prefabs.place("sancak", s * 4.6, 0, iw.z0 - 1.6, { dynamic: true, rotY: s > 0 ? Math.PI : 0 }).root!;
    n.setEnabled(false);
    sancaks.push(n);
  }
  const kadiTray = new TransformNode("kadi-tray", scene);
  kadiTray.position.set(dv.x, dv.height + 0.04, dv.z - 0.55);
  prefabs.buildUnique("kadi-tray", K.yaglamaTray(true), kadiTray, false);
  kadiTray.setEnabled(false);
  anchors.set("kadi_sofra", new Vector3(dv.x + 0.9, 0, dv.z - 2.6));

  // Courtyard: şadırvan, camels, bales, the storeroom with flour.
  prefabs.place("sadirvan", L.fountain.x, 0, L.fountain.z, {});
  collision.addCircle(L.fountain.x, L.fountain.z, 2.3, -1, 1.2, { walkable: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    collision.addCircle(L.fountain.x + Math.cos(a) * 2.35, L.fountain.z + Math.sin(a) * 2.35, 0.18, -1, 3.6, { walkable: false });
  }
  for (const [x, z, rot, loaded] of [
    [-7.6, 15.6, 0.4, true],
    [-8.4, 25.2, 2.6, false],
    [7.4, 26.4, -2.2, true],
  ] as const) {
    prefabs.place(loaded ? "camelLoaded" : "camel", x, 0, z, { rotY: rot });
    collision.addBox(x, z, 1.3, 2.2, rot, -1, 1.6, { walkable: false });
  }
  for (const [x, z, rot] of [
    [-12.0, 20.5, Math.PI / 2],
    [11.6, 14.6, -Math.PI / 2],
    [-5.6, 15.2, 0.3],
  ] as const) {
    prefabs.place("bales", x, 0, z, { rotY: rot });
    collision.addBox(x, z, 2.4, 1.0, rot, -1, 1.2, { walkable: false });
  }
  const am = L.ambar;
  S("darkWood").box(H.maxX - 0.42, 1.4, am.z, 0.08, 2.8, 2.0, { color: hexColor("#5a3a22") });
  prefabs.place("flourSacks", H.maxX - 1.2, 0, am.z, { rotY: -Math.PI / 2 });
  collision.addBox(H.maxX - 1.2, am.z, 1.2, 2.0, 0, -1, 1.1, { walkable: false });
  anchors.set("ambar", new Vector3(H.maxX - 2.6, 0, am.z));
  prefabs.place("kilims", H.minX + 0.9, 0, 28, { rotY: Math.PI / 2, scale: 0.9 });

  // Erciyes on the horizon, framed above the iwan.
  {
    const m = K.erciyes().toMesh("erciyes", scene);
    // Raised so its snowy upper half clears the han walls (~30° above the courtyard).
    m.position.set(110, 95, 720);
    const mat = new PBRMaterial("erciyes", scene);
    mat.albedoColor = new Color3(0.8, 0.82, 0.88);
    // Haze lifts the shadowed side toward the sky colour.
    mat.emissiveColor = new Color3(0.16, 0.19, 0.25);
    mat.roughness = 1;
    mat.metallic = 0;
    mat.environmentIntensity = 0.6;
    m.material = mat;
    m.isPickable = false;
    m.freezeWorldMatrix();
  }

  for (const [key, b] of statics) {
    if (b.isEmpty) continue;
    const m: Mesh = b.toMesh(`kayseri-${key}`, scene);
    m.material = materials.get(key);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    pipeline.addShadowCaster(m);
  }

  // ------------------------------------------------------------------ navigation
  ctx.progress(0.85, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 1.0, ground);
  nav.addRegion(-ox + 0.4, A.z0 + 0.6, ox - 0.4, A.z1 + 0.6);
  nav.addRegion(H.minX + 0.6, H.z0 + 0.6, H.maxX - 0.6, H.z1 - 0.6);
  nav.build();

  const surfaceAt = (x: number, z: number): Surface => (z > H.z0 || Math.abs(x) < sx ? "stone" : "stone");
  void lights;

  return {
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt,
    sacs,
    hearth: { light: hearthLight, fire: hearthFire.fire, smoke: hearthFire.smoke, center: hearthCenter },
    sacStand: { stand: sacStand, facing: -Math.PI / 2 },
    dough: { sheet, rows, stand: doughStand, facing: 0 },
    counter: { stand: sellerStand, facing: Math.PI / 2, customer: new Vector3(L.customerSpot.x, 0, L.customerSpot.z) },
    props: { flour, meat, yaglama, manti, terazi, kapanTerazi, sancaks, kadiTray },
    bakirci,
    divanY: dv.height,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  prefabs.register("tezgah", () => K.tezgah(L.shop.counter.z1 - L.shop.counter.z0));
  prefabs.register("tezgahSmall", () => K.tezgah(2.2));
  prefabs.register("ocak", () => K.longOcak(3.6));
  prefabs.register("sac", K.sacGriddle);
  prefabs.register("doughTable", K.doughTable);
  prefabs.register("copperShelf", K.copperShelf);
  prefabs.register("copperFloor", K.copperFloor);
  prefabs.register("fabricBolts", K.fabricBolts);
  prefabs.register("spices", K.spiceSacks);
  prefabs.register("pastirma", K.pastirmaRack);
  prefabs.register("kilims", K.kilimWall);
  prefabs.register("pottery", K.pottery);
  prefabs.register("jarsShelf", K.pottery);
  prefabs.register("saddles", K.saddleRack);
  prefabs.register("jeweler", K.jewelerCounter);
  prefabs.register("sherbet", K.sherbetStand);
  prefabs.register("kasap", K.kasapCounter);
  prefabs.register("kapan", K.kapanScale);
  prefabs.register("sign", () => ({ ...K.shopSign("#efe6d2"), tintable: true }));
  prefabs.register("sadirvan", K.sadirvan);
  prefabs.register("divan", () => K.divan(6));
  prefabs.register("camel", () => K.camel(false));
  prefabs.register("camelLoaded", () => K.camel(true));
  prefabs.register("bales", K.bales);
  prefabs.register("flourSacks", K.flourSacks);
  prefabs.register("sancak", K.sancak);
  prefabs.register("sacks", P.sacks);
  prefabs.register("bench", () => {
    const p = new P.PartSet();
    p.get("wood").box(0, 0.42, 0, 0.5, 0.06, 2.2, { uvScale: 1.5, color: hexColor("#8a5e3a") });
    for (const z of [-0.95, 0.95]) p.get("darkWood").box(0, 0.2, z, 0.4, 0.4, 0.08, { color: hexColor("#4e3420") });
    p.get("fabric").box(0, 0.47, 0.4, 0.45, 0.04, 0.9, { color: hexColor("#8e1a20") });
    return { parts: p, cullDistance: 120, castShadows: true };
  });
}
