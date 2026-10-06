// Calibra el multiplicador de la tasa de búsqueda de cada grupo funcional
// (search_rate_multiplier) para que, a la densidad del escenario, cada grupo empiece
// asimilando un poco más de lo que gasta (OBJETIVO). No hay tasas de ataque medidas para
// cada grupo de Maliau: así se fija un valor coherente con la densidad que se le da.
//
// Repite: corre DIAS días desde el inicio con las correcciones, mide asimilado/gasto por
// grupo y corrige multiplicador *= (OBJETIVO / razón)^0.8, hasta que todos estén cerca.
// Si un grupo no come nada (razón 0, p. ej. porque las capturas al azar aún no han salido),
// se le multiplica por 30.
//
// Uso: node herramientas/calibrar_busqueda.mjs <escenario.json> <salida.json> [--dias 10] [--vueltas 6] [--objetivo 1.5]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Simulacion } from '../motor/simulacion.js?v=202610060036';
import { activarCorrecciones } from '../motor/correcciones.js?v=202610060036';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const base = JSON.parse(readFileSync(args[0], 'utf8'));
const salida = args[1];
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const DIAS = Number(opt('--dias', 10)), VUELTAS = Number(opt('--vueltas', 6)), OBJ = Number(opt('--objetivo', 1.5));

function medir(mult) {
  const esc = activarCorrecciones(structuredClone(base));
  const t = esc.tablas.grupos_animales;
  if (!t.columnas.includes('search_rate_multiplier')) { t.columnas.push('search_rate_multiplier'); t.dtypes.search_rate_multiplier = 'float64'; }
  t.datos.search_rate_multiplier = t.datos.name.map((n) => mult[n] ?? 1);
  const sim = new Simulacion(esc, { semilla: 1, meta, guardarSalidas: false });
  sim.inicializar();
  const am = sim.modelos.animal;
  const B = {};
  const g = (c) => (B[c.fg.name] ||= { asim: 0, gasto: 0 });
  const P = Object.getPrototypeOf([...am.active_cohorts.values()][0]);
  const { grow, metabolize } = P;
  P.grow = function (ing) { g(this).asim += ing.C + ing.N + ing.P; return grow.call(this, ing); };
  P.metabolize = function (T, d) { const r = metabolize.call(this, T, d); g(this).gasto += r.C + r.N + r.P; return r; };
  try { for (let k = 0; k < DIAS; k++) sim.paso(); } finally { P.grow = grow; P.metabolize = metabolize; }
  return Object.fromEntries(Object.entries(B).map(([n, o]) => [n, o.gasto > 0 ? o.asim / o.gasto : NaN]));
}

const mult = existsSync(salida) ? JSON.parse(readFileSync(salida, 'utf8')).multiplicadores : {};
for (const n of base.tablas.grupos_animales.datos.name) mult[n] ??= 1;
let razones;
for (let v = 0; v < VUELTAS; v++) {
  razones = medir(mult);
  const lin = [];
  for (const [n, r] of Object.entries(razones)) {
    if (r === 0) { mult[n] *= 30; lin.push(`${n}: 0 (×30)`); continue; }
    if (!(r > 0)) { lin.push(`${n}: sin datos`); continue; }
    const f = Math.min(30, Math.max(1 / 30, (OBJ / r) ** 0.8));
    mult[n] *= f;
    lin.push(`${n}: ${r.toFixed(2)}`);
  }
  console.log(`vuelta ${v + 1}: ${lin.join(' | ')}`);
}
razones = medir(mult);
writeFileSync(salida, JSON.stringify({ objetivo: OBJ, dias: DIAS, multiplicadores: mult, razon_final: razones }, null, 1));
console.log('final:', Object.entries(razones).map(([n, r]) => `${n} ${r.toFixed(2)} (×${mult[n].toPrecision(3)})`).join('\n       '));
