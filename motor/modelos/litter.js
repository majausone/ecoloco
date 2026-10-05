// Modelo de hojarasca (models/litter). Traducción directa, operación a operación, de
// carbon.py, chemistry.py, env_factors.py, inputs.py, losses.py y litter_model.py.

import { Arr } from '../core/arr.js?v=202610052338';
import { ModeloBase } from './base.js?v=202610052338';
import { exp, log10 } from '../num/ucrt.js?v=202610052338';
import { dotVecMat, potArr, nansumaEje } from '../num/np.js?v=202610052338';
import { f64 } from '../num/f64.js?v=202610052338';

const ELEM = ['C', 'N', 'P'];
const POOLS = ['above_metabolic', 'above_structural', 'woody', 'below_metabolic', 'below_structural'];

// ----------------------------------------------------------------- utilidades vectoriales
const map1 = (a, f) => f64(a, f);
function map2(a, b, f) { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = f(a[i], b[i]); return o; }
function map3(a, b, c, f) { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = f(a[i], b[i], c[i]); return o; }

// columna de un elemento de un array (cell_id, element)
export function elem(arr, e) {
  const k = ELEM.indexOf(e), n = arr.shape[0];
  const o = new Float64Array(n);
  for (let i = 0; i < n; i++) o[i] = arr.data[i * 3 + k];
  return o;
}

export function apilarCNP(c, n, p, nceldas) {
  const d = new Float64Array(nceldas * 3);
  for (let i = 0; i < nceldas; i++) { d[i * 3] = c[i]; d[i * 3 + 1] = n[i]; d[i * 3 + 2] = p[i]; }
  return new Arr(['cell_id', 'element'], [nceldas, 3], d,
    { cell_id: Array.from({ length: nceldas }, (_, i) => i), element: ELEM.slice() });
}

// ----------------------------------------------------------------- env_factors
// average_abiotic_environment_over_microbially_active_layers
export function mediaCapasActivas(variable, ls) {
  const w = map1(ls.soil_layer_active_thickness, (t) => t / ls.microbial_simulation_depth);
  const idx = ls.int.all_soil, n = variable.shape[1];
  const M = new Float64Array(idx.length * n);
  for (let k = 0; k < idx.length; k++) M.set(variable.data.subarray(idx[k] * n, (idx[k] + 1) * n), k * n);
  return dotVecMat(w, M, idx.length, n);
}

// soil/env_factors.py: calculate_water_potential_impact_on_microbes
export function impactoPotencialHidrico(wp, halt, opt, curvatura) {
  const lopt = log10(-opt), lhalt = log10(-halt);
  return map1(wp, (w) => {
    const sup = potArr((log10(-w) - lopt) / (lhalt - lopt), curvatura);
    return w > opt ? 1 : (w < halt ? 0 : 1 - sup);
  });
}

function factoresAmbientales(data, ls, c) {
  const aire = data.get('air_temperature');
  const n = aire.shape[1];
  const tSup = aire.data.slice(ls.index_surface_scalar * n, (ls.index_surface_scalar + 1) * n);
  const tSuelo = mediaCapasActivas(data.get('soil_temperature'), ls);
  const wp = mediaCapasActivas(data.get('matric_potential'), ls);
  const fT = (T) => map1(T, (t) => exp(c.litter_decomp_temp_response * (t - c.litter_decomp_reference_temp) / (t + c.litter_decomp_offset_temp)));
  return {
    temp_above: fT(tSup), temp_below: fT(tSuelo),
    water: impactoPotencialHidrico(wp, c.litter_decay_water_potential_halt, c.litter_decay_water_potential_optimum, c.moisture_response_curvature),
  };
}

// ----------------------------------------------------------------- inputs
function splitMetabolico(masa, lignina, c) {
  const C = elem(masa, 'C'), N = elem(masa, 'N'), P = elem(masa, 'P');
  for (const l of lignina) if (l < 0 || l > 1) throw new Error('Lignin proportion not between 0 and 1 (inclusive)!');
  const out = new Float64Array(C.length);
  for (let i = 0; i < C.length; i++) {
    const cn = N[i] !== 0 ? C[i] / N[i] : Infinity;
    const cp = P[i] !== 0 ? C[i] / P[i] : Infinity;
    const red = (cn === Infinity || cn === -Infinity || cp === Infinity || cp === -Infinity)
      ? c.max_metabolic_fraction_of_input
      : lignina[i] * (c.metabolic_split_nitrogen_sensitivity * cn + c.metabolic_split_phosphorus_sensitivity * cp);
    let mf = c.max_metabolic_fraction_of_input - red;
    mf = mf < 0 ? 0.0 : mf;
    mf = mf > 1 - lignina[i] ? 1 - lignina[i] : mf;
    out[i] = mf;
  }
  return out;
}

function repartoNutriente(cIn, nutIn, split, ratio) {
  const n = cIn.length, meta = new Float64Array(n), struct = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const cm = cIn[i] * split[i];
    const cs = cIn[i] * (1 - split[i]);
    const estruct = cs !== 0;
    const soloMeta = (cm !== 0) && (cs === 0);
    let mn = 0, sn = 0;
    if (estruct) {
      const r = cm / cs;
      const prod = r * ratio;
      sn = nutIn[i] / (1 + prod);
      mn = prod * sn;
    }
    if (soloMeta) mn = nutIn[i];
    meta[i] = mn;
    struct[i] = sn;
  }
  return { meta, struct };
}

function crearEntradas(data, c, intervalo, cellArea) {
  const ritmo = (a) => a.conDatos(map1(a.data, (v) => v / (cellArea * intervalo)));
  const fol = data.get('foliage_turnover_cnp');
  const folSum = nansumaEje(fol.data, fol.shape, 1).data;
  const tot = {
    leaf_mass: new Arr(['cell_id', 'element'], [fol.shape[0], 3], map1(folSum, (v) => v / (cellArea * intervalo))),
    deadwood_mass: ritmo(data.get('stem_turnover_cnp')),
    root_mass: ritmo(data.get('root_turnover_cnp')),
    subcanopy_veg_mass: ritmo(data.get('subcanopy_vegetation_litter_cnp')),
    subcanopy_seed_mass: ritmo(data.get('subcanopy_seedbank_litter_cnp')),
    herbivore_waste_above_mass: ritmo(data.get('herbivory_waste_above_cnp')),
    herbivore_waste_below_mass: ritmo(data.get('herbivory_waste_below_cnp')),
    leaf_lignin: data.get('senesced_leaf_lignin').data,
    root_lignin: data.get('root_lignin').data,
    stem_lignin: data.get('stem_lignin').data,
    subcanopy_veg_lignin: data.get('subcanopy_vegetation_litter_lignin').data,
    subcanopy_seed_lignin: data.get('subcanopy_seedbank_litter_lignin').data,
    herbivore_waste_above_lignin: data.get('herbivory_waste_above_lignin').data,
    herbivore_waste_below_lignin: data.get('herbivory_waste_below_lignin').data,
  };
  const vars = ['leaf', 'root', 'subcanopy_veg', 'subcanopy_seed', 'herbivore_waste_above', 'herbivore_waste_below'];
  const split = {};
  for (const v of vars) split[v] = splitMetabolico(tot[`${v}_mass`], tot[`${v}_lignin`], c);
  const C = (k) => elem(tot[k], 'C');
  const lC = C('leaf_mass'), svC = C('subcanopy_veg_mass'), ssC = C('subcanopy_seed_mass'), haC = C('herbivore_waste_above_mass');
  const rC = C('root_mass'), hbC = C('herbivore_waste_below_mass');
  const n = lC.length;
  const L = split.leaf, SV = split.subcanopy_veg, SS = split.subcanopy_seed, HA = split.herbivore_waste_above;
  const R = split.root, HB = split.herbivore_waste_below;
  const above_metabolic = new Float64Array(n), above_structural = new Float64Array(n);
  const below_metabolic = new Float64Array(n), below_structural = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    above_metabolic[i] = L[i] * lC[i] + SV[i] * svC[i] + SS[i] * ssC[i] + HA[i] * haC[i];
    above_structural[i] = (1 - L[i]) * lC[i] + (1 - SV[i]) * svC[i] + (1 - SS[i]) * ssC[i] + (1 - HA[i]) * haC[i];
    below_metabolic[i] = R[i] * rC[i] + HB[i] * hbC[i];
    below_structural[i] = (1 - R[i]) * rC[i] + (1 - HB[i]) * hbC[i];
  }
  return { ...tot, split, woody: C('deadwood_mass'), above_metabolic, above_structural, below_metabolic, below_structural };
}

function quimicaEntradas(ent, c) {
  const n = ent.woody.length;
  const C = (k) => elem(ent[k], 'C');
  const rC = C('root_mass'), hbC = C('herbivore_waste_below_mass');
  const lC = C('leaf_mass'), svC = C('subcanopy_veg_mass'), ssC = C('subcanopy_seed_mass'), haC = C('herbivore_waste_above_mass');
  const q = {
    woody_lignin: ent.stem_lignin,
    below_structural_lignin: new Float64Array(n), above_structural_lignin: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    q.below_structural_lignin[i] = (ent.root_lignin[i] * rC[i] + ent.herbivore_waste_below_lignin[i] * hbC[i]) / ent.below_structural[i];
    q.above_structural_lignin[i] = (ent.leaf_lignin[i] * lC[i] + ent.subcanopy_veg_lignin[i] * svC[i]
      + ent.subcanopy_seed_lignin[i] * ssC[i] + ent.herbivore_waste_above_lignin[i] * haC[i]) / ent.above_structural[i];
  }
  for (const [nut, ratio] of [['nitrogen', c.metabolic_to_structural_n_ratio], ['phosphorus', c.metabolic_to_structural_p_ratio]]) {
    const E = nut[0].toUpperCase();
    const s = {};
    for (const p of ['leaf', 'root', 'subcanopy_veg', 'subcanopy_seed', 'herbivore_waste_above', 'herbivore_waste_below']) {
      const masa = ent[`${p}_mass`];
      s[p] = repartoNutriente(elem(masa, 'C'), elem(masa, E), ent.split[p], ratio);
    }
    q[`woody_${nut}`] = elem(ent.deadwood_mass, E);
    q[`below_metabolic_${nut}`] = map2(s.root.meta, s.herbivore_waste_below.meta, (a, b) => a + b);
    q[`below_structural_${nut}`] = map2(s.root.struct, s.herbivore_waste_below.struct, (a, b) => a + b);
    q[`above_metabolic_${nut}`] = f64(s.leaf.meta, (v, i) => v + s.subcanopy_veg.meta[i] + s.subcanopy_seed.meta[i] + s.herbivore_waste_above.meta[i]);
    q[`above_structural_${nut}`] = f64(s.leaf.struct, (v, i) => v + s.subcanopy_veg.struct[i] + s.subcanopy_seed.struct[i] + s.herbivore_waste_above.struct[i]);
  }
  return q;
}

// ----------------------------------------------------------------- losses
const perdidaCarbono = (old, fin, ent, dt) => map3(old, fin, ent, (o, f, e) => o + e * dt - f);

function perdidaNutriente(iniC, iniN, perdC, entC, entN, dt) {
  const o = new Float64Array(iniC.length);
  for (let i = 0; i < o.length; i++) {
    const fIni = perdC[i] > iniC[i] ? 1 : perdC[i] / iniC[i];
    const fNue = (perdC[i] > iniC[i] && entC[i] !== 0) ? (perdC[i] - iniC[i]) / (entC[i] * dt) : 0;
    const nutEnt = entN[i] * dt;
    o[i] = fIni * iniN[i] + fNue * nutEnt;
  }
  return o;
}

function perdidaLignina(iniTam, perdC, ent, iniProp, entProp, dt) {
  const o = new Float64Array(iniTam.length);
  for (let i = 0; i < o.length; i++) {
    const fIni = perdC[i] > iniTam[i] ? 1 : perdC[i] / iniTam[i];
    const fNue = (perdC[i] > iniTam[i] && ent[i] !== 0) ? (perdC[i] - iniTam[i]) / (ent[i] * dt) : 0;
    const iniLig = iniTam[i] * iniProp[i];
    const entLig = ent[i] * dt * entProp[i];
    o[i] = fIni * iniLig + fNue * entLig;
  }
  return o;
}

// ----------------------------------------------------------------- modelo
export class LitterModel extends ModeloBase {
  static fromConfig(sim) {
    const cfg = sim.config.litter;
    return new LitterModel(sim, cfg.constants, cfg.static);
  }

  constructor(sim, constantes, estatico = false) {
    super(sim, 'litter', estatico);
    this.model_constants = constantes;
    // correcciones (no son del original; apagadas por defecto, ver motor/correcciones.js)
    this.corr = { tasa_cero: false, ...((sim.config.litter && sim.config.litter.correcciones) || {}) };
    for (const p of POOLS) {
      if (this.data.get(`litter_pool_${p}_cnp`).data.some((v) => v < 0)) throw new Error(`Negative pool sizes found in: litter_pool_${p}_cnp`);
    }
    for (const l of ['lignin_above_structural', 'lignin_woody', 'lignin_below_structural']) {
      if (this.data.get(l).data.some((v) => v < 0 || v > 1)) throw new Error(`Lignin proportions not between 0 and 1 found in: ${l}`);
    }
  }

  _update() {
    const d = this.data, c = this.model_constants, ls = this.layer_structure;
    const area = this.grid.cell_area;
    const dt = this.model_timing.update_interval_days;
    const prof = this.core_constants.microbial_simulation_depth;
    // post consumo
    const pc = {};
    for (const p of POOLS) {
      const pool = d.get(`litter_pool_${p}_cnp`), cons = d.get(`litter_consumed_${p}_cnp`);
      pc[p] = pool.conDatos(map2(pool.data, cons.data, (a, b) => a - b / area));
    }
    // tasas de descomposición
    const f = factoresAmbientales(d, ls, c);
    const quim = (lig) => map1(lig, (l) => exp(c.lignin_inhibition_factor * l));
    const ligAS = d.get('lignin_above_structural').data, ligW = d.get('lignin_woody').data, ligBS = d.get('lignin_below_structural').data;
    const tasas = {
      above_metabolic: map1(f.temp_above, (t) => c.litter_decay_constant_metabolic_above * t),
      above_structural: map2(f.temp_above, quim(ligAS), (t, q) => c.litter_decay_constant_structural_above * t * q),
      woody: map2(f.temp_above, quim(ligW), (t, q) => c.litter_decay_constant_woody * t * q),
      below_metabolic: map2(f.temp_below, f.water, (t, w) => c.litter_decay_constant_metabolic_below * t * w),
      below_structural: map3(f.temp_below, f.water, quim(ligBS), (t, w, q) => c.litter_decay_constant_structural_below * t * w * q),
    };
    const ent = crearEntradas(d, c, dt, area);
    const qe = quimicaEntradas(ent, c);
    // nuevos tamaños de carbono
    const fin = {}, ini = {};
    for (const p of POOLS) {
      ini[p] = elem(pc[p], 'C');
      fin[p] = map3(ent[p], tasas[p], ini[p], (e, k, i0) => {
        // tasa_cero: con la tasa a 0 (suelo seco) el equilibrio e/k es infinito y sale NaN
        if (k === 0 && this.corr.tasa_cero) return i0 + e * dt;
        const eq = e / k;
        return eq - (eq - i0) * exp(-k * dt);
      });
    }
    // pérdidas
    const L = {};
    for (const p of POOLS) L[`${p}_carbon`] = perdidaCarbono(ini[p], fin[p], ent[p], dt);
    for (const [nut, E] of [['nitrogen', 'N'], ['phosphorus', 'P']]) {
      for (const p of POOLS) {
        L[`${p}_${nut}`] = perdidaNutriente(ini[p], elem(pc[p], E), L[`${p}_carbon`], ent[p], qe[`${p}_${nut}`], dt);
      }
    }
    const ligIni = { above_structural: ligAS, woody: ligW, below_structural: ligBS };
    for (const p of ['above_structural', 'woody', 'below_structural']) {
      L[`${p}_lignin`] = perdidaLignina(ini[p], L[`${p}_carbon`], ent[p], ligIni[p], qe[`${p}_lignin`], dt);
    }
    const n = ini.woody.length;
    const sum5 = (k) => f64({ length: n }, (_, i) => (L[`above_metabolic_${k}`][i] + L[`above_structural_${k}`][i]
      + L[`woody_${k}`][i] + L[`below_metabolic_${k}`][i] + L[`below_structural_${k}`][i]) / (dt * prof));
    const Nmin = sum5('nitrogen'), Pmin = sum5('phosphorus');
    // química nueva
    const nuevaLig = {};
    for (const p of ['above_structural', 'woody', 'below_structural']) {
      nuevaLig[p] = f64({ length: n }, (_, i) => {
        const entTot = ent[p][i] * dt;
        const iniLig = ini[p][i] * ligIni[p][i];
        const entLig = entTot * qe[`${p}_lignin`][i];
        return (iniLig + entLig - L[`${p}_lignin`][i]) / (ini[p][i] + entTot - L[`${p}_carbon`][i]);
      });
    }
    const nut = {};
    for (const [E, nombre] of [['N', 'nitrogen'], ['P', 'phosphorus']]) {
      for (const p of POOLS) {
        const orig = elem(pc[p], E);
        nut[`${p}_${nombre}`] = f64(orig, (o, i) => o + qe[`${p}_${nombre}`][i] * dt - L[`${p}_${nombre}`][i]);
      }
    }
    // carbono mineralizado
    const Cmin = f64({ length: n }, (_, i) => {
      const t = c.cue_metabolic * L.above_metabolic_carbon[i] + c.cue_structural_above_ground * L.above_structural_carbon[i]
        + c.cue_woody * L.woody_carbon[i] + c.cue_metabolic * L.below_metabolic_carbon[i]
        + c.cue_structural_below_ground * L.below_structural_carbon[i];
      return t / (prof * dt);
    });
    const out = {};
    for (const p of POOLS) out[`litter_pool_${p}_cnp`] = apilarCNP(fin[p], nut[`${p}_nitrogen`], nut[`${p}_phosphorus`], n);
    const cel = (v) => new Arr(['cell_id'], [n], v, { cell_id: Array.from({ length: n }, (_, i) => i) });
    out.lignin_above_structural = cel(nuevaLig.above_structural);
    out.lignin_woody = cel(nuevaLig.woody);
    out.lignin_below_structural = cel(nuevaLig.below_structural);
    out.litter_mineralisation_rate_cnp = apilarCNP(Cmin, Nmin, Pmin, n);
    d.addFromDict(out);
  }
}
