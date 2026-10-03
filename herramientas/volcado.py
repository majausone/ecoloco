"""Formato de volcado de estados compartido por el oráculo Python y las herramientas JS.

Un volcado es un directorio con:
  indice.json : lista de entradas {clave, vars: {nombre: {dims, shape, dtype, coords, offset, n}}}
  datos.bin   : todos los arrays float64 (los enteros y booleanos se guardan como float64)
                en little endian, uno detrás de otro.

Cada "clave" identifica un momento: p.ej. "inputs", "init/03_hydrology", "upd/0005/2_hydrology".
Así el JS puede cargar el estado exacto antes de cualquier llamada a un módulo.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


def _coords_simples(da) -> dict:
    out = {}
    for nombre, c in da.coords.items():
        if c.ndim != 1 or c.dims[0] not in da.dims:
            continue
        vals = c.values
        if vals.dtype.kind in "iuf":
            out[str(nombre)] = [v.item() for v in vals]
        elif vals.dtype.kind in "UO":
            out[str(nombre)] = [str(v) for v in vals]
    return out


class Volcador:
    def __init__(self, directorio: Path) -> None:
        self.dir = Path(directorio)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.bin = open(self.dir / "datos.bin", "wb")
        self.offset = 0
        self.indice: list[dict] = []

    def array(self, valores) -> dict:
        a = np.asarray(valores)
        dtype = str(a.dtype)
        datos = np.ascontiguousarray(a, dtype="<f8")
        meta = {"shape": list(a.shape), "dtype": dtype, "offset": self.offset, "n": int(datos.size)}
        self.bin.write(datos.tobytes())
        self.offset += datos.size * 8
        return meta

    def estado(self, clave: str, dataset, extra: dict | None = None) -> None:
        """Vuelca todas las variables de un xarray.Dataset (data.data)."""
        vars_ = {}
        for nombre, da in dataset.data_vars.items():
            meta = self.array(da.values)
            meta["dims"] = [str(d) for d in da.dims]
            meta["coords"] = _coords_simples(da)
            vars_[str(nombre)] = meta
        entrada = {"clave": clave, "vars": vars_}
        if extra:
            entrada["extra"] = extra
        self.indice.append(entrada)

    def cerrar(self) -> None:
        self.bin.close()
        (self.dir / "indice.json").write_text(json.dumps(self.indice), encoding="utf-8")
