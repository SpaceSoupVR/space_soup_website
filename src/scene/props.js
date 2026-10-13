import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A small prop library for the kitchen. Everything is added through a Batch, which bakes each
// piece into one merged mesh per material, so hundreds of pans, spoons and jars cost a handful
// of draw calls.
//
// Units are metres. A prop is built standing on y = 0 around its own origin unless noted.

const TAU = Math.PI * 2;
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

// unit primitives, scaled at the point of use
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16),
  cyl28: new THREE.CylinderGeometry(1, 1, 1, 28),
  cyl28o: new THREE.CylinderGeometry(1, 1, 1, 28, 1, true),
  cone12: new THREE.ConeGeometry(1, 1, 12),
  sph: new THREE.SphereGeometry(1, 16, 10),
  sph8: new THREE.SphereGeometry(1, 10, 6),
  dome: new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2),
  ring: (R, t, seg = 24, arc = TAU) => new THREE.TorusGeometry(R, t, 6, seg, arc),
};
export { G, TAU };

export class Batch {
  constructor(group) {
    this.group = group;
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
  }

  get top() { return this.stack[this.stack.length - 1]; }

  /** Place everything `fn` adds at (x, y, z), turned ry about Y (and rx, rz), scaled s. */
  at(x, y, z, ry, s, fn, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
    this.stack.push(this.top.clone().multiply(_m));
    fn(this);
    this.stack.pop();
  }

  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(this.top.clone().multiply(_m));
    let list = this.buckets.get(mat);
    if (!list) this.buckets.set(mat, (list = []));
    list.push(g);
  }

  box(mat, x, y, z, w, h, d, ry = 0) { this.add(G.box, mat, x, y, z, 0, ry, 0, w, h, d); }
  cyl(mat, x, y, z, r, h, rx = 0, ry = 0, rz = 0, seg = 'cyl16') { this.add(G[seg], mat, x, y, z, rx, ry, rz, r, h, r); }
  sph(mat, x, y, z, rx_, ry_, rz_) { this.add(G.sph, mat, x, y, z, 0, 0, 0, rx_, ry_ ?? rx_, rz_ ?? rx_); }

  finish() {
    for (const [mat, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.buckets.clear();
  }
}

// ------------------------------------------------------------------ cookware

/** A copper pot: body, a darker rim, a brass band, two loop handles, optionally a lid with a knob. */
export function pot(b, M, { r = 0.2, h = 0.2, mat = M.copper, lid = false, handles = 'loops', steam = false } = {}) {
  b.cyl(mat, 0, h / 2, 0, r, h, 0, 0, 0, 'cyl28');
  b.add(G.ring(r, 0.007, 32), M.brass, 0, h, 0, Math.PI / 2);
  b.add(G.ring(r * 1.005, 0.005, 32), M.brass, 0, h * 0.18, 0, Math.PI / 2);
  if (lid) {
    b.cyl(M.copperWorn, 0, h + 0.012, 0, r * 1.02, 0.025, 0, 0, 0, 'cyl28');
    b.sph(M.brass, 0, h + 0.04, 0, 0.022, 0.022, 0.022);
  } else {
    b.cyl(M.dark, 0, h - 0.003, 0, r * 0.95, 0.004, 0, 0, 0, 'cyl28');
  }
  if (handles === 'loops') {
    for (const sx of [-1, 1]) b.add(G.ring(0.04 + r * 0.12, 0.009, 14, Math.PI), M.iron, sx * (r + 0.005), h * 0.78, 0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  } else if (handles === 'long') {
    b.box(M.iron, r + 0.13, h * 0.82, 0, 0.26, 0.02, 0.03);
    b.cyl(M.woodDark, r + 0.3, h * 0.82, 0, 0.018, 0.12, 0, 0, Math.PI / 2);
  }
}

/** A frying pan: low flared wall, a dark inside, a long handle toward +x. */
export function pan(b, M, { r = 0.16, mat = M.iron, handle = 0.3, inside = M.dark } = {}) {
  b.add(new THREE.CylinderGeometry(r, r * 0.84, 0.05, 28, 1, true), mat, 0, 0.025, 0, 0, 0, 0, 1, 1, 1);
  b.cyl(mat, 0, 0.002, 0, r * 0.84, 0.004, 0, 0, 0, 'cyl28');
  b.cyl(inside, 0, 0.005, 0, r * 0.82, 0.003, 0, 0, 0, 'cyl28');
  b.add(G.ring(r, 0.006, 32), mat, 0, 0.05, 0, Math.PI / 2);
  b.box(M.steel, r + handle * 0.4, 0.045, 0, handle * 0.8, 0.012, 0.026);
  b.cyl(M.woodDark, r + handle * 0.88, 0.045, 0, 0.016, handle * 0.26, 0, 0, Math.PI / 2);
}

export function saucepan(b, M, { r = 0.12, h = 0.1, mat = M.copper, lid = false } = {}) {
  pot(b, M, { r, h, mat, lid, handles: 'long' });
}

// ------------------------------------------------------------------ utensils (built along +Y, hung from the origin)

export function woodenSpoon(b, M, L = 0.32) {
  b.cyl(M.wood, 0, L / 2, 0, 0.009, L, 0, 0, 0, 'cyl8');
  b.sph(M.wood, 0, L + 0.04, 0, 0.034, 0.05, 0.008);
  b.sph(M.wood, 0, L - 0.005, 0, 0.012, 0.02, 0.01);
}

export function ladle(b, M, L = 0.36) {
  b.cyl(M.steel, 0, L / 2, 0, 0.006, L, 0, 0, 0, 'cyl8');
  b.add(G.ring(0.03, 0.005, 12, Math.PI), M.steel, 0, L + 0.002, 0, 0, 0, Math.PI);
  b.add(G.dome, M.steel, 0, L + 0.045, 0.028, Math.PI, 0, 0, 0.045, 0.04, 0.045);
}

export function whisk(b, M, L = 0.34) {
  b.cyl(M.steel, 0, L * 0.3, 0, 0.008, L * 0.6, 0, 0, 0, 'cyl8');
  for (let i = 0; i < 6; i++) b.add(G.ring(0.035, 0.0018, 18), M.steel, 0, L * 0.58 + 0.07, 0, 0, (i / 6) * Math.PI, 0, 1, 2.1, 1);
}

export function spatula(b, M, L = 0.34) {
  b.cyl(M.steel, 0, L / 2, 0, 0.005, L, 0, 0, 0, 'cyl8');
  b.cyl(M.woodDark, 0, L * 0.72, 0, 0.012, L * 0.3, 0, 0, 0, 'cyl8');
  b.box(M.steel, 0, L + 0.04, 0, 0.07, 0.09, 0.004);
  for (let i = -1; i <= 1; i++) b.box(M.dark, i * 0.02, L + 0.05, 0.003, 0.005, 0.05, 0.002);
}

export function skimmer(b, M, L = 0.36) {
  b.cyl(M.steel, 0, L / 2, 0, 0.006, L, 0, 0, 0, 'cyl8');
  b.cyl(M.steel, 0, L + 0.06, 0, 0.065, 0.004, Math.PI / 2, 0, 0, 'cyl16');
  b.add(G.ring(0.065, 0.004, 24), M.steel, 0, L + 0.06, 0);
}

export function tongs(b, M, L = 0.3) {
  for (const s of [-1, 1]) b.box(M.steel, s * 0.012, L / 2, 0, 0.009, L, 0.006);
  b.add(G.ring(0.014, 0.004, 10, Math.PI), M.steel, 0, L, 0, 0, 0, 0);
  for (const s of [-1, 1]) b.cyl(M.steel, s * 0.018, 0.008, 0, 0.012, 0.022, 0, 0, 0, 'cyl8');
}

/** A chef's knife lying along +x, blade up toward +y: a steel blade and a wooden handle. */
export function knife(b, M, L = 0.2) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.045);
  s.lineTo(L * 0.78, 0.045);
  s.quadraticCurveTo(L * 1.02, 0.036, L, 0);
  s.lineTo(0, 0);
  s.closePath();
  b.add(new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false }), M.steel, 0, 0, -0.001);
  b.box(M.woodDark, -0.055, 0.025, 0, 0.11, 0.024, 0.017);
  for (const x of [-0.085, -0.055, -0.025]) b.cyl(M.brass, x, 0.025, 0, 0.0035, 0.019, Math.PI / 2, 0, 0, 'cyl8');
}

export function cleaver(b, M) {
  b.box(M.steel, 0.085, 0.045, 0, 0.17, 0.09, 0.003);
  b.cyl(M.dark, 0.14, 0.07, 0, 0.007, 0.006, Math.PI / 2, 0, 0, 'cyl8');
  b.box(M.woodDark, -0.05, 0.045, 0, 0.11, 0.024, 0.02);
}

export function cuttingBoard(b, M, w = 0.5, d = 0.32, t = 0.03) {
  b.box(M.woodLight, 0, t / 2, 0, w, t, d);
  b.box(M.wood, 0, t + 0.001, 0, w * 0.96, 0.002, d * 0.92);
  b.cyl(M.dark, w / 2 - 0.04, t / 2, 0, 0.012, t + 0.002, 0, 0, 0, 'cyl8');
}

// ------------------------------------------------------------------ glass, bottles, jars

export function bottle(b, M, { h = 0.3, r = 0.04, mat = M.glassGreen, cap = M.brass, label = true } = {}) {
  b.cyl(mat, 0, h * 0.35, 0, r, h * 0.7, 0, 0, 0, 'cyl16');
  b.add(new THREE.CylinderGeometry(r * 0.38, r, h * 0.16, 16), mat, 0, h * 0.78, 0);
  b.cyl(mat, 0, h * 0.92, 0, r * 0.38, h * 0.16, 0, 0, 0, 'cyl16');
  b.cyl(cap, 0, h + 0.002, 0, r * 0.42, h * 0.045, 0, 0, 0, 'cyl16');
  if (label) b.cyl(M.label, 0, h * 0.34, 0, r * 1.01, h * 0.28, 0, 0, 0, 'cyl16');
}

export function jar(b, M, { h = 0.2, r = 0.07, content = M.pasta, lid = M.brass, fill = 0.8 } = {}) {
  b.cyl(M.glass, 0, h / 2, 0, r, h, 0, 0, 0, 'cyl16');
  b.cyl(content, 0, (h * fill) / 2 + 0.004, 0, r * 0.92, h * fill, 0, 0, 0, 'cyl16');
  b.cyl(lid, 0, h + 0.012, 0, r * 1.04, 0.026, 0, 0, 0, 'cyl16');
  b.cyl(M.label, 0, h * 0.5, 0, r * 1.012, h * 0.28, 0, 0, 0, 'cyl16');
}

export function spiceJar(b, M, lid) {
  b.cyl(M.glass, 0, 0.03, 0, 0.022, 0.06, 0, 0, 0, 'cyl8');
  b.cyl(lid, 0, 0.065, 0, 0.0235, 0.012, 0, 0, 0, 'cyl8');
}

export function pepperMill(b, M, h = 0.22) {
  b.cyl(M.woodDark, 0, h * 0.35, 0, 0.03, h * 0.7, 0, 0, 0, 'cyl16');
  b.add(G.sph, M.woodDark, 0, h * 0.78, 0, 0, 0, 0, 0.034, 0.05, 0.034);
  b.sph(M.brass, 0, h * 0.95, 0, 0.012, 0.012, 0.012);
  b.cyl(M.brass, 0, h * 0.04, 0, 0.032, 0.012, 0, 0, 0, 'cyl16');
}

// ------------------------------------------------------------------ food

export function tomato(b, M, r = 0.045) {
  b.sph(M.tomato, 0, r * 0.82, 0, r, r * 0.86, r);
  b.cyl(M.leaf, 0, r * 1.62, 0, r * 0.45, r * 0.12, 0, 0, 0, 'cyl8');
  b.cyl(M.leaf, 0, r * 1.72, 0, r * 0.1, r * 0.3, 0, 0, 0, 'cyl8');
}

export function eggplant(b, M) {
  b.add(G.sph, M.eggplant, 0, 0.055, 0, 0, 0, 0, 0.055, 0.06, 0.13);
  b.cyl(M.leaf, 0, 0.06, 0.125, 0.04, 0.03, Math.PI / 2, 0, 0, 'cyl8');
  b.cyl(M.leaf, 0, 0.06, 0.15, 0.012, 0.04, Math.PI / 2, 0, 0, 'cyl8');
}

export function zucchini(b, M, L = 0.24) {
  b.cyl(M.zucchini, 0, 0.032, 0, 0.032, L, Math.PI / 2, 0, 0, 'cyl16');
  b.sph(M.zucchini, 0, 0.032, L / 2, 0.032, 0.032, 0.02);
  b.cyl(M.leaf, 0, 0.034, -L / 2 - 0.012, 0.012, 0.03, Math.PI / 2, 0, 0, 'cyl8');
}

export function bellPepper(b, M, mat) {
  b.add(G.sph, mat, 0, 0.055, 0, 0, 0, 0, 0.05, 0.058, 0.05);
  b.add(G.sph, mat, 0.03, 0.05, 0.02, 0, 0, 0, 0.032, 0.05, 0.032);
  b.cyl(M.leaf, 0, 0.115, 0, 0.012, 0.03, 0, 0, 0, 'cyl8');
}

export function onion(b, M) {
  b.add(G.sph, M.onion, 0, 0.05, 0, 0, 0, 0, 0.056, 0.05, 0.056);
  b.add(G.cone12, M.onion, 0, 0.11, 0, 0, 0, 0, 0.014, 0.045, 0.014);
}

export function garlic(b, M) {
  b.add(G.sph, M.garlic, 0, 0.03, 0, 0, 0, 0, 0.035, 0.03, 0.035);
  b.add(G.cone12, M.garlic, 0, 0.07, 0, 0, 0, 0, 0.008, 0.035, 0.008);
}

export function lemon(b, M) {
  b.add(G.sph, M.lemon, 0, 0.036, 0, 0, 0, Math.PI / 2, 0.034, 0.047, 0.034);
  b.sph(M.lemon, 0.046, 0.036, 0, 0.01, 0.01, 0.01);
}

export function baguette(b, M, L = 0.55) {
  b.cyl(M.bread, 0, 0.036, 0, 0.036, L, Math.PI / 2, 0, 0, 'cyl16');
  b.sph(M.bread, 0, 0.036, L / 2, 0.036, 0.036, 0.03);
  b.sph(M.bread, 0, 0.036, -L / 2, 0.036, 0.036, 0.03);
  for (let i = -2; i <= 2; i++) b.box(M.breadDark, 0, 0.068, i * 0.09, 0.012, 0.005, 0.05);
}

export function cheeseWedge(b, M) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.2, 0); s.lineTo(0, 0.09); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  b.add(g, M.cheese, -0.1, 0, 0.045, 0, 0, 0);
  for (const [x, z] of [[-0.04, 0.03], [0.02, 0.06], [-0.07, 0.07]]) b.sph(M.cheeseHole, x, 0.012, z, 0.008, 0.004, 0.008);
}

export function bread(b, M) {
  b.add(G.sph, M.bread, 0, 0.05, 0, 0, 0, 0, 0.11, 0.06, 0.085);
  for (let i = -1; i <= 1; i++) b.box(M.breadDark, i * 0.04, 0.105, 0, 0.006, 0.004, 0.09, 0.4);
}

export function eggBowl(b, M) {
  b.add(G.dome, M.ceramic, 0, 0.09, 0, Math.PI, 0, 0, 0.11, 0.09, 0.11);
  for (let i = 0; i < 6; i++) b.sph(M.egg, Math.cos(i * 1.7) * 0.05, 0.09 + (i % 2) * 0.03, Math.sin(i * 1.7) * 0.05, 0.024, 0.03, 0.024);
}

// ------------------------------------------------------------------ bigger things

/** A stack of plates. */
export function plateStack(b, M, n = 14, r = 0.13) {
  for (let i = 0; i < n; i++) {
    b.cyl(M.ceramic, 0, 0.012 + i * 0.017, 0, r, 0.014, 0, 0, 0, 'cyl28');
    b.add(G.ring(r, 0.004, 28), M.ceramicEdge, 0, 0.018 + i * 0.017, 0, Math.PI / 2);
  }
}

export function bowlStack(b, M, n = 4, r = 0.13) {
  for (let i = 0; i < n; i++) {
    b.add(G.dome, M.ceramic, 0, 0.05 + i * 0.03, 0, Math.PI, 0, 0, r * (1 - i * 0.05), 0.06, r * (1 - i * 0.05));
    b.add(G.ring(r * (1 - i * 0.05), 0.004, 24), M.ceramicEdge, 0, 0.05 + i * 0.03, 0, Math.PI / 2);
  }
}

export function bookStack(b, M, cols) {
  let y = 0;
  cols.forEach((c, i) => {
    const h = 0.03 + (i % 3) * 0.008;
    b.box(c, 0.004 * (i % 2), y + h / 2, 0, 0.2 - (i % 3) * 0.015, h, 0.28 - (i % 2) * 0.02, (i % 3) * 0.08 - 0.06);
    b.box(M.paper, 0.012, y + h / 2, 0, 0.185 - (i % 3) * 0.015, h * 0.82, 0.265 - (i % 2) * 0.02, (i % 3) * 0.08 - 0.06);
    y += h;
  });
}

export function kettle(b, M) {
  b.add(G.sph, M.copper, 0, 0.1, 0, 0, 0, 0, 0.14, 0.1, 0.14);
  b.cyl(M.copper, 0, 0.21, 0, 0.07, 0.06, 0, 0, 0, 'cyl16');
  b.cyl(M.copperWorn, 0, 0.245, 0, 0.075, 0.016, 0, 0, 0, 'cyl16');
  b.sph(M.brass, 0, 0.27, 0, 0.018, 0.018, 0.018);
  b.cyl(M.copper, -0.17, 0.17, 0, 0.022, 0.2, 0, 0, Math.PI / 2 + 0.7, 'cyl16');
  b.add(G.ring(0.11, 0.012, 20, Math.PI), M.woodDark, 0, 0.24, 0, 0, Math.PI / 2, 0);
}

export function mortar(b, M) {
  b.add(G.dome, M.stone, 0, 0.06, 0, Math.PI, 0, 0, 0.08, 0.06, 0.08);
  b.cyl(M.stone, 0, 0.005, 0, 0.04, 0.01, 0, 0, 0, 'cyl16');
  b.cyl(M.stone, 0.03, 0.09, 0, 0.014, 0.16, 0, 0, -0.45, 'cyl16');
  b.sph(M.stone, 0.075, 0.165, 0, 0.022, 0.022, 0.022);
}

export function knifeBlock(b, M) {
  b.add(new THREE.BoxGeometry(0.2, 0.22, 0.12), M.woodDark, 0, 0.11, 0, -0.0, 0, 0, 1, 1, 1);
  b.box(M.wood, 0, 0.222, 0, 0.2, 0.004, 0.12);
  for (let i = 0; i < 5; i++) b.box(M.woodDark, -0.07 + i * 0.035, 0.25, 0, 0.018, 0.075 + (i % 2) * 0.02, 0.014);
}

export function crock(b, M) {
  b.cyl(M.ceramic, 0, 0.09, 0, 0.075, 0.18, 0, 0, 0, 'cyl28');
  b.add(G.ring(0.075, 0.006, 28), M.ceramicEdge, 0, 0.18, 0, Math.PI / 2);
  b.cyl(M.ceramicBlue, 0, 0.07, 0, 0.0765, 0.03, 0, 0, 0, 'cyl28');
}

export function basket(b, M, r = 0.2, h = 0.14) {
  b.add(new THREE.CylinderGeometry(r, r * 0.8, h, 20, 1, true), M.wicker, 0, h / 2, 0, 0, 0, 0, 1, 1, 1);
  b.cyl(M.wicker, 0, 0.004, 0, r * 0.8, 0.008, 0, 0, 0, 'cyl16');
  b.add(G.ring(r, 0.012, 24), M.wicker, 0, h, 0, Math.PI / 2);
}

export function crate(b, M, w = 0.55, d = 0.38, h = 0.22) {
  b.box(M.woodLight, 0, 0.012, 0, w, 0.024, d);
  for (const sx of [-1, 1]) b.box(M.woodLight, sx * (w / 2 - 0.012), h / 2, 0, 0.024, h, d);
  for (const sz of [-1, 1]) b.box(M.woodLight, 0, h / 2, sz * (d / 2 - 0.012), w, h, 0.024);
  for (let i = -1; i <= 1; i++) b.box(M.wood, i * (w / 3), h * 0.5, d / 2 + 0.001, 0.01, h * 0.9, 0.002);
}

export function pendant(b, M, h = 0.5) {
  b.cyl(M.dark, 0, h / 2 + 0.1, 0, 0.004, h, 0, 0, 0, 'cyl8');
  b.add(new THREE.CylinderGeometry(0.08, 0.24, 0.2, 24, 1, true), M.iron, 0, 0, 0, 0, 0, 0, 1, 1, 1);
  b.add(new THREE.CylinderGeometry(0.075, 0.235, 0.012, 24, 1, true), M.brass, 0, -0.1, 0);
  b.sph(M.bulb, 0, -0.07, 0, 0.055, 0.055, 0.055);
}

export function stool(b, M) {
  b.cyl(M.wood, 0, 0.5, 0, 0.17, 0.04, 0, 0, 0, 'cyl16');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    b.cyl(M.woodDark, Math.cos(a) * 0.12, 0.25, Math.sin(a) * 0.12, 0.016, 0.5, 0.18 * Math.sin(a), 0, -0.18 * Math.cos(a), 'cyl8');
  }
  b.add(G.ring(0.13, 0.01, 16), M.woodDark, 0, 0.22, 0, Math.PI / 2);
}

/** A braid of garlic or onions hanging from a hook at the origin. */
export function braid(b, M, mat, n = 8, size = 0.05) {
  b.cyl(M.rope, 0, -(n * size * 0.9) / 2, 0, 0.008, n * size * 0.9 + 0.1, 0, 0, 0, 'cyl8');
  for (let i = 0; i < n; i++) {
    const s = size * (1 - i * 0.025);
    b.add(G.sph, mat, ((i % 2) - 0.5) * s * 0.9, -0.05 - i * size * 0.9, 0.0, 0, 0, 0, s, s * 0.9, s);
  }
}

export function herbBunch(b, M) {
  b.cyl(M.rope, 0, 0.02, 0, 0.014, 0.04, 0, 0, 0, 'cyl8');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    b.add(G.cone12, M.herb, Math.cos(a) * 0.025, -0.07, Math.sin(a) * 0.025, Math.PI + Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25, 0.022, 0.18, 0.022);
  }
}

export function chiliString(b, M, n = 9) {
  b.cyl(M.rope, 0, -(n * 0.04) / 2, 0, 0.005, n * 0.04 + 0.06, 0, 0, 0, 'cyl8');
  for (let i = 0; i < n; i++) b.add(G.cone12, M.chili, ((i % 2) - 0.5) * 0.04, -0.04 - i * 0.04, 0, Math.PI, 0, ((i % 2) - 0.5) * 0.4, 0.014, 0.11, 0.014);
}

export function towel(b, M, w = 0.4, h = 0.5) {
  const stripes = 7;
  for (let i = 0; i < stripes; i++) b.box(i % 2 ? M.towelWhite : M.towelBlue, 0, -h / 2, -w / 2 + (i + 0.5) * (w / stripes), 0.012, h, w / stripes + 0.0005);
}
