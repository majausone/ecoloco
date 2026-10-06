// Cuánto se atascan en el agua los animales que no nadan y cuánto tarda cada día simulado:
//   node herramientas/medir_caminos.mjs [--dias 4] [--semilla 1]   (el mapa por defecto, de 100 m)
// Cuenta las veces que un animal que no nada (insectos, lombrices) choca con el agua y se tiene que dar
// la vuelta (mundo/dia.js, ESTADISTICAS), cuántos animales lo hacen 3 veces o más en un día («atascados»)
// y los ms por día. Necesita datos/escenarios/maliau.json.
import { readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610060010';
import { reiniciarIds } from '../mundo/agentes.js?v=202610060010';
import { ESTADISTICAS } from '../mundo/dia.js?v=202610060010';
import { COMPORTAMIENTO } from '../mundo/especies.js?v=202610060010';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const DIAS = +arg('dias', 4), SEMILLA = +arg('semilla', 1);
const esc = JSON.parse(readFileSync(new URL('../datos/escenarios/maliau.json', import.meta.url), 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
reiniciarIds();
const m = new Mundo(esc, meta, { semilla: SEMILLA, semillasPorDia: 2, pasadasDirector: 1 });
m.siguienteDia(); // (el primero, aparte: prepara cosas)
let ms = 0, bloqueos = 0, atascados = 0, noNadan = 0, cuadre = 0;
for (let d = 0; d < DIAS; d++) {
  ESTADISTICAS.bloqueosAgua = 0; ESTADISTICAS.porAnimal.clear();
  const t0 = performance.now(); const r = m.siguienteDia(); ms += performance.now() - t0;
  bloqueos += ESTADISTICAS.bloqueosAgua;
  for (const n of ESTADISTICAS.porAnimal.values()) if (n >= 3) atascados++;
  noNadan += [...m.agentes.values()].filter((a) => ['insecto', 'gusano'].includes(COMPORTAMIENTO[a.especieId]?.mueve)).length;
  cuadre += r?.medida?.emergentes ?? 0;
}
console.log(JSON.stringify({ dias: DIAS, msPorDia: Math.round(ms / DIAS), bloqueosPorDia: +(bloqueos / DIAS).toFixed(1), atascadosPorDia: +(atascados / DIAS).toFixed(1), noNadanPorDia: Math.round(noNadan / DIAS), emergentesPorDia: +(cuadre / DIAS).toFixed(1) }));
