// Seguir a un animal sin la ficha delante, con eventos de verdad (ratón, teclado y toques), en escritorio y
// en móvil emulado: node herramientas/prueba_seguir.mjs [--base http://localhost:8191]
// Comprueba que, tras cerrar la ficha, orbitar 180° (botón derecho / un dedo) y acercar o alejar (rueda /
// pellizco): sigue habiendo animal seguido, el animal sigue en el centro de la imagen y la distancia ha
// cambiado; que un desplazamiento pequeño no lo suelta y uno grande sí, y que con la cámara muy cerca lo
// suelta justo cuando el desplazamiento lo saca de la imagen (nunca sigue a uno que no se ve), y que después
// de soltarlo con dos dedos se le puede volver a seguir con un toque. Fotos en temp/capturas/seguir-*.png
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium, devices } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8191');
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let fallos = 0;
const ok = (cond, txt) => { console.log((cond ? '✓ ' : '✗ ') + txt); if (!cond) fallos++; };
// el estado: seguido, dónde sale en pantalla el animal (NDC) y a qué distancia está la cámara
const estado = (p) => p.evaluate(() => {
  const v = window.__vivo, id = v.seguido, a = id && v.manada.animales.get(id), c = v.camActual;
  if (!a) return { seguido: id };
  const [cx, cz] = v.centro(), P = c.position.clone().set(a.x - cx, v.suelo(a.x, a.z) + a.y + a.s.tam * 0.4, a.z - cz);
  const dist = c.position.distanceTo(P), ndc = P.clone().project(c);
  return { seguido: id, x: +ndc.x.toFixed(3), y: +ndc.y.toFixed(3), dist: +dist.toFixed(2), yaw: +v.camara.yaw.toFixed(3), orto: !v.camara.persp, ortoAlto: v.camara.ortoAlto, ficha: !document.getElementById('ventana-ficha').classList.contains('oculto'), boton: !document.getElementById('siguiendo').classList.contains('oculto') };
});
const esperar = (p, ms) => p.waitForTimeout(ms);
const abrir = async (opciones) => {
  const ctx = await b.newContext(opciones), p = await ctx.newPage();
  const err = []; p.on('pageerror', (e) => err.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 200)); });
  await p.goto(`${BASE}/vivo/`);
  await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
  await esperar(p, 2500);
  return { p, err, ctx };
};

// ---------------------------------------------------------------- escritorio
for (const orto of [false, true]) {
  const { p, err, ctx } = await abrir({ viewport: { width: 1400, height: 800 } });
  const W = 1400, H = 800;
  console.log(`\nescritorio (${orto ? 'ortográfica' : 'perspectiva'})`);
  await p.mouse.move(W / 2, H / 2);
  if (orto) await p.keyboard.press('p');
  await p.keyboard.press('g'); await esperar(p, 800);
  let e = await estado(p);
  ok(!!e.seguido && e.ficha && e.boton, `G sigue a un animal (${e.seguido}), con su ficha y el botón «Siguiendo»`);
  await p.click('#cerrar-ficha'); await esperar(p, 400);
  e = await estado(p);
  ok(!!e.seguido && !e.ficha, 'cerrar la ficha con la ✕ no deja de seguir');
  await p.keyboard.press('Escape'); await esperar(p, 300);
  ok(!!(await estado(p)).seguido, 'Esc no deja de seguir');
  const antes = await estado(p);
  // orbitar 180° con el botón derecho (0,005 rad por píxel: 628 px)
  await p.mouse.move(400, H / 2); await p.mouse.down({ button: 'right' });
  for (let k = 1; k <= 20; k++) { await p.mouse.move(400 + (628 * k) / 20, H / 2); await esperar(p, 16); }
  await p.mouse.up({ button: 'right' }); await esperar(p, 400);
  e = await estado(p);
  const giro = Math.abs(Math.atan2(Math.sin(e.yaw - antes.yaw), Math.cos(e.yaw - antes.yaw)));
  ok(!!e.seguido, `tras orbitar sigue siguiéndolo`);
  ok(giro > 2.9, `ha girado alrededor de él ${(giro * 180 / Math.PI).toFixed(0)}°`);
  ok(Math.abs(e.x) < 0.08 && Math.abs(e.y) < 0.08, `y sigue en el centro de la imagen (${e.x}, ${e.y})`);
  await p.screenshot({ path: `temp/capturas/seguir-escritorio-${orto ? 'orto' : 'persp'}-orbita.png` });
  // la rueda: acercar (o, en ortográfica, el encuadre)
  const d0 = e;
  for (let k = 0; k < 5; k++) { await p.mouse.wheel(0, -240); await esperar(p, 60); }
  await esperar(p, 300);
  e = await estado(p);
  ok(!!e.seguido, 'tras la rueda sigue siguiéndolo');
  ok(orto ? e.ortoAlto < d0.ortoAlto * 0.8 : e.dist < d0.dist * 0.8, orto ? `la rueda ha acercado el encuadre (${d0.ortoAlto.toFixed(1)} → ${e.ortoAlto.toFixed(1)})` : `la rueda ha acercado la cámara (${d0.dist} → ${e.dist} m)`);
  ok(Math.abs(e.x) < 0.08 && Math.abs(e.y) < 0.08, `y sigue en el centro (${e.x}, ${e.y})`);
  await p.screenshot({ path: `temp/capturas/seguir-escritorio-${orto ? 'orto' : 'persp'}-zoom.png` });
  // un desplazamiento pequeño con el botón central: no lo suelta
  await p.mouse.move(W / 2, H / 2); await p.mouse.down({ button: 'middle' });
  for (let k = 1; k <= 5; k++) { await p.mouse.move(W / 2 + k * 8, H / 2); await esperar(p, 16); }
  await p.mouse.up({ button: 'middle' }); await esperar(p, 300);
  ok(!!(await estado(p)).seguido, 'desplazar un poco (botón central) no lo suelta');
  // uno grande (W mantenida unos segundos): lo suelta
  await p.keyboard.down('w'); await esperar(p, 3500); await p.keyboard.up('w'); await esperar(p, 300);
  e = await estado(p);
  ok(!e.seguido && !e.boton, 'desplazar mucho (W mantenida) lo suelta y quita el botón');
  // muy cerca, desplazar con el botón central hasta sacarlo de la imagen lo suelta (el umbral va con lo que se ve, no en metros)
  await p.keyboard.press('g'); await esperar(p, 600); await p.click('#cerrar-ficha');
  for (let k = 0; k < 8; k++) { await p.mouse.wheel(0, -300); await esperar(p, 50); }
  await esperar(p, 300);
  const cerca = await estado(p);
  await p.mouse.move(200, H / 2); await p.mouse.down({ button: 'middle' });
  let soltado = 0;
  for (let k = 1; k <= 40 && !soltado; k++) {
    await p.mouse.move(200 + k * 25, H / 2); await esperar(p, 16);
    const s2 = await estado(p);
    if (!s2.seguido) soltado = k * 25; else if (Math.abs(s2.x) > 1.05 || Math.abs(s2.y) > 1.05) soltado = -1;
  }
  await p.mouse.up({ button: 'middle' }); await esperar(p, 200);
  ok(soltado > 0, 'muy cerca (' + (orto ? 'encuadre ' + cerca.ortoAlto.toFixed(1) : cerca.dist + ' m') + '), desplazar con el botón central lo suelta al salir de la imagen (a los ' + soltado + ' px) y nunca sigue a uno que no se ve');
  // la ✕ del botón deja de seguir
  await p.keyboard.press('g'); await esperar(p, 600);
  await p.click('#cerrar-ficha'); await esperar(p, 300);
  await p.screenshot({ path: `temp/capturas/seguir-escritorio-${orto ? 'orto' : 'persp'}-boton.png` });
  await p.click('#siguiendo-nombre'); await esperar(p, 400);
  ok((await estado(p)).ficha, 'pulsar «Siguiendo: …» vuelve a abrir su ficha');
  await p.click('#cerrar-ficha'); await p.click('#siguiendo-x'); await esperar(p, 300);
  e = await estado(p);
  ok(!e.seguido && !e.boton, 'la ✕ de «Siguiendo» deja de seguir');
  ok(!err.length, `sin errores en la consola${err.length ? ': ' + err.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

// ---------------------------------------------------------------- móvil emulado (toques de verdad)
{
  const { p, err, ctx } = await abrir({ ...devices['Pixel 7'] });
  const cdp = await ctx.newCDPSession(p);
  const toque = (type, puntos) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: puntos.map(([x, y], id) => ({ x, y, id })) });
  const vp = p.viewportSize(), W = vp.width, H = vp.height;
  console.log('\nmóvil emulado (Pixel 7)');
  await p.evaluate(() => { const v = window.__vivo; v.seguirSiguiente(1); v.ficha.seleccionar(v.seguido, false); });
  await esperar(p, 700);
  await p.tap('#cerrar-ficha'); await esperar(p, 400);
  let e = await estado(p);
  ok(!!e.seguido && !e.ficha && e.boton, `tocar la ✕ de la ficha no deja de seguir (${e.seguido})`);
  const antes = e;
  // un dedo: orbitar 180°
  await toque('touchStart', [[60, H / 2]]);
  for (let k = 1; k <= 24; k++) { await toque('touchMove', [[60 + (628 * k) / 24 * (W - 120) / 628, H / 2]]); await esperar(p, 16); }
  await toque('touchEnd', []); await esperar(p, 300);
  // (el ancho del móvil no da para 628 px de una vez: otra pasada)
  const yaw1 = (await estado(p)).yaw;
  const quiere = Math.PI - Math.abs(Math.atan2(Math.sin(yaw1 - antes.yaw), Math.cos(yaw1 - antes.yaw)));
  const px = quiere / 0.005;
  await toque('touchStart', [[40, H / 2]]);
  for (let k = 1; k <= 20; k++) { await toque('touchMove', [[40 + (px * k) / 20, H / 2]]); await esperar(p, 16); }
  await toque('touchEnd', []); await esperar(p, 300);
  e = await estado(p);
  const giro = Math.abs(Math.atan2(Math.sin(e.yaw - antes.yaw), Math.cos(e.yaw - antes.yaw)));
  ok(!!e.seguido, 'tras orbitar con un dedo sigue siguiéndolo');
  ok(giro > 2.9, `ha girado alrededor de él ${(giro * 180 / Math.PI).toFixed(0)}°`);
  ok(Math.abs(e.x) < 0.08 && Math.abs(e.y) < 0.08, `y sigue en el centro (${e.x}, ${e.y})`);
  // pellizcar: abrir los dedos acerca
  const d0 = e.dist;
  await toque('touchStart', [[W / 2 - 30, H / 2], [W / 2 + 30, H / 2]]);
  for (let k = 1; k <= 15; k++) { await toque('touchMove', [[W / 2 - 30 - k * 8, H / 2], [W / 2 + 30 + k * 8, H / 2]]); await esperar(p, 16); }
  await toque('touchEnd', []); await esperar(p, 300);
  e = await estado(p);
  ok(!!e.seguido && e.dist < d0 * 0.8, `pellizcar acerca sin soltarlo (${d0} → ${e.dist} m)`);
  ok(Math.abs(e.x) < 0.08 && Math.abs(e.y) < 0.08, `y sigue en el centro (${e.x}, ${e.y})`);
  await p.screenshot({ path: 'temp/capturas/seguir-movil.png' });
  // dos dedos un poco: no lo suelta; mucho: sí
  await toque('touchStart', [[W / 2 - 40, H / 2], [W / 2 + 40, H / 2]]);
  for (let k = 1; k <= 5; k++) { await toque('touchMove', [[W / 2 - 40 + k * 6, H / 2], [W / 2 + 40 + k * 6, H / 2]]); await esperar(p, 16); }
  await toque('touchEnd', []); await esperar(p, 300);
  ok(!!(await estado(p)).seguido, 'desplazar un poco con dos dedos no lo suelta');
  for (let r = 0; r < 12 && (await estado(p)).seguido; r++) {
    await toque('touchStart', [[40, H / 2], [120, H / 2]]);
    for (let k = 1; k <= 10; k++) { await toque('touchMove', [[40 + k * 25, H / 2], [120 + k * 25, H / 2]]); await esperar(p, 16); }
    await toque('touchEnd', []); await esperar(p, 200);
  }
  ok(!(await estado(p)).seguido, 'desplazar mucho con dos dedos lo suelta');
  // el caso del Observer: muy cerca (pellizcando más), un arrastre de dos dedos que lo saca de la imagen lo suelta
  await p.evaluate(() => { const v = window.__vivo; v.seguirSiguiente(1); }); await esperar(p, 500);
  for (let r = 0; r < 2; r++) {
    await toque('touchStart', [[W / 2 - 30, H / 2], [W / 2 + 30, H / 2]]);
    for (let k = 1; k <= 15; k++) { await toque('touchMove', [[W / 2 - 30 - k * 8, H / 2], [W / 2 + 30 + k * 8, H / 2]]); await esperar(p, 16); }
    await toque('touchEnd', []); await esperar(p, 200);
  }
  const cercaM = await estado(p);
  let siempreVisible = true;
  await toque('touchStart', [[40, H / 2], [120, H / 2]]);
  for (let k = 1; k <= 12; k++) {
    await toque('touchMove', [[40 + k * 25, H / 2], [120 + k * 25, H / 2]]); await esperar(p, 16);
    const s2 = await estado(p);
    if (s2.seguido && (Math.abs(s2.x) > 1.05 || Math.abs(s2.y) > 1.05)) siempreVisible = false;
  }
  await toque('touchEnd', []); await esperar(p, 300);
  const tras = await estado(p);
  ok(!tras.seguido && siempreVisible, 'muy cerca (' + cercaM.dist + ' m), arrastrar con dos dedos hasta sacarlo de la imagen lo suelta (seguido: ' + (tras.seguido ?? 'null') + ')');
  // y justo después se puede volver a seguir: reabrir su ficha y tocar «seguir» (en Chrome, el primer toque tras un
  // deslizamiento de dos dedos no da click: el botón responde al pointerup, vivo/pulsar.js)
  const idSoltado = cercaM.seguido;
  await p.evaluate((id) => window.__vivo.ficha.seleccionar(id, false), idSoltado); await esperar(p, 400);
  await p.tap('#f-seguir'); await esperar(p, 400);
  const otra = await estado(p);
  ok(otra.seguido === idSoltado && otra.boton, 'tras soltarlo con dos dedos, tocar «seguir» en su ficha lo vuelve a seguir (' + (otra.seguido ?? 'null') + ', botón ' + (otra.boton ? 'visible' : 'oculto') + ')');
  await p.tap('#cerrar-ficha'); await esperar(p, 300);
  ok((await estado(p)).seguido === idSoltado, 'y cerrar la ficha con un toque no lo suelta');
  await p.tap('#siguiendo-x'); await esperar(p, 300);
  await p.evaluate(() => { const v = window.__vivo; v.seguirSiguiente(1); }); await esperar(p, 500);
  await p.screenshot({ path: 'temp/capturas/seguir-movil-boton.png' });
  const caja = await p.locator('#siguiendo').boundingBox();
  ok(caja && caja.x + caja.width <= W && caja.y + caja.height <= H - 4, `el botón «Siguiendo» cabe abajo a la derecha (${caja && Math.round(caja.x)}, ${caja && Math.round(caja.y)}, ${caja && Math.round(caja.width)}×${caja && Math.round(caja.height)})`);
  await p.tap('#siguiendo-x'); await esperar(p, 300);
  ok(!(await estado(p)).seguido, 'tocar la ✕ de «Siguiendo» deja de seguir');
  ok(!err.length, `sin errores en la consola${err.length ? ': ' + err.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
await b.close();
console.log(fallos ? `\n${fallos} FALLOS` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
