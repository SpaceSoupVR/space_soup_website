import * as THREE from 'three';

// Canvas-made texture maps: a hammered copper set (colour, normal, roughness), the kitchen's
// checkered floor (colour, normal, roughness), and helpers to turn a height canvas into a
// normal map and to load a Poly Haven PBR set from /public/textures.

const rnd = (a, b) => a + Math.random() * (b - a);

export function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

export function toTexture(c, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  return t;
}

/** A tangent-space normal map from a greyscale height canvas (tiles seamlessly). */
export function normalFromHeight(hc, strength = 2) {
  const w = hc.width;
  const h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h, () => {});
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/** Hammered copper: dents, a warm mottled colour, and a roughness that varies dent to dent. */
export function hammeredCopperMaps(size = 512, dents = 900) {
  const height = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < dents; i++) {
      const x = rnd(0, w);
      const y = rnd(0, h);
      const r = rnd(size * 0.03, size * 0.06);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(60,60,60,0.9)');
      grd.addColorStop(0.75, 'rgba(128,128,128,0.4)');
      grd.addColorStop(1, 'rgba(180,180,180,0)');
      g.fillStyle = grd;
      // draw with wrap so the tile is seamless
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const color = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#c8663a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const x = rnd(0, w);
      const y = rnd(0, h);
      const r = rnd(size * 0.02, size * 0.09);
      const warm = Math.random() < 0.5;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, warm ? `rgba(255,150,90,${rnd(0.08, 0.22)})` : `rgba(90,30,20,${rnd(0.08, 0.2)})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  const rough = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#5a5a5a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '120,120,120'},${rnd(0.1, 0.35)})`;
      const r = rnd(size * 0.02, size * 0.06);
      g.beginPath();
      g.arc(rnd(0, w), rnd(0, h), r, 0, Math.PI * 2);
      g.fill();
    }
  });
  return {
    map: toTexture(color, { srgb: true }),
    normalMap: toTexture(normalFromHeight(height, 3)),
    roughnessMap: toTexture(rough),
  };
}

/** Brass: smooth, with faint brushing and fingerprints in the roughness. */
export function brassMaps(size = 256) {
  const rough = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#4a4a4a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,30,30' : '110,110,110'},${rnd(0.1, 0.3)})`;
      g.lineWidth = rnd(0.5, 1.5);
      const y = rnd(0, h);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + rnd(-3, 3));
      g.stroke();
    }
  });
  return { roughnessMap: toTexture(rough) };
}

/** The checkered floor: big cream tiles with small black diamonds at the corners, grout between. */
export function floorMaps(size = 1024) {
  const tiles = 2; // per canvas
  const tw = size / tiles;
  const grout = size * 0.006;
  const dia = size * 0.045;
  const color = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#b9b2a2';
    g.fillRect(0, 0, w, h);
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        g.fillStyle = `hsl(${rnd(38, 46)}, ${rnd(18, 28)}%, ${rnd(88, 93)}%)`;
        g.fillRect(tx * tw + grout, ty * tw + grout, tw - grout * 2, tw - grout * 2);
      }
    }
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,100,70' : '255,255,255'},${rnd(0.02, 0.07)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 3));
    }
    g.fillStyle = '#17120f';
    for (let ty = 0; ty <= tiles; ty++) {
      for (let tx = 0; tx <= tiles; tx++) {
        const x = tx * tw;
        const y = ty * tw;
        g.beginPath();
        g.moveTo(x, y - dia); g.lineTo(x + dia, y); g.lineTo(x, y + dia); g.lineTo(x - dia, y);
        g.closePath();
        g.fill();
      }
    }
  });
  const height = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#505050';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a0a0a0';
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) g.fillRect(tx * tw + grout, ty * tw + grout, tw - grout * 2, tw - grout * 2);
    }
    g.fillStyle = '#909090';
    for (let ty = 0; ty <= tiles; ty++) {
      for (let tx = 0; tx <= tiles; tx++) {
        const x = tx * tw;
        const y = ty * tw;
        g.beginPath();
        g.moveTo(x, y - dia); g.lineTo(x + dia, y); g.lineTo(x, y + dia); g.lineTo(x - dia, y);
        g.closePath();
        g.fill();
      }
    }
  });
  const rough = canvas(size, size, (g, w, h) => {
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, w, h);
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        g.fillStyle = `rgb(${Math.round(rnd(56, 72))},${Math.round(rnd(56, 72))},${Math.round(rnd(56, 72))})`;
        g.fillRect(tx * tw + grout, ty * tw + grout, tw - grout * 2, tw - grout * 2);
      }
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(200,200,200,${rnd(0.05, 0.25)})`;
      g.beginPath();
      g.arc(rnd(0, w), rnd(0, h), rnd(2, 14), 0, Math.PI * 2);
      g.fill();
    }
  });
  return {
    map: toTexture(color, { srgb: true, aniso: 16 }),
    normalMap: toTexture(normalFromHeight(height, 1.5), { aniso: 16 }),
    roughnessMap: toTexture(rough, { aniso: 16 }),
  };
}

/** A Poly Haven set from /public/textures/<name>: Diffuse, nor_gl, arm (ao, roughness, metal). */
export function pbrSet(name, { repeat = [1, 1], aniso = 8 } = {}) {
  const L = new THREE.TextureLoader();
  const load = (file, srgb) => {
    const t = L.load(`/textures/${name}/${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm');
  return { map: load('Diffuse', true), normalMap: load('nor_gl'), aoMap: arm, roughnessMap: arm, metalnessMap: arm };
}
