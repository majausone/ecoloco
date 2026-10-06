// Las correcciones del fallo de los herbívoros (ver informe/INFORME.md, «El fallo de los
// herbívoros»). No son del original: por defecto están apagadas y el motor da los mismos
// bits que el Python. activarCorrecciones() las enciende en un escenario.
//
// Hay dos tipos:
//  * correcciones de código (CORRECCIONES_ANIMAL, CORRECCIONES_PLANTAS): fallos del original
//    (unidades, truncados, comparaciones que nunca se cumplen...), cada una con su interruptor;
//  * ajustes de parámetros (AJUSTES): valores del original que no tienen sentido con lo
//    anterior arreglado (eficiencias, proporciones C:N:P de los animales).
import { CORRECCIONES_ANIMAL } from './modelos/animal.js?v=202610060010';

export const CORRECCIONES_PLANTAS = {
  restar_sotobosque: false, // lo comido del sotobosque se resta de su biomasa
  hojas_comidas_por_tallo: false, // lo comido del follaje de una cohorte se reparte entre sus tallos al recalcular el índice de hoja
  agua_sin_negativos: false, // el factor de limitación por agua no baja de 0
  reclutas_juntos: false,    // las plántulas nuevas se suman a la cohorte de plántulas de su tipo (no una cohorte por reclutamiento)
};

export const CORRECCIONES_HIDROLOGIA = {
  lluvia_paso_diario: false, // a paso diario, la lluvia del día tal cual (el original la pierde el 70 % de los días)
  evaporacion_suelo: false,  // evaporación del suelo con alfa·q_sat - q y sin dividir por el calor latente
};

export const CORRECCIONES_SUELO = {
  setas_por_m2: false,       // las setas comidas (kg) se pasan a kg/m² antes de restarlas
};

export const CORRECCIONES_HOJARASCA = {
  tasa_cero: false,          // con tasa de descomposición 0 no se divide por cero
};

export const AJUSTES = {
  // Asimilación de Madingley (Harfoot et al. 2014): herbívoros 0,5, carnívoros 0,8. El
  // original usa 0,1/0,25, que es la eficiencia ecológica entre niveles tróficos (ya
  // incluye la respiración) y, con el metabolismo restado aparte, la cuenta dos veces.
  'animal.constants.conversion_efficiency': { HERBIVORE: 0.5, CARNIVORE: 0.8, OMNIVORE: 0.65 },
  // Composición C:N:P de los cuerpos (fracción de C+N+P). El original pone 50/30/20 en
  // mamíferos (un 20 % de fósforo); un animal real ronda 80/17/3 (insectos 82/16/2).
  'animal.constants.cnp_proportion_terms': {
    mammal: { C: 0.8, N: 0.17, P: 0.03 }, bird: { C: 0.8, N: 0.17, P: 0.03 },
    invertebrate: { C: 0.82, N: 0.16, P: 0.02 }, amphibian: { C: 0.8, N: 0.17, P: 0.03 },
    reptile: { C: 0.8, N: 0.17, P: 0.03 },
  },
  // Tolerancia al tamaño de la presa (desviación en log de la razón presa/cazador). Con 0,7
  // un pájaro de 100 g casi no «ve» insectos de medio gramo (peso 1e-8); los cazadores reales
  // aceptan presas de tamaños muy distintos.
  'animal.constants.sigma_opt_pred_prey': 2.0,
  // Cuánta masa reproductiva junta un adulto antes de criar, en múltiplos de su masa adulta.
  // El original pide 1,5 (la mitad de su peso) y luego suelta todas las crías de golpe: un
  // ave de 1 kg con crías de 40 g, 12 polluelos. Con 1,1 (un 10 %) salen 2-3, lo realista.
  'animal.constants.birth_mass_threshold': 1.1,
};

function poner(config, ruta, valor) {
  const p = ruta.split('.');
  let o = config;
  for (const k of p.slice(0, -1)) o = o[k];
  o[p[p.length - 1]] = structuredClone(valor);
}

export function activarCorrecciones(escenario, { codigo = true, ajustes = true } = {}) {
  escenario.config.animal.correcciones = Object.fromEntries(Object.keys(CORRECCIONES_ANIMAL).map((k) => [k, codigo]));
  escenario.config.plants.correcciones = Object.fromEntries(Object.keys(CORRECCIONES_PLANTAS).map((k) => [k, codigo]));
  if (escenario.config.hydrology) escenario.config.hydrology.correcciones = Object.fromEntries(Object.keys(CORRECCIONES_HIDROLOGIA).map((k) => [k, codigo]));
  if (escenario.config.soil) escenario.config.soil.correcciones = Object.fromEntries(Object.keys(CORRECCIONES_SUELO).map((k) => [k, codigo]));
  if (escenario.config.litter) escenario.config.litter.correcciones = Object.fromEntries(Object.keys(CORRECCIONES_HOJARASCA).map((k) => [k, codigo]));
  if (ajustes) for (const [ruta, v] of Object.entries(AJUSTES)) poner(escenario.config, ruta, v);
  return escenario;
}
