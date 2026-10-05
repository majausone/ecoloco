/* GEOMETRÍA SUAVE para plantas y setas: piezas que se van echando en una malla (con color por
   vértice, coordenadas de textura en el atlas de hojas, cuánto se mece cada vértice con el viento
   y el centro de su pieza, para hacer crecer flores y frutos cada una en su sitio).
     tubo   un cilindro que sigue una línea (troncos, ramas, tallos, raíces, lianas)
     tira   una hoja: una tira curva con su textura recortada (hojas, frondas de palma, helechos)
     torno  una pieza de revolución (sombreros y pies de setas, jarras, frutos)
   Sin DOM: también se usa en Node y en el Worker (los posaderos de la simulación). */

import * as THREE from '../vendor/three.module.js';

// el atlas de hojas y flores (plantas-textura.js lo pinta): 4 × 4 casillas
export const CELDAS = ['blanco', 'ramillete', 'hoja-grande', 'agathis', 'filoclado', 'pinnada', 'cola-pez', 'abanico',
  'pala', 'cuerno', 'flor-amarilla', 'flor-roja', 'rafflesia', 'flor-orquidea', 'teja', 'encaje'];
export const LADO_ATLAS = 4;
const MARGEN = 0.03; // de cada casilla, el borde que no se usa (para que no se mezclen al alejarse)
export function uvCelda(celda, u, v) {
  const i = typeof celda === 'number' ? celda : Math.max(0, CELDAS.indexOf(celda));
  const cx = i % LADO_ATLAS, cy = Math.floor(i / LADO_ATLAS), k = 1 - 2 * MARGEN;
  return [(cx + MARGEN + u * k) / LADO_ATLAS, 1 - (cy + MARGEN + (1 - v) * k) / LADO_ATLAS];
}
const UV_BLANCO = uvCelda(0, 0.5, 0.5);

const color = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));
export const mezcla = (a, b, t) => color(a).clone().lerp(color(b), t);
export function tono(lista, t) {
  t = Math.min(0.999, Math.max(0, t)) * (lista.length - 1);
  const i = Math.floor(t);
  return mezcla(lista[i], lista[Math.min(i + 1, lista.length - 1)], t - i);
}

export class Malla {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.vie = []; this.cen = []; this.idx = []; }
  get nv() { return this.pos.length / 3; }
  get triangulos() { return this.idx.length / 3; }
  // un vértice: posición, normal, color, uv, viento (m que se mueve) y centro de su pieza
  v(p, n, c, uv, viento = 0, centro = p) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z);
    const k = color(c); this.col.push(k.r, k.g, k.b);
    this.uv.push(uv[0], uv[1]); this.vie.push(viento); this.cen.push(centro.x, centro.y, centro.z);
    return this.nv - 1;
  }
  t(a, b, c) { this.idx.push(a, b, c); }
  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aViento', new THREE.Float32BufferAttribute(this.vie, 1));
    g.setAttribute('aCentro', new THREE.Float32BufferAttribute(this.cen, 3));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    g.userData.triangulos = this.triangulos;
    return g;
  }
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ARRIBA = V(0, 1, 0);

/* Un tubo por una línea de puntos, con su radio en cada punto. color(t, a) y viento(t), con t de 0
   a 1 a lo largo y a el ángulo alrededor. Los aros se orientan con un marco que se transporta a lo
   largo (sin giros raros en las curvas). */
export function tubo(M, puntos, radios, { segs = 6, color: col = '#6a5a4a', viento = () => 0, tapa = false } = {}) {
  const n = puntos.length;
  if (n < 2) return;
  const tang = puntos.map((p, i) => V().subVectors(puntos[Math.min(n - 1, i + 1)], puntos[Math.max(0, i - 1)]).normalize());
  let normal = Math.abs(tang[0].y) < 0.9 ? V().crossVectors(tang[0], ARRIBA).normalize() : V(1, 0, 0);
  const aros = [];
  for (let i = 0; i < n; i++) {
    if (i) { // transporte paralelo
      const eje = V().crossVectors(tang[i - 1], tang[i]), s = eje.length();
      if (s > 1e-6) normal.applyAxisAngle(eje.normalize(), Math.asin(Math.min(1, s)));
    }
    const bin = V().crossVectors(tang[i], normal).normalize();
    const t = i / (n - 1), r = typeof radios === 'number' ? radios : radios[i], fila = [];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2, d = V().addScaledVector(normal, Math.cos(a)).addScaledVector(bin, Math.sin(a));
      fila.push(M.v(V().copy(puntos[i]).addScaledVector(d, r), d, typeof col === 'function' ? col(t, a) : col, UV_BLANCO, viento(t)));
    }
    aros.push(fila);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) M.q(aros[i][j], aros[i + 1][j], aros[i + 1][j + 1], aros[i][j + 1]);
  if (tapa) {
    const p = puntos[n - 1], c = M.v(p, tang[n - 1], typeof col === 'function' ? col(1, 0) : col, UV_BLANCO, viento(1));
    for (let j = 0; j < segs; j++) M.t(aros[n - 1][j], aros[n - 1][j + 1], c);
  }
}

/* Una hoja: una tira que sale de «base» hacia «dir», de «largo» por «ancho», que se curva hacia
   abajo (caida, en m en la punta) y se dobla por el nervio (pliegue). La textura de su casilla del
   atlas pone la forma (con recorte). ancho(t) da el perfil a lo largo (1 = el ancho entero).
   normalHacia: si se da, la normal apunta desde ese punto (copas que se iluminan como una bola). */
export function tira(M, base, dir, lado, largo, ancho, { pasos = 3, caida = 0, pliegue = 0, celda = 'pala', color: col = '#5a8a3a', viento = 0, aleteo = 0.02,
  perfil = () => 1, normalHacia = null, centro = null, u0 = 0, u1 = 1 } = {}) {
  dir = V().copy(dir).normalize(); lado = V().copy(lado).normalize();
  const abajo = V().crossVectors(dir, lado).normalize(); if (abajo.y > 0) abajo.negate();
  const filas = [];
  const cen = centro || V().copy(base).addScaledVector(dir, largo * 0.5);
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos, w = ancho * perfil(t) * 0.5;
    const eje = V().copy(base).addScaledVector(dir, largo * t).addScaledVector(abajo, -caida * t * t);
    // la tangente (para la normal de la hoja)
    const tg = V().copy(dir).multiplyScalar(largo).addScaledVector(abajo, -2 * caida * t).normalize();
    let n = V().crossVectors(tg, lado).normalize(); if (n.y < 0) n.negate();
    const fila = [];
    for (const s of pliegue ? [-1, 0, 1] : [-1, 1]) {
      const p = V().copy(eje).addScaledVector(lado, s * w);
      if (pliegue && s === 0) p.addScaledVector(n, pliegue * w);
      let nn = n;
      if (normalHacia) nn = V().subVectors(p, normalHacia).normalize().lerp(n, 0.35).normalize();
      const u = u0 + (s * 0.5 + 0.5) * (u1 - u0);
      fila.push(M.v(p, nn, typeof col === 'function' ? col(t) : col, uvCelda(celda, u, t), viento + aleteo * t, cen));
    }
    filas.push(fila);
  }
  for (let i = 0; i < pasos; i++) for (let j = 0; j < filas[i].length - 1; j++) M.q(filas[i][j], filas[i][j + 1], filas[i + 1][j + 1], filas[i + 1][j]);
}

/* Una tarjeta plana cuadrada (flores vistas de frente, abanicos): centro, normal y giro. */
export function tarjeta(M, centro, normal, tam, { celda = 'flor-amarilla', color: col = '#ffffff', viento = 0, giro = 0, aleteo = 0.01 } = {}) {
  normal = V().copy(normal).normalize();
  const a = Math.abs(normal.y) < 0.95 ? V().crossVectors(normal, ARRIBA).normalize() : V(1, 0, 0);
  a.applyAxisAngle(normal, giro);
  const b = V().crossVectors(normal, a).normalize();
  const ids = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([s, t, u, v]) =>
    M.v(V().copy(centro).addScaledVector(a, s * tam / 2).addScaledVector(b, t * tam / 2), normal, col, uvCelda(celda, u, v), viento + aleteo * (s + t + 2) / 4, centro));
  M.q(ids[0], ids[1], ids[2], ids[3]);
}

/* Una pieza de revolución alrededor de un eje (por defecto, el vertical) a partir de un perfil
   [[radio, altura], ...] de abajo arriba. color(t, a) con t de 0 a 1 por el perfil. */
export function torno(M, centro, perfil, { segs = 10, color: col = '#e8e0d0', viento = 0, eje = ARRIBA, celda = null, tapaAbajo = false, tapaArriba = false } = {}) {
  const e = V().copy(eje).normalize();
  const a0 = Math.abs(e.y) < 0.95 ? V().crossVectors(e, ARRIBA).normalize() : V(1, 0, 0);
  const b0 = V().crossVectors(e, a0).normalize();
  const n = perfil.length, filas = [];
  // longitud acumulada del perfil (para t)
  const largo = [0]; for (let i = 1; i < n; i++) largo.push(largo[i - 1] + Math.hypot(perfil[i][0] - perfil[i - 1][0], perfil[i][1] - perfil[i - 1][1]));
  const total = largo[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const [r, h] = perfil[i], t = largo[i] / total;
    // la normal del perfil: perpendicular a la tangente en el plano (radio, altura)
    const [ra, ha] = perfil[Math.max(0, i - 1)], [rb, hb] = perfil[Math.min(n - 1, i + 1)];
    let nr = hb - ha, nh = -(rb - ra); const l = Math.hypot(nr, nh) || 1; nr /= l; nh /= l;
    const fila = [];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2, d = V().addScaledVector(a0, Math.cos(a)).addScaledVector(b0, Math.sin(a));
      const p = V().copy(centro).addScaledVector(d, r).addScaledVector(e, h);
      const nn = V().addScaledVector(d, nr).addScaledVector(e, nh).normalize();
      fila.push(M.v(p, nn, typeof col === 'function' ? col(t, a) : col, celda ? uvCelda(celda, j / segs, t) : UV_BLANCO, viento * t, centro));
    }
    filas.push(fila);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) M.q(filas[i][j], filas[i][j + 1], filas[i + 1][j + 1], filas[i + 1][j]);
  const tapa = (i, haciaArriba) => {
    const [, h] = perfil[i], c = M.v(V().copy(centro).addScaledVector(e, h), haciaArriba ? e : V().copy(e).negate(), typeof col === 'function' ? col(i ? 1 : 0, 0) : col, UV_BLANCO, viento * (i ? 1 : 0), centro);
    for (let j = 0; j < segs; j++) haciaArriba ? M.t(filas[i][j], filas[i][j + 1], c) : M.t(filas[i][j + 1], filas[i][j], c);
  };
  if (tapaAbajo) tapa(0, false);
  if (tapaArriba) tapa(n - 1, true);
}

/* Una bola baja en polígonos (frutos, verrugas), aplastada si se pide. */
export function bola(M, centro, radio, { color: col = '#c83a2a', viento = 0, aplastar = 1, segs = 6 } = {}) {
  const perfil = [];
  const pisos = Math.max(2, Math.round(segs / 2));
  for (let i = 0; i <= pisos; i++) { const a = -Math.PI / 2 + (i / pisos) * Math.PI; perfil.push([Math.max(1e-4, Math.cos(a) * radio), Math.sin(a) * radio * aplastar]); }
  torno(M, centro, perfil, { segs, color: col, viento });
}

/* Un punto en una curva de Bézier cuadrática (para tallos, frondas y raíces que se arquean). */
export function bezier(a, b, c, t) {
  const u = 1 - t;
  return V(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
}
export const vec = V;
