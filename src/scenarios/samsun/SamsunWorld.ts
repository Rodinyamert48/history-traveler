import { TransformNode, Vector3, type Mesh, type ParticleSystem } from "@babylonjs/core";
import { GeoBuilder, hexColor } from "../../assets/GeoBuilder";
import type { PrefabLibrary, ScatterItem } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import * as A from "../../assets/PrefabsAnkara";
import * as M from "../../assets/PrefabsMugla";
import * as S from "../../assets/PrefabsSamsun";
import type { Surface } from "../../entities/Player";
import type { MaterialKey } from "../../rendering/MaterialLibrary";
import { Random } from "../../utils/random";
import { CollisionWorld } from "../../world/CollisionWorld";
import { HeightfieldTerrain } from "../../world/HeightfieldTerrain";
import { NavGraph } from "../../world/NavGraph";
import type { ScenarioWorld, WorldBuildContext } from "../common/FpsScenario";
import { LAYOUT, onPath, samsunColor, samsunHeight } from "./layout";

export interface RangeTarget {
  /** Hinge node: rotation.x = 0 standing, -π/2 lying flat. */
  face: TransformNode;
  /** Centre of the target face when standing. */
  center: Vector3;
  /** Unit normal of the face (toward the firing line). */
  normal: Vector3;
}

export interface SeaShip {
  id: "warship" | "steamer" | "bandirma" | "boats";
  name: string;
  info: string;
  node: TransformNode;
  /** Rough radius for the lookout's aiming test. */
  radius: number;
  /** Height of the ship's centre above the water. */
  midY: number;
}

export interface SamsunWorld extends ScenarioWorld {
  terrain: HeightfieldTerrain;
  targets: RangeTarget[];
  ships: SeaShip[];
  bandirmaSmoke: ParticleSystem;
  range: { stand: Vector3; facing: number };
  lookout: { stand: Vector3; facing: number };
  parade: { stand: Vector3; facing: number; commander: Vector3 };
  /** Edge of the hill where Mustafa Kemal Paşa stands looking out to sea. */
  overlook: Vector3;
  plateauY: number;
}

/**
 * Builds the hills above Samsun: terrain, the army post on its levelled hilltop (karakol,
 * flag, tents, parade ground, field gun, lookout trench, firing range), the path down to a
 * farm, wooded slopes, the town and harbour on the coastal plain, and the ships at sea.
 */
export async function buildSamsunWorld(ctx: WorldBuildContext): Promise<SamsunWorld> {
  const { scene, prefabs, materials, pipeline, preset, fx } = ctx;
  const L = LAYOUT;
  const rnd = new Random(1919);

  ctx.progress(0.05, "Canik tepeleri şekillendiriliyor");
  const terrain = new HeightfieldTerrain({
    minX: L.terrainRect.minX,
    minZ: L.terrainRect.minZ,
    sizeX: L.terrainRect.sizeX,
    sizeZ: L.terrainRect.sizeZ,
    cell: preset.terrainCell,
    height: samsunHeight,
    color: samsunColor,
    chunkCells: Math.round(120 / preset.terrainCell),
    lodDistance: 260,
    uvScale: 7,
  });
  await terrain.build(scene, materials.get("terrain"), ctx.yieldFrame);
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const collision = new CollisionWorld(ground, -100, L.bounds);
  const anchors = new Map<string, Vector3>();
  const at = (x: number, z: number, dy = 0) => new Vector3(x, ground(x, z) + dy, z);
  const plateauY = ground(0, 0);

  const statics = new Map<MaterialKey, GeoBuilder>();
  const B = (key: MaterialKey) => {
    let b = statics.get(key);
    if (!b) {
      b = new GeoBuilder();
      statics.set(key, b);
    }
    return b;
  };
  registerPrefabs(prefabs);
  const place = (name: string, x: number, z: number, rotY = 0, dy = 0, scale = 1) => prefabs.place(name, x, ground(x, z) + dy, z, { rotY, scale });

  // ------------------------------------------------------------------ the post
  ctx.progress(0.3, "Karakol kuruluyor");
  await ctx.yieldFrame();
  const bk = L.barrack;
  place("karakol", bk.x, bk.z, bk.rot, -0.3);
  collision.addBox(bk.x, bk.z, 12.4, 7.4, bk.rot, -100, plateauY + 9, { walkable: false });
  // Flag on a tall pole.
  {
    const fx0 = L.flag.x;
    const fz0 = L.flag.z;
    const y0 = ground(fx0, fz0);
    B("darkWood").cylinder(fx0, y0, fz0, 0.09, 0.06, 11, { segments: 6, color: hexColor("#4e3820") });
    B("gold").sphere(fx0, y0 + 11.1, fz0, 0.16, { segments: 6, rings: 4 });
    B("stone").cylinder(fx0, y0 - 0.2, fz0, 0.9, 1.1, 0.6, { segments: 8, color: hexColor("#a39c8e") });
    prefabs.place("flag", fx0 + 1.32, y0 + 9.9, fz0, { rotY: 0 });
    collision.addCircle(fx0, fz0, 1.1, -100, y0 + 1, { walkable: false });
  }
  // Bell tents in rows.
  const t = L.tents;
  for (let x = t.x0; x <= t.x1; x += 7) {
    for (let z = t.z0; z <= t.z1; z += 7) {
      place("tent", x, z, rnd.range(0, Math.PI));
      collision.addCircle(x, z, 2.1, -100, plateauY + 3, { walkable: false });
    }
  }
  // Camp kitchen: a cauldron over a fire between the tents and the karakol.
  place("campfire", -2, -22, 0);
  place("kazan", -2, -22, 0.4);
  collision.addCircle(-2, -22, 1.0, -100, plateauY + 1.2, { walkable: false });
  fx.campfire(at(-2, -22, 0.05));
  place("rifles", 4, -10, 0.3);
  collision.addCircle(4, -10, 0.5, -100, plateauY + 1.3, { walkable: false });
  place("rifles", 30, 0, 1.1);
  collision.addCircle(30, 0, 0.5, -100, plateauY + 1.3, { walkable: false });
  // Field gun on the north rim, ammunition beside it.
  place("gun", L.gun.x, L.gun.z, 0.2);
  collision.addBox(L.gun.x, L.gun.z - 0.4, 2.0, 3.6, 0.2, -100, plateauY + 2, { walkable: false });
  place("ammo", L.gun.x + 3, L.gun.z - 1, 0.5);
  collision.addBox(L.gun.x + 3, L.gun.z - 1, 2.2, 0.8, 0.5, -100, plateauY + 1, { walkable: false });
  place("sandbags6", L.gun.x, L.gun.z + 2.4, 0.2, -0.1);
  // Lookout trench with the tripod binoculars, facing the sea.
  const lk = L.lookout;
  place("sandbags10", lk.x, lk.z + 1.6, 0, -0.1);
  collision.addBox(lk.x, lk.z + 1.6, 10, 0.5, 0, -100, plateauY + 0.85, { walkable: false });
  place("sandbags4", lk.x - 5.2, lk.z, Math.PI / 2, -0.1);
  place("sandbags4", lk.x + 5.2, lk.z, Math.PI / 2, -0.1);
  // A timber watchtower beside the trench lifts the lookout's view over the brow of the hill.
  const tw = { x: lk.x - 7.5, z: lk.z - 1 };
  const twY = ground(tw.x, tw.z);
  const towerH = 4.6;
  {
    const wd = B("darkWood");
    const col = hexColor("#5a4028");
    for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) {
      wd.box(tw.x + dx, twY + towerH / 2 + 0.6, tw.z + dz, 0.22, towerH + 1.2, 0.22, { color: col });
      collision.addBox(tw.x + dx, tw.z + dz, 0.26, 0.26, 0, -100, twY + towerH + 1.4, { walkable: false });
    }
    B("wood").box(tw.x, twY + towerH - 0.08, tw.z, 3.4, 0.16, 3.4, { uvScale: 2, color: hexColor("#8a6440") });
    for (const s of [-1, 1]) {
      wd.box(tw.x, twY + towerH + 0.55, tw.z + s * 1.62, 3.3, 0.08, 0.08, { color: col });
      wd.box(tw.x + s * 1.62, twY + towerH + 0.55, tw.z, 0.08, 0.08, 3.3, { color: col });
      // Diagonal braces.
      wd.pushTRS(tw.x + s * 1.4, twY + towerH / 2, tw.z, 0, 1, 0.9 * s, 0);
      wd.box(0, 0, 0, 0.1, towerH * 0.9, 0.1, { color: col });
      wd.pop();
    }
    // Ladder on the south side.
    for (const dx of [-0.35, 0.35]) wd.box(tw.x + dx, twY + towerH / 2, tw.z - 1.75, 0.08, towerH, 0.08, { color: col });
    for (let r = 0.4; r < towerH; r += 0.42) wd.box(tw.x, twY + r, tw.z - 1.75, 0.72, 0.05, 0.05, { color: col });
    // Canvas sun roof.
    B("cloth").box(tw.x, twY + towerH + 2.1, tw.z, 3.6, 0.06, 3.6, { color: hexColor("#cfc4a2") });
    collision.addBox(tw.x, tw.z, 3.4, 3.4, 0, twY + towerH - 0.3, twY + towerH, { walkable: true, tag: "wood" });
  }
  prefabs.place("tripod", tw.x, twY + towerH - 0.55, tw.z + 1.5, {});
  // Stand at the front rail, between the corner posts, so they stay out of the view.
  const lookoutStand = new Vector3(tw.x, twY + towerH, tw.z + 1.0);
  anchors.set("durbun", at(tw.x, tw.z - 2.6));
  // Where Mustafa Kemal Paşa stands looking out to sea, east of the trench.
  const overlook = at(lk.x + 7.5, lk.z + 1.6);
  anchors.set("selam", at(lk.x + 7.5, lk.z - 1.0));

  // Parade ground: the commander's spot faces south toward the ranks.
  const pd = L.parade;
  const paradeStand = at(pd.x, pd.line);
  anchors.set("tören", paradeStand.clone());
  const commander = at(pd.x, pd.commanderZ);

  // Firing range: sandbag firing line facing west, six target stands down the slope.
  const rg = L.range;
  place("sandbags6", rg.x - 1.6, rg.z, Math.PI / 2, -0.1);
  collision.addBox(rg.x - 1.6, rg.z, 0.5, 6, 0, -100, plateauY + 0.85, { walkable: false });
  const rangeStand = at(rg.x, rg.z);
  anchors.set("atis", rangeStand.clone());
  const targets: RangeTarget[] = L.targets.map(([x, z], i) => {
    const rot = Math.atan2(rg.x - x, rg.z - z);
    const y = ground(x, z);
    prefabs.place("targetStand", x, y, z, { rotY: rot });
    const face = new TransformNode(`target-${i}`, scene);
    face.position.set(x, y + 0.35, z);
    face.rotation.y = rot;
    prefabs.buildUnique(`target-${i}`, S.targetFace(), face);
    face.rotation.x = -Math.PI / 2;
    const normal = new Vector3(Math.sin(rot), 0, Math.cos(rot));
    return { face, center: new Vector3(x, y + 1.25, z), normal };
  });

  // Telegraph line along the road, a split-rail fence round the rim.
  for (const [x, z] of [
    [16, -22],
    [40, -40],
    [64, -64],
    [90, -88],
  ]) {
    place("pole", x, z, 0.8);
    collision.addCircle(x, z, 0.25, -100, ground(x, z) + 6, { walkable: false });
  }
  for (let a = -2.6; a < 0.1; a += 0.21) {
    const r = L.plateauRadius + 3;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (onPath(x, z, 4)) continue;
    place("fence", x, z, -a + Math.PI / 2);
  }

  // The path down to the farm.
  anchors.set("koy_yolu", at(L.koyYolu.x, L.koyYolu.z));
  const fm = L.farm;
  place("farmhouse", fm.x, fm.z, 0.7, -0.4);
  collision.addBox(fm.x, fm.z, 9, 7, 0.7, -100, ground(fm.x, fm.z) + 7, { walkable: false });
  place("haystack", fm.x + 9, fm.z + 6, 0, 0, 0.6);
  for (let k = 0; k < 4; k++) place("fence", fm.x - 6 + k * 4.1, fm.z + 8.5, 0.05);

  // ------------------------------------------------------------- vegetation
  ctx.progress(0.5, "Yamaçlar ağaçlanıyor");
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
  for (let i = 0; i < 1600 * density; i++) {
    const x = rnd.range(-520, 520);
    const z = rnd.range(-400, 270);
    const r = Math.hypot(x, z);
    if (r < L.plateauRadius + 9) continue;
    if (onPath(x, z, 5)) continue;
    // Keep the range's line of fire and the farm yard clear.
    if (x < -24 && x > -118 && Math.abs(z - 4) < 28) continue;
    if (Math.hypot(x - fm.x, z - fm.z) < 16) continue;
    const y = ground(x, z);
    if (y < 3) continue;
    const kind = rnd.next();
    if (kind < 0.45) add(`oak${rnd.int(1, 3)}`, { x, y: y - 0.2, z, rotY: rnd.range(0, 6.28), scale: rnd.range(0.85, 1.35) });
    else if (kind < 0.8) add(`hazel${rnd.int(1, 2)}`, { x, y: y - 0.1, z, rotY: rnd.range(0, 6.28), scale: rnd.range(0.8, 1.4) });
    else add(`pine${rnd.int(1, 3)}`, { x, y: y - 0.2, z, rotY: rnd.range(0, 6.28), scale: rnd.range(0.7, 1.05) });
    if (r < 125) collision.addCircle(x, z, 0.5, -100, y + 4, { walkable: false });
  }

  // ------------------------------------------------------------- town & harbour
  ctx.progress(0.62, "Samsun ve liman");
  await ctx.yieldFrame();
  for (let x = -280; x <= 300; x += 15) {
    for (let z = 292; z <= 350; z += 14) {
      if (Math.abs(x - L.pier.x) < 26 && z > 336) continue;
      if (rnd.chance(0.22)) continue;
      const hx = x + rnd.range(-4, 4);
      const hz = z + rnd.range(-3, 3);
      const gy = ground(hx, hz);
      if (gy < 1) continue;
      add(`house${rnd.int(0, 5)}`, { x: hx, y: gy - 0.2, z: hz, rotY: rnd.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rnd.range(-0.1, 0.1), tint: rnd.pick([[1, 1, 1, 1], [1.05, 1.02, 0.95, 1], [0.95, 0.97, 1.02, 1]] as [number, number, number, number][]) });
    }
  }
  for (const [x, z] of [
    [-70, 318],
    [120, 312],
  ]) {
    const n = place("mosque", x, z, 0.2, -0.3);
    void n;
  }
  for (const x of [8, 76]) place("warehouse", x, 352, 0, -0.2);
  {
    const pl = 46;
    const pier = new TransformNode("pier", scene);
    pier.position.set(L.pier.x, 0.9, L.pier.z + pl / 2 - 6);
    prefabs.buildUnique("pier", P.pier(pl, 5), pier);
  }

  // Ships: the warship and a merchant steamer at anchor, fishing boats, and the Bandırma.
  const shipNode = (name: string, x: number, z: number, rot: number) => {
    const node = new TransformNode(`ship-${name}`, scene);
    node.position.set(x, 0, z);
    node.rotation.y = rot;
    prefabs.place(name, 0, 0, 0, { parent: node });
    return node;
  };
  const sh = L.ships;
  const warship = shipNode("warship", sh.warship.x, sh.warship.z, sh.warship.rot);
  const steamer = shipNode("merchant", sh.steamer.x, sh.steamer.z, sh.steamer.rot);
  const bandirma = shipNode("bandirma", sh.bandirmaFrom.x, sh.bandirmaFrom.z, Math.PI / 2);
  bandirma.setEnabled(false);
  const boats = new TransformNode("boats", scene);
  boats.position.set(-30, 0, 392);
  for (let k = 0; k < 4; k++) prefabs.place("boat", k * 9 - 12, 0.2, rnd.range(-6, 6), { rotY: rnd.range(0, 6.28), parent: boats });
  fx.smokeColumn(new Vector3(sh.warship.x, 12, sh.warship.z), 0.5);
  const bandirmaSmoke = fx.smokeColumn(new Vector3(sh.bandirmaFrom.x, 9, sh.bandirmaFrom.z), 0.45);
  fx.smokeColumn(at(bk.x + 3.5, bk.z, 8.6), 0.18);
  const ships: SeaShip[] = [
    { id: "warship", name: "İngiliz savaş gemisi", info: "Gri, iki bacalı, toplu bir İngiliz savaş gemisi. Mart'tan beri limanda demirli; şehirde İngiliz askerleri var.", node: warship, radius: 48, midY: 6 },
    { id: "steamer", name: "Yük gemisi (şilep)", info: "Kahverengi gövdeli bir şilep: tütün balyalarını İstanbul'a taşıyor.", node: steamer, radius: 32, midY: 5 },
    { id: "boats", name: "Balıkçı kayıkları", info: "Sabah avından dönen balıkçılar. Hamsi mevsimi bitti, şimdi palamut beklenir.", node: boats, radius: 22, midY: 1 },
    { id: "bandirma", name: "Bandırma Vapuru", info: "Siyah gövdeli, tek bacalı eski bir yolcu vapuru: İstanbul'dan Mustafa Kemal Paşa'yı ve karargâhını getiriyor!", node: bandirma, radius: 26, midY: 5 },
  ];

  for (const [key, b] of statics) {
    if (b.isEmpty) continue;
    const m: Mesh = b.toMesh(`samsun-${key}`, scene);
    m.material = materials.get(key);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    pipeline.addShadowCaster(m);
  }
  for (const [name, list] of scatter) prefabs.scatter(name, list);

  // ------------------------------------------------------------------ navigation
  ctx.progress(0.85, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 3, ground);
  nav.addRegion(L.bounds.minX + 4, L.bounds.minZ + 4, L.bounds.maxX - 4, L.bounds.maxZ - 4);
  nav.build();

  const surfaceAt = (x: number, z: number): Surface => (onPath(x, z, 2) || Math.hypot(x, z) < L.plateauRadius - 6 ? "dirt" : "grass");

  return {
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt,
    terrain,
    targets,
    ships,
    bandirmaSmoke,
    range: { stand: rangeStand, facing: -Math.PI / 2 },
    lookout: { stand: lookoutStand, facing: 0 },
    parade: { stand: paradeStand, facing: 0, commander },
    overlook,
    plateauY,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  prefabs.register("karakol", S.karakol);
  prefabs.register("tent", S.bellTent);
  prefabs.register("sandbags4", () => S.sandbags(4));
  prefabs.register("sandbags6", () => S.sandbags(6));
  prefabs.register("sandbags10", () => S.sandbags(10));
  prefabs.register("targetStand", S.targetStand);
  prefabs.register("tripod", S.binocularTripod);
  prefabs.register("gun", S.fieldGun);
  prefabs.register("rifles", S.rifleStack);
  prefabs.register("ammo", S.ammoBoxes);
  prefabs.register("pole", S.telegraphPole);
  prefabs.register("fence", S.fence);
  prefabs.register("farmhouse", S.farmhouse);
  prefabs.register("mosque", S.mosque);
  prefabs.register("warehouse", S.warehouse);
  prefabs.register("bandirma", S.bandirma);
  prefabs.register("warship", S.warship);
  prefabs.register("merchant", S.merchantShip);
  prefabs.register("boat", P.rowingBoat);
  prefabs.register("flag", () => A.flag1920(2.6));
  prefabs.register("haystack", M.haystack);
  prefabs.register("campfire", P.campfire);
  prefabs.register("kazan", P.kazan);
  for (let i = 0; i < 6; i++) prefabs.register(`house${i}`, () => P.houseDef(i));
  for (let i = 1; i <= 3; i++) prefabs.register(`oak${i}`, () => P.broadTree(i + 4));
  for (let i = 1; i <= 2; i++) prefabs.register(`hazel${i}`, () => S.hazelBush(i));
  for (let i = 1; i <= 3; i++) prefabs.register(`pine${i}`, () => M.redPine(i));
}
