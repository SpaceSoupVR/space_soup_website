import * as THREE from 'three';
import { hammeredCopperMaps, canvas, toTexture } from '../lib/maps.js';
import { GLSL_NOISE } from '../lib/glsl.js';

// A kitchen ladle, built once at unit scale (the bowl is one unit in radius) and used at two
// sizes: giant in the pot, where it scoops you up, and real over the bowl on the cart, where it
// pours you out. Hammered steel bowl with a rolled rim and a pouring lip, a riveted bracket, a
// long tapered handle with a dark grip and a hook to hang it by.
//
// Local space: the bowl's centre is the origin, it opens up (+Y), the lip is at +Z, and the
// handle rises up and back toward -Z.

const TAU = Math.PI * 2;
let BROTH = null;
/** The broth: amber with swirls of oil, drops of fat, flecks of scallion and chili. */
export function brothTexture() {
  if (BROTH) return BROTH;
  BROTH = toTexture(canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#c9661a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const rr = 8 + Math.random() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, Math.random() < 0.5 ? 'rgba(255,190,80,0.35)' : 'rgba(120,40,10,0.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(255,220,140,${0.3 + Math.random() * 0.5})`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 0, TAU); g.fill();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(120,200,80,0.8)' : 'rgba(200,30,10,0.7)';
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 0, TAU); g.fill();
    }
  }), { srgb: true, repeat: 2 });
  return BROTH;
}

// the broth: a surface that ripples, with glossy highlights, a warm reflection, beads of fat and
// oil, and flecks; the same look at any size (frequencies are relative to the radius)
const brothVert = /* glsl */ `
  uniform float uTime, uRadius;
  varying vec3 vW;
  varying vec2 vP;
  varying float vH;
  float h(vec2 p, float t) {
    float k = 7.0 / uRadius;
    return 0.012 * uRadius * (sin(p.x * k + t * 1.3) * cos(p.y * k * 0.8 - t * 1.0) + 0.6 * sin((p.x + p.y) * k * 2.1 + t * 2.1) + 0.4 * sin(p.x * k * 3.3 - p.y * k * 2.7 + t * 2.7));
  }
  void main() {
    vec3 pos = position;
    pos.y += h(pos.xz, uTime);
    vP = pos.xz;
    vH = pos.y;
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const brothFrag = /* glsl */ `
  uniform float uTime, uRadius, uLight, uFog;
  uniform vec3 uFogColor;
  uniform sampler2D uMap;
  uniform vec3 uKey;
  varying vec3 vW;
  varying vec2 vP;
  varying float vH;
  ${GLSL_NOISE}
  float h(vec2 p, float t) {
    float k = 7.0 / uRadius;
    return 0.012 * uRadius * (sin(p.x * k + t * 1.3) * cos(p.y * k * 0.8 - t * 1.0) + 0.6 * sin((p.x + p.y) * k * 2.1 + t * 2.1) + 0.4 * sin(p.x * k * 3.3 - p.y * k * 2.7 + t * 2.7));
  }
  void main() {
    float r = length(vP) / uRadius;
    if (r > 1.0) discard;
    vec2 q = vP / uRadius; // -1..1 across the surface
    float t = uTime;
    // the normal: the ripples, plus a fine simmer
    float e = 0.01 * uRadius;
    float hx = h(vP + vec2(e, 0.0), t) - h(vP - vec2(e, 0.0), t);
    float hz = h(vP + vec2(0.0, e), t) - h(vP - vec2(0.0, e), t);
    vec2 nq = q * 6.0 + vec2(t * 0.15, -t * 0.1);
    float b0 = fbm(nq);
    vec2 bump = vec2(fbm(nq + vec2(0.05, 0.0)) - b0, fbm(nq + vec2(0.0, 0.05)) - b0);
    vec3 N = normalize(vec3(-hx / (2.0 * e) - bump.x * 1.5, 1.0, -hz / (2.0 * e) - bump.y * 1.5));

    // the colour: the broth map, swirled, darker where it is deeper in the middle of a swell
    vec2 uv = q * 0.5 + 0.5 + vec2(fbm(q * 2.0 + t * 0.03), fbm(q * 2.0 + 9.0 - t * 0.02)) * 0.08;
    vec3 col = texture2D(uMap, uv).rgb;
    col *= 0.85 + 0.3 * smoothstep(-0.012, 0.012, vH / uRadius);

    // beads of fat and oil, round and glossy, drifting
    vec2 bv = voroP(q * 9.0 + vec2(t * 0.04, -t * 0.03), 4000.0);
    float br = 0.12 + 0.2 * bv.y;
    float bead = smoothstep(br, br - 0.08, bv.x) * step(0.45, bv.y);
    col = mix(col, vec3(1.0, 0.86, 0.5), bead * 0.6);
    col = mix(col, vec3(0.45, 0.16, 0.03), smoothstep(br - 0.1, br - 0.03, bv.x) * bead * 0.6);
    // a thin film of oil with a hint of colour
    float oil = smoothstep(0.5, 0.7, fbm(q * 3.0 + 5.0));
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fbm(q * 5.0 + t * 0.05) * 1.3));
    col += film * oil * 0.1;

    // lighting: a warm key, a glossy highlight, a warm reflection at grazing angles, light caught in the ripples
    vec3 V = normalize(cameraPosition - vW);
    vec3 L = normalize(uKey);
    vec3 H = normalize(L + V);
    float diff = 0.55 + 0.5 * max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 160.0) * 1.4 + pow(max(dot(N, H), 0.0), 24.0) * 0.25;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col = col * diff * uLight;
    col = mix(col, vec3(1.0, 0.78, 0.45) * uLight, fres * 0.5);
    col += (spec * (1.0 + oil * 1.2 + bead * 2.0)) * vec3(1.0, 0.92, 0.75) * uLight;
    // a dark meniscus at the very edge
    col *= 1.0 - smoothstep(0.93, 1.0, r) * 0.5;
    col = mix(col, uFogColor, 1.0 - exp(-length(cameraPosition - vW) * uFog));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** The broth surface: a disc of `radius` (local units), rippling. Update uTime each frame. */
export function brothSurface(radius, { light = 1.0, key = [0.35, 0.8, 0.5], segs = 56 } = {}) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRadius: { value: radius }, uLight: { value: light }, uMap: { value: brothTexture() }, uKey: { value: new THREE.Vector3(...key) }, uFog: { value: 0 }, uFogColor: { value: new THREE.Color(0xc9a070) } },
    vertexShader: brothVert, fragmentShader: brothFrag,
  });
  const m = new THREE.Mesh(geo, mat);
  m.userData.broth = mat;
  return m;
}

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `soup`: the ladle has scooped broth, noodles, an egg and scallion; the same at any scale. */
export function buildLadle(envMap, { soup = false } = {}) {
  const g = new THREE.Group();
  const maps = hammeredCopperMaps(512, 500);
  for (const t of [maps.normalMap, maps.roughnessMap]) t.repeat.set(4, 2);
  const steel = new THREE.MeshStandardMaterial({
    color: 0xa8aeb6, metalness: 1, roughness: 1, roughnessMap: maps.roughnessMap, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    envMap, envMapIntensity: 0.7, side: THREE.DoubleSide,
  });
  const steelPlain = new THREE.MeshStandardMaterial({ color: 0xb4bac2, metalness: 1, roughness: 0.3, envMap, envMapIntensity: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.6, metalness: 0.2 });

  // the bowl: a hemisphere, a touch deeper than half, with a rolled rim
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), steel);
  bowl.scale.set(1, 1.08, 1);
  g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.045, 12, 96), steelPlain);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  // the pouring lip: the rim flares out and up a little at the front
  const lip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), steelPlain);
  lip.scale.set(1.2, 0.35, 0.7);
  lip.position.set(0, 0.02, 0.98);
  lip.rotation.x = 0.5;
  g.add(lip);
  // the bracket: a curved plate down the back of the bowl, riveted on
  const bracket = new THREE.Mesh(new THREE.SphereGeometry(1.03, 32, 16, Math.PI * 0.42, Math.PI * 0.16, Math.PI * 0.55, Math.PI * 0.3), steelPlain);
  g.add(bracket);
  for (const y of [-0.2, -0.5]) {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), steelPlain);
    rivet.position.set(0, y, -Math.sqrt(Math.max(0, 1.06 - y * y)));
    g.add(rivet);
  }
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 16), steelPlain);
  boss.position.set(0, 0.2, -0.95);
  boss.rotation.x = -0.6;
  g.add(boss);
  // the handle: a long, slightly tapered bar rising up and back, a dark grip, a hook at the end
  const dir = new THREE.Vector3(0, 0.8, -0.6).normalize();
  const L = 15;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, L, 16), steelPlain);
  handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  handle.position.copy(dir).multiplyScalar(L / 2).add(new THREE.Vector3(0, 0.25, -0.95));
  g.add(handle);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 16), dark);
  grip.quaternion.copy(handle.quaternion);
  grip.position.copy(dir).multiplyScalar(L - 2.2).add(new THREE.Vector3(0, 0.25, -0.95));
  g.add(grip);
  for (const k of [L - 3.9, L - 0.5]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 16), steelPlain);
    collar.quaternion.copy(handle.quaternion);
    collar.position.copy(dir).multiplyScalar(k).add(new THREE.Vector3(0, 0.25, -0.95));
    g.add(collar);
  }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 10, 24, Math.PI * 1.5), steelPlain);
  hook.position.copy(dir).multiplyScalar(L + 0.1).add(new THREE.Vector3(0, 0.25, -0.95));
  hook.quaternion.copy(handle.quaternion);
  hook.rotateX(Math.PI / 2);
  hook.rotateZ(0.6);
  g.add(hook);
  // a little scorch and wear low on the bowl's outside
  const wear = new THREE.Mesh(new THREE.SphereGeometry(1.004, 48, 24, 0, Math.PI * 2, Math.PI * 0.78, Math.PI * 0.22), new THREE.MeshStandardMaterial({ color: 0x4a4038, metalness: 0.8, roughness: 0.7, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  wear.scale.copy(bowl.scale);
  g.add(wear);
  if (soup) {
    const soupG = new THREE.Group();
    g.add(soupG);
    g.userData.soup = soupG;
    const r = rng(17);
    const broth = brothSurface(0.94);
    broth.position.y = -0.12;
    soupG.add(broth);
    g.userData.brothMat = broth.userData.broth;
    const noodleMat = new THREE.MeshPhysicalMaterial({ color: 0xf3d68d, roughness: 0.35, clearcoat: 0.7, envMap, envMapIntensity: 0.8, emissive: 0x4a2d08, emissiveIntensity: 0.4 });
    for (let i = 0; i < 6; i++) {
      const pts = [];
      let a = r() * TAU;
      let x = (r() - 0.5) * 0.8;
      let z = (r() - 0.5) * 0.8;
      for (let k = 0; k <= 12; k++) {
        pts.push(new THREE.Vector3(x, -0.12 + 0.015 * Math.sin(k * 0.9 + i), z));
        a += (r() - 0.5) * 1.2;
        if (Math.hypot(x, z) > 0.62) a = Math.atan2(-z, -x) + (r() - 0.5) * 0.8;
        x += Math.cos(a) * 0.09;
        z += Math.sin(a) * 0.09;
      }
      soupG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.022, 6, false), noodleMat));
    }
    const egg = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 12), new THREE.MeshStandardMaterial({ color: 0xfdf8ee, roughness: 0.3 }));
    white.scale.set(1, 0.3, 1.25);
    egg.add(white);
    const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 10), new THREE.MeshStandardMaterial({ color: 0xffa319, roughness: 0.25, emissive: 0xc05a00, emissiveIntensity: 0.5 }));
    yolk.scale.y = 0.7;
    yolk.position.y = 0.015;
    egg.add(yolk);
    egg.position.set(0.42, -0.12, -0.3);
    egg.rotation.y = 0.6;
    soupG.add(egg);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x9be36b, emissive: 0x1f5a12, emissiveIntensity: 0.5 });
    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 14), ringMat);
      ring.rotation.x = Math.PI / 2;
      const a = r() * TAU;
      const d = 0.15 + r() * 0.6;
      ring.position.set(Math.cos(a) * d, -0.11, Math.sin(a) * d);
      soupG.add(ring);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
