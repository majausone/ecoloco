// Que las mallas suaves de los animales (graficos/pruebas-morta/borneo/suavizar.js) tengan los triángulos
// girados hacia fuera, como su normal: con el material de una sola cara (FrontSide), si el orden de los
// vértices va al revés three.js esconde la piel que mira a la cámara y pinta la de detrás vista por dentro
// (se le veía la cara a un animal de espaldas). Recorre las 33 especies: la malla entera (con las piezas
// finas: alas, élitros, lengua, ojos) y la ligera; como mucho un 2 % fuera (degenerados y pliegues).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIMALES } from '../graficos/pruebas-morta/borneo/especies.js?v=202610060036';
import { crearAnimal } from '../graficos/pruebas-morta/borneo/animales-cubos.js?v=202610060036';
import { suavizar } from '../graficos/pruebas-morta/borneo/suavizar.js?v=202610060036';
import { objetivosDe } from '../graficos/pruebas-morta/borneo/suavizar-datos.js?v=202610060036';

export function giro(g) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array;
  let bien = 0, mal = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (Math.hypot(cx, cy, cz) < 1e-12) continue; // (degenerado)
    const d = cx * (N[a] + N[b] + N[c]) + cy * (N[a + 1] + N[b + 1] + N[c + 1]) + cz * (N[a + 2] + N[b + 2] + N[c + 2]);
    if (d >= 0) bien++; else mal++;
  }
  return { bien, mal };
}

test('los triángulos de los animales suaves miran hacia fuera (como su normal)', () => {
  const fallos = [];
  for (const e of ANIMALES) {
    const m = crearAnimal(e), s = suavizar(m, objetivosDe(m));
    for (const [nombre, g] of [['entera', s.geo0], ['ligera', s.geo1]]) {
      const { bien, mal } = giro(g);
      if (mal > (bien + mal) * 0.02) fallos.push(`${e.id} (${nombre}): ${mal} de ${bien + mal} al revés`);
    }
  }
  assert.deepEqual(fallos, []);
});
