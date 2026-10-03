"""Oráculo: ejecuta el Virtual Ecosystem original (sin tocar su código) de forma determinista.

El original no es reproducible por sí mismo: usa azar sin semilla y depende de
direcciones de memoria. Este envoltorio fija esas fuentes, siempre igual y de una forma
que el motor JS puede reproducir:

  * random.seed(S) y np.random.seed(S) al empezar (generadores globales).
  * np.random.default_rng(None) (la hidrología lo llama en cada paso sin semilla) pasa a
    default_rng([S, k]) con k = 0, 1, 2... por orden de llamada.
  * uuid.uuid4() en las cohortes de animales da UUID(int=k, version=4), k = 1, 2...
  * hash(AnimalCohort) (el orden de los set de cohortes dependía de id(), es decir, de
    la dirección de memoria) pasa a ser el número de orden de creación de la cohorte.
  * PYTHONHASHSEED=0 (orden de los set de cadenas).

Además puede volcar el estado completo de los datos tras cargar las entradas, tras el
init de cada módulo y tras cada actualización de cada módulo (--volcar DIR), para comparar
módulo a módulo con el JS.

Uso (desde la raíz del proyecto):
  repos/virtual_ecosystem/.venv/Scripts/python herramientas/oraculo.py \
      --semilla 1 --salida runs/py_ejemplo [--volcar runs/py_ejemplo/volcado] \
      [-c "core.timing.update_interval='1 day'"] config/*.toml
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def _json_seguro(o):
    if isinstance(o, float):
        if math.isnan(o):
            return "NaN"
        if math.isinf(o):
            return "Infinity" if o > 0 else "-Infinity"
    if isinstance(o, dict):
        return {str(k): _json_seguro(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_seguro(v) for v in o]
    return o


def estado_animales(modelo) -> dict:
    def cohorte(c):
        return {
            "id": str(c.id), "fg": c.functional_group.name, "individuals": int(c.individuals),
            "age": float(c.age), "C": float(c.mass_cnp.C), "N": float(c.mass_cnp.N),
            "P": float(c.mass_cnp.P), "rC": float(c.reproductive_mass_cnp.C),
            "rN": float(c.reproductive_mass_cnp.N), "rP": float(c.reproductive_mass_cnp.P),
            "centroid": int(c.centroid_key), "territory": [int(t) for t in c.territory],
            "is_alive": bool(c.is_alive), "is_mature": bool(c.is_mature),
            "time_to_maturity": float(c.time_to_maturity),
            "time_since_maturity": float(c.time_since_maturity),
            "largest_mass": float(c.largest_mass_achieved), "sigma_f_t": float(c.sigma_f_t),
            "current_temperature": float(c.current_temperature),
            "location_status": c.location_status, "remaining_time_away": float(c.remaining_time_away),
        }
    def cnp(x):
        return [float(x.C), float(x.N), float(x.P)]

    return {
        "communities": {str(k): [str(c.id) for c in v] for k, v in modelo.communities.items()},
        "excrement": [[cnp(p.scavengeable_cnp), cnp(p.decomposed_cnp)] for v in modelo.excrement_pools.values() for p in v],
        "carcass": [[cnp(p.scavengeable_cnp), cnp(p.decomposed_cnp)] for v in modelo.carcass_pools.values() for p in v],
        "trophic": {str(c.id): [[k[0], k[1], float(v["C"]), float(v["N"]), float(v["P"])] for k, v in c.trophic_record.items()] for c in modelo.active_cohorts.values()},
        "active": [cohorte(c) for c in modelo.active_cohorts.values()],
        "migrated": [cohorte(c) for c in modelo.migrated_cohorts.values()],
        "aquatic": [cohorte(c) for c in modelo.aquatic_cohorts.values()],
    }


def estado_plantas(modelo) -> dict:
    out = {}
    for cell_id, com in modelo.communities.items():
        coh = com.cohorts
        bio = modelo.biomasses[cell_id]
        out[str(cell_id)] = {
            "cohort_id": [str(v) for v in coh["cohort_id"]],
            "pft": [str(v) for v in coh["pft_name"]],
            "n": [int(v) for v in coh["n_individuals"]],
            "dbh": [float(v) for v in coh["dbh_value"]],
            "tejidos": {t.tissue_name: t.elemental_masses.tolist() for t in bio.tissues},
            "surplus": bio.element_surpluses.tolist(),
        }
    return out


def estado_azar(contadores: dict) -> dict:
    """Estado de los generadores tras una llamada (para restaurarlo en el JS al sustituir)."""
    import random

    import numpy as np

    _, mt, gauss = random.getstate()
    st = np.random.get_state()
    return {
        "py": [int(v) for v in mt], "py_gauss": gauss,
        "np": [int(v) for v in st[1]], "np_pos": int(st[2]), "np_has_gauss": int(st[3]),
        "np_gauss": float(st[4]),
        "n_rng": contadores["rng"], "n_uuid": contadores["uuid"], "n_cohorte": contadores["cohorte"],
    }


def instalar_parches(semilla: int, volcador, contadores: dict) -> None:
    import random
    import uuid

    import numpy as np

    random.seed(semilla)
    np.random.seed(semilla)

    rng_original = np.random.default_rng

    def default_rng_determinista(seed=None):
        if seed is None:
            seed = [semilla, contadores["rng"]]
            contadores["rng"] += 1
        return rng_original(seed)

    np.random.default_rng = default_rng_determinista

    def uuid4_determinista():
        contadores["uuid"] += 1
        return uuid.UUID(int=contadores["uuid"], version=4)

    from virtual_ecosystem.models.animal import animal_cohorts

    # Solo las cohortes de animales: zarr, pandas o dask también llaman a uuid4 (nombres
    # de ficheros temporales...) y no deben mover la numeración de las cohortes.
    import types
    animal_cohorts.uuid = types.SimpleNamespace(uuid4=uuid4_determinista, UUID=uuid.UUID)

    init_original = animal_cohorts.AnimalCohort.__init__

    def init_numerado(self, *a, **k):
        contadores["cohorte"] += 1
        self._orden_oraculo = contadores["cohorte"]
        init_original(self, *a, **k)

    animal_cohorts.AnimalCohort.__init__ = init_numerado
    animal_cohorts.AnimalCohort.__hash__ = lambda self: self._orden_oraculo

    if volcador is None:
        return

    from virtual_ecosystem import main
    from virtual_ecosystem.core import base_model, data

    cargar_original = data.Data.load_data_config

    def cargar_y_volcar(self, config):
        cargar_original(self, config)
        volcador.estado("inputs", self.data)
        contadores["data"] = self

    data.Data.load_data_config = cargar_y_volcar

    check_original = main.check_added_variables

    def check_y_volcar(before, after, claimed, model, attr):
        check_original(before=before, after=after, claimed=claimed, model=model, attr=attr)
        if attr == "vars_populated_by_init":
            contadores["init"] += 1
            volcador.estado(f"init/{contadores['init']:02d}_{model}", contadores["data"].data,
                            {"azar": estado_azar(contadores)})

    main.check_added_variables = check_y_volcar

    update_original = base_model.BaseModel.update

    def update_y_volcar(self, time_index, **kwargs):
        update_original(self, time_index, **kwargs)
        if contadores.get("t") != time_index:
            contadores["t"] = time_index
            contadores["k"] = 0
        contadores["k"] += 1
        extra = {"azar": estado_azar(contadores)}
        if self.model_name == "animal":
            extra["animales"] = _json_seguro(estado_animales(self))
        elif self.model_name == "plants":
            extra["plantas"] = _json_seguro(estado_plantas(self))
        volcador.estado(f"upd/{time_index:04d}/{contadores['k']}_{self.model_name}",
                        self.data.data, extra)

    base_model.BaseModel.update = update_y_volcar


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("configs", nargs="+")
    ap.add_argument("--semilla", type=int, default=1)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--volcar", default=None)
    ap.add_argument("-c", dest="extra", action="append", default=[])
    args = ap.parse_args()

    if os.environ.get("PYTHONHASHSEED") != "0":
        env = dict(os.environ, PYTHONHASHSEED="0")
        return subprocess.call([sys.executable, *sys.argv], env=env)

    salida = Path(args.salida).resolve()
    salida.mkdir(parents=True, exist_ok=True)
    volcador = None
    if args.volcar:
        sys.path.insert(0, str(RAIZ / "herramientas"))
        from volcado import Volcador
        volcador = Volcador(Path(args.volcar))

    contadores = {"rng": 0, "uuid": 0, "cohorte": 0, "init": 0}
    instalar_parches(args.semilla, volcador, contadores)

    from virtual_ecosystem.entry_points import ve_run_cli

    cli = [*[str(Path(c).resolve()) for c in args.configs], "-o", str(salida), "-qq",
           "--logfile", str(salida / "ve.log")]
    for e in args.extra:
        cli += ["-c", e]
    t0 = time.perf_counter()
    rc = ve_run_cli(cli)
    dt = time.perf_counter() - t0
    if volcador:
        volcador.cerrar()
    (salida / "oraculo.json").write_text(json.dumps({
        "semilla": args.semilla, "segundos": dt, "configs": args.configs, "extra": args.extra,
        "llamadas_default_rng": contadores["rng"], "uuids": contadores["uuid"],
    }, indent=1), encoding="utf-8")
    print(f"Oráculo terminado en {dt:.1f} s -> {salida}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
