// CommunityDataExporter (models/plants/exporter.py): datos detallados de las comunidades
// de plantas en tres CSV (cohortes, dosel por comunidad y dosel por tallo). En el ejemplo
// del original está apagado; se activa con plants.community_data_export.

import { PySet } from '../num/pyset.js?v=202610032115';
import { F, I, S, tablaCSV } from '../salida/csv.js?v=202610032115';

// Columnas del DataFrame de cohortes (Cohorts de pyrealm con los rasgos de la flora)
const RASGOS = ['a_hd', 'ca_ratio', 'h_max', 'rho_s', 'lai', 'sla', 'tau_f', 'tau_r', 'tau_b', 'par_ext', 'yld', 'zeta',
  'resp_r', 'resp_s', 'resp_f', 'm', 'n', 'f_g', 'fruit_seed_foliage_mass_fraction', 'resp_rt', 'tau_rt',
  'root_symbiote_npp_fraction', 'stem_c_n_ratio', 'stem_c_p_ratio', 'foliage_turnover_c_n_ratio',
  'foliage_turnover_c_p_ratio', 'fruit_seed_c_n_ratio', 'fruit_seed_c_p_ratio', 'root_c_n_ratio', 'root_c_p_ratio',
  'foliage_c_n_ratio', 'foliage_c_p_ratio', 'c_mass_fruit_flesh', 'c_mass_fruit_seed', 'seeds_per_fruit',
  'lai_base', 'tau_f_base', 'q_m', 'z_max_prop', 'fruit_flesh_fraction'];
const RASGOS_ENTEROS = new Set(['seeds_per_fruit']);
const ALOMETRIA = ['dbh', 'stem_height', 'crown_area', 'crown_fraction', 'stem_mass', 'foliage_mass', 'fine_root_mass',
  'sapwood_mass', 'crown_r0', 'crown_z_max'];
const ASIGNACION = ['whole_crown_gpp', 'sapwood_respiration', 'foliage_respiration', 'fine_root_respiration',
  'foliage_turnover', 'fine_root_turnover', 'branch_turnover', 'npp'];
const INCREMENTOS = ['delta_dbh', 'delta_stem_mass', 'delta_foliage_mass', 'delta_fine_root_mass'];
const TEJIDOS = ['foliage', 'stem', 'root', 'fruit', 'seed'];
const BIOMASA = [...TEJIDOS, 'surplus'].flatMap((t) => ['C', 'N', 'P'].map((e) => `${t}_${e}_biomass`));
const COMUNIDAD = ['average_layer_absorption', 'average_layer_fapar', 'average_layer_lai', 'transmission_profile'];
const TALLO = ['stem_leaf_area', 'fapar'];

const OBLIGATORIAS = {
  cohort_attributes: ['cohort_id', 'cell_id', 'time', 'time_index'],
  community_canopy_attributes: ['cell_id', 'time', 'time_index', 'canopy_layer_index', 'heights'],
  stem_canopy_attributes: ['cohort_id', 'cell_id', 'time', 'time_index', 'canopy_layer_index', 'heights'],
};
const DISPONIBLES = {
  cohort_attributes: new Set([...OBLIGATORIAS.cohort_attributes, 'pft_name', 'dbh_value', 'n_individuals', ...RASGOS,
    ...BIOMASA, ...ALOMETRIA, ...ASIGNACION, ...INCREMENTOS]),
  community_canopy_attributes: new Set([...OBLIGATORIAS.community_canopy_attributes, ...COMUNIDAD]),
  stem_canopy_attributes: new Set([...OBLIGATORIAS.stem_canopy_attributes, ...TALLO]),
};

// set de cadenas de Python (PYTHONHASHSEED=0): el orden de las columnas sale de aquí
function columnasPedidas(nombre, pedidas) {
  if (pedidas === 'ALL') return 'ALL';
  if (!pedidas || !pedidas.length) return null;
  const falta = pedidas.filter((a) => !DISPONIBLES[nombre].has(a));
  if (falta.length) throw new Error(`The ${nombre} exporter configuration contains unknown attributes: ${falta.join(', ')}`);
  const s = new PySet(OBLIGATORIAS[nombre]).or(new PySet(pedidas));
  return [...s];
}

export class ExportadorPlantas {
  constructor(cfg) {
    cfg = cfg || {};
    this.cohortes = columnasPedidas('cohort_attributes', cfg.cohort_attributes);
    this.comunidad = columnasPedidas('community_canopy_attributes', cfg.community_canopy_attributes);
    this.tallos = columnasPedidas('stem_canopy_attributes', cfg.stem_canopy_attributes);
    this.activo = !!(this.cohortes || this.comunidad || this.tallos);
    this.lineas = { plants_cohort_data: [], plants_community_canopy_data: [], plants_stem_canopy_data: [] };
  }

  _emitir(clave, filas, todas, pedidas) {
    if (!filas.length) return;
    const cols = pedidas === 'ALL' ? todas : pedidas;
    const l = this.lineas[clave];
    if (!l.length) l.push(cols.join(','));
    l.push(...tablaCSV(filas, cols));
  }

  volcar(m, fecha, t) {
    if (!this.activo) return;
    if (this.cohortes) this._cohortes(m, fecha, t);
    if (this.comunidad) this._comunidad(m, fecha, t);
    if (this.tallos) this._tallos(m, fecha, t);
  }

  _cohortes(m, fecha, t) {
    const filas = [];
    for (const [cell, com] of m.comunidades) {
      const coh = com.cohortes, A = com.alometria, k = coh.pft_name.length;
      const Sa = m.asignaciones.get(cell), G = m.incrementosG.get(cell), bio = m.biomasas.get(cell);
      for (let i = 0; i < k; i++) {
        const f = { cell_id: I(cell), cohort_id: S(coh.cohort_id[i]), time: S(fecha), time_index: I(t),
          pft_name: S(coh.pft_name[i]), dbh_value: F(coh.dbh_value[i]), n_individuals: I(coh.n_individuals[i]) };
        for (const r of RASGOS) f[r] = RASGOS_ENTEROS.has(r) ? I(coh[r][i]) : F(coh[r][i]);
        for (const a of ALOMETRIA) f[a] = F(A[a][i]);
        for (const a of ASIGNACION) f[a] = Sa ? F(Sa[a][i]) : null;
        for (const a of INCREMENTOS) f[a] = G ? F(G[a][i]) : null;
        for (const tj of TEJIDOS) {
          const masas = bio.tejido(tj).masas;
          ['C', 'N', 'P'].forEach((e, j) => { f[`${tj}_${e}_biomass`] = F(masas[i * 3 + j]); });
        }
        ['C', 'N', 'P'].forEach((e, j) => { f[`surplus_${e}_biomass`] = F(bio.excedentes[i * 3 + j]); });
        filas.push(f);
      }
    }
    const todas = ['cell_id', 'cohort_id', 'time', 'time_index', 'pft_name', 'dbh_value', 'n_individuals', ...RASGOS,
      ...ALOMETRIA, ...ASIGNACION, ...INCREMENTOS, ...BIOMASA];
    this._emitir('plants_cohort_data', filas, todas, this.cohortes);
  }

  _comunidad(m, fecha, t) {
    const filas = [];
    for (const [cell, cn] of m.doseles) {
      if (!cn) continue;
      const d = cn.community_data;
      cn.heights.forEach((h, l) => {
        const f = { cell_id: I(cell), time: S(fecha), time_index: I(t), canopy_layer_index: I(l), heights: F(h) };
        for (const a of COMUNIDAD) f[a] = F(d[a][l]);
        filas.push(f);
      });
    }
    this._emitir('plants_community_canopy_data', filas, ['cell_id', 'time', 'time_index', 'canopy_layer_index', 'heights', ...COMUNIDAD], this.comunidad);
  }

  _tallos(m, fecha, t) {
    const filas = [];
    for (const [cell, cn] of m.doseles) {
      if (!cn) continue;
      const coh = m.comunidades.get(cell).cohortes, d = cn.cohort_data, k = cn.n_cohorts;
      cn.heights.forEach((h, l) => {
        for (let i = 0; i < k; i++) {
          filas.push({ cohort_id: S(coh.cohort_id[i]), cell_id: I(cell), time: S(fecha), time_index: I(t),
            canopy_layer_index: I(l), heights: F(h), stem_leaf_area: F(d.stem_leaf_area[l * k + i]), fapar: F(d.fapar[l * k + i]) });
        }
      });
    }
    this._emitir('plants_stem_canopy_data', filas, ['cohort_id', 'cell_id', 'time', 'time_index', 'canopy_layer_index', 'heights', ...TALLO], this.tallos);
  }
}
