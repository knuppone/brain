import { create } from 'zustand';
import { SynapseSim, type DrugId, type TransmitterId } from '../sim/synapse';

/** the one simulation instance: stepped by the 3D level, read by the panel's meters and chart */
export const synapseSim = new SynapseSim(7);

interface SynapseState {
  transmitter: TransmitterId;
  /** drugs / toxins switched on (only those relevant to the transmitter have an effect) */
  drugs: DrugId[];
  /** chance that each docked vesicle is released by a spike */
  pRelease: number;
  /** playback speed of the slow-motion movie (1 = normal slow motion) */
  speed: number;
  autoFire: boolean;
  /** spikes per movie-second while auto-fire is on */
  rate: number;
  labels: boolean;
  /** pause at each stage of the sequence and wait for "Next" */
  stepMode: boolean;
  /** other synapses keep the receiving cell hovering near threshold */
  background: boolean;

  set: (p: Partial<Omit<SynapseState, 'set' | 'fire' | 'burst' | 'next' | 'toggleDrug' | 'resetLTP'>>) => void;
  fire: () => void;
  burst: () => void;
  next: () => void;
  toggleDrug: (id: DrugId, on?: boolean) => void;
  resetLTP: () => void;
}

export const useSynapse = create<SynapseState>((set, get) => ({
  transmitter: 'glutamate',
  drugs: [],
  pRelease: 0.5,
  speed: 1,
  autoFire: false,
  rate: 1,
  labels: true,
  stepMode: false,
  background: false,

  set: (p) => set(p),
  fire: () => synapseSim.fire(),
  burst: () => synapseSim.burst(5),
  next: () => synapseSim.next(),
  toggleDrug: (id, on) => {
    const cur = get().drugs;
    const want = on ?? !cur.includes(id);
    if (want === cur.includes(id)) return;
    set({ drugs: want ? [...cur, id] : cur.filter((d) => d !== id) });
  },
  resetLTP: () => synapseSim.resetLTP(),
}));

/** copy the store's options into the simulation (cheap; safe to call on every change) */
export function syncSim() {
  const s = useSynapse.getState();
  synapseSim.setTransmitter(s.transmitter);
  synapseSim.setDrugs(s.drugs);
  synapseSim.pRelease = s.pRelease;
  synapseSim.autoRate = s.autoFire && !s.stepMode ? s.rate : 0;
  synapseSim.background = s.background;
  synapseSim.setStepMode(s.stepMode);
}
useSynapse.subscribe(syncSim);

/** low-rate readouts for React (the level updates this a few times a second) */
interface LiveState {
  stage: number;
  held: boolean;
  cleft: number;
  open: number;
  docked: number;
  messenger: number;
  ampa: number;
  ltp: number;
  postSpikes: number;
  /** seconds since the receiving neuron last fired (large if never) */
  sinceFired: number;
  set: (p: Partial<LiveState>) => void;
}

export const useSynapseLive = create<LiveState>((set) => ({
  stage: 0, held: false, cleft: 0, open: 0, docked: 8, messenger: 0, ampa: 9, ltp: 0, postSpikes: 0, sinceFired: 99,
  set: (p) => set(p),
}));

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__synapse = { store: useSynapse, sim: synapseSim, live: useSynapseLive };
}
