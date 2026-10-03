// Pone la versión (?v=...) en todas las importaciones de la web, para que el navegador no siga
// usando los ficheros viejos: el servidor de majaus.es guarda el JavaScript 4 horas en caché
// (Cache-Control: max-age=14400) y, sin esto, tras subir cambios el móvil seguía con la versión
// anterior. Las páginas .html no se guardan en caché, así que cambiando la versión de todo a la
// vez se baja todo de nuevo.
//
//   node herramientas/versionar.mjs [versión]     (sin versión: la fecha y hora de ahora)
//
// Se cambian a la vez TODAS las importaciones relativas de un mismo fichero (un módulo con dos
// direcciones distintas se cargaría dos veces), salvo las de vendor/ (three.js y sus ejemplos,
// que se importan entre ellos sin versión y tienen que ser una sola copia).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const version = process.argv[2] || new Date().toISOString().replace(/\D/g, '').slice(0, 12);
// (también las pruebas y herramientas de Node: si importaran un módulo sin la versión, Node cargaría
// dos copias de él)
const CARPETAS = ['index.html', 'comun', 'vivo', 'portada', 'mundo', 'interfaz', 'motor', 'graficos/pruebas-morta', 'pruebas', 'herramientas'];

const ficheros = [];
const recorrer = (r) => {
  const p = join(RAIZ, r);
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) if (f !== 'vendor' && f !== 'node_modules') recorrer(join(r, f)); }
  else if (/\.(js|mjs|html)$/.test(r) && !r.endsWith('versionar.mjs')) ficheros.push(r);
};
for (const c of CARPETAS) recorrer(c);

// una dirección relativa a un .js, con o sin versión ya puesta
const ESP = String.raw`(\.{1,2}\/[^'"\s?]+\.js|[\w-]+\.js)(\?v=[\w.-]+)?`;
const PATRONES = [
  new RegExp(String.raw`(\bfrom\s*['"])${ESP}(['"])`, 'g'),
  new RegExp(String.raw`(\bimport\s*\(\s*['"])${ESP}(['"])`, 'g'),
  new RegExp(String.raw`(\bimport\s+['"])${ESP}(['"])`, 'g'),
  new RegExp(String.raw`(new\s+URL\(\s*['"])${ESP}(['"]\s*,\s*import\.meta\.url)`, 'g'),
  new RegExp(String.raw`(new\s+Worker\(\s*['"])${ESP}(['"])`, 'g'),
  new RegExp(String.raw`(<script[^>]*type="module"[^>]*\bsrc=")${ESP}(")`, 'g'),
];
let cambios = 0;
for (const f of ficheros) {
  const antes = readFileSync(join(RAIZ, f), 'utf8');
  let s = antes;
  for (const re of PATRONES) s = s.replace(re, (todo, a, ruta, _v, b) => {
    // lo de vendor/ (o lo que se importe desde un vendor/) se queda sin versión
    const destino = relative(RAIZ, resolve(join(RAIZ, dirname(f)), ruta)).replace(/\\/g, '/');
    if (/(^|\/)vendor\//.test(destino) || /^\w+:/.test(ruta)) return `${a}${ruta}${b}`;
    return `${a}${ruta}?v=${version}${b}`;
  });
  if (s !== antes) { writeFileSync(join(RAIZ, f), s); cambios++; }
}
console.log(`versión ${version}: ${cambios} ficheros de ${ficheros.length}`);
