// Azar del mundo vivo: sfc32 (rápido, 128 bits de estado, bien repartido), sembrado con
// SplitMix32 a partir de una lista de enteros (semilla, día, intento...). Es independiente
// del azar del motor: lo que hacen los animales no toca los números del motor.

function splitmix32(a) {
  return () => {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15; t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export class Azar {
  constructor(...semillas) {
    let h = 0x811c9dc5;
    for (const s of semillas) { h ^= s | 0; h = Math.imul(h, 0x01000193); h ^= (s / 4294967296) | 0; }
    const sm = splitmix32(h);
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    for (let i = 0; i < 12; i++) this.u32();
  }

  u32() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  // [0, 1)
  r() { return this.u32() / 4294967296; }
  entre(a, b) { return a + (b - a) * this.r(); }
  entero(n) { return Math.floor(this.r() * n); }
  elegir(lista) { return lista[Math.floor(this.r() * lista.length)]; }
  normal() {
    const u = 1 - this.r(), v = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // true con probabilidad p
  si(p) { return this.r() < p; }
}

// ruido de valor 2D suave (para el relieve), determinista con su semilla
export function ruido2(semilla) {
  const az = new Azar(semilla, 7);
  const p = new Float64Array(512);
  for (let i = 0; i < 512; i++) p[i] = az.r();
  const h = (i, j) => p[((i * 73856093) ^ (j * 19349663)) & 511];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = s(x - i), fz = s(z - j);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}
