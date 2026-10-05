/* LOS ANIMALES, SUAVES. Cada especie se monta primero con sus cubos (animales-cubos.js: el
   esqueleto de su tipo de cuerpo, sus piezas y sus animaciones) y de ahí sale, una vez por
   especie, su malla suave (suavizar.js: las piezas redondeadas y fundidas, 600-1.500 triángulos
   de cerca y unos 100 para lejos) con su pelaje pintado (pelaje.js). Al montar un animal, sus
   cajas se cambian por esa malla atada a sus articulaciones (SkinnedMesh): las articulaciones
   son las mismas (m.piv, m.raiz), así que las animaciones de siempre (andar, correr, comer,
   atacar, dormir de lado, morir...) y lo que usan vivo/animaciones.js y vivo/fundir.js siguen
   valiendo igual: m.piv, m.anims, m.raiz, m.mats, m.tam, m.datos, m.paso, m.poner.
   Los ojos tienen su propio hueso (para cerrarlos) y la lengua el suyo (para sacarla).
   crearAnimal(e, { cubos: true }) da la versión de cubos de antes. */

import * as THREE from '../vendor/three.module.js';
import { crearAnimal as crearAnimalCubos, NOMBRES_ANIMACION } from './animales-cubos.js?v=202610052338';
import { suavizar } from './suavizar.js?v=202610052338';
import { pintarPelaje, materialPelaje } from './pelaje.js?v=202610052338';
import { objetivosDe, dePlano } from './suavizar-datos.js?v=202610052338';

export { NOMBRES_ANIMACION };

// por especie: la malla suave (cerca y lejos), los huesos por nombre, el pelaje y su caja
const cache = new Map();
export function suaveDe(especie) {
  let c = cache.get(especie.id);
  if (c) return c;
  const m = crearAnimalCubos(especie);
  const t0 = performance.now();
  c = completar(especie, suavizar(m, objetivosDe(m)), t0);
  return c;
}
// con la malla ya hecha (aquí o en un Worker): la caja de las vistas y el pelaje
function completar(especie, s, t0 = performance.now()) {
  let c;
  // la caja de las vistas del pelaje: la de la malla suave (algo más que la de las cajas)
  const caja = new THREE.Box3().setFromBufferAttribute(s.geo0.attributes.position);
  caja.expandByScalar(s.celda);
  const pelaje = typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined' ? pintarPelaje(s.piezas, caja, especie) : null;
  c = { ...s, caja, pelaje, ms: performance.now() - t0 };
  cache.set(especie.id, c);
  return c;
}

/* Las mallas de muchas especies a la vez, en Web Workers en paralelo (fuera del hilo principal):
   se llama al empezar (el mundo vivo, el banco) y se espera antes de montar los animales. */
export function prepararSuaves(especies) {
  const faltan = especies.filter((e) => !cache.has(e.id));
  if (!faltan.length || typeof Worker === 'undefined') return Promise.resolve();
  const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2, faltan.length));
  return new Promise((listo) => {
    let quedan = faltan.length, siguiente = 0;
    // (si algo falla, lo que quede se hace aquí al pedirlo: suaveDe)
    setTimeout(listo, 30000);
    const trabajadores = [];
    const dar = (w) => { if (siguiente < faltan.length) { w.actual = faltan[siguiente++]; w.postMessage({ id: w.actual.id }); } else w.terminate(); };
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./suavizar-trabajador.js?v=202610052338', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => {
        const e = faltan.find((x) => x.id === data.id);
        if (!cache.has(e.id)) completar(e, dePlano(data.plano));
        if (--quedan === 0) listo();
        dar(w);
      };
      w.onerror = (err) => { console.warn('suavizar-trabajador:', err.message); w.terminate(); if (w.actual) suaveDe(w.actual); if (--quedan <= 0) listo(); };
      trabajadores.push(w); dar(w);
    }
  });
}

export function crearAnimal(especie, { cubos = false } = {}) {
  const m = crearAnimalCubos(especie);
  if (cubos) return m;
  const c = suaveDe(especie);
  // los huesos de los ojos: un grupo en el centro de cada ojo, colgado de su articulación, que
  // cerrarOjos aplasta (userData.ojo) y restaurar() devuelve a su sitio (userData.bp/br/bs)
  m.raiz.updateMatrixWorld(true);
  const huesoOjo = {};
  for (const o of c.ojos) {
    const padre = o.hueso === 'raiz' ? m.raiz : m.piv[o.hueso];
    const g = new THREE.Group();
    g.position.copy(padre.worldToLocal(o.centro.clone()));
    g.userData.ojo = true; g.userData.bp = g.position.clone(); g.userData.br = g.rotation.clone(); g.userData.bs = g.scale.clone();
    padre.add(g);
    huesoOjo[o.huesoOjo] = g;
  }
  // fuera las cajas
  const quitar = [];
  m.raiz.traverse((o) => { if (o.isMesh) quitar.push(o); });
  for (const o of quitar) { o.removeFromParent(); o.geometry.dispose(); }
  for (const mat of m.mats) mat.dispose();
  // la malla suave, atada a las articulaciones de este modelo
  const huesos = c.huesos.map((n) => (n === 'raiz' ? m.raiz : huesoOjo[n] || m.piv[n]));
  const material = materialPelaje(c.pelaje, c.caja);
  const malla = new THREE.SkinnedMesh(c.geo0, material);
  malla.castShadow = true; malla.receiveShadow = true;
  malla.frustumCulled = false; // (las animaciones lo sacan de su caja de reposo: vuela, salta, se tumba)
  m.raiz.add(malla);
  m.raiz.updateMatrixWorld(true);
  malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);
  m.mats = [material];
  m.suave = { malla, geoLejos: c.geo1, caja: c.caja, pelaje: c.pelaje, huesos: c.huesos };
  m.triangulos = c.geo0.userData.triangulos;
  return m;
}
