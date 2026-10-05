/* DE CUBOS A UNA MALLA SUAVE CON ESQUELETO (para los animales). A partir del modelo de cubos de
   animales-cubos.js, en su postura de reposo:
   1. Cada caja gruesa (torso, pecho, ancas, cuello, cabeza, patas, cola...) pasa a ser una forma
      redondeada (una caja de esquinas muy romas) y todas se funden entre sí con una unión suave
      (SDF con smooth-min): sale una superficie continua.
   2. La superficie se saca con «surface nets» en una rejilla y se simplifica (colapso de aristas
      con cuádricas de error) hasta unos pocos cientos o mil triángulos; y otra vez, hasta unos
      cien, para lejos.
   3. Cada vértice se ata a los huesos de las cajas que tiene más cerca (hasta 4, con pesos
      suaves en las juntas): los huesos son las articulaciones de siempre (m.piv y m.raiz), así
      que las animaciones de antes siguen valiendo tal cual.
   4. Lo fino no entra en la fusión: las láminas (alas, élitros, la lengua) y los palos (patas de
      insecto, antenas, cuernos) van como piezas propias pegadas a su hueso; las rayas y motas
      solo se pintan (pelaje.js); los ojos son bolitas con su propio hueso (para cerrarlos).
   Sin DOM: solo geometría. */

import * as THREE from '../vendor/three.module.js';

const V = () => new THREE.Vector3();

/* ---------------------------------------------------------------- las piezas del modelo */
export function piezasDe(m) {
  m.raiz.updateMatrixWorld(true);
  const articulaciones = new Map([[m.raiz, 'raiz']]);
  for (const [n, g] of Object.entries(m.piv)) if (!articulaciones.has(g)) articulaciones.set(g, n);
  const piezas = [];
  const caja = new THREE.Box3();
  m.raiz.traverse((h) => {
    if (!h.isMesh || !h.geometry?.parameters) return;
    let a = h.parent; while (a && !articulaciones.has(a)) a = a.parent;
    const p = V(), q = new THREE.Quaternion(), s = V();
    h.matrixWorld.decompose(p, q, s);
    const g = h.geometry.parameters;
    const medio = V().set(g.width / 2 * Math.abs(s.x), g.height / 2 * Math.abs(s.y), g.depth / 2 * Math.abs(s.z));
    const col = h.material?.color ? h.material.color.clone() : h.material?.isColor ? h.material.clone() : new THREE.Color(1, 1, 1);
    const pieza = { hueso: articulaciones.get(a) || 'raiz', centro: p, giro: q, medio, color: col, ojo: !!h.userData.ojo, mota: !!h.parent?.isMesh, malla: h };
    pieza.inv = new THREE.Matrix4().compose(p, q, V().set(1, 1, 1)).invert();
    pieza.mat = new THREE.Matrix4().compose(p, q, V().set(1, 1, 1));
    piezas.push(pieza);
    if (!pieza.mota && !pieza.ojo) caja.expandByPoint(V().copy(p).addScalar(-Math.max(medio.x, medio.y, medio.z))).expandByPoint(V().copy(p).addScalar(Math.max(medio.x, medio.y, medio.z)));
  });
  const tam = caja.getSize(V());
  return { piezas, caja, tam, articulaciones };
}

// qué es cada pieza, según su grosor frente al tamaño de la celda de la rejilla
export function clasificar(piezas, celda) {
  for (const p of piezas) {
    const [a, b, c] = [p.medio.x, p.medio.y, p.medio.z].sort((x, y) => x - y);
    if (p.ojo) p.clase = 'ojo';
    else if (a < 1e-4) p.clase = 'nada'; // (la lengua recogida: escala 0,01)
    else if (p.mota && a < celda * 0.9) p.clase = 'pintura';
    else if (a * 2 < celda * 0.75 && b * 2 < celda * 1.6 && c > b * 2.5) p.clase = 'palo';
    else if (a * 2 < celda * 0.75 && b * 2 >= celda * 1.2) p.clase = p.mota ? 'pintura' : (a * 2 < celda * 0.35 && c * 2 > celda * 4 && b * 2 > celda * 2 ? 'lamina' : 'pintura');
    else if (a * 2 < celda * 0.75) p.clase = 'pintura';
    else p.clase = p.mota ? 'pintura' : 'forma';
    // patas de insecto, antenas y garras: palos finos (como patas, no como bultos)
    if (/^(pata|rod|ant|garra)/.test(p.hueso) && !p.mota && !p.ojo && c > b * 2.5 && b * 2 < celda * 5) p.clase = 'palo';
    // los tramos de las colas y los cuerpos largos (lagartos, serpientes, gusanos) siempre se funden
    if (/^(t|c|v|g)\d/.test(p.hueso) && (p.clase === 'palo' || p.clase === 'lamina') && !p.mota) p.clase = 'forma';
    // las láminas que no son alas ni lenguas sino rayas pegadas al cuerpo: solo pintura
    if (p.clase === 'lamina' && !/^(ala|elitro|lengua)/.test(p.hueso)) p.clase = 'pintura';
  }
  return piezas;
}

/* ---------------------------------------------------------------- la distancia (SDF) */
// (con las cuentas en línea: es lo que más se repite)
function sdCaja(p, pz) { return sdCajaXYZ(p.x, p.y, p.z, pz); }
function sdCajaXYZ(x, y, z, pz) {
  const e = pz.inv.elements, r = pz.romo;
  const qx = e[0] * x + e[4] * y + e[8] * z + e[12], qy = e[1] * x + e[5] * y + e[9] * z + e[13], qz = e[2] * x + e[6] * y + e[10] * z + e[14];
  const dx = Math.abs(qx) - pz.hx, dy = Math.abs(qy) - pz.hy, dz = Math.abs(qz) - pz.hz;
  const ex = Math.max(dx, 0), ey = Math.max(dy, 0), ez = Math.max(dz, 0);
  const caja = Math.hypot(ex, ey, ez) + Math.min(Math.max(dx, dy, dz), 0) - r;
  // y a medias con el elipsoide del mismo tamaño (formas más orgánicas, menos de losa)
  const ax = qx / pz.mx, ay = qy / pz.my, az = qz / pz.mz, k0 = Math.hypot(ax, ay, az), k1 = Math.hypot(ax / pz.mx, ay / pz.my, az / pz.mz) || 1e-9;
  return caja * (1 - ELIPSE) + (k0 * (k0 - 1) / k1) * ELIPSE;
}
const ELIPSE = 0.5;
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function prepararFormas(formas, tamModelo) {
  for (const f of formas) {
    const mn = Math.min(f.medio.x, f.medio.y, f.medio.z);
    f.romo = mn * 0.92;
    f.k = Math.min(Math.max(mn * 1.1, tamModelo * 0.012), tamModelo * 0.08);
    f.radio = f.medio.length();
    f.hx = f.medio.x - f.romo; f.hy = f.medio.y - f.romo; f.hz = f.medio.z - f.romo; f.mx = f.medio.x; f.my = f.medio.y; f.mz = f.medio.z; f.cx = f.centro.x; f.cy = f.centro.y; f.cz = f.centro.z;
  }
}
export function sdf(p, formas) { return sdfXYZ(p.x, p.y, p.z, formas); }
function sdfXYZ(x, y, z, formas) {
  let d = Infinity;
  for (let i = 0; i < formas.length; i++) {
    const f = formas[i], ex = x - f.cx, ey = y - f.cy, ez = z - f.cz, lim = d + f.k + f.radio;
    if (d !== Infinity && ex * ex + ey * ey + ez * ez > lim * lim) continue;
    const di = sdCajaXYZ(x, y, z, f);
    d = d === Infinity ? di : smin(d, di, f.k);
  }
  return d;
}

/* ---------------------------------------------------------------- surface nets */
function surfaceNets(formas, caja, celda) {
  const min = caja.min.clone().addScalar(-celda * 2.5), max = caja.max.clone().addScalar(celda * 2.5);
  const n = [Math.ceil((max.x - min.x) / celda) + 1, Math.ceil((max.y - min.y) / celda) + 1, Math.ceil((max.z - min.z) / celda) + 1];
  const campo = new Float32Array(n[0] * n[1] * n[2]);
  const I = (i, j, k) => (k * n[1] + j) * n[0] + i;
  // (las formas, de más grande a más pequeña: así el recorte por distancia salta más)
  const orden = [...formas].sort((a, b) => b.radio - a.radio);
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) campo[I(i, j, k)] = sdfXYZ(min.x + i * celda, min.y + j * celda, min.z + k * celda, orden);
  // un vértice por celda que corta la superficie (la media de los cortes en sus aristas)
  const vert = new Int32Array((n[0] - 1) * (n[1] - 1) * (n[2] - 1)).fill(-1);
  const C = (i, j, k) => (k * (n[1] - 1) + j) * (n[0] - 1) + i;
  const pos = [];
  const esquinas = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const aristas = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    let dentro = 0;
    for (let e = 0; e < 8; e++) { val[e] = campo[I(i + esquinas[e][0], j + esquinas[e][1], k + esquinas[e][2])]; if (val[e] < 0) dentro++; }
    if (dentro === 0 || dentro === 8) continue;
    let sx = 0, sy = 0, sz = 0, c = 0;
    for (const [a, b] of aristas) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += esquinas[a][0] + (esquinas[b][0] - esquinas[a][0]) * t; sy += esquinas[a][1] + (esquinas[b][1] - esquinas[a][1]) * t; sz += esquinas[a][2] + (esquinas[b][2] - esquinas[a][2]) * t; c++;
    }
    vert[C(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / c) * celda, min.y + (j + sy / c) * celda, min.z + (k + sz / c) * celda);
  }
  // un cuadrado por cada arista de la rejilla que corta la superficie, entre las 4 celdas que la tocan,
  // con sus vértices en el orden que lo deja mirando hacia fuera (hacia donde la distancia crece, como la
  // normal): con el material de una cara, al revés se veía la piel de detrás por dentro
  const tri = [];
  const quad = (a, b, c, d, invertir) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (invertir) tri.push(a, c, b, a, d, c); else tri.push(a, b, c, a, c, d); };
  for (let k = 1; k < n[2] - 1; k++) for (let j = 1; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    const a = campo[I(i, j, k)], b = campo[I(i + 1, j, k)]; if ((a < 0) === (b < 0)) continue;
    quad(vert[C(i, j - 1, k - 1)], vert[C(i, j, k - 1)], vert[C(i, j, k)], vert[C(i, j - 1, k)], a >= 0);
  }
  for (let k = 1; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 1; i < n[0] - 1; i++) {
    const a = campo[I(i, j, k)], b = campo[I(i, j + 1, k)]; if ((a < 0) === (b < 0)) continue;
    quad(vert[C(i - 1, j, k - 1)], vert[C(i - 1, j, k)], vert[C(i, j, k)], vert[C(i, j, k - 1)], a >= 0);
  }
  for (let k = 0; k < n[2] - 1; k++) for (let j = 1; j < n[1] - 1; j++) for (let i = 1; i < n[0] - 1; i++) {
    const a = campo[I(i, j, k)], b = campo[I(i, j, k + 1)]; if ((a < 0) === (b < 0)) continue;
    quad(vert[C(i - 1, j - 1, k)], vert[C(i, j - 1, k)], vert[C(i, j, k)], vert[C(i - 1, j, k)], a >= 0);
  }
  return { pos: Float64Array.from(pos), tri: Int32Array.from(tri) };
}

/* ---------------------------------------------------------------- simplificar (cuádricas) */
class Monton { // montículo binario por coste
  constructor() { this.c = []; this.d = []; }
  get n() { return this.c.length; }
  meter(coste, dato) { const c = this.c, d = this.d; let i = c.length; c.push(coste); d.push(dato); while (i > 0) { const p = (i - 1) >> 1; if (c[p] <= coste) break; c[i] = c[p]; d[i] = d[p]; i = p; } c[i] = coste; d[i] = dato; }
  sacar() {
    const c = this.c, d = this.d, top = d[0], ultC = c.pop(), ultD = d.pop(), n = c.length;
    if (n) { let i = 0; while (true) { let h = 2 * i + 1; if (h >= n) break; if (h + 1 < n && c[h + 1] < c[h]) h++; if (c[h] >= ultC) break; c[i] = c[h]; d[i] = d[h]; i = h; } c[i] = ultC; d[i] = ultD; }
    return top;
  }
}
export function simplificar(pos, tri, objetivo) {
  const nv = pos.length / 3, nf = tri.length / 3;
  const P = Float64Array.from(pos), F = Int32Array.from(tri), vivoF = new Uint8Array(nf).fill(1), vivoV = new Uint8Array(nv).fill(1), ver = new Int32Array(nv);
  const caras = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) caras[F[f * 3 + k]].push(f);
  const Q = new Float64Array(nv * 10);
  const plano = (f) => {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-20) return null; nx /= l; ny /= l; nz /= l;
    return [nx, ny, nz, -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2]), l * 0.5];
  };
  for (let f = 0; f < nf; f++) {
    const pl = plano(f); if (!pl) continue;
    const [a, b, c, d, area] = pl, w = area;
    const qq = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let k = 0; k < 3; k++) { const v = F[f * 3 + k] * 10; for (let i = 0; i < 10; i++) Q[v + i] += qq[i] * w; }
  }
  const err = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const qs = new Float64Array(10);
  const coste = (u, v) => {
    for (let i = 0; i < 10; i++) qs[i] = Q[u * 10 + i] + Q[v * 10 + i];
    // la posición óptima (si la matriz se puede invertir); si no, el mejor de los extremos y el medio
    const a = qs[0], b = qs[1], c = qs[2], d = qs[4], e = qs[5], f = qs[7];
    const det = a * (d * f - e * e) - b * (b * f - e * c) + c * (b * e - d * c);
    let best = null;
    if (Math.abs(det) > 1e-12) {
      const i00 = (d * f - e * e) / det, i01 = (c * e - b * f) / det, i02 = (b * e - c * d) / det, i11 = (a * f - c * c) / det, i12 = (b * c - a * e) / det, i22 = (a * d - b * b) / det;
      const x = -(i00 * qs[3] + i01 * qs[6] + i02 * qs[8]), y = -(i01 * qs[3] + i11 * qs[6] + i12 * qs[8]), z = -(i02 * qs[3] + i12 * qs[6] + i22 * qs[8]);
      // (que no se vaya lejos de la arista)
      const mx = (P[u * 3] + P[v * 3]) / 2, my = (P[u * 3 + 1] + P[v * 3 + 1]) / 2, mz = (P[u * 3 + 2] + P[v * 3 + 2]) / 2;
      const L = Math.hypot(P[u * 3] - P[v * 3], P[u * 3 + 1] - P[v * 3 + 1], P[u * 3 + 2] - P[v * 3 + 2]);
      if (Math.hypot(x - mx, y - my, z - mz) < L * 1.5) best = [err(qs, x, y, z), x, y, z];
    }
    if (!best) for (const t of [0, 0.5, 1]) {
      const x = P[u * 3] + (P[v * 3] - P[u * 3]) * t, y = P[u * 3 + 1] + (P[v * 3 + 1] - P[u * 3 + 1]) * t, z = P[u * 3 + 2] + (P[v * 3 + 2] - P[u * 3 + 2]) * t, e2 = err(qs, x, y, z);
      if (!best || e2 < best[0]) best = [e2, x, y, z];
    }
    return best;
  };
  const vecinos = (v) => { const s = new Set(); for (const f of caras[v]) if (vivoF[f]) for (let k = 0; k < 3; k++) s.add(F[f * 3 + k]); s.delete(v); return s; };
  const M = new Monton();
  const meterArista = (u, v) => { const [c, x, y, z] = coste(u, v); M.meter(Math.max(0, c), [u, v, ver[u], ver[v], x, y, z]); };
  for (let v = 0; v < nv; v++) for (const w of vecinos(v)) if (v < w) meterArista(v, w);
  let vivas = nf;
  const normalDe = (f, sust, nuevo) => {
    const ids = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]].map((i) => (i === sust ? -1 : i));
    const pt = (i) => (i === -1 ? nuevo : [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const [a, b, c] = ids.map(pt);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l, l];
  };
  while (vivas > objetivo && M.n) {
    const [u, v, vu, vv, x, y, z] = M.sacar();
    if (!vivoV[u] || !vivoV[v] || ver[u] !== vu || ver[v] !== vv) continue;
    // que siga siendo una superficie cerrada: solo dos vecinos en común
    const nu = vecinos(u), nvv = vecinos(v);
    if (!nu.has(v)) continue;
    let comunes = 0; for (const w of nu) if (nvv.has(w)) comunes++;
    if (comunes !== 2) continue;
    // que ningún triángulo se dé la vuelta ni se aplaste
    const nuevo = [x, y, z];
    let mal = false;
    for (const [w, otro] of [[u, v], [v, u]]) {
      for (const f of caras[w]) {
        if (!vivoF[f]) continue;
        const ids = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]];
        if (ids.includes(otro)) continue;
        const [ax, ay, az] = normalDe(f, -2, null), [bx, by, bz, area] = normalDe(f, w, nuevo);
        if (ax * bx + ay * by + az * bz < 0.3 || area < 1e-14) { mal = true; break; }
      }
      if (mal) break;
    }
    if (mal) continue;
    // colapsar v en u
    P[u * 3] = x; P[u * 3 + 1] = y; P[u * 3 + 2] = z;
    for (let i = 0; i < 10; i++) Q[u * 10 + i] += Q[v * 10 + i];
    for (const f of caras[v]) {
      if (!vivoF[f]) continue;
      const ids = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]];
      if (ids.includes(u)) { vivoF[f] = 0; vivas--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === v) F[f * 3 + k] = u;
      caras[u].push(f);
    }
    caras[u] = caras[u].filter((f) => vivoF[f]);
    vivoV[v] = 0; ver[u]++;
    // (solo cambian las aristas de u: su cuádrica y su sitio)
    for (const w of vecinos(u)) meterArista(u, w);
  }
  // compactar
  const nuevoId = new Int32Array(nv).fill(-1), outP = [], outF = [];
  for (let f = 0; f < nf; f++) {
    if (!vivoF[f]) continue;
    for (let k = 0; k < 3; k++) { const v = F[f * 3 + k]; if (nuevoId[v] < 0) { nuevoId[v] = outP.length / 3; outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } outF.push(nuevoId[v]); }
  }
  return { pos: Float64Array.from(outP), tri: Int32Array.from(outF) };
}

/* ---------------------------------------------------------------- pesos de los huesos */
function pesos(p, formas, huesoIdx) {
  // la distancia a cada forma; los huesos de las que están a menos de su ancho de fusión de la más cercana
  const d = formas.map((f) => sdCaja(p, f));
  let dmin = Infinity; for (const x of d) dmin = Math.min(dmin, x);
  const porHueso = new Map();
  formas.forEach((f, i) => {
    const w = Math.max(0, 1 - Math.max(0, d[i] - dmin) / (f.k * 1.4));
    if (w <= 0) return;
    const h = huesoIdx(f.hueso), x = w * w * (3 - 2 * w);
    porHueso.set(h, Math.max(porHueso.get(h) || 0, x));
  });
  const l = [...porHueso.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = l.reduce((a, [, w]) => a + w, 0) || 1;
  return l.map(([h, w]) => [h, w / s]);
}

/* ---------------------------------------------------------------- piezas propias */
// una pieza que se ata entera a un hueso: un prisma de 6 lados (palo), una placa de bordes romos
// (lámina) o una bolita (ojo). Devuelve [pos, nor, tri] en el sitio del modelo
function piezaPropia(pz) {
  const pos = [], nor = [], tri = [];
  const push = (x, y, z, nx, ny, nz) => { const p = V().set(x, y, z).applyMatrix4(pz.mat), n = V().set(nx, ny, nz).applyQuaternion(pz.giro).normalize(); pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); return pos.length / 3 - 1; };
  const h = pz.medio;
  if (pz.clase === 'palo') {
    // a lo largo del eje más largo
    const ejes = [['x', h.x], ['y', h.y], ['z', h.z]].sort((a, b) => b[1] - a[1]);
    const L = ejes[0][1], ra = ejes[1][1], rb = ejes[2][1], eje = ejes[0][0];
    const pt = (t, a, b) => (eje === 'x' ? [t, a, b] : eje === 'y' ? [b, t, a] : [a, b, t]);
    const anillos = [];
    for (const t of [-L, L]) {
      const fila = [];
      for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); const [x, y, z] = pt(t, ca * ra, sa * rb), [nx, ny, nz] = pt(0, ca, sa); fila.push(push(x, y, z, nx, ny, nz)); }
      anillos.push(fila);
    }
    for (let j = 0; j < 6; j++) { const a = anillos[0][j], b = anillos[0][(j + 1) % 6], c = anillos[1][(j + 1) % 6], d = anillos[1][j]; tri.push(a, b, c, a, c, d); }
    for (const [i, s] of [[0, -1], [1, 1]]) { const [cx, cy, cz] = pt(s * L * 1.02, 0, 0), [nx, ny, nz] = pt(s, 0, 0), c = push(cx, cy, cz, nx, ny, nz); for (let j = 0; j < 6; j++) s > 0 ? tri.push(anillos[i][j], anillos[i][(j + 1) % 6], c) : tri.push(anillos[i][(j + 1) % 6], anillos[i][j], c); }
  } else if (pz.clase === 'lamina') {
    // el eje fino es la normal; el contorno, un rectángulo de esquinas redondeadas
    const ejes = [['x', h.x], ['y', h.y], ['z', h.z]].sort((a, b) => a[1] - b[1]);
    const g = ejes[0][1], A = ejes[2][1], B = ejes[1][1], n = ejes[0][0], ea = ejes[2][0];
    const pt = (u, v, w) => { const o = { [n]: w }; o[ea] = u; o[ejes[1][0]] = v; return [o.x, o.y, o.z]; };
    const r = Math.min(A, B) * 0.6, contorno = [];
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) for (let k = 0; k <= 2; k++) {
      const a = Math.atan2(sy, sx) - Math.PI / 4 + (k / 2) * Math.PI / 2;
      contorno.push([sx * (A - r) + Math.cos(a) * r, sy * (B - r) + Math.sin(a) * r]);
    }
    for (const s of [1, -1]) {
      const [nx, ny, nz] = pt(0, 0, s), c = push(...pt(0, 0, s * g), nx, ny, nz), ids = contorno.map(([u, v]) => push(...pt(u, v, s * g), nx, ny, nz));
      for (let k = 0; k < ids.length; k++) s > 0 ? tri.push(c, ids[k], ids[(k + 1) % ids.length]) : tri.push(c, ids[(k + 1) % ids.length], ids[k]);
    }
  } else if (pz.clase === 'ojo') {
    const r = Math.max(h.x, h.y, h.z) * 0.9;
    const pisos = 4, lados = 6, filas = [];
    for (let i = 0; i <= pisos; i++) {
      const a = -Math.PI / 2 + (i / pisos) * Math.PI, fila = [];
      for (let j = 0; j < lados; j++) { const b = (j / lados) * Math.PI * 2, x = Math.cos(a) * Math.cos(b), y = Math.sin(a), z = Math.cos(a) * Math.sin(b); fila.push(push(x * r * 0.8, y * r, z * r, x, y, z)); }
      filas.push(fila);
    }
    for (let i = 0; i < pisos; i++) for (let j = 0; j < lados; j++) { const a = filas[i][j], b = filas[i][(j + 1) % lados], c = filas[i + 1][(j + 1) % lados], d = filas[i + 1][j]; tri.push(a, c, b, a, d, c); }
  }
  return { pos, nor, tri };
}

/* ---------------------------------------------------------------- todo junto */
// grosor de la rejilla: el largo mayor entre RES, sin pasar de un número de celdas
const RES = 50, MAX_CELDAS = 120000;
export function suavizar(m, { objetivo = 1100, objetivoLejos = 110 } = {}) {
  const { piezas, caja, tam } = piezasDe(m);
  const largo = Math.max(tam.x, tam.y, tam.z);
  let celda = largo / RES;
  while ((tam.x / celda + 6) * (tam.y / celda + 6) * (tam.z / celda + 6) > MAX_CELDAS) celda *= 1.1;
  clasificar(piezas, celda);
  const formas = piezas.filter((p) => p.clase === 'forma');
  prepararFormas(formas, largo);
  // un palo pegado a la superficie (las rayas de la nuca) es pintura; los que salen (patas de
  // insecto, antenas, bigotes, cuernos) se quedan como palos
  for (const p of piezas) if (p.clase === 'palo' && !/^(ant|pata|rod|garra|cola)/.test(p.hueso)) {
    const grueso = Math.min(p.medio.x, p.medio.y, p.medio.z);
    if (Math.abs(sdf(p.centro, formas)) < grueso + celda * 0.75) p.clase = 'pintura';
  }
  const cajaF = new THREE.Box3();
  for (const f of formas) { const r = f.radio; cajaF.expandByPoint(V().copy(f.centro).addScalar(-r)).expandByPoint(V().copy(f.centro).addScalar(r)); }
  const t0 = performance.now();
  const red = surfaceNets(formas, cajaF, celda);
  const t1 = performance.now();
  const cerca = simplificar(red.pos, red.tri, objetivo);
  const t2 = performance.now();
  const lejos = simplificar(cerca.pos, cerca.tri, objetivoLejos);
  const t3 = performance.now();
  // los huesos, por nombre (y los de los ojos, que se crean al montar)
  const huesos = ['raiz', ...new Set(piezas.map((p) => p.hueso))].filter((v, i, a) => a.indexOf(v) === i);
  const ojos = piezas.filter((p) => p.clase === 'ojo');
  ojos.forEach((o, i) => { o.huesoOjo = 'ojo' + i; huesos.push(o.huesoOjo); });
  const huesoIdx = (n) => huesos.indexOf(n);
  const propias = piezas.filter((p) => p.clase === 'palo' || p.clase === 'lamina' || p.clase === 'ojo');
  const geo = (malla, conPropias) => {
    const pos = [], nor = [], idx = [], si = [], sw = [], propio = [];
    const p = V(), e = celda * 0.5;
    for (let i = 0; i < malla.pos.length; i += 3) {
      p.set(malla.pos[i], malla.pos[i + 1], malla.pos[i + 2]);
      pos.push(p.x, p.y, p.z);
      // la normal, del gradiente de la distancia (más suave que la de los triángulos)
      const gx = sdf(V().set(p.x + e, p.y, p.z), formas) - sdf(V().set(p.x - e, p.y, p.z), formas);
      const gy = sdf(V().set(p.x, p.y + e, p.z), formas) - sdf(V().set(p.x, p.y - e, p.z), formas);
      const gz = sdf(V().set(p.x, p.y, p.z + e), formas) - sdf(V().set(p.x, p.y, p.z - e), formas);
      const l = Math.hypot(gx, gy, gz) || 1; nor.push(gx / l, gy / l, gz / l);
      const w = pesos(p, formas, huesoIdx);
      for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] : 0); }
      propio.push(0, 0, 0, 0);
    }
    idx.push(...malla.tri);
    if (conPropias) for (const pz of propias) {
      const g = piezaPropia(pz), base = pos.length / 3, h = huesoIdx(pz.clase === 'ojo' ? pz.huesoOjo : pz.hueso);
      pos.push(...g.pos); nor.push(...g.nor);
      for (const t of g.tri) idx.push(t + base);
      const c = pz.color;
      for (let k = 0; k < g.pos.length / 3; k++) {
        si.push(h, 0, 0, 0); sw.push(1, 0, 0, 0);
        // los ojos van con su color (y la pupila, en la parte de delante, más oscura); lo demás, con el pelaje
        if (pz.clase === 'ojo') { const x = g.pos[k * 3] - pz.centro.x, dark = x > Math.max(pz.medio.x, pz.medio.y, pz.medio.z) * 0.45 ? 0.25 : 1; propio.push(c.r * dark, c.g * dark, c.b * dark, 1); }
        else propio.push(0, 0, 0, 0);
      }
    }
    // cada triángulo, girado hacia donde mira su normal (la de la superficie, hacia fuera): lo que
    // dobla la simplificación al juntar vértices y las caras de las piezas finas quedan también hacia
    // fuera (con el material de una cara, un triángulo al revés enseña lo de detrás)
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const d = (uy * vz - uz * vy) * (nor[a] + nor[b] + nor[c]) + (uz * vx - ux * vz) * (nor[a + 1] + nor[b + 1] + nor[c + 1]) + (ux * vy - uy * vx) * (nor[a + 2] + nor[b + 2] + nor[c + 2]);
      if (d < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('aPropio', new THREE.Float32BufferAttribute(propio, 4));
    g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    g.userData.triangulos = idx.length / 3;
    return g;
  };
  const geo0 = geo(cerca, true), geo1 = geo(lejos, false);
  return { geo0, geo1, huesos, ojos, piezas, celda, tiempos: { red: t1 - t0, cerca: t2 - t1, lejos: t3 - t2 }, crudo: red.tri.length / 3 };
}
