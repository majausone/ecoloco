// Los animales del mundo vivo y lo que deciden hacer en cada momento.
//
// Cada vertebrado es un individuo concreto de una cohorte del motor (misma masa, edad y
// territorio). Los invertebrados, que son millones, van con representantes en el diorama:
// cada uno vale por `vale` individuos del motor.
//
// Tiempo: un tic es un minuto de juego (un segundo de pantalla a ×1). Las necesidades
// (hambre, sed, sueño) van en horas de juego; el movimiento, en metros por tic a velocidad
// natural de pantalla (una especie que anda a 1 m/s recorre 1 m por tic).

import { COMPORTAMIENTO, ESPECIES_DE_GRUPO, VERTEBRADOS, activo, E } from './especies.js?v=202610060036';

let siguiente = 0;
export const nuevoId = (prefijo) => `${prefijo}${(siguiente++).toString(36)}`;
export function reiniciarIds(n = 0) { siguiente = n; }
export const idActual = () => siguiente;

// las especies que no hay en este mundo (configuración del mundo, mundo/config.js)
let quitadas = new Set();
export function quitarEspecies(l = []) { quitadas = new Set(l); }
export function elegirEspecie(grupo, az) {
  const todas = ESPECIES_DE_GRUPO[grupo], f = quitadas.size ? todas.filter(([e]) => !quitadas.has(e)) : todas;
  const op = f.length ? f : todas;
  const t = op.reduce((s, o) => s + o[1], 0);
  let u = az.r() * t;
  for (const [id, p] of op) { u -= p; if (u <= 0) return id; }
  return op[op.length - 1][0];
}

export class Agente {
  constructor({ id, especie, grupo, cohorte = null, x, z, az, masa = 1, adulta = 1, edad = 0, vale = 1 }) {
    this.id = id;
    this.especieId = especie;
    this.e = COMPORTAMIENTO[especie];
    this.grupo = grupo;
    this.vertebrado = VERTEBRADOS.has(grupo);
    this.cohorte = cohorte;
    this.vale = vale; // individuos del motor a los que representa
    this.x = x; this.z = z; this.y = 0;
    this.rumbo = az.r() * Math.PI * 2;
    this.vel = 0;
    this.estado = E.quieto;
    this.objetivo = null;       // { x, z, y, tipo, ref }
    this.tarea = null;          // lo que hace cuando llega
    this.temporizador = 0;      // tics que le quedan en la acción actual
    this.hambre = az.r() * 0.5;
    this.sed = az.r() * 0.4;
    this.sueno = az.r() * 0.3;
    this.masa = masa;
    this.adulta = adulta;
    this.edad = edad;
    this.sexo = az.r() < 0.5 ? 'h' : 'm';
    this.hogar = { x, z };
    this.territorio = null;     // celdas del motor por las que se mueve
    this.vivo = true;
    this.fuera = false;         // migrado o fuera del mapa
    this.marca = null;          // del director: { condenado, protegido, cazar: id, morir: tic, ... }
    this.siguiendo = null;      // id del animal al que sigue (grupos)
    this.presa = null;          // id de la presa que caza
    this.cazadoPor = null;
    this.comiendo = null;
    this.tarea = null;
    this.valor = 0;
    this.rango = 50;            // radio de su área de campeo (m), alrededor del hogar
    this.foco = false;          // el que sigue la cámara: se simula y se ve aunque salga de la zona
    this.salio = false;
    this.posado = false;        // (los que vuelan) posado en una planta o en el suelo
    this.nidos = null;          // (el orangután) las plataformas de las últimas noches
    this._nidoNoche = null;
    this._deQuien = null; this._antes = null;
    this._k = null; this._d = null; this._n = 0; this._fino = false; this._fase = 0; this._ultimo = -99; this._pendiente = -1;
    this.arbol = null; this._tramo = null; // (los que trepan: el tronco del árbol en el que están y el tramo de camino)
  }
}

// copia de un animal con las asignaciones escritas una a una: V8 deja las copias hechas con
// Object.assign (o con un bucle) en «modo diccionario», y entonces cada acceso a un campo es
// varias veces más lento (con miles de animales, el día tardaba 3-4 veces más)
export function Copia(a) {
  this.id = a.id; this.especieId = a.especieId; this.e = a.e; this.grupo = a.grupo; this.vertebrado = a.vertebrado;
  this.cohorte = a.cohorte; this.vale = a.vale; this.x = a.x; this.z = a.z; this.y = a.y; this.rumbo = a.rumbo; this.vel = a.vel;
  this.estado = a.estado; this.objetivo = a.objetivo; this.tarea = a.tarea; this.temporizador = a.temporizador;
  this.hambre = a.hambre; this.sed = a.sed; this.sueno = a.sueno; this.masa = a.masa; this.adulta = a.adulta; this.edad = a.edad;
  this.sexo = a.sexo; this.hogar = a.hogar; this.territorio = a.territorio; this.vivo = a.vivo; this.fuera = a.fuera;
  this.marca = a.marca; this.siguiendo = a.siguiendo; this.presa = a.presa; this.cazadoPor = a.cazadoPor; this.comiendo = a.comiendo;
  this.valor = a.valor; this.rango = a.rango; this.foco = a.foco; this.salio = a.salio;
  this.posado = a.posado; this.nidos = a.nidos; this._nidoNoche = a._nidoNoche;
  this._deQuien = a._deQuien; this._antes = a._antes; this.arbol = a.arbol; this._tramo = a._tramo;
  this._k = a._k; this._d = a._d; this._n = a._n; this._fino = a._fino; this._fase = a._fase; this._ultimo = a._ultimo; this._pendiente = a._pendiente;
}
Copia.prototype = Agente.prototype;

// ---------------------------------------------------------------- necesidades
// cuánto sube por hora de juego cada necesidad (de 0 a 1)
const RITMO = { hambre: 1 / 10, sed: 1 / 14, sueno: 1 / 16 };

export function necesidades(a, horas, hora) {
  const despierto = activo(a.e, hora);
  a.hambre = Math.min(1, a.hambre + RITMO.hambre * horas * (despierto ? 1 : 0.3));
  if (a.e.bebe) a.sed = Math.min(1, a.sed + RITMO.sed * horas * (despierto ? 1 : 0.3));
  if (a.estado === E.dormir || a.estado === E.descansar) a.sueno = Math.max(0, a.sueno - horas / 6);
  else a.sueno = Math.min(1, a.sueno + RITMO.sueno * horas * (despierto ? 1 : 2));
}

// ---------------------------------------------------------------- movimiento
export function dirigir(a, tx, tz, vel) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) { a.vel = 0; return 0; }
  const paso = Math.min(d, vel);
  a.x += (dx / d) * paso; a.z += (dz / d) * paso;
  // gira hacia donde va, sin saltos
  const r = Math.atan2(dz, dx);
  let delta = r - a.rumbo; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  a.rumbo += delta * 0.5;
  a.vel = paso;
  return d - paso;
}

// altura a la que va un animal que vuela o trepa
export function alturaDeseada(a, hora, mapa, objetivo) {
  const m = a.e.mueve;
  if (a.estado === E.morir || a.estado === E.muerto) return 0;
  // a punto de llegar a un sitio con altura (una flor, una rama, el nido): bajando a él
  if (objetivo?.y != null && (m === 'vuelo' || m === 'planeo' || m === 'volador') && Math.hypot(a.x - objetivo.x, a.z - objetivo.z) < Math.max(3, Math.abs(a.y - objetivo.y))) return objetivo.y;
  if (m === 'vuelo' || m === 'planeo') {
    if (a.estado === E.comer || a.estado === E.dormir || a.estado === E.beber || a.estado === E.descansar || a.estado === E.quieto) {
      return objetivo?.y ?? (a.estado === E.beber ? 0 : 0);
    }
    return m === 'planeo' ? 25 : 8 + (a.id.charCodeAt(a.id.length - 1) % 5);
  }
  if (m === 'volador') return a.estado === E.comer || a.estado === E.quieto || a.estado === E.beber ? (objetivo?.y ?? 0.3) : 1 + (a.id.charCodeAt(a.id.length - 1) % 3) * 0.5;
  // los que trepan: suben o bajan junto al tronco, no por el aire; de rama en rama (a menos
  // de 6 m) siguen a su altura, y más lejos bajan al suelo y van andando
  if (m === 'arboreo') {
    if (!objetivo || objetivo.y == null) return 0;
    const d = Math.hypot(a.x - objetivo.x, a.z - objetivo.z);
    if (d < 1.5) return objetivo.y;
    return a.y > 1 && d < 6 ? a.y : 0;
  }
  if (m === 'gusano') return -0.05;
  return 0;
}
