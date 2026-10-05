// Corre el motor JS de principio a fin y escribe las mismas salidas que el original:
// model_data.zarr (grupos inputs, init, outputs) y los CSV de animales.
//
// Uso: node herramientas/correr.mjs <escenario.json> --salida runs/js_mensual [--semilla 1]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Simulacion } from '../motor/simulacion.js?v=202610052205';
import { escribirZarr } from '../motor/salida/zarr.js?v=202610052205';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
if (!args[0] || !opt('--salida')) {
  console.error('Uso: node herramientas/correr.mjs <escenario.json> --salida DIR [--semilla 1]');
  process.exit(2);
}
const escenario = JSON.parse(readFileSync(args[0], 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const salida = opt('--salida');
const semilla = Number(opt('--semilla', 1));

const t0 = performance.now();
const sim = new Simulacion(escenario, { semilla, meta });
sim.inicializar();
const tInit = performance.now();
while (!sim.terminada) sim.paso();
const tSim = performance.now();

if (existsSync(salida)) rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });
for (const [ruta, bytes] of escribirZarr(sim)) {
  const p = join(salida, 'model_data.zarr', ruta);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, bytes);
}
// pandas en Windows escribe los CSV con CRLF
const CRLF = String.fromCharCode(13, 10);
// (por partes: con Maliau entero el CSV de los animales pasa de los 512 MB que caben en una cadena
// de V8, y lineas.join daba «RangeError: Invalid string length»)
for (const [nombre, lineas] of Object.entries(sim.csv())) {
  const fd = openSync(join(salida, nombre), 'w');
  if (!lineas.length) writeSync(fd, CRLF);
  for (let i = 0; i < lineas.length; i += 20000) writeSync(fd, lineas.slice(i, i + 20000).join(CRLF) + CRLF);
  closeSync(fd);
}
const tFin = performance.now();
const tiempos = {
  semilla, pasos: sim.time_index, segundos_init: (tInit - t0) / 1000, segundos_pasos: (tSim - tInit) / 1000,
  segundos_simulacion: (tSim - t0) / 1000, segundos_total: (tFin - t0) / 1000,
};
writeFileSync(join(salida, 'motor_js.json'), JSON.stringify(tiempos, null, 1));
console.log(`Motor JS: ${sim.time_index} pasos, simulación ${tiempos.segundos_simulacion.toFixed(1)} s, total ${tiempos.segundos_total.toFixed(1)} s -> ${salida}`);
