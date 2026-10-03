/* LOS ANIMALES. Cada especie se monta sobre un «esqueleto» según su tipo de cuerpo
   (cuadrúpedo, primate, reptil, serpiente, rana, ave, insecto, alado o gusano): piezas
   de cubos colgadas de articulaciones. Las animaciones mueven esas articulaciones
   a partir de la postura base, que se guarda al montar y se restaura cada fotograma.
   Todos miran hacia +x y tienen los pies en y = 0. */

import * as THREE from '../vendor/three.module.js';
import { azar } from '../escena-v3.js?v=202610032043';

const GRIS = new THREE.Color('#77736e');

class Modelo {
  constructor(semilla) {
    this.raiz = new THREE.Group();
    this.piv = {};
    this.mats = [];
    this.r = azar(semilla);
    this.anim = 'quieto';
    this.inicio = 0;
    this.anims = ['quieto'];
    this.mover = null; // función (m, nombre, t, k) por esqueleto
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
  // motas pequeñas pegadas a la superficie de una caja (manchas, puntos, rayas)
  motear(malla, color, n, tam, { abajo = false, alto = 0.25 } = {}) {
    const g = malla.geometry.parameters, mat = this.material(color);
    for (let i = 0; i < n; i++) {
      const cara = Math.floor(this.r() * (abajo ? 6 : 5));
      const s = tam * (0.6 + this.r() * 0.8), e = 0.004;
      const u = (this.r() - 0.5) * 0.92, v = (this.r() - 0.5) * 0.92;
      let x = 0, y = 0, z = 0, sx = s, sy = s, sz = s;
      if (cara === 0) { y = g.height / 2 + e; x = u * g.width; z = v * g.depth; sy = s * alto; }
      else if (cara === 1) { z = g.depth / 2 + e; x = u * g.width; y = v * g.height; sz = s * alto; }
      else if (cara === 2) { z = -g.depth / 2 - e; x = u * g.width; y = v * g.height; sz = s * alto; }
      else if (cara === 3) { x = g.width / 2 + e; z = u * g.depth; y = v * g.height; sx = s * alto; }
      else if (cara === 4) { x = -g.width / 2 - e; z = u * g.depth; y = v * g.height; sx = s * alto; }
      else { y = -g.height / 2 - e; x = u * g.width; z = v * g.depth; sy = s * alto; }
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.min(sx, g.width), Math.min(sy, g.height), Math.min(sz, g.depth)), mat);
      m.position.set(x, y, z);
      malla.add(m);
    }
  }
  ojos(padre, x, y, z, tam, separacion, color = '#141210') {
    const mat = this.material(color);
    for (const s of [-1, 1]) {
      const o = new THREE.Mesh(new THREE.BoxGeometry(tam, tam, tam * 0.5), mat);
      o.position.set(x, y, z + s * separacion);
      o.userData.ojo = true;
      padre.add(o);
    }
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
/* Cerrar los ojos (f de 0 a 1): se aplastan en vertical. */
function cerrarOjos(m, f) { m.raiz.traverse((o) => { if (o.userData.ojo) o.scale.y = Math.max(0.12, 1 - f); }); }
const suave = (x) => x * x * (3 - 2 * x);
const tramo = (k, a, b) => suave(Math.min(1, Math.max(0, (k - a) / (b - a))));

/* Caer muerto de lado: gira la raíz sobre su eje largo y la baja hasta el suelo. */
function caer(m, k, ancho, deLado = true) {
  const f = tramo(k, 0, 1.1);
  if (deLado) { m.raiz.rotation.x = f * PI / 2; m.raiz.position.y = f * ancho * 0.55; }
  else { m.raiz.rotation.x = f * PI; m.raiz.position.y = f * ancho; }
  return f;
}

/* ================= CUADRÚPEDO ================= */
function cuadrupedo(m, p) {
  const L = p.largo, H = p.alto, W = p.ancho;
  const patas = H * (p.patasRel ?? (p.felino ? 0.5 : p.cerdo ? 0.42 : 0.58));
  const cuerpoAlto = H * (p.cerdo ? 0.48 : 0.36);
  const yCuerpo = patas + cuerpoAlto * 0.4;
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, yCuerpo, 0);
  const torso = m.caja(cuerpo, 0, 0, 0, L * 0.62, cuerpoAlto, W, p.pelo);
  m.caja(cuerpo, 0.02 * L, -cuerpoAlto * 0.42, 0, L * 0.5, cuerpoAlto * 0.25, W * 0.86, p.barriga);
  m.caja(cuerpo, -L * 0.22, cuerpoAlto * (p.encorvado ? 0.2 : 0.06), 0, L * 0.2, cuerpoAlto * 1.08, W * 1.04, p.pelo); // ancas
  const tamM = p.manchas?.tam ?? 0.2;
  if (p.manchas) { m.motear(torso, p.manchas.color, p.manchas.n, W * tamM); if (p.manchas.borde) m.motear(torso, p.manchas.borde, Math.round(p.manchas.n * 0.6), W * tamM * 0.6); }
  if (p.lomo) m.caja(cuerpo, 0, cuerpoAlto / 2 + 0.003, 0, L * 0.55, 0.006, W * 0.4, p.lomo); // la raya oscura del lomo
  // las rayas negras de la nuca (de la frente a los hombros): la z de cada una
  const nucaZ = p.nuca ? Array.from({ length: p.nuca.n }, (_, i) => (i - (p.nuca.n - 1) / 2) * W * 0.4 / p.nuca.n) : [];
  const nucaG = W * 0.06 * (p.nuca?.grueso ?? 1);
  for (const z of nucaZ) m.caja(cuerpo, L * 0.2, cuerpoAlto / 2 + 0.004, z, L * 0.22, 0.008, nucaG, p.nuca.color);
  m.caja(cuerpo, L * 0.24, -cuerpoAlto * 0.05, 0, L * 0.16, cuerpoAlto * 1.0, W * 1.02, p.pelo); // pecho
  if (p.rayas) for (const z of [-1, 1]) m.caja(cuerpo, 0, -cuerpoAlto * 0.1, z * W * 0.51, L * 0.5, cuerpoAlto * 0.12, 0.01, p.rayas);
  if (p.franja) for (const z of [-1, 1]) m.caja(cuerpo, 0, -cuerpoAlto * 0.18, z * W * 0.51, L * 0.58, cuerpoAlto * 0.14, 0.01, p.franja);
  // cuello y cabeza
  const cuelloAlto = p.felino ? cuerpoAlto * 0.7 : p.cerdo ? cuerpoAlto * 0.5 : cuerpoAlto * 1.2;
  const inclin = p.felino ? -0.9 : p.cerdo ? -1.2 : -0.45;
  const cuello = m.pivote(cuerpo, 'cuello', L * 0.27, cuerpoAlto * 0.15, 0);
  cuello.rotation.z = inclin;
  m.caja(cuello, 0, cuelloAlto / 2, 0, W * 0.62, cuelloAlto, W * 0.6, p.pelo);
  for (const z of nucaZ) m.caja(cuello, -W * 0.31 - 0.004, cuelloAlto / 2, z, 0.008, cuelloAlto, nucaG, p.nuca.color);
  if (p.rayasGarganta) for (let i = 0; i < 3; i++) m.caja(cuello, W * 0.31 + 0.003, cuelloAlto * (0.2 + i * 0.3), 0, 0.006, cuelloAlto * 0.12, W * 0.45, p.rayasGarganta);
  const cabeza = m.pivote(cuello, 'cabeza', 0, cuelloAlto, 0);
  cabeza.rotation.z = -inclin;
  const kc = p.cabezaRel ?? 1;
  const cl = W * (p.cerdo ? 1.0 : 0.95) * kc, ch = W * (p.felino ? 0.78 : 0.72) * kc, cw = W * (p.felino ? 0.82 : 0.66) * kc;
  m.caja(cabeza, cl * 0.3, 0, 0, cl, ch, cw, p.pelo);
  const hoc = m.caja(cabeza, cl * 0.8 + p.hocico / 2, -ch * 0.18, 0, p.hocico, ch * (p.cerdo ? 0.62 : 0.5), cw * (p.cerdo ? 0.62 : 0.55), p.cerdo ? '#9a8a80' : p.barriga);
  m.caja(cabeza, cl * 0.8 + p.hocico + 0.006, -ch * 0.12, 0, 0.012, ch * 0.18, cw * 0.28, '#1c1814');
  m.ojos(cabeza, cl * 0.72, ch * 0.16, 0, Math.max(0.018, W * 0.09 * kc * (p.ojoGrande ? 1.4 : 1)), cw * 0.33, p.iris);
  for (const z of nucaZ) m.caja(cabeza, cl * 0.15, ch / 2 + 0.004, z * kc * 0.8, cl * 0.7, 0.008, nucaG * 0.8, p.nuca.color);
  if (p.caraBlanca) for (const z of [-1, 1]) m.caja(cabeza, cl * 0.8 + 0.003, ch * 0.36, z * cw * 0.3, 0.006, ch * 0.12, cw * 0.2, p.caraBlanca); // blanco sobre los ojos
  if (p.felino) for (const z of [-1, 1]) m.caja(cabeza, cl * 0.45, -ch * 0.12, z * cw * 0.48, cl * 0.5, ch * 0.5, cw * 0.12, p.barriga);
  if (p.barba) for (const z of [-1, 1]) m.caja(cabeza, cl * 0.75, -ch * 0.2, z * cw * 0.42, cl * 0.45, ch * 0.4, 0.04, p.barba);
  if (p.colmillos) for (const z of [-1, 1]) m.caja(cabeza, cl * 0.8 + p.hocico * 0.6, -ch * 0.1, z * cw * 0.33, 0.02, 0.07, 0.02, '#f2ead8', [0, 0, -0.5]);
  const oreja = (z) => {
    if (p.orejas === 'redondas') {
      const ko = p.orejaGrande ?? 1;
      m.caja(cabeza, cl * 0.05, ch * 0.55, z * cw * 0.32, cl * 0.16 * ko, ch * 0.32 * ko, cw * 0.22 * ko, p.orejaColor || p.pelo);
      if (p.orejaMancha) m.caja(cabeza, cl * 0.05 - cl * 0.08 * ko - 0.003, ch * 0.57, z * cw * 0.32, 0.006, ch * 0.14, cw * 0.1, p.orejaMancha);
    }
    else if (p.orejas === 'puntiagudas') m.caja(cabeza, cl * 0.02, ch * 0.55, z * cw * 0.4, cl * 0.18, ch * 0.45, cw * 0.14, p.pelo, [z * 0.4, 0, 0.3]);
    else m.caja(cabeza, -cl * 0.05, ch * 0.5, z * cw * 0.55, cl * 0.18, ch * 0.22, cw * 0.4, p.pelo, [z * 0.5, 0, 0]);
  };
  oreja(-1); oreja(1);
  if (p.cuernos === 'muntiaco') for (const z of [-1, 1]) {
    m.caja(cabeza, cl * 0.1, ch * 0.75, z * cw * 0.2, 0.025, ch * 0.6, 0.025, p.pelo);
    m.caja(cabeza, cl * 0.08, ch * 1.12, z * cw * 0.2, 0.02, ch * 0.4, 0.02, '#e8dcc4', [0, 0, 0.5]);
  }
  // cola
  const cola = m.pivote(cuerpo, 'cola', -L * 0.32, cuerpoAlto * 0.3, 0);
  if (p.cola === 'larga') {
    let padre = cola; const n = 4, seg = p.colaLargo / n;
    cola.rotation.z = -2.4;
    for (let i = 0; i < n; i++) {
      const g = m.pivote(padre, 'cola' + i, i ? seg : 0, 0, 0);
      g.rotation.z = i ? 0.18 : 0;
      const gc = W * (p.colaGruesa ?? 0.18) * (1 - i * 0.08);
      const pieza = m.caja(g, seg / 2, 0, 0, seg * 1.05, gc, gc, p.pelo);
      const anillo = p.anillos || p.manchas?.color;
      if (anillo && (p.anillos || i % 2)) m.caja(g, seg * 0.6, 0, 0, seg * 0.3, gc * 1.1, gc * 1.1, anillo);
      if (p.puntaCola && i === n - 1) m.caja(g, seg, 0, 0, seg * 0.3, gc * 1.1, gc * 1.1, p.puntaCola);
      void pieza; padre = g;
    }
  } else if (p.cola === 'peluda') {
    cola.rotation.z = 1.2;
    let padre = cola; const n = 4, seg = p.colaLargo / n;
    for (let i = 0; i < n; i++) {
      const g = m.pivote(padre, 'cola' + i, i ? seg : 0, 0, 0);
      g.rotation.z = i ? -0.45 : 0;
      m.caja(g, -seg / 2, 0, 0, seg * 1.1, W * 0.62, W * 0.55, p.pelo);
      padre = g;
    }
  } else if (p.cola === 'cerdo') {
    cola.rotation.z = -2.6;
    m.caja(cola, 0.04, 0, 0, 0.09, 0.025, 0.025, p.pelo);
  } else {
    cola.rotation.z = -2.2;
    m.caja(cola, 0.03, 0, 0, 0.07, W * 0.2, W * 0.18, p.barriga);
  }
  // patas: pivote en hombro/cadera, rodilla y pezuña o zarpa
  const grosor = W * (p.patasFinas ? 0.16 : p.cerdo ? 0.24 : 0.24) * (p.pataGruesa ?? 1);
  for (const [nombre, x, z] of [['delIzq', 0.26, 1], ['delDer', 0.26, -1], ['trasIzq', -0.25, 1], ['trasDer', -0.25, -1]]) {
    const hombro = m.pivote(cuerpo, nombre, L * x, -cuerpoAlto * 0.2, z * W * 0.32);
    const sup = patas * 0.55 + cuerpoAlto * 0.2;
    m.caja(hombro, 0, -sup / 2, 0, grosor * 1.25, sup, grosor * 1.2, x < 0 ? p.pelo : p.pelo);
    const rodilla = m.pivote(hombro, nombre + 'Rod', 0, -sup, 0);
    const inf = yCuerpo - cuerpoAlto * 0.2 - sup;
    m.caja(rodilla, 0, -inf / 2, 0, grosor, inf, grosor, p.patas);
    m.caja(rodilla, p.felino ? 0.015 : 0.005, -inf + 0.012, 0, grosor * (p.felino ? (p.zarpaGrande ? 1.8 : 1.5) : 1.15), 0.024 * (p.zarpaGrande ? 1.5 : 1), grosor * (p.zarpaGrande ? 1.5 : 1.2), p.felino ? p.patas : '#2a2420');
  }
  m.anims = ['quieto', 'andar', 'correr', 'comer', 'atacar', 'dormir', 'morir'];
  m.mover = moverCuadrupedo;
  m.datos = { L, H, W, patas, yCuerpo, cuerpoAlto, inclin };
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
    // primero se echa con las patas dobladas; luego rueda sobre el costado y las estira
    const baja = tramo(k, 0, 0.8), lado = tramo(k, 0.7, 1.8);
    P.cuerpo.position.y -= baja * (D.yCuerpo - D.cuerpoAlto * 0.5);
    const pata = (n, dobl, dRod, estir, eRod) => { P[n].rotation.z = dobl * baja * (1 - lado) + estir * lado; P[n + 'Rod'].rotation.z = dRod * baja * (1 - lado) + eRod * lado; };
    for (const n of ['delIzq', 'delDer']) pata(n, 1.45, -1.6, 0.45, -0.25);
    for (const n of ['trasIzq', 'trasDer']) pata(n, -1.3, 1.6, -0.5, 0.3);
    m.raiz.rotation.x = lado * PI / 2;
    m.raiz.position.y = lado * D.W * 0.52 * m.raiz.scale.y; // el mundo vivo escala cada individuo
    P.cuello.rotation.z -= baja * 0.5 + lado * 0.35; // la cabeza estirada, apoyada en el suelo
    P.cabeza.rotation.z -= baja * 0.2;
    for (let i = 0; i < 4; i++) if (P['cola' + i]) { P['cola' + i].rotation.y = 0; P['cola' + i].rotation.z += lado * (i ? 0.3 : 0.6); } // la cola, por el suelo hacia las patas
    P.cuerpo.scale.z = 1 + s(t * 1.3) * 0.035 * lado; // respira (de lado, el pecho sube en z)
    cerrarOjos(m, tramo(k, 0.6, 1.2));
  } else if (a === 'morir') {
    const f = caer(m, k, D.W);
    P.cuello.rotation.z -= f * 0.4;
    for (const n of ['delIzq', 'delDer', 'trasIzq', 'trasDer']) P[n].rotation.z = (n.startsWith('del') ? 1 : -1) * f * 0.35;
  }
}

/* ================= PRIMATE ================= */
function primate(m, p) {
  const H = p.alto;
  const piernas = H * 0.32, tronco = H * 0.42, brazo = H * 0.6; // el brazo llega al suelo
  const cadera = m.pivote(m.raiz, 'cadera', 0, piernas, 0);
  const torso = m.pivote(cadera, 'torso', 0, 0, 0);
  torso.rotation.z = -0.85; // anda a cuatro patas, apoyado en los nudillos
  const cuerpo = m.caja(torso, 0, tronco / 2, 0, H * 0.3, tronco, H * 0.34, p.pelo);
  m.motear(cuerpo, p.mechas || '#9a8a6e', 18, H * 0.08);
  m.caja(torso, H * 0.12, tronco * 0.45, 0, H * 0.08, tronco * 0.6, H * 0.24, p.piel);
  const cuello = m.pivote(torso, 'cuello', 0.02, tronco, 0);
  const cabeza = m.pivote(cuello, 'cabeza', 0, H * 0.06, 0);
  cabeza.rotation.z = 0.85;
  const ch = H * 0.2;
  m.caja(cabeza, 0, ch / 2, 0, ch * 0.95, ch, ch * 0.95, p.pelo);
  m.caja(cabeza, ch * 0.42, ch * 0.42, 0, ch * 0.2, ch * 0.62, ch * 0.7, p.cara);
  m.caja(cabeza, ch * 0.55, ch * 0.22, 0, ch * 0.18, ch * 0.28, ch * 0.42, p.piel);
  m.ojos(cabeza, ch * 0.53, ch * 0.55, 0, ch * 0.1, ch * 0.16);
  if (p.mejillas) for (const z of [-1, 1]) m.caja(cabeza, ch * 0.35, ch * 0.45, z * ch * 0.62, ch * 0.16, ch * 0.75, ch * 0.32, p.piel);
  for (const [n, z] of [['brazoIzq', 1], ['brazoDer', -1]]) {
    const hombro = m.pivote(torso, n, 0, tronco * 0.88, z * H * 0.2 * Math.min(1.2, p.brazos));
    hombro.rotation.z = 0.85;
    m.caja(hombro, 0, -brazo * 0.25, 0, H * 0.1, brazo * 0.5, H * 0.1, p.pelo);
    const codo = m.pivote(hombro, n + 'Codo', 0, -brazo * 0.5, 0);
    m.caja(codo, 0, -brazo * 0.25, 0, H * 0.09, brazo * 0.5, H * 0.09, p.pelo);
    m.caja(codo, 0.01, -brazo * 0.52, 0, H * 0.1, H * 0.05, H * 0.08, p.piel);
    if (p.mechas) for (const pz of [hombro, codo]) m.caja(pz, -H * 0.07, -brazo * 0.28, 0, H * 0.05, brazo * 0.42, H * 0.13, p.mechas); // pelo largo colgando
  }
  for (const [n, z] of [['piernaIzq', 1], ['piernaDer', -1]]) {
    const ingle = m.pivote(cadera, n, 0, 0, z * H * 0.12);
    ingle.rotation.z = 0.5;
    m.caja(ingle, 0, -piernas * 0.32, 0, H * 0.11, piernas * 0.64, H * 0.11, p.pelo);
    const rodilla = m.pivote(ingle, n + 'Rod', 0, -piernas * 0.64, 0);
    rodilla.rotation.z = -0.95;
    m.caja(rodilla, 0, -piernas * 0.3, 0, H * 0.1, piernas * 0.6, H * 0.1, p.pelo);
    m.caja(rodilla, 0.03, -piernas * 0.6, 0, H * 0.15, H * 0.04, H * 0.09, p.piel);
  }
  if (p.cola) {
    const cola = m.pivote(cadera, 'cola', -H * 0.12, 0, 0);
    cola.rotation.z = -2.2;
    m.caja(cola, H * 0.25, 0, 0, H * 0.5, H * 0.05, H * 0.05, p.pelo);
  }
  m.anims = ['quieto', 'andar', 'comer', 'sentarse', 'dormir', 'morir'];
  m.mover = moverPrimate;
  m.datos = { H, W: H * 0.34 };
}

function moverPrimate(m, a, t, k) {
  const P = m.piv;
  if (a === 'quieto') {
    P.torso.scale.y = 1 + s(t * 2) * 0.012;
    P.cabeza.rotation.y = s(t * 0.6) * 0.5;
  } else if (a === 'andar') {
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
  } else if (a === 'dormir') {
    const D = m.datos, baja = tramo(k, 0, 0.8), lado = tramo(k, 0.7, 1.7);
    P.cadera.position.y -= baja * D.H * 0.22;
    P.torso.rotation.z -= lado * 0.45;                       // la espalda curvada
    P.cabeza.rotation.z -= baja * 0.5;                       // la barbilla al pecho
    for (const n of ['piernaIzq', 'piernaDer']) { P[n].rotation.z += baja * 1.1; P[n + 'Rod'].rotation.z -= lado * 0.5; } // rodillas al pecho
    for (const n of ['brazoIzq', 'brazoDer']) { P[n].rotation.z -= baja * 0.9; P[n + 'Codo'].rotation.z = -lado * 1.7; } // brazos recogidos
    m.raiz.rotation.x = lado * PI / 2;
    m.raiz.position.y = lado * D.W * 0.6 * m.raiz.scale.y;
    P.torso.scale.z = 1 + s(t * 1.2) * 0.03 * lado;
    cerrarOjos(m, tramo(k, 0.5, 1.1));
  } else if (a === 'morir') {
    caer(m, k, m.datos.W);
  }
}

/* ================= REPTIL (lagartos y varanos) ================= */
function reptil(m, p) {
  const L = p.largo, W = p.ancho, H = W * 0.75;
  const alto = W * 0.55;
  const base = m.pivote(m.raiz, 'base', 0, alto + H * 0.1, 0);
  // columna: cabeza delante, cola detrás, cada trozo cuelga del anterior
  const nTorso = 3, nCola = 6;
  const lt = L * 0.42 / nTorso, lc = L * 0.45 / nCola;
  let padre = base;
  m.columna = [];
  for (let i = 0; i < nTorso; i++) {
    const g = m.pivote(padre, 't' + i, i ? -lt : 0, 0, 0);
    const pieza = m.caja(g, -lt / 2, 0, 0, lt * 1.06, H, W * (1 - i * 0.05), p.piel);
    m.caja(g, -lt / 2, -H * 0.42, 0, lt, H * 0.2, W * 0.9, p.vientre);
    m.motear(pieza, p.puntos, 7, W * 0.22);
    if (p.cresta) m.caja(g, -lt / 2, H * 0.6, 0, lt * 0.8, H * 0.35, W * 0.08, p.cresta);
    m.columna.push(g); padre = g;
  }
  for (let i = 0; i < nCola; i++) {
    const g = m.pivote(padre, 'c' + i, -(i ? lc : lt), 0, 0);
    const k = 1 - (i + 1) / (nCola + 1);
    const pieza = m.caja(g, -lc / 2, -H * 0.05 * i, 0, lc * 1.06, H * k, W * k * 0.8, p.piel);
    if (i % 2 === 0) m.motear(pieza, p.puntos, 3, W * 0.2 * k);
    m.columna.push(g); padre = g;
  }
  // cuello y cabeza
  const cuello = m.pivote(base, 'cuello', 0, 0, 0);
  const cl = L * (p.cabezaLarga ? 0.09 : 0.06);
  m.caja(cuello, cl / 2, H * 0.05, 0, cl, H * 0.8, W * 0.7, p.piel);
  const cabeza = m.pivote(cuello, 'cabeza', cl, H * 0.05, 0);
  const hl = L * (p.cabezaLarga ? 0.1 : 0.075);
  m.caja(cabeza, hl / 2, 0, 0, hl, H * 0.72, W * 0.72, p.piel);
  m.caja(cabeza, hl * 1.1, -H * 0.12, 0, hl * 0.4, H * 0.42, W * 0.5, p.piel);
  m.ojos(cabeza, hl * 0.6, H * 0.18, 0, Math.max(0.012, W * 0.12), W * 0.34, p.brillo ? '#1a1208' : '#d8a82a');
  const lengua = m.pivote(cabeza, 'lengua', hl * 1.3, -H * 0.15, 0);
  m.caja(lengua, hl * 0.25, 0, 0, hl * 0.5, 0.006, W * 0.12, '#c83a5a');
  lengua.scale.x = 0.01;
  if (p.cresta) m.caja(cabeza, hl * 0.2, H * 0.48, 0, hl * 0.7, H * 0.4, W * 0.08, p.cresta);
  // patas abiertas hacia los lados
  for (const [n, idx, z] of [['delIzq', 0, 1], ['delDer', 0, -1], ['trasIzq', 2, 1], ['trasDer', 2, -1]]) {
    const hombro = m.pivote(m.columna[idx], n, idx ? -lt * 0.7 : -lt * 0.2, -H * 0.2, z * W * 0.45);
    const brazo = W * 0.42;
    m.caja(hombro, 0, 0, z * brazo * 0.5, W * 0.18, W * 0.18, brazo, p.piel);
    const codo = m.pivote(hombro, n + 'Codo', 0, 0, z * brazo);
    m.caja(codo, 0, -alto * 0.5, 0, W * 0.16, alto * 1.1, W * 0.16, p.piel);
    m.caja(codo, 0.02, -alto * 1.05, 0, W * 0.32, 0.012, W * 0.24, p.vientre);
  }
  m.anims = ['quieto', 'andar', 'comer', 'atacar', 'flexiones', 'dormir', 'morir'];
  m.mover = moverReptil;
  m.datos = { L, W, alto };
}

function moverReptil(m, a, t, k) {
  const P = m.piv;
  const onda = (amp, f, desfase) => m.columna.forEach((g, i) => { g.rotation.y += s(t * f - i * desfase) * amp; });
  const lengua = (cada) => { const x = (t % cada) / cada; P.lengua.scale.x = x < 0.12 ? s(x / 0.12 * PI) + 0.01 : 0.01; };
  if (a === 'quieto') {
    onda(0.03, 1, 0.5);
    P.cabeza.rotation.y = s(t * 0.5) * 0.25;
    lengua(1.6);
  } else if (a === 'andar') {
    const f = 5;
    onda(0.18, f, 0.55);
    for (const [n, df] of [['delIzq', 0], ['trasDer', 0], ['delDer', PI], ['trasIzq', PI]]) {
      P[n].rotation.y = s(t * f + df) * 0.6;
      P[n].rotation.x = Math.max(0, c(t * f + df)) * 0.35 * (n.endsWith('Izq') ? -1 : 1);
    }
    lengua(0.9);
  } else if (a === 'dormir') {
    const f = tramo(k, 0, 1);
    P.base.position.y -= f * m.datos.alto * 0.9;
    for (const n of ['delIzq', 'delDer', 'trasIzq', 'trasDer']) { const z = n.endsWith('Izq') ? 1 : -1; P[n + 'Codo'].rotation.x = -z * f * 1.1; P[n].rotation.y = (n.startsWith('del') ? -0.5 : 0.6) * f; }
    m.columna.forEach((g, i) => { if (i > 2) g.rotation.y += f * 0.14; });
    P.cuello.rotation.z = -f * 0.12;
    cerrarOjos(m, f);
  } else if (a === 'comer') {
    const f = tramo(k, 0, 0.4);
    P.cuello.rotation.z = -f * 0.35;
    P.cabeza.rotation.z = -f * 0.3 + s(t * 7) * 0.12 * f;
  } else if (a === 'atacar') {
    const ciclo = k % 1.6;
    const l = tramo(ciclo, 0.2, 0.35) * (1 - tramo(ciclo, 0.6, 1.1));
    P.base.position.x += l * m.datos.L * 0.12;
    P.cuello.rotation.z = l * 0.35;
    P.cabeza.rotation.z = l * 0.25;
    onda(0.08, 3, 0.6);
  } else if (a === 'flexiones') {
    // los agámidos hacen «flexiones» para marcar territorio
    const x = Math.max(0, s(t * 4));
    P.base.position.y += x * m.datos.alto * 0.45;
    m.columna[0].rotation.z = x * 0.18;
    P.cabeza.rotation.z = -x * 0.1;
  } else if (a === 'morir') {
    caer(m, k, m.datos.alto * 1.4, false);
    for (const n of ['delIzq', 'delDer', 'trasIzq', 'trasDer']) P[n + 'Codo'].rotation.x = tramo(k, 0.8, 1.6) * 0.8 * (n.endsWith('Izq') ? 1 : -1);
  }
}

/* ================= SERPIENTE ================= */
function serpiente(m, p) {
  const n = 20, L = p.largo, G = p.grueso, seg = L / n;
  const base = m.pivote(m.raiz, 'base', 0, G * 0.5, 0);
  let padre = base;
  m.columna = [];
  for (let i = 0; i < n; i++) {
    const g = m.pivote(padre, 'v' + i, i ? -seg : 0, 0, 0);
    const k = i < n * 0.7 ? 1 : 1 - (i - n * 0.7) / (n * 0.3) * 0.8;
    m.caja(g, -seg / 2, 0, 0, seg * 1.08, G * k, G * k, (i % 3 === 0 && p.bandas) ? p.bandas : p.piel);
    m.caja(g, -seg / 2, -G * k * 0.42, 0, seg, G * k * 0.18, G * k * 0.85, p.vientre);
    if (p.rombos && i % 2) m.caja(g, -seg / 2, G * k * 0.5, 0, seg * 0.6, 0.006, G * k * 0.5, p.rombos);
    g.rotation.y = s(i * 0.55) * 0.22; // postura en S
    m.columna.push(g); padre = g;
  }
  const cabeza = m.pivote(base, 'cabeza', 0, 0, 0);
  const hl = G * 1.7;
  m.caja(cabeza, hl / 2, 0, 0, hl, G * 0.85, G * (p.cabezaAncha ? 1.45 : 1.1), p.piel);
  m.caja(cabeza, hl * 0.95, -G * 0.08, 0, hl * 0.3, G * 0.55, G * 0.8, p.piel);
  m.ojos(cabeza, hl * 0.7, G * 0.2, 0, G * 0.22, G * (p.cabezaAncha ? 0.62 : 0.48), p.cabezaAncha ? '#e8c43a' : '#1a1410');
  const lengua = m.pivote(cabeza, 'lengua', hl * 1.1, -G * 0.15, 0);
  m.caja(lengua, hl * 0.4, 0, 0, hl * 0.8, 0.006, G * 0.25, '#c8324a');
  lengua.scale.x = 0.01;
  m.anims = ['quieto', 'reptar', 'atacar', 'enrollarse', 'morir'];
  m.mover = moverSerpiente;
  m.datos = { L, G, n };
}

function moverSerpiente(m, a, t, k) {
  const P = m.piv;
  const lengua = (cada) => { const x = (t % cada) / cada; P.lengua.scale.x = x < 0.15 ? s(x / 0.15 * PI) + 0.01 : 0.01; };
  if (a === 'quieto') {
    m.columna.forEach((g, i) => { g.rotation.y += s(t * 0.8 - i * 0.4) * 0.03; });
    lengua(1.3);
  } else if (a === 'reptar') {
    // ondulación lateral (encargado por el humano a solitario): el camino es una onda quieta
    // respecto al suelo, z(s) = A·sen(k·s + ω·t), con s la distancia por detrás de la cabeza.
    // La cabeza va delante balanceándose de lado a lado y cada tramo toma la dirección del
    // camino en su sitio, o sea, pasa por donde pasó la cabeza.
    const { L, n } = m.datos, seg = L / n;
    const lambda = L * 0.55, kk = 2 * PI / lambda, A = L * 0.07, avance = L * 0.35 * t;
    // el camino en el suelo, Z(X) = A·sen(k·X), con la cabeza en X = avance; los puntos del
    // cuerpo, a distancias iguales por el camino (longitud de arco) hacia atrás
    const Z = (X) => A * Math.sin(kk * X);
    const pts = [[avance, Z(avance)]];
    let X = avance;
    for (let i = 0; i < n; i++) {
      let x0 = X; const z0 = Z(X), paso = seg / 24;
      while (Math.hypot(x0 - X, Z(x0) - z0) < seg) x0 -= paso;
      // (y afinado entre el último paso y el anterior, a la distancia justa del tramo)
      let lo = x0, hi = x0 + paso;
      for (let j = 0; j < 8; j++) { const mid = (lo + hi) / 2; if (Math.hypot(mid - X, Z(mid) - z0) < seg) hi = mid; else lo = mid; }
      X = (lo + hi) / 2; pts.push([X, Z(X)]);
    }
    // la base (la cabeza) se balancea de lado; cada tramo apunta del punto i al i+1
    // (rotation.y lleva −x hacia (−cos α, sen α))
    P.base.position.z = pts[0][1];
    let antes = 0;
    m.columna.forEach((g, i) => {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const al = Math.atan2(dz, -dx);
      g.rotation.y = al - antes; antes = al;
    });
    // la cabeza mira hacia delante por el camino
    P.cabeza.rotation.y = -Math.atan(A * kk * Math.cos(kk * avance));
    lengua(0.8);
  } else if (a === 'atacar') {
    const ciclo = k % 2;
    const sube = tramo(ciclo, 0, 0.5), golpe = tramo(ciclo, 0.8, 0.95) * (1 - tramo(ciclo, 1.1, 1.7));
    for (let i = 0; i < 6; i++) m.columna[i].rotation.z = (i < 3 ? 0.35 : -0.2) * sube * (1 - golpe);
    P.base.position.x = golpe * m.datos.L * 0.18;
    P.base.position.y += sube * m.datos.G * 2 * (1 - golpe);
    P.cabeza.rotation.z = -0.2 * sube + golpe * 0.2;
    lengua(0.5);
  } else if (a === 'enrollarse') {
    const f = tramo(k, 0, 1.5);
    m.columna.forEach((g, i) => { g.rotation.y = g.userData.br.y * (1 - f) + f * (0.62 - i * 0.012); g.position.y = g.userData.bp.y + f * m.datos.G * 0.06; });
    P.cabeza.rotation.y = f * -0.5;
    lengua(1.2);
  } else if (a === 'morir') {
    caer(m, k, m.datos.G, false);
  }
}

/* ================= RANA ================= */
function rana(m, p) {
  const L = p.largo, H = L * 0.5;
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, H * 0.45, 0);
  cuerpo.rotation.z = 0.35;
  const b = m.caja(cuerpo, 0, 0, 0, L * 0.6, H * 0.6, L * 0.5, p.piel);
  m.motear(b, p.puntos, 9, L * 0.12);
  m.caja(cuerpo, 0, -H * 0.27, 0, L * 0.55, H * 0.1, L * 0.45, p.vientre);
  const cabeza = m.pivote(cuerpo, 'cabeza', L * 0.3, H * 0.06, 0);
  m.caja(cabeza, L * 0.12, 0, 0, L * 0.28, H * 0.48, L * 0.48, p.piel);
  for (const z of [-1, 1]) {
    m.caja(cabeza, L * 0.12, H * 0.3, z * L * 0.17, L * 0.12, H * 0.2, L * 0.12, p.piel);
    m.caja(cabeza, L * 0.16, H * 0.33, z * L * 0.2, L * 0.06, H * 0.1, L * 0.04, '#141210');
    if (p.antifaz) m.caja(cabeza, L * 0.04, H * 0.12, z * L * 0.245, L * 0.2, H * 0.14, 0.004, p.antifaz);
  }
  const garganta = m.pivote(cabeza, 'garganta', L * 0.1, -H * 0.22, 0);
  m.caja(garganta, 0, 0, 0, L * 0.2, H * 0.12, L * 0.3, p.vientre);
  const lengua = m.pivote(cabeza, 'lengua', L * 0.26, -H * 0.05, 0);
  m.caja(lengua, L * 0.4, 0, 0, L * 0.8, 0.008, L * 0.06, '#e07a8a');
  lengua.scale.x = 0.01;
  for (const z of [-1, 1]) {
    const brazo = m.pivote(cuerpo, z > 0 ? 'brazoIzq' : 'brazoDer', L * 0.2, -H * 0.15, z * L * 0.2);
    brazo.rotation.z = -0.35;
    m.caja(brazo, 0, -H * 0.2, 0, L * 0.07, H * 0.4, L * 0.07, p.piel);
    const n = z > 0 ? 'musloIzq' : 'musloDer';
    const muslo = m.pivote(cuerpo, n, -L * 0.25, -H * 0.1, z * L * 0.24);
    muslo.rotation.z = 2.6 - 0.35;
    m.caja(muslo, 0, -L * 0.17, 0, L * 0.12, L * 0.34, L * 0.12, p.piel);
    const rod = m.pivote(muslo, n + 'Rod', 0, -L * 0.34, 0);
    rod.rotation.z = -2.6;
    m.caja(rod, 0, -L * 0.16, 0, L * 0.09, L * 0.32, L * 0.09, p.piel);
    const tob = m.pivote(rod, n + 'Pie', 0, -L * 0.32, 0);
    tob.rotation.z = 2.2;
    m.caja(tob, 0, -L * 0.1, 0, L * 0.06, L * 0.2, L * 0.12, p.piel);
  }
  m.anims = ['quieto', 'saltar', 'comer', 'croar', 'dormir', 'morir'];
  m.mover = moverRana;
  m.datos = { L, H, W: L * 0.5 };
}

function moverRana(m, a, t, k) {
  const P = m.piv;
  if (a === 'quieto') {
    P.garganta.scale.y = 1 + Math.max(0, s(t * 6)) * 0.6;
  } else if (a === 'saltar') {
    const ciclo = k % 1.4;
    const e = tramo(ciclo, 0.15, 0.3) * (1 - tramo(ciclo, 0.55, 0.8));
    const vuelo = Math.min(1, Math.max(0, (ciclo - 0.2) / 0.5));
    m.raiz.position.x = (vuelo) * m.datos.L * 2.2 - m.datos.L * 1.1;
    m.raiz.position.y = s(vuelo * PI) * m.datos.L * 0.9;
    for (const n of ['musloIzq', 'musloDer']) { P[n].rotation.z -= e * 1.9; P[n + 'Rod'].rotation.z += e * 2.3; P[n + 'Pie'].rotation.z -= e * 1.6; }
    P.cuerpo.rotation.z -= e * 0.25;
  } else if (a === 'comer') {
    const x = (k % 1.5) / 1.5;
    P.lengua.scale.x = x < 0.2 ? s(x / 0.2 * PI) + 0.01 : 0.01;
    P.cabeza.rotation.z = x < 0.2 ? 0.15 : 0;
  } else if (a === 'dormir') {
    const f = tramo(k, 0, 0.8);
    P.cuerpo.rotation.z -= f * 0.25;
    P.cuerpo.position.y -= f * m.datos.H * 0.12;
    P.garganta.scale.y = 1 + Math.max(0, s(t * 1.5)) * 0.2;
    cerrarOjos(m, f);
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
  const L = p.largo, B = L * 0.32;
  const patas = p.buho ? L * 0.2 : p.gallo ? L * 0.38 : L * 0.22;
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, patas + B * 0.45, 0);
  cuerpo.rotation.z = p.buho ? 1.1 : p.gallo ? 0.15 : 0.45;
  const torso = m.caja(cuerpo, 0, 0, 0, L * 0.48, B, B * 0.95, p.plumas);
  m.caja(cuerpo, L * 0.08, -B * 0.22, 0, L * 0.34, B * 0.6, B * 0.9, p.pecho);
  if (p.puntos) m.motear(torso, p.puntos, p.buho ? 16 : 10, B * 0.16);
  // cabeza
  const cuello = m.pivote(cuerpo, 'cuello', L * 0.22, B * 0.25, 0);
  cuello.rotation.z = -cuerpo.rotation.z;
  const cabeza = m.pivote(cuello, 'cabeza', p.buho ? -0.02 : 0.02, p.buho ? B * 0.15 : B * 0.35, 0);
  const ch = B * (p.buho ? 1.15 : 0.72);
  m.caja(cabeza, 0, 0, 0, ch, ch, ch * (p.buho ? 1.15 : 0.9), p.plumas);
  if (p.buho) {
    m.caja(cabeza, ch * 0.5, 0, 0, 0.01, ch * 0.75, ch * 0.95, p.cara);
    m.ojos(cabeza, ch * 0.52, ch * 0.08, 0, ch * 0.22, ch * 0.22, '#141210');
  } else {
    m.caja(cabeza, ch * 0.3, 0, 0, ch * 0.4, ch * 0.5, ch * 0.92, p.cara);
    m.ojos(cabeza, ch * 0.4, ch * 0.12, 0, Math.max(0.012, ch * 0.16), ch * 0.4);
  }
  const pl = p.calao ? ch * 1.6 : p.rapaz ? ch * 0.5 : p.horquilla ? ch * 0.25 : ch * 0.45;
  const pico = m.caja(cabeza, ch * 0.5 + pl / 2, -ch * (p.rapaz ? 0.1 : 0.05), 0, pl, ch * (p.calao ? 0.42 : 0.3), ch * 0.28, p.pico);
  if (p.rapaz) m.caja(pico, pl * 0.4, -ch * 0.12, 0, pl * 0.25, ch * 0.2, ch * 0.24, p.pico);
  if (p.calao) m.caja(cabeza, ch * 0.75, ch * 0.32, 0, ch * 0.9, ch * 0.25, ch * 0.3, p.pico);
  if (p.cresta) for (let i = 0; i < 4; i++) m.caja(cabeza, -ch * 0.35 - i * 0.012, ch * 0.4 + i * 0.01, (i - 1.5) * ch * 0.18, ch * 0.3, ch * 0.12, ch * 0.12, p.plumas, [0, 0, 0.6]);
  if (p.calao) for (let i = 0; i < 5; i++) m.caja(cabeza, -ch * 0.3, ch * 0.4 + i * ch * 0.08, (i - 2) * ch * 0.12, ch * 0.5, ch * 0.08, ch * 0.08, p.plumas, [0, 0, 0.9]);
  if (p.gallo) { m.caja(cabeza, ch * 0.05, ch * 0.62, 0, ch * 0.7, ch * 0.32, ch * 0.08, '#d83a2a'); m.caja(cabeza, ch * 0.42, -ch * 0.45, 0, ch * 0.18, ch * 0.32, ch * 0.08, '#d83a2a'); }
  // cola
  const cola = m.pivote(cuerpo, 'cola', -L * 0.24, B * 0.05, 0);
  if (p.horquilla) for (const z of [-1, 1]) m.caja(cola, -L * 0.22, 0, z * B * 0.18, L * 0.44, 0.012, B * 0.12, p.plumas, [0, z * 0.2, 0]);
  else if (p.gallo) for (let i = 0; i < 5; i++) m.caja(cola, -L * 0.1, L * 0.12 - i * 0.012, 0, L * 0.38, 0.014, B * 0.28, i % 2 ? '#1a3a2a' : '#2a2a2a', [0, 0, 0.9 - i * 0.25]);
  else m.caja(cola, -L * (p.colaLarga ? 0.24 : 0.14), 0, 0, L * (p.colaLarga ? 0.5 : 0.3), B * 0.1, B * 0.75, p.calao ? '#e8e2d6' : p.plumas);
  // alas: plegadas a lo largo del cuerpo; al volar se abren hacia los lados
  const env = L * p.alas * 0.5;
  for (const [n, z] of [['alaIzq', 1], ['alaDer', -1]]) {
    const hombro = m.pivote(cuerpo, n, L * 0.12, B * 0.32, z * B * 0.45);
    const brazo = m.pivote(hombro, n + 'B', 0, 0, 0);
    m.caja(brazo, -env * 0.08, 0, z * env * 0.25, env * 0.42, 0.02, env * 0.5, p.plumas);
    const mano = m.pivote(brazo, n + 'Mano', 0, 0, z * env * 0.5);
    m.caja(mano, -env * 0.12, 0, z * env * 0.25, env * 0.32, 0.016, env * 0.5, p.plumas);
    if (p.puntos && !p.buho) m.caja(mano, -env * 0.12, 0.006, z * env * 0.36, env * 0.16, 0.012, env * 0.2, p.puntos);
    for (let i = 0; i < 3; i++) m.caja(mano, -env * (0.22 + i * 0.05), -0.003, z * env * (0.38 + i * 0.05), env * 0.2, 0.012, env * 0.06, p.calao ? '#e8e2d6' : p.plumas);
    hombro.userData.z = z;
  }
  for (const [n, z] of [['patIzq', 1], ['patDer', -1]]) {
    const cad = m.pivote(m.raiz, n, 0, patas, z * B * 0.2);
    m.caja(cad, 0, -patas / 2, 0, B * 0.1, patas, B * 0.1, p.patas);
    m.caja(cad, B * 0.12, -patas + 0.006, 0, B * 0.36, 0.012, B * 0.14, p.patas);
  }
  m.anims = ['quieto', 'saltitos', 'comer', 'volar', 'planear', 'dormir', 'morir'];
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
  if (a === 'quieto') {
    P.cabeza.rotation.y = Math.round(s(t * 0.7) * 2) * 0.35;
    P.cola.rotation.z = s(t * 3) * 0.05;
  } else if (a === 'saltitos') {
    const x = Math.abs(s(t * 6));
    m.raiz.position.y = x * D.L * 0.15;
    m.raiz.position.x = ((t * 0.4) % 1) * D.L * 0.6 - D.L * 0.3;
    P.cabeza.rotation.z = s(t * 6) * 0.1;
  } else if (a === 'dormir') {
    const f = tramo(k, 0, 1);
    P.cuerpo.scale.set(1 + f * 0.06, 1 + f * 0.12, 1 + f * 0.12); // ahuecada
    if (D.buho) { P.cabeza.rotation.z = -f * 0.25; }
    else {
      P.cuerpo.position.y -= f * D.patas * 0.8;
      for (const n of ['patIzq', 'patDer']) P[n].scale.y = 1 - f * 0.75;   // las patas, recogidas bajo el cuerpo
      P.cuerpo.rotation.z = P.cuerpo.userData.br.z * (1 - f * 0.7);
      P.cuello.rotation.z = -P.cuerpo.rotation.z;
      P.cuello.rotation.y = f * 2.7;                                        // la cabeza girada hacia atrás
      P.cabeza.rotation.z = -f * 0.35;                                      // y metida en el lomo
    }
    cerrarOjos(m, f);
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
      const x = s(t * (D.L < 0.2 ? 18 : 7));
      for (const n of ['alaIzq', 'alaDer']) {
        const z = P[n].userData.z;
        P[n + 'B'].rotation.x = -z * x * 0.85 * sube;
        P[n + 'Mano'].rotation.x = -z * s(t * (D.L < 0.2 ? 18 : 7) - 0.8) * 0.5 * sube;
      }
    } else {
      m.raiz.rotation.x = s(t * 0.5) * 0.18 * sube;
      for (const n of ['alaIzq', 'alaDer']) P[n + 'B'].rotation.x = -P[n].userData.z * 0.08 * sube;
    }
  } else if (a === 'morir') {
    caer(m, k, D.B, true);
    plegarAlas(m, 1 - tramo(k, 0.3, 1.0) * 0.6);
  }
}

/* ================= INSECTO ================= */
function insecto(m, p) {
  const L = p.largo, tipo = p.tipo;
  const w = tipo === 'palo' ? L * 0.05 : tipo === 'termita' ? L * 0.28 : tipo === 'mantis' ? L * 0.12 : L * 0.42;
  const h = tipo === 'palo' ? L * 0.05 : w * 0.55;
  const patasLargo = tipo === 'palo' ? L * 0.45 : tipo === 'mantis' ? L * 0.4 : p.patasLargas ? L * 0.55 : L * 0.38;
  const alto = patasLargo * 0.42;
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, alto + h * 0.4, 0);
  // abdomen, tórax, cabeza
  const abdL = tipo === 'palo' ? L * 0.55 : tipo === 'mantis' ? L * 0.45 : L * 0.5;
  const abd = m.pivote(cuerpo, 'abdomen', -L * 0.08, 0, 0);
  if (tipo === 'mantis') {
    // abdomen ancho como una hoja seca
    m.caja(abd, -abdL / 2, 0, 0, abdL, h, w * 2.4, p.color);
    m.caja(abd, -abdL / 2, h * 0.5, 0, abdL * 0.9, 0.004, w * 0.3, p.oscuro);
  } else if (tipo === 'termita') {
    m.caja(abd, -abdL / 2, 0, 0, abdL, h * 1.1, w * 1.1, p.color);
  } else m.caja(abd, -abdL / 2, 0, 0, abdL, h, w, p.color);
  const toraxL = tipo === 'palo' ? L * 0.3 : tipo === 'mantis' ? L * 0.32 : L * 0.2;
  const torax = m.pivote(cuerpo, 'torax', 0, 0, 0);
  if (tipo === 'mantis') torax.rotation.z = 0.9;
  m.caja(torax, toraxL / 2, 0, 0, toraxL, h * (tipo === 'escarabajo' ? 1.1 : 0.8), w * (tipo === 'escarabajo' ? 0.9 : 0.75), tipo === 'termita' ? p.color : p.color);
  const cabeza = m.pivote(torax, 'cabeza', toraxL, 0, 0);
  if (tipo === 'mantis') cabeza.rotation.z = -0.9;
  const ch = tipo === 'termita' ? w * 1.2 : tipo === 'cigarra' ? w * 0.75 : w * 0.6;
  m.caja(cabeza, ch * 0.4, 0, 0, ch * 0.8, ch * 0.7, tipo === 'cigarra' || tipo === 'mantis' ? ch * 1.5 : ch, tipo === 'termita' ? p.claro : p.color);
  m.ojos(cabeza, ch * 0.5, ch * 0.15, 0, Math.max(0.006, ch * 0.3), tipo === 'cigarra' || tipo === 'mantis' ? ch * 0.7 : ch * 0.42, tipo === 'escarabajo' ? '#e8d24a' : '#2a1a10');
  if (tipo === 'fulgorido') { // el «hocico» largo de la mosca linterna
    m.caja(cabeza, ch * 0.9 + L * 0.2, ch * 0.25, 0, L * 0.42, ch * 0.3, ch * 0.3, p.oscuro, [0, 0, 0.35]);
  }
  if (p.cuernos) {
    m.caja(cabeza, ch * 0.8 + L * 0.12, ch * 0.3, 0, L * 0.3, w * 0.12, w * 0.12, p.color, [0, 0, 0.5]);
    for (const z of [-1, 1]) m.caja(torax, toraxL * 0.6, h * 0.6, z * w * 0.3, L * 0.32, w * 0.1, w * 0.1, p.color, [0, 0, 0.35]);
  }
  if (p.mandibulas) for (const z of [-1, 1]) m.caja(cabeza, ch * 0.95, -ch * 0.1, z * ch * 0.2, ch * 0.45, ch * 0.12, ch * 0.12, '#f0e6c8', [0, z * 0.4, 0]);
  // antenas
  for (const z of [-1, 1]) {
    const ant = m.pivote(cabeza, z > 0 ? 'antIzq' : 'antDer', ch * 0.7, ch * 0.3, z * ch * 0.25);
    const al = tipo === 'palo' ? L * 0.45 : tipo === 'escarabajo' ? L * 0.25 : L * 0.3;
    ant.rotation.set(z * 0.5, 0, 0.6);
    m.caja(ant, al / 2, 0, 0, al, 0.004, 0.004, tipo === 'termita' ? p.claro : '#1a1410');
  }
  // élitros o alas que cubren el abdomen
  if (tipo === 'escarabajo') {
    for (const [n, z] of [['elitroIzq', 1], ['elitroDer', -1]]) {
      const e = m.pivote(cuerpo, n, -L * 0.04, h * 0.5, z * 0.002);
      const el = m.caja(e, -abdL * 0.5, 0, z * w * 0.25, abdL * 1.02, h * 0.3, w * 0.52, p.color);
      if (p.brillo) m.caja(el, 0, h * 0.16, 0, abdL * 0.9, 0.004, w * 0.3, p.brillo);
      if (p.puntos) m.motear(el, p.puntos, 3, w * 0.18);
      e.userData.z = z;
    }
    if (p.bola) { const b = m.pivote(m.raiz, 'bola', -L * 0.8, L * 0.35, 0); m.caja(b, 0, 0, 0, L * 0.7, L * 0.7, L * 0.7, p.bola); }
  }
  if (p.alas || tipo === 'mantis') {
    for (const [n, z] of [['alaIzq', 1], ['alaDer', -1]]) {
      const e = m.pivote(cuerpo, n, 0, h * 0.5, 0);
      const largo = tipo === 'mantis' ? abdL * 0.8 : L * 0.85;
      const col = tipo === 'cigarra' ? '#d8e4d0' : tipo === 'mantis' ? p.claro : p.claro;
      const ala = m.caja(e, -largo * 0.45, 0, z * w * 0.32, largo, 0.006, w * (tipo === 'cigarra' ? 1.0 : 0.9), col, [z * 0.35, 0, 0]);
      if (tipo === 'fulgorido') { m.motear(ala, p.color, 6, w * 0.3); m.caja(ala, -largo * 0.25, 0.004, 0, largo * 0.4, 0.004, w * 0.7, p.oscuro); }
      if (tipo === 'cigarra') m.caja(ala, 0, 0.004, 0, largo * 0.95, 0.004, w * 0.08, p.color);
      e.userData.z = z;
    }
  }
  // seis patas
  m.patas = [];
  const filas = tipo === 'mantis' ? [[-0.02, 1], [-0.12, 2]] : [[toraxL * 0.75 / L, 0], [toraxL * 0.4 / L, 1], [toraxL * 0.05 / L, 2]];
  for (const [fx, idx] of filas) for (const z of [-1, 1]) {
    const padre = tipo === 'mantis' ? cuerpo : torax;
    const cad = m.pivote(padre, `pata${idx}${z}`, fx * L, -h * 0.3, z * w * 0.4);
    const pl = patasLargo * (idx === 2 ? 1.15 : 1);
    cad.rotation.y = z * (idx - 1) * 0.6;
    m.caja(cad, 0, pl * 0.12, z * pl * 0.22, 0.006 + L * 0.015, 0.006 + L * 0.015, pl * 0.45, tipo === 'termita' ? p.claro : p.color);
    const rod = m.pivote(cad, `rod${idx}${z}`, 0, pl * 0.2, z * pl * 0.42);
    m.caja(rod, 0, -alto * 0.6, 0, 0.005 + L * 0.012, alto * 1.25, 0.005 + L * 0.012, tipo === 'termita' ? p.claro : p.color);
    m.patas.push({ cad, idx, z });
  }
  if (tipo === 'mantis') {
    // patas delanteras de garra, recogidas delante de la cara
    for (const z of [-1, 1]) {
      const h1 = m.pivote(torax, z > 0 ? 'garraIzq' : 'garraDer', toraxL * 0.8, -h * 0.2, z * w * 0.6);
      h1.rotation.z = -1.6;
      m.caja(h1, L * 0.11, 0, 0, L * 0.22, w * 0.35, w * 0.3, p.claro);
      const h2 = m.pivote(h1, (z > 0 ? 'garraIzq' : 'garraDer') + 'B', L * 0.22, 0, 0);
      h2.rotation.z = 2.6;
      m.caja(h2, L * 0.1, 0, 0, L * 0.2, w * 0.25, w * 0.25, p.claro);
    }
  }
  m.anims = ['quieto', 'andar', 'comer', 'dormir'];
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
      const grupo = (idx % 2 === 0) === (z > 0) ? 0 : PI; // trípode alterno
      cad.rotation.y += s(t * f * sentido + grupo) * 0.4;
      cad.rotation.x = Math.max(0, c(t * f * sentido + grupo)) * 0.25 * -z;
    }
  };
  if (a === 'quieto') antenas(2);
  else if (a === 'andar') { caminar(D.tipo === 'palo' ? 4 : 12); antenas(5); if (D.tipo === 'palo') P.cuerpo.position.x = s(t * 2) * D.L * 0.03; }
  else if (a === 'comer') { P.cabeza.rotation.z += -0.2 + s(t * 10) * 0.12; antenas(6); }
  else if (a === 'dormir') { P.cuerpo.position.y -= tramo(k, 0, 0.6) * D.alto * 0.4; }
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
  } else if (a === 'empujar') {
    caminar(10, -1);
    P.bola.rotation.z = t * 3;
  } else if (a === 'morir') {
    caer(m, k, D.alto + D.h, false);
    for (const { cad, z } of m.patas) cad.rotation.x = -z * (0.4 + s(t * 25) * 0.15 * (1 - tramo(k, 1, 2.5)));
  }
}

/* ================= ALADO (mariposas y libélulas) ================= */
function alado(m, p) {
  const L = p.largo, E = p.envergadura || L * 1.1;
  const libelula = p.tipo === 'libelula';
  const cuerpo = m.pivote(m.raiz, 'cuerpo', 0, L * 0.25, 0);
  const g = libelula ? L * 0.07 : L * 0.12;
  m.caja(cuerpo, -L * 0.3, 0, 0, L * (libelula ? 0.85 : 0.55), g, g, p.color);
  m.caja(cuerpo, L * 0.08, 0, 0, L * 0.2, g * 1.4, g * 1.4, p.cuello || p.color);
  m.caja(cuerpo, L * 0.22, 0, 0, g * 1.3, g * 1.4, g * (libelula ? 2.2 : 1.6), p.color);
  m.ojos(cuerpo, L * 0.26, g * 0.3, 0, g * (libelula ? 0.9 : 0.5), g * (libelula ? 0.75 : 0.55), libelula ? '#8a2a1a' : '#1a1a1a');
  if (!libelula) for (const z of [-1, 1]) m.caja(cuerpo, L * 0.4, g * 1.4, z * g * 0.5, L * 0.35, 0.004, 0.004, '#121212', [0, -z * 0.3, 0.6]);
  for (const [n, z] of [['alaIzq', 1], ['alaDer', -1]]) {
    const raiz = m.pivote(cuerpo, n, 0, g * 0.5, z * g * 0.4);
    for (const [dx, largo, ancho, col] of libelula
      ? [[L * 0.04, E * 0.5, L * 0.13, p.ala], [-L * 0.12, E * 0.46, L * 0.15, p.ala]]
      : [[L * 0.1, E * 0.5, E * 0.36, p.ala], [-L * 0.16, E * 0.4, E * 0.3, p.ala]]) {
      const a = m.caja(raiz, dx, 0, z * largo / 2, ancho, 0.004, largo, col, [0, libelula ? 0 : z * 0.25, 0]);
      if (p.alaPunta && !p.manchado) {
        if (libelula) m.caja(a, ancho * 0.1, 0.003, -z * largo * 0.35, ancho * 0.8, 0.003, largo * 0.25, p.alaPunta);
        else for (let i = 0; i < 6; i++) m.caja(a, (i % 2 ? 0.25 : -0.05) * ancho, 0.003, z * (largo * 0.1 + i * largo * 0.06), ancho * 0.22, 0.003, largo * 0.08, p.alaPunta);
      }
      if (p.manchado) m.motear(a, p.alaPunta, 10, ancho * 0.18, { alto: 0.08 });
    }
    raiz.userData.z = z;
  }
  m.anims = ['quieto', 'volar', 'dormir', 'morir'];
  m.mover = moverAlado;
  m.datos = { L, E, libelula };
}

function moverAlado(m, a, t, k) {
  const P = m.piv, D = m.datos;
  if (a === 'quieto') {
    for (const n of ['alaIzq', 'alaDer']) {
      const z = P[n].userData.z;
      P[n].rotation.x = D.libelula ? s(t * 30) * 0.03 : -z * (0.9 + s(t * 1.2) * 0.55);
    }
  } else if (a === 'dormir') {
    if (!D.libelula) for (const n of ['alaIzq', 'alaDer']) P[n].rotation.x = -P[n].userData.z * 1.5; // alas juntas hacia arriba
  } else if (a === 'volar') {
    const f = D.libelula ? 45 : 11;
    m.raiz.position.y = D.L * 2 + s(t * 2.3) * D.L * 0.6 + (D.libelula ? 0 : Math.abs(s(t * f)) * D.L * 0.25);
    m.raiz.position.x = s(t * 0.7) * D.L * (D.libelula ? 0.2 : 1.5);
    for (const n of ['alaIzq', 'alaDer']) P[n].rotation.x = -P[n].userData.z * s(t * f) * (D.libelula ? 0.5 : 1.2);
  } else if (a === 'morir') {
    caer(m, k, D.L * 0.1, true);
    for (const n of ['alaIzq', 'alaDer']) P[n].rotation.x = -P[n].userData.z * 0.2;
  }
}

/* ================= GUSANO (orugas y lombrices) ================= */
function gusano(m, p) {
  const n = p.segmentos, L = p.largo, seg = L / n, G = p.tipo === 'oruga' ? L * 0.16 : L * 0.07;
  const base = m.pivote(m.raiz, 'base', 0, G / 2, 0);
  let padre = base;
  m.columna = [];
  for (let i = 0; i < n; i++) {
    const g = m.pivote(padre, 'g' + i, i ? -seg : 0, 0, 0);
    const k = p.tipo === 'lombriz' ? 1 - Math.abs(i - n * 0.35) / n * 0.6 : 1;
    const col = p.tipo === 'lombriz' && (i === 3 || i === 4) ? '#d8907a' : p.color;
    const pieza = m.caja(g, -seg / 2, 0, 0, seg * 1.04, G * k, G * k, col);
    if (p.tipo === 'oruga') {
      for (const z of [-1, 1]) m.caja(pieza, 0, G * 0.32, z * G * 0.32, seg * 0.35, G * 0.3, G * 0.12, p.puntos);
      if (i > 1 && i < n - 1) for (const z of [-1, 1]) m.caja(pieza, 0, -G * 0.55, z * G * 0.3, seg * 0.3, G * 0.16, G * 0.12, p.color);
    } else m.motear(pieza, p.puntos, 1, G * 0.4, { alto: 0.1 });
    m.columna.push(g); padre = g;
  }
  m.ojos(base, 0, G * 0.12, 0, G * 0.16, G * 0.25);
  m.anims = ['quieto', 'arrastrarse', 'comer', 'dormir', 'morir'];
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
  else if (a === 'morir') {
    const f = tramo(k, 0, 1.5);
    m.columna.forEach((g, i) => { if (i) g.rotation.y = f * 0.32; });
  }
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
