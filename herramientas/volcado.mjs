// Lector (Node) de los volcados del oráculo (herramientas/volcado.py).
import { readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { Arr } from '../motor/core/arr.js';

export class Volcado {
  constructor(dir) {
    this.dir = dir;
    this.indice = JSON.parse(readFileSync(join(dir, 'indice.json'), 'utf8'));
    this.porClave = new Map(this.indice.map((e) => [e.clave, e]));
    this.fd = openSync(join(dir, 'datos.bin'), 'r');
  }

  cerrar() { closeSync(this.fd); }

  claves() { return this.indice.map((e) => e.clave); }

  // clave de la llamada a un modelo: init/NN_modelo o upd/tttt/k_modelo
  buscar(etapa, modelo, t) {
    const pref = etapa === 'init' ? 'init/' : `upd/${String(t).padStart(4, '0')}/`;
    return this.indice.find((e) => e.clave.startsWith(pref) && e.clave.endsWith(`_${modelo}`));
  }

  arr(entrada, nombre) {
    const m = entrada.vars[nombre];
    if (!m) return null;
    const buf = Buffer.alloc(m.n * 8);
    readSync(this.fd, buf, 0, m.n * 8, m.offset);
    const data = new Float64Array(buf.buffer, buf.byteOffset, m.n).slice();
    return new Arr(m.dims, m.shape, data, m.coords);
  }
}
