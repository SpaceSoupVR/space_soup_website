import * as THREE from 'three';

// Soft particle sprites with a life cycle: steam that rises, spreads and thins; dust motes
// that drift; flecks that swirl. Everything is computed in the vertex shader from a per
// particle seed, so thousands cost nothing on the CPU.

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
let SOFT = null;

const vert = /* glsl */ `
  attribute vec4 aSeed;   // x, z offsets, phase, size
  attribute vec3 aOrigin; // emitter position
  uniform float uTime, uRise, uSpread, uHeight, uPixel, uSway, uGrow, uNear;
  varying float vA;
  void main() {
    float life = fract(uTime * uRise / uHeight + aSeed.z);
    float y = life * uHeight;
    float sway = sin(uTime * 0.7 + aSeed.z * 40.0 + y * 1.5) * uSway * (0.3 + life);
    float spread = 1.0 + life * uSpread;
    vec3 p = aOrigin + vec3(aSeed.x * spread + sway, y, aSeed.y * spread + cos(uTime * 0.6 + aSeed.z * 31.0) * uSway * life);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float fade = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.45, 1.0, life));
    vA = fade * (0.6 + 0.4 * sin(aSeed.z * 90.0)) * smoothstep(uNear * 0.3, uNear, -mv.z);
    gl_PointSize = min(aSeed.w * (1.0 + life * uGrow) * uPixel / max(-mv.z, 0.1), uPixel * 0.4);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export class Steam {
  /**
   * emitters: [{x,y,z, r, n}] each spawns n particles within radius r.
   * o: { height, rise, spread, size, color, opacity, sway, grow, additive }
   */
  constructor(emitters, o = {}) {
    SOFT = SOFT || softTexture();
    const total = emitters.reduce((s, e) => s + e.n, 0);
    const pos = new Float32Array(total * 3);
    const seed = new Float32Array(total * 4);
    const origin = new Float32Array(total * 3);
    let i = 0;
    for (const e of emitters) {
      for (let k = 0; k < e.n; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * e.r;
        seed.set([Math.cos(a) * rr, Math.sin(a) * rr, Math.random(), (o.size ?? 0.5) * (0.6 + Math.random() * 0.8)], i * 4);
        origin.set([e.x, e.y, e.z], i * 3);
        i++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aOrigin', new THREE.BufferAttribute(origin, 3));
    this.u = {
      uTime: { value: 0 },
      uRise: { value: o.rise ?? 0.35 },
      uSpread: { value: o.spread ?? 2.5 },
      uHeight: { value: o.height ?? 1.4 },
      uPixel: { value: 600 },
      uSway: { value: o.sway ?? 0.08 },
      uGrow: { value: o.grow ?? 2.0 },
      uNear: { value: o.near ?? 0.25 },
      uMap: { value: SOFT },
      uColor: { value: new THREE.Color(o.color ?? 0xfff2e2) },
      uOpacity: { value: o.opacity ?? 0.22 },
    };
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
  }
  update(t, pixelScale = 1) {
    this.u.uTime.value = t;
    this.u.uPixel.value = 600 * pixelScale;
  }
}
