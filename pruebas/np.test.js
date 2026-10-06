// Comprueba las operaciones de motor/num/np.js contra numpy (datos/vectores/np.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as np from '../motor/num/np.js?v=202610060010';

const c = JSON.parse(readFileSync(new URL('../datos/vectores/np.json', import.meta.url)),
  (k, v) => (v === 'NaN' ? NaN : v));
const F = (a) => Float64Array.from(a);
const igual = (a, b, m) => assert.deepEqual(Array.from(a), b, m);

test('np.sum 1D', () => { for (const [a, s] of c.suma) assert.equal(np.suma(F(a)), s, `n=${a.length}`); });
test('np.sum por eje', () => {
  for (const [a, forma, eje, s] of c.sumaEje) igual(np.sumaEje(F(a), forma, eje).data, s, `${forma} eje ${eje}`);
});
test('np.dot vector·vector (ddot)', () => { for (const [x, y, d] of c.dot) assert.equal(np.ddot(F(x), F(y)), d, `n=${x.length}`); });
test('np.dot vector·matriz', () => {
  for (const [v, M, k, n, r] of c.dotVecMat) igual(np.dotVecMat(F(v), F(M), k, n), r, `k=${k} n=${n}`);
});
test('np.dot matriz·vector (dgemv)', () => {
  for (const [K, m, s, a, r] of c.dotMatVec) igual(np.dotMatVec(m, s, (i, j) => K[j * m + i], F(a)), r, `m=${m} s=${s}`);
});
test('np.gradient', () => { for (const [f, n, m, x, r] of c.grad) igual(np.gradienteEje0(F(f), n, m, F(x)), r); });
test('np.nanmean eje 0', () => { for (const [a, forma, eje, r] of c.nanmedia) igual(np.nanmediaEje(F(a), forma, eje).data, r); });
