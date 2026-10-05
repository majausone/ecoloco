// Pruebas de la configuración de un mundo (mundo/config.js, la portada): que cada preajuste
// genere un mundo que el motor puede correr, que las especies quitadas no salgan (y los grupos
// sin especies salgan del motor), que el agua cambie y que saltar a un día lleve el motor a
// ese día con los animales que tocan. Necesita datos/escenarios/maliau.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610052338';
import { reiniciarIds } from '../mundo/agentes.js?v=202610052338';
import { PREAJUSTES, completar, gruposQuitados, aTexto, deTexto } from '../mundo/config.js?v=202610052338';

const RUTA = new URL('../datos/escenarios/maliau.json', import.meta.url);
const hay = existsSync(RUTA);
const texto = hay ? readFileSync(RUTA, 'utf8') : null;
const meta = JSON.parse(readFileSync(new URL('../motor/meta/metadatos.json', import.meta.url), 'utf8'));
const crear = (c) => { reiniciarIds(); return new Mundo(JSON.parse(texto), meta, { config: completar(c), semillasPorDia: 1 }); };

test('la configuración va y vuelve por la dirección', () => {
  const c = completar({ nombre: 'Ribera ñ', rio: 'ancho', quitar: ['orangutan'] });
  assert.deepEqual(deTexto(aTexto(c)), c);
});

test('cada preajuste (a 0,66 km²) da un mundo que corre', { skip: !hay && 'falta maliau.json' }, () => {
  for (const p of PREAJUSTES) {
    const m = crear({ ...p.config, km2: 0.6561 });
    for (let i = 0; i < 2; i++) assert.ok(m.siguienteDia().medida.animales > 100, `${p.nombre}: casi no hay animales`);
  }
});

test('las especies quitadas no salen, y un grupo sin especies sale del motor', { skip: !hay && 'falta maliau.json' }, () => {
  const quitar = ['orangutan', 'rana-gigante-rio', 'rana-arboricola', 'dipterocarpo', 'amanita', 'russula', 'boleto-ruibarbo'];
  const c = completar({ quitar, rio: 'ninguno', charcas: 'muchas' });
  assert.ok(gruposQuitados(c).has('frog'));
  const m = crear(c);
  m.siguienteDia();
  const especies = new Set([...m.agentes.values()].map((a) => a.especieId));
  for (const q of quitar) assert.ok(!especies.has(q), `sale ${q}`);
  assert.ok(!m.puente.cohortes().some((x) => x.grupo === 'frog'), 'el motor sigue teniendo ranas');
  assert.equal(m.mapa.rio, null);
  assert.ok(m.mapa.charcas.every((l) => l.length >= 3));
  const dibujo = new Set();
  for (const b of m.mapa.baldosasCerca(m.mapa.centro.x, m.mapa.centro.z, 150)) { for (const a of b.arboles) dibujo.add(a.especie); for (const s of b.setas) dibujo.add(s.especie); }
  for (const q of ['dipterocarpo', 'amanita', 'russula', 'boleto-ruibarbo']) assert.ok(!dibujo.has(q), `se dibuja ${q}`);
});

test('saltar a un día: el motor llega y cada cohorte tiene sus animales', { skip: !hay && 'falta maliau.json' }, () => {
  const m = crear({});
  m.saltarA(6);
  assert.equal(m.puente.dia, 6);
  for (const c of m.puente.cohortes()) {
    if (c.estado !== 'activa' || !m.vale[c.grupo]) continue;
    const n = m.vivosDe(c.id).length, quiere = c.n * m.parte(c) / m.vale[c.grupo];
    assert.ok(Math.abs(n - quiere) <= 1.0001, `${c.grupo}: hay ${n} y tocaban ${quiere.toFixed(2)}`);
  }
  assert.equal(m.siguienteDia().dia, 6);
});

test('parámetros: la lluvia ×0,25 desde un día cambia ese día y los siguientes, no los de antes', { skip: !hay && 'falta maliau.json' }, () => {
  const a = crear({}), b = crear({});
  b.cambiarParametros({ lluvia: 0.25 }, 2);
  for (let i = 0; i < 4; i++) {
    const ra = a.puente.paso(), rb = (b.aplicarCambiosDe(b.puente.dia), b.puente.paso());
    if (i < 2) assert.equal(rb.clima.lluvia, ra.clima.lluvia, `día ${i}: ha cambiado antes de tiempo`);
    else assert.ok(Math.abs(rb.clima.lluvia - ra.clima.lluvia * 0.25) < 1e-9, `día ${i}: lluvia ${rb.clima.lluvia} y tocaba ${ra.clima.lluvia * 0.25}`);
  }
});

test('una instantánea del mundo rehace el día igual', { skip: !hay && 'falta maliau.json' }, () => {
  const m = crear({});
  m.siguienteDia();
  const copia = m.instantanea();
  copia.registro = m.registro;
  const r1 = m.siguienteDia();
  copia.registro.p = copia.puente; copia.registro.recortar(1);
  const r2 = copia.siguienteDia();
  assert.equal(r2.medida.animales, r1.medida.animales);
  assert.equal(r2.medida.cazasMotor, r1.medida.cazasMotor);
  assert.equal(JSON.stringify(r2.totales), JSON.stringify(r1.totales));
});
