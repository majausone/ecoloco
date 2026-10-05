// Que el impostor de 8 vistas de cada animal coincide con el modelo 3D a cualquier rumbo: node herramientas/prueba_impostor.mjs [--url http://localhost:8191]
// (IoU de las siluetas desde la misma cámara: «bien» tiene que ser alto y mayor que «alReves», el impostor girado 180°)
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191'), IDS = arg('ids', 'pantera-nebulosa,muntiaco,orangutan,varano,calao,mantis-hoja-seca');
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
const err = []; p.on('pageerror', (e) => err.push(e.message));
await p.goto(`${URL}/herramientas/prueba_impostor.html?ids=${IDS}`);
await p.waitForFunction(() => window.resultado, null, { timeout: 120000 });
const r = await p.evaluate(() => window.resultado);
for (const [id, filas] of Object.entries(r)) console.log(id.padEnd(18), filas.map((f) => `${f.rumbo}°:${f.bien}/${f.alReves}`).join('  '));
await b.close();
console.log(err.length ? err : 'sin errores');
