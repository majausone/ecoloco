import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PySet, hashPy } from '../motor/num/pyset.js?v=202610060010';
const casos = JSON.parse(readFileSync(new URL('../datos/vectores/pyset.json', import.meta.url)));
test('hash de str como CPython con PYTHONHASHSEED=0', () => assert.equal(hashPy('plants'), 2081799259051479400n));
test('orden de iteración de set como CPython 3.12', () => {
  for (const [ops, esperado] of casos) {
    let s = new PySet();
    for (const [op, v] of ops) {
      if (op === 'add') s.add(v); else if (op === 'discard') s.discard(v);
      else if (op === 'or') s = s.or(new PySet(v)); else s = s.and(new PySet(v));
    }
    assert.deepEqual(s.toArray(), esperado, JSON.stringify(ops));
  }
});
