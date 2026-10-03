// Registro de módulos portados. Los que falten se pueden sustituir (solo en pruebas)
// con los datos del oráculo.
import { LitterModel } from './litter.js';
import { HydrologyModel } from './hydrology.js';
import { SoilModel } from './soil.js';
import { AbioticSimpleModel } from './abiotic_simple.js';
import { AbioticModel } from './abiotic.js';
import { PlantsModel } from './plants.js';
import { AnimalModel } from './animal.js';

export const MODELOS = {
  litter: LitterModel,
  hydrology: HydrologyModel,
  soil: SoilModel,
  abiotic_simple: AbioticSimpleModel,
  abiotic: AbioticModel,
  plants: PlantsModel,
  animal: AnimalModel,
};
