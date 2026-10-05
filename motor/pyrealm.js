// Lo que usa el Virtual Ecosystem de pyrealm 3.0.0rc4, reproducido operación a operación:
//  * P-model (PModelEnvironment + PModel con prentice14 / temperature / wang17 / simple):
//    solo hacen falta lue, iwue, tc y patm.
//  * densidad del agua (jones_harris_eq6) y convert_water_moles_to_mm.
//  * demografía: Flora, StemAllometry, StemAllocation, GrowthIncrements, Canopy (PPA) con
//    el brentq de scipy (Zeros/brentq.c) para las alturas de cierre de capa.

import { exp, log, pow } from './num/ucrt.js?v=202610052338';
import { sumaPares } from './num/np.js?v=202610052338';
import { f64 } from './num/f64.js?v=202610052338';

const K_R = 8.3145, K_CO = 209476.0, K_PO = 101325.0, K_TO = 298.15, K_C_MOLMASS = 12.0107,
  K_CTOK = 273.15, K_WATER_MOLMASS = 18.01258;
const TK_REF = 298.15;
const GS = { dha: 37830.0, gs25_0: 4.332 };
const KMM = { dhac: 79430.0, dhao: 36380.0, kc25: 39.97, ko25: 27480.0 };
const BETA_C3 = 146.0, KPHIO_C3 = [0.352, 0.022, -0.00034], MAX_PHI0 = 0.125, WANG17_C = 0.41;
const VOGEL = [0.02939, 507.88, 149.3];
const RHO_JH = [999.84847, 0.06337563, -0.008523829, 6.943248e-05, -3.821216e-07];

export const pyrealmConst = { k_c_molmass: K_C_MOLMASS };

function horner(x, cf) {
  let y = 0;
  for (let i = cf.length - 1; i >= 0; i--) y = x * y + cf[i];
  return y;
}
const arrhenius = (tk, ha) => exp(ha * (tk - TK_REF) / (TK_REF * K_R * tk));
const viscosidad = (tk) => VOGEL[0] * exp(VOGEL[1] / (tk - VOGEL[2])) / 1000;

// Devuelve {lue, iwue, tc, patm} para arrays (Float64Array) de tc (ºC), vpd (Pa), co2 (ppm), patm (Pa)
export function pmodel(tc, vpd, co2, patm) {
  let mnT = NaN, mnV = NaN;
  for (let i = 0; i < tc.length; i++) {
    if (tc[i] === tc[i] && (mnT !== mnT || tc[i] < mnT)) mnT = tc[i];
    if (vpd[i] === vpd[i] && (mnV !== mnV || vpd[i] < mnV)) mnV = vpd[i];
  }
  if (mnT < -25) throw new Error('Cannot calculate P Model predictions for values below -25ºC.');
  if (mnV < 0) throw new Error('Negative VPD values will lead to missing data');
  const n = tc.length;
  const lue = new Float64Array(n), iwue = new Float64Array(n);
  const viscStd = viscosidad(K_TO);
  for (let i = 0; i < n; i++) {
    const tk = tc[i] + K_CTOK;
    const ca = 1e-06 * co2[i] * patm[i];
    const gammastar = GS.gs25_0 * patm[i] / K_PO * arrhenius(tk, GS.dha);
    const kc = KMM.kc25 * arrhenius(tk, KMM.dhac);
    const ko = KMM.ko25 * arrhenius(tk, KMM.dhao);
    const po = K_CO * 1e-06 * patm[i];
    const kmm = kc * (1.0 + po / ko);
    const nsStar = viscosidad(tk) / viscStd;
    const xi = Math.sqrt(BETA_C3 * (kmm + gammastar) / (1.6 * nsStar));
    const chi = gammastar / ca + (1.0 - gammastar / ca) * xi / (xi + Math.sqrt(vpd[i]));
    const ci = chi * ca;
    const mj = (ci - gammastar) / (ci + 2 * gammastar);
    let ftemp = horner(tc[i], KPHIO_C3);
    ftemp = ftemp !== ftemp ? ftemp : (ftemp < 0 ? 0.0 : ftemp);
    const kphio = ftemp * MAX_PHI0;
    const fv = mj > WANG17_C ? Math.sqrt(1 - pow(WANG17_C / mj, 2.0 / 3.0)) : NaN;
    lue[i] = kphio * mj * fv * K_C_MOLMASS;
    iwue[i] = 5 / 8 * (ca - ci) / (1e-06 * patm[i]);
  }
  return { lue, iwue, tc, patm };
}

// convert_water_moles_to_mm con densidad jones_harris_eq6
export function molesAMm(moles, tc) {
  const dens = horner(tc, RHO_JH) / 1000;
  return moles * (K_WATER_MOLMASS / dens) / 1000;
}

// ------------------------------------------------------------------ flora
const qm = (m, n) => m * n * pow((n - 1) / (m * n - 1), 1 - 1 / n) * pow((m - 1) * n / (m * n - 1), m - 1);
const zMaxProp = (m, n) => pow((n - 1) / (m * n - 1), 1 / n);

// Construye la flora (una fila por PFT) a partir de la tabla del CSV (columnas -> listas)
export function crearFlora(tabla, camposPorDefecto) {
  const col = tabla.datos;
  const nPft = col.pft_name.length;
  const flora = {};
  for (const campo of camposPorDefecto) {
    if (campo.nombre in col) flora[campo.nombre] = col[campo.nombre].slice();
    else if (campo.defecto !== null && campo.defecto !== undefined) {
      const d = Array.isArray(campo.defecto) ? campo.defecto : [campo.defecto];
      flora[campo.nombre] = Array.from({ length: nPft }, (_, i) => d[i % d.length]);
    }
  }
  const num = (v) => (v === 'inf' || v === 'Infinity' ? Infinity : v === '-inf' || v === '-Infinity' ? -Infinity : v === 'NaN' ? NaN : v);
  for (const k of Object.keys(flora)) if (k !== 'pft_name') flora[k] = flora[k].map(num);
  flora.lai_base = flora.lai.slice();
  flora.tau_f_base = flora.tau_f.slice();
  flora.q_m = flora.m.map((m, i) => qm(m, flora.n[i]));
  flora.z_max_prop = flora.m.map((m, i) => zMaxProp(m, flora.n[i]));
  flora.fruit_flesh_fraction = flora.c_mass_fruit_flesh.map((cmf, i) => cmf / (cmf + flora.c_mass_fruit_seed[i] * flora.seeds_per_fruit[i]));
  flora.nPft = nPft;
  return flora;
}

// create_cohorts: tabla de cohortes (columnas) uniendo con la flora por pft_name
export function crearCohortes(flora, generadorId, pft, dbh, nInd) {
  const k = pft.length;
  const coh = { cohort_id: [], pft_name: pft.slice(), dbh_value: f64(dbh), n_individuals: nInd.slice() };
  for (const v of dbh) if (v <= 0) throw new Error('DBH values must be strictly positive');
  const idx = pft.map((p) => {
    const j = flora.pft_name.indexOf(p);
    if (j < 0) throw new Error(`PFTs in cohort data not present in flora: ${p}`);
    return j;
  });
  for (const c of Object.keys(flora)) {
    if (c === 'pft_name' || c === 'nPft') continue;
    coh[c] = f64(idx, (j) => flora[c][j]);
  }
  for (let i = 0; i < k; i++) coh.cohort_id.push(generadorId());
  return coh;
}

export const nCohortes = (coh) => coh.pft_name.length;

export function concatCohortes(a, b) {
  const out = {};
  for (const c of Object.keys(a)) {
    if (Array.isArray(a[c])) out[c] = a[c].concat(b[c]);
    else { out[c] = new Float64Array(a[c].length + b[c].length); out[c].set(a[c]); out[c].set(b[c], a[c].length); }
  }
  return out;
}

// ------------------------------------------------------------------ T model
export function alometria(coh) {
  const k = nCohortes(coh);
  const A = { cohort_id: coh.cohort_id.slice(), dbh: f64(coh.dbh_value) };
  const f = (fn) => f64({ length: k }, (_, i) => fn(i));
  A.stem_height = f((i) => coh.h_max[i] * (1 - exp(-coh.a_hd[i] * A.dbh[i] / coh.h_max[i])));
  A.crown_area = f((i) => Math.PI * coh.ca_ratio[i] / (4 * coh.a_hd[i]) * A.dbh[i] * A.stem_height[i]);
  A.crown_fraction = f((i) => A.stem_height[i] / (coh.a_hd[i] * A.dbh[i]));
  A.stem_mass = f((i) => Math.PI / 8 * coh.rho_s[i] * (A.dbh[i] * A.dbh[i]) * A.stem_height[i]);
  A.foliage_mass = f((i) => A.crown_area[i] * coh.lai[i] * (1 / coh.sla[i]));
  A.fine_root_mass = f((i) => A.crown_area[i] * coh.lai[i] * coh.zeta[i]);
  A.sapwood_mass = f((i) => A.crown_area[i] * coh.rho_s[i] * A.stem_height[i] * (1 - A.crown_fraction[i] / 2) / coh.ca_ratio[i]);
  A.crown_r0 = f((i) => 1 / coh.q_m[i] * Math.sqrt(A.crown_area[i] / Math.PI));
  A.crown_z_max = f((i) => A.stem_height[i] * coh.z_max_prop[i]);
  return A;
}

export function asignacion(coh, A, gpp) {
  const k = nCohortes(coh);
  for (const g of gpp) if (g < 0) throw new Error('Values in whole_crown_gpp cannot be negative.');
  const f = (fn) => f64({ length: k }, (_, i) => fn(i));
  const S = { cohort_id: A.cohort_id, whole_crown_gpp: f64(gpp) };
  S.sapwood_respiration = f((i) => A.sapwood_mass[i] * coh.resp_s[i]);
  S.foliage_respiration = f((i) => gpp[i] * coh.resp_f[i]);
  S.fine_root_respiration = f((i) => A.fine_root_mass[i] * coh.resp_r[i]);
  S.npp = f((i) => coh.yld[i] * (gpp[i] - S.foliage_respiration[i] - S.fine_root_respiration[i] - S.sapwood_respiration[i]));
  S.foliage_turnover = f((i) => A.foliage_mass[i] / coh.tau_f[i]);
  S.fine_root_turnover = f((i) => A.fine_root_mass[i] / coh.tau_r[i]);
  S.branch_turnover = f((i) => A.stem_mass[i] / coh.tau_b[i]);
  return S;
}

export function incrementos(coh, A, S, produccion) {
  const k = nCohortes(coh);
  const G = { cohort_id: S.cohort_id, delta_dbh: new Float64Array(k), delta_stem_mass: new Float64Array(k),
    delta_foliage_mass: new Float64Array(k), delta_fine_root_mass: new Float64Array(k) };
  for (let i = 0; i < k; i++) {
    const turn = S.fine_root_turnover[i] + S.foliage_turnover[i] + S.branch_turnover[i];
    const dbh = A.dbh[i], h = A.stem_height[i], a = coh.a_hd[i], hm = coh.h_max[i];
    const dWsdt = Math.PI / 8 * coh.rho_s[i] * dbh * (a * dbh * (1 - h / hm) + 2 * h);
    const dWfrdt = coh.lai[i] * (Math.PI * coh.ca_ratio[i] / (4 * a)) * (a * dbh * (1 - h / hm) + h) * (1 / coh.sla[i] + coh.zeta[i]);
    const dd = dbh === 0 ? 0 : (produccion[i] - turn) / (dWsdt + dWfrdt);
    const frff = 1 + coh.sla[i] * coh.zeta[i];
    const dWfr = dWfrdt * dd;
    const dWf = dWfr / frff;
    G.delta_dbh[i] = dd;
    G.delta_stem_mass[i] = dWsdt * dd;
    G.delta_foliage_mass[i] = dWf;
    G.delta_fine_root_mass[i] = dWfr - dWf;
  }
  return G;
}

// ------------------------------------------------------------------ crown / canopy
function qZ(z, h, m, n) {
  const zh = z / h;
  const q = m * n * pow(zh, n - 1) * pow(1 - pow(zh, n), m - 1);
  return (z >= 0 && z <= h) ? q : 0;
}

function areaCopaProyectada(z, q, h, ca, qmv, zmax) {
  const r = q / qmv;
  let ap = ca * (r * r);
  ap = z <= zmax ? ca : ap;
  return z > h ? 0 : ap;
}

function areaHojaProyectada(z, q, h, ca, fg, qmv, zmax) {
  const r = q / qmv;
  const t = ca * (r * r);
  const acp = z <= zmax ? ca - t * fg : t * (1 - fg);
  return z > h ? 0 : acp;
}

// scipy.optimize brentq (Zeros/brentq.c)
export function brentq(f, xa, xb, xtol, rtol = 4 * 2.220446049250313e-16, iter = 100) {
  let xpre = xa, xcur = xb, xblk = 0, fblk = 0, spre = 0, scur = 0;
  let fpre = f(xpre), fcur = f(xcur);
  if (fpre === 0) return { raiz: xpre, converge: true };
  if (fcur === 0) return { raiz: xcur, converge: true };
  const sb = (v) => v < 0 || Object.is(v, -0);
  if (sb(fpre) === sb(fcur)) return { raiz: 0, converge: false };
  for (let i = 0; i < iter; i++) {
    if (fpre !== 0 && fcur !== 0 && sb(fpre) !== sb(fcur)) {
      xblk = xpre; fblk = fpre; spre = scur = xcur - xpre;
    }
    if (Math.abs(fblk) < Math.abs(fcur)) {
      xpre = xcur; xcur = xblk; xblk = xpre;
      fpre = fcur; fcur = fblk; fblk = fpre;
    }
    const delta = (xtol + rtol * Math.abs(xcur)) / 2;
    const sbis = (xblk - xcur) / 2;
    if (fcur === 0 || Math.abs(sbis) < delta) return { raiz: xcur, converge: true };
    if (Math.abs(spre) > delta && Math.abs(fcur) < Math.abs(fpre)) {
      let stry;
      if (xpre === xblk) stry = -fcur * (xcur - xpre) / (fcur - fpre);
      else {
        const dpre = (fpre - fcur) / (xpre - xcur);
        const dblk = (fblk - fcur) / (xblk - xcur);
        stry = -fcur * (fblk * dblk - fpre * dpre) / (dblk * dpre * (fblk - fpre));
      }
      if (2 * Math.abs(stry) < Math.min(Math.abs(spre), 3 * Math.abs(sbis) - delta)) { spre = scur; scur = stry; } else { spre = sbis; scur = sbis; }
    } else { spre = sbis; scur = sbis; }
    xpre = xcur; fpre = fcur;
    if (Math.abs(scur) > delta) xcur += scur;
    else xcur += (sbis > 0 ? delta : -delta);
    fcur = f(xcur);
  }
  return { raiz: xcur, converge: false };
}

// suma de numpy de un array pequeño contiguo
const sumaNp = (a) => 0.0 + sumaPares(a, 0, a.length, 1);

export function dosel(coh, A, areaCelda, gapFraction = 0, tol = 0.001) {
  const k = nCohortes(coh);
  let maxH = -Infinity;
  for (const h of A.stem_height) if (h > maxH || h !== h) maxH = h;
  const totCopa = sumaNp(f64({ length: k }, (_, i) => A.crown_area[i] * coh.n_individuals[i]));
  const porCapa = areaCelda * (1 - gapFraction);
  const nCapas = Math.trunc(Math.ceil(totCopa / porCapa));
  const alturas = new Float64Array(nCapas);
  let sup = maxH;
  for (let capa = 0; capa < nCapas - 1; capa++) {
    const objetivo = (capa + 1) * porCapa;
    const f = (z) => {
      const ap = f64({ length: k }, (_, i) => {
        const q = qZ(z, A.stem_height[i], coh.m[i], coh.n[i]);
        return areaCopaProyectada(z, q, A.stem_height[i], A.crown_area[i], coh.q_m[i], A.crown_z_max[i]) * coh.n_individuals[i];
      });
      return sumaNp(ap) - objetivo;
    };
    const s = brentq(f, 0, sup, tol);
    if (!s.converge) throw new Error('Estimation of canopy layer closure heights failed to converge.');
    alturas[capa] = sup = s.raiz;
  }
  // CrownProfile en las alturas
  const L = nCapas;
  const pla = new Float64Array(L * k);
  for (let l = 0; l < L; l++) for (let i = 0; i < k; i++) {
    const z = alturas[l];
    const q = qZ(z, A.stem_height[i], coh.m[i], coh.n[i]);
    pla[l * k + i] = areaHojaProyectada(z, q, A.stem_height[i], A.crown_area[i], coh.f_g[i], coh.q_m[i], A.crown_z_max[i]);
  }
  // CohortCanopyData
  const sla = new Float64Array(L * k);
  for (let l = 0; l < L; l++) for (let i = 0; i < k; i++) sla[l * k + i] = pla[l * k + i] - (l === 0 ? 0 : pla[(l - 1) * k + i]);
  const abs = f64({ length: k }, (_, i) => 1.0 - exp(-coh.par_ext[i] * coh.lai[i]));
  const cla = f64(sla, (v, j) => v * coh.n_individuals[j % k]);
  const ala = new Float64Array(L), alai = new Float64Array(L);
  for (let l = 0; l < L; l++) {
    ala[l] = sumaFila(f64({ length: k }, (_, i) => abs[i] * cla[l * k + i])) / areaCelda;
    alai[l] = sumaFila(f64({ length: k }, (_, i) => coh.lai[i] * cla[l * k + i])) / areaCelda;
  }
  const full = new Float64Array(L + 1);
  full[0] = 1;
  for (let l = 0; l < L; l++) full[l + 1] = full[l] * (1 - ala[l]);
  const alFapar = f64({ length: L }, (_, l) => (-full[l + 1]) - (-full[l]));
  const fapar = new Float64Array(L * k);
  for (let l = 0; l < L; l++) for (let i = 0; i < k; i++) fapar[l * k + i] = full[l] * abs[i];
  return {
    heights: alturas, max_stem_height: maxH, n_cohorts: k,
    cohort_data: { stem_leaf_area: sla, fapar, L, k },
    community_data: { average_layer_absorption: ala, average_layer_lai: alai, average_layer_fapar: alFapar,
      transmission_profile: full.slice(0, L), transmission_to_ground: full[L] },
  };
}

// suma por el eje 1 de un (L, k): pares por fila
const sumaFila = (fila) => 0.0 + sumaPares(fila, 0, fila.length, 1);

export { log };
