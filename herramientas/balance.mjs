// Balance de cada grupo funcional durante unos pasos: lo que asimila frente a lo que gasta,
// cuántos mueren cazados y cuántos de muerte natural, y cómo va su masa frente a la adulta.
// Para encontrar qué grupo se hunde y por qué.
//
// Uso: node herramientas/balance.mjs <escenario.json> [--pasos N] [--corregido] [--set ruta=valor ...]
import { readFileSync } from 'node:fs';
import { Simulacion } from '../motor/simulacion.js?v=202610060036';
import { activarCorrecciones } from '../motor/correcciones.js?v=202610060036';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const escenario = JSON.parse(readFileSync(args[0], 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
if (args.includes('--corregido')) activarCorrecciones(escenario);
args.forEach((a, i) => {
  if (a !== '--set') return;
  const [ruta, valor] = args[i + 1].split('=');
  const p = ruta.split('.');
  let o = escenario.config;
  for (const k of p.slice(0, -1)) o = o[k];
  o[p[p.length - 1]] = JSON.parse(valor);
});
const sim = new Simulacion(escenario, { semilla: 1, meta, guardarSalidas: false });
sim.inicializar();
const am = sim.modelos.animal;
const B = {};
const red = {}; // depredador -> presa -> individuos
const g = (c) => (B[c.fg.name] ||= { ini: 0, fin: 0, asim: 0, gasto: 0, indDias: 0, cazados: 0, naturales: 0, nacidos: 0, masaRel: 0, n: 0 });
for (const c of am.active_cohorts.values()) g(c).ini += c.individuals;
const P = Object.getPrototypeOf([...am.active_cohorts.values()][0]);
const { grow, metabolize, getEaten, dieIndividual } = P;
P.grow = function (ing) { g(this).asim += ing.C + ing.N + ing.P; return grow.call(this, ing); };
P.metabolize = function (T, d) { const r = metabolize.call(this, T, d); g(this).gasto += r.C + r.N + r.P; g(this).indDias += this.individuals * d; return r; };
P.getEaten = function (...a) { const n0 = this.individuals; const r = getEaten.apply(this, a); const n = n0 - this.individuals; g(this).cazados += n; if (n) { const f = (red[a[1].fg.name] ||= {}); f[this.fg.name] = (f[this.fg.name] || 0) + n; } return r; };
P.dieIndividual = function (n, p) { g(this).naturales += n; return dieIndividual.call(this, n, p); };
const crear = am.createNewCohort.bind(am);
am.createNewCohort = (fg, m, a, ind, c, nac) => { const r = crear(fg, m, a, ind, c, nac); if (nac) g(r).nacidos += ind; return r; };
const pasos = Number(opt('--pasos', 30));
for (let k = 0; k < pasos && !sim.terminada; k++) sim.paso();
for (const c of [...am.active_cohorts.values(), ...am.migrated_cohorts.values(), ...am.aquatic_cohorts.values()]) {
  const o = g(c); o.fin += c.individuals; o.masaRel += c.mass / c.fg.adult_mass * c.individuals; o.n += c.individuals;
}
console.log('grupo'.padEnd(31), 'inicio', 'final', 'asim/gasto', 'cazados', 'natural', 'nacidos', 'masa/adulta');
for (const [n, o] of Object.entries(B)) {
  const r = o.gasto > 0 ? (o.asim / o.gasto).toFixed(2) : '-';
  console.log(n.padEnd(31), String(o.ini).padStart(6), String(o.fin).padStart(5), r.padStart(10), String(o.cazados).padStart(7),
    String(o.naturales).padStart(7), String(o.nacidos).padStart(7), (o.n ? o.masaRel / o.n : 0).toFixed(2).padStart(11));
}
if (args.includes('--red')) {
  console.log('');
  console.log('quién se come a quién (individuos):');
  for (const [d, f] of Object.entries(red)) console.log(' ', d.padEnd(31), Object.entries(f).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}:${n}`).join('  '));
}
