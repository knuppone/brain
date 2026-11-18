import type { Level } from '../Level';
import { HeadLevel } from './HeadLevel';
import { BrainLevel } from './BrainLevel';
import { SystemsLevel } from './SystemsLevel';
import { CellsLevel } from './CellsLevel';
import { SynapseLevel } from './SynapseLevel';
import { MembraneLevel } from './MembraneLevel';

export const createLevels = (): Level[] => [
  new HeadLevel(), new BrainLevel(), new SystemsLevel(), new CellsLevel(), new SynapseLevel(), new MembraneLevel(),
];
