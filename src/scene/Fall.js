import * as THREE from 'three';
import { GLSL_NOISE } from '../lib/glsl.js';
import { narutoTexture, chashuTexture } from '../lib/foodTex.js';

// The fall. First a tunnel of swirling broth, seeded with sesame, scallion and
// chili flakes, with noodle vortices, eggs, narutomaki, mushrooms and star anise
// tumbling past. Then the broth thins out and turns out to be space: stars
// streak by, and the ingredients have become worlds (a fried-egg moon, a
// naruto galaxy, a ringed broth giant whose ring is scallions) before the
// giant bowl comes up from below.
//
// World: the camera runs straight down the Y axis from y = 0.

const TUNNEL_R = 3.7;
const TUNNEL_LEN = 236;
const SUN = new THREE.Vector3(-0.5, 0.8, 0.6).normalize();

// ------------------------------------------------------------------ shaders

const tunnelVert = /* glsl */ `
  varying vec3 vWorld;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const tunnelFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  ${GLSL_NOISE}

  void main() {
    float ang = atan(vWorld.z, vWorld.x);
    float d = -vWorld.y;
    float cosmic = smoothstep(28.0, 100.0, d);
    float around = ang / 6.2831853;
    vec3 V = normalize(cameraPosition - vWorld);

    // currents: noise sampled on a cylinder, so the broth has no seam
    vec3 p3 = vec3(cos(ang) * 1.7, sin(ang) * 1.7, d * 0.085);
    vec3 q = vec3(fbm3(p3 * 1.3 + uTime * 0.05), fbm3(p3 * 1.3 + 5.2 - uTime * 0.04), 0.0);
    float n = fbm3(p3 + 1.7 * q);

    vec3 deep = vec3(0.16, 0.055, 0.02);
    vec3 amber = vec3(0.98, 0.56, 0.14);
    vec3 gold = vec3(1.0, 0.82, 0.38);
    vec3 col = mix(deep, amber, smoothstep(0.2, 0.82, n));
    col = mix(col, gold, smoothstep(0.62, 0.95, n) * 0.6);

    // a second, nearer layer of broth drifting the other way: the soup has depth
    float n2 = fbm3(p3 * 2.4 + vec3(0.0, 0.0, -uTime * 0.08) + 31.0);
    col = mix(col, gold * 1.05, smoothstep(0.55, 0.85, n2) * 0.35);
    col = mix(col, deep, smoothstep(0.2, 0.0, n2) * 0.5);

    // chili oil ribbons
    float chili = smoothstep(0.6, 0.8, fbm3(p3 * 2.2 + q * 2.0 + 3.0));
    col = mix(col, vec3(0.8, 0.12, 0.02), chili * 0.55);

    // oil slicks: big soft irregular patches that catch the light, with a thin-film sheen
    float oil = smoothstep(0.58, 0.74, fbm3(p3 * 0.9 + 12.0));
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fbm3(p3 * 3.0 + uTime * 0.1) * 1.6));
    col += (vec3(1.0, 0.82, 0.5) * 0.25 + film * 0.12) * oil * (0.5 + 0.8 * pow(fbm3(p3 * 5.0 + uTime * 0.1), 2.0));

    // fat droplets: round beads of fat that lens the light, each with a dark rim and a highlight
    vec2 dv = voroP(vec2(around * 110.0, d * 1.1 + uTime * 0.02), 110.0);
    float dr = 0.1 + 0.2 * dv.y;
    float inDrop = smoothstep(dr, dr - 0.06, dv.x) * step(0.35, dv.y);
    float rim = smoothstep(dr - 0.09, dr - 0.02, dv.x) * inDrop;
    col = mix(col, gold * 1.15, inDrop * 0.75);
    col = mix(col, deep * 1.4, rim * 0.8);
    col += vec3(1.0, 0.95, 0.8) * inDrop * smoothstep(dr * 0.5, 0.0, dv.x) * 0.5;

    // bubbles streaming up: small bright rings
    vec2 bv = voroP(vec2(around * 70.0, (d + uTime * 2.2) * 1.4), 70.0);
    float ring = smoothstep(0.03, 0.0, abs(bv.x - 0.12 - 0.08 * bv.y)) * step(0.7, bv.y);
    col += vec3(1.0, 0.9, 0.7) * ring * 0.8;

    // flecks of scallion, sesame and chili, scattered at random
    float fl = smoothstep(0.8, 0.84, fbm3(p3 * 13.0 + 4.0));
    float kind = fbm3(p3 * 3.0 + 20.0);
    vec3 fc = kind < 0.4 ? vec3(0.42, 0.85, 0.24) : (kind < 0.55 ? vec3(0.97, 0.91, 0.76) : vec3(0.75, 0.1, 0.04));
    col = mix(col, fc, fl * 0.85);

    // light from above: shafts and caustics near the surface
    float top = 1.0 - smoothstep(0.0, 60.0, d);
    float shaft = pow(fbm(vec2(around * 30.0 + uTime * 0.03, d * 0.015)), 3.0);
    col += vec3(1.0, 0.85, 0.55) * shaft * top * 0.9;
    col += vec3(1.0, 0.8, 0.5) * pow(fbm3(vec3(cos(ang) * 4.0, sin(ang) * 4.0, d * 0.03 + uTime * 0.05)), 3.0) * top * 0.7;
    col *= mix(1.0, 0.72, smoothstep(0.0, 70.0, d));

    // the broth turns out to be space: nebula colours, and stars seeded in it
    vec3 neb = mix(vec3(0.05, 0.02, 0.14), vec3(0.5, 0.14, 0.62), smoothstep(0.25, 0.8, n));
    neb += vec3(0.05, 0.4, 0.5) * smoothstep(0.55, 0.9, fbm3(p3 * 1.3 + 9.0)) * 0.6;
    neb += vec3(0.9, 0.5, 0.2) * smoothstep(0.6, 0.9, n2) * 0.3;
    col = mix(col, neb, cosmic);
    vec2 sg = vec2(around * 180.0, d * 4.0);
    vec2 cell = vec2(mod(floor(sg.x), 180.0), floor(sg.y));
    float h = hash(cell);
    float star = step(0.985, h) * smoothstep(0.5, 0.0, length(fract(sg) - 0.5));
    col += vec3(1.0, 0.95, 0.85) * star * (0.15 + cosmic * 2.4) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0));

    float alpha = 1.0 - smoothstep(70.0, 118.0, d);
    gl_FragColor = vec4(col, alpha);
  }
`;

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;

const skyFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;
  ${GLSL_NOISE}
  float fbmK(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
  vec4 stars(vec3 dir, float scale, float thresh) {
    vec3 p = dir * scale;
    vec3 c = floor(p);
    float h = hash3(c);
    vec3 pos = vec3(hash3(c + 1.3), hash3(c + 2.7), hash3(c + 4.1));
    float d = length(fract(p) - pos);
    float on = step(thresh, h);
    float size = 0.06 + 0.12 * hash3(c + 9.0);
    float core = smoothstep(size, 0.0, d);
    float tint = hash3(c + 5.5);
    vec3 col = tint < 0.3 ? vec3(0.75, 0.85, 1.0) : (tint < 0.75 ? vec3(1.0, 0.97, 0.9) : vec3(1.0, 0.8, 0.55));
    return vec4(col * core * on, on * (0.5 + 0.5 * hash3(c + 7.0)));
  }
  void main() {
    vec3 dir = normalize(vDir);
    vec3 col = vec3(0.010, 0.008, 0.03);
    // the galaxy: a bright band with dark dust lanes through it
    vec3 axis = normalize(vec3(0.35, 0.25, 0.9));
    float along = dot(dir, axis);
    float band = exp(-pow(along * 2.6, 2.0));
    float dust = fbmK(dir * 6.0 + 2.0);
    float lanes = smoothstep(0.35, 0.6, fbmK(dir * 9.0 + 7.0));
    col += vec3(0.95, 0.85, 0.75) * band * (0.22 + 0.3 * dust) * (1.0 - lanes * 0.7);
    // nebula: three layers of gas in teal, violet and broth amber, warped by each other
    float a = fbmK(dir * 2.2 + 4.0);
    float b = fbmK(dir * 4.5 + a * 2.0);
    float c = fbmK(dir * 3.1 + b * 1.5 + 11.0);
    col += vec3(0.05, 0.36, 0.46) * smoothstep(0.42, 0.85, a) * (0.4 + band);
    col += vec3(0.45, 0.12, 0.6) * smoothstep(0.5, 0.9, b) * (0.35 + band);
    col += vec3(0.9, 0.42, 0.1) * smoothstep(0.58, 0.95, a * b * 1.9) * 0.5;
    col += vec3(0.95, 0.3, 0.5) * smoothstep(0.62, 0.92, c) * 0.3;
    col += vec3(0.9, 0.85, 0.8) * band * fbmK(dir * 14.0) * 0.18;
    // glowing cores inside the gas
    col += vec3(1.0, 0.7, 0.4) * pow(smoothstep(0.6, 1.0, a * c * 2.2), 2.0) * 0.8;
    // stars: three densities, coloured, twinkling
    vec4 s1 = stars(dir, 90.0, 0.93);
    vec4 s2 = stars(dir, 200.0, 0.9);
    vec4 s3 = stars(dir, 40.0, 0.965);
    vec3 st = s1.rgb + s2.rgb * 0.6 + s3.rgb * 2.2;
    col += st * (0.8 + 0.2 * sin(uTime * 2.0 + dir.x * 90.0 + dir.y * 40.0));
    // a few bright stars with diffraction spikes
    vec3 p = dir * 22.0;
    vec3 cc = floor(p);
    float hh = hash3(cc + 3.3);
    if (hh > 0.975) {
      vec3 pos = vec3(hash3(cc + 1.3), hash3(cc + 2.7), hash3(cc + 4.1));
      vec3 r = fract(p) - pos;
      float d = length(r);
      float spike = exp(-abs(r.x) * 40.0) * exp(-abs(r.y) * 6.0) + exp(-abs(r.y) * 40.0) * exp(-abs(r.x) * 6.0);
      col += vec3(0.9, 0.95, 1.0) * (smoothstep(0.08, 0.0, d) * 3.0 + spike * 0.6 * smoothstep(0.4, 0.0, d));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const streakVert = /* glsl */ `
  attribute vec3 aBase;
  attribute float aEnd;
  attribute float aLen;
  attribute float aBright;
  uniform float uCamY;
  uniform float uStreak;
  uniform float uAmt;
  varying float vA;
  void main() {
    float H = 340.0;
    float y = mod(aBase.y - uCamY + H * 0.5, H) - H * 0.5;
    vec3 p = vec3(aBase.x, uCamY + y + aEnd * aLen * uStreak, aBase.z);
    vA = aBright * (1.0 - aEnd) * smoothstep(H * 0.5, H * 0.35, abs(y)) * uAmt;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const streakFrag = /* glsl */ `
  varying float vA;
  void main() { gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * vA, vA); }
`;

const planetVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vW;
  void main() {
    vL = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const planetFrag = /* glsl */ `
  uniform vec3 uA, uB, uC, uGlowCol, uSun;
  uniform float uBands, uWarp, uGlow, uAmb, uTime;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vW;
  ${GLSL_NOISE}
  void main() {
    vec3 l = normalize(vL);
    float w = fbm3(l * 2.5 + uTime * 0.02) * uWarp;
    float b = sin(l.y * uBands + w * 6.0) * 0.5 + 0.5;
    vec3 col = mix(uA, uB, b);
    col = mix(col, uC, smoothstep(0.62, 0.82, fbm3(l * 4.0 + 3.0 + w)) * 0.7);
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float lit = clamp(dot(N, uSun) * 0.9 + 0.1, 0.0, 1.0);
    col *= uAmb + (1.0 - uAmb) * lit;
    col += uGlowCol * pow(1.0 - max(dot(N, V), 0.0), 2.6) * uGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// the fried egg's white: an irregular blob with a crisp brown edge, lying flat
const eggWhiteFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vL;
  ${GLSL_NOISE}
  void main() {
    float r = length(vL.xy) / 22.0;
    float a = atan(vL.y, vL.x);
    float edge = 0.78 + 0.2 * fbm3(vec3(cos(a) * 1.6, sin(a) * 1.6, 3.0)) + 0.05 * sin(a * 7.0);
    float k = r / edge;
    float alpha = smoothstep(1.0, 0.94, k);
    vec3 white = vec3(0.98, 0.96, 0.9) * (0.88 + 0.12 * fbm3(vec3(vL.xy * 0.18, uTime * 0.03)));
    vec3 crisp = vec3(0.8, 0.5, 0.18);
    vec3 col = mix(white, crisp, smoothstep(0.84, 1.0, k));
    col *= 0.7 + 0.3 * (1.0 - r);
    gl_FragColor = vec4(col, alpha);
  }
`;

const narutoFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vL;
  ${GLSL_NOISE}
  void main() {
    float r = length(vL.xy) / 17.0;
    float a = atan(vL.y, vL.x);
    float sp = a - r * 13.0 + uTime * 0.35;
    float arm = smoothstep(0.1, 0.55, sin(sp) * 0.5 + 0.5);
    vec3 pink = vec3(1.0, 0.38, 0.58);
    vec3 white = vec3(1.0, 0.95, 0.92);
    vec3 col = mix(white, pink, arm);
    col = mix(col, pink, smoothstep(0.84, 0.92, r));
    float alpha = smoothstep(1.0, 0.94, r) * (0.9 - 0.25 * r);
    col += vec3(0.4, 0.2, 0.3) * fbm(vL.xy * 0.5) * 0.25;
    gl_FragColor = vec4(col * (1.0 - 0.25 * r), alpha);
  }
`;

const scallionRingFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vL;
  ${GLSL_NOISE}
  void main() {
    float r = length(vL.xy);
    float a = atan(vL.y, vL.x) / 6.2831853;
    float band = fbm(vec2(r * 1.6, 2.0));
    float alpha = smoothstep(0.3, 0.6, band) * smoothstep(9.0, 9.8, r) * smoothstep(16.0, 15.0, r);
    vec2 v = voroP(vec2(a * 150.0, r * 4.5), 150.0);
    float chunk = smoothstep(0.36, 0.2, v.x);
    vec3 col = mix(vec3(0.4, 0.82, 0.26), vec3(0.96, 0.93, 0.78), step(0.55, v.y) * 0.85);
    col *= 0.45 + 0.55 * chunk;
    gl_FragColor = vec4(col, alpha * (0.22 + 0.78 * chunk));
  }
`;

const cometVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const cometFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float u = vUv.x;
    float pulse = 0.65 + 0.35 * sin(u * 34.0 - uTime * 4.0);
    float a = pow(u, 2.2) * pulse;
    vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.95, 0.75), u);
    gl_FragColor = vec4(col * a * 1.6, a);
  }
`;

// suspended flecks: sesame, chili, pepper and scallion, slowly turning with the broth
const speckVert = /* glsl */ `
  attribute vec4 aSeed; // radius, angle, y, kind
  uniform float uTime, uPixel;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float ang = aSeed.y + uTime * (0.12 + 0.08 * fract(aSeed.w * 7.0)) + aSeed.z * 0.03;
    float r = aSeed.x * (1.0 + 0.08 * sin(uTime * 0.7 + aSeed.z));
    vec3 p = vec3(cos(ang) * r, aSeed.z + sin(uTime * 0.5 + aSeed.y * 3.0) * 0.2, sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float k = fract(aSeed.w);
    vCol = k < 0.3 ? vec3(0.98, 0.92, 0.78) : (k < 0.5 ? vec3(0.85, 0.12, 0.04) : (k < 0.7 ? vec3(0.45, 0.85, 0.25) : vec3(0.1, 0.06, 0.03)));
    float size = k < 0.7 ? 0.05 : 0.025;
    gl_PointSize = size * uPixel / max(-mv.z, 0.2);
    vA = smoothstep(40.0, 10.0, -mv.z) * smoothstep(0.0, 1.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const speckFrag = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.3, length(c)) * vA;
    gl_FragColor = vec4(vCol, a);
  }
`;

// a glassy bead: fat droplets and bubbles, lit by a fresnel rim and a hot highlight
const dropVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const dropFrag = /* glsl */ `
  uniform vec3 uTint;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float ndv = max(dot(N, V), 0.0);
    float f = pow(1.0 - ndv, 2.4);
    vec3 L = normalize(vec3(0.4, 0.9, 0.3));
    vec3 H = normalize(L + V);
    float sp = pow(max(dot(N, H), 0.0), 70.0);
    vec3 L2 = normalize(vec3(-0.6, 0.2, -0.7));
    float sp2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 40.0) * 0.5;
    vec3 col = uTint * (0.2 + 0.6 * f) + vec3(1.0, 0.95, 0.8) * (sp + sp2) * 1.4 + vec3(1.0, 0.75, 0.4) * f * 0.5;
    // the lens: a brighter, inverted glimpse of the broth through the middle
    col += uTint * (1.0 - f) * 0.25 * (0.6 + 0.4 * sin(vW.y * 3.0 + uTime));
    float a = 0.22 + 0.65 * f + sp;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

// an atmosphere: a soft rim of light around a world
const haloVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const haloFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 V = normalize(cameraPosition - vW);
    float f = pow(1.0 - max(dot(normalize(vN), V), 0.0), uPower);
    gl_FragColor = vec4(uColor * f * 1.6, f);
  }
`;

// the thruster of the soy-sauce rocket
const thrustFrag = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${GLSL_NOISE}
  void main() {
    float y = vUv.y;
    float n = fbm(vec2(vUv.x * 4.0, y * 3.0 - uTime * 6.0));
    float a = (1.0 - y) * smoothstep(0.0, 0.2, y) * (0.6 + 0.6 * n);
    vec3 col = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.95, 0.7), pow(1.0 - y, 2.0));
    gl_FragColor = vec4(col * a * 2.0, a);
  }
`;

// ------------------------------------------------------------------ helpers

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starGeometry(outer, inner, depth, n = 8) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? inner : outer;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: outer * 0.04, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function halo(radius, color, power = 3.0, scaleY = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(...color) }, uPower: { value: power } },
    vertexShader: haloVert, fragmentShader: haloFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  m.scale.y = scaleY;
  return m;
}

function planetMat(o) {
  return new THREE.ShaderMaterial({
    vertexShader: planetVert,
    fragmentShader: planetFrag,
    uniforms: {
      uA: { value: new THREE.Color(...o.a) },
      uB: { value: new THREE.Color(...o.b) },
      uC: { value: new THREE.Color(...o.c) },
      uGlowCol: { value: new THREE.Color(...o.glowCol) },
      uSun: { value: SUN },
      uBands: { value: o.bands },
      uWarp: { value: o.warp },
      uGlow: { value: o.glow },
      uAmb: { value: o.amb },
      uTime: { value: 0 },
    },
  });
}

/** A noodle vortex: several curly strands winding around the tunnel axis. */
function noodleVortex(r, mat, yTop, len, turns, strands) {
  const group = new THREE.Group();
  for (let s = 0; s < strands; s++) {
    const phase = (s / strands) * Math.PI * 2 + r() * 0.6;
    const rad = 1.0 + r() * 1.7;
    const wob = 6 + r() * 6;
    const seed = r() * 10;
    const pts = [];
    const N = 90;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const th = phase + u * turns * Math.PI * 2;
      const rr = rad + 0.28 * Math.sin(u * wob * 6 + seed);
      pts.push(new THREE.Vector3(Math.cos(th) * rr, yTop - u * len, Math.sin(th) * rr));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.05 + r() * 0.025, 6, false);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

// ------------------------------------------------------------------ the fall

export class Fall {
  constructor(envMap) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.matU = { uTime: { value: 0 } };
    this.prevY = 0;
    this.speed = 0;
    this.planets = [];
    const r = rng(11);

    // ---- the distant sky: nebula and stars, always centred on the camera
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(520, 48, 32),
      new THREE.ShaderMaterial({ uniforms: this.matU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false }),
    );
    this.sky.renderOrder = 10; // drawn after everything solid, so the pixels the pot and the worlds cover are skipped
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // ---- the broth tunnel, which dissolves into open space
    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(TUNNEL_R, TUNNEL_R, TUNNEL_LEN, 72, 1, true),
      new THREE.ShaderMaterial({ uniforms: this.matU, vertexShader: tunnelVert, fragmentShader: tunnelFrag, side: THREE.BackSide, transparent: true, depthWrite: false }),
    );
    tunnel.position.y = 6 - TUNNEL_LEN / 2;
    this.near = new THREE.Group(); // everything that lives in the tunnel: off once we are far below it
    this.group.add(this.near);
    this.near.add(tunnel);

    // ---- light
    this.light = new THREE.PointLight(0xffd9a8, 10, 22, 2);
    this.group.add(this.light);
    this.group.add(new THREE.AmbientLight(0xffe2c4, 0.3));
    this.sun = new THREE.DirectionalLight(0xfff0dd, 1.5);
    this.sun.position.copy(SUN).multiplyScalar(30);
    this.group.add(this.sun, this.sun.target);

    // ---- speed streaks in open space
    {
      const N = 1700;
      const base = new Float32Array(N * 2 * 3);
      const end = new Float32Array(N * 2);
      const len = new Float32Array(N * 2);
      const bright = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const a = r() * Math.PI * 2;
        const rad = 4.5 + Math.pow(r(), 0.7) * 75;
        const x = Math.cos(a) * rad;
        const z = Math.sin(a) * rad;
        const y = r() * 340;
        const l = 0.5 + r();
        const b = 0.25 + r() * 0.75;
        for (let k = 0; k < 2; k++) {
          const o = i * 2 + k;
          base.set([x, y, z], o * 3);
          end[o] = k;
          len[o] = l;
          bright[o] = b;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
      geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      geo.setAttribute('aLen', new THREE.BufferAttribute(len, 1));
      geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
      this.streakU = { uCamY: { value: 0 }, uStreak: { value: 1 }, uAmt: { value: 0 } };
      const streaks = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
        uniforms: this.streakU, vertexShader: streakVert, fragmentShader: streakFrag,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      streaks.frustumCulled = false;
      this.group.add(streaks);
    }

    // ---- soup: noodle vortices
    const noodleMat = new THREE.MeshPhysicalMaterial({ color: 0xf5d98c, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25, emissive: 0x3a2508, envMap, envMapIntensity: 0.8 });
    this.vortices = [];
    [-6, -30, -55, -80, -102].forEach((y, i) => {
      const v = noodleVortex(r, noodleMat, y, 24, 2.2, 5);
      v.userData.spin = (i % 2 ? 1 : -1) * (0.18 + r() * 0.15);
      this.vortices.push(v);
      this.near.add(v);
    });

    // ---- materials for everything that tumbles
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, envMap, envMapIntensity: 0.6, ...extra });
    const wood = std(0xb8814a);
    const noodle = std(0xf2d58c, { roughness: 0.4 });
    const green = std(0x86d65e, { emissive: 0x1a3a10 });
    const mushroom = std(0x6b3f22, { roughness: 0.7 });
    const anise = std(0x7a2f14, { roughness: 0.55, emissive: 0x4a1a08, emissiveIntensity: 0.8 });
    const tofu = std(0xf6efd9, { roughness: 0.8 });
    const corn = std(0xffd23d, { roughness: 0.35, emissive: 0x4a3200 });
    const chili = std(0xd9260b, { roughness: 0.5, emissive: 0x3a0800 });
    const bead = std(0xe9902c, { roughness: 0.4, emissive: 0x6a3205, envMapIntensity: 1 });
    const bubble = new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color(1.0, 0.72, 0.3) }, uTime: this.matU.uTime }, vertexShader: dropVert, fragmentShader: dropFrag, transparent: true, depthWrite: false });
    const fat = new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color(1.0, 0.85, 0.45) }, uTime: this.matU.uTime }, vertexShader: dropVert, fragmentShader: dropFrag, transparent: true, depthWrite: false });
    const nori = std(0x1d3a20, { roughness: 0.4, side: THREE.DoubleSide, emissive: 0x061008 });
    const sprout = std(0xf3ead8, { roughness: 0.5 });
    const bokchoy = std(0x5fa23a, { roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0a2008 });
    const fishball = std(0xf6f1e6, { roughness: 0.55 });
    const chashuTex = chashuTexture();
    const chashuMats = [std(0x6a3a20, { roughness: 0.6 }), std(0xffffff, { map: chashuTex, roughness: 0.35 }), std(0xc4825f)];
    const sproutGeo = (() => {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(new THREE.Vector3(Math.sin(u * 2.4) * 0.12, u * 0.55, Math.cos(u * 1.7) * 0.05)); }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.016, 5, false);
    })();
    const leafGeo = new THREE.SphereGeometry(0.4, 16, 8);
    leafGeo.scale(1, 0.12, 0.55);
    const glow = new THREE.MeshBasicMaterial({ color: 0xbfefff });

    const dome = new THREE.SphereGeometry(0.38, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const kinds = [
      { geo: new THREE.TorusGeometry(0.34, 0.05, 8, 24), mat: noodle, n: 30, y: [-4, -115], rad: [0.8, 3.0], s: [0.7, 1.6] },
      { geo: new THREE.TorusGeometry(0.09, 0.03, 6, 14), mat: green, n: 70, y: [-4, -115], rad: [0.8, 3.1], s: [0.7, 1.6] },
      { geo: dome, mat: mushroom, n: 16, y: [-8, -115], rad: [0.9, 3.0], s: [0.8, 1.5], double: true },
      { geo: starGeometry(0.34, 0.16, 0.07), mat: anise, n: 46, y: [-14, -150], rad: [0.9, 3.1], s: [0.8, 1.6] },
      { geo: new THREE.BoxGeometry(0.4, 0.4, 0.4), mat: tofu, n: 18, y: [-6, -110], rad: [0.9, 3.0], s: [0.7, 1.4] },
      { geo: new THREE.SphereGeometry(0.06, 8, 6), mat: corn, n: 90, y: [-4, -115], rad: [0.7, 3.1], s: [0.8, 1.6] },
      { geo: new THREE.TetrahedronGeometry(0.07), mat: chili, n: 90, y: [-4, -115], rad: [0.7, 3.1], s: [0.8, 1.8] },
      { geo: new THREE.CylinderGeometry(0.03, 0.02, 2.2, 10), mat: wood, n: 14, y: [-6, -115], rad: [0.8, 3.0], s: [0.7, 1.6] },
      { geo: new THREE.SphereGeometry(0.14, 14, 12), mat: bead, n: 60, y: [-4, -115], rad: [0.7, 3.0], s: [0.7, 1.6] },
      { geo: new THREE.SphereGeometry(0.12, 14, 12), mat: bubble, n: 170, y: [-3, -125], rad: [0.4, 3.2], s: [0.5, 2.2], rise: true },
      { geo: new THREE.SphereGeometry(0.2, 16, 14), mat: fat, n: 50, y: [-3, -120], rad: [0.6, 3.1], s: [0.6, 1.8] },
      { geo: new THREE.BoxGeometry(0.7, 0.55, 0.012), mat: nori, n: 22, y: [-6, -112], rad: [0.9, 3.0], s: [0.8, 1.6] },
      { geo: sproutGeo, mat: sprout, n: 120, y: [-4, -115], rad: [0.6, 3.1], s: [0.7, 1.4] },
      { geo: leafGeo, mat: bokchoy, n: 26, y: [-6, -112], rad: [0.9, 3.0], s: [0.8, 1.5] },
      { geo: new THREE.SphereGeometry(0.2, 14, 12), mat: fishball, n: 20, y: [-6, -112], rad: [0.9, 3.0], s: [0.8, 1.4] },
      { geo: new THREE.CylinderGeometry(0.42, 0.4, 0.07, 28), mat: chashuMats, n: 12, y: [-10, -112], rad: [0.9, 3.0], s: [0.9, 1.6] },
      // out in space: the same ingredients, drifting loose
      { geo: starGeometry(0.34, 0.16, 0.07), mat: anise, n: 30, y: [-100, -380], rad: [5, 45], s: [4, 11] },
      { geo: new THREE.BoxGeometry(0.4, 0.4, 0.4), mat: tofu, n: 150, y: [-150, -375], rad: [10, 55], s: [1.0, 7.0] },
      { geo: dome, mat: mushroom, n: 10, y: [-110, -330], rad: [14, 50], s: [4, 9], double: true },
      { geo: new THREE.IcosahedronGeometry(0.22, 0), mat: glow, n: 90, y: [-90, -400], rad: [4, 50], s: [0.7, 1.6] },
    ];
    this.items = [];
    const dummy = new THREE.Object3D();
    for (const k of kinds) {
      if (k.double && !Array.isArray(k.mat)) {
        k.mat = k.mat.clone();
        k.mat.side = THREE.DoubleSide;
      }
      const mesh = new THREE.InstancedMesh(k.geo, k.mat, k.n);
      mesh.frustumCulled = false;
      const data = [];
      for (let i = 0; i < k.n; i++) {
        const ang = r() * Math.PI * 2;
        const rad = k.rad[0] + r() * (k.rad[1] - k.rad[0]);
        data.push({
          x: Math.cos(ang) * rad, y: k.y[0] + r() * (k.y[1] - k.y[0]), z: Math.sin(ang) * rad,
          rx: r() * 6, ry: r() * 6, rz: r() * 6,
          sx: (r() - 0.5) * 2.0, sy: (r() - 0.5) * 2.0, sz: (r() - 0.5) * 2.0,
          s: k.s[0] + r() * (k.s[1] - k.s[0]),
          vy: k.rise ? 0.6 + r() * 1.4 : 0,
        });
      }
      this.items.push({ mesh, data, dummy });
      (k.y[0] > -130 ? this.near : this.group).add(mesh);
    }

    // ---- thousands of suspended flecks, turning slowly with the broth
    {
      const N = 3200;
      const seed = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) seed.set([0.3 + Math.pow(r(), 0.6) * 3.1, r() * Math.PI * 2, -1 - r() * 118, r() * 0.999 + Math.floor(r() * 5)], i * 4);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      this.speckU = { uTime: { value: 0 }, uPixel: { value: 600 } };
      const specks = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: this.speckU, vertexShader: speckVert, fragmentShader: speckFrag, transparent: true, depthWrite: false }));
      specks.frustumCulled = false;
      this.near.add(specks);
    }

    // ---- soup that is too detailed to instance: narutomaki and halved eggs
    this.solos = [];
    const narutoTex = narutoTexture();
    const narutoSide = std(0xfbe9e0, { roughness: 0.5 });
    const narutoTop = new THREE.MeshStandardMaterial({ map: narutoTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: narutoTex, emissiveIntensity: 0.18 });
    const narutoGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.14, 40);
    const eggWhite = std(0xfdf8ee, { roughness: 0.4, side: THREE.DoubleSide });
    const yolk = std(0xffa319, { roughness: 0.4, emissive: 0xc05a00, emissiveIntensity: 0.55 });
    const eggDome = new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const eggCut = new THREE.CircleGeometry(0.42, 28);
    eggCut.rotateX(-Math.PI / 2);
    const yolkGeo = new THREE.SphereGeometry(0.21, 18, 12);
    const solo = (obj, y0, y1, r0, r1, sc) => {
      const ang = r() * Math.PI * 2;
      const rad = r0 + r() * (r1 - r0);
      this.solos.push({
        obj, x: Math.cos(ang) * rad, y: y0 + r() * (y1 - y0), z: Math.sin(ang) * rad,
        rx: r() * 6, ry: r() * 6, rz: r() * 6,
        sx: (r() - 0.5) * 1.4, sy: (r() - 0.5) * 1.4, sz: (r() - 0.5) * 1.4,
        s: sc[0] + r() * (sc[1] - sc[0]),
      });
      this.near.add(obj);
    };
    for (let i = 0; i < 9; i++) {
      solo(new THREE.Mesh(narutoGeo, [narutoSide, narutoTop, narutoTop]), -8, -112, 0.9, 3.0, [1.0, 1.9]);
    }
    for (let i = 0; i < 9; i++) {
      const egg = new THREE.Group();
      egg.add(new THREE.Mesh(eggDome, eggWhite));
      egg.add(new THREE.Mesh(eggCut, eggWhite));
      const y = new THREE.Mesh(yolkGeo, yolk);
      y.scale.y = 0.6;
      egg.add(y);
      solo(egg, -8, -112, 0.9, 3.0, [1.0, 1.9]);
    }

    // ---- the worlds the ingredients have become
    this.buildPlanets(r, envMap);
  }

  buildPlanets(r, envMap) {
    const g = this.group;
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, envMap, envMapIntensity: 0.6, ...extra });

    // the fried-egg moon: a flat egg white with a glowing yolk, seen from above as we fall
    const egg = new THREE.Group();
    const white = new THREE.Mesh(
      new THREE.CircleGeometry(22, 128),
      new THREE.ShaderMaterial({ uniforms: this.matU, vertexShader: planetVert, fragmentShader: eggWhiteFrag, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    white.rotation.x = -Math.PI / 2;
    egg.add(white);
    const yolkMat = planetMat({ a: [1, 0.6, 0.06], b: [1, 0.8, 0.24], c: [0.95, 0.35, 0.02], glowCol: [1, 0.72, 0.2], bands: 2, warp: 0.8, glow: 1.5, amb: 0.6 });
    const yolk = new THREE.Mesh(new THREE.SphereGeometry(8, 64, 40), yolkMat);
    yolk.scale.y = 0.62;
    yolk.position.y = 1;
    egg.add(yolk);
    egg.position.set(26, -150, -14);
    egg.rotation.set(0.28, 0, -0.18);
    const yolkHalo = halo(8.6, [1.0, 0.7, 0.25], 3.0, 0.62);
    yolkHalo.position.y = 1;
    egg.add(yolkHalo);
    g.add(egg);
    this.planets.push({ mat: yolkMat, spin: yolk, rate: 0.05 });

    // the naruto galaxy
    const nm = new THREE.ShaderMaterial({ uniforms: this.matU, vertexShader: planetVert, fragmentShader: narutoFrag, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const naruto = new THREE.Mesh(new THREE.CircleGeometry(17, 128), nm);
    naruto.position.set(-32, -205, 8);
    naruto.rotation.set(-1.0, 0.2, 0.3);
    g.add(naruto);

    // the ringed broth giant, its ring made of scallion
    const giantMat = planetMat({ a: [0.42, 0.14, 0.05], b: [0.97, 0.52, 0.12], c: [0.7, 0.1, 0.03], glowCol: [1, 0.6, 0.3], bands: 9, warp: 1.0, glow: 0.9, amb: 0.3 });
    const giant = new THREE.Mesh(new THREE.SphereGeometry(6.5, 64, 40), giantMat);
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(9, 16, 160, 1),
      new THREE.ShaderMaterial({ uniforms: this.matU, vertexShader: planetVert, fragmentShader: scallionRingFrag, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    const giantRig = new THREE.Group();
    giantRig.add(giant, ringMesh);
    ringMesh.rotation.x = Math.PI / 2;
    giantRig.rotation.set(0.45, 0, 0.35);
    giantRig.position.set(20, -262, 10);
    giantRig.add(halo(7.1, [1.0, 0.55, 0.25], 2.6));
    // a belt of sesame seeds around it, outside the scallion ring
    {
      const N = 700;
      const geo = new THREE.SphereGeometry(1, 8, 6);
      geo.scale(0.16, 0.09, 0.26);
      const belt = new THREE.InstancedMesh(geo, std(0xe8d8b4, { roughness: 0.7, emissive: 0x100c06 }), N);
      const d = new THREE.Object3D();
      for (let i = 0; i < N; i++) {
        const a = r() * Math.PI * 2;
        const rad = 18 + r() * 6 + (r() - 0.5) * 1.5;
        d.position.set(Math.cos(a) * rad, (r() - 0.5) * 1.2, Math.sin(a) * rad);
        d.rotation.set(r() * 6, r() * 6, r() * 6);
        d.scale.setScalar(0.5 + r() * 1.0);
        d.updateMatrix();
        belt.setMatrixAt(i, d.matrix);
      }
      belt.frustumCulled = false;
      giantRig.add(belt);
    }
    g.add(giantRig);
    this.planets.push({ mat: giantMat, spin: giant, rate: 0.03 });
    this.giantRig = giantRig;

    // a dumpling moon: pleated, pale, with a soft halo
    const dumplingMat = planetMat({ a: [0.96, 0.88, 0.74], b: [0.8, 0.68, 0.52], c: [0.62, 0.45, 0.3], glowCol: [1, 0.85, 0.6], bands: 16, warp: 1.6, glow: 0.7, amb: 0.35 });
    const dumpling = new THREE.Mesh(new THREE.SphereGeometry(6, 64, 40), dumplingMat);
    dumpling.scale.set(1, 0.82, 1);
    dumpling.position.set(-34, -300, 22);
    dumpling.add(halo(6.2, [1, 0.9, 0.7], 3.2));
    g.add(dumpling);
    this.planets.push({ mat: dumplingMat, spin: dumpling, rate: 0.04 });

    // the soy-sauce rocket: a dark glass bottle, a red cap, a label, and a thruster
    const rocket = new THREE.Group();
    const bottleMat = new THREE.MeshPhysicalMaterial({ color: 0x1a0a05, roughness: 0.15, clearcoat: 1, envMap, envMapIntensity: 1.2 });
    rocket.add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 6.5, 28), bottleMat));
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.3, 1.4, 28), bottleMat);
    shoulder.position.y = 3.95;
    rocket.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 20), bottleMat);
    neck.position.y = 5.2;
    rocket.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 20), std(0xc8201a, { roughness: 0.4 }));
    cap.position.y = 6.2;
    rocket.add(cap);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.42, 2.6, 28, 1, true), std(0xf4ead0, { roughness: 0.8, side: THREE.DoubleSide }));
    label.position.y = 0.2;
    rocket.add(label);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.37, 1.43, 0.5, 28, 1, true), std(0xc8201a, { roughness: 0.6, side: THREE.DoubleSide }));
    stripe.position.y = 0.2;
    rocket.add(stripe);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 1.6), std(0xc8201a, { roughness: 0.4 }));
      fin.position.set(Math.cos(i * 2.094) * 1.8, -2.6, Math.sin(i * 2.094) * 1.8);
      fin.rotation.y = -i * 2.094;
      rocket.add(fin);
    }
    this.thrustMat = new THREE.ShaderMaterial({ uniforms: this.matU, vertexShader: cometVert, fragmentShader: thrustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const thrust = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 20, 1, true), this.thrustMat);
    thrust.position.y = -6.6;
    rocket.add(thrust);
    rocket.position.set(30, -200, -22);
    rocket.rotation.set(0.6, 0.3, -0.9);
    g.add(rocket);
    this.rocket = rocket;

    // a giant ladle, adrift
    const ladle = new THREE.Group();
    const steel = std(0xd8dde4, { metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
    const handlePts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 14, 1), new THREE.Vector3(0, 28, -1), new THREE.Vector3(2, 34, -3)];
    ladle.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handlePts), 40, 0.5, 10, false), steel));
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xd8dde4, { metalness: 1, roughness: 0.3, envMapIntensity: 1.2, side: THREE.DoubleSide }));
    bowl.position.set(0, -2, 4);
    ladle.add(bowl);
    ladle.position.set(-36, -168, -26);
    ladle.rotation.set(0.9, 0.4, 1.1);
    g.add(ladle);
    this.ladle = ladle;

    // sheets of nori, sailing
    const noriMat = new THREE.MeshPhysicalMaterial({ color: 0x1b3a22, roughness: 0.35, transparent: true, opacity: 0.88, side: THREE.DoubleSide, sheen: 0.6, sheenColor: new THREE.Color(0x4a7a3a), envMap, envMapIntensity: 0.6 });
    [[-12, -128, 24, 0.4, 0.9], [38, -236, 4, -0.6, 0.2], [-28, -352, -10, 0.3, -0.7]].forEach(([x, y, z, rx, ry]) => {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(16, 11, 8, 6), noriMat);
      sheet.position.set(x, y, z);
      sheet.rotation.set(rx, ry, 0.2);
      g.add(sheet);
    });

    // a yolk sun, far off, with its flare
    {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const gg = c.getContext('2d');
      const grd = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,245,210,1)');
      grd.addColorStop(0.12, 'rgba(255,200,90,0.95)');
      grd.addColorStop(0.3, 'rgba(255,140,40,0.35)');
      grd.addColorStop(1, 'rgba(255,100,20,0)');
      gg.fillStyle = grd;
      gg.fillRect(0, 0, 256, 256);
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sun.scale.set(140, 140, 1);
      sun.position.set(160, -240, -260);
      g.add(sun);
    }

    // the star-anise cruiser
    const aniseMat = new THREE.MeshStandardMaterial({ color: 0x8a3416, roughness: 0.5, metalness: 0.15, emissive: 0x5a1c06, emissiveIntensity: 0.9, envMap, envMapIntensity: 0.8 });
    const cruiser = new THREE.Mesh(starGeometry(8, 3.6, 1.6), aniseMat);
    cruiser.position.set(-15, -312, -9);
    cruiser.rotation.set(1.1, 0.2, 0);
    g.add(cruiser);
    this.cruiser = cruiser;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb04a });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), eyeMat);
    core.position.z = 1.2;
    cruiser.add(core);

    // noodle comets
    const cometMat = new THREE.ShaderMaterial({
      uniforms: this.matU, vertexShader: cometVert, fragmentShader: cometFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const rad = 9 + r() * 30;
      const y0 = -100 - r() * 280;
      const p0 = new THREE.Vector3(Math.cos(a) * rad, y0 + 55, Math.sin(a) * rad);
      const p1 = new THREE.Vector3(Math.cos(a + 0.3) * (rad + 6), y0 + 28, Math.sin(a + 0.3) * (rad + 6));
      const p2 = new THREE.Vector3(Math.cos(a + 0.7) * (rad - 4), y0, Math.sin(a + 0.7) * (rad - 4));
      const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.16 + r() * 0.12, 6, false), cometMat);
      tube.frustumCulled = false;
      g.add(tube);
    }

    // a pair of giant chopsticks, which we fall between
    const stick = new THREE.CylinderGeometry(0.35, 0.7, 130, 14);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xc08040, roughness: 0.5, emissive: 0x2a1204, envMap, envMapIntensity: 0.7 });
    [[9, -228, 3, 0.04, 0.05], [-8, -232, -4, -0.05, 0.03]].forEach(([x, y, z, rz, rx]) => {
      const m = new THREE.Mesh(stick, stickMat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
    });
  }

  /** t: seconds; camY: the camera's height. */
  update(t, camY, dt = 1 / 60) {
    this.matU.uTime.value = t;
    this.sky.position.set(0, camY, 0);

    const v = Math.abs(camY - this.prevY) / Math.max(dt, 1e-3);
    this.prevY = camY;
    this.speed += (v - this.speed) * (1 - Math.exp(-dt * 8));
    this.streakU.uCamY.value = camY;
    this.streakU.uStreak.value = Math.min(0.5 + this.speed * 0.012, 24);
    this.streakU.uAmt.value = THREE.MathUtils.smoothstep(-camY, 70, 130) * (1 - THREE.MathUtils.smoothstep(-camY, 345, 395));

    this.near.visible = camY > -300;
    for (const { mesh, data, dummy } of this.items) {
      if (!this.near.visible && mesh.parent === this.near) continue;
      data.forEach((o, i) => {
        dummy.position.set(o.x, o.y + o.vy * t, o.z);
        dummy.rotation.set(o.rx + t * o.sx, o.ry + t * o.sy, o.rz + t * o.sz);
        dummy.scale.setScalar(o.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const o of this.solos) {
      if (!this.near.visible) break;
      o.obj.position.set(o.x, o.y, o.z);
      o.obj.rotation.set(o.rx + t * o.sx, o.ry + t * o.sy, o.rz + t * o.sz);
      o.obj.scale.setScalar(o.s);
    }
    this.vortices.forEach((vx) => { vx.rotation.y = t * vx.userData.spin; });
    this.speckU.uTime.value = t;
    this.speckU.uPixel.value = 600 * (this.pixelScale ?? 1);
    this.rocket.position.x = 30 + Math.sin(t * 0.3) * 2;
    this.rocket.rotation.z = -0.9 + Math.sin(t * 0.5) * 0.05;
    this.ladle.rotation.y = 0.4 + t * 0.06;
    this.ladle.rotation.x = 0.9 + Math.sin(t * 0.2) * 0.15;
    for (const p of this.planets) {
      p.mat.uniforms.uTime.value = t;
      p.spin.rotation.y = t * p.rate;
    }
    this.cruiser.rotation.z = t * 0.12;
    this.light.position.set(0, camY + 1.5, 0);
    this.sun.position.set(SUN.x * 30, camY + SUN.y * 30, SUN.z * 30);
    this.sun.target.position.set(0, camY, 0);
  }
}
