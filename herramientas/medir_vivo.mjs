// Mide lo que cuesta dibujar el mundo vivo (Playwright headless con la GPU): triángulos, llamadas
// y ms por fotograma esperando a la GPU (__vivo.medirCuadros), desde la cámara de inicio y desde
// una cámara baja dentro del bosque. Hace también una captura de cada vista.
//
// Uso: node herramientas/medir_vivo.mjs [--url http://localhost:8191] [--lado 100] [--km2 1]
//        [--etiqueta cubos] [--base https://majaus.es/ecoloco]   (con --base, solo comprueba que carga)
// (los navegadores de Playwright, dentro del proyecto: PLAYWRIGHT_BROWSERS_PATH=0)
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL_BASE = arg('url', 'http://localhost:8191'), LADO = arg('lado', '100'), KM2 = arg('km2', '1'), ETQ = arg('etiqueta', 'medida');
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const pagina = await navegador.newPage({ viewport: { width: 1600, height: 900 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
const t0 = Date.now();
await pagina.goto(`${URL_BASE}/vivo/?lado=${LADO}&km2=${KM2}`);
await pagina.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
const carga = (Date.now() - t0) / 1000;
await pagina.waitForTimeout(4000);
const gpu = await pagina.evaluate(() => { const gl = window.__vivo.visor.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
const vistas = {};
const medir = async (nombre) => {
  // unos cuadros para que el bosque rehaga sus niveles y se asienten los animales
  await pagina.evaluate(() => { for (let i = 0; i < 30; i++) window.__vivo.medirCuadros(1); });
  await pagina.waitForTimeout(1500);
  await pagina.evaluate(() => { for (let i = 0; i < 30; i++) window.__vivo.medirCuadros(1); });
  const r = await pagina.evaluate(() => window.__vivo.medirCuadros(120));
  vistas[nombre] = { ms: +r.msPorCuadro.toFixed(2), fps: Math.round(r.fps), triangulos: r.triangulos, llamadas: r.llamadas, plantas: r.plantas, animales: r.dibujados, articulados: r.articulados, instancias: r.instancias };
  await pagina.screenshot({ path: `temp/capturas/${ETQ}-${LADO}m-${nombre}.png` });
};
await medir('inicio');
// cámara baja, dentro del bosque, mirando en horizontal
await pagina.evaluate(() => { const c = window.__vivo.camara, [cx, cz] = window.__vivo.centro(); const y = window.__vivo.suelo(cx - 25, cz - 25); c.pos.set(-25, y + 4, -25); c.pitch = -0.1; c.yaw = Math.PI / 4; });
await medir('suelo');
// desde lo alto
await pagina.evaluate(() => { const c = window.__vivo.camara; c.pos.set(0, 160, 0); c.pitch = -1.2; });
await medir('alto');
console.log(JSON.stringify({ etiqueta: ETQ, lado: LADO, km2: KM2, gpu, cargaS: carga, vistas, errores: errores.slice(0, 10) }, null, 1));
await navegador.close();
