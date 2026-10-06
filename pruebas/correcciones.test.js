// La página «Possible issues» (possible-issues/index.html, la que abre el «?» de la casilla
// «fix the herbivore bug») explica TODAS las correcciones que enciende la casilla: cada
// interruptor del motor sale en ella. Se rehace con node herramientas/possible_issues.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CORRECCIONES_ANIMAL } from '../motor/modelos/animal.js?v=202610060036';
import { CORRECCIONES_PLANTAS, CORRECCIONES_HIDROLOGIA, CORRECCIONES_SUELO, CORRECCIONES_HOJARASCA } from '../motor/correcciones.js?v=202610060036';

test('la página de posibles fallos nombra cada interruptor de las correcciones', () => {
  const html = readFileSync(new URL('../possible-issues/index.html', import.meta.url), 'utf8');
  const todas = [CORRECCIONES_ANIMAL, CORRECCIONES_PLANTAS, CORRECCIONES_HIDROLOGIA, CORRECCIONES_SUELO, CORRECCIONES_HOJARASCA].flatMap(Object.keys);
  const enPagina = new Set(html.split('switch: <code>').slice(1).flatMap((t) => t.split('</code>')[0].split(',').map((s) => s.trim())));
  for (const k of todas) assert.ok(enPagina.has(k), `la corrección ${k} no sale en possible-issues/index.html`);
});
