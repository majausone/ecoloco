// Modelo abiótico simple (models/abiotic_simple): microclimate_simple.py y
// abiotic_simple_model.py. run_simple_microclimate también lo usa el modelo abiótico
// completo para su estado inicial.

import { Arr } from '../core/arr.js?v=202610032043';
import { ModeloBase } from './base.js?v=202610032043';
import { exp, log, pow } from '../num/ucrt.js?v=202610032043';
import { nansumaEje } from '../num/np.js?v=202610032043';
import { npClip, vpSat } from './comun.js?v=202610032043';

const filaDe = (a, l, n) => a.data.subarray(l * n, (l + 1) * n);

// calculate_vapour_pressure_deficit sobre las series de referencia (cell_id, time_index)
export function vpdReferencia(T, RH) {
  const vp = T.data.map((t, i) => vpSat(t) * (RH.data[i] / 100));
  const vpd = T.data.map((t, i) => vpSat(t) - vp[i]);
  return { vapour_pressure: RH.conDatos(vp), vapour_pressure_deficit: RH.conDatos(vpd) };
}

function interpExp(ref, laiSum, ls, alturas, mh, sup, inf, g, n) {
  const nl = ls.n_layers, above = ls.int.above[0];
  const out = ls.fromTemplate();
  const den1 = 1 - exp(-g);
  for (let i = 0; i < n; i++) {
    const reg = laiSum[i] * g + ref[i];
    const hRef = alturas[above * n + i] > 0 ? alturas[above * n + i] : NaN;
    for (let l = 0; l < nl; l++) {
      const h = alturas[l * n + i] > 0 ? alturas[l * n + i] : NaN;
      const rel = (hRef - h) / (hRef - mh);
      const perfil = (1 - exp(-g * rel)) / den1;
      out.data[l * n + i] = npClip((reg - ref[i]) * perfil + ref[i], inf, sup);
    }
  }
  return out;
}

function interpLog(ref, laiSum, ls, alturas, mh, sup, inf, g, n) {
  const nl = ls.n_layers, above = ls.int.above[0];
  const out = ls.fromTemplate();
  const lmh = log(mh);
  for (let i = 0; i < n; i++) {
    const reg = laiSum[i] * g + ref[i];
    const hRef = alturas[above * n + i] > 0 ? alturas[above * n + i] : NaN;
    const pend = (ref[i] - reg) / (log(hRef) - lmh);
    const corte = reg - pend * lmh;
    for (let l = 0; l < nl; l++) {
      const h = alturas[l * n + i] > 0 ? alturas[l * n + i] : NaN;
      out.data[l * n + i] = npClip(log(h) * pend + corte, inf, sup);
    }
  }
  return out;
}

// abiotic_tools.update_profile_from_reference
export function perfilDesdeReferencia(ls, mascara, serie, t, n) {
  const ref = serie.isel('time_index', t).data;
  const out = ls.fromTemplate();
  for (const l of ls.int.filled_atmosphere) {
    for (let i = 0; i < n; i++) {
      const m = mascara.data[l * n + i];
      out.data[l * n + i] = m !== m ? NaN : ref[i];
    }
  }
  return out;
}

// energy_balance.calculate_longwave_emission: e * sb * T ** 4 (T ** 4 de un ndarray es pow)
export const emisionOndaLarga = (T, e, sb) => e * sb * pow(T, 4);

export function microclimaSimple(data, ls, t, constantes, cc, cotas) {
  const n = data.grid.n_cells, nl = ls.n_layers;
  const LAI = data.get('leaf_area_index');
  const filas = ls.int.filled_canopy;
  const sub = new Float64Array(filas.length * n);
  filas.forEach((l, k) => sub.set(filaDe(LAI, l, n), k * n));
  const laiSum = nansumaEje(sub, [filas.length, n], 0).data;
  const alturas = data.get('layer_heights').data;
  const mh = constantes.measurement_height;
  const out = {};
  for (const v of ['air_temperature', 'relative_humidity', 'vapour_pressure_deficit']) {
    const [inf, sup, g] = cotas[v];
    out[v] = interpExp(data.corte(`${v}_ref`, t).data, laiSum, ls, alturas, mh, sup, inf, g, n);
  }
  const [infW, supW, gW] = cotas.wind_speed;
  const vref = data.corte('wind_speed_ref', t).data.map(Math.abs);
  out.wind_speed = interpLog(vref, laiSum, ls, alturas, mh, supW, infW, gW, n);
  const TA = out.air_temperature, RH = out.relative_humidity;
  out.vapour_pressure = TA.conDatos(TA.data.map((x, i) => vpSat(x) * RH.data[i] / 100.0));
  out.atmospheric_pressure = perfilDesdeReferencia(ls, TA, data.serie('atmospheric_pressure_ref'), t, n);
  out.atmospheric_co2 = perfilDesdeReferencia(ls, TA, data.serie('atmospheric_co2_ref'), t, n);
  // interpolate_soil_temperature
  const [infS, supS] = cotas.soil_temperature;
  const s = ls.index_surface_scalar;
  const mat = data.corte('mean_annual_temperature', t).data;
  const suelo = ls.fromTemplate();
  const capasSuelo = ls.int.all_soil;
  for (let i = 0; i < n; i++) {
    const h0 = alturas[s * n + i];
    const hs = [h0, ...capasSuelo.map((l) => -1 * alturas[l * n + i] + h0)];
    const ts = TA.data[s * n + i];
    const pend = (ts - mat[i]) / (log(hs[0]) - log(hs[hs.length - 1]));
    const corte = ts - pend * log(hs[0]);
    capasSuelo.forEach((l, k) => { suelo.data[l * n + i] = npClip(log(hs[k + 1]) * pend + corte, infS, supS); });
  }
  out.soil_temperature = suelo;
  out.canopy_temperature = TA.copy();
  const dtr = data.corte('diurnal_temperature_range_ref', t).data;
  out.diurnal_temperature_range = ls.fromTemplate();
  for (let l = 0; l < nl; l++) for (let i = 0; i < n; i++) {
    const a = TA.data[l * n + i], b = suelo.data[l * n + i];
    out.diurnal_temperature_range.data[l * n + i] = (a === a || b === b) ? dtr[i] : NaN;
  }
  const sb = cc.stefan_boltzmann_constant;
  const lwCan = TA.data.map((x) => emisionOndaLarga(x, constantes.leaf_emissivity, sb));
  const top = ls.index_topsoil_scalar;
  const SW = data.get('shortwave_absorption');
  const nr = ls.fromTemplate();
  for (const l of ls.int.filled_canopy) for (let i = 0; i < n; i++) nr.data[l * n + i] = SW.data[l * n + i] - lwCan[l * n + i];
  for (let i = 0; i < n; i++) {
    nr.data[s * n + i] = SW.data[s * n + i] - lwCan[s * n + i];
    nr.data[top * n + i] = SW.data[top * n + i] - emisionOndaLarga(suelo.data[top * n + i], constantes.soil_emissivity, sb);
  }
  out.net_radiation = nr;
  return out;
}

export class AbioticSimpleModel extends ModeloBase {
  static fromConfig(sim) {
    const cfg = sim.config.abiotic_simple;
    return new AbioticSimpleModel(sim, cfg);
  }

  constructor(sim, cfg) {
    super(sim, 'abiotic_simple', cfg.static);
    this.model_constants = cfg.constants;
    this.bounds = cfg.bounds;
    const v = vpdReferencia(this.data.serie('air_temperature_ref'), this.data.serie('relative_humidity_ref'));
    this.data.set('vapour_pressure_deficit_ref', v.vapour_pressure_deficit);
    this.data.set('vapour_pressure_ref', v.vapour_pressure);
    this.data.addFromDict(microclimaSimple(this.data, this.layer_structure, 0, this.model_constants, this.core_constants, this.bounds));
  }

  _update(t) {
    this.data.addFromDict(microclimaSimple(this.data, this.layer_structure, t, this.model_constants, this.core_constants, this.bounds));
  }
}
