import * as THREE from 'three';
import { createEmblemMaterial, headGeometry, HEAD_POS } from './Emblem.js';
import { buildBlackHeadset, HINGE_X } from './BlackHeadset.js';
import { patchReveal } from '../lib/reveal.js';

// The headset starts as the logo: the same flat, glitchy, slightly creepy line art, cut out of the
// emblem so it can move on its own. As you scroll it glitches, and a scan sweeps up it and swaps it
// for a real 3D headset: a very simple black one (the same one that drops off at the end). Two
// black straps then creep out of its sides toward you, and it is sucked onto your face.
//
// Local space: the logo plane and the headset's visor face +Z; the straps grow out toward +Z.

const LAYERS = 9;
const LAYER_GAP = 0.04;
const SEGS = 80;
const STRAP_LEN = 3.6;
const MODEL_W = 2.18; // the model is scaled to the logo's width
const MODEL_SRC_W = 0.19;
const CAP_X = HINGE_X * (MODEL_W / MODEL_SRC_W); // where the straps leave the model's sides
const CAP_Y = 0;
const CAP_Z0 = -0.3;
const BAND = 0.3; // strap height
const THICK = 0.08;
const RING = 8;

/** A flat black 3D band whose centreline is rewritten every frame. */
function strapMesh(mat) {
  const hw = BAND / 2;
  const ht = THICK / 2;
  const ch = ht * 0.8;
  const prof = [
    [-hw + ch, ht], [hw - ch, ht], [hw, ht - ch], [hw, -ht + ch],
    [hw - ch, -ht], [-hw + ch, -ht], [-hw, -ht + ch], [-hw, ht - ch],
  ];
  const nv = (SEGS + 1) * RING + 1;
  const idx = [];
  for (let i = 0; i < SEGS; i++) {
    for (let k = 0; k < RING; k++) {
      const a = i * RING + k;
      const b = i * RING + ((k + 1) % RING);
      const c = (i + 1) * RING + k;
      const d = (i + 1) * RING + ((k + 1) % RING);
      idx.push(a, c, b, b, c, d);
    }
  }
  const tip = SEGS * RING;
  for (let k = 0; k < RING; k++) idx.push(tip + k, tip + ((k + 1) % RING), nv - 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.prof = prof;
  return mesh;
}

export class Headset {
  constructor(envMap) {
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.time = 0;

    // The logo, stacked: the front layer is the crisp glitchy outline, and
    // dimmer, cooler, slightly out-of-sync copies sit behind it. Still flat line
    // art, but it reads as thick, especially as it comes at you.
    const geo = headGeometry();
    this.layers = [];
    for (let i = 0; i < LAYERS; i++) {
      const mat = createEmblemMaterial();
      mat.uniforms.uBodyAlpha.value = 0;
      if (i) mat.uniforms.uTint.value.setRGB(0.55, 0.85, 1.0);
      const plane = new THREE.Mesh(geo, mat);
      plane.position.z = -i * LAYER_GAP;
      plane.renderOrder = -i;
      this.group.add(plane);
      this.layers.push({ mat, plane, k: i ? 0.5 * (1 - i / LAYERS) : 1 });
    }

    // The real model: plain and black. It sits with its glass on the logo's plane and is hidden
    // above a moving height until the scan reveals it.
    const scale = MODEL_W / MODEL_SRC_W;
    this.model = buildBlackHeadset(envMap, { strap: false });
    this.model.scale.setScalar(scale);
    this.model.position.z = -0.04 * scale;
    const seen = new Set();
    this.model.traverse((o) => {
      if (o.isMesh && !seen.has(o.material)) { seen.add(o.material); patchReveal(o.material); }
    });
    this.model.visible = false;
    this.group.add(this.model);

    // black straps, a little glossy so they read against the dark through reflections and rim light
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.4, metalness: 0.3, envMap, envMapIntensity: 1.2, side: THREE.DoubleSide });
    this.straps = [-1, 1].map((sx) => {
      const mesh = strapMesh(strapMat);
      this.group.add(mesh);
      return { mesh, sx };
    });
    this.rest = new THREE.Vector3(HEAD_POS.x, HEAD_POS.y, HEAD_POS.z);
  }

  /** alpha: the flat logo's opacity; show: the 3D model exists; extend: how far the straps have
   *  grown (0..1); come: the lunge at the camera (0..1) */
  update(t, { glitch = 0, alpha = 1, show = false, extend = 0, come = 0 }) {
    this.model.visible = show;
    // the glass wakes up: it turns white and glows as the headset comes at you
    const glass = this.model.userData.glass;
    if (glass) {
      const on = Math.pow(Math.min(1, come / 0.85), 1.6);
      const flicker = 0.85 + 0.15 * Math.sin(t * 37.0) * Math.sin(t * 11.3);
      glass.color.setRGB(0.012 + on * 0.95, 0.012 + on * 0.95, 0.016 + on * 0.95);
      glass.emissive.setRGB(1, 1, 1);
      glass.emissiveIntensity = on * 4.5 * flicker;
      glass.roughness = 0.06 + on * 0.3;
      glass.metalness = 0.35 * (1 - on);
    }
    this.layers.forEach(({ mat, plane, k }, i) => {
      const u = mat.uniforms;
      u.uTime.value = t + i * 0.05;
      u.uGlitchHead.value = glitch * (1 + i * 0.12);
      u.uHeadAlpha.value = alpha * k;
      plane.visible = alpha * k > 0.002;
    });

    const grow = extend * extend * (3 - 2 * extend);
    // the straps creep out from the ear caps toward the viewer, wriggling as they grow
    const amp = 0.05 + 0.3 * Math.sin(Math.PI * Math.min(1, extend)) + 0.2 * come;
    const out = 0.1;
    const centre = new THREE.Vector3();
    const prev = new THREE.Vector3();
    const T = new THREE.Vector3();
    const W = new THREE.Vector3();
    const N = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const pt = (s, sx, len, out2, out3) => {
      const env = Math.min(1, s / 0.7);
      const wave = Math.sin(s * 2.5 - t * 5.5 + sx) * amp * env;
      const wave2 = Math.cos(s * 2.0 - t * 4.6) * amp * 0.55 * env;
      return out3.set(sx * (CAP_X + out2 * (1 - Math.exp(-s * 1.1))) + wave, CAP_Y + wave2, CAP_Z0 + s);
    };
    for (const { mesh, sx } of this.straps) {
      mesh.visible = grow > 0.002;
      if (!mesh.visible) continue;
      const p = mesh.geometry.attributes.position;
      const prof = mesh.userData.prof;
      const len = STRAP_LEN * grow;
      for (let i = 0; i <= SEGS; i++) {
        const s = (i / SEGS) * len;
        pt(s, sx, len, out, centre);
        pt(Math.min(len, s + 0.02), sx, len, out, T);
        pt(Math.max(0, s - 0.02), sx, len, out, prev);
        T.sub(prev).normalize();
        W.copy(Y).addScaledVector(T, -Y.dot(T)).normalize();
        N.crossVectors(T, W).normalize();
        // the tip tapers to a rounded point, so a growing strap never looks like a block
        const u = Math.min(1, (len - s) / 0.45);
        const sc = Math.sqrt(1 - (1 - u) * (1 - u));
        for (let k = 0; k < RING; k++) {
          p.setXYZ(i * RING + k,
            centre.x + (W.x * prof[k][0] + N.x * prof[k][1]) * sc,
            centre.y + (W.y * prof[k][0] + N.y * prof[k][1]) * sc,
            centre.z + (W.z * prof[k][0] + N.z * prof[k][1]) * sc);
        }
        if (i === SEGS) p.setXYZ(SEGS * RING + RING, centre.x, centre.y, centre.z);
      }
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
}
