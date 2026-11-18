/**
 * A tiny cortical microcircuit: leaky integrate-and-fire neurons with exponential synapses.
 * Pure (no three.js / DOM) so it can be unit-tested; the Cells level draws what it does.
 *
 * Time is in milliseconds, voltage in millivolts. Synaptic weights are given as the peak size
 * of a single post-synaptic potential in mV (positive = EPSP, negative = IPSP).
 */

export type NeuronKind =
  | 'thalamic' | 'stellate' | 'pyr23' | 'pyr5' | 'pyr6' | 'basket' | 'martinotti' | 'chandelier';

/** where on the target cell the synapse sits (the level draws it there) */
export type SynZone = 'dend' | 'soma' | 'tuft' | 'ais';

export interface CircuitNeuron {
  id: string;
  kind: NeuronKind;
  inhibitory: boolean;
  /** an input fibre: fires spontaneously and on stimulate(), has no membrane model */
  input: boolean;
}

export interface CircuitSynapse {
  pre: number;
  post: number;
  /** peak PSP in mV; negative for inhibition */
  w: number;
  /** conduction + synaptic delay, ms */
  delay: number;
  zone: SynZone;
}

export interface CircuitSpec {
  neurons: CircuitNeuron[];
  synapses: CircuitSynapse[];
}

interface Params {
  tau: number; rest: number; thresh: number; reset: number; refr: number;
  /** spike-frequency adaptation: added per spike (mV) and its decay (ms) */
  adapt: number; tauAdapt: number;
  noise: number;
}

const EXC: Params = { tau: 18, rest: -70, thresh: -52, reset: -60, refr: 3, adapt: 5, tauAdapt: 90, noise: 0.42 };
const PARAMS: Record<NeuronKind, Params> = {
  thalamic: EXC,
  stellate: { ...EXC, tau: 14 },
  pyr23: EXC,
  pyr5: { ...EXC, tau: 20, adapt: 4.5 },
  pyr6: EXC,
  // fast-spiking: short time constant, brief refractory period, no adaptation
  basket: { tau: 7, rest: -68, thresh: -54, reset: -62, refr: 1.2, adapt: 0, tauAdapt: 50, noise: 0.5 },
  martinotti: { tau: 20, rest: -66, thresh: -53, reset: -60, refr: 2.5, adapt: 2, tauAdapt: 80, noise: 0.4 },
  chandelier: { tau: 8, rest: -68, thresh: -54, reset: -62, refr: 1.5, adapt: 0, tauAdapt: 50, noise: 0.45 },
};

export const TAU_EXC = 3;
export const TAU_INH = 7;
export const V_SPIKE = 20;

/** peak PSP sizes (mV) for each kind of connection */
export const WEIGHTS = {
  thalStellate: 9, thalBasket: 8,
  stellatePyr: 11.5, stellateStellate: 5, stellateBasket: 7,
  pyr23Pyr5: 9.5, pyr23Pyr23: 7.5, pyr23Basket: 8, pyr23Martinotti: 6, pyr23Chandelier: 7,
  pyr5Pyr5: 8, pyr5Basket: 9, pyr5Martinotti: 7, pyr5Pyr6: 8, pyr5Pyr23: 6,
  pyr6Stellate: 4,
  basket: -7.5, martinotti: -3.5, chandelier: -5,
};

/** the wiring used by the Cells level (and by the tests) */
export function canonicalCircuit(W: typeof WEIGHTS = WEIGHTS): CircuitSpec {
  const neurons: CircuitNeuron[] = [];
  const add = (prefix: string, kind: NeuronKind, n: number) => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(neurons.length);
      neurons.push({
        id: `${prefix}${i}`, kind, input: kind === 'thalamic',
        inhibitory: kind === 'basket' || kind === 'martinotti' || kind === 'chandelier',
      });
    }
    return ids;
  };
  const T = add('T', 'thalamic', 3);
  const S = add('S', 'stellate', 4);
  const A = add('A', 'pyr23', 7);
  const B = add('B', 'pyr5', 4);
  const C = add('C', 'pyr6', 2);
  const [K4, K23, K5] = add('K', 'basket', 3);
  const [M23, M5] = add('M', 'martinotti', 2);
  const [X] = add('X', 'chandelier', 1);

  const synapses: CircuitSynapse[] = [];
  const con = (pre: number, post: number, w: number, zone: SynZone = 'dend', delay = 2) => {
    if (pre !== post) synapses.push({ pre, post, w, delay, zone });
  };

  // thalamus -> layer 4 (few but strong synapses), plus feed-forward inhibition
  T.forEach((t, i) => { con(t, S[i], W.thalStellate); con(t, S[(i + 1) % 4], W.thalStellate); });
  con(T[2], S[0], W.thalStellate);
  con(T[1], K4, W.thalBasket);
  // layer 4 -> layer 2/3, and a little chatter inside layer 4
  S.forEach((s, j) => {
    const base = [0, 1, 3, 4][j];
    for (let k = 0; k < 3; k++) con(s, A[base + k], W.stellatePyr);
    con(s, S[(j + 1) % 4], W.stellateStellate);
  });
  con(S[1], K4, W.stellateBasket); con(S[2], K4, W.stellateBasket);
  // layer 2/3 -> layer 5, recurrent excitation, and recruitment of inhibition
  A.forEach((a, k) => {
    con(a, B[k % 4], W.pyr23Pyr5); con(a, B[(k + 1) % 4], W.pyr23Pyr5);
    con(a, A[(k + 1) % 7], W.pyr23Pyr23); con(a, A[(k + 3) % 7], W.pyr23Pyr23);
    if (k % 2 === 1) con(a, K23, W.pyr23Basket);
    else if (k > 0) con(a, M23, W.pyr23Martinotti);
  });
  con(A[0], X, W.pyr23Chandelier); con(A[5], X, W.pyr23Chandelier);
  // layer 5: output cells, recurrent, drive deep interneurons and layer 6, feed back up
  B.forEach((b, m) => {
    con(b, B[(m + 1) % 4], W.pyr5Pyr5);
    con(b, K5, W.pyr5Basket);
    if (m % 2 === 0) con(b, M5, W.pyr5Martinotti);
    con(b, C[m >> 1], W.pyr5Pyr6);
    con(b, A[2 * m], W.pyr5Pyr23);
  });
  con(C[0], S[1], W.pyr6Stellate); con(C[1], S[2], W.pyr6Stellate);
  // feedback inhibition: baskets on cell bodies, Martinotti on apical tufts, chandelier on the trigger zone
  S.forEach((s) => con(K4, s, W.basket, 'soma'));
  A.forEach((a) => con(K23, a, W.basket, 'soma'));
  B.forEach((b) => con(K5, b, W.basket, 'soma'));
  [A[0], A[2], A[4], A[6]].forEach((a) => con(M23, a, W.martinotti, 'tuft'));
  B.forEach((b) => con(M5, b, W.martinotti, 'tuft'));
  con(M5, A[3], W.martinotti, 'tuft');
  [A[2], A[3], A[4]].forEach((a) => con(X, a, W.chandelier, 'ais'));

  return { neurons, synapses };
}

/** peak of a unit exponential-synapse PSP on a membrane with time constant tau */
function pspGain(tau: number, tauSyn: number): number {
  const k = (tau * tauSyn) / (tau - tauSyn);
  const tp = k * Math.log(tau / tauSyn);
  return (tauSyn / (tau - tauSyn)) * (Math.exp(-tp / tau) - Math.exp(-tp / tauSyn));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SpikeEvent { neuron: number; t: number }
export interface ArrivalEvent { synapse: number; t: number }

export class Circuit {
  readonly spec: CircuitSpec;
  /** simulated time, ms */
  t = 0;
  /** membrane potential, mV (input fibres stay at rest) */
  readonly v: Float32Array;
  /** when false the inhibitory interneurons are silenced */
  inhibition = true;
  /** spontaneous rate of each thalamic fibre, Hz */
  inputRate = 14;
  /** events since the last drain() */
  spikes: SpikeEvent[] = [];
  arrivals: ArrivalEvent[] = [];
  /** total spikes per neuron since construction */
  readonly counts: Uint32Array;

  private gE: Float32Array;
  private gI: Float32Array;
  private adapt: Float32Array;
  private refrUntil: Float32Array;
  private p: Params[];
  private outgoing: number[][];
  private gain: Float32Array;
  private pending: { t: number; syn: number }[] = [];
  private scheduled: { t: number; n: number }[] = [];
  private rng: () => number;

  constructor(spec: CircuitSpec, seed = 7) {
    this.spec = spec;
    const n = spec.neurons.length;
    this.rng = mulberry32(seed);
    this.v = new Float32Array(n);
    this.gE = new Float32Array(n);
    this.gI = new Float32Array(n);
    this.adapt = new Float32Array(n);
    this.refrUntil = new Float32Array(n).fill(-1);
    this.counts = new Uint32Array(n);
    this.p = spec.neurons.map((c) => PARAMS[c.kind]);
    for (let i = 0; i < n; i++) this.v[i] = this.p[i].rest;
    this.outgoing = spec.neurons.map(() => []);
    this.gain = new Float32Array(spec.synapses.length);
    spec.synapses.forEach((s, i) => {
      this.outgoing[s.pre].push(i);
      const tau = this.p[s.post].tau;
      this.gain[i] = Math.abs(s.w) / pspGain(tau, s.w >= 0 ? TAU_EXC : TAU_INH);
    });
  }

  /** a volley from the thalamus: every input fibre fires a short burst */
  stimulate(strength = 1) {
    const burst = Math.max(1, Math.round(3 * strength));
    this.spec.neurons.forEach((c, n) => {
      if (!c.input) return;
      for (let k = 0; k < burst; k++) this.scheduled.push({ t: this.t + 0.3 + this.rng() * 1.2 + k * 3.2, n });
    });
  }

  private gauss() {
    const u = Math.max(this.rng(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng());
  }

  private fire(n: number) {
    this.spikes.push({ neuron: n, t: this.t });
    this.counts[n]++;
    const out = this.outgoing[n];
    for (let i = 0; i < out.length; i++) this.pending.push({ t: this.t + this.spec.synapses[out[i]].delay, syn: out[i] });
  }

  step(dt = 0.25) {
    const { neurons, synapses } = this.spec;
    this.t += dt;
    const t = this.t;

    // deliver spikes whose travel time is over
    if (this.pending.length) {
      let keep = 0;
      for (let i = 0; i < this.pending.length; i++) {
        const e = this.pending[i];
        if (e.t <= t) {
          const s = synapses[e.syn];
          if (s.w >= 0) this.gE[s.post] += this.gain[e.syn];
          else this.gI[s.post] += this.gain[e.syn];
          this.arrivals.push({ synapse: e.syn, t });
        } else this.pending[keep++] = e;
      }
      this.pending.length = keep;
    }
    if (this.scheduled.length) {
      let keep = 0;
      for (let i = 0; i < this.scheduled.length; i++) {
        const e = this.scheduled[i];
        if (e.t <= t) this.fire(e.n);
        else this.scheduled[keep++] = e;
      }
      this.scheduled.length = keep;
    }

    const dE = Math.exp(-dt / TAU_EXC);
    const dI = Math.exp(-dt / TAU_INH);
    const sq = Math.sqrt(dt);
    for (let n = 0; n < neurons.length; n++) {
      const c = neurons[n];
      const p = this.p[n];
      if (c.input) {
        if (this.rng() < (this.inputRate * dt) / 1000) this.fire(n);
        continue;
      }
      this.gE[n] *= dE;
      this.gI[n] *= dI;
      this.adapt[n] *= Math.exp(-dt / p.tauAdapt);
      if (c.inhibitory && !this.inhibition) {
        this.v[n] += ((p.rest - 4 - this.v[n]) * dt) / p.tau;
        continue;
      }
      if (t < this.refrUntil[n]) {
        this.v[n] = p.reset;
        continue;
      }
      let v = this.v[n];
      if (v > p.thresh) v = p.reset; // the sample after a spike
      v += ((p.rest - v + this.gE[n] - this.gI[n] - this.adapt[n]) * dt) / p.tau + p.noise * sq * this.gauss();
      if (v >= p.thresh) {
        v = V_SPIKE;
        this.refrUntil[n] = t + p.refr;
        this.adapt[n] += p.adapt;
        this.fire(n);
      }
      this.v[n] = v;
    }
  }

  /** take (and clear) the events produced since the last call */
  drain(): { spikes: SpikeEvent[]; arrivals: ArrivalEvent[] } {
    const out = { spikes: this.spikes, arrivals: this.arrivals };
    this.spikes = [];
    this.arrivals = [];
    return out;
  }

  /** advance by `ms`, returning how many spikes each neuron fired */
  run(ms: number, dt = 0.25): Uint32Array {
    const before = this.counts.slice();
    const steps = Math.round(ms / dt);
    for (let i = 0; i < steps; i++) this.step(dt);
    return this.counts.map((c, i) => c - before[i]);
  }
}
