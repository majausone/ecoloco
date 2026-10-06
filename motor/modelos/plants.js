// Modelo de plantas (models/plants): biomasses.py, canopy.py, communities.py, fruit.py,
// subcanopy.py y plants_model.py, con la parte de pyrealm en ../pyrealm.js.

import { Arr } from '../core/arr.js?v=202610060036';
import { ModeloBase } from './base.js?v=202610060036';
import { exp, pow } from '../num/ucrt.js?v=202610060036';
import { sumaPares, nansumaEje } from '../num/np.js?v=202610060036';
import { sumaNp } from '../num/py.js?v=202610060036';
import { npClip, npMin, npMax } from './comun.js?v=202610060036';
import {
  pmodel, molesAMm, crearFlora, crearCohortes, concatCohortes, nCohortes, alometria, asignacion, incrementos,
  dosel, pyrealmConst,
} from '../pyrealm.js?v=202610060036';
import { ExportadorPlantas } from './plants_export.js?v=202610060036';
import { diasAFecha } from '../core/componentes.js?v=202610060036';
import { f64 } from '../num/f64.js?v=202610060036';

const ELEM = ['C', 'N', 'P'];
const suma = (a) => 0.0 + sumaPares(a, 0, a.length, 1);

// ------------------------------------------------------------------ biomasas por tejido
const TEJIDOS = [
  { nombre: 'foliage', masa: 'foliage_mass', turn: 'foliage_turnover', crec: 'delta_foliage_mass', ideal: 'foliage_c_ELEM_ratio', turnRatio: 'foliage_turnover_c_ELEM_ratio' },
  { nombre: 'stem', masa: 'stem_mass', turn: 'branch_turnover', crec: 'delta_stem_mass', ideal: 'stem_c_ELEM_ratio', turnRatio: 'stem_c_ELEM_ratio' },
  { nombre: 'root', masa: 'fine_root_mass', turn: 'fine_root_turnover', crec: 'delta_fine_root_mass', ideal: 'root_c_ELEM_ratio', turnRatio: 'root_c_ELEM_ratio' },
  { nombre: 'fruit', masa: 'fruit_mass', turn: 'fruit_turnover', crec: 'delta_fruit_mass', ideal: 'fruit_seed_c_ELEM_ratio', turnRatio: 'fruit_seed_c_ELEM_ratio' },
  { nombre: 'seed', masa: 'seed_mass', turn: 'seed_turnover', crec: 'delta_seed_mass', ideal: 'fruit_seed_c_ELEM_ratio', turnRatio: 'fruit_seed_c_ELEM_ratio' },
];

function ratios(coh, patron) {
  const k = nCohortes(coh);
  const r = new Float64Array(k * 3);
  const cn = coh[patron.replace('ELEM', 'n')], cp = coh[patron.replace('ELEM', 'p')];
  for (let i = 0; i < k; i++) { r[i * 3] = 1; r[i * 3 + 1] = cn[i]; r[i * 3 + 2] = cp[i]; }
  return r;
}

class Tejido {
  constructor(def, coh, A) {
    this.def = def;
    this.nombre = def.nombre;
    this.ideal = ratios(coh, def.ideal);
    this.turnRatios = ratios(coh, def.turnRatio);
    const c = A[def.masa];
    this.masas = f64(this.ideal, (r, j) => c[Math.floor(j / 3)] / r);
  }

  get deficits() { return f64(this.masas, (m, j) => this.masas[j - (j % 3)] / this.ideal[j] - m); }

  sumar(m) {
    const u = f64(this.masas, (v, j) => v + m[j]);
    this.masas = u.map((v) => (v !== v ? v : (v < 0.0 ? 0.0 : v)));
  }

  anexar(otro) {
    const cat = (a, b) => { const o = new Float64Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    this.masas = cat(this.masas, otro.masas);
    this.ideal = cat(this.ideal, otro.ideal);
    this.turnRatios = cat(this.turnRatios, otro.turnRatios);
  }

  recambio(S) {
    const c = S[this.def.turn];
    return f64(this.turnRatios, (r, j) => c[Math.floor(j / 3)] / r);
  }

  crecer(G) {
    const c = G[this.def.crec];
    const inc = f64(this.ideal, (r, j) => c[Math.floor(j / 3)] / r);
    this.sumar(inc);
    return inc;
  }

  relativaPorPft(coh) {
    const k = nCohortes(coh);
    const c = f64({ length: k }, (_, i) => this.masas[i * 3]);
    const tot = new Float64Array(k);
    for (const p of new Set(coh.pft_name)) {
      const idx = [];
      coh.pft_name.forEach((q, i) => { if (q === p) idx.push(i); });
      const s = suma(f64(idx, (i) => c[i]));
      for (const i of idx) tot[i] = s;
    }
    return c.map((v, i) => v / tot[i]);
  }
}

class Biomasas {
  constructor(coh, A) {
    this.cohort_id = coh.cohort_id.slice();
    this.tejidos = TEJIDOS.map((d) => new Tejido(d, coh, A));
    this.excedentes = new Float64Array(nCohortes(coh) * 3);
  }

  tejido(n) { return this.tejidos.find((t) => t.nombre === n); }

  ajustar(m, aumentar = true) {
    for (let j = 0; j < m.length; j++) this.excedentes[j] = aumentar ? this.excedentes[j] + m[j] : this.excedentes[j] - m[j];
  }

  aplicarCrecimiento(G) {
    for (const t of this.tejidos) {
      const nec = t.crecer(G);
      for (let j = 0; j < nec.length; j += 3) nec[j] = 0;
      this.ajustar(nec, false);
    }
  }

  aplicarRecambio(S) {
    const porTejido = {};
    for (const t of this.tejidos) porTejido[t.nombre] = t.recambio(S);
    const n = this.excedentes.length;
    const total = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let s = 0;
      this.tejidos.forEach((t, q) => { s = q === 0 ? 0 + porTejido[t.nombre][j] : s + porTejido[t.nombre][j]; });
      total[j] = s;
    }
    for (let j = 0; j < n; j += 3) total[j] = 0;
    this.ajustar(total, false);
    return porTejido;
  }

  equilibrar() {
    const nt = this.tejidos.length, n = this.excedentes.length;
    const masas = this.tejidos.map((t) => t.masas), defs = this.tejidos.map((t) => t.deficits);
    const totM = new Float64Array(n), totD = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let a = 0, b = 0;
      for (let q = 0; q < nt; q++) { a += masas[q][j]; b += defs[q][j]; }
      totM[j] = a; totD[j] = b;
    }
    const aTejido = [];
    for (let q = 0; q < nt; q++) {
      const o = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        const ex = this.excedentes[j];
        let pd = ex * (totM[j] > 0 ? masas[q][j] / totM[j] : 0);
        const rel = totD[j] !== 0 ? defs[q][j] / totD[j] : 0;
        let ps = ex * rel;
        ps = npMin(defs[q][j], ps);
        pd = npMax(-masas[q][j], pd);
        o[j] = ex < 0 ? pd : ps;
      }
      aTejido.push(o);
    }
    this.tejidos.forEach((t, q) => t.sumar(aTejido[q]));
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let q = 0; q < nt; q++) s += aTejido[q][j];
      this.excedentes[j] -= s;
    }
  }

  anexar(otro) {
    this.cohort_id = this.cohort_id.concat(otro.cohort_id);
    for (const t of this.tejidos) t.anexar(otro.tejido(t.nombre));
    const e = new Float64Array(this.excedentes.length + otro.excedentes.length);
    e.set(this.excedentes); e.set(otro.excedentes, this.excedentes.length);
    this.excedentes = e;
  }
}

// ------------------------------------------------------------------ sotobosque
class BiomasaSotobosque {
  constructor(masas, ideal) {
    const n = masas.length / 3;
    for (let i = 0; i < n; i++) if (masas[i * 3] !== masas[i * 3]) throw new Error('NaN values in carbon masses in subcanopy tissue.');
    let todosNan = true, algunNan = false;
    for (let i = 0; i < n; i++) {
      for (let e = 1; e < 3; e++) { if (masas[i * 3 + e] === masas[i * 3 + e]) todosNan = false; else algunNan = true; }
    }
    if (algunNan && !todosNan) throw new Error('Incomplete elemental nutrient masses');
    this.masas = todosNan && n > 0 ? f64(masas, (v, j) => masas[j - (j % 3)] / ideal[j % 3]) : f64(masas);
    this.ideal = ideal;
  }

  quitarFraccion(f) {
    const perdida = f64(this.masas, (v, j) => v * (typeof f === 'number' ? f : f[Math.floor(j / 3)]));
    this.masas = this.masas.map((v, j) => v - perdida[j]);
    return new BiomasaSotobosque(perdida, this.ideal);
  }

  sumarMasa(o) { this.masas = this.masas.map((v, j) => v + o.masas[j]); }

  exceso() {
    const ex = f64(this.masas, (v, j) => {
      const r = v - this.masas[j - (j % 3)] / this.ideal[j % 3];
      return r !== r ? r : (r < 0 ? 0 : r);
    });
    this.masas = this.masas.map((v, j) => v - ex[j]);
    return new BiomasaSotobosque(ex, this.ideal);
  }
}

// ------------------------------------------------------------------ modelo
export class PlantsModel extends ModeloBase {
  static fromConfig(sim) { return new PlantsModel(sim, sim.config.plants); }

  constructor(sim, cfg) {
    super(sim, 'plants', cfg.static);
    const t = sim.escenario.tablas;
    this.model_constants = cfg.constants;
    // restar_sotobosque: lo que comen los animales del sotobosque se resta de su biomasa (el
    // original lo apunta en *_consumed pero no lo resta nunca). Apagado por defecto.
    this.corr = { restar_sotobosque: false, hojas_comidas_por_tallo: false, agua_sin_negativos: false, reclutas_juntos: false, ...(cfg.correcciones || {}) };
    this.hydro = sim.config.hydrology ? sim.config.hydrology.constants : { soil_moisture_residual: 0.175 };
    let nId = 0;
    this.siguienteId = () => `C_${String(nId++).padStart(6, '0')}`;
    const upy = this.model_timing.updates_per_year;
    this.flora = crearFlora(t.pft, sim.meta.pft);
    for (const r of ['resp_f', 'resp_r', 'resp_s', 'resp_rt']) this.flora[r] = this.flora[r].map((v) => v / upy);
    for (const r of ['tau_f', 'tau_r', 'tau_rt', 'tau_f_base', 'tau_b']) this.flora[r] = this.flora[r].map((v) => v * upy);
    this.exportador = new ExportadorPlantas(cfg.community_data_export);
    this._setup(t.cohortes_plantas);
  }

  _setup(tablaCoh) {
    const d = this.data, ls = this.layer_structure, n = this.grid.n_cells, c = this.model_constants;
    const datos = tablaCoh.datos;
    this.comunidades = new Map();
    for (const cell of this.grid.cell_id) {
      const filas = [];
      datos.plant_cohorts_cell_id.forEach((v, i) => { if (v === cell) filas.push(i); });
      const coh = crearCohortes(this.flora, this.siguienteId, filas.map((i) => datos.plant_cohorts_pft[i]),
        filas.map((i) => datos.plant_cohorts_dbh[i]), filas.map((i) => datos.plant_cohorts_n[i]));
      this.comunidades.set(cell, { cohortes: coh, alometria: alometria(coh) });
    }
    for (const com of this.comunidades.values()) {
      const coh = com.cohortes, A = com.alometria;
      const masa = A.foliage_mass.map((v, i) => v * coh.fruit_seed_foliage_mass_fraction[i]);
      A.fruit_mass = masa.map((v, i) => v * coh.fruit_flesh_fraction[i]);
      A.seed_mass = masa.map((v, i) => v - A.fruit_mass[i]);
    }
    this.biomasas = new Map([...this.comunidades].map(([cell, com]) => [cell, new Biomasas(com.cohortes, com.alometria)]));
    const prop = d.get('plant_pft_propagules');
    if (!prop.coords.pft) throw new Error("The plant_pft_propagules data is missing 'pft' coordinates.");
    this.pfts = this.flora.pft_name.slice();
    const np = this.pfts.length;
    const celdas = Array.from({ length: n }, (_, i) => i);
    this.plantillas = {
      cnp_pft: () => new Arr(['cell_id', 'pft', 'element'], [n, np, 3], null, { cell_id: celdas, pft: this.pfts.slice(), element: ELEM.slice() }),
      cnp: () => new Arr(['cell_id', 'element'], [n, 3], null, { cell_id: celdas, element: ELEM.slice() }),
      cell: () => new Arr(['cell_id'], [n], null, { cell_id: celdas }),
    };
    for (const v of ['canopy_foliage_cnp', 'canopy_seed_cnp', 'canopy_fruit_cnp', 'fallen_fruit_cnp', 'fallen_seeds_cnp',
      'foliage_turnover_cnp', 'seed_turnover_cnp', 'fruit_turnover_cnp', 'root_turnover_cnp', 'stem_turnover_cnp',
      'canopy_foliage_cnp_consumed', 'canopy_seed_cnp_consumed', 'canopy_fruit_cnp_consumed', 'fallen_seeds_cnp_consumed',
      'fallen_fruit_cnp_consumed']) d.set(v, this.plantillas.cnp_pft());
    for (const v of ['subcanopy_vegetation_cnp_consumed', 'subcanopy_seedbank_cnp_consumed']) d.set(v, this.plantillas.cnp());
    // initialise_canopy_layers
    for (const v of ['layer_heights', 'leaf_area_index', 'layer_fapar', 'shortwave_absorption']) {
      if (d.has(v)) throw new Error(`Cannot initialise canopy layers, already present: ${v}`);
      d.set(v, ls.fromTemplate());
    }
    const lh = d.get('layer_heights');
    ls.int.all_soil.forEach((l, k) => lh.data.fill(ls.soil_layer_depths[k], l * n, (l + 1) * n));
    lh.data.fill(ls.surface_layer_height, ls.index_surface_scalar * n, (ls.index_surface_scalar + 1) * n);
    this.calcularDoseles();
    this.actualizarCapasDosel();
    // Subcanopy
    const veg = d.get('subcanopy_vegetation_cnp').data, sb = d.get('subcanopy_seedbank_cnp').data;
    this.sub = {
      veg: new BiomasaSotobosque(veg, [1, c.subcanopy_vegetation_c_n_ratio, c.subcanopy_vegetation_c_p_ratio]),
      seed: new BiomasaSotobosque(sb, [1, c.subcanopy_seedbank_c_n_ratio, c.subcanopy_seedbank_c_p_ratio]),
      seedLit: new BiomasaSotobosque(new Float64Array(n * 3), [1, 1, 1]),
      vegLit: new BiomasaSotobosque(new Float64Array(n * 3), [1, 1, 1]),
    };
    this.escribirSotobosque();
    for (const [v, k] of [['stem_lignin', 'stem_lignin'], ['senesced_leaf_lignin', 'senesced_leaf_lignin'], ['root_lignin', 'root_lignin'],
      ['subcanopy_vegetation_litter_lignin', 'subcanopy_vegetation_lignin'], ['subcanopy_seedbank_litter_lignin', 'subcanopy_seedbank_lignin']]) {
      d.set(v, new Arr(['cell_id'], [n], new Float64Array(n).fill(c[k]), { cell_id: celdas }));
    }
    this.radiacion = d.corte('downward_shortwave_radiation', 0).data;
    this.capturaLuzSotobosque();
    this.absorcionOndaCorta();
    const upy = this.model_timing.updates_per_year;
    this.probMortalidad = 1 - pow(1 - c.per_stem_annual_mortality_probability, 1 / upy);
    this.probReclutamiento = 1 - pow(1 - c.per_propagule_annual_recruitment_probability, 1 / upy);
    this.residuoAgua = ls.soil_layer_thickness[1] * 1000 * this.hydro.soil_moisture_residual;
    this.asignaciones = new Map(); // stem_allocations
    this.incrementosG = new Map(); // growth_increments
    this.exportador.volcar(this, diasAFecha(this.model_timing.start_day), 0);
  }

  calcularDoseles() {
    this.doseles = new Map();
    for (const [cell, com] of this.comunidades) {
      if (nCohortes(com.cohortes) === 0) { this.doseles.set(cell, null); continue; }
      const cn = dosel(com.cohortes, com.alometria, this.grid.cell_area);
      if (this.layer_structure.n_canopy_layers < cn.heights.length) {
        throw new Error(`Canopy representation for the plant community in cell ${cell} has ${cn.heights.length} layers, configured maximum is ${this.layer_structure.n_canopy_layers}`);
      }
      this.doseles.set(cell, cn);
    }
  }

  actualizarCapasDosel() {
    const d = this.data, ls = this.layer_structure, n = this.grid.n_cells, nc = ls.n_canopy_layers;
    const h = new Float64Array(nc * n).fill(NaN), fa = new Float64Array(nc * n).fill(NaN), lai = new Float64Array(nc * n).fill(NaN);
    for (const [cell, cn] of this.doseles) {
      if (!cn || cn.heights.length === 0) continue;
      const L = cn.heights.length;
      for (let l = 0; l < L; l++) {
        h[l * n + cell] = l === 0 ? cn.max_stem_height : cn.heights[l - 1];
        fa[l * n + cell] = cn.community_data.average_layer_fapar[l];
        lai[l * n + cell] = cn.community_data.average_layer_lai[l];
      }
    }
    const LH = d.get('layer_heights').data, LAI = d.get('leaf_area_index').data, FA = d.get('layer_fapar').data;
    ls.int.canopy.forEach((l, k) => {
      LH.set(h.subarray(k * n, (k + 1) * n), l * n);
      LAI.set(lai.subarray(k * n, (k + 1) * n), l * n);
      FA.set(fa.subarray(k * n, (k + 1) * n), l * n);
    });
    const a = ls.int.above[0], off = ls.above_canopy_height_offset;
    for (let i = 0; i < n; i++) LH[a * n + i] = h[i] !== h[i] ? off : h[i] + off;
    ls.setFilledCanopy(h);
    this.luzBajoDosel = f64([...this.doseles.values()], (cn) => (cn === null ? 1 : cn.community_data.transmission_to_ground));
    this.mascaraDosel = Uint8Array.from(LAI, (v) => (v === v ? 1 : 0));
  }

  capturaLuzSotobosque() {
    const c = this.model_constants, n = this.grid.n_cells, s = this.layer_structure.index_surface_scalar;
    this.subLai = f64({ length: n }, (_, i) => npClip(this.sub.veg.masas[i * 3] * c.subcanopy_specific_leaf_area * c.subcanopy_leaf_fraction, 0, c.subcanopy_maximum_leaf_area_index));
    this.subTrans = this.subLai.map((l) => exp(-c.subcanopy_extinction_coef * l));
    this.subFapar = this.subTrans.map((t, i) => this.luzBajoDosel[i] * (1 - t));
    this.data.get('leaf_area_index').data.set(this.subLai, s * n);
    this.data.get('layer_fapar').data.set(this.subFapar, s * n);
  }

  absorcionOndaCorta() {
    const d = this.data, ls = this.layer_structure, n = this.grid.n_cells;
    const suelo = this.luzBajoDosel.map((v, i) => v * this.subTrans[i]);
    const fa = d.get('layer_fapar');
    const abs = fa.conDatos(f64(fa.data, (v, j) => v * this.radiacion[j % n]));
    const top = ls.index_topsoil_scalar;
    for (let i = 0; i < n; i++) abs.data[top * n + i] = this.radiacion[i] * suelo[i];
    d.set('shortwave_absorption', abs);
  }

  escribirSotobosque() {
    for (const [v, b] of [['subcanopy_vegetation_cnp', this.sub.veg], ['subcanopy_seedbank_cnp', this.sub.seed],
      ['subcanopy_seedbank_litter_cnp', this.sub.seedLit], ['subcanopy_vegetation_litter_cnp', this.sub.vegLit]]) {
      const a = this.plantillas.cnp();
      a.data.set(b.masas);
      this.data.set(v, a);
    }
  }

  // ---------------------------------------------------------------- actualización
  _update(t) {
    this.reiniciarVariables();
    this.mortalidad();
    this.reclutamiento();
    for (const com of this.comunidades.values()) {
      com.cohortes.lai = f64(com.cohortes.lai_base);
      com.cohortes.tau_f = f64(com.cohortes.tau_f_base);
      com.alometria = alometria(com.cohortes);
    }
    this.radiacion = this.data.corte('downward_shortwave_radiation', t).data;
    this.herbivoria();
    if (this.corr.restar_sotobosque) this.herbivoriaSotobosque();
    this.calcularDoseles();
    this.actualizarCapasDosel();
    this.capturaLuzSotobosque();
    this.absorcionOndaCorta();
    this.eficienciaLuz();
    this.estimarGpp();
    this.gppSotobosque();
    this.demandaAgua();
    this.limitacionAgua();
    this.nutrientes();
    this.asignarGpp();
    this.caidos();
    this.dinamicaSotobosque();
    this.exportador.volcar(this, diasAFecha(this.model_timing.update_datestamps[t]), t);
  }

  reiniciarVariables() {
    const d = this.data;
    for (const v of ['root_carbohydrate_exudation', 'plant_symbiote_carbon_supply']) d.set(v, this.plantillas.cell());
    for (const v of ['stem_turnover_cnp', 'root_turnover_cnp', 'subcanopy_vegetation_litter_cnp', 'subcanopy_vegetation_cnp',
      'subcanopy_seedbank_litter_cnp', 'subcanopy_seedbank_cnp']) d.set(v, this.plantillas.cnp());
    for (const v of ['canopy_foliage_cnp', 'canopy_seed_cnp', 'canopy_fruit_cnp', 'foliage_turnover_cnp', 'seed_turnover_cnp',
      'fruit_turnover_cnp']) d.set(v, this.plantillas.cnp_pft());
    d.set('transpiration', this.layer_structure.fromTemplate());
  }

  // escritura en filas de las variables (cell_id, element) y (cell_id, pft, element)
  _sumarFila(v, cell, vec) { const a = this.data.get(v).data; for (let e = 0; e < 3; e++) a[cell * 3 + e] += vec[e]; }
  _sumarFilaPft(v, cell, vec) {
    const a = this.data.get(v).data, np = this.pfts.length;
    for (let p = 0; p < np; p++) for (let e = 0; e < 3; e++) a[(cell * np + p) * 3 + e] += vec[e];
  }
  _ponerPft(v, cell, p, vec) { const a = this.data.get(v).data, np = this.pfts.length; for (let e = 0; e < 3; e++) a[(cell * np + p) * 3 + e] = vec[e]; }

  // (k, 3) * pesos[:, None] y .sum(axis=0) (secuencial sobre cohortes)
  _sumaPonderada(m, w, filas = null) {
    const out = [0, 0, 0];
    const idx = filas || Array.from({ length: w.length }, (_, i) => i);
    for (let e = 0; e < 3; e++) {
      let s = 0;
      idx.forEach((i, q) => { const v = m[i * 3 + e] * w[i]; s = q === 0 ? 0 + v : s + v; });
      out[e] = s;
    }
    return out;
  }

  mortalidad() {
    for (const [cell, com] of this.comunidades) {
      const coh = com.cohortes;
      const mort = this.azar.np.binomial(coh.n_individuals.slice(), this.probMortalidad);
      if (!Array.isArray(mort)) throw new Error('binomial');
      if (mort.reduce((a, b) => a + b, 0) > 0) {
        coh.n_individuals = coh.n_individuals.map((v, i) => v - mort[i]);
        const bio = this.biomasas.get(cell);
        for (const t of ['stem', 'root']) this._sumarFila(`${t}_turnover_cnp`, cell, this._sumaPonderada(bio.tejido(t).masas, mort));
        const grupos = this.pfts.map((p) => coh.pft_name.flatMap((q, i) => (q === p ? [i] : [])));
        for (const t of ['fruit', 'foliage', 'seed']) {
          grupos.forEach((filas, p) => this._ponerPft(`${t}_turnover_cnp`, cell, p, this._sumaPonderada(bio.tejido(t).masas, mort, filas)));
        }
      }
    }
  }

  reclutamiento() {
    const d = this.data;
    const prop = d.get('plant_pft_propagules');
    const np = prop.shape[1];
    const rec = this.azar.np.binomial(Array.from(prop.data), this.probReclutamiento);
    prop.data.set(prop.data.map((v, j) => v - rec[j]));
    const pfts = prop.coords.pft;
    for (const [cell, com] of this.comunidades) {
      let rs = [];
      for (let p = 0; p < np; p++) if (rec[cell * np + p] > 0) rs.push(p);
      // reclutas_juntos: en el original cada reclutamiento es una cohorte nueva y nunca se juntan;
      // con cuadros grandes entra alguna cada día y el número de cohortes (y el tiempo) crece sin
      // parar. Con la corrección, las plántulas se suman a la cohorte de plántulas de su tipo que
      // ya haya en el cuadro (diámetro < 4 mm), promediando por individuo diámetro y masas
      if (this.corr.reclutas_juntos) rs = rs.filter((p) => !this.sumarReclutas(cell, com, pfts[p], rec[cell * np + p]));
      if (!rs.length) continue;
      const nuevas = crearCohortes(this.flora, this.siguienteId, rs.map((p) => pfts[p]), rs.map(() => 0.002), rs.map((p) => rec[cell * np + p]));
      com.cohortes = concatCohortes(com.cohortes, nuevas);
      const A = alometria(nuevas);
      A.fruit_mass = new Float64Array(rs.length);
      A.seed_mass = new Float64Array(rs.length);
      this.biomasas.get(cell).anexar(new Biomasas(nuevas, A));
    }
  }

  sumarReclutas(cell, com, pft, n) {
    const coh = com.cohortes, k = nCohortes(coh);
    let i = -1;
    for (let j = 0; j < k; j++) if (coh.pft_name[j] === pft && coh.dbh_value[j] < 0.004) { i = j; break; }
    if (i < 0) return false;
    const nuevas = crearCohortes(this.flora, () => -1, [pft], [0.002], [n]);
    const A = alometria(nuevas);
    A.fruit_mass = new Float64Array(1); A.seed_mass = new Float64Array(1);
    const b = new Biomasas(nuevas, A), bio = this.biomasas.get(cell);
    const n0 = coh.n_individuals[i], tot = n0 + n, f0 = n0 / tot, f1 = n / tot;
    coh.dbh_value[i] = coh.dbh_value[i] * f0 + 0.002 * f1;
    coh.n_individuals[i] = tot;
    for (const t of bio.tejidos) { const o = b.tejido(t.nombre); for (let e = 0; e < 3; e++) t.masas[i * 3 + e] = t.masas[i * 3 + e] * f0 + o.masas[e] * f1; }
    for (let e = 0; e < 3; e++) bio.excedentes[i * 3 + e] = bio.excedentes[i * 3 + e] * f0 + b.excedentes[e] * f1;
    return true;
  }

  herbivoriaSotobosque() {
    for (const [b, v] of [[this.sub.veg, 'subcanopy_vegetation_cnp_consumed'], [this.sub.seed, 'subcanopy_seedbank_cnp_consumed']]) {
      if (!this.data.has(v)) continue;
      const c = this.data.get(v).data;
      b.masas = b.masas.map((m, j) => (c[j] === c[j] ? Math.max(0, m - c[j]) : m));
    }
  }

  herbivoria() {
    const np = this.pfts.length;
    for (const cell of this.grid.cell_id) {
      const com = this.comunidades.get(cell), coh = com.cohortes, bio = this.biomasas.get(cell);
      const k = nCohortes(coh);
      let ultima = null;
      for (const t of ['fruit', 'seed', 'foliage']) {
        const tej = bio.tejido(t);
        const rel = tej.relativaPorPft(coh);
        const cons = this.data.get(`canopy_${t}_cnp_consumed`).data;
        const h = new Float64Array(k * 3);
        // hojas_comidas_por_tallo: las masas de tejido van por tallo y lo comido es de toda la
        // cohorte: se reparte entre sus tallos (el original resta lo de toda la cohorte de cada
        // tallo y, con muchos herbívoros, deja las hojas a cero y luego reparte 0/0)
        const porTallo = this.corr.hojas_comidas_por_tallo;
        for (let i = 0; i < k; i++) {
          const p = this.pfts.indexOf(coh.pft_name[i]);
          const r = porTallo && rel[i] !== rel[i] ? 0 : rel[i];
          for (let e = 0; e < 3; e++) h[i * 3 + e] = cons[(cell * np + p) * 3 + e] * r / (porTallo ? Math.max(1, coh.n_individuals[i]) : 1);
        }
        tej.masas = tej.masas.map((v, j) => v - h[j]);
        ultima = h;
      }
      const A = com.alometria;
      // hojas_comidas_por_tallo: lo comido es de toda la cohorte y el follaje de la alometría es
      // por tallo; el original resta lo de toda la cohorte de un solo tallo (con muchos
      // herbívoros o cuadros grandes el índice de hoja sale negativo)
      const perd = f64({ length: k }, (_, i) => ultima[i * 3]);
      const media = A.foliage_mass.map((m, i) => m - perd[i] / 2);
      coh.lai = f64({ length: k }, (_, i) => media[i] * coh.sla[i] / A.crown_area[i]);
      coh.tau_f = f64({ length: k }, (_, i) => A.foliage_mass[i] * coh.tau_f[i] / (perd[i] * coh.tau_f[i] + A.foliage_mass[i]));
    }
  }

  eficienciaLuz() {
    const d = this.data;
    const T = d.get('air_temperature').data, vpd = d.get('vapour_pressure_deficit').data;
    const P = d.get('atmospheric_pressure').data, co2 = d.get('atmospheric_co2').data;
    this.pm = pmodel(T, vpd.map((v) => v * 1000), co2, P.map((v) => v * 1000));
    const lue = this.layer_structure.fromTemplate();
    lue.data.set(this.pm.lue);
    d.set('light_use_efficiency', lue);
  }

  estimarGpp() {
    const ls = this.layer_structure, nl = ls.n_layers, n = this.grid.n_cells;
    const ppfd = this.radiacion.map((v) => v * this.model_constants.dsr_to_ppfd);
    const tr = this.data.get('transpiration').data;
    tr.fill(NaN);
    this.gppTallo = new Map();
    this.transTallo = new Map();
    const secs = this.model_timing.update_interval_seconds;
    for (const [cell, cn] of this.doseles) {
      const com = this.comunidades.get(cell), coh = com.cohortes;
      if (!cn) { this.gppTallo.set(cell, new Float64Array(0)); this.transTallo.set(cell, new Float64Array(0)); continue; }
      const L = cn.heights.length, k = cn.n_cohorts;
      const pg = new Float64Array(nl * k), mm = new Float64Array(nl * k);
      for (let l = 0; l < nl; l++) {
        const lc = l - 1;
        for (let i = 0; i < k; i++) {
          const fap = lc >= 0 && lc < L ? cn.cohort_data.fapar[lc * k + i] : 0;
          const sla = lc >= 0 && lc < L ? cn.cohort_data.stem_leaf_area[lc * k + i] : 0;
          let g = this.pm.lue[l * n + cell] * fap * ppfd[cell] * sla * secs;
          g = g !== g ? 0 : (g === Infinity ? Number.MAX_VALUE : (g === -Infinity ? -Number.MAX_VALUE : g));
          pg[l * k + i] = g;
          const micro = g / (pyrealmConst.k_c_molmass * 1000000.0) * this.pm.iwue[l * n + cell];
          mm[l * k + i] = molesAMm(micro * 1e-06, this.pm.tc[l * n + cell]);
        }
      }
      const gs = new Float64Array(k), ts = new Float64Array(k);
      for (let i = 0; i < k; i++) {
        let s = 0, s2 = 0;
        for (let l = 0; l < nl; l++) { s = l === 0 ? 0 + pg[i] : s + pg[l * k + i]; const v = mm[l * k + i]; s2 = (l === 0 ? 0 : s2) + (v !== v ? 0 : v); }
        gs[i] = s * 1e-09;
        ts[i] = s2;
      }
      this.gppTallo.set(cell, gs);
      this.transTallo.set(cell, ts);
      for (let l = 0; l < nl; l++) {
        const fila = f64({ length: k }, (_, i) => coh.n_individuals[i] * mm[l * k + i]);
        tr[l * n + cell] = this.mascaraDosel[l * n + cell] ? 0.0 + sumaPares(fila, 0, k, 1) : NaN;
      }
    }
  }

  gppSotobosque() {
    const c = this.model_constants, s = this.layer_structure.index_surface_scalar, n = this.grid.n_cells;
    const secs = this.model_timing.update_interval_seconds;
    this.subGpp = f64({ length: n }, (_, i) => {
      const l = this.pm.lue[s * n + i];
      return (l !== l ? 0 : l) * this.radiacion[i] * this.subFapar[i] * c.dsr_to_ppfd * secs;
    });
    this.subTransp = f64({ length: n }, (_, i) => {
      const micro = this.subGpp[i] / (pyrealmConst.k_c_molmass * 1000000.0) * this.pm.iwue[s * n + i];
      return molesAMm(micro * 1e-06, this.pm.tc[s * n + i]);
    });
    this.data.get('transpiration').data.set(this.subTransp, s * n);
  }

  demandaAgua() {
    const n = this.grid.n_cells;
    const tot = new Float64Array(n);
    for (const [cell, com] of this.comunidades) {
      const ts = this.transTallo.get(cell);
      tot[cell] = suma(f64(ts, (v, i) => v * com.cohortes.n_individuals[i]));
    }
    const div = Math.floor(this.model_timing.update_interval_seconds / this.core_constants.seconds_to_day);
    this.demanda = tot.map((v, i) => (v + this.subTransp[i]) / div);
  }

  limitacionAgua() {
    const ls = this.layer_structure, n = this.grid.n_cells;
    const capa = ls.bool.subsoil.indexOf(true);
    const sm = this.data.get('soil_moisture').data;
    // agua_sin_negativos: si el suelo baja del agua residual, el original da un factor negativo
    // (y producción negativa); con la corrección se queda en 0
    const f = f64({ length: n }, (_, i) => {
      const v = npMin(1, (sm[capa * n + i] - this.residuoAgua) / this.demanda[i]);
      return this.corr.agua_sin_negativos ? Math.max(0, v) : v;
    });
    this.subTransp = this.subTransp.map((v, i) => v * f[i]);
    this.subGpp = this.subGpp.map((v, i) => v * f[i]);
    for (const cell of this.comunidades.keys()) {
      this.transTallo.set(cell, this.transTallo.get(cell).map((v) => v * f[cell]));
      this.gppTallo.set(cell, this.gppTallo.get(cell).map((v) => v * f[cell]));
    }
    const tr = this.data.get('transpiration').data;
    for (let j = 0; j < tr.length; j++) tr[j] *= f[j % n];
    this.factorAgua = f;
  }

  nutrientes() {
    const d = this.data, n = this.grid.n_cells;
    const celdas = Array.from({ length: n }, (_, i) => i);
    const mk = () => new Arr(['cell_id'], [n], new Float64Array(n), { cell_id: celdas });
    const amm = mk(), nit = mk(), pho = mk();
    const da = d.get('dissolved_ammonium').data, dn = d.get('dissolved_nitrate').data, dp = d.get('dissolved_phosphorus').data;
    for (const cell of this.comunidades.keys()) {
      const ts = this.transTallo.get(cell);
      const a = ts.map((v) => da[cell] * v * 1.8015e-11 * 1000);
      const ni = ts.map((v) => dn[cell] * v * 1.8015e-11 * 1000);
      const p = ts.map((v) => dp[cell] * v * 1.8015e-11 * 1000);
      amm.data[cell] = sumaNp(a); nit.data[cell] = sumaNp(ni); pho.data[cell] = sumaNp(p);
      const m = new Float64Array(ts.length * 3);
      for (let i = 0; i < ts.length; i++) { m[i * 3] = 0; m[i * 3 + 1] = a[i] + ni[i]; m[i * 3 + 2] = p[i]; }
      this.biomasas.get(cell).ajustar(m);
    }
    d.set('plant_ammonium_uptake', amm); d.set('plant_nitrate_uptake', nit); d.set('plant_phosphorus_uptake', pho);
  }

  asignarGpp() {
    const d = this.data, c = this.model_constants, np = this.pfts.length;
    const dias = this.model_timing.update_interval_seconds / 86400;
    const aSuelo = (x) => x / (1000.0 * dias * this.grid.cell_area);
    for (const [cell, com] of this.comunidades) {
      const coh = com.cohortes, bio = this.biomasas.get(cell), A = com.alometria, k = nCohortes(coh);
      const S = asignacion(coh, A, this.gppTallo.get(cell));
      const sinAsignar = S.npp.map((v, i) => v - (S.branch_turnover[i] + S.fine_root_turnover[i] + S.foliage_turnover[i]));
      const rm = A.foliage_mass.map((v, i) => v * coh.fruit_seed_foliage_mass_fraction[i]);
      const rr = rm.map((v, i) => v * coh.resp_rt[i]);
      const rt = rm.map((v, i) => v * (1 / coh.tau_rt[i]));
      S.fruit_turnover = rt.map((v, i) => v * coh.fruit_flesh_fraction[i]);
      S.seed_turnover = rt.map((v, i) => v - S.fruit_turnover[i]);
      const simb = sinAsignar.map((v, i) => v * coh.root_symbiote_npp_fraction[i]);
      const crec = sinAsignar.map((v, i) => v - (rt[i] + rr[i] + simb[i]));
      const G = incrementos(coh, A, S, crec);
      this.asignaciones.set(cell, S);
      this.incrementosG.set(cell, G);
      G.delta_fruit_mass = new Float64Array(k);
      G.delta_seed_mass = new Float64Array(k);
      const nuevo = coh.dbh_value.map((v, i) => v + G.delta_dbh[i]);
      coh.dbh_value = nuevo.map((v, i) => (v <= 0 ? coh.dbh_value[i] : v));
      const tt = bio.aplicarRecambio(S);
      for (const t of ['stem', 'foliage', 'root']) {
        const s = this._sumaPonderada(tt[t], coh.n_individuals);
        if (t === 'foliage') this._sumarFilaPft('foliage_turnover_cnp', cell, s);
        else this._sumarFila(`${t}_turnover_cnp`, cell, s);
      }
      const grupos = this.pfts.map((p) => coh.pft_name.flatMap((q, i) => (q === p ? [i] : [])));
      for (const t of ['fruit', 'seed', 'foliage']) {
        grupos.forEach((filas, p) => {
          this._ponerPft(`${t}_turnover_cnp`, cell, p, this._sumaPonderada(tt[t], coh.n_individuals, filas));
          this._ponerPft(`canopy_${t}_cnp`, cell, p, this._sumaPonderada(bio.tejido(t).masas, coh.n_individuals, filas));
        });
      }
      bio.aplicarCrecimiento(G);
      d.get('root_carbohydrate_exudation').data[cell] = aSuelo(suma(simb.map((v, i) => v * coh.n_individuals[i] * c.root_exudates)));
      d.get('plant_symbiote_carbon_supply').data[cell] = aSuelo(suma(simb.map((v, i) => v * coh.n_individuals[i] * (1 - c.root_exudates))));
      const totInd = coh.n_individuals.reduce((a, b) => a + b, 0);
      const sn = new Float64Array(k * 3);
      for (const [col, el] of [[1, 'n'], [2, 'p']]) {
        const total = d.get(`ectomycorrhizal_${el}_supply`).data[cell] + d.get(`arbuscular_mycorrhizal_${el}_supply`).data[cell];
        for (let i = 0; i < k; i++) if (coh.n_individuals[i] > 0) sn[i * 3 + col] = total / totInd;
      }
      bio.ajustar(sn);
      bio.equilibrar();
      void np;
    }
  }

  caidos() {
    const d = this.data, n = this.grid.n_cells, np = this.pfts.length;
    const fs = d.get('fallen_seeds_cnp'), st = d.get('seed_turnover_cnp').data, fsc = d.get('fallen_seeds_cnp_consumed').data;
    for (let j = 0; j < fs.data.length; j++) fs.data[j] += st[j] - fsc[j];
    const ff = d.get('fallen_fruit_cnp').data, ffc = d.get('fallen_fruit_cnp_consumed').data, ft = d.get('fruit_turnover_cnp').data;
    const dias = this.model_timing.update_interval_days;
    const s = this.layer_structure.index_surface_scalar;
    const T = d.get('air_temperature').data;
    const frac = f64({ length: n }, (_, i) => {
      const t = T[s * n + i];
      const dd = t >= 0 ? (t - 0) * dias : 0.0;
      return 1 - exp(-this.model_constants.fallen_fruit_decay_rate * dd);
    });
    const post = f64(ff, (v, j) => v - ffc[j]);
    const dec = f64(post, (v, j) => frac[Math.floor(j / (np * 3))] * v);
    d.set('fallen_fruit_cnp', d.get('fallen_fruit_cnp').conDatos(f64(post, (v, j) => v + ft[j] - dec[j])));
    const sumaPft = nansumaEje(dec, [n, np, 3], 1).data;
    const out = this.plantillas.cnp();
    out.data.set(sumaPft.map((v) => v / (this.grid.cell_area * dias)));
    d.set('fallen_fruit_decay_cnp', out);
  }

  dinamicaSotobosque() {
    const c = this.model_constants, d = this.data, n = this.grid.n_cells, upy = this.model_timing.updates_per_year;
    this.sub.vegLit = this.sub.veg.quitarFraccion(c.subcanopy_vegetation_turnover / upy);
    this.sub.seedLit = this.sub.seed.quitarFraccion(c.subcanopy_seedbank_turnover / upy);
    const npp = this.subGpp.map((g) => c.subcanopy_yield * (g * 1e-09) * (1 - c.subcanopy_respiration_fraction));
    const vol = this.subTransp.map((t) => t * 1.8015e-10);
    const da = d.get('dissolved_ammonium').data, dn = d.get('dissolved_nitrate').data, dp = d.get('dissolved_phosphorus').data;
    const ak = vol.map((v, i) => v * da[i]), nk = vol.map((v, i) => v * dn[i]), pk = vol.map((v, i) => v * dp[i]);
    const vm = this.sub.veg.masas;
    for (let i = 0; i < n; i++) { vm[i * 3] += npp[i]; vm[i * 3 + 1] += ak[i] + nk[i]; vm[i * 3 + 2] += pk[i]; }
    const fr = f64({ length: n }, (_, i) => (vm[i * 3] > 0 ? npp[i] / vm[i * 3] * c.subcanopy_reproductive_allocation : 0));
    const asig = this.sub.veg.quitarFraccion(fr);
    const extra = this.sub.veg.exceso();
    const brote = this.sub.seed.quitarFraccion(c.subcanopy_sprout_rate / upy);
    const perd = brote.quitarFraccion(1 - c.subcanopy_sprout_yield);
    this.sub.seed.sumarMasa(asig);
    this.sub.seed.sumarMasa(extra);
    this.sub.veg.sumarMasa(brote);
    this.sub.seedLit.sumarMasa(perd);
    this.escribirSotobosque();
    const celdas = Array.from({ length: n }, (_, i) => i);
    for (const [v, x] of [['subcanopy_ammonium_uptake', ak], ['subcanopy_nitrate_uptake', nk], ['subcanopy_phosphorus_uptake', pk]]) {
      d.set(v, new Arr(['cell_id'], [n], x, { cell_id: celdas }));
    }
  }
}
