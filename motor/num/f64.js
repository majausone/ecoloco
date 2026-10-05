// f64(a, fn): lo mismo que Float64Array.from(a, fn) para lo que usa el motor (arrays, arrays tipados y
// { length: n }), con un bucle por índice: los mismos elementos, en el mismo orden, la misma función y la misma
// conversión a doble al guardarlos. Float64Array.from con función pasa por el iterador y era de lo más lento.
export function f64(a, fn) {
  const n = a.length, o = new Float64Array(n);
  if (fn) for (let i = 0; i < n; i++) o[i] = fn(a[i], i);
  else for (let i = 0; i < n; i++) o[i] = a[i];
  return o;
}
