// CoreComponents: tiempos del modelo (ModelTiming) y estructura vertical de capas
// (LayerStructure), como core/core_components.py.

import { Arr } from './arr.js?v=202610052309';
import { nansumaEje } from '../num/np.js?v=202610052309';
import { f64 } from '../num/f64.js?v=202610052309';

// ------------------------------------------------------------------ cantidades de tiempo
// Factores de pint en segundos (year = 365.25 días, month = year / 12).
const UNIDADES = {
  second: 1, seconds: 1, s: 1, sec: 1,
  minute: 60, minutes: 60, min: 60,
  hour: 3600, hours: 3600, h: 3600, hr: 3600,
  day: 86400, days: 86400, d: 86400,
  week: 604800, weeks: 604800,
  month: 2629800, months: 2629800,
  year: 31557600, years: 31557600, a: 31557600,
};

export function cantidadASegundos(texto) {
  const m = String(texto).trim().match(/^([0-9.eE+-]+)\s*([A-Za-z_]+)$/);
  if (!m || !(m[2] in UNIDADES)) throw new Error(`Cannot parse value as time quantity: ${texto}`);
  return Number(m[1]) * UNIDADES[m[2]];
}

const DIA_MS = 86400000;
function fechaADias(fecha) { return Date.parse(`${fecha}T00:00:00Z`) / DIA_MS; }
export function diasAFecha(d) { return new Date(d * DIA_MS).toISOString().slice(0, 10); }

export class ModelTiming {
  constructor(cfg) {
    this.start_date = cfg.start_date;
    this.startSeg = fechaADias(cfg.start_date) * 86400;
    this.update_interval = Math.trunc(cantidadASegundos(cfg.update_interval));
    this.run_length = Math.trunc(cantidadASegundos(cfg.run_length));
    this.update_interval_text = cfg.update_interval;
    const n = Math.ceil(this.run_length / this.update_interval);
    this.n_updates = Math.trunc((n * this.update_interval) / this.update_interval);
    this.endSeg = this.startSeg + n * this.update_interval;
    // fechas (datetime64[D]) de inicio de cada paso: suelo de días
    this.update_datestamps = [];
    for (let k = 0; k < this.n_updates; k++) {
      this.update_datestamps.push(Math.floor((this.startSeg + k * this.update_interval) / 86400));
    }
    this.updates_per_year = 31536000 / this.update_interval;
    this.update_interval_seconds = this.update_interval;
    // pint: update_interval_quantity.to('days').magnitude
    this.update_interval_days = cantidadASegundos(cfg.update_interval) / 86400;
    this.start_day = this.startSeg / 86400;
  }
}

// ------------------------------------------------------------------ capas
export class LayerStructure {
  constructor(cfg, nCells, microbialDepth) {
    this.n_cells = nCells;
    this.microbial_simulation_depth = microbialDepth;
    this.n_canopy_layers = cfg.canopy_layers;
    this.soil_layer_depths = f64(cfg.soil_layers);
    this.n_soil_layers = this.soil_layer_depths.length;
    this.above_canopy_height_offset = cfg.above_canopy_height_offset;
    this.surface_layer_height = cfg.surface_layer_height;
    this.subcanopy_layer_height = cfg.subcanopy_layer_height;
    this.layer_roles = ['above', ...Array(this.n_canopy_layers).fill('canopy'), 'surface', 'topsoil',
      ...Array(this.n_soil_layers - 1).fill('subsoil')];
    this.n_layers = this.layer_roles.length;
    this.layer_indices = this.layer_roles.map((_, i) => i);
    this.lowest_canopy_filled = new Float64Array(nCells).fill(NaN);
    this.n_canopy_layers_filled = 0;
    if (this.soil_layer_depths[this.n_soil_layers - 1] > -microbialDepth) {
      throw new Error('Maximum depth of soil layers is less than the soil-microbial simulation depth');
    }
    const fronteras = [0, ...this.soil_layer_depths];
    this.soil_layer_thickness = new Float64Array(this.n_soil_layers);
    this.soil_layer_active_thickness = new Float64Array(this.n_soil_layers);
    for (let i = 0; i < this.n_soil_layers; i++) {
      this.soil_layer_thickness[i] = -(fronteras[i + 1] - fronteras[i]);
      const m = Math.min(this.soil_layer_thickness[i], fronteras[i] + microbialDepth);
      this.soil_layer_active_thickness[i] = m < 0 ? 0 : m;
    }
    this.bool = {};
    this.int = {};
    for (const rol of ['above', 'canopy', 'surface', 'topsoil', 'subsoil']) {
      this._base(rol, this.layer_roles.map((r) => r === rol));
    }
    this._base('all_soil', this.layer_roles.map((_, i) => this.bool.topsoil[i] || this.bool.subsoil[i]));
    this._base('atmosphere', this.bool.all_soil.map((v) => !v));
    this._base('active_soil', [...Array(this.n_canopy_layers + 2).fill(false),
      ...Array.from(this.soil_layer_active_thickness, (v) => v > 0)]);
    this._base('filled_canopy', Array(this.n_layers).fill(false));
    this._actualizarDerivados();
    this.index_above_scalar = this.int.above[0];
    this.index_surface_scalar = this.int.surface[0];
    this.index_topsoil_scalar = this.int.topsoil[0];
  }

  _base(nombre, bools) {
    this.bool[nombre] = bools;
    this.int[nombre] = bools.flatMap((v, i) => (v ? [i] : []));
  }

  _actualizarDerivados() {
    const b = this.bool;
    this._base('filled_atmosphere', this.layer_roles.map((_, i) => b.above[i] || b.filled_canopy[i] || b.surface[i]));
    this._base('flux_layers', this.layer_roles.map((_, i) => b.filled_canopy[i] || b.surface[i] || b.topsoil[i]));
  }

  // canopy_heights: Float64Array (n_canopy_layers, n_cells)
  setFilledCanopy(alturas) {
    const nc = this.n_canopy_layers, n = this.n_cells;
    const presente = new Float64Array(nc * n);
    for (let i = 0; i < nc * n; i++) presente[i] = alturas[i] === alturas[i] ? 1 : 0;
    const filled = Array(this.n_layers).fill(false);
    for (let l = 0; l < nc; l++) {
      for (let c = 0; c < n; c++) if (presente[l * n + c]) { filled[l + 1] = true; break; }
    }
    this._base('filled_canopy', filled);
    const bajo = nansumaEje(presente, [nc, n], 0).data;
    this.lowest_canopy_filled = f64(bajo, (v) => (v > 0 ? v : NaN));
    this.n_canopy_layers_filled = filled.filter((v) => v).length;
    this._actualizarDerivados();
  }

  fromTemplate() {
    return Arr.lleno(['layers', 'cell_id'], [this.n_layers, this.n_cells], NaN, {
      layers: this.layer_indices.slice(), cell_id: Array.from({ length: this.n_cells }, (_, i) => i),
    });
  }
}
