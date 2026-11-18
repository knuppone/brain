import { useEffect, useMemo, useRef, useState } from 'react';
import { LEVELS, useCore } from '../state/store';
import { search } from '../content/searchIndex';
import { TOUR } from '../content/tour';
import { QUIZ } from '../content/quiz';

const levelName = (id: string) => LEVELS.find((l) => l.id === id)?.name ?? id;

function Search() {
  const close = () => useCore.getState().set({ searchOpen: false });
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const results = useMemo(() => search(q), [q]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setCursor(0), [q]);
  const go = (i: number) => {
    const r = results[i];
    if (!r) return;
    close();
    useCore.getState().goTo(r.level, r.id);
  };
  const suggestions = ['hippocampus', 'dopamine', 'motor cortex', 'myelin', 'serotonin', 'amygdala'];
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Search">
        <div className="modal-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={inputRef} value={q} placeholder="Search any structure, cell, chemical or concept…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter') go(cursor);
              else if (e.key === 'Escape') close();
            }} />
          <kbd>esc</kbd>
        </div>
        <div className="modal-body">
          {results.map((r, i) => (
            <button key={`${r.level}-${r.id}`} className={`result ${i === cursor ? 'on' : ''}`}
              onPointerEnter={() => setCursor(i)} onClick={() => go(i)}>
              <span><b>{r.name}</b><small>{r.tagline}</small></span>
              <span className="lvl">{levelName(r.level)}</span>
            </button>
          ))}
          {!results.length && q && <div className="empty">Nothing found for “{q}”.</div>}
          {!q && (
            <div className="empty">
              <div style={{ marginBottom: 10 }}>Try one of these</div>
              <div className="chips" style={{ justifyContent: 'center' }}>
                {suggestions.map((s) => <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function About() {
  const close = () => useCore.getState().set({ aboutOpen: false });
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide" role="dialog" aria-label="About Brain Explorer">
        <div className="modal-head">
          <h2>About Brain Explorer</h2>
          <button className="btn" onClick={close}>Close</button>
        </div>
        <div className="modal-body pad">
          <p>
            One continuous zoom from the whole brain to a single ion channel: five levels, each a thousand or so times smaller
            than the one before. Use the rail on the left, the guided tour, or simply keep scrolling in.
          </p>
          <h3>CONTROLS</h3>
          <p>
            <b>Drag</b> rotate · <b>scroll / pinch</b> zoom · <b>right-drag / two-finger drag</b> pan · <b>click</b> select ·
            <b> double-click</b> focus or drill down. Keep scrolling past the zoom limit to dive to the next level.
          </p>
          <p>
            <kbd>/</kbd> search · <kbd>1</kbd>–<kbd>5</kbd> jump to a level · <kbd>[</kbd> <kbd>]</kbd> previous / next level ·
            <kbd>R</kbd> reset view · <kbd>Esc</kbd> deselect
          </p>
          <h3>HOW ACCURATE IS IT?</h3>
          <p>
            The brain is built from real imaging data, not sculpted by hand. The cortex is the FreeSurfer
            “fsaverage” template coloured by the Desikan–Killiany atlas; deep structures and the cerebellum come from
            standard MRI atlases. The
            brainstem and hypothalamus are sculpted from published landmarks.
          </p>
          <p>
            Cells, synapses and membranes are procedural models: shapes and proportions follow textbook anatomy, sizes
            are exaggerated where that helps legibility, and the action potential runs on the real Hodgkin–Huxley
            equations. Where something is simplified, the text says so.
          </p>
          <h3>DATA SOURCES</h3>
          <p>
            FreeSurfer fsaverage5 surfaces (Fischl et al.; distributed with nilearn) · Desikan–Killiany labels and
            subcortical surfaces from the ENIGMA Toolbox (BSD-3) · AAL atlas (Tzourio-Mazoyer et al. 2002) via the
            NiiVue demo images.
            See ATTRIBUTION.md in the repository for details.
          </p>
          <p style={{ color: 'var(--dim)' }}>
            Brain Explorer is for learning. It is not a medical reference and must not be used for diagnosis.
          </p>
        </div>
      </div>
    </div>
  );
}

function Quiz() {
  const close = () => useCore.getState().set({ quizOpen: false });
  const level = useCore((s) => s.level);
  const questions = useMemo(() => {
    const own = QUIZ.filter((q) => q.level === level);
    return own.length ? own : QUIZ;
  }, [level]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const done = i >= questions.length;
  const q = questions[Math.min(i, questions.length - 1)];
  const pick = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    if (k === q.answer) setScore((s) => s + 1);
  };
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Quiz">
        <div className="modal-head">
          <h2>Quick quiz · {levelName(level)}</h2>
          <button className="btn" onClick={close}>Close</button>
        </div>
        <div className="modal-body pad">
          {done ? (
            <>
              <div className="quiz-q">You got {score} of {questions.length}.</div>
              <p>{score === questions.length ? 'Perfect — time to go one level deeper.' : 'Explore the level a bit more and try again.'}</p>
              <div className="quiz-foot">
                <span />
                <button className="btn primary" onClick={() => { setI(0); setPicked(null); setScore(0); }}>Try again</button>
              </div>
            </>
          ) : (
            <>
              <div className="quiz-q">{q.q}</div>
              <div className="quiz-opts">
                {q.options.map((o, k) => (
                  <button key={o} disabled={picked !== null}
                    className={`quiz-opt ${picked !== null && k === q.answer ? 'right' : ''} ${picked === k && k !== q.answer ? 'wrong' : ''}`}
                    onClick={() => pick(k)}>{o}</button>
                ))}
              </div>
              {picked !== null && <p className="quiz-why">{picked === q.answer ? '✓ Correct. ' : '✗ Not quite. '}{q.why}</p>}
              <div className="quiz-foot">
                <span>Question {i + 1} of {questions.length}</span>
                <button className="btn primary" disabled={picked === null} onClick={() => { setI(i + 1); setPicked(null); }}>
                  {i + 1 === questions.length ? 'See score' : 'Next'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Tour() {
  const step = useCore((s) => s.tourStep)!;
  const level = useCore((s) => s.level);
  const pending = useCore((s) => s.pendingLevel);
  const s = TOUR[step];
  // travel to the step's level, then set the scene up once we have arrived
  useEffect(() => {
    if (!s) return;
    if (level !== s.level) {
      if (!pending) useCore.getState().goTo(s.level);
      return;
    }
    if (pending) return;
    const t = setTimeout(() => s.apply?.(), 60);
    return () => clearTimeout(t);
  }, [step, level, pending, s]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const st = useCore.getState();
      if (st.tourStep === null) return;
      if (e.key === 'ArrowRight') st.set({ tourStep: Math.min(st.tourStep + 1, TOUR.length - 1) });
      if (e.key === 'ArrowLeft') st.set({ tourStep: Math.max(st.tourStep - 1, 0) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!s) return null;
  const set = useCore.getState().set;
  const last = step === TOUR.length - 1;
  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      <div className="step">Guided tour · {step + 1} / {TOUR.length} · {levelName(s.level)}</div>
      <h3>{s.title}</h3>
      <p>{s.text}</p>
      {s.try && <p className="try">Try it: {s.try}</p>}
      <div className="nav">
        <div className="pips">{TOUR.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <button className="btn" onClick={() => set({ tourStep: null })}>End</button>
        <button className="btn" disabled={step === 0} onClick={() => set({ tourStep: step - 1 })}>Back</button>
        <button className="btn primary" onClick={() => set({ tourStep: last ? null : step + 1 })}>{last ? 'Finish' : 'Next'}</button>
      </div>
    </div>
  );
}

export function Overlays() {
  const searchOpen = useCore((s) => s.searchOpen);
  const aboutOpen = useCore((s) => s.aboutOpen);
  const quizOpen = useCore((s) => s.quizOpen);
  const tourStep = useCore((s) => s.tourStep);
  const level = useCore((s) => s.level);
  return (
    <>
      {tourStep !== null && <Tour />}
      {searchOpen && <Search />}
      {aboutOpen && <About />}
      {quizOpen && <Quiz key={level} />}
    </>
  );
}
