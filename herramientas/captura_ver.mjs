// Capturas de ver.html: node herramientas/captura_ver.mjs id[,id2...] [--vista tres] [--anim andar] [--t 0.3] [--cubos] [--ancho 700 --alto 450]
// Deja temp/capturas/ver-<id>-<suave|cubos>-<vista>[-anim].png
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ids = process.argv[2].split(','), vista = arg('vista', 'tres'), anim = arg('anim', ''), t = arg('t', '0.3'), cubos = process.argv.includes('--cubos');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pagina = await navegador.newPage({ viewport: { width: +arg('ancho', 700), height: +arg('alto', 450) } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
for (const id of ids) {
  await pagina.goto(`http://localhost:8191/graficos/pruebas-morta/borneo/ver.html?id=${id}&vista=${vista}&t=${t}${anim ? '&anim=' + anim : ''}${cubos ? '&cubos=1' : ''}`);
  await pagina.waitForFunction(() => window.__ver?.listo, null, { timeout: 60000 });
  await pagina.screenshot({ path: `temp/capturas/ver-${id}-${cubos ? 'cubos' : 'suave'}-${vista}${anim ? '-' + anim : ''}.png` });
}
console.log(errores.length ? 'ERRORES: ' + errores.slice(0, 6).join(' | ') : 'sin errores');
await navegador.close();
