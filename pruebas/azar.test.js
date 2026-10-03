// Comprueba que los generadores aleatorios del motor reproducen exactamente los de Python/numpy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PyRandom, RandomState } from '../motor/azar/mt19937.js?v=202610032007';
import { Generator } from '../motor/azar/pcg64.js?v=202610032007';

const ref = JSON.parse(readFileSync(new URL('../datos/vectores/azar.json', import.meta.url)));
const igual = (a, b, m) => assert.deepEqual(Array.from(a), b, m);

test('random de Python', () => {
  let r = new PyRandom(12345); igual(ref.py_random.map(() => r.random()), ref.py_random);
  r = new PyRandom(2n ** 40n + 7n); igual(ref.py_random_big.map(() => r.random()), ref.py_random_big);
  r = new PyRandom(99); const seq = Array.from({ length: 37 }, (_, i) => i);
  igual(ref.py_choice.map(() => r.choice(seq)), ref.py_choice);
});
test('RandomState: random_sample, normal', () => {
  let rs = new RandomState(42); igual(ref.np_random.map(() => rs.random_sample()), ref.np_random);
  rs = new RandomState(7); igual(ref.np_normal.map(() => rs.normal(0.1, 0.02)), ref.np_normal);
});
test('RandomState: binomial', () => {
  const rs = new RandomState(3);
  igual(ref.np_binomial_cases.map(([n, p]) => Array.from({ length: 20 }, () => rs.binomial(n, p))), ref.np_binomial);
  const rs2 = new RandomState(11); igual(rs2.binomial([5, 10, 0, 300, 7], 0.0087), ref.np_binomial_arr);
});
test('RandomState: choice', () => {
  const rs = new RandomState(5); const a = Array.from({ length: 81 }, (_, i) => i);
  igual([1, 5, 30, 81].map((k) => rs.choiceSinReemplazo(a, k)), ref.np_choice_norep);
  igual(rs.choiceConReemplazo(a, 40), ref.np_choice_rep);
  const w = [0.2, 0.01, 0.5, 0.3, 0.05]; const s = w.reduce((x, y) => x + y); const p = w.map((v) => v / s);
  igual(ref.np_choice_p.map(() => rs.choiceConPesos([0, 1, 2, 3, 4], p)), ref.np_choice_p);
});
test('Generator (PCG64): random, gamma, normal, exponential', () => {
  let g = new Generator(123456789);
  igual(ref.gen_random.map(() => g.random()), ref.gen_random);
  igual(g.gamma(1.5, 1.0, 3000), ref.gen_gamma);
  g = new Generator(2n ** 70n + 3n); igual(g.gamma(0.6, 2.0, 500), ref.gen_gamma2);
  g = new Generator(5); igual(ref.gen_normal.map(() => g.standardNormal()), ref.gen_normal);
  g = new Generator(6); igual(ref.gen_exp.map(() => g.standardExponential()), ref.gen_exp);
});
