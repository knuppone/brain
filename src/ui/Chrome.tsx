import { useEffect, useState } from 'react';
import { LEVELS, levelIndex, useCore } from '../state/store';
import { useTheme } from '../state/theme';

export function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.5 3.5a3 3 0 0 0-3 3v.3A3.2 3.2 0 0 0 4 10a3.2 3.2 0 0 0 1 2.3A3.4 3.4 0 0 0 4.5 14a3.5 3.5 0 0 0 3 3.5V18a2.5 2.5 0 0 0 4.5 1.5V5.5a2.5 2.5 0 0 0-2.5-2z" />
      <path d="M14.5 3.5a3 3 0 0 1 3 3v.3A3.2 3.2 0 0 1 20 10a3.2 3.2 0 0 1-1 2.3 3.4 3.4 0 0 1 .5 1.7 3.5 3.5 0 0 1-3 3.5V18a2.5 2.5 0 0 1-4.5 1.5" />
      <path d="M8 10.5c1.2 0 2-.6 2.5-1.5M16 10.5c-1.2 0-2-.6-2.5-1.5M8.5 14.5c1 0 1.800.4 2.300 1.2" />
    </svg>
  );
}

export function TopBar({ onReset }: { onReset: () => void }) {
  const level = useCore((s) => s.level);
  const set = useCore((s) => s.set);
  const goTo = useCore((s) => s.goTo);
  const idx = levelIndex(level);
  return (
    <div className="topbar">
      <div className="brand"><BrandMark /><span>Brain Explorer</span></div>
      <nav className="crumbs" aria-label="Where you are">
        {LEVELS.slice(0, idx + 1).map((l, i) => (
          <span key={l.id}>
            {i > 0 && <span className="sep">›</span>}
            <button className={i === idx ? 'here' : ''} onClick={() => goTo(l.id)}>{l.name}</button>
          </span>
        ))}
      </nav>
      <span className="spacer" />
      <button className="tb-btn" onClick={() => set({ searchOpen: true })} title="Search (press /)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="lbl">Search</span> <kbd className="lbl">/</kbd>
      </button>
      <button className="tb-btn" onClick={() => set({ quizOpen: true })}><span>Quiz</span></button>
      <button className="tb-btn icon" onClick={onReset} title="Reset view (R)" aria-label="Reset view">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
      </button>
      <ThemeButton />
      <button className="tb-btn icon" onClick={() => set({ aboutOpen: true })} title="About & sources" aria-label="About">?</button>
      <button className="tb-btn primary" onClick={() => set({ tourStep: 0 })}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
        <span>Guided tour</span>
      </button>
    </div>
  );
}

function ThemeButton() {
  const choice = useTheme((s) => s.choice);
  const cycle = useTheme((s) => s.cycle);
  const label = choice === 'system' ? 'Theme: follows your system' : choice === 'light' ? 'Theme: light' : 'Theme: dark';
  return (
    <button className="tb-btn icon" onClick={cycle} title={`${label} — click to change`} aria-label={label}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {choice === 'light' && (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)}
        {choice === 'dark' && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
        {choice === 'system' && (<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>)}
      </svg>
    </button>
  );
}

export function ScaleRail() {
  const level = useCore((s) => s.level);
  const pending = useCore((s) => s.pendingLevel);
  const goTo = useCore((s) => s.goTo);
  const scaleBar = useCore((s) => s.scaleBar);
  const shown = pending ?? level;
  const idx = levelIndex(shown);
  return (
    <>
      <nav className="rail" aria-label="Scale levels">
        {LEVELS.map((l, i) => (
          <button key={l.id} className={`rail-item ${i === idx ? 'active' : ''} ${i < idx ? 'past' : ''}`}
            onClick={() => goTo(l.id)} title={l.blurb} aria-current={i === idx}>
            <span className="dot" />
            <span><b>{l.name}</b><small>{l.scale}</small></span>
          </button>
        ))}
      </nav>
      {scaleBar && (
        <div className="scalebar">
          <div className="bar" style={{ width: scaleBar.px }} />
          {scaleBar.label}
        </div>
      )}
    </>
  );
}

export function HoverTip() {
  const hover = useCore((s) => s.hover);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const on = (e: PointerEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', on);
    return () => window.removeEventListener('pointermove', on);
  }, []);
  if (!hover) return null;
  const flip = pos.x > window.innerWidth - 300;
  return (
    <div className="tooltip" style={{ left: pos.x, top: pos.y, transform: flip ? 'translate(calc(-100% - 14px), 16px)' : undefined }}>
      <b>{hover.text}</b>
      {hover.sub && <span>{hover.sub}</span>}
    </div>
  );
}

export function DiveHint() {
  const hint = useCore((s) => s.diveHint);
  const level = useCore((s) => s.level);
  if (!hint) return null;
  const next = LEVELS[levelIndex(level) + (hint.dir === 'in' ? 1 : -1)];
  if (!next) return null;
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="divehint">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="var(--panel)" stroke="var(--line-strong)" strokeWidth="3" />
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - hint.progress)} transform="rotate(-90 34 34)" />
        <path d={hint.dir === 'in' ? 'M34 24v20M26 36l8 8 8-8' : 'M34 44V24M26 32l8-8 8 8'} stroke="var(--text)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Keep scrolling to {hint.dir === 'in' ? 'dive into' : 'pull back to'} <b>{next.name}</b></span>
    </div>
  );
}

export function Loading() {
  const loading = useCore((s) => s.loading);
  const p = useCore((s) => s.loadProgress);
  return (
    <div className={`loading ${loading ? '' : 'done'}`} aria-hidden={!loading}>
      <div className="box">
        <div style={{ color: 'var(--accent)', display: 'grid', placeItems: 'center', marginBottom: 14 }}><BrandMark /></div>
        <h1>Brain Explorer</h1>
        <p>From whole brain to ion channel, one zoom at a time.</p>
        <div className="meter"><i style={{ width: `${Math.round(p * 100)}%` }} /></div>
      </div>
    </div>
  );
}
