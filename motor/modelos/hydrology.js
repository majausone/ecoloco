// Modelo hidrológico (models/hydrology): above_ground.py, below_ground.py,
// hydrology_tools.py y hydrology_model.py, operación a operación.

import { Arr } from '../core/arr.js';
import { ModeloBase } from './base.js';
import { exp, pow } from '../num/ucrt.js';
import { suma, sumaEje, nansumaEje, mediaEje, gradienteEje0, argmax } from '../num/np.js';
import { PySet } from '../num/pyset.js';
import {
  ZERO_CELSIUS, npMax, npMin, npClip, nanACero, vpSat, calorEspecifico, densidadAire, calorLatente,
  pendientePresionSat,
} from './comun.js';

const celdas = (n) => Array.from({ length: n }, (_, i) => i);

// ------------------------------------------------------------------ above_ground
function mapaDrenaje(grid, elevacion) {
  if (grid.grid_type !== 'square') throw new Error('This grid type is currently not supported!');
  grid.setNeighbours(Math.sqrt(grid.cell_area));
  const vecinos = grid.neighbours;
  const masBajo = vecinos.map((ids, c) => {
    const dif = Float64Array.from(ids, (j) => elevacion[c] - elevacion[j]);
    return ids[argmax(dif)];
  });
  const n = masBajo.length;
  const directo = Array.from({ length: n }, () => []);
  masBajo.forEach((ln, cell) => directo[ln].push(cell));
  const recoger = (cell, visto) => {
    for (const up of directo[cell]) {
      if (!visto.has(up)) { visto.add(up); recoger(up, visto); }
    }
    return visto;
  };
  return Array.from({ length: n }, (_, c) => recoger(c, new PySet()).toArray());
}

function enrutar(mapa, sup, sub) {
  const local = Float64Array.from(sup, (v, i) => nanACero(v) + nanACero(sub[i]));
  const entrada = new Float64Array(local.length);
  mapa.forEach((ups, c) => {
    if (ups.length) entrada[c] = suma(Float64Array.from(ups, (u) => local[u]));
  });
  const total = Float64Array.from(local, (v, i) => v + entrada[i]);
  if (total.some((v) => v < 0)) throw new Error('The river discharge should not be negative!');
  return total;
}

function repartirLluviaMensual(totalMensual, dias, pww, pwd, forma, escala, rng) {
  if (totalMensual.some((v) => v < 0)) throw new Error('Monthly rainfall values cannot be negative');
  const n = totalMensual.length;
  const out = new Float64Array(n * dias);
  for (let m = 0; m < n; m++) {
    const est = new Uint8Array(dias);
    est[0] = rng.random() < pwd ? 1 : 0;
    for (let d = 1; d < dias; d++) est[d] = est[d - 1] === 1 ? (rng.random() < pww ? 1 : 0) : (rng.random() < pwd ? 1 : 0);
    const humedos = [];
    for (let d = 0; d < dias; d++) if (est[d] === 1) humedos.push(d);
    const total = totalMensual[m];
    if (humedos.length === 0 || total <= 0) continue;
    const inten = rng.gamma(forma, escala, humedos.length);
    const f = total / suma(inten);
    for (let k = 0; k < humedos.length; k++) out[m * dias + humedos[k]] = inten[k] * f;
  }
  for (let i = 0; i < out.length; i++) out[i] = nanACero(out[i]);
  return out;
}

// ------------------------------------------------------------------ below_ground
function potencialMatricial(efSat, alfa, nvg, tol) {
  const forma = 1 - 1 / nvg;
  return Float64Array.from(efSat, (e) => {
    const ee = e + tol;
    return -1 / alfa * pow(pow(ee, -1 / forma) - 1, 1 / nvg);
  });
}

// ------------------------------------------------------------------ modelo
export class HydrologyModel extends ModeloBase {
  static fromConfig(sim) {
    const cfg = sim.config.hydrology;
    return new HydrologyModel(sim, cfg);
  }

  constructor(sim, cfg) {
    super(sim, 'hydrology', cfg.static);
    this.cfg = cfg;
    this.model_constants = cfg.constants;
    // correcciones (no son del original; apagadas por defecto, ver motor/correcciones.js)
    this.corr = { lluvia_paso_diario: false, evaporacion_suelo: false, ...(cfg.correcciones || {}) };
    // AbioticConstants() por defecto (el original no usa la configuración de abiotic aquí)
    this.abiotic_constants = { saturated_pressure_slope_parameters: [4098.0, 0.6108, 17.27, 237.3],
      latent_heat_vap_equ_factors: [1918460.0, 33.91] };
    this._setup();
  }

  _setup() {
    const c = this.model_constants, ls = this.layer_structure, d = this.data, n = this.grid.n_cells;
    this.grid.setNeighbours(Math.sqrt(this.grid.cell_area));
    this.drainage_map = mapaDrenaje(this.grid, d.get('elevation').data);
    const ns = ls.n_soil_layers;
    this.espesorMm = Float64Array.from(ls.soil_layer_thickness, (t) => t * this.core_constants.meters_to_mm);
    for (const v of ['snowfall', 'snow_water_equivalent', 'temperature_driven_snowmelt', 'rain_driven_snowmelt', 'sublimation_snow']) {
      d.set(v, new Arr(['cell_id'], [n], new Float64Array(n), { cell_id: celdas(n) }));
    }
    const sm = ls.fromTemplate();
    ls.int.all_soil.forEach((l, k) => { for (let i = 0; i < n; i++) sm.data[l * n + i] = this.cfg.initial_soil_moisture * this.espesorMm[k]; });
    d.set('soil_moisture', sm);
    const ini = new Float64Array(ns * n);
    ls.int.all_soil.forEach((l, k) => { for (let i = 0; i < n; i++) ini[k * n + i] = sm.data[l * n + i] / this.espesorMm[k]; });
    const ef = Float64Array.from(ini, (v) => (v - c.soil_moisture_residual) / (c.soil_moisture_saturation - c.soil_moisture_residual));
    const mp = potencialMatricial(ef, c.air_entry_potential_inverse, c.van_genuchten_nonlinearily_parameter, c.denominator_tolerance);
    const mpa = ls.fromTemplate();
    ls.int.all_soil.forEach((l, k) => { for (let i = 0; i < n; i++) mpa.data[l * n + i] = mp[k * n + i] * c.m_to_kpa; });
    d.set('matric_potential', mpa);
    d.set('condensation', ls.fromTemplate());
    const gw = this.cfg.initial_groundwater_saturation * c.groundwater_capacity;
    d.set('groundwater_storage', new Arr(['groundwater_layers', 'cell_id'], [2, n], new Float64Array(2 * n).fill(gw),
      { groundwater_layers: [ls.n_layers, ls.n_layers + 1], cell_id: celdas(n) }));
    // initialise_atmosphere_for_hydrology
    const ars = ls.fromTemplate();
    ars.data.fill(c.initial_aerodynamic_resistance_soil); // layer[{}] = valor asigna todo
    for (let i = 0; i < n; i++) ars.data[ls.index_surface_scalar * n + i] = c.initial_aerodynamic_resistance_soil;
    d.set('aerodynamic_resistance_soil', ars);
    const sc = ls.fromTemplate();
    for (const l of [...ls.int.filled_canopy, ls.index_surface_scalar]) for (let i = 0; i < n; i++) sc.data[l * n + i] = c.initial_stomatal_conductance;
    d.set('stomatal_conductance', sc);
    d.set('aerodynamic_resistance_canopy', new Arr(['cell_id'], [n],
      new Float64Array(d.serie('air_temperature_ref').shape[0]).fill(this.core_constants.initial_aerodynamic_resistance_canopy)));
    const T = d.corte('air_temperature_ref', 0).data, P = d.corte('atmospheric_pressure_ref', 0).data;
    const cc = this.core_constants;
    const rellenar = (f) => {
      const a = ls.fromTemplate();
      for (const l of ls.int.filled_atmosphere) for (let i = 0; i < n; i++) a.data[l * n + i] = f(i);
      return a;
    };
    d.set('density_air', rellenar((i) => densidadAire(T[i], P[i], cc.specific_gas_constant_dry_air, ZERO_CELSIUS)));
    const she = rellenar((i) => calorEspecifico(T[i]));
    d.set('specific_heat_air', she.conDatos(Float64Array.from(she.data, (v) => v / 1000.0)));
    d.set('latent_heat_vapourisation', rellenar((i) => calorLatente(T[i], ZERO_CELSIUS, this.abiotic_constants.latent_heat_vap_equ_factors)));
  }

  _update(t) {
    const c = this.model_constants, cc = this.core_constants, ls = this.layer_structure, d = this.data;
    const n = this.grid.n_cells, nl = ls.n_layers, ns = ls.n_soil_layers;
    const diasF = this.model_timing.update_interval_seconds / cc.seconds_to_day;
    const dias = Math.trunc(Math.floor(diasF / 1));
    const sup = ls.index_surface_scalar;
    const fila = (a, l) => a.data.slice(l * n, (l + 1) * n);
    // setup_hydrology_input_current_timestep
    // lluvia_paso_diario: a paso de un día el original sortea si el día es húmedo (p_wet_dry) y
    // pierde la lluvia real el 70 % de los días; con la corrección se usa la del día tal cual
    const lluvia0 = this.corr.lluvia_paso_diario && dias === 1
      ? Float64Array.from(d.corte('precipitation', t).data, (v) => (v > 0 ? v : 0))
      : repartirLluviaMensual(d.corte('precipitation', t).data, dias, this.cfg.p_wet_wet, this.cfg.p_wet_dry,
        this.cfg.rainfall_shape_parameter, this.cfg.rainfall_scale_parameter, this.azar.defaultRng());
    const Tref = d.corte('air_temperature_ref', t).data;
    const lluvia = new Float64Array(n * dias), nieve = new Float64Array(n * dias);
    for (let i = 0; i < n; i++) {
      const fsn = npClip((c.temperature_threshold_rain - Tref[i]) / (c.temperature_threshold_rain - c.temperature_threshold_snow), 0.0, 1.0);
      for (let k = 0; k < dias; k++) {
        nieve[i * dias + k] = fsn * lluvia0[i * dias + k];
        lluvia[i * dias + k] = (1.0 - fsn) * lluvia0[i * dias + k];
      }
    }
    const Tsup = fila(d.get('air_temperature'), sup), HRsup = fila(d.get('relative_humidity'), sup);
    const vsup = fila(d.get('wind_speed'), sup), Psup = fila(d.get('atmospheric_pressure'), sup);
    const LAI = d.get('leaf_area_index');
    const laiSum = nansumaEje(LAI.data, [nl, n], 0).data;
    const transp = nansumaEje(Float64Array.from(d.get('transpiration').data, (v) => v / dias), [nl, n], 0).data;
    const topSat = Float64Array.from({ length: n }, () => c.soil_moisture_saturation * this.espesorMm[0]);
    const topRes = Float64Array.from({ length: n }, () => c.soil_moisture_residual * this.espesorMm[0]);
    const smAll = d.get('soil_moisture');
    let humedad = new Float64Array(ns * n);
    ls.int.all_soil.forEach((l, k) => humedad.set(smAll.data.subarray(l * n, (l + 1) * n), k * n));
    let gwSt = Float64Array.from(d.get('groundwater_storage').data);
    const cond = nansumaEje(d.get('condensation').data, [nl, n], 0).data.map((v) => v / dias);
    // fin del setup
    let swe = Float64Array.from(d.get('snow_water_equivalent').data);
    const Patm = d.get('atmospheric_pressure').data, LV = d.get('latent_heat_vapourisation').data;
    const SHA = d.get('specific_heat_air').data;
    const psicro = Float64Array.from(Patm, (p, i) => (SHA[i] / 1000.0) * p / (LV[i] * cc.molecular_weight_ratio_water_to_dry_air));
    const diarios = {};
    const apuntar = (k, v) => { (diarios[k] = diarios[k] || []).push(v); };
    const Rn = d.get('net_radiation').data, VPD = d.get('vapour_pressure_deficit').data, TA = d.get('air_temperature').data;
    const RHO = d.get('density_air').data, RA = d.get('aerodynamic_resistance_canopy').data, GS = d.get('stomatal_conductance').data;
    const ip = c.intercept_parameters;
    const k = c.extinction_coefficient_global_radiation;
    const espesorM = Float64Array.from(this.espesorMm, (v) => v / 1000.0);
    const prof = Float64Array.from(ls.soil_layer_depths, Math.abs);
    for (let dia = 0; dia < dias; dia++) {
      const p = Float64Array.from({ length: n }, (_, i) => lluvia[i * dias + dia]);
      // interception
      const L = LAI.data;
      const maxCap = Float64Array.from(L, (l) => ((ip[0] + ip[1] * l) - ip[2] * (l * l)));
      for (let i = 0; i < maxCap.length; i++) if (!(L[i] > 0.1)) maxCap[i] = 0.001;
      const cdf = Float64Array.from(L, (l) => c.veg_density_param * l);
      const inter = new Float64Array(nl * n).fill(NaN);
      for (let i = 0; i < n; i++) inter[n + i] = maxCap[n + i] * (1 - exp(-cdf[n + i] * p[i] / maxCap[n + i]));
      for (let l = 2; l < nl; l++) {
        const acum = nansumaEje(inter.slice(0, l * n), [l, n], 0).data;
        for (let i = 0; i < n; i++) {
          const j = l * n + i;
          inter[j] = maxCap[j] * (1 - exp(-cdf[j] * (p[i] - acum[i]) / maxCap[j]));
        }
      }
      apuntar('interception', inter);
      // canopy evaporation
      const ce = new Float64Array(nl * n), rem = new Float64Array(nl * n);
      for (let l = 0; l < nl; l++) {
        for (let i = 0; i < n; i++) {
          const j = l * n + i;
          const delta = pendientePresionSat(TA[j], this.abiotic_constants.saturated_pressure_slope_parameters);
          const rs = cc.conductance_to_resistance_conversion_factor / GS[j];
          const pe = (delta * Rn[j] + RHO[j] * (SHA[j] / 1000) * (VPD[j] / RA[i]))
            / (LV[j] * (delta + psicro[j] * (1 + rs / RA[i])));
          const maxEv = pe * (1.0 - exp(-k * L[j])) * cc.seconds_to_day;
          const esc = maxEv > 0 ? npMin(inter[j] / maxEv, 1.0) : 0.0;
          const act = maxEv * esc;
          ce[j] = L[j] !== L[j] ? NaN : act;
          rem[j] = npMax(inter[j] - act, 0.0);
        }
      }
      apuntar('canopy_evaporation', ce);
      const ceros = new Float64Array(n);
      const nv = Float64Array.from({ length: n }, (_, i) => nieve[i * dias + dia]);
      swe = Float64Array.from(swe, (s, i) => npMax(s + (((nv[i] - 0) - 0) - 0), 0.0));
      apuntar('snowfall', nv); apuntar('snow_water_equivalent', swe);
      apuntar('temperature_driven_snowmelt', ceros); apuntar('sublimation_snow', ceros); apuntar('rain_driven_snowmelt', ceros);
      const entra = Float64Array.from(p, (v, i) => v + cond[i]);
      const ceS = nansumaEje(ce, [nl, n], 0).data, remS = nansumaEje(rem, [nl, n], 0).data;
      const ps = Float64Array.from(entra, (v, i) => v - npMin(ceS[i] + remS[i], v));
      if (ps.some((v) => v < 0)) throw new Error('Surface precipitation should not be negative!');
      apuntar('precipitation_surface', ps);
      const top = humedad.slice(0, n);
      const esc = Float64Array.from(ps, (v, i) => { const libre = topSat[i] - top[i]; return v > libre ? v - libre : 0; });
      apuntar('surface_runoff', esc);
      const by = Float64Array.from(ps, (v, i) => (v - esc[i]) * (c.bypass_flow_coefficient === 1 ? top[i] / topSat[i]
        : powArr(top[i] / topSat[i], c.bypass_flow_coefficient)));
      apuntar('bypass_flow', by);
      const smi = Float64Array.from(top, (v, i) => npClip(((v + ps[i]) - esc[i]) - by[i], 0, topSat[i]));
      const vol = Float64Array.from(smi, (v) => v / this.espesorMm[0]);
      // soil evaporation
      const se = new Float64Array(n), rsoil = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const libre = npClip(vol[i] - c.soil_moisture_residual, 0.0, c.soil_moisture_saturation - c.soil_moisture_residual);
        const barton = 1.8 * libre / (libre + 0.3);
        const alfa = barton > 1 ? 1 : barton;
        const esat = vpSat(Tsup[i]);
        const Rv = cc.gas_constant_water_vapour / 1000.0;
        const qsat = Rv * esat / (Psup[i] - (1 - Rv) * esat);
        const q = HRsup[i] * qsat / 100;
        const r = 1 / (vsup[i] * c.drag_coefficient_evaporation);
        rsoil[i] = r;
        if (this.corr.evaporacion_suelo) {
          // evaporacion_suelo: la fórmula de su comentario, alfa·q_sat - q (el código usa la
          // presión de vapor en kPa en vez de q_sat) y sin dividir un flujo de masa por el
          // calor latente: kg m-2 s-1 = mm/s
          const fl = npMax(RHO[sup * n + i] / r * (alfa * qsat - q), 0.0);
          se[i] = fl * exp(-k * laiSum[i]) * cc.seconds_to_day;
          continue;
        }
        let flujo = RHO[sup * n + i] / r * (alfa * esat - q);
        flujo = npMax(flujo, 0.0);
        se[i] = (flujo / LV[sup * n + i]) * exp(-k * laiSum[i]) * cc.seconds_to_day;
      }
      apuntar('soil_evaporation', se); apuntar('aerodynamic_resistance_soil', rsoil);
      const sme = Float64Array.from(humedad);
      for (let i = 0; i < n; i++) sme[i] = npClip(smi[i] - se[i], topRes[i], topSat[i]);
      // vertical flow
      const smv = Float64Array.from(sme, (v, j) => v / this.espesorMm[Math.floor(j / n)]);
      const forma = 1 - 1 / c.van_genuchten_nonlinearily_parameter;
      const ef = Float64Array.from(smv, (v) => (v - c.soil_moisture_residual) / (c.soil_moisture_saturation - c.soil_moisture_residual));
      const mp = potencialMatricial(ef, c.air_entry_potential_inverse, c.van_genuchten_nonlinearily_parameter, c.denominator_tolerance);
      for (let j = 0; j < ef.length; j++) ef[j] += c.denominator_tolerance; // el original lo suma en el sitio
      const Kef = Float64Array.from(ef, (e) => {
        const base = 1 - pow(1 - pow(e, 1 / forma), forma);
        return c.saturated_hydraulic_conductivity * powArr(e, c.pore_connectivity_parameter) * (base * base);
      });
      const grad = gradienteEje0(mp, ns, n, prof);
      const flujoT = Float64Array.from(Kef, (kk, j) => -kk * (grad[j] + 1) * cc.seconds_to_day);
      const disp = Float64Array.from(smv, (v, j) => (v - c.soil_moisture_residual) * espesorM[Math.floor(j / n)]);
      const fmin = new Float64Array(ns * n);
      for (let l = 0; l < ns - 1; l++) for (let i = 0; i < n; i++) {
        const a = flujoT[l * n + i], b = disp[(l + 1) * n + i];
        fmin[l * n + i] = a < b ? a : b;
      }
      const capGw = c.groundwater_capacity / 1000.0;
      for (let i = 0; i < n; i++) { const a = flujoT[(ns - 1) * n + i]; fmin[(ns - 1) * n + i] = a < capGw ? a : capGw; }
      const mpOut = Float64Array.from(mp, (v) => (v !== v ? -c.denominator_tolerance : v));
      const vf = Float64Array.from(fmin, (v) => { const r = Math.abs(v / 1000.0); return r !== r ? c.denominator_tolerance : r; });
      apuntar('matric_potential', Float64Array.from(mpOut, (v) => v * c.m_to_kpa));
      apuntar('vertical_flow', vf);
      const ss = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const dispo = npMax(sme[n + i] - transp[i], 0.0);
        const e = ef[n + i];
        ss[i] = npMax(c.stormflow_coefficient * powArr(e, c.saturation_exponent) * dispo, 0.0);
      }
      apuntar('subsurface_stormflow', ss);
      if (ns !== 2) throw new Error('update_soil_moisture: el original solo funciona con 2 capas de suelo');
      const nueva = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) {
        nueva[i] = npClip(sme[i] - vf[i], c.soil_moisture_residual * this.espesorMm[0], c.soil_moisture_saturation * this.espesorMm[0]);
        nueva[n + i] = npClip((((sme[n + i] + vf[i]) - vf[n + i]) - transp[i]) - ss[i],
          c.soil_moisture_residual * this.espesorMm[1], c.soil_moisture_saturation * this.espesorMm[1]);
      }
      apuntar('soil_moisture', nueva);
      // groundwater
      const subF = new Float64Array(n), base = new Float64Array(n), gwN = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) {
        const perc = c.max_percolation_rate_uzlz < gwSt[i] ? c.max_percolation_rate_uzlz : gwSt[i];
        const alto = ((gwSt[i] + vf[(ns - 1) * n + i]) + by[i]) - perc;
        subF[i] = npMax(0.0, alto / c.reservoir_const_upper_groundwater);
        const bajo = (gwSt[n + i] + perc) - c.groundwater_loss;
        base[i] = npMax(0.0, bajo / c.reservoir_const_lower_groundwater);
        gwN[i] = alto; gwN[n + i] = bajo;
      }
      apuntar('groundwater_storage', gwN); apuntar('subsurface_flow', subF); apuntar('baseflow', base);
      const supR = enrutar(this.drainage_map, esc, new Float64Array(n));
      apuntar('surface_runoff_routed_plus_local', supR);
      const subR0 = Float64Array.from(subF, (v, i) => v + base[i] + ss[i]);
      const subR = enrutar(this.drainage_map, new Float64Array(n), subR0);
      apuntar('subsurface_runoff_routed_plus_local', subR);
      const tot = Float64Array.from(supR, (v, i) => v + subR[i]);
      apuntar('total_runoff', tot);
      apuntar('river_discharge_rate', Float64Array.from(tot, (v) => v / cc.meters_to_mm / dias / cc.seconds_to_day * this.grid.cell_area));
      humedad = nueva;
      gwSt = gwN;
    }
    // agregación de los días
    const cel = (v) => new Arr(['cell_id'], [n], v, { cell_id: celdas(n) });
    const apilarCeldaDia = (lista) => {
      const a = new Float64Array(n * lista.length);
      lista.forEach((v, k) => { for (let i = 0; i < n; i++) a[i * lista.length + k] = v[i]; });
      return a;
    };
    const out = {};
    for (const v of ['precipitation_surface', 'snowfall', 'snow_water_equivalent', 'temperature_driven_snowmelt',
      'rain_driven_snowmelt', 'sublimation_snow', 'surface_runoff', 'soil_evaporation', 'subsurface_flow',
      'subsurface_stormflow', 'baseflow', 'bypass_flow', 'surface_runoff_routed_plus_local',
      'subsurface_runoff_routed_plus_local', 'total_runoff']) {
      out[v] = cel(nansumaEje(apilarCeldaDia(diarios[v]), [n, dias], 1).data);
    }
    for (const v of ['canopy_evaporation', 'interception']) {
      const a = ls.fromTemplate();
      const pila = new Float64Array(dias * nl * n);
      diarios[v].forEach((x, k) => pila.set(x, k * nl * n));
      const s = nansumaEje(pila, [dias, nl, n], 0).data;
      for (let j = 0; j < nl * n; j++) a.data[j] = LAI.data[j] !== LAI.data[j] ? NaN : s[j];
      out[v] = a;
    }
    for (const v of ['river_discharge_rate', 'aerodynamic_resistance_soil']) {
      out[v] = cel(mediaEje(apilarCeldaDia(diarios[v]), [n, dias], 1).data);
    }
    for (const v of ['soil_moisture', 'matric_potential', 'vertical_flow']) {
      const a = ls.fromTemplate();
      const pila = new Float64Array(dias * ns * n);
      diarios[v].forEach((x, k) => pila.set(x, k * ns * n));
      const m = mediaEje(pila, [dias, ns, n], 0).data;
      ls.int.all_soil.forEach((l, k) => a.data.set(m.subarray(k * n, (k + 1) * n), l * n));
      out[v] = a;
    }
    const gw = d.get('groundwater_storage');
    out.groundwater_storage = gw.conDatos(diarios.groundwater_storage[dias - 1]);
    d.addFromDict(out);
  }
}

function powArr(x, e) {
  if (e === -1) return 1.0 / x;
  if (e === 0) return 1.0;
  if (e === 0.5) return Math.sqrt(x);
  if (e === 1) return x;
  if (e === 2) return x * x;
  return pow(x, e);
}
