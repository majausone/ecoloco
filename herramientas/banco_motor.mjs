// Banco del motor: tiempos y huellas bit a bit de varias pasadas (Encargo 5: acelerar sin cambiar ni un bit).
//   node herramientas/banco_motor.mjs [casos...] [--guardar] [--veces 1]
// Casos: mensual (el ejemplo, 24 pasos), diario (731), simple, bio, clima, rejilla y maliau (los primeros 60
// días; con caso:N, los primeros N días, p. ej. diario:60). Para cada uno: ms de init, ms de todos los pasos y ms por paso (el mejor de
// --veces pasadas), y las huellas sha256 de todas las salidas (entradas, estado inicial, cada variable en cada
// paso y los CSV: herramientas/huellas.mjs) resumidas en una sola.
// --guardar: las deja como referencia en datos/referencia/motor_banco.json (solo con una pasada que la suite
// Python-contra-JS haya dado por idéntica al original). Sin --guardar, compara con esa referencia y devuelve 1
// si alguna huella cambia.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Simulacion } from '../motor/simulacion.js?v=202610052338';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const GUARDAR = args.includes('--guardar'), VECES = Number(opt('--veces', 1));
const TODOS = ['mensual', 'diario', 'simple', 'bio', 'clima', 'rejilla', 'maliau'];
const casos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && (args[i - 1] === '--veces' || args[i - 1] === '--uno')));
const REF = new URL('../datos/referencia/motor_banco.json', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const leer = (n) => JSON.parse(readFileSync(new URL(`../datos/escenarios/${n}.json`, import.meta.url), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
// (bit a bit, salvo los NaN, que cuentan todos como uno, como en el comparador con el Python: V8 da NaN con el
// bit de signo puesto o no según tenga la función ya optimizada o no, y eso cambia entre una pasada y otra)
const hArr = (a) => {
  const d = a.data;
  if (d instanceof Float64Array) { let hay = false; for (let i = 0; i < d.length; i++) if (d[i] !== d[i]) { hay = true; break; } if (hay) { const c = Float64Array.from(d); for (let i = 0; i < c.length; i++) if (c[i] !== c[i]) c[i] = NaN; const u = new BigUint64Array(c.buffer); for (let i = 0; i < u.length; i++) if (c[i] !== c[i]) u[i] = 0x7ff8000000000000n; return sha(new Uint8Array(c.buffer)); } }
  return sha(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
};

function pasada(nombre) {
  const [base, n] = nombre.split(':');
  const esc = leer(base);
  // (maliau, los primeros 60 días; y caso:N, los primeros N pasos de días)
  if (base === 'maliau' || n) esc.config.core.timing.run_length = `${Number(n || 60)} days`;
  const t0 = performance.now();
  const sim = new Simulacion(esc, { semilla: 1, meta });
  sim.inicializar();
  const t1 = performance.now();
  while (!sim.terminada) sim.paso();
  const t2 = performance.now();
  // las huellas: como herramientas/huellas.mjs, y una que las resume todas (en orden fijo)
  const h = { inputs: {}, init: {}, outputs: {}, csv: {} };
  for (const [k, a] of sim.entradas) h.inputs[k] = hArr(a);
  for (const [k, a] of sim.estadoInicial) h.init[k] = hArr(a);
  for (const [k, serie] of sim.salidas) h.outputs[k] = serie.map(hArr);
  for (const [k, l] of Object.entries(sim.csv())) h.csv[k] = sha(l.join('\r\n') + '\r\n');
  const todo = sha(JSON.stringify(['inputs', 'init', 'outputs', 'csv'].map((g) => Object.keys(h[g]).sort().map((k) => [k, h[g][k]]))));
  return { pasos: sim.time_index, msInit: t1 - t0, msPasos: t2 - t1, huella: todo, h };
}

// (cada caso, en su propio proceso: una simulación deja estado en los módulos que cambia la siguiente del mismo
// proceso, también con el motor de antes del encargo; p. ej. mensual después de diario:60 sale distinto)
if (args.includes('--uno')) { console.log(JSON.stringify(pasada(args[args.indexOf('--uno') + 1]))); process.exit(0); }
const enProceso = (c) => JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=8192', fileURLToPath(import.meta.url), '--uno', c], { maxBuffer: 1 << 30, encoding: 'utf8' }));
const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, 'utf8')) : {};
const filas = [];
let mal = 0;
for (const c of casos.length ? casos : TODOS) {
  if (!existsSync(new URL(`../datos/escenarios/${c.split(':')[0]}.json`, import.meta.url))) { console.log(`(sin datos/escenarios/${c}.json)`); continue; }
  let mejor = null;
  for (let v = 0; v < VECES; v++) { const r = enProceso(c); if (!mejor || r.msPasos < mejor.msPasos) mejor = { ...r, huella: r.huella, h: r.h }; if (mejor.huella !== r.huella) { console.log('¡no determinista!', c); mal++; } }
  const r = mejor, R = ref[c];
  let estado = 'sin referencia';
  if (R) {
    estado = R.huella === r.huella ? 'idéntico' : 'DISTINTO';
    if (R.huella !== r.huella) {
      mal++;
      // (dónde: la primera variable y paso que cambian)
      for (const g of ['inputs', 'init', 'csv']) for (const [k, x] of Object.entries(R.h[g])) if (r.h[g][k] !== x) { estado += ` (${g}/${k})`; break; }
      for (const [k, xs] of Object.entries(R.h.outputs)) { const t = xs.findIndex((x, i) => r.h.outputs[k]?.[i] !== x); if (t >= 0) { estado += ` (outputs/${k}, paso ${t})`; break; } }
    }
  }
  if (GUARDAR) ref[c] = { pasos: r.pasos, huella: r.huella, h: r.h, msInit: Math.round(r.msInit), msPasos: Math.round(r.msPasos) };
  filas.push({ caso: c, pasos: r.pasos, msInit: Math.round(r.msInit), msPasos: Math.round(r.msPasos), msPorPaso: +(r.msPasos / r.pasos).toFixed(1), antesMsPasos: R?.msPasos, estado });
}
console.table(filas);
if (GUARDAR) { writeFileSync(REF, JSON.stringify(ref)); console.log('referencia guardada en datos/referencia/motor_banco.json'); }
process.exit(mal ? 1 : 0);
