// Reproducción del orden de iteración de los `set` de CPython 3.12 (setobject.c).
//
// El original itera sets en sitios donde el orden cambia el resultado (orden de los
// módulos con abiotic_simple, cohortes de presas, celdas aguas arriba). El orden depende
// del hash de cada elemento y de la historia de inserciones y redimensionados de la tabla,
// así que se emula la tabla tal cual. Hash de enteros = el propio entero (no negativo y
// pequeño en nuestros usos); hash de str = SipHash-1-3 con clave 0 (PYTHONHASHSEED=0,
// que es como corre el oráculo).

const M64 = (1n << 64n) - 1n;
const rotl = (x, b) => ((x << BigInt(b)) | (x >> BigInt(64 - b))) & M64;

function siphash13(bytes) {
  let v0 = 0x736f6d6570736575n, v1 = 0x646f72616e646f6dn, v2 = 0x6c7967656e657261n, v3 = 0x7465646279746573n;
  const ronda = () => {
    v0 = (v0 + v1) & M64; v2 = (v2 + v3) & M64;
    v1 = rotl(v1, 13) ^ v0; v3 = rotl(v3, 16) ^ v2; v0 = rotl(v0, 32);
    v2 = (v2 + v1) & M64; v0 = (v0 + v3) & M64;
    v1 = rotl(v1, 17) ^ v2; v3 = rotl(v3, 21) ^ v0; v2 = rotl(v2, 32);
  };
  const n = bytes.length;
  let b = (BigInt(n) << 56n) & M64;
  let i = 0;
  for (; n - i >= 8; i += 8) {
    let mi = 0n;
    for (let k = 7; k >= 0; k--) mi = (mi << 8n) | BigInt(bytes[i + k]);
    v3 ^= mi; ronda(); v0 ^= mi;
  }
  let t = 0n;
  for (let k = n - i - 1; k >= 0; k--) t = (t << 8n) | BigInt(bytes[i + k]);
  b |= t;
  v3 ^= b; ronda(); v0 ^= b;
  v2 ^= 0xffn;
  ronda(); ronda(); ronda();
  return (v0 ^ v1) ^ (v2 ^ v3);
}

const cacheHash = new Map();
// Py_hash_t como BigInt con signo
export function hashPy(clave) {
  if (typeof clave === 'number') {
    if (!Number.isInteger(clave) || clave < 0) throw new Error('hashPy: solo enteros no negativos');
    return BigInt(clave === 2 ** 61 - 1 ? 0 : clave);
  }
  let h = cacheHash.get(clave);
  if (h !== undefined) return h;
  const bytes = new TextEncoder().encode(clave);
  for (const c of bytes) if (c > 127) throw new Error('hashPy: solo cadenas ASCII');
  if (bytes.length === 0) h = 0n;
  else {
    let x = siphash13(bytes);
    if (x >= 1n << 63n) x -= 1n << 64n;
    if (x === -1n) x = -2n;
    h = x;
  }
  cacheHash.set(clave, h);
  return h;
}

const DUMMY = Symbol('dummy');
const PERTURB_SHIFT = 5n;
const LINEAR_PROBES = 9;

export class PySet {
  constructor(iterable) {
    this.mask = 7;
    this.tabla = new Array(8).fill(null); // {clave, hash} | null | {clave: DUMMY, hash: -1n}
    this.fill = 0;
    this.used = 0;
    if (iterable) this.update(iterable);
  }

  static igual(a, b) { return a === b; }

  _add(clave, hash) {
    let mask = this.mask;
    let i = Number(BigInt.asUintN(64, hash) & BigInt(mask));
    let libre = -1;
    let perturb = BigInt.asUintN(64, hash);
    for (;;) {
      let j = i;
      let probes = (i + LINEAR_PROBES <= mask) ? LINEAR_PROBES : 0;
      do {
        const e = this.tabla[j];
        if (e === null) {
          if (libre === -1) {
            this.fill++; this.used++;
            this.tabla[j] = { clave, hash };
            if (this.fill * 5 < mask * 3) return;
            this._resize(this.used > 50000 ? this.used * 2 : this.used * 4);
            return;
          }
          this.used++;
          this.tabla[libre] = { clave, hash };
          return;
        }
        if (e.hash === hash && e.clave === clave) return;
        if (e.clave === DUMMY) libre = j;
        j++;
      } while (probes--);
      perturb >>= PERTURB_SHIFT;
      i = Number((BigInt(i) * 5n + 1n + perturb) & BigInt(mask));
    }
  }

  _insertarLimpio(tabla, mask, clave, hash) {
    let perturb = BigInt.asUintN(64, hash);
    let i = Number(perturb & BigInt(mask));
    for (;;) {
      if (tabla[i] === null) { tabla[i] = { clave, hash }; return; }
      if (i + LINEAR_PROBES <= mask) {
        for (let j = 1; j <= LINEAR_PROBES; j++) {
          if (tabla[i + j] === null) { tabla[i + j] = { clave, hash }; return; }
        }
      }
      perturb >>= PERTURB_SHIFT;
      i = Number((BigInt(i) * 5n + 1n + perturb) & BigInt(mask));
    }
  }

  _resize(minused) {
    let n = 8;
    while (n <= minused) n *= 2;
    const vieja = this.tabla;
    if (n === 8 && vieja.length === 8 && this.fill === this.used) return;
    const nueva = new Array(n).fill(null);
    this.mask = n - 1;
    this.tabla = nueva;
    if (this.fill !== this.used) this.fill = this.used;
    for (const e of vieja) if (e !== null && e.clave !== DUMMY) this._insertarLimpio(nueva, this.mask, e.clave, e.hash);
  }

  add(clave) { this._add(clave, hashPy(clave)); }

  _buscar(clave, hash) {
    const mask = this.mask;
    let i = Number(BigInt.asUintN(64, hash) & BigInt(mask));
    let perturb = BigInt.asUintN(64, hash);
    for (;;) {
      let j = i;
      let probes = (i + LINEAR_PROBES <= mask) ? LINEAR_PROBES : 0;
      do {
        const e = this.tabla[j];
        if (e === null) return -1;
        if (e.hash === hash && e.clave === clave) return j;
        j++;
      } while (probes--);
      perturb >>= PERTURB_SHIFT;
      i = Number((BigInt(i) * 5n + 1n + perturb) & BigInt(mask));
    }
  }

  has(clave) { return this._buscar(clave, hashPy(clave)) >= 0; }

  discard(clave) {
    const j = this._buscar(clave, hashPy(clave));
    if (j < 0) return;
    this.tabla[j] = { clave: DUMMY, hash: -1n };
    this.used--;
  }

  // set_merge
  _merge(otro) {
    if (otro === this || otro.used === 0) return;
    if ((this.fill + otro.used) * 5 >= this.mask * 3) this._resize((this.used + otro.used) * 2);
    if (this.fill === 0 && this.mask === otro.mask && otro.fill === otro.used) {
      for (let i = 0; i <= otro.mask; i++) if (otro.tabla[i] !== null) this.tabla[i] = { ...otro.tabla[i] };
      this.fill = otro.fill;
      this.used = otro.used;
      return;
    }
    if (this.fill === 0) {
      this.fill = otro.used;
      this.used = otro.used;
      for (const e of otro.tabla) if (e !== null && e.clave !== DUMMY) this._insertarLimpio(this.tabla, this.mask, e.clave, e.hash);
      return;
    }
    for (const e of otro.tabla) if (e !== null && e.clave !== DUMMY) this._add(e.clave, e.hash);
  }

  update(iterable) {
    if (iterable instanceof PySet) this._merge(iterable);
    else for (const k of iterable) this.add(k);
    return this;
  }

  copy() { const s = new PySet(); s._merge(this); return s; }
  or(otro) { const s = this.copy(); if (otro !== this) s.update(otro); return s; }

  // set_intersection(so, other) con other set: recorre el más pequeño
  and(otro) {
    // CPython: si other es mayor intercambia; recorre `other` (el menor, o el argumento si empatan)
    let a = otro, b = this;
    if (otro.used > this.used) { a = this; b = otro; }
    const r = new PySet();
    for (const e of a.tabla) if (e !== null && e.clave !== DUMMY && b._buscar(e.clave, e.hash) >= 0) r._add(e.clave, e.hash);
    return r;
  }

  get size() { return this.used; }
  *[Symbol.iterator]() { for (const e of this.tabla) if (e !== null && e.clave !== DUMMY) yield e.clave; }
  toArray() { return [...this]; }
}

// Un set de CPython solo para añadir, con hashes enteros no negativos (como mucho 2^50): el mismo algoritmo
// que PySet (la misma tabla, el mismo sondeo y los mismos cambios de tamaño, así que el mismo orden al
// recorrerlo), con la aritmética en Number en vez de BigInt: con enteros no negativos así de pequeños,
// h & mask es h % (mask + 1), perturb >>= 5 es floor(perturb / 32) y la suma del sondeo cabe exacta en un
// doble. Para el set de presas de cada cohorte (el hash es su número de orden).
export class PySetEnteros {
  constructor() { this.mask = 7; this.claves = new Array(8).fill(undefined); this.hashes = new Float64Array(8); this.fill = 0; }
  add(clave, hash) {
    if (!(hash >= 0 && hash <= 2 ** 50 && Math.floor(hash) === hash)) throw new Error('PySetEnteros: hash fuera de rango');
    const m1 = this.mask + 1;
    let i = hash % m1, perturb = hash;
    for (;;) {
      let j = i;
      let probes = (i + LINEAR_PROBES <= this.mask) ? LINEAR_PROBES : 0;
      do {
        if (this.claves[j] === undefined) {
          this.fill++;
          this.claves[j] = clave; this.hashes[j] = hash;
          if (this.fill * 5 < this.mask * 3) return;
          this._resize(this.fill > 50000 ? this.fill * 2 : this.fill * 4);
          return;
        }
        if (this.hashes[j] === hash && this.claves[j] === clave) return;
        j++;
      } while (probes--);
      perturb = Math.floor(perturb / 32);
      i = (i * 5 + 1 + perturb) % m1;
    }
  }
  _resize(minused) {
    let n = 8;
    while (n <= minused) n *= 2;
    const vc = this.claves, vh = this.hashes;
    if (n === 8 && vc.length === 8) return;
    this.mask = n - 1;
    this.claves = new Array(n).fill(undefined); this.hashes = new Float64Array(n);
    for (let k = 0; k < vc.length; k++) if (vc[k] !== undefined) this._insertarLimpio(vc[k], vh[k]);
  }
  _insertarLimpio(clave, hash) {
    const mask = this.mask, m1 = mask + 1;
    let perturb = hash, i = hash % m1;
    for (;;) {
      if (this.claves[i] === undefined) { this.claves[i] = clave; this.hashes[i] = hash; return; }
      if (i + LINEAR_PROBES <= mask) {
        for (let j = 1; j <= LINEAR_PROBES; j++) {
          if (this.claves[i + j] === undefined) { this.claves[i + j] = clave; this.hashes[i + j] = hash; return; }
        }
      }
      perturb = Math.floor(perturb / 32);
      i = (i * 5 + 1 + perturb) % m1;
    }
  }
  get size() { return this.fill; }
  toArray() { const r = []; for (const c of this.claves) if (c !== undefined) r.push(c); return r; }
}
