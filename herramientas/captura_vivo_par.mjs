// La misma vista del mundo vivo en las dos versiones (para comparar): node herramientas/captura_vivo_par.mjs
//   [--a http://localhost:8192] [--b http://localhost:8191] [--lado 100]
// Deja temp/capturas/par-<vista>-cubos.png y par-<vista>-suave.png
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const A = arg('a', 'http://localhost:8192'), B = arg('b', 'http://localhost:8191'), LADO = arg('lado', '100');
const VISTAS = {
  claro: (v) => { const c = v.camara, y = v.suelo(v.centro()[0] - 38, v.centro()[1] - 30); c.pos.set(-38, y + 7, -30); c.yaw = 0.95; c.pitch = -0.2; },
  copas: (v) => { const c = v.camara; c.pos.set(-20, 45, -55); c.yaw = 0.35; c.pitch = -0.55; },
  lejos: (v) => { const c = v.camara; c.pos.set(-200, 90, -200); c.yaw = Math.PI / 4; c.pitch = -0.28; },
};
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [url, etq] of [[A, 'cubos'], [B, 'suave']]) {
  const p = await navegador.newPage({ viewport: { width: 1400, height: 800 } });
  await p.goto(`${url}/vivo/?lado=${LADO}`);
  await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  for (const [nombre, f] of Object.entries(VISTAS)) {
    await p.evaluate(`(${f.toString()})(window.__vivo); window.__vivo.ponerVelocidad(0); for (let i = 0; i < 60; i++) window.__vivo.medirCuadros(1);`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `temp/capturas/par-${nombre}-${LADO}m-${etq}.png` });
  }
  await p.close();
}
await navegador.close();
console.log('ok');
