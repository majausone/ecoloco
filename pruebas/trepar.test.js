// Los que trepan van por el árbol y no por el aire: suben y bajan solo junto a un tronco (sin moverse
// en horizontal a la vez), en el suelo se les ve andando y en el árbol trepando. Necesita
// datos/escenarios/maliau.json; si no está, se salta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610060010';
import { reiniciarIds } from '../mundo/agentes.js?v=202610060010';
import { COMPORTAMIENTO, ESTADOS } from '../mundo/especies.js?v=202610060010';
import { CLAVE } from '../mundo/dia.js?v=202610060010';

const RUTA = new URL('../datos/escenarios/maliau.json', import.meta.url);
const leer = (r) => JSON.parse(readFileSync(r, 'utf8'));

test('los que trepan suben y bajan por el tronco, no por el aire', { skip: !existsSync(RUTA) }, () => {
  reiniciarIds();
  const m = new Mundo(leer(RUTA), leer(new URL('../motor/meta/metadatos.json', import.meta.url)), { semilla: 1, semillasPorDia: 2, pasadasDirector: 1 });
  let tramos = 0, diagonales = 0, lejosTronco = 0, andaAire = 0, trepaSuelo = 0;
  for (let d = 0; d < 2; d++) {
    const r = m.siguienteDia();
    for (const [id, k] of r.claves) {
      if (COMPORTAMIENTO[m.agentes.get(id)?.especieId]?.mueve !== 'arboreo') continue;
      for (let i = 1; i < k.length / CLAVE; i++) {
        const o = i * CLAVE, p = o - CLAVE, est = ESTADOS[k[p + 5]];
        const dy = k[o + 2] - k[p + 2], dh = Math.hypot(k[o + 1] - k[p + 1], k[o + 3] - k[p + 3]);
        if (est === 'andar' && k[p + 2] > 0.5 && k[o + 2] > 0.5) andaAire++;
        if (est === 'trepar' && k[p + 2] < 0.1 && k[o + 2] < 0.1 && dh > 0.5) trepaSuelo++;
        if (Math.abs(dy) < 0.3) continue;
        tramos++;
        // (yendo en alto de un árbol a otro por una liana, que va en cuesta, la altura cambia mientras avanza: eso
        // no es subir por el aire; lo que no puede pasar es despegarse del suelo moviéndose en horizontal)
        if (dh > 0.5 && !(k[p + 2] > 1 && k[o + 2] > 1)) diagonales++;
        let cerca = Infinity;
        for (const t of m.mapa.arbolesCerca(k[p + 1], k[p + 3], 3)) cerca = Math.min(cerca, Math.hypot(t.x - k[p + 1], t.z - k[p + 3]));
        if (cerca > 0.8 && k[p + 2] < 0.3) lejosTronco++;
      }
    }
  }
  assert.ok(tramos > 50, `pocos tramos de trepar (${tramos})`);
  assert.deepEqual({ diagonales, lejosTronco, andaAire, trepaSuelo }, { diagonales: 0, lejosTronco: 0, andaAire: 0, trepaSuelo: 0 });
});
