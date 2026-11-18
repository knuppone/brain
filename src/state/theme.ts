import { create } from 'zustand';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'brain-explorer-theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage unavailable: fall back to the system setting */ }
  return 'system';
}

const resolve = (choice: ThemeChoice): Theme => (choice === 'system' ? (media?.matches ? 'light' : 'dark') : choice);

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

interface ThemeState {
  choice: ThemeChoice;
  /** the theme actually shown */
  theme: Theme;
  setChoice: (c: ThemeChoice) => void;
  /** light → dark → system → … */
  cycle: () => void;
}

const initial = stored();
apply(initial);

export const useTheme = create<ThemeState>((set, get) => ({
  choice: initial,
  theme: resolve(initial),
  setChoice: (choice) => {
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch { /* ignore */ }
    apply(choice);
    set({ choice, theme: resolve(choice) });
  },
  cycle: () => {
    const order: ThemeChoice[] = ['dark', 'light', 'system'];
    get().setChoice(order[(order.indexOf(get().choice) + 1) % order.length]);
  },
}));

media?.addEventListener('change', () => {
  const { choice } = useTheme.getState();
  if (choice === 'system') useTheme.setState({ theme: resolve('system') });
});
