"""Crea las configuraciones de prueba distintas del ejemplo (datos/variantes/<nombre>).

Cada variante es una copia de repos/ve_ejemplo/ve_example (config + data) con cambios:

  bio      otros parámetros de animales y plantas: grupos funcionales con otras masas,
           dietas y ventanas térmicas; constantes de animales (escalado de Damuth, sin
           selección térmica de hábitat -> usa random.choice de Python, otro tau_f...);
           PFT con otra alometría (m=3, n=4, h_max, lai, sla...), otras cohortes de
           plantas y otras constantes de plantas; exportador de plantas activado.
  clima    otro clima: +3 °C, 40 % menos lluvia, otra humedad, viento, CO2 y radiación.
  rejilla  otra rejilla: 6 x 4 celdas (el bloque inferior izquierdo de los datos).
  diario   el ejemplo a paso diario. El original no puede correr el ejemplo tal cual a
           diario: sus datos de clima traen 24 valores (uno por mes) y en el paso 24 se
           sale del array. Aquí cada valor mensual se repite en los días de su mes
           (731 pasos: 2 años de 365.25 días).

Uso: repos/virtual_ecosystem/.venv/Scripts/python herramientas/crear_variantes.py [variantes...]
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

RAIZ = Path(__file__).resolve().parent.parent
EJEMPLO = RAIZ / "repos" / "ve_ejemplo" / "ve_example"
DEST = RAIZ / "datos" / "variantes"


def copiar(nombre: str) -> Path:
    d = DEST / nombre
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(EJEMPLO / "config", d / "config")
    shutil.copytree(EJEMPLO / "data", d / "data")
    return d


def guardar_nc(ds: xr.Dataset, ruta: Path) -> None:
    ds.load()
    ds.close()
    ruta.unlink()
    ds.to_netcdf(ruta)


def bio() -> None:
    d = copiar("bio")
    fg = pd.read_csv(d / "data" / "animal_functional_groups.csv")
    i = fg.set_index("name").index
    def poner(nombre, col, valor):
        fg.loc[i.get_loc(nombre), col] = valor
    poner("herbivorous_mammal", "adult_mass", 15.0)
    poner("herbivorous_mammal", "birth_mass", 1.5)
    poner("carnivorous_bird", "diet", "vertebrates_invertebrates")
    poner("herbivorous_bird", "diet", "foliage_fruit_seeds")
    poner("earthworm", "vertical_occupancy", "soil")
    poner("frog", "t_opt", 25.0)
    poner("frog", "t_max_crit", 33.0)
    poner("frog", "t_min_crit", 15.0)
    poner("herbivorous_insect_iteroparous", "density_individuals_m2", 0.05)
    poner("carnivorous_snake", "adult_mass", 2.0)
    poner("fungivorous_mammal", "diet", "mushrooms_fungi")
    fg.to_csv(d / "data" / "animal_functional_groups.csv", index=False)

    pft = pd.read_csv(d / "data" / "plant_pfts.csv")
    pft.loc[0, ["h_max", "lai", "sla", "m", "n"]] = [30.0, 2.5, 12, 3, 4]
    pft.loc[1, ["ca_ratio", "tau_f", "c_mass_fruit_flesh"]] = [400.0, 3, 4]
    pft.to_csv(d / "data" / "plant_pfts.csv", index=False)

    coh = pd.read_csv(d / "data" / "example_plant_cohorts.csv")
    coh.loc[coh.plant_cohorts_pft == "broadleaf", "plant_cohorts_dbh"] = 0.15
    coh.loc[coh.plant_cohorts_pft == "shrub", "plant_cohorts_n"] = 14
    coh.to_csv(d / "data" / "example_plant_cohorts.csv", index=False)

    with open(d / "config" / "animal_config.toml", "a", encoding="utf-8") as f:
        f.write("\n\n[animal.constants]\ndensity_scaling_method = 'damuth'\n"
                "thermal_habitat_selection = false\ntau_f = 0.7\nu_bg = 0.002\n"
                "seasonal_migration_probability = 0.2\n")
    with open(d / "config" / "plant_config.toml", "a", encoding="utf-8") as f:
        f.write("\n\n[plants.constants]\nper_stem_annual_mortality_probability = 0.2\n"
                "per_propagule_annual_recruitment_probability = 0.3\nsubcanopy_sprout_rate = 0.05\n"
                "\n[plants.community_data_export]\n"
                "cohort_attributes = ['dbh_value', 'stem_height', 'npp', 'foliage_C_biomass', 'lai', 'seeds_per_fruit']\n"
                "community_canopy_attributes = 'ALL'\nstem_canopy_attributes = ['fapar']\n")


def clima() -> None:
    d = copiar("clima")
    ruta = d / "data" / "example_climate_data.nc"
    ds = xr.load_dataset(ruta)
    ds["air_temperature_ref"] = ds["air_temperature_ref"] + 3.0
    ds["mean_annual_temperature"] = ds["mean_annual_temperature"] + 3.0
    ds["precipitation"] = ds["precipitation"] * 0.6
    ds["relative_humidity_ref"] = (ds["relative_humidity_ref"] * 0.9).clip(max=100)
    ds["wind_speed_ref"] = ds["wind_speed_ref"] * 1.5
    ds["atmospheric_co2_ref"] = ds["atmospheric_co2_ref"] + 100.0
    ds["diurnal_temperature_range_ref"] = ds["diurnal_temperature_range_ref"] * 1.3
    guardar_nc(ds, ruta)
    ruta = d / "data" / "example_plant_data.nc"
    ds = xr.load_dataset(ruta)
    ds["downward_shortwave_radiation"] = (ds["downward_shortwave_radiation"] * 1.2).astype(
        ds["downward_shortwave_radiation"].dtype)
    guardar_nc(ds, ruta)


def rejilla() -> None:
    d = copiar("rejilla")
    nx, ny = 6, 4
    # bloque inferior izquierdo: x <= 450, y <= 270 (la fila superior de la rejilla
    # original, iy = 0, es la de y = 720)
    for f in (d / "data").glob("*.nc"):
        ds = xr.load_dataset(f)
        if "x" in ds.dims:
            ds = ds.sel(x=ds.x[ds.x <= (nx - 1) * 90], y=ds.y[ds.y <= (ny - 1) * 90])
        elif "cell_id" in ds.dims:
            viejas = [ix + (iy + 9 - ny) * 9 for iy in range(ny) for ix in range(nx)]
            ds = ds.isel(cell_id=viejas).assign_coords(cell_id=np.arange(nx * ny))
        guardar_nc(ds, f)
    coh = pd.read_csv(d / "data" / "example_plant_cohorts.csv")
    mapa = {ix + (iy + 9 - ny) * 9: ix + iy * nx for iy in range(ny) for ix in range(nx)}
    coh = coh[coh.plant_cohorts_cell_id.isin(mapa)].copy()
    coh["plant_cohorts_cell_id"] = coh.plant_cohorts_cell_id.map(mapa)
    coh.to_csv(d / "data" / "example_plant_cohorts.csv", index=False)
    (d / "config" / "grid_config.toml").write_text(
        f"[core.grid]\ncell_nx = {nx}\ncell_ny = {ny}\n", encoding="utf-8")


def diario() -> None:
    d = copiar("diario")
    n = 731
    mes = np.minimum(np.floor(np.arange(n) / 30.4375).astype(int), 23)
    for f in (d / "data").glob("*.nc"):
        ds = xr.load_dataset(f)
        if "time_index" not in ds.dims:
            ds.close()
            continue
        ds = ds.isel(time_index=mes).assign_coords(time_index=np.arange(n))
        guardar_nc(ds, f)
    (d / "config" / "timing_config.toml").write_text(
        "[core.timing]\nupdate_interval = '1 day'\n", encoding="utf-8")


if __name__ == "__main__":
    import sys

    todas = {"diario": diario, "bio": bio, "clima": clima, "rejilla": rejilla}
    for nombre in sys.argv[1:] or list(todas):
        todas[nombre]()
    print(f"Variantes creadas en {DEST}")
