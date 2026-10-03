"""Genera datos/vectores/azar.json: secuencias de referencia de los generadores aleatorios."""
import json, random
from pathlib import Path
import numpy as np

out = {}
r = random.Random(12345)
out["py_random"] = [r.random() for _ in range(2000)]
r = random.Random(2**40 + 7)
out["py_random_big"] = [r.random() for _ in range(50)]
r = random.Random(99)
seq = list(range(37))
out["py_choice"] = [r.choice(seq) for _ in range(500)]
rs = np.random.RandomState(42)
out["np_random"] = [rs.random_sample() for _ in range(1000)]
rs = np.random.RandomState(7)
out["np_normal"] = [rs.normal(0.1, 0.02) for _ in range(1001)]
rs = np.random.RandomState(3)
cases = [(n, p) for n in [0, 1, 5, 10, 37, 100, 1000, 25000] for p in [0.0, 0.001, 0.0087, 0.1, 0.3, 0.5, 0.7, 0.99, 1.0]]
out["np_binomial_cases"] = cases
out["np_binomial"] = [[int(rs.binomial(n, p)) for _ in range(20)] for n, p in cases]
rs = np.random.RandomState(11)
out["np_binomial_arr"] = rs.binomial(np.array([5, 10, 0, 300, 7]), 0.0087).tolist()
rs = np.random.RandomState(5)
out["np_choice_norep"] = [rs.choice(list(range(81)), size=k, replace=False).tolist() for k in (1, 5, 30, 81)]
out["np_choice_rep"] = rs.choice(list(range(81)), size=40, replace=True).tolist()
w = np.array([0.2, 0.01, 0.5, 0.3, 0.05])
out["np_choice_p"] = [int(rs.choice(np.arange(5), p=w / w.sum())) for _ in range(200)]
g = np.random.default_rng(123456789)
out["gen_random"] = [g.random() for _ in range(300)]
out["gen_gamma"] = g.gamma(1.5, 1.0, size=3000).tolist()
g = np.random.default_rng(2**70 + 3)
out["gen_gamma2"] = g.gamma(0.6, 2.0, size=500).tolist()
out["gen_normal"] = np.random.default_rng(5).standard_normal(20000).tolist()
out["gen_exp"] = np.random.default_rng(6).standard_exponential(20000).tolist()
Path(__file__).resolve().parent.parent.joinpath("datos/vectores/azar.json").write_text(json.dumps(out))
print("ok")
