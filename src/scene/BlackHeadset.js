import * as THREE from 'three';

// A very simple black VR headset: a soft rounded block with a nose notch cut up into its
// bottom edge, a dark glass front, and a single black strap that runs round the head from
// the sides. Nothing over the top, no cameras, no lights.
//
// Local space: +Z is the front (the glass), -Z is the face side and the strap.
// About 0.19 m wide, so one unit is one metre.

function roundedRect(w, h, r) {
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

/** A rounded rectangle with a nose notch cut up into the bottom edge: nb wide at the bottom, nt at the top, nd deep. */
function notched(w, h, r, nb, nt, nd) {
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(-nb / 2, -hh);
  s.quadraticCurveTo(-nt / 2 - 0.003, -hh + nd * 0.85, -nt / 2 + 0.004, -hh + nd);
  s.lineTo(nt / 2 - 0.004, -hh + nd);
  s.quadraticCurveTo(nt / 2 + 0.003, -hh + nd * 0.85, nb / 2, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function slab(shape, depth, bevel, z0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18,
  });
  g.translate(0, 0, z0);
  return g;
}

export const HINGE_X = 0.097; // where the strap leaves the body

export function buildBlackHeadset(envMap, { strap: withStrap = true } = {}) {
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, envMap, envMapIntensity: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.06, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03, envMap, envMapIntensity: 0.6 });
  const foam = new THREE.MeshStandardMaterial({ color: 0x131315, roughness: 0.95 });
  const band = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.9 });

  // the body: one rounded block, with the nose notch
  g.add(new THREE.Mesh(slab(notched(0.18, 0.09, 0.03, 0.058, 0.03, 0.026), 0.05, 0.012, -0.025), body));
  // the glass front, a hair proud of it, notched the same way
  g.add(new THREE.Mesh(slab(notched(0.158, 0.07, 0.024, 0.05, 0.026, 0.022), 0.003, 0.002, 0.037), glass));
  g.userData.glass = glass; // so the glass can be lit from outside
  // the foam against the face, with the opening and the notch
  const gasket = notched(0.168, 0.08, 0.028, 0.054, 0.028, 0.014);
  gasket.holes.push(roundedRect(0.122, 0.046, 0.02));
  const gasketGeo = slab(gasket, 0.018, 0.005, 0);
  gasketGeo.rotateY(Math.PI);
  gasketGeo.translate(0, 0, -0.03);
  g.add(new THREE.Mesh(gasketGeo, foam));

  if (withStrap) {
    // one strap round the head from the sides; nothing over the top
    const pts = [
      [-HINGE_X, 0, -0.01], [-0.11, 0, -0.07], [-0.094, 0, -0.15], [-0.052, 0, -0.205], [0, 0, -0.218],
      [0.052, 0, -0.205], [0.094, 0, -0.15], [0.11, 0, -0.07], [HINGE_X, 0, -0.01],
    ].map((p) => new THREE.Vector3(...p));
    const loop = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.011, 6, false), band);
    loop.scale.set(1, 2.4, 1);
    g.add(loop);
  }
  return g;
}
