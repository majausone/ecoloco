// Los que cruzan el río por los troncos caídos se dibujan por encima del tronco (no metidos en el agua):
//   node herramientas/prueba_puentes.mjs [--url http://localhost:8191] [--segundos 60]
// Deja correr el mundo vivo a ×10 y, en cada fotograma, mira los animales que están encima de un tronco-puente:
// cuántos cruzan y si se dibujan a la altura del lomo del tronco. Foto de uno cruzando, de día (se vuelve al
// momento en que cruzaba, a la luz de entre las 10:30 y las 15), en temp/capturas/cruzando.png
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191'), SEG = +arg('segundos', 60);
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
const err = []; p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 200)); });
await p.goto(`${URL}/vivo/`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(1500);
await p.evaluate(() => {
  const v = window.__vivo; v.irA(9); v.ponerVelocidad(10);
  window.__cruces = { ids: new Set(), muestras: 0, metidos: 0, foto: null };
  const mirar = () => {
    const [cx, cz] = v.centro();
    for (const a of v.manada.animales.values()) {
      if (!a.visible || a.yVis == null || !v.mapa.esAgua(a.x, a.z)) continue;
      const lomo = v.puentes.alturaEn(a.x, a.z);
      if (lomo == null) continue;
      window.__cruces.ids.add(a.id); window.__cruces.muestras++;
      if (a.yVis < lomo - 0.02) { window.__cruces.metidos++; (window.__cruces.ej ||= []).length < 8 && window.__cruces.ej.push([a.s.e.id, v.manada.animales.get(a.id)?.estado, +a.y.toFixed(2), +a.yVis.toFixed(2), +lomo.toFixed(2)]); }
      // (para la foto: el primero que cruza de día, a media luz del tronco; con el momento, para volver a él)
      const hora = (v.dia.tic / 60) % 24;
      if (!window.__cruces.foto && hora > 10.5 && hora < 15 && Math.abs(lomo - a.yVis) < 0.3) window.__cruces.foto = { id: a.id, x: a.x - cx, y: lomo, z: a.z - cz, tic: v.dia.tic };
    }
    requestAnimationFrame(mirar);
  };
  requestAnimationFrame(mirar);
});
await p.waitForTimeout(SEG * 1000);
const r = await p.evaluate(() => ({ animales: window.__cruces.ids.size, muestras: window.__cruces.muestras, metidos: window.__cruces.metidos, ej: window.__cruces.ej, foto: window.__cruces.foto }));
if (r.foto) {
  await p.evaluate((f) => { const v = window.__vivo, c = v.camara; v.ponerVelocidad(0); v.irA(f.tic / 60); c.pos.set(f.x + 2, f.y + 1.2, f.z + 2); c.yaw = Math.atan2(-2, -2); c.pitch = -0.4; for (let i = 0; i < 20; i++) v.medirCuadros(1); }, r.foto);
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'temp/capturas/cruzando.png' });
}
await b.close();
console.log(JSON.stringify({ animalesCruzando: r.animales, muestras: r.muestras, metidosEnElAgua: r.metidos, ejemplos: r.ej }));
console.log(err.length ? err.slice(0, 3) : 'sin errores');
process.exit(r.animales > 0 && r.metidos === 0 && !err.length ? 0 : 1);
