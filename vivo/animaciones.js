/* Cómo se ve cada estado de la simulación con los modelos del Observer
   (graficos/pruebas-morta/borneo/animales.js). Cada esqueleto trae sus animaciones
   (quieto, andar, correr, comer, dormir, morir, volar...); las que faltan para los estados
   del mundo vivo (beber, acechar, huir, cortejar, aparearse, excavar, anidar, nadar,
   trepar, nacer, llegar, irse) se hacen aquí con una animación base a otro ritmo y un
   retoque encima de la raíz del modelo (agacharse, hundirse, girar, botar...). El retoque
   se aplica después de m.paso(), que restaura la postura cada fotograma. */

import { ESTADOS } from '../mundo/especies.js?v=202610032043';

const primera = (m, ...op) => op.find((a) => m.anims.includes(a)) || 'quieto';
const andarDe = (m) => primera(m, 'andar', 'reptar', 'saltitos', 'saltar', 'arrastrarse', 'volar');
const correrDe = (m) => primera(m, 'correr', 'andar', 'reptar', 'saltar', 'saltitos', 'arrastrarse', 'volar');
const PI = Math.PI;

// estado -> { base, ritmo, retoque(m, k, t, tam) }
//   base: nombre de la animación del esqueleto (o función que lo elige)
//   ritmo: velocidad de la animación base
//   retoque: ajustes encima (k = segundos desde que empezó el estado)
export const COMO_SE_VE = {
  quieto: { base: 'quieto' },
  andar: { base: andarDe },
  correr: { base: correrDe, ritmo: 1.2 },
  comer: { base: (m) => primera(m, 'comer', 'quieto') },
  beber: {
    base: (m) => primera(m, 'comer', 'quieto'), ritmo: 0.6,
    retoque: (m, k, t, tam) => { m.raiz.rotation.z -= 0.18; m.raiz.position.y -= tam * 0.04 * (1 + Math.sin(t * 6)) * 0.5; },
  },
  dormir: { base: (m) => primera(m, 'dormir', 'enrollarse', 'sentarse', 'quieto'), ritmo: 0.5,
    retoque: (m, k, t, tam) => { if (!m.anims.includes('dormir') && !m.anims.includes('enrollarse')) m.raiz.scale.y *= 0.85; } },
  descansar: { base: (m) => primera(m, 'sentarse', 'dormir', 'quieto'), ritmo: 0.6 },
  acechar: {
    base: andarDe, ritmo: 0.35,
    retoque: (m, k, t, tam) => { m.raiz.scale.y *= 0.78; m.raiz.position.y -= tam * 0.05; },
  },
  atacar: { base: (m) => primera(m, 'atacar', 'correr', 'andar', 'saltar', 'reptar') },
  huir: { base: correrDe, ritmo: 1.5, retoque: (m, k, t, tam) => { m.raiz.position.y += Math.abs(Math.sin(t * 14)) * tam * 0.06; } },
  cortejar: {
    base: (m) => primera(m, 'flexiones', 'croar', 'saltitos', 'quieto'),
    retoque: (m, k, t, tam) => { m.raiz.rotation.y += Math.sin(t * 2.2) * 0.6; m.raiz.position.y += Math.max(0, Math.sin(t * 5)) * tam * 0.12; },
  },
  aparearse: {
    base: 'quieto',
    retoque: (m, k, t, tam) => { m.raiz.position.y += Math.abs(Math.sin(t * 8)) * tam * 0.05; m.raiz.rotation.z += Math.sin(t * 8) * 0.06; },
  },
  anidar: {
    base: (m) => primera(m, 'comer', 'quieto'), ritmo: 1.4,
    retoque: (m, k, t) => { m.raiz.rotation.y += Math.sin(t * 1.3) * 0.9; },
  },
  excavar: {
    base: (m) => primera(m, 'comer', 'arrastrarse', 'quieto'), ritmo: 2.5,
    retoque: (m, k, t, tam) => { m.raiz.rotation.z -= 0.25 + Math.sin(t * 12) * 0.08; m.raiz.position.y -= Math.min(1, k / 20) * tam * 0.3; },
  },
  nadar: {
    base: andarDe, ritmo: 0.6,
    retoque: (m, k, t, tam) => { m.raiz.position.y -= tam * 0.45 - Math.sin(t * 2) * tam * 0.04; m.raiz.rotation.x += Math.sin(t * 3) * 0.08; },
  },
  volar: { base: (m) => primera(m, 'volar', 'planear', 'andar') },
  planear: { base: (m) => primera(m, 'planear', 'volar', 'andar') },
  morir: { base: 'morir' },
  muerto: { base: 'morir', fijo: 30 },
  nacer: { base: 'quieto', retoque: (m, k) => { m.raiz.scale.multiplyScalar(Math.min(1, 0.15 + k / 12)); } },
  trepar: {
    base: andarDe,
    // de pie contra el tronco: el morro hacia arriba
    retoque: (m) => { m.raiz.rotation.z += PI / 2; },
  },
  llegar: { base: andarDe },
  irse: { base: andarDe },
};

// pone la animación del estado (si ha cambiado) y avanza su reloj
export function animar(b, estado, dt) {
  const nombre = ESTADOS[estado] || 'quieto';
  const como = COMO_SE_VE[nombre] || COMO_SE_VE.quieto;
  const m = b.m;
  if (b.estado !== nombre) {
    b.estado = nombre;
    b.desde = 0;
    const base = typeof como.base === 'function' ? como.base(m) : como.base;
    b.reloj = como.fijo ? 100 : b.reloj || 0;
    m.poner(base, b.reloj - (como.fijo || 0));
    if (m.anim !== base) m.poner(primera(m, base, 'quieto'), b.reloj);
  }
  b.desde += dt;
  if (!como.fijo) b.reloj += dt * (como.ritmo || 1);
  m.paso(b.reloj);
  if (como.retoque) como.retoque(m, b.desde, b.reloj, b.tam);
}
