import { Stage } from './scene/Stage.js';
import { Overlay } from './ui/overlay.js';
import { clamp } from './lib/keys.js';
import { allModelsLoaded } from './lib/models.js';

const canvas = document.getElementById('gl');
const stage = new Stage(canvas);
const overlay = new Overlay();

// The scroll has two parts: the journey (p, 0..1) and then the kitchen (k, 0..1).
// ?p=0.3 freezes the journey at a moment, ?k=0.4 freezes the kitchen (for stills and tuning).
const HERO_VH = 2100;
const KITCHEN_VH = 1150; // the ladle first (K_KITCHEN of it), then the bowl, the cart and the dining room
const params = new URLSearchParams(location.search);
const frozenK = params.has('k') ? clamp(parseFloat(params.get('k')) || 0) : null;
const frozen = frozenK !== null ? 1 : params.has('p') ? clamp(parseFloat(params.get('p')) || 0) : null;

// ---- the countdown: the first scroll opens it, holds the page at the top for five seconds, and
// in that time every model is fetched, every texture uploaded and every scene's shaders compiled
const loader = document.getElementById('loader');
let ready = frozen !== null; // a frozen still needs no countdown
let counting = false;
const block = (e) => { if (!ready) e.preventDefault(); };
window.addEventListener('wheel', block, { passive: false });
window.addEventListener('touchmove', block, { passive: false });
window.addEventListener('keydown', (e) => { if (!ready && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) e.preventDefault(); });
async function countdown() {
  if (counting || ready) return;
  counting = true;
  window.scrollTo(0, 0);
  document.documentElement.style.overflow = 'hidden';
  loader.hidden = false;
  setTimeout(() => loader.classList.add('show'), 16);
  const num = loader.querySelector('.num');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const show = (n) => { num.textContent = n; };
  const jobs = [
    () => stage.preload('world'),
    () => stage.preload('kitchen'),
    () => allModelsLoaded(),
    () => stage.preload('kitchen'),
    () => stage.preload(),
  ];
  let done = 0;
  const work = (async () => { for (const j of jobs) { await j(); await wait(0); done++; } })();
  for (let n = 5; n >= 0; n--) {
    show(n);
    await wait(1000);
  }
  await work;
  loader.classList.remove('show');
  await wait(450);
  loader.hidden = true;
  document.documentElement.style.overflow = '';
  ready = true;
}
window.addEventListener('wheel', countdown, { passive: false, once: true });
window.addEventListener('touchstart', countdown, { passive: true, once: true });
window.addEventListener('keydown', (e) => { if (['ArrowDown', 'PageDown', ' '].includes(e.key)) countdown(); });

const track = document.getElementById('track');
track.style.height = `${HERO_VH + KITCHEN_VH}vh`;
let target = 0;
let targetK = 0;
let p = frozen ?? 0;
let k = frozenK ?? 0;
let trackEnd = 1;

function readScroll() {
  trackEnd = track.offsetHeight;
  if (!ready) { if (window.scrollY) window.scrollTo(0, 0); target = 0; targetK = 0; return; }
  const heroPx = Math.max(1, (HERO_VH / 100 - 1) * window.innerHeight);
  target = clamp(window.scrollY / heroPx);
  targetK = clamp((window.scrollY - heroPx) / ((KITCHEN_VH / 100) * window.innerHeight));
}
window.addEventListener('scroll', readScroll, { passive: true });
window.addEventListener('resize', readScroll);
readScroll();

let last = performance.now();
let hidden = false;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (frozen === null) {
    // a little inertia so the sequence glides instead of stepping
    p += (target - p) * (1 - Math.exp(-dt * 4.5));
    if (Math.abs(target - p) < 0.00005) p = target;
    k += (targetK - k) * (1 - Math.exp(-dt * 4.5));
    if (Math.abs(targetK - k) < 0.00005) k = targetK;
  } else {
    p = frozen;
    k = frozenK ?? 0;
  }
  // once the normal site has fully covered the 3D, stop drawing it
  const covered = frozen === null && window.scrollY > trackEnd + window.innerHeight * 0.15;
  if (covered !== hidden) {
    hidden = covered;
    canvas.style.visibility = covered ? 'hidden' : 'visible';
  }
  if (!covered) stage.frame(p, k);
  overlay.update(p, k, stage.t, window.scrollY, trackEnd);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

document.getElementById('again')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
// the nav and in-page links scroll within the flat site
document.querySelectorAll('#nav nav a, .intro-actions a').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id?.startsWith('#')) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: 'smooth' });
  });
});

(document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(() => overlay.intro(), 250));
