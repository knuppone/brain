import { useEffect, useRef } from 'react';
import { useCore } from '../../state/store';
import { circuitTrace, TRACE_LEN, useCells } from '../../state/cellsState';
import {
  CELL_GROUPS, CELL_TYPES, cellTypeById, CIRCUIT_TEXT, OVERVIEW, PART_COLORS, SIGNAL_COLORS, TRACE_CELLS,
} from '../../content/cells';
import { Bullets, Callout, DiveCTA, Divider, Header, Row, Section, Segmented, Toggle } from '../kit';
import { useTheme } from '../../state/theme';
import { token } from '../../scene/theme3d';
import '../../styles/cells.css';

/** trace colours are picked for the dark chart; these are the same hues, dark enough for the pale one */
const TRACE_INK: Record<string, string> = { S1: '#c9481f', A3: '#a86a00', B1: '#7a5a2a', K1: '#0b78b8' };

const EFFECT_LABEL = { excitatory: 'excites', inhibitory: 'inhibits', modulatory: 'modulates' } as const;

/** scrolling membrane-potential traces, in step with the 3D circuit */
function CircuitChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    const light = theme === 'light';
    const dim = token('--dim', '#9ba6bd');
    const grid = `rgb(${token('--fg-rgb', '255 255 255')} / 0.07)`;
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;
    let lastCount = -1;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); lastCount = -1; }
      if (circuitTrace.count === lastCount) return;
      lastCount = circuitTrace.count;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const rows = TRACE_CELLS.length;
      const top = 20;
      const rowH = (h - top - 4) / rows;
      const x = (i: number) => (i / (TRACE_LEN - 1)) * w;
      const at = (i: number) => (circuitTrace.head + i) % TRACE_LEN;
      g.font = '10.5px ui-sans-serif, system-ui, sans-serif';
      g.textBaseline = 'middle';

      // thalamic input: ticks
      g.fillStyle = light ? dim : '#9ba6bd';
      g.fillText('Input from thalamus', 8, 10);
      g.strokeStyle = light ? '#7d6a1c' : '#e9e2b8';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < TRACE_LEN; i++) if (circuitTrace.input[at(i)]) { g.moveTo(x(i), 3); g.lineTo(x(i), 17); }
      g.stroke();

      TRACE_CELLS.forEach((tc, r) => {
        const y0 = top + r * rowH;
        const base = y0 + rowH - 7;
        // -72 mV .. +20 mV mapped onto the row
        const y = (v: number) => base - ((Math.min(v, 20) + 72) / 92) * (rowH - 12);
        g.strokeStyle = light ? grid : 'rgba(255,255,255,0.07)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y0 + 0.5); g.lineTo(w, y0 + 0.5); g.stroke();
        const buf = circuitTrace.v[r];
        const col = light ? TRACE_INK[tc.neuron] ?? tc.color : tc.color;
        g.strokeStyle = col;
        g.lineWidth = 1.3;
        g.lineJoin = 'round';
        g.beginPath();
        for (let i = 0; i < TRACE_LEN; i++) {
          const yy = y(buf[at(i)]);
          if (i) g.lineTo(x(i), yy); else g.moveTo(x(i), yy);
        }
        g.stroke();
        g.fillStyle = col;
        g.fillText(tc.label, 8, y0 + 9);
      });
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [theme]);
  return <canvas ref={ref} className="chart cells-chart" aria-label="Membrane potential of four cells over time" />;
}

function CircuitSection() {
  const inhibition = useCells((s) => s.inhibition);
  const running = useCells((s) => s.running);
  const stimulate = useCells((s) => s.stimulate);
  const set = useCells((s) => s.set);
  return (
    <Section title={CIRCUIT_TEXT.title}>
      <CircuitChart />
      <div className="legend">
        <span><i style={{ background: SIGNAL_COLORS.excite }} />excitation</span>
        <span><i style={{ background: SIGNAL_COLORS.inhibit }} />inhibition</span>
        <span className="cells-slowmo">{running ? 'slow motion ×70' : 'paused'}</span>
      </div>
      <div className="cells-actions">
        <button className="btn primary" onClick={stimulate}>Stimulate</button>
        <button className="btn" onClick={() => set({ inhibition: !inhibition })}>
          {inhibition ? 'Switch inhibition off' : 'Switch inhibition back on'}
        </button>
      </div>
      {inhibition
        ? <Bullets items={CIRCUIT_TEXT.how} />
        : <Callout kind="warn" label="Runaway excitation">{CIRCUIT_TEXT.inhibitionOff}</Callout>}
      <p className="cells-note">{inhibition ? CIRCUIT_TEXT.inhibitionOn : 'Press Stimulate, then switch inhibition back on to stop it.'} {CIRCUIT_TEXT.slowmo}</p>
    </Section>
  );
}

export function CellsPanel() {
  const sel = useCore((s) => s.selection.cells);
  const select = useCore((s) => s.select);
  const goTo = useCore((s) => s.goTo);
  const view = useCells((s) => s.view);
  const setCells = useCells((s) => s.set);
  const type = sel ? cellTypeById.get(sel) : null;
  const pick = (id: string | null) => select('cells', id);

  if (type) {
    const group = CELL_GROUPS.find((g) => g.id === type.group)!;
    const tr = type.transmitter;
    return (
      <>
        <Header eyebrow={type.isNeuron ? `Neuron · ${tr?.effect ?? ''}` : 'Glial cell'} color={type.color} title={type.name}
          lede={type.tagline} onBack={() => pick(null)} backLabel="All cells" />
        <div className="cells-view">
          {type.inColumn ? (
            <Segmented value={view} onChange={(v) => setCells({ view: v })}
              options={[{ id: 'column', label: 'In the cortex' }, { id: 'specimen', label: 'Single cell, labelled' }]} />
          ) : (
            <span className="cells-note">Not a cortical cell — shown as a single labelled specimen.</span>
          )}
        </div>
        <Section title="Where it lives"><p className="cells-text">{type.where}</p></Section>
        <Section title="What it does"><Bullets items={type.does} /></Section>
        {tr && (
          <Section title="Its chemical signal">
            <div className="cells-tx">
              <span className={`cells-badge ${tr.effect}`}>{tr.name} · {EFFECT_LABEL[tr.effect]}</span>
              <span>{tr.note}</span>
            </div>
          </Section>
        )}
        <Section title="Size and numbers"><p className="cells-text">{type.numbers}</p></Section>
        <Section title="Remember this"><Callout kind="fact" label="Did you know">{type.fact}</Callout></Section>
        {type.clinical && <Section title="When it goes wrong"><Callout kind="warn" label="Clinical clue">{type.clinical}</Callout></Section>}
        {type.simplified && <p className="cells-note"><b>Simplified:</b> {type.simplified}</p>}
        <Section title={group.title}>
          <div className="chips">
            {CELL_TYPES.filter((c) => c.group === type.group && c.id !== type.id).map((c) => (
              <button key={c.id} className="chip" onClick={() => pick(c.id)}><i style={{ background: c.color }} />{c.name}</button>
            ))}
          </div>
        </Section>
        <DiveCTA title="Zoom into one connection: the synapse" sub="Where this cell hands its signal to the next"
          onClick={() => goTo('synapse')} />
      </>
    );
  }

  return (
    <>
      <Header eyebrow="Level 3 · Cells" title={OVERVIEW.title} lede={OVERVIEW.lede} />
      <CircuitSection />
      {CELL_GROUPS.map((g) => (
        <Section key={g.id} title={g.title}>
          <div className="list">
            {CELL_TYPES.filter((c) => c.group === g.id).map((c) => (
              <Row key={c.id} title={c.name} sub={c.tagline} color={c.color} onClick={() => pick(c.id)} />
            ))}
          </div>
        </Section>
      ))}
      <Section title="How to read a neuron">
        <ul className="cells-key">
          {OVERVIEW.readNeuron.map((r) => (
            <li key={r.part}><i style={{ background: PART_COLORS[r.part] }} />{r.text}</li>
          ))}
        </ul>
        <p className="cells-note">Turn on “Label parts” below to paint every neuron in these colours.</p>
      </Section>
      <Section title="How crowded is it really?">
        <Callout kind="fact" label="Did you know">{OVERVIEW.density}</Callout>
        <p className="cells-note"><b>Myth check:</b> {OVERVIEW.myth} <b>Simplified:</b> {CIRCUIT_TEXT.simplified.replace('Simplified: ', '')}</p>
      </Section>
      <DiveCTA title="Zoom into one connection: the synapse" sub="Where one neuron talks to the next" onClick={() => goTo('synapse')} />
    </>
  );
}

export function CellsDock() {
  const c = useCells();
  const sel = useCore((s) => s.selection.cells);
  if (c.view === 'specimen') {
    const type = sel ? cellTypeById.get(sel) : null;
    return (
      <>
        {type?.inColumn
          ? <button className="btn" onClick={() => c.set({ view: 'column' })}>‹ Back into the cortex</button>
          : <button className="btn" onClick={() => useCore.getState().select('cells', null)}>‹ Back to the cortex</button>}
        <Divider />
        <Toggle label="Label parts" on={c.labelParts} onChange={(v) => c.set({ labelParts: v })} />
      </>
    );
  }
  return (
    <>
      <Toggle label="Run circuit" on={c.running} onChange={(v) => c.set({ running: v })} />
      <button className="btn primary" onClick={c.stimulate}>Stimulate</button>
      <Toggle label="Inhibition" on={c.inhibition} onChange={(v) => c.set({ inhibition: v })} />
      <Divider />
      <Toggle label="Label parts" on={c.labelParts} onChange={(v) => c.set({ labelParts: v })} />
      <Toggle label="Glia" on={c.showGlia} onChange={(v) => c.set({ showGlia: v })} />
    </>
  );
}
