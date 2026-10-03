import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Rejilla } from '../motor/core/rejilla.js';
const casos = JSON.parse(readFileSync(new URL('../datos/vectores/rejilla.json', import.meta.url)));
test('rejilla: centroides y distancias como shapely/scipy', () => {
  for (const [[grid_type, cell_area, cell_nx, cell_ny, xoff, yoff], cent, dist] of casos) {
    const g = new Rejilla({ grid_type, cell_area, cell_nx, cell_ny, xoff, yoff });
    g.populateDistances();
    assert.deepEqual(g.centroids.map((c) => c.map((v) => (Object.is(v, -0) ? 0 : v))), cent.map((c) => c.map((v) => (Object.is(v, -0) ? 0 : v))), grid_type);
    assert.deepEqual(Array.from(g._distances), dist, grid_type + ' dist');
  }
});
