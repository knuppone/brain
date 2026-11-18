import { create } from 'zustand';

export type LevelId = 'head' | 'brain' | 'systems' | 'cells' | 'synapse' | 'membrane';

export interface LevelMeta {
  id: LevelId;
  name: string;
  /** shown under the name on the scale rail */
  scale: string;
  blurb: string;
}

export const LEVELS: LevelMeta[] = [
  { id: 'head', name: 'Head', scale: '~20 cm', blurb: 'Skin, bone and the membranes that protect the brain.' },
  { id: 'brain', name: 'Brain', scale: '~15 cm', blurb: 'Lobes, deep structures and what each one does.' },
  { id: 'systems', name: 'Systems', scale: '~10 cm', blurb: 'Pathways and chemical systems that link regions.' },
  { id: 'cells', name: 'Cells', scale: '~1 mm', blurb: 'Neurons, glia and the circuits they form.' },
  { id: 'synapse', name: 'Synapse', scale: '~1 µm', blurb: 'Where one neuron talks to the next.' },
  { id: 'membrane', name: 'Membrane', scale: '~10 nm', blurb: 'Ion channels and the action potential.' },
];

export const levelIndex = (id: LevelId) => LEVELS.findIndex((l) => l.id === id);

interface CoreState {
  level: LevelId;
  /** level we are flying to, while a transition is running */
  pendingLevel: LevelId | null;
  loading: boolean;
  loadProgress: number;
  /** one selected item id per level */
  selection: Record<LevelId, string | null>;
  hover: { text: string; sub?: string } | null;
  /** 0..1 while the user scrolls past a zoom limit; sign gives direction */
  diveHint: { dir: 'in' | 'out'; progress: number } | null;
  scaleBar: { px: number; label: string } | null;
  tourStep: number | null;
  searchOpen: boolean;
  aboutOpen: boolean;
  quizOpen: boolean;
  panelOpen: boolean;

  /** request a level change (SceneManager performs the animated transition) */
  goTo: (level: LevelId, select?: string | null) => void;
  select: (level: LevelId, id: string | null) => void;
  set: (patch: Partial<CoreState>) => void;
}

const noSelection: Record<LevelId, string | null> = {
  head: null, brain: null, systems: null, cells: null, synapse: null, membrane: null,
};

/** SceneManager installs the real implementation; the store just forwards. */
export const navigation: { goTo: (level: LevelId, select?: string | null) => void } = {
  goTo: () => {},
};

export const useCore = create<CoreState>((set, get) => ({
  level: 'head',
  pendingLevel: null,
  loading: true,
  loadProgress: 0,
  selection: { ...noSelection },
  hover: null,
  diveHint: null,
  scaleBar: null,
  tourStep: null,
  searchOpen: false,
  aboutOpen: false,
  quizOpen: false,
  panelOpen: true,

  goTo: (level, select) => {
    if (select !== undefined) get().select(level, select);
    navigation.goTo(level, select);
  },
  select: (level, id) => set((s) => ({ selection: { ...s.selection, [level]: id }, panelOpen: id ? true : s.panelOpen })),
  set: (patch) => set(patch),
}));
