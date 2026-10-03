"""Clima diario real de Maliau (4,83 N, 116,90 E) para el motor, a partir de los históricos de
Open-Meteo (ERA5 y ERA5-Land, sin cuenta), y escenario «maliau» con él.

Fuentes (datos/clima/, descargados con --descargar):
  * ERA5-Land (~9 km): temperatura media, máxima y mínima a 2 m, punto de rocío y humedad.
  * ERA5 (~25 km): lluvia, radiación solar, presión en superficie, nubes y viento a 10 m
    (ERA5-Land en Open-Meteo no los trae).
Conversiones a las unidades del motor (las del guion de Maliau del propio Virtual Ecosystem,
docs/.../climate_data_guide.md, pero a paso diario):
  air_temperature_ref           °C, media diaria (ERA5-Land)
  diurnal_temperature_range_ref °C, máxima - mínima del día (ERA5-Land)
  relative_humidity_ref         %, media de las horas (ERA5-Land)
  atmospheric_pressure_ref      kPa, media de las horas (ERA5)
  precipitation                 mm por paso (= por día) (ERA5)
  wind_speed_ref                m/s a 10 m, media de las horas (ERA5)
  downward_shortwave_radiation  W/m², flujo medio del día = MJ/m²/día / 0,0864 (ERA5)
  downward_longwave_radiation   W/m², calculada (no está en ninguno): Brutsaert (1975) con la
                                temperatura y la presión de vapor de cada hora, corregida con la
                                nubosidad (Crawford y Duchon 1999), media del día
  atmospheric_co2_ref           ppm, media anual de Mauna Loa (NOAA) del año del día
  mean_annual_temperature       °C, media de toda la serie (ERA5-Land)
Todas las celdas reciben el mismo clima: la rejilla de 810 m es mucho más fina que ERA5
(el guion original hace lo mismo, vecino más cercano).

Además el escenario cambia dos tablas del ejemplo, que es un bosque de juguete:
  * animales (animal_functional_groups.csv): los mismos 20 grupos del motor, cada uno con la
    masa de su especie representativa de Maliau (graficos/pruebas-morta/borneo/especies.js) y
    una densidad realista fijada a mano (ANIMALES_MALIAU, con su fuente o razonamiento). El
    total de biomasa del motor se pone igual a la suma, así que no se reescala nada.
  * cohortes de plantas: un bosque de dipterocarpos con estructura real por clases de
    diámetro (BOSQUE_MALIAU) en vez de 5 arbolitos y 10 arbustos por celda.

Uso: repos/virtual_ecosystem/.venv/Scripts/python herramientas/clima_maliau.py [--descargar] [--anios 2010 2020]
Crea datos/variantes/maliau (config + data) y datos/escenarios/maliau.json.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
import xarray as xr

RAIZ = Path(__file__).resolve().parent.parent
CLIMA = RAIZ / "datos" / "clima"
EJEMPLO = RAIZ / "repos" / "ve_ejemplo" / "ve_example"
DEST = RAIZ / "datos" / "variantes" / "maliau"
URL = ("https://archive-api.open-meteo.com/v1/archive?latitude=4.83&longitude=116.90"
       "&start_date={a0}-01-01&end_date={a1}-12-31&models={m}&timezone=Asia%2FKuching&wind_speed_unit=ms"
       "&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,shortwave_radiation_sum"
       "&hourly=relative_humidity_2m,surface_pressure,dew_point_2m,cloud_cover,wind_speed_10m")
# NOAA, Mauna Loa, medias anuales (ppm)
CO2 = {2010: 389.90, 2011: 391.65, 2012: 393.85, 2013: 396.52, 2014: 398.65, 2015: 400.83,
       2016: 404.24, 2017: 406.55, 2018: 408.52, 2019: 411.44, 2020: 414.24}
SIGMA = 5.670374419e-8

# grupo: (masa adulta kg, masa al nacer kg, individuos por km², especie de referencia)
# Densidades aproximadas para bosque de dipterocarpos de Borneo; las de vertebrados grandes
# salen de estimas publicadas (pantera nebulosa ~1-2 por 100 km², muntíacos y ciervos ratón
# 10-20/km², jabalí barbudo ~5/km² fuera de las migraciones, varano 5-10/km²); las de
# invertebrados, de órdenes de magnitud típicos de suelo y hojarasca tropical (lombrices
# 10-50 g/m², termitas ~1000/m²). Son de orden de magnitud: para que la red trófica tenga
# proporciones razonables, no medidas de Maliau.
ANIMALES_MALIAU = {
    "carnivorous_bird": (1.2, 0.05, 20, "águila culebrera, cárabo pardo"),
    "herbivorous_bird": (1.0, 0.04, 100, "cálao de cresta, gallo bankiva"),
    "carnivorous_mammal": (18.0, 0.25, 0.02, "pantera nebulosa"),
    "herbivorous_mammal": (15.0, 1.2, 15, "muntíaco, ciervo ratón, macaco"),
    "carnivorous_insect_iteroparous": (3e-4, 3e-5, 2e4, "escarabajo tigre"),
    "herbivorous_insect_iteroparous": (5e-4, 5e-5, 5e5, "fulgórido, escarabajo atlas"),
    "carnivorous_insect_semelparous": (1e-3, 1e-5, 5e3, "mantis hoja seca, libélula"),
    "herbivorous_insect_semelparous": (2e-3, 2e-5, 2e4, "insecto palo, cigarra"),
    "butterfly": (5e-4, 4e-4, 2e4, "mariposa de Rajah Brooke"),
    "caterpillar": (2e-3, 1e-5, 5e4, "oruga de Rajah Brooke"),
    "frog": (0.12, 1e-3, 500, "rana gigante de río"),
    "swallow": (0.013, 0.002, 50, "golondrina del Pacífico"),
    "earthworm": (1e-3, 1e-4, 2e7, "lombriz"),
    "dung_beetle": (5e-4, 5e-5, 2e5, "escarabajo pelotero"),
    "scavenging_mammal": (10.0, 0.05, 8, "varano acuático"),
    "detritivorous_insect": (5e-6, 1e-6, 1e9, "termita en procesión"),
    "fungivorous_mammal": (50.0, 1.0, 5, "jabalí barbudo"),
    "herbivorous_lizard": (0.08, 0.005, 300, "dragón del bosque"),
    "carnivorous_snake": (0.2, 0.01, 50, "víbora verde de Borneo"),
    "thermophilic_lizard": (0.05, 0.003, 500, "eslizón solar"),
}
# clases de diámetro por celda de 90 x 90 m (0,81 ha): (PFT, dbh m, troncos por celda)
# ~ 450 troncos de más de 10 cm por hectárea y un sotobosque denso de arbustos.
BOSQUE_MALIAU = [("broadleaf", 0.12, 200), ("broadleaf", 0.25, 60), ("broadleaf", 0.5, 14),
                 ("broadleaf", 0.9, 3), ("shrub", 0.05, 600)]


def descargar(a0: int, a1: int) -> None:
    CLIMA.mkdir(parents=True, exist_ok=True)
    for m in ("era5_land", "era5"):
        with urllib.request.urlopen(URL.format(a0=a0, a1=a1, m=m), timeout=600) as r:
            (CLIMA / f"maliau_{m.replace('_', '')}_{a0}_{a1}.json").write_bytes(r.read())


def por_dia(horas: list, n: int) -> np.ndarray:
    a = np.array([np.nan if v is None else v for v in horas], dtype=float).reshape(n, 24)
    return a.mean(axis=1)


def serie(a0: int, a1: int) -> dict[str, np.ndarray]:
    land = json.loads((CLIMA / f"maliau_era5land_{a0}_{a1}.json").read_text())
    era5 = json.loads((CLIMA / f"maliau_era5_{a0}_{a1}.json").read_text())
    n = len(land["daily"]["time"])
    d, dl, h, hl = era5["daily"], land["daily"], era5["hourly"], land["hourly"]
    t_h = np.array(hl.get("temperature_2m") or [], dtype=float)
    # temperatura horaria aproximada para la onda larga: el punto de rocío de ERA5-Land y la
    # humedad dan la presión de vapor; la temperatura sale de ambas (Magnus inverso)
    td = np.array(hl["dew_point_2m"], dtype=float)
    rh = np.array(hl["relative_humidity_2m"], dtype=float)
    e = 6.112 * np.exp(17.62 * td / (243.12 + td))  # hPa
    es = e / (rh / 100.0)
    lnes = np.log(es / 6.112)
    t = 243.12 * lnes / (17.62 - lnes)  # °C
    if t_h.size == t.size:
        t = t_h
    tk = t + 273.15
    c = np.array(h["cloud_cover"], dtype=float) / 100.0
    eps0 = 1.24 * (e / tk) ** (1 / 7)
    lw = (c + (1 - c) * eps0) * SIGMA * tk ** 4
    anios = np.array([int(x[:4]) for x in dl["time"]])
    tmed = np.array(dl["temperature_2m_mean"], dtype=float)
    return {
        "time": np.array(dl["time"]),
        "air_temperature_ref": tmed,
        "diurnal_temperature_range_ref": np.array(dl["temperature_2m_max"], dtype=float) - np.array(dl["temperature_2m_min"], dtype=float),
        "relative_humidity_ref": por_dia(hl["relative_humidity_2m"], n),
        "atmospheric_pressure_ref": por_dia(h["surface_pressure"], n) / 10.0,
        "precipitation": np.array(d["precipitation_sum"], dtype=float),
        "wind_speed_ref": por_dia(h["wind_speed_10m"], n),
        "downward_shortwave_radiation": np.array(d["shortwave_radiation_sum"], dtype=float) / 0.0864,
        "downward_longwave_radiation": lw.reshape(n, 24).mean(axis=1),
        "atmospheric_co2_ref": np.array([CO2[a] for a in anios]),
        "mean_annual_temperature": np.full(n, tmed.mean()),
    }


def crear_variante(s: dict[str, np.ndarray], a0: int, a1: int) -> None:
    if DEST.exists():
        shutil.rmtree(DEST)
    shutil.copytree(EJEMPLO / "config", DEST / "config")
    shutil.copytree(EJEMPLO / "data", DEST / "data")
    n = len(s["time"])
    clima = xr.load_dataset(EJEMPLO / "data" / "example_climate_data.nc")
    ncel = clima.sizes["cell_id"]
    nuevo = xr.Dataset(coords={"cell_id": clima.cell_id.values, "time_index": np.arange(n)})
    for k in ["air_temperature_ref", "relative_humidity_ref", "atmospheric_pressure_ref", "precipitation",
              "atmospheric_co2_ref", "mean_annual_temperature", "wind_speed_ref", "downward_longwave_radiation",
              "diurnal_temperature_range_ref"]:
        nuevo[k] = (("cell_id", "time_index"), np.tile(s[k], (ncel, 1)))
        nuevo[k].attrs = dict(clima[k].attrs) if k in clima else {}
    for k in ("x", "y"):
        if k in clima.coords:
            nuevo = nuevo.assign_coords({k: clima[k]})
    nuevo.attrs = {"fuente": "Open-Meteo, ERA5 y ERA5-Land; herramientas/clima_maliau.py",
                   "primer_dia": str(s["time"][0]), "ultimo_dia": str(s["time"][-1])}
    (DEST / "data" / "example_climate_data.nc").unlink()
    nuevo.to_netcdf(DEST / "data" / "example_climate_data.nc")
    plantas = xr.load_dataset(EJEMPLO / "data" / "example_plant_data.nc")
    sw = plantas["downward_shortwave_radiation"]
    otros = [dd for dd in sw.dims if dd != "time_index"]
    forma = [plantas.sizes[dd] for dd in otros]
    datos = np.broadcast_to(s["downward_shortwave_radiation"], (*forma, n)).astype(float)
    plantas = plantas.drop_vars("downward_shortwave_radiation").drop_dims("time_index", errors="ignore")
    plantas = plantas.assign_coords(time_index=np.arange(n))
    plantas["downward_shortwave_radiation"] = ((*otros, "time_index"), datos)
    (DEST / "data" / "example_plant_data.nc").unlink()
    plantas.to_netcdf(DEST / "data" / "example_plant_data.nc")
    tablas_maliau(ncel)
    anios = a1 - a0 + 1
    (DEST / "config" / "timing_config.toml").write_text(
        f"[core.timing]\nstart_date = '{a0}-01-01'\nupdate_interval = '1 day'\nrun_length = '{n} days'\n", encoding="utf-8")
    print(f"Variante maliau: {n} días ({anios} años), {ncel} celdas -> {DEST}")


def tablas_maliau(ncel: int) -> None:
    import pandas as pd

    fg = pd.read_csv(EJEMPLO / "data" / "animal_functional_groups.csv")
    total = 0.0
    for i, fila in fg.iterrows():
        adulta, nacer, dens_km2, _ = ANIMALES_MALIAU[fila["name"]]
        fg.loc[i, ["adult_mass", "birth_mass", "density_individuals_m2"]] = [adulta, nacer, dens_km2 / 1e6]
        total += dens_km2 / 1e6 * adulta
    # el «termófilo» del ejemplo tiene el óptimo en 35 °C y a los 21 °C de Maliau nunca está
    # activo: valores de un eslizón que toma el sol (óptimo 28 °C, entre 18 y 38)
    i = fg.index[fg["name"] == "thermophilic_lizard"][0]
    fg.loc[i, ["t_opt", "t_max_crit", "t_min_crit"]] = [28.0, 38.0, 18.0]
    fg.to_csv(DEST / "data" / "animal_functional_groups.csv", index=False)
    filas = [(n, pft, c, dbh) for c in range(ncel) for pft, dbh, n in BOSQUE_MALIAU]
    pd.DataFrame(filas, columns=["plant_cohorts_n", "plant_cohorts_pft", "plant_cohorts_cell_id", "plant_cohorts_dbh"]).to_csv(
        DEST / "data" / "example_plant_cohorts.csv", index=False)
    with open(DEST / "config" / "animal_config.toml", "a", encoding="utf-8") as f:
        f.write(f"\n\n[animal.constants]\ntotal_heterotroph_biomass_density_kg_m2 = {total!r}\n")
    print(f"Animales de Maliau: biomasa total {total * 1000:.1f} g/m²; bosque: {sum(n for _, _, n in BOSQUE_MALIAU)} troncos por celda")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--descargar", action="store_true")
    ap.add_argument("--anios", nargs=2, type=int, default=[2010, 2020])
    a = ap.parse_args()
    a0, a1 = a.anios
    if a.descargar:
        descargar(a0, a1)
    s = serie(a0, a1)
    for k, v in s.items():
        if k != "time":
            print(f"  {k:31s} media {np.nanmean(v):9.3f}  min {np.nanmin(v):9.3f}  max {np.nanmax(v):9.3f}")
    crear_variante(s, a0, a1)
    # abiotic_simple y no abiotic: con el bosque denso toda la hoja cae en una capa del dosel
    # (LAI > 5) y el balance de energía hora a hora del original diverge en unos meses (noches
    # a -30 °C en algunas celdas); el simple es estable y mucho más rápido
    cfgs = [str(p.relative_to(RAIZ)) for p in sorted((DEST / "config").glob("*.toml")) if p.name != "abiotic_config.toml"]
    r = subprocess.call([sys.executable, str(RAIZ / "herramientas" / "convertir_entradas.py"),
                         "--salida", str(RAIZ / "datos" / "escenarios" / "maliau.json"), *cfgs], cwd=RAIZ)
    if r:
        return r
    # correcciones, ajustes y multiplicadores calibrados (motor/correcciones.js)
    return subprocess.call(["node", "herramientas/preparar_maliau.mjs"], cwd=RAIZ)


if __name__ == "__main__":
    sys.exit(main())
