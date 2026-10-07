import { Color4, Matrix, TransformNode, type InstancedMesh, type Mesh, type Scene } from "@babylonjs/core";
import { GeoBuilder, hexColor, type RGBA } from "../assets/GeoBuilder";
import type { MaterialKey, MaterialLibrary } from "../rendering/MaterialLibrary";
import { registerInstancedBufferWithCapacity } from "../rendering/instancing";
import type { RenderPipeline } from "../rendering/RenderPipeline";

export type HatKind = "bork" | "turban" | "kavuk" | "helmet" | "cap" | "byzHelmet" | "none";
export type ItemKind = "spear" | "shield" | "hammer" | "none";

export interface HumanoidLook {
  skin: string;
  kaftan: string;
  sleeves: string;
  trousers: string;
  sash: string;
  boots: string;
  hat: HatKind;
  hatColor: string;
  hatAccent?: string;
  beard?: string;
  longKaftan: boolean;
  scale?: number;
  rightItem?: ItemKind;
  leftItem?: ItemKind;
  collar?: string;
}

export const LOOKS = {
  janissary: (v = 0): HumanoidLook => ({
    skin: ["#c99a72", "#b98660", "#d4a882"][v % 3],
    kaftan: ["#2c4a75", "#8a1f1f", "#2c4a75", "#3d5a35"][v % 4],
    sleeves: "#a32020",
    trousers: "#2a3550",
    sash: "#d6a540",
    boots: "#c9a03a",
    hat: "bork",
    hatColor: "#efe8d8",
    hatAccent: "#d6a540",
    beard: v % 3 === 0 ? undefined : "#2b2018",
    longKaftan: true,
    rightItem: v % 2 === 0 ? "spear" : "none",
  }),
  sipahi: (v = 0): HumanoidLook => ({
    skin: "#c49470",
    kaftan: ["#7d1418", "#5a2a6a"][v % 2],
    sleeves: "#c9a03a",
    trousers: "#3a2a1c",
    sash: "#e0c060",
    boots: "#5a3a20",
    hat: "helmet",
    hatColor: "#8f8a80",
    hatAccent: "#b3141c",
    beard: "#241a12",
    longKaftan: true,
    rightItem: "spear",
    leftItem: v % 2 ? "shield" : "none",
  }),
  worker: (v = 0): HumanoidLook => ({
    skin: ["#c08a64", "#a8764f", "#d0a07a"][v % 3],
    kaftan: ["#8a6a48", "#6e5a40", "#9a8060"][v % 3],
    sleeves: "#d9cdb2",
    trousers: "#5a4a38",
    sash: "#7a2a20",
    boots: "#4a3524",
    hat: v % 2 ? "turban" : "cap",
    hatColor: v % 2 ? "#e8e0cc" : "#8a2a20",
    beard: v % 2 ? "#3a2a1c" : undefined,
    longKaftan: false,
    rightItem: v % 3 === 0 ? "hammer" : "none",
  }),
  sailor: (v = 0): HumanoidLook => ({
    skin: "#b98660",
    kaftan: ["#2f5f8f", "#e6dcc6"][v % 2],
    sleeves: "#e6dcc6",
    trousers: "#2a3a5a",
    sash: "#a8261f",
    boots: "#3a2a1c",
    hat: "cap",
    hatColor: "#a8261f",
    beard: v % 2 ? "#2b2018" : undefined,
    longKaftan: false,
  }),
  gunner: (v = 0): HumanoidLook => ({
    skin: "#b98660",
    kaftan: "#6a1c16",
    sleeves: "#3a2a1c",
    trousers: "#3a2a1c",
    sash: "#8a6a3a",
    boots: "#3a2a1c",
    hat: "turban",
    hatColor: v % 2 ? "#d8cfb8" : "#c9b48a",
    beard: "#2b2018",
    longKaftan: false,
  }),
  byzantine: (v = 0): HumanoidLook => ({
    skin: "#d2a684",
    kaftan: ["#5a1f3a", "#3a3f6a", "#6a2a2a"][v % 3],
    sleeves: "#8f8a80",
    trousers: "#3a3530",
    sash: "#c9a03a",
    boots: "#3a2a1c",
    hat: "byzHelmet",
    hatColor: "#9a958c",
    hatAccent: "#c9a03a",
    beard: v % 2 ? "#3a2a1c" : undefined,
    longKaftan: false,
    rightItem: "spear",
    leftItem: "shield",
  }),
  commander: (): HumanoidLook => ({
    skin: "#c49470",
    kaftan: "#1f5a3a",
    sleeves: "#d6a540",
    trousers: "#2a2a2a",
    sash: "#d6a540",
    boots: "#7a1a1a",
    hat: "turban",
    hatColor: "#f4efe4",
    hatAccent: "#2f7a3a",
    beard: "#3a2a1c",
    longKaftan: true,
    collar: "#6a4a2a",
  }),
  fatih: (): HumanoidLook => ({
    skin: "#d0a07c",
    kaftan: "#9e1a1f",
    sleeves: "#d6a540",
    trousers: "#3a2418",
    sash: "#e2b84f",
    boots: "#7a1a1a",
    hat: "kavuk",
    hatColor: "#f7f2e6",
    hatAccent: "#b3141c",
    beard: "#3b2a1a",
    longKaftan: true,
    scale: 1.05,
    collar: "#6b4a2e",
  }),
};

type PartName =
  | "torso"
  | "skirt"
  | "skirtShort"
  | "belt"
  | "head"
  | "beard"
  | "arm"
  | "hand"
  | "leg"
  | "boot"
  | "bork"
  | "turban"
  | "kavuk"
  | "helmet"
  | "cap"
  | "byzHelmet"
  | "plume"
  | "collar"
  | "spear"
  | "shield"
  | "hammer"
  | "hatBand";

interface PartDef {
  material: MaterialKey;
  build(b: GeoBuilder): void;
}

const white: RGBA = [1, 1, 1, 1];

const PART_DEFS: Record<PartName, PartDef> = {
  torso: { material: "fabric", build: (b) => b.box(0, 0.28, 0, 0.4, 0.56, 0.24, { topScale: 1.18, topScaleZ: 1.05, color: white }) },
  skirt: { material: "fabric", build: (b) => b.cylinder(0, -0.6, 0, 0.32, 0.21, 0.66, { segments: 8, color: white, caps: false }) },
  skirtShort: { material: "fabric", build: (b) => b.cylinder(0, -0.22, 0, 0.25, 0.21, 0.3, { segments: 8, color: white, caps: false }) },
  belt: { material: "fabric", build: (b) => b.cylinder(0, 0.0, 0, 0.225, 0.225, 0.11, { segments: 8, color: white }) },
  head: {
    material: "skin",
    build: (b) => {
      b.cylinder(0, -0.04, 0, 0.06, 0.06, 0.08, { segments: 5, color: white });
      b.sphere(0, 0.13, 0, 0.12, { segments: 7, rings: 5, scaleY: 1.12, color: white });
      b.box(0, 0.11, 0.115, 0.04, 0.06, 0.04, { color: white });
    },
  },
  beard: { material: "matte", build: (b) => b.box(0, 0.04, 0.07, 0.17, 0.12, 0.1, { topScale: 1, color: white }) },
  arm: { material: "fabric", build: (b) => b.box(0, -0.29, 0, 0.11, 0.58, 0.12, { topScale: 1.1, color: white }) },
  hand: { material: "skin", build: (b) => b.box(0, -0.63, 0.01, 0.08, 0.1, 0.09, { color: white }) },
  leg: { material: "fabric", build: (b) => b.box(0, -0.42, 0, 0.15, 0.84, 0.16, { topScale: 1.15, color: white }) },
  boot: { material: "matte", build: (b) => b.box(0, -0.86, 0.04, 0.15, 0.12, 0.26, { color: white }) },
  bork: {
    material: "fabric",
    build: (b) => {
      b.cylinder(0, 0.18, 0, 0.13, 0.12, 0.3, { segments: 7, color: white });
      // The long felt flap falling down the back.
      b.box(0, 0.2, -0.16, 0.18, 0.42, 0.05, { color: white });
    },
  },
  turban: { material: "fabric", build: (b) => b.sphere(0, 0.26, -0.01, 0.15, { segments: 8, rings: 5, scaleY: 0.68, color: white }) },
  kavuk: {
    material: "fabric",
    build: (b) => {
      // Large Ottoman kavuk sitting above the brow so the face stays visible.
      b.sphere(0, 0.36, -0.01, 0.21, { segments: 10, rings: 6, scaleY: 0.72, color: white, jitter: 0.03 });
    },
  },
  hatBand: { material: "fabric", build: (b) => b.cylinder(0, 0.44, 0, 0.09, 0.03, 0.2, { segments: 7, color: white }) },
  helmet: {
    material: "iron",
    build: (b) => {
      b.cylinder(0, 0.15, 0, 0.14, 0.02, 0.28, { segments: 8, color: white });
      b.cylinder(0, 0.05, 0, 0.145, 0.145, 0.1, { segments: 8, color: white, caps: false });
    },
  },
  byzHelmet: {
    material: "iron",
    build: (b) => {
      b.sphere(0, 0.17, 0, 0.14, { segments: 8, rings: 4, scaleY: 0.9, color: white });
      b.box(0, 0.12, 0.13, 0.03, 0.1, 0.03, { color: white });
    },
  },
  plume: { material: "fabric", build: (b) => b.cylinder(0, 0.38, -0.02, 0.03, 0.06, 0.22, { segments: 5, color: white }) },
  cap: { material: "fabric", build: (b) => b.cylinder(0, 0.16, 0, 0.12, 0.1, 0.13, { segments: 7, color: white }) },
  collar: { material: "fabric", build: (b) => b.cylinder(0, 0.5, 0, 0.26, 0.22, 0.12, { segments: 8, color: white, caps: false }) },
  spear: {
    material: "wood",
    build: (b) => {
      b.cylinder(0, -0.9, 0.04, 0.025, 0.025, 2.6, { segments: 4, color: hexColor("#6a4a2a") });
      b.cylinder(0, 1.7, 0.04, 0.045, 0, 0.3, { segments: 4, color: hexColor("#8f8a80") });
    },
  },
  shield: {
    material: "matte",
    build: (b) => {
      b.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(-0.1, -0.38, 0)));
      b.cylinder(0, -0.03, 0, 0.36, 0.36, 0.06, { segments: 10, color: white });
      b.cylinder(0, 0.03, 0, 0.08, 0.06, 0.05, { segments: 6, color: hexColor("#c9a03a") });
      b.pop();
    },
  },
  hammer: {
    material: "wood",
    build: (b) => {
      b.box(0, -0.62, 0.15, 0.04, 0.04, 0.35, { color: hexColor("#6a4a2a") });
      b.box(0, -0.62, 0.34, 0.08, 0.12, 0.12, { color: hexColor("#5a4a3a") });
    },
  },
};

/** Per-NPC node hierarchy driven by the procedural animator. */
export interface HumanoidRig {
  root: TransformNode;
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  instances: InstancedMesh[];
  scale: number;
}

/**
 * Shared, instanced humanoid parts. All NPCs together cost one draw call per part type,
 * colours come from per-instance buffers (no material per character).
 */
export class HumanoidFactory {
  private sources = new Map<PartName, Mesh>();
  private count = 0;

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly pipeline: RenderPipeline | null,
  ) {}

  private source(name: PartName): Mesh {
    let m = this.sources.get(name);
    if (!m) {
      const def = PART_DEFS[name];
      const b = new GeoBuilder();
      def.build(b);
      m = b.toMesh(`npc-part:${name}`, this.scene);
      m.material = this.materials.get(def.material);
      m.isVisible = false;
      m.isPickable = false;
      registerInstancedBufferWithCapacity(m, "instanceColor", 4, 512);
      m.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      if (this.pipeline) this.pipeline.addShadowCaster(m);
      this.sources.set(name, m);
    }
    return m;
  }

  private add(rig: HumanoidRig, part: PartName, parent: TransformNode, color: string, x = 0, y = 0, z = 0): InstancedMesh {
    const inst = this.source(part).createInstance(`${part}#${this.count}`);
    inst.parent = parent;
    inst.position.set(x, y, z);
    const c = hexColor(color);
    inst.instancedBuffers.instanceColor = new Color4(c[0], c[1], c[2], 1);
    inst.isPickable = false;
    rig.instances.push(inst);
    return inst;
  }

  create(look: HumanoidLook, name = "npc"): HumanoidRig {
    this.count++;
    const scene = this.scene;
    const root = new TransformNode(`${name}#${this.count}`, scene);
    const scale = look.scale ?? 1;
    root.scaling.setAll(scale);
    const node = (n: string, parent: TransformNode, x: number, y: number, z: number) => {
      const t = new TransformNode(`${n}#${this.count}`, scene);
      t.parent = parent;
      t.position.set(x, y, z);
      return t;
    };
    const hips = node("hips", root, 0, 0.95, 0);
    const torso = node("torso", hips, 0, 0, 0);
    const head = node("head", torso, 0, 0.6, 0);
    const armL = node("armL", torso, -0.27, 0.52, 0);
    const armR = node("armR", torso, 0.27, 0.52, 0);
    const legL = node("legL", hips, -0.11, 0, 0);
    const legR = node("legR", hips, 0.11, 0, 0);
    const rig: HumanoidRig = { root, hips, torso, head, armL, armR, legL, legR, instances: [], scale };

    this.add(rig, "torso", torso, look.kaftan);
    this.add(rig, look.longKaftan ? "skirt" : "skirtShort", hips, look.kaftan);
    this.add(rig, "belt", hips, look.sash);
    if (look.collar) this.add(rig, "collar", torso, look.collar);
    this.add(rig, "head", head, look.skin);
    if (look.beard) this.add(rig, "beard", head, look.beard);
    if (look.hat !== "none") this.add(rig, look.hat, head, look.hatColor);
    if (look.hat === "kavuk") this.add(rig, "hatBand", head, look.hatAccent ?? "#b3141c");
    if (look.hat === "helmet" && look.hatAccent) this.add(rig, "plume", head, look.hatAccent);
    if (look.hat === "bork" && look.hatAccent) this.add(rig, "hatBand", head, look.hatAccent).scaling.set(0.8, 0.5, 0.8);
    for (const arm of [armL, armR]) {
      this.add(rig, "arm", arm, look.sleeves);
      this.add(rig, "hand", arm, look.skin);
    }
    for (const leg of [legL, legR]) {
      this.add(rig, "leg", leg, look.trousers);
      this.add(rig, "boot", leg, look.boots);
    }
    if (look.rightItem && look.rightItem !== "none") this.add(rig, look.rightItem, armR, "#ffffff", 0, -0.62, 0.02);
    if (look.leftItem === "shield") this.add(rig, "shield", armL, look.kaftan === "#3a3f6a" ? "#c9a03a" : "#2f4f8f", 0, 0, 0);
    return rig;
  }

  disposeRig(rig: HumanoidRig): void {
    rig.root.dispose(false, false);
  }
}
