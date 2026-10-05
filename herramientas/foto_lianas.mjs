// Fotos de las lianas en el mundo vivo, de día y a la altura de una persona (1,6 m sobre el suelo):
//   node herramientas/foto_lianas.mjs [--url http://localhost:8191]
// Una de cada: liana sobre el río (desde la orilla), cortina, enredadera por un tronco, ratán, Tetrastigma con
// su rafflesia y colgante en bucle, y una vista del bosque donde más lianas hay: temp/capturas/liana-<tipo>.png.
// La cámara, desde el lado en el que ningún tronco se pone delante (vivo/lianas.js: sitios). Dice cuántas hay,
// sus triángulos y los errores.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191');
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
const err = []; p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 200)); });
await p.goto(`${URL}/vivo/`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(1500);
// (a mediodía, parado, y que se construyan las lianas)
await p.evaluate(() => { const v = window.__vivo; v.ponerVelocidad(0); v.irA(11.5); for (let i = 0; i < 60; i++) v.medirCuadros(1); });
const planes = await p.evaluate(() => {
  const v = window.__vivo, m = v.mapa, sitios = v.lianas.sitios, OJO = 1.6, out = {};
  const arboles = (x, z, r) => m.arbolesCerca(x, z, r);
  // lo despejado que está el camino de la cámara (c) al sitio (s): la distancia al tronco más cercano a la recta
  const despejado = (c, s, propio) => {
    let peor = 9;
    for (const a of arboles((c.x + s.x) / 2, (c.z + s.z) / 2, Math.hypot(c.x - s.x, c.z - s.z) / 2 + 2)) {
      if (propio && a.x === propio.x && a.z === propio.z) continue;
      const ux = s.x - c.x, uz = s.z - c.z, l2 = ux * ux + uz * uz, t = Math.max(0, Math.min(1, ((a.x - c.x) * ux + (a.z - c.z) * uz) / l2));
      peor = Math.min(peor, Math.hypot(c.x + ux * t - a.x, c.z + uz * t - a.z) - (a.altura > 7 ? 0.9 : 0.4));
    }
    // (sin cámara en el agua ni mirando al borde del mapa: lo que queda detrás del sitio, dentro)
    // (en lo que se ve a los lados también: a 30 m, de frente y a ±35°)
    const l = Math.hypot(s.x - c.x, s.z - c.z) || 1, ux = (s.x - c.x) / l, uz = (s.z - c.z) / l;
    let fuera = 0;
    for (const g of [-0.6, 0, 0.6]) { const cg = Math.cos(g), sg = Math.sin(g); if (!m.dentro(c.x + (ux * cg - uz * sg) * 30, c.z + (ux * sg + uz * cg) * 30, 0)) fuera++; }
    return peor - (m.esAgua(c.x, c.z) ? 5 : 0) - fuera * 4;
  };
  const encuadre = (s, lejos, mirarY, propio) => {
    let mejor = null, md = -Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, c = { x: s.x + Math.cos(a) * lejos, z: s.z + Math.sin(a) * lejos };
      if (!m.dentro(c.x, c.z, 2)) continue;
      const d = despejado(c, s, propio);
      if (d > md) { md = d; mejor = c; }
    }
    if (!mejor) return null;
    const y = v.suelo(mejor.x, mejor.z) + OJO;
    return { x: mejor.x, y, z: mejor.z, mx: s.x, my: mirarY, mz: s.z, despejado: +md.toFixed(2) };
  };
  const de = (t) => sitios.filter((s) => s.tipo === t);
  // el de cada tipo con el encuadre más despejado
  const elegir = (t, lejos, mirar) => {
    let mejor = null;
    for (const s of de(t).slice(0, 40)) { const e = encuadre(s, lejos, mirar(s), s.arbol); if (e && (!mejor || e.despejado > mejor.despejado)) mejor = e; }
    return mejor;
  };
  out.cortina = elegir('cortina', 6, (s) => s.y + 1);
  out.enredadera = elegir('enredadera', 4.5, (s) => s.y + 1.2);
  out.ratan = elegir('ratan', 6, (s) => s.y + 0.8);
  out.colgante = elegir('colgante', 8, (s) => s.y + 2);
  const raf = sitios.filter((s) => s.tipo === 'tetrastigma' && s.rafflesia);
  if (raf.length) { let mejor = null; for (const s of raf) { const e = encuadre(s, 5.5, s.y + 1.5, s.arbol); if (e && (!mejor || e.despejado > mejor.despejado)) mejor = e; } out.tetrastigma = mejor; }
  // la del río: desde la orilla, mirando a lo largo del río a la liana
  let rio = null;
  for (const s of de('rio')) for (const lejos of [9, 12, 15]) for (const sen of [-1, 1]) for (const lado of [-1, 1]) {
    const z = s.z + sen * lejos, x = m.rioX(z) + lado * (m.rio.ancho / 2 + 1.2);
    if (!m.dentro(x, z, 2) || m.esAgua(x, z)) continue;
    const d = despejado({ x, z }, s, null);
    if (!rio || d > rio.despejado) rio = { x, y: v.suelo(x, z) + OJO, z, mx: s.x, my: s.y + 1, mz: s.z, despejado: +d.toFixed(2) };
  }
  out.rio = rio;
  // y la vista del bosque: donde más lianas hay en 12 m, mirando hacia ellas desde 9 m
  let centro = null, mx = 0;
  for (const s of sitios) { const n = sitios.filter((q) => Math.hypot(q.x - s.x, q.z - s.z) < 12).length; if (n > mx && !m.esAgua(s.x, s.z)) { mx = n; centro = s; } }
  if (centro) out.bosque = encuadre({ x: centro.x, z: centro.z }, 9, v.suelo(centro.x, centro.z) + 3.5, null);
  return out;
});
console.log('lianas:', JSON.stringify(await p.evaluate(() => window.__vivo.lianas.medidas)), 'fotos:', Object.keys(planes).filter((k) => planes[k]).join(', '));
for (const [k, e] of Object.entries(planes)) {
  if (!e) { console.log('sin', k); continue; }
  await p.evaluate((e) => {
    const v = window.__vivo, [cx, cz] = v.centro(), c = v.camara;
    c.pos.set(e.x - cx, e.y, e.z - cz);
    const dx = e.mx - e.x, dz = e.mz - e.z;
    c.yaw = Math.atan2(dx, dz); c.pitch = Math.max(-0.3, Math.min(0.75, Math.atan2(e.my - e.y, Math.hypot(dx, dz))));
    for (let i = 0; i < 20; i++) v.medirCuadros(1);
  }, e);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `temp/capturas/liana-${k}.png` });
}
await b.close();
console.log(err.length ? err.slice(0, 3) : 'sin errores');
process.exit(err.length ? 1 : 0);
