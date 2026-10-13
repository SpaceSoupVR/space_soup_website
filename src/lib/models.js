import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Loads the CC0 glTF props (Poly Haven) from /public/models, once each, and hands out
// placed copies. A copy shares geometry with the original; its materials are cloned per
// tint so a brass pot can be shown as copper without touching the other copies.

const loader = new GLTFLoader();
const cache = new Map();

export function loadModel(name) {
  if (!cache.has(name)) {
    cache.set(name, new Promise((resolve, reject) => {
      loader.load(`/models/${name}/${name}_1k.gltf`, (gltf) => resolve(gltf.scene), undefined, reject);
    }));
  }
  return cache.get(name);
}

/** Resolves once every model asked for so far has loaded and its copies are placed. */
export function allModelsLoaded() {
  return Promise.all([...cache.values()].filter((v) => v instanceof Promise)).then(() => new Promise((r) => setTimeout(r, 0)));
}

/**
 * Place a model: `onto` receives the ready copy. Options:
 *  tint: multiply colour (hex) for every material; envMap / envMapIntensity; shadow (default true);
 *  rough: override roughness; metal: override metalness; emissive: hex, emissiveIntensity.
 */
export function placeModel(name, parent, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, tint, envMap, envMapIntensity = 1, shadow = true, rough, metal, emissive, emissiveIntensity = 1, onto } = {}) {
  const key = `${tint ?? ''}|${rough ?? ''}|${metal ?? ''}|${emissive ?? ''}`;
  loadModel(name).then((src) => {
    const copy = src.clone();
    copy.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map((m) => {
        const id = `${m.uuid}|${key}`;
        let mm = cache.get(id);
        if (!mm) {
          mm = m.clone();
          if (tint !== undefined) mm.color.multiply(new THREE.Color(tint));
          if (rough !== undefined) mm.roughness = rough;
          if (metal !== undefined) mm.metalness = metal;
          if (emissive !== undefined) { mm.emissive = new THREE.Color(emissive); mm.emissiveIntensity = emissiveIntensity; }
          if (envMap) { mm.envMap = envMap; mm.envMapIntensity = envMapIntensity; }
          mm.needsUpdate = true;
          cache.set(id, mm);
        }
        return mm;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = shadow;
      o.receiveShadow = shadow;
    });
    copy.position.set(x, y, z);
    copy.rotation.set(rx, ry, rz, 'YXZ');
    copy.scale.setScalar(s);
    parent.add(copy);
    onto?.(copy);
  }).catch((e) => console.warn(`model ${name} failed`, e));
}
