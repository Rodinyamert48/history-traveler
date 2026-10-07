import{f as e}from"./math.scalar.functions-BWXNux-o.js";import{t}from"./shaderStore-D-XQlhUT.js";import{t as n}from"./helperFunctions-D8vur8CW.js";import{t as r}from"./logDepthDeclaration-Dh136csG.js";import{t as i}from"./fogFragmentDeclaration--w8QPs2M.js";import{t as a}from"./logDepthFragment-C5lxT4l1.js";import{t as o}from"./fogFragment-CKCGTcJi.js";import{t as s}from"./objectIdFunctions-532nR7xV.js";import{t as c}from"./prePassDeclaration-UpIxofH8.js";import{t as l}from"./geometryRenderingFragment-DZg0Y277.js";var u=`imageProcessingCompatibility`,d=`#ifdef IMAGEPROCESSINGPOSTPROCESS
gl_FragColor.rgb=pow(gl_FragColor.rgb,vec3(2.2));
#endif
`;t.IncludesShadersStore[u]||(t.IncludesShadersStore[u]=d);var f={name:u,shader:d},p=e({spritesPixelShader:()=>_}),m=`spritesPixelShader`,h=`#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
#include<prePassDeclaration>[SCENE_MRT_COUNT]
uniform bool alphaTest;varying vec4 vColor;
#ifdef PREPASS
uniform float geometryZeroAlphaDiscard;
#ifdef PREPASS_POSITION
varying vec3 vPositionW;
#endif
#ifdef PREPASS_NORMAL
varying vec3 vNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
varying vec3 vNormalW;
#endif
#endif
varying vec2 vUV;uniform sampler2D diffuseSampler;
#include<fogFragmentDeclaration>
#include<logDepthDeclaration>
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
#ifdef PIXEL_PERFECT
vec2 uvPixelPerfect(vec2 uv) {vec2 res=vec2(textureSize(diffuseSampler,0));uv=uv*res;vec2 seam=floor(uv+0.5);uv=seam+clamp((uv-seam)/fwidth(uv),-0.5,0.5);return uv/res;}
#endif
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#ifdef PIXEL_PERFECT
vec2 uv=uvPixelPerfect(vUV);
#else
vec2 uv=vUV;
#endif
vec4 color=texture2D(diffuseSampler,uv);float fAlphaTest=float(alphaTest);if (fAlphaTest != 0.)
{if (color.a<0.95)
discard;}
color*=vColor;
#ifdef PREPASS
#if defined(PREPASS_ALBEDO) || defined(PREPASS_ALBEDO_SQRT)
vec3 geometryAlbedo=toLinearSpace(color.rgb);
#endif
if (fAlphaTest==0.0 && color.a==0.0 && geometryZeroAlphaDiscard>0.0) {discard;}
#endif
#include<logDepthFragment>
#include<fogFragment>
gl_FragColor=color;
#include<imageProcessingCompatibility>
#ifdef PREPASS
vec4 geometryColor=gl_FragColor;
#ifdef PREPASS_POSITION
vec3 geometryPositionW=vPositionW;
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
vec3 geometryNormalV=vNormalV;
#endif
#ifdef PREPASS_WORLD_NORMAL
vec3 geometryNormalW=vNormalW;
#endif
#if defined(PREPASS_VELOCITY) || defined(PREPASS_VELOCITY_LINEAR)
vec4 geometryCurrentPosition=vCurrentPosition;vec4 geometryPreviousPosition=vPreviousPosition;
#endif
#include<geometryRenderingFragment>
#endif
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStore[m]||(t.ShadersStore[m]=h);var g=[s,c,i,r,n,a,o,f,l];for(let e of g)t.IncludesShadersStore[e.name]||(t.IncludesShadersStore[e.name]=e.shader);var _={name:m,shader:h};export{p as t};