// Corre el motor JS junto a un volcado del oráculo y compara TODAS las variables tras
// cada init y cada actualización de cada módulo. Los módulos no portados se sustituyen
// con los datos del oráculo, así cada módulo portado se comprueba por separado.
//
// Uso: node herramientas/comparar_volcado.mjs <escenario.json> <dir volcado> [--semilla 1]
//        [--pasos N] [--seguir] [--solo modulo]
import { readFileSync } from 'node:fs';
import { Simulacion } from '../motor/simulacion.js?v=202610032115';
import { Volcado } from './volcado.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const escenario = JSON.parse(readFileSync(args[0], 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const vol = new Volcado(args[1]);
const semilla = Number(opt('--semilla', 1));
const pasos = Number(opt('--pasos', 1e9));
const seguir = args.includes('--seguir');

function ulps(a, b) {
  const f = new Float64Array([a, b]); const i = new BigInt64Array(f.buffer);
  const conv = (x) => (x < 0n ? -(x + (1n << 63n)) : x);
  const d = conv(i[0]) - conv(i[1]);
  return Number(d < 0n ? -d : d);
}

const normal = (v) => (v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v);
function difEstado(js, py, ruta, difs) {
  if (difs.length > 50) return;
  py = normal(py);
  if (Array.isArray(py)) {
    if (!Array.isArray(js) || js.length !== py.length) { difs.push({ nombre: ruta, motivo: `longitud JS ${js && js.length} vs ${py.length}` }); return; }
    py.forEach((v, i) => difEstado(js[i], v, `${ruta}[${i}]`, difs));
  } else if (py && typeof py === 'object') {
    const kp = Object.keys(py), kj = Object.keys(js || {});
    if (kp.join() !== kj.join()) difs.push({ nombre: ruta, motivo: `claves JS ${kj.slice(0, 5)} vs ${kp.slice(0, 5)}` });
    for (const k of kp) difEstado((js || {})[k], py[k], `${ruta}.${k}`, difs);
  } else if (!(Object.is(js, py) || (typeof py === 'number' && py !== py && js !== js) || (py === 0 && js === 0))) {
    difs.push({ nombre: ruta, js, py, ulps: typeof py === 'number' && typeof js === 'number' ? ulps(js, py) : undefined });
  }
}

function comparar(clave, sim) {
  const [etapa, , ] = clave.split('/');
  const modelo = clave.split('/').pop();
  const t = etapa === 'upd' ? Number(clave.split('/')[1]) : null;
  const e = vol.buscar(etapa, modelo, t);
  if (!e) throw new Error(`No hay volcado para ${clave}`);
  const malas = [];
  for (const nombre of Object.keys(e.vars)) {
    const ref = vol.arr(e, nombre);
    if (!sim.data.has(nombre)) { malas.push({ nombre, motivo: 'falta en JS' }); continue; }
    const js = sim.data.serie(nombre);
    if (js.data.length !== ref.data.length) { malas.push({ nombre, motivo: `forma JS ${js.shape} vs ${ref.shape}` }); continue; }
    let n = 0, maxAbs = 0, maxU = 0, primero = -1;
    const filas = new Set();
    const nc = js.shape[js.shape.length - 1];
    for (let i = 0; i < ref.data.length; i++) {
      const a = js.data[i], b = ref.data[i];
      if (Object.is(a, b) || (a !== a && b !== b)) continue;
      n++; if (primero < 0) primero = i;
      if (js.dims[0] === 'layers') filas.add(Math.floor(i / nc));
      if (a === a && b === b) { maxAbs = Math.max(maxAbs, Math.abs(a - b)); maxU = Math.max(maxU, ulps(a, b)); }
    }
    if (n) malas.push({ nombre, n, total: ref.data.length, maxAbs, maxU, primero, js: js.data[primero], py: ref.data[primero], filas: [...filas] });
  }
  for (const nombre of sim.data.nombres()) if (!(nombre in e.vars)) malas.push({ nombre, motivo: 'sobra en JS' });
  // estado interno de los animales (cohortes, charcos, registro trófico)
  if (modelo === 'animal' && sim.modelos.animal && e.extra && e.extra.animales) {
    const difs = [];
    difEstado(sim.modelos.animal.estado(), e.extra.animales, 'animales', difs);
    for (const d of difs.slice(0, 6)) malas.push(d);
    if (difs.length > 6) malas.push({ nombre: 'animales', motivo: `${difs.length} diferencias en total` });
  }
  const portado = !!sim.modelos[modelo];
  if (malas.length) {
    console.log(`✗ ${clave}${portado ? '' : ' (sustituido)'}: ${malas.length} variables distintas`);
    for (const m of malas.slice(0, 12)) console.log('   ', JSON.stringify(m));
    if (!seguir) process.exit(1);
  } else if (portado) {
    console.log(`✓ ${clave}`);
  }
}

globalThis.DEPURAR = args.includes('--depurar');
const sim = new Simulacion(escenario, {
  semilla, meta,
  sustituto: (etapa, modelo, t) => {
    const e = vol.buscar(etapa, modelo, t);
    const mm = meta.modelos[modelo];
    // todo lo que el módulo puede tocar (incluidas entradas que reescribe)
    const nombres = [...new Set([...mm.vars_populated_by_init, ...mm.vars_required_for_init,
      ...mm.vars_updated, ...mm.vars_populated_by_first_update, ...mm.vars_required_for_update])];
    const out = {};
    for (const n of nombres) { const a = vol.arr(e, n); if (a) out[n] = a; }
    return { vars: out, azar: e.extra && e.extra.azar };
  },
  observador: comparar,
});
const t0 = performance.now();
sim.inicializar();
let k = 0;
while (!sim.terminada && k < pasos) { sim.paso(); k++; }
console.log(`Hecho: ${k} pasos en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
