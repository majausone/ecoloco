"""Prueba automática Python contra JS: para cada caso convierte la configuración en un
escenario JSON, corre el original (oráculo determinista), corre el motor JS y compara
todas las salidas (zarr y CSV) con herramientas/comparar.py.

Casos:
  mensual   ejemplo del original, 2 años, paso mensual
  diario    el mismo con paso diario y clima diario (731 pasos; datos/variantes/diario)
  simple    ejemplo con abiotic_simple en vez de abiotic
  bio       otros parámetros de animales y plantas (datos/variantes/bio)
  clima     otro clima (datos/variantes/clima)
  rejilla   otra rejilla, 6 x 4 celdas (datos/variantes/rejilla)

Uso (desde la raíz del proyecto):
  repos/virtual_ecosystem/.venv/Scripts/python herramientas/suite.py [casos...]
      [--reusar]   no repite la pasada de Python si ya existe y es de la misma configuración
      [--semilla 1]
Deja runs/py_<caso>, runs/js_<caso>, runs/cmp_<caso>.{md,json} e informe/suite.json, y
devuelve 0 solo si todos los casos son idénticos bit a bit.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PY = sys.executable
EJEMPLO = RAIZ / "repos" / "ve_ejemplo" / "ve_example" / "config"
VARIANTES = RAIZ / "datos" / "variantes"


def configs(carpeta: Path, simple: bool = False) -> list[str]:
    fuera = "abiotic_config.toml" if simple else "abiotic_simple_config.toml"
    return [str(p.relative_to(RAIZ)).replace("\\", "/") for p in sorted(carpeta.glob("*.toml")) if p.name != fuera]


CASOS = {
    "mensual": (lambda: configs(EJEMPLO), []),
    "diario": (lambda: configs(VARIANTES / "diario" / "config"), []),
    "simple": (lambda: configs(EJEMPLO, simple=True), []),
    "bio": (lambda: configs(VARIANTES / "bio" / "config"), []),
    "clima": (lambda: configs(VARIANTES / "clima" / "config"), []),
    "rejilla": (lambda: configs(VARIANTES / "rejilla" / "config"), []),
}


def correr(cmd: list[str]) -> float:
    t0 = time.perf_counter()
    print("  $", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=RAIZ)
    if r.returncode != 0:
        raise RuntimeError(f"falló: {' '.join(cmd)}")
    return time.perf_counter() - t0


def caso(nombre: str, semilla: int, reusar: bool) -> dict:
    cfgs, extra = CASOS[nombre][0](), CASOS[nombre][1]
    print(f"== {nombre}", flush=True)
    esc = RAIZ / "datos" / "escenarios" / f"{nombre}.json"
    c = []
    for e in extra:
        c += ["-c", e]
    correr([PY, "herramientas/convertir_entradas.py", "--salida", str(esc), *c, *cfgs])
    py = RAIZ / "runs" / f"py_{nombre}"
    js = RAIZ / "runs" / f"js_{nombre}"
    info = py / "oraculo.json"
    previo = json.loads(info.read_text(encoding="utf-8")) if info.exists() else None
    if not (reusar and previo and previo.get("configs") == cfgs and previo.get("extra") == extra
            and previo.get("semilla") == semilla):
        if py.exists():
            shutil.rmtree(py)
        correr([PY, "herramientas/oraculo.py", "--semilla", str(semilla), "--salida", str(py), *c, *cfgs])
        previo = json.loads(info.read_text(encoding="utf-8"))
    correr(["node", "--max-old-space-size=8192", "herramientas/correr.mjs", str(esc), "--salida", str(js), "--semilla", str(semilla)])
    tjs = json.loads((js / "motor_js.json").read_text(encoding="utf-8"))
    cmp_ = RAIZ / "runs" / f"cmp_{nombre}"
    r = subprocess.run([PY, "herramientas/comparar.py", str(py), str(js), "--json", f"{cmp_}.json",
                        "--md", f"{cmp_}.md"], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    inf = json.loads(Path(f"{cmp_}.json").read_text(encoding="utf-8"))
    nvars = sum(1 for g in inf["zarr"].values() for v in g.values() if isinstance(v, dict) and "estado" in v)
    ident = sum(1 for g in inf["zarr"].values() for v in g.values() if isinstance(v, dict) and v.get("estado") == "identica")
    res = {
        "caso": nombre, "identico": inf["identico"], "variables_zarr": nvars, "variables_identicas": ident,
        "csv": {k: v["estado"] for k, v in inf["csv"].items()},
        "pasos": tjs["pasos"], "segundos_python": previo["segundos"], "segundos_js": tjs["segundos_simulacion"],
        "configs": cfgs, "extra": extra,
    }
    print(f"   {'IDÉNTICO' if res['identico'] else 'HAY DIFERENCIAS'}: {ident}/{nvars} variables, CSV {res['csv']}, "
          f"Python {res['segundos_python']:.1f} s, JS {res['segundos_js']:.1f} s", flush=True)
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("casos", nargs="*", default=list(CASOS))
    ap.add_argument("--reusar", action="store_true")
    ap.add_argument("--semilla", type=int, default=1)
    a = ap.parse_args()
    if os.environ.get("PYTHONHASHSEED") != "0":
        return subprocess.call([PY, *sys.argv], env=dict(os.environ, PYTHONHASHSEED="0"))
    sys.stdout.reconfigure(encoding="utf-8")
    resultados = [caso(n, a.semilla, a.reusar) for n in a.casos]
    salida = RAIZ / "informe" / "suite.json"
    salida.parent.mkdir(exist_ok=True)
    previos = {}
    if salida.exists():
        previos = {r["caso"]: r for r in json.loads(salida.read_text(encoding="utf-8"))}
    previos.update({r["caso"]: r for r in resultados})
    salida.write_text(json.dumps(list(previos.values()), indent=1, ensure_ascii=False), encoding="utf-8")
    ok = all(r["identico"] for r in resultados)
    print("TODOS IDÉNTICOS" if ok else "HAY CASOS CON DIFERENCIAS")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
