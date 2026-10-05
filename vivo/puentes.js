/* LOS TRONCOS CAÍDOS DE ORILLA A ORILLA (mapa.puentes, mundo/mapa.js): por ellos cruzan el río los
   animales que no nadan. Cada uno, un tubo con curva, más largo que el río (algo hundido en las dos
   orillas), con la corteza llena de bultos, musgo por encima (donde mira hacia arriba, a manchas), la
   madera clara en los cortes de las puntas, un par de ramas rotas y hongos de repisa en los costados.
   alturaEn(x, z): la altura de su lomo en un punto (para que los animales anden por encima), o null. */

import * as THREE from '../graficos/pruebas-morta/vendor/three.module.js';
import { conTransparencia } from './transparencia.js?v=202610052309';
import { ruido2 } from '../graficos/pruebas-morta/escena-v3.js?v=202610052309';

const LADOS = 18, SOBRA = 1.1; // lados del tubo; metros de más por cada orilla (hundidos en la tierra)

export function crearPuentes({ escena, mapa, ox, oz, cima }) {
  const ruido = ruido2(31);
  const troncos = [];
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const corteza = [new THREE.Color('#3b2a1c'), new THREE.Color('#4e3a28'), new THREE.Color('#2e2219')];
  const musgo = [new THREE.Color('#33461c'), new THREE.Color('#465f22'), new THREE.Color('#2a3a16'), new THREE.Color('#58662a')];
  const madera = new THREE.Color('#9a7a52'), hongo = new THREE.Color('#c9a66b');
  // un tubo de radio variable a lo largo de una curva: centro(t) y radio(t, ángulo)
  const tubo = (centro, radio, n, tapas) => {
    const base = pos.length / 3, eje = new THREE.Vector3(), lado = new THREE.Vector3(), arriba = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = i / n, c0 = centro(Math.max(0, t - 0.01)), c1 = centro(Math.min(1, t + 0.01));
      eje.subVectors(c1, c0).normalize(); lado.crossVectors(eje, arriba).normalize();
      const sube = new THREE.Vector3().crossVectors(lado, eje).normalize(), m = centro(t);
      for (let j = 0; j < LADOS; j++) {
        const a = (j / LADOS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), r = radio(t, a);
        p.copy(m).addScaledVector(lado, ca * r).addScaledVector(sube, sa * r);
        pos.push(p.x, p.y, p.z);
        // el color: corteza, y musgo a manchas donde mira hacia arriba
        // (la corteza, a vetas a lo largo del tronco; el musgo, a manchas irregulares donde mira hacia arriba)
        const veta = 0.5 + 0.5 * Math.sin(a * 9 + ruido(t * 6, a) * 4), k = Math.min(0.999, ruido(p.x * 1.7 + p.y, p.z * 1.7) * 0.6 + veta * 0.4);
        const mancha = ruido(p.x * 1.3 + 9, p.z * 1.3) * 0.6 + ruido(p.x * 4.1, p.z * 4.1 + 3) * 0.4, mus = Math.max(0, sa + 0.15) * mancha;
        c.copy(corteza[Math.floor(k * 2.99)]).multiplyScalar(0.8 + 0.35 * veta);
        c.lerp(musgo[Math.floor(ruido(p.x * 3.1, p.z * 3.1 + 5) * 3.99)], Math.min(1, Math.max(0, (mus - 0.42) * 3)));
        if (tapas && (i === 0 || i === n)) c.lerp(madera, 0.35);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < LADOS; j++) {
      const a = base + i * LADOS + j, b = base + i * LADOS + ((j + 1) % LADOS), a2 = a + LADOS, b2 = b + LADOS;
      idx.push(a, a2, b, b, a2, b2);
    }
    // las tapas (el corte, de madera clara con sus anillos)
    if (tapas) for (const [i, s] of [[0, -1], [n, 1]]) {
      const m = centro(i / n), ci = pos.length / 3;
      pos.push(m.x, m.y, m.z); c.copy(madera).multiplyScalar(0.85); col.push(c.r, c.g, c.b);
      for (let j = 0; j < LADOS; j++) { const a = base + i * LADOS + j, b = base + i * LADOS + ((j + 1) % LADOS); if (s > 0) idx.push(ci, a, b); else idx.push(ci, b, a); }
    }
  };
  for (const p of mapa.puentes) {
    const ux = p.x1 - p.x0, uz = p.z1 - p.z0, L = Math.hypot(ux, uz), dx = ux / L, dz = uz / L;
    // los extremos (en las orillas) y su altura: la del suelo, algo hundido
    const ya = cima(p.x0, p.z0), yb = cima(p.x1, p.z1), r = p.radio;
    const yEje = (t) => ya + (yb - ya) * t + r * 0.7; // (el eje, con el tronco hundido un 30 % en las orillas)
    troncos.push({ p, ya, yb, r, yEje });
    const t0 = -SOBRA / L, t1 = 1 + SOBRA / L, comba = (ruido(p.x0, p.z0) - 0.5) * 0.25;
    const centro = (s) => {
      const t = t0 + (t1 - t0) * s;
      // (una curva suave: algo combado en el medio y torcido de lado)
      return new THREE.Vector3(p.x0 + ux * t - ox + -dz * Math.sin(s * Math.PI) * comba * L * 0.15, yEje(Math.min(1, Math.max(0, t))) - Math.sin(s * Math.PI) * 0.08, p.z0 + uz * t - oz + dx * Math.sin(s * Math.PI) * comba * L * 0.15);
    };
    // (con bultos y surcos de corteza a lo largo)
    const radio = (s, a) => r * (1 - 0.18 * s) * (0.9 + 0.16 * ruido(s * 14 + a * 1.3, a * 2.1 + p.x0) + 0.05 * Math.sin(a * 9 + ruido(s * 6, a) * 4));
    tubo(centro, radio, Math.max(12, Math.round(L * 4)), true);
    // dos ramas rotas y unos hongos de repisa
    for (const [s, ang, largo] of [[0.3, 0.9, 0.9], [0.68, -1.1, 0.6]]) {
      const m = centro(s), dir = new THREE.Vector3(-dz * Math.sin(ang), Math.cos(ang) * 0.8, dx * Math.sin(ang)).normalize();
      tubo((q) => m.clone().addScaledVector(dir, q * largo), (q) => r * 0.28 * (1 - q * 0.6), 4, true);
    }
    for (let k = 0; k < 4; k++) {
      const s = 0.25 + 0.5 * ruido(k * 3.3, p.z0), m = centro(s), ladoH = k % 2 ? 1 : -1;
      const n = new THREE.Vector3(-dz * ladoH, 0, dx * ladoH), q = m.clone().addScaledVector(n, r * 0.95).add(new THREE.Vector3(0, (ruido(k, 7) - 0.3) * r, 0));
      const base = pos.length / 3, rr = r * (0.35 + 0.25 * ruido(k, s));
      pos.push(q.x, q.y, q.z); c.copy(hongo).multiplyScalar(0.75); col.push(c.r, c.g, c.b);
      for (let j = 0; j <= 6; j++) {
        const a = -Math.PI / 2 + (j / 6) * Math.PI, v = new THREE.Vector3(dx, 0, dz).multiplyScalar(Math.sin(a) * rr).addScaledVector(n, Math.cos(a) * rr * 0.8);
        pos.push(q.x + v.x, q.y + 0.02, q.z + v.z); c.copy(hongo).multiplyScalar(0.9 + 0.2 * (j % 2)); col.push(c.r, c.g, c.b);
      }
      for (let j = 0; j < 6; j++) idx.push(base, base + 1 + j, base + 2 + j, base, base + 2 + j, base + 1 + j);
    }
  }
  let malla = null;
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    malla = new THREE.Mesh(g, conTransparencia(new THREE.MeshLambertMaterial({ vertexColors: true }), { margenExtra: 0.5 }));
    malla.castShadow = true; malla.receiveShadow = true;
    escena.add(malla);
  }
  return {
    malla,
    triangulos: idx.length / 3,
    // la altura del lomo del tronco en (x, z) del mundo, si se está encima (a menos de su radio de su eje)
    alturaEn(x, z) {
      const e = mapa.puenteEn(x, z, 0.15);
      if (!e) return null;
      const t = troncos.find((q) => q.p === e.p);
      return t ? t.yEje(e.t) + t.r * 0.95 : null;
    },
  };
}
