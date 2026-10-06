// El «?» de la casilla de correcciones de la interfaz explica TODAS las que enciende: cada
// interruptor del motor (y cada ajuste de parámetros) tiene su frase en español y en inglés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRECCIONES_ANIMAL } from '../motor/modelos/animal.js?v=202610060010';
import { CORRECCIONES_PLANTAS, CORRECCIONES_HIDROLOGIA, CORRECCIONES_SUELO, CORRECCIONES_HOJARASCA, AJUSTES } from '../motor/correcciones.js?v=202610060010';
import { TEXTO_CORRECCION, TEXTO_AJUSTE, htmlAyudaCorrecciones } from '../interfaz/ayuda-correcciones.js?v=202610060010';

test('cada corrección y cada ajuste tienen su explicación en los dos idiomas', () => {
  const todas = [CORRECCIONES_ANIMAL, CORRECCIONES_PLANTAS, CORRECCIONES_HIDROLOGIA, CORRECCIONES_SUELO, CORRECCIONES_HOJARASCA].flatMap(Object.keys);
  for (const k of todas) assert.ok(TEXTO_CORRECCION[k]?.[0] && TEXTO_CORRECCION[k]?.[1], `falta la explicación de la corrección ${k}`);
  for (const k of Object.keys(AJUSTES)) assert.ok(TEXTO_AJUSTE[k]?.[0] && TEXTO_AJUSTE[k]?.[1], `falta la explicación del ajuste ${k}`);
  for (const k of Object.keys(TEXTO_CORRECCION)) assert.ok(todas.includes(k), `${k} se explica pero ya no está en el motor`);
  for (const T of [(es) => es, (es, en) => en]) {
    const h = htmlAyudaCorrecciones(T);
    assert.ok(!/sin explicación|no explanation/.test(h));
    for (const k of todas) assert.ok(h.includes(`>${k}<`), `${k} no sale en el globo`);
  }
});
