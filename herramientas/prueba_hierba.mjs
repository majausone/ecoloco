// La hierba sola, sobre negro, con cada anillo de un color (cerca morado, medio cian, lejos amarillo),
// desde varias alturas y ángulos, y girando la cámara: para ver huecos, saltos y deformaciones.
//   node herramientas/prueba_hierba.mjs [--url http://localhost:8191] [--lado 100]
// Deja temp/capturas/hierba-<vista>.png (y una tira de giros por vista)
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191'), LADO = arg('lado', '100');
// [nombre, altura sobre el suelo, inclinación (pitch)]
const VISTAS = [['ras', 1.5, -0.15], ['bajo', 4, -0.35], ['medio', 10, -0.6], ['alto', 25, -0.8], ['muyalto', 50, -0.7], ['cenital', 20, -1.5]];
const navegador = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await navegador.newPage({ viewport: { width: 900, height: 520 } });
const errores = [];
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 300)); });
await p.goto(`${URL}/vivo/?lado=${LADO}`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(1500);
for (const [nombre, alt, pitch] of VISTAS) {
  for (const giro of [0, 1, 2]) {
    await p.evaluate(([alt, pitch, giro]) => {
      const v = window.__vivo, c = v.camara, [cx, cz] = v.centro();
      v.ponerVelocidad(0);
      c.pos.set(-10, v.suelo(cx - 10, cz) + alt, -10); c.yaw = 0.8 + giro * 2.1; c.pitch = pitch;
      v.medirCuadros(3);
      // solo la hierba, de colores, sobre negro
      const h = v.hierba, mallas = new Set(h.mallas);
      h.prueba(true);
      const antes = v.escena.background;
      v.escena.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !mallas.has(o)) { o.userData.__vis ??= o.visible; o.visible = false; } });
      v.escena.background = null; v.visor.renderer.setClearColor(0x000000, 1);
      const fog = v.escena.fog; v.escena.fog = null;
      v.visor.pintar(v.escena, v.camActual);
      v.escena.fog = fog; v.escena.background = antes;
    }, [alt, pitch, giro]);
    await p.screenshot({ path: `temp/capturas/hierba-${nombre}-${giro}.png` });
  }
}
await navegador.close();
console.log(errores.length ? 'ERRORES:\n' + [...new Set(errores)].join('\n') : 'sin errores');
