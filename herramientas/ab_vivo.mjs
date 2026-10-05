// A/B intercalado del mundo vivo: las dos versiones abiertas a la vez (cada una en su pestaña) y
// medidas por turnos, varias veces, con la mediana (así el ruido de la máquina afecta a las dos).
// Uso: node herramientas/ab_vivo.mjs [--a http://localhost:8192] [--b http://localhost:8191] [--lado 100] [--vueltas 6] [--vista inicio|suelo|alto]
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const A = arg('a', 'http://localhost:8192'), B = arg('b', 'http://localhost:8191'), LADO = arg('lado', '100'), VUELTAS = +arg('vueltas', 6);
const VISTAS = (arg('vista', 'inicio,suelo,alto')).split(',');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const abrir = async (url) => {
  const p = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(`${url}/vivo/?lado=${LADO}`);
  await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  return p;
};
const pa = await abrir(A), pb = await abrir(B);
const poner = (p, vista) => p.evaluate((vista) => {
  const v = window.__vivo, c = v.camara, [cx, cz] = v.centro();
  if (vista === 'inicio') { c.pos.copy(v.__inicio ||= c.pos.clone()); c.yaw = v.__yaw ??= c.yaw; c.pitch = v.__pitch ??= c.pitch; }
  else if (vista === 'suelo') { const y = v.suelo(cx - 25, cz - 25); c.pos.set(-25, y + 4, -25); c.pitch = -0.1; c.yaw = Math.PI / 4; }
  else if (vista === 'medio') { c.pos.set(-30, 35, -30); c.yaw = 0.8; c.pitch = -0.7; }
  else { c.pos.set(0, 160, 0); c.pitch = -1.2; }
  for (let i = 0; i < 60; i++) v.medirCuadros(1);
}, vista);
const medir = (p) => p.evaluate(() => { const v = window.__vivo; v.medirCuadros(10); const r = v.medirCuadros(60); return { ms: r.msPorCuadro, tri: r.triangulos, ll: r.llamadas }; });
const med = (l) => { const o = [...l].sort((x, y) => x - y); return +o[Math.floor(o.length / 2)].toFixed(2); };
const out = {};
for (const vista of VISTAS) {
  await poner(pa, vista); await poner(pb, vista);
  const ra = [], rb = [];
  let ia, ib;
  for (let k = 0; k < VUELTAS; k++) { await pa.bringToFront(); ia = await medir(pa); ra.push(ia.ms); await pb.bringToFront(); ib = await medir(pb); rb.push(ib.ms); }
  out[vista] = { a: { ms: med(ra), tri: ia.tri, ll: ia.ll }, b: { ms: med(rb), tri: ib.tri, ll: ib.ll } };
  console.log(vista.padEnd(7), `A ${med(ra)} ms ${(ia.tri / 1e6).toFixed(2)}M ${ia.ll}ll  |  B ${med(rb)} ms ${(ib.tri / 1e6).toFixed(2)}M ${ib.ll}ll`);
}
await navegador.close();
