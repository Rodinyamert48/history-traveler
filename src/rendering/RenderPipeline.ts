import {
  CascadedShadowGenerator,
  Color4,
  DefaultRenderingPipeline,
  GlowLayer,
  ImageProcessingConfiguration,
  SSAO2RenderingPipeline,
  ShadowGenerator,
  Vector3,
  type AbstractMesh,
  type Camera,
  type DirectionalLight,
  type Observer,
  type Scene,
} from "@babylonjs/core";
import type { QualityPreset } from "../config/qualityPresets";
import type { Settings } from "../core/SaveManager";
import { setCustomShaderOutputMode } from "./shaders";

export interface PipelineLook {
  exposure: number;
  contrast: number;
  vignette: number;
  bloomThreshold: number;
  bloomWeight: number;
  grain: number;
  saturation?: number;
}

const DEFAULT_LOOK: PipelineLook = {
  exposure: 1.05,
  contrast: 1.18,
  vignette: 2.2,
  bloomThreshold: 0.9,
  bloomWeight: 0.22,
  grain: 6,
};

/**
 * Owns shadows + post-processing for one scene and re-applies them whenever the quality
 * preset or the player's graphics settings change (no reload needed).
 */
export class RenderPipeline {
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private shadowGen: ShadowGenerator | CascadedShadowGenerator | null = null;
  private glow: GlowLayer | null = null;
  private casters = new Set<AbstractMesh>();
  private followObserver: Observer<Scene> | null = null;
  private look: PipelineLook;

  constructor(
    private readonly scene: Scene,
    private camera: Camera,
    private readonly sun: DirectionalLight | null,
    look: Partial<PipelineLook> = {},
    private readonly useGlow = false,
  ) {
    this.look = { ...DEFAULT_LOOK, ...look };
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = this.look.exposure;
    ip.contrast = this.look.contrast;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = this.look.vignette;
    ip.vignetteColor = new Color4(0.1, 0.06, 0.03, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  }

  get shadowGenerator(): ShadowGenerator | CascadedShadowGenerator | null {
    return this.shadowGen;
  }

  get glowLayer(): GlowLayer | null {
    return this.glow;
  }

  apply(preset: QualityPreset, settings: Settings): void {
    const engine = this.scene.getEngine();
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxDevicePixelRatio);
    const scale = preset.resolutionScale * settings.resolutionScale * dpr;
    engine.setHardwareScalingLevel(1 / Math.max(0.25, scale));

    this.applyShadows(settings.shadows ? preset : { ...preset, shadows: "off" });
    this.applyPost(preset, settings.postProcessing && preset.postProcessing);
    this.applyGlow(preset.glow && this.useGlow);
  }

  setCamera(camera: Camera): void {
    if (camera === this.camera) return;
    this.camera = camera;
    if (this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    if (this.ssao) {
      this.ssao.dispose();
      this.ssao = null;
    }
    if (this.lastPreset) this.applyPost(this.lastPreset, this.lastPostEnabled);
  }

  private lastPreset: QualityPreset | null = null;
  private lastPostEnabled = false;

  private applyPost(preset: QualityPreset, enabled: boolean): void {
    this.lastPreset = preset;
    this.lastPostEnabled = enabled;
    const ip = this.scene.imageProcessingConfiguration;
    if (!enabled) {
      this.pipeline?.dispose();
      this.pipeline = null;
      this.ssao?.dispose();
      this.ssao = null;
      ip.applyByPostProcess = false;
      setCustomShaderOutputMode(this.scene, false, ip.exposure);
      return;
    }
    if (!this.pipeline) {
      this.pipeline = new DefaultRenderingPipeline("post", true, this.scene, [this.camera]);
    }
    const p = this.pipeline;
    p.samples = preset.msaaSamples;
    p.fxaaEnabled = preset.fxaa;
    p.imageProcessingEnabled = true;
    p.imageProcessing.toneMappingEnabled = true;
    p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    p.imageProcessing.exposure = this.look.exposure;
    p.imageProcessing.contrast = this.look.contrast;
    p.imageProcessing.vignetteEnabled = true;
    p.imageProcessing.vignetteWeight = this.look.vignette;
    p.bloomEnabled = preset.bloom;
    if (preset.bloom) {
      p.bloomThreshold = this.look.bloomThreshold;
      p.bloomWeight = this.look.bloomWeight;
      p.bloomKernel = 48;
      p.bloomScale = 0.5;
    }
    p.sharpenEnabled = preset.sharpen;
    if (preset.sharpen) {
      p.sharpen.edgeAmount = 0.18;
      p.sharpen.colorAmount = 1;
    }
    p.grainEnabled = this.look.grain > 0 && preset.bloom;
    if (p.grainEnabled) {
      p.grain.intensity = this.look.grain;
      p.grain.animated = true;
    }
    p.chromaticAberrationEnabled = false;
    p.depthOfFieldEnabled = false;
    setCustomShaderOutputMode(this.scene, true, this.look.exposure);

    if (preset.ssao && !this.ssao) {
      try {
        // forceGeometryBuffer: SSAO reads depth/normals from a dedicated geometry pass instead of
        // the pre-pass, which would add varyings to every PBR material (WebGPU allows only 16).
        const ssao = new SSAO2RenderingPipeline("ssao", this.scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera], true);
        ssao.radius = 1.6;
        ssao.totalStrength = 1.1;
        ssao.base = 0.12;
        ssao.samples = 12;
        ssao.maxZ = 140;
        ssao.minZAspect = 0.4;
        ssao.expensiveBlur = false;
        this.ssao = ssao;
      } catch (err) {
        console.warn("[RenderPipeline] SSAO unavailable", err);
      }
    } else if (!preset.ssao && this.ssao) {
      this.ssao.dispose();
      this.ssao = null;
    }
  }

  private applyGlow(enabled: boolean): void {
    if (enabled && !this.glow) {
      this.glow = new GlowLayer("glow", this.scene, { mainTextureRatio: 0.5, blurKernelSize: 48 });
      this.glow.intensity = 0.7;
    } else if (!enabled && this.glow) {
      this.glow.dispose();
      this.glow = null;
    }
  }

  private shadowSignature = "";

  private applyShadows(preset: QualityPreset): void {
    const sig = `${preset.shadows}:${preset.shadowMapSize}:${preset.shadowCascades}:${preset.shadowDistance}`;
    if (sig === this.shadowSignature) return;
    this.shadowSignature = sig;
    this.shadowGen?.dispose();
    this.shadowGen = null;
    if (this.followObserver) {
      this.scene.onBeforeRenderObservable.remove(this.followObserver);
      this.followObserver = null;
    }
    const sun = this.sun;
    if (!sun || preset.shadows === "off") {
      this.scene.shadowsEnabled = false;
      return;
    }
    this.scene.shadowsEnabled = true;
    if (preset.shadows === "cascaded") {
      // null camera → cascades always follow scene.activeCamera (FPS / cinematic cameras).
      const csm = new CascadedShadowGenerator(preset.shadowMapSize, sun, true, null);
      csm.numCascades = preset.shadowCascades;
      csm.lambda = 0.82;
      csm.shadowMaxZ = preset.shadowDistance;
      csm.stabilizeCascades = true;
      csm.cascadeBlendPercentage = 0.08;
      csm.usePercentageCloserFiltering = true;
      csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      csm.bias = 0.004;
      csm.normalBias = 0.02;
      csm.darkness = 0.12;
      csm.penumbraDarkness = 0.6;
      this.shadowGen = csm;
    } else {
      const gen = new ShadowGenerator(preset.shadowMapSize, sun, true);
      gen.usePercentageCloserFiltering = true;
      gen.filteringQuality = ShadowGenerator.QUALITY_LOW;
      gen.bias = 0.002;
      gen.normalBias = 0.02;
      gen.darkness = 0.15;
      sun.autoUpdateExtends = false;
      sun.shadowFrustumSize = preset.shadowDistance * 1.4;
      sun.shadowMinZ = 1;
      sun.shadowMaxZ = 700;
      const dir = sun.direction.clone().normalize();
      const tmp = new Vector3();
      // Keep the single shadow map centered on what the camera is looking at.
      this.followObserver = this.scene.onBeforeRenderObservable.add(() => {
        const cam = this.scene.activeCamera ?? this.camera;
        const fwd = cam.getForwardRay(1).direction;
        tmp.copyFrom(cam.globalPosition).addInPlace(fwd.scaleInPlace(preset.shadowDistance * 0.45));
        sun.position.copyFrom(tmp).subtractInPlace(dir.scale(350));
      });
      this.shadowGen = gen;
    }
    for (const m of this.casters) this.shadowGen.addShadowCaster(m, false);
  }

  addShadowCaster(mesh: AbstractMesh): void {
    this.casters.add(mesh);
    this.shadowGen?.addShadowCaster(mesh, false);
  }

  removeShadowCaster(mesh: AbstractMesh): void {
    this.casters.delete(mesh);
    this.shadowGen?.removeShadowCaster(mesh, false);
  }

  setLook(look: Partial<PipelineLook>): void {
    this.look = { ...this.look, ...look };
    const ip = this.scene.imageProcessingConfiguration;
    ip.exposure = this.look.exposure;
    ip.contrast = this.look.contrast;
    if (this.pipeline) {
      this.pipeline.imageProcessing.exposure = this.look.exposure;
      this.pipeline.imageProcessing.contrast = this.look.contrast;
    }
    setCustomShaderOutputMode(this.scene, !!this.pipeline, this.look.exposure);
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.ssao?.dispose();
    this.shadowGen?.dispose();
    this.glow?.dispose();
    if (this.followObserver) this.scene.onBeforeRenderObservable.remove(this.followObserver);
    this.casters.clear();
  }
}
