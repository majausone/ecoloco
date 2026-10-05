/* Pasar el resultado de suavizar.js a datos planos (para mandarlo desde un Worker) y de vuelta. */

import * as THREE from '../vendor/three.module.js';

// los triángulos de cerca y de lejos, según el tamaño: los pequeños (ranas, insectos) se ven pequeños
export function objetivosDe(m) {
  const grande = Math.max(m.tam.x, m.tam.y, m.tam.z);
  return { objetivo: grande < 0.35 ? 620 : grande < 0.9 ? 850 : 1150, objetivoLejos: grande < 0.35 ? 80 : 100 };
}

const geoAPlano = (g, transferir) => {
  const attrs = {};
  for (const [n, a] of Object.entries(g.attributes)) { attrs[n] = { array: a.array, itemSize: a.itemSize }; transferir.push(a.array.buffer); }
  transferir.push(g.index.array.buffer);
  return { attrs, index: g.index.array, triangulos: g.userData.triangulos };
};
const geoDePlano = (p) => {
  const g = new THREE.BufferGeometry();
  for (const [n, a] of Object.entries(p.attrs)) g.setAttribute(n, new THREE.BufferAttribute(a.array, a.itemSize));
  g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.triangulos = p.triangulos;
  return g;
};
const piezaAPlano = (p) => ({ hueso: p.hueso, clase: p.clase, ojo: p.ojo, mota: p.mota, huesoOjo: p.huesoOjo, centro: p.centro.toArray(), giro: p.giro.toArray(), medio: p.medio.toArray(), color: [p.color.r, p.color.g, p.color.b] });
const piezaDePlano = (p) => ({ ...p, centro: new THREE.Vector3().fromArray(p.centro), giro: new THREE.Quaternion().fromArray(p.giro), medio: new THREE.Vector3().fromArray(p.medio), color: new THREE.Color(...p.color) });

export function aPlano(s) {
  const transferir = [];
  const piezas = s.piezas.map(piezaAPlano);
  const plano = { geo0: geoAPlano(s.geo0, transferir), geo1: geoAPlano(s.geo1, transferir), huesos: s.huesos, piezas, ojos: s.ojos.map((o) => s.piezas.indexOf(o)), celda: s.celda };
  return { plano, transferir };
}
export function dePlano(p) {
  const piezas = p.piezas.map(piezaDePlano);
  return { geo0: geoDePlano(p.geo0), geo1: geoDePlano(p.geo1), huesos: p.huesos, piezas, ojos: p.ojos.map((i) => piezas[i]), celda: p.celda };
}
