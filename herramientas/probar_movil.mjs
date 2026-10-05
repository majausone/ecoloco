// Prueba en un móvil emulado (Playwright, sin ventana): las páginas a su tamaño, sin errores, y en
// el mundo vivo los gestos (un dedo gira la cámara, pellizcar avanza, dos dedos desplazan).
// Uso: node herramientas/probar_movil.mjs [--base http://localhost:8191]  (capturas en temp/capturas/movil-*.png)
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium, devices } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8191').replace(/\/$/, '');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await navegador.newContext({ ...devices['Pixel 7'] });
let mal = 0;
for (const [nombre, ruta] of [['inicio', '/'], ['simulacion', '/portada/simulacion.html'], ['galeria', '/graficos/pruebas-morta/borneo/galeria.html'], ['editor', '/graficos/pruebas-morta/borneo/editor.html'], ['motor', '/interfaz/']]) {
  const p = await ctx.newPage(), errores = [];
  p.on('pageerror', (e) => errores.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await p.goto(BASE + ruta); await p.waitForTimeout(3500);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  await p.screenshot({ path: `temp/capturas/movil-${nombre}.png` });
  const desborda = ancho > 420;
  console.log(`${errores.length || desborda ? '✗' : '✓'} ${nombre} (ancho ${ancho})${errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''}`);
  if (errores.length || desborda) mal++;
  await p.close();
}
// el mundo vivo y los gestos
const p = await ctx.newPage(), errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
await p.goto(BASE + '/vivo/');
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(2000);
const cdp = await ctx.newCDPSession(p);
const toque = (tipo, puntos) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: puntos.map(([x, y], id) => ({ x, y, id })) });
const cam = () => p.evaluate(() => { const c = window.__vivo.camara; return { pos: c.pos.toArray().map((v) => +v.toFixed(2)), yaw: +c.yaw.toFixed(3), pitch: +c.pitch.toFixed(3) }; });
const c0 = await cam();
// un dedo: girar
await toque('touchStart', [[200, 400]]); for (let i = 1; i <= 10; i++) await toque('touchMove', [[200 + i * 10, 400 + i * 4]]); await toque('touchEnd', []);
await p.waitForTimeout(200); const c1 = await cam();
// pellizcar (abrir los dedos): avanzar
await toque('touchStart', [[180, 400], [240, 400]]); for (let i = 1; i <= 10; i++) await toque('touchMove', [[180 - i * 8, 400], [240 + i * 8, 400]]); await toque('touchEnd', []);
await p.waitForTimeout(200); const c2 = await cam();
// dos dedos juntos: desplazar
await toque('touchStart', [[180, 400], [240, 400]]); for (let i = 1; i <= 10; i++) await toque('touchMove', [[180 + i * 8, 400], [240 + i * 8, 400]]); await toque('touchEnd', []);
await p.waitForTimeout(200); const c3 = await cam();
const gira = c1.yaw !== c0.yaw && c1.pos.join() === c0.pos.join(), avanza = c2.pos.join() !== c1.pos.join() && c2.yaw === c1.yaw, desplaza = c3.pos.join() !== c2.pos.join() && c3.yaw === c2.yaw;
await p.screenshot({ path: 'temp/capturas/movil-vivo.png' });
console.log(`${gira ? '✓' : '✗'} un dedo gira · ${avanza ? '✓' : '✗'} pellizcar avanza · ${desplaza ? '✓' : '✗'} dos dedos desplazan${errores.length ? ' · errores: ' + errores.slice(0, 3).join(' | ') : ''}`);
if (!gira || !avanza || !desplaza || errores.length) mal++;
await navegador.close();
process.exit(mal ? 1 : 0);
