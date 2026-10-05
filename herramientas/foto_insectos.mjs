// Fotos de los insectos en el mundo vivo: node herramientas/foto_insectos.mjs [--url http://localhost:8191]
// - temp/capturas/insectos-procesion.png: una procesión de termitas en fila (salen al atardecer, a las 17:30:
//   la primera que se encuentra, con la última luz);
// - temp/capturas/insectos-tigre.png: un escarabajo tigre en plena carrera, de día;
// - temp/capturas/insectos-tronco.png: un tronco-puente de día, sin amontonamiento (y cuántos hay encima).
// Deja correr el mundo a ×1 hasta que encuentra lo que busca, lo para y hace la foto con la cámara encima.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191');
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
const err = []; p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 200)); });
await p.goto(`${URL}/vivo/`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(1000);
await p.evaluate(async () => { const m = await import(new URL('../mundo/especies.js', location.href).href); window.__E = m.ESTADOS; });
// busca (cada 200 ms, a ×1, hasta 90 s) lo que diga «buscar» (en el navegador): { x, y, z, mx, my, mz } de la cámara o null
async function foto(nombre, hora, buscar) {
  await p.evaluate((h) => { const v = window.__vivo; v.irA(h); v.ponerVelocidad(1); }, hora);
  const e = await p.waitForFunction(buscar, null, { timeout: 90000, polling: 200 }).then((h) => h.jsonValue()).catch(() => null);
  if (!e) { console.log('sin', nombre); return null; }
  await p.evaluate((e) => {
    const v = window.__vivo, [cx, cz] = v.centro(), c = v.camara;
    v.ponerVelocidad(0);
    c.pos.set(e.x - cx, e.y, e.z - cz);
    const dx = e.mx - e.x, dz = e.mz - e.z;
    c.yaw = Math.atan2(dx, dz); c.pitch = Math.atan2(e.my - e.y, Math.hypot(dx, dz));
    for (let i = 0; i < 20; i++) v.medirCuadros(1);
  }, e);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `temp/capturas/insectos-${nombre}.png` });
  console.log(nombre, JSON.stringify(e.info || {}));
  return e;
}
// la procesión: 8 termitas andando o más en metro y medio, ya por la senda; la cámara, alta y mirando abajo
await foto('procesion', 17.5, () => {
  const v = window.__vivo, E = window.__E, ts = [...v.manada.animales.values()].filter((a) => a.visible && a.s?.e?.id === 'termita' && E[a.estado] === 'andar');
  if (ts.length < 8) return null;
  for (const a of ts) {
    const cerca = ts.filter((o) => Math.hypot(o.x - a.x, o.z - a.z) < 1.5);
    if (cerca.length < 8) continue;
    const mx = cerca.reduce((s, o) => s + o.x, 0) / cerca.length, mz = cerca.reduce((s, o) => s + o.z, 0) / cerca.length, y = v.suelo(mx, mz);
    // (la cámara, del lado contrario al termitero, para que no se ponga delante)
    // (ya por la senda: a 2 m del termitero o más)
    const h = v.mapa.termiteroCercano(mx, mz, 20) || { x: mx - 1, z: mz }, hx = mx - h.x, hz = mz - h.z, l = Math.hypot(hx, hz) || 1;
    if (l < 2.5) continue;
    return { x: mx + (hx / l) * 0.7, y: y + 2.2, z: mz + (hz / l) * 0.7, mx, my: y, mz, info: { termitasAndando: ts.length, enLaFila: cerca.length, hora: +((v.dia.tic / 60) % 24).toFixed(2) } };
  }
  return null;
});
// el escarabajo tigre corriendo, de día
await foto('tigre', 11, () => {
  const v = window.__vivo, E = window.__E;
  for (const a of v.manada.animales.values()) {
    if (!a.visible || a.s?.e?.id !== 'escarabajo-tigre' || E[a.estado] !== 'correr' || (a.velVis || 0) < 0.5) continue;
    const y = v.suelo(a.x, a.z), r = a.rumbo;
    // (de lado, a un metro y algo)
    return { x: a.x + Math.cos(r + 1.57) * 1.1, y: y + 0.55, z: a.z + Math.sin(r + 1.57) * 1.1, mx: a.x, my: y + 0.05, mz: a.z, info: { velocidad: +a.velVis.toFixed(2), tamDibujado: +a.s.tam.toFixed(2) } };
  }
  return null;
});
// un tronco-puente, de día: los que hay encima
await foto('tronco', 12, () => {
  const v = window.__vivo, m = v.mapa, t = m.puentes[0];
  let encima = 0;
  for (const a of v.manada.animales.values()) if (a.visible && m.puenteEn(a.x, a.z, 0.3)) encima++;
  const mx = (t.x0 + t.x1) / 2, mz = (t.z0 + t.z1) / 2, y = v.suelo(t.x0, t.z0);
  return { x: mx + (t.z1 - t.z0) * 0.5, y: y + 2.2, z: mz - (t.x1 - t.x0) * 0.5, mx, my: y, mz, info: { animalesSobreTroncos: encima } };
});
await b.close();
console.log(err.length ? err.slice(0, 3) : 'sin errores');
