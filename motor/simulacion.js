// Simulacion: el bucle principal (main.py: ve_run) sin nada de entrada/salida.
//
//   const sim = new Simulacion(escenario, { semilla: 1 });
//   sim.inicializar();
//   while (!sim.terminada) sim.paso();
//
// El motor no sabe nada de pantallas: corre igual en Node que en un Web Worker.
// El escenario es el JSON de herramientas/convertir_entradas.py (o uno editado en la
// interfaz). El azar se siembra igual que en herramientas/oraculo.py.

import { Arr } from './core/arr.js?v=202610032115';
import { Datos } from './core/datos.js?v=202610032115';
import { Rejilla } from './core/rejilla.js?v=202610032115';
import { LayerStructure, ModelTiming } from './core/componentes.js?v=202610032115';
import { setupVariables, getModelOrder } from './core/variables.js?v=202610032115';
import { PyRandom, RandomState } from './azar/mt19937.js?v=202610032115';
import { Generator } from './azar/pcg64.js?v=202610032115';
import { MODELOS } from './modelos/index.js?v=202610032115';

export function decodificar(v) {
  if (v === 'NaN') return NaN;
  if (v === 'Infinity') return Infinity;
  if (v === '-Infinity') return -Infinity;
  if (v === null) return NaN;
  return v;
}

export class Azar {
  constructor(semilla) {
    this.semilla = semilla;
    this.py = new PyRandom(semilla);
    this.np = new RandomState(semilla);
    this.nRng = 0;
    this.nUuid = 0;
    this.nCohorte = 0;
  }

  // estado volcado por el oráculo (solo para sustituir módulos en pruebas)
  restaurar(a) {
    this.py.mt.mt.set(a.py.slice(0, 624));
    this.py.mt.pos = a.py[624];
    this.np.mt.mt.set(a.np);
    this.np.mt.pos = a.np_pos;
    this.np.hasGauss = !!a.np_has_gauss;
    this.np.gauss = a.np_gauss;
    this.nRng = a.n_rng;
    this.nUuid = a.n_uuid;
    this.nCohorte = a.n_cohorte;
  }

  // np.random.default_rng(None) -> default_rng([semilla, k])
  defaultRng() { return new Generator([this.semilla, this.nRng++]); }

  // uuid.UUID(int=k, version=4)
  uuid4() {
    this.nUuid += 1;
    let v = BigInt(this.nUuid);
    v &= ~(0xc000n << 48n); v |= 0x8000n << 48n;
    v &= ~(0xf000n << 64n); v |= 4n << 76n;
    const h = v.toString(16).padStart(32, '0');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

export class Simulacion {
  constructor(escenario, { semilla = 1, meta, sustituto = null, observador = null, guardarSalidas = true, registrarEventos = false } = {}) {
    if (!meta) throw new Error('Simulacion: hacen falta los metadatos (motor/meta/metadatos.json)');
    this.escenario = escenario;
    this.config = escenario.config;
    this.meta = meta;
    this.azar = new Azar(semilla);
    this.sustituto = sustituto; // (etapa, modelo, t) => {nombre: Arr} para módulos no portados
    this.observador = observador; // (clave, sim) => void tras cada init/actualización
    this.time_index = 0;
    this.terminada = false;
    this.salidas = new Map(); // nombre -> array de Arr por paso
    this.guardarSalidas = guardarSalidas; // false: no guarda la historia (pasadas largas en el navegador)
    this.registrarEventos = registrarEventos; // los modelos apuntan sus sucesos (mundo vivo)
  }

  inicializar() {
    const core = this.config.core;
    this.grid = new Rejilla(core.grid);
    this.grid.populateDistances();
    this.core_constants = core.constants;
    this.layer_structure = new LayerStructure(core.layers, this.grid.n_cells, core.constants.microbial_simulation_depth);
    this.model_timing = new ModelTiming(core.timing);
    this.data = new Datos(this.grid, this.meta.variables);
    for (const [nombre, v] of Object.entries(this.escenario.inputs)) {
      const datos = Float64Array.from(v.data, decodificar);
      this.data.set(nombre, new Arr(v.dims, v.shape, datos, v.coords));
    }
    this.nombresModelos = Object.keys(this.config).filter((k) => k !== 'core' && k !== 'disturbance');
    this.rv = setupVariables(this.nombresModelos, this.meta.modelos, Object.keys(this.escenario.inputs));
    const cfgSalida = core.data_output_options.variables_to_save;
    const aGuardar = cfgSalida && cfgSalida.length ? cfgSalida : [...this.rv.keys()];
    this.varsSalida = aGuardar.filter((k) => this.rv.get(k).vars_updated.length);
    this.varsInputs = aGuardar.filter((k) => {
      const p = this.rv.get(k).vars_populated_by_init;
      return p.length === 1 && p[0] === 'data';
    });
    this.varsInit = aGuardar.filter((k) => {
      const p = this.rv.get(k).vars_populated_by_init;
      return p.length && !(p.length === 1 && p[0] === 'data');
    });
    this.ordenInit = getModelOrder('init', this.rv);
    this.ordenUpdate = getModelOrder('update', this.rv);
    this.modelos = {};
    for (const nombre of this.ordenInit) {
      const Clase = MODELOS[nombre];
      if (Clase) this.modelos[nombre] = Clase.fromConfig(this);
      else this._sustituir('init', nombre, null);
      if (this.observador) this.observador(`init/${nombre}`, this);
    }
    // main.py guarda los grupos inputs e init después de inicializar todos los módulos
    this.entradas = new Map(this.varsInputs.map((k) => [k, this.data.serie(k).copy()]));
    this.estadoInicial = new Map(this.varsInit.map((k) => [k, this.data.serie(k).copy()]));
  }

  _sustituir(etapa, nombre, t) {
    if (!this.sustituto) throw new Error(`El módulo ${nombre} no está portado y no hay sustituto`);
    const { vars, azar } = this.sustituto(etapa, nombre, t);
    for (const [k, v] of Object.entries(vars)) this.data.set(k, v);
    if (azar) this.azar.restaurar(azar);
    if (nombre === 'plants') {
      // efecto lateral de plants sobre la estructura de capas: set_filled_canopy
      const ls = this.layer_structure, n = this.grid.n_cells;
      const h = this.data.get('layer_heights').data.slice(n, (ls.n_canopy_layers + 1) * n);
      ls.setFilledCanopy(h);
    }
  }

  paso() {
    if (this.terminada) return;
    const t = this.time_index;
    this.data.time_index = t;
    for (const nombre of this.ordenUpdate) {
      const m = this.modelos[nombre];
      if (m) m.update(t);
      else this._sustituir('update', nombre, t);
      if (this.observador) this.observador(`upd/${t}/${nombre}`, this);
    }
    if (this.guardarSalidas) for (const k of this.varsSalida) {
      if (!this.salidas.has(k)) this.salidas.set(k, []);
      this.salidas.get(k).push(this.data.serie(k).copy());
    }
    const trunc = this.config.core.debug.truncate_run_at_update;
    this.time_index += 1;
    if ((trunc >= 0 && trunc === t) || this.time_index >= this.model_timing.n_updates) this.terminada = true;
  }

  // CSV que escriben los exportadores del original (nombre -> líneas)
  csv() {
    const out = {};
    for (const m of Object.values(this.modelos)) {
      if (m.exportador) for (const [k, l] of Object.entries(m.exportador.lineas)) if (l.length) out[`${k}.csv`] = l;
    }
    return out;
  }

  correr(alPaso) {
    while (!this.terminada) { this.paso(); if (alPaso) alPaso(this); }
  }
}
