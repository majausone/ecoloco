// Mide el banco de animales (vivo/banco.html): miles de ejemplares de una especie con el código
// del mundo vivo. Uso: node herramientas/medir_banco.mjs [--especie rana-gigante-rio] [--n 5000]
//   [--etiqueta cubos] [--url http://localhost:8191]
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL_BASE = arg('url', 'http://localhost:8191'), ESP = arg('especie', 'rana-gigante-rio'), N = arg('n', '5000'), ETQ = arg('etiqueta', 'medida');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pagina = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
await pagina.goto(`${URL_BASE}/vivo/banco.html?especie=${ESP}&n=${N}`);
await pagina.waitForFunction(() => window.__banco, null, { timeout: 60000 });
await pagina.waitForTimeout(2000);
const vistas = {};
for (const [nombre, pos, mira] of [['cerca', [-25, 6, -25], [10, 0, 10]], ['alto', [0, 70, -60], [0, 0, 0]]]) {
  await pagina.evaluate(([p, m]) => { const c = window.__banco.cam; c.position.set(...p); c.lookAt(...m); window.__banco.medir(30); }, [pos, mira]);
  vistas[nombre] = await pagina.evaluate(() => window.__banco.medir(120));
  await pagina.screenshot({ path: `temp/capturas/banco-${ETQ}-${ESP}-${N}-${nombre}.png` });
}
console.log(JSON.stringify({ etiqueta: ETQ, especie: ESP, n: N, vistas, errores: errores.slice(0, 10) }));
await navegador.close();
