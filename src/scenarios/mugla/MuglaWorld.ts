import { Color3, Matrix, PointLight, TransformNode, Vector3, type Mesh, type ParticleSystem } from "@babylonjs/core";
import { GeoBuilder, hexColor, shade } from "../../assets/GeoBuilder";
import type { PrefabLibrary, ScatterItem } from "../../assets/PrefabLibrary";
import * as P from "../../assets/Prefabs";
import * as M from "../../assets/PrefabsMugla";
import type { Surface } from "../../entities/Player";
import type { MaterialKey } from "../../rendering/MaterialLibrary";
import { clamp, distanceToPolyline } from "../../utils/math";
import { Random } from "../../utils/random";
import { CollisionWorld } from "../../world/CollisionWorld";
import { HeightfieldTerrain } from "../../world/HeightfieldTerrain";
import { NavGraph } from "../../world/NavGraph";
import type { ScenarioWorld, WorldBuildContext } from "../common/FpsScenario";
import { FOREST_PATH, inForest, LAYOUT, muglaColor, muglaHeight, nearStreet, STREETS } from "./layout";

export interface Hearth {
  /** Ground point in front of the hearth opening. */
  front: Vector3;
  /** Top of the stone step right at the hearth (stirring position). */
  step: Vector3;
  center: Vector3;
  /** Yaw facing from the front into the hearth. */
  facing: number;
  kazan: TransformNode;
  contents: Mesh;
  flames: TransformNode;
  light: PointLight;
  fire: { fire: ParticleSystem; smoke: ParticleSystem };
  steam: ParticleSystem;
  logPile: TransformNode;
}

export interface MuglaWorld extends ScenarioWorld {
  terrain: HeightfieldTerrain;
  dibek: { center: Vector3; top: number; wheat: TransformNode; sacks: TransformNode[] };
  hearth: Hearth;
  /** Wedding tables & decorations, hidden until the morning of the wedding. */
  wedding: TransformNode[];
  /** One keşkek bowl group per target sofra, shown when served. */
  servedBowls: TransformNode[];
  /** Warm window lights switched on at dusk. */
  windowGlow: Mesh;
  chimneySmoke: ParticleSystem[];
}

interface Lot {
  x: number;
  z: number;
  /** Unit vector pointing from the street into the lot. */
  nx: number;
  nz: number;
  /** Street point the lot faces. */
  sx: number;
  sz: number;
}

/** Point and unit tangent at arc length `dist` along a polyline. */
function sampleAlong(poly: [number, number][], dist: number): { x: number; z: number; tx: number; tz: number } {
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    const [ax, az] = poly[i - 1];
    const [bx, bz] = poly[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (acc + len >= dist || i === poly.length - 1) {
      const t = clamp((dist - acc) / len, 0, 1);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / len, tz: (bz - az) / len };
    }
    acc += len;
  }
  return { x: poly[0][0], z: poly[0][1], tx: 0, tz: 1 };
}

/**
 * Builds the Menteşe village: terrain, cobbled square and streets, whitewashed Muğla houses
 * in walled courtyards, the çınar, çeşme, dibek, keşkek hearth, granary, market stalls,
 * mescit, pine forest with beehives, harvested fields, colliders and the navigation graph.
 */
export async function buildMuglaWorld(ctx: WorldBuildContext): Promise<MuglaWorld> {
  const { scene, prefabs, materials, pipeline, preset, fx } = ctx;
  const rnd = new Random(1375);
  const L = LAYOUT;

  // ---------------------------------------------------------------------- terrain
  ctx.progress(0.05, "Menteşe yaylası şekillendiriliyor");
  const terrain = new HeightfieldTerrain({
    minX: L.terrainRect.minX,
    minZ: L.terrainRect.minZ,
    sizeX: L.terrainRect.sizeX,
    sizeZ: L.terrainRect.sizeZ,
    cell: preset.terrainCell,
    height: muglaHeight,
    color: muglaColor,
    chunkCells: Math.round(110 / preset.terrainCell),
    lodDistance: 220,
    uvScale: 7,
  });
  await terrain.build(scene, materials.get("terrain"), ctx.yieldFrame);
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const collision = new CollisionWorld(ground, -100, L.bounds);
  const anchors = new Map<string, Vector3>();
  const at = (x: number, z: number, dy = 0) => new Vector3(x, ground(x, z) + dy, z);

  // Static merged geometry per material.
  const statics = new Map<MaterialKey, GeoBuilder>();
  const S = (key: MaterialKey) => {
    let b = statics.get(key);
    if (!b) {
      b = new GeoBuilder();
      statics.set(key, b);
    }
    return b;
  };
  const flushStatics = (name: string) => {
    for (const [key, b] of statics) {
      if (b.isEmpty) continue;
      const m = b.toMesh(`mugla-${name}-${key}`, scene);
      m.material = materials.get(key);
      m.receiveShadows = true;
      m.isPickable = false;
      m.freezeWorldMatrix();
      pipeline.addShadowCaster(m);
    }
    statics.clear();
  };

  registerPrefabs(prefabs);

  // ------------------------------------------------------------ square & streets
  ctx.progress(0.2, "Arnavut kaldırımları döşeniyor");
  await ctx.yieldFrame();
  const cobble = S("cobble");
  {
    // Polar-tessellated square that follows the ground.
    const rings = 7;
    const segs = 36;
    const R = L.square.radius;
    const pt = (ri: number, si: number): [number, number, number] => {
      const r = (ri / rings) * R;
      const a = (si / segs) * Math.PI * 2;
      const x = L.square.x + Math.cos(a) * r;
      const z = L.square.z + Math.sin(a) * r;
      return [x, ground(x, z) + 0.05, z];
    };
    for (let ri = 0; ri < rings; ri++) {
      for (let si = 0; si < segs; si++) {
        const a = pt(ri, si);
        const b = pt(ri + 1, si);
        const c = pt(ri + 1, si + 1);
        const d = pt(ri, si + 1);
        const uv = (p: [number, number, number]): [number, number] => [p[0] / 3, p[2] / 3];
        cobble.tri(a, b, c, uv(a), uv(b), uv(c), [0, 1, 0], hexColor("#d8cfc0"));
        if (ri > 0) cobble.tri(a, c, d, uv(a), uv(c), uv(d), [0, 1, 0], hexColor("#d8cfc0"));
      }
    }
  }
  const strip = (poly: [number, number][], width: number, b: GeoBuilder, color: [number, number, number, number], lift: number) => {
    let total = 0;
    for (let i = 1; i < poly.length; i++) total += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    const step = 1.6;
    const across = 4;
    let prev: [number, number, number][] | null = null;
    for (let d = 0; d <= total + 0.01; d += step) {
      const s = sampleAlong(poly, Math.min(d, total));
      const nx = -s.tz;
      const nz = s.tx;
      const row: [number, number, number][] = [];
      for (let k = 0; k <= across; k++) {
        const o = (k / across - 0.5) * width;
        const x = s.x + nx * o;
        const z = s.z + nz * o;
        row.push([x, ground(x, z) + lift, z]);
      }
      if (prev) {
        for (let k = 0; k < across; k++) {
          const a = prev[k];
          const bb = row[k];
          const c = row[k + 1];
          const dd = prev[k + 1];
          const uv = (p: [number, number, number]): [number, number] => [p[0] / 3, p[2] / 3];
          b.tri(a, bb, c, uv(a), uv(bb), uv(c), [0, 1, 0], color);
          b.tri(a, c, dd, uv(a), uv(c), uv(dd), [0, 1, 0], color);
        }
      }
      prev = row;
    }
  };
  for (const st of STREETS) strip(st, 5.2, cobble, hexColor("#cfc5b4"), 0.06);

  // ------------------------------------------------------------------ house lots
  ctx.progress(0.32, "Eski Muğla evleri yükseliyor");
  await ctx.yieldFrame();
  const lots: Lot[] = [];
  const reservedHit = (x: number, z: number, pad: number) => L.reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.r + pad);
  for (const street of STREETS) {
    for (const d of [12, 28, 44, 60]) {
      const s = sampleAlong(street, d);
      for (const side of [-1, 1]) {
        const nx = -s.tz * side;
        const nz = s.tx * side;
        const cx = s.x + nx * 13;
        const cz = s.z + nz * 13;
        if (Math.hypot(cx, cz) < 24 || reservedHit(cx, cz, 9)) continue;
        // Lots must not reach into another street.
        if (STREETS.some((o) => o !== street && distanceToPolyline(cx, cz, o) < 11)) continue;
        lots.push({ x: cx, z: cz, nx, nz, sx: s.x, sz: s.z });
      }
    }
  }
  const houseTints: [number, number, number, number][] = [
    [1.04, 1.04, 1.06, 1],
    [1, 1, 1, 1],
    [1.02, 0.99, 0.94, 1],
    [1.05, 1.05, 1.08, 1],
  ];
  const windowGlowB = new GeoBuilder();
  const chimneyTops: Vector3[] = [];
  const wallH = 2.4;
  lots.forEach((lot, i) => {
    const rotY = Math.atan2(-lot.nx, -lot.nz);
    const tx = -lot.nz;
    const tz = lot.nx;
    const local = (along: number, inward: number) => ({ x: lot.sx + lot.nx * inward + tx * along, z: lot.sz + lot.nz * inward + tz * along });
    // House at the back of the courtyard, gallery facing the street.
    const variant = i % 6;
    const { w, d } = M.muglaHouseSize(variant);
    const hc = local(rnd.range(-0.6, 0.6), 15.5);
    const hy = Math.min(ground(hc.x, hc.z), ground(hc.x + tx * w * 0.4, hc.z + tz * w * 0.4), ground(hc.x - tx * w * 0.4, hc.z - tz * w * 0.4)) - 0.15;
    prefabs.place(`mHouse${variant}`, hc.x, hy, hc.z, { rotY, tint: houseTints[i % houseTints.length] });
    collision.addBox(hc.x - lot.nx * 0.75, hc.z - lot.nz * 0.75, w + 0.2, d + 1.6, rotY, hy - 3, hy + 9, { walkable: false });
    // Night-time window glow on the street-facing upper floor.
    windowGlowB.pushTRS(hc.x, hy, hc.z, rotY);
    for (const x of [-w * 0.27, w * 0.27]) {
      if (rnd.chance(0.65)) windowGlowB.quad([x - 0.33, 4.45, d / 2 + 0.11], [x + 0.33, 4.45, d / 2 + 0.11], [x + 0.33, 5.35, d / 2 + 0.11], [x - 0.33, 5.35, d / 2 + 0.11], [0, 0, 1, 1], [0, 0, 1]);
    }
    windowGlowB.pop();
    const chimneyLocal = new Vector3(w * 0.28 * (variant % 2 ? 1 : -1), 5.8 + 3, -d * 0.18);
    chimneyTops.push(Vector3.TransformCoordinates(chimneyLocal, Matrix.RotationY(rotY).multiply(Matrix.Translation(hc.x, hy, hc.z))));
    // Courtyard: front wall with the kabalak gate, two side walls.
    const wallIn = 6.2;
    const halfW = 6.5;
    const gate = local(0, wallIn);
    const gy = ground(gate.x, gate.z);
    prefabs.place("kabalakGate", gate.x, gy - 0.05, gate.z, { rotY, tint: houseTints[(i + 1) % houseTints.length] });
    const pl = S("plaster");
    const roof = S("roof");
    const wallSeg = (a0: number, a1: number, i0: number, i1: number) => {
      const p0 = local(a0, i0);
      const p1 = local(a1, i1);
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const cx = (p0.x + p1.x) / 2;
      const cz = (p0.z + p1.z) / 2;
      const ang = Math.atan2(p1.z - p0.z, p1.x - p0.x);
      const y0 = Math.min(ground(p0.x, p0.z), ground(p1.x, p1.z)) - 0.6;
      const y1 = Math.max(ground(p0.x, p0.z), ground(p1.x, p1.z)) + wallH;
      pl.pushTRS(cx, 0, cz, -ang);
      pl.box(0, (y0 + y1) / 2, 0, len, y1 - y0, 0.5, { uvScale: 3, color: hexColor("#f1ede4"), jitter: 0.015 });
      roof.pushTRS(cx, 0, cz, -ang);
      roof.box(0, y1 + 0.06, 0, len + 0.1, 0.12, 0.72, { uvScale: 2, color: hexColor("#b8644a") });
      roof.pop();
      pl.pop();
      collision.addBox(cx, cz, len, 0.55, -ang, y0, y1 + 0.2, { walkable: false });
    };
    wallSeg(-halfW, -1.75, wallIn, wallIn);
    wallSeg(1.75, halfW, wallIn, wallIn);
    collision.addBox(gate.x, gate.z, 3.6, 0.6, -Math.atan2(tz, tx), gy - 1, gy + 3, { walkable: false });
    wallSeg(-halfW, -halfW, wallIn, 12.5);
    wallSeg(halfW, halfW, wallIn, 12.5);
    // Courtyard life: a fig / pomegranate tree, jars.
    if (rnd.chance(0.7)) {
      const t = local(rnd.chance(0.5) ? -3.8 : 3.8, 9.2);
      prefabs.place(`tree${rnd.int(1, 3)}`, t.x, ground(t.x, t.z), t.z, { scale: rnd.range(0.65, 0.85), tint: [0.95, 1.05, 0.85, 1] });
    }
    if (rnd.chance(0.5)) {
      const j = local(rnd.range(-4.5, 4.5), 7.2);
      prefabs.place("kup", j.x, ground(j.x, j.z), j.z);
    }
  });
  const windowGlow = windowGlowB.toMesh("window-glow", scene);
  windowGlow.material = materials.get("fire");
  windowGlow.isPickable = false;
  windowGlow.setEnabled(false);
  pipeline.glowLayer?.addIncludedOnlyMesh(windowGlow);

  // --------------------------------------------------------- square landmarks
  ctx.progress(0.48, "Meydan hazırlanıyor");
  await ctx.yieldFrame();
  prefabs.place("cinar", L.cinar.x, ground(L.cinar.x, L.cinar.z), L.cinar.z);
  collision.addCircle(L.cinar.x, L.cinar.z, 2.75, -10, ground(L.cinar.x, L.cinar.z) + 0.55, { walkable: true });
  collision.addCircle(L.cinar.x, L.cinar.z, 1.0, -10, 60, { walkable: false });

  prefabs.place("cesme", L.cesme.x, ground(L.cesme.x, L.cesme.z) - 0.1, L.cesme.z, { rotY: L.cesme.rot });
  collision.addBox(L.cesme.x + 0.45, L.cesme.z, 3.5, 2.1, L.cesme.rot, -10, ground(L.cesme.x, L.cesme.z) + 3, { walkable: false });
  anchors.set("cesme", at(L.cesme.x - 2.2, L.cesme.z));
  for (const dz of [-1.4, 1.6]) prefabs.place("testi", L.cesme.x - 1.6, ground(L.cesme.x - 1.6, L.cesme.z + dz), L.cesme.z + dz);

  // Dibek: mortar, wheat level and the three delivered sacks.
  const dib = L.dibek;
  const dibY = ground(dib.x, dib.z);
  prefabs.place("dibek", dib.x, dibY, dib.z);
  collision.addCircle(dib.x, dib.z, 0.75, -10, dibY + 0.75, { walkable: false });
  const wheat = new TransformNode("dibek-wheat", scene);
  wheat.position.set(dib.x, dibY + 0.5, dib.z);
  prefabs.buildUnique("dibek-wheat", M.dibekWheat(), wheat, false);
  wheat.setEnabled(false);
  const dibekSacks: TransformNode[] = [];
  for (let i = 0; i < 3; i++) {
    const x = dib.x - 2.2 + i * 0.25;
    const z = dib.z + 1.6 - i * 1.1;
    const sack = prefabs.place("sacks", x, ground(x, z), z, { dynamic: true, scale: 0.55, rotY: i }).root!;
    sack.setEnabled(false);
    dibekSacks.push(sack);
  }
  anchors.set("dibek", at(dib.x + 1.4, dib.z));
  // Two waiting mallets leaning on a log.
  prefabs.place("logStack", dib.x - 3.4, dibY, dib.z - 2.2, { scale: 0.35, rotY: 0.8 });

  // Hearth (ocak) facing the square with the copper kazan.
  const oc = L.ocak;
  const facing = Math.atan2(L.square.x - oc.x, L.square.z - oc.z);
  const ocY = ground(oc.x, oc.z);
  prefabs.place("ocak", oc.x, ocY, oc.z, { rotY: facing });
  collision.addCircle(oc.x, oc.z, 1.0, -10, ocY + 1.5, { walkable: false });
  const kazan = new TransformNode("kazan", scene);
  // The kazan rests on the hearth walls so the fire shows underneath it.
  kazan.position.set(oc.x, ocY + 0.5, oc.z);
  // Hammered copper: warm albedo, metallic, fairly smooth (vertex colours only add shading).
  const copper = materials.variant("bronze", "copper");
  copper.albedoColor = Color3.FromHexString("#d08050").toLinearSpace();
  copper.metallic = 0.85;
  copper.roughness = 0.38;
  // Open-topped: the inside walls must render too.
  copper.backFaceCulling = false;
  copper.twoSidedLighting = true;
  for (const m of prefabs.buildUnique("kazan", M.copperKazan(), kazan)) m.material = copper;
  const contentsNode = new TransformNode("kazan-contents", scene);
  contentsNode.parent = kazan;
  contentsNode.position.y = 0.3;
  const contents = prefabs.buildUnique("kazan-contents", M.kazanContents(), contentsNode, false)[0];
  const contentsMat = materials.variant("matte", "keskek-contents");
  contentsMat.albedoColor = Color3.FromHexString("#9a8a62").toLinearSpace();
  contents.material = contentsMat;
  contentsNode.setEnabled(false);
  const flames = new TransformNode("hearth-flames", scene);
  flames.position.set(oc.x, ocY + 0.05, oc.z);
  {
    const f = new GeoBuilder();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      f.cylinder(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, 0.22, 0, 0.55, { segments: 4, caps: false });
    }
    f.cylinder(0, 0, 0, 0.35, 0, 0.8, { segments: 5, caps: false });
    const fm = f.toMesh("hearth-flame-mesh", scene);
    fm.material = materials.get("fire");
    fm.parent = flames;
    fm.isPickable = false;
    pipeline.glowLayer?.addIncludedOnlyMesh(fm);
  }
  flames.scaling.setAll(0.2);
  // Above the rim: lights the porridge, the cook and the square around the hearth.
  const light = new PointLight("hearth-light", new Vector3(oc.x, ocY + 1.9, oc.z), scene);
  light.diffuse = new Color3(1, 0.62, 0.3);
  light.range = 18;
  light.intensity = 0;
  const fire = fx.campfire(at(oc.x, oc.z, 0));
  fire.fire.emitRate = 0;
  fire.smoke.emitRate = 0;
  const steam = fx.steam(new Vector3(oc.x, ocY + 1.4, oc.z), 0.6);
  // Stone step in front of the hearth (the cook stands on it to reach into the kazan).
  const stepX = oc.x + Math.sin(facing) * 1.4;
  const stepZ = oc.z + Math.cos(facing) * 1.4;
  S("stone").pushTRS(stepX, ocY, stepZ, facing);
  S("stone").box(0, 0.22, 0, 1.6, 0.44, 0.8, { uvScale: 2, color: hexColor("#8e867a"), jitter: 0.06 });
  S("stone").pop();
  collision.addBox(stepX, stepZ, 1.6, 0.8, facing, ocY - 1, ocY + 0.44, { walkable: true });
  const front = at(oc.x + Math.sin(facing) * 2.3, oc.z + Math.cos(facing) * 2.3);
  anchors.set("ocak", front.clone());
  prefabs.place("sundurma", L.sundurma.x, ground(L.sundurma.x, L.sundurma.z), L.sundurma.z, { rotY: facing + Math.PI / 2 });
  for (const [dx, dz] of [
    [-2.2, -1.6],
    [2.2, -1.6],
    [-2.2, 1.6],
    [2.2, 1.6],
  ]) {
    const p = Vector3.TransformCoordinates(new Vector3(dx, 0, dz), Matrix.RotationY(facing + Math.PI / 2));
    collision.addCircle(L.sundurma.x + p.x, L.sundurma.z + p.z, 0.2, -10, 30, { walkable: false });
  }
  const logPile = prefabs.place("logStack", L.sundurma.x, ground(L.sundurma.x, L.sundurma.z), L.sundurma.z, { dynamic: true, rotY: facing + Math.PI / 2, scale: 0.8 }).root!;
  logPile.setEnabled(false);
  prefabs.place("sacks", L.sundurma.x + 1.6, ground(L.sundurma.x + 1.6, L.sundurma.z + 1.4), L.sundurma.z + 1.4, { rotY: 1.2 });
  prefabs.place("kup", L.sundurma.x - 1.4, ground(L.sundurma.x - 1.4, L.sundurma.z + 1.8), L.sundurma.z + 1.8);

  // Wedding flag (düğün bayrağı) — the household is preparing.
  prefabs.place("weddingFlag", L.weddingFlag.x, ground(L.weddingFlag.x, L.weddingFlag.z), L.weddingFlag.z, { rotY: 0.6 });
  collision.addCircle(L.weddingFlag.x, L.weddingFlag.z, 0.2, -10, 30, { walkable: false });

  // ------------------------------------------------------- village buildings
  ctx.progress(0.56, "Ambar, mescit ve çarşı");
  const amb = L.ambar;
  const ambY = ground(amb.x, amb.z);
  prefabs.place("ambar", amb.x, ambY - 0.2, amb.z, { rotY: amb.rot });
  collision.addBox(amb.x, amb.z, 7.3, 5.8, amb.rot, -10, ambY + 6, { walkable: false });
  const ambDoor = { x: amb.x + Math.sin(amb.rot) * 4.4, z: amb.z + Math.cos(amb.rot) * 4.4 };
  anchors.set("ambar", at(ambDoor.x, ambDoor.z));
  prefabs.place("sacks", ambDoor.x - 0.6, ground(ambDoor.x - 0.6, ambDoor.z - 2.4), ambDoor.z - 2.4, { rotY: 0.4 });
  prefabs.place("sacks", ambDoor.x - 0.4, ground(ambDoor.x, ambDoor.z + 2.4), ambDoor.z + 2.4, { rotY: 2.1 });
  collision.addCircle(ambDoor.x - 0.6, ambDoor.z - 2.4, 1.0, -10, ambY + 1, { walkable: false });
  collision.addCircle(ambDoor.x - 0.4, ambDoor.z + 2.4, 1.0, -10, ambY + 1, { walkable: false });
  prefabs.place("cart", amb.x - 1, ground(amb.x - 1, amb.z - 6), amb.z - 6, { rotY: 0.3 });
  collision.addBox(amb.x - 1, amb.z - 6, 2.2, 4, 0.3, -10, ambY + 1.6, { walkable: false });

  const mes = L.mescit;
  const mesY = ground(mes.x, mes.z);
  prefabs.place("mescit", mes.x, mesY - 0.2, mes.z, { rotY: mes.rot });
  collision.addBox(mes.x, mes.z, 7.3, 8.3, mes.rot, -10, mesY + 7, { walkable: false });
  {
    const mp = Vector3.TransformCoordinates(new Vector3(7 / 2 + 1.2, 0, -8 / 2 + 1.4), Matrix.RotationY(mes.rot));
    collision.addCircle(mes.x + mp.x, mes.z + mp.z, 1.3, -10, 40, { walkable: false });
  }
  prefabs.place("cypress", mes.x - 6, ground(mes.x - 6, mes.z + 6), mes.z + 6, { scale: 1.1 });
  prefabs.place("cypress", mes.x - 6, ground(mes.x - 6, mes.z - 7), mes.z - 7, { scale: 0.95 });

  for (const kind of ["kasap", "bakkal"] as const) {
    const st = L[kind];
    const y = ground(st.x, st.z);
    prefabs.place(kind === "kasap" ? "stallKasap" : "stallBakkal", st.x, y, st.z, { rotY: st.rot });
    collision.addBox(st.x, st.z, 3.4, 2.2, st.rot, -10, y + 2.6, { walkable: false });
    anchors.set(kind, at(st.x + Math.sin(st.rot) * 2.3, st.z + Math.cos(st.rot) * 2.3));
    prefabs.place("barrel", st.x - Math.cos(st.rot) * 2.2, y, st.z + Math.sin(st.rot) * 2.2);
  }

  // ------------------------------------------------------------- wedding setup
  const wedding: TransformNode[] = [];
  const servedBowls: TransformNode[] = [];
  const sofraSpots: [number, number][] = [...L.sofras, [10, -2], [-2, -13]];
  sofraSpots.forEach(([x, z], i) => {
    const node = prefabs.place("sofra", x, ground(x, z) + 0.02, z, { dynamic: true, rotY: rnd.range(0, 3) }).root!;
    node.setEnabled(false);
    wedding.push(node);
    if (i < L.sofras.length) {
      anchors.set(`sofra_${i + 1}`, at(x, z));
      const bowls = new TransformNode(`served-${i}`, scene);
      bowls.position.set(x, ground(x, z) + 0.4, z);
      for (let k = 0; k < 3; k++) {
        const b = new TransformNode(`bowl-${i}-${k}`, scene);
        b.parent = bowls;
        b.position.set(Math.cos(k * 2.1) * 0.45, 0, Math.sin(k * 2.1) * 0.45);
        prefabs.place("bowl", 0, 0, 0, { parent: b });
      }
      bowls.setEnabled(false);
      servedBowls.push(bowls);
    } else {
      // Decorative tables already set with bowls.
      for (let k = 0; k < 3; k++) prefabs.place("bowl", Math.cos(k * 2.1) * 0.45, 0.38, Math.sin(k * 2.1) * 0.45, { parent: node });
    }
  });
  anchors.set("meydan", at(0, -4));

  // -------------------------------------------------------------- forest edge
  ctx.progress(0.62, "Kızılçam ormanı");
  await ctx.yieldFrame();
  const fg = L.forestGate;
  anchors.set("orman_giris", at(fg.x, fg.z));
  prefabs.place("beehives", L.beehives.x, ground(L.beehives.x, L.beehives.z), L.beehives.z, { rotY: -0.4 });
  collision.addBox(L.beehives.x, L.beehives.z, 3.6, 1.1, -0.4, -10, ground(L.beehives.x, L.beehives.z) + 1.1, { walkable: false });
  prefabs.place("beehives", L.beehives.x + 4.5, ground(L.beehives.x + 4.5, L.beehives.z + 2), L.beehives.z + 2, { rotY: -0.7 });
  collision.addBox(L.beehives.x + 4.5, L.beehives.z + 2, 3.6, 1.1, -0.7, -10, ground(L.beehives.x + 4.5, L.beehives.z + 2) + 1.1, { walkable: false });
  // Dry-stone walls flanking the forest path.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = fg.x + side * (4.5 + k * 3.8);
      const z = fg.z - 2 - k * 0.6;
      prefabs.place("stoneWall", x, ground(x, z), z, { rotY: side * 0.15 });
      collision.addBox(x, z, 4, 0.7, side * 0.15, -10, ground(x, z) + 1, { walkable: false });
    }
  }

  // Pine forest & scattered trees (jittered grid, denser inside the forest band). Drawn as
  // chunked thin instances: thousands of trees for a few dozen draw calls.
  const scatter = new Map<string, ScatterItem[]>();
  const addScatter = (name: string, item: ScatterItem) => {
    let list = scatter.get(name);
    if (!list) {
      list = [];
      scatter.set(name, list);
    }
    list.push(item);
  };
  const treeDensity = clamp(0.45 + preset.npcDensity * 0.6, 0.6, 1);
  const cell = 7;
  for (let gx = L.bounds.minX - 40; gx < L.bounds.maxX + 40; gx += cell) {
    for (let gz = L.bounds.minZ - 40; gz < L.bounds.maxZ + 40; gz += cell) {
      const x = gx + rnd.range(0, cell);
      const z = gz + rnd.range(0, cell);
      const r = Math.hypot(x, z);
      const forest = inForest(x, z);
      const field = z < -70 && r < 175;
      // Pines everywhere around the basin except the village, the fields and the path.
      let p = forest * 0.66 + (r > 105 && !field ? 0.34 : 0) + (r > 190 ? 0.16 : 0);
      if (r < 100 && forest < 0.3) p = 0;
      if (distanceToPolyline(x, z, FOREST_PATH) < 3.2 || nearStreet(x, z, 6)) p = 0;
      if (Math.hypot(x - fg.x, z - fg.z) < 9 || Math.hypot(x - L.beehives.x - 2, z - L.beehives.z) < 6) p = 0;
      if (!rnd.chance(p * treeDensity)) continue;
      const h = ground(x, z);
      const young = rnd.chance(0.22);
      addScatter(young ? `pineY${rnd.int(1, 2)}` : `pine${rnd.int(1, 4)}`, {
        x,
        y: h - 0.1,
        z,
        scale: rnd.range(0.85, 1.2),
        rotY: rnd.range(0, Math.PI * 2),
        tint: [rnd.range(0.88, 1.08), rnd.range(0.92, 1.06), rnd.range(0.85, 1), 1],
      });
      if (x > L.bounds.minX && x < L.bounds.maxX && z > L.bounds.minZ && z < L.bounds.maxZ) collision.addCircle(x, z, young ? 0.25 : 0.42, h - 2, h + 8, { walkable: false });
      // Maquis undergrowth.
      if (forest > 0.4 && rnd.chance(0.35)) {
        const bx = x + rnd.range(-2.5, 2.5);
        const bz = z + rnd.range(-2.5, 2.5);
        if (distanceToPolyline(bx, bz, FOREST_PATH) > 2.5) addScatter("bush", { x: bx, y: ground(bx, bz), z: bz, scale: rnd.range(0.7, 1.3), rotY: rnd.range(0, 6), tint: [0.85, 0.95, 0.7, 1] });
      }
      if (rnd.chance(0.06)) addScatter(`rock${rnd.int(1, 3)}`, { x: x + 2, y: ground(x + 2, z + 1) - 0.25, z: z + 1, scale: rnd.range(0.6, 1.3), rotY: rnd.range(0, 6) });
    }
  }
  // A few cypresses and olive-like trees around the village edge.
  for (let i = 0; i < 26; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = rnd.range(70, 105);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearStreet(x, z, 7) || z > 80 || lots.some((l) => Math.hypot(l.x - x, l.z - z) < 14)) continue;
    const h = ground(x, z);
    prefabs.place(rnd.chance(0.4) ? "cypress" : `tree${rnd.int(1, 3)}`, x, h, z, { scale: rnd.range(0.8, 1.2), tint: [0.9, 1, 0.8, 1] });
    collision.addCircle(x, z, 0.45, h - 2, h + 6, { walkable: false });
  }

  // ---------------------------------------------------------------- fields
  ctx.progress(0.72, "Harman yeri ve tarlalar");
  await ctx.yieldFrame();
  for (let x = -110; x <= 110; x += 7) {
    for (let z = -86; z >= -160; z -= 7) {
      if (Math.abs(x - 3) < 7 || Math.hypot(x - L.harman.x, z - L.harman.z) < 12 || !rnd.chance(0.45)) continue;
      const sx = x + rnd.range(-1.5, 1.5);
      const sz = z + rnd.range(-1.5, 1.5);
      addScatter("sheaf", { x: sx, y: ground(sx, sz) - 0.05, z: sz, rotY: rnd.range(0, 6), scale: rnd.range(0.85, 1.15) });
    }
  }
  const hm = L.harman;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const x = hm.x + Math.cos(a) * 8.6;
    const z = hm.z + Math.sin(a) * 8.6;
    S("stone").box(x, ground(x, z) + 0.1, z, 1.2, 0.35, 0.5, { color: shade(hexColor("#a59d90"), rnd.range(0.8, 1)), jitter: 0.1 });
  }
  prefabs.place("haystack", hm.x + 13, ground(hm.x + 13, hm.z + 3), hm.z + 3);
  prefabs.place("haystack", hm.x - 12, ground(hm.x - 12, hm.z - 5), hm.z - 5, { scale: 0.8 });
  collision.addCircle(hm.x + 13, hm.z + 3, 2, -10, 30, { walkable: false });
  collision.addCircle(hm.x - 12, hm.z - 5, 1.6, -10, 30, { walkable: false });
  // Field walls.
  for (let x = -100; x <= 100; x += 4.1) {
    if (Math.abs(x - 3) < 5) continue;
    const z = -78 + Math.sin(x * 0.05) * 1.5;
    addScatter("stoneWall", { x, y: ground(x, z), z, rotY: Math.cos(x * 0.05) * 0.07 });
    collision.addBox(x, z, 4.1, 0.7, 0, -10, ground(x, z) + 1, { walkable: false });
  }

  flushStatics("village");
  for (const [name, list] of scatter) prefabs.scatter(name, list);

  // Chimney smoke from a few houses (more visible at dusk).
  const chimneySmoke: ParticleSystem[] = [];
  for (const top of chimneyTops.filter((_, i) => i % 4 === 1).slice(0, 5)) {
    chimneySmoke.push(fx.smokeColumn(top, 0.22));
  }

  // --------------------------------------------------------------- navigation
  ctx.progress(0.88, "Yollar hesaplanıyor");
  await ctx.yieldFrame();
  const nav = new NavGraph(collision, 6, ground);
  nav.addRegion(-95, -95, 95, 92);
  nav.build();

  const surfaceAt = (x: number, z: number, feetY: number): Surface => {
    const g = ground(x, z);
    if (feetY > g + 0.3) return "stone";
    if (Math.hypot(x - L.square.x, z - L.square.z) < L.square.radius || nearStreet(x, z, 2.6)) return "stone";
    if (inForest(x, z) > 0.5 || distanceToPolyline(x, z, FOREST_PATH) < 2) return "dirt";
    return "grass";
  };

  return {
    terrain,
    collision,
    nav,
    anchors,
    groundAt: (x, z, feetY = 999) => collision.groundHeight(x, z, feetY, 0.5),
    surfaceAt,
    dibek: { center: new Vector3(dib.x, dibY, dib.z), top: dibY + 0.74, wheat, sacks: dibekSacks },
    hearth: { front, step: new Vector3(stepX, ocY + 0.44, stepZ), center: new Vector3(oc.x, ocY, oc.z), facing: facing + Math.PI, kazan, contents, flames, light, fire, steam, logPile },
    wedding,
    servedBowls,
    windowGlow,
    chimneySmoke,
  };
}

function registerPrefabs(prefabs: PrefabLibrary): void {
  for (let i = 0; i < 6; i++) prefabs.register(`mHouse${i}`, () => M.muglaHouse(i));
  prefabs.register("kabalakGate", M.kabalakGate);
  for (let i = 1; i <= 4; i++) prefabs.register(`pine${i}`, () => M.redPine(i));
  for (let i = 1; i <= 2; i++) prefabs.register(`pineY${i}`, () => M.redPine(i, true));
  prefabs.register("cinar", M.cinar);
  prefabs.register("cesme", M.cesme);
  prefabs.register("dibek", M.dibekStone);
  prefabs.register("ocak", M.ocak);
  prefabs.register("sundurma", M.sundurma);
  prefabs.register("ambar", M.ambar);
  prefabs.register("mescit", M.mescit);
  prefabs.register("stallKasap", () => M.stall("kasap"));
  prefabs.register("stallBakkal", () => M.stall("bakkal"));
  prefabs.register("beehives", M.beehives);
  prefabs.register("sheaf", M.sheaf);
  prefabs.register("haystack", M.haystack);
  prefabs.register("sofra", M.sofra);
  prefabs.register("bowl", M.servedBowl);
  prefabs.register("weddingFlag", M.weddingFlag);
  prefabs.register("stoneWall", M.dryStoneWall);
  prefabs.register("testi", () => M.clayJar(false));
  prefabs.register("kup", () => M.clayJar(true));
  prefabs.register("sacks", P.sacks);
  prefabs.register("barrel", P.barrel);
  prefabs.register("cart", P.cart);
  prefabs.register("logStack", P.logStack);
  prefabs.register("cypress", P.cypress);
  for (let i = 1; i <= 3; i++) prefabs.register(`tree${i}`, () => P.broadTree(i));
  prefabs.register("bush", P.bush);
  for (let i = 1; i <= 3; i++) prefabs.register(`rock${i}`, () => P.rock(i));
}
