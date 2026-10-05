// CSV como los escribe pandas (DataFrame.to_csv con float_format='%0.5f'): el tipo de
// cada columna se decide con los valores de ese volcado, como en el DataFrame original.

// '%0.5f' % x de Python (redondeo correcto, empates al par)
export function fmt5(x) {
  if (x !== x) return '';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (Object.is(x, -0)) return '-0.00000';
  const a = Math.abs(x);
  const t64 = a * 64;
  if (Number.isInteger(t64) && t64 % 2 === 1 && a < 2 ** 40) {
    // empate exacto en la 6ª cifra: x*1e5 = j*1562.5
    let n = Math.floor(a * 100000);
    if (n % 2 === 1) n += 1;
    const s = String(n).padStart(6, '0');
    return `${x < 0 ? '-' : ''}${s.slice(0, -5)}.${s.slice(-5)}`;
  }
  return x.toFixed(5);
}
const strLista = (l) => `[${l.join(', ')}]`;
function csvCampo(s) { return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

// Formatea una columna de pandas a partir de sus valores (tipo por columna, como el
// DataFrame que se crea en cada volcado).
export function columna(vals) {
  const noNulos = vals.filter((v) => v !== null && v !== undefined);
  if (!noNulos.length) return vals.map(() => '');
  const t = noNulos[0].t;
  if (noNulos.every((v) => v.t === 'i')) {
    if (noNulos.length === vals.length) return vals.map((v) => String(v.v));
    return vals.map((v) => (v === null ? '' : fmt5(v.v)));
  }
  if (noNulos.every((v) => v.t === 'f' || v.t === 'i')) return vals.map((v) => (v === null ? '' : fmt5(v.v)));
  return vals.map((v) => {
    if (v === null) return '';
    if (v.t === 'b') return v.v ? 'True' : 'False';
    if (v.t === 'l') return strLista(v.v);
    if (v.t === 'f') return String(v.v); // no ocurre en los CSV del modelo
    return String(v.v);
  });
  void t;
}
export const F = (v) => ({ t: 'f', v });
export const I = (v) => ({ t: 'i', v });
export const S = (v) => ({ t: 's', v });
export const B = (v) => ({ t: 'b', v });
export const L = (v) => ({ t: 'l', v });

// (las columnas de números, enteros o '%0.5f', nunca llevan comas, comillas ni saltos de línea: no se miran)
export function tablaCSV(filas, columnas) {
  const valores = columnas.map((c) => filas.map((f) => (c in f ? f[c] : null)));
  const numerica = valores.map((vs) => vs.every((v) => v === null || v === undefined || v.t === 'i' || v.t === 'f'));
  const cols = valores.map((vs, k) => { const c = columna(vs); return numerica[k] ? c : c.map(csvCampo); });
  return filas.map((_, i) => cols.map((c) => c[i]).join(','));
}

