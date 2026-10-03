/* PLANTAS Y SETAS de Borneo, hechas de cubitos finos como la v3. Cada constructor escribe
   sus cubos en un «saco» (con tipos: sólido, hoja que se mece, fruto, flor y brillo);
   en el editor cada planta tiene su saco y en el bioma todas comparten uno, así que
   el bosque entero son pocas mallas. */

import * as THREE from '../vendor/three.module.js';
import { azar } from '../escena-v3.js?v=202610032115';

/* El viento: cada hoja tiembla en su sitio (unos centímetros) en vez de desplazarse más
   cuanto más alta está, que separaba las copas de las ramas («hojas flotando»). */
function mecer(mat, tiempo, viento) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTiempo = tiempo;
    sh.uniforms.uViento = viento;
    sh.vertexShader = 'uniform float uTiempo;\nuniform float uViento;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float fase = mvPosition.x * 1.7 + mvPosition.z * 1.3;
      float alto = clamp(mvPosition.y, 0.0, 3.0);
      mvPosition.x += (sin(uTiempo * 2.2 + fase) + 0.5 * sin(uTiempo * 3.7 + fase * 1.9)) * uViento * (0.012 + alto * 0.004);
      mvPosition.z += cos(uTiempo * 1.9 + fase * 1.1) * uViento * 0.008;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
}

const SOL = new THREE.Vector3(-0.6, 0.75, 0.35).normalize();
const color = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
const mezcla = (a, b, t) => color(a).clone().lerp(color(b), t);
function tono(lista, t) {
  t = Math.min(0.999, Math.max(0, t)) * (lista.length - 1);
  const i = Math.floor(t);
  return mezcla(lista[i], lista[Math.min(i + 1, lista.length - 1)], t - i);
}

export class SacoP {
  constructor() { this.tipos = { solido: [], hoja: [], fruto: [], flor: [], brillo: [] }; }
  cubo(tipo, x, y, z, sx, sy, sz, c, rx = 0, ry = 0, rz = 0) { this.tipos[tipo].push({ x, y, z, sx, sy, sz, c: color(c), rx, ry, rz }); }
  get total() { return Object.values(this.tipos).reduce((n, l) => n + l.length, 0); }
  mallas(tiempo, viento) {
    const geo = new THREE.BoxGeometry(1, 1, 1), salida = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [tipo, lista] of Object.entries(this.tipos)) {
      if (!lista.length) continue;
      const mat = tipo === 'brillo' ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
      if (tipo === 'hoja' || tipo === 'flor' || tipo === 'fruto') mecer(mat, tiempo, viento);
      const malla = new THREE.InstancedMesh(geo, mat, lista.length);
      lista.forEach((cu, i) => {
        p.set(cu.x, cu.y, cu.z); s.set(cu.sx, cu.sy, cu.sz); q.setFromEuler(e.set(cu.rx, cu.ry, cu.rz));
        malla.setMatrixAt(i, m.compose(p, q, s)); malla.setColorAt(i, cu.c);
      });
      malla.castShadow = tipo !== 'brillo'; malla.receiveShadow = tipo !== 'brillo';
      malla.userData.tipo = tipo;
      malla.userData.colores = malla.instanceColor.array.slice();
      salida.push(malla);
    }
    return salida;
  }
}

/* ---- trazos básicos ---- */

// una línea de cubos entre dos puntos (ramas, raíces, tallos, lianas)
function linea(S, tipo, a, b, grosor, c, paso = 0.12) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(d.length() / paso));
  const ry = -Math.atan2(d.z, d.x), rz = Math.atan2(d.y, Math.hypot(d.x, d.z));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, g = typeof grosor === 'function' ? grosor(t) : grosor;
    S.cubo(tipo, a[0] + d.x * t, a[1] + d.y * t, a[2] + d.z * t, d.length() / n * 1.15, g, g, typeof c === 'function' ? c(t) : c, 0, ry, rz);
  }
}

function bola(S, r, cx, cy, cz, radio, colores, { tam = 0.17, densidad = 1, aplastar = 0.8, tipo = 'hoja' } = {}) {
  // tantos cubos como hagan falta para cubrir la cáscara (como la v3: unos 140 por unidad de radio² con cubos de 0,15)
  const n = Math.floor(radio * radio * 140 * densidad * (0.15 / tam) * (0.15 / tam));
  const d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (d.lengthSq() > 1) { i--; continue; }
    d.normalize().multiplyScalar(Math.cbrt(r()) * 0.3 + 0.7);
    let t = (d.y * 0.5 + 0.5) * 0.4 + (d.dot(SOL) * 0.5 + 0.5) * 0.6;
    t = Math.round(t * 4) / 4 + (r() - 0.5) * 0.08;
    const s = tam * (0.8 + r() * 0.4);
    S.cubo(tipo, cx + d.x * radio, cy + d.y * radio * aplastar, cz + d.z * radio, s, s * 0.8, s, tono(colores, t), 0, r() * 1.5, 0);
  }
}

function tronco(S, r, x, y, z, alto, grueso, colores, { inclina = 0, manchas = null } = {}) {
  const tramo = 0.125, n = Math.ceil(alto / tramo);
  let ox = 0, oz = 0;
  for (let i = 0; i < n; i++) {
    ox += inclina * tramo; oz += (r() - 0.5) * 0.01;
    const g = grueso * (1 - (i / n) * 0.35);
    S.cubo('solido', x + ox, y + i * tramo + tramo / 2, z + oz, g, tramo * 1.04, g, tono(colores, r() * 0.5 + (i % 4 === 0 ? 0.35 : 0.1)));
    if (manchas && r() < 0.35) {
      const a = r() * Math.PI * 2;
      S.cubo('solido', x + ox + Math.cos(a) * g * 0.5, y + i * tramo, z + oz + Math.sin(a) * g * 0.5, g * 0.3, tramo * 1.5, g * 0.3, manchas);
    }
  }
  return [x + ox, y + n * tramo, z + oz];
}

// hoja plana alargada: una fila de cubos que se estrecha en la punta
function hojaPlana(S, x, y, z, largo, ancho, ang, caida, c, { pasos = 5, tipo = 'hoja', punta = 0.35 } = {}) {
  for (let i = 0; i < pasos; i++) {
    const t = (i + 0.5) / pasos, d = largo * t;
    const w = ancho * (t < 0.7 ? 0.7 + t * 0.45 : (1 - t) / 0.3 * (1 - punta) + punta);
    S.cubo(tipo, x + Math.cos(ang) * d, y - caida * t * t, z + Math.sin(ang) * d, largo / pasos * 1.1, 0.025, w, c, 0, -ang, -Math.atan(caida * 2 * t / largo));
  }
}

function contrafuertes(S, r, x, y, z, n, alto, largo, c) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4;
    for (let h = 0; h < alto; h += 0.12) {
      const w = largo * (1 - h / alto);
      S.cubo('solido', x + Math.cos(a) * (0.3 + w / 2), y + h + 0.06, z + Math.sin(a) * (0.3 + w / 2), w, 0.13, 0.1, tono(c, 0.3 + r() * 0.3), 0, -a, 0);
    }
  }
}


/* ---- el escultor (como en animales.js): rellena con cubitos de lado v lo que cae dentro
   de las formas y fuera de los huecos, y mete en el saco solo los cubitos de la superficie,
   pintados con pintar(x, y, z). ---- */
const elip = (c, r, hueco = false) => ({ t: 'e', c, r, hueco });
const tuboF = (a, b, ra, rb = ra, hueco = false) => ({ t: 't', a, b, ra, rb, hueco });
function dentroF(f, x, y, z) {
  if (f.t === 'e') { const dx = (x - f.c[0]) / f.r[0], dy = (y - f.c[1]) / f.r[1], dz = (z - f.c[2]) / f.r[2]; return dx * dx + dy * dy + dz * dz <= 1; }
  const ax = f.b[0] - f.a[0], ay = f.b[1] - f.a[1], az = f.b[2] - f.a[2], l2 = ax * ax + ay * ay + az * az || 1e-9;
  const k = Math.min(1, Math.max(0, ((x - f.a[0]) * ax + (y - f.a[1]) * ay + (z - f.a[2]) * az) / l2));
  const px = f.a[0] + ax * k - x, py = f.a[1] + ay * k - y, pz = f.a[2] + az * k - z, rr = f.ra + (f.rb - f.ra) * k;
  return px * px + py * py + pz * pz <= rr * rr;
}
function limitesF(f) {
  if (f.t === 'e') return [f.c.map((v, i) => v - f.r[i]), f.c.map((v, i) => v + f.r[i])];
  const rr = Math.max(f.ra, f.rb);
  return [f.a.map((v, i) => Math.min(v, f.b[i]) - rr), f.a.map((v, i) => Math.max(v, f.b[i]) + rr)];
}
function esculpir(S, tipo, formas, pintar, v) {
  const lim = formas.filter((f) => !f.hueco).map(limitesF);
  const lo = [0, 1, 2].map((i) => Math.min(...lim.map((l) => l[0][i]))), hi = [0, 1, 2].map((i) => Math.max(...lim.map((l) => l[1][i])));
  const n = [0, 1, 2].map((i) => Math.max(1, Math.ceil((hi[i] - lo[i]) / v)));
  const lleno = new Uint8Array(n[0] * n[1] * n[2]), idx = (i, j, k) => (k * n[1] + j) * n[0] + i;
  const centro = (i, j, k) => [lo[0] + (i + 0.5) * v, lo[1] + (j + 0.5) * v, lo[2] + (k + 0.5) * v];
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const [x, y, z] = centro(i, j, k);
    if (formas.some((f) => !f.hueco && dentroF(f, x, y, z)) && !formas.some((f) => f.hueco && dentroF(f, x, y, z))) lleno[idx(i, j, k)] = 1;
  }
  const hay = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < n[0] && j < n[1] && k < n[2] && lleno[idx(i, j, k)];
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    if (!lleno[idx(i, j, k)]) continue;
    if (hay(i + 1, j, k) && hay(i - 1, j, k) && hay(i, j + 1, k) && hay(i, j - 1, k) && hay(i, j, k + 1) && hay(i, j, k - 1)) continue; // por dentro no se ve
    const [x, y, z] = centro(i, j, k);
    S.cubo(tipo, x, y, z, v * 1.02, v * 1.02, v * 1.02, pintar(x, y, z));
  }
}
const salpicado = (x, y, z, escala, umbral) => { let h = Math.floor(x / escala) * 73856093 ^ Math.floor(y / escala) * 19349663 ^ Math.floor(z / escala) * 83492791; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h >>> 0) % 1000) / 1000 < umbral; };

const VERDES = ['#183a22', '#2a5a2a', '#447e30', '#6aa23c', '#a8c85a'];
const VERDES_OSC = ['#102a1c', '#1c4224', '#2e5e2c', '#4e7e36', '#7ea04a'];

/* ---- plantas ---- */

const PLANTA = {
  dipterocarpo(S, r, x, y, z) {
    const corteza = ['#7e786c', '#a29c8e', '#c2bcae'];
    contrafuertes(S, r, x, y, z, 5, 2, 1.8, corteza);
    const [tx, ty, tz] = tronco(S, r, x, y, z, 12.5, 0.75, corteza);
    // copa de «coliflor»: varias bolas aplastadas sobre ramas gruesas
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.5, d = i ? 1.6 + r() * 1.4 : 0;
      const bx = tx + Math.cos(a) * d, by = ty + 0.6 + r() * 1.2, bz = tz + Math.sin(a) * d;
      if (i) linea(S, 'solido', [tx, ty - 0.6, tz], [bx, by - 0.5, bz], (t) => 0.32 - t * 0.18, tono(corteza, 0.5));
      bola(S, r, bx, by, bz, 1.4 + r() * 0.8, VERDES, { aplastar: 0.55 });
    }
    // frutos con dos alas (dipterocarpo = «dos alas»)
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = 1 + r() * 2.6;
      const fx = tx + Math.cos(a) * d, fy = ty - 0.2 + r() * 0.6, fz = tz + Math.sin(a) * d;
      S.cubo('fruto', fx, fy, fz, 0.09, 0.09, 0.09, '#7a4a2a');
      for (const s of [-1, 1]) S.cubo('fruto', fx + s * 0.05, fy + 0.13, fz, 0.05, 0.26, 0.025, '#c8463a', 0, 0, s * 0.25);
    }
    return { alto: 16, ancho: 9 };
  },
  agathis(S, r, x, y, z) {
    const corteza = ['#6a6258', '#8a8274', '#a69e8e'];
    const [tx, ty, tz] = tronco(S, r, x, y, z, 10, 0.6, corteza, { manchas: '#b8a890' });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + r() * 0.5, d = i ? 0.8 + r() * 1.0 : 0, by = ty - 1.6 + i * 0.4;
      const bx = tx + Math.cos(a) * d, bz = tz + Math.sin(a) * d;
      if (i) linea(S, 'solido', [tx, by - 0.5, tz], [bx, by, bz], (t) => 0.18 - t * 0.1, tono(corteza, 0.5));
      bola(S, r, bx, by + 0.3, bz, 0.9 + r() * 0.5, VERDES_OSC, { aplastar: 0.7 });
    }
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = 0.6 + r() * 1.3;
      S.cubo('fruto', tx + Math.cos(a) * d, ty + r() * 1.5, tz + Math.sin(a) * d, 0.16, 0.18, 0.16, i % 2 ? '#6a7a3a' : '#7a5a34');
    }
    return { alto: 13, ancho: 5 };
  },
  higuera(S, r, x, y, z) {
    // el árbol que abrazó (muerto, oscuro) y la celosía de raíces de la higuera
    tronco(S, r, x, y, z, 6.5, 0.6, ['#3a3228', '#4a4034', '#5a4e40']);
    const raiz = ['#8a8070', '#a69a86', '#c0b49e'];
    for (let k = 0; k < 14; k++) {
      const a0 = (k / 14) * Math.PI * 2, giro = (r() - 0.5) * 2.2;
      const p0 = [x + Math.cos(a0) * 1.1, y, z + Math.sin(a0) * 1.1];
      const p1 = [x + Math.cos(a0 + giro * 0.5) * 0.45, y + 3, z + Math.sin(a0 + giro * 0.5) * 0.45];
      const p2 = [x + Math.cos(a0 + giro) * 0.4, y + 6.8, z + Math.sin(a0 + giro) * 0.4];
      linea(S, 'solido', p0, p1, 0.11, tono(raiz, r()));
      linea(S, 'solido', p1, p2, 0.09, tono(raiz, r()));
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, d = i ? 1.4 + r() * 1.2 : 0;
      const bx = x + Math.cos(a) * d, by = y + 7.4 + r() * 0.9, bz = z + Math.sin(a) * d;
      if (i) linea(S, 'solido', [x, y + 6.6, z], [bx, by - 0.4, bz], 0.18, tono(raiz, 0.4));
      bola(S, r, bx, by, bz, 1.3 + r() * 0.5, VERDES, { aplastar: 0.6 });
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = r() * 2.6;
      S.cubo('fruto', x + Math.cos(a) * d, y + 6.6 + r() * 1.2, z + Math.sin(a) * d, 0.1, 0.1, 0.1, ['#e07a2a', '#c8322a', '#8a2a4a'][i % 3]);
    }
    return { alto: 10, ancho: 7 };
  },
  roble(S, r, x, y, z) {
    const [tx, ty, tz] = tronco(S, r, x, y, z, 5, 0.42, ['#4a3a2c', '#5e4a36', '#76603e']);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + r() * 0.6, d = i ? 1 + r() * 0.6 : 0, by = ty + 0.5 + r() * 0.6;
      const bx = tx + Math.cos(a) * d, bz = tz + Math.sin(a) * d;
      if (i) linea(S, 'solido', [tx, ty - 0.6, tz], [bx, by - 0.3, bz], (t) => 0.2 - t * 0.1, '#5e4a36');
      bola(S, r, bx, by, bz, 1.1 + r() * 0.4, VERDES_OSC);
    }
    for (let i = 0; i < 24; i++) { const a = r() * 6.28, d = r() * 1.8; S.cubo('fruto', tx + Math.cos(a) * d, ty + r() * 1.2, tz + Math.sin(a) * d, 0.09, 0.11, 0.09, '#7a5a2a'); }
    return { alto: 8, ancho: 5 };
  },
  dillenia(S, r, x, y, z) {
    const [tx, ty, tz] = tronco(S, r, x, y, z, 4, 0.38, ['#6a4a34', '#84603e', '#9a7650']);
    const puntas = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + r() * 0.4, d = 1 + r() * 0.9, fin = [tx + Math.cos(a) * d, ty + 0.4 + r() * 1.4, tz + Math.sin(a) * d];
      linea(S, 'solido', [tx, ty - 0.3 - (i % 3) * 0.3, tz], fin, (t) => 0.13 - t * 0.07, '#7a5638');
      puntas.push(fin);
      // un abanico de hojas grandes saliendo de la punta de la rama
      for (let k = 0; k < 11; k++) hojaPlana(S, fin[0], fin[1] + (k % 3) * 0.05, fin[2], 0.95, 0.42, a + (k - 5) * 0.55, 0.18, tono(VERDES, 0.35 + r() * 0.55), { pasos: 5 });
    }
    for (let i = 0; i < 14; i++) {
      const pt = puntas[i % puntas.length], fx = pt[0] + (r() - 0.5) * 0.2, fy = pt[1] + 0.12, fz = pt[2] + (r() - 0.5) * 0.2;
      for (let k = 0; k < 5; k++) { const b = k / 5 * 6.28; S.cubo('flor', fx + Math.cos(b) * 0.09, fy, fz + Math.sin(b) * 0.09, 0.12, 0.03, 0.09, '#f2d23a', 0, -b, 0); }
      S.cubo('flor', fx, fy + 0.03, fz, 0.06, 0.05, 0.06, '#e88a2a');
    }
    return { alto: 7, ancho: 5 };
  },
  'pino-apio'(S, r, x, y, z) {
    const [tx, ty, tz] = tronco(S, r, x, y, z, 3.2, 0.2, ['#4a3a2a', '#5e4a34', '#6e5a40']);
    void ty;
    for (let i = 0; i < 6; i++) {
      const yy = y + 0.9 + i * 0.4, rad = 1.0 - i * 0.13;
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * 6.28 + i * 0.5, fin = [tx + Math.cos(a) * rad, yy - rad * 0.15, tz + Math.sin(a) * rad];
        linea(S, 'solido', [tx, yy, tz], fin, 0.035, '#5e4a34', 0.08);
        for (let q = 0; q < 6; q++) { // las «hojas» de este pino son ramitas aplanadas a lo largo de la rama
          const t = 0.3 + q * 0.13, px = tx + (fin[0] - tx) * t, pz = tz + (fin[2] - tz) * t, py = yy + (fin[1] - yy) * t;
          for (const lado of [-1, 1]) S.cubo('hoja', px + Math.cos(a + lado * 1.4) * 0.12, py + 0.02, pz + Math.sin(a + lado * 1.4) * 0.12, 0.2, 0.05, 0.16, tono(VERDES_OSC, 0.3 + i * 0.1 + r() * 0.2), 0, -a - lado * 0.6, 0);
        }
      }
    }
    return { alto: 4, ancho: 2.2 };
  },
  rododendro(S, r, x, y, z) {
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + r(), fin = [x + Math.cos(a) * 0.6, y + 1 + r() * 0.4, z + Math.sin(a) * 0.6];
      linea(S, 'solido', [x, y, z], fin, 0.06, '#5a4434');
      bola(S, r, fin[0], fin[1], fin[2], 0.35, VERDES_OSC, { tam: 0.12 });
      for (let f = 0; f < 6; f++) {
        const b = f / 6 * 6.28;
        S.cubo('flor', fin[0] + Math.cos(b) * 0.18, fin[1] + 0.12, fin[2] + Math.sin(b) * 0.18, 0.05, 0.18, 0.05, '#d8322a', Math.sin(b) * 0.6, 0, -Math.cos(b) * 0.6);
      }
    }
    return { alto: 1.8, ancho: 1.8 };
  },
  'palma-cola-pez'(S, r, x, y, z) {
    const tramo = 0.125;
    for (let i = 0; i < 64; i++) S.cubo('solido', x, y + i * tramo + tramo / 2, z, 0.34, tramo, 0.34, i % 4 === 0 ? '#6a6250' : '#8a8268');
    const ty = y + 8;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * 6.28 + r() * 0.3;
      const punto = (s) => [x + Math.cos(a) * s * 0.22, ty + 0.4 + s * 0.06 - s * s * 0.012, z + Math.sin(a) * s * 0.22];
      for (let s = 0; s < 16; s++) {
        linea(S, 'hoja', punto(s), punto(s + 1), 0.05, '#4a6a2a', 0.06);
        const [px, yy, pz] = punto(s + 0.5);
        if (s > 2) for (const lado of [-1, 1]) { // hojuelas en cola de pez, pegadas al raquis
          const b = a + lado * Math.PI / 2;
          S.cubo('hoja', px + Math.cos(b) * 0.11, yy - 0.03, pz + Math.sin(b) * 0.11, 0.16, 0.02, 0.18, tono(VERDES, 0.4 + (s % 3) * 0.15), 0, -b + 0.4, 0);
          S.cubo('hoja', px + Math.cos(b) * 0.24, yy - 0.06, pz + Math.sin(b) * 0.24, 0.14, 0.02, 0.12, tono(VERDES, 0.3 + (s % 3) * 0.15), 0, -b + 0.6, 0);
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      const a = r() * 6.28;
      for (let s = 0; s < 14; s++) S.cubo('fruto', x + Math.cos(a) * 0.3, ty - 0.4 - s * 0.16, z + Math.sin(a) * 0.3 + (s % 2) * 0.03, 0.06, 0.06, 0.06, s % 3 ? '#7a2a4a' : '#a83a3a');
    }
    return { alto: 10, ancho: 7 };
  },
  pinanga(S, r, x, y, z) {
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + r(), bx = x + Math.cos(a) * 0.25, bz = z + Math.sin(a) * 0.25, alto = 1.6 + r() * 0.8;
      linea(S, 'solido', [bx, y, bz], [bx, y + alto, bz], 0.06, '#5a7a3a');
      for (let h = 0; h < 4; h++) {
        const b = h * 1.57 + r() * 0.5;
        const punto = (s) => [bx + Math.cos(b) * (0.04 + s * 0.12), y + alto + 0.12 - s * 0.045, bz + Math.sin(b) * (0.04 + s * 0.12)];
        linea(S, 'hoja', [bx, y + alto - 0.05, bz], punto(6), 0.03, '#4a6a2a', 0.05);
        for (let s = 1; s < 6; s++) {
          const [px, py, pz] = punto(s);
          for (const lado of [-1, 1]) S.cubo('hoja', px + Math.cos(b + lado * 1.57) * 0.09, py - 0.01, pz + Math.sin(b + lado * 1.57) * 0.09, 0.08, 0.02, 0.17, tono(VERDES, 0.5 + (s % 2) * 0.2), 0, -b, 0);
        }
      }
      for (let f = 0; f < 6; f++) S.cubo('fruto', bx + 0.06, y + alto * 0.7 - f * 0.05, bz, 0.05, 0.05, 0.05, f % 2 ? '#c8322a' : '#2a1a1a');
    }
    return { alto: 3, ancho: 2 };
  },
  jengibre(S, r, x, y, z) {
    for (let k = 0; k < 7; k++) {
      const a = r() * 6.28, bx = x + Math.cos(a) * 0.35, bz = z + Math.sin(a) * 0.35, alto = 2 + r() * 1;
      linea(S, 'hoja', [bx, y, bz], [bx, y + alto, bz], 0.05, '#3a6a2a');
      for (let h = 0; h < 8; h++) hojaPlana(S, bx, y + 0.6 + h * (alto - 0.6) / 8, bz, 0.7, 0.16, a + (h % 2 ? 1.57 : -1.57), 0.12, tono(VERDES, 0.4 + r() * 0.4), { pasos: 4 });
    }
    // la antorcha: un tallo propio que sale del suelo
    for (let k = 0; k < 2; k++) {
      const a = r() * 6.28, fx = x + Math.cos(a) * 0.7, fz = z + Math.sin(a) * 0.7, alto = 1 + r() * 0.3;
      linea(S, 'flor', [fx, y, fz], [fx, y + alto, fz], 0.035, '#5a7a3a');
      // brácteas exteriores abiertas como una copa, y el cono de brácteas cerradas encima
      for (let j = 0; j < 9; j++) { const b = j / 9 * 6.28; esculpir(S, 'flor', [elip([fx + Math.cos(b) * 0.2, y + alto + 0.02, fz + Math.sin(b) * 0.2], [0.14, 0.03, 0.07])], () => '#e8506a', 0.025); }
      esculpir(S, 'flor', [elip([fx, y + alto + 0.16, fz], [0.13, 0.18, 0.13])],
        (px, py, pz) => (Math.floor((py - y) / 0.04 + Math.atan2(pz - fz, px - fx) * 1.5) % 2 ? '#d8263e' : '#f2627a'), 0.025);
    }
    return { alto: 3.4, ancho: 2 };
  },
  phrynium(S, r, x, y, z) {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * 6.28 + r() * 0.4, alto = 0.8 + r() * 0.5;
      const ex = x + Math.cos(a) * 0.25, ez = z + Math.sin(a) * 0.25;
      linea(S, 'hoja', [x, y, z], [ex, y + alto, ez], 0.03, '#4a6a2a');
      hojaPlana(S, ex, y + alto, ez, 0.75, 0.38, a, 0.25, tono(VERDES, 0.45 + r() * 0.4), { pasos: 5, punta: 0.3 });
    }
    return { alto: 1.6, ancho: 2 };
  },
  dipteris(S, r, x, y, z) {
    for (let k = 0; k < 5; k++) {
      const a = r() * 6.28, alto = 1.1 + r() * 0.6;
      const ex = x + Math.cos(a) * 0.3, ez = z + Math.sin(a) * 0.3;
      linea(S, 'hoja', [x, y, z], [ex, y + alto, ez], 0.025, '#5a4a2a');
      for (const lado of [-1, 1]) for (let f = 0; f < 6; f++) { // dos medios abanicos
        const b = a + lado * (0.15 + f * 0.17);
        hojaPlana(S, ex, y + alto, ez, 0.55, 0.07, b, 0.12, tono(VERDES, 0.5 + (f % 2) * 0.2), { pasos: 3, punta: 0.6 });
      }
    }
    return { alto: 2, ancho: 1.8 };
  },
  'cuerno-alce'(S, r, x, y, z) {
    tronco(S, r, x, y, z, 3.5, 0.6, ['#5a5044', '#6e6252', '#8a7c66']);
    const h = y + 2.2;
    for (let i = 0; i < 9; i++) { const b = i / 9 * 3.14 - 1.57; S.cubo('hoja', x + 0.34 + Math.cos(b) * 0.05, h + Math.sin(b) * 0.4, z + Math.cos(b) * 0.25, 0.05, 0.22, 0.25, tono(['#6a7a3a', '#8a9a4a', '#a0a85a'], r()), 0, 0, 0); }
    for (let k = 0; k < 4; k++) { // frondas en cuerno que cuelgan, partidas en dos
      const z0 = z + (k - 1.5) * 0.18;
      linea(S, 'hoja', [x + 0.4, h - 0.1, z0], [x + 1, h - 0.9, z0], 0.07, tono(VERDES, 0.6));
      for (const lado of [-1, 1]) linea(S, 'hoja', [x + 1, h - 0.9, z0], [x + 1.15, h - 1.5, z0 + lado * 0.2], 0.06, tono(VERDES, 0.55));
    }
    return { alto: 3.5, ancho: 2 };
  },
  trepadora(S, r, x, y, z) {
    tronco(S, r, x, y, z, 4, 0.55, ['#5a5044', '#6e6252', '#8a7c66']);
    for (let i = 0; i < 26; i++) {
      const b = i * 0.55, h = y + 0.2 + i * 0.14;
      S.cubo('hoja', x + Math.cos(b) * 0.31, h, z + Math.sin(b) * 0.31, 0.04, 0.2, 0.16, tono(VERDES, 0.35 + (i % 3) * 0.2), 0, -b, 0);
    }
    return { alto: 4, ancho: 1 };
  },
  orquidea(S, r, x, y, z) {
    linea(S, 'solido', [x - 1.2, y + 1.5, z], [x + 1.2, y + 1.7, z], 0.22, '#5e5040');
    for (let k = 0; k < 9; k++) {
      const bx = x - 0.4 + r() * 0.8;
      linea(S, 'hoja', [bx, y + 1.7, z], [bx + (r() - 0.5) * 0.3, y + 2.6, z + (r() - 0.5) * 0.3], 0.06, '#8a9a3a');
      for (let h = 0; h < 3; h++) hojaPlana(S, bx, y + 2.3 + h * 0.1, z, 0.6, 0.06, r() * 6.28, 0.3, tono(VERDES, 0.6), { pasos: 4 });
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1, base = [x + Math.cos(a) * 0.3, y + 1.8, z + Math.sin(a) * 0.3], fin = [base[0] + Math.cos(a) * 0.8, y + 1.0, base[2] + Math.sin(a) * 0.8];
      linea(S, 'flor', base, fin, 0.03, '#6a7a3a');
      for (let f = 0; f < 6; f++) {
        const t = (f + 0.5) / 6, fx = base[0] + (fin[0] - base[0]) * t, fy = base[1] + (fin[1] - base[1]) * t, fz = base[2] + (fin[2] - base[2]) * t;
        for (let p = 0; p < 5; p++) { const b = p / 5 * 6.28; S.cubo('flor', fx + Math.cos(b) * 0.06, fy - 0.05, fz + Math.sin(b) * 0.06, 0.07, 0.025, 0.045, p % 2 ? '#e8c43a' : '#8a3a1a', 0, -b, 0); }
      }
    }
    return { alto: 3, ancho: 2.5 };
  },
  nepenthes(S, r, x, y, z) {
    const tallo = '#6a8a2a';
    let p = [x, y, z];
    for (let i = 0; i < 6; i++) {
      const q = [p[0] + (r() - 0.5) * 0.4, p[1] + 0.35, p[2] + (r() - 0.5) * 0.4];
      linea(S, 'hoja', p, q, 0.04, tallo);
      const a = r() * 6.28;
      hojaPlana(S, q[0], q[1], q[2], 0.45, 0.12, a, 0.05, tono(['#5a7a2a', '#7a9a3a', '#9aa848'], r()), { pasos: 3 });
      // zarcillo hasta la jarra
      const fin = [q[0] + Math.cos(a) * 0.65, q[1] - 0.15, q[2] + Math.sin(a) * 0.65];
      linea(S, 'hoja', [q[0] + Math.cos(a) * 0.45, q[1], q[2] + Math.sin(a) * 0.45], fin, 0.015, tallo, 0.05);
      jarra(S, fin[0], fin[1] - 0.35, fin[2], 0.11, 0.32, ['#8a9a2a', '#a83a2a'], r);
      p = q;
    }
    return { alto: 2.4, ancho: 2 };
  },
  'nepenthes-rajah'(S, r, x, y, z) {
    for (let k = 0; k < 8; k++) hojaPlana(S, x, y + 0.08, z, 0.8, 0.22, k / 8 * 6.28, -0.05, tono(['#4a6a2a', '#6a8a3a', '#8aa04a'], r()), { pasos: 4 });
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.5; jarra(S, x + Math.cos(a) * 0.75, y, z + Math.sin(a) * 0.75, 0.24, 0.5, ['#8a2a2a', '#c8402a'], r); }
    return { alto: 1, ancho: 2.2 };
  },
  rafflesia(S, r, x, y, z) {
    linea(S, 'solido', [x - 1.6, y + 0.05, z - 0.8], [x + 1.4, y + 0.08, z + 0.6], 0.09, '#5a4a34'); // la liana que la lleva dentro
    const lobulos = [];
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + 0.3; lobulos.push(elip([x + Math.cos(a) * 0.36, y + 0.07, z + Math.sin(a) * 0.36], [0.27, 0.07, 0.27])); }
    esculpir(S, 'flor', lobulos, (px, py, pz) => (py > y + 0.1 && salpicado(px, py, pz, 0.045, 0.22) ? '#efdcc6' : salpicado(px, py, pz, 0.03, 0.3) ? '#a42a18' : '#c03a22'), 0.03);
    // el anillo (diafragma) levantado con su boca, y dentro el disco con púas
    esculpir(S, 'flor', [tuboF([x, y + 0.08, z], [x, y + 0.26, z], 0.26, 0.2), tuboF([x, y + 0.1, z], [x, y + 0.3, z], 0.16, 0.12, true)],
      (px, py, pz) => (salpicado(px, py, pz, 0.04, 0.2) ? '#efdcc6' : '#b4321e'), 0.025);
    esculpir(S, 'flor', [elip([x, y + 0.12, z], [0.15, 0.03, 0.15])], () => '#4a1a12', 0.025);
    for (let i = 0; i < 16; i++) { const b = i / 16 * 6.28; S.cubo('flor', x + Math.cos(b) * 0.09, y + 0.16, z + Math.sin(b) * 0.09, 0.02, 0.06, 0.02, '#e8d0b8'); }
    // dos capullos al lado: bolas oscuras como coles
    for (let k = 0; k < 2; k++) esculpir(S, 'solido', [elip([x - 0.95 - k * 0.45, y + 0.14 + k * 0.03, z - 0.45], [0.16 + k * 0.05, 0.13 + k * 0.04, 0.16 + k * 0.05])],
      (px, py, pz) => (salpicado(px, py, pz, 0.04, 0.35) ? '#6a3a22' : '#3e2216'), 0.03);
    return { alto: 0.6, ancho: 2.4 };
  },
};

// una jarra de planta carnívora, esculpida: el saco hueco con su boca roja (peristoma) y la tapa
function jarra(S, x, y, z, radio, alto, colores, r) {
  const v = Math.max(0.018, radio * 0.13);
  const top = y + alto;
  esculpir(S, 'hoja', [
    elip([x, y + alto * 0.36, z], [radio, alto * 0.38, radio]),                 // la panza
    tuboF([x, y + alto * 0.4, z], [x, top - radio * 0.15, z], radio * 0.78, radio * 0.68), // el cuello
    tuboF([x, y + alto * 0.45, z], [x, top + v, z], radio * 0.62, radio * 0.55, true), // hueco por dentro
  ], (px, py, pz) => (salpicado(px, py, pz, v * 1.5, 0.35) ? colores[1] : tono(colores, (py - y) / alto * 0.6 + 0.15)), v);
  // el peristoma: un aro rojo con estrías alrededor de la boca
  esculpir(S, 'flor', [tuboF([x, top - radio * 0.15, z], [x, top + radio * 0.06, z], radio * 0.86, radio * 0.86), tuboF([x, top - radio * 0.3, z], [x, top + radio * 0.2, z], radio * 0.6, radio * 0.6, true)],
    (px, py, pz) => (Math.floor(Math.atan2(pz - z, px - x) * 8) % 2 ? '#d82a2a' : '#a01c1c'), v * 0.8);
  // la tapa, inclinada sobre la boca
  esculpir(S, 'hoja', [elip([x - radio * 0.25, top + radio * 0.55, z], [radio * 0.75, radio * 0.12, radio * 0.7])], () => colores[1], v * 0.8);
}

/* ---- setas ---- */

function sombrero(S, tipo, x, y, z, radio, alto, c, debajo) {
  for (let i = 0; i < 4; i++) {
    const t = i / 4, rad = radio * Math.sqrt(1 - t * t * 0.9);
    S.cubo(tipo, x, y + t * alto, z, rad * 2, alto / 4 * 1.1, rad * 2, typeof c === 'function' ? c(t) : c, 0, i * 0.3, 0);
  }
  if (debajo) S.cubo(tipo === 'brillo' ? 'brillo' : 'solido', x, y - 0.012, z, radio * 1.8, 0.02, radio * 1.8, debajo);
}

function pie(S, x, y, z, alto, grosor, c) { for (let h = 0; h < alto; h += 0.04) S.cubo('solido', x, y + h + 0.02, z, grosor, 0.045, grosor, c); }

function tronquito(S, x, y, z, largo, c = '#5a4632') { linea(S, 'solido', [x - largo / 2, y + 0.12, z], [x + largo / 2, y + 0.12, z], 0.24, (t) => (Math.floor(t * 8) % 2 ? c : '#6e5640')); }

const SETA = {
  amanita(S, r, x, y, z) {
    for (const [dx, dz, e] of [[0, 0, 1], [0.3, 0.15, 0.7], [-0.25, 0.2, 0.55]]) {
      const px = x + dx, pz = z + dz;
      S.cubo('solido', px, y + 0.05, pz, 0.16 * e, 0.1 * e, 0.16 * e, '#e8e2d2');
      pie(S, px, y, pz, 0.4 * e, 0.07 * e, '#f0ebe0');
      sombrero(S, 'solido', px, y + 0.4 * e, pz, 0.22 * e, 0.12 * e, (t) => mezcla('#a89070', '#c8b08a', t), '#f2ede0');
      for (let i = 0; i < 9; i++) { const b = r() * 6.28, d = r() * 0.17 * e; S.cubo('solido', px + Math.cos(b) * d, y + 0.53 * e, pz + Math.sin(b) * d, 0.035, 0.03, 0.035, '#f4f0e6'); }
    }
    return { alto: 0.7, ancho: 0.9 };
  },
  russula(S, r, x, y, z) {
    for (const [dx, dz, e] of [[0, 0, 1], [0.28, -0.1, 0.75]]) {
      pie(S, x + dx, y, z + dz, 0.22 * e, 0.09 * e, '#f4f0e6');
      sombrero(S, 'solido', x + dx, y + 0.22 * e, z + dz, 0.2 * e, 0.06 * e, '#c8242a', '#f2ece0');
    }
    return { alto: 0.4, ancho: 0.7 };
  },
  boleto(S, r, x, y, z) {
    pie(S, x, y, z, 0.25, 0.12, '#c8a032');
    for (let h = 0.04; h < 0.25; h += 0.08) S.cubo('solido', x, y + h, z, 0.125, 0.02, 0.125, '#b8382a');
    sombrero(S, 'solido', x, y + 0.25, z, 0.22, 0.1, (t) => mezcla('#7a1a1a', '#a02a22', t), '#e8c43a');
    return { alto: 0.45, ancho: 0.6 };
  },
  falo(S, r, x, y, z) {
    S.cubo('solido', x, y + 0.04, z, 0.18, 0.08, 0.18, '#e8dcc8');
    pie(S, x, y, z, 0.5, 0.08, '#f4efe2');
    sombrero(S, 'solido', x, y + 0.48, z, 0.08, 0.1, '#4a4a2a');
    // la falda de encaje: una red cónica con huecos
    for (let i = 0; i < 9; i++) for (let k = 0; k < 18; k++) {
      if ((i + k) % 2) continue;
      const b = k / 18 * 6.28, rad = 0.07 + i * 0.022;
      S.cubo('flor', x + Math.cos(b) * rad, y + 0.44 - i * 0.035, z + Math.sin(b) * rad, 0.025, 0.025, 0.025, '#fbf8f0');
    }
    return { alto: 0.65, ancho: 0.6 };
  },
  estrella(S, r, x, y, z) {
    S.cubo('solido', x, y + 0.05, z, 0.16, 0.1, 0.16, '#f0e6d8');
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.28;
      for (const lado of [-1, 1]) linea(S, 'flor', [x + Math.cos(a) * 0.06, y + 0.12, z + Math.sin(a) * 0.06], [x + Math.cos(a + lado * 0.12) * 0.32, y + 0.08, z + Math.sin(a + lado * 0.12) * 0.32], 0.035, '#e0241e', 0.04);
    }
    S.cubo('solido', x, y + 0.13, z, 0.12, 0.02, 0.12, '#3a2a1a');
    return { alto: 0.25, ancho: 0.8 };
  },
  copa(S, r, x, y, z) {
    linea(S, 'solido', [x - 0.6, y + 0.05, z], [x + 0.6, y + 0.08, z + 0.1], 0.07, '#5a4632');
    for (let k = 0; k < 6; k++) {
      const px = x - 0.45 + k * 0.18, pz = z + (r() - 0.5) * 0.15, e = 0.7 + r() * 0.5;
      pie(S, px, y + 0.06, pz, 0.08 * e, 0.025, '#e8c8a0');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 10; j++) {
        const b = j / 10 * 6.28, rad = (0.04 + i * 0.025) * e;
        S.cubo('flor', px + Math.cos(b) * rad, y + 0.14 * e + i * 0.025, pz + Math.sin(b) * rad, 0.03, 0.03, 0.03, i === 2 ? '#f08a3a' : '#e05a1e');
      }
      for (let j = 0; j < 8; j++) { const b = j / 8 * 6.28; S.cubo('flor', px + Math.cos(b) * 0.1 * e, y + 0.22 * e, pz + Math.sin(b) * 0.1 * e, 0.008, 0.06, 0.008, '#f2d0a0'); }
    }
    return { alto: 0.35, ancho: 1.3 };
  },
  repisa(S, r, x, y, z) {
    tronquito(S, x, y, z, 1.6);
    for (let k = 0; k < 7; k++) {
      const px = x - 0.6 + k * 0.2, pz = z + 0.18 + (r() - 0.5) * 0.06;
      pie(S, px, y + 0.15, pz, 0.08, 0.025, '#e8c43a');
      for (let i = 0; i < 3; i++) S.cubo('solido', px, y + 0.24 + i * 0.012, pz, 0.24 - i * 0.05, 0.014, 0.24 - i * 0.05, ['#6a4a2a', '#9a7448', '#c8a878'][i]);
    }
    return { alto: 0.45, ancho: 1.6 };
  },
  luminosa(S, r, x, y, z, e) {
    tronquito(S, x, y, z, 1.4, '#4a3a2a');
    const n = e.modelo.pequena ? 26 : 16;
    for (let k = 0; k < n; k++) {
      const px = x - 0.6 + r() * 1.2, pz = z + 0.08 + r() * 0.12, tam = (e.modelo.pequena ? 0.05 : 0.08) * (0.7 + r() * 0.6);
      pie(S, px, y + 0.18, pz, tam * 0.8, 0.012, e.modelo.color);
      S.cubo('brillo', px, y + 0.18 + tam * 0.8, pz, tam, tam * 0.4, tam, e.modelo.luz);
    }
    return { alto: 0.35, ancho: 1.4, luz: e.modelo.luz };
  },
  termitomyces(S, r, x, y, z) {
    // el termitero de barro y la seta que lo atraviesa
    for (let i = 0; i < 12; i++) {
      const rad = 0.6 * (1 - i / 12), n = Math.max(6, Math.round(rad * 22));
      for (let k = 0; k < n; k++) { const b = k / n * 6.28 + i; S.cubo('solido', x + Math.cos(b) * rad, y + i * 0.09 + 0.045, z + Math.sin(b) * rad, 0.14, 0.1, 0.14, i % 3 ? '#a8784a' : '#8a5e38'); }
    }
    const px = x + 0.35, pz = z + 0.2;
    pie(S, px, y + 0.3, pz, 0.45, 0.06, '#efe6d6');
    sombrero(S, 'solido', px, y + 0.75, pz, 0.24, 0.08, '#d8c8a8');
    S.cubo('solido', px, y + 0.86, pz, 0.06, 0.08, 0.06, '#7a5a3a');
    return { alto: 1.1, ancho: 1.4 };
  },
  cordyceps(S, r, x, y, z) {
    linea(S, 'hoja', [x - 0.6, y + 0.5, z], [x + 0.5, y + 0.55, z], 0.02, '#5a7a2a');
    for (let i = 0; i < 6; i++) S.cubo('hoja', x - 0.5 + i * 0.18, y + 0.53, z, 0.2, 0.012, 0.3 - Math.abs(i - 2.5) * 0.05, tono(VERDES, 0.6));
    // la hormiga muerta agarrada al nervio de la hoja, por debajo
    const hx = x + 0.05, hy = y + 0.45;
    S.cubo('solido', hx - 0.06, hy, z, 0.07, 0.05, 0.05, '#2a1a12'); S.cubo('solido', hx + 0.02, hy, z, 0.05, 0.04, 0.04, '#2a1a12'); S.cubo('solido', hx + 0.07, hy + 0.01, z, 0.045, 0.045, 0.045, '#2a1a12');
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) S.cubo('solido', hx - 0.04 + k * 0.04, hy - 0.04, z + s * 0.04, 0.008, 0.06, 0.008, '#2a1a12');
    linea(S, 'flor', [hx + 0.08, hy + 0.01, z], [hx + 0.12, hy - 0.35, z + 0.05], 0.012, '#c8a05a', 0.03);
    S.cubo('flor', hx + 0.12, hy - 0.2, z + 0.04, 0.035, 0.07, 0.035, '#a05a2a');
    return { alto: 0.7, ancho: 1.2 };
  },
};

/* ---- montar una planta o seta suelta (para el editor) ---- */

export function construir(especie, S, r, x = 0, y = 0, z = 0) {
  const f = PLANTA[especie.modelo.tipo] || SETA[especie.modelo.tipo];
  return f(S, r, x, y, z, especie);
}

export function crearPlanta(especie) {
  let h = 0; for (const ch of especie.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const r = azar(h >>> 0), S = new SacoP();
  const tiempo = { value: 0 }, viento = { value: 1 };
  const medidas = construir(especie, S, r);
  const raiz = new THREE.Group();
  const mallas = S.mallas(tiempo, viento);
  mallas.forEach((m) => raiz.add(m));
  const esSeta = !!SETA[especie.modelo.tipo];
  const arbol = ['dipterocarpo', 'agathis', 'higuera', 'roble', 'dillenia', 'palma-cola-pez'].includes(especie.modelo.tipo);
  const tieneFlor = mallas.some((m) => m.userData.tipo === 'flor'), tieneFruto = mallas.some((m) => m.userData.tipo === 'fruto');
  const anims = esSeta
    ? ['quieto', 'brotar', 'esporas', ...(medidas.luz ? ['brillar'] : []), 'pudrir']
    : ['viento', 'crecer', ...(tieneFlor ? ['florecer'] : []), ...(tieneFruto ? ['fructificar'] : []), 'marchitar', ...(arbol ? ['caer'] : [])];
  const caja = new THREE.Box3().setFromObject(raiz);
  // esporas: una nube de puntos que sale del sombrero
  let esporas = null;
  if (esSeta) {
    const n = 120, pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    esporas = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#f2ecd8', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }));
    esporas.userData.semillas = Array.from({ length: n }, () => [r() - 0.5, r(), r() - 0.5, r()]);
    esporas.visible = false; raiz.add(esporas);
  }
  const P = {
    raiz, anims, anim: anims[0], inicio: 0, tiempo, viento, cubos: S.total, tam: caja.getSize(new THREE.Vector3()), centro: caja.getCenter(new THREE.Vector3()), luz: medidas.luz,
    poner(nombre, t = 0) {
      this.anim = nombre; this.inicio = t;
      for (const m of mallas) { m.instanceColor.array.set(m.userData.colores); m.instanceColor.needsUpdate = true; m.scale.set(1, 1, 1); m.visible = true; }
      if (m0brillo()) m0brillo().material.color.set('#ffffff');
    },
    paso(t) {
      const k = t - this.inicio, a = this.anim;
      tiempo.value = t;
      viento.value = esSeta ? 0 : a === 'viento' ? 1.2 : 0.5;
      raiz.scale.set(1, 1, 1); raiz.rotation.set(0, 0, 0); raiz.position.set(0, 0, 0);
      if (esporas) esporas.visible = false;
      if (a === 'crecer' || a === 'brotar') {
        const f = Math.min(1, ((k % 6) / (esSeta ? 2.5 : 4.5)));
        const s = 0.04 + 0.96 * f * f * (3 - 2 * f);
        raiz.scale.set(s, s, s);
      } else if (a === 'florecer' || a === 'fructificar') {
        const f = Math.min(1, (k % 5) / 2.5);
        for (const m of mallas) if (m.userData.tipo === (a === 'florecer' ? 'flor' : 'fruto')) { m.scale.setScalar(Math.max(0.001, f)); }
      } else if (a === 'marchitar' || a === 'pudrir') {
        const f = Math.min(1, k / 4);
        const marron = new THREE.Color(esSeta ? '#3a2a1e' : '#7a5a2a');
        for (const m of mallas) {
          if (m.userData.tipo === 'solido' && !esSeta) continue;
          const arr = m.instanceColor.array, base = m.userData.colores;
          for (let i = 0; i < arr.length; i += 3) { arr[i] = base[i] + (marron.r - base[i]) * f; arr[i + 1] = base[i + 1] + (marron.g - base[i + 1]) * f; arr[i + 2] = base[i + 2] + (marron.b - base[i + 2]) * f; }
          m.instanceColor.needsUpdate = true;
        }
        if (esSeta) raiz.scale.y = 1 - f * 0.55;
      } else if (a === 'caer') {
        const f = Math.min(1, Math.max(0, (k - 0.5) / 2.2));
        raiz.rotation.z = -f * f * Math.PI / 2 * 0.97;
      } else if (a === 'esporas') {
        esporas.visible = true;
        const arr = esporas.geometry.attributes.position.array;
        esporas.userData.semillas.forEach(([dx, h, dz, fase], i) => {
          const v = ((t * 0.35 + fase) % 1);
          arr[i * 3] = dx * (0.2 + v * 1.4) + Math.sin(t + fase * 9) * 0.05; arr[i * 3 + 1] = caja.max.y * 0.9 + v * 1.2 * h; arr[i * 3 + 2] = dz * (0.2 + v * 1.4);
        });
        esporas.geometry.attributes.position.needsUpdate = true;
        esporas.material.opacity = 0.7;
      } else if (a === 'brillar' && m0brillo()) {
        const x = 0.55 + Math.sin(t * 2.5) * 0.45;
        m0brillo().material.color.setScalar(0.4 + x * 1.1);
      }
    },
  };
  function m0brillo() { return mallas.find((m) => m.userData.tipo === 'brillo'); }
  return P;
}

export const NOMBRES_ANIM_PLANTA = {
  viento: 'Viento', crecer: 'Crecer', florecer: 'Florecer', fructificar: 'Fructificar', marchitar: 'Marchitarse', caer: 'Caer (morir)',
  quieto: 'Quieta', brotar: 'Brotar', esporas: 'Soltar esporas', brillar: 'Brillar', pudrir: 'Pudrirse',
};
