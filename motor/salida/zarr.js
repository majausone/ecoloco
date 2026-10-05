// Salida en el mismo formato que el original (core/data.py: save_to_zarr y
// save_current_state_to_zarr): un almacén zarr v2 con los grupos inputs, init y outputs.
// Aquí sin compresión (xarray lo lee igual). No toca el disco: devuelve un Map
// ruta -> Uint8Array, así sirve tanto en Node (se escribe a ficheros) como en el
// navegador (se empaqueta para descargar).

import { diasAFecha } from '../core/componentes.js?v=202610052205';
import { f64 } from '../num/f64.js?v=202610052205';

const texto = (o) => new TextEncoder().encode(JSON.stringify(o, null, 2));

function bytesF64(a) { return new Uint8Array(f64(a).buffer); }
function bytesI64(a) { return new Uint8Array(BigInt64Array.from(a, (v) => BigInt(v)).buffer); }
function bytesI32(a) { return new Uint8Array(Int32Array.from(a).buffer); }
// '<Un': UTF-32LE de ancho fijo, como numpy
function bytesU(a, n) {
  const out = new Uint32Array(a.length * n);
  a.forEach((s, i) => { [...String(s)].forEach((ch, j) => { out[i * n + j] = ch.codePointAt(0); }); });
  return new Uint8Array(out.buffer);
}

function zarray(shape, chunks, dtype, fill) {
  return {
    shape, chunks, dtype, fill_value: fill, order: 'C', filters: null, dimension_separator: '.',
    compressor: null, zarr_format: 2,
  };
}

class Grupo {
  constructor(ficheros, nombre) {
    this.f = ficheros;
    this.n = nombre;
    this.f.set(`${nombre}/.zgroup`, texto({ zarr_format: 2 }));
    this.f.set(`${nombre}/.zattrs`, texto({}));
    this.coords = new Map(); // nombre -> {dims, valores, dtype}
  }

  coord(nombre, dims, valores, dtype) {
    if (this.coords.has(nombre)) return;
    this.coords.set(nombre, { dims, valores, dtype });
  }

  // array entero en un solo trozo (o por pasos de tiempo si porPaso)
  variable(nombre, dims, shape, bytes, dtype, attrs, trozos = null) {
    const fill = dtype === '<f8' ? 'NaN' : null;
    const chunks = trozos ? trozos.chunks : shape;
    this.f.set(`${this.n}/${nombre}/.zarray`, texto(zarray(shape, chunks, dtype, fill)));
    this.f.set(`${this.n}/${nombre}/.zattrs`, texto({ ...attrs, _ARRAY_DIMENSIONS: dims }));
    if (trozos) for (const [k, b] of trozos.datos) this.f.set(`${this.n}/${nombre}/${k}`, b);
    else this.f.set(`${this.n}/${nombre}/${shape.length ? shape.map(() => 0).join('.') : '0'}`, bytes);
  }

  cerrarCoords() {
    for (const [nombre, c] of this.coords) {
      let b, dtype = c.dtype;
      if (dtype === '<i8') b = bytesI64(c.valores);
      else if (dtype === '<i4') b = bytesI32(c.valores);
      else if (dtype === '<f8') b = bytesF64(c.valores);
      else {
        const n = Math.max(1, ...c.valores.map((s) => [...String(s)].length));
        dtype = `<U${n}`;
        b = bytesU(c.valores, n);
      }
      this.variable(nombre, c.dims, [c.valores.length], b, dtype, {});
    }
  }
}

// Coordenadas de una variable (las de sus dimensiones y x, y, layer_roles)
function ponerCoords(g, arr, sim, xy) {
  for (const d of arr.dims) {
    if (d === 'time_index') continue;
    const v = arr.coords[d];
    if (d === 'layers') {
      g.coord('layers', ['layers'], sim.layer_structure.layer_indices, '<i8');
      g.coord('layer_roles', ['layers'], sim.layer_structure.layer_roles, 'U');
    } else if (d === 'cell_id') {
      g.coord('cell_id', ['cell_id'], sim.grid.cell_id, '<i8');
      if (xy) { g.coord('x', ['cell_id'], xy.x, '<i4'); g.coord('y', ['cell_id'], xy.y, '<i4'); }
    } else if (v) {
      g.coord(d, [d], v, typeof v[0] === 'string' ? 'U' : '<i8');
    } else g.coord(d, [d], Array.from({ length: arr.shape[arr.dims.indexOf(d)] }, (_, i) => i), '<i8');
  }
}

function atributos(sim, nombre, arr, xy) {
  const m = sim.meta.variables[nombre] || {};
  const a = {};
  if (m.unit !== undefined) a.unit = m.unit;
  if (m.description !== undefined) a.description = m.description;
  const c = [];
  if (arr.dims.includes('layers')) c.push('layer_roles');
  if (arr.dims.includes('cell_id') && xy) c.push('x', 'y');
  if (c.length) a.coordinates = c.join(' ');
  return a;
}

function coordsXY(sim) {
  for (const v of Object.values(sim.escenario.inputs)) {
    if (v.coords && v.coords.x && v.coords.y) return { x: v.coords.x, y: v.coords.y };
  }
  return null;
}

export function escribirZarr(sim) {
  const f = new Map();
  f.set('.zgroup', texto({ zarr_format: 2 }));
  f.set('.zattrs', texto({}));
  const xy = coordsXY(sim);
  const nT = sim.model_timing.n_updates;
  const tiempo = Array.from({ length: nT }, (_, i) => i);

  // inputs y init: estado tras cargar los datos / tras inicializar los módulos
  const fijo = (nombreGrupo, nombres, fuente) => {
    const g = new Grupo(f, nombreGrupo);
    for (const k of nombres) {
      const a = fuente(k);
      ponerCoords(g, a, sim, xy);
      if (a.dims.includes('time_index')) g.coord('time_index', ['time_index'], tiempo, '<i8');
      const ent = sim.escenario.inputs[k];
      const entero = nombreGrupo === 'inputs' && ent && ent.dtype === 'int64';
      g.variable(k, a.dims, a.shape, entero ? bytesI64(a.data) : bytesF64(a.data), entero ? '<i8' : '<f8', atributos(sim, k, a, xy));
    }
    if ([...g.coords.keys()].length && !g.coords.has('time_index')) g.coord('time_index', ['time_index'], tiempo, '<i8');
    g.cerrarCoords();
  };
  fijo('inputs', sim.varsInputs, (k) => sim.entradas.get(k));
  fijo('init', sim.varsInit, (k) => sim.estadoInicial.get(k));

  // outputs: un trozo por paso a lo largo de time_index
  const g = new Grupo(f, 'outputs');
  const pasos = sim.salidas.size ? [...sim.salidas.values()][0].length : 0;
  for (const k of sim.varsSalida) {
    const serie = sim.salidas.get(k) || [];
    if (!serie.length) continue;
    const a0 = serie[0];
    ponerCoords(g, a0, sim, xy);
    const datos = serie.map((a, t) => [[t, ...a.shape.map(() => 0)].join('.'), bytesF64(a.data)]);
    g.variable(k, ['time_index', ...a0.dims], [pasos, ...a0.shape], null, '<f8', atributos(sim, k, a0, xy),
      { chunks: [1, ...a0.shape], datos });
  }
  const dia0 = sim.model_timing.start_day;
  g.variable('time_index', ['time_index'], [pasos], null, '<i8', {},
    { chunks: [1], datos: tiempo.slice(0, pasos).map((t) => [String(t), bytesI64([t])]) });
  g.variable('timestamp', ['time_index'], [pasos], null, '<i8',
    { units: `days since ${diasAFecha(dia0)} 00:00:00`, calendar: 'proleptic_gregorian' },
    { chunks: [1], datos: tiempo.slice(0, pasos).map((t) => [String(t), bytesI64([sim.model_timing.update_datestamps[t] - dia0])]) });
  g.coords.delete('time_index');
  g.cerrarCoords();
  return f;
}
