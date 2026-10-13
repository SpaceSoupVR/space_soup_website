import * as THREE from 'three';
import { GLSL_NOISE } from '../lib/glsl.js';
import { narutoTexture, chashuTexture } from '../lib/foodTex.js';
import { hammeredCopperMaps } from '../lib/maps.js';
import { buildLadle } from './Ladle.js';
import { ramp, lerp, smooth, track } from '../lib/keys.js';
import { Steam } from '../lib/steam.js';

// Where the fall ends: a colossal brass stockpot floating in space, full of simmering
// ramen broth. We hover just above the soup among
// noodle nests, eggs, chashu, naruto, nori and scallions while bubbles rise and pop.
// Then a giant ladle comes down from above, plunges into the broth ahead (waves roll out),
// sweeps under us and scoops us up: we ride up out of the bowl in the ladle with the soup,
// until it tips and the broth pours over the camera.
//
// Local space: the bowl opens upward (+Y); the broth sits at y = LAKE_Y.
// The ladle plunges in at BOIL_C (x, z).

const TAU = Math.PI * 2;
const BOWL_R = 40; // the pot's radius
const BOWL_CY = 36; // height of the rim
const LAKE_Y = 0.12;
const LAKE_R = BOWL_R - 0.3;
export const BOIL_C = new THREE.Vector2(0, -19);

/** The broth's surface height; the same function runs in the shader, so things ride the waves. */
let SWIRL = 0; // the whirlpool's strength, set each frame
function waveH(x, z, t, boil) {
  let h = 0.1 * Math.sin(x * 0.8 + t * 1.2) * Math.cos(z * 0.65 - t * 1.0)
    + 0.07 * Math.sin((x + z) * 1.6 + t * 2.0)
    + 0.05 * Math.sin(x * 2.9 - z * 2.3 + t * 3.1);
  if (SWIRL > 0) {
    const rr = Math.sqrt(x * x + z * z);
    h -= SWIRL * (3.2 * Math.exp(-rr * rr / 90) + 0.5 * Math.sin(Math.atan2(z, x) * 3 + rr * 0.6 - t * 2.5) * Math.exp(-rr * 0.08));
  }
  if (boil > 0) {
    const dx = x - BOIL_C.x;
    const dz = z - BOIL_C.y;
    const d = Math.sqrt(dx * dx + dz * dz);
    h += boil * (1.6 * Math.sin(d * 0.8 - t * 5) * Math.exp(-d * 0.07) + 0.5 * Math.sin(d * 2.0 - t * 9) * Math.exp(-d * 0.14));
  }
  return h;
}

// the ladle over u: hanging above, plunging in ahead, sweeping under us, lifting us out, tipping
const LADLE = {
  y: track([[0, 78], [0.4, -6.5, 'in'], [0.68, -6.4], [0.82, -5.6], [0.94, 6, 'in'], [1.0, 20, 'in']]),
  z: track([[0, -28], [0.4, -19, 'smooth'], [0.74, -2.5, 'inOut'], [1.0, -1.5]]),
  tilt: track([[0, 0.3], [0.44, 0.05], [1.0, 0.0]]),
  // the camera: looks up at it coming, down at the splash, then down into the soup it has scooped as it lifts
  pitch: track([[0, 0], [0.13, 0.6, 'inOut'], [0.35, 0.15], [0.47, -0.2], [0.74, -0.3], [0.92, -1.35, 'inOut'], [1.0, -1.35]]),
  yaw: track([[0, 0], [1, 0]]),
  roll: track([[0, 0], [1, 0]]),
  fov: track([[0, 0], [1, 0]]),
  // how high we ride above the ladle's centre: on the soup, then settling down into it as it lifts (unit: the ladle's radius is 10)
  ride: track([[0, 8.8], [0.74, 8.8], [0.94, 4.5, 'inOut'], [1.0, 4.5]]),
};

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ textures

function steamTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ the broth

const WAVE_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uBoil;
  uniform float uSwirl;
  uniform vec2 uBoilC;
  float waveH(vec2 p) {
    float t = uTime;
    float h = 0.1 * sin(p.x * 0.8 + t * 1.2) * cos(p.y * 0.65 - t * 1.0)
      + 0.07 * sin((p.x + p.y) * 1.6 + t * 2.0)
      + 0.05 * sin(p.x * 2.9 - p.y * 2.3 + t * 3.1);
    float rr = length(p);
    h -= uSwirl * (3.2 * exp(-rr * rr / 90.0) + 0.5 * sin(atan(p.y, p.x) * 3.0 + rr * 0.6 - t * 2.5) * exp(-rr * 0.08));
    vec2 dv = p - uBoilC;
    float d = length(dv);
    h += uBoil * (1.6 * sin(d * 0.8 - t * 5.0) * exp(-d * 0.07) + 0.5 * sin(d * 2.0 - t * 9.0) * exp(-d * 0.14));
    return h;
  }
`;

const lakeVert = /* glsl */ `
  ${WAVE_GLSL}
  varying vec3 vW;
  varying vec2 vP;
  void main() {
    vec3 pos = position;
    pos.y += waveH(pos.xz);
    vP = pos.xz;
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const lakeFrag = /* glsl */ `
  ${WAVE_GLSL}
  uniform float uFog;
  uniform vec3 uFogColor;
  varying vec3 vW;
  varying vec2 vP;
  ${GLSL_NOISE}
  float fbmL(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  float fbmS(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    float r = length(vP);
    if (r > ${LAKE_R.toFixed(2)}) discard;
    float t = uTime;
    vec2 p = vP;
    // the whirlpool: everything on the surface is wound round the centre, faster the nearer it is
    float rr0 = length(p);
    float wind = uSwirl * (2.6 * exp(-rr0 * 0.05) + t * 0.35 * exp(-rr0 * 0.06));
    float cw = cos(wind), sw = sin(wind);
    p = vec2(p.x * cw - p.y * sw, p.x * sw + p.y * cw);

    // the surface normal: the big waves, a fine restless simmer, and rings spreading from popped bubbles
    float e = 0.12;
    float hx = waveH(vP + vec2(e, 0.0)) - waveH(vP - vec2(e, 0.0));
    float hz = waveH(vP + vec2(0.0, e)) - waveH(vP - vec2(0.0, e));
    vec3 N = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
    vec2 q = p * 2.4 + vec2(t * 0.18, -t * 0.12);
    float b0 = fbmL(q);
    vec3 bump = vec3(-(fbmL(q + vec2(0.06, 0.0)) - b0), 0.0, -(fbmL(q + vec2(0.0, 0.06)) - b0));
    N = normalize(N + bump * (2.2 + uBoil * 3.0));
    vec2 rv = voroP(p * 0.45 + 50.0, 4000.0);
    float phase = fract(t * 0.35 + rv.y * 9.0);
    float ringR = phase * 1.1;
    float ring = smoothstep(0.08, 0.0, abs(rv.x - ringR)) * (1.0 - phase) * step(0.4, rv.y);

    // the colour of the broth: currents of amber, gold and deep brown, with chili oil
    float flow = fbmL(p * 0.22 + t * 0.02);
    float n = fbmL(p * 0.35 + flow * 2.4 + vec2(t * 0.03, 0.0));
    vec3 deep = vec3(0.3, 0.085, 0.015);
    vec3 amber = vec3(0.95, 0.5, 0.1);
    vec3 gold = vec3(1.0, 0.8, 0.38);
    vec3 col = mix(deep, amber, smoothstep(0.2, 0.85, n));
    col = mix(col, gold, smoothstep(0.62, 0.95, n) * 0.55);
    float chili = smoothstep(0.58, 0.8, fbmL(p * 0.55 + flow * 3.0 + 3.0));
    col = mix(col, vec3(0.8, 0.1, 0.02), chili * 0.55);

    // what lies under the surface: pale strands of noodle and the blurred shapes of eggs and meat, seen through the broth
    vec2 wq = p * 0.9 + vec2(fbmL(p * 0.4 + 7.0), fbmL(p * 0.4 + 19.0)) * 2.5 + t * 0.03;
    float strand = smoothstep(0.08, 0.0, abs(fract(wq.x * 1.7 + sin(wq.y * 2.3) * 0.4) - 0.5) - 0.38);
    float strand2 = smoothstep(0.08, 0.0, abs(fract(wq.y * 1.4 + sin(wq.x * 1.9) * 0.5) - 0.5) - 0.4);
    float under = max(strand, strand2) * smoothstep(0.35, 0.6, fbmL(p * 0.6 + 33.0));
    col = mix(col, vec3(0.95, 0.8, 0.45), under * 0.28);
    vec2 ub = voroP(p * 0.3 + 100.0, 4000.0);
    float blob = smoothstep(0.42, 0.18, ub.x) * step(0.55, ub.y);
    col = mix(col, mix(vec3(0.95, 0.88, 0.7), vec3(0.75, 0.45, 0.3), step(0.8, ub.y)), blob * 0.35);
    // depth: it is darker where it is deeper, lighter over the things beneath
    col *= 0.85 + 0.3 * under + 0.25 * blob;

    // lighting: a warm key and a cool fill, glossy highlights, and the world reflected at grazing angles
    vec3 V = normalize(cameraPosition - vW);
    vec3 L = normalize(vec3(0.35, 0.8, 0.5));
    vec3 L2 = normalize(vec3(-0.6, 0.5, -0.4));
    vec3 H = normalize(L + V);
    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 140.0) * 1.3 + pow(max(dot(N, H), 0.0), 18.0) * 0.18;
    float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 90.0) * 0.5;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5);
    col = col * (0.5 + 0.55 * diff) + vec3(0.5, 0.18, 0.04) * 0.25;

    // what the surface reflects: nebula above, the white-and-blue porcelain all round
    vec3 R = reflect(-V, N);
    float ra = atan(R.z, R.x);
    vec3 porcelain = mix(vec3(0.85, 0.62, 0.3), vec3(1.0, 0.85, 0.5), smoothstep(0.3, 0.7, sin(ra * 18.0) * 0.5 + 0.5) * 0.6);
    vec3 nebula = mix(vec3(0.1, 0.05, 0.2), vec3(0.45, 0.2, 0.6), smoothstep(0.2, 0.9, R.y)) + vec3(0.1, 0.35, 0.45) * fbmS(R.xz * 3.0 + 5.0) * 0.6;
    vec3 refl = mix(porcelain, nebula, smoothstep(0.08, 0.3, R.y));
    col = mix(col, refl, fres * 0.65);

    // oil slicks: big soft patches, glossier, with a thin-film colour
    float oil = smoothstep(0.55, 0.72, fbmL(p * 0.3 + 7.0));
    vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fbmL(p * 0.8 + t * 0.05) * 1.4));
    col += film * oil * 0.22;
    spec *= 1.0 + oil * 1.6;

    // foam gathers where it is boiling hardest, and against the porcelain
    float boilD = length(p - uBoilC);
    float foam = smoothstep(0.64, 0.8, fbmS(p * 1.9 - t * 0.08)) * (0.22 + uBoil * 0.9);
    foam += uBoil * exp(-boilD * boilD / 70.0) * (0.45 + 0.55 * fbmS(p * 3.0 + t * 0.4));
    foam += smoothstep(${(LAKE_R - 2.4).toFixed(1)}, ${LAKE_R.toFixed(1)}, r) * 0.7;
    foam += ring * 0.5;
    float spiral = sin(atan(vP.y, vP.x) * 4.0 + rr0 * 0.9 - t * 3.0);
    foam += uSwirl * smoothstep(0.2, 0.9, spiral) * exp(-rr0 * 0.07) * 0.9;
    col = mix(col, vec3(1.0, 0.93, 0.82), clamp(foam, 0.0, 0.85) * 0.6);

    // flecks of scallion, sesame and chili flake, scattered at random
    float fl = smoothstep(0.79, 0.83, fbmS(p * 7.0 + 4.0));
    float kind = fbmS(p * 2.1 + 20.0);
    vec3 fc = kind < 0.42 ? vec3(0.42, 0.85, 0.24) : (kind < 0.55 ? vec3(0.97, 0.91, 0.76) : vec3(0.75, 0.1, 0.04));
    col = mix(col, fc, fl * 0.8);

    col += (spec + spec2) * vec3(1.0, 0.88, 0.65) * 1.1 + fres * vec3(0.5, 0.42, 0.7) * 0.2 + ring * vec3(1.0, 0.9, 0.7) * 0.3;
    // the steam: the broth fades into the haze with distance
    col = mix(col * 0.85, uFogColor, 1.0 - exp(-length(cameraPosition - vW) * uFog));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ------------------------------------------------------------------ noodles

function noodleNest(r, mat, radius, strands) {
  const group = new THREE.Group();
  for (let s = 0; s < strands; s++) {
    const a0 = r() * TAU;
    const turns = 1.4 + r() * 1.8;
    const rad = radius * (0.5 + r() * 0.6);
    const seed = r() * 10;
    const lift = (s % 4) * 0.09;
    const pts = [];
    const N = 34;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const ang = a0 + u * turns * TAU;
      const rr = rad * (0.5 + 0.5 * Math.sin(u * Math.PI)) + 0.22 * Math.sin(u * 17 + seed);
      pts.push(new THREE.Vector3(Math.cos(ang) * rr + 0.2 * Math.sin(u * 23 + seed), 0.1 + lift + 0.2 * Math.sin(u * 9 + seed), Math.sin(ang) * rr + 0.2 * Math.cos(u * 19 + seed)));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.075, 6, false);
    group.add(new THREE.Mesh(geo, mat));
  }
  return group;
}

function looseNoodle(r, mat) {
  const pts = [];
  let a = r() * TAU;
  let x = 0;
  let z = 0;
  const N = 40;
  const step = 0.28 + r() * 0.12;
  const seed = r() * 10;
  for (let i = 0; i <= N; i++) {
    pts.push(new THREE.Vector3(x, 0.09 + 0.07 * Math.sin(i * 0.7 + seed), z));
    a += (r() - 0.5) * 1.0;
    x += Math.cos(a) * step;
    z += Math.sin(a) * step;
  }
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.07, 6, false), mat);
  const grp = new THREE.Group();
  grp.add(mesh);
  return grp;
}

// ------------------------------------------------------------------ the station

export class Station {
  constructor(envMap) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.time = 0;
    this.boil = 0;
    this.swirl = 0; // the whirlpool: full while we fall into the pot, calming once we are in it
    const g = this.group;
    const r = rng(7);
    this.u = { uTime: { value: 0 }, uBoil: { value: 0 }, uSwirl: { value: 0 }, uBoilC: { value: BOIL_C }, uFog: { value: 0 }, uFogColor: { value: new THREE.Color(0xc9a070) } };

    // ---- the pot: a great brass stockpot, hammered, with a rolled rim, bands and two loop handles
    const brassMaps = hammeredCopperMaps(512, 600);
    for (const t of Object.values(brassMaps)) t.repeat.set(4, 1.2);
    const brass = new THREE.MeshStandardMaterial({ color: 0x9a7038, ...brassMaps, metalness: 0.95, roughness: 1, envMap, envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.45, 0.45), side: THREE.DoubleSide, emissive: 0x140c02, emissiveIntensity: 0.3 });
    const brassPlain = new THREE.MeshStandardMaterial({ color: 0xe6b966, metalness: 1, roughness: 0.3, envMap, envMapIntensity: 1.5, side: THREE.DoubleSide });
    const potPts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      // a flat floor, a tight curve into the wall, then a straight wall
      const rr = u < 0.2 ? (u / 0.2) * (BOWL_R - 3) : u < 0.3 ? BOWL_R - 3 + Math.sin(((u - 0.2) / 0.1) * Math.PI / 2) * 3 : BOWL_R;
      const yy = u < 0.2 ? -2 : u < 0.3 ? -2 + (1 - Math.cos(((u - 0.2) / 0.1) * Math.PI / 2)) * 3 : 1 + ((u - 0.3) / 0.7) * (BOWL_CY - 1);
      potPts.push(new THREE.Vector2(rr, yy));
    }
    g.add(new THREE.Mesh(new THREE.LatheGeometry(potPts, 128), brass));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(BOWL_R + 0.3, 1.3, 16, 160), brassPlain);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = BOWL_CY;
    g.add(rim);
    for (const y of [8, 22]) {
      const bandM = new THREE.Mesh(new THREE.TorusGeometry(BOWL_R + 0.15, 0.45, 10, 160), brassPlain);
      bandM.rotation.x = Math.PI / 2;
      bandM.position.y = y;
      g.add(bandM);
    }
    for (const sx of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(5, 0.9, 12, 32, Math.PI), brassPlain);
      handle.position.set(sx * (BOWL_R + 0.6), BOWL_CY - 6, 0);
      handle.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      g.add(handle);
    }

    // ---- the broth, with real waves
    const lakeGeo = new THREE.PlaneGeometry(LAKE_R * 2, LAKE_R * 2, 200, 200);
    lakeGeo.rotateX(-Math.PI / 2);
    const lake = new THREE.Mesh(lakeGeo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: lakeVert, fragmentShader: lakeFrag }));
    lake.position.y = LAKE_Y;
    lake.renderOrder = 2; // after the pot and the ladle, so the pixels they cover are never shaded
    lake.frustumCulled = false;
    g.add(lake);

    // ---- a clear lane for the camera, so nothing big is in the way as we skim
    const spots = [];
    const clear = (x, z, minGap) => {
      if (Math.hypot(x, z) > LAKE_R - 3.2) return false;
      if (Math.abs(x) < 2.1 && z < 5 && z > -19) return false;
      if (Math.hypot(x - BOIL_C.x, z - BOIL_C.y) < 8) return false;
      return spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > minGap);
    };
    const spot = (minGap) => {
      for (let i = 0; i < 200; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * (LAKE_R - 3.2);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (clear(x, z, minGap)) { spots.push([x, z]); return [x, z]; }
      }
      return [0, 0];
    };

    this.floaters = [];
    const float = (obj, [x, z], yOff, spin = 0.04) => {
      obj.position.set(x, LAKE_Y + yOff, z);
      this.floaters.push({ obj, x, z, yOff, spin, ph: r() * 6, tilt: obj.rotation.x });
      g.add(obj);
    };

    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, envMap, envMapIntensity: 0.5, ...extra });

    // noodle nests and loose strands
    const noodle = std(0xf3d68d, { roughness: 0.5, emissive: 0x4a2d08, emissiveIntensity: 0.5 });
    for (let i = 0; i < 9; i++) {
      const sp = spot(3.8);
      const nest = noodleNest(r, noodle, 1.5 + r() * 1.2, 9 + Math.floor(r() * 5));
      nest.rotation.y = r() * TAU;
      float(nest, sp, 0, 0.02);
    }
    for (let i = 0; i < 36; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * (LAKE_R - 5);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < 2.6 && z < 5 && z > -19) continue; // keep the camera's lane clear
      float(looseNoodle(r, noodle), [x, z], 0, 0.01);
    }

    // chashu slices
    const chashuTex = chashuTexture();
    const chashu = [std(0x6a3a20, { roughness: 0.6 }), std(0xffffff, { map: chashuTex, roughness: 0.35 }), std(0xc4825f)];
    const chashuGeo = new THREE.CylinderGeometry(2.1, 2.0, 0.34, 40);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(chashuGeo, chashu);
      m.rotation.set((r() - 0.5) * 0.25, r() * TAU, (r() - 0.5) * 0.25);
      float(m, spot(4.6), 0.02, 0.03);
    }

    // soft-boiled egg halves: a white, a glossy yolk
    const eggWhite = std(0xfdf8ee, { roughness: 0.3 });
    const yolk = std(0xffa319, { roughness: 0.25, emissive: 0xc05a00, emissiveIntensity: 0.55, envMapIntensity: 0.9 });
    for (let i = 0; i < 6; i++) {
      const egg = new THREE.Group();
      const white = new THREE.Mesh(new THREE.SphereGeometry(2.3, 36, 16), eggWhite);
      white.scale.set(1, 0.3, 1.25);
      egg.add(white);
      const y = new THREE.Mesh(new THREE.SphereGeometry(1.05, 28, 16), yolk);
      y.scale.y = 0.75;
      y.position.set(0.1, 0.18, 0.1);
      egg.add(y);
      egg.rotation.y = r() * TAU;
      float(egg, spot(5.2), 0.03, 0.03);
    }

    // narutomaki
    const nTex = narutoTexture();
    const naruto = [std(0xfbe9e0), std(0xffffff, { map: nTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: nTex, emissiveIntensity: 0.16 }), std(0xfbe9e0)];
    const narutoGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.28, 40);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(narutoGeo, naruto);
      m.rotation.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3);
      float(m, spot(4.2), 0.02, 0.05);
    }

    // shiitake caps
    const mushroom = std(0x7a4a2a, { roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.2, 28, 14, 0, TAU, 0, Math.PI / 2), mushroom);
      m.scale.y = 0.55;
      m.rotation.set((r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4);
      float(m, spot(3.2), -0.05, 0.03);
    }

    // bok choy
    const leaf = std(0x5fa23a, { roughness: 0.5, side: THREE.DoubleSide });
    const stalk = std(0xe6f0c8, { roughness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), leaf);
      l.scale.set(2.2, 0.14, 1.1);
      l.position.x = 1.0;
      b.add(l);
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.5), stalk);
      s.position.x = -0.9;
      b.add(s);
      b.rotation.y = r() * TAU;
      float(b, spot(3.6), 0.05, 0.04);
    }

    // menma strips
    const menma = std(0xc89a58, { roughness: 0.6 });
    for (let c = 0; c < 3; c++) {
      const grp = new THREE.Group();
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.2), menma);
        m.position.set((r() - 0.5) * 1.6, 0.05 + (i % 3) * 0.1, (r() - 0.5) * 1.6);
        m.rotation.y = r() * TAU;
        grp.add(m);
      }
      float(grp, spot(3.6), 0, 0.02);
    }

    // sheets of nori leaning out of the broth
    const nori = std(0x1d3a20, { roughness: 0.35, side: THREE.DoubleSide, emissive: 0x061008 });
    for (let i = 0; i < 6; i++) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 0.05), nori);
      sheet.rotation.set(-0.5 + r() * 0.3, r() * TAU, 0.1);
      sheet.position.y = 0.8;
      const grp = new THREE.Group();
      grp.add(sheet);
      float(grp, spot(3.4), 0, 0.01);
    }
    // bean sprouts in tangles
    const sprout = std(0xf3ead8, { roughness: 0.5 });
    for (let c = 0; c < 5; c++) {
      const grp = new THREE.Group();
      for (let i = 0; i < 18; i++) {
        const pts = [];
        const a0 = r() * TAU;
        for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push(new THREE.Vector3(Math.cos(a0) * u * 1.4 + Math.sin(u * 5 + i) * 0.15, 0.1 + Math.sin(u * Math.PI) * 0.25, Math.sin(a0) * u * 1.4 + Math.cos(u * 4 + i) * 0.15)); }
        grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.045, 5, false), sprout));
      }
      float(grp, spot(3.4), 0, 0.02);
    }
    // corn, in clusters
    const cornMat = std(0xffd23d, { roughness: 0.35, emissive: 0x4a3200 });
    for (let c = 0; c < 6; c++) {
      const grp = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), cornMat);
        m.position.set((r() - 0.5) * 0.9, 0.1, (r() - 0.5) * 0.9);
        m.scale.y = 0.8;
        grp.add(m);
      }
      float(grp, spot(2.4), 0, 0.03);
    }
    // fish cakes: white discs with a pink rim
    const cakeMats = [std(0xf07090, { roughness: 0.5 }), std(0xfbf1ea, { roughness: 0.45 }), std(0xfbf1ea, { roughness: 0.45 })];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.26, 36), cakeMats);
      m.rotation.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3);
      float(m, spot(4.0), 0.02, 0.04);
    }
    // a great porcelain spoon, floating
    {
      const spoon = new THREE.Group();
      const bowlMat = new THREE.MeshPhysicalMaterial({ color: 0xf3f0e7, roughness: 0.25, clearcoat: 0.8, envMap, envMapIntensity: 0.7, side: THREE.DoubleSide });
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2), bowlMat);
      bowl.scale.set(1, 0.45, 1.35);
      bowl.position.y = 1.0;
      spoon.add(bowl);
      const blue = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.08, 8, 48), new THREE.MeshStandardMaterial({ color: 0x2c58a8, roughness: 0.4 }));
      blue.rotation.x = Math.PI / 2;
      blue.scale.set(1, 1.35, 1);
      blue.position.y = 1.0;
      spoon.add(blue);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 5.5), bowlMat);
      handle.position.set(0, 1.3, -4.6);
      handle.rotation.x = -0.12;
      spoon.add(handle);
      spoon.rotation.y = 2.4;
      spoon.rotation.z = 0.12;
      float(spoon, [14, -27], -0.5, 0.015);
    }
    // a pair of giant chopsticks dipped into the broth from above
    const stickMat = std(0xb87a3c, { roughness: 0.45, emissive: 0x2a1204 });
    [[-6.5, -23, 0.35, 0.18], [-8.4, -25.5, 0.3, 0.26]].forEach(([x, z, rz, rx]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 90, 16), stickMat);
      m.position.set(x, LAKE_Y + 40, z);
      m.rotation.set(rx, 0, rz);
      g.add(m);
    });

    // scallion rings, corn, chili flakes and sesame: instanced, riding the waves
    this.scatter = [];
    const scatter = (geo, mat, n, rad, size, yOff) => {
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.frustumCulled = false;
      const data = [];
      for (let i = 0; i < n; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * rad;
        data.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, ry: r() * TAU, rx: (r() - 0.5) * 0.7, s: size[0] + r() * (size[1] - size[0]) });
      }
      this.scatter.push({ mesh, data, yOff });
      g.add(mesh);
    };
    const ringMat = std(0x9be36b, { emissive: 0x1f5a12, emissiveIntensity: 0.6 });
    const flatRing = new THREE.TorusGeometry(0.4, 0.1, 8, 20);
    flatRing.rotateX(Math.PI / 2);
    scatter(flatRing, ringMat, 190, LAKE_R - 1.5, [0.7, 1.3], 0.05);
    scatter(new THREE.SphereGeometry(0.14, 10, 8), std(0xffd23d, { roughness: 0.35, emissive: 0x4a3200 }), 80, LAKE_R - 1.5, [0.8, 1.4], 0.06);
    scatter(new THREE.TetrahedronGeometry(0.1), std(0xd9260b, { emissive: 0x3a0800 }), 170, LAKE_R - 1.5, [0.7, 1.5], 0.04);
    scatter(new THREE.SphereGeometry(0.06, 6, 5), std(0xf3ead2, { roughness: 0.4 }), 260, LAKE_R - 1.5, [0.7, 1.3], 0.03);

    // ---- bubbles that swell and pop
    this.bubbleN = 280;
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd58a, roughness: 0.08, transparent: true, opacity: 0.42, emissive: 0x66300a, emissiveIntensity: 0.5,
      clearcoat: 1, clearcoatRoughness: 0.05, envMap, envMapIntensity: 2.2, depthWrite: false,
    });
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI / 2), bubbleMat, this.bubbleN);
    this.bubbles.frustumCulled = false;
    this.bubbleData = [];
    for (let i = 0; i < this.bubbleN; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * (LAKE_R - 1.5);
      this.bubbleData.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, size: 0.12 + Math.pow(r(), 2.2) * 0.9, period: 1.4 + r() * 3.2, phase: r() });
    }
    g.add(this.bubbles);

    // ---- the ladle that scoops us up: a steel bowl on a long handle, with broth and noodles in it
    {
      const ladle = new THREE.Group();
      const LR = 10;
      const body = buildLadle(envMap, { soup: true });
      body.scale.setScalar(LR);
      ladle.add(body);
      ladle.userData.body = body;
      ladle.visible = false;
      g.add(ladle);
      this.ladle = ladle;
      this.LR = LR;
    }

    // ---- steam rising off the broth, and embers
    this.steam = new Steam([
      { x: 0, y: LAKE_Y, z: -4, r: 16, n: 380 },
      { x: BOIL_C.x, y: LAKE_Y, z: BOIL_C.y, r: 4, n: 90 },
    ], { height: 16, rise: 1.4, spread: 1.6, size: 3.0, opacity: 0.09, color: 0xffd9a8, sway: 0.6, grow: 2.0, near: 4.5 });
    this.haze = new Steam([{ x: 0, y: LAKE_Y, z: -6, r: 26, n: 150 }], { height: 9, rise: 0.5, spread: 0.6, size: 9, opacity: 0.05, color: 0xffd2a0, sway: 1.2, grow: 0.8, near: 9 });
    g.add(this.haze.points);
    // a column of steam boiling up out of the pot, far up into space: you fall through it
    this.plume = new Steam([{ x: 0, y: LAKE_Y + 2, z: 0, r: 22, n: 380 }], { height: 150, rise: 6, spread: 1.8, size: 14, opacity: 0.06, color: 0xffd6a8, sway: 4, grow: 2.2, near: 10 });
    g.add(this.plume.points);
    // a tornado of scallion, chili and sesame turning above the whirlpool
    {
      const N = 900;
      const geo = new THREE.TorusGeometry(0.42, 0.11, 6, 12);
      geo.rotateX(Math.PI / 2);
      this.swarm = new THREE.InstancedMesh(geo, std(0x9be36b, { emissive: 0x1f5a12, emissiveIntensity: 0.5 }), N);
      this.swarmData = [];
      for (let i = 0; i < N; i++) this.swarmData.push({ a: r() * TAU, y: 2 + Math.pow(r(), 1.4) * 70, w: 0.5 + r() * 0.5, s: 0.7 + r() * 1.2, k: r() });
      this.swarm.frustumCulled = false;
      g.add(this.swarm);
      const geo2 = new THREE.TetrahedronGeometry(0.16);
      this.swarm2 = new THREE.InstancedMesh(geo2, std(0xd9260b, { emissive: 0x3a0800 }), 500);
      this.swarm2.frustumCulled = false;
      g.add(this.swarm2);
    }
    this.embers = this.makeSprites(160, 16, 26, 0.35, 0xffb25a, 0.8, steamTexture());
    g.add(this.steam.points, this.embers.points);

    // ---- light: warm from the broth, cool from the nebula above, hot where it boils
    this.lakeLight = new THREE.PointLight(0xff9a3a, 170, 90, 2);
    this.lakeLight.position.set(0, 3, 0);
    this.skyLight = new THREE.PointLight(0x8fa8ff, 110, 90, 2);
    this.skyLight.position.set(0, 30, 0);
    g.add(this.lakeLight, this.skyLight, new THREE.AmbientLight(0x6a5a8a, 0.22));
  }

  /** The broth's surface height (world) under x, z: the camera must never go below it. */
  surfaceAt(x, z) {
    return this.group.position.y + LAKE_Y + waveH(x, z, this.time, this.boil);
  }

  /** Where the camera is while the ladle has us (local to the bowl, plus PLAT_Y to the world). */
  ride(u, t) {
    const blend = smooth(ramp(u, 0.66, 0.84));
    const settle = 1 - ramp(u, 0.8, 0.94);
    const pos = new THREE.Vector3(Math.sin(t * 0.9) * 0.1 * settle, LADLE.y(u) + LADLE.ride(u) + Math.sin(t * 1.4) * 0.08 * settle, LADLE.z(u) + 1.0);
    pos.y += this.group.position.y;
    return { blend, pos, pitch: LADLE.pitch(u), yaw: LADLE.yaw(u) + Math.sin(t * 0.4) * 0.03 * blend, roll: LADLE.roll(u), fov: LADLE.fov(u) };
  }

  makeSprites(n, rad, height, size, color, opacity, map) {
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * rad;
      seed.set([Math.cos(a) * rr, Math.random() * height, Math.sin(a) * rr], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      map, size, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    points.frustumCulled = false;
    return { points, seed, height, rate: size > 1 ? 1.1 : 2.2, base: opacity };
  }

  /** u: how far the big boil has got, 0..1 */
  update(dt, t, u = 0) {
    this.time += dt;
    const T = this.time;
    // the plunge: waves roll out from where the ladle goes in
    const boil = ramp(u, 0.3, 0.4) * (1 - ramp(u, 0.56, 0.85));
    this.boil = boil;
    this.u.uTime.value = T;
    this.u.uBoil.value = boil;
    SWIRL = this.swirl;
    this.u.uSwirl.value = this.swirl;
    this.lakeLight.intensity = 170 + Math.sin(T * 1.3) * 12;

    const dummy = this._d || (this._d = new THREE.Object3D());
    const ex = boil * 0.8;

    // things that float ride the waves
    for (const f of this.floaters) {
      f.obj.position.y = LAKE_Y + f.yOff + waveH(f.x, f.z, T, boil) + Math.sin(T * 0.8 + f.ph) * 0.03;
      f.obj.rotation.y += f.spin * dt;
      f.obj.rotation.x = f.tilt + Math.sin(T * 0.9 + f.ph) * 0.03 * (1 + boil * 2);
    }
    for (const { mesh, data, yOff } of this.scatter) {
      data.forEach((o, i) => {
        dummy.position.set(o.x, LAKE_Y + yOff + waveH(o.x, o.z, T, boil), o.z);
        dummy.rotation.set(o.rx, o.ry + T * 0.05, 0);
        dummy.scale.setScalar(o.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    // bubbles: swell, then pop
    this.bubbleData.forEach((b, i) => {
      const life = (T / b.period + b.phase) % 1;
      let s;
      if (life < 0.85) s = b.size * Math.pow(smooth(life / 0.85), 0.6);
      else {
        const v = (life - 0.85) / 0.15;
        s = b.size * (1 + 0.35 * v) * (1 - v * v * v);
      }
      s *= 1 + ex;
      dummy.position.set(b.x, LAKE_Y + waveH(b.x, b.z, T, boil) - s * 0.1, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(s, s * 0.85, s);
      dummy.updateMatrix();
      this.bubbles.setMatrixAt(i, dummy.matrix);
    });
    this.bubbles.instanceMatrix.needsUpdate = true;

    // the ladle: down from above, into the broth ahead, under us, and up and out of the bowl
    const L = this.ladle;
    L.visible = u > 0.001;
    L.position.set(0, LADLE.y(u), LADLE.z(u));
    L.rotation.x = LADLE.tilt(u);
    if (L.userData.body) L.userData.body.userData.brothMat.uniforms.uTime.value = T;

    // steam rises faster and thicker as it boils
    this.steam.u.uOpacity.value = 0.06 * (1 + boil * 0.8);
    this.steam.u.uRise.value = 1.4 * (1 + boil * 0.5);
    this.steam.update(T, this.pixelScale ?? 1);
    this.haze.update(T, this.pixelScale ?? 1);
    this.plume.update(T, this.pixelScale ?? 1);
    this.plume.u.uOpacity.value = 0.06 * (0.2 + 0.8 * this.swirl);
    // the tornado: everything circles the eye, closer and faster the lower it is, and sinks as the storm calms
    const sw = this.swirl;
    // it only exists while the storm does: as the whirlpool calms the garnish sinks and is gone
    const alive = ramp(sw, 0.25, 0.7);
    this.swarm.visible = this.swarm2.visible = alive > 0.01;
    if (this.swarm.visible) {
      this.swarmData.forEach((o, i) => {
        const y = (6 + o.y) * (0.3 + 0.7 * sw);
        const rad = 5 + y * 0.42 + Math.sin(T * 0.7 + o.k * 9) * 1.2;
        const ang = o.a + T * o.w * (1.6 - y * 0.012) * (0.4 + 0.6 * sw);
        dummy.position.set(Math.cos(ang) * rad, LAKE_Y + y + Math.sin(T * 1.3 + o.k * 20) * 0.6, Math.sin(ang) * rad);
        dummy.rotation.set(o.k * 6 + T * 0.8, ang, 0.3);
        dummy.scale.setScalar(o.s * alive);
        dummy.updateMatrix();
        this.swarm.setMatrixAt(i, dummy.matrix);
        if (i < 500) {
          dummy.position.set(Math.cos(ang + 1.3) * (rad * 0.8), LAKE_Y + y * 0.9 + 1, Math.sin(ang + 1.3) * (rad * 0.8));
          dummy.rotation.set(T + o.k, ang, T * 0.7);
          dummy.scale.setScalar(o.s * 0.9 * alive);
          dummy.updateMatrix();
          this.swarm2.setMatrixAt(i, dummy.matrix);
        }
      });
      this.swarm.instanceMatrix.needsUpdate = true;
      this.swarm2.instanceMatrix.needsUpdate = true;
    }
    if (this.ladle.userData.body) this.ladle.userData.body.userData.brothMat.uniforms.uFog.value = this.u.uFog.value;
    for (const s of [this.embers]) {
      const p = s.points.geometry.attributes.position;
      const rate = s.rate * (1 + boil * 1.2);
      for (let i = 0; i < p.count; i++) {
        const y = (s.seed[i * 3 + 1] + T * rate) % s.height;
        const sway = Math.sin(T * 0.5 + i) * 0.6;
        p.setXYZ(i, s.seed[i * 3] + sway, y + 0.4, s.seed[i * 3 + 2] + Math.cos(T * 0.4 + i) * 0.6);
      }
      p.needsUpdate = true;
    }
  }
}
