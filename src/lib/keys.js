// Keyframe tracks: everything on the page is a pure function of scroll
// progress `p` (0..1 across the hero), so scrubbing forward and back is exact.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const EASE = {
  linear: (t) => t,
  smooth,
  smoother,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

/**
 * track([[p, value, ease?], ...]) -> p => value
 * `ease` on a key shapes the move that ARRIVES at that key.
 */
export function track(keys) {
  return (p) => {
    if (p <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (p >= last[0]) return last[1];
    for (let i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        const [p0, v0] = keys[i - 1];
        const [p1, v1, e] = keys[i];
        const t = (p - p0) / (p1 - p0);
        return lerp(v0, v1, (EASE[e] || smooth)(t));
      }
    }
    return last[1];
  };
}

/** 0 before a, 1 after b, eased in between. */
export const ramp = (p, a, b, e = 'smooth') => (EASE[e] || smooth)(clamp((p - a) / (b - a)));
