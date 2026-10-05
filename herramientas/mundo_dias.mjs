// Corre el mundo vivo (motor + animales) unos días sin gráficos y saca, día a día, cuánto
// tarda, cuántos animales se simulan uno a uno, si las cazas cuadran con el motor y cuánto
// se come en el mundo frente a lo que apunta el motor.
//
// Uso: node herramientas/mundo_dias.mjs [escenario.json] [--dias 10] [--km2 100] [--semillas 2]
import { readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610052309';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ruta = args[0] && !args[0].startsWith('--') ? args[0] : 'datos/escenarios/maliau.json';
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const t0 = performance.now();
const m = new Mundo(JSON.parse(readFileSync(ruta, 'utf8')), meta, { semillasPorDia: Number(opt('--semillas', 2)), pasadasDirector: 1, km2: opt('--km2', null) && Number(opt('--km2')) });
console.log(`mundo de ${m.km2.toFixed(2)} km² · arranque ${((performance.now() - t0) / 1000).toFixed(1)} s · ${m.agentes.size} animales uno a uno · cada uno vale por:`, JSON.stringify(m.vale));
console.log('día   fecha        s   animales vert paso cazasMotor solas director lejos resid ajustes muertes nac lleg sal  comido (motor/mundo, kg)');
const kg = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${v.motor.toFixed(1)}/${v.mundo.toFixed(1)}`).join(' · ');
for (let i = 0; i < Number(opt('--dias', 10)); i++) {
  const x = m.siguienteDia().medida;
  console.log(String(x.dia).padEnd(5), x.fecha, x.segundos.toFixed(2).padStart(6), String(x.animales).padStart(8), String(x.vertebrados).padStart(4), String(x.paso).padStart(4),
    String(x.cazasMotorAnimales).padStart(10), String(x.emergentesFinal).padStart(5), String(x.forzadasHechas).padStart(8), String(x.fueraDeVista).padStart(5), String(x.residuo).padStart(5),
    String(x.ajustes).padStart(7), String(x.muertes).padStart(7), String(x.nacimientos).padStart(3), String(x.llegadas).padStart(4), String(x.salidas).padStart(3), ' ', kg(x.comidoClase));
}
