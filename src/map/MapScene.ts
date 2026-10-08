import {
  ArcRotateCamera,
  Color3,
  Color4,
  Matrix,
  PBRMaterial,
  PointerEventTypes,
  Scene,
  ShadowGenerator,
  Vector3,
  type AbstractMesh,
  type Mesh,
} from "@babylonjs/core";
import { GeoBuilder, hexColor, mixColor, shade, type RGBA } from "../assets/GeoBuilder";
import { GAME_CONFIG } from "../config/gameConfig";
import type { GameScene, GameServices } from "../core/GameServices";
import type { Settings } from "../core/SaveManager";
import type { CityEntry, TurkeyGeo } from "../data/types";
import { MaterialLibrary } from "../rendering/MaterialLibrary";
import { ATLAS_RECTS } from "../rendering/ProceduralTextures";
import { RenderPipeline } from "../rendering/RenderPipeline";
import { createSkyEnvironment, type SkyEnvironment } from "../rendering/SkyEnvironment";
import { fogColorFromSky, SKY_PRESETS } from "../rendering/SkyModel";
import { Water } from "../rendering/Water";
import { nextFrame, wait } from "../utils/async";
import { clamp, damp, easeInOutCubic, lerp, pointInPolygon } from "../utils/math";
import { Noise2D } from "../utils/noise";
import { Random } from "../utils/random";
import { centroid, project, projectRing, signedArea } from "./GeoProjection";
import { extrudePolygon, ribbon } from "./MapGeometry";

interface ProvinceEntry {
  id: string;
  name: string;
  mesh: Mesh;
  city: CityEntry | null;
  active: boolean;
  lift: number;
  targetLift: number;
  center: Vector3;
}

type MapMode = "menu" | "map" | "selecting";

/** Pole, banner and pulsing ring that mark a playable city. */
interface CityMarker {
  prov: ProvinceEntry;
  material: PBRMaterial;
  pole: Mesh;
  flag: Mesh;
  ring: Mesh;
}

const MAP = GAME_CONFIG.map;

/**
 * The Türkiye map table: extruded provinces from Natural Earth data, a stylized animated
 * sea, drifting low-poly clouds and the interactive city layer. Only active cities
 * (İstanbul, Muğla) react to clicks; the rest are desaturated and show "henüz keşfedilmedi".
 */
export class MapScene implements GameScene {
  readonly scene: Scene;
  private camera!: ArcRotateCamera;
  private pipeline!: RenderPipeline;
  private sky!: SkyEnvironment;
  private water!: Water;
  private materials!: MaterialLibrary;
  private provinces: ProvinceEntry[] = [];
  private byMesh = new Map<AbstractMesh, ProvinceEntry>();
  private clouds: { mesh: Mesh; speed: number }[] = [];
  private mode: MapMode = "menu";
  private pointer = { x: 0, y: 0, moved: false, inside: false };
  private hovered: ProvinceEntry | null = null;
  private landMat!: PBRMaterial;
  private hoverMat!: PBRMaterial;
  private markers: CityMarker[] = [];
  private emergence: Mesh | null = null;
  private time = 0;
  private camTarget = new Vector3(0, 0, -2);
  private baseRadius: number = MAP.cameraRadius;
  private touchTooltipUntil = 0;
  private lastTouchProvince: ProvinceEntry | null = null;
  onCitySelected: ((city: CityEntry) => void) | null = null;

  private constructor(
    private readonly services: GameServices,
    private readonly geo: TurkeyGeo,
    private readonly cities: CityEntry[],
  ) {
    this.scene = new Scene(services.engine);
    this.scene.clearColor = new Color4(0.05, 0.035, 0.025, 1);
    this.scene.skipPointerMovePicking = true;
  }

  static async create(services: GameServices, geo: TurkeyGeo, cities: CityEntry[], onProgress: (f: number, s: string) => void): Promise<MapScene> {
    const map = new MapScene(services, geo, cities);
    await map.build(onProgress);
    return map;
  }

  private async build(onProgress: (f: number, s: string) => void): Promise<void> {
    const scene = this.scene;
    const preset = this.services.preset();
    this.materials = new MaterialLibrary(scene, preset.textureSize);

    this.camera = new ArcRotateCamera("map-cam", MAP.cameraAlpha, MAP.cameraBeta, MAP.cameraRadius, this.camTarget.clone(), scene);
    this.camera.fov = 0.62;
    this.camera.minZ = 0.3;
    this.camera.maxZ = 2400;
    scene.activeCamera = this.camera;

    onProgress(0.1, "Gökyüzü hazırlanıyor");
    const skyParams = SKY_PRESETS.mapDay();
    this.sky = await createSkyEnvironment(scene, skyParams, {
      domeRadius: 1100,
      reflections: preset.environmentReflections,
      envSize: 32,
      sunIntensity: 2.8,
      ambientIntensity: 0.8,
      environmentIntensity: 0.8,
    });
    this.materials.adaptToEnvironment(!!scene.environmentTexture);
    const fog = fogColorFromSky(skyParams);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = fog;
    scene.fogDensity = 0.0028;

    this.pipeline = new RenderPipeline(scene, this.camera, this.sky.sun, { exposure: 1.0, contrast: 1.12, vignette: 2.6, grain: 0 }, true);
    this.pipeline.apply(preset, this.services.save.settings);

    onProgress(0.3, "Türkiye haritası çiziliyor");
    await nextFrame();
    this.buildLand();
    onProgress(0.55, "Denizler dolduruluyor");
    await nextFrame();
    this.buildSea(fog);
    onProgress(0.7, "Bulutlar ve işaretler");
    this.buildClouds();
    this.buildMarkers();

    this.setupShadows();
    this.setupPointer();
    this.fitCamera();
    onProgress(0.85, "Shader'lar derleniyor");
    await scene.whenReadyAsync();
    onProgress(1, "Hazır");
  }

  // --------------------------------------------------------------------------- land
  private buildLand(): void {
    const scene = this.scene;
    const cityById = new Map(this.cities.map((c) => [c.id, c]));
    const rnd = new Random(81);
    this.landMat = this.materials.variant("terrain", "map-land");
    this.landMat.roughness = 0.9;
    this.hoverMat = this.materials.variant("terrain", "map-land-hover");
    this.hoverMat.emissiveColor = new Color3(0.13, 0.1, 0.06);
    const activeMat = (id: string) => {
      const m = new PBRMaterial(`map-active-${id}`, scene);
      m.albedoColor = Color3.White();
      m.roughness = 0.55;
      m.metallic = 0.05;
      m.emissiveColor = Color3.FromHexString("#ff2a2a").toLinearSpace();
      m.emissiveIntensity = 0.2;
      return m;
    };

    const borders = new GeoBuilder();
    const borderColor = hexColor("#3a342c");
    const inactiveTop = hexColor("#a2967c");
    const inactiveSide = hexColor("#5b5040");

    for (const prov of this.geo.provinces) {
      const city = cityById.get(prov.id) ?? null;
      const active = !!city?.active;
      const b = new GeoBuilder();
      const h = MAP.provinceHeight + (active ? MAP.activeLift : 0);
      const variation = 1 + rnd.range(-0.07, 0.07);
      const top: RGBA = active ? hexColor("#c3222b") : shade(inactiveTop, variation);
      const side: RGBA = active ? hexColor("#6d1015") : inactiveSide;
      let cx = 0;
      let cz = 0;
      let count = 0;
      for (const poly of prov.polys) {
        const rings = poly.map((r) => projectRing(r)).filter((r) => r.length >= 3);
        if (!rings.length) continue;
        extrudePolygon(b, rings, -0.6, h, top, side);
        const ring0 = rings[0];
        if (Math.abs(signedArea(ring0)) > 0.02) {
          const c = centroid(ring0);
          const w = Math.abs(signedArea(ring0));
          cx += c[0] * w;
          cz += c[1] * w;
          count += w;
        }
        for (const r of rings) {
          if (active) ribbon(b, r, 0.12, h + 0.012, true, hexColor("#f0c060"));
          else ribbon(borders, r, MAP.borderWidth, MAP.provinceHeight + 0.006, true, borderColor);
        }
      }
      const mesh = b.toMesh(`prov-${prov.id}`, scene);
      mesh.material = active ? activeMat(prov.id) : this.landMat;
      mesh.receiveShadows = true;
      mesh.isPickable = true;
      const [lx, lz] = project(prov.label[0], prov.label[1]);
      const center = count > 0 ? new Vector3(cx / count, h, cz / count) : new Vector3(lx, h, lz);
      const entry: ProvinceEntry = { id: prov.id, name: prov.name, mesh, city, active, lift: 0, targetLift: 0, center };
      if (active) entry.center = new Vector3(lx, h, lz);
      this.provinces.push(entry);
      this.byMesh.set(mesh, entry);
    }
    const borderMesh = borders.toMesh("prov-borders", scene);
    borderMesh.material = this.materials.get("matte");
    borderMesh.isPickable = false;

    // Gilded national outline.
    const outline = new GeoBuilder();
    for (const ring of this.geo.outline) {
      ribbon(outline, projectRing(ring), MAP.outlineWidth, MAP.provinceHeight + 0.01, true, hexColor("#d9c288"));
    }
    const outlineMesh = outline.toMesh("tr-outline", scene);
    const gold = this.materials.get("gold");
    outlineMesh.material = gold;
    outlineMesh.isPickable = false;

    // Neighbouring countries: low, dark, non-interactive.
    const nb = new GeoBuilder();
    const nbTop = hexColor("#5d5446");
    const nbSide = hexColor("#3a332a");
    for (const n of this.geo.neighbors) {
      for (const poly of n.polys) {
        const ring = projectRing(poly[0]);
        if (ring.length < 3) continue;
        extrudePolygon(nb, [ring], -0.6, MAP.neighborHeight, shade(nbTop, 1 + rnd.range(-0.06, 0.06)), nbSide);
        ribbon(nb, ring, 0.09, MAP.neighborHeight + 0.006, true, hexColor("#2e2820"));
      }
    }
    const nbMesh = nb.toMesh("neighbors", scene);
    nbMesh.material = this.landMat;
    nbMesh.receiveShadows = true;
    nbMesh.isPickable = false;
  }

  private buildSea(fog: Color3): void {
    // Rasterize land into a mask, blur it → "depth" (0 near coasts, 1 open sea).
    const size = 512;
    const rect: [number, number, number, number] = [-270, -210, 540, 420];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    const toPx = ([x, z]: [number, number]): [number, number] => [((x - rect[0]) / rect[2]) * size, ((z - rect[1]) / rect[3]) * size];
    const drawRing = (ring: [number, number][]) => {
      ctx.beginPath();
      ring.forEach((p, i) => {
        const [px, py] = toPx(p);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    };
    for (const p of this.geo.provinces) for (const poly of p.polys) drawRing(projectRing(poly[0]));
    for (const n of this.geo.neighbors) for (const poly of n.polys) drawRing(projectRing(poly[0]));
    const img = ctx.getImageData(0, 0, size, size).data;
    let data: Uint8Array = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) data[i] = img[i * 4];
    data = boxBlur(boxBlur(data, size, 6), size, 6);
    // Stretch contrast so the coastal band is narrow.
    for (let i = 0; i < data.length; i++) data[i] = Math.min(255, data[i] * 1.6);

    const preset = this.services.preset();
    this.water = new Water(
      this.scene,
      {
        extent: 1600,
        cells: Math.max(60, Math.round(preset.waterCells * 0.8 / 2) * 2),
        level: 0,
        waveAmplitude: 0.09,
        waveFrequency: 2.6,
        deepColor: "#0b2f4a",
        shallowColor: "#2a7a88",
        foamColor: "#e8f0ea",
        foamAmount: 0.5,
        fogColor: fog,
        fogDensity: 0.0028,
        depth: { data, width: size, height: size, rect },
        animate: true,
      },
      this.sky.params,
    );
  }

  private buildClouds(): void {
    const rnd = new Random(12);
    const mat = new PBRMaterial("cloud", this.scene);
    mat.albedoColor = new Color3(1, 1, 1);
    mat.roughness = 1;
    mat.emissiveColor = new Color3(0.22, 0.22, 0.24);
    for (let i = 0; i < 7; i++) {
      const b = new GeoBuilder();
      const puffs = rnd.int(3, 6);
      for (let p = 0; p < puffs; p++) {
        b.sphere(rnd.range(-4, 4), rnd.range(-0.4, 0.6), rnd.range(-2, 2), rnd.range(2, 3.6), { color: [1, 1, 1, 1], segments: 7, rings: 5, scaleY: 0.55 });
      }
      const m = b.toMesh(`cloud-${i}`, this.scene);
      m.material = mat;
      m.position.set(rnd.range(-110, 110), rnd.range(14, 22), rnd.range(-60, 60));
      m.scaling.setAll(rnd.range(0.6, 1.1));
      m.isPickable = false;
      this.clouds.push({ mesh: m, speed: rnd.range(0.6, 1.4) });
    }
  }

  private buildMarkers(): void {
    const scene = this.scene;
    const ringMat = new PBRMaterial("ring", scene);
    ringMat.albedoColor = Color3.Black();
    ringMat.emissiveColor = Color3.FromHexString("#ffcf6a").toLinearSpace();
    ringMat.emissiveIntensity = 1.4;
    ringMat.disableLighting = true;
    ringMat.alpha = 0.9;
    for (const prov of this.provinces) {
      if (!prov.active) continue;
      const top = prov.center.y;
      const b = new GeoBuilder();
      b.cylinder(0, 0, 0, 0.08, 0.06, 4.2, { color: hexColor("#5a3a1e"), segments: 6 });
      b.sphere(0, 4.3, 0, 0.16, { color: hexColor("#d8ad48"), segments: 6, rings: 4 });
      const pole = b.toMesh(`marker-pole-${prov.id}`, scene);
      pole.material = this.materials.get("wood");
      pole.position.copyFrom(prov.center);
      pole.position.y = top;
      // İstanbul flies the Ottoman banner; other cities a crimson-gold swallowtail pennant.
      const fb = new GeoBuilder();
      const segs = 6;
      if (prov.id === "istanbul") {
        const [u0, v0, u1, v1] = ATLAS_RECTS.flagOttoman;
        for (let i = 0; i < segs; i++) {
          const x0 = (i / segs) * 2.2;
          const x1 = ((i + 1) / segs) * 2.2;
          fb.quad([x0, 0, 0], [x1, 0, 0], [x1, 1.3, 0], [x0, 1.3, 0], [u0 + ((u1 - u0) * i) / segs, v1, u0 + ((u1 - u0) * (i + 1)) / segs, v0], [0, 0, -1]);
        }
      } else {
        const red = hexColor("#b3141c");
        const gold = hexColor("#d8ad48");
        for (let i = 0; i < segs; i++) {
          const x0 = (i / segs) * 2;
          const x1 = ((i + 1) / segs) * 2;
          const notch = (x: number) => (x > 1.4 ? (x - 1.4) * 0.9 : 0);
          fb.quad([x0, notch(x0), 0], [x1, notch(x1), 0], [x1, 1.2 - notch(x1), 0], [x0, 1.2 - notch(x0), 0], [0, 0, 1, 1], [0, 0, -1], i % 3 === 1 ? gold : red);
        }
      }
      const flag = fb.toMesh(`marker-flag-${prov.id}`, scene, true);
      flag.material = prov.id === "istanbul" ? this.materials.get("props") : this.materials.get("fabric");
      flag.parent = pole;
      flag.position.set(0.05, 2.8, 0);
      const rb = new GeoBuilder();
      const ring: [number, number][] = [];
      for (let i = 0; i < 40; i++) ring.push([Math.cos((i / 40) * Math.PI * 2) * 2.6, Math.sin((i / 40) * Math.PI * 2) * 2.6]);
      ribbon(rb, ring, 0.18, 0, true, [1, 1, 1, 1]);
      const ringMesh = rb.toMesh(`marker-ring-${prov.id}`, scene);
      ringMesh.material = ringMat.clone(`ring-${prov.id}`);
      ringMesh.position.copyFrom(prov.center);
      ringMesh.position.y = top + 0.03;
      ringMesh.isPickable = false;
      pole.isPickable = false;
      flag.isPickable = false;
      this.pipeline.glowLayer?.addIncludedOnlyMesh(ringMesh);
      this.markers.push({ prov, material: prov.mesh.material as PBRMaterial, pole, flag, ring: ringMesh });
    }
    ringMat.dispose();
    // Small stone pins for upcoming cities.
    const pins = new GeoBuilder();
    for (const p of this.provinces) {
      if (p.active || !p.city) continue;
      const geoProv = this.geo.provinces.find((g) => g.id === p.id)!;
      const [x, z] = project(geoProv.label[0], geoProv.label[1]);
      pins.cylinder(x, MAP.provinceHeight, z, 0.32, 0.18, 0.35, { color: hexColor("#6a645a"), segments: 6 });
      pins.cylinder(x, MAP.provinceHeight + 0.35, z, 0.12, 0.02, 1.1, { color: hexColor("#8f887b"), segments: 4 });
    }
    const pinMesh = pins.toMesh("city-pins", scene);
    pinMesh.material = this.materials.get("stone");
    pinMesh.isPickable = false;
  }

  /** Low-poly relief of the selected province that "rises" during the zoom transition. */
  private buildEmergence(provinceId: string): Mesh | null {
    const geoProv = this.geo.provinces.find((p) => p.id === provinceId);
    if (!geoProv) return null;
    const rings = geoProv.polys.map((poly) => projectRing(poly[0]));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of rings)
      for (const [x, z] of r) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    const forested = provinceId === "mugla";
    const steppe = provinceId === "ankara" || provinceId === "kayseri";
    const noise = new Noise2D(provinceId === "istanbul" ? 1453 : 48);
    // Large provinces get a coarser grid so the relief stays a few thousand triangles.
    const step = Math.max(0.28, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / 9000));
    const b = new GeoBuilder();
    const inside = (x: number, z: number) => rings.some((r) => pointInPolygon(x, z, r));
    const relief = forested ? 1.4 : 0.9;
    const hAt = (x: number, z: number) => (inside(x, z) ? 0.15 + Math.max(0, noise.fbm(x * 0.35, z * 0.35, 3) + 0.3) * relief : -0.05);
    const grass = forested ? hexColor("#4f6e34") : steppe ? hexColor("#a89a64") : hexColor("#6f8a43");
    const dirt = forested ? hexColor("#8a7a5a") : steppe ? hexColor("#b49a70") : hexColor("#9b7b4f");
    for (let x = minX; x < maxX; x += step) {
      for (let z = minZ; z < maxZ; z += step) {
        if (!inside(x + step / 2, z + step / 2)) continue;
        const h00 = hAt(x, z);
        const h10 = hAt(x + step, z);
        const h01 = hAt(x, z + step);
        const h11 = hAt(x + step, z + step);
        const avg = (h00 + h10 + h01 + h11) / 4;
        const col = mixColor(grass, dirt, clamp(avg * 0.9, 0, 1));
        b.tri([x, h00, z], [x + step, h10, z], [x + step, h11, z + step], [0, 0], [1, 0], [1, 1], [0, 1, 0], col);
        b.tri([x, h00, z], [x + step, h11, z + step], [x, h01, z + step], [0, 0], [1, 1], [0, 1], [0, 1, 0], shade(col, 0.95));
      }
    }
    if (provinceId === "istanbul") {
      // Miniature land walls on the historic peninsula.
      const walls: [number, number][] = [
        [28.922, 40.995],
        [28.928, 41.011],
        [28.934, 41.026],
        [28.945, 41.037],
      ];
      const wallCol = hexColor("#d9c9a3");
      for (let i = 0; i < walls.length - 1; i++) {
        const [ax, az] = project(walls[i][0], walls[i][1]);
        const [bx, bz] = project(walls[i + 1][0], walls[i + 1][1]);
        const segs = 4;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const x = lerp(ax, bx, t);
          const z = lerp(az, bz, t);
          b.box(x, hAt(x, z) + 0.12, z, 0.05, 0.24, 0.05, { color: wallCol });
        }
      }
    } else if (provinceId === "kayseri") {
      // Snow-capped Erciyes south of the city and the walled market (han) in the centre.
      const [ex, ez] = project(35.45, 38.53);
      const eh = hAt(ex, ez);
      b.cylinder(ex, eh, ez, 1.1, 0.35, 0.9, { segments: 9, color: hexColor("#7a6e64") });
      b.cylinder(ex, eh + 0.9, ez, 0.35, 0.0, 0.45, { segments: 9, color: hexColor("#f2f4f6") });
      const [cx, cz] = project(35.49, 38.72);
      const ch = hAt(cx, cz);
      b.box(cx, ch + 0.1, cz, 0.42, 0.2, 0.42, { color: hexColor("#6e655c") });
      b.box(cx, ch + 0.14, cz, 0.26, 0.12, 0.26, { color: hexColor("#948a7e") });
    } else if (steppe) {
      // Miniature Ankara Castle on its hill and the Assembly building at its foot.
      const geoP = this.geo.provinces.find((p) => p.id === "ankara")!;
      const [cx, cz] = project(32.86, 39.94);
      void geoP;
      const stone = hexColor("#b8a888");
      b.box(cx, hAt(cx, cz) + 0.12, cz, 0.5, 0.24, 0.4, { color: stone });
      for (const [dx, dz] of [
        [-0.25, -0.2],
        [0.25, -0.2],
        [-0.25, 0.2],
        [0.25, 0.2],
      ])
        b.box(cx + dx, hAt(cx, cz) + 0.18, cz + dz, 0.1, 0.36, 0.1, { color: stone });
      b.box(cx + 0.5, hAt(cx, cz) + 0.08, cz + 0.4, 0.24, 0.16, 0.18, { color: hexColor("#d8c8a8") });
    } else {
      // Miniature pine forest covering the hills.
      const rnd = new Random(52);
      const pine = hexColor("#2f4a2a");
      for (let i = 0; i < 260; i++) {
        const x = rnd.range(minX, maxX);
        const z = rnd.range(minZ, maxZ);
        if (!inside(x, z)) continue;
        const h = hAt(x, z);
        const s = rnd.range(0.12, 0.2);
        b.cylinder(x, h, z, s, 0, s * 3.2, { segments: 5, color: shade(pine, rnd.range(0.85, 1.15)) });
      }
    }
    const mesh = b.toMesh(`relief-${provinceId}`, this.scene);
    mesh.material = this.materials.get("terrain");
    mesh.position.y = MAP.provinceHeight + MAP.activeLift;
    mesh.scaling.y = 0.001;
    mesh.setEnabled(false);
    mesh.isPickable = false;
    return mesh;
  }

  private setupShadows(): void {
    // The map is small: one shadow map fitted around all casters is crisper than cascades.
    if (!this.services.save.settings.shadows || this.services.preset().shadows === "off") return;
    const gen = new ShadowGenerator(this.services.preset().shadowMapSize, this.sky.sun, true);
    gen.usePercentageCloserFiltering = true;
    gen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    gen.bias = 0.003;
    gen.darkness = 0.25;
    this.sky.sun.autoUpdateExtends = true;
    for (const c of this.clouds) gen.addShadowCaster(c.mesh);
    for (const p of this.provinces) if (p.active) gen.addShadowCaster(p.mesh);
    for (const m of this.markers) gen.addShadowCaster(m.pole, true);
    this.mapShadow = gen;
  }

  private mapShadow: ShadowGenerator | null = null;

  // ------------------------------------------------------------------------- input
  private setupPointer(): void {
    this.scene.onPointerObservable.add((info) => {
      const e = info.event as PointerEvent;
      if (info.type === PointerEventTypes.POINTERMOVE) {
        this.pointer.x = this.scene.pointerX;
        this.pointer.y = this.scene.pointerY;
        this.pointer.moved = true;
        this.pointer.inside = true;
      } else if (info.type === PointerEventTypes.POINTERTAP) {
        if (this.mode !== "map") return;
        this.pointer.x = this.scene.pointerX;
        this.pointer.y = this.scene.pointerY;
        const prov = this.pickProvince();
        if (!prov) return;
        if (prov.active && prov.city) {
          this.services.audio.play("uiConfirm");
          this.onCitySelected?.(prov.city);
        } else {
          this.services.audio.play("miss", { volume: 0.5 });
          if (e.pointerType === "touch") {
            this.lastTouchProvince = prov;
            this.touchTooltipUntil = performance.now() + 2200;
          }
        }
      }
    });
    this.services.canvas.addEventListener("pointerleave", this.onLeave);
  }

  private onLeave = (): void => {
    this.pointer.inside = false;
  };

  private pickProvince(): ProvinceEntry | null {
    const pick = this.scene.pick(this.pointer.x, this.pointer.y, (m) => this.byMesh.has(m));
    return pick?.hit && pick.pickedMesh ? (this.byMesh.get(pick.pickedMesh) ?? null) : null;
  }

  // ------------------------------------------------------------------------- modes
  setMode(mode: MapMode): void {
    this.mode = mode;
    const ui = this.services.ui.map;
    if (mode === "map") {
      ui.show();
      ui.setControlsVisible(true);
      for (const city of this.cities) {
        if (!city.active) continue;
        ui.setActiveCity(city.id, city.name, `${city.year} — ${city.title}`, this.services.save.save.completedScenarios.includes(city.scenario ?? ""), city.doneLabel);
      }
    } else if (mode === "menu") {
      ui.hide();
    } else {
      // Selecting: the cinematic owns the screen.
      ui.showTooltip(null, 0, 0);
      ui.hide();
    }
  }

  private fitCamera(): void {
    const engine = this.services.engine;
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const halfWidth = 82;
    const hfov = 2 * Math.atan(Math.tan(this.camera.fov / 2) * aspect);
    const needed = halfWidth / Math.tan(hfov / 2) + 20;
    this.baseRadius = clamp(Math.max(MAP.cameraRadius, needed), MAP.cameraRadius, 420);
  }

  // ------------------------------------------------------------------------ update
  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.water.update(dt, this.camera);

    if (this.mode === "menu" || this.mode === "map") {
      this.fitCamera();
      const menu = this.mode === "menu";
      const px = this.pointer.inside ? this.scene.pointerX / Math.max(1, this.services.engine.getRenderWidth()) - 0.5 : 0;
      const py = this.pointer.inside ? this.scene.pointerY / Math.max(1, this.services.engine.getRenderHeight()) - 0.5 : 0;
      const alpha = MAP.cameraAlpha + (menu ? Math.sin(t * 0.07) * 0.32 : px * -0.06);
      const beta = (menu ? MAP.cameraBeta - 0.1 : MAP.cameraBeta) + (menu ? Math.sin(t * 0.11) * 0.04 : py * 0.04);
      const radius = this.baseRadius * (menu ? 0.92 : 1);
      const k = damp(menu ? 0.6 : 2.2, dt);
      this.camera.alpha = lerp(this.camera.alpha, alpha, k);
      this.camera.beta = lerp(this.camera.beta, beta, k);
      this.camera.radius = lerp(this.camera.radius, radius, k);
      this.camera.target = Vector3.Lerp(this.camera.target, this.camTarget, k);
    }

    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 140) c.mesh.position.x = -140;
    }

    this.updateHover(dt);
    for (const p of this.provinces) {
      p.lift = lerp(p.lift, p.targetLift, damp(10, dt));
      p.mesh.position.y = p.lift;
    }

    this.markers.forEach((m, i) => {
      const prov = m.prov;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.3);
      m.material.emissiveIntensity = 0.16 + pulse * 0.22 + (this.hovered === prov ? 0.35 : 0);
      m.ring.scaling.setAll(1 + pulse * 0.25);
      (m.ring.material as PBRMaterial).alpha = 0.55 + (1 - pulse) * 0.4;
      m.pole.position.y = prov.center.y + prov.lift;
      m.ring.position.y = prov.center.y + prov.lift + 0.03;
      m.flag.rotation.y = Math.sin(t * 1.7 + i) * 0.25;
      m.flag.rotation.x = Math.sin(t * 2.3 + i) * 0.04;
      const scale = this.camera.radius / MAP.cameraRadius;
      m.pole.scaling.setAll(clamp(scale, 0.25, 1.6));
      this.placeLabel(prov);
    });
  }

  private updateHover(dt: number): void {
    void dt;
    const ui = this.services.ui.map;
    let hovered: ProvinceEntry | null = null;
    if (this.mode === "map" && this.pointer.inside && this.pointer.moved) hovered = this.pickProvince();
    if (this.mode === "map" && performance.now() < this.touchTooltipUntil) hovered = this.lastTouchProvince;
    if (hovered !== this.hovered) {
      if (this.hovered && !this.hovered.active) this.hovered.mesh.material = this.landMat;
      if (this.hovered) this.hovered.targetLift = 0;
      this.hovered = hovered;
      if (hovered) {
        hovered.targetLift = hovered.active ? MAP.hoverLift * 1.4 : MAP.hoverLift * 0.6;
        if (!hovered.active) hovered.mesh.material = this.hoverMat;
        this.services.audio.play("uiHover", { volume: hovered.active ? 0.9 : 0.35 });
      }
      this.services.canvas.style.cursor = hovered?.active ? "pointer" : hovered ? "not-allowed" : "default";
    }
    if (this.mode !== "map" || !hovered) {
      ui.showTooltip(null, 0, 0);
      return;
    }
    const tx = this.cssX(this.pointer.x);
    const ty = this.cssY(this.pointer.y);
    if (hovered.active && hovered.city) {
      ui.showTooltip({ name: hovered.city.name, message: `${hovered.city.year} — ${hovered.city.title}`, teaser: "Tıkla ve tarihin içine gir", active: true }, tx, ty);
    } else {
      const teaser = hovered.city ? `Yakında: ${hovered.city.year} · ${hovered.city.title}` : undefined;
      ui.showTooltip({ name: hovered.name, message: "Bu şehir henüz keşfedilmedi.", teaser, active: false }, tx, ty);
    }
  }

  /** scene.pointerX/Y are canvas-relative CSS pixels; convert to viewport coordinates. */
  private cssX(x: number): number {
    return x + this.services.canvas.getBoundingClientRect().left;
  }

  private cssY(y: number): number {
    return y + this.services.canvas.getBoundingClientRect().top;
  }

  private placeLabel(prov: ProvinceEntry): void {
    const engine = this.services.engine;
    const pos = prov.center.clone();
    pos.y += prov.lift + 4.6 * clamp(this.camera.radius / MAP.cameraRadius, 0.25, 1.6);
    const vp = this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const p = Vector3.Project(pos, Matrix.Identity(), this.scene.getTransformMatrix(), vp);
    const scale = engine.getHardwareScalingLevel();
    const visible = this.mode !== "menu" && p.z > 0 && p.z < 1;
    this.services.ui.map.placeLabel(prov.id, p.x * scale, p.y * scale, visible && this.mode === "map", this.hovered === prov);
  }

  // ----------------------------------------------------------------- city selection
  /** Cinematic zoom into the selected city. Resolves once the screen is fully hazed. */
  async playSelectSequence(cityId: string): Promise<void> {
    const prov = this.provinces.find((p) => p.id === cityId);
    if (!prov) return;
    this.setMode("selecting");
    const ui = this.services.ui;
    const audio = this.services.audio;
    audio.play("whoosh", { volume: 0.8 });
    audio.play("drum", { volume: 0.8 });
    audio.stopMusic(2.5);
    ui.map.hideLabels();
    ui.cinematic.setLetterbox(true);
    this.emergence = this.buildEmergence(prov.id);
    for (const p of this.provinces) p.targetLift = p === prov ? MAP.hoverLift : -0.15;

    const cam = this.camera;
    const start = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() };
    const target = prov.center.clone();
    const end1 = { alpha: MAP.cameraAlpha + 0.42, beta: 1.0, radius: 15, target };
    const end2 = { alpha: MAP.cameraAlpha + 0.62, beta: 1.32, radius: 2.4, target: target.add(new Vector3(0.6, 0.6, 0.8)) };

    // Clouds gather around the city for the dive.
    const rnd = new Random(3);
    for (const c of this.clouds) {
      c.mesh.position.set(target.x + rnd.range(-10, 10), rnd.range(3, 9), target.z + rnd.range(-8, 8));
      c.mesh.scaling.setAll(rnd.range(0.5, 0.9));
      c.speed = rnd.range(0.4, 0.9);
    }

    const animate = (from: typeof start, to: typeof end1, duration: number, ease: (t: number) => number, onStep?: (t: number) => void) =>
      new Promise<void>((resolve) => {
        let elapsed = 0;
        const obs = this.scene.onBeforeRenderObservable.add(() => {
          elapsed += this.scene.getEngine().getDeltaTime() / 1000;
          const k = ease(clamp(elapsed / duration, 0, 1));
          cam.alpha = lerp(from.alpha, to.alpha, k);
          cam.beta = lerp(from.beta, to.beta, k);
          cam.radius = lerp(from.radius, to.radius, k);
          cam.target = Vector3.Lerp(from.target, to.target, k);
          onStep?.(k);
          if (elapsed >= duration) {
            this.scene.onBeforeRenderObservable.remove(obs);
            resolve();
          }
        });
      });

    const relief = this.emergence;
    relief?.setEnabled(true);
    const titleTimer = window.setTimeout(() => ui.cinematic.showTitleCity(prov.city?.name.toLocaleUpperCase("tr-TR") ?? "", String(prov.city?.year ?? ""), prov.city?.title ?? ""), 1100);
    const yearTimer = window.setTimeout(() => {
      ui.cinematic.showTitleYear();
      audio.play("drum", { volume: 1 });
    }, 2100);

    await animate(start, end1, MAP.zoomDuration, easeInOutCubic, (k) => {
      if (relief) relief.scaling.y = Math.max(0.001, clamp((k - 0.35) / 0.55, 0, 1) ** 2);
      prov.mesh.visibility = 1;
    });
    // Fast descent through the clouds.
    audio.play("whoosh", { volume: 0.6, pitch: 1.3 });
    const hazeDone = (async () => {
      await wait(500);
      await ui.cinematic.fade(1, 0.9);
    })();
    await animate(end1, end2, 1.5, (x) => x * x * (3 - 2 * x));
    await hazeDone;
    window.clearTimeout(titleTimer);
    window.clearTimeout(yearTimer);
  }

  applySettings(settings: Settings, changed: (keyof Settings)[]): void {
    if (changed.some((c) => c === "quality" || c === "resolutionScale" || c === "postProcessing" || c === "shadows")) {
      this.pipeline.apply(this.services.preset(), settings);
      if (changed.includes("shadows") || changed.includes("quality")) {
        this.mapShadow?.dispose();
        this.mapShadow = null;
        this.setupShadows();
      }
    }
  }

  dispose(): void {
    this.services.canvas.removeEventListener("pointerleave", this.onLeave);
    this.services.canvas.style.cursor = "default";
    this.services.ui.map.hide();
    this.mapShadow?.dispose();
    this.pipeline.dispose();
    this.water.dispose();
    this.sky.dispose();
    this.materials.dispose();
    this.scene.dispose();
  }
}

function boxBlur(src: Uint8Array, size: number, radius: number): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const w = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[y * size + clamp(x, 0, size - 1)];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = sum / w;
      sum += src[y * size + clamp(x + radius + 1, 0, size - 1)] - src[y * size + clamp(x - radius, 0, size - 1)];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[clamp(y, 0, size - 1) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / w;
      sum += tmp[clamp(y + radius + 1, 0, size - 1) * size + x] - tmp[clamp(y - radius, 0, size - 1) * size + x];
    }
  }
  return out;
}
