import {
  Color3,
  Constants,
  CubeMapToSphericalPolynomialTools,
  DirectionalLight,
  HDRFiltering,
  HemisphericLight,
  MeshBuilder,
  RawCubeTexture,
  ToHalfFloat,
  Vector3,
  type Mesh,
  type Scene,
  type ShaderMaterial,
} from "@babylonjs/core";
import { createCustomShaderMaterial } from "./shaders";
import { sampleSky, type SkyParams } from "./SkyModel";

export interface SkyEnvironment {
  dome: Mesh;
  material: ShaderMaterial;
  sun: DirectionalLight;
  ambient: HemisphericLight;
  params: SkyParams;
  dispose(): void;
}

/** Face layout identical to Babylon's CubeMapToSphericalPolynomialTools (+X, -X, +Y, -Y, +Z, -Z). */
const FACES: { n: [number, number, number]; x: [number, number, number]; y: [number, number, number] }[] = [
  { n: [1, 0, 0], x: [0, 0, -1], y: [0, -1, 0] },
  { n: [-1, 0, 0], x: [0, 0, 1], y: [0, -1, 0] },
  { n: [0, 1, 0], x: [1, 0, 0], y: [0, 0, 1] },
  { n: [0, -1, 0], x: [1, 0, 0], y: [0, 0, -1] },
  { n: [0, 0, 1], x: [1, 0, 0], y: [0, -1, 0] },
  { n: [0, 0, -1], x: [-1, 0, 0], y: [0, -1, 0] },
];

/**
 * Bakes the analytic sky into a small HDR cube texture (half float) with spherical
 * harmonics for diffuse irradiance, then GGX-prefilters it for PBR specular.
 * Entirely procedural: no external .env/.hdr download is needed.
 */
export async function createSkyEnvironmentTexture(scene: Scene, params: SkyParams, size: number): Promise<RawCubeTexture | null> {
  try {
    const floatFaces: Float32Array[] = [];
    const halfFaces: Uint16Array[] = [];
    const tmp = [0, 0, 0];
    for (const face of FACES) {
      const f32 = new Float32Array(size * size * 4);
      const f16 = new Uint16Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        const v = ((y + 0.5) / size) * 2 - 1;
        for (let x = 0; x < size; x++) {
          const u = ((x + 0.5) / size) * 2 - 1;
          let dx = face.n[0] + face.x[0] * u + face.y[0] * v;
          let dy = face.n[1] + face.x[1] * u + face.y[1] * v;
          let dz = face.n[2] + face.x[2] * u + face.y[2] * v;
          const len = Math.hypot(dx, dy, dz);
          dx /= len;
          dy /= len;
          dz /= len;
          // The sun disc is left out of the bake: it would only add fireflies to rough reflections.
          sampleSky(params, dx, dy, dz, false, tmp);
          const i = (y * size + x) * 4;
          f32[i] = tmp[0];
          f32[i + 1] = tmp[1];
          f32[i + 2] = tmp[2];
          f32[i + 3] = 1;
          f16[i] = ToHalfFloat(tmp[0]);
          f16[i + 1] = ToHalfFloat(tmp[1]);
          f16[i + 2] = ToHalfFloat(tmp[2]);
          f16[i + 3] = ToHalfFloat(1);
        }
      }
      floatFaces.push(f32);
      halfFaces.push(f16);
    }

    const texture = new RawCubeTexture(
      scene,
      halfFaces,
      size,
      Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_HALF_FLOAT,
      true,
      false,
      Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
    );
    texture.gammaSpace = false;
    texture.name = "procedural-sky-env";
    texture.sphericalPolynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
      size,
      right: floatFaces[0],
      left: floatFaces[1],
      up: floatFaces[2],
      down: floatFaces[3],
      front: floatFaces[4],
      back: floatFaces[5],
      format: Constants.TEXTUREFORMAT_RGBA,
      type: Constants.TEXTURETYPE_FLOAT,
      gammaSpace: false,
    });

    if (!(new URLSearchParams(location.search).get("debug") ?? "").includes("nofilter")) try {
      const filtering = new HDRFiltering(scene.getEngine(), { hdrScale: 1, quality: Constants.TEXTURE_FILTERING_QUALITY_LOW });
      await Promise.race([
        filtering.prefilter(texture),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("prefilter timeout")), 4000)),
      ]);
    } catch (err) {
      console.warn("[Sky] GGX prefiltering unavailable, using mip chain", err);
    }
    return texture;
  } catch (err) {
    console.warn("[Sky] environment bake failed, PBR will rely on hemispheric light", err);
    return null;
  }
}

export interface SkyEnvironmentOptions {
  domeRadius: number;
  reflections: boolean;
  envSize: number;
  sunIntensity: number;
  ambientIntensity: number;
  environmentIntensity: number;
}

export async function createSkyEnvironment(scene: Scene, params: SkyParams, opts: SkyEnvironmentOptions): Promise<SkyEnvironment> {
  const dome = MeshBuilder.CreateSphere("sky-dome", { diameter: opts.domeRadius * 2, segments: 24, sideOrientation: 1 }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.alwaysSelectAsActiveMesh = true;
  const material = createCustomShaderMaterial("sky", "sky-material", scene);
  material.backFaceCulling = false;
  material.setColor3("zenith", params.zenith);
  material.setColor3("horizon", params.horizon);
  material.setColor3("groundColor", params.ground);
  material.setColor3("sunColor", params.sunColor);
  material.setVector3("sunDir", params.sunDirection);
  material.setFloat("sunIntensity", params.sunIntensity);
  material.setFloat("haze", params.hazeIntensity);
  dome.material = material;

  const sunDir = params.sunDirection.scale(-1);
  const sun = new DirectionalLight("sun", sunDir, scene);
  sun.position = params.sunDirection.scale(300);
  sun.diffuse = params.sunColor.clone();
  sun.specular = params.sunColor.clone();
  sun.intensity = opts.sunIntensity;

  const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  ambient.diffuse = Color3.Lerp(params.zenith, params.horizon, 0.5);
  ambient.groundColor = params.ground.scale(0.9);
  ambient.specular = Color3.Black();
  ambient.intensity = opts.ambientIntensity;

  const debug = new URLSearchParams(location.search).get("debug") ?? "";
  if (opts.reflections && !debug.includes("noenv")) {
    const env = await createSkyEnvironmentTexture(scene, params, opts.envSize);
    if (env) {
      scene.environmentTexture = env;
      scene.environmentIntensity = opts.environmentIntensity;
      // Irradiance now comes from the baked SH — tone the hemispheric fill down.
      ambient.intensity = opts.ambientIntensity * 0.45;
    }
  }

  return {
    dome,
    material,
    sun,
    ambient,
    params,
    dispose() {
      dome.dispose();
      material.dispose();
      sun.dispose();
      ambient.dispose();
      scene.environmentTexture?.dispose();
      scene.environmentTexture = null;
    },
  };
}
