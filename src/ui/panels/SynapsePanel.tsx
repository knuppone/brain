import { useEffect, useRef } from 'react';
import { useCore } from '../../state/store';
import { synapseSim, useSynapse, useSynapseLive } from '../../state/synapseState';
import { TRACE_DT, TRACE_N, V_REST, V_THRESHOLD, type DrugId, type TransmitterId } from '../../sim/synapse';
import {
  CAFFEINE, COLORS, FACTS, PARTS, STAGES, TRANSMITTERS, drugById, drugsFor, partById, transmitterById,
  type DrugInfo,
} from '../../content/synapse';
import { Bullets, Callout, Chip, DiveCTA, Divider, Header, Meter, Row, Section, Slider, Toggle } from '../kit';
import '../../styles/synapse.css';

/** the stage of the sequence at which each drug interferes */
const DRUG_STAGE: Record<DrugId, number> = {
  botox: 3, curare: 5, antipsychotic: 5, ketamine: 5, benzo: 5, alcohol: 5, nicotine: 5,
  ssri: 6, cocaine: 6, amphetamine: 6, donepezil: 6, nerveagent: 6,
};

const isModulator = (t: TransmitterId) => t === 'dopamine' || t === 'serotonin';

// -------------------------------------------------------------------- chart
/** live trace of the receiving neuron's membrane potential (and the slow internal signal for modulators) */
function PotentialChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv || !cv.clientWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth, Hh = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
      const g = cv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, Hh);
      const sim = synapseSim;
      const info = transmitterById.get(sim.transmitter)!;
      const padL = 34, padR = 8, padT = 10, padB = 16;
      const vMax = -44, vMin = -88;
      const x = (i: number) => padL + (i / (TRACE_N - 1)) * (W - padL - padR);
      const y = (v: number) => padT + ((vMax - v) / (vMax - vMin)) * (Hh - padT - padB);
      g.font = '10.5px ui-sans-serif, system-ui, sans-serif';
      g.textBaseline = 'middle';
      // reference lines
      g.lineWidth = 1;
      for (const [v, label, color, dash] of [
        [V_THRESHOLD, '−55', 'rgba(255,184,107,0.75)', [4, 3]], [V_REST, '−70', 'rgba(255,255,255,0.28)', []], [-85, '−85', 'rgba(255,255,255,0.1)', []],
      ] as [number, string, string, number[]][]) {
        g.strokeStyle = color; g.setLineDash(dash);
        g.beginPath(); g.moveTo(padL, y(v) + 0.5); g.lineTo(W - padR, y(v) + 0.5); g.stroke();
        g.setLineDash([]);
        g.fillStyle = v === V_THRESHOLD ? '#ffb86b' : '#9ba6bd'; g.textAlign = 'right';
        g.fillText(label, padL - 6, y(v));
      }
      g.textAlign = 'right'; g.fillStyle = '#ffb86b';
      g.fillText('threshold — the neuron fires', W - padR - 2, y(V_THRESHOLD) - 8);
      g.textAlign = 'left';
      g.fillStyle = '#6b7690';
      g.fillText('rest', padL + 4, y(V_REST) + 9);
      g.textAlign = 'right';
      g.fillText(`last ${Math.round(TRACE_N * TRACE_DT)} s of slow motion →`, W - padR, Hh - 6);
      g.save();
      g.translate(9, padT + 12); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = '#6b7690';
      g.fillText('mV', 0, 0);
      g.restore();

      // slow internal signal (modulators)
      const anyM = sim.messenger > 0.005 || isModulator(sim.transmitter);
      if (anyM) {
        const base = Hh - padB, top = padT + (Hh - padT - padB) * 0.3;
        g.beginPath();
        g.moveTo(x(0), base);
        for (let i = 0; i < TRACE_N; i++) g.lineTo(x(i), base - sim.traceMessenger[(sim.traceHead + i) % TRACE_N] * (base - top));
        g.lineTo(x(TRACE_N - 1), base); g.closePath();
        g.fillStyle = 'rgba(255,157,224,0.16)'; g.fill();
        g.beginPath();
        for (let i = 0; i < TRACE_N; i++) {
          const yy = base - sim.traceMessenger[(sim.traceHead + i) % TRACE_N] * (base - top);
          if (i === 0) g.moveTo(x(i), yy); else g.lineTo(x(i), yy);
        }
        g.strokeStyle = COLORS.messenger; g.lineWidth = 1.5; g.stroke();
      }

      // membrane potential
      g.beginPath();
      const spikes: number[] = [];
      for (let i = 0; i < TRACE_N; i++) {
        const v = sim.trace[(sim.traceHead + i) % TRACE_N];
        if (v > 0) { spikes.push(i); g.lineTo(x(i), padT - 2); continue; }
        const yy = y(Math.max(vMin, v));
        if (i === 0) g.moveTo(x(i), yy); else g.lineTo(x(i), yy);
      }
      g.strokeStyle = info.ion ? info.color : '#e9edf6';
      g.lineWidth = 2; g.lineJoin = 'round';
      g.stroke();
      g.fillStyle = '#ffb86b'; g.textAlign = 'center';
      for (const i of spikes) {
        g.beginPath(); g.arc(x(i), padT + 1, 3, 0, Math.PI * 2); g.fill();
      }
      // "now" dot
      const last = sim.trace[(sim.traceHead + TRACE_N - 1) % TRACE_N];
      g.beginPath(); g.arc(x(TRACE_N - 1) - 1, y(Math.min(vMax, Math.max(vMin, last))), 3.2, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="chart" style={{ height: 150 }} role="img"
    aria-label="Live chart of the receiving neuron's membrane potential in millivolts, with resting level at minus 70 and firing threshold at minus 55" />;
}

function LiveBlock() {
  const live = useSynapseLive();
  const transmitter = useSynapse((s) => s.transmitter);
  const info = transmitterById.get(transmitter)!;
  const mod = isModulator(transmitter);
  return (
    <>
      <Meter label="In the cleft" value={live.cleft / 70} color={info.color} text={`${live.cleft}`} />
      <Meter label={mod ? 'Receptors on' : 'Receptors open'} value={live.open} color={mod ? COLORS.messenger : info.ion === 'Cl⁻' ? COLORS.cl : COLORS.na} />
      <Meter label="Vesicles ready" value={live.docked / 8} color="#dfe8ff" text={`${live.docked}/8`} />
      {mod && <Meter label="Internal signal" value={live.messenger} color={COLORS.messenger} />}
      <div className="syn-chart-head">
        <span><b>Voltage of the receiving neuron</b></span>
        <span className={`syn-fired ${live.sinceFired < 1.6 ? 'on' : ''}`}>IT FIRES!</span>
      </div>
      <PotentialChart />
      <div className="legend">
        <span><i style={{ background: info.ion ? info.color : '#e9edf6' }} />{info.responseLabel}</span>
        {mod && <span><i style={{ background: COLORS.messenger }} />internal signal (cAMP)</span>}
        {info.ion && <span><i style={{ background: info.ion === 'Cl⁻' ? COLORS.cl : COLORS.na }} />{info.ion} ions</span>}
        <span><i style={{ background: COLORS.ca }} />Ca²⁺</span>
      </div>
    </>
  );
}

function Steps() {
  const stage = useSynapseLive((s) => s.stage);
  const held = useSynapseLive((s) => s.held);
  const stepMode = useSynapse((s) => s.stepMode);
  const drugs = useSynapse((s) => s.drugs);
  const transmitter = useSynapse((s) => s.transmitter);
  const set = useSynapse((s) => s.set);
  const fire = useSynapse((s) => s.fire);
  const next = useSynapse((s) => s.next);
  const active = drugs.map((d) => drugById.get(d)!).filter((d) => d.transmitters.includes(transmitter));
  return (
    <>
      <ol className="syn-steps">
        {STAGES.map((s) => (
          <li key={s.n} className={stage === s.n ? 'now' : stage > s.n ? 'done' : ''} aria-current={stage === s.n ? 'step' : undefined}>
            <span className="n">{s.n}</span>
            <span>
              <b>{s.title}</b>
              {(stepMode || stage === s.n) && <small>{s.text}</small>}
              {active.filter((d) => DRUG_STAGE[d.id] === s.n).map((d) => (
                <span key={d.id} className="acts"><i style={{ background: d.color }} />{d.short} acts here</span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className="syn-stepbar">
        <Toggle label="Step through" on={stepMode} onChange={(v) => set({ stepMode: v })} />
        <span className="grow" />
        {stepMode && (stage === 0
          ? <button className="btn primary" onClick={fire}>Start ›</button>
          : <button className="btn primary" disabled={!held} onClick={next}>{held ? (stage === 6 ? 'Finish ›' : 'Next ›') : 'Playing…'}</button>)}
      </div>
    </>
  );
}

function DrugToggle({ d }: { d: DrugInfo }) {
  const on = useSynapse((s) => s.drugs.includes(d.id));
  const toggleDrug = useSynapse((s) => s.toggleDrug);
  const select = useCore((s) => s.select);
  return (
    <div className={`syn-drug ${on ? 'on' : ''}`}>
      <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => toggleDrug(d.id)}>
        <span className="sw" />
        <i style={{ background: d.color }} />
        {d.short}
      </button>
      <button className="more" onClick={() => select('synapse', d.id)} aria-label={`More about ${d.name}`}>How it works ›</button>
      <small>{d.tagline}</small>
    </div>
  );
}

function Chemistry() {
  const transmitter = useSynapse((s) => s.transmitter);
  const pRelease = useSynapse((s) => s.pRelease);
  const background = useSynapse((s) => s.background);
  const set = useSynapse((s) => s.set);
  const resetLTP = useSynapse((s) => s.resetLTP);
  const ltp = useSynapseLive((s) => s.ltp);
  const ampa = useSynapseLive((s) => s.ampa);
  return (
    <>
      <div className="syn-drugs">
        {drugsFor(transmitter).map((d) => <DrugToggle key={d.id} d={d} />)}
      </div>
      <div className="syn-inline">
        <Slider label="Release chance" value={pRelease} min={0.1} max={1} step={0.05} onChange={(v) => set({ pRelease: v })}
          format={(v) => `${Math.round(v * 100)}%`} />
        <Toggle label="Other inputs" on={background} onChange={(v) => set({ background: v })} />
      </div>
      <p className="syn-note">
        <b>Release chance</b> is how likely each docked vesicle is to fuse per spike — real synapses are unreliable.{' '}
        <b>Other inputs</b> adds the chatter of the cell's other synapses, so it hovers near threshold.
      </p>
      {transmitter === 'glutamate' && (
        <p className="syn-note">
          <b>Learning:</b> {ampa} AMPA receptors{ltp > 0 ? ` (+${ltp} added by strong bursts)` : ''}.{' '}
          {ltp > 0
            ? <button className="more" style={{ color: 'var(--accent)' }} onClick={resetLTP}>Reset</button>
            : 'Fire a few bursts and watch new ones appear.'}
        </p>
      )}
    </>
  );
}

function TransmitterChooser() {
  const transmitter = useSynapse((s) => s.transmitter);
  const set = useSynapse((s) => s.set);
  return (
    <div className="chips">
      {TRANSMITTERS.map((t) => (
        <Chip key={t.id} label={t.name} color={t.color} on={t.id === transmitter} onClick={() => set({ transmitter: t.id })} />
      ))}
    </div>
  );
}

// -------------------------------------------------------------------- panel
export function SynapsePanel() {
  const sel = useCore((s) => s.selection.synapse);
  const select = useCore((s) => s.select);
  const goTo = useCore((s) => s.goTo);
  const transmitter = useSynapse((s) => s.transmitter);
  const drugs = useSynapse((s) => s.drugs);
  const toggleDrug = useSynapse((s) => s.toggleDrug);
  const back = () => select('synapse', null);
  const cta = <DiveCTA title="Zoom into the membrane" sub="How the spike itself works: ion channels" onClick={() => goTo('membrane')} />;
  const info = transmitterById.get(transmitter)!;

  const t = sel ? transmitterById.get(sel) : null;
  if (t) {
    return (
      <>
        <Header eyebrow={`Transmitter · ${t.role.toLowerCase()}`} color={t.color} title={t.name} lede={t.tagline} onBack={back} backLabel="The synapse" />
        <Section title="What it does at this synapse">
          <Bullets items={[`Binds ${t.receptors}. ${t.effect}`, ...t.bullets]} />
        </Section>
        <Section title="Watch it live"><LiveBlock /></Section>
        <Section title="How it is cleared"><p className="syn-p">{t.clearance}</p></Section>
        <Section title="Change the chemistry">
          <div className="syn-drugs">{drugsFor(t.id).map((d) => <DrugToggle key={d.id} d={d} />)}</div>
        </Section>
        <Section title="Remember this">
          <div className="syn-stack">
            <Callout kind="fact" label="Did you know">{t.fact}</Callout>
            <Callout kind="warn" label="Clinical clue">{t.clinical}</Callout>
            <Callout kind="note" label="Simplified">{t.simplified}</Callout>
          </div>
        </Section>
        {cta}
      </>
    );
  }

  const d = sel ? drugById.get(sel) : null;
  if (d) {
    const on = drugs.includes(d.id);
    return (
      <>
        <Header eyebrow={d.target} color={d.color} title={d.name} lede={d.tagline} onBack={back} backLabel="The synapse" />
        <div className="syn-inline">
          <Toggle label={on ? 'Active in the simulation' : 'Switched off'} on={on} onChange={(v) => toggleDrug(d.id, v)} />
        </div>
        <Section title="How it works"><p className="syn-p">{d.mechanism}</p></Section>
        <Section title="What to watch"><Callout kind="fact" label="In the 3D view">{d.watch}</Callout></Section>
        <Section title="Watch it live"><LiveBlock /></Section>
        <Section title="Good to know"><Callout kind="warn" label="Medicine, drug or poison?">{d.note}</Callout></Section>
        {d.transmitters.length > 0 && (
          <Section title="Acts on">
            <div className="chips">
              {d.transmitters.map((id) => transmitterById.get(id)!).map((x) => (
                <Chip key={x.id} label={x.name} color={x.color} on={x.id === transmitter} onClick={() => select('synapse', x.id)} />
              ))}
            </div>
          </Section>
        )}
        {cta}
      </>
    );
  }

  const p = sel ? partById.get(sel) : null;
  if (p) {
    return (
      <>
        <Header eyebrow={p.eyebrow} color={p.color} title={p.name} lede={p.tagline} onBack={back} backLabel="The synapse" />
        <Section title="What it does"><Bullets items={p.bullets} /></Section>
        {p.id === 'receptor' && (
          <Section title={`With ${info.name.toLowerCase()}`}><p className="syn-p">This synapse carries {info.receptors}. {info.effect}</p></Section>
        )}
        {p.id === 'transporter' && (
          <Section title={`With ${info.name.toLowerCase()}`}><p className="syn-p">{info.clearance}</p></Section>
        )}
        <Section title="Remember this">
          <div className="syn-stack">
            <Callout kind="fact" label="Did you know">{p.fact}</Callout>
            {p.clinical && <Callout kind="warn" label="Clinical clue">{p.clinical}</Callout>}
            {p.simplified && <Callout kind="note" label="Simplified">{p.simplified}</Callout>}
          </div>
        </Section>
        <Section title="Other parts">
          <div className="chips">
            {PARTS.filter((x) => x.id !== p.id).map((x) => <Chip key={x.id} label={x.name} color={x.color} onClick={() => select('synapse', x.id)} />)}
          </div>
        </Section>
        {cta}
      </>
    );
  }

  if (sel === CAFFEINE.id) {
    return (
      <>
        <Header eyebrow="An aside · blocks adenosine receptors" color={CAFFEINE.color} title={CAFFEINE.name} lede={CAFFEINE.tagline} onBack={back} backLabel="The synapse" />
        <Section title="How it works"><Bullets items={CAFFEINE.bullets} /></Section>
        <Section title="Remember this">
          <div className="syn-stack">
            <Callout kind="fact" label="Did you know">{CAFFEINE.fact}</Callout>
            <Callout kind="note" label="Not in the simulation">{CAFFEINE.note}</Callout>
          </div>
        </Section>
        {cta}
      </>
    );
  }

  return (
    <>
      <Header eyebrow="Level 5 · Synapse" title="A gap 5,000× thinner than a hair"
        lede="Neurons do not touch. To pass a message on, an electrical spike must become a puff of chemicals — and then electricity again. Press Fire a spike and watch it in slow motion." />
      <Section title="What happens, step by step"><Steps /></Section>
      <Section title="Live readout"><LiveBlock /></Section>
      <Section title="Choose the transmitter">
        <TransmitterChooser />
        <div className="list" style={{ marginTop: 8 }}>
          <Row title={`${info.name} — ${info.role.toLowerCase()}`} sub={info.effect} color={info.color} onClick={() => select('synapse', info.id)} />
        </div>
      </Section>
      <Section title="Change the chemistry"><Chemistry /></Section>
      <Section title="Parts of the synapse">
        <div className="chips">
          {PARTS.map((x) => <Chip key={x.id} label={x.name} color={x.color} onClick={() => select('synapse', x.id)} />)}
        </div>
      </Section>
      <Section title="Remember this">
        <div className="syn-stack">
          {FACTS.map((f) => <Callout key={f.label} kind="fact" label={f.label}>{f.text}</Callout>)}
          <Callout kind="note" label="Simplified">
            The cleft is drawn about 4× too wide and molecules far too big. A real vesicle holds thousands of molecules, not a dozen,
            and one synapse moves the voltage by well under a millivolt — this one stands in for many firing together. Time is slowed
            roughly a thousand-fold, and not every stage equally.
          </Callout>
        </div>
        <div className="list" style={{ marginTop: 8 }}>
          <Row title="And caffeine?" sub={CAFFEINE.tagline} color={CAFFEINE.color} onClick={() => select('synapse', CAFFEINE.id)} />
        </div>
      </Section>
      {cta}
    </>
  );
}

export function SynapseDock() {
  const s = useSynapse();
  const stage = useSynapseLive((x) => x.stage);
  const held = useSynapseLive((x) => x.held);
  return (
    <>
      {s.stepMode && stage > 0
        ? <button className="btn primary" disabled={!held} onClick={s.next}>{held ? (stage === 6 ? 'Finish ›' : `Next step ›`) : 'Playing…'}</button>
        : <button className="btn primary" onClick={s.fire}>{s.stepMode ? 'Start ›' : 'Fire a spike'}</button>}
      <button className="btn" onClick={s.burst} disabled={s.stepMode}>Burst ×5</button>
      <Divider />
      <Toggle label="Auto" on={s.autoFire && !s.stepMode} onChange={(v) => s.set({ autoFire: v, stepMode: v ? false : s.stepMode })} />
      {s.autoFire && !s.stepMode && (
        <Slider label="" value={s.rate} min={0.2} max={4} step={0.1} onChange={(v) => s.set({ rate: v })} format={(v) => `${v.toFixed(1)}/s`} />
      )}
      <Divider />
      <Slider label="Slow motion" value={s.speed} min={0.15} max={2} step={0.05} onChange={(v) => s.set({ speed: v })}
        format={(v) => `${v.toFixed(2).replace(/0$/, '')}×`} />
      <Divider />
      <Toggle label="Steps" on={s.stepMode} onChange={(v) => s.set({ stepMode: v })} />
      <Toggle label="Labels" on={s.labels} onChange={(v) => s.set({ labels: v })} />
    </>
  );
}

