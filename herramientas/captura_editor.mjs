// Capturas del editor de modelos (Playwright headless): node herramientas/captura_editor.mjs
//   animales/pantera-nebulosa [plantas/dillenia ...] [--anim andar] [--t 0.4]
// Deja cada una en temp/capturas/editor-<id>[-anim].png
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const anim = arg('anim', null), ids = process.argv.slice(2).filter((a, i, l) => !a.startsWith('--') && !(l[i - 1] || '').startsWith('--'));
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pagina = await navegador.newPage({ viewport: { width: 1400, height: 900 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
for (const id of ids) {
  await pagina.goto(`http://localhost:8191/graficos/pruebas-morta/borneo/editor.html#${id}`);
  await pagina.waitForTimeout(2500);
  if (anim) { await pagina.evaluate((a) => { for (const b of document.querySelectorAll('#anims button')) if (b.textContent.toLowerCase().includes(a)) b.click(); }, anim); await pagina.waitForTimeout(1500); }
  await pagina.screenshot({ path: `temp/capturas/editor-${id.split('/')[1]}${anim ? '-' + anim : ''}.png` });
}
console.log(errores.length ? 'ERRORES: ' + errores.slice(0, 6).join(' | ') : 'sin errores');
await navegador.close();
