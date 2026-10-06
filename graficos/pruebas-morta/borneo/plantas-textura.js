/* EL ATLAS DE HOJAS Y FLORES, pintado por código (nada de ficheros de imagen): 4 × 4 casillas de
   256 px con la forma de cada hoja o flor; lo transparente se recorta en el dibujo (alphaTest).
   Las hojas van en grises claros con sus nervios (el verde de cada especie lo pone el color de los
   vértices, que multiplica); las flores, con su color. Debajo de lo transparente se extiende el
   color del borde, para que al alejarse (mipmaps) las hojas no se oscurezcan ni salga un halo.
   Solo en el navegador (usa un canvas). Las casillas, en el orden de geometria.js (CELDAS). */

import * as THREE from '../vendor/three.module.js';
import { CELDAS, LADO_ATLAS } from './geometria.js?v=202610060036';

const C = 256, N = C * LADO_ATLAS;
let textura = null;

// azar fijo, para que el atlas salga siempre igual
function azar(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// una hoja elíptica con nervio central y laterales, de (x0,y0) a (x1,y1), ancho relativo
function hoja(g, x0, y0, x1, y1, ancho, { gris = 225, nervios = 6, borde = 0, r = Math.random, punta = 0.5, base = 0.35 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  g.save(); g.translate(x0, y0); g.rotate(a);
  const W = L * ancho * 0.5;
  g.beginPath(); g.moveTo(0, 0);
  const pasos = 24, lado = (s) => {
    for (let i = 0; i <= pasos; i++) {
      const t = s > 0 ? i / pasos : 1 - i / pasos;
      // perfil: ancho máximo hacia «base», afilado hacia la punta
      let w = t < base ? Math.sin((t / base) * Math.PI / 2) : Math.pow(Math.cos(((t - base) / (1 - base)) * Math.PI / 2), punta);
      if (borde) w *= 1 - borde * (i % 2);
      g.lineTo(t * L, s * w * W);
    }
  };
  lado(1); lado(-1); g.closePath();
  const v = gris + Math.floor((r() - 0.5) * 30);
  const grad = g.createLinearGradient(0, -W, 0, W);
  grad.addColorStop(0, `rgb(${v - 18},${v - 18},${v - 18})`); grad.addColorStop(0.5, `rgb(${v + 12},${v + 12},${v + 12})`); grad.addColorStop(1, `rgb(${v - 28},${v - 28},${v - 28})`);
  g.fillStyle = grad; g.fill();
  g.strokeStyle = `rgba(90,90,90,0.55)`; g.lineWidth = Math.max(1, L * 0.012);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.97, 0); g.stroke();
  g.lineWidth = Math.max(0.6, L * 0.006); g.strokeStyle = 'rgba(110,110,110,0.45)';
  for (let k = 1; k <= nervios; k++) {
    const t = k / (nervios + 1);
    const w = (t < base ? Math.sin((t / base) * Math.PI / 2) : Math.pow(Math.cos(((t - base) / (1 - base)) * Math.PI / 2), punta)) * W * 0.85;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(t * L, 0); g.quadraticCurveTo((t + 0.05) * L, s * w * 0.5, (t + 0.12) * L, s * w); g.stroke(); }
  }
  g.restore();
}
function tallo(g, pts, grosor, gris = 150) {
  g.strokeStyle = `rgb(${gris},${gris},${gris})`; g.lineWidth = grosor; g.lineCap = 'round';
  g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke();
}

const PINTAR = {
  blanco(g) { g.fillStyle = '#fff'; g.fillRect(0, 0, C, C); },
  // un ramillete de hojas anchas sobre una ramita (dipterocarpo, roble, higuera): la base abajo
  ramillete(g) {
    const r = azar(3);
    tallo(g, [[128, 256], [128, 40]], 5, 120);
    for (let i = 0; i < 13; i++) {
      const t = 0.12 + (i / 13) * 0.82, y = 256 - t * 220, s = i % 2 ? 1 : -1;
      const largo = 70 + r() * 30 - t * 20, ang = -Math.PI / 2 + s * (0.7 + r() * 0.5 - t * 0.3);
      hoja(g, 128, y, 128 + Math.cos(ang) * largo, y + Math.sin(ang) * largo, 0.5, { r, nervios: 5, gris: 200 + r() * 40 });
    }
    hoja(g, 128, 60, 128, 4, 0.5, { r, nervios: 5 });
  },
  // la hoja enorme de la dillenia: ovalada, con nervios paralelos marcados y borde dentado
  'hoja-grande'(g) { hoja(g, 128, 254, 128, 4, 0.62, { nervios: 14, borde: 0.05, punta: 0.8, base: 0.45, gris: 215, r: azar(5) }); },
  // ramita del kauri: pares de hojas ovaladas y duras
  agathis(g) {
    const r = azar(7);
    tallo(g, [[128, 256], [128, 20]], 5, 110);
    for (let i = 0; i < 6; i++) {
      const y = 230 - i * 36;
      for (const s of [-1, 1]) hoja(g, 128, y, 128 + s * (62 - i * 4), y - 40, 0.42, { r, nervios: 2, gris: 200 + r() * 30, punta: 0.9 });
    }
    hoja(g, 128, 40, 128, 2, 0.4, { r, nervios: 2 });
  },
  // los filocladios del pino apio: hojitas en abanico con lóbulos, a lo largo del tallo
  filoclado(g) {
    const r = azar(11);
    tallo(g, [[128, 256], [128, 12]], 4, 120);
    for (let i = 0; i < 8; i++) {
      const y = 236 - i * 28, s = i % 2 ? 1 : -1;
      g.save(); g.translate(128, y); g.rotate(s * 0.9 - Math.PI / 2 + s * 0.2); g.scale(1, 0.9);
      g.beginPath(); g.moveTo(0, 0);
      for (let k = 0; k <= 8; k++) { const a = -0.6 + k * 0.15, rr = (k % 2 ? 46 : 54) + r() * 6; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); const v = 205 + r() * 30; g.fillStyle = `rgb(${v},${v},${v})`; g.fill();
      g.strokeStyle = 'rgba(100,100,100,0.4)'; g.lineWidth = 1.2; for (let k = 0; k < 4; k++) { const a = -0.5 + k * 0.33; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); g.stroke(); }
      g.restore();
    }
  },
  // fronda pinnada (palmitas y helechos): raquis en el centro y foliolos estrechos a los lados
  pinnada(g) {
    const r = azar(13);
    tallo(g, [[128, 256], [128, 4]], 4, 140);
    for (let i = 0; i < 18; i++) {
      const t = i / 18, y = 248 - t * 236, largo = 118 * (1 - t * 0.6);
      for (const s of [-1, 1]) hoja(g, 128, y, 128 + s * largo, y - largo * 0.45, 0.16, { r, nervios: 0, gris: 205 + r() * 35, punta: 0.7, base: 0.3 });
    }
  },
  // un trozo de la hoja de la palma cola de pez: foliolos en cuña con la punta rota, como colas de pez
  'cola-pez'(g) {
    const r = azar(17);
    tallo(g, [[128, 256], [128, 0]], 4, 120);
    for (let i = 0; i < 9; i++) {
      const y = 240 - i * 27;
      for (const s of [-1, 1]) {
        g.save(); g.translate(128, y); g.rotate(s > 0 ? -0.55 : Math.PI + 0.55); g.scale(1, s);
        g.beginPath(); g.moveTo(0, -2); g.lineTo(0, 4);
        const L = 112 - i * 4, W = 30;
        g.lineTo(L * 0.92, W); // el lado ancho de la cuña
        for (let k = 0; k <= 8; k++) g.lineTo(L * (0.92 + (k % 2 ? 0.08 : 0)) - k * 0.4, W - k * (W + 6) / 8); // la punta rota en dientes
        g.closePath();
        const v = 205 + r() * 35; g.fillStyle = `rgb(${v},${v},${v})`; g.fill();
        g.strokeStyle = 'rgba(100,100,100,0.4)'; g.lineWidth = 1; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.95, k * 5 - 4); g.stroke(); }
        g.restore();
      }
    }
  },
  // medio abanico del helecho Dipteris: lóbulos estrechos que salen de un punto (abajo en el centro)
  abanico(g) {
    const r = azar(19);
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 - 1.15 + k * (2.3 / 8), L = 200 + r() * 40;
      hoja(g, 128, 250, 128 + Math.cos(a) * L, 250 + Math.sin(a) * L, 0.13, { r, nervios: 0, gris: 210 + r() * 30, punta: 0.35, base: 0.15 });
    }
    g.fillStyle = 'rgb(205,205,205)'; g.beginPath(); g.arc(128, 250, 26, Math.PI, 0); g.fill();
  },
  // hoja alargada con nervio central (jengibre, phrynium, orquídea, jarras)
  pala(g) { hoja(g, 128, 254, 128, 2, 0.4, { nervios: 10, punta: 0.6, base: 0.4, gris: 215, r: azar(23) }); },
  // fronda del cuerno de alce: una correa que se parte dos veces
  cuerno(g) {
    g.strokeStyle = 'rgb(215,215,215)'; g.lineCap = 'round';
    const rama = (x, y, a, L, w, n) => {
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (n) { rama(x2, y2, a - 0.38, L * 0.7, w * 0.75, n - 1); rama(x2, y2, a + 0.38, L * 0.7, w * 0.75, n - 1); }
    };
    rama(128, 250, -Math.PI / 2, 90, 34, 2);
  },
  // la flor de la dillenia: cinco pétalos amarillos y el centro rosado
  'flor-amarilla'(g) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.save(); g.translate(128, 128); g.rotate(a);
      const grad = g.createRadialGradient(0, -60, 10, 0, -60, 70); grad.addColorStop(0, '#ffe050'); grad.addColorStop(1, '#f2c020');
      g.fillStyle = grad; g.beginPath(); g.ellipse(0, -62, 52, 62, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.fillStyle = '#d0507a'; g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4e090'; for (let k = 0; k < 40; k++) { const a = k * 2.4, d = 14 + (k % 5) * 3; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2.5, 0, 7); g.fill(); }
  },
  // un ramo de flores rojas en tubo (rododendro), visto de lado; sirve también de antorcha
  'flor-roja'(g) {
    const r = azar(29);
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k - 4) * 0.28, L = 120 + r() * 20;
      const x2 = 128 + Math.cos(a) * L, y2 = 250 + Math.sin(a) * L;
      g.strokeStyle = '#c81e28'; g.lineWidth = 18; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 250); g.lineTo(x2, y2); g.stroke();
      g.fillStyle = '#ff4a4a'; g.beginPath(); g.arc(x2, y2, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd0a0'; g.beginPath(); g.arc(x2, y2, 5, 0, Math.PI * 2); g.fill();
    }
  },
  // un pétalo de rafflesia: rojo anaranjado con verrugas blancas
  rafflesia(g) {
    const r = azar(31);
    g.fillStyle = '#b8381e'; g.beginPath(); g.ellipse(128, 128, 120, 124, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9a2a16'; g.beginPath(); g.ellipse(128, 150, 110, 100, 0, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 70; k++) {
      const x = 128 + (r() - 0.5) * 200, y = 128 + (r() - 0.5) * 200;
      if (Math.hypot((x - 128) / 112, (y - 128) / 116) > 1) continue;
      g.fillStyle = '#f2e0cc'; g.beginPath(); g.ellipse(x, y, 5 + r() * 7, 4 + r() * 5, r() * 3, 0, Math.PI * 2); g.fill();
    }
  },
  // una flor de la orquídea tigre: amarilla con manchas marrones
  'flor-orquidea'(g) {
    const r = azar(37);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      g.save(); g.translate(128, 128); g.rotate(a);
      g.fillStyle = '#e8c43a'; g.beginPath(); g.ellipse(0, -60, 30, 64, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7a3a14'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse((r() - 0.5) * 34, -30 - r() * 70, 6 + r() * 6, 5 + r() * 6, r() * 3, 0, 7); g.fill(); }
      g.restore();
    }
    g.fillStyle = '#c8a050'; g.beginPath(); g.arc(128, 128, 18, 0, 7); g.fill();
  },
  // hoja de la trepadora: ovalada y acorazonada, pegada al tronco
  teja(g) { hoja(g, 128, 250, 128, 6, 0.75, { nervios: 6, punta: 0.9, base: 0.4, gris: 200, r: azar(41) }); },
  // la red de encaje (el velo del falo): una malla de hexágonos
  encaje(g) {
    g.strokeStyle = '#fbf8f0'; g.lineWidth = 5;
    const s = 22;
    for (let y = -s; y < C + s; y += s * 1.5) for (let x = -s; x < C + s; x += s * Math.sqrt(3)) {
      const ox = (Math.round(y / (s * 1.5)) % 2) * s * Math.sqrt(3) / 2;
      g.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + ox + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9); } g.stroke();
    }
  },
};

// extiende el color de lo pintado bajo lo transparente (unas pasadas de vecinos)
function extender(d, w, h, pasadas = 8) {
  const a = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  for (let p = 0; p < pasadas; p++) {
    const nuevos = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (a[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!a[j]) continue; r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
      }
      if (n) nuevos.push(i, r / n, g / n, b / n);
    }
    for (let k = 0; k < nuevos.length; k += 4) { const i = nuevos[k]; d[i * 4] = nuevos[k + 1]; d[i * 4 + 1] = nuevos[k + 2]; d[i * 4 + 2] = nuevos[k + 3]; a[i] = 1; }
  }
}

export function texturaPlantas() {
  if (textura) return textura;
  const lienzo = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const g = lienzo.getContext('2d', { willReadFrequently: true });
  CELDAS.forEach((nombre, i) => {
    g.save(); g.translate((i % LADO_ATLAS) * C, Math.floor(i / LADO_ATLAS) * C);
    g.beginPath(); g.rect(0, 0, C, C); g.clip();
    PINTAR[nombre]?.(g);
    g.restore();
  });
  const img = g.getImageData(0, 0, N, N);
  // casilla a casilla, para que el color no salte de una a otra
  const datos = new Uint8Array(N * N * 4);
  for (let i = 0; i < CELDAS.length; i++) {
    const x0 = (i % LADO_ATLAS) * C, y0 = Math.floor(i / LADO_ATLAS) * C, d = new Uint8ClampedArray(C * C * 4);
    for (let y = 0; y < C; y++) d.set(img.data.subarray(((y0 + y) * N + x0) * 4, ((y0 + y) * N + x0 + C) * 4), y * C * 4);
    extender(d, C, C, 12);
    // lo que sigue sin color (lejos de todo): el gris medio de la casilla
    for (let k = 0; k < C * C; k++) if (d[k * 4 + 3] <= 8 && d[k * 4] === 0 && d[k * 4 + 1] === 0 && d[k * 4 + 2] === 0) { d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = 170; }
    // a la textura, con las filas al revés (en WebGL la fila 0 es la de abajo)
    for (let y = 0; y < C; y++) datos.set(d.subarray(y * C * 4, (y + 1) * C * 4), ((N - 1 - (y0 + y)) * N + x0) * 4);
  }
  textura = new THREE.DataTexture(datos, N, N, THREE.RGBAFormat);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.generateMipmaps = true; textura.minFilter = THREE.LinearMipmapLinearFilter; textura.magFilter = THREE.LinearFilter;
  textura.anisotropy = 4;
  textura.needsUpdate = true;
  return textura;
}
