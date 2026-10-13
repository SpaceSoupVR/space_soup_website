import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// A bad pixel (NaN or infinity from a light that sits almost on top of a surface)
// would be smeared by the bloom blur into a big black block. This pass runs
// before the bloom and replaces such pixels, and caps absurdly bright ones.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c)) || any(isinf(c));
      c = bad ? vec4(0.0, 0.0, 0.0, 1.0) : min(max(c, vec4(0.0)), vec4(24.0));
      gl_FragColor = c;
    }
  `,
};

// One last pass does the "screen" look: glitch, lens barrel, chromatic edges,
// vignette, flash and film grain.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uBarrel: { value: 0 },
    uVignette: { value: 0 },
    uFlash: { value: 0 },
    uGrain: { value: 0.035 },
    uAspect: { value: 1 },
    uLens: { value: 0 },
    uWarp: { value: 0 },
    uSpill: { value: 0 },
    uCa: { value: 1 },
    uSoft: { value: 0 },
    uWarm: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGlitch, uBarrel, uVignette, uFlash, uGrain, uAspect, uLens, uWarp, uSpill, uCa, uSoft, uWarm;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      c.x *= uAspect;
      float r2 = dot(c, c);
      c *= 1.0 + k * r2;
      c.x /= uAspect;
      return c + 0.5;
    }

    void main() {
      vec2 uv = barrel(vUv, uBarrel);
      vec2 uvc = clamp(uv, 0.002, 0.998);
      // screen glitch: row displacement
      float t = floor(uTime * 20.0);
      float row = floor(uv.y * 60.0);
      float j = step(0.985 - uGlitch * 0.06, hash(vec2(row, t))) * (hash(vec2(row, t + 9.0)) - 0.5) * 0.08 * uGlitch;
      uv.x += j;

      // chromatic aberration, stronger at the edges and with the barrel
      vec2 d = (uv - 0.5);
      float ca = (0.0012 + length(d) * (0.004 + uBarrel * 0.02)) * uCa + uGlitch * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, clamp(uv + d * ca * 4.0, 0.002, 0.998)).r;
      col.g = texture2D(tDiffuse, uvc).g;
      col.b = texture2D(tDiffuse, clamp(uv - d * ca * 4.0, 0.002, 0.998)).b;

      // soft focus: the room is a little hard to make out, sharper low down where the bowl is
      if (uSoft > 0.001) {
        float amt = uSoft * (0.35 + 0.65 * smoothstep(0.05, 0.5, vUv.y));
        float rad = 0.0075 * amt;
        vec3 acc = vec3(0.0);
        float ang = hash(floor(vUv * 900.0)) * 6.2831; // a fixed per-pixel rotation: re-randomising it each frame made the blur shimmer
        for (int i = 0; i < 16; i++) {
          float k = (float(i) + 0.5) / 16.0;
          float a = ang + k * 6.2831 * 2.618;
          vec2 o = vec2(cos(a), sin(a) * uAspect) * rad * sqrt(k);
          acc += texture2D(tDiffuse, clamp(uvc + o, 0.002, 0.998)).rgb;
        }
        col = mix(col, acc / 16.0, clamp(amt * 1.2, 0.0, 1.0));
      }

      // being pulled in: a radial zoom blur toward the centre
      if (uWarp > 0.001) {
        vec3 acc = col;
        float tot = 1.0;
        for (int i = 1; i < 14; i++) {
          float k = float(i) / 14.0;
          vec2 q = 0.5 + d * (1.0 - uWarp * 0.55 * k);
          acc += texture2D(tDiffuse, q).rgb * (1.0 - k * 0.6);
          tot += (1.0 - k * 0.6);
        }
        col = mix(col, acc / tot, clamp(uWarp * 1.2, 0.0, 1.0));
        col *= 1.0 + uWarp * 0.25;
      }

      // outside the barrelled image: black
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      // the black goggle frame only shows during the pull-in; afterwards the edge is clamped
      col *= mix(1.0, inside, smoothstep(0.3, 1.0, uBarrel));

      // vignette (headset field of view)
      vec2 v = vUv - 0.5;
      v.x *= mix(1.0, 0.82, uVignette);
      float vig = smoothstep(0.82, 0.18, length(v) * (1.0 + uVignette * 0.65));
      col *= mix(1.0, vig, 0.35 + uVignette * 0.65);

      // lens: soft cyan fringe at the very edge while "inside"
      float edge = smoothstep(0.35, 0.78, length(vUv - 0.5));
      col += vec3(0.05, 0.18, 0.26) * edge * uLens;

      // a dunk: broth floods in from all round the frame and closes over the lens
      if (uSpill > 0.001) {
        vec2 c = vUv - 0.5;
        c.x *= uAspect;
        float ang = atan(c.y, c.x);
        float wob = sin(ang * 5.0 + uTime * 2.2) * 0.045 + sin(ang * 11.0 - uTime * 3.4) * 0.025 + sin(ang * 23.0 + uTime * 5.0) * 0.01;
        float rr = length(c) + wob;
        float hole = (1.0 - uSpill) * 1.05;
        float cover = smoothstep(hole - 0.015, hole + 0.015, rr);
        float depth = clamp(0.4 + (rr - hole) * 1.6, 0.0, 1.0);
        float streak = 0.5 + 0.5 * sin(ang * 7.0 + sin(rr * 9.0 + uTime * 0.8) * 2.5 + uTime * 0.4) * sin(rr * 14.0 - uTime * 0.3);
        vec3 liq = mix(vec3(0.5, 0.18, 0.03), vec3(1.0, 0.66, 0.2), depth);
        liq *= 0.9 + 0.2 * streak;
        float foam = smoothstep(0.03, 0.0, abs(rr - hole));
        col = mix(col, liq, cover);
        col += vec3(1.0, 0.9, 0.7) * foam * 0.4;
      }

      // a dark gold grade: warm highlights, cool-dark shadows, a little crushed
      if (uWarm > 0.001) {
        vec3 warm = col * vec3(1.08, 0.9, 0.62);
        vec3 graded = mix(col * vec3(0.9, 0.82, 0.8), warm, smoothstep(0.05, 0.6, dot(col, vec3(0.33))));
        graded = pow(max(graded, 0.0), vec3(1.12));
        col = mix(col, graded, uWarm);
      }
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.7, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
    this.final.uniforms.uAspect.value = w / h;
  }
  update(time, p) {
    const u = this.final.uniforms;
    u.uTime.value = time;
    u.uGlitch.value = p.glitch;
    u.uBarrel.value = p.barrel;
    u.uVignette.value = p.vignette;
    u.uFlash.value = p.flash;
    u.uLens.value = p.lens;
    u.uWarp.value = p.warp ?? 0;
    u.uSpill.value = p.spill ?? 0;
    u.uCa.value = p.ca ?? 1;
    u.uSoft.value = p.soft ?? 0;
    u.uWarm.value = p.warm ?? 0;
    this.bloom.strength = p.bloom;
    this.bloom.radius = p.bloomRadius ?? 0.7;
    this.bloom.threshold = p.bloomThreshold ?? 0.85;
  }
  render() {
    this.composer.render();
  }
}
