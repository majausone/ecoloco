// Funciones compartidas entre módulos: lo de pyrealm.core.hygro y abiotic_tools que usan
// varios modelos, y utilidades de arrays con la semántica de numpy.

import { exp } from '../num/ucrt.js?v=202610052309';

export const ZERO_CELSIUS = 273.15; // scipy.constants.zero_Celsius

// numpy: maximum/minimum propagan NaN; clip = minimum(maximum(x, lo), hi)
export const npMax = (a, b) => (a !== a ? a : (b !== b ? b : (a >= b ? a : b)));
export const npMin = (a, b) => (a !== a ? a : (b !== b ? b : (a <= b ? a : b)));
export const npClip = (x, lo, hi) => npMin(npMax(x, lo), hi);
export const nanACero = (v) => (v !== v ? 0 : v);

// pyrealm.core.hygro.calculate_vp_sat (Magnus, Sonntag1990 por defecto) en kPa
export function vpSat(tc, magnus = [611.2, 17.62, 243.12]) {
  return magnus[0] * exp(magnus[1] * tc / (magnus[2] + tc)) / 1000;
}

// pyrealm.core.hygro.calculate_specific_heat (J kg-1 K-1), Horner sobre tc recortado a [0, 100]
const CP = [1.004571427, 0.00205063275, -0.0001631537093, 6.2123003e-06, -8.830478888e-08, 5.071307038e-10];
export function calorEspecifico(tc) {
  const x = npClip(tc, 0, 100);
  let y = 0;
  for (let i = CP.length - 1; i >= 0; i--) y = x * y + CP[i];
  return 1000.0 * y;
}

// abiotic_tools.calculate_air_density
export const densidadAire = (t, p, rDry, c2k) => p * 1000.0 / ((t + c2k) * rDry);

// abiotic_tools.calculate_latent_heat_vapourisation (kJ kg-1); el ** 2 de un ndarray es x*x
export function calorLatente(t, c2k, [a, b]) {
  const tk = t + c2k;
  const r = tk / (tk - b);
  return a * (r * r) / 1000.0;
}

// abiotic_tools.calculate_slope_of_saturated_pressure_curve
export function pendientePresionSat(t, [a, b, c, d]) {
  const td = t + d;
  return a * (b * exp(c * t / td)) / (td * td);
}
