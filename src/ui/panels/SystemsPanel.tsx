import type { CSSProperties } from 'react';
import { useCore } from '../../state/store';
import { useSystems } from '../../state/systemsState';
import { systemById, systemsOf, type BrainSystem, type SystemKind } from '../../content/systems';
import { Bullets, Callout, DiveCTA, Divider, Header, Row, Section, Segmented, Slider, Toggle } from '../kit';
import '../../styles/systems.css';

const MODES: { id: SystemKind; label: string }[] = [
  { id: 'chemical', label: 'Chemical systems' },
  { id: 'pathways', label: 'Pathways' },
];

function Detail({ s }: { s: BrainSystem }) {
  const select = useCore((c) => c.select);
  const goTo = useCore((c) => c.goTo);
  const step = useSystems((x) => x.step);
  const set = useSystems((x) => x.set);
  const style = { '--sys': s.color } as CSSProperties;
  return (
    <div className="sys-detail" style={style}>
      <Header eyebrow={s.eyebrow} color={s.color} title={s.name} lede={s.lede}
        onBack={() => select('systems', null)} backLabel={s.kind === 'chemical' ? 'All chemical systems' : 'All pathways'} />
      <Section title="What it does"><Bullets items={s.does} /></Section>
      {s.steps && (
        <Section title="The route, step by step">
          <ol className="sys-steps">
            {s.steps.map((st, i) => {
              const n = i + 1;
              return (
                <li key={st.label}>
                  <button className={`sys-step ${step === n ? 'on' : step > n ? 'done' : ''}`} aria-current={step === n ? 'step' : undefined}
                    onClick={() => set({ step: step === n ? 0 : n, playing: false })}>
                    <span className="n">{n}</span>
                    <span><b>{st.title}</b><small>{st.explain}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Section>
      )}
      {s.routes && (
        <Section title={s.id === 'fast' ? 'The two fast signals' : 'Where it starts, where it goes'}>
          <div className="sys-routes">
            {s.routes.map((r) => (
              <div className="sys-route" key={r.id}>
                <b>{r.name}</b>
                <span className="path">{r.from}<i>→</i>{r.to}</span>
                <span className="role">{r.role}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="In the clinic"><Callout kind="warn" label="Clinical clue">{s.clinical}</Callout></Section>
      <Section title="Remember this"><Callout kind="fact" label="Did you know">{s.fact}</Callout></Section>
      {s.simplified && <p className="sys-note">{s.simplified}</p>}
      <DiveCTA title="Zoom into the cortex: cells" sub="Meet the neurons and glia these pathways are made of" onClick={() => goTo('cells')} />
    </div>
  );
}

export function SystemsPanel() {
  const sel = useCore((c) => c.selection.systems);
  const select = useCore((c) => c.select);
  const goTo = useCore((c) => c.goTo);
  const mode = useSystems((x) => x.mode);
  const set = useSystems((x) => x.set);
  const s = sel ? systemById.get(sel) : null;
  if (s) return <Detail s={s} />;

  const chemical = mode === 'chemical';
  const items = systemsOf(mode);
  return (
    <>
      <Header eyebrow="Level 2 · Systems" title="How the regions talk"
        lede={chemical
          ? 'A few tiny clusters of neurons deep in the brain spray one chemical each across huge territories, tuning how everything else works.'
          : 'Every skill is a route: signals pass from station to station along cables of white matter. Pick one and follow it.'} />
      <div className="sys-tabs">
        <Segmented value={mode} onChange={(v) => set({ mode: v })} options={MODES} />
      </div>
      <Section title={chemical ? 'Slow and broad: neuromodulators' : 'Fast and precise: functional pathways'}>
        <div className="list">
          {items.filter((i) => i.id !== 'fast').map((i) => (
            <Row key={i.id} title={i.name} sub={i.tagline} color={i.color} onClick={() => select('systems', i.id)} />
          ))}
        </div>
      </Section>
      {chemical ? (
        <Section title="Fast and precise: the wiring itself">
          <div className="list">
            {items.filter((i) => i.id === 'fast').map((i) => (
              <Row key={i.id} title={i.name} sub={i.tagline} color={i.color} onClick={() => select('systems', i.id)} />
            ))}
          </div>
          <Callout kind="note" label="Two kinds of signal">
            Pathways are like phone calls: one sender, one receiver, milliseconds. Neuromodulators are like a radio broadcast:
            one small station, millions of listeners, lasting seconds to minutes.
          </Callout>
        </Section>
      ) : (
        <Callout kind="note" label="How to read it">
          Pulses travel in the direction the signal flows. Select a pathway, then press Play to walk it station by station.
        </Callout>
      )}
      <p className="sys-note">Simplified: tracts are drawn as smooth schematic routes through a real brain atlas, not traced from one person's scan.</p>
      <DiveCTA title="Zoom into the cortex: cells" sub="Meet the neurons and glia these pathways are made of" onClick={() => goTo('cells')} />
    </>
  );
}

export function SystemsDock() {
  const st = useSystems();
  const sel = useCore((c) => c.selection.systems);
  const s = sel ? systemById.get(sel) : null;
  const n = s?.steps?.length ?? 0;
  const go = (step: number) => st.set({ step: Math.max(0, Math.min(n, step)), playing: false });
  return (
    <>
      <span className={n > 0 ? 'sys-wide' : 'sys-all'}>
        <Segmented value={st.mode} onChange={(v) => st.set({ mode: v })}
          options={[{ id: 'chemical', label: 'Chemical' }, { id: 'pathways', label: 'Pathways' }]} />
        {n > 0 && <Divider />}
      </span>
      {n > 0 && (
        <>
          <button className="btn" onClick={() => go(st.step - 1)} disabled={st.step === 0} aria-label="Previous step">‹</button>
          <button className="btn primary"
            onClick={() => st.set(st.playing ? { playing: false } : { playing: true, step: st.step >= n || st.step === 0 ? 1 : st.step })}>
            {st.playing ? '❚❚ Pause' : '▶ Play steps'}
          </button>
          <button className="btn" onClick={() => go(st.step + 1)} disabled={st.step >= n} aria-label="Next step">›</button>
          <span className="sys-stepno">{st.step === 0 ? 'Whole route' : `Step ${st.step} of ${n}`}</span>
        </>
      )}
      <span className="sys-wide">
        <Divider />
        <Slider label="Speed" value={st.speed} min={0} max={3} step={0.05} onChange={(v) => st.set({ speed: v })}
          format={(v) => (v < 0.03 ? 'paused' : `${v.toFixed(1)}×`)} />
        {s && s.id !== 'fast' && <Toggle label="Show others" on={st.showAll} onChange={(v) => st.set({ showAll: v })} />}
        <Toggle label="Labels" on={st.labels} onChange={(v) => st.set({ labels: v })} />
      </span>
    </>
  );
}
