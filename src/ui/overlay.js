import { T } from '../lib/timeline.js';
import { ramp, clamp } from '../lib/keys.js';

// The DOM that goes with the journey: the title, the nav, the goggle vignette, and the
// fade-ups on the normal site.

export class Overlay {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hero = this.$('hero');
    this.title = this.$('title');
    this.tag = this.$('tag');
    this.hint = this.$('scroll-hint');
    this.frame = this.$('vr-frame');
    this.nav = this.$('nav');
    this.started = false;

    // the flat site fades up as you reach it
    document.querySelectorAll('.card, .shot, .block h2, .block .lede, .cols p, .intro > *, .cta .wrap > *').forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }

  intro() {
    if (this.started) return;
    this.started = true;
    this.title.classList.add('on');
    this.title.querySelectorAll('.ch').forEach((c, i) => (c.style.transitionDelay = `${0.35 + i * 0.07}s`));
    this.tag.classList.add('on');
  }

  update(p, k, t, scrollY, trackEnd) {
    // ---- title: lives with the flat logo, then tears away
    const titleOut = ramp(p, 0.1, 0.19);
    const g = T.glitch(p);
    this.title.style.setProperty('--g', (g * (1 - titleOut) * 0.9).toFixed(3));
    this.hero.style.opacity = (1 - titleOut).toFixed(3);
    this.hero.style.transform = `translateY(${(titleOut * 30).toFixed(1)}px) scale(${(1 + titleOut * 0.04).toFixed(3)})`;
    this.hero.style.visibility = titleOut >= 1 ? 'hidden' : 'visible';
    this.hint.style.opacity = (1 - ramp(p, 0.01, 0.06)).toFixed(3);
    this.title.style.transform = g > 0.3 && titleOut < 1 ? `translateX(${(Math.sin(t * 90) * 4 * g).toFixed(1)}px)` : '';

    // ---- the normal site's nav: hidden for the whole animation, back once we reach the bottom of it
    const atEnd = scrollY > trackEnd - window.innerHeight * 0.35;
    this.nav.classList.toggle('show', atEnd);
    this.nav.classList.toggle('solid', atEnd);

    // ---- inside the headset
    this.frame.style.opacity = clamp(T.vignette(p)).toFixed(3);
  }
}
