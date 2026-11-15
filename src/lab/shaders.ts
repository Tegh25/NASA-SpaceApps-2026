/**
 * GLSL chunks injected into MeshStandardMaterial / MeshDepthMaterial via onBeforeCompile.
 * Heights live in two R32F textures (Earth, other body). The vertex shader samples both and
 * mixes by uT, so the morph costs nothing on the CPU. Normals come from finite differences of
 * the same (revealed, exaggerated) height, so lighting follows the morph and the scan intro.
 */

export const GRID = 256;
export const SIZE = 10.24; // world units == km
export const CELL = SIZE / (GRID - 1);

/** Shared by the colour and the shadow-depth vertex shaders. */
export const VERT_CORE = /* glsl */ `
attribute vec3 aEdge; // xy: outward skirt direction, z: 1 for skirt bottom
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uT;
uniform float uExag;
uniform float uScan;
uniform float uBottom;
uniform float uCell;
float hRaw(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(${GRID - 1}));
  return mix(texelFetch(uTexA, p, 0).r, texelFetch(uTexB, p, 0).r, uT);
}
float reveal(float s) { return 1.0 - smoothstep(uScan - 0.12, uScan, s); }
float hEx(ivec2 p) { return hRaw(p) * uExag * reveal(float(p.x) / ${(GRID - 1).toFixed(1)}); }
ivec2 gridPos() {
  return ivec2(int(floor(uv.x * ${(GRID - 1).toFixed(1)} + 0.5)), int(floor((1.0 - uv.y) * ${(GRID - 1).toFixed(1)} + 0.5)));
}
`;

export const VERT_PARS_COLOR = /* glsl */ `
#include <common>
${VERT_CORE}
varying float vH;
varying float vS;
varying float vY;
varying float vEdge;
varying vec3 vN;
varying vec2 vLocal;
`;

export const VERT_NORMAL = /* glsl */ `
ivec2 ip = gridPos();
float hl = hEx(ip + ivec2(-1, 0));
float hr = hEx(ip + ivec2(1, 0));
float hu = hEx(ip + ivec2(0, -1));
float hd = hEx(ip + ivec2(0, 1));
vec3 objectNormal = normalize(vec3(-(hr - hl) / (2.0 * uCell), 1.0, -(hd - hu) / (2.0 * uCell)));
if (length(aEdge.xy) > 0.5) objectNormal = vec3(aEdge.x, 0.0, aEdge.y);
`;

export const VERT_BEGIN_COLOR = /* glsl */ `
float hhEx = hEx(ip);
vec3 transformed = vec3(position.x, hhEx, position.z);
if (aEdge.z > 0.5) transformed.y = uBottom;
vH = hRaw(ip);
vS = position.x / ${SIZE.toFixed(2)} + 0.5;
vY = transformed.y;
vEdge = length(aEdge.xy);
vN = objectNormal;
vLocal = position.xz;
`;

export const VERT_PARS_DEPTH = /* glsl */ `
#include <common>
${VERT_CORE}
`;

export const VERT_BEGIN_DEPTH = /* glsl */ `
ivec2 ip = gridPos();
vec3 transformed = vec3(position.x, hEx(ip), position.z);
if (aEdge.z > 0.5) transformed.y = uBottom;
`;

export const FRAG_PARS = /* glsl */ `
#include <common>
uniform float uPal;      // 0 Earth palette, 1 other-body palette
uniform float uLo;
uniform float uHi;
uniform float uSnow;     // normalised height where snow starts (>= 5 means none)
uniform float uContour;
uniform float uInvV;     // real metres per world metre of height: 1 at 10.24 km blocks, larger when a bigger block is squeezed into the same world size
uniform float uShim;
uniform float uScan;
uniform float uHazeK;    // global haze scale
uniform float uHazeO;    // haze amount of the other body
uniform vec3 uHazeColE;
uniform vec3 uHazeColO;
uniform vec3 uBase;      // other-body regolith colour (sRGB)
uniform vec3 uAmbO;      // other-body ambient (linear, tiny on the Moon)
uniform vec3 uAccent;
varying float vH;
varying float vS;
varying float vY;
varying float vEdge;
varying vec3 vN;
varying vec2 vLocal;

vec3 s2l(vec3 c) { return pow(c, vec3(2.2)); }
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s / 0.875;
}
vec3 earthPalette(float hn, float sl, float nz) {
  vec3 a = s2l(vec3(0.36, 0.29, 0.23));
  vec3 b = s2l(vec3(0.63, 0.48, 0.31));
  vec3 c = s2l(vec3(0.80, 0.69, 0.52));
  vec3 d = s2l(vec3(0.58, 0.54, 0.50));
  vec3 col = mix(a, b, smoothstep(0.0, 0.35, hn));
  col = mix(col, c, smoothstep(0.30, 0.65, hn));
  col = mix(col, d, smoothstep(0.65, 1.0, hn));
  col = mix(col, s2l(vec3(0.42, 0.38, 0.34)), smoothstep(0.12, 0.40, sl));
  col *= 0.86 + 0.28 * nz;
  float sn = smoothstep(uSnow, uSnow + 0.07, hn) * (1.0 - smoothstep(0.25, 0.60, sl));
  return mix(col, vec3(0.82, 0.85, 0.92), sn);
}
vec3 otherPalette(float hn, float sl, float nz, float grain) {
  vec3 col = s2l(uBase) * (0.78 + 0.44 * nz) * (0.93 + 0.14 * grain) * (0.9 + 0.2 * clamp(hn, 0.0, 1.0));
  return col;
}
`;

export const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  float sl = 1.0 - clamp(vN.y, 0.0, 1.0);
  float hn = clamp((vH - uLo) / max(uHi - uLo, 1e-4), -0.2, 1.6);
  vec3 col;
  if (vEdge > 0.5) {
    float bnd = 0.5 + 0.5 * sin(vY * 34.0 + 3.0 * vnoise(vec2(vLocal.x + vLocal.y, vY * 9.0)));
    vec3 e = mix(s2l(vec3(0.30, 0.23, 0.18)), s2l(vec3(0.55, 0.42, 0.28)), bnd);
    vec3 o = mix(s2l(uBase) * 0.45, s2l(uBase) * 0.8, bnd);
    col = mix(e, o, uPal) * 0.75;
  } else {
    float nz = fbm(vLocal * 0.7);
    float grain = vnoise(vLocal * 14.0);
    col = mix(earthPalette(hn, sl, nz), otherPalette(hn, sl, nz, grain), uPal);
    col *= 1.0 - 0.25 * smoothstep(0.05, 0.45, sl);
  }
  diffuseColor.rgb = col;
}
`;

export const FRAG_OUT = /* glsl */ `
{
  // Per-block ambient: bluish sky bounce on Earth, almost nothing on an airless body.
  vec3 earthAmb = mix(vec3(0.14, 0.11, 0.08), vec3(0.20, 0.22, 0.36), vN.y * 0.5 + 0.5);
  vec3 amb = mix(earthAmb, uAmbO, uPal);
  outgoingLight += diffuseColor.rgb * amb;

  float em = 0.0;
  float reveal = 1.0 - smoothstep(uScan - 0.12, uScan, vS);
  if (vEdge < 0.5) {
    float c = vH * uInvV * 20.0; // iso-line every 50 m of real elevation (uInvV undoes the block-size scaling)
    float fw = max(fwidth(c), 1e-5);
    float fade = 1.0 - smoothstep(0.25, 0.6, fw);
    float l1 = 1.0 - clamp(abs(fract(c - 0.5) - 0.5) / fw, 0.0, 1.0);
    float c5 = vH * uInvV * 4.0;
    float fw5 = max(fwidth(c5), 1e-5);
    float l5 = 1.0 - clamp(abs(fract(c5 - 0.5) - 0.5) / fw5, 0.0, 1.0);
    em += uContour * (0.30 * l1 + 0.45 * l5) * fade;

    vec2 g = vLocal / 0.16;
    vec2 gf = max(fwidth(g), vec2(1e-5));
    vec2 gl = 1.0 - clamp(abs(fract(g - 0.5) - 0.5) / gf, 0.0, 1.0);
    em += uShim * max(gl.x, gl.y) * (0.35 + 0.65 * (1.0 - reveal)) * (1.0 - smoothstep(0.15, 0.5, max(gf.x, gf.y)));
  }
  float band = exp(-pow((vS - uScan) / 0.007, 2.0)) * step(0.001, uScan) * (1.0 - step(1.17, uScan));
  em += band * 4.0;
  outgoingLight += uAccent * em;

  float d = length(vViewPosition);
  float haze = uHazeK * mix(0.62, uHazeO, uPal) * (1.0 - exp(-d * 0.03));
  outgoingLight = mix(outgoingLight, mix(uHazeColE, uHazeColO, uPal), clamp(haze, 0.0, 0.85));
}
#include <opaque_fragment>
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}
`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uSky;       // 0 Earth, 1 airless
uniform vec3 uZenO;
uniform vec3 uHorO;
uniform vec3 uSunDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 zenE = vec3(0.035, 0.05, 0.19);
  vec3 horE = vec3(0.30, 0.31, 0.60);
  vec3 zen = mix(zenE, uZenO, uSky);
  vec3 hor = mix(horE, uHorO, uSky);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(hor, zen, pow(h, 0.45));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.85, 0.65) * (pow(s, 14.0) * 0.18 + pow(s, 220.0) * 0.8) * (1.0 - uSky);
  gl_FragColor = vec4(col, 1.0);
}
`;
