// Pruebas del mundo vivo (mundo/) sobre el escenario de Maliau: que sea determinista, que cada
// día haya en el cuadro que se ve los animales que tocan según el motor (n · parte / N de cada cohorte), que
// las cazas y lo comido cuadren y que la línea de tiempo que se dibuja (fotogramas clave) tenga
// sentido. Necesita datos/escenarios/maliau.json (lo genera herramientas/clima_maliau.py); si
// no está, se saltan. Tardan ~1 min.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Mundo } from '../mundo/mundo.js?v=202610052338';
import { reiniciarIds } from '../mundo/agentes.js?v=202610052338';
import { VERTEBRADOS, COMPORTAMIENTO, ESTADOS } from '../mundo/especies.js?v=202610052338';
import { TICS, CLAVE, DETALLE } from '../mundo/dia.js?v=202610052338';

const RUTA = new URL('../datos/escenarios/maliau.json', import.meta.url);
const hay = existsSync(RUTA);
const leer = (r) => JSON.parse(readFileSync(r, 'utf8'));
const escenario = hay ? leer(RUTA) : null;
const meta = leer(new URL('../motor/meta/metadatos.json', import.meta.url));
const DIAS = 4;

function correr(dias, semilla = 1, op = {}) {
  reiniciarIds();
  const m = new Mundo(structuredClone(escenario), meta, { semilla, semillasPorDia: 2, pasadasDirector: 1, ...op });
  const out = [];
  for (let i = 0; i < dias; i++) {
    const r = m.siguienteDia();
    // cohorte -> [lo que toca (n / N), los que hay]
    const cohortes = new Map();
    for (const c of m.puente.cohortes()) if (c.estado === 'activa' && m.vale[c.grupo]) cohortes.set(c.id, [c.n * m.parte(c) / m.vale[c.grupo], 0, c.grupo]);
    for (const a of m.agentes.values()) { const x = cohortes.get(a.cohorte); if (x) x[1]++; else cohortes.set(a.cohorte, [0, 1, a.grupo]); }
    out.push({ r, cohortes, vale: { ...m.vale } });
  }
  out.mundo = m;
  return out;
}
const huella = (r) => {
  const h = createHash('sha256');
  h.update(JSON.stringify(r.medida, (k, v) => (k === 'segundos' ? 0 : v)));
  for (const id of [...r.claves.keys()].sort()) { h.update(id); h.update(Buffer.from(r.claves.get(id).buffer)); }
  h.update(JSON.stringify(r.eventos));
  return h.digest('hex');
};

const resultado = hay ? correr(DIAS) : null;

test('el mundo es determinista: misma semilla, mismos días', { skip: !hay && 'falta maliau.json' }, () => {
  const otra = correr(2);
  for (let i = 0; i < 2; i++) assert.equal(huella(otra[i].r), huella(resultado[i].r), `el día ${i} sale distinto`);
});

test('en el mundo hay los animales de cada cohorte que tocan (n / N, ±1)', { skip: !hay && 'falta maliau.json' }, () => {
  for (const [i, d] of resultado.entries()) {
    for (const [coh, [quiere, hay_, grupo]] of d.cohortes) {
      assert.ok(Math.abs(hay_ - quiere) <= 1.0001, `día ${i}, ${grupo} (${coh}): hay ${hay_} y tocaban ${quiere.toFixed(2)}`);
    }
  }
});

test('un mundo de 100 km²: los animales simulados uno a uno no se disparan y cuadran con el motor', { skip: !hay && 'falta maliau.json' }, () => {
  const d = correr(2, 1, { km2: 100 });
  for (const x of d) {
    assert.ok(x.r.medida.vertebrados <= 6500, `demasiados vertebrados uno a uno: ${x.r.medida.vertebrados}`);
    assert.ok(x.r.medida.animales <= 8500, `demasiados animales uno a uno: ${x.r.medida.animales}`);
    for (const [coh, [quiere, hay_, grupo]] of x.cohortes) assert.ok(Math.abs(hay_ - quiere) <= 1.0001, `100 km², ${grupo} (${coh}): hay ${hay_} y tocaban ${quiere.toFixed(2)}`);
  }
});

test('todas las cazas de vertebrados del motor pasan en el mundo', { skip: !hay && 'falta maliau.json' }, () => {
  for (const [i, d] of resultado.entries()) {
    const m = d.r.medida;
    const hechas = (m.emergentesFinal ?? 0) + (m.forzadasHechas ?? 0) + m.fueraDeVista + m.residuo;
    assert.ok(hechas >= m.cazasMotorAnimales, `día ${i}: el motor dice ${m.cazasMotorAnimales} cazas y en el mundo hay ${hechas}`);
    const cazas = d.r.eventos.filter((e) => e.tipo === 'caza' && VERTEBRADOS.has(e.grupoPresa)).length;
    assert.ok(cazas >= m.cazasMotorAnimales, `día ${i}: el motor dice ${m.cazasMotorAnimales} cazas y solo hay ${cazas} sucesos de caza`);
  }
});

test('la línea de tiempo se puede dibujar: claves en orden, estados válidos, sin saltos', { skip: !hay && 'falta maliau.json' }, () => {
  const maxCorrer = Math.max(...Object.values(COMPORTAMIENTO).map((e) => e.correr));
  for (const d of resultado) {
    const { claves, detalles, agentes } = d.r;
    assert.ok(claves.size > 300, 'casi no hay animales en el cuadro');
    for (const [id, k] of claves) {
      assert.ok(agentes[id], `animal sin descripción: ${id}`);
      assert.equal(k.length % CLAVE, 0);
      assert.equal(detalles.get(id).length / DETALLE, k.length / CLAVE, `${id}: el detalle no va con las claves`);
      const n = k.length / CLAVE;
      for (let i = 0; i < n; i++) {
        const o = i * CLAVE;
        for (let j = 0; j < CLAVE; j++) assert.ok(Number.isFinite(k[o + j]), `${id} clave ${i}: campo ${j} no es un número`);
        assert.ok(k[o] >= 0 && k[o] < TICS, `${id} clave ${i}: tic ${k[o]}`);
        assert.ok(Number.isInteger(k[o + 5]) && k[o + 5] >= 0 && k[o + 5] < ESTADOS.length, `${id} clave ${i}: estado ${k[o + 5]}`);
        if (i === 0) continue;
        const p = o - CLAVE, dt = k[o] - k[p];
        assert.ok(dt >= 0, `${id}: claves desordenadas (${k[p]} → ${k[o]})`);
        // entre dos claves, como mucho lo que da de sí correr (con un margen por el redondeo)
        const paso = Math.hypot(k[o + 1] - k[p + 1], k[o + 3] - k[p + 3]);
        assert.ok(paso <= maxCorrer * 60 * Math.max(dt, 1) * 1.01 + 2, `${id} salta ${paso.toFixed(1)} m en ${dt} min (tic ${k[o]})`);
      }
    }
  }
});

test('lo que se caza y lo que se come en el mundo se parece a lo del motor', { skip: !hay && 'falta maliau.json' }, () => {
  // la masa de las presas: la misma (las presas son individuos de las cohortes que dice el motor)
  let motor = 0, mundo = 0;
  for (const d of resultado) { motor += d.r.medida.masaCazadaMotor; mundo += d.r.medida.masaCazadaMundo; }
  // (pocas cazas en 4 días y cada animal vale por varios: la cifra es ruidosa, de ahí el margen)
  assert.ok(mundo >= motor * 0.1 - 0.02 && mundo <= motor * 10 + 0.05, `masa cazada: motor ${motor.toFixed(3)} kg, mundo ${mundo.toFixed(3)} kg`);
  // lo comido de plantas y hojarasca (el bocado se ajusta solo): a menos de ×3 a partir del 3.er día
  for (const cl of ['plantas', 'hojarasca']) {
    let a = 0, b = 0;
    for (const d of resultado.slice(2)) { a += d.r.medida.comidoClase[cl].motor; b += d.r.medida.comidoClase[cl].mundo; }
    assert.ok(b > a / 3 && b < a * 3, `${cl}: motor ${a.toFixed(4)} kg, mundo ${b.toFixed(4)} kg`);
  }
});

test('los que vuelan, parados, están sobre algo real: una flor, hoja, fruto o rama, su nido o el suelo', { skip: !hay && 'falta maliau.json' }, async () => {
  const { puntosPlanta, varianteDe, escalaDe } = await import('../mundo/posaderos.js?v=202610052338');
  const m = resultado.mundo, r = resultado[resultado.length - 1].r;
  const PARADOS = new Set(['quieto', 'descansar', 'dormir', 'comer']);
  const puntos = (t) => { const p = puntosPlanta(t.especie, varianteDe(t)), e = escalaDe(t), cs = Math.cos(t.giro), sn = Math.sin(t.giro), out = []; for (const k of ['flor', 'fruto', 'hoja', 'rama']) { const l = p[k]; for (let i = 0; i < l.length; i += 3) out.push([t.x + (l[i] * cs + l[i + 2] * sn) * e, l[i + 1] * e, t.z + (-l[i] * sn + l[i + 2] * cs) * e]); } return out; };
  let parados = 0, enElAire = 0;
  for (const [id, k] of r.claves) {
    const a = m.agentes.get(id);
    if (!a || !['vuelo', 'volador', 'planeo'].includes(a.e.mueve)) continue;
    for (let i = 0; i < k.length; i += CLAVE) {
      if (!PARADOS.has(ESTADOS[k[i + 5]])) continue;
      parados++;
      const x = k[i + 1], y = k[i + 2], z = k[i + 3];
      if (y < 0.05) continue;
      if ([a.hogar, ...(a.nidos || [])].some((q) => q && q.y > 0 && Math.hypot(q.x - x, q.z - z) < 0.6 && Math.abs(q.y - y) < 0.1)) continue;
      let md = Infinity;
      for (const t of m.mapa.arbolesCerca(x, z, 20)) for (const p of puntos(t)) md = Math.min(md, Math.hypot(p[0] - x, p[1] - y, p[2] - z));
      if (md > 0.06) enElAire++;
    }
  }
  assert.ok(parados > 200, `pocos fotogramas de voladores parados (${parados})`);
  assert.ok(enElAire / parados < 0.01, `${enElAire} de ${parados} fotogramas de voladores parados están en el aire`);
});
