import{f as e}from"./math.scalar.functions-BWXNux-o.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./helperFunctions-DHdJUWHO.js";import{t as r}from"./logDepthDeclaration-BpsZdJ7z.js";import{t as i}from"./fogFragmentDeclaration-B3hbo39x.js";import{t as a}from"./logDepthFragment-CxtJswLx.js";import{t as o}from"./fogFragment-C9E3EVJj.js";import{t as s}from"./objectIdFunctions-B7azwFhh.js";import{n as c,t as l}from"./meshBlendTagFragmentOutput-DphJWeHM.js";import{t as u}from"./geometryRenderingFragment-BoxdRBy7.js";var d=`imageProcessingCompatibility`,f=`#ifdef IMAGEPROCESSINGPOSTPROCESS
fragmentOutputs.color=vec4f(pow(fragmentOutputs.color.rgb, vec3f(2.2)),fragmentOutputs.color.a);
#endif
`;t.IncludesShadersStoreWGSL[d]||(t.IncludesShadersStoreWGSL[d]=f);var p={name:d,shader:f},m=e({spritesPixelShaderWGSL:()=>v}),h=`spritesPixelShader`,g=`uniform alphaTest: i32;
#include<prePassDeclaration>[SCENE_MRT_COUNT]
varying vColor: vec4f;
#ifdef PREPASS
uniform geometryZeroAlphaDiscard: f32;
#ifdef PREPASS_POSITION
varying vPositionW: vec3f;
#endif
#ifdef PREPASS_NORMAL
varying vNormalV: vec3f;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vNormalW: vec3f;
#endif
#endif
varying vUV: vec2f;var diffuseSamplerSampler: sampler;var diffuseSampler: texture_2d<f32>;
#include<fogFragmentDeclaration>
#include<logDepthDeclaration>
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
#ifdef PIXEL_PERFECT
fn uvPixelPerfect(uv: vec2f)->vec2f {var res: vec2f= vec2f(textureDimensions(diffuseSampler,0));var uvTemp=uv*res;var seam: vec2f=floor(uvTemp+0.5);uvTemp=seam+clamp((uvTemp-seam)/fwidth(uvTemp),vec2f(-0.5),vec2f(0.5));return uvTemp/res;}
#endif
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#ifdef PIXEL_PERFECT
var uv: vec2f=uvPixelPerfect(input.vUV);
#else
var uv: vec2f=input.vUV;
#endif
var color: vec4f=textureSample(diffuseSampler,diffuseSamplerSampler,uv);var fAlphaTest: f32= f32(uniforms.alphaTest);if (fAlphaTest != 0.)
{if (color.a<0.95) {discard;}}
color*=input.vColor;
#ifdef PREPASS
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
var geometryAlbedo: vec3f=toLinearSpaceVec3(color.rgb);
#endif
if (fAlphaTest==0.0 && color.a==0.0 && uniforms.geometryZeroAlphaDiscard>0.0) {discard;}
#endif
#include<logDepthFragment>
#include<fogFragment>
#ifdef PREPASS
#include<imageProcessingCompatibility>(fragmentOutputs.color,color)
var geometryColor: vec4f=color;
#ifdef PREPASS_POSITION
var geometryPositionW: vec3f=input.vPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
var geometryPositionL: vec3f=input.vPosition;
#endif
#ifdef PREPASS_DEPTH
var geometryViewDepth: f32=input.vViewPos.z;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
var geometryNormalizedViewDepth: f32=input.vNormViewDepth;
#endif
#ifdef PREPASS_NORMAL
var geometryNormalV: vec3f=input.vNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
var geometryNormalW: vec3f=input.vNormalW;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
var geometryCurrentPosition: vec4f=input.vCurrentPosition;var geometryPreviousPosition: vec4f=input.vPreviousPosition;
#endif
#include<geometryRenderingFragment>
#else
fragmentOutputs.color=color;
#include<imageProcessingCompatibility>
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStoreWGSL[h]||(t.ShadersStoreWGSL[h]=g);var _=[s,c,i,r,n,a,o,p,l,u];for(let e of _)t.IncludesShadersStoreWGSL[e.name]||(t.IncludesShadersStoreWGSL[e.name]=e.shader);var v={name:h,shader:g};export{m as t};