/* EL TERRENO del mundo entero.
   - Una malla basta de todo el mundo, hecha UNA vez al empezar (cada 2-80 m según el
     tamaño): el relieve, el agua y, por encima, el color del bosque (de lejos, el dosel).
   - Cerca de donde mira la cámara, el terreno de columnas de 1 m (el estilo de la v3), por
     baldosas de 30 m que se construyen en unos milisegundos cada una y se guardan.
   - El agua cercana (río y charcas): una sola malla con el `Water` de los ejemplos de three.js
     (r186, MIT, vivo/vendor/Water.js): reflejos del cielo, ondas que se mueven y transparencia.
     Refleja solo la capa del cielo (vivo/cielo.js), para no dibujar la escena dos veces.
   La altura es la del mapa del mundo (mundo/mapa.js), en escalones de 0,5 m. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { ruido2, tono } from '../graficos/pruebas-morta/escena-v3.js?v=202610032115';
import { BALDOSA } from '../mundo/mapa.js?v=202610032115';
import { Water } from './vendor/Water.js';
import { CAPA_CIELO } from './cielo.js?v=202610032115';

export const NIVEL_AGUA = -0.45;
const B = BALDOSA, DETALLE = 75; // m alrededor de la cámara con columnas (un mapa pequeño, entero)
const PALETA = {
  tierra: ['#3a2a20', '#55392a', '#6a4632'], roca: ['#3e3b40', '#5c5860', '#827c80'],
  hierba: ['#1f4422', '#2c5a28', '#3e7030', '#5a8a38'], suelo: ['#5a3e24', '#7a5a30', '#4a6a2a'],
  agua: ['#173e44', '#235a5e', '#337a78'], arena: ['#8a7450', '#a08858', '#b8a070'], dosel: ['#16351a', '#1f4422', '#2a5228'],
};
const CAJA = new THREE.BoxGeometry(1, 1, 1);

// varias cajas (x, y, z, sx, sy, sz, color) en una geometría
function juntar(cajas) {
  const P = CAJA.attributes.position, N = CAJA.attributes.normal, I = CAJA.index.array, nv = P.count;
  const pos = new Float32Array(cajas.length * nv * 3), nor = new Float32Array(cajas.length * nv * 3), col = new Float32Array(cajas.length * nv * 3);
  const idx = new Uint32Array(cajas.length * I.length);
  for (let j = 0; j < cajas.length; j++) {
    const [x, y, z, sx, sy, sz, c] = cajas[j], o = j * nv;
    for (let k = 0; k < nv; k++) {
      pos[(o + k) * 3] = x + P.getX(k) * sx; pos[(o + k) * 3 + 1] = y + P.getY(k) * sy; pos[(o + k) * 3 + 2] = z + P.getZ(k) * sz;
      nor[(o + k) * 3] = N.getX(k); nor[(o + k) * 3 + 1] = N.getY(k); nor[(o + k) * 3 + 2] = N.getZ(k);
      col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b;
    }
    for (let k = 0; k < I.length; k++) idx[j * I.length + k] = I[k] + o;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  for (const a of [...Object.values(g.attributes), g.index]) a.onUpload(soltar);
  return g;
}
function soltar() { this.array = null; }

// las ondas del agua: un mapa de normales hecho aquí (suma de ondas y ruido), que se repite
function normalesAgua() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), h = new Float32Array(N * N);
  const ondas = Array.from({ length: 7 }, (_, k) => ({ fx: Math.round(Math.cos(k * 2.1) * (2 + k)), fy: Math.round(Math.sin(k * 2.1) * (2 + k)), a: 1 / (1 + k * 0.6), f: k * 1.7 }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = ondas.reduce((s, o) => s + o.a * Math.sin(2 * Math.PI * (o.fx * x + o.fy * y) / N + o.f), 0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const l = Math.hypot(dx, dy, 2), o = (y * N + x) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (2 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function crearTerreno({ escena, mapa, ox, oz }) {
  const ruido = ruido2(7);
  // altura del suelo (o del agua) en un punto del mundo, con caché
  const cache = new Map();
  function nivel(x, z) { return Math.round(mapa.altura(x, z) * 2) / 2; }
  function cima(x, z) {
    const i = Math.floor(x), j = Math.floor(z), k = i * 1e6 + j;
    let v = cache.get(k);
    if (v === undefined) {
      if (cache.size > 400000) cache.clear();
      v = mapa.esAgua(i + 0.5, j + 0.5) ? NIVEL_AGUA : nivel(i + 0.5, j + 0.5) + 0.13;
      cache.set(k, v);
    }
    return v;
  }

  // ---- la malla basta de todo el mundo (una vez)
  const lado = Math.max(mapa.ancho, mapa.alto);
  const paso = Math.max(2, Math.ceil(lado / 400));
  const nx = Math.ceil(mapa.ancho / paso) + 1, nz = Math.ceil(mapa.alto / paso) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const c = new THREE.Color();
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = Math.min(i * paso, mapa.ancho), z = Math.min(j * paso, mapa.alto), k = (i * nz + j) * 3;
    const agua = mapa.esAgua(x, z);
    pos[k] = x - ox; pos[k + 1] = (agua ? NIVEL_AGUA - 0.1 : mapa.altura(x, z)) - 0.35; pos[k + 2] = z - oz;
    c.copy(agua ? tono(PALETA.agua, 0.3) : tono(PALETA.dosel, ruido(x * 0.05, z * 0.05)));
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < nz - 1; j++) {
    const a = i * nz + j, b = (i + 1) * nz + j;
    idx[o++] = a; idx[o++] = a + 1; idx[o++] = b; idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const basto = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  basto.receiveShadow = true;
  escena.add(basto);

  // ---- el detalle: columnas de 1 m por baldosas, cerca de la cámara
  const matSuelo = new THREE.MeshLambertMaterial({ vertexColors: true });
  const trozos = new Map(); // clave -> { mallas, usado }
  function construir(bi, bj) {
    const suelo = [], agua = [], x0 = bi * B, z0 = bj * B;
    for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) {
      const x = x0 + i + 0.5, z = z0 + j + 0.5;
      if (!mapa.enMundo(x, z)) continue;
      const esAgua = mapa.esAgua(x, z), n = esAgua ? Math.min(-1, nivel(x, z)) : nivel(x, z);
      const px = x - ox, pz = z - oz, v = ruido(x * 0.5 + 100, z * 0.5);
      // la columna (con su cara de arriba de hierba, arena o tierra)
      const arriba = esAgua ? tono(PALETA.tierra, v) : mapa.distRio(x, z) < 1.2 ? tono(PALETA.arena, v) : tono(PALETA.hierba, v * 0.7 + ruido(x * 2, z * 2) * 0.3);
      suelo.push([px, (n - 3) / 2 + 0.07, pz, 1, n + 3.14, 1, arriba]);
      if (esAgua) { agua.push(px, pz); continue; }
      // hojarasca y matas por el suelo, una de cada dos columnas
      if (ruido(x * 3.1, z * 2.7) > 0.5) {
        const w = ruido(x * 5 + 500, z * 5);
        suelo.push([px + (ruido(x + 31, z + 7) - 0.5) * 0.7, n + 0.16, pz + (ruido(x + 9, z + 17) - 0.5) * 0.7, 0.18, 0.05, 0.14, w < 0.5 ? tono(PALETA.hierba, Math.min(1, v + 0.3)) : tono(PALETA.suelo, w)]);
      }
    }
    const mallas = [];
    if (suelo.length) { const m = new THREE.Mesh(juntar(suelo), matSuelo); m.receiveShadow = true; m.castShadow = true; mallas.push(m); }
    for (const m of mallas) escena.add(m);
    return { mallas, agua };
  }
  // ---- el agua: las casillas de agua de las baldosas a la vista, en una malla Water (en su
  // plano XY: girada −90° en X, la y local es −z)
  const agua = new Water(new THREE.BufferGeometry(), {
    textureWidth: 256, textureHeight: 256, waterNormals: normalesAgua(), sunDirection: new THREE.Vector3(0.7, 0.7, 0),
    sunColor: '#ffffff', waterColor: '#1d4a44', distortionScale: 1.6, fog: true, alpha: 0.9, capas: 1 << CAPA_CIELO,
  });
  agua.rotation.x = -Math.PI / 2; agua.position.y = NIVEL_AGUA + 0.02;
  agua.material.transparent = true; agua.material.uniforms.size.value = 3;
  agua.frustumCulled = false;
  escena.add(agua);
  let firmaAgua = '';
  function rehacerAgua(claves) {
    const firma = claves.join(',');
    if (firma === firmaAgua) return;
    firmaAgua = firma;
    let n = 0;
    for (const k of claves) n += trozos.get(k).agua.length / 2;
    const pos = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    let i = 0;
    for (const k of claves) {
      const a = trozos.get(k).agua;
      for (let j = 0; j < a.length; j += 2, i++) {
        const x = a[j], z = -a[j + 1];
        pos.set([x - 0.5, z - 0.5, 0, x + 0.5, z - 0.5, 0, x + 0.5, z + 0.5, 0, x - 0.5, z + 0.5, 0], i * 12);
        idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 12).map((_, q) => (q % 3 === 2 ? 1 : 0)), 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    agua.geometry.dispose(); agua.geometry = g;
  }
  const medidas = { trozos: 0, pendientes: 0, triangulos: 0 };
  return {
    cima, medidas, basto, agua,
    // cada fotograma: dónde mira la cámara y cuánto tiempo hay para construir
    actualizar(fx, fz, ms = 4) {
      const t0 = performance.now(), quiero = new Set(), pend = [];
      // el diorama (un cuadrado pequeño): entero, con sus bordes, desde su centro
      const DETALLE = mapa.ancho <= 200 ? Math.hypot(mapa.ancho, mapa.alto) : 75;
      if (mapa.ancho <= 200) { fx = mapa.ancho / 2; fz = mapa.alto / 2; }
      for (let i = Math.floor((fx - DETALLE) / B); i <= Math.floor((fx + DETALLE) / B); i++)
        for (let j = Math.floor((fz - DETALLE) / B); j <= Math.floor((fz + DETALLE) / B); j++) {
          if (i < 0 || j < 0 || i * B >= mapa.ancho || j * B >= mapa.alto) continue;
          const d = Math.hypot(i * B + B / 2 - fx, j * B + B / 2 - fz);
          if (d > DETALLE + B) continue;
          const k = i * 100000 + j;
          quiero.add(k);
          const t = trozos.get(k);
          if (t) { t.mallas.forEach((m) => (m.visible = true)); continue; }
          pend.push([d, i, j, k]);
        }
      pend.sort((a, b) => a[0] - b[0]);
      let hechos = 0;
      for (const [, i, j, k] of pend) {
        if (hechos && performance.now() - t0 > ms) break;
        trozos.set(k, construir(i, j)); hechos++;
      }
      // los que ya no hacen falta, ocultos; y si hay muchos guardados, se tiran los más viejos
      for (const [k, t] of trozos) if (!quiero.has(k)) t.mallas.forEach((m) => (m.visible = false));
      if (trozos.size > 120) for (const [k, t] of trozos) { if (trozos.size <= 100) break; if (!quiero.has(k)) { t.mallas.forEach((m) => { escena.remove(m); m.geometry.dispose(); }); trozos.delete(k); } }
      medidas.trozos = quiero.size; medidas.pendientes = pend.length - hechos;
      rehacerAgua([...quiero].filter((k) => trozos.has(k)).sort((a, b) => a - b));
      return hechos;
    },
    *mallas() { yield basto; yield agua; for (const t of trozos.values()) yield* t.mallas; },
  };
}
