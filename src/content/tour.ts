import type { LevelId } from '../state/store';
import { useCore } from '../state/store';
import { useHead } from '../state/headState';
import { useBrain } from '../state/brainState';

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
    level: 'head', title: 'Start outside',
    text: 'Your brain is soft — about as firm as tofu — so it travels in armour: skin, bone, three membranes and a moat of fluid.',
    try: 'Drag to turn the head. The cutaway shows each layer as a step.',
    apply: () => { useHead.getState().set({ peel: 0, cutaway: true }); sel('head', null); },
  },
  {
    level: 'head', title: 'Through the skull',
    text: 'Under the scalp, the skull is a sandwich of hard bone around a spongy core. Beneath it the leathery dura mater lines the bone.',
    try: 'Slide "Peel layers" yourself to take them off one at a time.',
    apply: () => { useHead.getState().set({ peel: 2, cutaway: false }); sel('head', 'dura'); },
  },
  {
    level: 'head', title: 'The brain, afloat',
    text: 'Clear cerebrospinal fluid lets the 1.4 kg brain float as if it weighed 50 g. With the last membrane gone, the folded cortex appears.',
    apply: () => { useHead.getState().set({ peel: 4, cutaway: false }); sel('head', 'pia'); },
  },
  {
    level: 'brain', title: 'A map of specialists',
    text: 'The wrinkled outer sheet is the cerebral cortex. Its lobes have different jobs: planning and movement in front, touch on top, hearing at the sides, vision at the back.',
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
];
