// BaseModel (core/base_model.py): lo común a todos los módulos.
export class ModeloBase {
  constructor(sim, nombre, estatico = false) {
    this.sim = sim;
    this.model_name = nombre;
    this.data = sim.data;
    this.grid = sim.grid;
    this.layer_structure = sim.layer_structure;
    this.model_timing = sim.model_timing;
    this.core_constants = sim.core_constants;
    this.azar = sim.azar;
    this._static = estatico;
    this._run_initial_static_update = estatico;
  }

  update(t) {
    if (this._static) {
      if (!this._run_initial_static_update) return;
      this._run_initial_static_update = false;
    }
    this._update(t);
  }
}
