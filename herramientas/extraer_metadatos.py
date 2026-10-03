"""Extrae del original los metadatos que necesitan el motor JS y la interfaz.

Genera motor/meta/metadatos.json con:
  variables : las variables conocidas (data_variables.toml): unidad, descripción, ejes.
  modelos   : para cada módulo, sus listas vars_required_for_init, vars_populated_by_init,
              vars_required_for_update, vars_updated, vars_populated_by_first_update y los
              límites de paso de tiempo.
  parametros: árbol de parámetros de configuración (core y cada módulo) con nombre, tipo,
              valor por defecto y descripción (las docstrings de los campos del original).
  pft       : columnas de los tipos de planta (pyrealm FloraValidator + VEFloraValidator).

Uso: repos/virtual_ecosystem/.venv/Scripts/python herramientas/extraer_metadatos.py
"""

from __future__ import annotations

import json
import math
import tomllib
from importlib import import_module, resources
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "motor" / "meta" / "metadatos.json"
MODULOS = ["core", "plants", "animal", "hydrology", "litter", "abiotic", "abiotic_simple", "soil"]


def json_valor(v):
    if isinstance(v, float):
        if math.isnan(v):
            return "NaN"
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        return v
    if isinstance(v, Path):
        return str(v)
    if isinstance(v, (list, tuple)):
        return [json_valor(x) for x in v]
    if isinstance(v, dict):
        return {str(k): json_valor(x) for k, x in v.items()}
    if hasattr(v, "model_dump"):
        return json_valor(v.model_dump(mode="python"))
    if v is None or isinstance(v, (bool, int, str)):
        return v
    return str(v)


def campos(clase) -> list[dict]:
    from pydantic import BaseModel
    from pydantic_core import PydanticUndefined

    out = []
    for nombre, info in clase.model_fields.items():
        ann = info.annotation
        d = {"nombre": nombre, "descripcion": (info.description or "").strip()}
        sub = None
        try:
            if isinstance(ann, type) and issubclass(ann, BaseModel):
                sub = ann
        except TypeError:
            pass
        if sub is not None and nombre != "pyrealm":
            d["tipo"] = "grupo"
            d["campos"] = campos(sub)
        else:
            d["tipo"] = getattr(ann, "__name__", None) or str(ann).replace("typing.", "")
            por_defecto = info.get_default(call_default_factory=True)
            d["defecto"] = None if por_defecto is PydanticUndefined else json_valor(por_defecto)
            if por_defecto is PydanticUndefined:
                d["obligatorio"] = True
        out.append(d)
    return out


def main() -> None:
    from virtual_ecosystem.core.base_model import BaseModel
    from virtual_ecosystem.core.model_config import CoreConfiguration
    from virtual_ecosystem.core.registry import get_model_configuration_class

    meta: dict = {}
    toml = tomllib.loads((resources.files("virtual_ecosystem") / "data_variables.toml").read_text())
    meta["variables"] = {v["name"]: {k: v[k] for k in ("description", "unit", "variable_type", "axis")}
                         for v in toml["variable"]}

    modelos = {}
    parametros = {"core": campos(CoreConfiguration)}
    for m in MODULOS[1:]:
        mod = import_module(f"virtual_ecosystem.models.{m}.{m}_model")
        cls = next(c for c in vars(mod).values()
                   if isinstance(c, type) and issubclass(c, BaseModel) and c is not BaseModel
                   and getattr(c, "model_name", None) == m)
        modelos[m] = {
            a: list(getattr(cls, a)) for a in (
                "vars_required_for_init", "vars_populated_by_init", "vars_required_for_update",
                "vars_updated", "vars_populated_by_first_update")
        }
        modelos[m]["model_update_bounds"] = [str(q) for q in cls.model_update_bounds]
        conf = get_model_configuration_class(f"virtual_ecosystem.models.{m}", m)
        parametros[m] = campos(conf)
    meta["modelos"] = modelos
    meta["parametros"] = parametros

    from virtual_ecosystem.models.plants.functional_types import VEFloraValidator
    meta["pft"] = campos(VEFloraValidator)

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    print("Escrito", SALIDA)


if __name__ == "__main__":
    main()
