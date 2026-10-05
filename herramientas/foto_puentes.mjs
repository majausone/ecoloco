// Fotos de los troncos-puente sobre el río (de día): node herramientas/foto_puentes.mjs [--url http://localhost:8191]
// Deja temp/capturas/puente-<n>.png (uno por tronco, desde la orilla y de lado) y dice errores y triángulos
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191');
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
const err = []; p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 200)); });
await p.goto(`${URL}/vivo/`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(2000);
const n = await p.evaluate(() => { window.__vivo.ponerVelocidad(0); window.__vivo.irA(11); return window.__vivo.mapa.puentes.length; });
console.log('troncos-puente:', n, 'triángulos:', await p.evaluate(() => window.__vivo.puentes.triangulos));
for (let k = 0; k < n; k++) {
  await p.evaluate((k) => {
    const v = window.__vivo, q = v.mapa.puentes[k], [cx, cz] = v.centro(), c = v.camara;
    const mx = (q.x0 + q.x1) / 2, mz = (q.z0 + q.z1) / 2, ux = q.x1 - q.x0, uz = q.z1 - q.z0, l = Math.hypot(ux, uz);
    // desde aguas arriba, de lado y algo alto, a unos 5 m
    const px = mx - (uz / l) * 5 - (ux / l) * 1.5, pz = mz + (ux / l) * 5 - (uz / l) * 1.5;
    c.pos.set(px - cx, v.suelo(mx, mz) + 2.6, pz - cz);
    c.yaw = Math.atan2(mx - px, mz - pz); c.pitch = -0.3;
    for (let i = 0; i < 30; i++) v.medirCuadros(1);
  }, k);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `temp/capturas/puente-${k}.png` });
}
await b.close();
console.log(err.length ? err : 'sin errores');
