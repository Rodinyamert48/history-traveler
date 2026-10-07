import { Color3, PBRMaterial, PointLight, TransformNode, Vector3, type Mesh } from "@babylonjs/core";
import { GeoBuilder, hexColor, type RGBA } from "../../assets/GeoBuilder";
import type { PrefabLibrary } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import * as A from "../../assets/PrefabsAnkara";
import type { Surface } from "../../entities/Player";
import type { MaterialKey } from "../../rendering/MaterialLibrary";
import { CollisionWorld } from "../../world/CollisionWorld";
import { NavGraph } from "../../world/NavGraph";
import type { ScenarioWorld, WorldBuildContext } from "../common/FpsScenario";
import { LAYOUT } from "./layout";

export interface HallLamp {
  position: Vector3;
  node: TransformNode;
  flame: TransformNode;
  lit: boolean;
}

export interface Seat {
  x: number;
  z: number;
  heading: number;
}

export interface AnkaraWorld extends ScenarioWorld {
  lamps: HallLamp[];
  /** Warm fill lights of the hall; their strength follows the number of lit lamps. */
  hallLights: PointLight[];
  presidencyChairs: TransformNode[];
  morse: { lever: TransformNode; stand: Vector3; facing: number };
  clerk: { stand: Vector3; facing: number };
  seats: Seat[];
  daisY: number;
}

interface Opening {
  a: number;
  b: number;
  y0: number;
  y1: number;
  kind: "door" | "window" | "doorway";
}

const L = LAYOUT;
const H = L.wallHeight;
const T = L.wallThickness;

/**
 * Builds the interior of the first Assembly building: rooms with real window openings (so
 * the afternoon sun throws light patches inside), the general assembly hall with its desks,
 * dais, lectern and lamps, the telegraph room, the depot, colliders and a nav graph.
 */
export async function buildAnkaraWorld(ctx: WorldBuildContext): Promise<AnkaraWorld> {
  const { scene, prefabs, materials, pipeline } = ctx;
  ctx.progress(0.05, "Meclis binası kuruluyor");
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
  const glass = new GeoBuilder();

  registerPrefabs(prefabs);

  // ------------------------------------------------------------------ shell
  const wallCol = hexColor("#e6dcc4");
  const wainCol = hexColor("#6a4a30");
  const frameCol = hexColor("#4e3420");
  /** Wall running along x at fixed z (or along z at fixed x when `alongZ`). */
  const wall = (fixed: number, from: number, to: number, openings: Opening[], alongZ: boolean, wainscot: -1 | 0 | 1) => {
    const put = (b: GeoBuilder, a0: number, a1: number, y0: number, y1: number, depth: number, offset = 0, color?: RGBA) => {
      const c = (a0 + a1) / 2;
      const len = a1 - a0;
      if (len <= 0.001 || y1 - y0 <= 0.001) return;
      if (alongZ) b.box(fixed + offset, (y0 + y1) / 2, c, depth, y1 - y0, len, { uvScale: 3, color });
      else b.box(c, (y0 + y1) / 2, fixed + offset, len, y1 - y0, depth, { uvScale: 3, color });
    };
    const collide = (a0: number, a1: number) => {
      const c = (a0 + a1) / 2;
      if (a1 - a0 <= 0.001) return;
      if (alongZ) collision.addBox(fixed, c, T, a1 - a0, 0, -1, H + 1, { walkable: false });
      else collision.addBox(c, fixed, a1 - a0, T, 0, -1, H + 1, { walkable: false });
    };
    const sorted = [...openings].sort((p, q) => p.a - q.a);
    let cur = from;
    let colStart = from;
    for (const o of sorted) {
      put(S("plaster"), cur, o.a, 0, H, T, 0, wallCol);
      if (o.y0 > 0) put(S("plaster"), o.a, o.b, 0, o.y0, T, 0, wallCol);
      put(S("plaster"), o.a, o.b, o.y1, H, T, 0, wallCol);
      if (o.kind === "doorway") {
        collide(colStart, o.a);
        colStart = o.b;
      }
      // Frame.
      const f = S("darkWood");
      put(f, o.a - 0.08, o.a, o.y0, o.y1 + 0.08, T + 0.08, 0, frameCol);
      put(f, o.b, o.b + 0.08, o.y0, o.y1 + 0.08, T + 0.08, 0, frameCol);
      put(f, o.a - 0.08, o.b + 0.08, o.y1, o.y1 + 0.08, T + 0.08, 0, frameCol);
      if (o.kind === "window") {
        put(f, o.a, o.b, o.y0 - 0.06, o.y0, T + 0.16, 0, frameCol);
        // Frosted panes (emissive, not shadow casting: sunlight passes) with mullions.
        put(glass, o.a, o.b, o.y0, o.y1, 0.03, 0);
        put(f, (o.a + o.b) / 2 - 0.03, (o.a + o.b) / 2 + 0.03, o.y0, o.y1, 0.08, 0, frameCol);
        put(f, o.a, o.b, (o.y0 + o.y1) / 2 - 0.03, (o.y0 + o.y1) / 2 + 0.03, 0.08, 0, frameCol);
      }
      cur = o.b;
    }
    put(S("plaster"), cur, to, 0, H, T, 0, wallCol);
    collide(colStart, to);
    // Wooden wainscot on the given side(s).
    if (wainscot !== 0) {
      let w0 = from;
      for (const o of [...sorted, { a: to, b: to, y0: 0, y1: 0, kind: "door" as const }]) {
        const end = o.y0 === 0 && o.kind !== "window" ? o.a : to;
        if (o.y0 === 0 && o.kind !== "window") {
          put(S("darkWood"), w0, end, 0, 1.15, 0.05, wainscot * (T / 2 + 0.025), wainCol);
          put(S("darkWood"), w0, end, 1.12, 1.2, 0.09, wainscot * (T / 2 + 0.045), frameCol);
          w0 = o.b;
        }
      }
      if (w0 < to) {
        put(S("darkWood"), w0, to, 0, 1.15, 0.05, wainscot * (T / 2 + 0.025), wainCol);
        put(S("darkWood"), w0, to, 1.12, 1.2, 0.09, wainscot * (T / 2 + 0.045), frameCol);
      }
    }
  };
  const win = (c: number, w = 1.4, y0 = 1.0, y1 = 3.3): Opening => ({ a: c - w / 2, b: c + w / 2, y0, y1, kind: "window" });
  const door = (a: number, b: number, y1 = 3.0): Opening => ({ a, b, y0: 0, y1, kind: "doorway" });
  const o = L.outer;
  // Outer walls.
  wall(o.minZ, o.minX, o.maxX, [win(-8), win(8), { a: -1, b: 1, y0: 0, y1: 2.9, kind: "door" }], false, 1);
  wall(o.maxZ, o.minX, o.maxX, [win(-10.6, 1.2, 1.6, 3.6), win(10.6, 1.2, 1.6, 3.6)], false, -1);
  wall(o.minX, o.minZ, o.maxZ, [win(-2, 1.0), win(3), win(7), win(11)], true, 1);
  wall(o.maxX, o.minZ, o.maxZ, [win(-2, 1.0), win(3), win(7), win(11)], true, -1);
  // Corridor / hall wall with the hall's double door.
  wall(L.corridor.z1, o.minX, o.maxX, [door(L.hallDoor.x0, L.hallDoor.x1, 3.1)], false, 1);
  // Corridor / rooms wall.
  wall(L.corridor.z0, o.minX, L.vestibule.x0, [door(L.telegraphDoor.x0, L.telegraphDoor.x1)], false, -1);
  wall(L.corridor.z0, L.vestibule.x1, o.maxX, [door(L.depotDoor.x0, L.depotDoor.x1)], false, -1);
  wall(L.vestibule.x0, o.minZ, L.corridor.z0, [], true, 0);
  wall(L.vestibule.x1, o.minZ, L.corridor.z0, [], true, 0);
  // Entrance door leaves (closed) and the open hall doors.
  const dw = S("darkWood");
  for (const s of [-1, 1]) {
    dw.box(s * 0.5, 1.45, o.minZ + T / 2 + 0.04, 0.96, 2.86, 0.08, { color: hexColor("#5a3a22") });
    dw.box(s * 0.5, 2.2, o.minZ + T / 2 + 0.09, 0.7, 0.9, 0.04, { color: hexColor("#4a2e1a") });
    dw.box(s * 0.5, 0.9, o.minZ + T / 2 + 0.09, 0.7, 1.1, 0.04, { color: hexColor("#4a2e1a") });
    // Hall doors stand open into the hall, square to the wall.
    dw.pushTRS(s * L.hallDoor.x1, 0, L.corridor.z1, s * (Math.PI / 2));
    dw.box(-s * 0.78, 1.5, 0, 1.56, 3.0, 0.07, { color: hexColor("#5a3a22") });
    dw.pop();
    collision.addBox(s * (L.hallDoor.x1 - 0.04), L.corridor.z1 + T / 2 + 0.78, 0.1, 1.56, 0, -1, 3.1, { walkable: false });
  }
  // Floor, ceiling with beams, and a roof slab that keeps the sun out except through windows.
  S("wood").box(0, -0.1, (o.minZ + o.maxZ) / 2, o.maxX - o.minX + 0.8, 0.2, o.maxZ - o.minZ + 0.8, { uvScale: 2.2, color: hexColor("#9a7450") });
  S("darkWood").box(0, H + 0.08, (o.minZ + o.maxZ) / 2, o.maxX - o.minX + 0.8, 0.16, o.maxZ - o.minZ + 0.8, { uvScale: 2, color: hexColor("#8a6a48") });
  for (let x = o.minX + 1.6; x < o.maxX; x += 2.6) S("darkWood").box(x, H - 0.12, (L.corridor.z1 + o.maxZ) / 2, 0.24, 0.24, o.maxZ - L.corridor.z1, { color: hexColor("#5a3e26") });
  S("stone").box(0, H + 0.45, (o.minZ + o.maxZ) / 2, o.maxX - o.minX + 1.6, 0.6, o.maxZ - o.minZ + 1.6, { uvScale: 4 });
  // Skirting line in the corridor floor (runner carpet).
  S("fabric").box(0, 0.006, (L.corridor.z0 + L.corridor.z1) / 2, 22, 0.012, 1.5, { color: hexColor("#6e1a1e") });
  S("fabric").box(0, 0.006, -7.5, 1.6, 0.012, 6.5, { color: hexColor("#6e1a1e") });
  S("fabric").box(0, 0.006, 6, 2.6, 0.012, 10, { color: hexColor("#6e1a1e") });

  // ------------------------------------------------------------------ the hall
  ctx.progress(0.3, "Genel Kurul salonu döşeniyor");
  await ctx.yieldFrame();
  const d = L.dais;
  const daisY = d.height;
  S("wood").box((d.x0 + d.x1) / 2, daisY / 2, (d.z0 + d.z1) / 2, d.x1 - d.x0, daisY, d.z1 - d.z0, { uvScale: 2, color: hexColor("#8a6444") });
  S("darkWood").box((d.x0 + d.x1) / 2, daisY - 0.04, d.z0 - 0.02, d.x1 - d.x0 + 0.04, 0.08, 0.06, { color: frameCol });
  S("fabric").box(0, daisY + 0.006, (d.z0 + d.z1) / 2, 7, 0.012, 3.2, { color: hexColor("#7a1a20") });
  collision.addBox((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2, d.x1 - d.x0, d.z1 - d.z0, 0, -1, daisY, { walkable: true, tag: "wood" });
  // Two steps up to the dais.
  for (const [i, h] of [
    [0, 0.2],
    [1, 0.4],
  ] as const) {
    S("wood").box(0, h / 2, d.z0 - 0.75 + i * 0.35, 3.2, h, 0.35, { uvScale: 2, color: hexColor("#8a6444") });
  }
  collision.addRamp(0, d.z0 - 0.45, 3.2, 0.9, 0, 0, daisY, "wood");
  prefabs.place("lectern", L.lectern.x, daisY, L.lectern.z, { rotY: Math.PI });
  collision.addBox(L.lectern.x, L.lectern.z, 1.2, 0.8, 0, daisY - 0.1, daisY + 1.3, { walkable: false });
  anchors.set("kursu", new Vector3(L.lectern.x, daisY, L.lectern.z + 0.8));
  prefabs.place("presidency", L.presidency.x, daisY, L.presidency.z, { rotY: Math.PI });
  collision.addBox(L.presidency.x, L.presidency.z, 6.5, 1.3, 0, daisY - 0.1, daisY + 0.85, { walkable: false });
  const presidencyChairs: TransformNode[] = [];
  L.presidencyChairs.forEach((x, i) => {
    const c = prefabs.place("chair", x, daisY, L.presidency.z + 0.95, { dynamic: true, rotY: Math.PI }).root!;
    c.setEnabled(false);
    presidencyChairs.push(c);
    anchors.set(`baskanlik_${i + 1}`, new Vector3(x, daisY, L.presidency.z + 0.95));
  });
  prefabs.place("flag", 0, 3.0, o.maxZ - T / 2 - 0.08, { rotY: Math.PI });
  for (const x of [-6.5, 6.5]) prefabs.place("flagSmall", x, 2.8, o.maxZ - T / 2 - 0.08, { rotY: Math.PI });

  // Deputies' desks.
  const seats: Seat[] = [];
  for (const x of L.deskColumns) {
    for (const z of L.deskRows) {
      prefabs.place("desk", x, 0, z, {});
      collision.addBox(x, z - 0.05, 2.3, 1.15, 0, -1, 0.9, { walkable: false });
      for (const sx of [-0.55, 0.55]) seats.push({ x: x + sx, z: z - 0.34, heading: 0 });
    }
  }
  // Clerk's desk beside the dais.
  const ck = L.clerkDesk;
  const cw = S("wood");
  cw.box(ck.x, 0.76, ck.z, 0.9, 0.05, 1.6, { uvScale: 1.5, color: hexColor("#5e3e24") });
  for (const dx of [-0.4, 0.4]) for (const dz of [-0.72, 0.72]) cw.box(ck.x + dx, 0.38, ck.z + dz, 0.06, 0.76, 0.06, { color: hexColor("#4e3420") });
  collision.addBox(ck.x, ck.z, 0.95, 1.65, 0, -1, 0.85, { walkable: false });
  prefabs.place("chair", ck.x - 0.75, 0, ck.z, { rotY: Math.PI / 2 });
  const ledgerNode = new TransformNode("ledger", scene);
  ledgerNode.position.set(ck.x - 0.05, 0.785, ck.z);
  ledgerNode.rotation.y = Math.PI / 2;
  prefabs.buildUnique("ledger", A.ledger(), ledgerNode);
  prefabs.place("chair", ck.x - 0.75, 0, ck.z + 1.2, { rotY: Math.PI / 2 });
  const clerkStand = new Vector3(ck.x - 1.25, 0, ck.z);
  const clerkFacing = Math.atan2(L.lectern.x - clerkStand.x, L.lectern.z - clerkStand.z);
  anchors.set("katip_masasi", clerkStand.clone());

  // Listeners' railing, stove, clock, coat stands.
  const rl = A.railing(10.6);
  for (const x of [-7.7, 7.7]) {
    const n = new TransformNode(`railing-${x}`, scene);
    n.position.set(x, 0, L.railingZ);
    prefabs.buildUnique(`railing-${x}`, rl, n);
    collision.addBox(x, L.railingZ, 10.6, 0.14, 0, -1, 1.0, { walkable: false });
  }
  prefabs.place("stove", L.stove.x, 0, L.stove.z, {});
  collision.addCircle(L.stove.x, L.stove.z, 0.45, -1, 1.2, { walkable: false });
  prefabs.place("clock", 4.5, 2.6, L.corridor.z1 + T / 2 + 0.07, {});
  prefabs.place("coatStand", -11.8, 0, 1.6, {});
  prefabs.place("coatStand", 2.4, 0, -10.2, {});

  // Hanging lamps (lit one by one in the lamp minigame).
  const lamps: HallLamp[] = [];
  const lampY = 2.85;
  const lampParts = A.hangingLamp(H - lampY - 0.55);
  L.lamps.forEach(([x, z], i) => {
    const y = z > d.z0 ? lampY + 0.25 : lampY;
    const node = new TransformNode(`lamp-${i}`, scene);
    node.position.set(x, y, z);
    prefabs.buildUnique(`lamp-${i}`, z > d.z0 ? A.hangingLamp(H - y - 0.55) : lampParts, node);
    const flame = new TransformNode(`lamp-flame-${i}`, scene);
    flame.parent = node;
    for (const m of prefabs.buildUnique(`lamp-flame-${i}`, A.lampFlame(), flame, false)) pipeline.glowLayer?.addIncludedOnlyMesh(m);
    flame.setEnabled(false);
    lamps.push({ position: new Vector3(x, y, z), node, flame, lit: false });
  });
  const hallLights = [new Vector3(-4, 3.5, 5.5), new Vector3(4, 3.5, 5.5), new Vector3(0, 3.6, 12.2)].map((p, i) => {
    const l = new PointLight(`hall-light-${i}`, p, scene);
    l.diffuse = new Color3(1, 0.78, 0.5);
    l.specular = new Color3(0.4, 0.3, 0.2);
    l.range = 14;
    l.intensity = 0;
    return l;
  });

  // ------------------------------------------------------------ side rooms
  ctx.progress(0.55, "Telgrafhane ve depo");
  await ctx.yieldFrame();
  const tg = L.telegraph;
  prefabs.place("telegraphTable", tg.x, 0, tg.z, { rotY: Math.PI / 2 });
  collision.addBox(tg.x, tg.z, 0.85, 1.85, 0, -1, 0.85, { walkable: false });
  const keyBase = new TransformNode("morse-key", scene);
  keyBase.position.set(tg.x + 0.22, 0.785, tg.z + 0.45);
  keyBase.rotation.y = -Math.PI / 2;
  prefabs.buildUnique("morse-base", A.morseKeyBase(), keyBase);
  const lever = new TransformNode("morse-lever", scene);
  lever.parent = keyBase;
  lever.position.set(0, 0.075, -0.06);
  prefabs.buildUnique("morse-lever", A.morseKeyLever(), lever);
  // Telegraph wires running up the wall.
  for (let i = 0; i < 3; i++) S("iron").box(o.minX + T / 2 + 0.03, (0.8 + H) / 2, tg.z - 0.4 + i * 0.12, 0.015, H - 0.8, 0.015, { color: hexColor("#1a1a1a") });
  prefabs.place("chair", tg.x + 0.95, 0, tg.z - 0.7, { rotY: -Math.PI / 2 });
  for (const x of [-11.2, -9.4]) {
    prefabs.place("shelf", x, 0, L.corridor.z0 - T / 2 - 0.2, { rotY: Math.PI });
    collision.addBox(x, L.corridor.z0 - T / 2 - 0.2, 1.6, 0.4, 0, -1, 2.1, { walkable: false });
  }
  const morseStand = new Vector3(tg.x + 1.15, 0, tg.z + 0.45);
  anchors.set("telgraf", morseStand.clone());

  const dp = L.depot;
  for (const [x, z] of [
    [dp.x + 1.2, dp.z - 1.4],
    [dp.x + 2.3, dp.z - 1.4],
    [dp.x + 2.3, dp.z - 0.2],
  ]) {
    prefabs.place("chairStack", x, 0, z, { rotY: Math.PI });
    collision.addBox(x, z, 0.6, 0.6, 0, -1, 1.6, { walkable: false });
  }
  prefabs.place("oilCans", dp.x - 2, 0, dp.z - 1.6, { rotY: 0.3 });
  collision.addBox(dp.x - 2.2, dp.z - 1.5, 1.2, 0.9, 0.3, -1, 0.6, { walkable: false });
  for (const x of [5, 6.8]) {
    prefabs.place("shelf", x, 0, o.minZ + T / 2 + 0.2, {});
    collision.addBox(x, o.minZ + T / 2 + 0.2, 1.6, 0.4, 0, -1, 2.1, { walkable: false });
  }
  anchors.set("depo", new Vector3(dp.x + 0.5, 0, dp.z - 0.6));

  // Corridor & vestibule.
  for (const x of [-9, 9]) {
    prefabs.place("bench", x, 0, L.corridor.z1 - 0.5, { rotY: Math.PI });
    collision.addBox(x, L.corridor.z1 - 0.5, 1.8, 0.45, 0, -1, 0.5, { walkable: false });
  }
  for (const [i, x, z] of [
    [1, -1.8, -8.4],
    [2, 0, -6.8],
    [3, 1.8, -8.4],
  ] as const)
    anchors.set(`mebus_${i}`, new Vector3(x, 0, z));
  anchors.set("hall_door", new Vector3(0, 0, 1.8));

  // Window panes.
  const glassMesh = glass.toMesh("window-glass", scene);
  const glassMat = new PBRMaterial("window-glass", scene);
  glassMat.albedoColor = Color3.Black();
  glassMat.emissiveColor = new Color3(1, 0.96, 0.88);
  glassMat.emissiveIntensity = 1.15;
  glassMat.disableLighting = true;
  glassMesh.material = glassMat;
  glassMesh.isPickable = false;
  pipeline.glowLayer?.addIncludedOnlyMesh(glassMesh);

  for (const [key, b] of statics) {
    if (b.isEmpty) continue;
    const m: Mesh = b.toMesh(`tbmm-${key}`, scene);
    m.material = materials.get(key);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    pipeline.addShadowCaster(m);
  }

  // --------------------------------------------------------------- navigation
  ctx.progress(0.85, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 1.2, ground);
  nav.addRegion(o.minX + 0.6, o.minZ + 0.6, o.maxX - 0.6, o.maxZ - 0.6);
  nav.build();

  const surfaceAt = (): Surface => "wood";

  return {
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt,
    lamps,
    hallLights,
    presidencyChairs,
    morse: { lever, stand: morseStand, facing: -Math.PI / 2 },
    clerk: { stand: clerkStand, facing: clerkFacing },
    seats,
    daisY,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  prefabs.register("desk", A.schoolDesk);
  prefabs.register("presidency", A.presidencyTable);
  prefabs.register("lectern", A.lectern);
  prefabs.register("chair", A.chair);
  prefabs.register("chairStack", A.chairStack);
  prefabs.register("stove", () => A.woodStove(H));
  prefabs.register("telegraphTable", A.telegraphTable);
  prefabs.register("shelf", A.shelf);
  prefabs.register("oilCans", A.oilCans);
  prefabs.register("clock", A.wallClock);
  prefabs.register("coatStand", A.coatStand);
  prefabs.register("flag", () => A.flag1920(2.6));
  prefabs.register("flagSmall", () => A.flag1920(1.3));
  prefabs.register("bench", A.bench);
  prefabs.register("crate", () => P.crate(0.8));
}
