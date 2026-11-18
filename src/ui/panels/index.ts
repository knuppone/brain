import type { ComponentType } from 'react';
import type { LevelId } from '../../state/store';
import { HeadDock, HeadPanel } from './HeadPanel';
import { BrainDock, BrainPanel } from './BrainPanel';
import { SystemsDock, SystemsPanel } from './SystemsPanel';
import { CellsDock, CellsPanel } from './CellsPanel';
import { SynapseDock, SynapsePanel } from './SynapsePanel';
import { MembraneDock, MembranePanel } from './MembranePanel';

export const PANELS: Record<LevelId, { Panel: ComponentType; Dock: ComponentType }> = {
  head: { Panel: HeadPanel, Dock: HeadDock },
  brain: { Panel: BrainPanel, Dock: BrainDock },
  systems: { Panel: SystemsPanel, Dock: SystemsDock },
  cells: { Panel: CellsPanel, Dock: CellsDock },
  synapse: { Panel: SynapsePanel, Dock: SynapseDock },
  membrane: { Panel: MembranePanel, Dock: MembraneDock },
};
