// Operaciones de numpy con su mismo orden de redondeo.
//
// Lo que importa para dar los mismos bits es el ORDEN de las sumas y qué operaciones van
// fusionadas (FMA). Reglas verificadas contra numpy 2.5.3 / OpenBLAS 0.3.34 en la máquina
// de referencia (ver pruebas/np.test.js):
//  * suma 1D o eje más interno contiguo: 0 + suma por pares (8 acumuladores, bloque 128).
//  * suma por un eje que no es el más interno: secuencial, empezando en 0.
//  * axis=None de un array contiguo: como 1D sobre el aplanado.
//  * np.dot vector·vector: ddot de OpenBLAS (16 acumuladores con FMA y cola sin FMA).
//  * np.dot matriz·vector / vector·matriz: dgemv_n de OpenBLAS.
//  * ndarray ** escalar: atajos -1 (1/x), 0 (1), 0.5 (sqrt), 1 (x), 2 (x*x); si no, pow.
//    Un escalar numpy o float de Python ** algo usa siempre pow (sin atajos).

import { fma } from './fma.js?v=202610032043';
import { pow } from './ucrt.js?v=202610032043';

// ------------------------------------------------------------------ sumas
export function sumaPares(a, off, n, paso) {
  if (n < 8) {
    let res = -0.0;
    for (let i = 0; i < n; i++) res += a[off + i * paso];
    return res;
  }
  if (n <= 128) {
    let r0 = a[off], r1 = a[off + paso], r2 = a[off + 2 * paso], r3 = a[off + 3 * paso];
    let r4 = a[off + 4 * paso], r5 = a[off + 5 * paso], r6 = a[off + 6 * paso], r7 = a[off + 7 * paso];
    let i = 8;
    const lim = n - (n % 8);
    for (; i < lim; i += 8) {
      const b = off + i * paso;
      r0 += a[b]; r1 += a[b + paso]; r2 += a[b + 2 * paso]; r3 += a[b + 3 * paso];
      r4 += a[b + 4 * paso]; r5 += a[b + 5 * paso]; r6 += a[b + 6 * paso]; r7 += a[b + 7 * paso];
    }
    let res = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7));
    for (; i < n; i++) res += a[off + i * paso];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return sumaPares(a, off, n2, paso) + sumaPares(a, off + n2 * paso, n - n2, paso);
}

// np.sum(a) de un array contiguo (o de una lista convertida a array)
export function suma(a) { return 0.0 + sumaPares(a, 0, a.length, 1); }

// np.sum(a, axis) para un array C-contiguo de forma `forma`.
// Devuelve { data, forma } sin el eje reducido.
export function sumaEje(a, forma, eje) {
  if (eje < 0) eje += forma.length;
  const n = forma[eje];
  const exterior = forma.slice(0, eje).reduce((x, y) => x * y, 1);
  const interior = forma.slice(eje + 1).reduce((x, y) => x * y, 1);
  const out = new Float64Array(exterior * interior);
  // Si todo lo que hay dentro del eje tiene tamaño 1, numpy lo trata como eje interno.
  if (interior === 1) {
    for (let e = 0; e < exterior; e++) out[e] = 0.0 + sumaPares(a, e * n, n, 1);
  } else {
    for (let e = 0; e < exterior; e++) {
      const bo = e * interior, bi = e * n * interior;
      for (let j = 0; j < interior; j++) out[bo + j] = 0.0;
      for (let k = 0; k < n; k++) {
        const b = bi + k * interior;
        for (let j = 0; j < interior; j++) out[bo + j] += a[b + j];
      }
    }
  }
  const f = forma.slice();
  f.splice(eje, 1);
  return { data: out, forma: f };
}

const sinNan = (a) => Float64Array.from(a, (v) => (v !== v ? 0 : v));

export function nansuma(a) { return suma(sinNan(a)); }
export function nansumaEje(a, forma, eje) { return sumaEje(sinNan(a), forma, eje); }

export function media(a) { return suma(a) / a.length; }
export function mediaEje(a, forma, eje) {
  const r = sumaEje(a, forma, eje);
  const n = forma[eje < 0 ? eje + forma.length : eje];
  for (let i = 0; i < r.data.length; i++) r.data[i] /= n;
  return r;
}

// np.nanmean(a, axis): suma sin NaN / número de no-NaN (0/0 -> NaN)
export function nanmediaEje(a, forma, eje) {
  const r = sumaEje(sinNan(a), forma, eje);
  const cuenta = sumaEje(Float64Array.from(a, (v) => (v !== v ? 0 : 1)), forma, eje);
  for (let i = 0; i < r.data.length; i++) r.data[i] = r.data[i] / cuenta.data[i];
  return r;
}

export function nanmaxEje(a, forma, eje) { return extremoEje(a, forma, eje, (x, y) => x > y); }
export function nanminEje(a, forma, eje) { return extremoEje(a, forma, eje, (x, y) => x < y); }
function extremoEje(a, forma, eje, mejor) {
  if (eje < 0) eje += forma.length;
  const n = forma[eje];
  const exterior = forma.slice(0, eje).reduce((x, y) => x * y, 1);
  const interior = forma.slice(eje + 1).reduce((x, y) => x * y, 1);
  const out = new Float64Array(exterior * interior).fill(NaN);
  for (let e = 0; e < exterior; e++) {
    for (let j = 0; j < interior; j++) {
      let m = NaN;
      for (let k = 0; k < n; k++) {
        const v = a[(e * n + k) * interior + j];
        if (v !== v) continue;
        if (m !== m || mejor(v, m)) m = v;
      }
      out[e * interior + j] = m;
    }
  }
  const f = forma.slice();
  f.splice(eje, 1);
  return { data: out, forma: f };
}
export function nanmax(a) { let m = NaN; for (const v of a) if (v === v && (m !== m || v > m)) m = v; return m; }
export function nanmin(a) { let m = NaN; for (const v of a) if (v === v && (m !== m || v < m)) m = v; return m; }

// np.cumsum: secuencial
export function cumsum(a) {
  const out = new Float64Array(a.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) { s = i === 0 ? a[0] : s + a[i]; out[i] = s; }
  return out;
}

// ------------------------------------------------------------------ BLAS
// ddot de OpenBLAS (núcleo Haswell/Zen): 16 acumuladores con FMA para la parte múltiplo
// de 16, reducción en árbol fija y cola secuencial sin FMA.
export function ddot(x, y, n = x.length, ox = 0, sx = 1, oy = 0, sy = 1) {
  let dot = 0.0;
  const n1 = n & -16;
  if (n1) {
    const acc = new Float64Array(16);
    for (let i = 0; i < n1; i++) acc[i & 15] = fma(x[ox + i * sx], y[oy + i * sy], acc[i & 15]);
    const a0 = acc[0] + acc[2], a1 = acc[1] + acc[3];
    const b0 = acc[4] + acc[6], b1 = acc[5] + acc[7];
    const c0 = acc[8] + acc[10], c1 = acc[9] + acc[11];
    const d0 = acc[12] + acc[14], d1 = acc[13] + acc[15];
    const e0 = a0 + b0, e1 = a1 + b1, f0 = c0 + d0, f1 = c1 + d1;
    const g0 = e0 + f0, g1 = e1 + f1;
    dot = g0 + g1;
  }
  for (let i = n1; i < n; i++) dot += y[oy + i * sy] * x[ox + i * sx];
  return dot;
}

// y = A x con A de m filas y n columnas, A[i, j] = A(i, j) dado por la función `elem`.
// Reproduce dgemv_n de OpenBLAS (y numpy delega aquí tanto mat·vec como vec·mat).
function dgemvN(m, n, elem, x) {
  const y = new Float64Array(m);
  if (m === 1) {
    // numpy usa ddot para (1, n)·(n,)
    const fila = new Float64Array(n);
    for (let j = 0; j < n; j++) fila[j] = elem(0, j);
    y[0] = ddot(fila, x);
    return y;
  }
  if (m === 2 || m === 3) {
    for (let i = 0; i < m; i++) {
      let t = 0.0, c = 0;
      const lim = n & -4;
      for (; c < lim; c += 4) {
        t = t + (elem(i, c) * x[c] + elem(i, c + 1) * x[c + 1]);
        t = t + (elem(i, c + 2) * x[c + 2] + elem(i, c + 3) * x[c + 3]);
      }
      for (; c < n; c++) t = t + elem(i, c) * x[c];
      y[i] = 0.0 + t;
    }
    return y;
  }
  const m3 = m & 3, mm = m - m3;
  const n1 = n >> 2, n2 = n & 3;
  for (let i = 0; i < mm; i++) {
    let yi = 0.0, c = 0;
    for (let b = 0; b < n1; b++, c += 4) {
      let t4 = elem(i, c) * x[c];
      t4 = fma(elem(i, c + 2), x[c + 2], t4);
      let t5 = elem(i, c + 1) * x[c + 1];
      t5 = fma(elem(i, c + 3), x[c + 3], t5);
      yi = yi + (t4 + t5);
    }
    if (n2 & 2) { yi = yi + (elem(i, c) * x[c] + elem(i, c + 1) * x[c + 1]); c += 2; }
    if (n2 & 1) yi = yi + elem(i, c) * x[c];
    y[i] = yi;
  }
  for (let i = mm; i < m; i++) {
    let t = 0.0;
    for (let c = 0; c < n; c++) t = t + elem(i, c) * x[c];
    y[i] = 0.0 + t;
  }
  return y;
}

// np.dot(v, M) con v de k elementos y M (k, n) C-contigua -> n elementos
export function dotVecMat(v, M, k, n) {
  if (n === 1) return Float64Array.of(ddot(v, M, k, 0, 1, 0, 1));
  return dgemvN(n, k, (i, j) => M[j * n + i], v);
}

// np.dot(A, v) con A (m, n) dada por elem(i, j) (cualquier orden en memoria)
export function dotMatVec(m, n, elem, v) { return dgemvN(m, n, elem, v); }

// np.linalg.norm de un vector: sqrt(dot(x, x))
export function norma(x) { return Math.sqrt(0.0 + ddot(x, x)); }

// ------------------------------------------------------------------ potencias
export function potArr(x, e) {
  if (e === -1) return 1.0 / x;
  if (e === 0) return 1.0;
  if (e === 0.5) return Math.sqrt(x);
  if (e === 1) return x;
  if (e === 2) return x * x;
  return pow(x, e);
}

// ------------------------------------------------------------------ gradient
// np.gradient(f, x, axis=0) con coordenadas no uniformes y edge_order=1, para f de forma
// (n, m) C-contigua.
export function gradienteEje0(f, n, m, x) {
  const out = new Float64Array(n * m);
  for (let j = 0; j < m; j++) {
    if (n === 1) throw new Error('gradient: hacen falta al menos 2 puntos');
    out[j] = (f[m + j] - f[j]) / (x[1] - x[0]);
    out[(n - 1) * m + j] = (f[(n - 1) * m + j] - f[(n - 2) * m + j]) / (x[n - 1] - x[n - 2]);
  }
  for (let i = 1; i < n - 1; i++) {
    const dx1 = x[i] - x[i - 1], dx2 = x[i + 1] - x[i];
    const a = -(dx2) / (dx1 * (dx1 + dx2));
    const b = (dx2 - dx1) / (dx1 * dx2);
    const c = dx1 / (dx2 * (dx1 + dx2));
    for (let j = 0; j < m; j++) {
      out[i * m + j] = a * f[(i - 1) * m + j] + b * f[i * m + j] + c * f[(i + 1) * m + j];
    }
  }
  return out;
}

export function argmax(a) {
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== a[i]) return i;
    if (a[i] > a[k]) k = i;
  }
  return k;
}
