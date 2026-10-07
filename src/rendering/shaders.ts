import { ShaderLanguage, ShaderMaterial, type Scene } from "@babylonjs/core";

/**
 * Custom shaders are authored in BOTH GLSL (WebGL) and WGSL (WebGPU) so the WebGPU
 * path never needs the GLSL→WGSL transpiler (which would otherwise be downloaded from a CDN).
 */

const TONEMAP_GLSL = /* glsl */ `
vec3 htTonemap(vec3 c) {
  c *= exposure;
  vec3 x = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(x, 0.0, 1.0), vec3(1.0 / 2.2));
}`;

const TONEMAP_WGSL = /* wgsl */ `
fn htTonemap(c0 : vec3f) -> vec3f {
  let c = c0 * uniforms.exposure;
  let x = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(x, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
}`;

// ---------------------------------------------------------------------------------- SKY
const SKY_VERTEX_GLSL = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  gl_Position = viewProjection * world * vec4(position, 1.0);
}`;

const SKY_FRAGMENT_GLSL = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 groundColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunIntensity;
uniform float haze;
uniform float linearOutput;
uniform float exposure;
${TONEMAP_GLSL}
void main(void) {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 col = mix(horizon, zenith, sqrt(up));
  if (d.y < 0.0) {
    col = mix(horizon * 0.85, groundColor, smoothstep(0.0, 0.22, -d.y));
  }
  col += haze * exp(-abs(d.y) * 9.0) * horizon;
  float s = max(dot(d, sunDir), 0.0);
  float glow = pow(s, 10.0) * 0.45 + pow(s, 90.0) * 1.2;
  float disc = smoothstep(0.9994, 0.99975, s) * sunIntensity;
  col += sunColor * (glow + disc);
  if (linearOutput < 0.5) { col = htTonemap(col); }
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VERTEX_WGSL = /* wgsl */ `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;
varying vDir : vec3f;
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  vertexOutputs.vDir = vertexInputs.position;
  vertexOutputs.position = scene.viewProjection * mesh.world * vec4f(vertexInputs.position, 1.0);
}`;

const SKY_FRAGMENT_WGSL = /* wgsl */ `
varying vDir : vec3f;
uniform zenith : vec3f;
uniform horizon : vec3f;
uniform groundColor : vec3f;
uniform sunColor : vec3f;
uniform sunDir : vec3f;
uniform sunIntensity : f32;
uniform haze : f32;
uniform linearOutput : f32;
uniform exposure : f32;
${TONEMAP_WGSL}
@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let d = normalize(fragmentInputs.vDir);
  let up = max(d.y, 0.0);
  var col = mix(uniforms.horizon, uniforms.zenith, sqrt(up));
  if (d.y < 0.0) {
    col = mix(uniforms.horizon * 0.85, uniforms.groundColor, smoothstep(0.0, 0.22, -d.y));
  }
  col = col + uniforms.haze * exp(-abs(d.y) * 9.0) * uniforms.horizon;
  let s = max(dot(d, uniforms.sunDir), 0.0);
  let glow = pow(s, 10.0) * 0.45 + pow(s, 90.0) * 1.2;
  let disc = smoothstep(0.9994, 0.99975, s) * uniforms.sunIntensity;
  col = col + uniforms.sunColor * (glow + disc);
  if (uniforms.linearOutput < 0.5) { col = htTonemap(col); }
  fragmentOutputs.color = vec4f(col, 1.0);
}`;

// -------------------------------------------------------------------------------- WATER
const WATER_WAVES_GLSL = /* glsl */ `
float htWaves(vec2 p, float t) {
  float h = 0.0;
  h += sin(dot(p, vec2(0.80, 0.60)) * 0.21 + t * 1.10) * 0.55;
  h += sin(dot(p, vec2(-0.50, 0.86)) * 0.37 + t * 1.55) * 0.30;
  h += sin(dot(p, vec2(0.97, -0.24)) * 0.63 + t * 2.10) * 0.17;
  h += sin(dot(p, vec2(-0.20, -0.98)) * 1.10 + t * 2.70) * 0.08;
  return h;
}`;

const WATER_WAVES_WGSL = /* wgsl */ `
fn htWaves(p : vec2f, t : f32) -> f32 {
  var h = 0.0;
  h = h + sin(dot(p, vec2f(0.80, 0.60)) * 0.21 + t * 1.10) * 0.55;
  h = h + sin(dot(p, vec2f(-0.50, 0.86)) * 0.37 + t * 1.55) * 0.30;
  h = h + sin(dot(p, vec2f(0.97, -0.24)) * 0.63 + t * 2.10) * 0.17;
  h = h + sin(dot(p, vec2f(-0.20, -0.98)) * 1.10 + t * 2.70) * 0.08;
  return h;
}`;

const WATER_VERTEX_GLSL = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float waveAmplitude;
uniform float waveFrequency;
varying vec3 vWorld;
varying float vWave;
${WATER_WAVES_GLSL}
void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  float w = htWaves(wp.xz * waveFrequency, time);
  wp.y += w * waveAmplitude;
  vWorld = wp.xyz;
  vWave = w;
  gl_Position = viewProjection * wp;
}`;

const WATER_FRAGMENT_GLSL = /* glsl */ `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vWorld;
varying float vWave;
uniform vec3 camPos;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 deepColor;
uniform vec3 shallowColor;
uniform vec3 foamColor;
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform float foamAmount;
uniform float linearOutput;
uniform float exposure;
uniform vec4 depthRect;
uniform sampler2D depthTex;
${TONEMAP_GLSL}
void main(void) {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) { n = -n; }
  vec3 V = normalize(camPos - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec2 duv = (vWorld.xz - depthRect.xy) / depthRect.zw;
  float depth = texture2D(depthTex, duv).r;
  vec3 base = mix(shallowColor, deepColor, smoothstep(0.0, 0.55, depth));
  float diff = max(dot(n, sunDir), 0.0);
  vec3 col = base * (0.5 + 0.5 * diff) * (sunColor * 0.55 + 0.45);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(skyHorizon, skyZenith, sqrt(clamp(R.y, 0.0, 1.0)));
  col = mix(col, sky, fres * 0.8);
  vec3 H = normalize(sunDir + V);
  col += sunColor * pow(max(dot(n, H), 0.0), 220.0) * 2.5;
  float shore = 1.0 - smoothstep(0.0, 0.1, depth);
  float bands = 0.5 + 0.5 * sin(depth * 110.0 - time * 1.7 + sin(vWorld.x * 0.13 + vWorld.z * 0.07) * 2.0);
  float crest = smoothstep(0.62, 0.95, vWave);
  float foam = clamp(shore * (0.35 + 0.65 * bands) + crest * 0.35, 0.0, 1.0) * foamAmount;
  col = mix(col, foamColor, foam);
  float dist = length(camPos - vWorld);
  float f = clamp(exp(-pow(dist * fogDensity, 2.0)), 0.0, 1.0);
  col = mix(fogColor, col, f);
  if (linearOutput < 0.5) { col = htTonemap(col); }
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_VERTEX_WGSL = /* wgsl */ `
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;
uniform time : f32;
uniform waveAmplitude : f32;
uniform waveFrequency : f32;
varying vWorld : vec3f;
varying vWave : f32;
${WATER_WAVES_WGSL}
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  var wp = mesh.world * vec4f(vertexInputs.position, 1.0);
  let w = htWaves(wp.xz * uniforms.waveFrequency, uniforms.time);
  wp.y = wp.y + w * uniforms.waveAmplitude;
  vertexOutputs.vWorld = wp.xyz;
  vertexOutputs.vWave = w;
  vertexOutputs.position = scene.viewProjection * wp;
}`;

const WATER_FRAGMENT_WGSL = /* wgsl */ `
varying vWorld : vec3f;
varying vWave : f32;
uniform camPos : vec3f;
uniform sunDir : vec3f;
uniform sunColor : vec3f;
uniform deepColor : vec3f;
uniform shallowColor : vec3f;
uniform foamColor : vec3f;
uniform skyZenith : vec3f;
uniform skyHorizon : vec3f;
uniform fogColor : vec3f;
uniform fogDensity : f32;
uniform time : f32;
uniform foamAmount : f32;
uniform linearOutput : f32;
uniform exposure : f32;
uniform depthRect : vec4f;
var depthTexSampler : sampler;
var depthTex : texture_2d<f32>;
${TONEMAP_WGSL}
@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let wpos = fragmentInputs.vWorld;
  var n = normalize(cross(dpdx(wpos), dpdy(wpos)));
  let duv = (wpos.xz - uniforms.depthRect.xy) / uniforms.depthRect.zw;
  let depth = textureSample(depthTex, depthTexSampler, duv).r;
  if (n.y < 0.0) { n = -n; }
  let V = normalize(uniforms.camPos - wpos);
  let ndv = max(dot(n, V), 0.0);
  let fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  let base = mix(uniforms.shallowColor, uniforms.deepColor, smoothstep(0.0, 0.55, depth));
  let diff = max(dot(n, uniforms.sunDir), 0.0);
  var col = base * (0.5 + 0.5 * diff) * (uniforms.sunColor * 0.55 + 0.45);
  let R = reflect(-V, n);
  let sky = mix(uniforms.skyHorizon, uniforms.skyZenith, sqrt(clamp(R.y, 0.0, 1.0)));
  col = mix(col, sky, fres * 0.8);
  let H = normalize(uniforms.sunDir + V);
  col = col + uniforms.sunColor * pow(max(dot(n, H), 0.0), 220.0) * 2.5;
  let shore = 1.0 - smoothstep(0.0, 0.1, depth);
  let bands = 0.5 + 0.5 * sin(depth * 110.0 - uniforms.time * 1.7 + sin(wpos.x * 0.13 + wpos.z * 0.07) * 2.0);
  let crest = smoothstep(0.62, 0.95, fragmentInputs.vWave);
  let foam = clamp(shore * (0.35 + 0.65 * bands) + crest * 0.35, 0.0, 1.0) * uniforms.foamAmount;
  col = mix(col, uniforms.foamColor, foam);
  let dist = length(uniforms.camPos - wpos);
  let f = clamp(exp(-pow(dist * uniforms.fogDensity, 2.0)), 0.0, 1.0);
  col = mix(uniforms.fogColor, col, f);
  if (uniforms.linearOutput < 0.5) { col = htTonemap(col); }
  fragmentOutputs.color = vec4f(col, 1.0);
}`;

interface DualSource {
  glslVertex: string;
  glslFragment: string;
  wgslVertex: string;
  wgslFragment: string;
}

const SOURCES: Record<"sky" | "water", DualSource> = {
  sky: {
    glslVertex: SKY_VERTEX_GLSL,
    glslFragment: SKY_FRAGMENT_GLSL,
    wgslVertex: SKY_VERTEX_WGSL,
    wgslFragment: SKY_FRAGMENT_WGSL,
  },
  water: {
    glslVertex: WATER_VERTEX_GLSL,
    glslFragment: WATER_FRAGMENT_GLSL,
    wgslVertex: WATER_VERTEX_WGSL,
    wgslFragment: WATER_FRAGMENT_WGSL,
  },
};

const UNIFORMS: Record<keyof typeof SOURCES, string[]> = {
  sky: ["zenith", "horizon", "groundColor", "sunColor", "sunDir", "sunIntensity", "haze", "linearOutput", "exposure"],
  water: [
    "time",
    "waveAmplitude",
    "waveFrequency",
    "camPos",
    "sunDir",
    "sunColor",
    "deepColor",
    "shallowColor",
    "foamColor",
    "skyZenith",
    "skyHorizon",
    "fogColor",
    "fogDensity",
    "foamAmount",
    "linearOutput",
    "exposure",
    "depthRect",
  ],
};

const SAMPLERS: Record<keyof typeof SOURCES, string[]> = {
  sky: [],
  water: ["depthTex"],
};

/** All custom materials, so the post-processing toggle can switch their output space. */
const customMaterials = new Set<ShaderMaterial>();

export function createCustomShaderMaterial(kind: keyof typeof SOURCES, name: string, scene: Scene): ShaderMaterial {
  const src = SOURCES[kind];
  const isWebGPU = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    isWebGPU
      ? { vertexSource: src.wgslVertex, fragmentSource: src.wgslFragment }
      : { vertexSource: src.glslVertex, fragmentSource: src.glslFragment },
    {
      attributes: ["position"],
      uniforms: isWebGPU ? UNIFORMS[kind] : ["world", "viewProjection", ...UNIFORMS[kind]],
      samplers: SAMPLERS[kind],
      uniformBuffers: isWebGPU ? ["Scene", "Mesh"] : undefined,
      shaderLanguage: isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setFloat("linearOutput", 1);
  material.setFloat("exposure", 1);
  customMaterials.add(material);
  material.onDisposeObservable.add(() => customMaterials.delete(material));
  return material;
}

/**
 * When the image-processing post process is active, custom shaders must output linear HDR;
 * otherwise they tonemap + gamma-correct themselves (matching Babylon's in-material path).
 */
export function setCustomShaderOutputMode(scene: Scene, linear: boolean, exposure: number): void {
  for (const m of customMaterials) {
    if (m.getScene() !== scene) continue;
    m.setFloat("linearOutput", linear ? 1 : 0);
    m.setFloat("exposure", exposure);
  }
}
