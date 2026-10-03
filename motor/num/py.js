// Semántica numérica de CPython 3.12 que importa para dar los mismos bits.

// sum(iterable) de floats exactos de Python (no np.float64): desde 3.12 usa la suma
// compensada de Neumaier (bltinmodule.c, builtin_sum_impl).
export function sumaPy(valores) {
  let f = 0.0, c = 0.0, primero = true;
  for (const x of valores) {
    if (primero) { f = 0 + x; primero = false; continue; } // 0 (int) + float -> float
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x;
    else c += (x - t) + f;
    f = t;
  }
  if (primero) return 0;
  if (c && Number.isFinite(c)) f += c;
  return f;
}

// sum() de escalares numpy (np.float64) o arrays: suma secuencial simple desde 0
export function sumaNp(valores) {
  let r = 0, primero = true;
  for (const x of valores) { r = primero ? 0 + x : r + x; primero = false; }
  return r;
}

// statistics.mean de floats: media exacta en racionales, redondeada una sola vez
export function mediaEstadistica(valores) {
  if (!valores.length) throw new Error('mean requires at least one data point');
  // cada double es m * 2^e exacto: se suma como fracción con denominador potencia de 2
  let num = 0n, exp2 = 0;
  const partes = valores.map((v) => {
    if (!Number.isFinite(v)) throw new Error('mediaEstadistica: valores no finitos');
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, v);
    const bits = b.getBigUint64(0);
    const signo = bits >> 63n ? -1n : 1n;
    const ex = Number((bits >> 52n) & 0x7ffn);
    let man = bits & ((1n << 52n) - 1n);
    let e;
    if (ex === 0) e = -1074; else { man |= 1n << 52n; e = ex - 1075; }
    return { m: signo * man, e };
  });
  const emin = Math.min(...partes.map((p) => p.e));
  for (const p of partes) num += p.m << BigInt(p.e - emin);
  exp2 = emin;
  // valor = num * 2^exp2 / n  -> redondear a double correctamente
  return racionalADouble(num, BigInt(valores.length), exp2);
}

// num/den * 2^e redondeado al double más cercano (empates a par)
function racionalADouble(num, den, e) {
  if (num === 0n) return 0;
  const neg = num < 0n;
  if (neg) num = -num;
  // normalizar para obtener 54 bits de cociente + resto
  let k = num.toString(2).length - den.toString(2).length;
  let sh = 55 - k;
  let q, r;
  const calc = () => {
    if (sh >= 0) { q = (num << BigInt(sh)) / den; r = (num << BigInt(sh)) % den; } else {
      const d2 = den << BigInt(-sh); q = num / d2; r = num % d2;
    }
  };
  calc();
  while (q >= (1n << 55n)) { sh--; calc(); }
  while (q < (1n << 54n)) { sh++; calc(); }
  // q tiene 55 bits: 53 de mantisa + guarda + 1; resto r adicional
  const pegajoso = r !== 0n || (q & 1n) === 1n;
  let man = q >> 2n;
  const mitad = (q & 2n) === 2n;
  const exp = e - sh + 2;
  if (mitad && (pegajoso || (man & 1n) === 1n)) man += 1n;
  const v = Number(man) * 2 ** exp;
  return neg ? -v : v;
}

// sum() de CPython 3.12 con sumandos que pueden ser float de Python (marca false) o
// np.float64 (marca true): suma compensada de Neumaier mientras los sumandos son float
// exactos; al llegar el primer np.float64 vuelca la compensación y sigue con sumas simples.
export function sumaMixta(valores, esNp) {
  const n = valores.length;
  if (n === 0) return 0;
  let i = 0;
  let f = 0 + valores[0];
  i = 1;
  if (!esNp[0]) {
    let c = 0.0;
    for (; i < n; i++) {
      if (esNp[i]) break;
      const x = valores[i];
      const t = f + x;
      if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x;
      else c += (x - t) + f;
      f = t;
    }
    if (c && Number.isFinite(c)) f += c;
  }
  for (; i < n; i++) f += valores[i];
  return f;
}
