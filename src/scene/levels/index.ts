import type { Level } from '../Level';
import { BrainLevel } from './BrainLevel';
import { SystemsLevel } from './SystemsLevel';
import { CellsLevel } from './CellsLevel';
import { SynapseLevel } from './SynapseLevel';
import { MembraneLevel } from './MembraneLevel';

export const createLevels = (): Level[] => [
  new BrainLevel(), new SystemsLevel(), new CellsLevel(), new SynapseLevel(), new MembraneLevel(),
];
