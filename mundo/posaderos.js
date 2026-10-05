// Dónde se puede posar un animal en una planta: los puntos de verdad de su modelo (los de
// graficos/pruebas-morta/borneo/plantas.js, los mismos que dibuja vivo/bosque.js): flores, frutos,
// hojas (donde se pegan a la ramita) y ramas finas (encima de cada sección). Así una mariposa
// queda encima de una flor y un cálao sobre una rama, no en el aire. También la horquilla de la
// copa (donde el tronco se parte en ramas, para los nidos).
//
// Cada árbol del mapa se dibuja con una de VARIANTES variantes de su especie, girado y
// escalado: varianteDe y escalaDe dicen cuáles (y vivo/bosque.js usa estas mismas).

import { construir, SacoP, troncoDe } from '../graficos/pruebas-morta/borneo/plantas.js?v=202610052205';
import { PLANTAS, SETAS } from '../graficos/pruebas-morta/borneo/especies.js?v=202610052205';

export const VARIANTES = 3;
export const ARBOL = new Set(['dipterocarpo', 'agathis', 'higuera', 'roble', 'dillenia', 'palma-cola-pez', 'pinanga']);
const busca = (id) => PLANTAS.find((e) => e.id === id) || SETAS.find((e) => e.id === id);
export function azarDe(texto) { let h = 0; for (const ch of texto) h = (h * 31 + ch.charCodeAt(0)) | 0; let a = h >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// el modelo de una planta (de cerca), sin gráficos: sus medidas, sus puntos y su horquilla
const modelos = new Map();
export function modeloPlanta(especie, variante) {
  const k = especie + ':' + variante;
  let m = modelos.get(k);
  if (m) return m;
  const e = busca(especie), S = new SacoP(0);
  const med = e ? construir(e, S, azarDe(especie + ':' + variante), 0, 0, 0) || { alto: 1, ancho: 1 } : { alto: 1, ancho: 1 };
  m = { med, puntos: S.puntos, horquilla: S.horquilla, tronco: troncoDe(S) };
  modelos.set(k, m);
  return m;
}
// la variante de cada ejemplar: de su id y de su giro (que sale del azar de la semilla del mundo),
// así que con la misma semilla sale el mismo bosque y cada árbol, siempre igual
export const varianteDe = (a) => { let h = 7; for (const ch of a.id || '') h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h ^ Math.floor(a.giro * 1000)) % VARIANTES; };
export function escalaDe(a) {
  if (!ARBOL.has(a.especie)) return 1;
  const alto = modeloPlanta(a.especie, 0).med.alto || 1;
  return Math.min(1.7, Math.max(0.45, Math.sqrt((a.altura || alto) / alto)));
}

// los puntos donde posarse de un modelo (en su sitio, sin girar ni escalar): por tipo, x, y, z;
// como mucho 150 de cada tipo
const puntosCache = new Map();
export function puntosPlanta(especie, variante) {
  const k = especie + ':' + variante;
  let p = puntosCache.get(k);
  if (p) return p;
  const { puntos, horquilla, med } = modeloPlanta(especie, variante);
  const de = (l) => { const n = l.length / 3, paso = Math.max(1, Math.ceil(n / 150)), out = []; for (let i = 0; i < n; i += paso) out.push(l[i * 3], l[i * 3 + 1], l[i * 3 + 2]); return Float32Array.from(out); };
  p = { flor: de(puntos.flor), fruto: de(puntos.fruto), hoja: de(puntos.hoja), rama: de(puntos.rama) };
  // la horquilla: la del árbol (donde salen las primeras ramas) o, si no, donde empieza la copa
  // (el 15 % más bajo de las hojas)
  const ys = []; for (let i = 1; i < puntos.hoja.length; i += 3) ys.push(puntos.hoja[i]); ys.sort((a, b) => a - b);
  p.horquilla = horquilla ?? (ys.length ? ys[Math.floor(ys.length * 0.15)] : (med.alto || 1) * 0.6);
  puntosCache.set(k, p);
  return p;
}

// el punto (del mundo) más cercano a (x, y, z) de una planta del mapa, de los tipos que se
// pidan (por orden de preferencia: el primero que tenga puntos). y: sobre el suelo del árbol
export function posadero(arbol, x, y, z, tipos = ['flor', 'fruto', 'hoja', 'rama']) {
  const p = puntosPlanta(arbol.especie, varianteDe(arbol)), esc = escalaDe(arbol);
  const cs = Math.cos(arbol.giro), sn = Math.sin(arbol.giro);
  for (const t of tipos) {
    const l = p[t];
    if (!l || !l.length) continue;
    let mejor = null, md = Infinity;
    for (let i = 0; i < l.length; i += 3) {
      // girado como Object3D.rotation.y = giro: x' = x·cos + z·sen, z' = −x·sen + z·cos
      const px = arbol.x + (l[i] * cs + l[i + 2] * sn) * esc, pz = arbol.z + (-l[i] * sn + l[i + 2] * cs) * esc, py = l[i + 1] * esc;
      const d = (px - x) ** 2 + (pz - z) ** 2 + (py - y) ** 2;
      if (d < md) { md = d; mejor = { x: px, y: py, z: pz, tipo: t }; }
    }
    if (mejor) return mejor;
  }
  return null;
}
// la horquilla de un árbol (altura sobre su suelo), para los nidos
export function horquilla(arbol) { return puntosPlanta(arbol.especie, varianteDe(arbol)).horquilla * escalaDe(arbol); }
