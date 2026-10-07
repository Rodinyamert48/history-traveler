import type { QualityLevel } from "./gameConfig";

export type ShadowMode = "off" | "basic" | "cascaded";

export interface QualityPreset {
  /** Render resolution relative to the canvas CSS size × devicePixelRatio cap. */
  resolutionScale: number;
  maxDevicePixelRatio: number;
  shadows: ShadowMode;
  shadowMapSize: number;
  shadowCascades: number;
  shadowDistance: number;
  /** Multiplier on every particle system's capacity / emit rate. */
  particles: number;
  postProcessing: boolean;
  ssao: boolean;
  bloom: boolean;
  msaaSamples: number;
  fxaa: boolean;
  sharpen: boolean;
  /** Procedural texture resolution. */
  textureSize: number;
  /** Terrain cell size in meters (smaller = more triangles). */
  terrainCell: number;
  waterCells: number;
  waterExtent: number;
  /** Camera far plane / prop culling distance. */
  drawDistance: number;
  propCullDistance: number;
  /** Fraction of decorative NPCs to spawn. */
  npcDensity: number;
  environmentReflections: boolean;
  glow: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  LOW: {
    resolutionScale: 0.7,
    maxDevicePixelRatio: 1,
    shadows: "off",
    shadowMapSize: 512,
    shadowCascades: 1,
    shadowDistance: 60,
    particles: 0.35,
    postProcessing: false,
    ssao: false,
    bloom: false,
    msaaSamples: 1,
    fxaa: true,
    sharpen: false,
    textureSize: 256,
    terrainCell: 10,
    waterCells: 70,
    waterExtent: 900,
    drawDistance: 520,
    propCullDistance: 110,
    npcDensity: 0.45,
    environmentReflections: false,
    glow: false,
  },
  MEDIUM: {
    resolutionScale: 0.85,
    maxDevicePixelRatio: 1.5,
    shadows: "basic",
    shadowMapSize: 1024,
    shadowCascades: 1,
    shadowDistance: 80,
    particles: 0.65,
    postProcessing: true,
    ssao: false,
    bloom: false,
    msaaSamples: 1,
    fxaa: true,
    sharpen: false,
    textureSize: 256,
    terrainCell: 7,
    waterCells: 110,
    waterExtent: 1100,
    drawDistance: 800,
    propCullDistance: 170,
    npcDensity: 0.7,
    environmentReflections: true,
    glow: false,
  },
  HIGH: {
    resolutionScale: 1,
    maxDevicePixelRatio: 2,
    shadows: "cascaded",
    shadowMapSize: 2048,
    shadowCascades: 3,
    shadowDistance: 160,
    particles: 1,
    postProcessing: true,
    ssao: true,
    bloom: true,
    msaaSamples: 4,
    fxaa: false,
    sharpen: true,
    textureSize: 512,
    terrainCell: 5,
    waterCells: 160,
    waterExtent: 1300,
    drawDistance: 1200,
    propCullDistance: 260,
    npcDensity: 1,
    environmentReflections: true,
    glow: true,
  },
  ULTRA: {
    resolutionScale: 1,
    maxDevicePixelRatio: 2.5,
    shadows: "cascaded",
    shadowMapSize: 4096,
    shadowCascades: 4,
    shadowDistance: 240,
    particles: 1.3,
    postProcessing: true,
    ssao: true,
    bloom: true,
    msaaSamples: 4,
    fxaa: false,
    sharpen: true,
    textureSize: 1024,
    terrainCell: 4,
    waterCells: 200,
    waterExtent: 1500,
    drawDistance: 1600,
    propCullDistance: 380,
    npcDensity: 1,
    environmentReflections: true,
    glow: true,
  },
};

export function isProbablyMobile(): boolean {
  const ua = navigator.userAgent || "";
  const touch = navigator.maxTouchPoints > 1 || "ontouchstart" in window;
  const small = Math.min(window.screen.width, window.screen.height) < 820;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (touch && small);
}

export function detectDefaultQuality(): QualityLevel {
  if (!isProbablyMobile()) return "HIGH";
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  return memory >= 6 && cores >= 8 ? "MEDIUM" : "LOW";
}
