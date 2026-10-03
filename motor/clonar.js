// Copia profunda de cualquier objeto del motor (una simulación entera a mitad de partida),
// conservando las clases (prototipos), los Map, Set, arrays tipados y las referencias
// circulares o compartidas. Las funciones se comparten (no guardan estado). Sirve para
// predecir: correr una copia hacia delante sin tocar la partida.
export function clonarProfundo(x, vistos = new Map()) {
  if (x === null || typeof x !== 'object') return x;
  const ya = vistos.get(x);
  if (ya) return ya;
  if (ArrayBuffer.isView(x)) { const c = x.slice(); vistos.set(x, c); return c; }
  if (x instanceof ArrayBuffer) { const c = x.slice(0); vistos.set(x, c); return c; }
  if (x instanceof Date) return new Date(x.getTime());
  if (x instanceof RegExp) return x;
  if (x instanceof Map) { const c = new Map(); vistos.set(x, c); for (const [k, v] of x) c.set(clonarProfundo(k, vistos), clonarProfundo(v, vistos)); return c; }
  if (x instanceof Set) { const c = new Set(); vistos.set(x, c); for (const v of x) c.add(clonarProfundo(v, vistos)); return c; }
  if (Array.isArray(x)) { const c = new Array(x.length); vistos.set(x, c); for (let i = 0; i < x.length; i++) c[i] = clonarProfundo(x[i], vistos); return c; }
  const c = Object.create(Object.getPrototypeOf(x));
  vistos.set(x, c);
  for (const k of Reflect.ownKeys(x)) {
    const d = Object.getOwnPropertyDescriptor(x, k);
    if ('value' in d) d.value = clonarProfundo(d.value, vistos);
    Object.defineProperty(c, k, d);
  }
  return c;
}
