/* LAS LIANAS DEL MUNDO (las que dice el mapa en cada baldosa: mapa._lianas, mundo/mapa.js), enganchadas a
   los árboles de verdad: Tetrastigma (con su rafflesia al pie, a veces), ratán y enredaderas subiendo por
   el tronco, cortinas de lianas finas colgando de una rama y lianas colgando de rama en rama entre dos
   árboles (en bucle hasta la altura de la vista o casi hasta el suelo; las del río, más tensas). Con las mismas
   piezas que las plantas suaves (graficos/pruebas-morta/borneo/plantas.js: lianaTrepando, lianaColgante, lianaCortina):
   tubos con curva, hojas en tarjetas recortadas y viento en el shader. Una malla por tipo de
   material para todas las de cerca (se rehace cuando cambian los árboles: cambiado(), o la zona). */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { SacoP, materialPlanta, materialSombraPlanta, lianaTrepando, lianaColgante, lianaCortina, rafflesiaEn } from '../graficos/pruebas-morta/borneo/plantas.js?v=202610052205';
import { modeloPlanta, escalaDe, azarDe, varianteDe } from '../mundo/posaderos.js?v=202610052205';
import { conTransparencia } from './transparencia.js?v=202610052205';

const RADIO_CERCA = 160; // m alrededor de la cámara con lianas

export function crearLianas({ escena, mapa, ox, oz, cima, tiempo, viento }) {
  const u = { tiempo, viento };
  const materiales = {};
  const material = (tipo) => (materiales[tipo] ||= { m: conTransparencia(materialPlanta(tipo, u, { cartas: tipo !== 'solido' }), { conPlanta: false }), s: materialSombraPlanta(tipo, u) });
  // de un árbol: su altura dibujada (la del modelo por su escala), su tronco de verdad (el de su variante,
  // girado y escalado como lo pone el bosque: el centro y el radio a h m del suelo, en coordenadas de la escena)
  // y hasta dónde llega el tronco (donde empieza la copa)
  const altoDe = (a) => (modeloPlanta(a.especie, 0).med.alto || a.altura) * escalaDe(a);
  const troncoDe = (a) => {
    const t = modeloPlanta(a.especie, varianteDe(a)).tronco, e = escalaDe(a), c = Math.cos(a.giro || 0), s = Math.sin(a.giro || 0);
    if (!t) return { arriba: altoDe(a) * 0.5, en: () => ({ x: a.x - ox, z: a.z - oz, r: 0.3 * e }) };
    return { arriba: t.arriba * e, en: (h) => { const p = t.perfil(h / e); return { x: a.x - ox + (p.x * c + p.z * s) * e, z: a.z - oz + (-p.x * s + p.z * c) * e, r: p.r * e }; } };
  };
  // todas las de las baldosas cercanas en UNA malla por material (2 llamadas de dibujo, no 2 por baldosa):
  // se rehace al cambiar los árboles o las baldosas cercanas (al moverse la cámara a otra zona)
  let mallas = [], colgantes = [], sitios = [], firma = '', medidas = { lianas: 0, triangulos: 0 };
  function echar(S, l) {
    const r = azarDe('liana:' + l.id), suelo = (x, z) => cima(x + ox, z + oz);
    if (l.tipo === 'colgante') {
      const a = l.a, o = l.b, ya = cima(a.x, a.z), yb = cima(o.x, o.z), ha = altoDe(a) * l.fa, hb = altoDe(o) * l.fb;
      // cada extremo en una rama: desde el tronco, un poco hacia el otro árbol
      const dx = o.x - a.x, dz = o.z - a.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const ca = troncoDe(a).en(ha), cb = troncoDe(o).en(hb), sa = ca.r + Math.min(1.4, d * 0.18), sb = cb.r + Math.min(1.4, d * 0.18);
      const pa = new THREE.Vector3(ca.x + ux * sa, ya + ha, ca.z + uz * sa), pb = new THREE.Vector3(cb.x - ux * sb, yb + hb, cb.z - uz * sb);
      // (las del río, algo tensas: por ellas cruzan los que trepan; las otras, en bucle hasta l.bajo m del suelo)
      const caida = l.rio ? Math.max(0.3, Math.min(3.5, 0.8 + d * 0.15, (pa.y + pb.y) / 2 - cima((a.x + o.x) / 2, (a.z + o.z) / 2) - 1.8)) : Math.max(0.8, (pa.y + pb.y) / 2 - (cima((a.x + o.x) / 2, (a.z + o.z) / 2) + l.bajo));
      lianaColgante(S, r, pa, pb, caida, { suelo });
      const t = 0.5, mx = pa.x + (pb.x - pa.x) * t, mz = pa.z + (pb.z - pa.z) * t;
      sitios.push({ id: l.id, tipo: l.rio ? 'rio' : 'colgante', x: mx + ox, y: (pa.y + pb.y) / 2 - caida, z: mz + oz });
      // (las del río, para dibujar encima a los que cruzan por ellas: en coordenadas del mundo)
      if (l.rio) colgantes.push({ ax: pa.x + ox, ay: pa.y, az: pa.z + oz, bx: pb.x + ox, by: pb.y, bz: pb.z + oz, caida });
    } else if (l.tipo === 'cortina') {
      const a = l.arbol;
      const t = troncoDe(a), p = lianaCortina(S, r, a.x - ox, cima(a.x, a.z), a.z - oz, t.arriba, t.en, { suelo });
      sitios.push({ id: l.id, tipo: 'cortina', x: p.x + ox, y: cima(p.x + ox, p.z + oz) + 1.5, z: p.z + oz, arbol: { x: a.x, z: a.z } });
    } else {
      const a = l.arbol, y = cima(a.x, a.z);
      const t = troncoDe(a), p = lianaTrepando(S, r, l.tipo, a.x - ox, y, a.z - oz, t.arriba + 0.4, t.en, { suelo });
      sitios.push({ id: l.id, tipo: l.tipo, x: p.x + ox, y: p.y, z: p.z + oz, arbol: { x: a.x, z: a.z }, rafflesia: !!l.rafflesia });
      if (l.rafflesia) { const ang = r() * Math.PI * 2, d = t.en(0.2).r + 0.9; rafflesiaEn(S, r, a.x - ox + Math.cos(ang) * d, cima(a.x + Math.cos(ang) * d, a.z + Math.sin(ang) * d), a.z - oz + Math.sin(ang) * d); }
    }
  }
  function quitarTodo() { for (const m of mallas) { escena.remove(m); m.geometry.dispose(); } mallas = []; colgantes = []; sitios = []; }
  function construir(bs) {
    quitarTodo();
    const S = new SacoP(0);
    let n = 0, tri = 0;
    for (const b of bs) for (const l of b.lianas || []) { echar(S, l); n++; }
    for (const [tipo, g] of Object.entries(S.geometrias({ juntarCartas: true, juntarTodo: true }))) {
      const mt = material(tipo), malla = new THREE.Mesh(g, mt.m);
      malla.customDepthMaterial = mt.s; malla.castShadow = tipo !== 'brillo'; malla.receiveShadow = true;
      g.computeBoundingSphere();
      tri += (g.index ? g.index.count : g.attributes.position.count) / 3;
      escena.add(malla); mallas.push(malla);
    }
    medidas = { lianas: n, triangulos: tri };
  }
  return {
    get medidas() { return medidas; },
    // dónde está cada una (en coordenadas del mundo): para las pruebas y las fotos
    get sitios() { return sitios; },
    // cada fotograma: si han cambiado las baldosas cerca de la cámara (mundo), se rehace
    actualizar(x, z) {
      const bs = [...mapa.baldosasCerca(x, z, RADIO_CERCA)], f = bs.map((b) => b.bi * 100000 + b.bj).join(',');
      if (f === firma) return false;
      firma = f; construir(bs);
      return true;
    },
    // los árboles han cambiado (día nuevo): se rehacen en el siguiente fotograma
    cambiado() { firma = ''; },
    *mallas() { yield* mallas; },
    // la altura de una liana del río en (x, z) del mundo, si se está sobre ella (a menos de 0,8 m), o null
    alturaEn(x, z) {
      for (const c of colgantes) {
        const ux = c.bx - c.ax, uz = c.bz - c.az, l2 = ux * ux + uz * uz, k = ((x - c.ax) * ux + (z - c.az) * uz) / l2;
        if (k < 0 || k > 1 || Math.hypot(c.ax + ux * k - x, c.az + uz * k - z) > 0.8) continue;
        return c.ay + (c.by - c.ay) * k - c.caida * 4 * k * (1 - k);
      }
      return null;
    },
  };
}
