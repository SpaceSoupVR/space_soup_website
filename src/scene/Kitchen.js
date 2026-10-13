import * as THREE from 'three';
import { buildBlackHeadset } from './BlackHeadset.js';
import { buildDining, buildCart, AISLE } from './Dining.js';
import { buildLadle } from './Ladle.js';
import { ramp, lerp, smooth, track } from '../lib/keys.js';
import { placeModel } from '../lib/models.js';
import { hammeredCopperMaps, brassMaps, floorMaps, pbrSet, canvas, toTexture } from '../lib/maps.js';
import { Steam } from '../lib/steam.js';
import { GLSL_NOISE } from '../lib/glsl.js';
import { Batch, G, TAU, plateStack, bowlStack, crock, ladle, whisk, skimmer, tongs, spatula, knife, knifeBlock, kettle, bottle, jar } from './props.js';

// The kitchen at the end of the journey, after the great restaurant kitchens: a barrel vault
// of cream plaster with brick arch ribs, white tiled walls, a black-and-brass range island
// under a huge brass hood whose panels glow from inside, copper pots hung all round its
// edge, a steel shelf of plates beneath, purple swing doors with an arched transom, steel
// shelving with wrought scroll brackets, and great copper stockpots in the foreground.
// Cookware and produce are real scanned models (CC0, Poly Haven), tinted to copper.
//
// You arrive in a bowl of soup on a steel cart beside the island, filled to the rim, looking
// out over the edge. The cart is pushed across the kitchen, through the doors, into the dining
// room (see Dining.js), to the table at the end whose monitor shows the logo. The headset drops.
//
// World: metres. Floor at y = 0. The island is ahead at -Z; the doors are at +X.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the cart's journey over the kitchen's progress kk (0..1): still by the island, then across to
// the doors, through them, down the dining room's aisle, and to a stop before the last table
const CART = {
  x: track([[0, 2.9], [0.14, 2.9], [0.3, 4.6, 'inOut'], [0.42, 6.6, 'linear'], [0.6, 10.6, 'linear'], [0.84, 19.6, 'out'], [1, 19.6]]),
  z: track([[0, -0.9], [0.14, -0.9], [0.3, -2.6, 'inOut'], [0.42, AISLE, 'out'], [1, AISLE]]),
  yaw: track([[0, 0.855], [0.14, 0.855], [0.3, -0.9, 'inOut'], [0.42, -Math.PI / 2, 'out'], [1, -Math.PI / 2]]),
  // the camera, riding in the bowl: it looks round the kitchen, then at the figures either side
  look: track([[0, 0], [0.05, 0.3, 'inOut'], [0.11, -0.2, 'inOut'], [0.17, 0], [0.5, 0], [0.58, 0.42, 'inOut'], [0.68, -0.42, 'inOut'], [0.78, 0, 'inOut'], [1, 0]]),
  // the cut keeps us looking down at the broth, as we were in the ladle; then we slowly look up to see it going
  pitch: track([[0, -1.3], [0.025, -1.3], [0.13, 0.48, 'inOut'], [0.2, 0.42], [0.3, -0.08, 'inOut'], [0.5, -0.07], [0.86, -0.07], [0.92, -0.2, 'inOut'], [1.0, -0.12, 'inOut']]),
  fov: track([[0, 66], [1, 66]]),
  // the ladle that pours us into the bowl: held level over it (we are in it at the cut), then tipped, then lifted away
  // we are already in the bowl at the cut; the ladle that scooped us is right above, emptied, and tilts back and lifts away
  ladleY: track([[0, 1.3], [0.1, 1.3], [0.17, 1.6, 'in'], [0.3, 3.4, 'in']]),
  ladleZ: track([[0, -0.24], [0.1, -0.24], [0.17, -0.4], [0.3, -1.0]]),
  ladleTilt: track([[0, 1.15], [0.09, 1.15], [0.17, 0.3, 'inOut'], [0.3, 0.25]]),
  pour: track([[0, 0], [1, 0]]),
  empty: track([[0, 1], [1, 1]]),
  out: track([[0, 1], [1, 1]]),
  moving: track([[0.14, 0], [0.18, 1], [0.8, 1], [0.84, 0]]),
};
const HEAD_SCALE = 1.0;

const IX = 0.25; // the island's centre
const IZ = -3.2;
const WALL_H = 3.2; // the walls go up to here; the vault springs from it
const VAULT_RISE = 2.3;
const HALF_W = 6.0;
const ZB = -7.4; // back wall
const ZF = 6.0; // front wall

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ geometry helpers

/** A cylinder bar from p0 to p1. */
function bar(b, mat, p0, p1, r, seg = 'cyl8') {
  _v.subVectors(p1, p0);
  const len = _v.length();
  _q.setFromUnitVectors(UP, _v.normalize());
  _e.setFromQuaternion(_q, 'YXZ');
  b.add(G[seg], mat, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, _e.x, _e.y, _e.z, r, len, r);
}

/** A box bar from p0 to p1, w wide and d deep. */
function boxBar(b, mat, p0, p1, w, d) {
  _v.subVectors(p1, p0);
  const len = _v.length();
  _q.setFromUnitVectors(UP, _v.normalize());
  _e.setFromQuaternion(_q, 'YXZ');
  b.add(G.box, mat, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, _e.x, _e.y, _e.z, w, len, d);
}

/** A quad from four corners (counter-clockwise seen from its front), with uvs. */
function quad(a, b2, c, d) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([a.x, a.y, a.z, b2.x, b2.y, b2.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** The barrel vault: an elliptical half-tube along z, seen from inside. */
function vaultGeometry(halfW, rise, y0, z0, z1, segs = 48) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI * (i / segs);
    const x = Math.cos(a) * halfW;
    const y = y0 + Math.sin(a) * rise;
    pos.push(x, y, z0, x, y, z1);
    uv.push(i / segs, 0, i / segs, 1);
  }
  for (let i = 0; i < segs; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A brick rib following the vault: an elliptical arch band, `thick` radially, `depth` along z. */
function ribGeometry(halfW, rise, thick, depth) {
  const s = new THREE.Shape();
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    const x = Math.cos(a) * halfW;
    const y = Math.sin(a) * rise;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.lineTo(-halfW, -0.0);
  s.lineTo(-(halfW - thick), 0);
  for (let i = N; i >= 0; i--) {
    const a = Math.PI * (i / N);
    s.lineTo(Math.cos(a) * (halfW - thick), Math.sin(a) * (rise - thick));
  }
  s.lineTo(halfW - thick, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function archShape(outer, inner, springY) {
  const s = new THREE.Shape();
  s.moveTo(-outer, 0);
  s.lineTo(-outer, springY);
  s.absarc(0, springY, outer, Math.PI, 0, true);
  s.lineTo(outer, 0);
  s.lineTo(inner, 0);
  s.lineTo(inner, springY);
  s.absarc(0, springY, inner, 0, Math.PI, false);
  s.lineTo(-inner, 0);
  s.closePath();
  return s;
}

// ------------------------------------------------------------------ shaders

const flameVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const flameFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uA, uB;
  uniform float uSeed;
  varying vec2 vUv;
  ${GLSL_NOISE}
  void main() {
    vec2 p = vUv;
    float n = fbm(vec2(p.x * 3.0 + uSeed, p.y * 4.0 - uTime * 2.2 + uSeed));
    float n2 = noise(vec2(p.x * 9.0 + uSeed * 3.0, p.y * 12.0 - uTime * 3.5));
    float edge = abs(p.x - 0.5) * 2.0;
    float body = 1.0 - edge * (0.6 + p.y * 1.6) - p.y * p.y * 0.9;
    float f = body + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.25;
    float a = smoothstep(0.08, 0.5, f) * (1.0 - smoothstep(0.75, 1.0, p.y));
    vec3 col = mix(uA, uB, smoothstep(0.1, 0.8, f + p.y * 0.3));
    col += vec3(1.0, 0.9, 0.6) * smoothstep(0.55, 0.95, f) * (1.0 - p.y);
    gl_FragColor = vec4(col * a * 1.6, a);
  }
`;

// ------------------------------------------------------------------ the kitchen

export class Kitchen {
  constructor(envMap) {
    this.group = new THREE.Group();
    this.group.visible = false;
    const g = this.group;
    const E = { envMap };
    const R = rng(21);
    this.envMap = envMap;

    // ---- materials
    const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...E, ...o });
    const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, ...E, ...o });
    const DS = THREE.DoubleSide;
    const copperMaps = hammeredCopperMaps(512, 700);
    copperMaps.map.repeat.set(3, 1.2);
    copperMaps.normalMap.repeat.set(3, 1.2);
    copperMaps.roughnessMap.repeat.set(3, 1.2);
    const brassM = brassMaps();
    const M = {
      copper: std(0xffffff, { ...copperMaps, metalness: 0.95, roughness: 1, envMapIntensity: 1.5, normalScale: new THREE.Vector2(0.6, 0.6), side: DS }),
      copperDark: std(0xb05a30, { ...copperMaps, metalness: 0.9, roughness: 1, envMapIntensity: 1.1, normalScale: new THREE.Vector2(0.5, 0.5), side: DS }),
      brass: std(0xe2b352, { metalness: 1, roughness: 0.55, ...brassM, envMapIntensity: 1.6, side: DS }),
      brassDark: std(0xa87a30, { metalness: 1, roughness: 0.45, envMapIntensity: 1.2, side: DS }),
      steel: std(0xd6dae0, { metalness: 1, roughness: 0.32, envMapIntensity: 1.2, side: DS }),
      steelDull: std(0xb8bcc2, { metalness: 0.9, roughness: 0.5, envMapIntensity: 0.8, side: DS }),
      iron: std(0x1d1d20, { metalness: 0.7, roughness: 0.6, side: DS }),
      black: phys(0x0c0b0d, { metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 }),
      blackMatte: std(0x121113, { roughness: 0.7 }),
      purple: phys(0x5c2a56, { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
      purpleDark: std(0x3e1b3a, { roughness: 0.6 }),
      glass: phys(0x8fb2c8, { transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, transmission: 0, envMapIntensity: 1.5, depthWrite: false }),
      glassDark: phys(0x1c2a3c, { transparent: true, opacity: 0.8, roughness: 0.05, envMapIntensity: 1.4, depthWrite: false }),
      ceramic: phys(0xf5f2ea, { roughness: 0.22, clearcoat: 0.6, envMapIntensity: 0.7 }),
      ceramicEdge: std(0xd9d4c4, { roughness: 0.3 }),
      ceramicBlue: std(0x2c58a8, { roughness: 0.3 }),
      woodDark: std(0x3b2316, { roughness: 0.55, envMapIntensity: 0.4 }),
      wood: std(0x8a5a34, { roughness: 0.6 }),
      woodLight: std(0xd7ad74, { roughness: 0.6 }),
      label: std(0xefe6d2, { roughness: 0.8 }),
      paper: std(0xf4ecd8, { roughness: 0.9 }),
      stone: std(0x8a8780, { roughness: 0.85 }),
      rope: std(0xb89a64, { roughness: 0.9 }),
      pasta: std(0xe8cf8c), beans: std(0x9a4a2a), flour: std(0xf4f0e6), rice: std(0xf0ecdf), lentil: std(0xb8683a),
      bulb: new THREE.MeshBasicMaterial({ color: 0xffe9c0 }),
      lampGlow: new THREE.MeshBasicMaterial({ color: 0xffc98a, side: THREE.BackSide }),
      glow: std(0xe8a850, { emissive: 0xff9a28, emissiveIntensity: 0.55, emissiveMap: toTexture(canvas(4, 64, (gg, w, h) => { const gr = gg.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#c89a68'); gr.addColorStop(1, '#6a4a30'); gg.fillStyle = gr; gg.fillRect(0, 0, w, h); }), { srgb: true }), roughness: 0.6, side: DS }),
      glowDim: std(0xf0b060, { emissive: 0xff9a30, emissiveIntensity: 0.6, roughness: 0.6, side: DS }),
      fireBack: new THREE.MeshBasicMaterial({ color: 0x2a0e04 }),
      ember: std(0x2a1008, { emissive: 0xff4a08, emissiveIntensity: 1.2, roughness: 0.9 }),
      eggWhite: std(0xfdf8ee, { roughness: 0.3 }), yolk: std(0xffa319, { roughness: 0.25, emissive: 0x7a3a00, emissiveIntensity: 0.4 }),
      glassGreen: phys(0x2d6b3a, { transparent: true, opacity: 0.8, roughness: 0.1, envMapIntensity: 1.2, depthWrite: false }),
      dark: std(0x0a0807, { roughness: 0.6 }),
    };
    this.M = M;

    // PBR sets for the room
    const tileSet = pbrSet('long_white_tiles');
    const brickSet = pbrSet('white_sandstone_bricks_03');
    const plasterSet = pbrSet('white_plaster_02');
    const woodSet = pbrSet('kitchen_wood');
    // a surface material with the set repeated so one texture tile is `scale` metres
    const surf = (set, w, h, scale, o = {}) => {
      const { ao, ...rest } = o;
      const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1, ...E, ...rest });
      for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) {
        if (k === 'aoMap' && o.ao === false) continue;
        const t = set[k].clone();
        t.repeat.set(w / scale, h / scale);
        t.needsUpdate = true;
        m[k] = t;
      }
      return m;
    };
    const tiles = (w, h) => surf(tileSet, w, h, 1.0, { envMapIntensity: 0.9, color: 0xfaf6ee });
    const bricks = (w, h) => surf(brickSet, w, h, 1.6, { envMapIntensity: 0.3, color: 0xe8dcc6 });
    const plaster = (w, h, o = {}) => surf(plasterSet, w, h, 2.5, { envMapIntensity: 0.5, color: 0xffffff, ao: false, ...o });
    const woodMat = (w, h) => surf(woodSet, w, h, 1.2, { envMapIntensity: 0.5, color: 0x6a4428 });

    const plain = (mesh, cast = false) => { mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh; };
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      return plain(m);
    };
    const model = (name, o) => placeModel(name, g, { envMap, envMapIntensity: 1.1, ...o });
    const COPPER = 0xff8e62; // the tint that turns the scanned brass into copper
    const COPPER_RED = 0xff6a48;

    // =========================================================== the room
    // ---- floor: cream tiles with black diamonds, polished
    const fm = floorMaps(1024);
    for (const t of Object.values(fm)) t.repeat.set(12, 14);
    const floor = add(new THREE.PlaneGeometry(12, 14), new THREE.MeshPhysicalMaterial({
      ...fm, roughness: 1, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.3, envMapIntensity: 0.22, color: 0xd9d0bf, normalScale: new THREE.Vector2(0.7, 0.7), ...E,
    }), 0, 0, (ZB + ZF) / 2, -Math.PI / 2);
    floor.receiveShadow = true;

    // ---- walls: white tile to 2.3 m, plaster above, pale brick on the front-left
    const TILE_H = 2.3;
    const wallZ = ZF - ZB;
    // left
    add(new THREE.PlaneGeometry(wallZ - 7, TILE_H), tiles(wallZ - 7, TILE_H), -HALF_W, TILE_H / 2, ZB + (wallZ - 7) / 2, 0, Math.PI / 2);
    add(new THREE.PlaneGeometry(7, WALL_H), bricks(7, WALL_H), -HALF_W, WALL_H / 2, ZF - 3.5, 0, Math.PI / 2);
    add(new THREE.PlaneGeometry(wallZ - 7, WALL_H - TILE_H), plaster(wallZ - 7, WALL_H - TILE_H), -HALF_W, TILE_H + (WALL_H - TILE_H) / 2, ZB + (wallZ - 7) / 2, 0, Math.PI / 2);
    // right
    const DOOR_Z0 = -3.3 - 1.25;
    const DOOR_Z1 = -3.3 + 1.25;
    add(new THREE.PlaneGeometry(DOOR_Z0 - ZB, TILE_H), tiles(DOOR_Z0 - ZB, TILE_H), HALF_W, TILE_H / 2, (ZB + DOOR_Z0) / 2, 0, -Math.PI / 2);
    add(new THREE.PlaneGeometry(ZF - DOOR_Z1, TILE_H), tiles(ZF - DOOR_Z1, TILE_H), HALF_W, TILE_H / 2, (DOOR_Z1 + ZF) / 2, 0, -Math.PI / 2);
    add(new THREE.PlaneGeometry(wallZ, WALL_H - TILE_H), plaster(wallZ, WALL_H - TILE_H), HALF_W, TILE_H + (WALL_H - TILE_H) / 2, (ZB + ZF) / 2, 0, -Math.PI / 2);
    // back and front: tile, then plaster right up into the vault
    add(new THREE.PlaneGeometry(HALF_W * 2, TILE_H), tiles(HALF_W * 2, TILE_H), 0, TILE_H / 2, ZB);
    add(new THREE.PlaneGeometry(HALF_W * 2, WALL_H + VAULT_RISE - TILE_H), plaster(HALF_W * 2, WALL_H + VAULT_RISE - TILE_H), 0, TILE_H + (WALL_H + VAULT_RISE - TILE_H) / 2, ZB);
    add(new THREE.PlaneGeometry(HALF_W * 2, WALL_H + VAULT_RISE), plaster(HALF_W * 2, WALL_H + VAULT_RISE), 0, (WALL_H + VAULT_RISE) / 2, ZF, 0, Math.PI);
    // tile cap: a brass-coloured cornice line where tile meets plaster
    const trim = new Batch(g);
    trim.box(M.woodDark, -HALF_W + 0.02, TILE_H + 0.03, ZB + (wallZ - 7) / 2, 0.05, 0.08, wallZ - 7);
    trim.box(M.woodDark, HALF_W - 0.02, TILE_H + 0.03, (ZB + ZF) / 2, 0.05, 0.08, wallZ);
    trim.box(M.woodDark, 0, TILE_H + 0.03, ZB + 0.02, HALF_W * 2, 0.08, 0.05);
    trim.finish();

    // ---- the vault, and brick ribs across it
    const vault = add(vaultGeometry(HALF_W, VAULT_RISE, WALL_H, ZB, ZF), plaster(13, wallZ, { side: THREE.DoubleSide }), 0, 0, 0);
    vault.receiveShadow = true;
    const ribMat = bricks(2, 2);
    for (const z of [-5.6, -0.5]) {
      const rib = new THREE.Mesh(ribGeometry(HALF_W, VAULT_RISE, 0.5, 0.45), ribMat);
      rib.position.set(0, WALL_H, z);
      plain(rib, true);
      // the rib continues down the walls as a brick pilaster
      for (const x of [-HALF_W + 0.22, HALF_W - 0.22]) add(new THREE.BoxGeometry(0.45, WALL_H, 0.45), ribMat, x, WALL_H / 2, z);
    }

    // =========================================================== the range island
    const b = new Batch(g);
    const BW = 3.5; // body width
    const BD = 1.05; // depth
    const BH = 0.92; // top of the body
    b.at(IX, 0, IZ, 0, 1, () => {
      // feet: brass taper and ball
      for (const x of [-BW / 2 + 0.12, BW / 2 - 0.12]) for (const z of [-BD / 2 + 0.12, BD / 2 - 0.12]) {
        b.add(G.cone12, M.brass, x, 0.07, z, Math.PI, 0, 0, 0.055, 0.14, 0.055);
        b.sph(M.brass, x, 0.02, z, 0.03, 0.02, 0.03);
      }
      // the body: black enamel, a brass plinth line
      b.box(M.black, 0, 0.14 + (BH - 0.14) / 2, 0, BW, BH - 0.14, BD);
      b.box(M.brass, 0, 0.16, 0, BW + 0.03, 0.035, BD + 0.03);
      // the top: steel plate with a rounded brass edge, and a brass towel rail round it on posts
      b.box(M.steelDull, 0, BH + 0.02, 0, BW + 0.08, 0.04, BD + 0.08);
      b.box(M.brass, 0, BH + 0.04, 0, BW + 0.1, 0.012, BD + 0.1);
      const railY = BH + 0.16;
      const RX = BW / 2 + 0.14;
      const RZ = BD / 2 + 0.14;
      for (const [p0, p1] of [[V(-RX, railY, RZ), V(RX, railY, RZ)], [V(-RX, railY, -RZ), V(RX, railY, -RZ)], [V(-RX, railY, -RZ), V(-RX, railY, RZ)], [V(RX, railY, -RZ), V(RX, railY, RZ)]]) bar(b, M.brass, p0, p1, 0.016, 'cyl16');
      for (const x of [-RX, -RX * 0.5, 0, RX * 0.5, RX]) for (const z of [-RZ, RZ]) {
        b.cyl(M.brass, x, BH + 0.1, z, 0.012, 0.12, 0, 0, 0, 'cyl8');
        b.sph(M.brass, x, railY, z, 0.024, 0.024, 0.024);
      }
      for (const x of [-RX, RX]) for (const z of [0]) {
        b.cyl(M.brass, x, BH + 0.1, z, 0.012, 0.12, 0, 0, 0, 'cyl8');
        b.sph(M.brass, x, railY, z, 0.024, 0.024, 0.024);
      }
      // fluted brass pilasters at the corners and between the doors, front and back
      const pilaster = (x, z) => {
        b.box(M.brassDark, x, 0.16 + (BH - 0.2) / 2, z, 0.1, BH - 0.2, 0.06);
        for (const dx of [-0.03, 0, 0.03]) b.cyl(M.brass, x + dx, 0.16 + (BH - 0.2) / 2, z + 0.02, 0.011, BH - 0.2, 0, 0, 0, 'cyl8');
        b.box(M.brass, x, 0.2, z, 0.13, 0.06, 0.08);
        b.box(M.brass, x, BH - 0.06, z, 0.13, 0.06, 0.08);
      };
      const face = (dir) => {
        const fz = dir * (BD / 2 + 0.005);
        for (const x of [-BW / 2 + 0.07, -0.62, 0.62, BW / 2 - 0.07]) pilaster(x, fz);
        // oven doors: a brass frame, a black panel, a glass window, a brass handle, rivets
        const door = (cx, w) => {
          const h = 0.44;
          const cy = 0.5;
          b.box(M.blackMatte, cx, cy, fz + dir * 0.004, w, h, 0.01);
          b.box(M.glassDark, cx, cy + 0.03, fz + dir * 0.011, w * 0.6, h * 0.42, 0.006);
          b.box(M.brass, cx, cy + 0.03, fz + dir * 0.012, w * 0.6 + 0.03, 0.014, 0.012);
          b.box(M.brass, cx, cy + 0.03 - h * 0.21 - 0.007, fz + dir * 0.012, w * 0.6 + 0.03, 0.014, 0.012);
          b.box(M.brass, cx, cy + 0.03 + h * 0.21 + 0.007, fz + dir * 0.012, w * 0.6 + 0.03, 0.014, 0.012);
          for (const sx of [-1, 1]) b.box(M.brass, cx + sx * (w * 0.3 + 0.008), cy + 0.03, fz + dir * 0.012, 0.014, h * 0.42 + 0.03, 0.012);
          for (const dy of [-1, 1]) b.box(M.brass, cx, cy + dy * h / 2, fz + dir * 0.01, w + 0.04, 0.028, 0.02);
          for (const dx of [-1, 1]) b.box(M.brass, cx + dx * w / 2, cy, fz + dir * 0.01, 0.028, h, 0.02);
          // handle
          b.cyl(M.brass, cx, cy - h / 2 + 0.07, fz + dir * 0.06, 0.013, w * 0.74, 0, 0, Math.PI / 2, 'cyl16');
          for (const dx of [-1, 1]) {
            b.cyl(M.brass, cx + dx * w * 0.34, cy - h / 2 + 0.07, fz + dir * 0.03, 0.011, 0.06, Math.PI / 2, 0, 0, 'cyl8');
            b.sph(M.brass, cx + dx * w * 0.34, cy - h / 2 + 0.07, fz + dir * 0.06, 0.018, 0.018, 0.018);
          }
          for (const dx of [-1, 1]) for (const dy of [-1, 1]) b.sph(M.brass, cx + dx * (w / 2 - 0.035), cy + dy * (h / 2 - 0.035), fz + dir * 0.018, 0.009, 0.009, 0.009);
          // the drawer beneath, with a brass pull
          b.box(M.blackMatte, cx, 0.235, fz + dir * 0.004, w, 0.1, 0.01);
          for (const dy of [-1, 1]) b.box(M.brass, cx, 0.235 + dy * 0.05, fz + dir * 0.01, w + 0.04, 0.02, 0.02);
          b.cyl(M.brass, cx, 0.235, fz + dir * 0.04, 0.009, w * 0.5, 0, 0, Math.PI / 2, 'cyl8');
        };
        door(-1.17, 0.9); door(0, 1.0); door(1.17, 0.9);
        // a row of knobs, and two gauges
        for (let i = 0; i < 12; i++) {
          if (i === 5 || i === 6) continue;
          const x = -1.45 + i * 0.264;
          b.cyl(M.brass, x, 0.84, fz + dir * 0.03, 0.03, 0.05, Math.PI / 2, 0, 0, 'cyl16');
          b.box(M.brassDark, x, 0.84, fz + dir * 0.055, 0.012, 0.035, 0.006);
        }
        for (const x of [-0.14, 0.14]) {
          b.cyl(M.brass, x, 0.83, fz + dir * 0.02, 0.09, 0.04, Math.PI / 2, 0, 0, 'cyl28');
          b.cyl(M.ceramic, x, 0.83, fz + dir * 0.042, 0.072, 0.004, Math.PI / 2, 0, 0, 'cyl28');
          b.add(G.box, M.dark, x, 0.83, fz + dir * 0.046, 0.0, 0.0, 0.4, 0.005, 0.06, 0.002);
          b.sph(M.brass, x, 0.83, fz + dir * 0.046, 0.008, 0.008, 0.008);
        }
      };
      face(1);
      face(-1);
      // the ends: a brass-framed black panel with a round brass boss
      for (const sx of [-1, 1]) {
        const ex = sx * (BW / 2 + 0.006);
        b.box(M.brass, ex, 0.56, 0, 0.012, 0.6, 0.8);
        b.box(M.blackMatte, ex + sx * 0.008, 0.56, 0, 0.01, 0.54, 0.74);
        b.cyl(M.brass, ex + sx * 0.02, 0.56, 0, 0.1, 0.02, 0, 0, Math.PI / 2, 'cyl28');
      }

      // ---- the cooktop: six cast-iron grates over burners
      this.burners = [];
      for (const x of [-1.25, -0.42, 0.42, 1.25]) {
        for (const z of [-0.25, 0.25]) {
          b.cyl(M.iron, x, BH + 0.05, z, 0.16, 0.02, 0, 0, 0, 'cyl28');
          b.add(G.ring(0.1, 0.012, 24), M.iron, x, BH + 0.07, z, Math.PI / 2);
          for (let k = 0; k < 4; k++) b.box(M.iron, x, BH + 0.075, z, 0.36, 0.014, 0.014, (k / 4) * Math.PI + 0.39);
          this.burners.push([IX + x, BH + 0.06, IZ + z]);
        }
      }
    });
    b.finish();

    // things on the cooktop: scanned copper pots, a great copper stockpot, a pan with eggs
    const TOP = BH + 0.08;
    model('brass_pot_01', { x: IX + 1.25, y: TOP, z: IZ - 0.25, ry: 0.3, s: 1.55, tint: COPPER });
    model('brass_pot_02', { x: IX - 1.25, y: TOP, z: IZ + 0.25, ry: -0.4, s: 1.2, tint: COPPER_RED });
    model('brass_pot_02', { x: IX + 0.42, y: TOP, z: IZ + 0.25, ry: 1.9, s: 0.95, tint: COPPER });
    model('brass_pan_01', { x: IX - 0.42, y: TOP, z: IZ - 0.25, ry: 2.6, s: 1.15, tint: COPPER });
    model('pot_enamel_01', { x: IX - 1.25, y: TOP, z: IZ - 0.25, ry: 0.2, s: 1.3 });
    const pb = new Batch(g);
    pb.at(IX + 1.25, BH + 0.05, IZ + 0.25, 0, 1, () => {
      // the big stockpot
      pb.cyl(M.copper, 0, 0.3, 0, 0.26, 0.6, 0, 0, 0, 'cyl28');
      pb.add(G.ring(0.265, 0.012, 32), M.brass, 0, 0.6, 0, Math.PI / 2);
      pb.add(G.ring(0.262, 0.008, 32), M.brass, 0, 0.12, 0, Math.PI / 2);
      for (const sx of [-1, 1]) pb.add(G.ring(0.07, 0.012, 14, Math.PI), M.brass, sx * 0.27, 0.48, 0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      pb.cyl(M.dark, 0, 0.59, 0, 0.245, 0.01, 0, 0, 0, 'cyl28');
      pb.cyl(M.glowDim, 0, 0.56, 0, 0.24, 0.004, 0, 0, 0, 'cyl28');
    });
    pb.at(IX - 0.42, BH + 0.09, IZ - 0.25, 2.6, 1.15, () => {
      // eggs in the pan
      pb.cyl(M.eggWhite, -0.03, 0.03, 0.0, 0.055, 0.006, 0, 0, 0, 'cyl16');
      pb.sph(M.yolk, -0.03, 0.035, 0.0, 0.024, 0.014, 0.024);
      pb.cyl(M.eggWhite, 0.05, 0.03, -0.05, 0.045, 0.006, 0, 0, 0, 'cyl16');
      pb.sph(M.yolk, 0.05, 0.035, -0.05, 0.02, 0.012, 0.02);
    });
    pb.finish();
    // gas flames under two of the burners: blue rings that flicker
    this.flameRings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5fa0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const i of [1, 4, 6]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 32), ringMat);
      r.rotation.x = Math.PI / 2;
      r.position.set(this.burners[i][0], this.burners[i][1] + 0.005, this.burners[i][2]);
      g.add(r);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 24), ringMat);
      inner.rotation.x = Math.PI / 2;
      inner.position.copy(r.position);
      g.add(inner);
      this.flameRings.push(r, inner);
    }

    // =========================================================== the hood
    const HB = { w: 3.9, d: 2.1, y: 2.25 }; // bottom
    const HT = { w: 2.3, d: 0.95, y: 3.25 }; // top
    const hb = new Batch(g);
    const HC = (sx, sz, top) => V(IX + sx * (top ? HT.w : HB.w) / 2, top ? HT.y : HB.y, IZ + sz * (top ? HT.d : HB.d) / 2);
    // glowing panels: four trapezoids, lit from inside
    const panelMat = M.glow;
    const panel = (a, b2, c, d) => hb.add(quad(a, b2, c, d), panelMat);
    panel(HC(-1, 1, 0), HC(1, 1, 0), HC(1, 1, 1), HC(-1, 1, 1)); // front
    panel(HC(1, -1, 0), HC(-1, -1, 0), HC(-1, -1, 1), HC(1, -1, 1)); // back
    panel(HC(-1, -1, 0), HC(-1, 1, 0), HC(-1, 1, 1), HC(-1, -1, 1)); // left
    panel(HC(1, 1, 0), HC(1, -1, 0), HC(1, -1, 1), HC(1, 1, 1)); // right
    // the brass frame: bottom and top rectangles, corner bars, ribs across the panels
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      boxBar(hb, M.brass, HC(ax, az, 0), HC(bx, bz, 0), 0.08, 0.08);
      boxBar(hb, M.brass, HC(ax, az, 1), HC(bx, bz, 1), 0.06, 0.06);
      boxBar(hb, M.brass, HC(ax, az, 0), HC(ax, az, 1), 0.07, 0.07);
      // ribs
      const n = i % 2 === 0 ? 4 : 2;
      for (let k = 1; k <= n; k++) {
        const u = k / (n + 1);
        const p0 = HC(ax, az, 0).lerp(HC(bx, bz, 0), u);
        const p1 = HC(ax, az, 1).lerp(HC(bx, bz, 1), u);
        boxBar(hb, M.brassDark, p0, p1, 0.035, 0.035);
      }
    }
    // a deep brass fascia along the bottom edge, with a bead, and a hook rail outside it
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      const p0 = HC(ax, az, 0);
      const p1 = HC(bx, bz, 0);
      p0.y -= 0.1; p1.y -= 0.1;
      boxBar(hb, M.brass, p0, p1, 0.2, 0.05);
      p0.y -= 0.11; p1.y -= 0.11;
      bar(hb, M.brass, p0, p1, 0.012, 'cyl8');
    }
    // the chimney up into the vault, with a brass collar
    hb.cyl(M.brass, IX, HT.y + 0.1, IZ, 0.42, 0.2, 0, 0, 0, 'cyl28');
    hb.cyl(M.brassDark, IX, HT.y + 0.2 + (WALL_H + VAULT_RISE - HT.y - 0.2) / 2, IZ, 0.26, WALL_H + VAULT_RISE - HT.y - 0.2, 0, 0, 0, 'cyl28');
    for (const y of [HT.y + 0.6, HT.y + 1.3]) hb.add(G.ring(0.27, 0.02, 28), M.brass, IX, y, IZ, Math.PI / 2);
    // brass posts at the island's corners carry the shelf and the hood
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = IX + sx * 1.72;
      const z = IZ + sz * 0.4;
      hb.cyl(M.brass, x, BH + 0.05 + (HB.y - BH - 0.05) / 2, z, 0.035, HB.y - BH - 0.05, 0, 0, 0, 'cyl16');
      hb.cyl(M.brass, x, BH + 0.08, z, 0.06, 0.04, 0, 0, 0, 'cyl16');
      hb.cyl(M.brass, x, HB.y - 0.12, z, 0.05, 0.03, 0, 0, 0, 'cyl16');
    }
    // the shelf beneath the hood: a steel slab with a brass lip, on brass brackets
    const SH = 1.5;
    hb.box(M.steel, IX, SH, IZ, 3.7, 0.035, 0.62);
    hb.box(M.brass, IX, SH + 0.03, IZ + 0.3, 3.74, 0.05, 0.02);
    hb.box(M.brass, IX, SH + 0.03, IZ - 0.3, 3.74, 0.05, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) hb.box(M.brass, IX + sx * 1.72, SH - 0.04, IZ + sz * 0.3, 0.08, 0.05, 0.2);
    // on the shelf: stacks of plates, bowls, crocks of utensils, bottles, a kettle, a knife block
    hb.at(IX + 0.95, SH + 0.02, IZ, 0, 1, () => plateStack(hb, M, 26, 0.16));
    hb.at(IX + 1.4, SH + 0.02, IZ + 0.05, 0, 1, () => plateStack(hb, M, 14, 0.13));
    hb.at(IX + 0.45, SH + 0.02, IZ - 0.08, 0, 1, () => bowlStack(hb, M, 6, 0.13));
    hb.at(IX - 0.1, SH + 0.02, IZ, 0, 1, () => {
      crock(hb, M);
      hb.at(-0.03, 0.16, 0, 0, 1, () => ladle(hb, M, 0.3), 0, 0.2);
      hb.at(0.02, 0.16, 0.02, 0, 1, () => whisk(hb, M, 0.3), 0.1, -0.12);
      hb.at(0.0, 0.16, -0.02, 0, 1, () => skimmer(hb, M, 0.3), -0.1, 0.05);
      hb.at(0.03, 0.16, 0, 0, 1, () => spatula(hb, M, 0.3), 0, -0.25);
      hb.at(-0.01, 0.16, 0.03, 0, 1, () => tongs(hb, M, 0.26), 0.2, 0.08);
    });
    hb.at(IX - 0.55, SH + 0.02, IZ + 0.05, 0.3, 1, () => knifeBlock(hb, M));
    hb.at(IX - 1.0, SH + 0.02, IZ - 0.05, 0, 1, () => kettle(hb, M));
    hb.at(IX - 1.45, SH + 0.02, IZ + 0.1, 0, 1, () => bottle(hb, M, { h: 0.3, r: 0.036, mat: M.glassGreen, cap: M.brass }));
    hb.at(IX - 1.55, SH + 0.02, IZ - 0.1, 0, 1, () => bottle(hb, M, { h: 0.26, r: 0.032, mat: M.glass, cap: M.brass }));
    hb.at(IX - 1.35, SH + 0.02, IZ - 0.14, 0, 1, () => jar(hb, M, { h: 0.18, r: 0.06, content: M.lentil }));
    hb.at(IX + 1.62, SH + 0.02, IZ - 0.14, 0, 1, () => jar(hb, M, { h: 0.2, r: 0.06, content: M.pasta }));
    hb.finish();
    // the glowing underside: a soft panel inside the hood so it reads lit from within
    add(new THREE.PlaneGeometry(HB.w - 0.3, HB.d - 0.3), new THREE.MeshBasicMaterial({ color: 0xffd38a, side: DS }), IX, HB.y + 0.4, IZ, Math.PI / 2).receiveShadow = false;

    // copper pots hung round the hood's edge, bottoms out to the room, each on its own hook
    const hang = (name, x, z, ry, s, tint) => {
      model(name, { x, y: HB.y - 0.2, z, rx: -Math.PI / 2 - 0.22, ry, s, tint });
    };
    const frontZ = IZ + HB.d / 2 + 0.06;
    [['brass_pot_02', 1.25, COPPER], ['brass_pot_01', 1.2, COPPER_RED], ['brass_pot_02', 1.5, COPPER], ['brass_pot_01', 1.45, COPPER], ['brass_pot_02', 1.3, COPPER_RED], ['brass_pot_01', 1.1, COPPER], ['brass_pot_02', 1.4, COPPER]].forEach(([n, s, tint], i) => {
      hang(n, IX - 1.65 + i * 0.55, frontZ, 0, s, tint);
    });
    [['brass_pot_01', 1.3, COPPER], ['brass_pot_02', 1.4, COPPER_RED], ['brass_pot_01', 1.15, COPPER]].forEach(([n, s, tint], i) => {
      hang(n, IX - HB.w / 2 - 0.06, IZ - 0.65 + i * 0.65, -Math.PI / 2, s, tint);
      hang(n, IX + HB.w / 2 + 0.06, IZ - 0.65 + i * 0.65, Math.PI / 2, s, tint);
    });
    // hooks for them, and ladles hung between
    const hk = new Batch(g);
    for (let i = 0; i < 7; i++) hk.add(G.ring(0.035, 0.006, 10, Math.PI), M.brass, IX - 1.65 + i * 0.55, HB.y - 0.2, frontZ, 0, 0, Math.PI);
    for (let i = 0; i < 6; i++) hk.at(IX - 1.38 + i * 0.55, HB.y - 0.21, frontZ + 0.02, 0, 0.75, () => (i % 2 ? ladle(hk, M) : skimmer(hk, M)), 0, Math.PI);
    hk.finish();

    // =========================================================== the doors (right wall)
    const DZ = -3.3;
    const DW = 1.05; // one leaf
    const DH = 2.35;
    const dframe = woodMat(3, 3);
    const db = new Batch(g);
    const DX = HALF_W - 0.02;
    // the wooden frame and the arched transom with panes
    db.box(dframe, DX - 0.1, DH / 2, DZ - DW - 0.1, 0.2, DH, 0.2);
    db.box(dframe, DX - 0.1, DH / 2, DZ + DW + 0.1, 0.2, DH, 0.2);
    db.box(dframe, DX - 0.1, DH + 0.08, DZ, 0.2, 0.16, DW * 2 + 0.4);
    const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(DW + 0.2, DW, 0), { depth: 0.18, bevelEnabled: false, curveSegments: 24 }), dframe);
    arch.rotation.y = -Math.PI / 2;
    arch.position.set(DX - 0.01, DH + 0.16, DZ);
    plain(arch, true);
    // panes: dark glass with wooden mullions radiating
    const paneMat = M.glassDark;
    add(new THREE.CircleGeometry(DW, 32, 0, Math.PI), paneMat, DX - 0.1, DH + 0.16, DZ, 0, -Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4) * Math.PI;
      const p0 = V(DX - 0.1, DH + 0.16, DZ);
      const p1 = V(DX - 0.1, DH + 0.16 + Math.sin(a) * DW, DZ + Math.cos(a) * DW);
      boxBar(db, dframe, p0, p1, 0.03, 0.05);
    }
    db.add(G.ring(DW * 0.55, 0.015, 24, Math.PI), dframe, DX - 0.1, DH + 0.16, DZ, 0, Math.PI / 2, 0);
    db.finish();
    // the two purple leaves, each on its own hinge so they swing open as the cart comes through:
    // a window, a brass rim, a steel kick plate, a push plate, panels on both faces
    this.doors = [];
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(DX - 0.06, 0, DZ + s * DW);
      const lb = new Batch(leaf);
      const cz = -s * DW / 2;
      lb.box(M.purple, 0, DH / 2, cz, 0.06, DH - 0.02, DW - 0.02);
      for (const dx of [-0.04, 0.04]) {
        lb.box(M.purpleDark, dx, DH * 0.75, cz, 0.01, DH * 0.42, DW * 0.78);
        lb.box(M.purpleDark, dx, DH * 0.27, cz, 0.01, DH * 0.42, DW * 0.78);
        lb.box(M.steel, dx, 0.22, cz, 0.012, 0.42, DW - 0.08);
        lb.box(M.steel, dx, 1.05, cz - s * 0.3, 0.012, 0.3, 0.12);
        lb.add(G.ring(0.19, 0.012, 4, TAU), M.brass, dx, 1.62, cz, 0, Math.PI / 2, Math.PI / 4);
      }
      lb.box(M.glassDark, 0, 1.62, cz, 0.1, 0.3, 0.3);
      for (let i = 0; i < 6; i++) lb.sph(M.steel, -0.046, 0.05 + i * 0.07, cz - s * (DW / 2 - 0.08), 0.006, 0.006, 0.006);
      lb.finish();
      leaf.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(leaf);
      this.doors.push({ leaf, s });
    }
    // a little cool light through the panes
    this.doorLight = new THREE.PointLight(0xb08cff, 1.5, 7, 2);
    this.doorLight.position.set(DX - 0.5, 2.0, DZ);
    g.add(this.doorLight);

    // =========================================================== the left side: steel tables, shelves on scroll brackets, a rack
    const LX = -HALF_W;
    const lb = new Batch(g);
    // a long stainless work table with an under-shelf and a splash lip
    lb.box(M.steel, LX + 0.45, 0.88, -3.6, 0.9, 0.05, 5.6);
    lb.box(M.steelDull, LX + 0.45, 0.35, -3.6, 0.85, 0.03, 5.5);
    lb.box(M.steel, LX + 0.05, 0.97, -3.6, 0.05, 0.14, 5.6);
    for (const z of [-6.3, -4.5, -2.7, -0.9]) for (const x of [LX + 0.08, LX + 0.85]) lb.cyl(M.steel, x, 0.44, z, 0.02, 0.88, 0, 0, 0, 'cyl8');
    // drawers under the table top
    for (let i = 0; i < 5; i++) {
      lb.box(M.steelDull, LX + 0.45, 0.76, -6.0 + i * 1.1, 0.86, 0.16, 1.0);
      lb.cyl(M.brass, LX + 0.9, 0.76, -6.0 + i * 1.1, 0.01, 0.3, Math.PI / 2, 0, 0, 'cyl8');
    }
    // two wall shelves on wrought scroll brackets, with plates, bowls, pots and jars
    const scroll = (x, y, z) => {
      lb.box(M.iron, x + 0.03, y - 0.02, z, 0.42, 0.03, 0.03);
      lb.box(M.iron, x + 0.01, y - 0.22, z, 0.03, 0.42, 0.03);
      lb.add(G.ring(0.11, 0.012, 20, Math.PI * 1.5), M.iron, x + 0.2, y - 0.18, z, 0, 0, Math.PI * 0.25, 1, 1, 1);
      lb.add(G.ring(0.05, 0.01, 14, Math.PI * 1.5), M.iron, x + 0.12, y - 0.3, z, 0, 0, Math.PI, 1, 1, 1);
    };
    const shelfL = (y, z0, z1) => {
      lb.box(M.steel, LX + 0.25, y, (z0 + z1) / 2, 0.5, 0.035, z1 - z0);
      lb.box(M.brass, LX + 0.49, y + 0.02, (z0 + z1) / 2, 0.02, 0.05, z1 - z0);
      for (let z = z0 + 0.3; z < z1; z += 1.2) scroll(LX, y, z);
    };
    shelfL(1.6, -6.4, -1.2);
    shelfL(2.2, -6.4, -1.2);
    [[1.62, -6.0, 16, 0.14], [1.62, -5.5, 24, 0.15], [1.62, -4.4, 12, 0.13], [2.22, -5.7, 18, 0.14], [2.22, -3.0, 14, 0.13], [1.62, -1.7, 20, 0.15]].forEach(([y, z, n, r]) => lb.at(LX + 0.25, y, z, 0, 1, () => plateStack(lb, M, n, r)));
    [[1.62, -3.9], [2.22, -4.6], [2.22, -2.0]].forEach(([y, z]) => lb.at(LX + 0.25, y, z, 0, 1, () => bowlStack(lb, M, 5, 0.13)));
    [[2.22, -6.3, M.pasta], [2.22, -5.1, M.beans], [1.62, -3.3, M.rice], [2.22, -3.6, M.flour], [1.62, -2.6, M.lentil], [2.22, -1.4, M.pasta]].forEach(([y, z, c]) => lb.at(LX + 0.25, y, z, 0, 1, () => jar(lb, M, { h: 0.22, r: 0.07, content: c })));
    // a tall shelving rack in the back-left corner, steel with scroll ends
    const RXr = LX + 0.75;
    const RZr = ZB + 0.65;
    for (const x of [RXr - 0.6, RXr + 0.6]) for (const z of [RZr - 0.25, RZr + 0.25]) lb.cyl(M.steel, x, 1.2, z, 0.018, 2.4, 0, 0, 0, 'cyl8');
    for (const y of [0.25, 0.85, 1.45, 2.05]) {
      lb.box(M.steel, RXr, y, RZr, 1.25, 0.03, 0.55);
      lb.add(G.ring(0.12, 0.012, 20, Math.PI), M.iron, RXr - 0.62, y + 0.12, RZr, 0, Math.PI / 2, 0);
      lb.add(G.ring(0.12, 0.012, 20, Math.PI), M.iron, RXr + 0.62, y + 0.12, RZr, 0, Math.PI / 2, 0);
    }
    lb.at(RXr - 0.3, 2.08, RZr, 0, 1, () => plateStack(lb, M, 12, 0.14));
    lb.at(RXr + 0.3, 1.48, RZr, 0, 1, () => bowlStack(lb, M, 6, 0.13));
    // knives on a strip, and utensils on a rail above the table
    lb.box(M.woodDark, LX + 0.03, 1.3, -2.2, 0.03, 0.03, 1.1);
    [0.24, 0.2, 0.18, 0.22, 0.15].forEach((L, i) => lb.at(LX + 0.05, 1.28, -1.75 - i * 0.2, Math.PI / 2, 1, () => knife(lb, M, L), 0, -Math.PI / 2));
    lb.cyl(M.brass, LX + 0.06, 2.75, -3.8, 0.012, 2.6, Math.PI / 2, 0, 0, 'cyl8');
    [ladle, whisk, skimmer, spatula, tongs, ladle, skimmer, whisk].forEach((fn, i) => lb.at(LX + 0.1, 2.75, -5.0 + i * 0.34, Math.PI / 2, 0.8, () => fn(lb, M), 0, Math.PI));
    lb.finish();
    // scanned things on the table and rack
    model('pot_enamel_01', { x: LX + 0.45, y: 0.905, z: -5.6, ry: 1.2, s: 1.4 });
    model('brass_pot_02', { x: LX + 0.45, y: 0.905, z: -4.6, ry: 0.4, s: 1.3, tint: COPPER });
    model('wooden_crate_02', { x: LX + 0.45, y: 0.905, z: -3.2, ry: Math.PI / 2, s: 0.5 });
    model('jug_01', { x: LX + 0.35, y: 0.905, z: -2.4, ry: 2.2, s: 1.0 });
    model('wooden_bowl_01', { x: LX + 0.5, y: 0.905, z: -1.5, s: 1.1 });
    for (let i = 0; i < 5; i++) model('yellow_onion', { x: LX + 0.5 + (R() - 0.5) * 0.14, y: 0.93, z: -1.5 + (R() - 0.5) * 0.14, ry: R() * 6, s: 0.95 });
    model('wicker_basket_01', { x: RXr, y: 0.87, z: RZr, ry: 0.2, s: 1.0 });
    for (let i = 0; i < 4; i++) model('lemon', { x: RXr - 0.1 + i * 0.07, y: 0.92, z: RZr + (i % 2) * 0.06 - 0.03, ry: R() * 6, s: 1 });
    model('wine_bottles_01', { x: RXr - 0.45, y: 0.27, z: RZr, ry: 0.1, s: 1 });
    model('brass_pot_01', { x: RXr + 0.3, y: 0.27, z: RZr, s: 1.2, tint: COPPER });
    model('wooden_crate_02', { x: RXr, y: 0.04, z: RZr - 0.05, ry: Math.PI / 2, s: 0.55 });
    model('hamburger_buns', { x: LX + 0.45, y: 0.905, z: -0.9, ry: 0.3, s: 1.1 });
    model('croissant', { x: LX + 0.6, y: 0.905, z: -0.5, ry: 1.0, s: 1.0 });

    // =========================================================== the back wall: a brick hearth with a fire, a work shelf, hung pans
    const hearthX = -2.6;
    const hbk = new Batch(g);
    const hearth = new THREE.Mesh(new THREE.ExtrudeGeometry(archShape(1.6, 1.1, 1.2), { depth: 0.45, bevelEnabled: false, curveSegments: 32 }), bricks(3, 3));
    hearth.position.set(hearthX, 0, ZB - 0.02);
    plain(hearth, true);
    add(new THREE.PlaneGeometry(2.2, 2.3), M.fireBack, hearthX, 1.15, ZB + 0.01);
    hbk.box(M.stone, hearthX, 0.03, ZB + 0.45, 2.3, 0.06, 1.0);
    hbk.box(M.iron, hearthX, 0.12, ZB + 0.3, 1.2, 0.03, 0.5);
    for (let i = 0; i < 5; i++) hbk.cyl(M.woodDark, hearthX + (i - 2) * 0.22, 0.22, ZB + 0.3 - (i % 2) * 0.1, 0.06, 0.7, 0, 0.5 + i * 0.4, Math.PI / 2, 'cyl8');
    for (let i = 0; i < 14; i++) hbk.sph(M.ember, hearthX + (R() - 0.5) * 1.0, 0.16, ZB + 0.25 + (R() - 0.5) * 0.3, 0.03, 0.02, 0.03);
    // a long steel shelf with pots, and a rail of pans
    hbk.box(M.steel, 1.5, 0.9, ZB + 0.35, 5.0, 0.05, 0.7);
    for (const x of [-0.8, 1.5, 3.8]) for (const z of [ZB + 0.08, ZB + 0.62]) hbk.cyl(M.steel, x, 0.44, z, 0.02, 0.88, 0, 0, 0, 'cyl8');
    hbk.box(M.steelDull, 1.5, 0.3, ZB + 0.35, 4.9, 0.03, 0.65);
    hbk.box(M.steel, 1.5, 1.9, ZB + 0.25, 5.0, 0.035, 0.45);
    for (let x = -0.6; x < 4; x += 1.4) scrollBack(hbk, M, x, 1.9, ZB + 0.02);
    [[-0.5, 14], [0.4, 22], [1.6, 10], [2.6, 18], [3.6, 12]].forEach(([x, n]) => hbk.at(x, 1.92, ZB + 0.25, 0, 1, () => plateStack(hbk, M, n, 0.14)));
    hbk.cyl(M.brass, 1.5, 2.6, ZB + 0.12, 0.012, 4.6, 0, 0, Math.PI / 2, 'cyl8');
    hbk.finish();
    for (let i = 0; i < 7; i++) {
      const s = 1.0 + (i % 3) * 0.15;
      const deep = i % 2 ? 0.11 : 0.29; // the pots hang bottoms out, so sit each one its own depth off the wall
      model(i % 2 ? 'brass_pot_02' : 'brass_pot_01', { x: -0.6 + i * 0.7, y: 2.5, z: ZB + 0.08 + deep * s, rx: -Math.PI / 2, s, tint: i % 3 ? COPPER : COPPER_RED });
    }
    model('brass_pot_01', { x: 0.2, y: 0.925, z: ZB + 0.35, ry: 0.5, s: 1.6, tint: COPPER_RED });
    model('pot_enamel_01', { x: 1.4, y: 0.925, z: ZB + 0.35, ry: -0.3, s: 1.5 });
    model('brass_pot_02', { x: 2.5, y: 0.925, z: ZB + 0.35, ry: 0.9, s: 1.5, tint: COPPER });
    model('wicker_basket_01', { x: 3.6, y: 0.925, z: ZB + 0.35, ry: 0.4, s: 1.1 });
    for (let i = 0; i < 5; i++) model('yellow_onion', { x: 3.5 + (R() - 0.5) * 0.22, y: 0.97, z: ZB + 0.35 + (R() - 0.5) * 0.16, ry: R() * 6, s: 1 });
    model('wooden_crate_02', { x: 4.4, y: 0.33, z: ZB + 0.35, ry: Math.PI / 2, s: 0.55 });
    model('wine_bottles_01', { x: 2.4, y: 0.33, z: ZB + 0.3, s: 1 });
    model('wooden_crate_02', { x: -0.4, y: 0.33, z: ZB + 0.35, ry: Math.PI / 2, s: 0.5 });
    model('wooden_cutting_board', { x: 1.8, y: BH + 0.08, z: IZ + 0.1, ry: -0.3, s: 1.1 });
    model('wooden_spoon', { x: IX - 0.95, y: BH + 0.08, z: IZ + 0.4, ry: 0.4, s: 1.1 });
    model('lemon', { x: 1.75, y: BH + 0.11, z: IZ + 0.04, ry: 1, s: 1 });
    model('lemon', { x: 1.9, y: BH + 0.11, z: IZ + 0.18, ry: 2, s: 1 });
    model('yellow_onion', { x: 1.62, y: BH + 0.12, z: IZ + 0.2, s: 1 });
    model('hamburger_buns', { x: IX + 0.95, y: BH + 0.1, z: IZ + 0.42, ry: 1.3, s: 0.9 });

    // the fire: layered flame sheets, and a flickering light
    this.flameU = { uTime: { value: 0 } };
    this.flames = [];
    const flameMat = (seed, a, b2) => new THREE.ShaderMaterial({
      uniforms: { uTime: this.flameU.uTime, uSeed: { value: seed }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b2) } },
      vertexShader: flameVert, fragmentShader: flameFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: DS,
    });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + (i % 2) * 0.2, 0.9 + (i % 3) * 0.15), flameMat(i * 3.1, i % 2 ? 0xff3a08 : 0xff6a10, 0xffd060));
      f.position.set(hearthX + (i - 2) * 0.22, 0.62, ZB + 0.3 + ((i % 3) - 1) * 0.08);
      f.rotation.y = (i / 5) * Math.PI;
      g.add(f);
      this.flames.push(f);
    }
    this.fireLight = new THREE.PointLight(0xff7a22, 9, 8, 2);
    this.fireLight.position.set(hearthX, 0.9, ZB + 0.6);
    g.add(this.fireLight);

    // =========================================================== the right side: a counter with a great copper bowl, stools
    const rb = new Batch(g);
    rb.box(M.steel, 1.3, 0.88, 0.4, 1.0, 0.05, 2.2);
    rb.box(M.steelDull, 1.3, 0.3, 0.4, 0.95, 0.03, 2.1);
    for (const x of [0.85, 1.75]) for (const z of [-0.65, 1.45]) rb.cyl(M.steel, x, 0.44, z, 0.02, 0.88, 0, 0, 0, 'cyl8');
    // the copper mixing bowl: a hammered hemisphere with a rolled brass rim
    rb.at(1.3, 0.9, 0.8, 0, 1, () => {
      rb.add(new THREE.SphereGeometry(0.42, 40, 20, 0, TAU, Math.PI / 2, Math.PI / 2), M.copper, 0, 0.42, 0, 0, 0, 0, 1, 0.95, 1);
      rb.add(G.ring(0.42, 0.018, 36), M.brass, 0, 0.42, 0, Math.PI / 2);
      rb.cyl(M.copperDark, 0, 0.01, 0, 0.14, 0.02, 0, 0, 0, 'cyl28');
    });
    rb.at(1.35, 0.9, -0.2, 0.4, 1, () => {
      rb.add(new THREE.SphereGeometry(0.3, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2), M.copper, 0, 0.3, 0, 0, 0, 0, 1, 0.95, 1);
      rb.add(G.ring(0.3, 0.014, 32), M.brass, 0, 0.3, 0, Math.PI / 2);
    });
    rb.finish();
    model('metal_stool_02', { x: 4.6, y: 0, z: 0.4, ry: 0.5, s: 1.1 });
    model('wooden_cutting_board', { x: 4.6, y: 0.905, z: 0.75, ry: 0.2, s: 1.0 });
    model('hamburger_buns', { x: 4.6, y: 0.945, z: 0.75, ry: 0.9, s: 0.9 });
    rb2(this, g, M, model);
    // a wall shelf with bottles and jars above the counter
    const rs = new Batch(g);
    rs.box(M.steel, HALF_W - 0.3, 1.75, 1.2, 0.5, 0.035, 2.2);
    for (const z of [0.4, 2.0]) scrollRight(rs, M, HALF_W, 1.75, z);
    rs.finish();
    model('wine_bottles_01', { x: HALF_W - 0.5, y: 1.77, z: 0.4, ry: Math.PI / 2, s: 1 });
    model('brass_pot_02', { x: HALF_W - 0.3, y: 1.77, z: 1.5, ry: 1, s: 1.1, tint: COPPER });
    model('jug_01', { x: HALF_W - 0.3, y: 1.77, z: 0.9, ry: 2, s: 1 });

    // =========================================================== the foreground: great copper stockpots, a rack of pots overhead, lamps
    const fb = new Batch(g);
    const stockpot = (x, z, r, h, ry, lid) => fb.at(x, 0, z, ry, 1, () => {
      fb.cyl(M.copper, 0, h / 2, 0, r, h, 0, 0, 0, 'cyl28');
      fb.add(G.ring(r + 0.006, 0.016, 36), M.brass, 0, h, 0, Math.PI / 2);
      fb.add(G.ring(r + 0.004, 0.01, 36), M.brass, 0, h * 0.2, 0, Math.PI / 2);
      fb.add(G.ring(r + 0.004, 0.01, 36), M.brass, 0, h * 0.6, 0, Math.PI / 2);
      for (const sx of [-1, 1]) fb.add(G.ring(0.05 + r * 0.1, 0.014, 14, Math.PI), M.brass, sx * (r + 0.01), h * 0.8, 0, 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (lid) {
        fb.cyl(M.copperDark, 0, h + 0.015, 0, r * 1.02, 0.03, 0, 0, 0, 'cyl28');
        fb.add(G.sph, M.copperDark, 0, h + 0.03, 0, 0, 0, 0, r * 0.9, 0.08, r * 0.9);
        fb.sph(M.brass, 0, h + 0.13, 0, 0.03, 0.03, 0.03);
      } else {
        fb.cyl(M.dark, 0, h - 0.004, 0, r * 0.96, 0.006, 0, 0, 0, 'cyl28');
        fb.cyl(M.glowDim, 0, h - 0.03, 0, r * 0.95, 0.004, 0, 0, 0, 'cyl28');
      }
    });
    stockpot(-2.6, -1.3, 0.52, 1.2, 0.2, false);
    stockpot(-3.4, -0.5, 0.44, 0.98, 0.5, true);
    stockpot(-1.95, -0.75, 0.3, 0.6, 0, true);
    // a second range along the front-left: a steel top with burners
    fb.box(M.black, -4.4, 0.45, 3.3, 1.8, 0.86, 0.9);
    fb.box(M.steelDull, -4.4, 0.9, 3.3, 1.9, 0.04, 1.0);
    fb.box(M.brass, -4.4, 0.92, 3.3, 1.94, 0.012, 1.04);
    for (const x of [-4.9, -4.2]) for (const z of [3.05, 3.55]) {
      fb.cyl(M.iron, x, 0.93, z, 0.15, 0.02, 0, 0, 0, 'cyl28');
      for (let k = 0; k < 4; k++) fb.box(M.iron, x, 0.95, z, 0.33, 0.014, 0.014, (k / 4) * Math.PI);
    }
    // an overhead iron rack with pots hung from it, front right
    for (const z of [-0.2, 0.9]) fb.box(M.iron, 3.3, 3.3, z, 2.6, 0.05, 0.05);
    for (const x of [2.1, 4.5]) fb.box(M.iron, x, 3.3, 0.35, 0.05, 0.05, 1.15);
    for (const x of [2.1, 4.5]) for (const z of [-0.2, 0.9]) fb.cyl(M.iron, x, 3.3 + (WALL_H + 1.7 - 3.3) / 2, z, 0.008, WALL_H + 1.7 - 3.3, 0, 0, 0, 'cyl8');
    // copper pendant lamps: a cone shade, a glowing throat, a cord
    const lamp = (x, y, z) => {
      fb.add(new THREE.CylinderGeometry(0.08, 0.36, 0.32, 28, 1, true), M.copper, x, y, z);
      fb.add(new THREE.CylinderGeometry(0.075, 0.345, 0.3, 28, 1, true), M.lampGlow, x, y - 0.005, z);
      fb.add(G.ring(0.36, 0.012, 32), M.brass, x, y - 0.16, z, Math.PI / 2);
      fb.cyl(M.brass, x, y + 0.2, z, 0.03, 0.08, 0, 0, 0, 'cyl16');
      fb.cyl(M.dark, x, y + 0.24 + (WALL_H + 1.9 - y - 0.24) / 2, z, 0.005, WALL_H + 1.9 - y - 0.24, 0, 0, 0, 'cyl8');
      fb.sph(M.bulb, x, y - 0.08, z, 0.05, 0.06, 0.05);
    };
    this.lampPos = [[-3.4, 3.35, -0.9], [3.6, 3.35, 0.3], [-3.0, 3.4, -5.0], [3.9, 3.4, -5.2], [IX, 3.5, 2.4]];
    for (const [x, y, z] of this.lampPos) lamp(x, y, z);
    fb.finish();
    for (let i = 0; i < 6; i++) {
      model(i % 2 ? 'brass_pot_01' : 'brass_pot_02', { x: 2.3 + i * 0.44, y: 2.85, z: i % 2 ? -0.2 : 0.9, rx: -Math.PI / 2, s: 1.0 + (i % 3) * 0.12, tint: i % 3 === 2 ? COPPER_RED : COPPER });
    }

    // =========================================================== steam, dust, light
    this.steam = new Steam([
      { x: IX + 1.25, y: BH + 0.65, z: IZ + 0.25, r: 0.2, n: 70 },
      { x: -2.6, y: 1.2, z: -1.3, r: 0.4, n: 90 },
      { x: IX - 1.25, y: BH + 0.28, z: IZ + 0.25, r: 0.12, n: 30 },
      { x: 0.2, y: 1.3, z: ZB + 0.35, r: 0.15, n: 30 },
    ], { height: 1.6, rise: 0.4, spread: 2.2, size: 0.45, opacity: 0.16, color: 0xfff1e0 });
    g.add(this.steam.points);
    this.dust = new Steam([{ x: IX, y: 0.3, z: IZ + 0.5, r: 3.5, n: 260 }], { height: 3.4, rise: 0.08, spread: 0.3, size: 0.03, opacity: 0.5, color: 0xffe6b8, sway: 0.25, grow: 0.3 });
    g.add(this.dust.points);

    // the hood glows from inside, the lamps hang warm pools, the fire flickers, a key light casts the shadows
    this.hoodLights = [];
    for (const dx of [-1.0, 1.0]) {
      const l = new THREE.PointLight(0xffb050, 4, 9, 2);
      l.position.set(IX + dx, HB.y - 0.45, IZ);
      g.add(l);
      this.hoodLights.push(l);
    }
    for (const [x, y, z] of this.lampPos.slice(0, 3)) {
      const l = new THREE.PointLight(0xffa850, 2.6, 9, 2);
      l.position.set(x, y - 0.15, z);
      g.add(l);
    }
    const key = new THREE.SpotLight(0xffd9a0, 17, 18, 0.95, 0.5, 1.6);
    key.position.set(IX + 1.5, WALL_H + 2.0, IZ + 3.2);
    key.target.position.set(IX, 0.9, IZ);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    g.add(key, key.target);
    g.add(new THREE.HemisphereLight(0xffe2c0, 0x3a2218, 0.16));
    // warm uplight washing the vault
    for (const [x, z] of [[-2.0, -4.5], [2.5, 0.0]]) {
      const l = new THREE.PointLight(0xffc080, 6, 8, 2);
      l.position.set(x, WALL_H + 1.1, z);
      g.add(l);
    }

    // ---- the dining room beyond the doors, and the cart we ride in
    this.dining = buildDining(g, M, envMap, { woodMat: woodMat(4, 2) });
    this.cart = buildCart(M, envMap);
    this.cart.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); // it moves, and the shadows are baked
    g.add(this.cart);
    this.bowlSteam = new Steam([{ x: 0, y: 1.0, z: 0.02, r: 0.12, n: 24 }], { height: 0.6, rise: 0.25, spread: 1.6, size: 0.08, opacity: 0.08, color: 0xfff1e0, sway: 0.03, near: 0.75 }); // we sit inside it, so it only shows once it has risen clear of the lens
    this.cart.add(this.bowlSteam.points);
    // the ladle that pours us in, and the stream of broth from its lip
    this.pourLadle = buildLadle(envMap, { soup: true });
    this.pourLadle.scale.setScalar(0.11);
    this.pourLadle.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    this.cart.add(this.pourLadle);
    this.pourStream = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.016, 1, 10, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xd8781f, transparent: true, opacity: 0.75, roughness: 0.1, clearcoat: 1, emissive: 0x4a2206, emissiveIntensity: 0.5, envMap, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false }));
    this.cart.add(this.pourStream);

    // ---- the headset: it drops off at the end, onto the cart before the bowl
    this.headset = buildBlackHeadset(envMap);
    this.headset.scale.setScalar(HEAD_SCALE);
    this.headset.rotation.order = 'YXZ';
    this.headset.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    this.headset.visible = false;
    g.add(this.headset);
    this.eye = this.cart.userData.eye;
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  /** Where the cart is at kk, and which way it faces. */
  poseCart(k, t) {
    const c = this.cart;
    c.position.set(CART.x(k), 0, CART.z(k));
    c.rotation.y = CART.yaw(k);
    const moving = CART.moving(k);
    // it rattles over the tiles, and rolls quietly on the carpet
    const tile = 1 - ramp(k, 0.42, 0.48);
    c.position.y = Math.sin(t * 11) * 0.0025 * moving * tile + Math.sin(t * 2.1) * 0.0015 * moving;
    c.rotation.z = Math.sin(t * 7) * 0.004 * moving * tile;
    c.rotation.x = Math.sin(t * 9.3) * 0.003 * moving * tile;
  }

  /** The headset's pose over kk (world space): off, tossed ahead of us, bouncing once, at rest on the table before the screen. */
  poseHeadset(k) {
    const h = this.headset;
    h.visible = k > 0.87;
    if (!h.visible) return;
    const start = V(19.72, 1.0, AISLE + 0.02);
    const land = V(21.3, 0.76 + 0.045, AISLE - 0.08);
    let pos;
    let rx;
    let ry;
    if (k < 0.93) {
      const u = (k - 0.87) / 0.06;
      pos = V(lerp(start.x, land.x, smooth(u)), lerp(start.y, land.y, u) + 0.22 * 4 * u * (1 - u), lerp(start.z, land.z, u));
      rx = lerp(0, 1.2, u);
      ry = lerp(-Math.PI / 2, -Math.PI / 2 + 0.6, u);
    } else if (k < 0.955) {
      const v = (k - 0.93) / 0.025;
      pos = V(land.x + 0.06 * v, land.y + 0.05 * 4 * v * (1 - v), land.z);
      rx = 1.2 + 0.3 * Math.sin(Math.PI * v) - 1.2 * v;
      ry = -Math.PI / 2 + 0.6 + 0.2 * v;
    } else {
      pos = V(land.x + 0.06, land.y, land.z);
      rx = 0;
      ry = -Math.PI / 2 + 0.8;
    }
    h.position.copy(pos);
    h.rotation.set(rx, ry, 0);
  }

  /** The camera over kk: in the bowl, at its rim, riding the cart. */
  cameraPose(k, t) {
    this.poseCart(k, t);
    this.cart.updateMatrixWorld();
    // in the ladle (the same spot we rode in the pot, scaled), then out and down into the bowl
    // out of the ladle: up and over its rim, then down into the bowl, never through the steel
    const inLadle = this._tmp.set(0, CART.ladleY(k) + 0.45 * 0.11, CART.ladleZ(k) + 0.02 + 0.1 * 0.11);
    const out = CART.out(k);
    const over = new THREE.Vector3(0, CART.ladleY(k) + 0.2, CART.ladleZ(k) + 0.26);
    const a = inLadle.clone().lerp(over, out);
    const b = over.clone().lerp(this.eye, out);
    const local = a.lerp(b, out);
    local.y = Math.max(local.y, 1.005 + 0.035); // and never under the bowl's broth
    const pos = local.applyMatrix4(this.cart.matrixWorld).clone();
    const yaw = CART.yaw(k) + CART.look(k) + Math.sin(t * 0.5) * 0.01;
    const pitch = CART.pitch(k) + Math.sin(t * 0.8) * 0.006 * out;
    return { pos, pitch, yaw, roll: this.cart.rotation.z, fov: CART.fov(k) };
  }

  /** The ladle over the bowl at the start: pouring us in, then lifted away. */
  poseLadle(k) {
    const L = this.pourLadle;
    L.visible = k < 0.3;
    this.pourStream.visible = false;
    if (!L.visible) return;
    L.position.set(0.0, CART.ladleY(k), CART.ladleZ(k) + 0.02);
    L.rotation.set(CART.ladleTilt(k), 0, 0);
    // the stream: from the lip down to the broth, thinning as the ladle empties
    // the soup leaves the ladle: it slides toward the lip, sinks, and is gone
    const soup = L.userData.soup;
    if (soup) {
      const e = CART.empty(k);
      soup.visible = e < 0.999;
      soup.position.set(0, -0.35 * e, 0.9 * e);
      soup.scale.set(1 - 0.6 * e, 1, 1 - 0.95 * e);
    }
    // the stream falls from the lip (which the tilt has swung down and forward) to the broth
    const pour = CART.pour(k);
    const tilt = CART.ladleTilt(k);
    const lipY = CART.ladleY(k) - Math.sin(tilt) * 0.103;
    const lipZ = CART.ladleZ(k) + 0.02 + Math.cos(tilt) * 0.103;
    const bottom = 1.005;
    const h = Math.max(0.01, lipY - bottom);
    this.pourStream.position.set(0, bottom + h / 2, lipZ);
    this.pourStream.scale.set(0.4 + 0.6 * pour, h, 0.4 + 0.6 * pour);
    this.pourStream.material.opacity = 0.75 * pour;
  }

  update(k, t, pixelScale = 1) {
    this.poseCart(k, t);
    this.poseHeadset(k);
    this.poseLadle(k);
    // the doors swing open as the cart reaches them, and ease most of the way shut behind it
    const open = smooth(ramp(k, 0.33, 0.42)) * (1 - smooth(ramp(k, 0.5, 0.6)) * 0.85);
    for (const { leaf, s } of this.doors) leaf.rotation.y = -s * open * 1.45;
    this.flameU.uTime.value = t;
    this.hoodLights.forEach((l, i) => { l.intensity = 4 + Math.sin(t * 2.1 + i) * 0.3; });
    this.fireLight.intensity = 7 + Math.sin(t * 6.1) * 0.5 + Math.sin(t * 9.3) * 0.35 + Math.sin(t * 2.7) * 0.4;
    this.flames.forEach((f, i) => { f.scale.y = 1 + 0.12 * Math.sin(t * 7 + i * 1.7); });
    this.flameRings.forEach((r, i) => { r.scale.setScalar(0.96 + Math.sin(t * 19 + i * 2.3) * 0.04); });
    this.steam.update(t, pixelScale);
    this.dust.update(t, pixelScale);
    this.bowlSteam.update(t, pixelScale);
    this.cart.userData.brothMat.uniforms.uTime.value = t;
    this.pourLadle.userData.brothMat.uniforms.uTime.value = t;
    // the screens flicker faintly; the figures turn their heads to follow the cart as it passes
    this.dining.outside.update(t, pixelScale); // space turns beyond the windows
    this.dining.screenMats.forEach((m, i) => { m.emissiveIntensity = (m.userData.base ??= m.emissiveIntensity) * (0.97 + 0.03 * Math.sin(t * 2.3 + i * 2.1) * Math.sin(t * 0.7 + i)); });
    this.cart.updateMatrixWorld();
    const cam = this._tmp.copy(this.eye).applyMatrix4(this.cart.matrixWorld);
    for (const f of this.dining.figures) {
      const head = f.userData.head;
      if (!head.userData.rest) head.userData.rest = head.quaternion.clone();
      const d = f.position.distanceTo(cam);
      const w = (1 - ramp(d, 2.0, 6.0)) * ramp(k, 0.4, 0.45);
      head.lookAt(cam.x, cam.y, cam.z);
      this._q.copy(head.quaternion);
      head.quaternion.copy(head.userData.rest).slerp(this._q, w * 0.85);
    }
  }
}

// a steel table against the right wall by the front
function rb2(self, g, M, model) {
  const t = new Batch(g);
  t.box(M.steel, 4.6, 0.88, 1.2, 2.4, 0.05, 1.0);
  t.box(M.steelDull, 4.6, 0.3, 1.2, 2.3, 0.03, 0.95);
  for (const x of [3.5, 5.7]) for (const z of [0.75, 1.65]) t.cyl(M.steel, x, 0.44, z, 0.02, 0.88, 0, 0, 0, 'cyl8');
  t.finish();
  model('brass_pot_01', { x: 5.2, y: 0.905, z: 1.5, ry: 0.3, s: 1.5, tint: 0xff8e62 });
  model('wicker_basket_01', { x: 3.9, y: 0.905, z: 1.4, ry: 0.4, s: 1.1 });
}

// scroll brackets for shelves on the back wall (shelf runs along x, bracket hangs below it against the wall)
function scrollBack(b, M, x, y, z) {
  b.box(M.iron, x, y - 0.02, z + 0.2, 0.03, 0.03, 0.4);
  b.box(M.iron, x, y - 0.22, z + 0.02, 0.03, 0.42, 0.03);
  b.add(G.ring(0.11, 0.012, 20, Math.PI * 1.5), M.iron, x, y - 0.18, z + 0.2, 0, Math.PI / 2, Math.PI * 0.25);
  b.add(G.ring(0.05, 0.01, 14, Math.PI * 1.5), M.iron, x, y - 0.3, z + 0.12, 0, Math.PI / 2, Math.PI);
}
function scrollRight(b, M, wallX, y, z) {
  b.box(M.iron, wallX - 0.2, y - 0.02, z, 0.4, 0.03, 0.03);
  b.box(M.iron, wallX - 0.02, y - 0.22, z, 0.03, 0.42, 0.03);
  b.add(G.ring(0.11, 0.012, 20, Math.PI * 1.5), M.iron, wallX - 0.2, y - 0.18, z, 0, 0, Math.PI * 0.75);
  b.add(G.ring(0.05, 0.01, 14, Math.PI * 1.5), M.iron, wallX - 0.12, y - 0.3, z, 0, 0, 0);
}
