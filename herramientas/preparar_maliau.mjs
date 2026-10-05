// Deja el escenario de Maliau listo para el mundo vivo: enciende las correcciones del fallo
// de los herbívoros y los ajustes de parámetros (motor/correcciones.js) y pone en la tabla de
// animales los multiplicadores de búsqueda calibrados (datos/calibracion/maliau.json, de
// herramientas/calibrar_busqueda.mjs). Lo llama herramientas/clima_maliau.py al final.
//
// Uso: node herramientas/preparar_maliau.mjs [datos/escenarios/maliau.json] [datos/calibracion/maliau.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { activarCorrecciones } from '../motor/correcciones.js?v=202610052338';

const ruta = process.argv[2] || 'datos/escenarios/maliau.json';
const cal = process.argv[3] || 'datos/calibracion/maliau.json';
const esc = activarCorrecciones(JSON.parse(readFileSync(ruta, 'utf8')));
const t = esc.tablas.grupos_animales;
if (existsSync(cal)) {
  const m = JSON.parse(readFileSync(cal, 'utf8')).multiplicadores;
  if (!t.columnas.includes('search_rate_multiplier')) { t.columnas.push('search_rate_multiplier'); t.dtypes.search_rate_multiplier = 'float64'; }
  t.datos.search_rate_multiplier = t.datos.name.map((n) => m[n] ?? 1);
  console.log(`Multiplicadores de búsqueda de ${cal}`);
} else console.log(`Sin calibración (${cal} no existe): multiplicadores a 1`);
writeFileSync(ruta, JSON.stringify(esc));
console.log(`Correcciones y ajustes activados en ${ruta}`);
