// A/B intercalado del banco de animales (vivo/banco.html): las dos versiones abiertas a la vez y
// medidas por turnos, con la mediana. Uso: node herramientas/ab_banco.mjs [--especie rana-gigante-rio]
//   [--n 5000] [--a http://localhost:8192] [--b http://localhost:8191] [--vueltas 6]
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const A = arg('a', 'http://localhost:8192'), B = arg('b', 'http://localhost:8191'), ESP = arg('especie', 'rana-gigante-rio'), N = arg('n', '5000'), VUELTAS = +arg('vueltas', 6);
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const abrir = async (url) => { const p = await navegador.newPage({ viewport: { width: 1600, height: 900 } }); await p.goto(`${url}/vivo/banco.html?especie=${ESP}&n=${N}`); await p.waitForFunction(() => window.__banco, null, { timeout: 120000 }); await p.waitForTimeout(2000); return p; };
const pa = await abrir(A), pb = await abrir(B);
const med = (l) => { const o = [...l].sort((x, y) => x - y); return +o[Math.floor(o.length / 2)].toFixed(2); };
for (const [nombre, pos, mira] of [['cerca', [-25, 6, -25], [10, 0, 10]], ['alto', [0, 70, -60], [0, 0, 0]]]) {
  for (const p of [pa, pb]) await p.evaluate(([q, m]) => { const c = window.__banco.cam; c.position.set(...q); c.lookAt(...m); window.__banco.medir(30); }, [pos, mira]);
  const ra = [], rb = []; let ia, ib;
  for (let k = 0; k < VUELTAS; k++) { await pa.bringToFront(); ia = await pa.evaluate(() => window.__banco.medir(60)); ra.push(ia.ms); await pb.bringToFront(); ib = await pb.evaluate(() => window.__banco.medir(60)); rb.push(ib.ms); }
  console.log(`${ESP} ×${N} ${nombre.padEnd(5)} A ${med(ra)} ms ${ia.triangulos} tri ${ia.llamadas} ll  |  B ${med(rb)} ms ${ib.triangulos} tri ${ib.llamadas} ll  (B: ${ib.articulados} cerca, ${ib.medios ?? '-'} medios, ${ib.recortes ?? '-'} recortes)`);
}
await navegador.close();
