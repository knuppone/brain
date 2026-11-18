import { useEffect, useRef } from 'react';
import { SceneManager } from './scene/SceneManager';
import { createLevels } from './scene/levels';
import { LEVELS, levelIndex, useCore } from './state/store';
import { PANELS } from './ui/panels';
import { useHead } from './state/headState';
import { useBrain } from './state/brainState';
import { DiveHint, HoverTip, Loading, ScaleRail, TopBar } from './ui/Chrome';
import { Overlays } from './ui/Overlays';

declare global {
  interface Window { __brain?: Record<string, unknown> & { manager: SceneManager; core: typeof useCore } }
}

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const level = useCore((s) => s.level);
  const panelOpen = useCore((s) => s.panelOpen);
  const set = useCore((s) => s.set);

  useEffect(() => {
    const manager = new SceneManager(stageRef.current!, fadeRef.current!);
    managerRef.current = manager;
    createLevels().forEach((l) => manager.register(l));
    const start = (new URLSearchParams(location.search).get('level') as typeof level) || 'head';
    void manager.start(LEVELS.some((l) => l.id === start) ? start : 'head');
    window.__brain = { manager, core: useCore, head: useHead, brain: useBrain };
    return () => manager.dispose();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const s = useCore.getState();
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); s.set({ searchOpen: true }); }
      else if (e.key === 'Escape') {
        if (s.searchOpen || s.aboutOpen || s.quizOpen) s.set({ searchOpen: false, aboutOpen: false, quizOpen: false });
        else if (s.selection[s.level]) s.select(s.level, null);
      } else if (e.key === 'r' || e.key === 'R') managerRef.current?.resetView();
      else if (e.key === ']' || e.key === '[') {
        const i = levelIndex(s.level) + (e.key === ']' ? 1 : -1);
        if (LEVELS[i]) s.goTo(LEVELS[i].id);
      } else if (/^[1-6]$/.test(e.key)) s.goTo(LEVELS[+e.key - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { Panel, Dock } = PANELS[level];
  return (
    <div className={`app ${panelOpen ? '' : 'panel-closed'}`} data-level={level}>
      <div className="stage" ref={stageRef} />
      <div className="fade" ref={fadeRef} />
      <TopBar onReset={() => managerRef.current?.resetView()} />
      <ScaleRail />
      <aside className={`panel ${panelOpen ? '' : 'closed'}`} aria-label="Details">
        <div className="panel-scroll" key={level}>
          <Panel />
        </div>
      </aside>
      <button className="tb-btn icon panel-toggle" style={{ right: panelOpen ? 'calc(var(--panel-w) + 22px)' : 14 }}
        onClick={() => set({ panelOpen: !panelOpen })} aria-label={panelOpen ? 'Hide details' : 'Show details'}
        title={panelOpen ? 'Hide details' : 'Show details'}>
        {panelOpen ? '›' : '‹'}
      </button>
      <div className="dock"><div className="dock-inner"><Dock /></div></div>
      <DiveHint />
      <HoverTip />
      <Overlays />
      <Loading />
    </div>
  );
}
