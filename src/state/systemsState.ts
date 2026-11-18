import { create } from 'zustand';
import type { SystemKind } from '../content/systems';

interface SystemsState {
  /** which family of systems is on stage */
  mode: SystemKind;
  /** keep the other systems of the mode faintly visible while one is selected */
  showAll: boolean;
  /** pulse speed multiplier */
  speed: number;
  /** pathways: highlighted station, 1-based; 0 = the whole route flows */
  step: number;
  /** pathways: walk the route station by station automatically */
  playing: boolean;
  /** 3D name tags on nuclei and stations */
  labels: boolean;
  set: (p: Partial<SystemsState>) => void;
}

export const useSystems = create<SystemsState>((set) => ({
  mode: 'chemical',
  showAll: false,
  speed: 1,
  step: 0,
  playing: false,
  labels: true,
  set: (p) => set(p),
}));
