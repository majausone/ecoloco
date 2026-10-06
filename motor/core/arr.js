// Arr: el equivalente mínimo de un xarray.DataArray: dimensiones con nombre, forma,
// datos float64 en orden C y coordenadas por dimensión.

import { f64 } from '../num/f64.js?v=202610060036';
export class Arr {
  constructor(dims, shape, data, coords = {}) {
    this.dims = dims;
    this.shape = shape;
    this.data = data || new Float64Array(shape.reduce((a, b) => a * b, 1));
    this.coords = coords;
    if (this.data.length !== shape.reduce((a, b) => a * b, 1)) {
      throw new Error(`Arr: ${this.data.length} datos para la forma ${shape}`);
    }
  }

  static lleno(dims, shape, valor, coords = {}) {
    const a = new Arr(dims, shape, null, coords);
    a.data.fill(valor);
    return a;
  }

  get size() { return this.data.length; }
  get ndim() { return this.dims.length; }

  copy() { return new Arr(this.dims.slice(), this.shape.slice(), f64(this.data), { ...this.coords }); }

  conDatos(data) { return new Arr(this.dims.slice(), this.shape.slice(), data, { ...this.coords }); }

  // Fila k del primer eje (vista copiada)
  fila(k) {
    const n = this.data.length / this.shape[0];
    return this.data.subarray(k * n, (k + 1) * n);
  }

  eje(nombre) {
    const i = this.dims.indexOf(nombre);
    if (i < 0) throw new Error(`Arr: no hay dimensión ${nombre} en ${this.dims}`);
    return i;
  }

  // isel sobre una dimensión con un índice entero (quita la dimensión)
  isel(dim, k) {
    const ax = this.eje(dim);
    if (k < 0 || k >= this.shape[ax]) throw new Error(`IndexError: index ${k} is out of bounds for axis ${ax} with size ${this.shape[ax]}`);
    const ext = this.shape.slice(0, ax).reduce((a, b) => a * b, 1);
    const int = this.shape.slice(ax + 1).reduce((a, b) => a * b, 1);
    const n = this.shape[ax];
    const out = new Float64Array(ext * int);
    for (let e = 0; e < ext; e++) {
      for (let j = 0; j < int; j++) out[e * int + j] = this.data[(e * n + k) * int + j];
    }
    const dims = this.dims.filter((_, i) => i !== ax);
    const shape = this.shape.filter((_, i) => i !== ax);
    const coords = { ...this.coords };
    delete coords[dim];
    return new Arr(dims, shape, out, coords);
  }

  // sel(element='C') y similares: índice por valor de coordenada
  sel(dim, valor) {
    const c = this.coords[dim];
    if (!c) throw new Error(`Arr.sel: sin coordenadas para ${dim}`);
    const k = c.indexOf(valor);
    if (k < 0) throw new Error(`Arr.sel: ${valor} no está en ${dim}`);
    return this.isel(dim, k);
  }
}
