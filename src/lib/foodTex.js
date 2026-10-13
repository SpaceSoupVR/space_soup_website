import * as THREE from 'three';

// Procedural textures for the things floating in the soup.

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Narutomaki: white fish cake, pink scalloped edge, a pink spiral. */
export function narutoTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f0658c';
  g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fbf1ea';
  g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f0658c';
  g.lineWidth = 13;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.05) {
    const r = 4 + a * 6.4;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    if (a) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  return tex(c);
}

/** Chashu pork: a pink-brown slice, darker braised rim, swirls of fat. */
export function chashuTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, '#d99a7c');
  grd.addColorStop(0.7, '#c4825f');
  grd.addColorStop(0.86, '#8a4a2a');
  grd.addColorStop(1, '#4a2412');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(250,226,200,${0.25 + Math.random() * 0.3})`;
    g.lineWidth = 3 + Math.random() * 6;
    g.beginPath();
    const a0 = Math.random() * 6.28;
    const r0 = 18 + Math.random() * 70;
    for (let a = 0; a < 2.6; a += 0.1) {
      const r = r0 + Math.sin(a * 2 + i) * 10;
      const x = 128 + Math.cos(a0 + a) * r;
      const y = 128 + Math.sin(a0 + a) * r;
      if (a) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '60,25,10' : '255,230,205'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  return tex(c);
}
