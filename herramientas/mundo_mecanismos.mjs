// Cuánto hace falta cada mecanismo para que el mundo vivo cuadre con el motor:
//   1. solo los comportamientos (1 semilla, sin director)
//   2. más semillas (se elige la que más se parece), sin director
//   3. semillas + director (la configuración normal)
// Para cada una, N días de Maliau y el reparto de las cazas de vertebrados del motor: las
// que salen solas, las que empuja el director, las que pasan fuera de vista y las que se
// cierran al final del día; más las cazas de sobra que hubo que evitar.
//
// Uso: node herramientas/mundo_mecanismos.mjs [--dias 20]
import { readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610032043';
import { reiniciarIds } from '../mundo/agentes.js?v=202610032043';

const args = process.argv.slice(2);
const dias = Number(args[args.indexOf('--dias') + 1] || 20);
const escenario = JSON.parse(readFileSync(new URL('../datos/escenarios/maliau.json', import.meta.url), 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const CONFIGS = [
  ['solo comportamientos (1 semilla)', { semillasPorDia: 1, pasadasDirector: 0 }],
  ['4 semillas, sin director', { semillasPorDia: 4, pasadasDirector: 0 }],
  ['4 semillas + director (normal)', { semillasPorDia: 4, pasadasDirector: 2 }],
];
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + ' %' : '—');
console.log(`${dias} días de Maliau por configuración\n`);
console.log('configuración'.padEnd(36), 'cazas motor  solas  director  fuera vista  al final  de sobra evitadas  deshechas (a la vista)  s/día');
for (const [nombre, op] of CONFIGS) {
  reiniciarIds();
  const m = new Mundo(escenario, meta, { semilla: 1, ...op });
  const t = { motor: 0, solas: 0, dir: 0, fuera: 0, final: 0, evit: 0, rev: 0, revVista: 0, s: 0, ajustes: 0 };
  for (let i = 0; i < dias; i++) {
    const r = m.siguienteDia(), x = r.medida;
    t.motor += x.cazasMotor; t.solas += x.emergentesFinal; t.dir += x.forzadasHechas; t.fuera += x.fueraDeVista;
    t.evit += x.evitadas; t.s += x.segundos; t.ajustes += x.ajustes;
    // residuo = cazas cerradas al final del día a la vista + cazas de sobra deshechas (revividas)
    t.rev += x.revividas; t.revVista += x.revividasEnVista; t.final += x.residuo - x.revividas;
  }
  console.log(nombre.padEnd(36), String(t.motor).padStart(11), pct(t.solas, t.motor).padStart(6), pct(t.dir, t.motor).padStart(9),
    pct(t.fuera, t.motor).padStart(12), pct(t.final, t.motor).padStart(9), String(t.evit).padStart(17), (t.rev + ' (' + t.revVista + ')').padStart(23), (t.s / dias).toFixed(2).padStart(6),
    t.ajustes ? `  (ajustes de recuento: ${t.ajustes})` : '');
}
