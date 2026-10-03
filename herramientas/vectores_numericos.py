"""Genera vectores de prueba para las funciones numéricas del motor (oráculo: numpy/Python).

Escribe en datos/vectores/<nombre>.bin pares de entrada/salida float64 que la prueba
pruebas/numerica.test.js compara bit a bit con la implementación JS.

Uso: repos/virtual_ecosystem/.venv/Scripts/python herramientas/vectores_numericos.py [N]
"""

import math
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
DEST = RAIZ / "datos" / "vectores"


def guardar(nombre: str, entradas: list[np.ndarray], salida: np.ndarray) -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    cols = [np.asarray(e, dtype="<f8") for e in entradas] + [np.asarray(salida, dtype="<f8")]
    arr = np.stack(cols, axis=1)
    cab = np.array([arr.shape[0], arr.shape[1]], dtype="<f8")
    with open(DEST / f"{nombre}.bin", "wb") as f:
        cab.tofile(f)
        arr.tofile(f)


def especiales() -> np.ndarray:
    return np.array(
        [0.0, -0.0, 1.0, -1.0, 2.0, -2.0, 0.5, 3.0, np.inf, -np.inf, np.nan, 5e-324,
         1e-310, 2.2250738585072014e-308, 1e300, -1e300, 709.78, -745.0, 1e-8, -1e-8]
    )


def main(n: int) -> None:
    rng = np.random.default_rng(20261002)
    with np.errstate(all="ignore"):
        # exp
        x = np.concatenate([
            rng.uniform(-50, 50, n), rng.uniform(-745, 710, n), rng.normal(0, 1, n),
            rng.uniform(-1e-6, 1e-6, n // 4), especiales(),
        ])
        guardar("exp", [x], np.exp(x))
        # log
        x = np.concatenate([
            rng.uniform(0, 2, n), np.exp(rng.uniform(-700, 700, n)), rng.uniform(0.9, 1.1, n),
            rng.uniform(1e-320, 1e-307, n // 8), especiales(),
        ])
        guardar("log", [x], np.log(x))
        guardar("log10", [x], np.log10(x))
        x = np.concatenate([rng.uniform(-10, 10, n), rng.uniform(-1e5, 1e5, n // 4), rng.uniform(-1, 1, n // 4),
                            rng.uniform(-1e-3, 1e-3, n // 8), rng.uniform(-1e-7, 1e-7, n // 8),
                            np.array([0.0, -0.0, np.pi / 4, -np.pi / 4, np.pi / 2, np.pi, 1e7, np.inf, np.nan])])
        guardar("sin", [x], np.sin(x))
        guardar("cos", [x], np.cos(x))
        # pow (numpy) y ** de Python con floats
        xs = np.concatenate([
            rng.uniform(0, 10, n), np.exp(rng.uniform(-700, 700, n)), rng.uniform(0.99, 1.01, n),
            rng.uniform(-10, 10, n), rng.uniform(250, 330, n), rng.uniform(0, 1, n),
        ])
        ys = np.concatenate([
            rng.uniform(-5, 5, n), rng.uniform(-1, 1, n), rng.uniform(-300, 300, n),
            np.round(rng.uniform(-10, 10, n)), np.full(n, 4.0), rng.uniform(0, 3, n),
        ])
        e = especiales()
        X, Y = np.meshgrid(e, e)
        xs = np.concatenate([xs, X.ravel()])
        ys = np.concatenate([ys, Y.ravel()])
        guardar("pow", [xs, ys], np.power(xs, ys))
        # misma pow vía Python (float ** float) en una muestra: debe coincidir con numpy
        m = 200000
        py = np.array([math.pow(a, b) if not (a < 0 and b != int(b)) else float("nan")
                       for a, b in zip(xs[:m], ys[:m])])
        if not np.array_equal(py, np.power(xs[:m], ys[:m]), equal_nan=True):
            print("AVISO: math.pow y np.power difieren en la muestra")
        # asin de math (la usa la ventana de actividad de los animales)
        r2 = np.random.default_rng(7)
        x = np.concatenate([r2.uniform(-1, 1, n), r2.uniform(-1e-3, 1e-3, n // 8),
                            1 - r2.uniform(0, 1e-3, n // 8), -1 + r2.uniform(0, 1e-3, n // 8),
                            np.array([0.0, -0.0, 0.5, -0.5, 1.0, -1.0, 1e-9, -1e-9, 1e-300, np.nan])])
        guardar("asin", [x], np.array([math.asin(v) for v in x]))
    print(f"Vectores escritos en {DEST}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 500000)
