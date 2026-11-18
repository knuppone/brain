import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCore } from '../../state/store';
import { PHASE_ORDER, membraneLive, useMembrane, type Damage, type PhaseId, type StimFeedback } from '../../state/membraneState';
import { BLOCKERS, HONESTY_NOTE, KEY_IDEAS, MEMBRANE_ITEMS, MEM_COLORS, PHASES, SIX_BEATS, itemById } from '../../content/membrane';
import { Bullets, Callout, Divider, Header, Row, Section, Segmented, Slider, Toggle } from '../kit';
import '../../styles/membrane.css';

const fmtV = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(0)}`;
const fmtSpeed = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

// ------------------------------------------------------------------------------------- chart

const WINDOW_MS = (speed: number) => (speed <= 0.5 ? 14 : speed <= 2 ? 30 : 90);
const V_MIN = -92, V_MAX = 62;

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawTimeChart(g: CanvasRenderingContext2D, W: number, H: number, speed: number) {
  const L = membraneLive;
  const padL = 40, padR = 62, padT = 16, padB = 17;
  const x0 = padL, x1 = W - padR;
  const gap = 8;
  const lowH = Math.max(26, Math.round((H - padT - padB) * 0.23));
  const vTop = padT, vBot = H - padB - lowH - gap;
  const gTop = vBot + gap, gBot = H - padB;
  const win = WINDOW_MS(speed);
  const now = L.now.t;
  const tx = (t: number) => x1 - ((now - t) / win) * (x1 - x0);
  const vy = (v: number) => vBot - ((v - V_MIN) / (V_MAX - V_MIN)) * (vBot - vTop);
  const G_MAX = 0.55;
  const gy = (f: number) => gBot - (Math.min(f, G_MAX) / G_MAX) * (gBot - gTop);

  g.clearRect(0, 0, W, H);
  g.font = '10.5px ui-sans-serif, system-ui, sans-serif';
  g.textBaseline = 'middle';

  // collect the visible samples, oldest → newest
  const n = L.count;
  const first = (L.head - n + L.size) % L.size;
  let start = 0;
  // binary search for the first sample inside the window
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (L.t[(first + mid) % L.size] < now - win) lo = mid + 1; else hi = mid; }
  start = lo;
  const idx = (k: number) => (first + k) % L.size;

  g.save();
  g.beginPath(); g.rect(x0, 0, x1 - x0, H); g.clip();

  // phase shading
  let segStart = start;
  for (let k = start; k <= n; k++) {
    const ph = k < n ? L.phase[idx(k)] : -1;
    const prev = k > start ? L.phase[idx(k - 1)] : ph;
    if (k === n || ph !== prev) {
      if (k > segStart) {
        const id = PHASE_ORDER[prev] as PhaseId;
        const xa = Math.max(x0, tx(L.t[idx(segStart)])), xb = k < n ? tx(L.t[idx(k)]) : x1;
        if (id !== 'rest') {
          g.fillStyle = hexA(PHASES[id].color, id === 'stimulus' ? 0.07 : 0.15);
          g.fillRect(xa, vTop, xb - xa, gBot - vTop);
          if (xb - xa > 30 && id !== 'stimulus') {
            g.fillStyle = hexA(PHASES[id].color, 0.95);
            g.textAlign = 'center';
            g.fillText(PHASES[id].short, (xa + xb) / 2, vTop - 7);
          }
        }
      }
      segStart = k;
    }
  }

  // time grid (scrolls with the trace)
  const tick = win <= 14 ? 1 : win <= 30 ? 5 : 10;
  g.textAlign = 'center';
  const every = Math.max(1, Math.ceil(64 / (((x1 - x0) * tick) / win)));
  for (let t = Math.ceil((now - win) / tick) * tick; t <= now; t += tick) {
    const x = tx(t);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.beginPath(); g.moveTo(x, vTop); g.lineTo(x, gBot); g.stroke();
    if (Math.round(t / tick) % every === 0) { g.fillStyle = '#6b7690'; g.fillText(`${t.toFixed(0)} ms`, x, H - 7); }
  }
  g.restore();

  // reference lines
  const ref = (v: number, color: string, label: string, dash: number[], dy: number) => {
    g.strokeStyle = color; g.setLineDash(dash); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, vy(v)); g.lineTo(x1, vy(v)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = color; g.textAlign = 'left';
    g.fillText(label, x1 + 6, vy(v) + dy);
  };
  ref(50, hexA(MEM_COLORS.na, 0.75), 'E_Na +50', [5, 4], 0);
  ref(-55, hexA(MEM_COLORS.threshold, 0.85), 'threshold', [3, 3], -10);
  ref(-65, 'rgba(200,206,222,0.6)', 'rest', [1, 3], 1);
  ref(-77, hexA(MEM_COLORS.k, 0.75), 'E_K −77', [5, 4], 11);

  // y axis
  g.textAlign = 'right'; g.fillStyle = '#9ba6bd';
  for (const v of [-80, -40, 0, 40]) {
    g.fillText(`${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`, x0 - 6, vy(v));
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.beginPath(); g.moveTo(x0, vy(v)); g.lineTo(x1, vy(v)); g.stroke();
  }
  g.save();
  g.translate(9, (vTop + vBot) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = '#6b7690';
  g.fillText('membrane mV', 0, 0);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.strokeRect(x0 + 0.5, vTop + 0.5, x1 - x0, vBot - vTop);
  g.strokeRect(x0 + 0.5, gTop + 0.5, x1 - x0, gBot - gTop);
  g.fillStyle = '#6b7690'; g.textAlign = 'right';
  g.fillText('open', x0 - 6, (gTop + gBot) / 2);

  if (n - start < 2) return;
  g.save();
  g.beginPath(); g.rect(x0, 0, x1 - x0 + 1, H); g.clip();

  // stimulus marks
  g.fillStyle = hexA('#ffb86b', 0.9);
  for (let k = start; k < n; k++) {
    const s = L.stim[idx(k)];
    if (s > 0) g.fillRect(tx(L.t[idx(k)]) - 0.5, vBot - 2 - Math.min(12, s * 0.5), 1.6, Math.min(12, s * 0.5) + 2);
  }

  // open-channel fractions
  const area = (arr: Float32Array, color: string) => {
    g.beginPath();
    g.moveTo(tx(L.t[idx(start)]), gBot);
    for (let k = start; k < n; k++) g.lineTo(tx(L.t[idx(k)]), gy(arr[idx(k)]));
    g.lineTo(x1, gBot);
    g.closePath();
    g.fillStyle = hexA(color, 0.22); g.fill();
    g.beginPath();
    for (let k = start; k < n; k++) { const x = tx(L.t[idx(k)]), y = gy(arr[idx(k)]); if (k === start) g.moveTo(x, y); else g.lineTo(x, y); }
    g.strokeStyle = color; g.lineWidth = 1.6; g.stroke();
  };
  area(L.kOpen, MEM_COLORS.k);
  area(L.naOpen, MEM_COLORS.na);

  // the voltage trace
  g.beginPath();
  for (let k = start; k < n; k++) { const x = tx(L.t[idx(k)]), y = vy(L.V[idx(k)]); if (k === start) g.moveTo(x, y); else g.lineTo(x, y); }
  g.strokeStyle = '#f4f6fb'; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke();
  g.restore();
  const hy = vy(L.now.V);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(x1, hy, 7, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x1, hy, 3.2, 0, 7); g.fill();
}

function drawSpaceChart(g: CanvasRenderingContext2D, W: number, H: number) {
  const A = membraneLive.axon;
  const padL = 40, padR = 62, padT = 16, padB = 20;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const px = (mm: number) => x0 + (mm / A.lengthMm) * (x1 - x0);
  const vy = (v: number) => y1 - ((v - V_MIN) / (V_MAX - V_MIN)) * (y1 - y0);
  g.clearRect(0, 0, W, H);
  g.font = '10.5px ui-sans-serif, system-ui, sans-serif';
  g.textBaseline = 'middle';

  if (A.damaged) {
    g.fillStyle = hexA(MEM_COLORS.threshold, 0.14);
    g.fillRect(px(A.damaged[0]), y0, px(A.damaged[1]) - px(A.damaged[0]), y1 - y0);
    g.fillStyle = MEM_COLORS.threshold; g.textAlign = 'center';
    g.fillText('damaged', (px(A.damaged[0]) + px(A.damaged[1])) / 2, y0 - 7);
  }
  // nodes of Ranvier
  g.strokeStyle = hexA(MEM_COLORS.node, 0.1);
  for (const nx of A.nodes) { g.beginPath(); g.moveTo(px(nx), y0); g.lineTo(px(nx), y1); g.stroke(); }
  g.fillStyle = hexA(MEM_COLORS.node, 0.9);
  for (const nx of A.nodes) g.fillRect(px(nx) - 1, y1 - 5, 2, 5);

  const ref = (v: number, color: string, label: string, dash: number[]) => {
    g.strokeStyle = color; g.setLineDash(dash);
    g.beginPath(); g.moveTo(x0, vy(v)); g.lineTo(x1, vy(v)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = color; g.textAlign = 'left'; g.fillText(label, x1 + 5, vy(v));
  };
  ref(-55, hexA(MEM_COLORS.threshold, 0.8), 'threshold', [3, 3]);
  ref(-65, 'rgba(200,206,222,0.45)', 'rest', [1, 3]);
  g.textAlign = 'right'; g.fillStyle = '#9ba6bd';
  for (const v of [-80, -40, 0, 40]) g.fillText(`${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`, x0 - 6, vy(v));
  g.textAlign = 'center'; g.fillStyle = '#6b7690';
  for (let mm = 0; mm <= A.lengthMm; mm += 5) g.fillText(`${mm} mm`, px(mm), H - 8);
  g.save();
  g.translate(9, (y0 + y1) / 2); g.rotate(-Math.PI / 2); g.fillText('membrane mV', 0, 0);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);

  // stimulus marker
  g.fillStyle = '#ffb86b';
  const sx = px(A.stimX);
  g.beginPath(); g.moveTo(sx - 5, y1 + 1); g.lineTo(sx + 5, y1 + 1); g.lineTo(sx, y1 - 8); g.closePath(); g.fill();

  // voltage along the axon, filled so the wave reads as a shape
  const n = A.V.length;
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, hexA(MEM_COLORS.na, 0.5));
  grad.addColorStop(0.75, hexA(MEM_COLORS.na, 0.04));
  grad.addColorStop(1, hexA(MEM_COLORS.k, 0.1));
  g.beginPath();
  g.moveTo(x0, vy(-65));
  for (let i = 0; i < n; i++) g.lineTo(px((i / (n - 1)) * A.lengthMm), vy(A.V[i]));
  g.lineTo(x1, vy(-65));
  g.closePath();
  g.fillStyle = grad; g.fill();
  g.beginPath();
  for (let i = 0; i < n; i++) { const x = px((i / (n - 1)) * A.lengthMm), y = vy(A.V[i]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.strokeStyle = '#f4f6fb'; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = '#9ba6bd'; g.textAlign = 'left';
  g.fillText(`voltage along the axon · t = ${A.t.toFixed(1)} ms`, x0 + 8, y0 + 10);
}

function MembraneChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useMembrane((s) => s.view);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return; // hidden (the other copy of the chart is showing)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = useMembrane.getState();
      if (s.view === 'axon') drawSpaceChart(g, w, h); else drawTimeChart(g, w, h, s.speed);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas ref={ref} className={`chart mem-chart ${view}`} role="img"
      aria-label={view === 'axon' ? 'Membrane voltage along the axon' : 'Membrane voltage over time with open Na⁺ and K⁺ channel fractions'} />
  );
}

function ChartLegend() {
  const view = useMembrane((s) => s.view);
  if (view === 'axon') return null;
  return (
    <div className="legend">
      <span><i style={{ background: '#f4f6fb' }} />voltage</span>
      <span><i style={{ background: MEM_COLORS.na }} />Na⁺ channels open</span>
      <span><i style={{ background: MEM_COLORS.k }} />K⁺ channels open</span>
    </div>
  );
}

// ------------------------------------------------------------------------------------ banner

const FEEDBACK_TEXT: Record<StimFeedback, string> = {
  spike: 'Spike!',
  sub: 'Subthreshold — no spike',
  refractory: 'Refractory — no spike',
  blocked: 'Na⁺ channels blocked — no spike',
};

function Banner() {
  const view = useMembrane((s) => s.view);
  const host = typeof document !== 'undefined' ? document.querySelector('.app') : null;
  if (!host) return null;
  return createPortal(
    <div className="mem-banner"><div className="mem-banner-inner">{view === 'axon' ? <AxonBanner /> : <PatchBanner />}</div></div>,
    host,
  );
}

function PatchBanner() {
  const phase = useMembrane((s) => s.phase);
  const feedback = useMembrane((s) => s.feedback);
  const ttx = useMembrane((s) => s.ttx);
  const tea = useMembrane((s) => s.tea);
  const speed = useMembrane((s) => s.speed);
  const paused = useMembrane((s) => s.paused);
  const rate = useMembrane((s) => s.rateHz);
  const voltRef = useRef<HTMLSpanElement>(null);
  const naRef = useRef<HTMLSpanElement>(null);
  const kRef = useRef<HTMLSpanElement>(null);
  const naTxt = useRef<HTMLSpanElement>(null);
  const kTxt = useRef<HTMLSpanElement>(null);
  const [totals, setTotals] = useState({ na: membraneLive.now.naTotal, k: membraneLive.now.kTotal });

  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = membraneLive.now;
      if (now.naTotal !== totals.na || now.kTotal !== totals.k) { setTotals({ na: now.naTotal, k: now.kTotal }); return; }
      const s = useMembrane.getState();
      const key = `${Math.round(now.V)}|${now.naOpen}|${now.naInactivated}|${now.kOpen}|${s.ttx}|${s.tea}`;
      if (key === last) return;
      last = key;
      if (voltRef.current) voltRef.current.textContent = fmtV(now.V);
      const paint = (el: HTMLSpanElement | null, total: number, open: number, inact: number, kind: 'na' | 'k', blocked: boolean) => {
        if (!el) return;
        const dots = el.children;
        for (let i = 0; i < dots.length; i++) {
          // open ones first, inactivated ones last — same order as the 3D sampling
          const cls = blocked ? 'blocked' : i < open ? `open ${kind}` : i >= total - inact ? 'inact' : '';
          if (dots[i].className !== cls) dots[i].className = cls;
        }
      };
      paint(naRef.current, now.naTotal, now.naOpen, now.naInactivated, 'na', s.ttx);
      paint(kRef.current, now.kTotal, now.kOpen, 0, 'k', s.tea);
      if (naTxt.current) naTxt.current.textContent = s.ttx ? 'blocked' : `${now.naOpen} open · ${now.naInactivated} plugged`;
      if (kTxt.current) kTxt.current.textContent = s.tea ? 'blocked' : `${now.kOpen} open`;
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [totals.na, totals.k]);

  const info = PHASES[phase];
  const slow = Math.round(1000 / speed);
  return (
    <>
      <div className="mem-volt">
        <span ref={voltRef}>−65</span><small>mV</small>
        <span className="sub">inside vs outside</span>
      </div>
      <div className="mem-now" aria-live="polite">
        <div className="ph">
          <i style={{ background: info.color }} />{info.name}
          {feedback && <span key={feedback.n} className={`mem-badge fade ${feedback.kind}`}>{FEEDBACK_TEXT[feedback.kind]}</span>}
          {ttx && <span className="mem-badge ttx">TTX</span>}
          {tea && <span className="mem-badge tea">TEA</span>}
          {rate > 0 && <span className="mem-badge">{rate.toFixed(0)} spikes/s</span>}
        </div>
        <div className="why">{info.now}</div>
        <div className="mem-pops">
          <span className="pop">Na⁺ channels <span className="dots" ref={naRef}>{Array.from({ length: totals.na }, (_, i) => <i key={i} />)}</span><span ref={naTxt} /></span>
          <span className="pop">K⁺ channels <span className="dots" ref={kRef}>{Array.from({ length: totals.k }, (_, i) => <i key={i} />)}</span><span ref={kTxt} /></span>
          <span className="pop meta-inline" style={{ color: 'var(--faint)' }}>{paused ? 'paused' : `slowed ${slow.toLocaleString('en-US')}×`}</span>
        </div>
      </div>
    </>
  );
}

function AxonBanner() {
  const myelin = useMembrane((s) => s.myelin);
  const damage = useMembrane((s) => s.damage);
  const ax = useMembrane((s) => s.axon);
  const title = !myelin ? 'Unmyelinated axon' : damage === 'none' ? 'Myelinated axon' : damage === 'mild' ? 'Myelinated axon · thinned myelin' : 'Myelinated axon · myelin lost';
  let status: string;
  if (ax.status === 'idle') status = 'Press Stimulate to launch a spike from the left end.';
  else if (ax.status === 'travelling') status = myelin ? 'The spike leaps from node to node…' : 'Each patch of membrane fires the next one…';
  else if (ax.status === 'blocked') status = 'Blocked. The current leaked out through the bare stretch, so the next node never reached threshold.';
  else if (myelin && damage !== 'none') status = 'It got through — but late. Timing errors like this scramble signals in multiple sclerosis.';
  else status = myelin ? 'Arrived. Only the nodes had to fire, so it was fast.' : 'Arrived. Every patch along the way had to fire — slow.';
  const ratio = ax.speedBare && ax.speedMyelin ? ax.speedMyelin / ax.speedBare : null;
  const color = !myelin ? MEM_COLORS.axon : damage !== 'none' ? MEM_COLORS.threshold : MEM_COLORS.myelin;
  return (
    <>
      <div className="mem-volt">
        <span>{ax.speedNow ? fmtSpeed(ax.speedNow) : '–'}</span><small>m/s</small>
        <span className="sub">{myelin && damage !== 'none' ? 'average speed' : 'conduction speed'}</span>
      </div>
      <div className="mem-now" aria-live="polite">
        <div className="ph">
          <i style={{ background: color }} />{title}
          {ax.status === 'blocked' && <span className="mem-badge blocked">conduction block</span>}
        </div>
        <div className="why">{status}</div>
        <div className="mem-speeds">
          <span>bare <b>{ax.speedBare ? `${fmtSpeed(ax.speedBare)} m/s` : '—'}</b></span>
          <span>myelinated <b>{ax.speedMyelin ? `${fmtSpeed(ax.speedMyelin)} m/s` : '—'}</b></span>
          {ratio && <span className="x">{ratio.toFixed(0)}× faster with myelin</span>}
          {!ratio && <span style={{ color: 'var(--faint)' }}>run both to compare</span>}
        </div>
        <div className="meta">30 mm of a 10 µm axon, drawn ~175× too thick · speeds measured from the simulation</div>
      </div>
    </>
  );
}

// -------------------------------------------------------------------------------------- dock

const SPEEDS = [
  { id: '0.2', label: '0.2' }, { id: '0.5', label: '0.5' }, { id: '2', label: '2' }, { id: '8', label: '8' },
];

const BoltIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
);

export function MembraneDock() {
  const m = useMembrane();
  const view = m.view;
  const setSustained = (v: number) => {
    // repetitive firing is slow to watch in extreme slow motion: speed time up while current is on
    const patch: Partial<typeof m> = { sustained: v };
    if (v > 0 && m.sustained === 0 && m.speed < 8) patch.speed = 8;
    if (v === 0 && m.sustained > 0 && m.speed === 8) patch.speed = 0.5;
    m.set(patch);
  };
  return (
    <>
      <Banner />
      <div className="mem-dock">
        <MembraneChart />
        <div className="mem-controls">
          <Segmented value={view} onChange={(v) => { useCore.getState().select('membrane', null); m.set({ view: v }); }}
            options={[{ id: 'channels', label: 'Channels' }, { id: 'axon', label: 'Axon' }]} />
          <Divider />
          {view === 'channels' ? (
            <>
              <span className="mem-group">
                <button className="btn primary mem-stim" onClick={() => m.stimulate()} title="Inject a brief (0.5 ms) pulse of current">
                  <BoltIcon />Stimulate
                </button>
                <Slider label="Strength" value={m.stimStrength} min={2} max={30} step={1} onChange={(v) => m.set({ stimStrength: v })}
                  format={(v) => `${v} µA/cm²`} />
              </span>
              <span className="mem-group mem-opt">
                <Divider />
                <button className="btn" onClick={() => m.doublePulse()} title="Two pulses in a row: is the second one too soon?">Double pulse</button>
                <Slider label="Gap" value={m.doubleGap} min={2} max={20} step={0.5} onChange={(v) => m.set({ doubleGap: v })}
                  format={(v) => `${v} ms`} />
              </span>
              <span className="mem-group mem-opt">
                <Divider />
                <Slider label="Steady input" value={m.sustained} min={0} max={30} step={1} onChange={setSustained}
                  format={(v) => (v === 0 ? 'off' : `${v} µA/cm²`)} />
              </span>
              <Divider />
              <span className="mem-group">
                <Toggle label="TTX" on={m.ttx} onChange={(v) => m.set({ ttx: v })} />
                <Toggle label="TEA" on={m.tea} onChange={(v) => m.set({ tea: v })} />
              </span>
            </>
          ) : (
            <>
              <span className="mem-group">
                <button className="btn primary mem-stim" onClick={() => m.stimulateAxon('start')}><BoltIcon />Stimulate</button>
                <button className="btn mem-opt" onClick={() => m.stimulateAxon('middle')} title="A spike started mid-axon travels both ways">Stimulate middle</button>
              </span>
              <Divider />
              <Toggle label="Myelin" on={m.myelin} onChange={(v) => m.set({ myelin: v })} />
              {m.myelin && (
                <Segmented<Damage> label="Damage" value={m.damage} onChange={(v) => m.set({ damage: v })}
                  options={[{ id: 'none', label: 'None' }, { id: 'mild', label: 'Thinned' }, { id: 'severe', label: 'Lost' }]} />
              )}
            </>
          )}
          <span className="mem-group mem-opt">
            <Divider />
            <button className="btn" onClick={() => m.set({ paused: !m.paused })} aria-pressed={m.paused}>{m.paused ? '▶ Play' : '❚❚ Pause'}</button>
            <button className="btn" onClick={() => m.stepOnce()} title="Advance a tenth of a millisecond">Step</button>
            <Segmented label="ms / s" value={String(m.speed)} onChange={(v) => m.set({ speed: parseFloat(v), paused: false })} options={SPEEDS} />
          </span>
          <Toggle label="Labels" on={m.labels} onChange={(v) => m.set({ labels: v })} />
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------- panel

function BackToTop() {
  const goTo = useCore((s) => s.goTo);
  return (
    <>
      <p className="mem-close">
        That is the whole trick. Every sensation, movement and thought you have ever had was built from these
        identical blips — billions of them every second, across 86 billion neurons.
      </p>
      <button className="cta" onClick={() => goTo('brain')}>
        <span>
          <b>Back to the whole brain</b>
          <small>You have reached the bottom: zoom all the way out</small>
        </span>
        <span className="arrow">↖</span>
      </button>
    </>
  );
}

function Beats() {
  const phase = useMembrane((s) => s.phase);
  return (
    <div className="beats">
      {SIX_BEATS.map((id) => {
        const p = PHASES[id];
        const on = phase === id || (id === 'rest' && phase === 'stimulus');
        return (
          <div key={id} className={`beat ${on ? 'on' : ''}`} aria-current={on}>
            <span className="num" style={{ background: p.color }}>{p.beat}</span>
            <span><b>{p.name}</b><small>{p.why}</small></span>
          </div>
        );
      })}
    </div>
  );
}

export function MembranePanel() {
  const sel = useCore((s) => s.selection.membrane);
  const select = useCore((s) => s.select);
  const view = useMembrane((s) => s.view);
  const setM = useMembrane((s) => s.set);
  const ttx = useMembrane((s) => s.ttx);
  const tea = useMembrane((s) => s.tea);
  const myelin = useMembrane((s) => s.myelin);
  const item = sel ? itemById.get(sel) : null;
  const pick = (id: string | null) => select('membrane', id);

  if (item) {
    return (
      <>
        <Header eyebrow={item.eyebrow} color={item.color} title={item.name} lede={item.tagline}
          onBack={() => pick(null)} backLabel="The action potential" />
        <div className="mem-panel-chart"><MembraneChart /><ChartLegend /></div>
        <Section title="What it is"><Bullets items={item.what} /></Section>
        <Section title="How it works">
          <Bullets items={item.how} />
          <div className="mem-try">
            {item.id === 'na-channel' && <Toggle label={ttx ? 'TTX is on: channels corked' : 'Try it: add TTX'} on={ttx} onChange={(v) => setM({ ttx: v })} />}
            {item.id === 'k-channel' && <Toggle label={tea ? 'TEA is on: channels blocked' : 'Try it: add TEA'} on={tea} onChange={(v) => setM({ tea: v })} />}
            {(item.id === 'myelin' || item.id === 'node' || item.id === 'axon') && (
              <>
                <Toggle label="Myelin" on={myelin} onChange={(v) => setM({ myelin: v })} />
                <button className="btn" onClick={() => useMembrane.getState().stimulateAxon('start')}>Stimulate</button>
              </>
            )}
          </div>
        </Section>
        <Section title="Remember this"><Callout kind="fact" label="Did you know">{item.fact}</Callout></Section>
        {item.clinical && <Section title="In medicine"><Callout kind="warn" label="Clinical clue">{item.clinical}</Callout></Section>}
        {item.simplified && <p className="mem-note">{item.simplified}</p>}
        <BackToTop />
      </>
    );
  }

  const here = MEMBRANE_ITEMS.filter((i) => i.view === view);
  const other = MEMBRANE_ITEMS.filter((i) => i.view !== view);
  return (
    <>
      <Header eyebrow="Level 5 · Membrane" title="A wave of charge, 100 millivolts tall"
        lede="A nerve signal is a brief flip of the voltage across this membrane, made by ion channels opening and closing in strict order. Press Stimulate and watch it in slow motion." />
      <div className="mem-panel-chart"><MembraneChart /><ChartLegend /></div>
      <Section title="The story in six beats"><Beats /></Section>
      <Section title="Key ideas">
        <div className="ideas">
          {KEY_IDEAS.map((k) => <p key={k.title}><b>{k.title}.</b> {k.text}</p>)}
        </div>
      </Section>
      <Section title="Experiments to try">
        <Bullets items={[
          'Lower Strength below about 13 µA/cm²: the bump fizzles. Raise it: the spike is always the same size.',
          'Double pulse with a short gap: the second pulse fails. Lengthen the gap until it works again.',
          'Turn up Steady input: more spikes per second, never taller ones. That is how neurons code intensity.',
          `${BLOCKERS.ttx.name}: ${BLOCKERS.ttx.text}`,
          `${BLOCKERS.tea.name}: ${BLOCKERS.tea.text}`,
        ]} />
      </Section>
      <Section title={view === 'axon' ? 'Along the axon — click to explore' : 'In the membrane — click to explore'}>
        <div className="list">
          {here.map((i) => <Row key={i.id} title={i.name} sub={i.tagline} color={i.color} onClick={() => pick(i.id)} />)}
        </div>
      </Section>
      <Section title={view === 'axon' ? 'Back in the membrane' : 'Zoomed out: the axon'}>
        <div className="list">
          {other.map((i) => <Row key={i.id} title={i.name} sub={i.tagline} color={i.color} onClick={() => pick(i.id)} />)}
        </div>
      </Section>
      <Section title="Remember this">
        <Callout kind="fact" label="Did you know">
          Alan Hodgkin and Andrew Huxley worked all this out in 1952 from the giant axon of a squid — half a millimetre thick,
          big enough to thread a wire down. They solved their equations on a hand-cranked calculator and shared the 1963 Nobel Prize.
          The simulation running here is their model.
        </Callout>
        <p className="mem-note">{HONESTY_NOTE}</p>
      </Section>
      <BackToTop />
    </>
  );
}
