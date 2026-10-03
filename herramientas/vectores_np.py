"""Genera datos/vectores/np.json: casos de sumas, dot y gradient calculados con numpy."""
import json
from pathlib import Path
import numpy as np
rng = np.random.default_rng(77)
def r(*s): return rng.normal(0, 1, s) * np.exp(rng.uniform(-8, 8, s))
c = {"suma": [], "sumaEje": [], "dot": [], "dotVecMat": [], "dotMatVec": [], "grad": [], "nanmedia": []}
for n in list(range(0, 40)) + [127, 128, 129, 200, 513, 2000]:
    a = r(n); c["suma"].append([a.tolist(), float(np.sum(a))])
for forma in [(3, 7), (14, 81), (81, 30), (30, 81), (81, 2, 3), (81, 5, 3), (24, 14, 81), (9, 1), (2, 81)]:
    a = r(*forma)
    for eje in range(len(forma)):
        c["sumaEje"].append([a.ravel().tolist(), list(forma), eje, np.sum(a, axis=eje).ravel().tolist()])
for n in list(range(1, 40)) + [100, 2511]:
    x, y = r(n), r(n); c["dot"].append([x.tolist(), y.tolist(), float(np.dot(x, y))])
for k in range(1, 8):
    for n in [1, 2, 3, 4, 5, 7, 81, 83]:
        v, M = r(k), r(k, n); c["dotVecMat"].append([v.tolist(), M.ravel().tolist(), k, n, np.dot(v, M).tolist()])
for m in [1, 2, 3, 4, 5, 9, 81, 2003]:
    for s in range(1, 8):
        K = r(s, m); a = r(s)  # A = K.T (m, s) en orden F
        c["dotMatVec"].append([K.ravel().tolist(), m, s, a.tolist(), np.dot(K.T, a).tolist()])
for n in [2, 3, 5]:
    f = r(n, 6); x = np.sort(rng.uniform(0, 3, n))
    c["grad"].append([f.ravel().tolist(), n, 6, x.tolist(), np.gradient(f, x, axis=0).ravel().tolist()])
a = r(24, 14, 5); a[a > 1] = np.nan
c["nanmedia"].append([a.ravel().tolist(), [24, 14, 5], 0, np.nanmean(a, axis=0).ravel().tolist()])
txt = json.dumps(c).replace("NaN", '"NaN"')
Path(__file__).resolve().parent.parent.joinpath("datos/vectores/np.json").write_text(txt)
print("ok")
