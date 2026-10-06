// Genera possible-issues/index.html: los posibles fallos de Virtual Ecosystem 0.2.2 que
// encontramos al portarlo, en inglés, para sus autores. Cada fragmento de Python se ejecuta aquí
// mismo con el entorno del original (repos/virtual_ecosystem/.venv) y su salida real se pega en
// la página: si alguno falla, no se escribe nada.
//   node herramientas/possible_issues.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const PY = join(RAIZ, 'repos/virtual_ecosystem/.venv/Scripts/python.exe');
const SHA = '0176dc2b74d04b510e70cfc2f3885188bbf33780';
const gh = (f, l) => `https://github.com/ImperialCollegeLondon/virtual_ecosystem/blob/${SHA}/virtual_ecosystem/models/${f}#L${l}`;
const loc = (f, l, fn) => `<a href="${gh(f, l)}" target="_blank" rel="noopener"><code>models/${f}</code></a>, <code>${fn}</code>`;

const GRUPOS = [
  {
    id: 'clear', titulo: '1. Likely bugs',
    intro: 'Places where the code seems to do something different from what its own documentation, units or variable names say. We are fairly confident about these, but you know the model far better than we do.',
    items: [
      {
        id: 'boltzmann', titulo: 'The metabolic rate uses the Boltzmann constant in J/K where the formula needs eV/K',
        hace: 'The activation energy <code>Ea = 0.69</code> is in eV, but <code>k_B</code> defaults to <code>CoreConstants().boltzmann_constant</code>, which is <code>scipy.constants.Boltzmann</code> in J/K (1.38·10⁻²³).',
        donde: [loc('animal/scaling_functions.py', 174, 'metabolic_rate()'), 'with <code>exp(-(Ea / (kB * Tk)))</code>'],
        porque: 'With k_B in J/K the exponent is about −1.6·10²⁰, so the temperature term is exactly 0.0 and every metabolic rate is 0.',
        snippet: `from math import exp
from virtual_ecosystem.core.model_config import CoreConstants
from virtual_ecosystem.models.animal.model_config import AnimalConstants
Es, Ea = AnimalConstants().metabolic_scaling_coefficients
kB = CoreConstants().boltzmann_constant
print(kB, Ea)
print(exp(-(Ea / (kB * 310.0))))              # as in metabolic_rate()
print(exp(-(Ea / (8.617333262e-5 * 310.0))))  # with k_B in eV/K`,
        efecto: 'Animals never spend energy: <code>total_animal_respiration</code> is exactly 0 in every step of every run.',
        arreglo: 'Use k_B = 8.617333262·10⁻⁵ eV/K in the metabolic rate.', interruptor: 'boltzmann_ev',
      },
      {
        id: 'forage-time', titulo: 'Foraging time is truncated to whole days',
        hace: 'The time available per diet is computed with <code>numpy.timedelta64</code> arithmetic: <code>dt * tau_f * sigma_f_t / diet_category_count</code>.',
        donde: [loc('animal/animal_cohorts.py', 1461, 'AnimalCohort.forage_cohort()'), '<code>time_available_per_diet</code>'],
        porque: 'Multiplying or dividing a <code>timedelta64</code> in days by a float rounds down to whole days.',
        snippet: `import numpy as np
from virtual_ecosystem.models.animal.model_config import AnimalConstants
tau_f = AnimalConstants().tau_f      # 0.5
print(np.timedelta64(30, "D") * tau_f * 1.0 / 2)   # monthly step, 2 diet categories: 7.5 days expected
print(np.timedelta64(1, "D") * tau_f * 1.0 / 3)    # daily step, 3 diet categories`,
        efecto: 'With a monthly step part of each day is lost; with a daily step the time is <b>0 days and no animal ever eats</b> (see section 2).',
        arreglo: 'Compute the time as a float number of days.', interruptor: 'forrajeo_continuo',
      },
      {
        id: 'reproductive-mass', titulo: 'Reproductive mass never increases',
        hace: '<code>reproductive_mass_cnp</code> starts at zero and the only call that changes it subtracts the mass of the offspring. Growth always goes to <code>mass_cnp</code>. The constant <code>flow_to_reproductive_mass_threshold</code> is defined in the configuration but not used anywhere.',
        donde: [loc('animal/animal_cohorts.py', 330, 'AnimalCohort.grow()'), loc('animal/animal_model.py', 1328, 'AnimalModel.handle_post_birth_parent_updates()')],
        porque: 'The number of offspring is computed from the reproductive mass, so it is always 0.',
        snippet: `import inspect
import virtual_ecosystem.models.animal.animal_cohorts as ac
import virtual_ecosystem.models.animal.animal_model as am
lines = (inspect.getsource(ac) + inspect.getsource(am)).splitlines()
calls = [lines[i + 1].strip() for i, l in enumerate(lines) if "reproductive_mass_cnp.update(" in l]
print(len(calls), "call(s) to reproductive_mass_cnp.update():", calls)
src = inspect.getsource(ac) + inspect.getsource(am)
print("flow_to_reproductive_mass_threshold used:", "flow_to_reproductive_mass_threshold" in src)`,
        efecto: 'No animal is ever born.',
        arreglo: 'Once a cohort is adult (mass ≥ <code>flow_to_reproductive_mass_threshold</code> × adult mass), what it grows goes to its reproductive mass.', interruptor: 'reproduccion',
      },
      {
        id: 'enum-str', titulo: 'Enum members compared with strings',
        hace: 'Several conditions compare <code>functional_group.reproductive_type</code> or <code>migration_type</code> (plain <code>Enum</code> members) with string literals.',
        donde: [loc('animal/animal_model.py', 1328, 'handle_post_birth_parent_updates()') + ' (<code>== "semelparous"</code>)', loc('animal/animal_model.py', 1381, 'calculate_semelparous_mass_loss()') + ' (<code>!= "semelparous"</code>)', loc('animal/animal_model.py', 1450, 'birth_community()') + ' (<code>!= "nonreproductive"</code>)', loc('animal/animal_model.py', 1769, 'migrate_external_community()') + ' (<code>== "seasonal"</code>)'],
        porque: 'An <code>Enum</code> member is never equal to a string, so the equalities are always False and the inequalities always True.',
        snippet: `from virtual_ecosystem.models.animal.animal_traits import ReproductiveType, MigrationType
print(ReproductiveType.SEMELPAROUS == "semelparous")
print(MigrationType.SEASONAL == "seasonal")
print(ReproductiveType.NONREPRODUCTIVE != "nonreproductive")`,
        efecto: 'Semelparous parents never lose their mass or die after breeding, no cohort ever migrates seasonally, and non-reproductive groups are treated as reproductive.',
        arreglo: 'Compare with the enum members (<code>ReproductiveType.SEMELPAROUS</code>, …).', interruptor: 'comparar_enums',
      },
      {
        id: 'subcanopy-density', titulo: 'Understorey biomass in kg m⁻² is read as kg per cell',
        hace: 'In <code>ARRAY_RESOURCES</code>, the litter and fungal pools are declared with <code>density=True</code> (converted to mass with the cell area), but <code>subcanopy_vegetation_cnp</code> and <code>subcanopy_seedbank_cnp</code> are not, although their unit is kg m⁻².',
        donde: [loc('animal/array_resources.py', 207, 'ARRAY_RESOURCES')],
        porque: 'Without the conversion, a cell of 8100 m² offers herbivores the biomass of one square metre.',
        snippet: `import tomllib, importlib.resources as ir
from virtual_ecosystem.models.animal.array_resources import ARRAY_RESOURCES
dv = tomllib.loads((ir.files("virtual_ecosystem") / "data_variables.toml").read_text(encoding="utf-8"))
unit = {v["name"]: v.get("unit") for v in dv["variable"]}
for r in ARRAY_RESOURCES:
    print(r.pool_array, "|", unit.get(r.pool_array), "| density =", r.density)`,
        efecto: 'Ground herbivores (insects, lizards) find thousands of times less food, and because the encounter rate uses the biomass density squared, their intake is many millions of times lower.',
        arreglo: 'Treat both pools as densities (multiply by the cell area).', interruptor: 'sotobosque_por_m2',
      },
      {
        id: 'subcanopy-consumed', titulo: 'What animals eat from the understorey is never removed from it',
        hace: 'The animal model writes <code>subcanopy_vegetation_cnp_consumed</code> and <code>subcanopy_seedbank_cnp_consumed</code>. The plant model lists and initialises them, but never subtracts them (it does subtract the canopy and fallen fruit and seed consumption).',
        donde: [loc('plants/plants_model.py', 80, 'PlantsModel') + ' (<code>vars_required_for_update</code>)', loc('plants/plants_model.py', 897, 'PlantsModel.apply_herbivory()')],
        porque: 'Consumption that is recorded but never applied makes the understorey an endless resource.',
        snippet: `import inspect
import virtual_ecosystem.models.plants.plants_model as pm
lines = [l.strip() for l in inspect.getsource(pm).splitlines() if "subcanopy_vegetation_cnp_consumed" in l]
print(len(lines), "mentions in the plant model:", lines)`,
        efecto: 'The understorey is never depleted by herbivores.',
        arreglo: 'Subtract the consumed understorey biomass in the plant update.', interruptor: 'restar_sotobosque',
      },
      {
        id: 'metabolism-per-cell', titulo: 'Each cohort metabolises once for every cell of its territory',
        hace: 'A cohort is appended to the community of every cell of its territory, and <code>metabolize_community</code> loops over cells and then over the cohorts in each community.',
        donde: [loc('animal/animal_model.py', 1110, 'update_community_occupancy()'), loc('animal/animal_model.py', 1576, 'metabolize_community()')],
        porque: 'A cohort whose territory covers n cells calls <code>metabolize()</code> n times per step.',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_model import AnimalModel
for f in (AnimalModel.update_community_occupancy, AnimalModel.metabolize_community):
    print([l.strip() for l in inspect.getsource(f).splitlines()
           if l.strip().startswith(("for ", "self.communities[cell_id].append", "metabolic_waste_mass ="))])`,
        efecto: 'Once the Boltzmann constant is fixed, large animals (territories of up to 81 cells) spend up to 81 times their metabolism and starve within days.',
        arreglo: 'Metabolise each cohort once per step and spread its waste and respiration over its territory.', interruptor: 'metabolismo_una_vez',
      },
      {
        id: 'time-per-diet', titulo: 'Foraging time is divided by all diet categories, but all plants (or all prey) are eaten in one call',
        hace: '<code>diet_category_count</code> counts each category (foliage, fruit, seeds…), the time is divided by it, and then the whole plant list is foraged in one call with that single share. The same happens with prey.',
        donde: [loc('animal/animal_cohorts.py', 1461, 'AnimalCohort.forage_cohort()')],
        porque: 'A herbivore that eats foliage, fruit and seeds gets one third of its time for all plants together.',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_traits import DietType
from virtual_ecosystem.models.animal.animal_cohorts import AnimalCohort
print((DietType.FOLIAGE | DietType.FRUIT | DietType.SEEDS).count_dietary_categories())
print([l.strip() for l in inspect.getsource(AnimalCohort.forage_cohort).splitlines() if "time_available_per_diet" in l])`,
        efecto: 'Herbivores and predators with several diet categories forage for only a fraction of the intended time.',
        arreglo: 'Give the plant (or prey) call the time of all the plant (or prey) categories of the diet.', interruptor: 'tiempo_plantas, tiempo_presas',
      },
      {
        id: 'mushrooms', titulo: 'Mushroom eaters are never offered fungal fruiting bodies',
        hace: '<code>fungal_fruiting_bodies_cnp</code> is defined as an array resource with <code>diet_type=MUSHROOMS</code>, but <code>forage_community</code> only builds the array resource list for plant and detritus diets.',
        donde: [loc('animal/animal_model.py', 1463, 'AnimalModel.forage_community()')],
        porque: 'The MUSHROOMS flag is never checked, so the resource never reaches the cohorts.',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_model import AnimalModel
code = inspect.getsource(AnimalModel.forage_community).split('"""')[2]   # without the docstring
print("DietType.MUSHROOMS checked:", "DietType.MUSHROOMS" in code)`,
        efecto: 'Fungivores never eat mushrooms.',
        arreglo: 'Add the MUSHROOMS flag to the array resource request.', interruptor: 'setas',
      },
      {
        id: 'metamorphosis', titulo: 'Adults with indirect development also metamorphose',
        hace: 'A cohort metamorphoses when its development type is indirect and its mass reaches the adult mass; its development status (larval or adult) is not checked.',
        donde: [loc('animal/animal_model.py', 1695, 'AnimalModel.metamorphose_community()')],
        porque: 'An adult butterfly that reaches its adult mass is turned into its offspring group (caterpillars).',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_model import AnimalModel
print([l.strip() for l in inspect.getsource(AnimalModel.metamorphose_community).splitlines()
       if "development_type" in l or "development_status" in l or "mass_current >=" in l])`,
        efecto: 'Butterflies turn back into caterpillars and never breed.',
        arreglo: 'Only larval cohorts metamorphose.', interruptor: 'metamorfosis_solo_larvas',
      },
      {
        id: 'initial-cohorts', titulo: 'Initial cohorts are counted as adults but created as newborns',
        hace: 'The number of individuals comes from the biomass density divided by the <b>adult</b> mass, but every cohort is created with <code>mass=fg.birth_mass</code>.',
        donde: [loc('animal/animal_model.py', 585, 'AnimalModel._initialize_communities()')],
        porque: 'The starting biomass is a few per cent of what was intended, and almost no animal reaches breeding size.',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_model import AnimalModel
print([l.strip() for l in inspect.getsource(AnimalModel._initialize_communities).splitlines()
       if "biomass_density_to_individuals" in l or "fg.adult_mass," in l or "mass=fg.birth_mass" in l])`,
        efecto: 'Populations start as newborns (4–10 % of adult mass) and most die before breeding.',
        arreglo: 'Spread the initial cohorts between birth and adult mass.', interruptor: 'cohortes_iniciales_mezcladas',
      },
      {
        id: 'depletion', titulo: 'Plant and litter resources are not depleted between cohorts in the same step',
        hace: 'Each time a cohort asks for a cell resource, <code>ResourcePool.__getitem__</code> builds a new <code>CellResource</code> from <code>elemental_masses</code>, which are not reduced when something is eaten; <code>get_eaten</code> only reduces the temporary object.',
        donde: [loc('animal/array_resources.py', 421, 'ResourcePool.__getitem__()'), '<code>CellResource.get_eaten()</code>'],
        porque: 'Every cohort sees the full pool, so the total eaten in a step can exceed what is there.',
        snippet: `import inspect
import virtual_ecosystem.models.animal.array_resources as ar
print([l.strip() for l in inspect.getsource(ar.ResourcePool.__getitem__).splitlines() if "available_elemental_masses" in l])
print([l.strip() for l in inspect.getsource(ar.CellResource.get_eaten).splitlines() if "-=" in l])`,
        efecto: 'With many herbivores, consumption can exceed the available biomass.',
        arreglo: 'Subtract what each cohort eats from the pool before the next one forages (and never take more than half of what is left).', interruptor: 'agotar_recursos',
      },
      {
        id: 'damuth', titulo: 'Damuth’s law uses its intercept without the logarithm',
        hace: 'Damuth’s law is log₁₀ D = a + b log₁₀ M, but <code>damuths_law</code> uses <code>a</code> as a multiplier: D = a · M<sup>b</sup>. (Only with <code>density_scaling_method = "damuth"</code>; the default is "madingley".)',
        donde: [loc('animal/scaling_functions.py', 26, 'damuths_law()')],
        porque: 'With a = 4.23 the densities are 10<sup>4.23</sup>/4.23 ≈ 4000 times too low.',
        snippet: `from virtual_ecosystem.models.animal.scaling_functions import damuths_law
print(damuths_law(10.0, (-0.75, 4.23)) * 1e6, "individuals per km2 for a 10 kg herbivore")
print(10 ** 4.23 * (10.0 * 1000) ** -0.75, "with log10 D = 4.23 - 0.75 log10 M (M in g)")`,
        efecto: 'Unrealistic starting densities when the Damuth method is chosen.',
        arreglo: 'Use 10<sup>a</sup>.', interruptor: 'damuth_log10',
      },
      {
        id: 'herbivory-per-stem', titulo: 'Canopy herbivory of a whole cohort seems to be subtracted from per-stem masses',
        hace: 'Herbivory is shared among the cohorts of a PFT and subtracted from each cohort’s tissue masses and from <code>stem_allometry.foliage_mass</code>, which we understand to be per stem.',
        donde: [loc('plants/plants_model.py', 897, 'PlantsModel.apply_herbivory()')],
        porque: 'If those masses are per stem, a cohort of many stems loses its whole consumption from each stem.',
        snippet: `import inspect
from virtual_ecosystem.models.plants.plants_model import PlantsModel
print([l.strip() for l in inspect.getsource(PlantsModel.apply_herbivory).splitlines()
       if "relative_herbivory" in l or "apply_herbivory(" in l or "foliage_mass -" in l])`,
        efecto: 'With many herbivores, crowns drop to zero and later steps divide 0 by 0. We may be misreading the units here.',
        arreglo: 'Share the consumption among the stems of the cohort.', interruptor: 'hojas_comidas_por_tallo',
      },
      {
        id: 'water-negative', titulo: 'The water limitation factor can be negative',
        hace: 'The factor is <code>min(1, (soil_moisture − residual) / demand)</code>, with no lower bound.',
        donde: [loc('plants/plants_model.py', 1226, 'PlantsModel.apply_water_limitation()')],
        porque: 'When the soil is drier than the residual water, the factor is negative, and so is production.',
        snippet: `import numpy as np
soil_moisture, residual, demand = np.array([20.0]), np.array([30.0]), np.array([50.0])
print(np.minimum(1, (soil_moisture - residual) / demand))   # as in apply_water_limitation()`,
        efecto: 'Negative gross primary production in dry soils.',
        arreglo: 'Bound the factor at 0.', interruptor: 'agua_sin_negativos',
      },
      {
        id: 'soil-evaporation', titulo: 'Soil evaporation uses vapour pressure instead of specific humidity',
        hace: 'The docstring says E = ρ/Rₐ (α q_sat − q). The code computes <code>saturated_specific_humidity</code> but uses <code>saturation_vapour_pressure</code> (kPa) in the flux, and then divides the mass flux (kg m⁻² s⁻¹) by the latent heat of vaporisation.',
        donde: [loc('hydrology/above_ground.py', 233, 'calculate_soil_evaporation()')],
        porque: 'The two quantities differ by two orders of magnitude, and a mass flux divided by latent heat is no longer a mass flux.',
        snippet: `import inspect
import virtual_ecosystem.models.hydrology.above_ground as ag
s = inspect.getsource(ag.calculate_soil_evaporation)
print([l.strip() for l in s.splitlines() if "alpha * saturation_vapour_pressure" in l or "evaporative_flux / latent_heat_vapourisation" in l])
print("saturated_specific_humidity used in the flux:", "alpha * saturated_specific_humidity" in s)`,
        efecto: 'Soil evaporation does not follow the documented formula.',
        arreglo: 'Use α q_sat − q and do not divide by the latent heat (kg m⁻² s⁻¹ = mm s⁻¹).', interruptor: 'evaporacion_suelo',
      },
      {
        id: 'fruiting-units', titulo: 'Eaten fruiting bodies (kg) are subtracted from a pool in kg m⁻²',
        hace: 'The soil model subtracts <code>fungal_fruiting_bodies_consumed_cnp</code> (unit kg) from <code>fungal_fruiting_bodies_cnp</code> (unit kg m⁻²).',
        donde: [loc('soil/soil_model.py', 341, 'SoilModel._update()')],
        porque: 'The units do not match: the subtraction is 8100 times too large in a 8100 m² cell.',
        snippet: `import tomllib, importlib.resources as ir
dv = tomllib.loads((ir.files("virtual_ecosystem") / "data_variables.toml").read_text(encoding="utf-8"))
unit = {v["name"]: v.get("unit") for v in dv["variable"]}
print("fungal_fruiting_bodies_cnp:", unit["fungal_fruiting_bodies_cnp"])
print("fungal_fruiting_bodies_consumed_cnp:", unit["fungal_fruiting_bodies_consumed_cnp"])`,
        efecto: 'Fruiting bodies can become negative once animals eat them.',
        arreglo: 'Divide the consumed mass by the cell area before subtracting it.', interruptor: 'setas_por_m2',
      },
      {
        id: 'litter-zero', titulo: 'A litter pool with a decay rate of zero becomes NaN',
        hace: '<code>calculate_final_pool_size</code> computes the equilibrium as <code>input_rate / decay_rate</code>.',
        donde: [loc('litter/carbon.py', 295, 'calculate_final_pool_size()')],
        porque: 'With a zero rate (for instance very dry or cold conditions) this is ∞ − ∞.',
        snippet: `import numpy as np
from virtual_ecosystem.models.litter.carbon import calculate_final_pool_size
with np.errstate(all="ignore"):
    print(calculate_final_pool_size(np.array([0.01]), np.array([0.0]), np.array([1.0]), 1.0))`,
        efecto: 'A NaN that spreads to the rest of the litter and soil.',
        arreglo: 'With a zero rate, the pool just adds its input.', interruptor: 'tasa_cero',
      },
    ],
  },
  {
    id: 'daily', titulo: '2. Things that only show with a daily time step',
    intro: 'The example runs monthly. Running it daily (update_interval = "1 day") shows two more problems.',
    items: [
      {
        id: 'daily-foraging', titulo: 'No animal ever eats',
        hace: 'The truncation of the foraging time described in section 1 gives 0 days when the step is one day.',
        donde: [loc('animal/animal_cohorts.py', 1461, 'AnimalCohort.forage_cohort()')],
        porque: 'One day × tau_f (0.5) × sigma_f_t / number of diet categories is less than one day, and it is rounded down.',
        snippet: `import numpy as np
print(np.timedelta64(1, "D") * 0.5 * 1.0 / 1)   # even with a single diet category`,
        efecto: 'At a daily step, no animal eats and all of them starve.',
        arreglo: 'As above.', interruptor: 'forrajeo_continuo',
      },
      {
        id: 'daily-rain', titulo: 'Rain is lost on about 70 % of days',
        hace: '<code>distribute_monthly_rainfall</code> spreads each step’s rain over its days with a Markov chain whose first day is wet with probability <code>p_wet_dry</code> (0.3). With a one-day step, every day is a «first day».',
        donde: [loc('hydrology/above_ground.py', 568, 'distribute_monthly_rainfall()')],
        porque: 'The real daily rainfall from the input data is kept only when the draw says the day is wet.',
        snippet: `import numpy as np
from virtual_ecosystem.models.hydrology.above_ground import distribute_monthly_rainfall
dry = sum(distribute_monthly_rainfall(np.array([10.0]), 1, 0.6, 0.3, 1.0, 1.0, seed=s)[0, 0] == 0
          for s in range(1000))
print(dry / 1000, "of 1000 rainy days come out dry")`,
        efecto: 'The soil dries out, and in our runs the litter model then produced NaN.',
        arreglo: 'With a one-day step, use each day’s rain as it is.', interruptor: 'lluvia_paso_diario',
      },
    ],
  },
  {
    id: 'suggestions', titulo: '3. Suggestions: parameters and design choices',
    intro: 'These are not bugs. They are values or choices that, once the problems above were fixed, did not let the Maliau animals sustain themselves in our runs. We changed them by our own judgement; we offer them only as suggestions.',
    items: [
      {
        id: 'conversion-efficiency', titulo: 'Assimilation efficiency',
        hace: '<code>conversion_efficiency</code> is 0.1 for herbivores, 0.25 for carnivores and 0.175 for omnivores.',
        donde: [loc('animal/model_config.py', 212, 'AnimalConstants.conversion_efficiency')],
        porque: 'These look like trophic transfer efficiencies, which already include respiration; with metabolism subtracted separately, respiration may be counted twice.',
        snippet: `from virtual_ecosystem.models.animal.model_config import AnimalConstants
print({k.name: v for k, v in AnimalConstants().conversion_efficiency.items()})`,
        efecto: 'Animals assimilate too little of what they eat to cover their metabolism.',
        arreglo: 'We use Madingley’s assimilation efficiencies (Harfoot et al. 2014): 0.5 herbivores, 0.8 carnivores, 0.65 omnivores.', interruptor: 'parameter',
      },
      {
        id: 'cnp', titulo: 'Body C:N:P proportions',
        hace: 'The body C:N:P proportions are 50/30/20 for mammals, 40/30/30 for birds and 40/20/40 for invertebrates, amphibians and reptiles (20–40 % phosphorus).',
        donde: [loc('animal/model_config.py', 247, 'AnimalConstants.cnp_proportion_terms')],
        porque: 'A real animal body is roughly 80/17/3 (insects about 82/16/2): phosphorus is a few per cent, not a fifth or more.',
        snippet: `from virtual_ecosystem.models.animal.model_config import AnimalConstants
for taxa, cnp in AnimalConstants().cnp_proportion_terms.items():
    print(taxa.name, cnp)`,
        efecto: 'Growth tends to be limited by phosphorus and nitrogen.',
        arreglo: '80/17/3 for vertebrates and 82/16/2 for invertebrates.', interruptor: 'parameter',
      },
      {
        id: 'sigma', titulo: 'Prey size tolerance',
        hace: '<code>sigma_opt_pred_prey</code> = 0.7.',
        donde: [loc('animal/model_config.py', 296, 'AnimalConstants.sigma_opt_pred_prey')],
        porque: 'With 0.7, a 100 g bird hardly «sees» half-gram insects; real predators take prey of very different sizes.',
        snippet: `from virtual_ecosystem.models.animal.model_config import AnimalConstants
print(AnimalConstants().sigma_opt_pred_prey)`,
        efecto: 'Predators find very little prey.',
        arreglo: '2.0.', interruptor: 'parameter',
      },
      {
        id: 'birth-threshold', titulo: 'Breeding threshold',
        hace: '<code>birth_mass_threshold</code> = 1.5: a cohort breeds when its reproductive mass reaches half its body mass, and releases all the young at once.',
        donde: [loc('animal/model_config.py', 258, 'AnimalConstants.birth_mass_threshold')],
        porque: 'A 1 kg bird with 40 g chicks would release 12 at once.',
        snippet: `from virtual_ecosystem.models.animal.model_config import AnimalConstants
print(AnimalConstants().birth_mass_threshold)`,
        efecto: 'Few, very large broods.',
        arreglo: '1.1 (10 %), which gives 2–3 young.', interruptor: 'parameter',
      },
      {
        id: 'encounter', titulo: 'Prey density counted twice in the encounter rate',
        hace: '<code>k_i_j</code> multiplies the prey cohort density by the density of its mass bin.',
        donde: [loc('animal/scaling_functions.py', 566, 'k_i_j()')],
        porque: 'The docstring says this is intentional and absorbed by calibration; we found encounters proportional to density easier to calibrate.',
        snippet: `import inspect
from virtual_ecosystem.models.animal import scaling_functions as sf
print([l.strip() for l in inspect.getsource(sf.k_i_j).splitlines() if l.strip().startswith("return")])`,
        efecto: 'Encounters scale with the square of prey density.',
        arreglo: 'Linear in prey density.', interruptor: 'caza_lineal',
      },
      {
        id: 'ceil', titulo: 'A predator always kills at least one whole prey',
        hace: '<code>get_eaten</code> uses <code>ceil</code> for the number of individuals killed.',
        donde: [loc('animal/animal_cohorts.py', 655, 'AnimalCohort.get_eaten()')],
        porque: 'A predator that only needs a small fraction of a prey kills a whole one each step.',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_cohorts import AnimalCohort
print([l.strip() for l in inspect.getsource(AnimalCohort.get_eaten).splitlines() if "ceil(" in l])`,
        efecto: 'Predation is biased upwards for small intakes.',
        arreglo: 'Round at random, with the same mean.', interruptor: 'caza_redondeo',
      },
      {
        id: 'small-prey', titulo: 'Minimum prey mass of 0.1 g',
        hace: '<code>prey_group_selection</code> gives every prey group a (0.0001, 1000) kg range.',
        donde: [loc('animal/scaling_functions.py', 238, 'prey_group_selection()')],
        porque: 'Termites and young insects weigh less than 0.1 g.',
        snippet: `import inspect
from virtual_ecosystem.models.animal import scaling_functions as sf
print([l.strip() for l in inspect.getsource(sf.prey_group_selection).splitlines() if "0.0001" in l][:1])`,
        efecto: 'Small invertebrates cannot be eaten.',
        arreglo: 'A much lower minimum (one microgram).', interruptor: 'presas_pequenas',
      },
      {
        id: 'metabolism-food', titulo: 'Metabolism is paid only from body mass',
        hace: '<code>metabolize</code> takes the metabolic cost from the cohort’s body carbon.',
        donde: [loc('animal/animal_cohorts.py', 357, 'AnimalCohort.metabolize()')],
        porque: 'Animals usually pay their metabolism first from what they have just eaten.',
        snippet: `import inspect
from virtual_ecosystem.models.animal.animal_cohorts import AnimalCohort
print([l.strip() for l in inspect.getsource(AnimalCohort.metabolize).splitlines() if "mass_cnp.update" in l])`,
        efecto: 'Animals lose body mass even when they have eaten enough.',
        arreglo: 'Use the surplus carbon from the food first.', interruptor: 'metabolismo_con_comida',
      },
      {
        id: 'closed', titulo: 'Each grid is a closed system',
        hace: 'No animal enters or leaves the simulated area.',
        donde: ['<code>models/animal/animal_model.py</code>'],
        porque: 'A small patch of forest is usually connected to the forest around it.',
        snippet: null,
        efecto: 'Rare large animals go extinct locally and cannot come back.',
        arreglo: 'If a population falls below half of its starting density, animals come in from the edge; above twice, they leave.', interruptor: 'inmigracion',
      },
      {
        id: 'cohort-count', titulo: 'The number of cohorts grows without limit',
        hace: 'Every animal birth and every plant recruitment creates a new cohort, and cohorts are never merged.',
        donde: [loc('animal/animal_model.py', 1328, 'AnimalModel.handle_post_birth_parent_updates()'), '<code>models/plants/plants_model.py</code>, <code>apply_recruitment()</code>'],
        porque: 'Over long runs the number of cohorts, and the run time, keep growing.',
        snippet: null,
        efecto: 'Long simulations get slower and slower.',
        arreglo: 'Merge similar animal cohorts when a group has more than 60 (as Madingley does), and add new seedlings to the seedling cohort of their type.', interruptor: 'fusionar_cohortes, reclutas_juntos',
      },
      {
        id: 'search-rate', titulo: 'Search rates (our least certain change)',
        hace: 'Even with everything above, the encounter formulas gave intakes that did not match real animals for the Maliau groups: some never ate and others ate everything.',
        donde: ['Our Maliau scenario only, not the original code'],
        porque: 'We added an optional <code>search_rate_multiplier</code> column to the functional group table and calibrated it so each group assimilates about 1.5 times what it spends.',
        snippet: null,
        efecto: 'The multipliers range from about 0.000003 (termites) to 260,000 (scavengers), which suggests the encounter formulas themselves may not scale with real densities and body masses. This is the change we are least sure about.',
        arreglo: 'A per-group multiplier of the search rate (1 = original).', interruptor: 'search_rate_multiplier',
      },
    ],
  },
];

// ---------------------------------------------------------------- correr cada fragmento
mkdirSync(join(RAIZ, 'temp/possible-issues'), { recursive: true });
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
let n = 0;
for (const g of GRUPOS) for (const it of g.items) {
  if (!it.snippet) continue;
  const f = join(RAIZ, 'temp/possible-issues', `${it.id}.py`);
  writeFileSync(f, it.snippet + '\n');
  try {
    it.salida = execFileSync(PY, [f], { encoding: 'utf8', cwd: join(RAIZ, 'temp/possible-issues'), stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  } catch (e) {
    console.error(`FALLA ${it.id}:\n${e.stderr || e.message}`);
    process.exit(1);
  }
  n++;
}

// ---------------------------------------------------------------- la página
const tarjeta = (it, i, gi) => `
<article class="issue" id="${it.id}">
  <h3><span class="num">${gi}.${i + 1}</span> ${it.titulo}</h3>
  <dl>
    <dt>What the original does</dt><dd>${it.hace}</dd>
    <dt>Where</dt><dd>${it.donde.join('<br>')}</dd>
    <dt>Why it looks like a problem</dt><dd>${it.porque}</dd>
    ${it.snippet ? `<dt>Reproduce it</dt><dd><pre class="codigo"><code>${esc(it.snippet)}</code></pre><div class="salida-t">Output with virtual_ecosystem 0.2.2:</div><pre class="salida"><code>${esc(it.salida)}</code></pre></dd>` : ''}
    <dt>Effect</dt><dd>${it.efecto}</dd>
    <dt>What our fix does</dt><dd>${it.arreglo} <span class="switch">${it.interruptor === 'parameter' ? 'parameter change' : `switch: <code>${it.interruptor}</code>`}</span></dd>
  </dl>
</article>`;
const indice = GRUPOS.map((g) => `<li><a href="#${g.id}">${g.titulo}</a><ol>${g.items.map((it) => `<li><a href="#${it.id}">${it.titulo}</a></li>`).join('')}</ol></li>`).join('');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Possible issues in Virtual Ecosystem 0.2.2 · EcoLoco</title>
<meta name="description" content="Possible issues we found in Virtual Ecosystem 0.2.2 while porting it to JavaScript, each with where it is, a minimal reproduction and what our fix does.">
<style>
  html, body { margin:0; background:#0d0b0a; color:#efe4d2; font:15px/1.6 system-ui, sans-serif; }
  .pagina { max-width:960px; margin:0 auto; padding:24px 22px 70px; box-sizing:border-box; }
  h1 { color:#e8a64a; font-size:clamp(28px, 5vw, 38px); margin:14px 0 6px; line-height:1.2; }
  h2 { color:#e8a64a; font-size:23px; margin:44px 0 6px; border-bottom:1px solid #3a2f29; padding-bottom:4px; }
  h3 { font-size:17px; margin:0 0 8px; color:#f3e7d4; } .num { color:#e8a64a; margin-right:4px; }
  a { color:#e8a64a; } p { margin:8px 0; }
  .lema { font-size:17px; color:#d8c9b3; }
  .nota { background:rgba(20,16,15,.86); border:1px solid #3a2f29; border-radius:10px; padding:12px 16px; margin:16px 0; font-size:14px; color:#cdbda8; }
  .issue, section { scroll-margin-top:48px; }
  .issue { background:rgba(20,16,15,.86); border:1px solid #3a2f29; border-radius:10px; padding:14px 18px; margin:14px 0; }
  dl { margin:0; display:grid; grid-template-columns:190px 1fr; gap:6px 14px; }
  dt { color:#b9ab99; font-size:13.5px; padding-top:1px; } dd { margin:0; min-width:0; }
  code { font:13px ui-monospace, SFMono-Regular, Consolas, monospace; background:#221b17; border:1px solid #3a2f29; border-radius:4px; padding:0 4px; }
  pre { margin:4px 0; padding:10px 12px; border-radius:8px; overflow:auto; border:1px solid #3a2f29; }
  pre code { background:none; border:none; padding:0; white-space:pre; }
  pre.codigo { background:#16110f; } pre.salida { background:#10140f; border-color:#2f3a2c; color:#cfe3c4; }
  .salida-t { font-size:12px; color:#8a9a82; margin-top:6px; }
  .switch { display:inline-block; font-size:12px; color:#b9ab99; margin-left:6px; }
  .indice ul { list-style:none; padding-left:0; } .indice ol { margin:4px 0 10px; } .indice > ul > li { margin:6px 0; font-weight:600; } .indice ol { font-weight:normal; font-size:14px; }
  @media (max-width:700px) { dl { grid-template-columns:1fr; gap:2px; } dt { margin-top:8px; } .issue { padding:12px 12px; } }
</style>
</head>
<body>
<div class="pagina">
  <h1>Possible issues in Virtual Ecosystem 0.2.2</h1>
  <p class="lema">While porting <a href="https://github.com/ImperialCollegeLondon/virtual_ecosystem" target="_blank" rel="noopener">Virtual Ecosystem</a> to JavaScript, bit for bit, we found a few places where the code seems not to do what was intended. We list them here in case they are useful to its authors. They are <b>possible</b> issues: we may well be misreading the model, and we would be glad to be corrected.</p>
  <div class="nota">
    <p>Everything refers to <b>virtual_ecosystem 0.2.2</b> (commit <a href="https://github.com/ImperialCollegeLondon/virtual_ecosystem/tree/${SHA}" target="_blank" rel="noopener"><code>0176dc2</code></a>). Each snippet is self-contained and was run with that version (Python 3.12, its own virtual environment); the output shown under it is the real output.</p>
    <p>Our JavaScript engine reproduces the original exactly, including these behaviours. The fixes are optional: in <a href="../interfaz/">the engine page</a> they are all switched on together by the «fix the herbivore bug» box, and off by default, so that the engine gives the same bits as the original.</p>
  </div>
  <nav class="indice"><ul>${indice}</ul></nav>
${GRUPOS.map((g, gi) => `  <section id="${g.id}">
  <h2>${g.titulo}</h2>
  <p>${g.intro}</p>
${g.items.map((it, i) => tarjeta(it, i, gi + 1)).join('\n')}
  </section>`).join('\n')}
  <p class="nota">EcoLoco is an independent project and is not affiliated with the Virtual Ecosystem team. Source code: <a href="https://github.com/majausone/ecoloco" target="_blank" rel="noopener">github.com/majausone/ecoloco</a>.</p>
</div>
<link rel="stylesheet" href="../comun/comun.css">
<script type="module">
import { cabecera } from '../comun/cabecera.js?v=202610060036';
cabecera('');
</script>
</body>
</html>
`;
mkdirSync(join(RAIZ, 'possible-issues'), { recursive: true });
writeFileSync(join(RAIZ, 'possible-issues/index.html'), html);
console.log(`possible-issues/index.html: ${GRUPOS.reduce((s, g) => s + g.items.length, 0)} issues, ${n} snippets run`);
