import { TransformNode, Vector3, type Mesh } from "@babylonjs/core";
import { GeoBuilder, hexColor } from "../../assets/GeoBuilder";
import type { PrefabLibrary, ScatterItem } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import * as A from "../../assets/PrefabsAnkara";
import * as K from "../../assets/PrefabsCanakkale";
import * as M from "../../assets/PrefabsMugla";
import * as S from "../../assets/PrefabsSamsun";
import type { Surface } from "../../entities/Player";
import type { MaterialKey } from "../../rendering/MaterialLibrary";
import { Random } from "../../utils/random";
import { CollisionWorld } from "../../world/CollisionWorld";
import { HeightfieldTerrain } from "../../world/HeightfieldTerrain";
import { NavGraph } from "../../world/NavGraph";
import type { ScenarioWorld, WorldBuildContext } from "../common/FpsScenario";
import { bl, bw, canakkaleColor, canakkaleHeight, coastAS, coastEU, FACING, LAYOUT } from "./layout";

export interface BatteryGun {
  /** Carriage (yaw) and barrel (pitch: rotation.x = −elevation). */
  yaw: TransformNode;
  barrel: TransformNode;
  muzzle: TransformNode;
}

export interface CanakkaleWorld extends ScenarioWorld {
  terrain: HeightfieldTerrain;
  guns: BatteryGun[];
  /** Where the layer stands at our gun, and the gun's rest bearing. */
  gunStand: Vector3;
  gunFacing: number;
  crane: { intact: TransformNode; broken: TransformNode };
  /** The shell Seyit Onbaşı lifts, and the path he carries it along to the breech. */
  seyit: { shell: TransformNode; path: Vector3[]; breech: Vector3 };
  /** Rangefinder post: where the officer looks out over the strait. */
  telemetre: Vector3;
  flagNode: TransformNode;
  plateauY: number;
}

/**
 * Builds the European shore of the Narrows: terrain and the levelled battery (parapet,
 * traverses, four Krupp coastal guns in their pits, the magazine, shell racks, the hand crane,
 * the rangefinder post, tents and the flag), closed in by earth berms; across the water the
 * Asian shore with Çanakkale and Çimenlik Kalesi, Kilitbahir Kalesi up the shore to the north.
 */
export async function buildCanakkaleWorld(ctx: WorldBuildContext): Promise<CanakkaleWorld> {
  const { scene, prefabs, materials, pipeline, preset, fx } = ctx;
  const L = LAYOUT;
  const rnd = new Random(1915);
  ctx.progress(0.05, "Çanakkale Boğazı şekillendiriliyor");
  const terrain = new HeightfieldTerrain({
    minX: L.terrainRect.minX,
    minZ: L.terrainRect.minZ,
    sizeX: L.terrainRect.sizeX,
    sizeZ: L.terrainRect.sizeZ,
    cell: preset.terrainCell,
    height: canakkaleHeight,
    color: canakkaleColor,
    chunkCells: Math.round(140 / preset.terrainCell),
    lodDistance: 260,
    uvScale: 7,
  });
  await terrain.build(scene, materials.get("terrain"), ctx.yieldFrame);
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const GY = L.plateauY;
  // Bounds: the box around the battery's rotated rectangle.
  const loc = L.local;
  const corners = [bw(loc.u0 - 2, loc.v0 - 2), bw(loc.u1 + 2, loc.v0 - 2), bw(loc.u0 - 2, loc.v1 + 4), bw(loc.u1 + 2, loc.v1 + 4)];
  const bounds = {
    minX: Math.min(...corners.map((c) => c[0])),
    maxX: Math.max(...corners.map((c) => c[0])),
    minZ: Math.min(...corners.map((c) => c[1])),
    maxZ: Math.max(...corners.map((c) => c[1])),
  };
  const collision = new CollisionWorld(ground, -100, bounds);
  const anchors = new Map<string, Vector3>();
  /** World point from battery-local coordinates. */
  const atL = (u: number, v: number, dy = 0) => {
    const [x, z] = bw(u, v);
    return new Vector3(x, ground(x, z) + dy, z);
  };

  const statics = new Map<MaterialKey, GeoBuilder>();
  const S0 = (key: MaterialKey) => {
    let b = statics.get(key);
    if (!b) {
      b = new GeoBuilder();
      statics.set(key, b);
    }
    return b;
  };
  registerPrefabs(prefabs);
  /** Places a prefab in battery-local coordinates (rot relative to the battery's facing). */
  const placeL = (name: string, u: number, v: number, rot = 0, dy = 0, opts: { dynamic?: boolean; scale?: number } = {}) => {
    const [x, z] = bw(u, v);
    return prefabs.place(name, x, ground(x, z) + dy, z, { rotY: FACING + rot, scale: opts.scale ?? 1, dynamic: opts.dynamic });
  };
  const boxL = (u: number, v: number, w: number, d: number, yMax: number, walkable = false, rot = 0) => {
    const [x, z] = bw(u, v);
    collision.addBox(x, z, w, d, FACING + rot, -100, yMax, { walkable });
  };
  const circleL = (u: number, v: number, r: number, yMax: number) => {
    const [x, z] = bw(u, v);
    collision.addCircle(x, z, r, -100, yMax, { walkable: false });
  };

  // ------------------------------------------------------------- the battery
  ctx.progress(0.3, "Mecidiye Tabyası kuruluyor");
  await ctx.yieldFrame();
  const pv = L.parapetV;
  const width = loc.u1 - loc.u0;
  placeL("parapet", 0, pv, 0);
  boxL(0, pv + 0.4, width, 3.2, GY + 1.6);
  // Earth berms closing the battery at the sides and the back.
  placeL("berm", loc.u0 - 1, (loc.v0 + pv) / 2, Math.PI / 2, 0, { scale: 1 });
  placeL("berm", loc.u1 + 1, (loc.v0 + pv) / 2, -Math.PI / 2, 0, { scale: 1 });
  boxL(loc.u0 - 1, (loc.v0 + pv) / 2, 3, pv - loc.v0 + 2, GY + 3);
  boxL(loc.u1 + 1, (loc.v0 + pv) / 2, 3, pv - loc.v0 + 2, GY + 3);
  placeL("bermBack", 0, loc.v0 - 1, Math.PI);
  boxL(0, loc.v0 - 1, width + 4, 3, GY + 3);
  // Traverses between the gun pits.
  for (const u of [-16, 0, 16]) {
    placeL("traverse", u, 10.2, 0);
    boxL(u, 10.2, 3.2, 10.6, GY + 3.2);
  }
  // The four coastal guns.
  const guns: BatteryGun[] = [];
  L.guns.forEach((u, i) => {
    const v = 11;
    placeL("gunPit", u, v, 0);
    const [x, z] = bw(u, v);
    S0("stone").cylinder(x, GY, z, 2.3, 2.1, 0.3, { segments: 14, color: hexColor("#b4ab98") });
    const yaw = new TransformNode(`gun-${i}`, scene);
    yaw.position.set(x, GY + 0.3, z);
    yaw.rotation.y = FACING;
    prefabs.buildUnique(`gun-carriage-${i}`, K.gunCarriage(), yaw);
    const barrel = new TransformNode(`gun-barrel-${i}`, scene);
    barrel.parent = yaw;
    barrel.position.set(0, 2.1, 0);
    barrel.rotation.x = -0.06;
    prefabs.buildUnique(`gun-barrel-${i}`, K.gunBarrel(), barrel);
    const muzzle = new TransformNode(`gun-muzzle-${i}`, scene);
    muzzle.parent = barrel;
    muzzle.position.set(0, 0, 6.5);
    guns.push({ yaw, barrel, muzzle });
    circleL(u, v, 1.9, GY + 3);
    placeL("shellRack", u - 3.4, v - 3.6, 0.3);
    boxL(u - 3.4, v - 3.6, 2.2, 0.8, GY + 1, false, 0.3);
  });
  const mg = L.guns[L.mainGun];
  // The layer stands on the left of the breech, up on the carriage step, eyes over the barrel.
  const gunStand = atL(mg - 2.6, 9.4, 0);
  anchors.set("top", atL(mg - 1.5, 6.4));
  // The hand crane at our gun (it breaks during the battle).
  const cr = L.crane;
  const intact = placeL("craneOk", cr.u, cr.v, Math.PI / 2, 0, { dynamic: true }).root!;
  const broken = placeL("craneBroken", cr.u, cr.v, Math.PI / 2, 0, { dynamic: true }).root!;
  broken.setEnabled(false);
  circleL(cr.u, cr.v, 0.5, GY + 3.5);

  // Magazine with shells stacked at the door.
  const dp = L.depot;
  placeL("depot", dp.u, dp.v, 0);
  boxL(dp.u, dp.v - 2.4, 11, 8, GY + 3.6);
  boxL(dp.u, dp.v + 1.6, 7.4, 0.8, GY + 3);
  for (const du of [-4.6, 4.6]) {
    placeL("shellRack", dp.u + du, dp.v + 2.6, 0);
    boxL(dp.u + du, dp.v + 2.6, 2.2, 0.8, GY + 1);
  }
  anchors.set("cephanelik", atL(dp.u, dp.v + 4.2));
  // The lone shell by the door that Seyit Onbaşı will lift.
  const shell = new TransformNode("seyit-shell", scene);
  {
    // In front of the magazine, on the way to the guns: he faces the battery as he lifts it.
    const p = atL(dp.u + 1.8, dp.v + 6.5);
    shell.position.copyFrom(p);
    shell.rotation.y = FACING + 0.4;
    prefabs.buildUnique("seyit-shell", K.shellLying(), shell);
  }
  const seyitPath = [atL(dp.u + 1.8, dp.v + 5.2), atL(dp.u + 1.8, -2.5), atL(mg - 4, 1.8), atL(mg - 2.2, 5.6), atL(mg - 0.9, 7.6)];
  anchors.set("seyit", atL(dp.u + 1.8, dp.v + 5.4));

  // Rangefinder post, flag, tents, kitchen and the crew's shelters.
  // The rangefinder stands on a stepped earth platform so the officer sees over the parapet.
  const tm = L.telemetre;
  {
    const [x, z] = bw(tm.u, tm.v);
    S0("matte").box(x, GY + 0.25, z, 9, 0.5, 9, { color: hexColor("#8a7452"), jitter: 0.05 });
    S0("matte").box(x, GY + 0.75, z, 6.6, 0.5, 6.6, { color: hexColor("#7e6a4a"), jitter: 0.05 });
    collision.addBox(x, z, 9, 9, 0, -100, GY + 0.5, { walkable: true });
    collision.addBox(x, z, 6.6, 6.6, 0, -100, GY + 1.0, { walkable: true });
    prefabs.place("rangefinder", x, GY + 1.0, z, { rotY: FACING });
    collision.addCircle(x, z, 0.6, -100, GY + 2.8, { walkable: false });
  }
  const telemetre = atL(tm.u, tm.v - 1.4, 1.0);
  anchors.set("telemetre", telemetre.clone());
  let flagNode: TransformNode;
  {
    const fp = atL(L.flag.u, L.flag.v);
    S0("darkWood").cylinder(fp.x, fp.y, fp.z, 0.09, 0.06, 10, { segments: 6, color: hexColor("#4e3820") });
    S0("gold").sphere(fp.x, fp.y + 10.1, fp.z, 0.16, { segments: 6, rings: 4 });
    flagNode = prefabs.place("flag", fp.x, fp.y + 8.9, fp.z, { rotY: FACING - Math.PI / 2, dynamic: true }).root!;
    collision.addCircle(fp.x, fp.z, 0.3, -100, fp.y + 10, { walkable: false });
  }
  for (let u = L.tents.u0; u <= L.tents.u1; u += 10.4) {
    if (Math.abs(u - dp.u) < 7) continue;
    placeL("tent", u, L.tents.v, rnd.range(0, 3));
    circleL(u, L.tents.v, 2.1, GY + 3);
  }
  placeL("campfire", L.kitchen.u, L.kitchen.v);
  placeL("kazan", L.kitchen.u, L.kitchen.v, 0.4);
  circleL(L.kitchen.u, L.kitchen.v, 1, GY + 1.2);
  fx.campfire(atL(L.kitchen.u, L.kitchen.v, 0.05));
  for (const [u, v] of [
    [-30, -2],
    [28, -10],
  ]) {
    placeL("shelter", u, v, 0);
    for (const du of [-2, 2]) for (const dv of [-1, 1]) circleL(u + du, v + dv, 0.15, GY + 2.5);
  }
  for (const [name, u, v, r] of [
    ["ammo", -34, 8, 0.2],
    ["ammo", 36, -2, 1.2],
    ["sandbags6", -4, -2, 0],
    ["sandbags4", 34, 13, 0.4],
    ["rifles", -26, -14, 0.3],
    ["barrel", -36, -18, 0],
    ["crate", 18, -16, 0.4],
  ] as const) {
    placeL(name, u, v, r);
    boxL(u, v, name === "sandbags6" ? 3.6 : name === "sandbags4" ? 2.4 : 1.2, 0.8, GY + 1.2, false, r);
  }
  // Telegraph poles running up from the battery to the command post inland.
  for (let k = 0; k < 6; k++) {
    const [x, z] = bw(-10 - k * 3, -40 - k * 26);
    prefabs.place("pole", x, ground(x, z), z, { rotY: FACING });
  }

  // ------------------------------------------------------------- the landscape
  ctx.progress(0.55, "Kilitbahir, Çimenlik ve Çanakkale");
  await ctx.yieldFrame();
  const scatter = new Map<string, ScatterItem[]>();
  const add = (name: string, item: ScatterItem) => {
    let list = scatter.get(name);
    if (!list) {
      list = [];
      scatter.set(name, list);
    }
    list.push(item);
  };
  const density = Math.max(0.45, preset.npcDensity);
  // Scrub and pines on both shores.
  for (let i = 0; i < 1300 * density; i++) {
    const x = rnd.range(L.terrainRect.minX + 20, L.terrainRect.minX + L.terrainRect.sizeX - 20);
    const z = rnd.range(L.terrainRect.minZ + 20, L.terrainRect.minZ + L.terrainRect.sizeZ - 20);
    const y = ground(x, z);
    if (y < 2.5) continue;
    const [u, v] = bl(x, z);
    if (u > loc.u0 - 8 && u < loc.u1 + 8 && v > loc.v0 - 8 && v < loc.v1 + 30) continue;
    if (rnd.next() < 0.45) add(`pine${rnd.int(1, 3)}`, { x, y: y - 0.3, z, rotY: rnd.range(0, 6.28), scale: rnd.range(0.7, 1.2) });
    else add(`bush${rnd.int(1, 2)}`, { x, y: y - 0.2, z, rotY: rnd.range(0, 6.28), scale: rnd.range(0.9, 1.6) });
  }
  // Kilitbahir up the shore, Çimenlik and the town across.
  {
    const kz = L.kilitbahir.z;
    const kx = coastEU(kz) - 40;
    prefabs.place("kilitbahir", kx, ground(kx, kz) - 0.5, kz, { rotY: 0.4 });
    for (let k = 0; k < 14; k++) {
      const x = kx - 40 - rnd.range(0, 90);
      const z = kz + rnd.range(-60, 80);
      add(`house${rnd.int(0, 5)}`, { x, y: ground(x, z) - 0.3, z, rotY: rnd.range(0, 6.28), tint: [1, 1, 1, 1] });
    }
    const cz = L.cimenlik.z;
    const cx = coastAS(cz) + 34;
    prefabs.place("cimenlik", cx, ground(cx, cz) - 0.5, cz, { rotY: -0.2 });
    for (let k = 0; k < 120 * density; k++) {
      const z = rnd.range(260, 780);
      const x = coastAS(z) + 30 + rnd.range(0, 300);
      if (Math.hypot(x - cx, z - cz) < 50) continue;
      add(`house${rnd.int(0, 5)}`, { x, y: ground(x, z) - 0.3, z, rotY: rnd.range(0, 6.28), tint: [1.02, 0.98, 0.94, 1] });
    }
    for (const [dx, dz] of [
      [120, -40],
      [210, 140],
    ]) {
      const x = cx + dx;
      const z = cz + dz;
      prefabs.place("mosque", x, ground(x, z) - 0.3, z, { rotY: -0.3, scale: 1.3 });
    }
  }
  // Erenköy village on the bay's far shore.
  for (let k = 0; k < 18; k++) {
    const z = rnd.range(-760, -560);
    const x = coastAS(z) + 40 + rnd.range(0, 140);
    add(`house${rnd.int(0, 5)}`, { x, y: ground(x, z) - 0.3, z, rotY: rnd.range(0, 6.28), tint: [1, 1, 1, 1] });
  }

  for (const [key, b] of statics) {
    if (b.isEmpty) continue;
    const m: Mesh = b.toMesh(`canakkale-${key}`, scene);
    m.material = materials.get(key);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    pipeline.addShadowCaster(m);
  }
  for (const [name, list] of scatter) prefabs.scatter(name, list);

  ctx.progress(0.85, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 1.6, ground);
  nav.addRegion(bounds.minX + 2, bounds.minZ + 2, bounds.maxX - 2, bounds.maxZ - 2);
  nav.build();

  return {
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt: (): Surface => "dirt",
    terrain,
    guns,
    gunStand,
    gunFacing: FACING,
    crane: { intact, broken },
    seyit: { shell, path: seyitPath, breech: atL(mg - 0.9, 7.6) },
    telemetre,
    flagNode,
    plateauY: GY,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  prefabs.register("parapet", () => K.parapet(LAYOUT.local.u1 - LAYOUT.local.u0));
  prefabs.register("berm", () => K.parapet(LAYOUT.parapetV - LAYOUT.local.v0 + 2));
  prefabs.register("bermBack", () => K.parapet(LAYOUT.local.u1 - LAYOUT.local.u0 + 4));
  prefabs.register("traverse", K.traverse);
  prefabs.register("gunPit", K.gunPit);
  prefabs.register("shellRack", () => K.shellRack(6));
  prefabs.register("depot", K.depot);
  prefabs.register("craneOk", () => K.crane(false));
  prefabs.register("craneBroken", () => K.crane(true));
  prefabs.register("rangefinder", K.rangefinderPost);
  prefabs.register("shelter", K.shelter);
  prefabs.register("kilitbahir", K.kilitbahir);
  prefabs.register("cimenlik", K.cimenlik);
  prefabs.register("tent", S.bellTent);
  prefabs.register("sandbags4", () => S.sandbags(4));
  prefabs.register("sandbags6", () => S.sandbags(6));
  prefabs.register("ammo", S.ammoBoxes);
  prefabs.register("rifles", S.rifleStack);
  prefabs.register("pole", S.telegraphPole);
  prefabs.register("mosque", S.mosque);
  prefabs.register("flag", () => A.flag1920(2.4));
  prefabs.register("campfire", P.campfire);
  prefabs.register("kazan", P.kazan);
  prefabs.register("barrel", P.barrel);
  prefabs.register("crate", () => P.crate(0.9));
  for (const [id, st] of Object.entries(K.SHIP_STYLES)) prefabs.register(`ship-${id}`, () => K.battleship(st));
  for (let i = 0; i < 6; i++) prefabs.register(`house${i}`, () => P.houseDef(i));
  for (let i = 1; i <= 3; i++) prefabs.register(`pine${i}`, () => M.redPine(i + 10));
  for (let i = 1; i <= 2; i++) prefabs.register(`bush${i}`, () => S.hazelBush(i + 3));
}

