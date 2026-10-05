// Lo que tarda el motor en la interfaz (la página «The engine», con su Web Worker), a la velocidad máxima:
//   node herramientas/medir_interfaz.mjs [--url http://localhost:8090] [--escenario ejemplo] [--pasos 24]
// Con el servidor de la interfaz en marcha (node interfaz/servidor.mjs 8090). Abre /interfaz/?escenario=..., pone la
// velocidad al máximo, pulsa «Iniciar» y «Correr» y apunta cuándo llega cada paso del trabajador (envolviendo el
// Worker antes de que cargue la página). Da: segundos de iniciar, ms por paso (la mediana, sin el primero) y días
// de simulación por segundo.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8090'), ESC = arg('escenario', 'ejemplo'), PASOS = +arg('pasos', 24);
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const err = []; p.on('pageerror', (e) => err.push(e.message));
await p.addInitScript(() => {
  const W = window.Worker;
  window.__pasos = []; window.__listo = null;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (ev) => {
        const m = ev.data;
        if (m.tipo === 'listo') window.__listo = { t: performance.now(), segundos: m.segundos, pasos: m.info.n_pasos };
        if (m.tipo === 'paso') window.__pasos.push({ t: performance.now(), fecha: m.resumen.fecha });
        if (m.tipo === 'error') window.__error = m.mensaje;
      });
    }
  };
});
await p.goto(`${URL}/interfaz/?escenario=${ESC}`);
await p.waitForFunction(() => document.querySelector('#escenario')?.value && !document.querySelector('#b-iniciar').disabled, null, { timeout: 300000 });
await p.waitForTimeout(500);
await p.evaluate(() => { const v = document.querySelector('#velocidad'); v.value = 100; v.dispatchEvent(new Event('input')); });
await p.click('#b-iniciar');
await p.waitForFunction(() => window.__listo || window.__error, null, { timeout: 600000 });
await p.waitForFunction(() => !document.querySelector('#b-correr').disabled, null, { timeout: 60000 });
await p.click('#b-correr');
await p.waitForFunction((n) => window.__pasos.length >= n || window.__error, PASOS, { timeout: 3600000, polling: 500 });
const r = await p.evaluate(() => ({ listo: window.__listo, pasos: window.__pasos, error: window.__error }));
await b.close();
if (r.error) { console.log('error', r.error.slice(0, 300)); process.exit(1); }
const dt = r.pasos.slice(1).map((x, i) => x.t - r.pasos[i].t).sort((a, b) => a - b), med = dt[Math.floor(dt.length / 2)];
// días por paso: de las fechas de los pasos
const dias = (Date.parse(r.pasos[r.pasos.length - 1].fecha) - Date.parse(r.pasos[0].fecha)) / 86400000 / Math.max(1, r.pasos.length - 1);
const total = r.pasos[r.pasos.length - 1].t - r.pasos[0].t;
console.log(JSON.stringify({ escenario: ESC, segundosIniciar: +r.listo.segundos.toFixed(2), pasos: r.pasos.length, msPorPaso: Math.round(med), msPorPasoMedia: Math.round(total / Math.max(1, r.pasos.length - 1)), diasPorPaso: +dias.toFixed(1), diasPorSegundo: +(dias * 1000 / (total / Math.max(1, r.pasos.length - 1))).toFixed(2) }));
if (err.length) console.log(err.slice(0, 3));
