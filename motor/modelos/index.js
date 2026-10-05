// Registro de módulos portados. Los que falten se pueden sustituir (solo en pruebas)
// con los datos del oráculo.
import { LitterModel } from './litter.js?v=202610052309';
import { HydrologyModel } from './hydrology.js?v=202610052309';
import { SoilModel } from './soil.js?v=202610052309';
import { AbioticSimpleModel } from './abiotic_simple.js?v=202610052309';
import { AbioticModel } from './abiotic.js?v=202610052309';
import { PlantsModel } from './plants.js?v=202610052309';
import { AnimalModel } from './animal.js?v=202610052309';

export const MODELOS = {
  litter: LitterModel,
  hydrology: HydrologyModel,
  soil: SoilModel,
  abiotic_simple: AbioticSimpleModel,
  abiotic: AbioticModel,
  plants: PlantsModel,
  animal: AnimalModel,
};
