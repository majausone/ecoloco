"""Compara dos pasadas (p.ej. Python y JS) salida a salida, paso a paso y variable a variable.

Compara:
  * model_data.zarr: grupos inputs, init y outputs, todas las variables, bit a bit
    (NaN se considera igual a NaN). Para cada diferencia da: celdas distintas, primer paso
    con diferencia, máxima diferencia absoluta y relativa, y máxima distancia en ULPs, y si
    la diferencia crece con el tiempo.
  * animal_cohort_data.csv, animal_trophic_interactions.csv, resource_pool_data.csv (y los
    CSV de plantas si existen): texto exacto celda a celda.

Uso:
  python herramientas/comparar.py RUN_A RUN_B [--json informe.json] [--md informe.md]
Devuelve código 0 si todo es idéntico y 1 si hay diferencias.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

GRUPOS = ("inputs", "init", "outputs")
CSVS = ("animal_cohort_data.csv", "animal_trophic_interactions.csv", "resource_pool_data.csv",
        "plants_cohort_data.csv", "plants_community_canopy_data.csv", "plants_stem_canopy_data.csv")


def ulps(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ia = a.view(np.int64).astype(np.float64)
    ib = b.view(np.int64).astype(np.float64)
    ia = np.where(ia < 0, -(ia + 2.0**63), ia)
    ib = np.where(ib < 0, -(ib + 2.0**63), ib)
    return np.abs(ia - ib)


def comparar_array(a: np.ndarray, b: np.ndarray, dims: tuple) -> dict:
    if a.shape != b.shape:
        return {"estado": "forma", "forma_a": list(a.shape), "forma_b": list(b.shape)}
    if a.dtype.kind not in "f":
        a = a.astype(np.float64)
    if b.dtype.kind not in "f":
        b = b.astype(np.float64)
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    nan_a, nan_b = np.isnan(a), np.isnan(b)
    distinto = (a != b) & ~(nan_a & nan_b)
    distinto |= nan_a != nan_b
    # -0.0 frente a 0.0 cuenta como distinto (bit a bit)
    signo = (a == 0) & (b == 0) & (np.signbit(a) != np.signbit(b))
    distinto |= signo
    n = int(distinto.sum())
    if n == 0:
        return {"estado": "identica"}
    res = {"estado": "distinta", "n_distintos": n, "n_total": int(a.size)}
    fin = distinto & ~nan_a & ~nan_b
    if fin.any():
        d = np.abs(a[fin] - b[fin])
        escala = np.maximum(np.abs(a[fin]), np.abs(b[fin]))
        res["max_abs"] = float(d.max())
        with np.errstate(divide="ignore", invalid="ignore"):
            res["max_rel"] = float(np.nanmax(np.where(escala > 0, d / escala, 0)))
        res["max_ulps"] = float(ulps(a[fin], b[fin]).max())
    if nan_a.sum() != nan_b.sum() or (nan_a != nan_b).any():
        res["nan_distintos"] = int((nan_a != nan_b).sum())
    if "time_index" in dims:
        ax = dims.index("time_index")
        otros = tuple(i for i in range(a.ndim) if i != ax)
        por_paso = distinto.any(axis=otros) if otros else distinto
        pasos = np.flatnonzero(por_paso)
        res["primer_paso"] = int(pasos[0])
        if fin.any():
            dif = np.where(distinto & ~nan_a & ~nan_b, np.abs(a - b), 0.0)
            maxpaso = dif.max(axis=otros) if otros else dif
            res["max_abs_por_paso"] = [float(v) for v in maxpaso]
            ult = maxpaso[len(maxpaso) // 2:]
            pri = maxpaso[: max(1, len(maxpaso) // 2)]
            res["crece"] = bool(ult.max() > 10 * max(pri.max(), 1e-300))
    return res


def comparar_zarr(ra: Path, rb: Path) -> dict:
    out = {}
    for g in GRUPOS:
        try:
            da = xr.open_zarr(ra / "model_data.zarr", group=g, consolidated=False)
        except Exception as e:  # noqa: BLE001
            da = None
            out[g] = {"error_a": str(e)}
        try:
            db = xr.open_zarr(rb / "model_data.zarr", group=g, consolidated=False)
        except Exception as e:  # noqa: BLE001
            db = None
            out.setdefault(g, {})["error_b"] = str(e)
        if da is None or db is None:
            continue
        res = {}
        for v in sorted(set(da.data_vars) | set(db.data_vars)):
            if v not in da.data_vars:
                res[v] = {"estado": "falta_en_a"}
                continue
            if v not in db.data_vars:
                res[v] = {"estado": "falta_en_b"}
                continue
            xa, xb = da[v], db[v].transpose(*da[v].dims) if set(db[v].dims) == set(da[v].dims) else db[v]
            res[v] = comparar_array(xa.values, xb.values, tuple(xa.dims))
        out[g] = res
    return out


def comparar_csv(ra: Path, rb: Path) -> dict:
    out = {}
    for nombre in CSVS:
        fa, fb = ra / nombre, rb / nombre
        if not fa.exists() and not fb.exists():
            continue
        if not fa.exists() or not fb.exists():
            out[nombre] = {"estado": "falta_en_" + ("a" if not fa.exists() else "b")}
            continue
        ta = fa.read_text(encoding="utf-8").splitlines()
        tb = fb.read_text(encoding="utf-8").splitlines()
        if ta == tb:
            out[nombre] = {"estado": "identica", "filas": len(ta) - 1}
            continue
        a = pd.read_csv(fa, dtype=str, keep_default_na=False)
        b = pd.read_csv(fb, dtype=str, keep_default_na=False)
        res = {"estado": "distinta", "filas_a": len(a), "filas_b": len(b)}
        if list(a.columns) != list(b.columns):
            res["columnas_a"], res["columnas_b"] = list(a.columns), list(b.columns)
        n = min(len(a), len(b))
        cols = {}
        for c in a.columns:
            if c not in b.columns:
                continue
            d = (a[c].values[:n] != b[c].values[:n])
            if d.any():
                i = int(np.flatnonzero(d)[0])
                cols[c] = {"n": int(d.sum()), "primera_fila": i, "a": a[c].values[i], "b": b[c].values[i]}
        res["columnas_distintas"] = cols
        if len(ta) != len(tb):
            res["nota"] = "distinto número de filas"
        out[nombre] = res
    return out


def resumen_md(inf: dict) -> str:
    l = [f"# Comparación\n\nA: `{inf['a']}`  \nB: `{inf['b']}`\n"]
    tot = ident = 0
    filas = []
    for g, vars_ in inf["zarr"].items():
        for v, r in vars_.items():
            if not isinstance(r, dict) or "estado" not in r:
                continue
            tot += 1
            if r["estado"] == "identica":
                ident += 1
            else:
                filas.append(f"| {g} | {v} | {r['estado']} | {r.get('n_distintos', '')} | "
                             f"{r.get('primer_paso', '')} | {r.get('max_abs', '')} | "
                             f"{r.get('max_ulps', '')} | {r.get('crece', '')} |")
    l.append(f"**Zarr:** {ident} de {tot} variables idénticas bit a bit.\n")
    if filas:
        l.append("| grupo | variable | estado | celdas | primer paso | máx abs | máx ULPs | crece |")
        l.append("|---|---|---|---|---|---|---|---|")
        l.extend(filas)
    l.append("\n**CSV:**\n")
    for n, r in inf["csv"].items():
        l.append(f"- `{n}`: {r['estado']}" + (f" ({r.get('filas')} filas)" if r.get("filas") else ""))
        for c, d in r.get("columnas_distintas", {}).items():
            l.append(f"  - columna `{c}`: {d['n']} celdas; primera fila {d['primera_fila']}: `{d['a']}` vs `{d['b']}`")
    return "\n".join(l) + "\n"


def comparar(ra: Path, rb: Path) -> dict:
    inf = {"a": str(ra), "b": str(rb), "zarr": comparar_zarr(ra, rb), "csv": comparar_csv(ra, rb)}
    todo = all(r.get("estado") == "identica" for g in inf["zarr"].values() for r in g.values()
               if isinstance(r, dict) and "estado" in r) and all(
        r["estado"] == "identica" for r in inf["csv"].values())
    inf["identico"] = bool(todo) and all("error_a" not in g and "error_b" not in g for g in inf["zarr"].values())
    return inf


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--json")
    ap.add_argument("--md")
    args = ap.parse_args()
    inf = comparar(Path(args.a), Path(args.b))
    if args.json:
        Path(args.json).write_text(json.dumps(inf, indent=1), encoding="utf-8")
    md = resumen_md(inf)
    if args.md:
        Path(args.md).write_text(md, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(md if len(md) < 6000 else md[:6000] + "\n...")
    print("IDÉNTICO" if inf["identico"] else "HAY DIFERENCIAS")
    return 0 if inf["identico"] else 1


if __name__ == "__main__":
    sys.exit(main())
