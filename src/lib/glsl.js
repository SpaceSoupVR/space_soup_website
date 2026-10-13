// Shared GLSL helpers: hashes, value noise (2D and 3D), fbm, and voronoi cells
// that wrap around a cylinder so the broth has no seam.
export const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }
  // nearest-cell distance and a per-cell id; x wraps every \`per\` cells
  vec2 voroP(vec2 p, float per) {
    vec2 g = floor(p), f = fract(p);
    float d1 = 8.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = g + o;
      vec2 cw = vec2(mod(c.x, per), c.y);
      vec2 r = o + vec2(hash(cw), hash(cw + 7.3)) - f;
      float d = dot(r, r);
      if (d < d1) { d1 = d; id = hash(cw + 3.1); }
    }
    return vec2(sqrt(d1), id);
  }
`;
