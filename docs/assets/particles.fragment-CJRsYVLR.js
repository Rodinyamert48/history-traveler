import{f as e}from"./math.scalar.functions-BWXNux-o.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./helperFunctions-D8vur8CW.js";import{t as r}from"./clipPlaneFragmentDeclaration-M3T9Lap-.js";import{t as i}from"./clipPlaneFragment-CXLYb7ZJ.js";import{t as a}from"./logDepthDeclaration-Dh136csG.js";import{t as o}from"./imageProcessingDeclaration-eTCZRCGL.js";import{t as s}from"./imageProcessingFunctions-YjY3YzNA.js";import{t as c}from"./fogFragmentDeclaration--w8QPs2M.js";import{t as l}from"./logDepthFragment-C5lxT4l1.js";import{t as u}from"./fogFragment-CKCGTcJi.js";import{t as d}from"./objectIdFunctions-532nR7xV.js";import{t as f}from"./prePassDeclaration-UpIxofH8.js";import{t as p}from"./geometryRenderingFragment-DZg0Y277.js";var m=e({particlesPixelShader:()=>v}),h=`particlesPixelShader`,g=`#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
varying vec2 vUV;varying vec4 vColor;uniform vec4 textureMask;uniform sampler2D diffuseSampler;
#ifdef PREPASS
uniform float geometryZeroAlphaDiscard;
#ifdef PREPASS_POSITION
varying vec3 vGeometryPositionW;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vec3 vGeometryNormalW;
#endif
#ifdef PREPASS_NORMAL
varying vec3 vGeometryNormalV;
#endif
#endif
#define PREPASS_VELOCITY_ZERO
#include<prePassDeclaration>[SCENE_MRT_COUNT]
#include<clipPlaneFragmentDeclaration>
#include<imageProcessingDeclaration>
#include<logDepthDeclaration>
#include<helperFunctions>
#include<imageProcessingFunctions>
#ifdef RAMPGRADIENT
varying vec4 remapRanges;uniform sampler2D rampSampler;
#endif
#include<fogFragmentDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
vec4 textureColor=texture2D(diffuseSampler,vUV);vec4 baseColor=(textureColor*textureMask+(vec4(1.,1.,1.,1.)-textureMask))*vColor;
#ifdef PREPASS
vec3 geometryAlbedo=toLinearSpace(baseColor.rgb);
#endif
#ifdef RAMPGRADIENT
float alpha=baseColor.a;float remappedColorIndex=clamp((alpha-remapRanges.x)/remapRanges.y,0.0,1.0);vec4 rampColor=texture2D(rampSampler,vec2(1.0-remappedColorIndex,0.));baseColor.rgb*=rampColor.rgb;float finalAlpha=baseColor.a;baseColor.a=clamp((alpha*rampColor.a-remapRanges.z)/remapRanges.w,0.0,1.0);
#endif
#ifdef BLENDMULTIPLYMODE
float sourceAlpha=vColor.a*textureColor.a;baseColor.rgb=baseColor.rgb*sourceAlpha+vec3(1.0)*(1.0-sourceAlpha);
#endif
#include<logDepthFragment>
#include<fogFragment>(color,baseColor)
#ifdef IMAGEPROCESSINGPOSTPROCESS
baseColor.rgb=toLinearSpace(baseColor.rgb);
#else
#ifdef IMAGEPROCESSING
baseColor.rgb=toLinearSpace(baseColor.rgb);baseColor=applyImageProcessing(baseColor);
#endif
#endif
gl_FragColor=baseColor;
#ifdef PREPASS
vec4 geometryColor=gl_FragColor;if (geometryColor.a<=0.0 && geometryZeroAlphaDiscard>0.0) {discard;}
#ifdef PREPASS_POSITION
vec3 geometryPositionW=vGeometryPositionW;
#endif
#ifdef PREPASS_LOCAL_POSITION
vec3 geometryPositionL=vPosition;
#endif
#ifdef PREPASS_DEPTH
float geometryViewDepth=vViewPos.z;
#endif
#ifdef PREPASS_NORMALIZED_VIEW_DEPTH
float geometryNormalizedViewDepth=vNormViewDepth;
#endif
#ifdef PREPASS_NORMAL
vec3 geometryNormalV=normalize(vGeometryNormalV);
#endif
#ifdef PREPASS_WORLD_NORMAL
vec3 geometryNormalW=normalize(vGeometryNormalW);
#endif
#include<geometryRenderingFragment>
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStore[h]||(t.ShadersStore[h]=g);var _=[d,f,r,o,a,n,s,c,i,l,u,p];for(let e of _)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var v={name:h,shader:g};export{m as t};