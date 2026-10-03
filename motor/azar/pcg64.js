// numpy.random.default_rng(semilla): SeedSequence + PCG64 (XSL-RR 128/64) y las
// distribuciones de Generator que usa el original (random, gamma con zigurat).

import { log, exp, log1p, pow } from '../num/ucrt.js?v=202610032115';
import {
  KI_DOUBLE, WI_DOUBLE, FI_DOUBLE, KE_DOUBLE, WE_DOUBLE, FE_DOUBLE,
  ZIGGURAT_NOR_R, ZIGGURAT_NOR_INV_R, ZIGGURAT_EXP_R,
} from './zigurat.js?v=202610032115';

const M64 = (1n << 64n) - 1n;
const M128 = (1n << 128n) - 1n;
const MULT = (2549297995355413924n << 64n) | 4865540595714422341n;

const hexADouble = (h) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setBigUint64(0, BigInt('0x' + h));
  return dv.getFloat64(0);
};
const KI = KI_DOUBLE.map((h) => BigInt('0x' + h));
const WI = Float64Array.from(WI_DOUBLE, hexADouble);
const FI = Float64Array.from(FI_DOUBLE, hexADouble);
const KE = KE_DOUBLE.map((h) => BigInt('0x' + h));
const WE = Float64Array.from(WE_DOUBLE, hexADouble);
const FE = Float64Array.from(FE_DOUBLE, hexADouble);

// ------------------------------------------------------------------ SeedSequence
const INIT_A = 0x43b0d7e5, MULT_A = 0x931e8875, INIT_B = 0x8b51f9dd, MULT_B = 0x58f38ded;
const MIX_L = 0xca01f9dd, MIX_R = 0x4973f715;

function entropiaAPalabras(n) {
  let b = BigInt(n);
  if (b < 0n) throw new Error('expected non-negative integer');
  if (b === 0n) return [0];
  const out = [];
  while (b > 0n) { out.push(Number(b & 0xffffffffn)); b >>= 32n; }
  return out;
}

export function seedSequenceState(entropia, nPalabras64) {
  const ent = Array.isArray(entropia) ? entropia.flatMap(entropiaAPalabras) : entropiaAPalabras(entropia);
  const pool = new Uint32Array(4);
  let hc = INIT_A;
  const hashmix = (v) => {
    v = (v ^ hc) >>> 0;
    hc = Math.imul(hc, MULT_A) >>> 0;
    v = Math.imul(v, hc) >>> 0;
    v = (v ^ (v >>> 16)) >>> 0;
    return v;
  };
  const mix = (x, y) => {
    let r = (Math.imul(MIX_L, x) - Math.imul(MIX_R, y)) >>> 0;
    r = (r ^ (r >>> 16)) >>> 0;
    return r;
  };
  for (let i = 0; i < 4; i++) pool[i] = hashmix(i < ent.length ? ent[i] : 0);
  for (let s = 0; s < 4; s++) {
    for (let d = 0; d < 4; d++) if (s !== d) pool[d] = mix(pool[d], hashmix(pool[s]));
  }
  for (let s = 4; s < ent.length; s++) {
    for (let d = 0; d < 4; d++) pool[d] = mix(pool[d], hashmix(ent[s]));
  }
  // generate_state(n, uint64): 2n palabras de 32 bits, unidas en little endian
  const n32 = nPalabras64 * 2;
  const st = new Uint32Array(n32);
  let hb = INIT_B;
  for (let i = 0; i < n32; i++) {
    let v = pool[i % 4];
    v = (v ^ hb) >>> 0;
    hb = Math.imul(hb, MULT_B) >>> 0;
    v = Math.imul(v, hb) >>> 0;
    v = (v ^ (v >>> 16)) >>> 0;
    st[i] = v;
  }
  const out = [];
  for (let i = 0; i < nPalabras64; i++) out.push((BigInt(st[2 * i + 1]) << 32n) | BigInt(st[2 * i]));
  return out;
}

// ------------------------------------------------------------------ PCG64
export class PCG64 {
  constructor(semilla) {
    const v = seedSequenceState(semilla, 4);
    const initstate = (v[0] << 64n) | v[1];
    const initseq = (v[2] << 64n) | v[3];
    this.inc = ((initseq << 1n) | 1n) & M128;
    this.state = 0n;
    this.paso();
    this.state = (this.state + initstate) & M128;
    this.paso();
  }

  paso() { this.state = (this.state * MULT + this.inc) & M128; }

  nextUint64() {
    this.paso();
    const s = this.state;
    const x = ((s >> 64n) ^ s) & M64;
    const rot = Number(s >> 122n);
    return ((x >> BigInt(rot)) | (x << BigInt((64 - rot) & 63))) & M64;
  }

  nextDouble() { return Number(this.nextUint64() >> 11n) * (1.0 / 9007199254740992.0); }
}

// ------------------------------------------------------------------ Generator
export class Generator {
  constructor(semilla) { this.bg = new PCG64(semilla); }

  random() { return this.bg.nextDouble(); }

  standardExponential() {
    let ri = this.bg.nextUint64();
    ri >>= 3n;
    const idx = Number(ri & 0xffn);
    ri >>= 8n;
    const x = Number(ri) * WE[idx];
    if (ri < KE[idx]) return x;
    if (idx === 0) return ZIGGURAT_EXP_R - log1p(-this.bg.nextDouble());
    if ((FE[idx - 1] - FE[idx]) * this.bg.nextDouble() + FE[idx] < exp(-x)) return x;
    return this.standardExponential();
  }

  standardNormal() {
    for (;;) {
      let r = this.bg.nextUint64();
      const idx = Number(r & 0xffn);
      r >>= 8n;
      const sign = Number(r & 1n);
      const rabs = (r >> 1n) & 0x000fffffffffffffn;
      let x = Number(rabs) * WI[idx];
      if (sign) x = -x;
      if (rabs < KI[idx]) return x;
      if (idx === 0) {
        for (;;) {
          const xx = -ZIGGURAT_NOR_INV_R * log1p(-this.bg.nextDouble());
          const yy = -log1p(-this.bg.nextDouble());
          if (yy + yy > xx * xx) {
            return ((rabs >> 8n) & 1n) ? -(ZIGGURAT_NOR_R + xx) : ZIGGURAT_NOR_R + xx;
          }
        }
      } else if (((FI[idx - 1] - FI[idx]) * this.bg.nextDouble() + FI[idx]) < exp(-0.5 * x * x)) {
        return x;
      }
    }
  }

  standardGamma(shape) {
    if (shape === 1.0) return this.standardExponential();
    if (shape === 0.0) return 0.0;
    if (shape < 1.0) {
      for (;;) {
        const U = this.bg.nextDouble();
        const V = this.standardExponential();
        if (U <= 1.0 - shape) {
          const X = pow(U, 1. / shape);
          if (X <= V) return X;
        } else {
          const Y = -log((1 - U) / shape);
          const X = pow(1.0 - shape + shape * Y, 1. / shape);
          if (X <= (V + Y)) return X;
        }
      }
    }
    const b = shape - 1. / 3.;
    const c = 1. / Math.sqrt(9 * b);
    for (;;) {
      let X, V;
      do {
        X = this.standardNormal();
        V = 1.0 + c * X;
      } while (V <= 0.0);
      V = V * V * V;
      const U = this.bg.nextDouble();
      if (U < 1.0 - 0.0331 * (X * X) * (X * X)) return b * V;
      if (log(U) < 0.5 * X * X + b * (1. - V + log(V))) return b * V;
    }
  }

  gamma(shape, scale, size) {
    const out = new Float64Array(size);
    for (let i = 0; i < size; i++) out[i] = scale * this.standardGamma(shape);
    return out;
  }
}
