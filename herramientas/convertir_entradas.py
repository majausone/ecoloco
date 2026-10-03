"""Convierte una configuración del original (TOML + datos .nc/.csv) en un escenario JSON
para el motor JS.

Usa la propia maquinaria del original para que el resultado sea exactamente lo que verían
sus modelos: compila la configuración (con todos los valores por defecto) y carga los datos
con Data.load_data_config (que valida y ordena las celdas de la rejilla).

El JSON resultante tiene:
  config : la configuración compilada (igual que compiled_configuration.toml), sin rutas.
  inputs : variables de entrada {nombre: {dims, shape, dtype, coords, data}}.
  tablas : los CSV leídos como los lee el original (pandas): pft, cohortes de plantas y
           grupos funcionales de animales, por columnas.
Los NaN e infinitos se escriben como "NaN", "Infinity", "-Infinity".

Uso:
  repos/virtual_ecosystem/.venv/Scripts/python herramientas/convertir_entradas.py \
      --salida datos/escenarios/ejemplo.json [-c "core.grid.cell_nx=5"] config/*.toml
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd


def limpio(v):
    if isinstance(v, (float, np.floating)):
        v = float(v)
        if math.isnan(v):
            return "NaN"
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        return v
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, dict):
        return {str(k): limpio(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, np.ndarray)):
        return [limpio(x) for x in v]
    if isinstance(v, Path):
        return str(v)
    return v


def tabla(df: pd.DataFrame) -> dict:
    return {
        "columnas": [str(c) for c in df.columns],
        "dtypes": {str(c): str(df[c].dtype) for c in df.columns},
        "datos": {str(c): limpio(df[c].tolist()) for c in df.columns},
    }


def convertir(configs: list[str], extra: list[str]) -> dict:
    from virtual_ecosystem.core.config_builder import ConfigurationLoader, generate_configuration
    from virtual_ecosystem.core.core_components import CoreComponents
    from virtual_ecosystem.core.data import Data
    from virtual_ecosystem.core.model_config import CoreConfiguration
    from virtual_ecosystem.entry_points import _parse_command_line_config

    cli = _parse_command_line_config(extra + ["core.data_output_options.out_path='.'"])
    cargador = ConfigurationLoader(cfg_paths=[str(Path(c).resolve()) for c in configs], cfg_strings=[],
                                   cli_config=cli)
    conf = generate_configuration(cargador.data, context={"cli_paths": {}})
    core: CoreConfiguration = conf.get_subconfiguration("core", CoreConfiguration)
    comp = CoreComponents(config=core)
    datos = Data(grid=comp.grid)
    datos.load_data_config(config=core)

    entradas = {}
    for nombre, da in datos.data.data_vars.items():
        coords = {}
        for c, val in da.coords.items():
            if val.ndim == 1 and val.dims[0] in da.dims:
                coords[str(c)] = limpio(val.values.tolist()) if val.values.dtype.kind in "iuf" else [
                    str(x) for x in val.values]
        entradas[str(nombre)] = {
            "dims": [str(d) for d in da.dims], "shape": list(da.shape), "dtype": str(da.dtype),
            "coords": coords, "data": limpio(da.values.ravel().tolist()),
        }

    cfg = conf.model_dump(mode="json")
    tablas = {}
    if "plants" in cfg:
        p = cfg["plants"]
        tablas["pft"] = tabla(pd.read_csv(p["pft_definitions_path"]))
        tablas["cohortes_plantas"] = tabla(pd.read_csv(p["cohort_data_path"]))
    if "animal" in cfg:
        tablas["grupos_animales"] = tabla(
            pd.read_csv(cfg["animal"]["functional_group_definitions_path"], na_values=["None"]))

    # Las rutas no sirven en el navegador: se dejan como nombres de fichero.
    for var in cfg["core"]["data"]["variable"]:
        var["file_path"] = Path(var["file_path"]).name
    if "plants" in cfg:
        for k in ("pft_definitions_path", "cohort_data_path"):
            cfg["plants"][k] = Path(cfg["plants"][k]).name
    if "animal" in cfg:
        cfg["animal"]["functional_group_definitions_path"] = Path(
            cfg["animal"]["functional_group_definitions_path"]).name
    cfg["core"]["data_output_options"]["out_path"] = "."
    return {"config": limpio(cfg), "inputs": entradas, "tablas": tablas,
            "origen": {"configs": [Path(c).name for c in configs], "extra": extra}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("configs", nargs="+")
    ap.add_argument("--salida", required=True)
    ap.add_argument("-c", dest="extra", action="append", default=[])
    args = ap.parse_args()
    esc = convertir(args.configs, args.extra)
    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    Path(args.salida).write_text(json.dumps(esc), encoding="utf-8")
    print("Escrito", args.salida, f"({len(esc['inputs'])} variables de entrada)")


if __name__ == "__main__":
    main()
