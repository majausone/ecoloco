/* LOS ANIMALES (v2). Cada parte del cuerpo se esculpe con cubitos pequeños dentro de
   formas redondas (elipsoides y tubos) y se pinta cubito a cubito con el dibujo de la
   especie (nubes, lunares, bandas, red, franjas...), mirando fotos reales de cada una
   (ref/*.jpg, de iNaturalist). Cada parte cuelga de una articulación; las animaciones
   mueven las articulaciones desde la postura base, que se guarda al montar y se restaura
   cada fotograma. Todos miran hacia +x y tienen los pies en y = 0.

   Lo que usa el mundo vivo (vivo/): crearAnimal(), m.raiz, m.piv, m.anims, m.poner(),
   m.paso(), m.mats, m.tam, m.datos. Se mantienen los nombres de las articulaciones y de
   las animaciones de la v1 (animales-v1.js). */

import * as THREE from '../vendor/three.module.js';
import { azar } from '../escena-v3.js?v=202610032043';

const GRIS = new THREE.Color('#77736e');
const C = (c) => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c));

/* ---------- formas para esculpir ---------- */
const elip = (c, r) => ({ t: 'e', c, r });
const tubo = (a, b, ra, rb = ra) => ({ t: 't', a, b, ra, rb });

function dentro(f, x, y, z) {
  if (f.t === 'e') {
    const dx = (x - f.c[0]) / f.r[0], dy = (y - f.c[1]) / f.r[1], dz = (z - f.c[2]) / f.r[2];
    return dx * dx + dy * dy + dz * dz <= 1;
  }
  const ax = f.b[0] - f.a[0], ay = f.b[1] - f.a[1], az = f.b[2] - f.a[2];
  const l2 = ax * ax + ay * ay + az * az || 1e-9;
  const k = Math.min(1, Math.max(0, ((x - f.a[0]) * ax + (y - f.a[1]) * ay + (z - f.a[2]) * az) / l2));
  const px = f.a[0] + ax * k - x, py = f.a[1] + ay * k - y, pz = f.a[2] + az * k - z;
  const r = f.ra + (f.rb - f.ra) * k;
  return px * px + py * py + pz * pz <= r * r;
}
function limites(f) {
  if (f.t === 'e') return [f.c.map((v, i) => v - f.r[i]), f.c.map((v, i) => v + f.r[i])];
  const r = Math.max(f.ra, f.rb);
  return [f.a.map((v, i) => Math.min(v, f.b[i]) - r), f.a.map((v, i) => Math.max(v, f.b[i]) + r)];
}
// punto de la superficie de un elipsoide en la dirección (dx, dy, dz) desde su centro
const sobre = (e, dx, dy, dz) => { const l = Math.hypot(dx / e.r[0], dy / e.r[1], dz / e.r[2]) || 1; return [e.c[0] + dx / l, e.c[1] + dy / l, e.c[2] + dz / l]; };

const CARAS = [
  { n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] }, { n: [-1, 0, 0], u: [0, 0, 1], w: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], w: [1, 0, 0] }, { n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] }, { n: [0, 0, -1], u: [0, 1, 0], w: [1, 0, 0] },
];

/* ---------- dibujos del pelaje, las escamas y las alas ---------- */
// nubes (pantera) y red (pitón): celdas de Voronoi con borde
function celdas(r, bb, n) {
  const s = [];
  for (let i = 0; i < n; i++) s.push([bb[0][0] + r() * (bb[1][0] - bb[0][0]), bb[0][1] + r() * (bb[1][1] - bb[0][1]), bb[0][2] + r() * (bb[1][2] - bb[0][2]), r()]);
  return (x, y, z) => {
    let d1 = 1e9, d2 = 1e9, k = 0;
    for (let i = 0; i < s.length; i++) {
      const dx = x - s[i][0], dy = y - s[i][1], dz = z - s[i][2], d = dx * dx + dy * dy + dz * dz;
      if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
    }
    return { borde: Math.sqrt(d2) - Math.sqrt(d1), d: Math.sqrt(d1), semilla: s[k][3] };
  };
}
// lunares sueltos: puntos al azar con su radio
function lunares(r, bb, n, radio) {
  const s = [];
  for (let i = 0; i < n; i++) s.push([bb[0][0] + r() * (bb[1][0] - bb[0][0]), bb[0][1] + r() * (bb[1][1] - bb[0][1]), bb[0][2] + r() * (bb[1][2] - bb[0][2]), radio * (0.6 + r() * 0.7)]);
  return (x, y, z) => s.some(([a, b, c, q]) => (x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2 < q * q);
}
const mezcla = (a, b, t) => C(a).lerp(C(b), Math.min(1, Math.max(0, t)));
const salpica = (x, y, z, escala, umbral) => { let h = Math.floor(x / escala) * 73856093 ^ Math.floor(y / escala) * 19349663 ^ Math.floor(z / escala) * 83492791; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h >>> 0) % 1000) / 1000 < umbral; };

/* ---------- el modelo ---------- */
class Modelo {
  constructor(semilla) {
    this.raiz = new THREE.Group();
    this.piv = {};
    this.mats = [];
    this.r = azar(semilla);
    this.anim = 'quieto'; this.inicio = 0;
    this.anims = ['quieto'];
    this.mover = null;
    this.matVol = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matVol.userData.base = new THREE.Color(1, 1, 1);
    this.mats.push(this.matVol);
  }
  material(color) {
    const m = new THREE.MeshLambertMaterial({ color });
    m.userData.base = m.color.clone();
    this.mats.push(m);
    return m;
  }
  caja(padre, x, y, z, sx, sy, sz, color, rot) {
    const malla = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), typeof color === 'string' ? this.material(color) : color);
    malla.position.set(x, y, z);
    if (rot) malla.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    malla.castShadow = true; malla.receiveShadow = true;
    padre.add(malla);
    return malla;
  }
  pivote(padre, nombre, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    padre.add(g);
    if (nombre) this.piv[nombre] = g;
    return g;
  }
  /* Esculpe un volumen: rellena con cubitos de lado v lo que cae dentro de alguna de las
     formas, pinta cada cubito con pintar(x, y, z) y deja solo las caras que dan al aire,
     en una sola malla con el color en los vértices. */
  volumen(padre, formas, pintar, v) {
    const lim = formas.map(limites);
    const lo = [0, 1, 2].map((i) => Math.min(...lim.map((l) => l[0][i]))), hi = [0, 1, 2].map((i) => Math.max(...lim.map((l) => l[1][i])));
    const n = [0, 1, 2].map((i) => Math.max(1, Math.ceil((hi[i] - lo[i]) / v)));
    const o = [0, 1, 2].map((i) => (lo[i] + hi[i]) / 2 - (n[i] * v) / 2);
    const lleno = new Uint8Array(n[0] * n[1] * n[2]);
    const idx = (i, j, k) => (k * n[1] + j) * n[0] + i;
    for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      const x = o[0] + (i + 0.5) * v, y = o[1] + (j + 0.5) * v, z = o[2] + (k + 0.5) * v;
      for (const f of formas) if (dentro(f, x, y, z)) { lleno[idx(i, j, k)] = 1; break; }
    }
    // una forma más fina que un cubito no puede quedarse vacía: al menos el cubito de su centro
    if (!lleno.some(Boolean)) lleno[idx(Math.floor(n[0] / 2), Math.floor(n[1] / 2), Math.floor(n[2] / 2))] = 1;
    const hay = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < n[0] && j < n[1] && k < n[2] && lleno[idx(i, j, k)];
    const pos = [], nor = [], col = [], ind = [];
    let cuantos = 0;
    for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      if (!lleno[idx(i, j, k)]) continue;
      cuantos++;
      const cx = o[0] + (i + 0.5) * v, cy = o[1] + (j + 0.5) * v, cz = o[2] + (k + 0.5) * v;
      let color = null;
      for (const F of CARAS) {
        if (hay(i + F.n[0], j + F.n[1], k + F.n[2])) continue;
        if (!color) {
          color = C(pintar(cx, cy, cz));
          let h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177);
          color.multiplyScalar(1 + (((h >>> 0) % 1000) / 1000 - 0.5) * 0.08);
        }
        const b = pos.length / 3;
        for (let q = 0; q < 4; q++) {
          const du = q === 1 || q === 2 ? 1 : 0, dw = q >= 2 ? 1 : 0;
          const ox = (F.n[0] > 0 ? 1 : 0) + F.u[0] * du + F.w[0] * dw, oy = (F.n[1] > 0 ? 1 : 0) + F.u[1] * du + F.w[1] * dw, oz = (F.n[2] > 0 ? 1 : 0) + F.u[2] * du + F.w[2] * dw;
          pos.push(o[0] + (i + ox) * v, o[1] + (j + oy) * v, o[2] + (k + oz) * v);
          nor.push(F.n[0], F.n[1], F.n[2]);
          col.push(color.r, color.g, color.b);
        }
        ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(ind);
    const malla = new THREE.Mesh(geo, this.matVol);
    malla.castShadow = true; malla.receiveShadow = true;
    padre.add(malla);
    this.cubitos = (this.cubitos || 0) + cuantos;
    return malla;
  }
  ojo(padre, [x, y, z], tam, iris = '#1a1410', brillo = true) {
    this.caja(padre, x, y, z, tam, tam, tam, iris);
    if (brillo) this.caja(padre, x + tam * 0.3, y + tam * 0.25, z, tam * 0.35, tam * 0.35, tam * 0.35, '#f4f0e6');
  }
  fijar() {
    this.raiz.traverse((o) => { o.userData.bp = o.position.clone(); o.userData.br = o.rotation.clone(); o.userData.bs = o.scale.clone(); });
    const caja = new THREE.Box3().setFromObject(this.raiz);
    this.tam = caja.getSize(new THREE.Vector3());
    this.centro = caja.getCenter(new THREE.Vector3());
  }
  restaurar() {
    this.raiz.traverse((o) => { if (o.userData.bp) { o.position.copy(o.userData.bp); o.rotation.copy(o.userData.br); o.scale.copy(o.userData.bs); } });
  }
  poner(nombre, t = 0) {
    if (!this.anims.includes(nombre)) return;
    this.anim = nombre; this.inicio = t;
    for (const m of this.mats) m.color.copy(m.userData.base);
  }
  paso(t) {
    this.restaurar();
    const k = t - this.inicio;
    this.mover(this, this.anim, t, k);
    if (this.anim === 'morir') {
      const g = Math.min(1, k / 1.4) * 0.45;
      for (const m of this.mats) m.color.copy(m.userData.base).lerp(GRIS, g);
    }
  }
}

const s = Math.sin, c = Math.cos, PI = Math.PI;
const suave = (x) => x * x * (3 - 2 * x);
const tramo = (k, a, b) => suave(Math.min(1, Math.max(0, (k - a) / (b - a))));
function caer(m, k, ancho, deLado = true) {
  const f = tramo(k, 0, 1.1);
  if (deLado) { m.raiz.rotation.x = f * PI / 2; m.raiz.position.y = f * ancho * 0.55; }
  else { m.raiz.rotation.x = f * PI; m.raiz.position.y = f * ancho; }
  return f;
}

/* Pintor del pelo de un mamífero: color base, vientre más claro abajo, lomo más oscuro
   arriba y el dibujo de la especie (m.dib: nubes, lunares...), en coordenadas del cuerpo. */
function pelo(m, p, { vientreY = -1e9, lomoY = 1e9, dibujo = true, dx = 0, dy = 0, dz = 0 } = {}) {
  const base = C(p.pelo), vientre = C(p.barriga || p.pelo), lomo = p.lomo ? C(p.lomo) : null;
  return (x, y, z) => {
    let col = base.clone();
    if (y < vientreY) col = mezcla(base, vientre, (vientreY - y) / (Math.abs(vientreY) * 0.5 + 1e-3) + 0.4);
    if (lomo && y > lomoY && Math.abs(z) < (p.ancho || 1) * 0.18) col = lomo.clone();
    if (dibujo && m.dib) { const d = m.dib(x + dx, y + dy, z + dz); if (d) col = d; }
    return col;
  };
}

/* rayas negras a lo largo de la nuca (gato leopardo: 4 finas; pantera: 2 barras gruesas).
   z: posición a lo ancho; ancho: medio ancho de la franja que ocupan */
function nuca(p, z, ancho) {
  if (!p.nuca) return false;
  const n = p.nuca.n, paso = (ancho * 2) / n, az = z + ancho;
  if (az < 0 || az > ancho * 2) return false;
  return (az % paso) < paso * (p.nuca.grosor ?? 0.45);
}

/* ================= CUADRÚPEDO ================= */
function cuadrupedo(m, p) {
  const L = p.largo, H = p.alto, W = p.ancho;
  const patas = H * (p.patasRel ?? (p.felino ? 0.46 : p.cerdo ? 0.42 : p.encorvado ? 0.5 : 0.58));
  const ca = H * (p.cerdo ? 0.5 : p.felino ? 0.4 : 0.36);
  const yC = patas + ca * 0.45;
  const v = Math.max(0.005, W * 0.075);
  // el dibujo del pelaje, en coordenadas del cuerpo
  const bbT = [[-L * 0.6, -ca * 1.6, -W * 0.7], [L * 0.6, ca, W * 0.7]];
  if (p.nubes) {
    const cel = celdas(m.r, bbT, p.nubes.n);
    m.dib = (x, y, z) => {
      if (y < -ca * 0.3 && y > -ca * 0.7) return null;
      const q = cel(x, y, z);
      if (q.borde < W * 0.05) return C(p.nubes.borde);
      if (q.semilla > 0.25 && q.d < W * 0.2) return C(p.nubes.centro);
      return null;
    };
  } else if (p.lunares) {
    const lu = lunares(m.r, bbT, p.lunares.n, W * p.lunares.tam);
    m.dib = (x, y, z) => ((y > -ca * 0.35 || y < -ca * 0.7) && lu(x, y, z) ? C(p.lunares.color) : null);
  }
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, yC, 0);
  const formasT = [
    elip([0, 0, 0], [L * 0.3, ca * 0.5, W * 0.47]),
    elip([L * 0.2, -ca * 0.03, 0], [L * 0.17, ca * 0.55, W * 0.5]),
    elip([-L * 0.2, ca * (p.encorvado ? 0.18 : 0.04), 0], [L * 0.18, ca * (p.encorvado ? 0.62 : 0.55), W * 0.5]),
  ];
  if (p.cerdo) formasT.push(elip([L * 0.14, ca * 0.14, 0], [L * 0.22, ca * 0.56, W * 0.52]));
  const pinta = pelo(m, p, { vientreY: -ca * 0.22, lomoY: ca * 0.35 });
  const pintaT0 = p.franja ? (x, y, z) => (Math.abs(y + ca * 0.12) < ca * 0.07 && Math.abs(z) > W * 0.3 ? C(p.franja) : pinta(x, y, z)) : pinta;
  const pintaT = (x, y, z) => (p.nuca && x > L * 0.1 && y > ca * 0.2 && nuca(p, z, W * 0.22) ? C(p.nuca.color) : pintaT0(x, y, z));
  m.volumen(cuerpo, formasT, pintaT, v);
  // cuello y cabeza
  const cuelloAlto = p.felino ? ca * 0.65 : p.cerdo ? ca * 0.45 : ca * 1.15;
  const inclin = p.felino ? -0.95 : p.cerdo ? -1.2 : -0.45;
  const cuello = m.pivote(cuerpo, 'cuello', L * 0.28, ca * 0.12, 0);
  cuello.rotation.z = inclin;
  m.volumen(cuello, [tubo([0, -ca * 0.1, 0], [0, cuelloAlto, 0], W * (p.felino ? 0.36 : 0.3), W * (p.felino ? 0.32 : 0.24))],
    (x, y, z) => (p.rayasGarganta && Math.abs(z) < W * 0.12 && x > 0 && Math.floor(y / (v * 2)) % 2 ? C(p.rayasGarganta)
      : p.nuca && x < -W * 0.08 && nuca(p, z, W * 0.22) ? C(p.nuca.color)
      : p.nuca && x > W * 0.12 ? C(p.barriga) : pelo(m, p, { dibujo: false })(x, y, z)), v);
  const cabeza = m.pivote(cuello, 'cabeza', 0, cuelloAlto, 0);
  cabeza.rotation.z = -inclin;
  const kc = p.cabezaRel ?? 1;
  const cl = W * (p.cerdo ? 1.0 : 0.82) * kc, ch = W * (p.felino ? 0.72 : 0.62) * kc, cw = W * (p.felino ? 0.8 : 0.6) * kc;
  const craneo = elip([cl * 0.18, ch * 0.08, 0], [cl * 0.36, ch * 0.5, cw * 0.5]);
  const formasC = [craneo];
  let punta;
  if (p.felino) { formasC.push(elip([cl * 0.5, -ch * 0.14, 0], [cl * 0.2 + p.hocico * 0.4, ch * 0.3, cw * 0.36])); punta = [cl * 0.7 + p.hocico * 0.4, -ch * 0.06, 0]; }
  else if (p.cerdo) { formasC.push(tubo([cl * 0.3, -ch * 0.05, 0], [cl * 0.6 + p.hocico, -ch * 0.28, 0], ch * 0.45, ch * 0.24)); punta = [cl * 0.6 + p.hocico + ch * 0.2, -ch * 0.28, 0]; }
  else { formasC.push(tubo([cl * 0.3, 0, 0], [cl * 0.55 + p.hocico, -ch * 0.25, 0], ch * 0.36, ch * 0.2)); punta = [cl * 0.55 + p.hocico + ch * 0.18, -ch * 0.25, 0]; }
  const pelC = pelo(m, p, { dibujo: false });
  const pintaC = (x, y, z) => {
    if (p.felino && x > cl * 0.42 && y < -ch * 0.02) return C(p.barriga);
    if (p.nuca && x < cl * 0.3 && y > ch * 0.3 && nuca(p, z, cw * 0.28)) return C(p.nuca.color);
    if (p.cara?.rayas && x > 0 && x < cl * 0.42 && y > ch * 0.12 && Math.abs(Math.abs(z) - cw * 0.14) < cw * 0.05) return C(p.cara.rayas);
    if (p.cara?.lunares && y > -ch * 0.1 && salpica(x, y, z, cw * 0.12, 0.18)) return C(p.cara.lunares);
    if (p.cara?.blanco && x > cl * 0.3 && y > ch * 0.02 && y < ch * 0.2 && Math.abs(z) > cw * 0.1) return C(p.cara.blanco);
    if (p.cara?.mejilla && x > cl * 0.05 && x < cl * 0.45 && y < ch * 0.02 && y > -ch * 0.1 && Math.abs(z) > cw * 0.38) return C(p.cara.mejilla);
    return pelC(x, y, z);
  };
  m.volumen(cabeza, formasC, pintaC, v * 0.8);
  m.caja(cabeza, punta[0], punta[1] + ch * 0.06, 0, v * 1.4, ch * 0.2, cw * 0.28, p.cerdo ? '#8a6a62' : '#1c1814');
  const ojoT = Math.max(0.01, W * (p.felino ? 0.1 : 0.08) * kc * (p.ojoGrande ? 1.45 : 1));
  for (const sz of [-1, 1]) m.ojo(cabeza, sobre(craneo, p.felino ? 0.75 : 0.45, 0.3, sz * (p.felino ? 0.55 : 0.85)), ojoT, p.iris || '#141210');
  for (const sz of [-1, 1]) {
    if (p.orejas === 'redondas') {
      m.volumen(cabeza, [elip([-cl * 0.04, ch * 0.5, sz * cw * 0.3], [cl * 0.07, ch * 0.2, cw * 0.15])], () => C(p.orejaColor || p.pelo), v * 0.7);
      if (p.orejaMancha) m.caja(cabeza, -cl * 0.11, ch * 0.52, sz * cw * 0.3, v * 0.6, ch * 0.12, cw * 0.1, p.orejaMancha);
    } else if (p.orejas === 'puntiagudas') {
      m.volumen(cabeza, [tubo([-cl * 0.02, ch * 0.35, sz * cw * 0.32], [-cl * 0.1, ch * 0.85, sz * cw * 0.5], cw * 0.16, cw * 0.03)], () => C(p.pelo), v * 0.7);
    } else {
      m.volumen(cabeza, [elip([-cl * 0.05, ch * 0.5, sz * cw * 0.6], [cl * 0.08, ch * 0.16, cw * 0.32])], () => C(p.pelo), v * 0.7);
    }
  }
  if (p.cuernos === 'muntiaco') for (const sz of [-1, 1]) {
    m.volumen(cabeza, [tubo([cl * 0.05, ch * 0.4, sz * cw * 0.18], [-cl * 0.05, ch * 1.15, sz * cw * 0.22], cw * 0.07, cw * 0.055)], () => C(p.pelo), v * 0.6);
    m.volumen(cabeza, [tubo([-cl * 0.05, ch * 1.12, sz * cw * 0.22], [-cl * 0.22, ch * 1.55, sz * cw * 0.2], cw * 0.05, cw * 0.025)], () => C('#e2d6bc'), v * 0.6);
  }
  if (p.barba) for (const sz of [-1, 1]) m.volumen(cabeza, [elip([cl * 0.45, -ch * 0.15, sz * cw * 0.45], [cl * 0.35, ch * 0.25, cw * 0.18])], () => C(p.barba), v * 0.7);
  if (p.colmillos) for (const sz of [-1, 1]) m.caja(cabeza, punta[0] - ch * 0.25, punta[1] + ch * 0.1, sz * cw * 0.28, 0.015, 0.06, 0.015, '#f2ead8', [0, 0, -0.5]);
  if (p.felino) for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) m.caja(cabeza, punta[0] - ch * 0.15, punta[1] - ch * 0.05 + k * 0.012, sz * cw * 0.42, 0.004, 0.004, cw * 0.5, '#f0ece2', [0, sz * (0.2 - k * 0.15), 0]);
  // cola
  const cola = m.pivote(cuerpo, 'cola', -L * 0.36, ca * 0.25, 0);
  if (p.cola === 'larga') {
    let padre = cola; const n = 4, seg = p.colaLargo / n;
    cola.rotation.z = p.felino ? -2.6 : -2.4;
    const pc = pelo(m, p, { dibujo: false });
    for (let i = 0; i < n; i++) {
      const g = m.pivote(padre, 'cola' + i, i ? seg : 0, 0, 0);
      g.rotation.z = i ? 0.16 : 0;
      const ra = W * (p.colaGruesa || 0.17) * (1 - i * 0.12);
      m.volumen(g, [tubo([0, 0, 0], [seg * 1.02, 0, 0], ra, ra * 0.9)], (x, y, z) => {
        const xg = x + i * seg;
        if (p.anillos && Math.floor(xg / (p.colaLargo * 0.09)) % 2 && xg > p.colaLargo * 0.35) return C(p.anillos);
        if (p.nubes && Math.floor(xg / (p.colaLargo * 0.11)) % 2) return C(p.nubes.borde);
        return pc(x, y, z);
      }, v * 0.8);
      padre = g;
    }
    if (p.puntaCola) m.volumen(padre, [elip([seg, 0, 0], [seg * 0.25, W * 0.15, W * 0.15])], () => C(p.puntaCola), v * 0.8);
  } else if (p.cola === 'peluda') {
    cola.rotation.z = 1.25;
    let padre = cola; const n = 4, seg = p.colaLargo / n;
    for (let i = 0; i < n; i++) {
      const g = m.pivote(padre, 'cola' + i, i ? -seg : 0, 0, 0);
      g.rotation.z = i ? -0.42 : 0;
      m.volumen(g, [elip([-seg / 2, 0, 0], [seg * 0.62, W * 0.42, W * 0.36])], () => C(p.pelo), v);
      padre = g;
    }
  } else if (p.cola === 'cerdo') {
    cola.rotation.z = -2.7;
    m.volumen(cola, [tubo([0, 0, 0], [0.13, 0, 0], 0.014, 0.011), elip([0.15, 0, 0], [0.035, 0.022, 0.022])], () => C(p.pelo), 0.008);
  } else {
    cola.rotation.z = -2.0;
    m.volumen(cola, [elip([0.04, 0, 0], [0.06, W * 0.13, W * 0.12])], (x, y) => C(y < 0 ? '#f2ede2' : p.pelo), v * 0.7);
  }
  // patas
  const g0 = W * (p.patasFinas ? 0.15 : p.cerdo ? 0.24 : 0.25) * (p.pataGruesa ?? 1);
  for (const [nombre, x, z] of [['delIzq', 0.24, 1], ['delDer', 0.24, -1], ['trasIzq', -0.24, 1], ['trasDer', -0.24, -1]]) {
    const del = x > 0;
    const hombro = m.pivote(cuerpo, nombre, L * x, -ca * 0.15, z * W * 0.3);
    const sup = patas * 0.5 + ca * 0.18;
    const pp = pelo(m, p, { dx: L * x, dy: -ca * 0.15, dz: z * W * 0.3 });
    m.volumen(hombro, [tubo([0, ca * 0.12, 0], [0, -sup, 0], g0 * (del ? 0.75 : 0.85), g0 * 0.48)], pp, v);
    const rodilla = m.pivote(hombro, nombre + 'Rod', 0, -sup, 0);
    const inf = yC - ca * 0.15 - sup;
    const ppi = pelo(m, p, { dx: L * x, dy: -ca * 0.15 - sup, dz: z * W * 0.3 });
    m.volumen(rodilla, [tubo([0, 0, 0], [0, -inf + g0 * 0.2, 0], g0 * 0.42, g0 * 0.34)], (X, Y, Z) => (p.patas && -Y > inf * 0.55 ? C(p.patas) : ppi(X, Y, Z)), v * 0.8);
    const kz = p.zarpaGrande ? 1.45 : 1;
    if (p.felino) m.volumen(rodilla, [elip([g0 * 0.2 * kz, -inf + g0 * 0.22 * kz, 0], [g0 * 0.55 * kz, g0 * 0.24 * kz, g0 * 0.44 * kz])], () => C(p.patas || p.pelo), v * 0.8);
    else m.caja(rodilla, g0 * 0.05, -inf + 0.012, 0, g0 * 0.75, 0.024, g0 * 0.7, p.cerdo ? '#3a302a' : '#2a2420');
  }
  m.anims = ['quieto', 'andar', 'correr', 'comer', 'atacar', 'dormir', 'morir'];
  m.mover = moverCuadrupedo;
  m.datos = { L, H, W, patas, yCuerpo: yC, inclin };
}

function moverCuadrupedo(m, a, t, k) {
  const P = m.piv, D = m.datos;
  const pierna = (fase, amp, f) => {
    for (const [n, df] of [['delIzq', 0], ['trasDer', 0], ['delDer', PI], ['trasIzq', PI]]) {
      const x = s(t * f + fase + df + (n.startsWith('tras') ? 0.4 : 0));
      P[n].rotation.z = x * amp;
      P[n + 'Rod'].rotation.z = (n.startsWith('del') ? -1 : 1) * Math.max(0, -x) * amp * 1.1;
    }
  };
  const colaVaiven = (amp, f) => { for (let i = 0; i < 4; i++) if (P['cola' + i]) P['cola' + i].rotation.y = s(t * f - i * 0.6) * amp; };
  if (a === 'quieto') {
    P.cuerpo.scale.y = 1 + s(t * 2.2) * 0.015;
    P.cabeza.rotation.y = s(t * 0.5) * 0.4 + s(t * 1.7) * 0.05;
    colaVaiven(0.25, 1.5);
  } else if (a === 'andar') {
    pierna(0, 0.42, 5);
    P.cuerpo.position.y += Math.abs(s(t * 5)) * D.H * 0.025;
    P.cabeza.rotation.z = s(t * 10) * 0.05;
    colaVaiven(0.2, 2.5);
  } else if (a === 'correr') {
    for (const [n, df] of [['delIzq', 0], ['delDer', 0.35], ['trasIzq', PI], ['trasDer', PI + 0.35]]) {
      const x = s(t * 11 + df);
      P[n].rotation.z = x * 0.85;
      P[n + 'Rod'].rotation.z = (n.startsWith('del') ? -1 : 1) * Math.max(0, -x) * 1.1;
    }
    P.cuerpo.rotation.z = s(t * 11 + PI / 2) * 0.12;
    P.cuerpo.position.y += Math.abs(s(t * 11)) * D.H * 0.08;
    P.cuello.rotation.z += 0.3;
    colaVaiven(0.1, 11);
  } else if (a === 'comer') {
    const baja = tramo(k, 0, 0.6);
    P.cuello.rotation.z -= baja * (D.inclin > -0.6 ? 1.35 : 0.6);
    P.cabeza.rotation.z -= baja * 0.5;
    P.cabeza.rotation.z += s(t * 9) * 0.08 * baja;
    P.delIzq.rotation.z = -0.15 * baja; P.delDer.rotation.z = -0.15 * baja;
    colaVaiven(0.3, 2);
  } else if (a === 'atacar') {
    const ciclo = k % 2.2;
    const agacha = tramo(ciclo, 0, 0.7) * (1 - tramo(ciclo, 0.9, 1.0));
    const salto = tramo(ciclo, 0.9, 1.2) * (1 - tramo(ciclo, 1.4, 2.0));
    P.cuerpo.position.y -= agacha * D.H * 0.18;
    for (const n of ['delIzq', 'delDer']) { P[n].rotation.z = -agacha * 0.6 + salto * 1.1; P[n + 'Rod'].rotation.z = -agacha * 0.8; }
    for (const n of ['trasIzq', 'trasDer']) { P[n].rotation.z = agacha * 0.7 - salto * 0.9; P[n + 'Rod'].rotation.z = agacha * 0.8; }
    m.raiz.position.x = salto * D.L * 0.45;
    m.raiz.position.y = s(salto * PI) * D.H * 0.35;
    P.cuello.rotation.z += agacha * 0.4 - salto * 0.2;
    colaVaiven(0.5, 6);
  } else if (a === 'dormir') {
    const f = tramo(k, 0, 1);
    P.cuerpo.position.y -= f * (D.patas * 0.78);
    for (const n of ['delIzq', 'delDer']) { P[n].rotation.z = f * 1.45; P[n + 'Rod'].rotation.z = -f * 1.6; }
    for (const n of ['trasIzq', 'trasDer']) { P[n].rotation.z = -f * 1.3; P[n + 'Rod'].rotation.z = f * 1.6; }
    P.cuello.rotation.z -= f * 0.7; P.cabeza.rotation.z -= f * 0.3;
    P.cuerpo.scale.y = 1 + s(t * 1.2) * 0.02;
  } else if (a === 'morir') {
    const f = caer(m, k, D.W);
    P.cuello.rotation.z -= f * 0.4;
    for (const n of ['delIzq', 'delDer', 'trasIzq', 'trasDer']) P[n].rotation.z = (n.startsWith('del') ? 1 : -1) * f * 0.35;
  }
}

/* ================= PRIMATE ================= */
function primate(m, p) {
  const H = p.alto, v = H * 0.022;
  const piernas = H * 0.32, tronco = H * 0.44, brazo = H * 0.6;
  const cadera = m.pivote(m.raiz, 'cadera', 0, piernas, 0);
  const torso = m.pivote(cadera, 'torso', 0, 0, 0);
  torso.rotation.z = -0.85;
  const pPelo = (x, y, z) => { const t = C(p.pelo); if ((Math.floor(y / (v * 2)) * 3 + Math.floor(z / (v * 2))) % 4 === 0) t.multiplyScalar(p.mechas ? 1.2 : 1.08); return t; };
  m.volumen(torso, [elip([0, tronco * 0.5, 0], [H * 0.17, tronco * 0.55, H * 0.19]), elip([H * 0.02, tronco * 0.2, 0], [H * 0.16, tronco * 0.32, H * 0.17])],
    (x, y, z) => (x > H * 0.1 && y < tronco * 0.7 && Math.abs(z) < H * 0.09 ? C(p.piel) : pPelo(x, y, z)), v);
  const cuello = m.pivote(torso, 'cuello', 0.01, tronco, 0);
  const cabeza = m.pivote(cuello, 'cabeza', 0, H * 0.05, 0);
  cabeza.rotation.z = 0.85;
  const ch = H * 0.12;
  const craneo = elip([0, ch * 0.9, 0], [ch * 0.95, ch, ch * 0.92]);
  m.volumen(cabeza, [craneo, elip([ch * 0.5, ch * 0.62, 0], [ch * 0.6, ch * 0.62, ch * 0.62])],
    (x, y, z) => (x > ch * 0.45 && y < ch * 1.25 ? C(p.cara) : pPelo(x, y, z)), v * 0.7);
  for (const sz of [-1, 1]) m.ojo(cabeza, [ch * 1.02, ch * 1.05, sz * ch * 0.32], ch * 0.16, '#1a1410');
  m.caja(cabeza, ch * 1.1, ch * 0.62, 0, ch * 0.12, ch * 0.12, ch * 0.3, p.piel);
  if (p.mejillas) for (const sz of [-1, 1]) m.volumen(cabeza, [elip([ch * 0.55, ch * 0.75, sz * ch * 1.0], [ch * 0.18, ch * 0.75, ch * 0.42])], () => C(p.piel), v * 0.7);
  for (const [n, z] of [['brazoIzq', 1], ['brazoDer', -1]]) {
    const hombro = m.pivote(torso, n, 0, tronco * 0.88, z * H * 0.2 * Math.min(1.2, p.brazos));
    hombro.rotation.z = 0.85;
    m.volumen(hombro, [tubo([0, 0, 0], [0, -brazo * 0.5, 0], H * 0.07, H * 0.055)], pPelo, v);
    if (p.mechas) for (let q = 0; q < 5; q++) m.caja(hombro, -H * 0.06, -brazo * (0.1 + q * 0.08), z * H * 0.02, H * 0.03, H * 0.16, H * 0.06, p.mechas, [0, 0, 0.3]);
    const codo = m.pivote(hombro, n + 'Codo', 0, -brazo * 0.5, 0);
    m.volumen(codo, [tubo([0, 0, 0], [0, -brazo * 0.47, 0], H * 0.055, H * 0.045)], pPelo, v);
    if (p.mechas) for (let q = 0; q < 4; q++) m.caja(codo, -H * 0.05, -brazo * (0.08 + q * 0.09), z * H * 0.02, H * 0.03, H * 0.14, H * 0.05, p.mechas, [0, 0, 0.3]);
    m.volumen(codo, [elip([0.01, -brazo * 0.52, 0], [H * 0.06, H * 0.035, H * 0.05])], () => C(p.piel), v * 0.7);
  }
  for (const [n, z] of [['piernaIzq', 1], ['piernaDer', -1]]) {
    const ingle = m.pivote(cadera, n, 0, 0, z * H * 0.12);
    ingle.rotation.z = 0.5;
    m.volumen(ingle, [tubo([0, 0, 0], [0, -piernas * 0.64, 0], H * 0.07, H * 0.06)], pPelo, v);
    const rodilla = m.pivote(ingle, n + 'Rod', 0, -piernas * 0.64, 0);
    rodilla.rotation.z = -0.95;
    m.volumen(rodilla, [tubo([0, 0, 0], [0, -piernas * 0.6, 0], H * 0.06, H * 0.05)], pPelo, v);
    m.volumen(rodilla, [elip([0.03, -piernas * 0.62, 0], [H * 0.09, H * 0.03, H * 0.05])], () => C(p.piel), v * 0.7);
  }
  if (p.cola) {
    const cola = m.pivote(cadera, 'cola', -H * 0.12, 0, 0);
    cola.rotation.z = -2.2;
    m.volumen(cola, [tubo([0, 0, 0], [H * 0.55, 0, 0], H * 0.03, H * 0.02)], pPelo, v * 0.8);
  }
  m.anims = ['quieto', 'andar', 'comer', 'sentarse', 'morir'];
  m.mover = moverPrimate;
  m.datos = { H, W: H * 0.34 };
}

function moverPrimate(m, a, t, k) {
  const P = m.piv;
  if (a === 'quieto') { P.torso.scale.y = 1 + s(t * 2) * 0.012; P.cabeza.rotation.y = s(t * 0.6) * 0.5; }
  else if (a === 'andar') {
    const f = 4;
    P.brazoIzq.rotation.z += s(t * f) * 0.45; P.brazoDer.rotation.z += s(t * f + PI) * 0.45;
    P.piernaIzq.rotation.z += s(t * f + PI) * 0.4; P.piernaDer.rotation.z += s(t * f) * 0.4;
    P.cadera.position.y += Math.abs(s(t * f)) * 0.02;
    P.torso.rotation.x = s(t * f) * 0.06;
  } else if (a === 'comer' || a === 'sentarse') {
    const f = tramo(k, 0, 0.8);
    P.torso.rotation.z += f * 0.75; P.cabeza.rotation.z -= f * 0.75;
    P.cadera.position.y -= f * m.datos.H * 0.12;
    P.piernaIzq.rotation.z += f * 0.6; P.piernaDer.rotation.z += f * 0.6;
    if (a === 'comer') {
      const mano = (s(t * 2.5) * 0.5 + 0.5) * f;
      P.brazoIzq.rotation.z -= f * 0.4 - mano * 1.2; P.brazoIzqCodo.rotation.z = -mano * 2.1;
      P.brazoDer.rotation.z -= f * 0.6;
      P.cabeza.rotation.z += s(t * 5) * 0.05 * f;
    } else { P.brazoIzq.rotation.z -= f * 0.7; P.brazoDer.rotation.z -= f * 0.7; P.cabeza.rotation.y = s(t * 0.7) * 0.6; }
  } else if (a === 'morir') caer(m, k, m.datos.W);
}

/* ================= REPTIL (lagartos y varanos) ================= */
function reptil(m, p) {
  const L = p.largo, W = p.ancho, H = W * 0.7, v = W * 0.11;
  const alto = W * 0.5;
  const base = m.pivote(m.raiz, 'base', 0, alto + H * 0.15, 0);
  const nTorso = 3, nCola = 6;
  const lt = L * 0.4 / nTorso, lc = L * 0.47 / nCola;
  const pintaEsc = (iSeg, x, y, z, k = 1) => {
    if (y < -H * 0.25 * k) return C(p.vientre);
    if (p.lateral && y < H * 0.08 * k && Math.abs(z) > W * 0.3 * k) return C(p.lateral);
    if (p.bandas) { const fx = (((x - iSeg * lt) / (W * 0.5)) % 1 + 1) % 1; const fz = ((z / (W * 0.15)) % 1 + 1) % 1; if (fx < 0.3 && fz < 0.5 && y > -H * 0.1) return C(p.puntos); }
    if (p.rayas && Math.abs(Math.abs(z) - W * 0.2 * k) < W * 0.045 && y > 0) return C(p.puntos);
    if (p.moteado && ((Math.floor(x / v) * 7 + Math.floor(z / v) * 13 + iSeg * 5) % 9 === 0)) return C(p.puntos);
    return C(p.piel);
  };
  let padre = base;
  m.columna = [];
  for (let i = 0; i < nTorso; i++) {
    const g = m.pivote(padre, 't' + i, i ? -lt : 0, 0, 0);
    const k = 1 - i * 0.04;
    m.volumen(g, [elip([-lt / 2, 0, 0], [lt * 0.62, H * 0.52 * k, W * 0.5 * k])], (x, y, z) => pintaEsc(i, x, y, z, k), v);
    if (p.cresta) m.volumen(g, [elip([-lt * 0.5, H * 0.55, 0], [lt * 0.45, H * 0.22, W * 0.04])], (x) => C(Math.floor(x / v) % 2 ? p.cresta : p.piel), v * 0.6);
    m.columna.push(g); padre = g;
  }
  for (let i = 0; i < nCola; i++) {
    const g = m.pivote(padre, 'c' + i, -(i ? lc : lt), 0, 0);
    const k = 1 - (i + 1) / (nCola + 1);
    m.volumen(g, [tubo([0, 0, 0], [-lc * 1.05, -H * 0.04, 0], W * 0.42 * k + W * 0.04, W * 0.38 * k + W * 0.03)], (x, y, z) => (p.colaRayas && i % 2 ? C(p.colaRayas) : pintaEsc(i + nTorso, x, y, z, k)), v * 0.8);
    m.columna.push(g); padre = g;
  }
  const cuello = m.pivote(base, 'cuello', 0, 0, 0);
  const cl = L * (p.cabezaLarga ? 0.08 : 0.05);
  m.volumen(cuello, [tubo([-lt * 0.2, 0, 0], [cl, H * 0.06, 0], W * 0.4, W * 0.32)], (x, y, z) => pintaEsc(0, x, y, z), v);
  const cabeza = m.pivote(cuello, 'cabeza', cl, H * 0.06, 0);
  const hl = L * (p.cabezaLarga ? 0.11 : 0.075);
  const craneo = elip([hl * 0.4, 0, 0], [hl * 0.55, H * 0.38, W * 0.34]);
  m.volumen(cabeza, [craneo, tubo([hl * 0.4, -H * 0.05, 0], [hl * 1.2, -H * 0.12, 0], H * 0.28, H * 0.16)],
    (x, y, z) => (y < -H * 0.16 ? C(p.vientre) : p.cabezaColor ? C(p.cabezaColor) : pintaEsc(0, x, y, z)), v * 0.7);
  for (const sz of [-1, 1]) m.ojo(cabeza, sobre(craneo, 0.5, 0.45, sz * 0.75), Math.max(0.01, W * 0.12), p.iris || '#d8a82a');
  const lengua = m.pivote(cabeza, 'lengua', hl * 1.3, -H * 0.15, 0);
  m.caja(lengua, hl * 0.25, 0, 0, hl * 0.5, 0.006, W * 0.12, '#c83a5a');
  lengua.scale.x = 0.01;
  if (p.cresta) m.volumen(cabeza, [elip([0, H * 0.42, 0], [hl * 0.45, H * 0.3, W * 0.04])], () => C(p.cresta), v * 0.6);
  for (const [n, idx, z] of [['delIzq', 0, 1], ['delDer', 0, -1], ['trasIzq', 2, 1], ['trasDer', 2, -1]]) {
    const hombro = m.pivote(m.columna[idx], n, idx ? -lt * 0.7 : -lt * 0.2, -H * 0.15, z * W * 0.42);
    const brazo = W * 0.42;
    m.volumen(hombro, [tubo([0, 0, 0], [0, 0, z * brazo], W * 0.13, W * 0.1)], () => C(p.piel), v * 0.8);
    const codo = m.pivote(hombro, n + 'Codo', 0, 0, z * brazo);
    m.volumen(codo, [tubo([0, 0, 0], [0.01, -alto * 1.05, 0], W * 0.1, W * 0.08)], () => C(p.piel), v * 0.8);
    for (let d = -1; d <= 1; d++) m.caja(codo, W * 0.08, -alto * 1.08, d * W * 0.07, W * 0.18, 0.008, W * 0.035, p.vientre, [0, d * 0.4, 0]);
  }
  m.anims = ['quieto', 'andar', 'comer', 'atacar', 'flexiones', 'morir'];
  m.mover = moverReptil;
  m.datos = { L, W, alto };
}

function moverReptil(m, a, t, k) {
  const P = m.piv;
  const onda = (amp, f, desfase) => m.columna.forEach((g, i) => { g.rotation.y += s(t * f - i * desfase) * amp; });
  const lengua = (cada) => { const x = (t % cada) / cada; P.lengua.scale.x = x < 0.12 ? s(x / 0.12 * PI) + 0.01 : 0.01; };
  if (a === 'quieto') { onda(0.03, 1, 0.5); P.cabeza.rotation.y = s(t * 0.5) * 0.25; lengua(1.6); }
  else if (a === 'andar') {
    const f = 5;
    onda(0.18, f, 0.55);
    for (const [n, df] of [['delIzq', 0], ['trasDer', 0], ['delDer', PI], ['trasIzq', PI]]) {
      P[n].rotation.y = s(t * f + df) * 0.6;
      P[n].rotation.x = Math.max(0, c(t * f + df)) * 0.35 * (n.endsWith('Izq') ? -1 : 1);
    }
    lengua(0.9);
  } else if (a === 'comer') {
    const f = tramo(k, 0, 0.4);
    P.cuello.rotation.z = -f * 0.35;
    P.cabeza.rotation.z = -f * 0.3 + s(t * 7) * 0.12 * f;
  } else if (a === 'atacar') {
    const ciclo = k % 1.6;
    const l = tramo(ciclo, 0.2, 0.35) * (1 - tramo(ciclo, 0.6, 1.1));
    P.base.position.x += l * m.datos.L * 0.12;
    P.cuello.rotation.z = l * 0.35; P.cabeza.rotation.z = l * 0.25;
    onda(0.08, 3, 0.6);
  } else if (a === 'flexiones') {
    const x = Math.max(0, s(t * 4));
    P.base.position.y += x * m.datos.alto * 0.6;
    m.columna[0].rotation.z = x * 0.18;
    P.cabeza.rotation.z = -x * 0.1;
  } else if (a === 'morir') {
    caer(m, k, m.datos.alto * 1.6, false);
    for (const n of ['delIzq', 'delDer', 'trasIzq', 'trasDer']) P[n + 'Codo'].rotation.x = tramo(k, 0.8, 1.6) * 0.8 * (n.endsWith('Izq') ? 1 : -1);
  }
}

/* ================= SERPIENTE ================= */
function serpiente(m, p) {
  const n = 22, L = p.largo, G = p.grueso, seg = L / n, v = G * 0.16;
  const base = m.pivote(m.raiz, 'base', 0, G * 0.5, 0);
  const red = p.rombos ? celdas(m.r, [[-L, -G, -G], [0, G, G]], Math.round(L / G * 1.4)) : null;
  let padre = base;
  m.columna = [];
  for (let i = 0; i < n; i++) {
    const g = m.pivote(padre, 'v' + i, i ? -seg : 0, 0, 0);
    const k = i < n * 0.72 ? 1 - (i < 2 ? (2 - i) * 0.12 : 0) : 1 - (i - n * 0.72) / (n * 0.28) * 0.82;
    const off = -i * seg;
    m.volumen(g, [tubo([0, 0, 0], [-seg * 1.05, 0, 0], G * 0.5 * k, G * 0.5 * k)], (x, y, z) => {
      if (y < -G * 0.32 * k) return C(p.vientre);
      if (red) { const q = red(x + off, y, z); if (q.borde < G * 0.16) return C(p.bandas); if (q.semilla > 0.5 && q.d < G * 0.32) return C(p.rombos); return C(p.piel); }
      if (p.bandas && (i % 3 === 0) && x > -seg * 0.45) return C(p.bandas);
      if (p.costado && Math.abs(z) > G * 0.3 * k && y < G * 0.05) return C(p.costado);
      return C(p.piel);
    }, v);
    g.rotation.y = s(i * 0.55) * 0.22;
    m.columna.push(g); padre = g;
  }
  const cabeza = m.pivote(base, 'cabeza', 0, 0, 0);
  const hl = G * 1.7;
  const craneo = elip([hl * 0.5, 0, 0], [hl * 0.62, G * 0.42, G * (p.cabezaAncha ? 0.78 : 0.56)]);
  m.volumen(cabeza, [craneo, elip([hl * 0.95, -G * 0.06, 0], [hl * 0.32, G * 0.3, G * 0.4])], (x, y) => (y < -G * 0.2 ? C(p.vientre) : C(p.cabezaColor || p.piel)), v * 0.7);
  for (const sz of [-1, 1]) m.ojo(cabeza, sobre(craneo, 0.6, 0.4, sz * 0.75), G * 0.22, p.cabezaAncha ? '#e8c43a' : '#c8a060', false);
  const lengua = m.pivote(cabeza, 'lengua', hl * 1.15, -G * 0.15, 0);
  m.caja(lengua, hl * 0.4, 0, 0, hl * 0.8, 0.006, G * 0.25, '#c8324a');
  lengua.scale.x = 0.01;
  m.anims = ['quieto', 'reptar', 'atacar', 'enrollarse', 'morir'];
  m.mover = moverSerpiente;
  m.datos = { L, G, n };
}

function moverSerpiente(m, a, t, k) {
  const P = m.piv;
  const lengua = (cada) => { const x = (t % cada) / cada; P.lengua.scale.x = x < 0.15 ? s(x / 0.15 * PI) + 0.01 : 0.01; };
  if (a === 'quieto') { m.columna.forEach((g, i) => { g.rotation.y += s(t * 0.8 - i * 0.4) * 0.03; }); lengua(1.3); }
  else if (a === 'reptar') { m.columna.forEach((g, i) => { g.rotation.y = s(t * 4 - i * 0.6) * 0.42; }); P.cabeza.rotation.y = -s(t * 4) * 0.3; lengua(0.8); }
  else if (a === 'atacar') {
    const ciclo = k % 2;
    const sube = tramo(ciclo, 0, 0.5), golpe = tramo(ciclo, 0.8, 0.95) * (1 - tramo(ciclo, 1.1, 1.7));
    for (let i = 0; i < 6; i++) m.columna[i].rotation.z = (i < 3 ? 0.35 : -0.2) * sube * (1 - golpe);
    P.base.position.x = golpe * m.datos.L * 0.18;
    P.base.position.y += sube * m.datos.G * 2 * (1 - golpe);
    P.cabeza.rotation.z = -0.2 * sube + golpe * 0.2;
    lengua(0.5);
  } else if (a === 'enrollarse') {
    const f = tramo(k, 0, 1.5);
    m.columna.forEach((g, i) => { g.rotation.y = g.userData.br.y * (1 - f) + f * (0.58 - i * 0.01); g.position.y = g.userData.bp.y + f * m.datos.G * 0.05; });
    P.cabeza.rotation.y = f * -0.5;
    lengua(1.2);
  } else if (a === 'morir') caer(m, k, m.datos.G, false);
}

/* ================= RANA ================= */
function rana(m, p) {
  const L = p.largo, H = L * 0.5, v = L * 0.035;
  const motas = lunares(m.r, [[-L * 0.4, -H * 0.4, -L * 0.3], [L * 0.4, H * 0.4, L * 0.3]], 14, L * 0.06);
  const piel = (x, y, z) => (y < -H * 0.12 ? C(p.vientre) : motas(x, y, z) ? C(p.puntos) : C(p.piel));
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, H * 0.45, 0);
  cuerpo.rotation.z = 0.32;
  m.volumen(cuerpo, [elip([0, 0, 0], [L * 0.32, H * 0.32, L * 0.25]), elip([-L * 0.18, -H * 0.05, 0], [L * 0.18, H * 0.28, L * 0.22])], piel, v);
  const cabeza = m.pivote(cuerpo, 'cabeza', L * 0.3, H * 0.05, 0);
  m.volumen(cabeza, [elip([L * 0.08, 0, 0], [L * 0.17, H * 0.24, L * 0.24]), elip([L * 0.2, -H * 0.04, 0], [L * 0.1, H * 0.16, L * 0.18])],
    (x, y, z) => (p.antifaz && y > -H * 0.08 && y < H * 0.1 && Math.abs(z) > L * 0.14 ? C(p.antifaz) : piel(x, y, z)), v);
  for (const sz of [-1, 1]) {
    m.volumen(cabeza, [elip([L * 0.1, H * 0.2, sz * L * 0.15], [L * 0.06, H * 0.1, L * 0.06])], () => C(p.piel), v * 0.7);
    m.ojo(cabeza, [L * 0.14, H * 0.24, sz * L * 0.17], L * 0.045, p.iris || '#2a1c10');
  }
  const garganta = m.pivote(cabeza, 'garganta', L * 0.1, -H * 0.2, 0);
  m.volumen(garganta, [elip([0, 0, 0], [L * 0.1, H * 0.07, L * 0.14])], () => C(p.vientre), v * 0.7);
  const lengua = m.pivote(cabeza, 'lengua', L * 0.26, -H * 0.05, 0);
  m.caja(lengua, L * 0.4, 0, 0, L * 0.8, 0.008, L * 0.06, '#e07a8a');
  lengua.scale.x = 0.01;
  for (const z of [-1, 1]) {
    const brazo = m.pivote(cuerpo, z > 0 ? 'brazoIzq' : 'brazoDer', L * 0.2, -H * 0.15, z * L * 0.2);
    brazo.rotation.z = -0.3;
    m.volumen(brazo, [tubo([0, 0, 0], [0, -H * 0.38, 0], L * 0.04, L * 0.032)], piel, v * 0.7);
    m.caja(brazo, L * 0.03, -H * 0.4, 0, L * 0.1, 0.01, L * 0.08, p.piel);
    const n = z > 0 ? 'musloIzq' : 'musloDer';
    const muslo = m.pivote(cuerpo, n, -L * 0.25, -H * 0.1, z * L * 0.24);
    muslo.rotation.z = 2.6 - 0.32;
    m.volumen(muslo, [tubo([0, 0, 0], [0, -L * 0.34, 0], L * 0.075, L * 0.05)], piel, v * 0.8);
    const rod = m.pivote(muslo, n + 'Rod', 0, -L * 0.34, 0);
    rod.rotation.z = -2.6;
    m.volumen(rod, [tubo([0, 0, 0], [0, -L * 0.32, 0], L * 0.05, L * 0.038)], piel, v * 0.8);
    const tob = m.pivote(rod, n + 'Pie', 0, -L * 0.32, 0);
    tob.rotation.z = 2.2;
    m.volumen(tob, [tubo([0, 0, 0], [0, -L * 0.18, 0], L * 0.035, L * 0.03)], piel, v * 0.7);
    for (let d = -1; d <= 1; d++) m.caja(tob, 0, -L * 0.2, d * L * 0.035, L * 0.03, L * 0.1, L * 0.025, p.piel, [d * 0.3, 0, 0]);
  }
  m.anims = ['quieto', 'saltar', 'comer', 'croar', 'morir'];
  m.mover = moverRana;
  m.datos = { L, H, W: L * 0.5 };
}

function moverRana(m, a, t, k) {
  const P = m.piv;
  if (a === 'quieto') P.garganta.scale.y = 1 + Math.max(0, s(t * 6)) * 0.6;
  else if (a === 'saltar') {
    const ciclo = k % 1.4;
    const e = tramo(ciclo, 0.15, 0.3) * (1 - tramo(ciclo, 0.55, 0.8));
    const vuelo = Math.min(1, Math.max(0, (ciclo - 0.2) / 0.5));
    m.raiz.position.x = vuelo * m.datos.L * 2.2 - m.datos.L * 1.1;
    m.raiz.position.y = s(vuelo * PI) * m.datos.L * 0.9;
    for (const n of ['musloIzq', 'musloDer']) { P[n].rotation.z -= e * 1.9; P[n + 'Rod'].rotation.z += e * 2.3; P[n + 'Pie'].rotation.z -= e * 1.6; }
    P.cuerpo.rotation.z -= e * 0.25;
  } else if (a === 'comer') {
    const x = (k % 1.5) / 1.5;
    P.lengua.scale.x = x < 0.2 ? s(x / 0.2 * PI) + 0.01 : 0.01;
    P.cabeza.rotation.z = x < 0.2 ? 0.15 : 0;
  } else if (a === 'croar') {
    const x = Math.max(0, s(t * 3));
    P.garganta.scale.set(1 + x * 1.5, 1 + x * 3, 1 + x * 1.5);
  } else if (a === 'morir') {
    caer(m, k, m.datos.H * 0.6, false);
    for (const n of ['musloIzq', 'musloDer']) P[n].rotation.z -= tramo(k, 0.5, 1.3) * 1.4;
  }
}

/* ================= AVE ================= */
function ave(m, p) {
  const L = p.largo, B = L * 0.3, v = L * 0.028;
  const patas = p.buho ? L * 0.2 : p.gallo ? L * 0.36 : L * 0.22;
  const motas = p.puntos ? lunares(m.r, [[-L * 0.3, -B * 0.6, -B * 0.6], [L * 0.3, B * 0.1, B * 0.6]], p.buho ? 30 : 22, B * 0.07) : () => false;
  const pluma = (x, y, z) => {
    if (y < -B * 0.08 && x > -L * 0.12) return motas(x, y, z) ? C(p.puntos) : (p.buho && Math.floor(y / v) % 2 ? mezcla(p.pecho, p.puntos, 0.5) : C(p.pecho));
    if (p.gallo && x > L * 0.08 && y > 0) return C(p.puntos);
    return C(p.plumas);
  };
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, patas + B * 0.48, 0);
  cuerpo.rotation.z = p.buho ? 1.1 : p.gallo ? 0.15 : 0.45;
  m.volumen(cuerpo, [elip([0, 0, 0], [L * 0.27, B * 0.5, B * 0.48]), elip([L * 0.1, -B * 0.06, 0], [L * 0.16, B * 0.48, B * 0.46])], pluma, v);
  const cuello = m.pivote(cuerpo, 'cuello', L * 0.22, B * 0.22, 0);
  cuello.rotation.z = -cuerpo.rotation.z;
  m.volumen(cuello, [tubo([0, -B * 0.2, 0], [0, B * 0.25, 0], B * 0.28, B * 0.24)], (x, y) => (p.gallo ? C(p.puntos) : y < -B * 0.05 ? C(p.pecho) : C(p.plumas)), v);
  const cabeza = m.pivote(cuello, 'cabeza', p.buho ? -0.02 : 0.01, p.buho ? B * 0.18 : B * 0.36, 0);
  const ch = B * (p.buho ? 0.62 : 0.4);
  const craneo = elip([0, 0, 0], [ch, ch, ch * (p.buho ? 1.05 : 0.85)]);
  m.volumen(cabeza, [craneo], (x, y, z) => {
    if (p.buho) return x > ch * 0.45 ? (Math.hypot(y, Math.abs(z) - ch * 0.42) > ch * 0.42 ? C(p.puntos) : C(p.cara)) : C(p.plumas);
    if (p.cara && x > ch * 0.25 && y < ch * 0.15 && y > -ch * 0.55) return C(p.cara);
    if (p.calao && y < -ch * 0.3) return C(p.cara);
    return C(p.plumas);
  }, v * 0.7);
  for (const sz of [-1, 1]) m.ojo(cabeza, sobre(craneo, p.buho ? 1 : 0.5, 0.2, sz * (p.buho ? 0.5 : 0.85)), ch * (p.buho ? 0.24 : 0.2), p.buho ? '#1a1208' : p.rapaz ? '#e8c43a' : '#1a1410');
  const pl = p.calao ? ch * 2.4 : p.rapaz ? ch * 0.7 : p.horquilla ? ch * 0.35 : p.buho ? ch * 0.35 : ch * 0.7;
  m.volumen(cabeza, [tubo([ch * 0.7, -ch * 0.05, 0], [ch * 0.7 + pl, -ch * (p.rapaz ? 0.35 : p.calao ? 0.45 : 0.15), 0], ch * (p.calao ? 0.42 : 0.28), ch * 0.06)],
    (x) => (p.rapaz && x < ch * 0.95 ? C(p.cara) : C(p.pico)), v * 0.5);
  if (p.calao) m.volumen(cabeza, [elip([ch * 1.3, ch * 0.42, 0], [ch * 0.8, ch * 0.22, ch * 0.24])], () => C(p.pico), v * 0.5);
  if (p.cresta) m.volumen(cabeza, [elip([-ch * 0.6, ch * 0.55, 0], [ch * 0.6, ch * 0.35, ch * 0.5])], (x, y, z) => (Math.floor(z / v) % 2 ? C(p.puntos) : C(p.plumas)), v * 0.6);
  if (p.calao) for (let i = 0; i < 9; i++) m.caja(cabeza, -ch * 0.4, ch * 0.7 + (i % 3) * ch * 0.12, (i - 4) * ch * 0.12, ch * 0.8, ch * 0.06, ch * 0.06, p.plumas, [0, (i - 4) * 0.08, 0.9]);
  if (p.gallo) { m.volumen(cabeza, [elip([ch * 0.1, ch * 1.0, 0], [ch * 0.7, ch * 0.42, ch * 0.08])], () => C('#d42a22'), v * 0.4); m.volumen(cabeza, [elip([ch * 0.8, -ch * 0.85, 0], [ch * 0.22, ch * 0.4, ch * 0.08])], () => C('#d42a22'), v * 0.4); }
  const cola = m.pivote(cuerpo, 'cola', -L * 0.25, B * 0.05, 0);
  if (p.horquilla) for (const z of [-1, 1]) m.volumen(cola, [tubo([0, 0, 0], [-L * 0.45, 0, z * B * 0.32], B * 0.08, B * 0.02)], () => C(p.plumas), v * 0.5);
  else if (p.gallo) for (let i = 0; i < 6; i++) m.volumen(cola, [tubo([0, 0, 0], [-L * 0.38, L * (0.25 - i * 0.07), (i % 2 - 0.5) * B * 0.2], B * 0.08, B * 0.03)], () => C(i % 2 ? '#1e4a34' : '#1a1a1e'), v * 0.6);
  else m.volumen(cola, [elip([-L * (p.colaLarga ? 0.25 : 0.15), 0, 0], [L * (p.colaLarga ? 0.27 : 0.17), B * 0.06, B * 0.36])], (x) => (p.calao && x < -L * 0.3 ? C('#efeae0') : p.rapaz && Math.abs(x + L * 0.15) < L * 0.04 ? C('#e8e2d6') : C(p.plumas)), v * 0.6);
  const env = L * p.alas * 0.5;
  for (const [n, z] of [['alaIzq', 1], ['alaDer', -1]]) {
    const hombro = m.pivote(cuerpo, n, L * 0.12, B * 0.32, z * B * 0.42);
    const brazo = m.pivote(hombro, n + 'B', 0, 0, 0);
    m.volumen(brazo, [elip([-env * 0.1, 0, z * env * 0.26], [env * 0.24, 0.012 + env * 0.02, env * 0.28])], (x, y, zz) => (p.puntos && !p.buho && (Math.floor(x / v) + Math.floor(zz / v)) % 4 === 0 ? C(p.puntos) : C(p.plumas)), v * 0.6);
    const mano = m.pivote(brazo, n + 'Mano', 0, 0, z * env * 0.5);
    m.volumen(mano, [elip([-env * 0.14, 0, z * env * 0.24], [env * 0.2, 0.01 + env * 0.015, env * 0.28])], (x) => (x < -env * 0.25 ? mezcla(p.plumas, '#000', 0.25) : C(p.plumas)), v * 0.6);
    for (let i = 0; i < 4; i++) m.caja(mano, -env * (0.28 + i * 0.03), -0.002, z * env * (0.34 + i * 0.05), env * 0.22, 0.008, env * 0.05, mezcla(p.plumas, '#000', 0.3));
    hombro.userData.z = z;
  }
  for (const [n, z] of [['patIzq', 1], ['patDer', -1]]) {
    const cad = m.pivote(m.raiz, n, 0, patas, z * B * 0.2);
    m.volumen(cad, [tubo([0, 0.01, 0], [0, -patas, 0], B * 0.06, B * 0.045)], () => C(p.patas), v * 0.5);
    for (let d = -1; d <= 1; d++) m.caja(cad, B * 0.12, -patas + 0.005, d * B * 0.08, B * 0.3, 0.01, B * 0.05, p.patas, [0, d * 0.5, 0]);
  }
  m.anims = ['quieto', 'saltitos', 'comer', 'volar', 'planear', 'morir'];
  m.mover = moverAve;
  m.datos = { L, B, patas, buho: !!p.buho };
  plegarAlas(m, 1);
}

function plegarAlas(m, f) {
  for (const n of ['alaIzq', 'alaDer']) {
    const z = m.piv[n].userData.z;
    m.piv[n].rotation.y = -z * f * 1.45;
    m.piv[n].rotation.x = z * f * 1.4;
    m.piv[n + 'Mano'].rotation.y = z * f * 0.25;
  }
}

function moverAve(m, a, t, k) {
  const P = m.piv, D = m.datos;
  if (a === 'quieto') { P.cabeza.rotation.y = Math.round(s(t * 0.7) * 2) * 0.35; P.cola.rotation.z = s(t * 3) * 0.05; }
  else if (a === 'saltitos') {
    m.raiz.position.y = Math.abs(s(t * 6)) * D.L * 0.15;
    m.raiz.position.x = ((t * 0.4) % 1) * D.L * 0.6 - D.L * 0.3;
    P.cabeza.rotation.z = s(t * 6) * 0.1;
  } else if (a === 'comer') {
    const x = Math.max(0, s(t * 5));
    P.cuerpo.rotation.z += x * 0.45 + 0.25;
    P.cabeza.rotation.z -= x * 0.6;
  } else if (a === 'volar' || a === 'planear') {
    const sube = tramo(k, 0, 0.6);
    plegarAlas(m, 1 - sube);
    m.raiz.position.y = sube * D.L * 1.4 + s(t * 2) * D.L * 0.08 * sube;
    P.cuerpo.rotation.z = (D.buho ? 0.2 : 0.05) * sube + P.cuerpo.userData.br.z * (1 - sube);
    P.cuello.rotation.z = -P.cuerpo.rotation.z;
    for (const n of ['patIzq', 'patDer']) { P[n].rotation.z = sube * 1.3; P[n].position.y = D.patas + sube * D.L * 1.4; }
    if (a === 'volar') {
      const f = D.L < 0.2 ? 18 : 7, x = s(t * f);
      for (const n of ['alaIzq', 'alaDer']) {
        const z = P[n].userData.z;
        P[n + 'B'].rotation.x = -z * x * 0.85 * sube;
        P[n + 'Mano'].rotation.x = -z * s(t * f - 0.8) * 0.5 * sube;
      }
    } else {
      m.raiz.rotation.x = s(t * 0.5) * 0.18 * sube;
      for (const n of ['alaIzq', 'alaDer']) P[n + 'B'].rotation.x = -P[n].userData.z * 0.08 * sube;
    }
  } else if (a === 'morir') { caer(m, k, D.B, true); plegarAlas(m, 1 - tramo(k, 0.3, 1.0) * 0.6); }
}

/* ================= INSECTO ================= */
function insecto(m, p) {
  const L = p.largo, tipo = p.tipo, v = L * 0.035;
  const w = tipo === 'palo' ? L * 0.045 : tipo === 'termita' ? L * 0.3 : tipo === 'mantis' ? L * 0.12 : L * 0.4;
  const h = tipo === 'palo' ? L * 0.045 : w * 0.6;
  const patasLargo = tipo === 'palo' ? L * 0.45 : tipo === 'mantis' ? L * 0.42 : p.patasLargas ? L * 0.55 : L * 0.38;
  const alto = patasLargo * 0.4;
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, alto + h * 0.4, 0);
  const abdL = tipo === 'palo' ? L * 0.55 : tipo === 'mantis' ? L * 0.42 : L * 0.5;
  const abd = m.pivote(cuerpo, 'abdomen', -L * 0.06, 0, 0);
  const brillo = (x, y, z, base) => (p.brillo && y > h * 0.15 && Math.abs(z) < w * 0.22 ? C(p.brillo) : C(base));
  if (tipo === 'mantis') {
    m.volumen(abd, [elip([-abdL * 0.5, 0, 0], [abdL * 0.5, h * 0.5, w * 1.6])], (x, y, z) => (Math.abs(z) < w * 0.12 ? C(p.oscuro) : Math.floor((x - z) / (v * 2)) % 3 === 0 ? C(p.claro) : C(p.color)), v);
  } else if (tipo === 'termita') {
    m.volumen(abd, [elip([-abdL * 0.5, 0, 0], [abdL * 0.55, h * 0.6, w * 0.55])], (x) => (Math.floor(x / (v * 2)) % 2 ? mezcla(p.color, '#000', 0.25) : C(p.color)), v);
  } else if (tipo === 'palo') {
    m.volumen(abd, [tubo([0, 0, 0], [-abdL, 0, 0], w * 0.5, w * 0.35)], (x) => (Math.floor(x / (v * 4)) % 5 === 0 ? C(p.claro) : C(p.color)), v * 0.6);
  } else {
    m.volumen(abd, [elip([-abdL * 0.45, 0, 0], [abdL * 0.5, h * 0.5, w * 0.5])], (x, y, z) => brillo(x, y, z, p.color), v);
  }
  const toraxL = tipo === 'palo' ? L * 0.32 : tipo === 'mantis' ? L * 0.34 : L * 0.2;
  const torax = m.pivote(cuerpo, 'torax', 0, 0, 0);
  if (tipo === 'mantis') torax.rotation.z = 0.9;
  if (tipo === 'palo') m.volumen(torax, [tubo([0, 0, 0], [toraxL, 0, 0], w * 0.45, w * 0.45)], () => C(p.color), v * 0.6);
  else m.volumen(torax, [elip([toraxL / 2, 0, 0], [toraxL * 0.55, h * (tipo === 'escarabajo' ? 0.55 : 0.42), w * (tipo === 'escarabajo' ? 0.45 : 0.36)])], (x, y, z) => brillo(x, y, z, p.color), v);
  if (tipo === 'mantis') for (const sz of [-1, 1]) m.volumen(torax, [elip([toraxL * 0.55, 0, sz * w * 1.1], [toraxL * 0.38, h * 0.2, w * 0.95])], (x, y, z) => (Math.abs(Math.abs(z) - w * 1.1) < w * 0.12 ? C(p.oscuro) : C(p.claro)), v * 0.8);
  const cabeza = m.pivote(torax, 'cabeza', toraxL, 0, 0);
  if (tipo === 'mantis') cabeza.rotation.z = -0.9;
  const ch = tipo === 'termita' ? w * 1.15 : tipo === 'cigarra' ? w * 0.75 : w * 0.62;
  const craneo = elip([ch * 0.42, 0, 0], [ch * 0.48, ch * 0.4, (tipo === 'cigarra' || tipo === 'mantis') ? ch * 0.8 : ch * 0.52]);
  m.volumen(cabeza, [craneo], () => C(tipo === 'termita' ? p.claro : p.color), v * 0.7);
  for (const sz of [-1, 1]) m.ojo(cabeza, sobre(craneo, 0.3, 0.3, sz), Math.max(0.005, ch * 0.32), tipo === 'escarabajo' ? '#e8d24a' : tipo === 'cigarra' ? '#7a3a2a' : '#2a1a10', false);
  if (tipo === 'fulgorido') m.volumen(cabeza, [tubo([ch * 0.7, ch * 0.1, 0], [ch * 0.7 + L * 0.42, ch * 0.75, 0], ch * 0.22, ch * 0.16)], (x) => (x > ch * 0.7 + L * 0.3 ? C(p.punta || p.oscuro) : C(p.oscuro)), v * 0.6);
  if (p.cuernos) {
    m.volumen(cabeza, [tubo([ch * 0.6, ch * 0.2, 0], [ch * 0.7 + L * 0.3, ch * 1.2, 0], w * 0.09, w * 0.03)], () => C(p.color), v * 0.6);
    for (const sz of [-1, 1]) m.volumen(torax, [tubo([toraxL * 0.6, h * 0.4, sz * w * 0.25], [toraxL + L * 0.32, h * 0.9, sz * w * 0.28], w * 0.08, w * 0.03)], () => C(p.color), v * 0.6);
  }
  if (p.mandibulas) for (const sz of [-1, 1]) m.caja(cabeza, ch * 0.95, -ch * 0.1, sz * ch * 0.2, ch * 0.45, ch * 0.12, ch * 0.12, '#f0e6c8', [0, sz * 0.4, 0]);
  for (const z of [-1, 1]) {
    const ant = m.pivote(cabeza, z > 0 ? 'antIzq' : 'antDer', ch * 0.7, ch * 0.3, z * ch * 0.25);
    const al = tipo === 'palo' ? L * 0.45 : tipo === 'escarabajo' ? L * 0.22 : L * 0.3;
    ant.rotation.set(z * 0.5, 0, 0.6);
    m.caja(ant, al / 2, 0, 0, al, 0.004, 0.004, tipo === 'termita' ? p.claro : '#1a1410');
  }
  if (tipo === 'escarabajo') {
    for (const [n, z] of [['elitroIzq', 1], ['elitroDer', -1]]) {
      const e = m.pivote(cuerpo, n, -L * 0.03, h * 0.18, z * 0.002);
      const motas = p.puntos ? lunares(m.r, [[-abdL, 0, -w], [0, h, w]], 4, w * 0.13) : () => false;
      m.volumen(e, [elip([-abdL * 0.47, h * 0.12, z * w * 0.24], [abdL * 0.52, h * 0.38, w * 0.27])], (x, y, zz) => (motas(x, y, zz) ? C(p.puntos) : brillo(x, y, zz - z * w * 0.24, p.color)), v * 0.8);
      e.userData.z = z;
    }
    if (p.bola) { const b = m.pivote(m.raiz, 'bola', -L * 0.85, L * 0.35, 0); m.volumen(b, [elip([0, 0, 0], [L * 0.35, L * 0.35, L * 0.35])], () => C(p.bola), v); }
  }
  if (p.alas || tipo === 'mantis') {
    for (const [n, z] of [['alaIzq', 1], ['alaDer', -1]]) {
      const e = m.pivote(cuerpo, n, 0, h * 0.45, 0);
      const largo = tipo === 'mantis' ? abdL * 0.8 : L * 0.85;
      const motas = tipo === 'fulgorido' ? lunares(m.r, [[-largo, -1, -w], [0, 1, w]], 14, w * 0.07) : () => false;
      m.volumen(e, [elip([-largo * 0.45, 0, z * w * 0.28], [largo * 0.5, 0.004 + v * 0.3, w * (tipo === 'cigarra' ? 0.5 : 0.45)])], (x, y, zz) => {
        if (tipo === 'fulgorido') return motas(x, y, zz) ? C(p.claro) : x > -largo * 0.35 ? C(p.color) : mezcla(p.color, '#1a4a2a', 0.5);
        if (tipo === 'cigarra') return Math.floor((x + zz) / (v * 2)) % 4 === 0 ? C(p.color) : C('#c8d4be');
        return C(p.claro);
      }, v * 0.6).rotation.x = z * 0.32;
      e.userData.z = z;
    }
  }
  m.patas = [];
  const filas = tipo === 'mantis' ? [[-0.02, 1], [-0.12, 2]] : [[toraxL * 0.75 / L, 0], [toraxL * 0.4 / L, 1], [toraxL * 0.05 / L, 2]];
  const colPata = tipo === 'termita' ? p.claro : p.patasColor || p.color;
  for (const [fx, idx] of filas) for (const z of [-1, 1]) {
    const padre = tipo === 'mantis' ? cuerpo : torax;
    const cad = m.pivote(padre, `pata${idx}${z}`, fx * L, -h * 0.3, z * w * 0.4);
    const pl = patasLargo * (idx === 2 ? 1.15 : 1);
    cad.rotation.y = z * (idx - 1) * 0.6;
    m.volumen(cad, [tubo([0, 0, 0], [0, pl * 0.22, z * pl * 0.42], 0.004 + L * 0.012, 0.003 + L * 0.009)], () => C(colPata), Math.max(0.003, L * 0.012));
    const rod = m.pivote(cad, `rod${idx}${z}`, 0, pl * 0.22, z * pl * 0.42);
    m.volumen(rod, [tubo([0, 0, 0], [0, -alto * 1.25, z * pl * 0.05], 0.003 + L * 0.009, 0.002 + L * 0.006)], () => C(colPata), Math.max(0.003, L * 0.012));
    m.patas.push({ cad, idx, z });
  }
  if (tipo === 'mantis') for (const z of [-1, 1]) {
    const h1 = m.pivote(torax, z > 0 ? 'garraIzq' : 'garraDer', toraxL * 0.8, -h * 0.2, z * w * 0.6);
    h1.rotation.z = -1.6;
    m.volumen(h1, [elip([L * 0.11, 0, 0], [L * 0.12, w * 0.22, w * 0.18])], () => C(p.claro), v * 0.7);
    const h2 = m.pivote(h1, (z > 0 ? 'garraIzq' : 'garraDer') + 'B', L * 0.22, 0, 0);
    h2.rotation.z = 2.6;
    m.volumen(h2, [tubo([0, 0, 0], [L * 0.2, 0, 0], w * 0.15, w * 0.08)], () => C(p.claro), v * 0.7);
  }
  m.anims = ['quieto', 'andar', 'comer'];
  if (tipo === 'escarabajo' || p.alas) m.anims.push('volar');
  if (tipo === 'mantis' || p.mandibulas) m.anims.push('atacar');
  if (p.bola) m.anims.push('empujar');
  m.anims.push('morir');
  m.mover = moverInsecto;
  m.datos = { L, w, h, alto, tipo };
}

function moverInsecto(m, a, t, k) {
  const P = m.piv, D = m.datos;
  const antenas = (f) => { P.antIzq.rotation.y = s(t * f) * 0.3; P.antDer.rotation.y = -s(t * f + 1) * 0.3; };
  const caminar = (f, sentido = 1) => {
    for (const { cad, idx, z } of m.patas) {
      const grupo = (idx % 2 === 0) === (z > 0) ? 0 : PI;
      cad.rotation.y += s(t * f * sentido + grupo) * 0.4;
      cad.rotation.x = Math.max(0, c(t * f * sentido + grupo)) * 0.25 * -z;
    }
  };
  if (a === 'quieto') antenas(2);
  else if (a === 'andar') { caminar(D.tipo === 'palo' ? 4 : 12); antenas(5); if (D.tipo === 'palo') P.cuerpo.position.x = s(t * 2) * D.L * 0.03; }
  else if (a === 'comer') { P.cabeza.rotation.z += -0.2 + s(t * 10) * 0.12; antenas(6); }
  else if (a === 'volar') {
    const sube = tramo(k, 0, 0.5);
    m.raiz.position.y = sube * D.L * 2.5 + s(t * 3) * D.L * 0.2 * sube;
    for (const n of ['elitroIzq', 'elitroDer']) if (P[n]) P[n].rotation.x = -P[n].userData.z * sube * 0.9;
    for (const n of ['alaIzq', 'alaDer']) if (P[n]) P[n].rotation.x = -P[n].userData.z * (sube * 0.4 + s(t * 40) * 0.6 * sube);
    for (const { cad } of m.patas) cad.rotation.z = sube * 0.4;
  } else if (a === 'atacar') {
    const ciclo = k % 1.5, g = tramo(ciclo, 0.6, 0.7) * (1 - tramo(ciclo, 0.8, 1.2));
    if (P.garraIzq) for (const n of ['garraIzq', 'garraDer']) { P[n].rotation.z += g * 1.4; P[n + 'B'].rotation.z -= g * 1.8; }
    else m.raiz.position.x = g * D.L * 0.6;
    P.cabeza.rotation.y = s(t * 1.2) * 0.3 * (1 - g);
  } else if (a === 'empujar') { caminar(10, -1); P.bola.rotation.z = t * 3; }
  else if (a === 'morir') {
    caer(m, k, D.alto + D.h, false);
    for (const { cad, z } of m.patas) cad.rotation.x = -z * (0.4 + s(t * 25) * 0.15 * (1 - tramo(k, 1, 2.5)));
  }
}

/* ================= ALADO (mariposas y libélulas) ================= */
function alado(m, p) {
  const L = p.largo, E = p.envergadura || L * 1.1, v = Math.max(0.003, E * 0.018);
  const libelula = p.tipo === 'libelula';
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, L * 0.25, 0);
  const g = libelula ? L * 0.06 : L * 0.1;
  m.volumen(cuerpo, [tubo([L * 0.05, 0, 0], [-L * (libelula ? 0.82 : 0.5), 0, 0], g * 0.75, g * 0.45), elip([L * 0.1, 0, 0], [L * 0.12, g * 0.75, g * 0.75])],
    (x) => (p.cuello && x > 0.0 && x < L * 0.12 ? C(p.cuello) : libelula && Math.floor(-x / (v * 2)) % 4 === 0 ? mezcla(p.color, '#000', 0.4) : C(p.color)), v * 0.6);
  const cab = elip([L * 0.25, 0, 0], [g * 0.7, g * 0.75, g * (libelula ? 1.15 : 0.8)]);
  m.volumen(cuerpo, [cab], () => C(libelula ? '#8a2a1a' : p.color), v * 0.6);
  if (!libelula) for (const z of [-1, 1]) m.caja(cuerpo, L * 0.42, g * 1.4, z * g * 0.5, L * 0.35, 0.003, 0.003, '#121212', [0, -z * 0.3, 0.6]);
  const motas = p.manchado ? lunares(m.r, [[-E * 0.5, -0.01, -E * 0.6], [E * 0.5, 0.01, E * 0.6]], 40, E * 0.03) : () => false;
  for (const [n, z] of [['alaIzq', 1], ['alaDer', -1]]) {
    const raiz = m.pivote(cuerpo, n, 0, g * 0.5, z * g * 0.4);
    const formas = libelula
      ? [elip([L * 0.06, 0, z * E * 0.25], [L * 0.07, 0.003, E * 0.25]), elip([-L * 0.08, 0, z * E * 0.23], [L * 0.08, 0.003, E * 0.23])]
      : [elip([L * 0.12, 0, z * E * 0.26], [E * 0.2, 0.003, E * 0.26]), elip([-L * 0.15, 0, z * E * 0.2], [E * 0.16, 0.003, E * 0.2])];
    m.volumen(raiz, formas, (x, y, zz) => {
      const az = Math.abs(zz);
      if (libelula) return az > E * 0.38 ? C(p.alaPunta) : mezcla(p.ala, '#f0e0d0', az / (E * 0.5) * 0.4);
      if (p.manchado) return motas(x, y, zz) || (Math.floor(az / v) % 6 === 0) ? C(p.alaPunta) : C(p.ala);
      if (x > -E * 0.02 && az > E * 0.12 && az < E * 0.42 && Math.floor(az / (v * 2.2)) % 2 === 0 && x < E * 0.16) return C(p.alaPunta);
      if (x <= -E * 0.02 && az > E * 0.06 && az < E * 0.28 && x > -E * 0.22) return C(p.alaPunta);
      return C(p.ala);
    }, v);
    raiz.userData.z = z;
  }
  m.anims = ['quieto', 'volar', 'morir'];
  m.mover = moverAlado;
  m.datos = { L, E, libelula };
}

function moverAlado(m, a, t, k) {
  const P = m.piv, D = m.datos;
  if (a === 'quieto') for (const n of ['alaIzq', 'alaDer']) { const z = P[n].userData.z; P[n].rotation.x = D.libelula ? s(t * 30) * 0.03 : -z * (0.9 + s(t * 1.2) * 0.55); }
  else if (a === 'volar') {
    const f = D.libelula ? 45 : 11;
    m.raiz.position.y = D.L * 2 + s(t * 2.3) * D.L * 0.6 + (D.libelula ? 0 : Math.abs(s(t * f)) * D.L * 0.25);
    m.raiz.position.x = s(t * 0.7) * D.L * (D.libelula ? 0.2 : 1.5);
    for (const n of ['alaIzq', 'alaDer']) P[n].rotation.x = -P[n].userData.z * s(t * f) * (D.libelula ? 0.5 : 1.2);
  } else if (a === 'morir') { caer(m, k, D.L * 0.1, true); for (const n of ['alaIzq', 'alaDer']) P[n].rotation.x = -P[n].userData.z * 0.2; }
}

/* ================= GUSANO (orugas y lombrices) ================= */
function gusano(m, p) {
  const n = p.segmentos, L = p.largo, seg = L / n, G = p.tipo === 'oruga' ? L * 0.16 : L * 0.07, v = G * 0.16;
  const base = m.pivote(m.raiz, 'base', 0, G / 2, 0);
  let padre = base;
  m.columna = [];
  for (let i = 0; i < n; i++) {
    const g = m.pivote(padre, 'g' + i, i ? -seg : 0, 0, 0);
    const k = p.tipo === 'lombriz' ? 1 - Math.abs(i - n * 0.35) / n * 0.6 : (i === 0 ? 0.85 : 1);
    const col = p.tipo === 'lombriz' && (i === 3 || i === 4) ? '#d8907a' : p.color;
    m.volumen(g, [elip([-seg / 2, 0, 0], [seg * 0.62, G * 0.5 * k, G * 0.5 * k])], (x, y, z) => (p.tipo === 'oruga' && y > G * 0.15 && Math.abs(z) > G * 0.18 && i > 0 ? C(p.puntos) : y < -G * 0.3 ? mezcla(col, '#000', 0.2) : C(col)), v);
    if (p.tipo === 'oruga' && i > 0) {
      for (const z of [-1, 1]) m.volumen(g, [tubo([-seg / 2, G * 0.35, z * G * 0.3], [-seg / 2, G * 0.8, z * G * 0.45], G * 0.1, G * 0.03)], () => C(p.puntos), v * 0.7);
      if (i < n - 1) for (const z of [-1, 1]) m.caja(g, -seg / 2, -G * 0.55, z * G * 0.28, seg * 0.3, G * 0.16, G * 0.12, p.color);
    }
    m.columna.push(g); padre = g;
  }
  m.ojo(base, [G * 0.2, G * 0.12, G * 0.25], G * 0.14, '#1a1410', false);
  m.ojo(base, [G * 0.2, G * 0.12, -G * 0.25], G * 0.14, '#1a1410', false);
  m.anims = ['quieto', 'arrastrarse', 'comer', 'morir'];
  m.mover = moverGusano;
  m.datos = { L, G, oruga: p.tipo === 'oruga' };
}

function moverGusano(m, a, t, k) {
  const D = m.datos;
  if (a === 'quieto') m.columna[0].rotation.y = s(t * 1.2) * 0.3;
  else if (a === 'arrastrarse') {
    m.columna.forEach((g, i) => {
      if (D.oruga) g.position.y = g.userData.bp.y + Math.max(0, s(t * 6 - i * 0.7)) * D.G * 0.35;
      else { g.scale.x = 1 + s(t * 5 - i * 0.6) * 0.25; g.rotation.y = s(t * 2 - i * 0.5) * 0.12; }
    });
  } else if (a === 'comer') { m.columna[0].rotation.z = -0.2 + s(t * 9) * 0.15; m.columna[0].rotation.y = s(t * 2) * 0.25; }
  else if (a === 'morir') { const f = tramo(k, 0, 1.5); m.columna.forEach((g, i) => { if (i) g.rotation.y = f * 0.32; }); }
}

/* ================= entrada ================= */
const ESQUELETOS = { cuadrupedo, primate, reptil, serpiente, rana, ave, insecto, alado, gusano };

export function crearAnimal(especie) {
  let h = 0; for (const ch of especie.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const m = new Modelo(h >>> 0);
  ESQUELETOS[especie.modelo.rig](m, especie.modelo);
  m.fijar();
  m.especie = especie;
  return m;
}

export const NOMBRES_ANIMACION = {
  quieto: 'Quieto', andar: 'Andar', correr: 'Correr', comer: 'Comer', atacar: 'Atacar', dormir: 'Dormir', morir: 'Morir',
  sentarse: 'Sentarse', flexiones: 'Flexiones', reptar: 'Reptar', enrollarse: 'Enrollarse', saltar: 'Saltar', croar: 'Croar',
  saltitos: 'Saltitos', volar: 'Volar', planear: 'Planear', empujar: 'Empujar la bola', arrastrarse: 'Arrastrarse',
};
