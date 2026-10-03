// Correctly rounded fused multiply-add emulation (Boldo & Melquiond, round-to-odd).
const SPLIT = 134217729; // 2^27+1
const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
function roundToOddAdd(a, b) {
  const s = a + b;
  const bb = s - a;
  const e = (a - (s - bb)) + (b - bb);
  if (e === 0) return s;
  f64[0] = s;
  if ((u32[0] & 1) === 1) return s;
  // move s one ulp toward e
  const sameSign = (e > 0) === (s > 0);
  if (sameSign) { u32[0] = (u32[0] + 1) >>> 0; if (u32[0] === 0) u32[1] = u32[1] + 1; }
  else { if (u32[0] === 0) u32[1] = u32[1] - 1; u32[0] = (u32[0] - 1) >>> 0; }
  return f64[0];
}
export function fma(a, b, c) {
  const uh = a * b;
  if (!isFinite(uh) || uh === 0 || a === 0 || b === 0) return uh + c;
  // Dekker TwoProduct
  let t = SPLIT * a; const ah = t - (t - a), al = a - ah;
  t = SPLIT * b; const bh = t - (t - b), bl = b - bh;
  const ul = ((ah * bh - uh) + ah * bl + al * bh) + al * bl;
  // TwoSum(c, uh)
  const th = c + uh;
  const bv = th - c;
  const tl = (c - (th - bv)) + (uh - bv);
  if (th === 0 && tl === 0) return ul + 0; // exact cancellation
  const v = roundToOddAdd(tl, ul);
  return th + v;
}
