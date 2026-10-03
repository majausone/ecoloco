// Servidor estático mínimo para la interfaz (los módulos ES y los Web Workers no
// funcionan abriendo el HTML como fichero). Sirve la carpeta del proyecto.
//
// Uso: node interfaz/servidor.mjs [puerto]   y abrir http://localhost:8090/ (la portada) o
// http://localhost:8090/interfaz/ (el motor a solas)
import { createServer } from 'node:http';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUERTO = Number(process.argv[2] || 8090);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.md': 'text/markdown; charset=utf-8',
};
const PERMITIDO = ['index.html', 'portada', 'comun', 'interfaz', 'motor', 'datos/escenarios', 'vivo', 'mundo', 'graficos'];

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let ruta = decodeURIComponent(url.pathname);
    if (ruta === '/') ruta = '/index.html'; // la portada de EcoLoco
    if (ruta === '/prueba-descarga' && req.method === 'POST') {
      // solo para las pruebas de la interfaz (?prueba): guarda lo que se iba a descargar
      const trozos = [];
      for await (const t of req) trozos.push(t);
      const nombre = (url.searchParams.get('nombre') || 'descarga').replace(/[^\w.-]/g, '_');
      await mkdir(join(RAIZ, 'tmp', 'descargas'), { recursive: true });
      await writeFile(join(RAIZ, 'tmp', 'descargas', nombre), Buffer.concat(trozos));
      res.writeHead(204);
      res.end();
      return;
    }
    if (ruta === '/escenarios') {
      const l = (await readdir(join(RAIZ, 'datos', 'escenarios'))).filter((f) => f.endsWith('.json'));
      res.writeHead(200, { 'Content-Type': TIPOS['.json'] });
      res.end(JSON.stringify(l));
      return;
    }
    const rel = normalize(ruta).replace(/^[\\/]+/, '');
    if (!PERMITIDO.some((p) => rel.replace(/\\/g, '/').startsWith(p))) { res.writeHead(404); res.end(); return; }
    let f = join(RAIZ, rel);
    if (!f.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    const datos = await readFile(f);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(datos);
  } catch {
    res.writeHead(404);
    res.end('no encontrado');
  }
}).listen(PUERTO, () => console.log(`EcoLoco en http://localhost:${PUERTO}/ (el motor a solas: /interfaz/)`));
