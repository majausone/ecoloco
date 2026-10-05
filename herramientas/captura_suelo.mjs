// El suelo, el agua y la hierba del mundo vivo desde varias alturas: node herramientas/captura_suelo.mjs
//   [--url http://localhost:8191] [--lado 100] [--etiqueta nuevo]
// Deja temp/capturas/suelo-<vista>-<etiqueta>.png y dice los errores de la consola
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191'), LADO = arg('lado', '100'), ETQ = arg('etiqueta', 'nuevo');
// (el río: su x en la escena a la altura z, relativa al centro)
const rio = `const v = window.__vivo, m = v.mapa, [cx, cz] = v.centro(); const rx = (z) => m.rioX(z + cz) - cx;`;
const VISTAS = {
  inicio: `const v = window.__vivo;`,
  orilla: `${rio} const c = v.camara; c.pos.set(rx(0) - 4, v.suelo(rx(0) - 4 + cx, cz) + 1.6, 0); c.yaw = 1.0; c.pitch = -0.25;`,
  rio: `${rio} const c = v.camara; c.pos.set(rx(-8) - 7, v.suelo(rx(-8) - 7 + cx, cz - 8) + 4, -8); c.yaw = 0.75; c.pitch = -0.4;`,
  rioArriba: `${rio} const c = v.camara; c.pos.set(rx(0), 14, 0); c.yaw = 0; c.pitch = -1.2;`,
  prado: `${rio} const c = v.camara; c.pos.set(-20, v.suelo(cx - 20, cz) + 2.2, -10); c.yaw = 0.8; c.pitch = -0.15;`,
  medio: `${rio} const c = v.camara; c.pos.set(-25, v.suelo(cx - 25, cz) + 12, -25); c.yaw = 0.8; c.pitch = -0.45;`,
  charca: `${rio} const c = v.camara, ch = m.charcas[m.dio][0]; const x = ch.x - cx, z = ch.z - cz; c.pos.set(x - ch.radio - 2.5, v.suelo(ch.x, ch.z) + 3.2, z - ch.radio - 2.5); c.yaw = Math.PI / 4; c.pitch = -0.55;`,
  alto: `${rio} const c = v.camara; c.pos.set(-30, 35, -30); c.yaw = 0.8; c.pitch = -0.7;`,
};
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
const errores = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errores.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
await p.goto(`${URL}/vivo/?lado=${LADO}`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(2500);
const solo = arg('vistas', '').split(',').filter(Boolean);
for (const [nombre, f] of Object.entries(VISTAS)) {
  if (solo.length && !solo.includes(nombre)) continue;
  await p.evaluate(`{ ${f} window.__vivo.ponerVelocidad(0); }`);
  for (let k = 0; k < 4; k++) { await p.evaluate('window.__vivo.medirCuadros(20)'); }
  await p.waitForTimeout(600);
  await p.screenshot({ path: `temp/capturas/suelo-${nombre}-${ETQ}.png` });
}
console.log(await p.evaluate(() => JSON.stringify({ tri: window.__vivo.perfil?.triangulos, llamadas: window.__vivo.perfil?.llamadas })));
await navegador.close();
console.log(errores.length ? 'ERRORES:\n' + [...new Set(errores)].join('\n') : 'sin errores');
