import { LoadAssetContainerAsync, type AssetContainer, type Scene } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { assetUrl } from "../utils/async";

/**
 * Optional GLB/GLTF overrides for procedural models. Every key maps to `null` by default,
 * which means "use the built-in procedural model". To swap in authored art, export a GLB,
 * drop it into public/assets/models/ and set e.g. `galley: "assets/models/galley.glb"`.
 * Loading failures never crash the game: the procedural fallback is used instead.
 */
export const MODEL_MANIFEST: Record<string, string | null> = {
  galley: null,
  sahi: null,
  otag: null,
  soldierTent: null,
  hagiaSophia: null,
  galataTower: null,
};

export interface LoadReport {
  loaded: string[];
  failed: { key: string; error: string }[];
  skipped: string[];
}

/** GLB loader with progress, caching and graceful fallback. */
export class AssetLoader {
  private cache = new Map<string, Promise<AssetContainer | null>>();

  constructor(private readonly scene: Scene) {}

  /** Loads one model; resolves to null (fallback) on any error. */
  load(key: string, onProgress?: (fraction: number) => void): Promise<AssetContainer | null> {
    const path = MODEL_MANIFEST[key];
    if (!path) return Promise.resolve(null);
    let p = this.cache.get(key);
    if (!p) {
      p = LoadAssetContainerAsync(assetUrl(path), this.scene, {
        onProgress: (e) => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        },
      }).catch((err: unknown) => {
        console.warn(`[AssetLoader] "${key}" (${path}) failed — using procedural fallback`, err);
        return null;
      });
      this.cache.set(key, p);
    }
    return p;
  }

  /** Loads every manifest entry that has a path. */
  async loadAll(onProgress?: (fraction: number, key: string) => void): Promise<LoadReport> {
    const report: LoadReport = { loaded: [], failed: [], skipped: [] };
    const keys = Object.keys(MODEL_MANIFEST);
    let done = 0;
    for (const key of keys) {
      if (!MODEL_MANIFEST[key]) {
        report.skipped.push(key);
      } else {
        const res = await this.load(key);
        if (res) report.loaded.push(key);
        else report.failed.push({ key, error: "load failed" });
      }
      done++;
      onProgress?.(done / keys.length, key);
    }
    return report;
  }
}
