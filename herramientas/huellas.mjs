// Huellas (sha256) de todas las salidas de una pasada del motor JS: cada variable en
// cada paso, el estado inicial y los CSV. Sirven de referencia rápida para las pruebas
// (pruebas/motor.test.js) sin tener que correr el original: se generan solo a partir de
// una pasada que herramientas/suite.py ha dado por idéntica al Python.
//
// Uso: node herramientas/huellas.mjs <escenario.json> <salida.json> [--semilla 1]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Simulacion } from '../motor/simulacion.js?v=202610032115';

export function huellas(escenario, meta, semilla = 1) {
  const sim = new Simulacion(escenario, { semilla, meta });
  sim.inicializar();
  while (!sim.terminada) sim.paso();
  const h = (a) => createHash('sha256').update(new Uint8Array(a.data.buffer, a.data.byteOffset, a.data.byteLength)).digest('hex');
  const out = { pasos: sim.time_index, inputs: {}, init: {}, outputs: {}, csv: {} };
  for (const [k, a] of sim.entradas) out.inputs[k] = h(a);
  for (const [k, a] of sim.estadoInicial) out.init[k] = h(a);
  for (const [k, serie] of sim.salidas) out.outputs[k] = serie.map(h);
  for (const [k, l] of Object.entries(sim.csv())) out.csv[k] = createHash('sha256').update(l.join('\r\n') + '\r\n').digest('hex');
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('huellas.mjs')) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--semilla');
  const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
  const r = huellas(JSON.parse(readFileSync(args[0], 'utf8')), meta, i >= 0 ? Number(args[i + 1]) : 1);
  writeFileSync(args[1], JSON.stringify(r, null, 1));
  console.log(`Huellas de ${Object.keys(r.outputs).length} salidas x ${r.pasos} pasos -> ${args[1]}`);
}
