import * as THREE from 'three';
import { Batch, G, TAU } from './props.js';
import { narutoTexture } from '../lib/foodTex.js';
import { canvas, toTexture } from '../lib/maps.js';
import { brothTexture, brothSurface } from './Ladle.js';
import { placeModel } from '../lib/models.js';

// The dining room beyond the kitchen's doors, and the cart that carries the bowl into it.
//
// A dim, gold room: dark panelled walls, a deep red ceiling, brass chandeliers turned low,
// round tables under white cloths. Nobody is eating. At each table sit blacked-out figures,
// pure silhouettes, each facing a glowing monitor. At the far end, one table waits with a
// monitor that shows the SPACE SOUP logo.
//
// World: metres, shared with the kitchen. The room runs from x = DX0 to DX1 beyond the
// kitchen's right wall; its aisle runs along z = AISLE.

export const DX0 = 6.0;
export const DX1 = 25.0;
export const AISLE = -3.3;
const DZ0 = -11.5;
const DZ1 = 4.5;
const DH = 4.3;

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fake interface on a monitor: dark screen, teal and amber blocks and lines. */
function uiTexture(seed) {
  const r = rng(seed);
  return toTexture(canvas(256, 160, (g, w, h) => {
    g.fillStyle = '#06090e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0d1a22';
    g.fillRect(0, 0, w, 14);
    for (let i = 0; i < 26; i++) {
      const x = 10 + r() * (w - 60);
      const y = 22 + r() * (h - 34);
      const ww = 12 + r() * 70;
      const hh = 3 + r() * 8;
      g.fillStyle = r() < 0.25 ? `rgba(255,170,70,${0.5 + r() * 0.5})` : `rgba(90,220,230,${0.25 + r() * 0.6})`;
      g.fillRect(x, y, ww, hh);
    }
    g.strokeStyle = 'rgba(90,220,230,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let x = 0; x < w; x += 4) {
      const y = h * 0.62 + Math.sin(x * 0.07 + seed) * 12 + Math.sin(x * 0.21) * 5;
      if (x) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }), { srgb: true });
}

/** The logo screen: the emblem and SPACE SOUP on black. Redrawn once the image and font arrive. */
function logoTexture() {
  const c = canvas(512, 320, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); });
  const tex = toTexture(c, { srgb: true });
  const g = c.getContext('2d');
  const img = new Image();
  const draw = () => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 320);
    if (img.complete && img.naturalWidth) {
      const iw = 300;
      const ih = (img.naturalHeight / img.naturalWidth) * iw;
      g.drawImage(img, 256 - iw / 2, 150 - ih / 2 - 10, iw, ih);
    }
    g.fillStyle = '#f4efe9';
    g.textAlign = 'center';
    g.font = '900 40px Unbounded, "Arial Black", sans-serif';
    g.fillText('SPACE SOUP', 256, 272);
    g.fillStyle = 'rgba(244,239,233,0.6)';
    g.font = '500 13px Inter, sans-serif';
    g.fillText('A  V R  S T U D I O ,  C O O K E D  F R O M  S C R A T C H', 256, 300);
    tex.needsUpdate = true;
  };
  img.onload = draw;
  img.src = '/emblem.png';
  draw();
  (document.fonts?.ready ?? Promise.resolve()).then(draw);
  return tex;
}

/** A soft round sprite texture: used for nebula clouds and the sun's glow. */
function softSprite(size, stops) {
  return toTexture(canvas(size, size, (g) => {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }), { srgb: true });
}

/** A planet's skin, pre-shaded: bands, storms and a baked terminator, so it needs no light. */
function planetTexture(seed, a, b, c, bands) {
  const r = rng(seed);
  return toTexture(canvas(512, 256, (g, w, h) => {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const k = 0.5 + 0.5 * Math.sin(t * bands * Math.PI + Math.sin(t * 7 + seed) * 1.2);
      const mix = (p, q, u) => Math.round(p + (q - p) * u);
      g.fillStyle = `rgb(${mix(a[0], b[0], k)},${mix(a[1], b[1], k)},${mix(a[2], b[2], k)})`;
      g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * w;
      const y = r() * h;
      const rw = 20 + r() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, rw);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.25 + r() * 0.4})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.save(); g.scale(1, 0.3); g.beginPath(); g.arc(x, y / 0.3, rw, 0, TAU); g.fill(); g.restore();
    }
    // the night side
    const sh = g.createLinearGradient(0, 0, w, 0);
    sh.addColorStop(0.0, 'rgba(0,0,0,0.85)');
    sh.addColorStop(0.25, 'rgba(0,0,0,0.6)');
    sh.addColorStop(0.5, 'rgba(0,0,0,0)');
    sh.addColorStop(0.8, 'rgba(0,0,0,0)');
    sh.addColorStop(1.0, 'rgba(0,0,0,0.85)');
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
  }), { srgb: true });
}

/** A cratered moon. */
function moonTexture(seed) {
  const r = rng(seed);
  return toTexture(canvas(512, 256, (g, w, h) => {
    g.fillStyle = '#9a948c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '60,55,50' : '200,195,185'},${0.05 + r() * 0.1})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 4);
    }
    for (let i = 0; i < 140; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 3 + Math.pow(r(), 2) * 28;
      g.fillStyle = 'rgba(50,46,42,0.5)';
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      g.fillStyle = 'rgba(190,184,176,0.55)';
      g.beginPath(); g.arc(x - rad * 0.25, y - rad * 0.25, rad * 0.75, 0, TAU); g.fill();
      g.fillStyle = 'rgba(120,114,108,0.6)';
      g.beginPath(); g.arc(x, y, rad * 0.55, 0, TAU); g.fill();
    }
    const sh = g.createLinearGradient(0, 0, w, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.9)'); sh.addColorStop(0.3, 'rgba(0,0,0,0.5)'); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.9)');
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
  }), { srgb: true });
}

/** A spiral galaxy on a transparent sprite. */
function galaxySprite(seed, hue) {
  const r = rng(seed);
  return toTexture(canvas(512, 512, (g, w, h) => {
    g.translate(w / 2, h / 2);
    for (let arm = 0; arm < 2; arm++) {
      for (let k = 0; k < 220; k++) {
        const t = k / 220;
        const ang = arm * Math.PI + t * 4.6;
        const rad = t * w * 0.46;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad * 0.55;
        const gr = g.createRadialGradient(x, y, 0, x, y, 12 + t * 34);
        gr.addColorStop(0, `hsla(${hue}, 70%, 82%, ${0.28 * (1 - t * 0.75)})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, 12 + t * 34, 0, TAU); g.fill();
      }
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.16);
    core.addColorStop(0, 'rgba(255,246,228,1)');
    core.addColorStop(0.35, `hsla(${hue}, 60%, 78%, 0.6)`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, w * 0.16, 0, TAU); g.fill();
    for (let i = 0; i < 400; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 0.6) * w * 0.46;
      g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d * 0.55, 0.6 + r() * 1.4, 0, TAU); g.fill();
    }
  }), { srgb: true });
}

/** Space, in depth, all round the dining room: seen through its windows. */
function buildOutside(parent, envMap) {
  const o = new THREE.Group();
  parent.add(o);
  const r = rng(77);
  const C = new THREE.Vector3((DX0 + DX1) / 2, 2.2, AISLE);
  o.position.copy(C);
  const anim = [];

  // stars, in three shells of depth, with a twinkle
  const starVert = /* glsl */ `
    attribute float aSize;
    attribute float aPhase;
    uniform float uTime, uPixel;
    varying float vA;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixel / max(-mv.z, 1.0);
      vA = 0.65 + 0.35 * sin(uTime * (1.5 + aPhase * 2.0) + aPhase * 40.0);
      gl_Position = projectionMatrix * mv;
    }
  `;
  const starFrag = /* glsl */ `
    varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.1, d) * vA;
      gl_FragColor = vec4(vec3(0.9, 0.94, 1.0) * a * 1.4, a);
    }
  `;
  const N = 5000;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = r() * TAU;
    const b = Math.acos(2 * r() - 1);
    const d = 22 + Math.pow(r(), 0.5) * 90;
    pos.set([Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d, Math.sin(b) * Math.sin(a) * d], i * 3);
    size[i] = (r() < 0.9 ? 0.7 + r() * 1.2 : 2.2 + r() * 3.0) * 1.0;
    phase[i] = r();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const starU = { uTime: { value: 0 }, uPixel: { value: 600 } };
  const stars = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: starU, vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false;
  o.add(stars);
  anim.push((t, px) => { starU.uTime.value = t; starU.uPixel.value = 600 * px; });

  // nebula: soft clouds at many depths, each turning slowly
  const nebTex = [
    softSprite(256, [[0, 'rgba(150,70,220,0.55)'], [0.4, 'rgba(110,40,170,0.22)'], [1, 'rgba(0,0,0,0)']]),
    softSprite(256, [[0, 'rgba(40,170,200,0.5)'], [0.4, 'rgba(20,120,150,0.2)'], [1, 'rgba(0,0,0,0)']]),
    softSprite(256, [[0, 'rgba(230,90,140,0.45)'], [0.4, 'rgba(170,50,110,0.18)'], [1, 'rgba(0,0,0,0)']]),
    softSprite(256, [[0, 'rgba(255,170,80,0.4)'], [0.4, 'rgba(200,120,50,0.16)'], [1, 'rgba(0,0,0,0)']]),
  ];
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex[i % 4], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: r() * TAU, opacity: 0.8 + r() * 0.5 }));
    const a = r() * TAU;
    const d = 18 + r() * 50;
    const y = (r() - 0.5) * 40;
    sp.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    const sc = 10 + r() * 26;
    sp.scale.set(sc, sc, 1);
    o.add(sp);
    const rate = (r() - 0.5) * 0.04;
    anim.push((t) => { sp.material.rotation += rate * 0.016; });
  }

  // a ringed gas giant beyond the left windows, a cratered moon beyond the right, a far sun, a galaxy
  const giant = new THREE.Mesh(new THREE.SphereGeometry(7, 48, 32), new THREE.MeshBasicMaterial({ map: planetTexture(5, [230, 140, 60], [120, 50, 25], [255, 220, 170], 11) }));
  giant.position.set(-4, 4.5, -25);
  giant.rotation.z = 0.3;
  o.add(giant);
  anim.push((t) => { giant.rotation.y = t * 0.02; });
  const ringTex = toTexture(canvas(512, 8, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const t = x / w;
      const a = (0.15 + 0.85 * Math.abs(Math.sin(t * 29) * Math.sin(t * 7))) * (t < 0.08 || t > 0.95 ? 0.2 : 1);
      g.fillStyle = `rgba(${210 + 30 * Math.sin(t * 13)},${170 + 30 * Math.sin(t * 5)},${120},${a * 0.8})`;
      g.fillRect(x, 0, 1, h);
    }
  }), { srgb: true });
  const ringGeo = new THREE.RingGeometry(9.5, 16.5, 128, 1);
  // ring uvs run across the band, so the texture's x maps to radius
  const ruv = ringGeo.attributes.uv;
  const rp = ringGeo.attributes.position;
  for (let i = 0; i < ruv.count; i++) { const rr = Math.hypot(rp.getX(i), rp.getY(i)); ruv.setXY(i, (rr - 9.5) / 7, 0.5); }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.copy(giant.position);
  ring.rotation.set(1.25, 0.1, 0.3);
  o.add(ring);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 40, 24), new THREE.MeshBasicMaterial({ map: moonTexture(9) }));
  moon.position.set(6, 3.2, 19);
  o.add(moon);
  anim.push((t) => { moon.rotation.y = t * 0.035; moon.position.x = 6 + Math.sin(t * 0.05) * 3; });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(256, [[0, 'rgba(255,248,225,1)'], [0.1, 'rgba(255,200,100,0.9)'], [0.3, 'rgba(255,140,40,0.3)'], [1, 'rgba(255,100,20,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sun.position.set(40, 14, 70);
  sun.scale.set(40, 40, 1);
  o.add(sun);
  const gal = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxySprite(3, 265), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, rotation: -0.5 }));
  gal.position.set(30, 10, -62);
  gal.scale.set(44, 44, 1);
  o.add(gal);
  anim.push((t) => { gal.material.rotation = -0.5 + t * 0.004; });

  // an asteroid belt drifting past the left windows, and a few stragglers near the right
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp2 = rockGeo.attributes.position;
  for (let i = 0; i < rp2.count; i++) { const k = 0.75 + r() * 0.5; rp2.setXYZ(i, rp2.getX(i) * k, rp2.getY(i) * k, rp2.getZ(i) * k); }
  rockGeo.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshBasicMaterial({ map: moonTexture(21), color: 0x8a847c }), 240);
  const rock = [];
  const d = new THREE.Object3D();
  for (let i = 0; i < 240; i++) {
    const left = i < 200;
    rock.push({ x: (r() - 0.5) * 70, y: (r() - 0.5) * (left ? 14 : 30) + (left ? -2 : 4), z: left ? -14 - r() * 16 : 16 + r() * 30, s: 0.15 + Math.pow(r(), 2.5) * 1.6, rx: r() * 6, ry: r() * 6, vx: (r() - 0.5) * 0.3, vr: (r() - 0.5) * 0.4 });
  }
  rocks.frustumCulled = false;
  o.add(rocks);
  anim.push((t) => {
    for (let i = 0; i < rock.length; i++) {
      const k = rock[i];
      d.position.set(k.x + k.vx * t, k.y, k.z);
      d.rotation.set(k.rx + t * k.vr, k.ry + t * k.vr * 0.7, 0);
      d.scale.setScalar(k.s);
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
  });

  // the whole of space turns, very slowly, so the view through the windows is never still
  anim.push((t) => { o.rotation.y = t * 0.003; });
  return { group: o, update: (t, px) => { for (const f of anim) f(t, px); } };
}

/** A blacked-out figure, seated: a pure silhouette with no shading at all. */
function figure(black) {
  const f = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), black);
  head.scale.set(1, 1.18, 1);
  head.position.y = 1.32;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10), black);
  neck.position.y = 1.18;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), black);
  torso.scale.set(1, 1.3, 0.7);
  torso.position.y = 0.86;
  const lap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.5), black);
  lap.position.set(0, 0.5, 0.18);
  f.add(head, neck, torso, lap);
  for (const sx of [-1, 1]) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 10), black);
    upper.position.set(sx * 0.27, 0.92, 0.06);
    upper.rotation.set(0.5, 0, sx * 0.15);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.34, 10), black);
    fore.position.set(sx * 0.24, 0.76, 0.34);
    fore.rotation.set(Math.PI / 2 - 0.1, 0, 0);
    f.add(upper, fore);
  }
  f.userData.head = head;
  return f;
}

export function buildDining(parent, M, envMap, { woodMat }) {
  const g = new THREE.Group();
  parent.add(g);
  const E = { envMap };
  const r = rng(99);
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.95, ...E, envMapIntensity: 0.2 });
  const clothEdge = new THREE.MeshStandardMaterial({ color: 0xe3d9c6, roughness: 0.95 });
  const burgundy = new THREE.MeshStandardMaterial({ color: 0x6a2a36, roughness: 0.9 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x2a0f16, roughness: 0.9 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x8a4a4a, roughness: 1, ...E, envMapIntensity: 0.05, map: toTexture(canvas(256, 256, (gg, w, h) => {
    gg.fillStyle = '#4a1820';
    gg.fillRect(0, 0, w, h);
    gg.strokeStyle = 'rgba(200,150,80,0.35)';
    gg.lineWidth = 2;
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
      const cx = i * 128 + 64;
      const cy = k * 128 + 64;
      gg.beginPath();
      gg.moveTo(cx, cy - 50); gg.lineTo(cx + 50, cy); gg.lineTo(cx, cy + 50); gg.lineTo(cx - 50, cy); gg.closePath();
      gg.stroke();
      gg.beginPath(); gg.arc(cx, cy, 10, 0, TAU); gg.stroke();
    }
  }), { srgb: true, repeat: 6 }) });
  const darkWood = woodMat;
  const screenMats = [];
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // ---- the room
  const W = DX1 - DX0;
  const D = DZ1 - DZ0;
  add(new THREE.PlaneGeometry(W, D), carpet, (DX0 + DX1) / 2, 0.001, (DZ0 + DZ1) / 2, -Math.PI / 2);
  add(new THREE.PlaneGeometry(W, D), ceilingMat, (DX0 + DX1) / 2, DH, (DZ0 + DZ1) / 2, Math.PI / 2);
  // walls: dark wood panelling to 1.2 m, burgundy above, a brass picture rail
  const b = new Batch(g);
  const wall = (cx, cy, cz, w, h, ry) => {
    b.box(burgundy, cx, cy + h / 2, cz, ry ? 0.05 : w, h, ry ? w : 0.05, 0);
  };
  wall(DX1, 0, (DZ0 + DZ1) / 2, D, DH, 1); // far wall, behind the last table: burgundy
  // the long walls are windows onto space above the panelling: dark mullions, a slow drift of galaxies outside
  const space = [];
  const windowWall = (z, dir, seed) => {
    const sill = 1.25;
    const wh = DH - sill;
    b.box(M.woodDark, (DX0 + DX1) / 2, sill + 0.05, z, W, 0.1, 0.16, 0); // the sill
    b.box(M.woodDark, (DX0 + DX1) / 2, DH - 0.05, z, W, 0.1, 0.16, 0); // the head
    b.box(M.woodDark, (DX0 + DX1) / 2, 2.7, z, W, 0.07, 0.1, 0); // the transom bar
    for (let x = DX0; x <= DX1 + 0.01; x += 1.5) b.box(M.woodDark, x, sill + wh / 2, z, 0.12, wh, 0.14, 0);
    // a faint sheen of glass
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, wh), new THREE.MeshPhysicalMaterial({ color: 0x8fb2c8, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, ...E, envMapIntensity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.set((DX0 + DX1) / 2, sill + wh / 2, z + dir * 0.02);
    glass.rotation.y = dir > 0 ? 0 : Math.PI;
    g.add(glass);
  };
  windowWall(DZ0, 1, 31); // left wall (back): faces into the room toward +z
  windowWall(DZ1, -1, 47); // right wall (front): faces toward -z
  const outside = buildOutside(g, envMap);
  // the door wall, from this side: solid except for the doorway
  const doorHalf = 1.25;
  wall(DX0 + 0.08, 0, (DZ0 + AISLE - doorHalf) / 2, AISLE - doorHalf - DZ0, DH, 1);
  wall(DX0 + 0.08, 0, (AISLE + doorHalf + DZ1) / 2, DZ1 - AISLE - doorHalf, DH, 1);
  wall(DX0 + 0.08, 2.6, AISLE, doorHalf * 2, DH - 2.6, 1);
  // panelling: boards and a rail
  const panel = (cx, cz, len, ry) => {
    b.box(darkWood, cx, 0.6, cz, ry ? 0.08 : len, 1.2, ry ? len : 0.08, 0);
    b.box(M.brass, cx, 1.22, cz, ry ? 0.1 : len, 0.03, ry ? len : 0.1, 0);
    const n = Math.floor(len / 0.6);
    for (let i = 0; i <= n; i++) {
      const o = -len / 2 + i * 0.6;
      b.box(M.woodDark, ry ? cx : cx + o, 0.6, ry ? cz + o : cz, ry ? 0.1 : 0.04, 1.1, ry ? 0.04 : 0.1, 0);
    }
  };
  panel(DX1 - 0.05, (DZ0 + DZ1) / 2, D, 1);
  panel((DX0 + DX1) / 2, DZ0 + 0.05, W, 0);
  panel((DX0 + DX1) / 2, DZ1 - 0.05, W, 0);
  panel(DX0 + 0.14, (DZ0 + AISLE - doorHalf) / 2, AISLE - doorHalf - DZ0, 1);
  panel(DX0 + 0.14, (AISLE + doorHalf + DZ1) / 2, DZ1 - AISLE - doorHalf, 1);
  // a coffered ceiling: dark beams with a brass line
  for (let x = DX0 + 2; x < DX1; x += 3) b.box(M.woodDark, x, DH - 0.12, (DZ0 + DZ1) / 2, 0.2, 0.24, D);
  for (let z = DZ0 + 2; z < DZ1; z += 3) b.box(M.woodDark, (DX0 + DX1) / 2, DH - 0.11, z, W, 0.2, 0.2); // a little shallower, so the crossings never share a face
  // chandeliers: brass rings with candle bulbs, turned low
  const lights = [];
  const chandelier = (x, z) => {
    b.cyl(M.brassDark, x, DH - 0.5, z, 0.012, 1.0, 0, 0, 0, 'cyl8');
    b.add(G.ring(0.55, 0.03, 32), M.brass, x, DH - 1.0, z, Math.PI / 2);
    b.add(G.ring(0.3, 0.025, 24), M.brass, x, DH - 1.25, z, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      b.cyl(M.brass, x + Math.cos(a) * 0.55, DH - 0.92, z + Math.sin(a) * 0.55, 0.014, 0.16, 0, 0, 0, 'cyl8');
      b.sph(M.bulb, x + Math.cos(a) * 0.55, DH - 0.8, z + Math.sin(a) * 0.55, 0.03, 0.045, 0.03);
    }
    const l = new THREE.PointLight(0xffb55a, 9, 12, 2);
    l.position.set(x, DH - 1.1, z);
    g.add(l);
    lights.push(l);
  };
  for (const x of [10.5, 20.0]) for (const z of [-7.5, 0.9]) chandelier(x, z);
  chandelier(12.5, AISLE);
  chandelier(18.5, AISLE);
  // brass sconces along the walls, turned low
  // the wall lamps are a scanned brass sconce (CC0, Poly Haven); its bulb is made to glow
  const sconce = (x, z, ry) => {
    placeModel('industrial_wall_sconce', g, {
      x, y: 1.8, z, ry, s: 1.9, envMap, envMapIntensity: 1.2,
      onto: (copy) => copy.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m.name && m.name.includes('bulb')) { m.emissive = new THREE.Color(0xffc070); m.emissiveIntensity = 2.2; m.needsUpdate = true; }
      }),
    });
    if (Math.abs(x - 15) < 4 && Math.abs(ry) < 1.2) return; // the middle pair on the long walls glow without a real light
    const l = new THREE.PointLight(0xffb060, 3.2, 5.5, 2);
    l.position.set(x + Math.sin(ry) * 0.42, 1.98, z + Math.cos(ry) * 0.42);
    g.add(l);
    lights.push(l);
  };
  for (const x of [9, 15, 21]) { sconce(x, DZ0 + 0.1, 0); sconce(x, DZ1 - 0.1, Math.PI); }
  for (const z of [-5.5, -1]) sconce(DX1 - 0.1, z, -Math.PI / 2);

  // ---- tables, chairs, monitors and the figures
  const figures = [];
  const monitorLights = [];
  const monitor = (x, y, z, ry, w, h, tex, bright = 1.0) => {
    const stand = new THREE.Group();
    stand.position.set(x, y, z);
    stand.rotation.y = ry;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.03), M.blackMatte);
    frame.position.y = h / 2 + 0.12;
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.3 * bright, roughness: 0.3 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
    screen.position.set(0, h / 2 + 0.12, 0.017);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.02, 20), M.blackMatte);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10), M.blackMatte);
    post.position.y = 0.06;
    stand.add(frame, screen, foot, post);
    g.add(stand);
    screenMats.push(screenMat);
    // the screens light their figures through emissive glow only: real lights here would cost every pixel in the room
    if (bright > 1.2) {
      const l = new THREE.PointLight(0x9fdcff, 2.2 * bright, 3.5, 2);
      l.position.set(0, h / 2 + 0.2, 0.3);
      stand.add(l);
      monitorLights.push(l);
    }
    return stand;
  };
  const table = (x, z, seats) => {
    b.cyl(cloth, x, 0.75, z, 0.68, 0.04, 0, 0, 0, 'cyl28');
    b.add(new THREE.CylinderGeometry(0.69, 0.6, 0.71, 28, 1, true), clothEdge, x, 0.375, z);
    b.cyl(M.woodDark, x, 0.36, z, 0.06, 0.7, 0, 0, 0, 'cyl8');
    b.cyl(M.woodDark, x, 0.02, z, 0.3, 0.04, 0, 0, 0, 'cyl16');
    // a candle, lit low
    b.cyl(M.ceramic, x + 0.25, 0.79, z - 0.2, 0.02, 0.08, 0, 0, 0, 'cyl8');
    b.sph(M.bulb, x + 0.25, 0.85, z - 0.2, 0.012, 0.02, 0.012);
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * TAU + 0.5;
      const cx = x + Math.cos(a) * 1.05;
      const cz = z + Math.sin(a) * 1.05;
      const face = Math.atan2(x - cx, z - cz);
      // a chair
      b.at(cx, 0, cz, face, 1, () => {
        b.box(M.woodDark, 0, 0.45, 0, 0.44, 0.04, 0.44);
        b.box(M.woodDark, 0, 0.75, -0.2, 0.44, 0.6, 0.04);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(M.woodDark, sx * 0.19, 0.22, sz * 0.19, 0.018, 0.44, 0, 0, 0, 'cyl8');
      });
      // a figure in it, and the monitor it faces, on the table before it
      const f = figure(black);
      f.position.set(cx, 0, cz);
      f.rotation.y = face;
      g.add(f);
      figures.push(f);
      const mx = x + Math.cos(a) * 0.38;
      const mz = z + Math.sin(a) * 0.38;
      monitor(mx, 0.77, mz, face + Math.PI, 0.42, 0.26, uiTexture(Math.floor(r() * 1000)), 0.8 + r() * 0.5);
    }
  };
  table(9.2, -6.6, 3);
  table(9.4, 0.2, 2);
  table(12.6, -6.9, 2);
  table(12.8, -0.1, 3);
  table(16.0, -6.4, 3);
  table(16.2, 0.3, 2);
  table(19.6, -7.0, 2);
  table(19.4, -0.2, 3);
  b.finish();

  // ---- the table at the end of the aisle, with the logo on its screen
  const fb = new Batch(g);
  fb.box(cloth, 22.0, 0.76, AISLE, 1.5, 0.04, 1.1);
  fb.box(clothEdge, 22.0, 0.39, AISLE, 1.5, 0.72, 1.1);
  fb.finish();
  const logoMon = monitor(22.0, 0.78, AISLE, -Math.PI / 2, 0.92, 0.56, logoTexture(), 1.5);
  logoMon.userData.logo = true;

  return { group: g, figures, screenMats, monitorLights, lights, logoMon, outside };
}

/** The cart: a stainless trolley with the bowl of soup on it. The camera rides in the bowl. */
export function buildCart(M, envMap) {
  const cart = new THREE.Group();
  const b = new Batch(cart);
  // the trolley: two shelves on four posts, with wheels
  b.box(M.steel, 0, 0.9, 0, 0.9, 0.04, 0.6);
  b.box(M.steelDull, 0, 0.35, 0, 0.86, 0.03, 0.56);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl(M.steel, sx * 0.42, 0.5, sz * 0.27, 0.016, 0.9, 0, 0, 0, 'cyl8');
    b.cyl(M.dark, sx * 0.42, 0.05, sz * 0.27, 0.05, 0.03, Math.PI / 2, 0, 0, 'cyl16');
  }
  b.box(M.steel, 0, 0.92, -0.31, 0.9, 0.06, 0.02);
  b.cyl(M.steel, 0, 1.0, 0.34, 0.012, 0.9, 0, 0, Math.PI / 2, 'cyl8'); // the push handle, behind
  for (const sx of [-1, 1]) b.cyl(M.steel, sx * 0.42, 0.96, 0.32, 0.012, 0.12, -0.4, 0, 0, 'cyl8');
  // things that ride along: a folded towel, a ladle, a small pot
  b.box(M.towelWhite ?? M.ceramic, 0.3, 0.93, -0.15, 0.2, 0.025, 0.16);
  b.finish();

  // the bowl: white porcelain with a blue band, built large and scaled down so the broth
  // detail is fine; the camera sits at its centre, at the rim
  const bowl = new THREE.Group();
  const S = 0.017; // metres per bowl unit; the bowl is 10 units in radius
  bowl.scale.setScalar(S);
  bowl.position.set(0, 0.92, 0.02);
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xf5f2ea, roughness: 0.2, clearcoat: 0.8, envMap, envMapIntensity: 0.7, side: THREE.DoubleSide });
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    pts.push(new THREE.Vector2(3.5 + Math.sin(u * Math.PI / 2) * 6.5, u * u * 1.5 + u * 4.0));
  }
  pts.push(new THREE.Vector2(10.2, 5.6), new THREE.Vector2(10.2, 5.2));
  bowl.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64), porcelain));
  // the broth, filled right to the rim, rippling
  const broth = brothSurface(10, { light: 0.85, segs: 64 });
  broth.position.y = 5.0;
  bowl.add(broth);
  cart.userData.brothMat = broth.userData.broth;
  // noodles, an egg, naruto, scallion, nori: round the camera, not in front of it
  const noodleMat = new THREE.MeshPhysicalMaterial({ color: 0xf3d68d, roughness: 0.35, clearcoat: 0.7, envMap, envMapIntensity: 0.8, emissive: 0x4a2d08, emissiveIntensity: 0.4 });
  const r = rng(3);
  for (let i = 0; i < 10; i++) {
    const pts2 = [];
    let a = r() * TAU;
    let x = (r() - 0.5) * 10;
    let z = 3 + r() * 5;
    if (i % 2) z = -z;
    for (let k = 0; k <= 14; k++) {
      pts2.push(new THREE.Vector3(x, 5.0 + 0.15 * Math.sin(k * 0.9 + i), z));
      a += (r() - 0.5) * 1.2;
      // turn back toward the middle so no strand leaves the bowl
      const d = Math.hypot(x, z);
      if (d > 7.0) a = Math.atan2(-z, -x) + (r() - 0.5) * 0.8;
      x += Math.cos(a) * 0.9;
      z += Math.sin(a) * 0.9;
    }
    bowl.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 60, 0.22, 6, false), noodleMat));
  }
  const egg = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(2.0, 28, 14), new THREE.MeshStandardMaterial({ color: 0xfdf8ee, roughness: 0.3 }));
  white.scale.set(1, 0.3, 1.25);
  egg.add(white);
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 12), new THREE.MeshStandardMaterial({ color: 0xffa319, roughness: 0.25, emissive: 0xc05a00, emissiveIntensity: 0.5 }));
  yolk.scale.y = 0.7;
  yolk.position.y = 0.15;
  egg.add(yolk);
  egg.position.set(5.5, 5.0, -4.5);
  egg.rotation.y = 0.6;
  bowl.add(egg);
  const nTex = narutoTexture();
  const naruto = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.3, 32), [new THREE.MeshStandardMaterial({ color: 0xfbe9e0 }), new THREE.MeshStandardMaterial({ map: nTex, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0xfbe9e0 })]);
  naruto.position.set(-5.8, 5.05, 4.2);
  naruto.rotation.set(0.1, 1.2, 0.15);
  bowl.add(naruto);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x9be36b, emissive: 0x1f5a12, emissiveIntensity: 0.5 });
  for (let i = 0; i < 14; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.09, 6, 14), ringMat);
    ring.rotation.x = Math.PI / 2;
    const a = r() * TAU;
    const d = 3 + r() * 6;
    ring.position.set(Math.cos(a) * d, 5.1, Math.sin(a) * d);
    bowl.add(ring);
  }
  const nori = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x1d3a20, roughness: 0.4, side: THREE.DoubleSide }));
  nori.position.set(-7.0, 6.2, 5.5);
  nori.rotation.set(0.4, 0.8, 0.1);
  bowl.add(nori);
  // chopsticks resting across the rim, behind the camera
  const stick = new THREE.MeshStandardMaterial({ color: 0xb87a3c, roughness: 0.5 });
  for (const [x, rz] of [[6.4, 0.5], [7.5, 0.42]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 26, 10), stick);
    m.position.set(x, 6.2, 4);
    m.rotation.set(Math.PI / 2 + 0.12, 0, rz);
    bowl.add(m);
  }
  cart.add(bowl);
  cart.userData.bowl = bowl;
  cart.userData.eye = new THREE.Vector3(0, 0.92 + 5.0 * S + 0.045, 0.02); // where the camera sits: just over the rim
  return cart;
}
