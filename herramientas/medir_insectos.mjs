// Cómo se ven andar los insectos en el mundo vivo (los que andan: mueve 'insecto' o 'gusano'):
//   node herramientas/medir_insectos.mjs [--url http://localhost:8191] [--hora 10] [--segundos 60] [--velocidad 1]
// Durante unos segundos de pantalla, cada segundo: de los que están andando (andar, correr, huir, acechar,
// llegar, irse...) al principio y al final del segundo, qué parte avanza de verdad (al menos 0,5 de su tamaño
// dibujado en ese segundo de pantalla), por especie; y sobre los troncos-puente: cuántos hay a la vez y cuántos
// minutos de juego pasa encima cada uno.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8191'), HORA = +arg('hora', 10), SEG = +arg('segundos', 60), VEL = +arg('velocidad', 1);
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
const err = []; p.on('pageerror', (e) => err.push(e.message));
await p.goto(`${URL}/vivo/`);
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(1000);
const r = await p.evaluate(async ([HORA, SEG, VEL]) => {
  const { ESTADOS, COMPORTAMIENTO } = await import(new URL('../mundo/especies.js', location.href).href);
  const ANDA = new Set(['andar', 'correr', 'huir', 'acechar', 'llegar', 'irse', 'nadar'].map((n) => ESTADOS.indexOf(n)));
  const V = window.__vivo, M = V.mapa;
  V.irA(HORA); V.ponerVelocidad(VEL);
  const antes = new Map(), porEsp = {}, sobre = new Map(), cuenta = [];
  let n = 0;
  return await new Promise((fin) => {
    const iv = setInterval(() => {
      let k = 0;
      for (const a of V.manada.animales.values()) {
        const mueve = COMPORTAMIENTO[a.s?.e?.id]?.mueve;
        if (!a.visible || (mueve !== 'insecto' && mueve !== 'gusano')) continue;
        const q = antes.get(a.id);
        if (q && ANDA.has(q.estado) && ANDA.has(a.estado)) {
          const e = (porEsp[a.s.e.id] ||= { muestras: 0, avanzan: 0, tamDibujado: +a.s.tam.toFixed(3) });
          e.muestras++;
          if (Math.hypot(a.x - q.x, a.z - q.z) >= 0.5 * a.s.tam) e.avanzan++;
        }
        antes.set(a.id, { x: a.x, z: a.z, estado: a.estado });
        if (M.puenteEn(a.x, a.z, 0.3)) { k++; sobre.set(a.id, (sobre.get(a.id) || 0) + 1); }
      }
      cuenta.push(k);
      if (++n > SEG) {
        clearInterval(iv);
        let m = 0, av = 0;
        for (const e of Object.values(porEsp)) { m += e.muestras; av += e.avanzan; e.parte = +(e.avanzan / e.muestras).toFixed(2); }
        const mins = [...sobre.values()];
        fin({ andandoQueAvanzan: +(av / Math.max(1, m)).toFixed(2), muestras: m, sobreTroncosMedia: +(cuenta.reduce((s, x) => s + x, 0) / cuenta.length).toFixed(1), sobreTroncosMax: Math.max(...cuenta),
          minutosEncimaMedia: +(mins.reduce((s, x) => s + x, 0) / Math.max(1, mins.length) * VEL).toFixed(1), porEspecie: porEsp });
      }
    }, 1000);
  });
}, [HORA, SEG, VEL]);
await b.close();
console.log(JSON.stringify(r));
if (err.length) console.log(err.slice(0, 3));
