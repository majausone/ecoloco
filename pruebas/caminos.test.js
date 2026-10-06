// Los que no nadan (insectos, lombrices) buscan camino: cruzan el río por los troncos caídos (mapa.puentes) y
// rodean las charcas, en vez de chocar con el agua y quedarse parados en la orilla. Necesita
// datos/escenarios/maliau.json; si no está, se salta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Mundo } from '../mundo/mundo.js?v=202610060010';
import { reiniciarIds } from '../mundo/agentes.js?v=202610060010';
import { CLAVE, ESTADISTICAS, rutaLiana } from '../mundo/dia.js?v=202610060010';
import { E } from '../mundo/especies.js?v=202610060010';

const RUTA = new URL('../datos/escenarios/maliau.json', import.meta.url);
const leer = (r) => JSON.parse(readFileSync(r, 'utf8'));
const mundo = () => { reiniciarIds(); return new Mundo(leer(RUTA), leer(new URL('../motor/meta/metadatos.json', import.meta.url)), { semilla: 1, semillasPorDia: 2, pasadasDirector: 1 }); };

test('hay de 2 a 4 troncos caídos de orilla a orilla, con los extremos en tierra', { skip: !existsSync(RUTA) }, () => {
  const m = mundo().mapa;
  assert.ok(m.puentes.length >= 2 && m.puentes.length <= 4, `${m.puentes.length} troncos`);
  for (const p of m.puentes) {
    assert.ok(!m.esAgua(p.x0, p.z0) && !m.esAgua(p.x1, p.z1), 'los extremos, en tierra');
    assert.ok(Math.sign(p.x0 - m.rioX(p.z0)) !== Math.sign(p.x1 - m.rioX(p.z1)), 'uno a cada lado del río');
  }
});

test('los que no nadan casi no chocan con el agua (antes, unas 135 000 veces y 220 atascados por día)', { skip: !existsSync(RUTA) }, () => {
  const m = mundo();
  m.siguienteDia();
  let choques = 0, atascados = 0;
  for (let d = 0; d < 2; d++) {
    ESTADISTICAS.bloqueosAgua = 0; ESTADISTICAS.porAnimal.clear();
    m.siguienteDia();
    choques += ESTADISTICAS.bloqueosAgua;
    for (const n of ESTADISTICAS.porAnimal.values()) if (n >= 3) atascados++;
  }
  assert.ok(choques / 2 < 500, `${choques / 2} choques por día`);
  assert.ok(atascados / 2 <= 10, `${atascados / 2} atascados por día`);
});

test('un insecto que anda, en una orilla y con su hogar en la otra, llega cruzando por un tronco', { skip: !existsSync(RUTA) }, () => {
  const m = mundo();
  m.siguienteDia();
  const mapa = m.mapa, p = mapa.puentes[0];
  const ux = p.x1 - p.x0, uz = p.z1 - p.z0, l = Math.hypot(ux, uz);
  // un escarabajo tigre (de día, anda): a 4 m de una punta del tronco y su hogar a 4 m de la otra; el día empieza de noche, así que se va a casa
  const a = [...m.agentes.values()].find((x) => x.especieId === 'escarabajo-tigre');
  assert.ok(a, 'hay un escarabajo tigre');
  a.x = p.x0 - (ux / l) * 4 + (uz / l) * 1.5; a.z = p.z0 - (uz / l) * 4 - (ux / l) * 1.5;
  a.hogar = { ...a.hogar, x: p.x1 + (ux / l) * 4, z: p.z1 + (uz / l) * 4 };
  a.objetivo = null; a.temporizador = 0; a.marca = null;
  const r = m.siguienteDia();
  const k = r.claves.get(a.id);
  assert.ok(k, 'tiene su línea de tiempo');
  const n = k.length / CLAVE, lado = (x, z) => Math.sign(x - mapa.rioX(z));
  let llego = false, sobreAgua = 0, fueraDelTronco = 0;
  for (let i = 0; i < n; i++) {
    const x = k[i * CLAVE + 1], z = k[i * CLAVE + 3];
    if (Math.hypot(x - a.hogar.x, z - a.hogar.z) < 2 && lado(x, z) === lado(a.hogar.x, a.hogar.z)) llego = true;
    // (entre dos fotogramas va en línea recta: los puntos de en medio, también)
    if (i < n - 1) for (let s = 0; s <= 10; s++) {
      const xx = x + (k[(i + 1) * CLAVE + 1] - x) * s / 10, zz = z + (k[(i + 1) * CLAVE + 3] - z) * s / 10;
      if (!mapa.esAgua(xx, zz)) continue;
      sobreAgua++;
      if (!mapa.puenteEn(xx, zz, 0.35)) fueraDelTronco++;
    }
  }
  assert.ok(llego, 'ha llegado a su hogar, al otro lado');
  assert.ok(sobreAgua > 0, 'ha pasado por encima del agua');
  assert.equal(fueraDelTronco, 0, 'y siempre por encima del tronco');
});

test('los que trepan cruzan el río por una liana de orilla a orilla, en alto, sin nadar', { skip: !existsSync(RUTA) }, () => {
  const m = mundo();
  m.siguienteDia();
  const mapa = m.mapa;
  let l = null;
  for (const b of mapa.baldosasCerca(mapa.ancho / 2, mapa.alto / 2, mapa.ancho)) for (const q of b.lianas || []) if (!l && q.tipo === 'colgante' && q.rio) l = q;
  assert.ok(l, 'hay una liana sobre el río');
  // unos cuantos que trepan (uno de cada especie), a metro y medio del árbol de una orilla (hacia tierra), con la
  // tarea de ir junto al árbol de la otra: su ruta, la que calcula la simulación (rutaLiana); con el temporizador
  // puesto la sigue desde el primer minuto (al empezar el día el motor puede mudar a alguno: se mira por dónde cruzan)
  const ladoA = Math.sign(l.a.x - mapa.rioX(l.a.z)), ladoB = Math.sign(l.b.x - mapa.rioX(l.b.z));
  const elegidos = [];
  for (const esp of ['macaco', 'ardilla-prevost', 'pantera-nebulosa', 'orangutan']) {
    const a = [...m.agentes.values()].find((x) => x.especieId === esp && !x.siguiendo);
    if (!a) continue;
    a.x = l.a.x + ladoA * 1.5; a.z = l.a.z; a.y = 0; a.arbol = null; a.marca = null;
    const destino = { x: l.b.x + ladoB * 1.5, z: l.b.z }, ruta = rutaLiana(a, destino.x, destino.z, mapa);
    assert.ok(ruta && ruta.some((p) => p.y > 1), esp + ': su ruta va por la liana');
    a.objetivo = { ...destino, ruta }; a.tarea = null; a.estado = E.andar; a.temporizador = 400;
    elegidos.push({ id: a.id, destino });
  }
  const r = m.siguienteDia();
  // (cerca de la liana: a menos de 3 m de la recta entre sus dos árboles; en otros sitios del río pueden nadar)
  const cerca = (x, z) => { const ux = l.b.x - l.a.x, uz = l.b.z - l.a.z, t = Math.max(0, Math.min(1, ((x - l.a.x) * ux + (z - l.a.z) * uz) / (ux * ux + uz * uz))); return Math.hypot(l.a.x + ux * t - x, l.a.z + uz * t - z) < 3; };
  let cruzan = 0;
  for (const e of elegidos) {
    const d = m.agentes.get(e.id);
    if (!d) continue;
    const k = r.claves.get(e.id), n = k.length / CLAVE;
    let alto = 0, nadando = 0;
    // (el viaje encargado: hasta que llega a su destino; después hace su vida y puede cruzar como le convenga)
    for (let i = 0; i < n; i++) {
      const x = k[i * CLAVE + 1], y = k[i * CLAVE + 2], z = k[i * CLAVE + 3];
      if (Math.hypot(x - e.destino.x, z - e.destino.z) < 1.5) break;
      // (entre dos fotogramas va en línea recta: los puntos de en medio, también)
      if (i < n - 1) for (let s = 0; s < 10; s++) {
        const t = s / 10, xx = x + (k[(i + 1) * CLAVE + 1] - x) * t, yy = y + (k[(i + 1) * CLAVE + 2] - y) * t, zz = z + (k[(i + 1) * CLAVE + 3] - z) * t;
        if (mapa.esAgua(xx, zz) && cerca(xx, zz)) { if (yy > 1) alto++; else nadando++; }
      }
    }
    // (el que ha cruzado por la liana, junto a ella lo ha hecho entero en alto, sin bajar a nadar)
    if (alto > 0) { assert.equal(nadando, 0, d.especieId + ': sin nadar'); cruzan++; }
  }
  assert.ok(cruzan > 0, 'al menos uno ha cruzado el río por la liana, en alto');
});
