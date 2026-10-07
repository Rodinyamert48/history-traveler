import { Color4, Matrix, Mesh, Quaternion, TransformNode, Vector3, type AssetContainer, type InstancedMesh, type Scene } from "@babylonjs/core";
import type { MaterialKey, MaterialLibrary } from "../rendering/MaterialLibrary";
import type { RenderPipeline } from "../rendering/RenderPipeline";
import { registerInstancedBufferWithCapacity } from "../rendering/instancing";
import type { RGBA } from "./GeoBuilder";
import type { PartSet, PrefabDef } from "./Prefabs";

interface RegisteredPrefab {
  def: PrefabDef;
  sources: Mesh[];
  tintable: boolean;
  count: number;
}

export interface PlaceOptions {
  rotY?: number;
  scale?: number;
  scaleXYZ?: [number, number, number];
  tint?: RGBA;
  /** Creates a parent node so the whole prefab can be moved/animated later. */
  dynamic?: boolean;
  parent?: TransformNode;
  castShadows?: boolean;
}

/** One placement for scatter(): position, yaw, uniform scale and optional tint. */
export interface ScatterItem {
  x: number;
  y: number;
  z: number;
  rotY?: number;
  scale?: number;
  tint?: RGBA;
}

export interface PlacedPrefab {
  root: TransformNode | null;
  instances: InstancedMesh[];
}

/**
 * Turns PrefabDefs into hidden source meshes (one per material) and stamps instances.
 * - Instances share their source's draw call (GPU instancing).
 * - LOD: a simplified mesh at `lod.distance`, nothing beyond `cullDistance`.
 * - Optional per-instance colour tint through an instanced "color" buffer.
 * - Static instances get frozen world matrices.
 */
export class PrefabLibrary {
  private prefabs = new Map<string, RegisteredPrefab>();
  private factories = new Map<string, () => PrefabDef>();
  private glbOverrides = new Map<string, AssetContainer>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly pipeline: RenderPipeline | null,
    private readonly cullScale: number,
  ) {}

  register(name: string, factory: () => PrefabDef): void {
    this.factories.set(name, factory);
  }

  /** Replaces a procedural prefab with an authored GLB (see AssetLoader / MODEL_MANIFEST). */
  overrideWithContainer(name: string, container: AssetContainer): void {
    this.glbOverrides.set(name, container);
  }

  has(name: string): boolean {
    return this.factories.has(name) || this.prefabs.has(name);
  }

  private ensure(name: string): RegisteredPrefab {
    let reg = this.prefabs.get(name);
    if (reg) return reg;
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`Unknown prefab "${name}"`);
    const def = factory();
    const tintable = !!def.tintable;
    const sources: Mesh[] = [];
    const lodMeshes = new Map<MaterialKey, Mesh>();
    if (def.lod) {
      for (const [key, b] of def.lod.parts.parts) {
        if (b.isEmpty) continue;
        const m = b.toMesh(`${name}:${key}:lod`, this.scene);
        m.material = this.materials.get(key);
        m.isPickable = false;
        lodMeshes.set(key, m);
      }
    }
    const cull = def.cullDistance ? def.cullDistance * this.cullScale : 0;
    for (const [key, b] of def.parts.parts) {
      if (b.isEmpty) continue;
      const m = b.toMesh(`${name}:${key}`, this.scene);
      m.material = this.materials.get(key);
      m.isVisible = false;
      m.isPickable = false;
      if (tintable) {
        // "instanceColor" multiplies the baked vertex colours ("color" would replace them).
        registerInstancedBufferWithCapacity(m, "instanceColor", 4, 1024);
        m.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      }
      if (def.lod) {
        const lodMesh = lodMeshes.get(key) ?? null;
        m.addLODLevel(def.lod.distance * Math.max(0.6, this.cullScale), lodMesh);
      }
      if (cull > 0) m.addLODLevel(cull, null);
      if (def.castShadows && this.pipeline) this.pipeline.addShadowCaster(m);
      sources.push(m);
    }
    // LOD meshes for materials that only exist in the LOD set are ignored (rare).
    for (const [key, lm] of lodMeshes) if (!def.parts.parts.has(key)) lm.dispose();
    reg = { def, sources, tintable, count: 0 };
    this.prefabs.set(name, reg);
    return reg;
  }

  place(name: string, x: number, y: number, z: number, opts: PlaceOptions = {}): PlacedPrefab {
    const glb = this.glbOverrides.get(name);
    if (glb) {
      const entries = glb.instantiateModelsToScene((n) => `${name}:${n}`, false, { doNotInstantiate: false });
      const root = new TransformNode(`${name}#glb`, this.scene);
      root.position.set(x, y, z);
      root.rotation.y = opts.rotY ?? 0;
      root.scaling.setAll(opts.scale ?? 1);
      if (opts.parent) root.parent = opts.parent;
      for (const n of entries.rootNodes) {
        n.parent = root;
        if (this.pipeline) for (const m of n.getChildMeshes(false)) this.pipeline.addShadowCaster(m);
      }
      return { root, instances: [] };
    }
    const reg = this.ensure(name);
    reg.count++;
    let root: TransformNode | null = null;
    if (opts.dynamic || opts.parent) {
      root = new TransformNode(`${name}#${reg.count}`, this.scene);
      root.position.set(x, y, z);
      root.rotation.y = opts.rotY ?? 0;
      if (opts.scaleXYZ) root.scaling.set(...opts.scaleXYZ);
      else root.scaling.setAll(opts.scale ?? 1);
      if (opts.parent) root.parent = opts.parent;
    }
    const instances: InstancedMesh[] = [];
    const tint = opts.tint;
    for (const src of reg.sources) {
      const inst = src.createInstance(`${src.name}#${reg.count}`);
      if (root) {
        inst.parent = root;
      } else {
        inst.position.set(x, y, z);
        inst.rotation.y = opts.rotY ?? 0;
        if (opts.scaleXYZ) inst.scaling.set(...opts.scaleXYZ);
        else inst.scaling.setAll(opts.scale ?? 1);
      }
      if (reg.tintable) {
        inst.instancedBuffers.instanceColor = tint ? new Color4(tint[0], tint[1], tint[2], 1) : new Color4(1, 1, 1, 1);
      }
      inst.isPickable = false;
      if (!root) {
        inst.computeWorldMatrix(true);
        inst.freezeWorldMatrix();
      }
      instances.push(inst);
    }
    return { root, instances };
  }

  /** Builds a non-instanced mesh group from a PartSet (unique, animatable objects). */
  buildUnique(name: string, parts: PartSet, parent?: TransformNode, castShadows = true): Mesh[] {
    const out: Mesh[] = [];
    for (const [key, b] of parts.parts) {
      if (b.isEmpty) continue;
      const m = b.toMesh(`${name}:${key}`, this.scene);
      m.material = this.materials.get(key);
      m.isPickable = false;
      if (parent) m.parent = parent;
      if (castShadows && this.pipeline) this.pipeline.addShadowCaster(m);
      out.push(m);
    }
    return out;
  }

  /**
   * Draws many static copies of a prefab as GPU thin instances, grouped into square chunks.
   * Unlike place(), copies cost nothing on the CPU per frame: each chunk is one draw call per
   * material, frustum-culled as a whole and switched to the LOD model / culled by distance.
   * Use it for forests, undergrowth, rocks and crops; place() for things that move or toggle.
   */
  scatter(name: string, items: readonly ScatterItem[], chunkSize = 90): Mesh[] {
    const factory = this.factories.get(name);
    if (!factory) throw new Error(`Unknown prefab "${name}"`);
    if (!items.length) return [];
    const def = factory();
    const lodDistance = def.lod ? def.lod.distance * Math.max(0.6, this.cullScale) : 0;
    const cull = def.cullDistance ? def.cullDistance * this.cullScale : 0;
    const template = (parts: typeof def.parts, suffix: string) => {
      const out = new Map<string, Mesh>();
      for (const [key, b] of parts.parts) {
        if (b.isEmpty) continue;
        const m = b.toMesh(`${name}:${key}:${suffix}`, this.scene);
        m.material = this.materials.get(key);
        m.isPickable = false;
        m.setEnabled(false);
        out.set(key, m);
      }
      return out;
    };
    const full = template(def.parts, "tpl");
    const lod = def.lod ? template(def.lod.parts, "lodtpl") : new Map<string, Mesh>();
    const chunks = new Map<string, ScatterItem[]>();
    for (const it of items) {
      const k = `${Math.floor(it.x / chunkSize)}|${Math.floor(it.z / chunkSize)}`;
      let list = chunks.get(k);
      if (!list) {
        list = [];
        chunks.set(k, list);
      }
      list.push(it);
    }
    const meshes: Mesh[] = [];
    const q = new Quaternion();
    const sc = new Vector3();
    const tr = new Vector3();
    const mat = new Matrix();
    for (const [key, list] of chunks) {
      const matrices = new Float32Array(list.length * 16);
      const colors = new Float32Array(list.length * 4);
      list.forEach((it, i) => {
        Quaternion.RotationYawPitchRollToRef(it.rotY ?? 0, 0, 0, q);
        sc.setAll(it.scale ?? 1);
        tr.set(it.x, it.y, it.z);
        Matrix.ComposeToRef(sc, q, tr, mat);
        mat.copyToArray(matrices, i * 16);
        const t = it.tint ?? [1, 1, 1, 1];
        colors.set([t[0], t[1], t[2], 1], i * 4);
      });
      const setup = (src: Mesh, label: string): Mesh => {
        const m = src.clone(`${name}#${key}:${label}`, null, true, false)!;
        // Thin-instance buffers live on the geometry: every chunk needs its own copy.
        m.makeGeometryUnique();
        m.setEnabled(true);
        m.isPickable = false;
        m.receiveShadows = true;
        m.thinInstanceSetBuffer("matrix", matrices.slice(), 16, true);
        if (def.tintable) m.thinInstanceSetBuffer("color", colors.slice(), 4, true);
        m.thinInstanceRefreshBoundingInfo(false);
        m.freezeWorldMatrix();
        return m;
      };
      for (const [matKey, src] of full) {
        const m = setup(src, matKey);
        const lodSrc = lod.get(matKey);
        if (lodDistance > 0) m.addLODLevel(lodDistance, lodSrc ? setup(lodSrc, `${matKey}:lod`) : null);
        if (cull > 0) m.addLODLevel(cull, null);
        if (def.castShadows && this.pipeline) this.pipeline.addShadowCaster(m);
        meshes.push(m);
      }
    }
    return meshes;
  }

  /** Total instance count (debug / perf HUD). */
  stats(): { prefabs: number; instances: number } {
    let instances = 0;
    for (const r of this.prefabs.values()) instances += r.count * r.sources.length;
    return { prefabs: this.prefabs.size, instances };
  }
}
