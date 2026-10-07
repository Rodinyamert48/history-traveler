import { Color3, Constants, MeshBuilder, RawTexture, Vector4, type Camera, type Mesh, type Scene, type ShaderMaterial } from "@babylonjs/core";
import { createCustomShaderMaterial } from "./shaders";
import type { SkyParams } from "./SkyModel";

export interface WaterOptions {
  extent: number;
  cells: number;
  level: number;
  waveAmplitude: number;
  waveFrequency: number;
  deepColor: string;
  shallowColor: string;
  foamColor?: string;
  foamAmount?: number;
  fogColor: Color3;
  fogDensity: number;
  /** Normalized depth map (0 = shoreline, 1 = deep) covering `depthRect`. */
  depth: { data: Uint8Array; width: number; height: number; rect: [number, number, number, number] };
  animate: boolean;
}

/**
 * Stylized low-poly water: a camera-following grid displaced in the vertex shader, with
 * derivative-based flat normals, fresnel sky reflection, sun glints and shoreline foam
 * driven by a depth map baked from the terrain.
 */
export class Water {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private readonly depthTexture: RawTexture;
  private time = 0;
  private readonly step: number;

  constructor(
    scene: Scene,
    private readonly opts: WaterOptions,
    sky: SkyParams,
  ) {
    this.step = opts.extent / opts.cells;
    this.mesh = MeshBuilder.CreateGround("water", { width: opts.extent, height: opts.extent, subdivisions: opts.cells }, scene);
    this.mesh.position.y = opts.level;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.doNotSyncBoundingInfo = true;

    const { data, width, height, rect } = opts.depth;
    // R8 would be ideal but RGBA8 is universally supported (WebGL1/2, WebGPU).
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = data[i];
      rgba[i * 4 + 3] = 255;
    }
    this.depthTexture = RawTexture.CreateRGBATexture(rgba, width, height, scene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    this.depthTexture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.depthTexture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    this.depthTexture.gammaSpace = false;

    const m = createCustomShaderMaterial("water", "water-material", scene);
    m.setTexture("depthTex", this.depthTexture);
    m.setVector4("depthRect", new Vector4(rect[0], rect[1], rect[2], rect[3]));
    m.setFloat("waveAmplitude", opts.waveAmplitude);
    m.setFloat("waveFrequency", opts.waveFrequency);
    m.setColor3("deepColor", Color3.FromHexString(opts.deepColor).toLinearSpace());
    m.setColor3("shallowColor", Color3.FromHexString(opts.shallowColor).toLinearSpace());
    m.setColor3("foamColor", Color3.FromHexString(opts.foamColor ?? "#f2efe6").toLinearSpace());
    m.setFloat("foamAmount", opts.foamAmount ?? 0.85);
    m.setColor3("skyZenith", sky.zenith);
    m.setColor3("skyHorizon", sky.horizon);
    m.setVector3("sunDir", sky.sunDirection);
    m.setColor3("sunColor", sky.sunColor);
    m.setColor3("fogColor", opts.fogColor);
    m.setFloat("fogDensity", opts.fogDensity);
    m.setFloat("time", 0);
    m.backFaceCulling = false;
    this.material = m;
    this.mesh.material = m;
  }

  setAnimated(animate: boolean): void {
    this.opts.animate = animate;
  }

  setFog(color: Color3, density: number): void {
    this.material.setColor3("fogColor", color);
    this.material.setFloat("fogDensity", density);
  }

  update(dt: number, camera: Camera): void {
    if (this.opts.animate) this.time += dt;
    const cam = camera.globalPosition;
    // Snap to whole grid cells so world-space waves stay continuous while following the camera.
    this.mesh.position.x = Math.round(cam.x / this.step) * this.step;
    this.mesh.position.z = Math.round(cam.z / this.step) * this.step;
    this.material.setFloat("time", this.time);
    this.material.setVector3("camPos", cam);
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
    this.depthTexture.dispose();
  }
}
