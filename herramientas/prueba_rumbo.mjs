// Que los animales miren hacia donde van: compara el rumbo con el que se dibujan con la dirección en la que se mueven
// (grados; «masDe90» = andando de lado o de espaldas). node herramientas/prueba_rumbo.mjs (servidor en 8191)
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
const { chromium } = await import('playwright');
const b = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
await p.goto('http://localhost:8191/vivo/');
await p.waitForFunction(() => window.__vivo?.diaCompleto && window.__vivo.bosque, null, { timeout: 180000 });
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const v = window.__vivo, man = v.manada;
  v.ponerVelocidad(1);
  const desv = [], ej = [];
  const antes = new Map();
  for (let f = 0; f < 400; f++) {
    v.medirCuadros(1);
    for (const a of man.animales.values()) {
      if (!a.visible) continue;
      const q = antes.get(a.id);
      if (q) {
        const dx = a.x - q.x, dz = a.z - q.z, l = Math.hypot(dx, dz);
        if (l > 0.01 && Math.abs(a.y - q.y) < l && a.rumboVis != null) {
          const d = Math.round(Math.acos(Math.max(-1, Math.min(1, (dx * Math.cos(a.rumboVis) + dz * Math.sin(a.rumboVis)) / l))) * 180 / Math.PI);
          desv.push(d); if (d > 90 && ej.length < 10) ej.push({ esp: a.s.e.id, d, est: a.estado, l: +l.toFixed(3) });
        }
      }
      antes.set(a.id, { x: a.x, z: a.z, y: a.y });
    }
  }
  desv.sort((a, b) => a - b);
  return { n: desv.length, mediana: desv[desv.length >> 1], p90: desv[Math.floor(desv.length * 0.9)], masDe90: desv.filter((d) => d > 90).length, ej };
});
console.log(JSON.stringify(r));
await b.close();
