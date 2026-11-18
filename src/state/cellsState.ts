import { create } from 'zustand';
import { TRACE_CELLS } from '../content/cells';

interface CellsState {
  /** the whole cortical column, or one isolated specimen of the selected cell type */
  view: 'column' | 'specimen';
  /** is the microcircuit simulation running */
  running: boolean;
  /** when false the inhibitory interneurons are silenced */
  inhibition: boolean;
  /** colour neurons by part (dendrite / soma / axon / myelin / terminals) */
  labelParts: boolean;
  showGlia: boolean;
  /** increment to deliver a thalamic volley (see stimulate()) */
  stimTick: number;
  set: (p: Partial<CellsState>) => void;
  stimulate: () => void;
}

export const useCells = create<CellsState>((set) => ({
  view: 'column',
  running: true,
  inhibition: true,
  labelParts: false,
  showGlia: true,
  stimTick: 0,
  set: (p) => set(p),
  stimulate: () => set((s) => ({ stimTick: s.stimTick + 1, running: true })),
}));

// handy in development: drive the level from the browser console
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __cells?: typeof useCells }).__cells = useCells;

/**
 * Membrane-potential history for the strip chart. Written by the 3D level every simulation
 * sample, read by the panel's canvas — kept out of zustand because it changes every frame.
 */
export const TRACE_LEN = 480;
export const circuitTrace = {
  /** ms of simulated time per sample */
  sampleMs: 0.25,
  /** ring buffers, one per TRACE_CELLS entry */
  v: TRACE_CELLS.map(() => new Float32Array(TRACE_LEN).fill(-70)),
  /** thalamic input raster: 1 where an input fibre fired during the sample */
  input: new Float32Array(TRACE_LEN),
  /** index of the next sample to be written */
  head: 0,
  /** total samples written */
  count: 0,
};

export function pushTraceSample(values: number[], inputSpike: boolean) {
  const t = circuitTrace;
  for (let i = 0; i < t.v.length; i++) t.v[i][t.head] = values[i] ?? -70;
  t.input[t.head] = inputSpike ? 1 : 0;
  t.head = (t.head + 1) % TRACE_LEN;
  t.count++;
}
