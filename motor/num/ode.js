// scipy.integrate.solve_ivp(fun, (t0, tf), y0) con el método por defecto RK45
// (scipy 1.18.1: _ivp/rk.py, common.py, base.py, ivp.py), reproduciendo cada operación:
// los productos K·a van por dgemv de OpenBLAS y la norma por ddot, como en numpy.

import { pow } from './ucrt.js?v=202610052338';
import { dotMatVec, ddot } from './np.js?v=202610052338';
import { f64 } from './f64.js?v=202610052338';

const SAFETY = 0.9, MIN_FACTOR = 0.2, MAX_FACTOR = 10;
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1];
const A = [[0, 0, 0, 0, 0], [1 / 5, 0, 0, 0, 0], [3 / 40, 9 / 40, 0, 0, 0], [44 / 45, -56 / 15, 32 / 9, 0, 0],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729, 0],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]];
const B = Float64Array.of(35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84);
const E = Float64Array.of(-71 / 57600, 0, 71 / 16695, -71 / 1920, 17253 / 339200, -22 / 525, 1 / 40);
const N_STAGES = 6;
const ERROR_EXPONENT = -1 / (4 + 1);

// norm(x) = np.linalg.norm(x) / x.size ** 0.5
function norma(x) { return Math.sqrt(0.0 + ddot(x, x)) / pow(x.length, 0.5); }

function siguiente(t) {
  // np.nextafter(t, +inf)
  if (t !== t || t === Infinity) return t;
  if (t === 0) return 5e-324;
  const b = new Float64Array([t]);
  const u = new BigInt64Array(b.buffer);
  u[0] += t > 0 ? 1n : -1n;
  return b[0];
}

export function solveIvpRK45(fun, t0, tf, y0, { rtol = 1e-3, atol = 1e-6 } = {}) {
  const n = y0.length;
  let nfev = 0;
  const f = (t, y) => { nfev++; return fun(t, y); };
  const direccion = tf !== t0 ? Math.sign(tf - t0) : 1;
  let t = t0;
  let y = f64(y0);
  let fy = f(t, y);
  // select_initial_step
  let hAbs;
  {
    const intervalo = Math.abs(tf - t0);
    if (n === 0) hAbs = Infinity;
    else if (intervalo === 0.0) hAbs = 0.0;
    else {
      const escala = f64(y, (v) => atol + Math.abs(v) * rtol);
      const d0 = norma(f64(y, (v, i) => v / escala[i]));
      const d1 = norma(f64(fy, (v, i) => v / escala[i]));
      let h0 = (d0 < 1e-05 || d1 < 1e-05) ? 1e-06 : 0.01 * d0 / d1;
      h0 = Math.min(h0, intervalo);
      const hd = h0 * direccion;
      const y1 = f64(y, (v, i) => v + hd * fy[i]);
      const f1 = f(t0 + h0 * direccion, y1);
      const d2 = norma(f64(f1, (v, i) => (v - fy[i]) / escala[i])) / h0;
      let h1;
      if (d1 <= 1e-15 && d2 <= 1e-15) h1 = Math.max(1e-06, h0 * 0.001);
      else h1 = pow(0.01 / Math.max(d1, d2), 1 / (4 + 1));
      hAbs = Math.min(100 * h0, h1, intervalo, Infinity);
    }
  }
  const K = Array.from({ length: N_STAGES + 1 }, () => new Float64Array(n));
  const ts = [t];
  let pasos = 0;
  while (true) {
    if (n === 0 || t === tf) break;
    // _step_impl
    const minStep = 10 * Math.abs(siguiente(t) - t);
    let h_abs = hAbs < minStep ? minStep : hAbs;
    let aceptado = false, rechazado = false;
    let tNew, yNew, fNew;
    while (!aceptado) {
      if (h_abs < minStep) throw new Error('Integration of soil module failed: Required step size is less than spacing between numbers.');
      let h = h_abs * direccion;
      tNew = t + h;
      if (direccion * (tNew - tf) > 0) tNew = tf;
      h = tNew - t;
      h_abs = Math.abs(h);
      // rk_step
      K[0].set(fy);
      for (let s = 1; s < N_STAGES; s++) {
        const a = A[s];
        const dy = dotMatVec(n, s, (i, j) => K[j][i], f64(a.slice(0, s)));
        const yy = new Float64Array(n);
        for (let i = 0; i < n; i++) yy[i] = y[i] + dy[i] * h;
        K[s].set(f(t + C[s] * h, yy));
      }
      const db = dotMatVec(n, N_STAGES, (i, j) => K[j][i], B);
      yNew = new Float64Array(n);
      for (let i = 0; i < n; i++) yNew[i] = y[i] + h * db[i];
      fNew = f(t + h, yNew);
      K[N_STAGES].set(fNew);
      const escala = f64(y, (v, i) => atol + Math.max(Math.abs(v), Math.abs(yNew[i])) * rtol);
      const err = dotMatVec(n, N_STAGES + 1, (i, j) => K[j][i], E);
      const errEsc = f64(err, (v, i) => (v * h) / escala[i]);
      const errNorm = norma(errEsc);
      if (errNorm < 1) {
        let factor = errNorm === 0 ? MAX_FACTOR : Math.min(MAX_FACTOR, SAFETY * pow(errNorm, ERROR_EXPONENT));
        if (rechazado) factor = Math.min(1, factor);
        h_abs *= factor;
        aceptado = true;
      } else {
        h_abs *= Math.max(MIN_FACTOR, SAFETY * pow(errNorm, ERROR_EXPONENT));
        rechazado = true;
      }
    }
    t = tNew;
    y = yNew;
    hAbs = h_abs;
    fy = fNew;
    ts.push(t);
    pasos++;
  }
  return { t, y, nfev, pasos, ts };
}
