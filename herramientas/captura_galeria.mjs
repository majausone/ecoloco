// Captura la galería (Playwright headless): ?t=animal|planta|seta|comparar[&todas=1], y en
// «comparar» saca también las cifras (triángulos y FPS de cada versión).
// Uso: node herramientas/captura_galeria.mjs comparar [salida.png] [--todas]
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const t = process.argv[2] || 'comparar', salida = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : `temp/capturas/galeria-${t}.png`;
const todas = process.argv.includes('--todas');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pagina = await navegador.newPage({ viewport: { width: 1400, height: 1000 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
await pagina.goto(`http://localhost:8191/graficos/pruebas-morta/borneo/galeria.html?t=${t}${todas ? '&todas=1' : ''}`);
await pagina.waitForFunction(() => window.__listo, null, { timeout: 600000 });
await pagina.waitForTimeout(1500);
await pagina.screenshot({ path: salida, fullPage: true });
if (t === 'comparar') console.log(JSON.stringify(await pagina.evaluate(() => window.__comparar)));
console.log(errores.length ? 'ERRORES: ' + errores.slice(0, 8).join(' | ') : 'sin errores');
await navegador.close();
