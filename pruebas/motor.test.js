// Pasada completa del ejemplo (2 años, mensual) contra las huellas de referencia
// (datos/referencia/ejemplo_huellas.json), generadas de una pasada que la suite
// Python-contra-JS (herramientas/suite.py) dio por idéntica bit a bit al original.
// Tarda ~20 s. La comparación de verdad contra el original es herramientas/suite.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { huellas } from '../herramientas/huellas.mjs';

const leer = (r) => JSON.parse(readFileSync(new URL(r, import.meta.url), 'utf8'));

test('el ejemplo mensual da exactamente las mismas salidas que el original', () => {
  const ref = leer('../datos/referencia/ejemplo_huellas.json');
  const r = huellas(leer('../datos/escenarios/ejemplo.json'), leer('../motor/meta/metadatos.json'), 1);
  assert.equal(r.pasos, ref.pasos);
  for (const g of ['inputs', 'init', 'csv']) {
    for (const [k, h] of Object.entries(ref[g])) assert.equal(r[g][k], h, `${g}/${k} distinto`);
  }
  for (const [k, hs] of Object.entries(ref.outputs)) {
    hs.forEach((h, t) => assert.equal(r.outputs[k]?.[t], h, `outputs/${k} distinto en el paso ${t}`));
  }
});
