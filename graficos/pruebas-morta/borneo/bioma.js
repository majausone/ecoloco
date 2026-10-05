/* BIOMA DE EJEMPLO: un trozo de selva de Maliau con un río, sus árboles, palmas, plantas
   del sotobosque, plantas jarra, una rafflesia, setas y los animales del editor moviéndose
   solos. A pantalla completa, sin rótulos (H enseña la ayuda). No es la simulación: los
   bichos pasean, comen y descansan al azar; sirve para ver cómo queda todo junto. */

import * as THREE from '../vendor/three.module.js';
import { azar, Saco, terreno, particulas } from '../escena-v3.js?v=202610052309';
import { ANIMALES, PLANTAS, SETAS } from './especies.js?v=202610052309';
import { crearAnimal } from './animales.js?v=202610052309';
import { SacoP, construir } from './plantas.js?v=202610052309';
import { Visor, pantallaCompleta } from './visor.js?v=202610052309';
import { CamaraUnity } from './camara.js?v=202610052309';

const $ = (id) => document.getElementById(id);
const lienzo = $('lienzo');
const visor = new Visor(lienzo, { sombras: 4096 });
const escena = new THREE.Scene();
const r = azar(2026);
const tiempo = { value: 0 }, viento = { value: 0.8 };
const busca = (lista, id) => lista.find((e) => e.id === id);

/* ---- el terreno (el de la v3, con paleta de selva) ---- */
const cfg = {
  semilla: 31, relieve: 3,
  rio: { x: 0.6, ancho: 1.7, curva: 3.5, fase: 0.8 },
  paleta: {
    tierra: ['#3a2a20', '#55392a', '#6a4632'], roca: ['#3e3b40', '#5c5860', '#827c80'],
    hierba: ['#1f4422', '#2c5a28', '#3e7030', '#5a8a38'], suelo: ['#5a3e24', '#7a5a30', '#4a6a2a'],
    agua: ['#173e44', '#235a5e', '#337a78'], arena: ['#8a7450', '#a08858', '#b8a070'],
  },
};
const sacoT = new Saco();
const T = terreno(cfg, sacoT, r);
for (const m of sacoT.mallas(tiempo, viento)) escena.add(m);
const ANCHO = 46, FONDO = 34;
const dentro = (x, z, borde = 1) => Math.abs(x) < ANCHO / 2 - borde && Math.abs(z) < FONDO / 2 - borde;
const enAgua = (x, z) => T.cima(x, z).agua || T.cima(x + 0.6, z).agua || T.cima(x - 0.6, z).agua || T.cima(x, z + 0.6).agua || T.cima(x, z - 0.6).agua;

/* ---- la vegetación, toda en un saco ---- */
const S = new SacoP();
const ocupado = [];
function sitio(radio, { cercaAgua = false, zona = null, intentos = 200 } = {}) {
  for (let i = 0; i < intentos; i++) {
    const x = zona ? zona[0] + (r() - 0.5) * zona[2] : (r() - 0.5) * (ANCHO - 4);
    const z = zona ? zona[1] + (r() - 0.5) * zona[2] : (r() - 0.5) * (FONDO - 4);
    if (!dentro(x, z, 1.5) || enAgua(x, z)) continue;
    if (cercaAgua && !(enAgua(x + 2.2, z) || enAgua(x - 2.2, z))) continue;
    if (ocupado.some(([ox, oz, or]) => Math.hypot(ox - x, oz - z) < or + radio)) continue;
    ocupado.push([x, z, radio]);
    return [x, T.cima(x, z).y, z];
  }
  return null;
}
function plantar(id, n, radio, op = {}) {
  const e = busca(PLANTAS, id) || busca(SETAS, id);
  const puestos = [];
  for (let i = 0; i < n; i++) { const p = sitio(radio, op); if (p) { construir(e, S, r, ...p); puestos.push(p); } }
  return puestos;
}
// los grandes primero: emergentes en el fondo y los lados, para enmarcar
const dipterocarpos = plantar('dipterocarpo', 5, 3.2);
plantar('agathis', 2, 2.4);
plantar('higuera', 2, 3);
plantar('roble', 4, 2.2);
plantar('dillenia', 2, 2);
plantar('palma-cola-pez', 3, 2.2);
plantar('pinanga', 8, 1);
plantar('cuerno-alce', 2, 1);
plantar('rhaphidophora', 2, 0.8);
plantar('jengibre-antorcha', 7, 1, { cercaAgua: true });
plantar('phrynium', 14, 0.8);
plantar('helecho-dipteris', 12, 0.8);
plantar('orquidea-tigre', 2, 1.2);
plantar('rododendro', 4, 0.9);
plantar('pino-apio', 3, 1.1);
// un claro con plantas jarra y la rafflesia
const claro = sitio(3) || [-6, 0, 4];
plantar('nepenthes-stenophylla', 4, 0.8, { zona: [claro[0], claro[2], 6] });
plantar('nepenthes-rajah', 2, 1, { zona: [claro[0], claro[2], 6] });
plantar('rafflesia', 1, 1.2, { zona: [claro[0], claro[2], 7] });
// setas: las de raíz junto a los dipterocarpos, las demás repartidas
for (const [x, , z] of dipterocarpos) {
  for (const id of ['amanita', 'russula', 'boleto-ruibarbo']) {
    const a = r() * 6.28, d = 1.8 + r() * 1.2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (dentro(px, pz, 1) && !enAgua(px, pz)) construir(busca(SETAS, id), S, r, px, T.cima(px, pz).y, pz);
  }
}
plantar('falo-velo', 4, 0.5);
plantar('estrella-roja', 4, 0.5);
plantar('copa-tropical', 3, 0.8);
plantar('repisa', 3, 1);
plantar('poros-luminosos', 4, 0.9);
plantar('mycena-verde', 4, 0.9);
plantar('termitomyces', 1, 1);
plantar('cordyceps', 2, 0.8);
// hierba y hojarasca entre medias, para que el suelo no quede pelado
for (let i = 0; i < 2600; i++) {
  const x = (r() - 0.5) * (ANCHO - 2), z = (r() - 0.5) * (FONDO - 2), c = T.cima(x, z);
  if (c.agua) continue;
  if (r() < 0.6) { const h = 0.15 + r() * 0.3; S.cubo('hoja', x, c.y + h / 2, z, 0.04, h, 0.04, ['#2a5a26', '#3e7030', '#5a8a38'][i % 3], (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4); }
  else S.cubo('solido', x, c.y + 0.012, z, 0.12, 0.02, 0.08, ['#7a5a2a', '#5a3e22', '#9a7038', '#4a5a26'][i % 4], 0, r() * 3, 0);
}
const mallasPlantas = S.mallas(tiempo, viento);
for (const m of mallasPlantas) escena.add(m);

/* ---- los animales ---- */
const bichos = [];
const ESCALA = { insecto: 2.6, gusano: 2.6, alado: 2.2, rana: 1.8, reptil: 1.2, serpiente: 1.1 }; // los pequeños, más grandes para que se vean
function soltar(id, n, op = {}) {
  const e = busca(ANIMALES, id);
  for (let i = 0; i < n; i++) {
    const m = crearAnimal(e);
    const esc = op.escala ?? ESCALA[e.modelo.rig] ?? 1;
    m.raiz.scale.setScalar(esc);
    const g = new THREE.Group(); g.add(m.raiz); escena.add(g);
    let p = sitio(0.3, { cercaAgua: op.cercaAgua, zona: op.zona, intentos: 400 });
    if (p) ocupado.pop(); // los animales no reservan sitio
    else p = [0, T.cima(0, 0).y, 0];
    g.position.set(p[0], p[1], p[2]);
    g.rotation.y = r() * 6.28;
    const b = { m, g, e, tipo: op.tipo || 'suelo', vel: op.vel ?? 0.8, radio: op.radio ?? 6, casa: new THREE.Vector3(p[0], p[1], p[2]), destino: null, espera: r() * 4, fase: r() * 9, alto: op.alto ?? 6, esc };
    b.m.poner(b.tipo === 'vuelo' ? 'volar' : b.tipo === 'planeo' ? 'planear' : 'quieto', 0);
    bichos.push(b);
  }
}
soltar('pantera-nebulosa', 1, { vel: 1.2, radio: 12 });
soltar('muntiaco', 3, { vel: 1.1, radio: 8 });
soltar('ciervo-raton', 2, { vel: 0.9 });
soltar('jabali-barbudo', 3, { vel: 0.8, radio: 7 });
soltar('orangutan', 1, { vel: 0.5, radio: 4 });
soltar('macaco', 4, { vel: 1.0, radio: 6 });
soltar('ardilla-prevost', 3, { vel: 1.4, radio: 5 });
soltar('varano', 1, { vel: 0.5, cercaAgua: true, radio: 5 });
soltar('dragon-bosque', 2, { vel: 0.6, radio: 3 });
soltar('eslizon-solar', 2, { vel: 0.8, radio: 3 });
soltar('vibora-verde', 1, { vel: 0.25, radio: 3 });
soltar('piton-reticulada', 1, { vel: 0.3, cercaAgua: true, radio: 4 });
soltar('rana-gigante-rio', 4, { vel: 0.6, cercaAgua: true, radio: 2 });
soltar('rana-arboricola', 3, { vel: 0.6, cercaAgua: true, radio: 2 });
soltar('gallo-bankiva', 2, { vel: 0.7, radio: 4 });
soltar('escarabajo-tigre', 3, { vel: 0.7, radio: 2 });
soltar('escarabajo-atlas', 2, { vel: 0.3, radio: 1.5 });
soltar('pelotero', 2, { vel: 0.3, radio: 1.5 });
soltar('mantis-hoja-seca', 2, { vel: 0.2, radio: 1 });
soltar('insecto-palo', 2, { vel: 0.15, radio: 1 });
soltar('oruga', 2, { vel: 0.1, radio: 1 });
soltar('lombriz', 2, { vel: 0.1, radio: 1 });
soltar('termita', 10, { vel: 0.35, radio: 0.4, tipo: 'columna', zona: [4, -3, 3] });
soltar('aguila-culebrera', 1, { tipo: 'planeo', alto: 13, radio: 12 });
soltar('calao', 2, { tipo: 'vuelo', alto: 11, radio: 9 });
soltar('golondrina', 5, { tipo: 'vuelo', alto: 5, radio: 7, cercaAgua: true });
soltar('rajah-brooke', 4, { tipo: 'mariposa', alto: 1.5, radio: 4 });
soltar('ninfa-arbol', 3, { tipo: 'mariposa', alto: 2.2, radio: 4 });
soltar('libelula', 4, { tipo: 'mariposa', alto: 0.8, radio: 3, cercaAgua: true });
soltar('cigarra', 2, { tipo: 'mariposa', alto: 3, radio: 5 });
soltar('fulgorido', 2, { tipo: 'mariposa', alto: 2.5, radio: 4 });
soltar('buho-pardo', 1, { tipo: 'vuelo', alto: 8, radio: 8 });

function moverBicho(b, t, dt) {
  const { g, m } = b;
  if (b.tipo === 'vuelo' || b.tipo === 'planeo') {
    const a = t * (b.tipo === 'planeo' ? 0.12 : 0.3) + b.fase;
    const x = b.casa.x + Math.cos(a) * b.radio, z = b.casa.z + Math.sin(a) * b.radio * 0.7;
    g.position.set(x, b.alto + Math.sin(t * 0.7 + b.fase) * 0.8 - m.datos.L * 1.4 * b.esc, z);
    g.rotation.y = -a - Math.PI / 2;
    return;
  }
  if (b.tipo === 'mariposa') {
    const x = b.casa.x + Math.sin(t * 0.37 + b.fase) * b.radio + Math.sin(t * 1.3 + b.fase) * 0.5;
    const z = b.casa.z + Math.cos(t * 0.29 + b.fase * 2) * b.radio * 0.8;
    const dx = x - g.position.x, dz = z - g.position.z;
    if (Math.hypot(dx, dz) > 1e-4) g.rotation.y = -Math.atan2(dz, dx);
    g.position.set(x, T.cima(x, z).y + b.alto - m.datos.L * 2 * b.esc, z);
    if (m.anim !== 'volar') m.poner('volar', t - 1);
    return;
  }
  if (b.tipo === 'columna') { // termitas en fila
    const u = ((t * 0.12 + b.fase * 0.1) % 1);
    const x = b.casa.x + (u - 0.5) * 5, z = b.casa.z + Math.sin(u * 6) * 0.6;
    g.position.set(x, T.cima(x, z).y, z); g.rotation.y = -Math.atan2(Math.cos(u * 6) * 0.6 * 6, 5);
    if (m.anim !== 'andar') m.poner('andar', t);
    return;
  }
  // los de suelo: elegir un sitio, ir andando, pararse a comer o descansar
  if (!b.destino) {
    b.espera -= dt;
    if (b.espera <= 0) {
      for (let k = 0; k < 20; k++) {
        const x = b.casa.x + (r() - 0.5) * 2 * b.radio, z = b.casa.z + (r() - 0.5) * 2 * b.radio;
        if (dentro(x, z, 1.5) && !T.cima(x, z).agua) { b.destino = new THREE.Vector3(x, 0, z); break; }
      }
      if (b.destino) m.poner(m.anims.includes('andar') ? 'andar' : m.anims.includes('reptar') ? 'reptar' : m.anims.includes('saltar') ? 'saltar' : m.anims.includes('arrastrarse') ? 'arrastrarse' : 'quieto', t);
      else b.espera = 2;
    }
  } else {
    const d = new THREE.Vector3(b.destino.x - g.position.x, 0, b.destino.z - g.position.z);
    const dist = d.length();
    if (dist < 0.15) {
      b.destino = null; b.espera = 2 + r() * 6;
      const quieto = ['comer', 'quieto', 'comer', ...(m.anims.includes('dormir') && r() < 0.15 ? ['dormir'] : []), ...(m.anims.includes('croar') ? ['croar'] : []), ...(m.anims.includes('flexiones') ? ['flexiones'] : [])];
      m.poner(quieto[Math.floor(r() * quieto.length)], t);
    } else {
      const ang = -Math.atan2(d.z, d.x);
      let delta = ang - g.rotation.y; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      g.rotation.y += delta * Math.min(1, dt * 4);
      const paso = Math.min(dist, b.vel * dt);
      g.position.addScaledVector(d.normalize(), paso);
      g.position.y = T.cima(g.position.x, g.position.z).y;
    }
  }
}

/* ---- partículas: luciérnagas de noche, polvo en la luz ---- */
const luciernagas = particulas(160, '#f6f08a', 2, r, (r) => ({ x: (r() - 0.5) * 40, y: 0.5 + r() * 3, z: (r() - 0.5) * 28, fase: r() * 9, v: 0.3 + r() * 0.5 }), true);
const polvo = particulas(140, '#fff0c0', 1, r, (r) => ({ x: (r() - 0.5) * 40, y: r() * 8, z: (r() - 0.5) * 28, fase: r() * 9 }), true, 0.5);
escena.add(luciernagas, polvo);
function moverParticulas(t) {
  let pos = luciernagas.geometry.attributes.position;
  luciernagas.userData.datos.forEach((d, i) => pos.setXYZ(i, d.x + Math.sin(t * d.v + d.fase) * 0.8, d.y + Math.sin(t * d.v * 1.7 + d.fase) * 0.4, d.z + Math.cos(t * d.v + d.fase) * 0.6));
  pos.needsUpdate = true;
  luciernagas.material.opacity = 0.75 + Math.sin(t * 4) * 0.25;
  pos = polvo.geometry.attributes.position;
  polvo.userData.datos.forEach((d, i) => pos.setXYZ(i, d.x + Math.sin(t * 0.2 + d.fase) * 0.8, d.y + Math.sin(t * 0.3 + d.fase) * 0.4, d.z));
  pos.needsUpdate = true;
}

/* ---- luz ---- */
const HORAS = ['dia', 'atardecer', 'noche'];
let hora = 0;
function ponerHora(i) {
  hora = i;
  const L = visor.luces(escena, HORAS[i], 32);
  escena.fog = new THREE.Fog(L.niebla, 70, 140);
  luciernagas.visible = HORAS[i] === 'noche';
  polvo.visible = HORAS[i] !== 'noche';
  const brillo = mallasPlantas.find((m) => m.userData.tipo === 'brillo');
  if (brillo) brillo.material.color.setScalar(HORAS[i] === 'noche' ? 1.6 : 0.85);
}
ponerHora(0);

/* ---- cámara: la misma de Unity que en las pruebas v1-v4 ---- */
const camara = new CamaraUnity(lienzo, { elevacion: 50, azimut: 0, distancia: 30, ortoAlto: 18 });
let ayudaHasta = performance.now() + 6000;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'enter') return pantallaCompleta(document.documentElement);
  if (k === 'h') { $('ayuda').classList.toggle('on'); ayudaHasta = 0; return; }
  if (k === 'n') return ponerHora((hora + 1) % 3);
  if (k === '+' || k === '=') { visor.pixel = Math.max(1, visor.pixel - 1); return; }
  if (k === '-') { visor.pixel = Math.min(6, visor.pixel + 1); }
});
$('ayuda').classList.add('on'); // se ve al entrar y se va sola

/* ---- bucle ---- */
let ultimo = performance.now();
function bucle(ms) {
  requestAnimationFrame(bucle);
  const dt = Math.min(0.1, (ms - ultimo) / 1000); ultimo = ms;
  const t = ms / 1000;
  tiempo.value = t;
  if (ayudaHasta && ms > ayudaHasta) { $('ayuda').classList.remove('on'); ayudaHasta = 0; }
  for (const b of bichos) { moverBicho(b, t, dt); b.m.paso(t); }
  moverParticulas(t);
  visor.pintar(escena, camara.paso(dt));
}
requestAnimationFrame(bucle);
window.__bioma = { bichos: bichos.length, cubosPlantas: S.total };
window.__listo = true;
