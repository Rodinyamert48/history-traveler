import { Engine, WebGPUEngine, type AbstractEngine } from "@babylonjs/core";
import type { RenderApiPreference } from "./SaveManager";

export type RenderApi = "WebGPU" | "WebGL2" | "WebGL1";

export interface EngineInfo {
  engine: AbstractEngine;
  api: RenderApi;
  isWebGPU: boolean;
}

function readUrlPreference(): RenderApiPreference | null {
  const value = new URLSearchParams(window.location.search).get("engine");
  return value === "webgl" || value === "webgpu" ? value : null;
}

/**
 * Creates the rendering engine: WebGPU first (when supported), WebGL2/1 as a fallback.
 * A failure anywhere in the WebGPU path silently drops to WebGL so the game always starts.
 * `?engine=webgl|webgpu` in the URL overrides the saved preference (handy for testing).
 */
export async function createEngine(canvas: HTMLCanvasElement, preference: RenderApiPreference): Promise<EngineInfo> {
  const pref = readUrlPreference() ?? preference;

  if (pref !== "webgl") {
    try {
      const supported = "gpu" in navigator && (await WebGPUEngine.IsSupportedAsync);
      if (supported) {
        const engine = new WebGPUEngine(canvas, {
          antialias: true,
          stencil: true,
          adaptToDeviceRatio: false,
          powerPreference: "high-performance",
          setMaximumLimits: false,
          enableAllFeatures: false,
        });
        await engine.initAsync();
        return { engine, api: "WebGPU", isWebGPU: true };
      }
    } catch (err) {
      console.warn("[EngineFactory] WebGPU init failed, falling back to WebGL", err);
    }
  }

  const engine = new Engine(
    canvas,
    true,
    {
      stencil: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      doNotHandleContextLost: false,
    },
    false,
  );
  const api: RenderApi = engine.webGLVersion >= 2 ? "WebGL2" : "WebGL1";
  return { engine, api, isWebGPU: false };
}
