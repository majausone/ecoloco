// Comprueba que la web publicada (o la local) carga sin errores: inicio, simulación, motor, mundo
// vivo, galería, editor y bioma. Uso: node herramientas/comprobar_web.mjs [--base https://majaus.es/ecoloco]
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'https://majaus.es/ecoloco').replace(/\/$/, '');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const PAGINAS = [
  ['portada', '/', null],
  ['simulacion', '/portada/simulacion.html', null],
  ['motor', '/interfaz/', null],
  ['vivo', '/vivo/', () => window.__vivo?.diaCompleto && window.__vivo.bosque],
  ['galeria', '/graficos/pruebas-morta/borneo/galeria.html', null],
  ['editor', '/graficos/pruebas-morta/borneo/editor.html', null],
  ['bioma', '/graficos/pruebas-morta/borneo/bioma.html', null],
];
let mal = 0;
for (const [nombre, ruta, listo] of PAGINAS) {
  const pagina = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  pagina.on('response', (r) => { if (r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
  try {
    await pagina.goto(BASE + ruta + (ruta.includes('?') ? '&' : '?') + 'v=' + Date.now(), { waitUntil: 'load', timeout: 90000 });
    if (listo) await pagina.waitForFunction(listo, null, { timeout: 180000 });
    await pagina.waitForTimeout(4000);
  } catch (e) { errores.push('no carga: ' + e.message.split('\n')[0]); }
  await pagina.screenshot({ path: `temp/capturas/web-${nombre}.png` });
  console.log(`${errores.length ? '✗' : '✓'} ${nombre}${errores.length ? ': ' + errores.slice(0, 5).join(' | ') : ''}`);
  if (errores.length) mal++;
  await pagina.close();
}
await navegador.close();
process.exit(mal ? 1 : 0);
