// exp, log y pow tal como los calcula la UCRT de Windows (ucrtbase.dll) en una CPU
// con FMA. Son las funciones que usa numpy (y math de Python) en la máquina de
// referencia, así que replicarlas es lo que permite que el motor dé los mismos bits.
//
// Cada función es una traducción instrucción a instrucción del desensamblado de la ruta
// FMA de ucrtbase.dll (ver herramientas/extraer_tablas_ucrt.py). Las constantes y tablas
// salen de la propia DLL. El `Math.exp` de JS (fdlibm) difiere en ~7% de los valores.

import { fma } from './fma.js?v=202610060036';
import {
  EXP_T1, EXP_T2, EXP_T3, LOG_TINV, LOG_TA, LOG_TB, POW_LOG, POW_EXP, LOG10_TA, LOG10_TB,
} from './tablas_ucrt.js?v=202610060036';
import { f64 } from './f64.js?v=202610060036';

const buf = new ArrayBuffer(8);
const F = new Float64Array(buf);
const U = new Uint32Array(buf); // little endian: U[0] = bits bajos, U[1] = bits altos

function hexADouble(h) {
  U[1] = parseInt(h.slice(0, 8), 16);
  U[0] = parseInt(h.slice(8), 16);
  return F[0];
}
const tabla = (hs) => f64(hs, hexADouble);
const K = hexADouble;
function dbl(hi, lo) { U[1] = hi; U[0] = lo; return F[0]; }

// ---------------------------------------------------------------- exp
const ET1 = tabla(EXP_T1), ET2 = tabla(EXP_T2), ET3 = tabla(EXP_T3);
const E_INV = K('40571547652b82fe'), E_L1 = K('bf862e42fefa0000'), E_L2 = K('bd1cf79abc9e3b39');
const E_C6 = K('3f56c16c16c16c17'), E_C5 = K('3f81111111111111'), E_C4 = K('3fa5555555555555'),
  E_C3 = K('3fc5555555555555');
const E_MAX = K('40862e42fefa39ef'), E_MIN = K('c0874046dfefd9d0'), E_MIN2 = K('c0874910d52d3051');

export function exp(x) {
  if (x !== x) return x + x;
  if (x === Infinity) return x;
  if (x === -Infinity) return 0;
  if (!(x <= E_MAX && !(x < E_MIN))) {
    if (x > E_MAX) return Infinity;
    return x < E_MIN2 ? 0 : 5e-324;
  }
  if (Math.abs(x) <= 1.4901161193847656e-08) return x + 1.0;
  const n = Math.trunc(x * E_INV);
  const r0 = fma(n, E_L1, x);
  const r = n * E_L2 + r0;
  let p = fma(E_C6, r, E_C5);
  p = fma(p, r, E_C4);
  p = fma(p, r, E_C3);
  p = fma(p, r, 0.5);
  const q = fma(r * r, p, r);
  const j = n & 63;
  const m = n >> 6;
  const res = (q * ET1[j] + ET2[j]) + ET3[j];
  if (m > -1022 || (m === -1022 && res >= 1)) {
    F[0] = res;
    U[1] = (U[1] + (m << 20)) | 0;
    return F[0];
  }
  // resultado subnormal: una sola multiplicación por 2^m (exacto como potencia de 2)
  const e = m + 1074; // 0..51
  const pot = e >= 32 ? dbl(1 << (e - 32), 0) : dbl(0, (1 << e) >>> 0);
  return res * pot;
}

// ---------------------------------------------------------------- log
const LTINV = tabla(LOG_TINV), LTA = tabla(LOG_TA), LTB = tabla(LOG_TB);
const L_LN2LO = K('3e6efa39ef35793c'), L_LN2HI = K('3fe62e42e0000000');
const L_C0 = K('3fb55555555554e6'), L_C1 = K('3f89999999bac6d4'), L_C2 = K('3f62492307f1519f'),
  L_C3 = K('3f3c8034c85dfff0');
const L_SEXTO = K('3fc5555555555555'), L_TERCIO = K('3fd5555555555555');

export function log(x) {
  F[0] = x;
  const hi = U[1], lo = U[0];
  const expBits = (hi >>> 20) & 0x7ff;
  if (expBits === 0x7ff) {
    if (x === Infinity) return x;
    if (x === -Infinity) return NaN;
    return x + x;
  }
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  let e = expBits - 1023;
  const xm1 = x - 1.0;
  let mhi = hi & 0x000fffff, mlo = lo;
  if (e === -1023) {
    const y = dbl(mhi | 0x3ff00000, mlo) - 1.0;
    F[0] = y;
    const yhi = U[1];
    e = ((yhi >>> 20) & 0x7ff) - 0x7fd;
    mhi = yhi & 0x000fffff;
    mlo = U[0];
  }
  if (Math.abs(xm1) < 0.0625) {
    const f = xm1;
    const up = f / (2.0 + f);
    const fu = f * up;
    const u = up + up;
    const u2 = u * u;
    let a = fma(L_C1, u2, L_C0);
    const b = fma(L_C3, u2, L_C2);
    const u3 = u2 * u;
    a = a * u3;
    let u7 = u3 * u3;
    u7 = u7 * u;
    a = fma(b, u7, a);
    a = a - fu;
    return f + a;
  }
  const idx = (mhi & 0x000ff000) + ((mhi & 0x00000800) << 1);
  const j = idx >>> 12;
  const f2 = dbl(mhi | 0x3fe00000, mlo);
  const Fj = dbl(idx | 0x3fe00000, 0);
  const r = (Fj - f2) * LTINV[j];
  const r2 = r * r;
  let p3 = fma(L_SEXTO, r, 0.2);
  const p5 = fma(L_TERCIO, r, 0.5);
  p3 = fma(p3, r, 0.25);
  const r4 = r2 * r2;
  let q = fma(p5, r2, r);
  q = fma(p3, r4, q);
  const t5 = fma(L_LN2LO, e, -q);
  const s1 = LTB[j] + t5;
  const s0 = fma(e, L_LN2HI, LTA[j]);
  return s0 + s1;
}

// ---------------------------------------------------------------- log1p
// La UCRT lo calcula como log(1+x) corregido: log(u) - ((u - 1) - x) / u.
export function log1p(x) {
  if (x !== x) return x;
  if (x === Infinity || x === 0) return x;
  if (-1.0 > x) return NaN;
  if (x === -1.0) return -Infinity;
  const u = x + 1.0;
  return log(u) - ((u - 1.0) - x) / u;
}

// ---------------------------------------------------------------- sin / cos
// Ruta FMA de la UCRT: reducción de Cody-Waite con pi/2 en tres partes (|x| < 2e7) y
// polinomios de grado 13/14. Para |x| >= 2e7 la UCRT usa Payne-Hanek: no lo necesitamos
// (en el modelo los ángulos son pequeños) y se señala con un error explícito.
const SC_S = [K('bfc5555555555555'), K('3f81111111110bb3'), K('bf2a01a019e83e5c'), K('3ec71de3796cde01'),
  K('be5ae600b42fdfa7'), K('3de5e0b2f9a43bb8')];
const SC_C = [K('3fa5555555555555'), K('bf56c16c16c16967'), K('3efa01a019f4ec91'), K('be927e4fa17f667b'),
  K('3e21eeb690382eec'), K('bda907db47258aa7')];
const R_2OPI = K('3fe45f306dc9c883'), R_SHIFT = K('4338000000000000'), R_PIO2_1 = K('3ff921fb54442d18'),
  R_PIO2_2 = K('3c91a62633145c00'), R_PIO2_3 = K('397b839a252049c0');
const PI4 = K('3fe921fb54442d18');

function reducir(x) {
  let n = fma(x, R_2OPI, R_SHIFT);
  n = n - R_SHIFT;
  const q = Math.trunc(n) & 3;
  const r1 = fma(-n, R_PIO2_1, x);
  const p2 = n * R_PIO2_2;
  const e0 = fma(n, R_PIO2_2, -p2);
  let t = r1 - p2;
  const e1 = (r1 - t) - p2;
  const r2 = fma(-n, R_PIO2_2, r1);
  t = t - r2;
  t = t + e1;
  t = t - e0;
  const rr = fma(-n, R_PIO2_3, t);
  return [r2, rr, q];
}

function polSin(r, rr) {
  const x2 = r * r;
  let p = fma(SC_S[5], x2, SC_S[4]);
  p = fma(p, x2, SC_S[3]);
  p = fma(p, x2, SC_S[2]);
  p = fma(p, x2, SC_S[1]);
  const x3 = r * x2;
  let a = x3 * p;
  a = rr * 0.5 - a;
  a = x2 * a;
  a = a - rr;
  a = fma(-x3, SC_S[0], a);
  return r - a;
}

function polCos(r, rr) {
  const x2 = r * r;
  const hz = x2 * 0.5;
  const w = 1.0 - hz;
  let a = (1.0 - w) - hz;
  a = fma(-r, rr, a);
  const x4 = x2 * x2;
  let p = fma(x2, SC_C[5], SC_C[4]);
  p = fma(p, x2, SC_C[3]);
  p = fma(p, x2, SC_C[2]);
  p = fma(p, x2, SC_C[1]);
  p = fma(p, x2, SC_C[0]);
  p = fma(p, x4, a);
  return p + w;
}

export function sin(x) {
  const ax = Math.abs(x);
  if (ax < PI4) {
    if (ax < 0.0001220703125) {
      if (ax < 7.450580596923828e-09) return x;
      return fma(-(x * x * x), 1 / 6 === 0 ? 0 : K('3fc5555555555555'), x);
    }
    const x2 = x * x;
    let p = fma(SC_S[5], x2, SC_S[4]);
    p = fma(p, x2, SC_S[3]);
    p = fma(p, x2, SC_S[2]);
    p = fma(p, x2, SC_S[1]);
    const x3 = x * x2;
    p = fma(p, x2, SC_S[0]);
    return fma(x3, p, x);
  }
  if (!(ax < Infinity)) return NaN;
  if (ax >= 20000000.0) throw new Error('sin: argumento demasiado grande (no implementado)');
  const [r, rr, q] = reducir(ax);
  let v = (q & 1) ? polCos(r, rr) : polSin(r, rr);
  const neg = ((q & 2) !== 0) !== (x < 0 || Object.is(x, -0));
  return neg ? -v : v;
}

export function cos(x) {
  const ax = Math.abs(x);
  if (ax <= PI4) {
    if (ax < 0.0001220703125) {
      if (ax < 7.450580596923828e-09) return 1.0;
      return fma(-x, x * 0.5, 1.0);
    }
    const x2 = x * x;
    let p = fma(SC_C[5], x2, SC_C[4]);
    p = fma(p, x2, SC_C[3]);
    p = fma(p, x2, SC_C[2]);
    p = fma(p, x2, SC_C[1]);
    p = fma(p, x2, SC_C[0]);
    p = fma(p, x2, -0.5);
    return fma(p, x2, 1.0);
  }
  if (!(ax < Infinity)) return NaN;
  if (ax >= 20000000.0) throw new Error('cos: argumento demasiado grande (no implementado)');
  const [r, rr, q] = reducir(ax);
  const v = (q & 1) ? polSin(r, rr) : polCos(r, rr);
  return ((q + 1) & 2) ? -v : v;
}

// ---------------------------------------------------------------- log10
// Misma estructura que log, con las tablas y constantes de log10 y una recombinación
// final distinta cerca de 1 (allí no usa FMA para el último término del polinomio).
const L10TA = tabla(LOG10_TA), L10TB = tabla(LOG10_TB);
const L10_LOG10E = K('3fdbcb7b1526e50e'), L10_LG2LO = K('3e03ef3fde623e25'), L10_LG2HI = K('3fd3441350000000');
const L10_EHI = K('3fdbcb7800000000'), L10_ELO = K('3ea8a93728719535');

export function log10(x) {
  F[0] = x;
  const hi = U[1], lo = U[0];
  const expBits = (hi >>> 20) & 0x7ff;
  if (expBits === 0x7ff) {
    if (x === Infinity) return x;
    if (x === -Infinity) return NaN;
    return x + x;
  }
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  let e = expBits - 1023;
  const xm1 = x - 1.0;
  let mhi = hi & 0x000fffff, mlo = lo;
  if (e === -1023) {
    const y = dbl(mhi | 0x3ff00000, mlo) - 1.0;
    F[0] = y;
    const yhi = U[1];
    e = ((yhi >>> 20) & 0x7ff) - 0x7fd;
    mhi = yhi & 0x000fffff;
    mlo = U[0];
  }
  if (Math.abs(xm1) < 0.0625) {
    const f = xm1;
    const up = f / (2.0 + f);
    const fu = f * up;
    const u = up + up;
    const u2 = u * u;
    let a = fma(L_C1, u2, L_C0);
    let b = fma(L_C3, u2, L_C2);
    const u3 = u2 * u;
    a = a * u3;
    let u7 = u3 * u3;
    u7 = u7 * u;
    b = b * u7;
    a = a + b;
    a = a - fu;
    F[0] = f;
    U[0] = 0;
    const fhi = F[0];
    const flo = f - fhi;
    a = a + flo;
    const t1 = a * L10_EHI;
    const t4 = a * L10_ELO;
    const t0 = fhi * L10_ELO;
    const t3 = fhi * L10_EHI;
    return ((t0 + t4) + t1) + t3;
  }
  const idx = (mhi & 0x000ff000) + ((mhi & 0x00000800) << 1);
  const j = idx >>> 12;
  const f2 = dbl(mhi | 0x3fe00000, mlo);
  const Fj = dbl(idx | 0x3fe00000, 0);
  const r = (Fj - f2) * LTINV[j];
  const r2 = r * r;
  let p3 = fma(L_SEXTO, r, 0.2);
  const p5 = fma(L_TERCIO, r, 0.5);
  p3 = fma(p3, r, 0.25);
  const r4 = r2 * r2;
  let q = fma(p5, r2, r);
  q = fma(p3, r4, q);
  q = q * L10_LOG10E;
  const t5 = fma(L10_LG2LO, e, -q);
  const s1 = L10TB[j] + t5;
  const s0 = fma(e, L10_LG2HI, L10TA[j]);
  return s0 + s1;
}

// ---------------------------------------------------------------- pow
// Es la pow de "ARM optimized-routines" (la misma familia que glibc) compilada por
// Microsoft con FMA, más dos atajos propios: pow(x, 1) = x y pow(±1, y) = ±1.
const P_INVC = new Float64Array(128), P_LOGC = new Float64Array(128), P_LOGCT = new Float64Array(128);
for (let i = 0; i < 128; i++) {
  P_INVC[i] = hexADouble(POW_LOG[4 * i]);
  P_LOGC[i] = hexADouble(POW_LOG[4 * i + 2]);
  P_LOGCT[i] = hexADouble(POW_LOG[4 * i + 3]);
}
const P_ETAIL = new Float64Array(256), P_EBHI = new Uint32Array(256), P_EBLO = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  P_ETAIL[i] = hexADouble(POW_EXP[2 * i]);
  const b = POW_EXP[2 * i + 1];
  P_EBHI[i] = parseInt(b.slice(0, 8), 16);
  P_EBLO[i] = parseInt(b.slice(8), 16);
}
const P_LN2HI = K('3fe62e42fefa3800'), P_LN2LO = K('3d2ef35793c76730');
const P_A = K('3fe555555529a47a'), P_B = K('3fe999999959554e'), P_C = K('3ff0002b8b263fc3'),
  P_D = K('3ff2495b9b4845e9'), P_E = K('3fe0000000000006'), P_F = K('3fe5555555555560');
const P_INVLN2N = K('40771547652b82fe'), P_SHIFT = K('4238000000008000'),
  P_LN2HIN = K('3f662e42fefc0000'), P_LN2LON = K('3d2c610ca86c3899');
const P_C3 = K('3fc555555555543c'), P_C2 = K('3fdffffffffffdbd'), P_C5 = K('3f81111167a4b553'),
  P_C4 = K('3fa55555cf16e1ed');
const P_1009 = K('7f00000000000000'), P_M1022 = K('0010000000000000');
// Las operaciones de enteros de 64 bits del original, con las dos palabras de 32 bits (hi, lo) y sin BigInt
// (que era casi la mitad del tiempo de todo el motor): son comparaciones y máscaras de enteros, sin coma
// flotante, y dan lo mismo que con BigInt en todos los patrones (comprobado con millones al azar y todos los
// bordes de signo, exponente y mantisa).
// (x << 1) en 64 bits: la palabra alta y la baja
const dosAlta = (h, l) => (((h << 1) | (l >>> 31)) >>> 0);
const dosBaja = (l) => (l << 1) >>> 0;

// 0: no entero, 1: entero impar, 2: entero par
function checkint(yh, yl) {
  const e = (yh >>> 20) & 0x7ff;
  if (e < 0x3ff) return 0;
  if (e > 0x3ff + 52) return 2;
  // (el bit de las unidades está en la posición s: los de debajo, la parte fraccionaria)
  const s = 0x3ff + 52 - e;
  if (s < 32) {
    if (s && (yl & (0xffffffff >>> (32 - s)))) return 0;
    return (yl >>> s) & 1 ? 1 : 2;
  }
  const t = s - 32;
  if (yl || (t && (yh & (0xffffffff >>> (32 - t))))) return 0;
  return (yh >>> t) & 1 ? 1 : 2;
}
// ((ix ^ 0x0008000000000000) << 1) > 0xfff0000000000000
function issignaling(hi, lo) {
  const h = dosAlta(hi ^ 0x80000, lo), l = dosBaja(lo);
  return h > 0xfff00000 || (h === 0xfff00000 && l > 0);
}
// 2*ix - 1 >= 2*0x7ff0000000000000 - 1 (sin signo): cero, infinito o NaN
function zeroinfnan(hi, lo) {
  return ((hi & 0x7fffffff) === 0 && lo === 0) || dosAlta(hi, lo) >= 0xffe00000;
}

function expInline(ehi, elo, signBias) {
  F[0] = ehi;
  const hh = U[1];
  let abstop = (hh >>> 20) & 0x7ff;
  if (((abstop - 0x3c9) >>> 0) >= 0x3f) {
    if (((abstop - 0x3c9) >>> 0) >= 0x80000000) {
      const uno = 1.0 + ehi;
      return signBias ? -uno : uno;
    }
    if (abstop >= 0x409) {
      if (hh & 0x80000000) return signBias ? -0 : 0;
      return signBias ? -Infinity : Infinity;
    }
    abstop = 0;
  }
  const z = ehi * P_INVLN2N;
  F[0] = z + P_SHIFT;
  const ki = ((U[1] << 16) | (U[0] >>> 16)) | 0;
  const t0 = ki * P_LN2HIN, t1 = ki * P_LN2LON;
  let r = (ehi - t0) + t1;
  r = r + elo;
  const a = r * P_C3 + P_C2;
  const r2 = r * r;
  const s3 = a * r2;
  const b = r * P_C5 + P_C4;
  const idx = ki & 0xff;
  const tophi = ((((ki + signBias) & 0xfffff) << 12) >>> 0);
  const r4 = r2 * r2;
  const s2 = r + P_ETAIL[idx];
  let sbhi = (P_EBHI[idx] + tophi) >>> 0;
  const sblo = P_EBLO[idx];
  const s1 = b * r4;
  const tmp = (s3 + s2) + s1;
  if (abstop === 0) {
    if ((ki & 0x80000000) === 0) {
      sbhi = (sbhi - 0x3f100000) >>> 0;
      const scale = dbl(sbhi, sblo);
      return (scale * tmp + scale) * P_1009;
    }
    sbhi = (sbhi + 0x3fe00000) >>> 0;
    const scale = dbl(sbhi, sblo);
    const st = scale * tmp;
    let y = scale + st;
    if (Math.abs(y) < 1.0) {
      const uno = y < 0.0 ? -1.0 : 1.0;
      let lo = (scale - y) + st;
      const hi = uno + y;
      lo = lo + ((uno - hi) + y);
      y = (lo + hi) - uno;
      if (y === 0) y = (sbhi & 0x80000000) ? -0 : 0;
    }
    return y * P_M1022;
  }
  const scale = dbl(sbhi, sblo);
  return tmp * scale + scale;
}

export function pow(x, y) {
  F[0] = x;
  const xh = U[1], xl = U[0];
  F[0] = y;
  const yh = U[1], yl = U[0];
  const topx = xh >>> 20, topy = yh >>> 20;
  let signBias = 0;
  let ixh = xh, ixl = xl;
  if (((topx - 1) >>> 0) >= 0x7fe || (((topy & 0x7ff) - 0x3be) >>> 0) >= 0x80) {
    if (zeroinfnan(yh, yl)) {
      if ((yh & 0x7fffffff) === 0 && yl === 0) return issignaling(xh, xl) ? x + y : 1.0;
      if (xh === 0x3ff00000 && xl === 0) return issignaling(yh, yl) ? x + y : 1.0;
      // (2·|x| y 2·|y| en 64 bits, comparados por palabras)
      const axh = dosAlta(xh, xl), axl = dosBaja(xl), ayh = dosAlta(yh, yl), ayl = dosBaja(yl);
      if (axh > 0xffe00000 || (axh === 0xffe00000 && axl > 0) || ayh > 0xffe00000 || (ayh === 0xffe00000 && ayl > 0)) return x + y;
      if (axh === 0x7fe00000 && axl === 0) return 1.0;
      if ((axh < 0x7fe00000) === !(yh >>> 31)) return 0.0;
      return y * y;
    }
    if (zeroinfnan(xh, xl)) {
      let x2 = x * x;
      let neg = false;
      if ((xh >>> 31) && checkint(yh, yl) === 1) { x2 = -x2; neg = true; }
      if ((xh & 0x7fffffff) === 0 && xl === 0) {
        if (yh >>> 31) return neg ? -Infinity : Infinity;
        return x2;
      }
      return (yh >>> 31) ? 1 / x2 : x2;
    }
    if (xh >>> 31) {
      const yint = checkint(yh, yl);
      if (yint === 0) return NaN;
      if (yint === 1) signBias = 0x80000;
      ixh = xh & 0x7fffffff;
    }
    if ((((topy & 0x7ff) - 0x3be) >>> 0) >= 0x80) {
      if (ixh === 0x3ff00000 && ixl === 0) return 1.0;
      const mayor1 = ixh > 0x3ff00000 || (ixh === 0x3ff00000 && ixl > 0);
      if ((topy & 0x7ff) < 0x3be) return mayor1 ? 1.0 + y : 1.0 - y;
      return mayor1 === (topy < 0x800) ? Infinity : 0;
    }
    if ((topx & 0x7ff) === 0) {
      F[0] = x * 4503599627370496.0;
      ixh = (U[1] & 0x7fffffff) - 0x03400000 >>> 0;
      ixl = U[0];
    }
  }
  if (yh === 0x3ff00000 && yl === 0) return x;
  if (ixh === 0x3ff00000 && ixl === 0) return signBias === 0 ? 1.0 : -1.0;
  // log_inline
  const tmph = (ixh - 0x3fe69555) >>> 0;
  const i = (tmph >>> 13) & 0x7f;
  const k = (tmph | 0) >> 20;
  const z = dbl((ixh - (tmph & 0xfff00000)) >>> 0, ixl);
  const r = fma(P_INVC[i], z, -1.0);
  const t1 = k * P_LN2HI + P_LOGC[i];
  const ar = r * -0.5;
  const ar2 = ar * r;
  const lo3 = fma(ar, r, -ar2);
  const lo1 = k * P_LN2LO + P_LOGCT[i];
  const t2 = t1 + r;
  const lo2 = (t1 - t2) + r;
  const s123 = lo3 + (lo1 + lo2);
  const pa = r * P_A;
  const hi = ar2 + t2;
  const lo4 = (t2 - hi) + ar2;
  const s1234 = s123 + lo4;
  const q1 = (r * P_C - P_D) * ar2;
  const q0 = r * P_E - P_F;
  let q = (P_B - pa) + q1;
  q = q * ar2 + q0;
  const p = q * (ar2 * r);
  const lo = s1234 + p;
  const lhi = lo + hi;
  // y * log(x) en doble-doble y exp
  const ehi = lhi * y;
  const f = fma(y, lhi, -ehi);
  const cola = (hi - lhi) + lo;
  const elo = f + cola * y;
  return expInline(ehi, elo, signBias);
}

// ---------------------------------------------------------------- asin
// Ruta FMA de ucrtbase!asin (aproximación racional en y² o, para |x| >= 0.5, en
// r = (1-|x|)/2 con s = sqrt(r) y corrección de la parte baja de s).
const AS_P = [K('3f0951665d321061'), K('3f51e5f887a62135'), K('3fac28d390c29690'),
  K('3fd1a2bec1b7ef59'), K('3fdc7b297e269eac'), K('3fcd1e4180029834')];
const AS_Q = [K('3fbb1a422982ce76'), K('3fee324ab418f78d'), K('40062021571dccfc'),
  K('400a4646f903cdea'), K('3ff5d6b12001f228')];
const AS_PIO2_LO = K('3c91a62633145c07'), AS_PIO4_HI = K('3fe921fb54442d18'),
  AS_PIO2 = K('3ff921fb54442d18');

export function asin(x) {
  if (x !== x) return x;
  F[0] = x;
  const e = (U[1] >>> 20) & 0x7ff;
  if (e < 0x3e3) return x;
  if (e >= 0x3ff) {
    if (x === 1) return AS_PIO2;
    if (x === -1) return -AS_PIO2;
    return NaN;
  }
  const neg = x < 0;
  const y = neg ? -x : x;
  let grande = false, s = 0, r;
  if (e >= 0x3fe) {
    r = (1.0 - y) * 0.5;
    s = Math.sqrt(r);
    grande = true;
  } else r = y * y;
  let p = AS_P[0];
  p = fma(p, r, AS_P[1]); p = fma(p, r, -AS_P[2]); p = fma(p, r, AS_P[3]);
  p = fma(p, r, -AS_P[4]); p = fma(p, r, AS_P[5]);
  const pr = p * r;
  let q = AS_Q[0];
  q = fma(q, r, -AS_Q[1]); q = fma(q, r, AS_Q[2]); q = fma(q, r, -AS_Q[3]); q = fma(q, r, AS_Q[4]);
  const u = pr / q;
  let v;
  if (!grande) v = fma(u, y, y);
  else {
    F[0] = s; U[0] = 0; const c = F[0];
    const corr = fma(-c, c, r) / (c + s);
    let w = AS_PIO2_LO - (corr + corr);
    w = fma(u, s + s, -w);
    v = AS_PIO4_HI - (w - (AS_PIO4_HI - (c + c)));
  }
  return neg ? -v : v;
}
