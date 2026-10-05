// Modelo abiótico (models/abiotic): abiotic_tools.py, energy_balance.py, wind.py,
// microclimate.py y abiotic_model.py. Balance de energía hora a hora con un método de la
// secante por celda y capa, acoplado a la temperatura del aire.
//
// Convención: arrays por capas como Float64Array de nl*n (fila = capa), por celda de n.

import { Arr } from '../core/arr.js?v=202610052338';
import { ModeloBase } from './base.js?v=202610052338';
import { exp, log, log10, pow, sin, cos } from '../num/ucrt.js?v=202610052338';
import { sumaPares, nansumaEje, nanmediaEje, nanmaxEje, nanminEje, nanmax } from '../num/np.js?v=202610052338';
import { ZERO_CELSIUS, npMax, npMin, npClip, nanACero, vpSat, calorEspecifico, densidadAire, calorLatente } from './comun.js?v=202610052338';
import { microclimaSimple, vpdReferencia, perfilDesdeReferencia, emisionOndaLarga } from './abiotic_simple.js?v=202610052338';
import { f64 } from '../num/f64.js?v=202610052338';

const esNan = (v) => v !== v;
const fin = Number.isFinite;

// ------------------------------------------------------------------ wind.py
function desplazamientoCero(h, lai, esc, tol) {
  return h.map((hh, i) => {
    const tiene = lai[i] > 0;
    const disp = tiene ? lai[i] : NaN;
    const s = Math.sqrt(npMax(esc * disp, 0.0));
    const seguro = s > tol ? s : NaN;
    const z = (1.0 - (1.0 - exp(-seguro)) / seguro) * hh;
    return tiene ? nanACero(z) : 0.0;
  });
}

function rugosidad(h, lai, zpd, c, k) {
  return h.map((hh, i) => {
    const tiene = lai[i] > 0;
    let r = Math.sqrt(npMax(c.substrate_surface_roughness_length + c.roughness_element_drag_coefficient * lai[i] / 2, c.denominator_tolerance));
    r = npMin(r, c.max_ratio_wind_to_friction_velocity);
    const seguro = npMax(r, c.denominator_tolerance);
    const hs = npMax(hh - zpd[i], c.denominator_tolerance);
    const z0i = hs * exp(-k / seguro - c.roughness_sublayer_depth_parameter);
    let z = npMax(z0i, c.substrate_surface_roughness_length);
    z = tiene ? z : c.min_roughness_length;
    z = (fin(z) && z > 0) ? z : c.min_roughness_length;
    return z < c.min_roughness_length ? c.min_roughness_length : z;
  });
}

function perfilViento(vref, href, alturas, z0, zpd, vmin, tol, filas, n) {
  const out = new Float64Array(filas * n);
  for (let r = 0; r < filas; r++) for (let i = 0; i < n; i++) {
    const wh = alturas[r * n + i];
    const suelo = npMax(z0[i] + zpd[i] + tol, zpd[i] + z0[i] + tol);
    const hh = npMax(wh, suelo);
    const num = npMax(hh - zpd[i], tol);
    const den = npMax((href[i] - zpd[i]) / z0[i], tol);
    const ws = vref[i] * log(num / z0[i]) / log(den);
    out[r * n + i] = esNan(wh) ? NaN : npMax(ws, vmin);
  }
  return out;
}

function mezclaDosel(mid, h, ustar, k, maxm, tol, filas, n) {
  const out = new Float64Array(filas * n);
  for (let r = 0; r < filas; r++) for (let i = 0; i < n; i++) {
    const m = nanACero(mid[r * n + i]);
    const zh = h[i] > 0 ? npClip(m / npMax(h[i], tol), 0.0, 1.0) : 0.0;
    const u = 1.0 - zh;
    let mc = k * npMax(ustar[i], 0.0) * m * (u * u);
    mc = npClip(mc, 0.0, maxm);
    out[r * n + i] = esNan(mid[r * n + i]) ? NaN : mc;
  }
  return out;
}

function siguienteValidoArriba(a, nl, n) {
  const out = new Int32Array(nl * n);
  const ult = new Int32Array(n).fill(-1);
  for (let l = 0; l < nl; l++) {
    for (let i = 0; i < n; i++) out[l * n + i] = ult[i];
    for (let i = 0; i < n; i++) if (!esNan(a[l * n + i])) ult[i] = l;
  }
  return out;
}

function siguienteValidoAbajo(a, nl, n) {
  const out = new Int32Array(nl * n);
  const ult = new Int32Array(n).fill(-1);
  for (let l = nl - 1; l >= 0; l--) {
    for (let i = 0; i < n; i++) out[l * n + i] = ult[i];
    for (let i = 0; i < n; i++) if (!esNan(a[l * n + i])) ult[i] = l;
  }
  return out;
}

function mezclarYVentilar(entrada, kmix, vent, lo, hi, sup, nl, n) {
  const cur = f64(entrada);
  const arriba = siguienteValidoArriba(cur, nl, n);
  const flujo = new Float64Array(nl * n);
  for (let l = 1; l < nl; l++) {
    const valido = new Uint8Array(n);
    let alguno = false;
    for (let i = 0; i < n; i++) { valido[i] = (arriba[l * n + i] >= 0 && fin(cur[l * n + i])) ? 1 : 0; if (valido[i]) alguno = true; }
    if (!alguno) continue;
    const src = Int32Array.from(valido, (v, i) => (v ? arriba[l * n + i] : 0));
    alguno = false;
    for (let i = 0; i < n; i++) { if (valido[i] && !fin(cur[src[i] * n + i])) valido[i] = 0; if (valido[i]) alguno = true; }
    if (!alguno) continue;
    const f = new Float64Array(n);
    for (let i = 0; i < n; i++) f[i] = valido[i] ? kmix[l * n + i] * (cur[src[i] * n + i] - cur[l * n + i]) : 0.0;
    for (let i = 0; i < n; i++) flujo[l * n + i] += f[i];
    for (let i = 0; i < n; i++) flujo[src[i] * n + i] += -f[i] * valido[i];
  }
  const existe = Uint8Array.from({ length: n }, (_, i) => (fin(cur[n + i]) ? 1 : 0));
  const conDosel = Uint8Array.from({ length: n }, (_, i) => (existe[i] && fin(cur[i]) ? 1 : 0));
  if (conDosel.some((v) => v)) {
    const tope = new Int32Array(n).fill(-1);
    for (let l = 1; l < sup; l++) for (let i = 0; i < n; i++) if (fin(cur[l * n + i]) && tope[i] === -1) tope[i] = l;
    for (let i = 0; i < n; i++) {
      if (!conDosel[i]) continue;
      const tc = tope[i];
      if (tc < 0) continue;
      const v = vent[i];
      const dif = cur[i] - cur[tc * n + i];
      flujo[i] -= v * dif;
      flujo[tc * n + i] += v * dif;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!existe[i] && fin(cur[i]) && fin(cur[sup * n + i])) {
      const dif = cur[i] - cur[sup * n + i];
      flujo[i] -= vent[i] * dif;
      flujo[sup * n + i] += vent[i] * dif;
    }
  }
  const res = f64(cur, (v, j) => v + flujo[j]);
  // clamp_variable_within_limits
  const nanMap = Uint8Array.from(res, (v) => (esNan(v) ? 1 : 0));
  let fuera = new Float64Array(n);
  for (let l = nl - 1; l >= 1; l--) {
    for (let i = 0; i < n; i++) {
      const j = l * n + i;
      const dentro = npClip(res[j], lo, hi[i]);
      fuera[i] += nanMap[j] ? 0 : res[j] - dentro;
      res[j] = dentro;
      res[(l - 1) * n + i] += fuera[i];
      fuera[i] = nanMap[(l - 1) * n + i] ? fuera[i] : 0;
    }
  }
  return res;
}

function resistenciaAerodinamica(wh, z0, zpd, ws, k, respaldo, tol) {
  const k2 = pow(k, 2);
  return wh.map((h, i) => {
    const valido = h > zpd[i] + z0[i];
    const sw = npMax(ws[i], tol);
    const sa = npMax((h - zpd[i]) / z0[i], tol);
    const lg = log(sa);
    const r = valido ? (lg * lg) / (k2 * sw) : respaldo;
    return esNan(h) ? NaN : r;
  });
}

// ------------------------------------------------------------------ energy_balance.py
function ondaLargaAbsorbida(dlw, LAI, Tcan, Tsuelo, c, sb, idx, nl, n) {
  const abs = new Float64Array(nl * n);
  const lai = LAI.map(nanACero);
  const esDosel = new Uint8Array(nl);
  for (const l of idx.canopy) esDosel[l] = 1;
  const veg = Uint8Array.from(LAI, (v) => (esNan(v) ? 0 : 1));
  for (let i = 0; i < n; i++) veg[idx.topsoil * n + i] = 0;
  const laiVeg = f64(lai, (v, j) => (veg[j] ? v : 0.0));
  const fondo = new Uint8Array(nl * n);
  for (let l = 0; l < nl; l++) if (esDosel[l]) for (let i = 0; i < n; i++) fondo[l * n + i] = esNan(LAI[l * n + i]) ? 0 : 1;
  const lwSuelo = new Float64Array(n), lwVeg = new Float64Array(n);
  const emit = f64(Tcan, (t) => emisionOndaLarga(t + ZERO_CELSIUS, c.leaf_emissivity, sb));
  for (let i = 0; i < n; i++) lwSuelo[i] = emisionOndaLarga(Tsuelo[idx.topsoil * n + i] + ZERO_CELSIUS, c.soil_emissivity, sb);
  const enmasc = f64(emit, (v, j) => (fondo[j] ? v : NaN));
  const media = nanmediaEje(enmasc, [nl, n], 0).data;
  for (let i = 0; i < n; i++) lwVeg[i] = fin(media[i]) ? media[i] : dlw[i];
  const cumArriba = new Float64Array(nl * n), cumAbajo = new Float64Array(nl * n);
  let run = new Float64Array(n);
  for (let l = 0; l < nl; l++) { cumArriba.set(run, l * n); run = run.map((v, i) => v + laiVeg[l * n + i]); }
  run = new Float64Array(n);
  for (let l = nl - 1; l >= 0; l--) { cumAbajo.set(run, l * n); run = run.map((v, i) => v + laiVeg[l * n + i]); }
  const totVeg = nansumaEje(laiVeg, [nl, n], 0).data; // np.sum (sin NaN aquí)
  const ext = c.extinction_coefficient_longwave;
  const fracciones = (a, b) => {
    let fs = npClip(exp(-ext * a), 0.0, 1.0);
    let fso = npClip(exp(-ext * b), 0.0, 1.0);
    let fv = npClip(1.0 - fs - fso, 0.0, 1.0);
    const t = fs + fso + fv;
    return t > 0 ? [fs / t, fso / t, fv / t] : [0, 0, 0];
  };
  for (let l = 0; l < nl; l++) {
    for (let i = 0; i < n; i++) {
      const j = l * n + i;
      if (l === idx.topsoil) {
        const fsky = exp(-ext * totVeg[i]);
        const fveg = 1.0 - fsky;
        abs[j] = c.soil_emissivity * (fsky * dlw[i] + fveg * lwVeg[i]);
      } else if (l === idx.surface) {
        const [a, b, v] = fracciones(cumArriba[j], cumAbajo[j]);
        const s = c.leaf_emissivity * (a * dlw[i] + b * lwSuelo[i] + v * lwVeg[i]);
        abs[j] = lai[j] > 0 ? s : 0.0;
      } else if (esDosel[l]) {
        const [a, b, v] = fracciones(cumArriba[j], cumAbajo[j]);
        const s = c.leaf_emissivity * (a * dlw[i] + b * lwSuelo[i] + v * lwVeg[i]);
        abs[j] = lai[j] > 0 ? s : 0.0;
      }
    }
  }
  return abs;
}

// calculate_energy_balance_residual (arrays de nl*n; ra puede ser por celda o por capa)
function balance(Tc, Ta, et, sw, lw, cp, rho, ra, raPorCelda, lv, eps, sb, n, flujos) {
  const N = Tc.length;
  const lwe = new Float64Array(N), H = new Float64Array(N), LE = new Float64Array(N), res = new Float64Array(N);
  const nr = flujos ? new Float64Array(N) : null;
  for (let j = 0; j < N; j++) {
    const r = raPorCelda ? ra[j % n] : ra[j];
    lwe[j] = emisionOndaLarga(Tc[j] + ZERO_CELSIUS, eps, sb);
    H[j] = rho[j] * cp[j] / r * (Tc[j] - Ta[j]);
    LE[j] = et[j] * lv[j] / 3600;
    if (flujos) nr[j] = sw[j] + lw[j] - lwe[j];
    res[j] = sw[j] + lw[j] - lwe[j] - H[j] - LE[j];
  }
  if (!flujos) return res;
  return { longwave_emission: lwe, sensible_heat_flux: H.map((v) => -v), latent_heat_flux: LE.map((v) => -v),
    energy_balance_residual: res, net_radiation: nr };
}

function secante(residuo, guess, c) {
  let prev = f64(guess);
  let cur = prev.map((v) => v + c.small_perturbation_second_guess_secant_solver);
  let rPrev = residuo(prev), rCur = residuo(cur);
  const tol = c.denominator_tolerance;
  for (let it = 0; it < c.maxiter_secant_solver; it++) {
    const sig = new Float64Array(cur.length);
    for (let j = 0; j < cur.length; j++) {
      const den = rCur[j] - rPrev[j];
      const seguro = Math.abs(den) < tol ? (den < 0 || Object.is(den, -0) ? -tol : tol) : den;
      const d = esNan(seguro) ? NaN : seguro;
      sig[j] = cur[j] - rCur[j] * (cur[j] - prev[j]) / d;
    }
    const rSig = residuo(sig);
    const act = sig.map((v, j) => Math.abs(v - cur[j]));
    if (nanmax(act) < c.convergence_tolerance_secant_solver) return sig;
    prev = cur; cur = sig; rPrev = rCur; rCur = rSig;
  }
  return cur;
}

// ------------------------------------------------------------------ modelo
export class AbioticModel extends ModeloBase {
  static fromConfig(sim) { return new AbioticModel(sim, sim.config.abiotic); }

  constructor(sim, cfg) {
    super(sim, 'abiotic', cfg.static);
    this.latitude = cfg.latitude;
    this.model_constants = cfg.constants;
    this.bounds = cfg.bounds;
    const d = this.data, ls = this.layer_structure;
    const v = vpdReferencia(d.serie('air_temperature_ref'), d.serie('relative_humidity_ref'));
    d.set('vapour_pressure_deficit_ref', v.vapour_pressure_deficit);
    d.set('vapour_pressure_ref', v.vapour_pressure);
    d.addFromDict(microclimaSimple(d, ls, 0, this.model_constants, this.core_constants, this.bounds));
    const base = ls.fromTemplate();
    const n = this.grid.n_cells;
    for (const l of ls.int.flux_layers) for (let i = 0; i < n; i++) base.data[l * n + i] = this.model_constants.initial_flux_value;
    for (const nom of ['sensible_heat_flux', 'latent_heat_flux', 'longwave_emission', 'absorbed_longwave_radiation']) d.set(nom, base.copy());
    d.set('ground_heat_flux', new Arr(['cell_id'], [n], new Float64Array(n).fill(this.model_constants.initial_flux_value)));
  }

  _update(t) {
    const d = this.data, ls = this.layer_structure, c = this.model_constants, cc = this.core_constants;
    const n = this.grid.n_cells, nl = ls.n_layers;
    const dia0 = this.model_timing.update_datestamps[t];
    const fecha = new Date(dia0 * 86400000);
    const mes = ((fecha.getUTCFullYear() - 1970) * 12 + fecha.getUTCMonth()) % 12 + 1;
    const diasF = this.model_timing.update_interval_seconds / cc.seconds_to_day;
    const dias = Math.trunc(Math.floor(diasF / 1));
    const intervalo = this.model_timing.update_interval_seconds;
    const idx = { above: ls.int.above, canopy: ls.int.filled_canopy, surface: ls.index_surface_scalar,
      atm: ls.int.filled_atmosphere, soil: ls.int.all_soil, topsoil: ls.index_topsoil_scalar };
    const sb = cc.stefan_boltzmann_constant;
    const fila = (a, l) => a.subarray(l * n, (l + 1) * n);
    // initialize_state (copias)
    const st = {
      air_temperature: f64(d.get('air_temperature').data),
      canopy_temperature: f64(d.get('canopy_temperature').data),
      soil_temperature: f64(d.get('soil_temperature').data),
      relative_humidity: f64(d.get('relative_humidity').data),
      aerodynamic_resistance_soil: d.get('aerodynamic_resistance_soil').data,
    };
    // prepare_static_inputs
    const LH = d.get('layer_heights').data, LAI = d.get('leaf_area_index').data;
    const alturaDosel = f64(fila(LH, 1), nanACero);
    const subLai = new Float64Array(idx.canopy.length * n);
    idx.canopy.forEach((l, k) => subLai.set(fila(LAI, l), k * n));
    const laiSum = nansumaEje(subLai, [idx.canopy.length, n], 0).data.map(nanACero);
    const ce = d.get('canopy_evaporation').data, tr = d.get('transpiration').data;
    const et = f64(ce, (v, j) => v + tr[j]);
    const smv = new Float64Array(nl * n).fill(NaN);
    const SM = d.get('soil_moisture').data;
    idx.soil.forEach((l, k) => { for (let i = 0; i < n; i++) smv[l * n + i] = SM[l * n + i] / cc.meters_to_mm / ls.soil_layer_thickness[k]; });
    const P = perfilDesdeReferencia(ls, d.get('air_temperature'), d.serie('atmospheric_pressure_ref'), t, n).data;
    // calculate_atmospheric_layer_geometry
    const alt = f64(LH);
    for (const l of idx.canopy) for (let i = 0; i < n; i++) { const j = l * n + i; alt[j] = alt[j] <= c.minimum_mixing_depth ? c.minimum_mixing_depth : alt[j]; }
    const altC = f64(alt, (v, j) => (esNan(LH[j]) ? NaN : v));
    const esp = new Float64Array(nl * n).fill(NaN);
    {
      const sobre = f64(altC, (v) => (v > 0 ? v : NaN));
      const abajo = siguienteValidoAbajo(sobre, nl, n);
      for (let j = 0; j < nl * n; j++) {
        const valido = altC[j] > 0 && !esNan(altC[j]);
        if (!valido) continue;
        const b = abajo[j];
        esp[j] = b >= 0 ? Math.abs(altC[j] - altC[b * n + (j % n)]) : Math.abs(altC[j]);
      }
    }
    const medio = f64(altC, (v, j) => v - esp[j] / 2);
    const dlw = d.corte('downward_longwave_radiation', t).data;
    const lwAbs = ondaLargaAbsorbida(dlw, LAI, d.get('canopy_temperature').data, d.get('soil_temperature').data, c, sb, idx, nl, n);
    const area = this.grid.cell_area;
    // calculate_wind_profiles
    const k = cc.von_karmans_constant;
    const zpd = desplazamientoCero(alturaDosel, laiSum, c.zero_plane_scaling_parameter, c.denominator_tolerance);
    const z0 = rugosidad(alturaDosel, laiSum, zpd, c, k);
    const href = alturaDosel.map((h) => h + c.wind_reference_height);
    const vref = d.corte('wind_speed_ref', t).data.map(Math.abs);
    const nAtm = idx.atm.length;
    const altAtm = new Float64Array(nAtm * n), medAtm = new Float64Array(nAtm * n);
    idx.atm.forEach((l, r) => { altAtm.set(fila(alt, l), r * n); medAtm.set(fila(medio, l), r * n); });
    const vperf = perfilViento(vref, href, altAtm, z0, zpd, c.min_windspeed_below_canopy, c.denominator_tolerance, nAtm, n);
    const viento = new Float64Array(nl * n).fill(NaN);
    idx.atm.forEach((l, r) => viento.set(vperf.subarray(r * n, (r + 1) * n), l * n));
    const ustar = vref.map((v, i) => k * v / log(npMax((href[i] - zpd[i]) / z0[i], c.denominator_tolerance)));
    const mperf = mezclaDosel(medAtm.map(nanACero), alturaDosel, ustar, k, c.max_mixing_coefficient, c.denominator_tolerance, nAtm, n);
    const mezcla = new Float64Array(nl * n);
    idx.atm.forEach((l, r) => mezcla.set(mperf.subarray(r * n, (r + 1) * n), l * n));
    for (let j = 0; j < mezcla.length; j++) mezcla[j] = nanACero(mezcla[j]);
    const zpdN = zpd.map(nanACero), z0N = z0.map(nanACero);
    // generate_hourly_forcing
    const dsr = d.corte('downward_shortwave_radiation', t).data;
    const SW = d.get('shortwave_absorption').data;
    const totSW = nansumaEje(SW, [nl, n], 0).data;
    const swTot = f64(SW, (v, j) => {
      const i = j % n;
      const w = v / (totSW[i] === 0.0 ? NaN : totSW[i]);
      const nonPar = dsr[i] * (1 - c.par_fraction_of_shortwave_radiation);
      return v * (1 - c.fraction_par_used_for_photosynthesis) + c.leaf_absorptance_non_par * nonPar * w;
    });
    const Tref = d.corte('air_temperature_ref', t).data, RHref = d.corte('relative_humidity_ref', t).data;
    const amp = d.corte('diurnal_temperature_range_ref', t).data;
    const PI = Math.PI;
    const aireH = new Float64Array(24 * n);
    for (let h = 0; h < 24; h++) {
      const s = sin(2 * PI * (h - 8) / 24);
      for (let i = 0; i < n; i++) aireH[h * n + i] = Tref[i] + amp[i] * s;
    }
    let dl = 12 + 4 * cos((mes - 1) * PI / 6) * cos(this.latitude * (PI / 180.0));
    dl = npClip(dl, 6.0, 18.0);
    const amanecer = 12 - dl / 2, ocaso = 12 + dl / 2;
    const hf = new Float64Array(24);
    for (let h = 0; h < 24; h++) if (amanecer <= h && h <= ocaso) hf[h] = sin(PI * (h - amanecer) / dl);
    const shf = 0.0 + sumaPares(hf, 0, 24, 1);
    if (shf > 0) { const s2 = 0.0 + sumaPares(hf, 0, 24, 1); for (let h = 0; h < 24; h++) hf[h] /= s2; }
    const ea = Tref.map((tt, i) => RHref[i] / 100.0 * vpSat(tt));
    const rhH = f64(aireH, (v, j) => npClip(100.0 * ea[j % n] / vpSat(v), 0.0, 100.0));
    const se = d.get('soil_evaporation').data;
    // registro horario
    const meta = this.sim.meta.modelos.abiotic;
    const estaticas = new Set(['absorbed_longwave_radiation', 'wind_speed']);
    const porHora = meta.vars_updated.filter((v) => !estaticas.has(v));
    const reg = {};
    for (const v of porHora) reg[v] = new Float64Array(24 * d.get(v).data.length).fill(NaN);
    const uvr = c.understorey_ventilation_rate;
    let rhoUlt;
    for (let h = 0; h < 24; h++) {
      // update_forcing_boundary_conditions
      st.air_temperature.set(aireH.subarray(h * n, (h + 1) * n), 0);
      st.relative_humidity.set(rhH.subarray(h * n, (h + 1) * n), 0);
      const swh = f64(swTot, (v) => v * hf[h]);
      const eth = f64(et, (v) => (esNan(v) ? NaN : (v / dias) * hf[h]));
      const seh = f64(se, (v) => (esNan(v) ? NaN : (v / dias) * hf[h]));
      // calculate_thermodynamics
      const esDia = swh.some((v) => nanACero(v) !== 0);
      const TA = st.air_temperature;
      const rho = f64(TA, (v, j) => densidadAire(v, P[j], cc.specific_gas_constant_dry_air, ZERO_CELSIUS));
      const cp = f64(TA, calorEspecifico);
      const lv = f64(TA, (v) => calorLatente(v, ZERO_CELSIUS, c.latent_heat_vap_equ_factors) * 1000);
      let raC, raS;
      if (esDia) {
        const wh = f64(fila(alt, 1), (v) => (esNan(v) ? c.wind_reference_height : v));
        const ws = f64({ length: n }, (_, i) => (esNan(viento[n + i]) ? viento[idx.above[0] * n + i] : viento[n + i]));
        raC = resistenciaAerodinamica(wh, z0N, zpdN, ws, k, c.aerodynamic_resistance_canopy_day, c.denominator_tolerance);
        raS = st.aerodynamic_resistance_soil;
      } else {
        raC = new Float64Array(n).fill(c.aerodynamic_resistance_canopy_night);
        raS = new Float64Array(n).fill(c.aerodynamic_resistance_soil_night);
      }
      const vent = f64({ length: n }, (_, i) => {
        const ch = alturaDosel[i] + zpdN[i];
        const sinDosel = ch < esp[idx.surface * n + i];
        const v = 1.0 / npMax(raC[i] * ch, c.denominator_tolerance);
        const r = sinDosel ? uvr : v;
        return esNan(r) ? uvr : r;
      });
      st.aerodynamic_resistance_canopy = raC; st.aerodynamic_resistance_soil = raS;
      // solve_canopy_temperature_with_air_coupling
      let aire = f64(TA);
      let dosel = f64(st.canopy_temperature);
      const aireArriba = f64(fila(TA, idx.above[0]));
      let dtInt = c.integration_time_interval;
      const res = (tc) => balance(tc, aire, eth, swh, lwAbs, cp, rho, raC, true, lv, c.leaf_emissivity, sb, n, false);
      for (let it = 0; it < c.maxiter_air_secant_solver; it++) {
        const nuevoDosel = secante(res, dosel, c);
        const fl = balance(nuevoDosel, aire, eth, swh, lwAbs, cp, rho, raC, true, lv, c.leaf_emissivity, sb, n, true);
        const nuevoAire = f64(aire, (v, j) => v + (-fl.sensible_heat_flux[j]) * dtInt / (rho[j] * cp[j] * esp[j]));
        const cambioD = nanmax(nuevoDosel.map((v, j) => Math.abs(v - dosel[j])));
        const cambioA = nanmax(nuevoAire.map((v, j) => Math.abs(v - aire[j])));
        if (cambioD > c.max_temperature_change || cambioA > c.max_temperature_change) {
          dtInt *= 1 - c.integration_time_modifier;
          continue;
        }
        dosel = nuevoDosel;
        aire = nuevoAire;
        aire.set(aireArriba, idx.above[0] * n);
        if (cambioD < c.min_temperature_change && cambioA < c.min_temperature_change) {
          dtInt = Math.min(dtInt * (1 + c.integration_time_modifier), c.integration_time_interval);
        }
        if (pyMax(cambioD, cambioA) < 5) break;
      }
      const ff = balance(dosel, aire, eth, swh, lwAbs, cp, rho, raC, true, lv, c.leaf_emissivity, sb, n, true);
      st.canopy_temperature = dosel;
      st.air_temperature = aire;
      Object.assign(st, ff);
      // calculate_soil_fluxes
      const top = idx.topsoil, s = idx.surface;
      const ghf = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const lws = emisionOndaLarga(st.soil_temperature[top * n + i] + ZERO_CELSIUS, c.soil_emissivity, sb);
        const Hs = rho[s * n + i] * cp[s * n + i] / raS[i] * (st.soil_temperature[top * n + i] - aire[s * n + i]);
        const LEs = seh[i] * lv[s * n + i] / intervalo;
        ghf[i] = swh[top * n + i] - lws - LEs - Hs + lwAbs[top * n + i];
        st.sensible_heat_flux[top * n + i] = -Hs;
        st.latent_heat_flux[top * n + i] = -LEs;
        st.longwave_emission[top * n + i] = lws;
        st.net_radiation[top * n + i] = swh[top * n + i] - lws + lwAbs[top * n + i];
      }
      st.ground_heat_flux = ghf;
      // update_soil_temperature
      const ns = idx.soil.length;
      const Ts = new Float64Array(ns * n), sm = new Float64Array(ns * n);
      idx.soil.forEach((l, kk) => { Ts.set(fila(st.soil_temperature, l), kk * n); sm.set(fila(smv, l), kk * n); });
      const vhc = sm.map((m) => c.bulk_density_soil * c.specific_heat_capacity_soil + m * cc.density_water * cc.specific_heat_capacity_water);
      const kcond = sm.map((m) => {
        const theta = npMax(m, 0.0);
        const phi = npClip(c.soil_porosity, 1e-08, 1.0);
        const satu = npClip(theta / phi, 0.0, 1.0);
        let ke = 0;
        if (satu > 0.1) ke = log10(satu) + 1.0;
        ke = npClip(ke, 0.0, 1.0);
        return c.soil_thermal_conductivity_dry + ke * (c.soil_thermal_conductivity_saturated - c.soil_thermal_conductivity_dry);
      });
      const difu = kcond.map((kk, j) => kk / vhc[j]);
      const nuevo = f64(Ts);
      const th = ls.soil_layer_thickness;
      for (let l = 1; l < ns - 1; l++) for (let i = 0; i < n; i++) {
        nuevo[l * n + i] = Ts[l * n + i] + 3600 / pow(th[l], 2) * difu[l * n + i]
          * (Ts[(l + 1) * n + i] - 2.0 * Ts[l * n + i] + Ts[(l - 1) * n + i]);
      }
      for (let i = 0; i < n; i++) nuevo[i] = Ts[i] + 3600 / (vhc[i] * th[0]) * ghf[i];
      for (let i = 0; i < n; i++) {
        const u = (ns - 1) * n + i;
        nuevo[u] = Ts[u] + 3600 / pow(th[ns - 1], 2) * difu[u] * (Ts[(ns - 2) * n + i] - Ts[u]);
      }
      if (!nuevo.every(fin)) throw new Error('Soil temperature is not finite');
      idx.soil.forEach((l, kk) => st.soil_temperature.set(nuevo.subarray(kk * n, (kk + 1) * n), l * n));
      // update_atmospheric_humidity
      const mwr = cc.molecular_weight_ratio_water_to_dry_air;
      const esat = f64(aire, (v) => vpSat(v));
      const q = f64(esat, (es, j) => { const e = st.relative_humidity[j] / 100.0 * es; return mwr * e / (P[j] - (1 - mwr) * e); });
      const masa = f64(esp, (v, j) => v * area * rho[j]);
      const anad = f64(eth, (v) => 0 + v * cc.mm_to_kg / intervalo * area * intervalo);
      for (let i = 0; i < n; i++) anad[s * n + i] += seh[i] * cc.mm_to_kg / intervalo * area * intervalo;
      const qAn = f64(q, (v, j) => (v * masa[j] + anad[j]) / masa[j]);
      qAn.set(q.subarray(0, n), 0);
      const mrs = f64(esat, (es, j) => mwr * es / (P[j] - es));
      const maxq = mrs.map((m) => m / (1 + m));
      const subMax = new Float64Array(nAtm * n);
      idx.atm.forEach((l, r) => subMax.set(fila(maxq, l), r * n));
      const mediaMax = nanmaxEje(subMax, [nAtm, n], 0).data;
      const qMix = mezclarYVentilar(qAn, mezcla, vent, c.min_specific_humidity, mediaMax, s, nl, n);
      const daf = c.dry_air_factor, tol = c.denominator_tolerance;
      const rhN = new Float64Array(nl * n), vpN = new Float64Array(nl * n), vpdN = new Float64Array(nl * n),
        qN = new Float64Array(nl * n), condN = new Float64Array(nl * n);
      for (let j = 0; j < nl * n; j++) {
        const nanIn = esNan(qMix[j]);
        const qs = (mwr + daf * esat[j]) / npMax(P[j] - esat[j], tol);
        const def = qs - qMix[j];
        const exceso = def > 0 ? 0.0 : def;
        const cond = -exceso * masa[j] / area;
        const qu = qMix[j] + exceso;
        const vp = qu * P[j] / (mwr + daf * qu);
        let rh = vp / npMax(esat[j], tol) * 100;
        rh = npMin(rh, this.bounds.relative_humidity[1]);
        const vpd = npMax(esat[j] - vp, this.bounds.vapour_pressure_deficit[0]);
        const limpio = (x) => (nanIn ? NaN : nanACero(x));
        rhN[j] = limpio(rh); vpN[j] = limpio(vp); vpdN[j] = limpio(vpd); qN[j] = limpio(qu); condN[j] = limpio(cond);
      }
      st.relative_humidity = rhN; st.vapour_pressure = vpN; st.vapour_pressure_deficit = vpdN;
      st.specific_humidity = qN; st.condensation = condN;
      st.density_air = rho; st.specific_heat_air = cp; st.latent_heat_vapourisation = lv;
      for (const v of porHora) {
        if (!(v in st)) continue;
        const val = st[v];
        reg[v].set(val, h * val.length);
      }
      rhoUlt = rho;
    }
    // build_output_from_record
    const out = {};
    const tpl = (datos) => { const a = ls.fromTemplate(); for (const l of idx.atm) a.data.set(fila(datos, l), l * n); return a; };
    out.absorbed_longwave_radiation = tpl(lwAbs);
    out.wind_speed = tpl(viento);
    for (const v of porHora) {
      const tam = reg[v].length / 24;
      let valores;
      if (v === 'diurnal_temperature_range') {
        const comb = new Float64Array(48 * nl * n);
        comb.set(reg.air_temperature, 0); comb.set(reg.soil_temperature, 24 * nl * n);
        const mn = nanminEje(comb, [48, nl * n], 0).data, mx = nanmaxEje(comb, [48, nl * n], 0).data;
        valores = mx.map((x, j) => x - mn[j]);
      } else {
        valores = nanmediaEje(reg[v], [24, tam], 0).data;
      }
      const dims = tam === n ? ['cell_id'] : ['layers', 'cell_id'];
      out[v] = new Arr(dims, tam === n ? [n] : [nl, n], valores);
    }
    out.latent_heat_vapourisation.data = out.latent_heat_vapourisation.data.map((x) => x / 1000.0);
    void rhoUlt;
    d.addFromDict(out);
  }
}

// max() de Python con dos floats: devuelve el primero salvo que el segundo sea mayor
const pyMax = (a, b) => (b > a ? b : a);
