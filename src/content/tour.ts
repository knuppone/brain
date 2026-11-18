import type { LevelId } from '../state/store';
import { useCore } from '../state/store';
import { useBrain } from '../state/brainState';
import { useSystems } from '../state/systemsState';
import { useCells } from '../state/cellsState';
import { useSynapse } from '../state/synapseState';
import { useMembrane } from '../state/membraneState';

export interface TourStep {
  level: LevelId;
  title: string;
  text: string;
  /** a nudge to interact */
  try?: string;
  /** put the app into the right state for this step (runs after arriving on the level) */
  apply?: () => void;
}

const sel = (level: LevelId, id: string | null) => useCore.getState().select(level, id);
const brainDefaults = { granularity: 'lobes' as const, cortexOpacity: 1, showLeft: true, showRight: true, explode: 0, clipAxis: 'none' as const, clipPos: 0 };

export const TOUR: TourStep[] = [
  {
    level: 'brain', title: 'A map of specialists',
    text: 'Your brain is soft — about as firm as tofu — and floats in clear fluid inside the skull, wrapped in three membranes. The wrinkled outer sheet is the cerebral cortex. Its lobes have different jobs: planning and movement in front, touch on top, hearing at the sides, vision at the back.',
    try: 'Click any lobe. Double-click to drill down into its areas.',
    apply: () => { useBrain.getState().set(brainDefaults); sel('brain', null); },
  },
  {
    level: 'brain', title: 'Where movement begins',
    text: 'This strip — the primary motor cortex — sends the final commands for voluntary movement. Each part controls a different body part on the opposite side.',
    apply: () => { useBrain.getState().set(brainDefaults); sel('brain', 'precentral'); },
  },
  {
    level: 'brain', title: 'Hidden in the middle',
    text: 'Beneath the cortex lie older structures. The hippocampus, curled deep in the temporal lobe, turns today\'s experiences into lasting memories.',
    try: 'Lower the Cortex slider or use Slice to look inside for yourself.',
    apply: () => { useBrain.getState().set(brainDefaults); sel('brain', 'hippocampus'); },
  },
  {
    level: 'systems', title: 'Regions are wired together',
    text: 'No region works alone. Here the brain turns to glass so you can follow a signal: light enters the eyes, crosses to the thalamus, and only becomes sight at the very back of the brain.',
    try: 'Press "Play steps" to walk the route station by station.',
    apply: () => { useSystems.getState().set({ mode: 'pathways', showAll: false, step: 0 }); sel('systems', 'vision'); },
  },
  {
    level: 'systems', title: 'Brain chemistry: dopamine',
    text: 'A few thousand neurons in the midbrain spray dopamine over huge territories. One river starts movements, one drives motivation, one sharpens planning. It signals "better than expected" — not simply pleasure.',
    try: 'Compare it with serotonin and noradrenaline in the list.',
    apply: () => { useSystems.getState().set({ mode: 'chemical', showAll: false }); sel('systems', 'dopamine'); },
  },
  {
    level: 'cells', title: 'A forest of cells',
    text: 'Zoom in a hundred times and the grey matter becomes a forest. Neurons carry signals; glia feed, insulate and protect them. This sliver of cortex is 1 mm wide.',
    try: 'Click any cell to learn its type. Press Stimulate to send a volley in from the thalamus.',
    apply: () => { useCells.getState().set({ view: 'column', running: true, inhibition: true, showGlia: true, labelParts: false }); sel('cells', null); setTimeout(() => useCells.getState().stimulate(), 1200); },
  },
  {
    level: 'cells', title: 'Anatomy of a neuron',
    text: 'Every neuron follows one plan: dendrites collect input, the cell body adds it up, and if the total is high enough a spike starts at the axon hillock and travels down the axon.',
    apply: () => { sel('cells', 'pyramidal'); useCells.getState().set({ view: 'specimen', labelParts: true }); },
  },
  {
    level: 'synapse', title: 'The gap between neurons',
    text: 'Neurons do not touch. At the synapse an arriving spike lets calcium in, vesicles spill transmitter into the gap, and receptors on the far side open. Watch a burst push the next neuron toward firing.',
    try: 'Switch the transmitter to GABA or dopamine, then switch on a drug to see where it acts.',
    apply: () => { useSynapse.getState().set({ transmitter: 'glutamate', drugs: [], stepMode: false, autoFire: false, labels: true }); sel('synapse', null); setTimeout(() => useSynapse.getState().burst(), 1400); },
  },
  {
    level: 'membrane', title: 'The spark itself',
    text: 'Deepest of all: a patch of membrane 10 nanometres across. Sodium channels snap open and Na⁺ rushes in; a millisecond later they plug themselves and potassium channels let K⁺ out. That voltage flip is the action potential.',
    try: 'Press Stimulate with a weak and a strong pulse — the spike is all-or-none. Then block the Na⁺ channels with TTX.',
    apply: () => { useMembrane.getState().set({ view: 'channels', ttx: false, tea: false, sustained: 0, paused: false, stimStrength: 20 }); sel('membrane', null); setTimeout(() => useMembrane.getState().stimulate(), 1500); },
  },
  {
    level: 'membrane', title: 'Racing down the axon',
    text: 'Each patch of membrane triggers the next, so the spike travels like a flame along a fuse. Wrap the axon in myelin and the signal leaps from gap to gap, over ten times faster.',
    try: 'Stimulate with myelin off, then on. Then damage the myelin — this is what happens in multiple sclerosis.',
    apply: () => { useMembrane.getState().set({ view: 'axon', myelin: true, damage: 'none', paused: false }); sel('membrane', null); setTimeout(() => useMembrane.getState().stimulateAxon('start'), 1800); },
  },
  {
    level: 'brain', title: 'Back to the whole',
    text: 'Every thought, memory and movement is billions of those tiny voltage flips, passed across trillions of synapses, routed through the regions you met at the start. Now explore on your own.',
    try: 'Press / to search for anything, or take the quiz on any level.',
    apply: () => { useBrain.getState().set(brainDefaults); sel('brain', null); },
  },
];
