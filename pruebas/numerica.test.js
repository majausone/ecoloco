// Comprueba bit a bit las funciones numéricas del motor contra vectores generados con
// numpy (herramientas/vectores_numericos.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { exp, log, log10, pow, sin, cos, asin } from '../motor/num/ucrt.js?v=202610060036';

const DIR = new URL('../datos/vectores/', import.meta.url);

function cargar(nombre) {
  const url = new URL(`${nombre}.bin`, DIR);
  if (!existsSync(url)) return null;
  const b = readFileSync(url);
  const a = new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8);
  const [n, c] = [a[0], a[1]];
  return { n, c, datos: a.subarray(2) };
}

function comprobar(nombre, f) {
  const v = cargar(nombre);
  if (!v) return test.skip(`${nombre}: faltan vectores`);
  test(`${nombre} coincide bit a bit con numpy`, () => {
    let malos = 0;
    const ejemplos = [];
    for (let i = 0; i < v.n; i++) {
      const fila = v.datos.subarray(i * v.c, (i + 1) * v.c);
      const esperado = fila[v.c - 1];
      const obtenido = f(...fila.subarray(0, v.c - 1));
      if (!Object.is(obtenido, esperado)) {
        malos++;
        if (ejemplos.length < 5) ejemplos.push([...fila.subarray(0, v.c - 1), obtenido, esperado]);
      }
    }
    assert.equal(malos, 0, `${malos} de ${v.n} difieren, p.ej. ${JSON.stringify(ejemplos)}`);
  });
}

comprobar('exp', exp);
comprobar('log', log);
comprobar('log10', log10);
comprobar('asin', asin);
comprobar('pow', pow);
comprobar('sin', sin);
comprobar('cos', cos);
