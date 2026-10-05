/* LOS HOGARES de los animales, en la escena: donde está el hogar de cada uno en la simulación
   (mundo/mundo.js, hogarEn; especies.js, hogar), como es de verdad y con pocos triángulos.
   Cada tipo es una geometría de unas pocas cajas, dibujada por instancias (una llamada por
   tipo), escalada al tamaño del animal:
   - madriguera: la boca (un agujero oscuro) con la tierra removida delante;
   - nido en árbol: un nido de ramitas en la horquilla de la copa;
   - plataforma del orangután: ramas cruzadas con hojas encima, una nueva cada noche (se ven
     las de las últimas noches);
   - dormidero en árbol: la rama gruesa donde duerme;
   - cama (jabalí, muntíaco, ciervo ratón): hojas aplastadas en el suelo;
   - termitero: el montículo (los del mapa, con las termitas dentro).
   Solo los que están a menos de CERCA m de la cámara. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { conTransparencia } from './transparencia.js?v=202610052338';
import { COMPORTAMIENTO } from '../mundo/especies.js?v=202610052338';

const CERCA = 120;
const CAJA = new THREE.BoxGeometry(1, 1, 1);
function juntar(cajas) {
  const P = CAJA.attributes.position, N = CAJA.attributes.normal, I = CAJA.index.array, nv = P.count;
  const pos = new Float32Array(cajas.length * nv * 3), nor = new Float32Array(cajas.length * nv * 3), col = new Float32Array(cajas.length * nv * 3), idx = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  cajas.forEach(([x, y, z, sx, sy, sz, color, ry = 0, rx = 0], j) => {
    m.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, 0)), s.set(sx, sy, sz)); nm.getNormalMatrix(m); c.set(color);
    for (let k = 0; k < nv; k++) {
      const o = (j * nv + k) * 3;
      v.fromBufferAttribute(P, k).applyMatrix4(m); pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
      v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); nor[o] = v.x; nor[o + 1] = v.y; nor[o + 2] = v.z;
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
    for (let k = 0; k < I.length; k++) idx.push(I[k] + j * nv);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}

// los modelos, a tamaño 1 (un animal de 1 m de largo); y = 0 es el suelo (o la rama)
const TIERRA = '#5a3e26', TIERRA2 = '#6e4c2c', OSCURO = '#140d08', RAMITA = '#5c4128', RAMITA2 = '#7a5a36', HOJA = '#5a6a2a', HOJA2 = '#7a6a34', HOJA3 = '#3e5a26';
const anillo = (n, r, y, ancho, alto, col) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r, ancho, alto, 0.06, k % 2 ? col : RAMITA2, -a + Math.PI / 2]; });
const MODELOS = {
  madriguera: [
    [0, 0.01, 0, 0.7, 0.03, 0.5, OSCURO],                 // la boca
    [0, 0.12, -0.32, 0.9, 0.24, 0.18, TIERRA2],            // el borde de arriba
    [0.45, 0.06, 0.05, 0.25, 0.12, 0.7, TIERRA, 0.3],      // la tierra removida a los lados
    [-0.45, 0.06, 0.05, 0.25, 0.12, 0.7, TIERRA, -0.3],
    [0, 0.04, 0.5, 0.9, 0.08, 0.45, TIERRA2],              // y delante
  ],
  nido_arbol: [
    [0, 0.0, 0, 0.55, 0.06, 0.55, RAMITA],                 // el fondo
    ...anillo(8, 0.28, 0.07, 0.3, 0.1, RAMITA),            // las ramitas en corro
  ],
  plataforma: [
    ...[0, 0.6, 1.2, 1.8, 2.4].map((a) => [0, 0, 0, 1.7, 0.08, 0.1, RAMITA, a]),   // ramas cruzadas
    [0.1, 0.07, 0, 1.2, 0.05, 0.9, HOJA3], [-0.2, 0.08, 0.15, 0.9, 0.05, 0.8, HOJA, 0.7], [0.15, 0.09, -0.2, 0.8, 0.05, 0.6, HOJA2, 1.6],
  ],
  dormidero_arbol: [
    [0, -0.08, 0, 1.6, 0.14, 0.14, RAMITA],                // la rama
    [0.5, -0.02, 0.1, 0.4, 0.06, 0.06, RAMITA2, 0.6],
  ],
  cama: [
    [0, 0.015, 0, 1.3, 0.03, 0.8, HOJA2], [0.2, 0.025, 0.1, 0.8, 0.03, 0.5, HOJA, 0.5], [-0.25, 0.03, -0.1, 0.7, 0.03, 0.5, '#6a5a30', -0.4],
    [0.05, 0.035, -0.25, 0.5, 0.03, 0.3, HOJA3, 1.1],
  ],
  termitero: [
    [0, 0.35, 0, 1.6, 0.7, 1.5, '#8a6a44'], [0.05, 0.95, 0, 1.1, 0.6, 1.0, '#7e6040'], [-0.05, 1.45, 0.05, 0.7, 0.5, 0.65, '#8a6a44'],
    [0.08, 1.85, 0, 0.35, 0.4, 0.35, '#7e6040'], [0.5, 0.2, 0.55, 0.4, 0.4, 0.4, '#6e5236'],
  ],
};
MODELOS.nido_suelo = MODELOS.cama;

export function crearHogares({ escena, ox, oz, cima, mapa, tamDe }) {
  // tamDe(especie): el largo del animal dibujado (m), para escalar su hogar
  const capas = {};
  for (const [tipo, cajas] of Object.entries(MODELOS)) {
    const m = new THREE.InstancedMesh(juntar(cajas), conTransparencia(new THREE.MeshLambertMaterial({ vertexColors: true })), 64);
    m.count = 0; m.frustumCulled = false; m.castShadow = tipo !== 'cama'; m.receiveShadow = true;
    escena.add(m);
    capas[tipo] = { malla: m, n: 0 };
  }
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), eje = new THREE.Vector3(0, 1, 0);
  function poner(tipo, x, y, z, escala, giro) {
    const c = capas[tipo];
    if (c.n >= c.malla.instanceMatrix.count) {
      const viejo = c.malla, nuevo = new THREE.InstancedMesh(viejo.geometry, viejo.material, viejo.instanceMatrix.count * 2);
      nuevo.instanceMatrix.array.set(viejo.instanceMatrix.array);
      Object.assign(nuevo, { frustumCulled: false, castShadow: viejo.castShadow, receiveShadow: true });
      escena.remove(viejo); escena.add(nuevo); c.malla = nuevo;
    }
    mat.compose(p.set(x - ox, y, z - oz), q.setFromAxisAngle(eje, giro), s.set(escala, escala, escala));
    c.malla.setMatrixAt(c.n++, mat);
  }
  const medidas = { hogares: 0 };
  let ancla = null, diaHecho = -1;
  return {
    medidas,
    // con los animales del día (descripción del trabajador) y dónde está la cámara
    actualizar(dia, cx, cz) {
      if (!dia) return;
      if (diaHecho === dia.dia && ancla && Math.hypot(cx - ancla.x, cz - ancla.z) < 25) return;
      diaHecho = dia.dia; ancla = { x: cx, z: cz };
      for (const c of Object.values(capas)) c.n = 0;
      const vistos = new Set();
      const giro = (x, z) => ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * Math.PI * 2;
      for (const a of Object.values(dia.agentes)) {
        const tipo = COMPORTAMIENTO[a.especie]?.hogar;
        if (!tipo || tipo === 'ninguno' || tipo === 'termitero' || !a.hogar) continue;
        const tam = Math.max(0.15, tamDe(a.especie));
        // el orangután: sus plataformas de las últimas noches (y no un nido fijo)
        if (a.especie === 'orangutan') {
          for (const n of a.nidos || []) {
            if (Math.hypot(n.x - cx, n.z - cz) > CERCA) continue;
            poner('plataforma', n.x, cima(n.x, n.z) + n.y - 0.05, n.z, 1, giro(n.x, n.z));
          }
          continue;
        }
        const h = a.hogar, clave = `${tipo}:${Math.round(h.x * 2)}:${Math.round(h.z * 2)}`;
        if (vistos.has(clave) || Math.hypot(h.x - cx, h.z - cz) > CERCA) continue;
        vistos.add(clave);
        const y = cima(h.x, h.z) + (h.y || 0);
        if (tipo === 'nido_arbol') poner('nido_arbol', h.x, y - 0.03, h.z, Math.min(1.4, tam * 0.9 + 0.15), giro(h.x, h.z));
        else if (tipo === 'dormidero_arbol') poner('dormidero_arbol', h.x, y, h.z, Math.min(2, tam + 0.4), giro(h.x, h.z));
        else if (tipo === 'madriguera') poner('madriguera', h.x, y, h.z, Math.min(1.6, tam * 0.9 + 0.08), giro(h.x, h.z));
        else poner(tipo in capas ? tipo : 'cama', h.x, y, h.z, Math.min(2, tam * 1.1 + 0.2), giro(h.x, h.z));
      }
      // los termiteros del mapa
      for (const b of mapa.baldosasCerca(cx, cz, CERCA)) for (const t of b.termiteros) poner('termitero', t.x, cima(t.x, t.z) - 0.15, t.z, 1, giro(t.x, t.z));
      let n = 0;
      for (const c of Object.values(capas)) { c.malla.count = c.n; c.malla.instanceMatrix.needsUpdate = true; n += c.n; }
      medidas.hogares = n;
    },
    // un cambio de día nuevo (plantas nuevas): rehacer
    cambiado() { diaHecho = -1; },
  };
}
