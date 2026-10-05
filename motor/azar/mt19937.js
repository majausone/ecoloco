// Mersenne Twister MT19937 y los dos usos que hace de él el original:
//  - el módulo `random` de Python (CPython 3.12, _randommodule.c y random.py)
//  - `numpy.random.RandomState` (el generador global "legacy" de numpy 2.5)
// Todo reproducido bit a bit, incluido el orden en que se gastan los números.

import { log, exp, pow } from '../num/ucrt.js?v=202610052338';

const N = 624, M = 397;
const MATRIX_A = 0x9908b0df, UPPER = 0x80000000, LOWER = 0x7fffffff;

export class MT19937 {
  constructor() {
    this.mt = new Uint32Array(N);
    this.pos = N;
  }

  // init_genrand (= mt19937_seed de numpy)
  initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    this.pos = N;
  }

  initByArray(key) {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    let k = N > key.length ? N : key.length;
    for (; k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (k = N - 1; k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.pos = N;
  }

  generar() {
    const mt = this.mt;
    let y, i;
    for (i = 0; i < N - M; i++) {
      y = (mt[i] & UPPER) | (mt[i + 1] & LOWER);
      mt[i] = mt[i + M] ^ (y >>> 1) ^ ((y & 1) ? MATRIX_A : 0);
    }
    for (; i < N - 1; i++) {
      y = (mt[i] & UPPER) | (mt[i + 1] & LOWER);
      mt[i] = mt[i + (M - N)] ^ (y >>> 1) ^ ((y & 1) ? MATRIX_A : 0);
    }
    y = (mt[N - 1] & UPPER) | (mt[0] & LOWER);
    mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ ((y & 1) ? MATRIX_A : 0);
    this.pos = 0;
  }

  nextUint32() {
    if (this.pos >= N) this.generar();
    let y = this.mt[this.pos++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  // genrand_res53: (a*2^26 + b) / 2^53 con a = 27 bits, b = 26 bits
  nextDouble() {
    const a = this.nextUint32() >>> 5, b = this.nextUint32() >>> 6;
    return (a * 67108864.0 + b) / 9007199254740992.0;
  }

  getEstado() { return { mt: Array.from(this.mt), pos: this.pos }; }
  setEstado(e) { this.mt.set(e.mt); this.pos = e.pos; }
}

// Separa un entero no negativo (Number o BigInt) en palabras de 32 bits, la menos
// significativa primero (como _PyLong_AsByteArray little endian / numpy).
function palabras32(n) {
  let b = BigInt(n);
  if (b < 0n) b = -b;
  if (b === 0n) return [0];
  const out = [];
  while (b > 0n) { out.push(Number(b & 0xffffffffn)); b >>= 32n; }
  return out;
}

// ------------------------------------------------------------ random de Python
export class PyRandom {
  constructor(semilla = 0) {
    this.mt = new MT19937();
    this.seed(semilla);
  }

  // random.seed(int): init_by_array con |n| troceado en palabras de 32 bits
  seed(n) {
    this.mt.initByArray(palabras32(n));
    this.gaussNext = null;
  }

  random() { return this.mt.nextDouble(); }

  getrandbits(k) {
    if (k <= 32) return this.mt.nextUint32() >>> (32 - k);
    // k > 32: palabras de 32 bits de menos a más significativa
    let r = 0n, desplaz = 0n;
    let restantes = k;
    while (restantes > 0) {
      let w = this.mt.nextUint32();
      if (restantes < 32) w >>>= 32 - restantes;
      r |= BigInt(w) << desplaz;
      desplaz += 32n;
      restantes -= 32;
    }
    return r;
  }

  // _randbelow_with_getrandbits
  randbelow(n) {
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }

  choice(seq) {
    if (!seq.length) throw new Error('Cannot choose from an empty sequence');
    return seq[this.randbelow(seq.length)];
  }

  getEstado() { return { mt: this.mt.getEstado() }; }
  setEstado(e) { this.mt.setEstado(e.mt); }
}

// ------------------------------------------------- numpy.random.RandomState (legacy)
export class RandomState {
  constructor(semilla = 0) {
    this.mt = new MT19937();
    this.seed(semilla);
  }

  // np.random.seed(int): mt19937_seed (= init_genrand); reinicia el gauss guardado
  seed(n) {
    if (Array.isArray(n)) this.mt.initByArray(n.map((v) => v >>> 0));
    else this.mt.initGenrand(Number(n) >>> 0);
    this.hasGauss = false;
    this.gauss = 0.0;
  }

  random_sample() { return this.mt.nextDouble(); }

  // legacy_gauss: método polar con el segundo valor guardado
  legacyGauss() {
    if (this.hasGauss) {
      const t = this.gauss;
      this.hasGauss = false;
      this.gauss = 0.0;
      return t;
    }
    let x1, x2, r2;
    do {
      x1 = 2.0 * this.mt.nextDouble() - 1.0;
      x2 = 2.0 * this.mt.nextDouble() - 1.0;
      r2 = x1 * x1 + x2 * x2;
    } while (r2 >= 1.0 || r2 === 0.0);
    const f = Math.sqrt(-2.0 * log(r2) / r2);
    this.gauss = f * x1;
    this.hasGauss = true;
    return f * x2;
  }

  normal(loc = 0.0, scale = 1.0) { return loc + scale * this.legacyGauss(); }

  // ---- binomial (legacy_random_binomial; la caché solo evita recalcular constantes)
  binomialInversion(n, p) {
    const q = 1.0 - p;
    const qn = exp(n * log(q));
    const np = n * p;
    const bound = Math.trunc(Math.min(n, np + 10.0 * Math.sqrt(np * q + 1)));
    let X = 0;
    let px = qn;
    let U = this.mt.nextDouble();
    while (U > px) {
      X++;
      if (X > bound) {
        X = 0;
        px = qn;
        U = this.mt.nextDouble();
      } else {
        U -= px;
        px = ((n - X + 1) * p * px) / (X * q);
      }
    }
    return X;
  }

  binomialBtpe(n, p) {
    const r = Math.min(p, 1.0 - p);
    const q = 1.0 - r;
    const fm = n * r + r;
    const m = Math.floor(fm);
    const p1 = Math.floor(2.195 * Math.sqrt(n * r * q) - 4.6 * q) + 0.5;
    const xm = m + 0.5;
    const xl = xm - p1;
    const xr = xm + p1;
    const c = 0.134 + 20.5 / (15.3 + m);
    let a = (fm - xl) / (fm - xl * r);
    const laml = a * (1.0 + a / 2.0);
    a = (xr - fm) / (xr * q);
    const lamr = a * (1.0 + a / 2.0);
    const p2 = p1 * (1.0 + 2.0 * c);
    const p3 = p2 + c / laml;
    const p4 = p3 + c / lamr;
    let u, v, y, x, k;
    for (;;) {
      // Step10
      const nrq = n * r * q;
      u = this.mt.nextDouble() * p4;
      v = this.mt.nextDouble();
      if (!(u > p1)) {
        y = Math.floor(xm - p1 * v + u);
        break; // Step60
      }
      if (!(u > p2)) { // Step20
        x = xl + (u - p1) / c;
        v = v * c + 1.0 - Math.abs(m - x + 0.5) / p1;
        if (v > 1.0) continue;
        y = Math.floor(x);
      } else if (!(u > p3)) { // Step30
        y = Math.floor(xl + log(v) / laml);
        if (y < 0 || v === 0.0) continue;
        v = v * (u - p2) * laml;
      } else { // Step40
        y = Math.floor(xr - log(v) / lamr);
        if (y > n || v === 0.0) continue;
        v = v * (u - p3) * lamr;
      }
      // Step50
      k = Math.abs(y - m);
      if (!((k > 20) && (k < ((nrq) / 2.0 - 1)))) {
        const s = r / q;
        const aa = s * (n + 1);
        let F = 1.0;
        if (m < y) {
          for (let i = m + 1; i <= y; i++) F *= (aa / i - s);
        } else if (m > y) {
          for (let i = y + 1; i <= m; i++) F /= (aa / i - s);
        }
        if (v > F) continue;
        break;
      }
      // Step52
      const rho = (k / nrq) * ((k * (k / 3.0 + 0.625) + 0.16666666666666666) / nrq + 0.5);
      const t = -k * k / (2 * nrq);
      const A = log(v);
      if (A < (t - rho)) break;
      if (A > (t + rho)) continue;
      const x1 = y + 1, f1 = m + 1, z = n + 1 - m, w = n - y + 1;
      const x2 = x1 * x1, f2 = f1 * f1, z2 = z * z, w2 = w * w;
      const cota = xm * log(f1 / x1) + (n - m + 0.5) * log(z / w) + (y - m) * log(w * r / (x1 * q)) +
        (13680. - (462. - (132. - (99. - 140. / f2) / f2) / f2) / f2) / f1 / 166320. +
        (13680. - (462. - (132. - (99. - 140. / z2) / z2) / z2) / z2) / z / 166320. +
        (13680. - (462. - (132. - (99. - 140. / x2) / x2) / x2) / x2) / x1 / 166320. +
        (13680. - (462. - (132. - (99. - 140. / w2) / w2) / w2) / w2) / w / 166320.;
      if (A > cota) continue;
      break;
    }
    // Step60
    if (p > 0.5) y = n - y;
    return y;
  }

  binomial1(n, p) {
    if (!(p >= 0 && p <= 1) || n < 0) throw new Error('binomial: parámetros fuera de rango');
    if (p <= 0.5) {
      if (p * n <= 30.0) return this.binomialInversion(n, p);
      return this.binomialBtpe(n, p);
    }
    const q = 1.0 - p;
    if (q * n <= 30.0) return n - this.binomialInversion(n, q);
    return n - this.binomialBtpe(n, q);
  }

  // np.random.binomial(n, p) con n y/o p arrays: recorre en orden C
  binomial(n, p) {
    if (typeof n === 'number' && typeof p === 'number') return this.binomial1(n, p);
    const ns = typeof n === 'number' ? null : n;
    const ps = typeof p === 'number' ? null : p;
    const len = (ns || ps).length;
    const out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = this.binomial1(ns ? ns[i] : n, ps ? ps[i] : p);
    return out;
  }

  // random_interval (máscara y rechazo con palabras de 32 bits)
  randomInterval(max) {
    if (max === 0) return 0;
    let mask = max;
    mask |= mask >>> 1; mask |= mask >>> 2; mask |= mask >>> 4; mask |= mask >>> 8; mask |= mask >>> 16;
    mask >>>= 0;
    let v;
    while ((v = (this.mt.nextUint32() & mask) >>> 0) > max);
    return v;
  }

  permutation(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i >= 1; i--) {
      const j = this.randomInterval(i);
      const t = arr[j]; arr[j] = arr[i]; arr[i] = t;
    }
    return arr;
  }

  // randint(0, alto) legacy: rechazo con máscara sobre palabras de 32 bits
  randint(alto, cuantos) {
    const rng = alto - 1;
    let mask = rng;
    mask |= mask >>> 1; mask |= mask >>> 2; mask |= mask >>> 4; mask |= mask >>> 8; mask |= mask >>> 16;
    mask >>>= 0;
    const out = [];
    for (let i = 0; i < cuantos; i++) {
      if (rng === 0) { out.push(0); continue; }
      let v;
      while ((v = (this.mt.nextUint32() & mask) >>> 0) > rng);
      out.push(v);
    }
    return out;
  }

  // choice(a, size, replace=False) sin p: permutation(len)[:size]
  choiceSinReemplazo(a, size) {
    const idx = this.permutation(a.length).slice(0, size);
    return idx.map((i) => a[i]);
  }

  // choice(a, size, replace=True) sin p
  choiceConReemplazo(a, size) {
    return this.randint(a.length, size).map((i) => a[i]);
  }

  // choice(a, p=pesos) con un solo valor: cdf acumulada, normalizada y searchsorted 'right'
  choiceConPesos(a, pesos) {
    const cdf = new Float64Array(pesos.length);
    let s = 0;
    for (let i = 0; i < pesos.length; i++) { s += pesos[i]; cdf[i] = s; }
    const ult = cdf[cdf.length - 1];
    for (let i = 0; i < cdf.length; i++) cdf[i] /= ult;
    const u = this.mt.nextDouble();
    let lo = 0, hi = cdf.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (cdf[mid] <= u) lo = mid + 1; else hi = mid; }
    return a[lo];
  }

  getEstado() { return { mt: this.mt.getEstado(), hasGauss: this.hasGauss, gauss: this.gauss }; }
  setEstado(e) { this.mt.setEstado(e.mt); this.hasGauss = e.hasGauss; this.gauss = e.gauss; }
}

export { pow as _pow };
