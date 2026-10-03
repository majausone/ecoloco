// Corre un escenario y saca cada cierto número de pasos los individuos de cada grupo
// funcional, la biomasa vegetal y lo comido. Sirve para ver si el ecosistema se sostiene.
//
// Uso: node herramientas/poblaciones.mjs <escenario.json> [--pasos N] [--cada K]
//        [--corregido] [--semilla 1] [--csv salida.csv] [--set ruta=valor ...]
//   --corregido   activa todas las correcciones del fallo de los herbívoros
//   --set         cambia un valor de la configuración, p. ej. --set animal.constants.tau_f=0.6
import { readFileSync, writeFileSync } from 'node:fs';
import { Simulacion } from '../motor/simulacion.js?v=202610032043';
import { activarCorrecciones } from '../motor/correcciones.js?v=202610032043';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const escenario = JSON.parse(readFileSync(args[0], 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));

if (args.includes('--corregido')) activarCorrecciones(escenario);
args.forEach((a, i) => {
  if (a !== '--set') return;
  const [ruta, valor] = args[i + 1].split('=');
  const partes = ruta.split('.');
  let o = escenario.config;
  for (const p of partes.slice(0, -1)) o = o[p];
  o[partes[partes.length - 1]] = JSON.parse(valor);
});
const pasos = Number(opt('--pasos', 1e9)), cada = Number(opt('--cada', 1));
const sim = new Simulacion(escenario, { semilla: Number(opt('--semilla', 1)), meta, guardarSalidas: false });
sim.inicializar();
const am = sim.modelos.animal;
const grupos = am.functional_groups.map((g) => g.name);
const filas = [];
const t0 = performance.now();
const foto = () => {
  const ind = Object.fromEntries(grupos.map((g) => [g, 0]));
  for (const c of am.active_cohorts.values()) ind[c.fg.name] += c.individuals;
  const veg = sim.data.get('subcanopy_vegetation_cnp').data;
  let sv = 0;
  for (let i = 0; i < veg.length; i += 3) sv += veg[i];
  const fol = sim.data.get('canopy_foliage_cnp').data;
  let sf = 0;
  for (let i = 0; i < fol.length; i += 3) sf += fol[i];
  return { paso: sim.time_index, ...ind, cohortes: am.active_cohorts.size, sotobosque_kgC_m2: sv / sim.grid.n_cells, follaje_kgC: sf };
};
filas.push(foto());
console.log(['paso', 'cohortes', ...grupos.map((g) => g.slice(0, 12))].join('\t'));
const imprimir = (f) => console.log([f.paso, f.cohortes, ...grupos.map((g) => f[g])].join('\t'));
imprimir(filas[0]);
let k = 0;
while (!sim.terminada && k < pasos) {
  sim.paso();
  k++;
  if (k % cada === 0 || sim.terminada) { const f = foto(); filas.push(f); imprimir(f); }
}
console.log(`${k} pasos en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
if (opt('--csv')) {
  const cols = Object.keys(filas[0]);
  writeFileSync(opt('--csv'), [cols.join(','), ...filas.map((f) => cols.map((c) => f[c]).join(','))].join('\n') + '\n');
}
