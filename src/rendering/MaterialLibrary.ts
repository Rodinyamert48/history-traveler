import { Color3, PBRMaterial, type BaseTexture, type Scene } from "@babylonjs/core";
import { createRawTexture, getPropAtlasPixels, getTexturePixels, type TileableKind } from "./ProceduralTextures";

export type MaterialKey =
  | "terrain"
  | "stone"
  | "wood"
  | "darkWood"
  | "cloth"
  | "roof"
  | "plaster"
  | "cobble"
  | "props"
  | "matte"
  | "bronze"
  | "iron"
  | "gold"
  | "foliage"
  | "skin"
  | "fabric"
  | "fire"
  | "rope";

interface MaterialSpec {
  roughness: number;
  metallic: number;
  albedo?: string;
  texture?: TileableKind | "atlas";
  bump?: number;
  twoSided?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
}

const SPECS: Record<MaterialKey, MaterialSpec> = {
  terrain: { roughness: 0.96, metallic: 0, texture: "ground", bump: 0.35 },
  stone: { roughness: 0.88, metallic: 0, texture: "stoneWall", bump: 0.85 },
  wood: { roughness: 0.82, metallic: 0, texture: "wood", bump: 0.6 },
  darkWood: { roughness: 0.78, metallic: 0, texture: "wood", bump: 0.6, albedo: "#8a7f74" },
  cloth: { roughness: 0.94, metallic: 0, texture: "cloth", bump: 0.3, twoSided: true },
  roof: { roughness: 0.8, metallic: 0, texture: "roofTiles", bump: 0.7 },
  plaster: { roughness: 0.92, metallic: 0, texture: "plaster", bump: 0.3 },
  cobble: { roughness: 0.9, metallic: 0, texture: "cobble", bump: 0.9 },
  props: { roughness: 0.8, metallic: 0, texture: "atlas", twoSided: true },
  matte: { roughness: 0.86, metallic: 0 },
  bronze: { roughness: 0.38, metallic: 0.85, albedo: "#9c7440" },
  iron: { roughness: 0.5, metallic: 0.75, albedo: "#4b4a48" },
  gold: { roughness: 0.3, metallic: 0.95, albedo: "#d9a93f" },
  foliage: { roughness: 0.9, metallic: 0, twoSided: true },
  skin: { roughness: 0.7, metallic: 0 },
  fabric: { roughness: 0.92, metallic: 0, twoSided: true },
  fire: { roughness: 1, metallic: 0, albedo: "#000000", emissive: "#ff8a2a", emissiveIntensity: 2.2 },
  rope: { roughness: 0.95, metallic: 0, albedo: "#b59a6a" },
};

/**
 * One shared PBR material per surface type, per scene. Colour variation comes from vertex
 * colours (multiplied by PBR) so thousands of meshes reuse ~18 materials → batched, frozen.
 */
export class MaterialLibrary {
  private materials = new Map<MaterialKey, PBRMaterial>();
  private textures: BaseTexture[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly textureSize: number,
  ) {}

  get(key: MaterialKey): PBRMaterial {
    let mat = this.materials.get(key);
    if (!mat) {
      mat = this.create(key);
      this.materials.set(key, mat);
    }
    return mat;
  }

  /**
   * A separate material instance of the same surface type that SHARES the textures.
   * (Never use PBRMaterial.clone() on these: cloning RawTextures loses their wrap mode.)
   */
  variant(key: MaterialKey, name: string): PBRMaterial {
    const base = this.get(key);
    const mat = this.create(key, name, false);
    mat.albedoTexture = base.albedoTexture;
    mat.bumpTexture = base.bumpTexture;
    return mat;
  }

  private create(key: MaterialKey, name = `mat-${key}`, withTextures = true): PBRMaterial {
    const spec = SPECS[key];
    const mat = new PBRMaterial(name, this.scene);
    mat.metallic = spec.metallic;
    mat.roughness = spec.roughness;
    mat.albedoColor = spec.albedo ? Color3.FromHexString(spec.albedo).toLinearSpace() : Color3.White();
    mat.environmentIntensity = 0.9;
    mat.useHorizonOcclusion = true;
    mat.useRadianceOverAlpha = false;
    if (spec.twoSided) {
      mat.backFaceCulling = false;
      mat.twoSidedLighting = true;
    }
    if (spec.emissive) {
      mat.emissiveColor = Color3.FromHexString(spec.emissive).toLinearSpace();
      mat.emissiveIntensity = spec.emissiveIntensity ?? 1;
      mat.disableLighting = true;
    }
    if (!withTextures) return mat;
    if (spec.texture === "atlas") {
      const size = this.textureSize * 2;
      const tex = createRawTexture(this.scene, getPropAtlasPixels(size), size, "props-atlas");
      tex.wrapU = tex.wrapV = 0; // clamp — atlas regions must not bleed
      mat.albedoTexture = tex;
      this.textures.push(tex);
    } else if (spec.texture) {
      const px = getTexturePixels(spec.texture, this.textureSize);
      const albedo = createRawTexture(this.scene, px.albedo, px.size, `${spec.texture}-albedo`);
      mat.albedoTexture = albedo;
      this.textures.push(albedo);
      if (px.normal && spec.bump) {
        const normal = createRawTexture(this.scene, px.normal, px.size, `${spec.texture}-normal`, true);
        normal.level = spec.bump;
        mat.bumpTexture = normal;
        this.textures.push(normal);
      }
    }
    return mat;
  }

  /**
   * Without an environment map (LOW preset) fully metallic PBR surfaces render almost black,
   * so metals fall back to a semi-metallic look lit by the sun/hemisphere instead.
   */
  adaptToEnvironment(hasEnvironment: boolean): void {
    for (const key of ["bronze", "iron", "gold"] as const) {
      const m = this.get(key);
      const spec = SPECS[key];
      m.metallic = hasEnvironment ? spec.metallic : 0.25;
      m.roughness = hasEnvironment ? spec.roughness : Math.max(0.45, spec.roughness);
    }
  }

  /** Freezes all materials once the scene is built (skips per-frame define checks). */
  freezeAll(): void {
    for (const m of this.materials.values()) m.freeze();
  }

  unfreezeAll(): void {
    for (const m of this.materials.values()) m.unfreeze();
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose(false, false);
    for (const t of this.textures) t.dispose();
    this.materials.clear();
    this.textures = [];
  }
}
