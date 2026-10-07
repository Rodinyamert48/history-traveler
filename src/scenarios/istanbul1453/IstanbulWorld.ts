import { Color3, Matrix, Mesh, TransformNode, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import { GeoBuilder, hexColor, shade, type RGBA } from "../../assets/GeoBuilder";
import type { PrefabLibrary } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import type { QualityPreset } from "../../config/qualityPresets";
import type { Surface } from "../../entities/Player";
import type { MaterialLibrary } from "../../rendering/MaterialLibrary";
import type { RenderPipeline } from "../../rendering/RenderPipeline";
import type { ParticleFX } from "../../systems/ParticleFX";
import { CollisionWorld, type BoxCollider, type Collider } from "../../world/CollisionWorld";
import { HeightfieldTerrain } from "../../world/HeightfieldTerrain";
import { NavGraph } from "../../world/NavGraph";
import { clamp, distanceToPolyline, lerp } from "../../utils/math";
import { Random } from "../../utils/random";
import { istanbulColor, istanbulHeight, LAYOUT, ROADS, slipwayInfo } from "./layout";

export interface CannonTarget {
  id: string;
  name: string;
  center: Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  /** Meshes that crumble when the target is destroyed. */
  breakable: AbstractMesh[];
  marker: Mesh;
}

export interface IstanbulWorld {
  terrain: HeightfieldTerrain;
  collision: CollisionWorld;
  nav: NavGraph;
  anchors: Map<string, Vector3>;
  groundAt(x: number, z: number, feetY?: number): number;
  surfaceAt(x: number, z: number, feetY: number): Surface;
  ship: TransformNode;
  launchedShips: TransformNode[];
  sahi: { base: TransformNode; yaw: TransformNode; pitch: TransformNode; recoil: TransformNode; muzzle: TransformNode; deliveredBalls: AbstractMesh[] };
  targets: CannonTarget[];
  breach: { intact: AbstractMesh[]; rubble: AbstractMesh[]; wallCollider: BoxCollider; rubbleColliders: Collider[]; scaffold: AbstractMesh[]; scaffoldColliders: BoxCollider[] };
  greaseMarks: Map<string, AbstractMesh[]>;
  captureFlags: { id: string; byz: TransformNode; ott: TransformNode }[];
  zoneRings: Mesh[];
  finalFlag: TransformNode;
  defenderSpots: Vector3[];
  rope: Mesh;
  /** Static meshes for possible future toggles. */
  wallSolids: BoxCollider[];
}

interface BuildContext {
  scene: Scene;
  prefabs: PrefabLibrary;
  materials: MaterialLibrary;
  pipeline: RenderPipeline;
  fx: ParticleFX;
  preset: QualityPreset;
  progress(f: number, s: string): void;
  yieldFrame(): Promise<void>;
}

const L = LAYOUT;
/** Walls/towers extend this far below their base so they stay grounded where the terrain dips (shores, moat). */
const FOOT = 9;

/**
 * Builds the explorable "temsili İstanbul" of 1453: terrain, the Theodosian land walls,
 * the Ottoman camp, the battery, the Galata slipway, the Golden Horn with its chain, fleets,
 * the city with Hagia Sophia, colliders and the navigation graph.
 */
export async function buildIstanbulWorld(ctx: BuildContext): Promise<IstanbulWorld> {
  const { scene, prefabs, materials, pipeline, preset } = ctx;
  const rnd = new Random(1453);

  // ---------------------------------------------------------------------- terrain
  ctx.progress(0.05, "Arazi şekillendiriliyor");
  const terrain = new HeightfieldTerrain({
    minX: L.terrainRect.minX,
    minZ: L.terrainRect.minZ,
    sizeX: L.terrainRect.sizeX,
    sizeZ: L.terrainRect.sizeZ,
    cell: preset.terrainCell,
    height: istanbulHeight,
    color: istanbulColor,
    chunkCells: Math.round(110 / preset.terrainCell),
    lodDistance: 230,
    uvScale: 7,
  });
  await terrain.build(scene, materials.get("terrain"), ctx.yieldFrame);
  const ground = (x: number, z: number) => terrain.heightAt(x, z);

  const collision = new CollisionWorld(ground, L.waterLevel, L.bounds);
  const anchors = new Map<string, Vector3>();
  const at = (x: number, z: number, dy = 0) => new Vector3(x, ground(x, z) + dy, z);

  // Static merged geometry per material for unique architecture.
  const statics = new Map<string, GeoBuilder>();
  const S = (key: Parameters<MaterialLibrary["get"]>[0], group = "main") => {
    const k = `${group}|${key}`;
    let b = statics.get(k);
    if (!b) {
      b = new GeoBuilder();
      statics.set(k, b);
    }
    return b;
  };
  const flushStatics = (group: string, castShadows = true, receive = true): Mesh[] => {
    const out: Mesh[] = [];
    for (const [k, b] of statics) {
      const [g, key] = k.split("|");
      if (g !== group || b.isEmpty) continue;
      const m = b.toMesh(`static-${g}-${key}`, scene);
      m.material = materials.get(key as Parameters<MaterialLibrary["get"]>[0]);
      m.receiveShadows = receive;
      m.isPickable = false;
      m.freezeWorldMatrix();
      if (castShadows) pipeline.addShadowCaster(m);
      out.push(m);
      statics.delete(k);
    }
    return out;
  };
  const appendParts = (parts: P.PartSet, group: string, m: Matrix) => {
    for (const [key, b] of parts.parts) {
      const t = S(key, group);
      t.push(m);
      t.append(b);
      t.pop();
    }
  };

  registerPrefabs(prefabs);

  // ------------------------------------------------------------------ land walls
  ctx.progress(0.25, "Kara surları örülüyor");
  await ctx.yieldFrame();
  const base = L.wallBaseY;
  const outerTowers = [-150, -110, -70, -48, -12, 22, 56, 88];
  const innerTowers = [-160, -120, -80, -44, -8, 28, 64];
  const targets: CannonTarget[] = [];
  const wallSolids: BoxCollider[] = [];
  const markerMat = materials.get("fire");

  const makeMarker = (pos: Vector3): Mesh => {
    const b = new GeoBuilder();
    // Floating red-gold banner marker above a target.
    b.cylinder(0, 0, 0, 0.12, 0.12, 4, { segments: 5, color: hexColor("#d6a540") });
    b.box(0.9, 3.4, 0, 1.8, 1.1, 0.06, { color: hexColor("#ff3020") });
    const m = b.toMesh("target-marker", scene);
    m.material = markerMat;
    m.position.copyFrom(pos);
    m.isPickable = false;
    pipeline.glowLayer?.addIncludedOnlyMesh(m);
    return m;
  };

  // Outer wall segments between towers (the breach section is its own mesh).
  const outerX = L.outerWallX;
  const outerH = L.outerWallHeight;
  const breachZ0 = L.breachZ - 6;
  const breachZ1 = L.breachZ + 6;
  const outerSegs: [number, number][] = [];
  {
    const zs = [L.wallZMin, ...outerTowers, L.wallZMax];
    for (let i = 0; i < zs.length - 1; i++) {
      const a = zs[i] + (i === 0 ? 0 : 3.5);
      const b = zs[i + 1] - (i === zs.length - 2 ? 0 : 3.5);
      if (a < breachZ0 && b > breachZ1) {
        outerSegs.push([a, breachZ0], [breachZ1, b]);
      } else outerSegs.push([a, b]);
    }
  }
  for (const [z0, z1] of outerSegs) {
    const len = z1 - z0;
    appendParts(P.wallDef(len, outerH + FOOT, 2.4, true, false), "walls", Matrix.Translation(outerX, base - FOOT, (z0 + z1) / 2));
    wallSolids.push(collision.addBox(outerX, (z0 + z1) / 2, 2.4, len, 0, base - 6, base + outerH + 1.2, { walkable: false }));
  }
  // Breach section (intact until the bombardment).
  const breachIntact = new GeoBuilder();
  for (const [key, b] of P.wallDef(breachZ1 - breachZ0, outerH + FOOT, 2.4, true, false).parts) {
    void key;
    breachIntact.push(Matrix.Translation(outerX, base - FOOT, L.breachZ));
    breachIntact.append(b);
    breachIntact.pop();
  }
  const breachMesh = breachIntact.toMesh("breach-intact", scene);
  breachMesh.material = materials.get("stone");
  breachMesh.receiveShadows = true;
  pipeline.addShadowCaster(breachMesh);
  const breachCollider = collision.addBox(outerX, L.breachZ, 2.4, breachZ1 - breachZ0, 0, base - 6, base + outerH + 1.2, { walkable: false, tag: "breach" });
  // Rubble ramp after the breach.
  const rubble = new GeoBuilder();
  const rr = new Random(3);
  for (let i = 0; i < 26; i++) {
    const z = L.breachZ + rr.range(-6, 6);
    const x = outerX + rr.range(-4, 4);
    const h = Math.max(0.3, 2.4 - Math.abs(x - outerX) * 0.45);
    rubble.box(x, base + h / 2 - 0.2, z, rr.range(0.8, 2.2), h, rr.range(0.8, 2), { color: shade(hexColor("#b8ae9c"), rr.range(0.75, 1.05)), jitter: 0.1 });
  }
  const rubbleMesh = rubble.toMesh("breach-rubble", scene);
  rubbleMesh.material = materials.get("stone");
  rubbleMesh.setEnabled(false);
  const rubbleColliders = [
    collision.addRamp(outerX - 2.5, L.breachZ, 9, 3, Math.PI / 2, base, base + 1.2, "rubble"),
    collision.addRamp(outerX + 2.5, L.breachZ, 9, 3, -Math.PI / 2, base, base + 1.2, "rubble"),
  ];
  for (const c of rubbleColliders) c.enabled = false;

  // Outer towers.
  for (const z of outerTowers) {
    const isTarget = z === -70;
    const parts = P.towerDef(7, outerH + 3 + FOOT);
    if (isTarget) {
      // Split: lower body static, upper (crenellations) breakable.
      const lower = new P.PartSet();
      lower.get("stone").box(0, (outerH + 3 + FOOT) / 2, 0, 7, outerH + 3 + FOOT, 7, { uvScale: 6, skipBottom: true });
      appendParts(lower, "walls", Matrix.Translation(outerX, base - FOOT, z));
      const upperB = new GeoBuilder();
      upperB.box(0, outerH + 3 + 0.25, 0, 7.6, 0.5, 7.6, { uvScale: 6 });
      for (let i = 0; i < 4; i++)
        for (const [dx, dz] of [
          [-3 + i * 2, -3.4],
          [-3 + i * 2, 3.4],
          [-3.4, -3 + i * 2],
          [3.4, -3 + i * 2],
        ])
          upperB.box(dx, outerH + 3 + 1, dz, 0.8, 1, 0.8, { uvScale: 6 });
      upperB.box(0, outerH + 3 + 2.6, 0, 4, 2.6, 4, { uvScale: 6, topScale: 0.6 });
      const upper = upperB.toMesh("small-tower-top", scene);
      upper.material = materials.get("stone");
      upper.position.set(outerX, base, z);
      pipeline.addShadowCaster(upper);
      targets.push({
        id: "smallTower",
        name: "Küçük Kule",
        center: new Vector3(outerX, base + outerH + 3, z),
        radius: 5.2,
        hp: 1,
        maxHp: 1,
        breakable: [upper],
        marker: makeMarker(new Vector3(outerX, base + outerH + 7.5, z)),
      });
    } else {
      appendParts(parts, "walls", Matrix.Translation(outerX, base - FOOT, z));
    }
    wallSolids.push(collision.addBox(outerX, z, 7, 7, 0, base - 6, base + outerH + 5, { walkable: false }));
  }

  // Inner wall segments + towers.
  const innerX = L.innerWallX;
  const innerH = L.innerWallHeight;
  {
    const zs = [L.wallZMin, ...innerTowers, L.wallZMax];
    for (let i = 0; i < zs.length - 1; i++) {
      const a = zs[i] + (i === 0 ? 0 : 5);
      const b = zs[i + 1] - (i === zs.length - 2 ? 0 : 5);
      appendParts(P.wallDef(b - a, innerH + FOOT, 4, true, true), "walls", Matrix.Translation(innerX, base - FOOT, (a + b) / 2));
      wallSolids.push(collision.addBox(innerX, (a + b) / 2, 4, b - a, 0, base - 6, base + innerH, { walkable: true }));
    }
  }
  for (const z of innerTowers) {
    if (z === L.towerT.z) {
      const lower = new P.PartSet();
      lower.get("stone").box(0, (innerH + 5 + FOOT) / 2, 0, 10, innerH + 5 + FOOT, 10, { uvScale: 6, skipBottom: true });
      appendParts(lower, "walls", Matrix.Translation(innerX, base - FOOT, z));
      const topB = new GeoBuilder();
      topB.box(0, innerH + 5 + 0.3, 0, 10.8, 0.6, 10.8, { uvScale: 6 });
      for (let i = 0; i < 5; i++) {
        const o = -4.2 + i * 2.1;
        for (const [dx, dz] of [
          [o, -4.9],
          [o, 4.9],
          [-4.9, o],
          [4.9, o],
        ])
          topB.box(dx, innerH + 5 + 1.1, dz, 0.9, 1.1, 0.9, { uvScale: 6 });
      }
      const top = topB.toMesh("big-tower-top", scene);
      top.material = materials.get("stone");
      top.position.set(innerX, base, z);
      pipeline.addShadowCaster(top);
      targets.push({
        id: "bigTower",
        name: "Büyük Kule",
        center: new Vector3(innerX, base + innerH + 4, z),
        radius: 6.5,
        hp: 2,
        maxHp: 2,
        breakable: [top],
        marker: makeMarker(new Vector3(innerX, base + innerH + 10, z)),
      });
    } else {
      appendParts(P.towerDef(10, innerH + 5 + FOOT), "walls", Matrix.Translation(innerX, base - FOOT, z));
    }
    wallSolids.push(collision.addBox(innerX, z, 10, 10, 0, base - 6, base + innerH + 6, { walkable: false }));
  }
  // Topkapı (St. Romanus) gate arch in the inner wall — decorative.
  {
    const g = S("stone", "walls");
    g.box(innerX - 2.1, base + 3.2, -26, 0.4, 6.4, 6, { uvScale: 6 });
    S("darkWood", "walls").box(innerX - 2.3, base + 2.6, -26, 0.2, 5.2, 4.2, { uvScale: 2 });
    S("iron", "walls").box(innerX - 2.42, base + 2.6, -26, 0.05, 0.2, 4.2, {});
  }
  // Wall-section target: the outer wall at the future breach.
  targets.push({
    id: "wallSection",
    name: "Sur Bölümü",
    center: new Vector3(outerX, base + outerH * 0.55, L.breachZ),
    radius: 6,
    hp: 2,
    maxHp: 2,
    breakable: [breachMesh],
    marker: makeMarker(new Vector3(outerX, base + outerH + 4.5, L.breachZ)),
  });
  // Defence point: wooden hoarding (bretèche) on the outer wall.
  {
    const hb = new GeoBuilder();
    hb.box(0, 0, 0, 3.2, 2.6, 6, { color: hexColor("#7a5232"), uvScale: 2 });
    hb.box(0, 1.6, 0, 3.8, 0.6, 6.6, { color: hexColor("#5e3e24"), uvScale: 2, topScale: 0.6 });
    for (const dz of [-2.4, 0, 2.4]) hb.box(-1.62, -0.2, dz, 0.06, 1.2, 0.5, { color: hexColor("#1c1814") });
    const hoarding = hb.toMesh("hoarding", scene);
    hoarding.material = materials.get("wood");
    hoarding.position.set(outerX - 0.4, base + outerH + 1.6, 5);
    pipeline.addShadowCaster(hoarding);
    targets.push({
      id: "defensePoint",
      name: "Savunma Noktası",
      center: new Vector3(outerX - 0.4, base + outerH + 1.5, 5),
      radius: 4.6,
      hp: 1,
      maxHp: 1,
      breakable: [hoarding],
      marker: makeMarker(new Vector3(outerX, base + outerH + 6, 5)),
    });
  }
  for (const t of targets) t.marker.setEnabled(false);

  // Scaffold stairs to the inner wall (appear for the final assault).
  const scaffold = new GeoBuilder();
  const scaffoldColliders: BoxCollider[] = [];
  {
    const st = L.stairs;
    const steps = 40;
    const run = (st.z1 - st.z0) / steps;
    const rise = (base + innerH - base) / steps;
    for (let i = 0; i < steps; i++) {
      const z = st.z0 + (i + 0.5) * run;
      const top = base + (i + 1) * rise;
      scaffold.box(st.x, top - 0.08, z, st.width, 0.16, run + 0.04, { color: shade(hexColor("#9a6b40"), 0.85 + (i % 3) * 0.06), uvScale: 2 });
      if (i % 4 === 0) {
        for (const dx of [-st.width / 2 + 0.15, st.width / 2 - 0.15]) scaffold.box(st.x + dx, (base + top) / 2, z, 0.18, top - base, 0.18, { color: hexColor("#5e4128") });
      }
      scaffoldColliders.push(collision.addBox(st.x, z, st.width, run + 0.02, 0, top - 1.2, top, { solid: false, tag: "wood" }));
    }
    // Landing platform toward the wall walk.
    const topY = base + innerH;
    scaffold.box(34.5, topY - 0.1, -19, 6, 0.2, 5, { color: hexColor("#8a5e38"), uvScale: 2 });
    scaffoldColliders.push(collision.addBox(34.5, -19, 6, 5, 0, topY - 1, topY, { solid: false, tag: "wood" }));
    // Railings on the wall walk so the player can't fall into the city.
    scaffoldColliders.push(collision.addBox(innerX + 2.1, -26, 0.3, 26, 0, topY, topY + 1.3, { walkable: false }));
  }
  const scaffoldMesh = scaffold.toMesh("scaffold", scene);
  scaffoldMesh.material = materials.get("wood");
  scaffoldMesh.setEnabled(false);
  pipeline.addShadowCaster(scaffoldMesh);
  for (const c of scaffoldColliders) c.enabled = false;

  // Wall walk collider is already walkable (inner wall). Tower T blocks the north side.
  anchors.set("wall_top", new Vector3(innerX - 0.5, base + innerH, -19));
  anchors.set("flag_spot", new Vector3(innerX, base + innerH + 0.6, -14.5));
  const finalFlag = new TransformNode("final-flag", scene);
  prefabs.place("bigFlag", 0, 0, 0, { parent: finalFlag });
  finalFlag.position.set(innerX, base + innerH + 5.6, L.towerT.z);
  finalFlag.rotation.y = -Math.PI / 2;
  finalFlag.setEnabled(false);

  const defenderSpots: Vector3[] = [];
  for (let z = -78; z <= 26; z += 8) {
    if (Math.abs(z - L.breachZ) < 8) continue;
    defenderSpots.push(new Vector3(outerX + 0.3, base + outerH, z));
  }
  for (let z = -70; z <= 20; z += 14) defenderSpots.push(new Vector3(innerX + 0.6, base + innerH, z + 3));

  flushStatics("walls", true, true).forEach((m) => (m.receiveShadows = true));

  // --------------------------------------------------------------------- the camp
  ctx.progress(0.4, "Ordugâh kuruluyor");
  await ctx.yieldFrame();
  const otag = L.otag;
  prefabs.place("otag", otag.x, ground(otag.x, otag.z), otag.z, { rotY: Math.PI / 2 });
  collision.addCircle(otag.x, otag.z, 7.2, -10, 30, { walkable: false });
  // Red cloth enclosure (otağ çiti) with an opening toward the city.
  {
    const encl = new GeoBuilder();
    const rect = [0, 0.75, 0.5, 1] as const;
    const R = 17;
    const segs = 26;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      if (Math.cos(mid) > 0.86) continue; // opening facing +x (east)
      const x0 = otag.x + Math.cos(a0) * R;
      const z0 = otag.z + Math.sin(a0) * R;
      const x1 = otag.x + Math.cos(a1) * R;
      const z1 = otag.z + Math.sin(a1) * R;
      const y0 = ground(x0, z0);
      const y1 = ground(x1, z1);
      encl.quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + 2.3, z1], [x0, y0 + 2.3, z0], [rect[0], rect[3], rect[2], rect[1]], [Math.cos(mid), 0, Math.sin(mid)]);
      encl.quad([x0, y0, z0], [x1, y1, z1], [x1, y1 + 2.3, z1], [x0, y0 + 2.3, z0], [rect[0], rect[3], rect[2], rect[1]], [-Math.cos(mid), 0, -Math.sin(mid)]);
      S("darkWood", "camp").cylinder(x0, y0, z0, 0.07, 0.06, 2.6, { segments: 5 });
      collision.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), 0.3, -Math.atan2(z1 - z0, x1 - x0), y0 - 2, y0 + 2.3, { walkable: false });
    }
    const m = encl.toMesh("otag-enclosure", scene);
    m.material = materials.get("props");
    m.receiveShadows = true;
    pipeline.addShadowCaster(m);
  }
  // Horse-tail standards & banners at the otağ entrance.
  for (const dz of [-4, 4]) prefabs.place("tug", otag.x + 12, ground(otag.x + 12, otag.z + dz), otag.z + dz, { rotY: rnd.range(0, 6) });
  for (const dz of [-9, 9]) prefabs.place("flagOttoman", otag.x + 16, ground(otag.x + 16, otag.z + dz), otag.z + dz, { rotY: -Math.PI / 2 });

  // Soldier tents (Poisson-ish scatter).
  const tents: [number, number][] = [];
  const tentTints: RGBA[] = [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 0.95, 0.88, 1],
    [0.92, 1, 0.9, 1],
    [1, 0.85, 0.8, 1],
  ];
  const nearRoad = (x: number, z: number, d: number) => ROADS.some((r) => distanceToPolyline(x, z, r) < d);
  for (let tries = 0; tries < 900 && tents.length < Math.round(62 * (0.6 + preset.npcDensity * 0.4)); tries++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = Math.sqrt(rnd.next()) * (L.camp.radius - 6);
    const x = L.camp.x + Math.cos(a) * r;
    const z = L.camp.z + Math.sin(a) * r;
    if (Math.hypot(x - otag.x, z - otag.z) < 24) continue;
    if (nearRoad(x, z, 6)) continue;
    if (x > -165 && z > -95 && z < 15) continue;
    if (tents.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 8.5)) continue;
    tents.push([x, z]);
    prefabs.place("tent", x, ground(x, z), z, { rotY: rnd.range(0, Math.PI * 2), tint: rnd.pick(tentTints), scale: rnd.range(0.9, 1.15) });
    collision.addCircle(x, z, 2.5, ground(x, z) - 2, ground(x, z) + 3, { walkable: false });
  }

  // Campfires with sitting soldiers (NPCs added later by the scene from these spots).
  const campfires: [number, number][] = [
    [-205, -45],
    [-262, -66],
    [-215, 22],
    [-280, -15],
    [-245, -98],
    [-180, -10],
  ];
  for (const [x, z] of campfires) {
    prefabs.place("campfire", x, ground(x, z), z);
    ctx.fx.campfire(at(x, z));
    collision.addCircle(x, z, 1.1, ground(x, z) - 1, ground(x, z) + 0.6, { walkable: false });
  }
  for (const [x, z] of [campfires[0], campfires[2]]) prefabs.place("kazan", x + 3.5, ground(x + 3.5, z + 1), z + 1);
  // Supply depot.
  const props = (name: string, x: number, z: number, r = 0, radius = 0.7, h = 1.2) => {
    prefabs.place(name, x, ground(x, z), z, { rotY: r });
    if (radius > 0) collision.addCircle(x, z, radius, ground(x, z) - 1, ground(x, z) + h, { walkable: h < 0.6 });
  };
  for (let i = 0; i < 14; i++) {
    const x = -205 + rnd.range(-10, 10);
    const z = -96 + rnd.range(-7, 7);
    props(rnd.pick(["crate", "barrel", "sacks", "crate"]), x, z, rnd.range(0, 6));
  }
  props("cart", -196, -104, 0.4, 1.6, 2);
  props("cart", -222, -92, 2.2, 1.6, 2);
  props("cart", -168, -30, 1.4, 1.6, 2);
  for (let i = 0; i < 8; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = rnd.range(30, 80);
    const x = L.camp.x + Math.cos(a) * r;
    const z = L.camp.z + Math.sin(a) * r;
    if (tents.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 5)) continue;
    props("weaponRack", x, z, rnd.range(0, 6), 1.1, 2);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = L.camp.x + Math.cos(a) * (L.camp.radius + 2);
    const z = L.camp.z + Math.sin(a) * (L.camp.radius + 2);
    if (x > -160) continue;
    prefabs.place("flagOttoman", x, ground(x, z), z, { rotY: rnd.range(0, 6) });
  }
  anchors.set("fatih_camp", at(L.fatihCamp.x, L.fatihCamp.z));

  // ----------------------------------------------------------------- the battery
  ctx.progress(0.5, "Top bataryası kuruluyor");
  await ctx.yieldFrame();
  const bY = ground(L.sahi.x, L.sahi.z);
  const sahiBase = new TransformNode("sahi-base", scene);
  sahiBase.position.set(L.sahi.x, bY, L.sahi.z);
  prefabs.buildUnique("sahi-sled", P.sahiSled(), sahiBase);
  const sahiYaw = new TransformNode("sahi-yaw", scene);
  sahiYaw.parent = sahiBase;
  sahiYaw.position.set(0.3, 1.25, 0);
  const sahiPitch = new TransformNode("sahi-pitch", scene);
  sahiPitch.parent = sahiYaw;
  const sahiRecoil = new TransformNode("sahi-recoil", scene);
  sahiRecoil.parent = sahiPitch;
  prefabs.buildUnique("sahi-barrel", P.sahiBarrel(), sahiRecoil);
  const muzzle = new TransformNode("sahi-muzzle", scene);
  muzzle.parent = sahiRecoil;
  muzzle.position.set(2.9, 0, 0);
  collision.addBox(L.sahi.x, L.sahi.z, 6.2, 2.2, 0, bY - 1, bY + 2.2, { walkable: false });
  const deliveredBalls: AbstractMesh[] = [];
  for (let i = 0; i < 3; i++) {
    const meshes = prefabs.buildUnique(`delivered-ball-${i}`, P.heldCannonball(), undefined, true);
    for (const m of meshes) {
      m.position.set(L.sahi.x - 2.2 + i * 0.7, bY + 0.3, L.sahi.z - 2);
      m.setEnabled(false);
      deliveredBalls.push(m);
    }
  }
  anchors.set("sahi", at(L.sahi.x - 4.2, L.sahi.z));
  anchors.set("sahi_drop", at(L.sahi.x - 1.5, L.sahi.z - 2.2, 0.5));
  anchors.set("battery", at(L.battery.x, L.battery.z));
  // Secondary guns, mantlets, gabions.
  for (const z of [-84, -64, -16, 4]) {
    const x = L.sahi.x + 2;
    prefabs.place("smallCannon", x, ground(x, z), z);
    collision.addBox(x, z, 2.6, 1.4, 0, ground(x, z) - 1, ground(x, z) + 1.6, { walkable: false });
  }
  for (const z of [-90, -76, -58, -24, -2, 12]) {
    const x = L.sahi.x + 9;
    prefabs.place("mantlet", x, ground(x, z), z, { rotY: Math.PI / 2 });
    collision.addBox(x, z, 0.4, 4, 0, ground(x, z) - 1, ground(x, z) + 3, { walkable: false });
  }
  for (let z = -100; z <= 22; z += 3.2) {
    if (Math.abs(z - L.sahi.z) < 7) continue;
    if ([-84, -64, -16, 4].some((g) => Math.abs(g - z) < 3)) continue;
    const x = L.sahi.x + 12 + rnd.range(-0.3, 0.3);
    prefabs.place("gabion", x, ground(x, z), z, { rotY: rnd.range(0, 6) });
    collision.addCircle(x, z, 0.75, ground(x, z) - 1, ground(x, z) + 1.6, { walkable: false });
  }
  // Ammunition depot.
  const ammo = L.ammoDepot;
  prefabs.place("cannonballs", ammo.x, ground(ammo.x, ammo.z), ammo.z);
  prefabs.place("cannonballs", ammo.x + 2.4, ground(ammo.x + 2.4, ammo.z - 1), ammo.z - 1);
  prefabs.place("cannonballs", ammo.x - 2.2, ground(ammo.x - 2.2, ammo.z + 1.2), ammo.z + 1.2);
  collision.addCircle(ammo.x, ammo.z, 2.6, ground(ammo.x, ammo.z) - 1, ground(ammo.x, ammo.z) + 1.4, { walkable: false });
  for (let i = 0; i < 6; i++) props("barrel", ammo.x - 6 + (i % 3) * 1.1, ammo.z - 4 - Math.floor(i / 3) * 1.1, 0, 0.5);
  prefabs.place("tent", ammo.x - 8, ground(ammo.x - 8, ammo.z + 6), ammo.z + 6, { tint: [0.95, 0.9, 0.8, 1], scale: 1.3 });
  collision.addCircle(ammo.x - 8, ammo.z + 6, 3.2, -10, 30, { walkable: false });
  anchors.set("ammo_pile", at(ammo.x + 2.5, ammo.z + 2, 0.6));
  anchors.set("fatih_battery", at(L.fatihBattery.x, L.fatihBattery.z));

  // ------------------------------------------------------------- siege field props
  for (let i = 0; i < 18; i++) {
    const x = rnd.range(-70, -5);
    const z = rnd.range(-110, 30);
    const kind = rnd.pick(["gabion", "ladder", "rock1", "gabion", "crate", "rock2"]);
    if (kind === "ladder") {
      prefabs.place("ladder", x, ground(x, z) + 0.1, z, { rotY: rnd.range(0, 6) });
      continue;
    }
    props(kind, x, z, rnd.range(0, 6), kind.startsWith("rock") ? 1 : 0.7, 1.4);
  }
  anchors.set("siege_start", at(-62, -30));
  const zoneRings: Mesh[] = [];
  const captureFlags: IstanbulWorld["captureFlags"] = [];
  for (const zone of L.captureZones) {
    const rb = new GeoBuilder();
    const R = 7;
    const n = 36;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const p = (a: number, r: number): [number, number, number] => {
        const x = zone.x + Math.cos(a) * r;
        const z = zone.z + Math.sin(a) * r;
        return [x - zone.x, ground(x, z) + 0.15 - ground(zone.x, zone.z), z - zone.z];
      };
      rb.quad(p(a0, R - 0.25), p(a1, R - 0.25), p(a1, R + 0.25), p(a0, R + 0.25), [0, 0, 1, 1], [0, 1, 0], [1, 1, 1, 1]);
    }
    const ring = rb.toMesh(`zone-${zone.id}`, scene);
    ring.material = materials.get("fire");
    ring.position.set(zone.x, ground(zone.x, zone.z), zone.z);
    ring.setEnabled(false);
    ring.isPickable = false;
    zoneRings.push(ring);
    const fx = zone.x + 2;
    const byz = prefabs.place("flagByzantine", fx, ground(fx, zone.z), zone.z, { dynamic: true });
    const ott = prefabs.place("flagOttoman", fx, ground(fx, zone.z), zone.z, { dynamic: true });
    ott.root!.setEnabled(false);
    captureFlags.push({ id: zone.id, byz: byz.root!, ott: ott.root! });
    anchors.set(`zone_${zone.id}`, at(zone.x, zone.z));
  }

  // ------------------------------------------------------------ piers & the ferry
  ctx.progress(0.58, "Haliç ve iskeleler");
  await ctx.yieldFrame();
  /** Walks from the land point toward the water until the shoreline, then builds the pier out from there. */
  const placePier = (x: number, zLand: number, dir: 1 | -1): number => {
    const deckY = 1.0;
    let shore = zLand;
    for (let i = 0; i < 80 && ground(x, shore) > deckY - 0.1; i++) shore += dir * 0.5;
    const z0 = shore - dir * 2.5;
    const z1 = shore + dir * 16;
    const len = Math.abs(z1 - z0);
    const cz = (z0 + z1) / 2;
    appendParts(P.pier(len, 3), "piers", Matrix.Translation(x, deckY, cz));
    collision.addBox(x, cz, 3, len, 0, deckY - 2, deckY + 0.06, { solid: false, tag: "wood" });
    // Ramp from the bank onto the deck so the pier is always walkable.
    collision.addRamp(x, z0 - dir * 2, 3, 4, dir > 0 ? 0 : Math.PI, Math.max(deckY, ground(x, z0 - dir * 4)), deckY, "wood");
    return z1;
  };
  const southEnd = placePier(L.southPier.x, L.southPier.z - 4, 1);
  const northEnd = placePier(L.northPier.x, L.northPier.z + 4, -1);
  prefabs.place("rowingBoat", L.southPier.x + 3, 0.05, southEnd - 4, { rotY: 0.1 });
  prefabs.place("rowingBoat", L.northPier.x + 3, 0.05, northEnd + 4, { rotY: Math.PI + 0.1 });
  anchors.set("boatman_south", at(L.boatmanSouth.x, L.boatmanSouth.z));
  anchors.set("boatman_north", at(L.boatmanNorth.x, L.boatmanNorth.z));
  flushStatics("piers", true, true);

  // Golden Horn chain with floats, and the enemy ships behind it.
  {
    const cx = L.chainX;
    const z0 = L.goldenHorn.zCenter - 32;
    const z1 = L.goldenHorn.zCenter + 34;
    for (let z = z0; z <= z1; z += 3) {
      S("darkWood", "chain").cylinderX(cx - 1, 0.1, z, 2, 0.35, 0.35, { segments: 6 });
    }
    S("iron", "chain").box(cx, 0.3, (z0 + z1) / 2, 0.12, 0.12, z1 - z0, {});
    flushStatics("chain", false, true);
    for (const [x, z, r] of [
      [266, 98, 0.3],
      [254, 116, -0.2],
      [276, 122, 0.5],
    ])
      prefabs.place("galleyByz", x, 0.15, z, { rotY: r + Math.PI / 2 });
  }

  // ------------------------------------------------------------------- slipway
  ctx.progress(0.64, "Kızak yolu döşeniyor");
  await ctx.yieldFrame();
  const swPts = L.slipway;
  let total = 0;
  for (let i = 0; i < swPts.length - 1; i++) total += Math.hypot(swPts[i + 1][0] - swPts[i][0], swPts[i + 1][1] - swPts[i][1]);
  const sampleSlip = (d: number): { x: number; z: number; dir: number } => {
    let acc = 0;
    for (let i = 0; i < swPts.length - 1; i++) {
      const [ax, az] = swPts[i];
      const [bx, bz] = swPts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (acc + len >= d || i === swPts.length - 2) {
        const t = clamp((d - acc) / len, 0, 1);
        return { x: lerp(ax, bx, t), z: lerp(az, bz, t), dir: Math.atan2(bx - ax, bz - az) };
      }
      acc += len;
    }
    return { x: swPts[0][0], z: swPts[0][1], dir: 0 };
  };
  for (let d = 4; d < total - 2; d += 3.2) {
    const s = sampleSlip(d);
    prefabs.place("slipLog", s.x, ground(s.x, s.z) + 0.02, s.z, { rotY: s.dir });
  }
  // Side rails of the slipway (planks).
  for (let d = 2; d < total - 2; d += 6) {
    const s = sampleSlip(d);
    for (const side of [-1, 1]) {
      const x = s.x + Math.cos(s.dir) * 3 * side;
      const z = s.z - Math.sin(s.dir) * 3 * side;
      S("darkWood", "slip").pushTRS(x, ground(x, z) + 0.15, z, s.dir);
      S("darkWood", "slip").box(0, 0, 0, 0.3, 0.3, 6.2, { uvScale: 2 });
      S("darkWood", "slip").pop();
    }
  }
  flushStatics("slip", false, true);
  const greaseMarks = new Map<string, AbstractMesh[]>();
  L.greaseStations.forEach(([x, z], i) => {
    const id = `grease_${i + 1}`;
    prefabs.place("greaseBarrel", x + 3.6, ground(x + 3.6, z), z);
    prefabs.place("logStack", x - 5, ground(x - 5, z), z, { rotY: rnd.range(-0.3, 0.3) });
    collision.addCircle(x + 3.6, z, 0.5, -10, 30, { walkable: false });
    collision.addBox(x - 5, z, 3.8, 2.6, 0, ground(x - 5, z) - 1, ground(x - 5, z) + 1.2, { walkable: false });
    anchors.set(id, at(x + 2.2, z, 0.6));
    // Glistening grease patch that appears once greased.
    const gb = new GeoBuilder();
    gb.box(0, 0.4, 0, 4.6, 0.04, 2.4, { color: hexColor("#efe2b8") });
    const gm = gb.toMesh(`grease-mark-${i}`, scene);
    gm.material = materials.get("bronze");
    const s = slipwayInfo(x, z);
    void s;
    gm.position.set(x, ground(x, z), z);
    gm.setEnabled(false);
    greaseMarks.set(id, [gm]);
  });
  anchors.set("slipway_bottom", at(swPts[0][0], swPts[0][1] + 8));
  anchors.set("fatih_slipway", at(L.fatihSlipway.x, L.fatihSlipway.z));

  // The ship to be hauled (dynamic) + the waiting fleet on the Bosphorus.
  const shipStart = sampleSlip(total - 10);
  const ship = prefabs.place("galley", shipStart.x, ground(shipStart.x, shipStart.z) + 0.6, shipStart.z, { dynamic: true, rotY: shipStart.dir + Math.PI }).root!;
  anchors.set("ship_start", at(shipStart.x - 4.5, shipStart.z - 4));
  for (const [x, z, r] of [
    [-140, 352, 0.4],
    [-112, 360, -0.2],
    [-60, 356, 0.9],
    [-30, 366, 0.2],
  ])
    prefabs.place("galley", x, 0.15, z, { rotY: r });
  const launchedShips: TransformNode[] = [];
  for (const [x, z, r] of [
    [-128, 108, 1.4],
    [-100, 102, 1.7],
    [-74, 110, 1.5],
  ]) {
    const s = prefabs.place("galley", x, 0.15, z, { dynamic: true, rotY: r }).root!;
    s.setEnabled(false);
    launchedShips.push(s);
  }
  // Marmara fleet.
  for (let i = 0; i < 6; i++) prefabs.place("galley", -150 + i * 36 + rnd.range(-6, 6), 0.15, -214 + rnd.range(-10, 6), { rotY: Math.PI / 2 + rnd.range(-0.4, 0.4) });

  // Rope between the ship's bow and the hauling crew (updated by the minigame).
  const ropeB = new GeoBuilder();
  ropeB.cylinder(0, 0, 0, 0.04, 0.04, 1, { segments: 5, color: hexColor("#b59a6a") });
  const rope = ropeB.toMesh("haul-rope", scene);
  rope.material = materials.get("rope");
  rope.setEnabled(false);

  // ----------------------------------------------------------------------- the city
  ctx.progress(0.72, "Konstantiniyye inşa ediliyor");
  await ctx.yieldFrame();
  prefabs.place("hagiaSophia", L.hagiaSophia.x, ground(L.hagiaSophia.x, L.hagiaSophia.z) - 0.5, L.hagiaSophia.z, { rotY: 0.08 });
  const churches: [number, number][] = [
    [120, -120],
    [170, 30],
    [90, 20],
    [200, -150],
    [265, 55],
    [150, -80],
  ];
  for (const [x, z] of churches) prefabs.place("church", x, ground(x, z) - 0.3, z, { rotY: rnd.range(-0.3, 0.3) });
  const houseTints: RGBA[] = [
    [1, 1, 1, 1],
    [1, 0.93, 0.82, 1],
    [0.95, 0.88, 0.8, 1],
    [1, 0.96, 0.9, 1],
    [0.9, 0.86, 0.8, 1],
  ];
  const cityStep = preset.npcDensity < 0.6 ? 17 : 13;
  for (let x = 56; x < 300; x += cityStep) {
    for (let z = -168; z < 84; z += cityStep) {
      const hx = x + rnd.range(-3, 3);
      const hz = z + rnd.range(-3, 3);
      if (Math.hypot(hx - L.hagiaSophia.x, hz - L.hagiaSophia.z) < 50) continue;
      if (churches.some(([cx, cz]) => Math.hypot(cx - hx, cz - hz) < 16)) continue;
      const h = ground(hx, hz);
      if (h < 1.2 || terrain.slopeAt(hx, hz) < 0.85) continue;
      if (rnd.chance(0.18)) {
        if (rnd.chance(0.5)) prefabs.place("cypress", hx, h, hz, { scale: rnd.range(0.8, 1.2) });
        continue;
      }
      prefabs.place(`house${rnd.int(0, 5)}`, hx, h - 0.2, hz, { rotY: rnd.range(-0.25, 0.25) + (rnd.chance(0.5) ? Math.PI / 2 : 0), tint: rnd.pick(houseTints) });
    }
  }
  // Galata quarter + Galata Tower.
  prefabs.place("galataTower", L.galataTower.x, ground(L.galataTower.x, L.galataTower.z) - 0.5, L.galataTower.z);
  collision.addCircle(L.galataTower.x, L.galataTower.z, 5.2, -10, 60, { walkable: false });
  for (let i = 0; i < 70; i++) {
    const x = rnd.range(-10, 150);
    const z = rnd.range(150, 300);
    const h = ground(x, z);
    if (h < 1.5 || Math.hypot(x - L.galataTower.x, z - L.galataTower.z) < 14) continue;
    if (terrain.slopeAt(x, z) < 0.82) continue;
    if (rnd.chance(0.3)) {
      prefabs.place(rnd.chance(0.5) ? "cypress" : "tree1", x, h, z, { scale: rnd.range(0.8, 1.2) });
      continue;
    }
    prefabs.place(`house${rnd.int(0, 5)}`, x, h - 0.2, z, { rotY: rnd.range(0, Math.PI * 2), tint: rnd.pick(houseTints) });
    collision.addBox(x, z, 8, 8, 0, h - 2, h + 9, { walkable: false });
  }

  // ------------------------------------------------------------------ vegetation
  ctx.progress(0.8, "Bitki örtüsü");
  await ctx.yieldFrame();
  const treeCount = Math.round(260 * (0.45 + preset.npcDensity * 0.55));
  let placed = 0;
  for (let tries = 0; tries < treeCount * 6 && placed < treeCount; tries++) {
    const x = rnd.range(L.bounds.minX, L.bounds.maxX);
    const z = rnd.range(L.bounds.minZ, L.bounds.maxZ);
    const h = ground(x, z);
    if (h < 1.6) continue;
    if (x > -175 && x < 50 && z > -120 && z < 40) continue; // battery & siege field stay open
    if (Math.hypot(x - L.camp.x, z - L.camp.z) < L.camp.radius - 5) continue;
    if (slipwayInfo(x, z).dist < 12) continue;
    if (x > 15 && x < 48 && z < 95) continue;
    if (x > 50 && x < 300 && z < 85 && z > -170) continue; // city handled above
    if (nearRoad(x, z, 5)) continue;
    const kind = rnd.next();
    if (kind < 0.35) prefabs.place("cypress", x, h, z, { scale: rnd.range(0.8, 1.3), tint: [rnd.range(0.85, 1.05), 1, rnd.range(0.85, 1), 1] });
    else if (kind < 0.75) prefabs.place(`tree${rnd.int(1, 3)}`, x, h, z, { scale: rnd.range(0.8, 1.3), rotY: rnd.range(0, 6), tint: [rnd.range(0.85, 1.1), rnd.range(0.9, 1.05), 0.9, 1] });
    else prefabs.place("bush", x, h, z, { scale: rnd.range(0.8, 1.5), rotY: rnd.range(0, 6) });
    if (kind < 0.75) collision.addCircle(x, z, 0.45, h - 1, h + 6, { walkable: false });
    placed++;
  }
  // Camp-edge trees & rocks.
  for (let i = 0; i < 40; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = rnd.range(L.camp.radius - 2, L.camp.radius + 30);
    const x = L.camp.x + Math.cos(a) * r;
    const z = L.camp.z + Math.sin(a) * r;
    if (x > -165 || ground(x, z) < 1.5) continue;
    const isRock = rnd.chance(0.35);
    prefabs.place(isRock ? `rock${rnd.int(1, 3)}` : `tree${rnd.int(1, 3)}`, x, ground(x, z) - (isRock ? 0.3 : 0), z, { scale: rnd.range(0.7, 1.4), rotY: rnd.range(0, 6) });
    collision.addCircle(x, z, isRock ? 0.9 : 0.45, -10, 30, { walkable: false });
  }

  // ------------------------------------------------------------------ atmosphere
  ctx.fx.smokeColumn(at(160, -60, 6), 1.4);
  ctx.fx.smokeColumn(at(95, 30, 4), 1);
  ctx.fx.smokeColumn(at(-60, -120, 1), 0.7);
  ctx.fx.fogBank(new Vector3(-40, 1.5, L.goldenHorn.zCenter), 120);
  ctx.fx.fogBank(new Vector3(-100, 1.5, -215), 140);

  // ------------------------------------------------------------- navigation graph
  ctx.progress(0.88, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 7, ground);
  nav.addRegion(L.camp.x - L.camp.radius, L.camp.z - L.camp.radius, L.camp.x + L.camp.radius, L.camp.z + L.camp.radius + 30);
  nav.addRegion(-170, -110, 0, 40);
  nav.addRegion(-200, 40, -150, 90);
  nav.addRegion(-175, 120, -80, 340);
  nav.build();

  const surfaceAt = (x: number, z: number, feetY: number): Surface => {
    const g = ground(x, z);
    if (feetY > g + 0.3) return feetY > L.wallBaseY + 6 && x > 20 ? "stone" : "wood";
    if (x > 18 && x < 45 && z > L.wallZMin && z < L.wallZMax) return "stone";
    if (slipwayInfo(x, z).dist < 3.5) return "wood";
    const campD = Math.hypot(x - L.camp.x, z - L.camp.z);
    if (campD < L.camp.radius || (x > -150 && x < 10 && z > -110 && z < 30)) return "dirt";
    if (nearRoad(x, z, 3)) return "dirt";
    return "grass";
  };

  void Color3;
  return {
    terrain,
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt,
    ship,
    launchedShips,
    sahi: { base: sahiBase, yaw: sahiYaw, pitch: sahiPitch, recoil: sahiRecoil, muzzle, deliveredBalls },
    targets,
    breach: {
      intact: [breachMesh],
      rubble: [rubbleMesh],
      wallCollider: breachCollider,
      rubbleColliders,
      scaffold: [scaffoldMesh],
      scaffoldColliders,
    },
    greaseMarks,
    captureFlags,
    zoneRings,
    finalFlag,
    defenderSpots,
    rope,
    wallSolids,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  prefabs.register("tent", P.soldierTent);
  prefabs.register("otag", P.otag);
  prefabs.register("crate", () => P.crate(0.9));
  prefabs.register("barrel", P.barrel);
  prefabs.register("sacks", P.sacks);
  prefabs.register("cannonballs", P.cannonballPile);
  prefabs.register("cart", P.cart);
  prefabs.register("smallCannon", P.smallCannon);
  prefabs.register("mantlet", P.mantlet);
  prefabs.register("gabion", P.gabion);
  prefabs.register("palisade", P.palisade);
  prefabs.register("ladder", () => P.ladder(7));
  prefabs.register("weaponRack", P.weaponRack);
  prefabs.register("campfire", P.campfire);
  prefabs.register("kazan", P.kazan);
  prefabs.register("flagOttoman", () => P.flagPole("flagOttoman", 6));
  prefabs.register("flagByzantine", () => P.flagPole("flagByzantine", 5));
  prefabs.register("bigFlag", () => {
    const d = P.flagPole("flagOttoman", 5);
    d.cullDistance = 4000;
    return d;
  });
  prefabs.register("tug", P.tug);
  prefabs.register("logStack", P.logStack);
  prefabs.register("slipLog", P.slipwayLog);
  prefabs.register("greaseBarrel", P.greaseBarrel);
  prefabs.register("galley", () => P.galley(1, true));
  prefabs.register("galleyByz", () => P.galley(0.9, true, "#3b3d4a"));
  prefabs.register("rowingBoat", P.rowingBoat);
  prefabs.register("hagiaSophia", P.hagiaSophiaDef);
  prefabs.register("church", P.churchDef);
  prefabs.register("galataTower", P.galataTowerDef);
  for (let i = 0; i <= 5; i++) prefabs.register(`house${i}`, () => P.houseDef(i));
  prefabs.register("cypress", P.cypress);
  for (let i = 1; i <= 3; i++) prefabs.register(`tree${i}`, () => P.broadTree(i));
  prefabs.register("bush", P.bush);
  for (let i = 1; i <= 3; i++) prefabs.register(`rock${i}`, () => P.rock(i));
}
