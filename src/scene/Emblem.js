import * as THREE from 'three';

// The flat logo: your emblem as a textured plane that can flicker, tear and
// split into colour fringes. It is the "2D stage" of the hero.

export const PX = 0.0043; // world units per emblem pixel
const IMG_W = 1746;
const IMG_H = 901;

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uGlitchBody;
  uniform float uAlpha;
  uniform float uHeadAlpha;
  uniform float uBodyAlpha;
  uniform vec3 uTint;
  uniform float uGlitchHead;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // 1 where the pixel belongs to the headset (not the bowl or the chopsticks)
  float headMask(vec2 uv) {
    vec2 px = vec2(uv.x * 1746.0, (1.0 - uv.y) * 901.0);
    float inside = step(545.0, px.x) * step(px.x, 1182.0) * step(150.0, px.y) * step(px.y, 424.0);
    float xline = 1250.0 - (px.y - 330.0) * 1.0526;
    float notChop = px.y < 330.0 ? 1.0 : step(px.x, xline - 42.0);
    return inside * notChop;
  }

  void main() {
    float head = headMask(vUv);
    float uGlitch = mix(uGlitchBody, uGlitchHead, head);
    float t = floor(uTime * 24.0);
    // horizontal tearing: bands of rows shift sideways
    float band = floor(vUv.y * 38.0);
    float bandRnd = hash(band * 1.7 + t * 3.1);
    float tear = step(1.0 - uGlitch * 0.55, bandRnd) * (hash(band + t) - 0.5) * 0.12 * uGlitch;
    // occasional full-image jump
    float jump = step(0.93 - uGlitch * 0.2, hash(t * 0.37)) * (hash(t) - 0.5) * 0.05 * uGlitch;
    vec2 uv = vUv + vec2(tear + jump, 0.0);

    // colour fringing grows with glitch
    float s = 0.004 * (0.3 + uGlitch * 3.0);
    float r = texture2D(uMap, uv + vec2(s, 0.0)).r;
    float g = texture2D(uMap, uv).g;
    float b = texture2D(uMap, uv - vec2(s, 0.0)).b;
    vec3 col = vec3(r, g, b);

    // scanlines + a slow rolling bar
    float scan = 0.92 + 0.08 * sin(vUv.y * 900.0 + uTime * 8.0);
    float roll = smoothstep(0.0, 0.2, fract(vUv.y * 1.0 - uTime * 0.12)) * 0.06;
    col *= scan + roll * 0.0;

    float lum = max(max(col.r, col.g), col.b);
    float flick = 0.96 + 0.04 * sin(uTime * 60.0);

    float a = lum * uAlpha * flick * mix(uBodyAlpha, uHeadAlpha, head);
    // tint the fringes like a CRT
    col = mix(vec3(lum), col, 0.9) * vec3(1.0, 1.0, 1.0);
    gl_FragColor = vec4(col * uTint * a, a);
  }
`;

const tex = new THREE.TextureLoader().load('/emblem.png');
tex.colorSpace = THREE.NoColorSpace;
tex.anisotropy = 8;

export function createEmblemMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uGlitchBody: { value: 0 }, uGlitchHead: { value: 0 }, uAlpha: { value: 1 }, uHeadAlpha: { value: 1 }, uBodyAlpha: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// The headset's part of the image, cut out as its own plane so it can move on
// its own. The UVs stay in full-image space, so the shader's masks still apply.
export const HEAD_CROP = { x0: 545, x1: 1182, y0: 150, y1: 424 };

export function headGeometry() {
  const { x0, x1, y0, y1 } = HEAD_CROP;
  const g = new THREE.PlaneGeometry((x1 - x0) * PX, (y1 - y0) * PX);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / IMG_W, 1 - (y0 + (1 - uv.getY(i)) * (y1 - y0)) / IMG_H);
  }
  return g;
}

/** Where the headset's centre sits in the world, on the logo's plane. */
export const HEAD_POS = {
  x: ((HEAD_CROP.x0 + HEAD_CROP.x1) / 2 - IMG_W / 2) * PX,
  y: (IMG_H / 2 - (HEAD_CROP.y0 + HEAD_CROP.y1) / 2) * PX,
  z: -0.9,
};

/** The bowl and chopsticks: the whole image, with the headset left to its own plane. */
export class Emblem {
  constructor() {
    this.mat = createEmblemMaterial();
    this.mat.uniforms.uHeadAlpha.value = 0;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(IMG_W * PX, IMG_H * PX), this.mat);
    this.mesh.position.set(0, 0, HEAD_POS.z);
  }
  update(t, { glitch, alpha }) {
    const u = this.mat.uniforms;
    u.uTime.value = t;
    u.uGlitchBody.value = glitch;
    u.uBodyAlpha.value = alpha;
    this.mesh.visible = alpha > 0.002;
  }
}
