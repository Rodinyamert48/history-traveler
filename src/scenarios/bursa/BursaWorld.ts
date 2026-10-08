import { Color3, PBRMaterial, PointLight, TransformNode, Vector3, type Mesh, type ParticleSystem } from "@babylonjs/core";
import { GeoBuilder, hexColor, shade } from "../../assets/GeoBuilder";
import type { PrefabLibrary, ScatterItem } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import * as B from "../../assets/PrefabsBursa";
import * as K from "../../assets/PrefabsKayseri";
import * as M from "../../assets/PrefabsMugla";
import type { Surface } from "../../entities/Player";
import type { MaterialKey } from "../../rendering/MaterialLibrary";
import { Random } from "../../utils/random";
import { CollisionWorld } from "../../world/CollisionWorld";
import { HeightfieldTerrain } from "../../world/HeightfieldTerrain";
import { NavGraph } from "../../world/NavGraph";
import type { ScenarioWorld, WorldBuildContext } from "../common/FpsScenario";
import { bursaColor, bursaHeight, GROUND_Y, LAYOUT } from "./layout";

export interface BursaWorld extends ScenarioWorld {
  terrain: HeightfieldTerrain;
  /** Checkpoint: where the guard stands, where carts stop outside, and the cart nodes. */
  checkpoint: { stand: Vector3; facing: number; cartStop: Vector3; cartFrom: Vector3; cartTo: { bursa: Vector3; hisar: Vector3; back: Vector3 } };
  carts: TransformNode[];
  roast: { spit: TransformNode; lamb: Mesh; material: PBRMaterial; stand: Vector3; facing: number; light: PointLight; fire: ParticleSystem; smoke: ParticleSystem };
  props: { logs: TransformNode[]; tray: TransformNode; sancaks: TransformNode[] };
  rampart: Vector3;
  groundY: number;
}

/**
 * Builds Balabancık Hisarı: its walls with a rampart walk, the gate with the checkpoint
 * barrier, the keep, Orhan Gazi's tent and war table, kitchen with the roasting pit, stable,
 * barracks, well and armory; outside the plain, the guarded road, Bursa's citadel and Uludağ.
 */
export async function buildBursaWorld(ctx: WorldBuildContext): Promise<BursaWorld> {
  const { scene, prefabs, materials, pipeline, preset, fx } = ctx;
  const L = LAYOUT;
  const rnd = new Random(1326);
  ctx.progress(0.05, "Bursa ovası şekillendiriliyor");
  const terrain = new HeightfieldTerrain({
    minX: L.terrainRect.minX,
    minZ: L.terrainRect.minZ,
    sizeX: L.terrainRect.sizeX,
    sizeZ: L.terrainRect.sizeZ,
    cell: preset.terrainCell,
    height: bursaHeight,
    color: bursaColor,
    chunkCells: Math.round(140 / preset.terrainCell),
    lodDistance: 280,
    uvScale: 7,
  });
  await terrain.build(scene, materials.get("terrain"), ctx.yieldFrame);
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const GY = GROUND_Y;
  const collision = new CollisionWorld(() => GY, -100, L.bounds);
  const anchors = new Map<string, Vector3>();
  const at = (x: number, z: number, dy = 0) => new Vector3(x, GY + dy, z);

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
  const place = (name: string, x: number, z: number, rotY = 0, scale = 1, dy = 0) => prefabs.place(name, x, GY + dy, z, { rotY, scale });

  // ------------------------------------------------------------------ the walls
  ctx.progress(0.25, "Hisar surları örülüyor");
  await ctx.yieldFrame();
  const W = L.wall;
  const walkH = L.walk.y;
  const wallCol = hexColor("#b0a48e");
  const st = S("stone");
  /** A wall block (world AABB) that is walkable on top, with merlons on its outer edge. */
  const wallBlock = (x0: number, x1: number, z0: number, z1: number, outer: "n" | "s" | "e" | "w") => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    st.box(cx, GY + walkH / 2, cz, x1 - x0, walkH, z1 - z0, { uvScale: 3, color: wallCol, jitter: 0.03 });
    collision.addBox(cx, cz, x1 - x0, z1 - z0, 0, -100, GY + walkH, { walkable: true, tag: "stone" });
    // Parapet with merlons along the outer edge (and a continuous collider so no-one falls out).
    const along = outer === "n" || outer === "s" ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(along / 1.6));
    const ox = outer === "e" ? x1 - 0.35 : outer === "w" ? x0 + 0.35 : cx;
    const oz = outer === "n" ? z1 - 0.35 : outer === "s" ? z0 + 0.35 : cz;
    if (outer === "n" || outer === "s") {
      st.box(cx, GY + walkH + 0.4, oz, x1 - x0, 0.8, 0.7, { uvScale: 3, color: shade(wallCol, 0.95) });
      for (let i = 0; i < n; i++) st.box(x0 + (i + 0.5) * (along / n), GY + walkH + 1.15, oz, 0.8, 0.7, 0.7, { color: shade(wallCol, 0.92) });
      collision.addBox(cx, oz, x1 - x0, 0.7, 0, -100, GY + walkH + 1.6, { walkable: false });
    } else {
      st.box(ox, GY + walkH + 0.4, cz, 0.7, 0.8, z1 - z0, { uvScale: 3, color: shade(wallCol, 0.95) });
      for (let i = 0; i < n; i++) st.box(ox, GY + walkH + 1.15, z0 + (i + 0.5) * (along / n), 0.7, 0.7, 0.8, { color: shade(wallCol, 0.92) });
      collision.addBox(ox, cz, 0.7, z1 - z0, 0, -100, GY + walkH + 1.6, { walkable: false });
    }
  };
  const T = W.t;
  wallBlock(W.x0 - T, W.x1 + T, W.z1, W.z1 + T, "n");
  wallBlock(W.x0 - T, W.x1 + T, W.z0 - T, W.z0, "s");
  wallBlock(W.x1, W.x1 + T, W.z0, W.z1, "e");
  // West wall with the gate.
  wallBlock(W.x0 - T, W.x0, W.z0, L.gate.z0, "w");
  wallBlock(W.x0 - T, W.x0, L.gate.z1, W.z1, "w");
  // Lintel above the gate passage (the passage itself stays open below 5 m).
  st.box(W.x0 - T / 2, GY + 5 + (walkH - 5) / 2, 0, T, walkH - 5, L.gate.z1 - L.gate.z0, { color: wallCol });
  collision.addBox(W.x0 - T / 2, 0, T, L.gate.z1 - L.gate.z0, 0, GY + 5, GY + walkH, { walkable: true, tag: "stone" });
  st.box(W.x0 - T / 2, GY + walkH + 0.4, 0, 0.7, 0.8, 6, { color: wallCol });
  // Corner towers and the gate towers.
  const towerP = P.towerDef(5.4, 10.5);
  for (const [x, z] of [
    [W.x0 - T / 2, W.z0 - T / 2],
    [W.x1 + T / 2, W.z0 - T / 2],
    [W.x0 - T / 2, W.z1 + T / 2],
    [W.x1 + T / 2, W.z1 + T / 2],
    [W.x0 - T / 2, L.gate.z0 - 2.6],
    [W.x0 - T / 2, L.gate.z1 + 2.6],
  ]) {
    const n = new TransformNode(`tower-${x}-${z}`, scene);
    n.position.set(x, GY, z);
    prefabs.buildUnique(`tower-${x}-${z}`, towerP, n);
    collision.addBox(x, z, 5.4, 5.4, 0, -100, GY + 10.5, { walkable: false });
  }
  // Gate leaves standing open inward, and the checkpoint barrier inside the passage.
  const dw = S("darkWood");
  for (const s of [-1, 1]) {
    dw.pushTRS(W.x0, GY, s * L.gate.z1, 0);
    dw.box(1.3, 2.4, -s * 0.1, 2.6, 4.8, 0.14, { color: hexColor("#5a3a22") });
    dw.pop();
    collision.addBox(W.x0 + 1.3, s * (L.gate.z1 - 0.1), 2.6, 0.2, 0, -100, GY + 5, { walkable: false });
  }
  place("barrier", L.barrier.x, 0, Math.PI / 2);
  collision.addBox(L.barrier.x, 0, 0.4, L.gate.z1 - L.gate.z0, 0, -100, GY + 2.3, { walkable: false });
  // Stairs up to the rampart along the south wall.
  {
    const x0 = -6;
    const x1 = -22;
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const x = x0 + (x1 - x0) * (t0 + 0.5 / steps);
      const h = walkH * (i + 1) / steps;
      st.box(x, GY + h / 2, W.z0 + 0.8, Math.abs(x1 - x0) / steps + 0.02, h, 1.6, { color: shade(wallCol, 0.9) });
    }
    collision.addRamp((x0 + x1) / 2, W.z0 + 0.8, 1.6, Math.abs(x1 - x0), -Math.PI / 2, GY, GY + walkH, "stone");
    // Landing at the top: a solid bastion joining the stairs to the west rampart walk.
    const lx0 = W.x0;
    const lx1 = x1 + 0.6;
    const lz0 = W.z0 + 1.6;
    const lz1 = W.z0 + 4.2;
    st.box((lx0 + lx1) / 2, GY + walkH / 2, (lz0 + lz1) / 2, lx1 - lx0, walkH, lz1 - lz0, { uvScale: 3, color: shade(wallCol, 0.93) });
    collision.addBox((lx0 + lx1) / 2, (lz0 + lz1) / 2, lx1 - lx0, lz1 - lz0, 0, -100, GY + walkH, { walkable: true, tag: "stone" });
  }
  const rampart = at(-27.2, -12, walkH);
  anchors.set("sur", rampart.clone());

  // --------------------------------------------------------------- courtyard
  ctx.progress(0.4, "Avlu, otağ ve iç kale");
  await ctx.yieldFrame();
  const kp = L.keep;
  {
    const n = new TransformNode("keep", scene);
    n.position.set(kp.x, GY, kp.z);
    prefabs.buildUnique("keep", P.towerDef(kp.w, kp.h, kp.d), n);
    collision.addBox(kp.x, kp.z, kp.w, kp.d, 0, -100, GY + kp.h, { walkable: false });
    S("matte").box(kp.x, GY + 1.4, kp.z + kp.d / 2 + 0.03, 1.6, 2.8, 0.08, { color: hexColor("#3a2414") });
  }
  // Orhan Gazi's tent (otağ), the tuğs and the war table in front of it.
  const ot = L.otag;
  place("otag", ot.x, ot.z, -Math.PI / 2, 0.6);
  collision.addCircle(ot.x, ot.z, 4.4, -100, GY + 6, { walkable: false });
  for (const dz of [-3.6, 3.6]) {
    place("tug", ot.x - 6.6, ot.z + dz, 0);
    collision.addCircle(ot.x - 6.6, ot.z + dz, 0.25, -100, GY + 5, { walkable: false });
  }
  const wt = L.warTable;
  place("warTable", wt.x, wt.z, Math.PI / 2);
  collision.addBox(wt.x, wt.z, 1.6, 2.5, 0, -100, GY + 1, { walkable: false });
  anchors.set("savas_masasi", at(wt.x - 1.6, wt.z));
  const tray = new TransformNode("kebap-tray", scene);
  tray.position.set(wt.x + 0.2, GY + 0.93, wt.z + 0.75);
  prefabs.buildUnique("kebap-tray", B.kebapTray(), tray, false);
  tray.setEnabled(false);
  anchors.set("otag_sofra", at(wt.x - 1.4, wt.z + 1.2));
  // Kitchen: lean-to, roasting pit with the spit, firewood.
  const kt = L.kitchen;
  place("sundurma", kt.x, kt.z - 1, 0);
  for (const [x, z] of [
    [kt.x - 2.2, kt.z - 2.6],
    [kt.x + 2.2, kt.z - 2.6],
    [kt.x - 2.2, kt.z + 0.6],
    [kt.x + 2.2, kt.z + 0.6],
  ])
    collision.addCircle(x, z, 0.15, -100, GY + 3, { walkable: false });
  const sp = L.spit;
  place("roastPit", sp.x, sp.z, 0);
  collision.addBox(sp.x, sp.z, 3.3, 1.2, 0, -100, GY + 1.3, { walkable: false });
  {
    const e = new TransformNode("embers", scene);
    e.position.set(sp.x, GY, sp.z);
    for (const m of prefabs.buildUnique("embers", B.embers(), e, false)) pipeline.glowLayer?.addIncludedOnlyMesh(m);
  }
  const spit = new TransformNode("spit", scene);
  spit.position.set(sp.x, GY + 1.15, sp.z);
  const parts = B.spitLamb();
  prefabs.buildUnique("spit", parts.spit, spit);
  const lamb = prefabs.buildUnique("lamb", parts.lamb, spit)[0];
  const lambMat = materials.variant("matte", "lamb");
  lambMat.albedoColor = Color3.FromHexString("#d8a090").toLinearSpace();
  lamb.material = lambMat;
  const fireLight = new PointLight("roast-light", new Vector3(sp.x, GY + 0.8, sp.z + 0.4), scene);
  fireLight.diffuse = new Color3(1, 0.55, 0.25);
  fireLight.range = 8;
  fireLight.intensity = 1.2;
  const roastFire = fx.campfire(new Vector3(sp.x, GY - 0.05, sp.z));
  roastFire.fire.emitRate = 8;
  roastFire.fire.minSize = 0.15;
  roastFire.fire.maxSize = 0.4;
  roastFire.smoke.emitRate = 1.2;
  const roastStand = at(sp.x, sp.z + 1.9);
  anchors.set("cevirme", roastStand.clone());
  anchors.set("ocak", at(sp.x + 1.9, sp.z + 0.9));
  // Firewood pile (pickup) and the logs that appear by the pit once delivered.
  place("logs", L.barracks.x + 9, L.barracks.z - 3.2, 0.3);
  collision.addBox(L.barracks.x + 9, L.barracks.z - 3.2, 2.4, 1.2, 0.3, -100, GY + 1, { walkable: false });
  anchors.set("odunluk", at(L.barracks.x + 9, L.barracks.z - 5.0));
  const logs: TransformNode[] = [];
  for (let i = 0; i < 2; i++) {
    const n = new TransformNode(`pit-logs-${i}`, scene);
    n.position.set(sp.x + 2.4, GY + 0.15 + i * 0.25, sp.z + 0.2 - i * 0.1);
    prefabs.buildUnique(`pit-logs-${i}`, M.branchBundle(), n);
    n.setEnabled(false);
    logs.push(n);
  }

  // Stable with horses, barracks, well, armory and camp clutter.
  const sb = L.stable;
  place("sundurma", sb.x, sb.z, Math.PI, 1.3);
  for (let i = 0; i < 3; i++) {
    place(`horse${i}`, sb.x - 2.6 + i * 2.6, sb.z + 0.6, Math.PI + (i - 1) * 0.15);
  }
  collision.addBox(sb.x, sb.z + 0.6, 7.4, 3.2, 0, -100, GY + 2.2, { walkable: false });
  place("haystack", sb.x + 4.6, sb.z - 3.4, 0, 0.45);
  const br = L.barracks;
  place("barracks", br.x, br.z, Math.PI);
  collision.addBox(br.x, br.z, 14.2, 5.2, 0, -100, GY + 4.6, { walkable: false });
  place("well", L.well.x, L.well.z, 0.4);
  collision.addCircle(L.well.x, L.well.z, 1.0, -100, GY + 1.1, { walkable: false });
  place("sundurma", L.armory.x, L.armory.z, 0, 0.9);
  place("rack", L.armory.x - 1, L.armory.z - 1.2, 0);
  place("armoryStock", L.armory.x + 1.4, L.armory.z - 0.6, 0);
  collision.addBox(L.armory.x, L.armory.z - 0.9, 4.4, 1.4, 0, -100, GY + 2, { walkable: false });
  for (const [name, x, z, r] of [
    ["sacks", -20, -6, 0.4],
    ["crate", -21.4, -8.2, 0.2],
    ["barrel", -19.6, -8.6, 0],
    ["sacks", 18, -2, 1.2],
    ["crate", 22, 3, 0.6],
    ["campfire", -2, 14, 0],
    ["kazan", -2, 14, 0.4],
  ] as const) {
    place(name, x, z, r);
    collision.addCircle(x, z, name === "campfire" || name === "kazan" ? 1.1 : 0.8, -100, GY + 1.2, { walkable: false });
  }
  fx.campfire(at(-2, 14, 0.05));
  // Banners along the walls (raised high for the finale).
  const sancaks: TransformNode[] = [];
  for (const [x, z, r] of [
    [-27.2, -18, 0],
    [-27.2, 18, 0],
    [0, W.z1 + T / 2, Math.PI / 2],
    [27.2, 0, Math.PI],
  ]) {
    const n = prefabs.place("sancak", x, GY + walkH, z, { rotY: r, dynamic: true }).root!;
    sancaks.push(n);
  }

  // ------------------------------------------------------------- the checkpoint
  const stand = at(L.barrier.x + 1.1, 0);
  anchors.set("kapi", stand.clone());
  const cartStop = new Vector3(W.x0 - T - 4.2, ground(W.x0 - T - 4.2, 0), 0);
  const cartFrom = new Vector3(L.road.x, ground(L.road.x, 40), 40);
  const carts: TransformNode[] = [];
  for (let i = 0; i < 2; i++) {
    const n = prefabs.place("cart", 0, 0, 0, { dynamic: true }).root!;
    n.setEnabled(false);
    carts.push(n);
  }

  // ------------------------------------------------------------- the landscape
  ctx.progress(0.6, "Bursa, Uludağ ve köyler");
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
  for (let i = 0; i < 900 * density; i++) {
    const x = rnd.range(-880, 880);
    const z = rnd.range(-700, 620);
    if (Math.hypot(x / 1.2, z) < 60) continue;
    if (Math.hypot(x - L.bursa.x, z - L.bursa.z) < L.bursa.r + 20) continue;
    const y = ground(x, z);
    if (y > 115) continue;
    add(`oak${rnd.int(1, 3)}`, { x, y: y - 0.3, z, rotY: rnd.range(0, 6.28), scale: rnd.range(0.9, 1.5) });
  }
  // Villages to the north and west.
  for (const [vx, vz] of [
    [-120, 420],
    [260, 360],
    [-420, 80],
  ]) {
    for (let k = 0; k < 8; k++) {
      const x = vx + rnd.range(-40, 40);
      const z = vz + rnd.range(-30, 30);
      add(`house${rnd.int(0, 5)}`, { x, y: ground(x, z) - 0.3, z, rotY: rnd.range(0, 6.28), tint: [1, 1, 1, 1] });
    }
  }
  // Bursa's citadel: a ring of walls and towers on its hill, roofs and a domed church inside.
  {
    const b = L.bursa;
    const ring = 18;
    const wallB = S("stone");
    const pts: Vector3[] = [];
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const r = b.r * (0.9 + 0.12 * Math.sin(a * 3 + 1));
      const x = b.x + Math.cos(a) * r * 1.25;
      const z = b.z + Math.sin(a) * r;
      pts.push(new Vector3(x, ground(x, z), z));
    }
    for (let k = 0; k < ring; k++) {
      const p0 = pts[k];
      const p1 = pts[(k + 1) % ring];
      const len = Vector3.Distance(p0, p1);
      const ang = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      const y = Math.min(p0.y, p1.y);
      wallB.pushTRS((p0.x + p1.x) / 2, y, (p0.z + p1.z) / 2, ang);
      wallB.box(0, 4.5, 0, 2.2, 11, len, { uvScale: 4, color: hexColor("#9a8e7c") });
      wallB.pop();
      wallB.box(p0.x, p0.y + 6, p0.z, 5, 14, 5, { uvScale: 4, color: hexColor("#a49884") });
    }
    for (let k = 0; k < 90 * density; k++) {
      const a = rnd.range(0, Math.PI * 2);
      const r = Math.sqrt(rnd.next()) * b.r * 0.82;
      const x = b.x + Math.cos(a) * r * 1.2;
      const z = b.z + Math.sin(a) * r;
      add(`house${rnd.int(0, 5)}`, { x, y: ground(x, z) - 0.3, z, rotY: rnd.range(0, 6.28), tint: [1.02, 0.98, 0.94, 1] });
    }
    const cy = ground(b.x, b.z);
    S("plaster").box(b.x + 10, cy + 5, b.z - 6, 16, 10, 12, { color: hexColor("#d8ccb4") });
    S("iron").sphere(b.x + 10, cy + 11, b.z - 6, 6, { segments: 10, rings: 6, scaleY: 0.6, color: hexColor("#8a8c90") });
  }
  // Aktimur Hisarı, the other siege fort, on a hill to the east.
  {
    const ax = 330;
    const az = -260;
    const ay = ground(ax, az);
    S("stone").box(ax, ay + 4, az, 34, 8, 26, { uvScale: 4, color: hexColor("#a89c86") });
    for (const [dx, dz] of [
      [-17, -13],
      [17, -13],
      [-17, 13],
      [17, 13],
    ])
      S("stone").box(ax + dx, ay + 5.5, az + dz, 5, 11, 5, { color: hexColor("#a89c86") });
  }
  // Uludağ beyond Bursa.
  {
    const m = B.mountain(240, 360, 26).toMesh("uludag", scene);
    m.position.set(L.uludag.x, 40, L.uludag.z);
    const mat = new PBRMaterial("uludag", scene);
    mat.albedoColor = new Color3(0.85, 0.87, 0.92);
    mat.roughness = 1;
    mat.metallic = 0;
    mat.emissiveColor = new Color3(0.12, 0.14, 0.18);
    m.material = mat;
    m.isPickable = false;
    m.freezeWorldMatrix();
  }

  for (const [key, b] of statics) {
    if (b.isEmpty) continue;
    const m: Mesh = b.toMesh(`bursa-${key}`, scene);
    m.material = materials.get(key);
    m.receiveShadows = true;
    m.isPickable = false;
    m.freezeWorldMatrix();
    pipeline.addShadowCaster(m);
  }
  for (const [name, list] of scatter) prefabs.scatter(name, list);

  ctx.progress(0.85, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 1.4, () => GY);
  nav.addRegion(W.x0 + 0.6, W.z0 + 0.6, W.x1 - 0.6, W.z1 - 0.6);
  nav.build();

  return {
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt: (): Surface => "dirt",
    terrain,
    checkpoint: {
      stand,
      facing: -Math.PI / 2,
      cartStop,
      cartFrom,
      cartTo: { bursa: new Vector3(-36, ground(-36, -120), -120), hisar: new Vector3(W.x0 - T - 1.5, GY, 0), back: cartFrom.clone() },
    },
    carts,
    roast: { spit, lamb, material: lambMat, stand: roastStand, facing: Math.PI, light: fireLight, fire: roastFire.fire, smoke: roastFire.smoke },
    props: { logs, tray, sancaks },
    rampart,
    groundY: GY,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  prefabs.register("barrier", () => B.barrier(6));
  prefabs.register("otag", P.otag);
  prefabs.register("tug", P.tug);
  prefabs.register("warTable", B.warTable);
  prefabs.register("sundurma", M.sundurma);
  prefabs.register("roastPit", B.roastPit);
  prefabs.register("logs", P.logStack);
  for (let i = 0; i < 3; i++) prefabs.register(`horse${i}`, () => B.horse(i));
  prefabs.register("haystack", M.haystack);
  prefabs.register("barracks", B.barracks);
  prefabs.register("well", B.well);
  prefabs.register("rack", P.weaponRack);
  prefabs.register("armoryStock", B.armoryStock);
  prefabs.register("sacks", P.sacks);
  prefabs.register("crate", () => P.crate(0.9));
  prefabs.register("barrel", P.barrel);
  prefabs.register("campfire", P.campfire);
  prefabs.register("kazan", P.kazan);
  prefabs.register("sancak", K.sancak);
  prefabs.register("cart", P.cart);
  for (let i = 0; i < 6; i++) prefabs.register(`house${i}`, () => P.houseDef(i));
  for (let i = 1; i <= 3; i++) prefabs.register(`oak${i}`, () => P.broadTree(i + 7));
}
