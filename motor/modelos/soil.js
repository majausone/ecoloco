// Modelo de suelo (models/soil): env_factors.py, microbial_groups.py, uptake.py, pools.py
// y soil_model.py. Las ecuaciones de los pools se integran con RK45 (scipy) reproducido.

import { Arr } from '../core/arr.js?v=202610032115';
import { ModeloBase } from './base.js?v=202610032115';
import { exp, log10, pow } from '../num/ucrt.js?v=202610032115';
import { dotVecMat, potArr } from '../num/np.js?v=202610032115';
import { sumaPy, sumaNp } from '../num/py.js?v=202610032115';
import { solveIvpRK45 } from '../num/ode.js?v=202610032115';
import { ZERO_CELSIUS, npMin } from './comun.js?v=202610032115';
import { mediaCapasActivas, impactoPotencialHidrico, elem, apilarCNP } from './litter.js?v=202610032115';

const R_GAS = 8.31446261815324; // scipy.constants.gas_constant
const V = (n, f) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = f(i); return o; };

// ------------------------------------------------------------------ env_factors
function efectoTemperatura(T, ea, tref) {
  const tk = T.map((t) => t + ZERO_CELSIUS);
  const trk = tref + ZERO_CELSIUS;
  const k = -ea / R_GAS;
  return tk.map((x) => exp(k * (1 / x - 1 / trk)));
}

function idoneidadPH(ph, max, min, alto, bajo) {
  return ph.map((p) => {
    let f = NaN;
    if (p < min) f = 0;
    if (p > max) f = 0;
    if (bajo <= p && p <= alto) f = 1;
    if (min <= p && p < bajo) f = (p - min) / (bajo - min);
    if (alto < p && p <= max) f = (max - p) / (max - alto);
    return f;
  });
}

function factoresAmbientales(wp, ph, arcilla, c) {
  return {
    water: impactoPotencialHidrico(wp, c.soil_microbe_water_potential_halt, c.soil_microbe_water_potential_optimum,
      c.microbial_water_response_curvature),
    pH: idoneidadPH(ph, c.max_pH_microbes, c.min_pH_microbes, c.highest_optimal_pH_microbes, c.lowest_optimal_pH_microbes),
    clay_saturation: arcilla.map((x) => c.base_soil_protection + c.soil_protection_with_clay * x),
  };
}

function humedadTotalSimulada(sm, ls) {
  const w = ls.soil_layer_active_thickness.map((a, i) => a / ls.soil_layer_thickness[i]);
  const idx = ls.int.all_soil, n = sm.shape[1];
  const M = new Float64Array(idx.length * n);
  idx.forEach((l, k) => M.set(sm.data.subarray(l * n, (l + 1) * n), k * n));
  return dotVecMat(w, M, idx.length, n);
}

function salidaAgua(vf, ls) {
  const w = ls.soil_layer_active_thickness.map((a, i) => a / ls.soil_layer_thickness[i]);
  const nz = [];
  w.forEach((v, i) => { if (v !== 0) nz.push(i); });
  const capas = nz.length === 1 ? [nz[0], nz[0] + 1] : [nz[nz.length - 2], nz[nz.length - 1]];
  const wl = w[capas[1]];
  const l0 = capas[0] + ls.index_topsoil_scalar, l1 = capas[1] + ls.index_topsoil_scalar;
  const n = vf.shape[1];
  return V(n, (i) => wl * vf.data[l1 * n + i] + (1 - wl) * vf.data[l0 * n + i]);
}

const expit = (x) => 1 / (1 + exp(-x));

// ------------------------------------------------------------------ microbial_groups
export function construirGrupos(cfg) {
  const enzimas = {};
  for (const e of cfg.enzyme_class_definition) enzimas[`${e.source}_${e.substrate}`] = e;
  const grupos = {};
  for (const g of cfg.microbial_group_definition) {
    const prod = g.enzyme_production;
    const clase = (s) => enzimas[`${g.taxonomic_group}_${s}`];
    const invN = sumaPy(Object.entries(prod).map(([s, a]) => a / clase(s).c_n_ratio));
    const invP = sumaPy(Object.entries(prod).map(([s, a]) => a / clase(s).c_p_ratio));
    const total = 1 + sumaPy(Object.values(prod)) + g.reproductive_allocation;
    grupos[g.name] = {
      ...g,
      synthesis_nutrient_ratios: {
        nitrogen: total / ((1 + g.reproductive_allocation) / g.c_n_ratio + invN),
        phosphorus: total / ((1 + g.reproductive_allocation) / g.c_p_ratio + invP),
      },
      sustratos: Object.entries(prod).filter(([, p]) => p > 0.0).map(([s]) => s),
    };
  }
  return { grupos, enzimas };
}

// ------------------------------------------------------------------ uptake
function captacionMaxima(pools, mic, env, T, g) {
  const tfr = efectoTemperatura(T, g.activation_energy_uptake_rate, g.reference_temperature);
  const tfs = efectoTemperatura(T, g.activation_energy_uptake_saturation, g.reference_temperature);
  const n = T.length;
  const alcanzable = (pool, maxr, half) => V(n, (i) => {
    const rc = maxr * tfr[i] * env.water[i] * env.pH[i];
    const sc = half * tfs[i];
    const up = rc * (pool[i] * mic[i] / (pool[i] + sc));
    return (mic[i] >= 0.0 && pool[i] >= 0.0) ? up : 0.0;
  });
  const C = alcanzable(pools.lmwc, g.max_uptake_rate_labile_C, g.half_sat_labile_C_uptake);
  const amm = alcanzable(pools.amm, g.max_uptake_rate_ammonium, g.half_sat_ammonium_uptake);
  const nit = alcanzable(pools.nit, g.max_uptake_rate_nitrate, g.half_sat_nitrate_uptake);
  const ip = alcanzable(pools.lab, g.max_uptake_rate_labile_p, g.half_sat_labile_p_uptake);
  const on = V(n, (i) => (pools.don[i] > 0 && pools.lmwc[i] > 0) ? pools.don[i] * C[i] / pools.lmwc[i] : 0);
  const op = V(n, (i) => (pools.dop[i] > 0 && pools.lmwc[i] > 0) ? pools.dop[i] * C[i] / pools.lmwc[i] : 0);
  return { carbon: C, organic_nitrogen: on, organic_phosphorus: op, ammonium: amm, nitrate: nit, inorganic_phosphorus: ip };
}

function gananciaCarbono(mx, ext, cue, g) {
  return V(cue.length, (i) => {
    const cmax = ext ? ext[i] * cue[i] : mx.carbon[i] * cue[i];
    const ng = (mx.organic_nitrogen[i] + mx.ammonium[i] + mx.nitrate[i]) * (1 - g.symbiote_nitrogen_uptake_fraction);
    const pg = (mx.organic_phosphorus[i] + mx.inorganic_phosphorus[i]) * (1 - g.symbiote_phosphorus_uptake_fraction);
    const nl = g.synthesis_nutrient_ratios.nitrogen * ng;
    const pl = g.synthesis_nutrient_ratios.phosphorus * pg;
    return npMin(npMin(cmax, nl), pl);
  });
}

function tasasCaptacion(pools, mic, ext, env, T, c, g) {
  const n = T.length;
  const cue = T.map((t) => expit(c.reference_cue_logit + c.logit_cue_with_temperature * (t - c.cue_reference_temp)));
  const mx = captacionMaxima(pools, mic, env, T, g);
  const gan = gananciaCarbono(mx, ext, cue, g);
  let cons;
  const propAmm = V(n, (i) => ((mx.ammonium[i] > 0) || (mx.nitrate[i] > 0)) ? mx.ammonium[i] / (mx.ammonium[i] + mx.nitrate[i]) : 0);
  if (ext) {
    const nd = V(n, (i) => gan[i] / g.synthesis_nutrient_ratios.nitrogen / (1 - g.symbiote_nitrogen_uptake_fraction));
    const pd = V(n, (i) => gan[i] / g.synthesis_nutrient_ratios.phosphorus / (1 - g.symbiote_phosphorus_uptake_fraction));
    const ind = V(n, (i) => (nd[i] >= mx.ammonium[i] + mx.nitrate[i]) ? mx.ammonium[i] + mx.nitrate[i] : nd[i]);
    const ipd = V(n, (i) => (pd[i] >= mx.inorganic_phosphorus[i]) ? mx.inorganic_phosphorus[i] : pd[i]);
    cons = {
      organic_nitrogen: V(n, (i) => nd[i] - ind[i]), organic_phosphorus: V(n, (i) => pd[i] - ipd[i]),
      carbon: V(n, (i) => -(ext[i] - gan[i] / cue[i])),
      ammonium: V(n, (i) => ind[i] * propAmm[i]), nitrate: V(n, (i) => ind[i] * (1 - propAmm[i])),
      inorganic_phosphorus: ipd,
    };
  } else {
    const lim = V(n, (i) => (mx.carbon[i] > 0 ? gan[i] / (mx.carbon[i] * cue[i]) : 1));
    const nInorg = V(n, (i) => gan[i] / g.synthesis_nutrient_ratios.nitrogen - mx.organic_nitrogen[i]);
    const pInorg = V(n, (i) => gan[i] / g.synthesis_nutrient_ratios.phosphorus - mx.organic_phosphorus[i]);
    const onr = V(n, (i) => (nInorg[i] < 0 ? -nInorg[i] * (1 - lim[i]) : 0.0));
    const opr = V(n, (i) => (pInorg[i] < 0 ? -pInorg[i] * (1 - lim[i]) : 0.0));
    const inc = V(n, (i) => (nInorg[i] >= 0 ? nInorg[i] : nInorg[i] * lim[i]));
    const ipc = V(n, (i) => (pInorg[i] >= 0 ? pInorg[i] : pInorg[i] * lim[i]));
    const a2n = V(n, (i) => (inc[i] > 0 ? propAmm[i] : c.ammonium_mineralisation_proportion));
    cons = {
      organic_nitrogen: V(n, (i) => mx.organic_nitrogen[i] - onr[i]),
      organic_phosphorus: V(n, (i) => mx.organic_phosphorus[i] - opr[i]),
      carbon: V(n, (i) => gan[i] / cue[i]),
      ammonium: V(n, (i) => inc[i] * a2n[i]), nitrate: V(n, (i) => inc[i] * (1 - a2n[i])),
      inorganic_phosphorus: ipc,
    };
  }
  const div = 1 + sumaPy(Object.values(g.enzyme_production)) + g.reproductive_allocation;
  return { crecimiento: gan.map((v) => v / div), cons };
}

// ------------------------------------------------------------------ pools
const SUSTRATOS = ['pom', 'maom'];

function cambiosMicrobianos(P, T, env, c, grupos, enzimas, sumin) {
  const n = T.length;
  const base = { lmwc: P.soil_cnp_pool_lmwc_carbon, don: P.soil_cnp_pool_lmwc_nitrogen, dop: P.soil_cnp_pool_lmwc_phosphorus,
    amm: P.soil_n_pool_ammonium, nit: P.soil_n_pool_nitrate, lab: P.soil_p_pool_labile };
  const bac = tasasCaptacion(base, P.soil_c_pool_bacteria, null, env, T, c, grupos.bacteria);
  const sap = tasasCaptacion(base, P.soil_c_pool_saprotrophic_fungi, null, env, T, c, grupos.saprotrophic_fungi);
  const amf = tasasCaptacion(base, P.soil_c_pool_arbuscular_mycorrhiza, sumin.arbuscular_mycorrhiza, env, T, c, grupos.arbuscular_mycorrhiza);
  const emf = tasasCaptacion(base, P.soil_c_pool_ectomycorrhiza, sumin.ectomycorrhiza, env, T, c, grupos.ectomycorrhiza);
  const perdidas = {};
  for (const g of Object.values(grupos)) {
    const tf = efectoTemperatura(T, g.activation_energy_turnover, g.reference_temperature);
    const pool = P[`soil_c_pool_${g.name}`];
    perdidas[g.name] = V(n, (i) => (pool[i] >= 0.0 ? g.turnover_rate * tf[i] * pool[i] : 0.0));
  }
  const crec = {
    bacteria: bac.crecimiento, saprotrophic_fungi: sap.crecimiento,
    arbuscular_mycorrhiza: amf.crecimiento.map((v) => (v > 0 ? v : 0)),
    ectomycorrhiza: emf.crecimiento.map((v) => (v > 0 ? v : 0)),
  };
  const prodEnz = {};
  for (const g of Object.values(grupos)) {
    for (const s of g.sustratos) {
      const clase = `${g.taxonomic_group}_${s}`;
      const gr = crec[g.name].map((v) => (v > 0 ? v : 0));
      const aporte = gr.map((v) => v * g.enzyme_production[s]);
      prodEnz[clase] = prodEnz[clase] ? prodEnz[clase].map((v, i) => v + aporte[i]) : aporte;
    }
  }
  const enz = {};
  for (const src of ['bacteria', 'fungi']) {
    for (const s of SUSTRATOS) {
      const pool = P[`soil_enzyme_${s}_${src}`];
      const tasa = enzimas[`${src}_${s}`].turnover_rate;
      const turn = pool.map((v) => (v > 0 ? tasa * v : 0));
      enz[`net_change_${s}_${src}`] = prodEnz[`${src}_${s}`].map((v, i) => v - turn[i]);
      enz[`denaturation_${s}_${src}`] = turn;
    }
  }
  const fruto = { carbon: new Float64Array(n), nitrogen: new Float64Array(n), phosphorus: new Float64Array(n) };
  for (const g of Object.values(grupos)) {
    if (g.taxonomic_group !== 'fungi') continue;
    const gr = crec[g.name].map((v) => (v > 0 ? v : 0));
    fruto.carbon = fruto.carbon.map((v, i) => v + gr[i] * g.reproductive_allocation);
    fruto.nitrogen = fruto.nitrogen.map((v, i) => v + gr[i] * g.reproductive_allocation / g.c_n_ratio);
    fruto.phosphorus = fruto.phosphorus.map((v, i) => v + gr[i] * g.reproductive_allocation / g.c_p_ratio);
  }
  const nombres = Object.keys(grupos);
  const necN = V(n, (i) => sumaNp(nombres.map((g) => perdidas[g][i] / grupos[g].c_n_ratio))
    + sumaNp(['bacteria', 'fungi'].flatMap((g) => ['maom', 'pom'].map((s) => enz[`denaturation_${s}_${g}`][i] / enzimas[`${g}_${s}`].c_n_ratio))));
  const necP = V(n, (i) => sumaNp(nombres.map((g) => perdidas[g][i] / grupos[g].c_p_ratio))
    + sumaNp(['bacteria', 'fungi'].flatMap((g) => ['maom', 'pom'].map((s) => enz[`denaturation_${s}_${g}`][i] / enzimas[`${g}_${s}`].c_p_ratio))));
  const u = [bac.cons, sap.cons, amf.cons, emf.cons];
  const s4 = (k) => V(n, (i) => u[0][k][i] + u[1][k][i] + u[2][k][i] + u[3][k][i]);
  const ga = grupos.arbuscular_mycorrhiza, ge = grupos.ectomycorrhiza;
  return {
    lmwc_uptake: s4('carbon'), don_uptake: s4('organic_nitrogen'), ammonium_change: s4('ammonium'),
    nitrate_change: s4('nitrate'), dop_uptake: s4('organic_phosphorus'), labile_p_change: s4('inorganic_phosphorus'),
    bacteria_change: V(n, (i) => bac.crecimiento[i] - perdidas.bacteria[i]),
    saprotrophic_fungi_change: V(n, (i) => sap.crecimiento[i] - perdidas.saprotrophic_fungi[i]),
    arbuscular_mycorrhiza_change: V(n, (i) => amf.crecimiento[i] - perdidas.arbuscular_mycorrhiza[i]),
    ectomycorrhiza_change: V(n, (i) => emf.crecimiento[i] - perdidas.ectomycorrhiza[i]),
    pom_enzyme_bacteria_change: enz.net_change_pom_bacteria, maom_enzyme_bacteria_change: enz.net_change_maom_bacteria,
    pom_enzyme_fungi_change: enz.net_change_pom_fungi, maom_enzyme_fungi_change: enz.net_change_maom_fungi,
    necromass_generation: V(n, (i) => enz.denaturation_pom_bacteria[i] + enz.denaturation_maom_bacteria[i]
      + enz.denaturation_pom_fungi[i] + enz.denaturation_maom_fungi[i] + perdidas.bacteria[i]
      + perdidas.saprotrophic_fungi[i] + perdidas.arbuscular_mycorrhiza[i] + perdidas.ectomycorrhiza[i]),
    necromass_n_flow: necN, necromass_p_flow: necP,
    fruiting_body_production_carbon: fruto.carbon, fruiting_body_production_nitrogen: fruto.nitrogen,
    fruiting_body_production_phosphorus: fruto.phosphorus,
    arbuscular_mycorrhiza_n_supply: V(n, (i) => (amf.cons.organic_nitrogen[i] + amf.cons.ammonium[i] + amf.cons.nitrate[i]) * ga.symbiote_nitrogen_uptake_fraction),
    arbuscular_mycorrhiza_p_supply: V(n, (i) => (amf.cons.organic_phosphorus[i] + amf.cons.inorganic_phosphorus[i]) * ga.symbiote_phosphorus_uptake_fraction),
    ectomycorrhiza_n_supply: V(n, (i) => (emf.cons.organic_nitrogen[i] + emf.cons.ammonium[i] + emf.cons.nitrate[i]) * ge.symbiote_nitrogen_uptake_fraction),
    ectomycorrhiza_p_supply: V(n, (i) => (emf.cons.organic_phosphorus[i] + emf.cons.inorganic_phosphorus[i]) * ge.symbiote_phosphorus_uptake_fraction),
  };
}

function descomposicionEnzimatica(pool, enzima, T, env, ec) {
  const tfr = efectoTemperatura(T, ec.activation_energy_rate, ec.reference_temperature);
  const tfs = efectoTemperatura(T, ec.activation_energy_saturation, ec.reference_temperature);
  return V(T.length, (i) => {
    const rc = ec.maximum_rate * tfr[i] * env.water[i] * env.pH[i];
    const sc = ec.half_saturation_constant * tfs[i] * env.clay_saturation[i];
    return (enzima[i] > 0.0 && pool[i] > 0.0) ? rc * enzima[i] * pool[i] / (sc + pool[i]) : 0.0;
  });
}

const divDonde = (a, b, cond, n) => V(n, (i) => (cond(i) ? a(i) / b(i) : 0));

// SoilPools.calculate_all_pool_updates: devuelve el vector de derivadas en el orden de claves
function derivadas(P, ctx) {
  const { data, ls, c, cc, grupos, enzimas, sat, res, espesorTop, ffd, claves, n } = ctx;
  const prof = cc.microbial_simulation_depth;
  const pv = (a) => a.map((v) => v / prof);
  const wp = mediaCapasActivas(data.get('matric_potential'), ls);
  const T = mediaCapasActivas(data.get('soil_temperature'), ls);
  const sm = humedadTotalSimulada(data.get('soil_moisture'), ls);
  const efs = sm.map((v) => ((v / (espesorTop * 1000.0)) - res) / (sat - res));
  const tot = pv(data.get('plant_symbiote_carbon_supply').data);
  const myco = tot.map((v) => v * (1 - c.nitrogen_fixer_supply_fraction));
  const sumin = {
    nitrogen_fixers: tot.map((v) => v * c.nitrogen_fixer_supply_fraction),
    ectomycorrhiza: myco.map((v) => v * c.ectomycorrhiza_supply_fraction),
    arbuscular_mycorrhiza: myco.map((v) => v * (1 - c.ectomycorrhiza_supply_fraction)),
  };
  const env = factoresAmbientales(wp, data.get('pH').data, data.get('clay_fraction').data, c);
  const mc = cambiosMicrobianos(P, T, env, c, grupos, enzimas, sumin);
  const enzMed = {};
  for (const s of SUSTRATOS) {
    const pool = P[`soil_cnp_pool_${s}_carbon`];
    const r = ['bacteria', 'fungi'].map((src) => descomposicionEnzimatica(pool, P[`soil_enzyme_${s}_${src}`], T, env, enzimas[`${src}_${s}`]));
    enzMed[`${s}_to_lmwc`] = V(n, (i) => (0.0 + r[0][i]) + r[1][i]);
  }
  // eliminación por agua
  const salida = salidaAgua(data.get('vertical_flow'), ls);
  const rem = (sol, coef) => V(n, (i) => (sol[i] >= 0 ? coef * sol[i] * salida[i] / sm[i] : 0));
  const lmwc = P.soil_cnp_pool_lmwc_carbon, don = P.soil_cnp_pool_lmwc_nitrogen, dop = P.soil_cnp_pool_lmwc_phosphorus;
  const remL = rem(lmwc, c.solubility_coefficient_lmwc);
  const remA = rem(P.soil_n_pool_ammonium, c.solubility_coefficient_ammonium);
  const remN = rem(P.soil_n_pool_nitrate, c.solubility_coefficient_nitrate);
  const remP = rem(P.soil_p_pool_labile, c.solubility_coefficient_labile_p);
  const remDon = V(n, (i) => remL[i] / (lmwc[i] / don[i]));
  const remDop = V(n, (i) => remL[i] / (lmwc[i] / dop[i]));
  const maom = P.soil_cnp_pool_maom_carbon, nec = P.soil_cnp_pool_necromass_carbon;
  const desorc = maom.map((v) => (v > 0.0 ? c.maom_desorption_rate * v : 0.0));
  const necDec = nec.map((v) => (v > 0 ? c.necromass_decay_rate * v : 0));
  const necSorc = nec.map((v) => (v >= 0 ? c.necromass_sorption_rate * v : 0));
  const lmwcSorc = lmwc.map((v) => (v >= 0 ? c.lmwc_sorption_rate * v : 0));
  const lm = data.get('litter_mineralisation_rate_cnp');
  const lmC = elem(lm, 'C'), lmN = elem(lm, 'N'), lmP = elem(lm, 'P');
  const fx = {
    lmwc: lmC.map((v) => c.litter_leaching_fraction_carbon * v), pom: lmC.map((v) => (1 - c.litter_leaching_fraction_carbon) * v),
    particulate_n: lmN.map((v) => (1 - c.litter_leaching_fraction_nitrogen) * v),
    particulate_p: lmP.map((v) => (1 - c.litter_leaching_fraction_phosphorus) * v),
  };
  const nDis = lmN.map((v) => c.litter_leaching_fraction_nitrogen * v);
  const pDis = lmP.map((v) => c.litter_leaching_fraction_phosphorus * v);
  fx.don = nDis.map((v) => v * c.organic_proportion_litter_nitrogen_leaching);
  fx.ammonium = nDis.map((v) => v * (1 - c.organic_proportion_litter_nitrogen_leaching));
  fx.dop = pDis.map((v) => v * c.organic_proportion_litter_phosphorus_leaching);
  fx.labile_p = pDis.map((v) => v * (1 - c.organic_proportion_litter_phosphorus_leaching));
  const pomC = P.soil_cnp_pool_pom_carbon, pomN = P.soil_cnp_pool_pom_nitrogen, pomP = P.soil_cnp_pool_pom_phosphorus;
  const pomNmin = divDonde((i) => enzMed.pom_to_lmwc[i] * pomN[i], (i) => pomC[i], (i) => pomC[i] > 0 && pomN[i] > 0, n);
  const pomPmin = divDonde((i) => enzMed.pom_to_lmwc[i] * pomP[i], (i) => pomC[i], (i) => pomC[i] > 0 && pomP[i] > 0, n);
  const exc = data.get('decomposed_excrement_cnp').data, car = data.get('decomposed_carcasses_cnp').data,
    ffdec = data.get('fallen_fruit_decay_cnp').data;
  const directo = (k) => V(n, (i) => (exc[i * 3 + k] + car[i * 3 + k] + ffdec[i * 3 + k]) / prof);
  const necN = P.soil_cnp_pool_necromass_nitrogen, necP = P.soil_cnp_pool_necromass_phosphorus;
  const necOut = {
    decay_nitrogen: divDonde((i) => necDec[i] * necN[i], (i) => nec[i], (i) => nec[i] > 0 && necN[i] > 0, n),
    sorption_nitrogen: divDonde((i) => necSorc[i] * necN[i], (i) => nec[i], (i) => nec[i] > 0 && necN[i] > 0, n),
    decay_phosphorus: divDonde((i) => necDec[i] * necP[i], (i) => nec[i], (i) => nec[i] > 0 && necP[i] > 0, n),
    sorption_phosphorus: divDonde((i) => necSorc[i] * necP[i], (i) => nec[i], (i) => nec[i] > 0 && necP[i] > 0, n),
  };
  const maomN = P.soil_cnp_pool_maom_nitrogen, maomP = P.soil_cnp_pool_maom_phosphorus;
  const tr = {
    nitrogen: V(n, (i) => {
      const loss = (maom[i] > 0 && maomN[i] > 0) ? (enzMed.maom_to_lmwc[i] + desorc[i]) * maomN[i] / maom[i] : 0;
      const gain = (lmwc[i] > 0 && don[i] > 0) ? lmwcSorc[i] * don[i] / lmwc[i] : 0;
      return loss - gain;
    }),
    phosphorus: V(n, (i) => {
      const loss = (maom[i] > 0 && maomP[i] > 0) ? (enzMed.maom_to_lmwc[i] + desorc[i]) * maomP[i] / maom[i] : 0;
      const gain = (lmwc[i] > 0 && dop[i] > 0) ? lmwcSorc[i] * dop[i] / lmwc[i] : 0;
      return loss - gain;
    }),
  };
  const amm = P.soil_n_pool_ammonium, nit = P.soil_n_pool_nitrate;
  const nitrif = V(n, (i) => {
    const tk = T[i] + ZERO_CELSIUS;
    const tf = pow((c.nitrification_maximum_temperature - tk) / (c.nitrification_maximum_temperature - c.nitrification_optimum_temperature), c.nitrification_thermal_sensitivity)
      * exp(c.nitrification_thermal_sensitivity * ((tk - c.nitrification_optimum_temperature) / (c.nitrification_maximum_temperature - c.nitrification_optimum_temperature)));
    const mf = efs[i] * (1 - efs[i]) / 0.25;
    return amm[i] >= 0.0 ? c.nitrification_rate_constant * tf * mf * amm[i] : 0.0;
  });
  const denit = V(n, (i) => {
    const tk = T[i] + ZERO_CELSIUS;
    const tf = tk <= c.denitrification_minimum_temperature ? 0
      : c.denitrification_infinite_temperature_factor * exp(-c.denitrification_thermal_sensitivity / (tk - c.denitrification_minimum_temperature));
    const mf = efs[i] * efs[i];
    return nit[i] >= 0.0 ? c.denitrification_rate_constant * tf * mf * nit[i] : 0.0;
  });
  const volat = amm.map((v) => (v >= 0.0 ? c.ammonia_volatilisation_rate_constant * v : 0.0));
  const fijSimb = V(n, (i) => {
    const t = T[i];
    const coste = t < 0.0 ? Infinity : c.nitrogen_fixation_cost_zero_celcius + c.nitrogen_fixation_cost_infinite_temp_offset
      * (exp(c.nitrogen_fixation_cost_thermal_sensitivity * t * (1 - t / c.nitrogen_fixation_cost_equality_temperature)) - 1);
    return sumin.nitrogen_fixers[i] / coste;
  });
  const fijVol = c.free_living_N_fixation_reference_rate / prof;
  const fijLibre = T.map((t) => fijVol * pow(c.free_living_N_fixation_q10_coefficent, ((t + ZERO_CELSIUS) - c.free_living_N_fixation_reference_temp) / 10.0));
  const priP = P.soil_p_pool_primary.map((v) => c.primary_phosphorus_breakdown_rate * v);
  const lab = P.soil_p_pool_labile, sec = P.soil_p_pool_secondary;
  const netSec = V(n, (i) => (lab[i] >= 0.0 ? c.labile_phosphorus_sorption_rate * lab[i] : 0.0) - c.secondary_phosphorus_breakdown_rate * sec[i]);
  const rootEx = pv(data.get('root_carbohydrate_exudation').data);
  const dC = directo(0), dN = directo(1), dP = directo(2);
  const plA = pv(data.get('plant_ammonium_uptake').data), suA = pv(data.get('subcanopy_ammonium_uptake').data);
  const plN = pv(data.get('plant_nitrate_uptake').data), suN = pv(data.get('subcanopy_nitrate_uptake').data);
  const plP = pv(data.get('plant_phosphorus_uptake').data), suP = pv(data.get('subcanopy_phosphorus_uptake').data);
  const pomCons = data.get('animal_pom_consumption_cnp');
  const anim = (k) => data.get(k).data;
  const depA = c.ammonium_deposition_rate / prof, depP = c.phosphorus_deposition_rate / prof;
  const D = {};
  D.soil_cnp_pool_lmwc_carbon = V(n, (i) => fx.lmwc[i] + rootEx[i] + enzMed.pom_to_lmwc[i] + enzMed.maom_to_lmwc[i] + desorc[i]
    + necDec[i] + ffd.C[i] + dC[i] - mc.lmwc_uptake[i] - lmwcSorc[i] - remL[i]);
  D.soil_cnp_pool_maom_carbon = V(n, (i) => necSorc[i] + lmwcSorc[i] - enzMed.maom_to_lmwc[i] - desorc[i]);
  for (const g of ['bacteria', 'saprotrophic_fungi', 'arbuscular_mycorrhiza', 'ectomycorrhiza']) {
    const cons = anim(`animal_${g}_consumption`);
    D[`soil_c_pool_${g}`] = V(n, (i) => mc[`${g}_change`][i] - cons[i]);
  }
  D.soil_cnp_pool_pom_carbon = V(n, (i) => fx.pom[i] - enzMed.pom_to_lmwc[i] - pomCons.data[i * 3]);
  D.soil_cnp_pool_necromass_carbon = V(n, (i) => mc.necromass_generation[i] - necDec[i] - necSorc[i]);
  D.soil_enzyme_pom_bacteria = mc.pom_enzyme_bacteria_change;
  D.soil_enzyme_maom_bacteria = mc.maom_enzyme_bacteria_change;
  D.soil_enzyme_pom_fungi = mc.pom_enzyme_fungi_change;
  D.soil_enzyme_maom_fungi = mc.maom_enzyme_fungi_change;
  D.cnp_fungal_fruiting_body_production_carbon = mc.fruiting_body_production_carbon;
  D.cnp_fungal_fruiting_body_production_nitrogen = mc.fruiting_body_production_nitrogen;
  D.cnp_fungal_fruiting_body_production_phosphorus = mc.fruiting_body_production_phosphorus;
  D.new_amf_n_supply = mc.arbuscular_mycorrhiza_n_supply;
  D.new_amf_p_supply = mc.arbuscular_mycorrhiza_p_supply;
  D.new_emf_n_supply = mc.ectomycorrhiza_n_supply;
  D.new_emf_p_supply = mc.ectomycorrhiza_p_supply;
  D.soil_cnp_pool_lmwc_nitrogen = V(n, (i) => fx.don[i] + pomNmin[i] + necOut.decay_nitrogen[i] + tr.nitrogen[i] + ffd.N[i]
    + dN[i] - mc.don_uptake[i] - remDon[i]);
  D.soil_cnp_pool_pom_nitrogen = V(n, (i) => fx.particulate_n[i] - pomNmin[i] - pomCons.data[i * 3 + 1]);
  D.soil_cnp_pool_necromass_nitrogen = V(n, (i) => mc.necromass_n_flow[i] - necOut.decay_nitrogen[i] - necOut.sorption_nitrogen[i]);
  D.soil_cnp_pool_maom_nitrogen = V(n, (i) => necOut.sorption_nitrogen[i] - tr.nitrogen[i]);
  D.soil_n_pool_ammonium = V(n, (i) => depA + fx.ammonium[i] + fijSimb[i] + fijLibre[i] - mc.ammonium_change[i] - plA[i]
    - suA[i] - remA[i] - volat[i] - nitrif[i]);
  D.soil_n_pool_nitrate = V(n, (i) => nitrif[i] - denit[i] - mc.nitrate_change[i] - plN[i] - suN[i] - remN[i]);
  D.soil_cnp_pool_lmwc_phosphorus = V(n, (i) => fx.dop[i] + pomPmin[i] + necOut.decay_phosphorus[i] + tr.phosphorus[i]
    + ffd.P[i] + dP[i] - mc.dop_uptake[i] - remDop[i]);
  D.soil_cnp_pool_pom_phosphorus = V(n, (i) => fx.particulate_p[i] - pomPmin[i] - pomCons.data[i * 3 + 2]);
  D.soil_cnp_pool_necromass_phosphorus = V(n, (i) => mc.necromass_p_flow[i] - necOut.decay_phosphorus[i] - necOut.sorption_phosphorus[i]);
  D.soil_cnp_pool_maom_phosphorus = V(n, (i) => necOut.sorption_phosphorus[i] - tr.phosphorus[i]);
  D.soil_p_pool_primary = V(n, (i) => c.tectonic_uplift_rate_phosphorus - priP[i]);
  D.soil_p_pool_secondary = netSec;
  D.soil_p_pool_labile = V(n, (i) => fx.labile_p[i] + depP + priP[i] - mc.labile_p_change[i] - plP[i] - suP[i]
    - netSec[i] - remP[i]);
  const out = new Float64Array(claves.length * n);
  claves.forEach((k, j) => {
    if (!D[k]) throw new Error(`soil: falta la derivada de ${k}`);
    out.set(D[k], j * n);
  });
  return out;
}

// ------------------------------------------------------------------ modelo
const REFRESCADAS = ['cnp_fungal_fruiting_body_production', 'new_amf_n_supply', 'new_amf_p_supply', 'new_emf_n_supply', 'new_emf_p_supply'];

export class SoilModel extends ModeloBase {
  static fromConfig(sim) {
    const cfg = sim.config.soil;
    const hc = sim.config.hydrology ? sim.config.hydrology.constants : { soil_moisture_saturation: 0.51, soil_moisture_residual: 0.175 };
    return new SoilModel(sim, cfg, hc);
  }

  constructor(sim, cfg, hc) {
    super(sim, 'soil', cfg.static);
    this.model_constants = cfg.constants;
    // setas_por_m2: los animales apuntan las setas comidas en kg y el suelo las resta de una
    // densidad (kg/m²) sin dividir por el área (la hojarasca sí divide). Apagado por defecto.
    this.corr = { setas_por_m2: false, ...(cfg.correcciones || {}) };
    const { grupos, enzimas } = construirGrupos(cfg);
    this.grupos = grupos;
    this.enzimas = enzimas;
    this.sat = hc.soil_moisture_saturation;
    this.res = hc.soil_moisture_residual;
    this.meta = sim.meta.modelos.soil;
    this.data.addFromDict(this.disueltos());
    this.data.addFromDict(this.suministroInicial());
    for (const v of this.meta.vars_updated) {
      if (this.data.get(v).data.some((x) => x < 0.0)) throw new Error('Initial soil pools contain at least one negative value!');
    }
  }

  disueltos() {
    const d = this.data, c = this.model_constants;
    const f = (nom, coef) => { const a = d.get(nom); return a.conDatos(a.data.map((v) => (v >= 0.0 ? coef * v : 0.0))); };
    return {
      dissolved_nitrate: f('soil_n_pool_nitrate', c.solubility_coefficient_nitrate),
      dissolved_ammonium: f('soil_n_pool_ammonium', c.solubility_coefficient_ammonium),
      dissolved_phosphorus: f('soil_p_pool_labile', c.solubility_coefficient_labile_p),
    };
  }

  suministroInicial() {
    const d = this.data, ls = this.layer_structure, c = this.model_constants, n = this.grid.n_cells;
    const T = mediaCapasActivas(d.get('soil_temperature'), ls);
    const wp = mediaCapasActivas(d.get('matric_potential'), ls);
    const env = factoresAmbientales(wp, d.get('pH').data, d.get('clay_fraction').data, c);
    const lm = d.get('soil_cnp_pool_lmwc');
    const pools = { lmwc: elem(lm, 'C'), don: elem(lm, 'N'), dop: elem(lm, 'P'), amm: d.get('soil_n_pool_ammonium').data,
      nit: d.get('soil_n_pool_nitrate').data, lab: d.get('soil_p_pool_labile').data };
    const estimar = (mic, g) => {
      const mx = captacionMaxima(pools, mic, env, T, g);
      return [V(n, (i) => (mx.organic_nitrogen[i] + mx.ammonium[i] + mx.nitrate[i]) * g.symbiote_nitrogen_uptake_fraction),
        V(n, (i) => (mx.organic_phosphorus[i] + mx.inorganic_phosphorus[i]) * g.symbiote_phosphorus_uptake_fraction)];
    };
    const [eN, eP] = estimar(d.get('soil_c_pool_ectomycorrhiza').data, this.grupos.ectomycorrhiza);
    const [aN, aP] = estimar(d.get('soil_c_pool_arbuscular_mycorrhiza').data, this.grupos.arbuscular_mycorrhiza);
    const dias = this.model_timing.update_interval_days;
    const total = (v) => new Arr(['cell_id'], [n], v.map((x) => (x >= 0.0
      ? x * this.core_constants.microbial_simulation_depth * this.grid.cell_area * dias : 0)), { cell_id: Array.from({ length: n }, (_, i) => i) });
    return { ectomycorrhizal_n_supply: total(eN), ectomycorrhizal_p_supply: total(eP),
      arbuscular_mycorrhizal_n_supply: total(aN), arbuscular_mycorrhizal_p_supply: total(aP) };
  }

  _update() {
    const d = this.data, c = this.model_constants, cc = this.core_constants, n = this.grid.n_cells;
    const dias = this.model_timing.update_interval_days;
    const prof = cc.microbial_simulation_depth;
    const ffb = d.get('fungal_fruiting_bodies_cnp'), ffbc = d.get('fungal_fruiting_bodies_consumed_cnp');
    const areaSetas = this.corr.setas_por_m2 ? this.grid.cell_area : 1;
    const post = ffb.data.map((v, i) => v - ffbc.data[i] / areaSetas);
    const fdec = 1 - exp(-c.fungal_fruiting_bodies_decay_rate * dias);
    const decay = post.map((v) => fdec * v);
    d.set('fungal_fruiting_bodies_cnp', ffb.conDatos(post.map((v, i) => v - decay[i])));
    const tasa = decay.map((v) => v / (dias * prof));
    const ffd = { C: V(n, (i) => tasa[i * 3]), N: V(n, (i) => tasa[i * 3 + 1]), P: V(n, (i) => tasa[i * 3 + 2]) };
    // integrate
    const fuera = ['fungal_fruiting_bodies_cnp', ...d.nombres().filter((k) => this.meta.vars_populated_by_init.includes(k))];
    const act = d.nombres().filter((k) => this.meta.vars_updated.includes(k) && !fuera.includes(k));
    const tripletes = act.filter((k) => k.startsWith('soil_cnp_'));
    const sueltas = act.filter((k) => !k.startsWith('soil_cnp_'));
    const refTrip = REFRESCADAS.filter((k) => k.startsWith('cnp_'));
    const refSuel = REFRESCADAS.filter((k) => !k.startsWith('cnp_'));
    const ELEMS = { C: 'carbon', N: 'nitrogen', P: 'phosphorus' };
    const y0 = [];
    for (const e of Object.keys(ELEMS)) for (const k of tripletes) y0.push(...elem(d.get(k), e));
    for (const k of sueltas) y0.push(...d.get(k).data);
    y0.push(...new Float64Array((refTrip.length * 3 + refSuel.length) * n));
    const claves = [
      ...Object.values(ELEMS).flatMap((e) => tripletes.map((k) => `${k}_${e}`)), ...sueltas,
      ...Object.values(ELEMS).flatMap((e) => refTrip.map((k) => `${k}_${e}`)), ...refSuel,
    ];
    for (const v of this.sim.meta.modelos.soil.vars_required_for_update) {
      if (this._invalida(v)) throw new Error(`Soil model integration cannot proceed because the following variables contain invalid values (e.g. NaN or Inf): ${v}`);
    }
    const ctx = { data: d, ls: this.layer_structure, c, cc, grupos: this.grupos, enzimas: this.enzimas, sat: this.sat,
      res: this.res, espesorTop: this.layer_structure.soil_layer_thickness[0], ffd, claves, n };
    const fun = (t, y) => {
      const P = {};
      claves.forEach((k, j) => { P[k] = y.subarray(j * n, (j + 1) * n); });
      return derivadas(P, ctx);
    };
    const sol = solveIvpRK45(fun, 0.0, dias, Float64Array.from(y0));
    this.ultimaIntegracion = { pasos: sol.pasos, nfev: sol.nfev };
    const trozo = (k) => sol.y.slice(claves.indexOf(k) * n, (claves.indexOf(k) + 1) * n);
    const nuevos = {};
    const cel = (v) => new Arr(['cell_id'], [n], v, { cell_id: Array.from({ length: n }, (_, i) => i) });
    for (const k of claves) if (!k.startsWith('soil_cnp_') && !k.startsWith('cnp_')) nuevos[k] = cel(trozo(k));
    for (const k of [...tripletes, ...refTrip]) nuevos[k] = apilarCNP(trozo(`${k}_carbon`), trozo(`${k}_nitrogen`), trozo(`${k}_phosphorus`), n);
    for (const [k, v] of Object.entries(nuevos)) if (!REFRESCADAS.includes(k)) d.set(k, v);
    const ffb2 = d.get('fungal_fruiting_bodies_cnp');
    const prod = nuevos.cnp_fungal_fruiting_body_production;
    d.set('fungal_fruiting_bodies_cnp', ffb2.conDatos(ffb2.data.map((v, i) => v + prod.data[i] / prof)));
    d.addFromDict(this.disueltos());
    const area = this.grid.cell_area;
    for (const nut of ['n', 'p']) {
      for (const [ab, full] of [['amf', 'arbuscular_mycorrhizal'], ['emf', 'ectomycorrhizal']]) {
        d.set(`${full}_${nut}_supply`, nuevos[`new_${ab}_${nut}_supply`].conDatos(nuevos[`new_${ab}_${nut}_supply`].data.map((v) => v * area * prof)));
      }
    }
  }

  _invalida(v) {
    const a = this.data.get(v), ls = this.layer_structure, n = this.grid.n_cells;
    let filas = null;
    if (v === 'air_temperature') filas = ls.int.surface;
    else if (a.dims.includes('layers')) filas = ls.int.all_soil;
    if (!filas) return a.data.some((x) => !Number.isFinite(x));
    return filas.some((l) => a.data.subarray(l * n, (l + 1) * n).some((x) => !Number.isFinite(x)));
  }
}
