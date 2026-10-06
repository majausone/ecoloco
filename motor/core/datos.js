// Data (core/data.py): el almacén compartido de variables entre módulos.
// Al leer una variable con eje time_index se devuelve el corte del paso actual.

import { Arr } from './arr.js?v=202610060036';

export class Datos {
  constructor(rejilla, conocidas) {
    this.grid = rejilla;
    this.conocidas = conocidas; // metadatos.variables
    this.vars = new Map();
    this.time_index = 0;
  }

  has(nombre) { return this.vars.has(nombre); }

  // data[nombre]
  get(nombre) {
    const v = this.vars.get(nombre);
    if (!v) throw new Error(`Variable no presente en los datos: ${nombre}`);
    return v.dims.includes('time_index') ? v.isel('time_index', this.time_index) : v;
  }

  // data.data[nombre] (sin cortar por tiempo)
  serie(nombre) {
    const v = this.vars.get(nombre);
    if (!v) throw new Error(`Variable no presente en los datos: ${nombre}`);
    return v;
  }

  corte(nombre, t) { return this.serie(nombre).isel('time_index', t); }

  set(nombre, arr) {
    if (!(arr instanceof Arr)) throw new Error('Only DataArray objects can be added to Data instances');
    if (this.conocidas && !(nombre in this.conocidas)) {
      throw new Error(`Attempt to add unknown variable to data: '${nombre}'`);
    }
    this.vars.set(nombre, arr);
  }

  addFromDict(d) { for (const [k, v] of Object.entries(d)) this.set(k, v); }

  nombres() { return [...this.vars.keys()]; }
}
