import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Headset } from './Headset.js';
import { Emblem } from './Emblem.js';
import { Fall } from './Fall.js';
import { Station } from './Station.js';
import { Kitchen } from './Kitchen.js';
import { Post } from './Post.js';
import { ramp, lerp, smooth, clamp } from '../lib/keys.js';
import { revealUniforms } from '../lib/reveal.js';
import { T, WORLD_AT, PLAT_Y, SKIM_Y, K_KITCHEN } from '../lib/timeline.js';
import { allModelsLoaded } from '../lib/models.js';

// Owns the renderer, the places the journey visits (the headset in front of
// the flat logo, then the fall and the bowl it ends in), the lights and the camera.


export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.setClearColor(0x000000, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // the kitchen's shadows are baked: nothing that moves casts one
    this.renderer = renderer;
    this.small = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.prMax = Math.min(window.devicePixelRatio || 1, this.small ? 1.25 : 1.5);
    this.pr = this.prMax;
    this.perf = { acc: 0, n: 0, last: performance.now() };
    renderer.setPixelRatio(this.pr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // ---- the flat logo, and the headset cut out of it
    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.emblem = new Emblem();
    this.stage.add(this.emblem.mesh);
    this.headset = new Headset(this.env);
    this.headset.group.position.copy(this.headset.rest);
    this.stage.add(this.headset.group);

    // rim lights so the black straps read against the dark
    this.rimL = new THREE.PointLight(0x6ee7ff, 170, 40, 2);
    this.rimL.position.set(-5, 2.5, 1.5);
    this.rimR = new THREE.PointLight(0xffa24a, 170, 40, 2);
    this.rimR.position.set(5, 2.5, 1.5);
    this.keyL = new THREE.DirectionalLight(0xffffff, 1.4);
    this.keyL.position.set(1, 4, 6);
    this.stage.add(this.rimL, this.rimR, this.keyL);

    // ---- the fall, and the bowl it ends in
    this.fall = new Fall(this.env);
    this.scene.add(this.fall.group);
    this.station = new Station(this.env);
    this.station.group.position.y = PLAT_Y;
    this.scene.add(this.station.group);
    this.kitchen = new Kitchen(this.env);
    this.scene.add(this.kitchen.group);

    // the steam in the pot: a warm fog, thin to nothing in space, thick once you are below the rim
    this.potFog = new THREE.FogExp2(0xc9a070, 0);
    this.post = new Post(renderer, this.scene, this.camera);
    this.clock = new THREE.Clock();
    this.t = 0;
    this.mouse = new THREE.Vector2();
    this.mouseS = new THREE.Vector2();
    this.phase = 'stage';
    this.resize();
    // compile every phase's shaders and upload its textures now, not at the first cut to it
    this.preload();
    allModelsLoaded().then(() => this.preload('kitchen'));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
  }

  /** Render each phase once, off screen, so nothing compiles or uploads mid-journey. */
  preload(only = null) {
    const rt = this._warm || (this._warm = new THREE.WebGLRenderTarget(64, 64));
    const prev = this.renderer.getRenderTarget();
    const run = (phase, place) => {
      if (only && only !== phase) return;
      this.stage.visible = phase === 'stage';
      this.fall.group.visible = phase === 'world';
      this.station.group.visible = phase === 'world';
      this.kitchen.group.visible = phase === 'kitchen';
      this.scene.fog = phase === 'world' ? this.potFog : null;
      place();
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      // every material of this phase gets its program, and every texture goes to the GPU, whether or not the
      // warm-up camera happens to see it
      this.renderer.compile(this.scene, this.camera);
      const seen = new Set();
      this.scene.traverseVisible((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          if (seen.has(m)) continue;
          seen.add(m);
          for (const v of Object.values(m)) if (v && v.isTexture) this.renderer.initTexture(v);
          if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) this.renderer.initTexture(u.value);
        }
      });
      this.renderer.setRenderTarget(rt);
      if (phase === 'kitchen') this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
    };
    run('stage', () => { this.camera.position.set(0, 0, 14); this.camera.rotation.set(0, 0, 0); this.camera.fov = 24; });
    run('world', () => { this.fall.update(0, -60, 1 / 60); this.station.update(1 / 60, 0, 0); this.camera.position.set(0, -60, 0); this.camera.rotation.set(-1.52, 0, 0); this.camera.fov = 90; });
    run('world', () => { this.station.update(1 / 60, 0, 0.9); this.camera.position.set(0, SKIM_Y, -2); this.camera.rotation.set(-0.3, 0, 0); this.camera.fov = 70; });
    run('kitchen', () => { this.kitchen.update(0.3, 0); const c = this.kitchen.cameraPose(0.3, 0); this.camera.position.copy(c.pos); this.camera.rotation.set(c.pitch, c.yaw, 0); this.camera.fov = 66; });
    run('kitchen', () => { this.kitchen.update(0.6, 0); const c = this.kitchen.cameraPose(0.6, 0); this.camera.position.copy(c.pos); this.camera.rotation.set(c.pitch, c.yaw, 0); this.camera.fov = 66; });
    run('kitchen', () => { this.kitchen.update(0.98, 0); const c = this.kitchen.cameraPose(0.98, 0); this.camera.position.copy(c.pos); this.camera.rotation.set(c.pitch, c.yaw, 0); this.camera.fov = 66; });
    this.renderer.setRenderTarget(prev);
    this.stage.visible = true;
    this.fall.group.visible = false;
    this.station.group.visible = false;
    this.kitchen.group.visible = false;
  }

  setScale(pr) {
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.post.composer.setPixelRatio(pr);
    this.resize();
  }

  /** Hold a smooth frame rate: drop the render scale when slow, creep back up when fast. */
  adapt(now) {
    const f = this.perf;
    f.acc += now - f.last;
    f.last = now;
    f.n++;
    if (f.acc < 600) return;
    const fps = (f.n * 1000) / f.acc;
    f.acc = 0;
    f.n = 0;
    // hysteresis: step down as soon as it is clearly slow, but only creep back up after it has been
    // fast for a good while, and never more often than every couple of seconds, so the scale never
    // oscillates (every change re-allocates the render targets and pops the whole image)
    f.fast = fps > 58 ? (f.fast || 0) + 1 : 0;
    const since = now - (f.changed || 0);
    if (fps < 40 && this.pr > 0.5 && since > 1200) { this.setScale(Math.max(0.5, this.pr * (fps < 26 ? 0.7 : 0.85))); f.changed = now; f.fast = 0; }
    else if (f.fast >= 5 && this.pr < this.prMax && since > 2500) { this.setScale(Math.min(this.prMax, this.pr * 1.06)); f.changed = now; f.fast = 0; }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.aspect = w / h;
    // keep the emblem framed on narrow screens: pull the camera back
    this.fit = Math.max(1, 1.62 / this.aspect);
  }

  /** p: journey progress 0..1; k: progress after it, 0..1 (the boil first, then the kitchen) */
  frame(p, k = 0) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    const t = this.t;
    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 4));

    const u = clamp(k / K_KITCHEN); // the big boil
    const kk = clamp((k - K_KITCHEN) / (1 - K_KITCHEN)); // the kitchen
    const phase = p < WORLD_AT ? 'stage' : k > K_KITCHEN ? 'kitchen' : 'world';
    if (phase === 'kitchen' && this.phase !== 'kitchen') this.renderer.shadowMap.needsUpdate = true;
    this.phase = phase;
    this.scene.fog = phase === 'world' ? this.potFog : null;
    this.stage.visible = phase === 'stage';
    this.fall.group.visible = phase === 'world';
    this.station.group.visible = phase === 'world';
    this.kitchen.group.visible = phase === 'kitchen';
    this.renderer.toneMappingExposure = phase === 'kitchen' ? 0.66 : phase === 'world' ? 0.8 : 0.78;

    if (phase === 'stage') this.frameStage(p, dt, t);
    else if (phase === 'world') this.frameWorld(p, dt, t, u);
    else this.frameKitchen(kk, t);
    this.camera.updateProjectionMatrix();

    this.post.update(t, {
      glitch: phase === 'stage' ? T.glitch(p) * 0.8 : 0,
      barrel: T.barrel(p),
      vignette: T.vignette(p),
      flash: phase === 'kitchen' ? 0 : T.flash(p),
      spill: 0,
      soft: phase === 'kitchen' ? 1 - 0.55 * ramp(kk, 0.86, 0.96) : 0,
      warm: phase === 'kitchen' ? 0.85 : 0,
      ca: phase === 'kitchen' ? 0.2 : 1,
      lens: 0,
      warp: T.warp(p),
      bloom: phase === 'kitchen' ? 0.42 : T.bloom(p),
      bloomRadius: 0.75,
      bloomThreshold: phase === 'stage' ? lerp(0.9, 1.5, ramp(p, 0.28, 0.34)) : phase === 'kitchen' ? 0.75 : 1.0,
    });
    this.post.render();
    this.adapt(performance.now());
  }

  frameStage(p, dt, t) {
    // camera first: the headset's lunge is aimed at it
    const ph = T.phi(p);
    const R = T.radius(p) * lerp(this.fit, 1, ramp(p, 0.5, 0.7));
    const target = new THREE.Vector3(0, T.ty(p), 0);
    const w = 1 - ramp(p, 0.5, 0.68);
    const px = this.mouseS.x * 0.35 * w;
    const py = this.mouseS.y * 0.2 * w;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(target.x + R * Math.sin(px * 0.1) * Math.cos(ph), target.y + R * Math.sin(ph) - py * 0.25, target.z + R * Math.cos(px * 0.1) * Math.cos(ph));
    this.camera.lookAt(target);
    this.camera.fov = T.fov(p);

    // the headset stays the glitchy logo: it keeps twitching, in bursts
    const burst = Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 5.1));
    const creep = ramp(p, 0.08, 0.22) * (0.14 + 0.4 * burst * burst);
    const glitch = Math.max(T.glitch(p), creep);
    const bowlGlitch = 0.04 + T.glitch(p) * 0.07;

    // it hovers, then comes straight at you
    const come = T.come(p);
    const hold = 1 - come;
    const rest = this.headset.rest;
    this.headset.group.position.set(rest.x, rest.y + Math.sin(t * 0.9) * 0.02 * hold, lerp(rest.z, R + 1.2, come));
    this.headset.group.rotation.set(Math.sin(t * 0.5) * 0.012 * hold, Math.sin(t * 0.4) * 0.02 * hold, Math.sin(come * 9) * 0.06 * come);
    // the scan: above the cut height the 3D model is not drawn, until the reveal is done
    revealUniforms.uRevealOn.value = p < 0.27 ? 1 : 0;
    revealUniforms.uRevealY.value = T.revealY(p);
    this.headset.update(t, { glitch, alpha: T.flat(p), show: p > 0.1, extend: T.straps(p), come });
    this.emblem.update(t, { glitch: bowlGlitch, alpha: T.emblemBody(p) });
  }

  frameWorld(p, dt, t, u = 0) {
    const y = T.camY(p);
    // below the pot's rim the steam closes in
    const inside = ramp(-y, 392, 418);
    this.potFog.density = 0.032 * inside;
    this.station.u.uFog.value = this.potFog.density;
    this.fall.pixelScale = (this.pr * window.innerHeight) / 900;
    this.station.pixelScale = this.fall.pixelScale;
    this.fall.update(t, y, dt);
    this.station.update(dt, t, u);

    // the drop spins and sways; above the broth we hover and drift; then the ladle takes us
    const calm = T.calm(p);
    const rumble = ramp(u, 0.28, 0.42) * (1 - ramp(u, 0.6, 0.8));
    const sx = Math.sin(t * 1.1) * 0.22 * calm + Math.sin(t * 37) * 0.03 * rumble;
    const sy = (Math.sin(t * 1.3) * 0.08 + Math.sin(t * 29) * 0.035 * rumble) * (1 - calm);
    const hover = new THREE.Vector3(sx, y + sy, Math.cos(t * 0.9) * 0.22 * calm + T.walk(p));
    const ride = this.station.ride(u, t);
    const inLadle = ride.blend;
    this.camera.up.set(0, 1, 0);
    this.camera.position.lerpVectors(hover, ride.pos, inLadle);
    // never under the soup: hold the lens at least a little above whatever the surface is doing here
    this.camera.position.y = Math.max(this.camera.position.y, this.station.surfaceAt(this.camera.position.x, this.camera.position.z) + 1.1);
    const yaw = (1.6 * Math.sin(-y * 0.02) + 0.3 * Math.sin(t * 0.5)) * calm + ride.yaw;
    this.camera.rotation.set(lerp(T.camPitch(p), 0, inLadle) + ride.pitch, yaw, Math.sin(t * 0.6) * 0.08 * calm + Math.sin(t * 23) * 0.015 * rumble + ride.roll);
    this.camera.fov = T.worldFov(p) + ride.fov;
  }

  frameKitchen(k, t) {
    this.kitchen.update(k, t, (this.pr * window.innerHeight) / 900);
    const c = this.kitchen.cameraPose(k, t);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(c.pos);
    this.camera.rotation.set(c.pitch, c.yaw, c.roll ?? 0);
    this.camera.fov = c.fov ?? 64;
  }
}
