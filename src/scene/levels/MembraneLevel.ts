import * as THREE from 'three';
import { Level, type CameraHome } from '../Level';
import { useCore } from '../../state/store';
import {
  AXON_SAMPLES, PHASE_ORDER, SAMPLE_MS, clearSamples, membraneLive, pushSample, useMembrane,
  type Damage, type MembraneView, type PhaseId, type StimFeedback,
} from '../../state/membraneState';
import { itemById } from '../../content/membrane';
import { HodgkinHuxley, restingPotential } from '../../sim/hodgkinHuxley';
import { Cable, STIM_DENSITY, STIM_MS } from '../../sim/cable';
import { MembranePatch } from '../procedural/membranePatch';
import { AXON, AxonModel } from '../procedural/membraneAxon';
import { onTheme } from '../theme3d';

const PULSE_MS = 0.5;
const SUB = 0.01; // ms, integration sub-step for the patch
const TEA_AVAIL = 0.05;
/** internodes [from, to) stripped by "damage" */
const DAMAGED: [number, number] = [13, 17];
const DAMAGE_SEVERITY: Record<Damage, number> = { none: 0, mild: 0.7, severe: 1 };
/** the axon view runs this many times faster than the channels view (a spike takes ~30 ms to cross) */
const AXON_RATE = 8;

interface Pulse { t0: number; t1: number; amp: number; second: boolean; judged: boolean; hAt: number }

export class MembraneLevel extends Level {
  readonly manualFraming = true;
  readonly id = 'membrane' as const;

  private patch!: MembranePatch;
  private axon!: AxonModel;
  private unsub: (() => void)[] = [];
  private hovered: string | null = null;
  private clickSelected = false;

  // ---- patch simulation
  private hh = new HodgkinHuxley();
  private vRest = restingPotential();
  private hRest = this.hh.h;
  private nRest = this.hh.n;
  private pulses: Pulse[] = [];
  private phase: PhaseId = 'rest';
  private vPrev = this.hh.V;
  private vPeak = -100;
  private vMin = 0;
  private flatMs = 0;
  private sampleAcc = 0;
  private lastSpikeT = -1e9;
  private stepDebt = 0;
  private seen = { stim: 0, dbl: 0, step: 0, reset: 0, axonStim: 0 };

  // ---- axon simulation
  private cable!: Cable;
  private cableKey = '';
  private axonStimUntil = -1;
  private axonStimX = 0;
  private launch: { t: number; a: number; b: number; end: number; tA: number; tB: number; measured: boolean; fromStart: boolean } | null = null;

  /** 1 unit is 1 nm in the channels view and 0.5 mm (along the axon) in the axon view */
  get metersPerUnit(): number {
    return useMembrane.getState().view === 'axon' ? AXON.mmPerUnit * 1e-3 : 1e-9;
  }

  get home(): CameraHome {
    return frameFor(useMembrane.getState().view);
  }

  protected async load() {
    this.patch = new MembranePatch();
    this.ctx.progress(0.6);
    this.axon = new AxonModel();
    this.root.add(this.patch.group, this.axon.group);
    this.rebuildCable();
    this.applyView(useMembrane.getState().view, false);
    this.ctx.progress(1);
  }

  enter() {
    const m = useMembrane.getState();
    this.seen = { stim: m.stimNonce, dbl: m.doubleNonce, step: m.stepNonce, reset: m.resetNonce, axonStim: m.axonStimNonce };
    this.applyView(m.view, false);
    this.unsub.push(
      onTheme((light) => { this.patch.setTheme(light); this.axon.setTheme(light); }),
      useMembrane.subscribe((s, p) => {
        if (s.view !== p.view) this.applyView(s.view, true);
      }),
      useCore.subscribe((s, p) => {
        if (s.selection.membrane !== p.selection.membrane) this.onSelection(s.selection.membrane);
      }),
    );
    const sel = useCore.getState().selection.membrane;
    if (sel) this.onSelection(sel);
  }

  exit() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    this.hovered = null;
    this.patch.hideDom();
    this.axon.hideDom();
  }

  private applyView(view: MembraneView, fly: boolean) {
    this.patch.group.visible = view === 'channels';
    this.axon.group.visible = view === 'axon';
    if (this.hovered) { this.hovered = null; useCore.getState().set({ hover: null }); }
    if (fly) {
      const h = frameFor(view);
      void this.ctx.flyTo(h.position, h.target, 1.0);
    }
  }

  private onSelection(id: string | null) {
    if (!id) { this.clickSelected = false; return; }
    const item = itemById.get(id);
    if (!item) return;
    const m = useMembrane.getState();
    const switching = item.view !== m.view;
    if (switching) m.set({ view: item.view, ...(item.view === 'axon' && id !== 'axon' ? { myelin: true } : {}) });
    else if (item.view === 'axon' && id !== 'axon' && !m.myelin) m.set({ myelin: true });
    if (this.clickSelected) { this.clickSelected = false; return; }
    // chosen from a list / search / tour: bring it into view
    const home = frameFor(item.view);
    const focus = item.view === 'axon' ? this.axon.focusOf(id) : this.patch.focusOf(id);
    const off = home.position.clone().sub(home.target);
    const zoom = id === 'bilayer' || id === 'axon' ? 0.92 : 0.82;
    // keep the framing offsets of the home view, just slide toward the item and move in a little
    const target = home.target.clone().add(focus.multiplyScalar(0.5));
    setTimeout(() => void this.ctx.flyTo(target.clone().add(off.multiplyScalar(zoom)), target, 1.0), switching ? 30 : 0);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    const m = useMembrane.getState();
    const highlight = this.hovered ?? useCore.getState().selection.membrane;
    if (m.resetNonce !== this.seen.reset) { this.seen.reset = m.resetNonce; this.resetAll(); }
    if (m.view === 'channels') {
      const simDt = this.stepPatch(dt, m);
      const hh = this.hh;
      this.patch.update(dt, {
        V: hh.V, m: hh.m, h: hh.h, n: hh.n, ENa: hh.p.ENa, EK: hh.p.EK, ttx: m.ttx, tea: m.tea,
        simDt, speed: m.speed, labels: m.labels, highlight,
      });
      const now = membraneLive.now;
      now.t = hh.t; now.V = hh.V; now.m = hh.m; now.h = hh.h; now.n = hh.n;
      Object.assign(now, this.patch.counts);
    } else {
      this.stepAxon(dt, m);
      this.axon.update(dt, {
        V: membraneLive.axon.V, myelin: m.myelin, damage: m.damage, damaged: DAMAGED,
        stimX: this.axonStimX, labels: m.labels, highlight,
      });
    }
  }

  private resetAll() {
    this.hh.reset();
    this.pulses = [];
    this.phase = 'rest';
    this.vPrev = this.hh.V;
    this.lastSpikeT = -1e9;
    clearSamples();
    this.cable.reset();
    this.launch = null;
    this.axonStimUntil = -1;
    useMembrane.getState().set({ phase: 'rest', feedback: null, rateHz: 0, axon: { ...useMembrane.getState().axon, status: 'idle' } });
  }

  // ------------------------------------------------------- patch simulation
  private stepPatch(dt: number, m: ReturnType<typeof useMembrane.getState>): number {
    const hh = this.hh;
    hh.p.naAvail = m.ttx ? 0 : 1;
    hh.p.kAvail = m.tea ? TEA_AVAIL : 1;

    if (m.stimNonce !== this.seen.stim) {
      this.seen.stim = m.stimNonce;
      this.queuePulse(hh.t + 0.03, m.stimStrength, false);
    }
    if (m.doubleNonce !== this.seen.dbl) {
      this.seen.dbl = m.doubleNonce;
      this.queuePulse(hh.t + 0.03, m.stimStrength, false);
      this.queuePulse(hh.t + 0.03 + m.doubleGap, m.stimStrength, true);
    }
    if (m.stepNonce !== this.seen.step) { this.seen.step = m.stepNonce; this.stepDebt += 0.1; }

    let simDt = m.paused ? 0 : dt * m.speed;
    simDt += this.stepDebt;
    this.stepDebt = 0;
    const steps = Math.min(600, Math.round(simDt / SUB));
    let phase = this.phase;
    let feedback: StimFeedback | null = null;
    let rate = -1;
    for (let i = 0; i < steps; i++) {
      const t = hh.t;
      let stim = 0;
      for (const p of this.pulses) {
        if (t >= p.t0 && t < p.t1) { stim += p.amp; if (Number.isNaN(p.hAt)) p.hAt = hh.h; }
      }
      const I = m.sustained + stim;
      hh.step(SUB, I);
      const V = hh.V;
      const dVdt = (V - this.vPrev) / SUB;

      // --- spike detection (upward crossing of 0 mV)
      if (this.vPrev <= 0 && V > 0) {
        const gap = hh.t - this.lastSpikeT;
        rate = gap < 250 ? 1000 / gap : 0;
        this.lastSpikeT = hh.t;
        for (const p of this.pulses) if (!p.judged && hh.t >= p.t0) { p.judged = true; feedback = 'spike'; }
      }
      for (const p of this.pulses) {
        if (!p.judged && hh.t > p.t1 + 4) {
          p.judged = true;
          feedback = m.ttx ? 'blocked' : p.second || p.hAt < 0.4 ? 'refractory' : 'sub';
        }
      }
      if (this.pulses.length && this.pulses[0].judged && hh.t > this.pulses[0].t1) this.pulses.shift();
      if (rate < 0 && useMembrane.getState().rateHz > 0 && hh.t - this.lastSpikeT > 120) rate = 0;

      phase = this.nextPhase(phase, V, dVdt, I, hh);
      this.vPrev = V;

      this.sampleAcc += SUB;
      if (this.sampleAcc >= SAMPLE_MS - 1e-9) {
        this.sampleAcc = 0;
        pushSample(hh.t, V, hh.p.naAvail * hh.naOpen, hh.p.kAvail * hh.kOpen, PHASE_ORDER.indexOf(phase), stim);
      }
    }
    const patch: Partial<ReturnType<typeof useMembrane.getState>> = {};
    if (phase !== this.phase) { this.phase = phase; patch.phase = phase; }
    if (feedback) patch.feedback = { kind: feedback, n: (m.feedback?.n ?? 0) + 1 };
    if (rate >= 0 && Math.abs(rate - m.rateHz) > 0.5) patch.rateHz = rate;
    if (Object.keys(patch).length) m.set(patch);
    return steps * SUB;
  }

  private queuePulse(t0: number, amp: number, second: boolean) {
    this.pulses.push({ t0, t1: t0 + PULSE_MS, amp, second, judged: false, hAt: NaN });
  }

  /** label what the membrane is doing — a small state machine over the HH variables */
  private nextPhase(phase: PhaseId, V: number, dVdt: number, I: number, hh: HodgkinHuxley): PhaseId {
    const rest = this.vRest;
    // net ionic current is inward and the voltage is past threshold: self-sustaining rise
    const regenerative = -hh.iNa > hh.iK + hh.iL + 1.5 && V > -57 && dVdt > 4;
    switch (phase) {
      case 'rest':
        if (regenerative) return this.startRise();
        if (I > 0.3 || V > rest + 1.2) return 'stimulus';
        if (V < rest - 3) { this.vMin = V; return 'undershoot'; }
        return 'rest';
      case 'stimulus':
        if (regenerative) return this.startRise();
        if (I <= 0.3 && Math.abs(V - rest) < 1.0 && Math.abs(dVdt) < 0.6) return 'rest';
        if (I <= 0.3 && V < rest - 2.5) { this.vMin = V; return 'undershoot'; }
        return 'stimulus';
      case 'rising':
        this.vPeak = Math.max(this.vPeak, V);
        if (V > -5 && dVdt < 70) return 'peak';
        if (dVdt < 0) return V > -25 ? 'peak' : 'recovery';
        return 'rising';
      case 'peak':
        this.vPeak = Math.max(this.vPeak, V);
        if (V < this.vPeak - 7) { this.flatMs = 0; return 'falling'; }
        return 'peak';
      case 'falling':
        if (V < rest) { this.vMin = V; return 'undershoot'; }
        this.flatMs = Math.abs(dVdt) < 0.6 && V > -55 ? this.flatMs + SUB : 0;
        if (this.flatMs > 2.5) return 'stuck';
        return 'falling';
      case 'stuck':
        if (regenerative && dVdt > 20) return this.startRise();
        if (dVdt < -4) { this.flatMs = 0; return 'falling'; }
        if (V < rest) { this.vMin = V; return 'undershoot'; }
        return 'stuck';
      case 'undershoot':
        if (regenerative) return this.startRise();
        this.vMin = Math.min(this.vMin, V);
        if (dVdt > 0 && V > this.vMin + 0.4 * (rest - this.vMin)) return 'recovery';
        return 'undershoot';
      case 'recovery':
        if (regenerative) return this.startRise();
        if (Math.abs(V - rest) < 1.2 && hh.h > 0.93 * this.hRest && hh.n < this.nRest + 0.02) return I > 0.3 ? 'stimulus' : 'rest';
        return 'recovery';
    }
    return phase;
  }

  private startRise(): PhaseId {
    this.vPeak = -100;
    return 'rising';
  }

  // -------------------------------------------------------- axon simulation
  private rebuildCable() {
    const m = useMembrane.getState();
    const key = `${m.myelin}|${m.myelin ? m.damage : 'none'}`;
    if (key === this.cableKey && this.cable) return;
    this.cableKey = key;
    const sev = DAMAGE_SEVERITY[m.damage];
    this.cable = new Cable({
      myelinated: m.myelin,
      demyelinate: m.myelin && sev > 0 ? { from: DAMAGED[0], to: DAMAGED[1], severity: sev } : null,
    });
    this.launch = null;
    this.axonStimUntil = -1;
    const live = membraneLive.axon;
    live.lengthMm = this.cable.lengthMm;
    live.nodes = this.cable.nodes.map((i) => this.cable.x[i]);
    live.damaged = m.myelin && sev > 0 ? [DAMAGED[0] * this.cable.opts.internodeMm, DAMAGED[1] * this.cable.opts.internodeMm] : null;
    live.V.fill(this.cable.vRest);
    if (m.axon.status !== 'idle' || m.axon.speedNow !== null) m.set({ axon: { ...m.axon, status: 'idle', speedNow: null } });
  }

  private stepAxon(dt: number, m: ReturnType<typeof useMembrane.getState>) {
    this.rebuildCable();
    const c = this.cable;
    const L = c.lengthMm;
    if (m.axonStimNonce !== this.seen.axonStim) {
      this.seen.axonStim = m.axonStimNonce;
      this.axonStimX = m.axonStimSite === 'middle' ? L / 2 : 0;
      this.axonStimUntil = c.t + STIM_MS;
      this.launch = {
        t: c.t, a: c.indexAt(0.2 * L), b: c.indexAt(0.8 * L), end: c.indexAt(0.97 * L), tA: NaN, tB: NaN, measured: false,
        fromStart: m.axonStimSite !== 'middle',
      };
      m.set({ axon: { ...m.axon, status: 'travelling', speedNow: null } });
    } else if (!this.launch) {
      this.axonStimX = m.axonStimSite === 'middle' ? L / 2 : 0;
    }
    membraneLive.axon.stimX = this.axonStimX;

    let simDt = m.paused ? 0 : Math.min(dt * m.speed * AXON_RATE, 0.5);
    if (m.stepNonce !== this.seen.step) { this.seen.step = m.stepNonce; simDt += 0.05; }
    const h = 0.02;
    const steps = Math.round(simDt / h);
    for (let i = 0; i < steps; i++) {
      c.step(h, c.t < this.axonStimUntil ? { xMm: this.axonStimX, density: STIM_DENSITY } : null);
      const ln = this.launch;
      if (ln && !ln.measured) {
        if (Number.isNaN(ln.tA) && c.V[ln.a] > -20) ln.tA = c.t;
        if (Number.isNaN(ln.tB) && c.V[ln.b] > -20) ln.tB = c.t;
        const arrived = c.V[ln.end] > -20;
        if (arrived) {
          ln.measured = true;
          const ax = { ...useMembrane.getState().axon, status: 'arrived' as const };
          if (ln.fromStart && !Number.isNaN(ln.tA) && !Number.isNaN(ln.tB) && ln.tB > ln.tA) {
            const v = (c.x[ln.b] - c.x[ln.a]) / (ln.tB - ln.tA); // mm/ms = m/s
            ax.speedNow = v;
            if (!m.myelin) ax.speedBare = v;
            else if (m.damage === 'none') ax.speedMyelin = v;
          }
          useMembrane.getState().set({ axon: ax });
        } else if (c.t - ln.t > 1.5 && i % 10 === 0) {
          // has everything died down without reaching the end?
          let max = -100;
          for (let k = 0; k < c.n; k++) if (c.V[k] > max) max = c.V[k];
          if (max < -50) {
            ln.measured = true;
            useMembrane.getState().set({ axon: { ...useMembrane.getState().axon, status: 'blocked' } });
          }
        }
      }
    }
    const out = membraneLive.axon.V;
    for (let i = 0; i < AXON_SAMPLES; i++) out[i] = c.voltageAt((i / (AXON_SAMPLES - 1)) * L);
    membraneLive.axon.t = c.t;
  }

  // ---------------------------------------------------------------- pointer
  private pick(ray: THREE.Raycaster) {
    return useMembrane.getState().view === 'axon' ? this.axon.pick(ray) : this.patch.pick(ray);
  }

  onHover(ray: THREE.Raycaster | null) {
    const id = ray ? this.pick(ray)?.id ?? null : null;
    if (id !== this.hovered) {
      this.hovered = id;
      const item = id ? itemById.get(id) : null;
      useCore.getState().set({ hover: item ? { text: item.name, sub: item.tagline } : null });
    }
    return !!id;
  }

  onClick(ray: THREE.Raycaster) {
    const id = this.pick(ray)?.id ?? null;
    if (id === useCore.getState().selection.membrane) return;
    this.clickSelected = true;
    useCore.getState().select('membrane', id);
    this.clickSelected = false;
  }

  onDoubleClick(ray: THREE.Raycaster) {
    const hit = this.pick(ray);
    if (!hit) return;
    const dir = this.ctx.camera.position.clone().sub(this.ctx.controls.target).normalize();
    void this.ctx.flyTo(hit.point.clone().add(dir.multiplyScalar(48)), hit.point, 0.8);
  }
}

/**
 * Camera framing that centres the subject in the free area of the screen (between the scale rail,
 * the info panel, the banner and the tall dock), for either view.
 */
function frameFor(view: MembraneView): CameraHome {
  const W = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const H = typeof window !== 'undefined' ? window.innerHeight : 900;
  const phone = W <= 860;
  const core = useCore.getState();
  // free rectangle in pixels
  let left = 0, right = W, top = 150, bottom = H;
  if (phone) {
    top = 150;
    const dock = document.querySelector('.dock-inner')?.getBoundingClientRect();
    bottom = dock && dock.height > 20 ? dock.top - 8 : H * 0.54 - 120;
  } else {
    left = 200;
    right = core.panelOpen ? W - 400 : W - 20;
    const dock = document.querySelector('.dock-inner')?.getBoundingClientRect();
    bottom = dock && dock.height > 150 ? dock.top - 10 : H - (W >= 1750 ? 325 : 362);
  }
  const fw = Math.max(120, right - left), fh = Math.max(100, bottom - top);
  // subject box (world units) and viewing direction
  const subject = view === 'axon'
    ? { w: phone ? 63 : 68, h: phone ? 14 : 19, c: new THREE.Vector3(0, 1.5, 0), az: 0.22, el: 0.24 }
    : { w: phone ? 44 : 75, h: 27, c: new THREE.Vector3(phone ? -5 : 1.5, -0.5, 2), az: 0.26, el: 0.2 };
  const fov = W / H < 0.8 ? 46 : 32;
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  // world units per pixel needed so that the subject fits both ways
  const wpp = Math.max(subject.w / fw, subject.h / fh);
  const dist = THREE.MathUtils.clamp((wpp * H) / (2 * tan), 40, 330);
  const dir = new THREE.Vector3(Math.sin(subject.az) * Math.cos(subject.el), Math.sin(subject.el), Math.cos(subject.az) * Math.cos(subject.el));
  const rightV = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const upV = dir.clone().cross(rightV).normalize();
  const realWpp = (2 * dist * tan) / H;
  const dx = (left + right) / 2 - W / 2, dy = (top + bottom) / 2 - H / 2;
  const target = subject.c.clone().addScaledVector(rightV, -dx * realWpp).addScaledVector(upV, dy * realWpp);
  return { position: target.clone().addScaledVector(dir, dist), target, minDistance: 22, maxDistance: 340 };
}
