import { create } from 'zustand';
import type { ClipAxis, Granularity } from '../scene/BrainModel';

interface BrainState {
  granularity: Granularity;
  cortexOpacity: number;
  showLeft: boolean;
  showRight: boolean;
  explode: number;
  clipAxis: ClipAxis;
  clipPos: number;
  set: (p: Partial<BrainState>) => void;
}

export const useBrain = create<BrainState>((set) => ({
  granularity: 'lobes',
  cortexOpacity: 0.88,
  showLeft: true,
  showRight: true,
  explode: 0,
  clipAxis: 'none',
  clipPos: 0,
  set: (p) => set(p),
}));
