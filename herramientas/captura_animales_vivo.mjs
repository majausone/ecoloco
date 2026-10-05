// Capturas del mundo vivo siguiendo animales (los más grandes cerca de donde mira la cámara):
// node herramientas/captura_animales_vivo.mjs [n=6] [--url http://localhost:8191] [--etiqueta suave]
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(process.argv[2]) || 6, URL_BASE = arg('url', 'http://localhost:8191'), ETQ = arg('etiqueta', 'suave');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
await pagina.goto(`${URL_BASE}/vivo/`);
await pagina.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await pagina.waitForTimeout(3000);
for (let i = 0; i < N; i++) {
  const quien = await pagina.evaluate((i) => { const v = window.__vivo, vistos = (window.__vistos ||= new Set()); for (let k = 0; k < 40; k++) { v.seguirSiguiente(1); const a = v.manada.animales.get(v.seguido); if (a && !vistos.has(a.s.e.id)) { vistos.add(a.s.e.id); break; } } for (let k = 0; k < 40; k++) window.__vivo.medirCuadros(1); const s = window.__vivo.seguido, a = window.__vivo.manada.animales.get(s); return a ? a.s.e.id : 'nadie'; }, i).catch((e) => 'error ' + e.message);
  await pagina.waitForTimeout(800);
  await pagina.screenshot({ path: `temp/capturas/vivo-${ETQ}-animal${i}.png` });
  console.log(i, quien);
}
console.log(errores.length ? 'ERRORES: ' + errores.slice(0, 6).join(' | ') : 'sin errores');
await navegador.close();
