import { create } from 'zustand';

export type MembraneView = 'channels' | 'axon';
/** what the membrane is doing right now (derived from the simulation by the level) */
export type PhaseId = 'rest' | 'stimulus' | 'rising' | 'peak' | 'falling' | 'undershoot' | 'recovery' | 'stuck';
export const PHASE_ORDER: PhaseId[] = ['rest', 'stimulus', 'rising', 'peak', 'falling', 'undershoot', 'recovery', 'stuck'];
export type Damage = 'none' | 'mild' | 'severe';
export type StimFeedback = 'spike' | 'sub' | 'refractory' | 'blocked';

export interface AxonReadout {
  status: 'idle' | 'travelling' | 'arrived' | 'blocked';
  /** measured conduction speeds in m/s (null until that build of the fibre has been run) */
  speedBare: number | null;
  speedMyelin: number | null;
  /** speed of the latest run with the current settings (may include a damaged stretch) */
  speedNow: number | null;
}

interface MembraneState {
  // ---- options (all drivable from outside, e.g. by the guided tour)
  view: MembraneView;
  labels: boolean;
  paused: boolean;
  /** slow motion: simulated milliseconds per second of screen time (channels view; the axon view runs 8× this) */
  speed: number;
  /** strength of the brief (0.5 ms) stimulus pulse, µA/cm² */
  stimStrength: number;
  /** steady injected current, µA/cm² */
  sustained: number;
  /** gap between the two pulses of "double pulse", ms */
  doubleGap: number;
  /** tetrodotoxin: block voltage-gated Na⁺ channels */
  ttx: boolean;
  /** tetraethylammonium: block voltage-gated K⁺ channels */
  tea: boolean;
  /** axon view */
  myelin: boolean;
  damage: Damage;

  // ---- commands: bump a counter, the level reacts
  stimNonce: number;
  doubleNonce: number;
  stepNonce: number;
  resetNonce: number;
  axonStimNonce: number;
  axonStimSite: 'start' | 'middle';

  // ---- read-outs written by the level
  phase: PhaseId;
  feedback: { kind: StimFeedback; n: number } | null;
  /** firing rate from the last two spikes, Hz of real (simulated) time; 0 when silent */
  rateHz: number;
  axon: AxonReadout;

  set: (p: Partial<MembraneState>) => void;
  stimulate: () => void;
  doublePulse: () => void;
  stepOnce: () => void;
  reset: () => void;
  stimulateAxon: (site?: 'start' | 'middle') => void;
}

export const useMembrane = create<MembraneState>((set) => ({
  view: 'channels',
  labels: true,
  paused: false,
  speed: 0.5,
  stimStrength: 20,
  sustained: 0,
  doubleGap: 5,
  ttx: false,
  tea: false,
  myelin: false,
  damage: 'none',

  stimNonce: 0,
  doubleNonce: 0,
  stepNonce: 0,
  resetNonce: 0,
  axonStimNonce: 0,
  axonStimSite: 'start',

  phase: 'rest',
  feedback: null,
  rateHz: 0,
  axon: { status: 'idle', speedBare: null, speedMyelin: null, speedNow: null },

  set: (p) => set(p),
  stimulate: () => set((s) => ({ stimNonce: s.stimNonce + 1, paused: false })),
  doublePulse: () => set((s) => ({ doubleNonce: s.doubleNonce + 1, paused: false })),
  stepOnce: () => set((s) => ({ stepNonce: s.stepNonce + 1, paused: true })),
  reset: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
  stimulateAxon: (site = 'start') => set((s) => ({ axonStimNonce: s.axonStimNonce + 1, axonStimSite: site, paused: false })),
}));

// ----------------------------------------------------------------------------------------------
// Live, non-reactive data shared between the 3D level (writer) and the canvas chart (reader).
// It changes every frame, so it deliberately lives outside React/zustand.

const N = 6000;
/** seconds of simulated time between stored samples */
export const SAMPLE_MS = 0.02;
export const AXON_SAMPLES = 240;

export const membraneLive = {
  // ring buffer of the membrane patch history
  size: N,
  head: 0,
  count: 0,
  t: new Float64Array(N),
  V: new Float32Array(N),
  /** fraction of Na⁺ / K⁺ channels conducting (m³h, n⁴), after any block */
  naOpen: new Float32Array(N),
  kOpen: new Float32Array(N),
  phase: new Uint8Array(N),
  stim: new Float32Array(N),
  now: {
    t: 0, V: -65, m: 0.05, h: 0.6, n: 0.32,
    naOpen: 0, naInactivated: 0, naTotal: 0, kOpen: 0, kTotal: 0,
  },
  axon: {
    lengthMm: 30,
    t: 0,
    /** membrane potential resampled evenly along the axon */
    V: new Float32Array(AXON_SAMPLES).fill(-65),
    /** node positions (mm) when myelinated, else empty */
    nodes: [] as number[],
    /** damaged stretch [from, to] in mm, or null */
    damaged: null as [number, number] | null,
    /** stimulus position, mm */
    stimX: 0,
  },
};

export function pushSample(t: number, V: number, naOpen: number, kOpen: number, phase: number, stim: number) {
  const L = membraneLive;
  const i = L.head;
  L.t[i] = t; L.V[i] = V; L.naOpen[i] = naOpen; L.kOpen[i] = kOpen; L.phase[i] = phase; L.stim[i] = stim;
  L.head = (i + 1) % N;
  if (L.count < N) L.count++;
}

export function clearSamples() {
  membraneLive.head = 0;
  membraneLive.count = 0;
}

// dev convenience: drive the level from the browser console / screenshot scripts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __membrane: unknown }).__membrane = { store: useMembrane, live: membraneLive };
}
