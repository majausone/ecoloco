// Cuánto cuesta el mundo vivo según su tamaño (km²): para cada tamaño, unos días con el
// esfuerzo de ×1 (2 semillas, 1 pasada del director) y el de ×600 (1 y 1), y se apunta lo que
// tarda un día (el motor y los animales por separado), cuántos animales se simulan uno a uno
// (vertebrados e invertebrados) y cuántos vertebrados hay en el mundo según el motor.
//
// Uso: node herramientas/mundo_escalas.mjs [--km2 0.6561,1,10,100,1000] [--dias 3]
import { readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610052309';
import { reiniciarIds } from '../mundo/agentes.js?v=202610052309';
import { VERTEBRADOS } from '../mundo/especies.js?v=202610052309';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const KM2 = opt('--km2', '0.6561,1,10,100,1000').split(',').map(Number);
const DIAS = Number(opt('--dias', 3));
const texto = readFileSync(new URL('../datos/escenarios/maliau.json', import.meta.url), 'utf8');
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
console.log('| mundo | arranque | día a ×1 (motor + animales) | día a ×600 | vertebrados uno a uno | invertebrados (representantes) | vertebrados en el mundo |');
console.log('|---:|---:|---:|---:|---:|---:|---:|');
for (const km2 of KM2) {
  reiniciarIds();
  const t0 = performance.now();
  const m = new Mundo(JSON.parse(texto), meta, { km2, semillasPorDia: 2, pasadasDirector: 1 });
  const arranque = (performance.now() - t0) / 1000;
  // el motor por su lado
  let motor = 0;
  const paso = m.puente.paso.bind(m.puente);
  m.puente.paso = () => { const a = performance.now(); const r = paso(); motor += (performance.now() - a) / 1000; return r; };
  const medir = (n) => { motor = 0; let tot = 0, vert = 0, reps = 0; for (let i = 0; i < n; i++) { const r = m.siguienteDia(); tot += r.medida.segundos; vert += r.medida.vertebrados; reps += r.medida.animales - r.medida.vertebrados; } return { tot: tot / n, motor: motor / n, vert: vert / n, reps: reps / n }; };
  m.siguienteDia(); // el primero, aparte (calienta)
  const normal = medir(DIAS);
  m.semillasPorDia = 1; m.pasadasDirector = 1;
  const rapido = medir(DIAS);
  let enMundo = 0;
  for (const c of m.puente.cohortes()) if (c.estado === 'activa' && VERTEBRADOS.has(c.grupo)) enMundo += c.n;
  const f = (x) => x.toFixed(2).replace('.', ',');
  console.log(`| ${km2 < 1 ? f(km2) : km2} km² | ${f(arranque)} s | ${f(normal.tot)} s (${f(normal.motor)} + ${f(normal.tot - normal.motor)}) | ${f(rapido.tot)} s | ${Math.round(normal.vert)} | ${Math.round(normal.reps)} | ${Math.round(enMundo).toLocaleString('es')} |`);
}
