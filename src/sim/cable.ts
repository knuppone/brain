/**
 * A 1-D axon: Hodgkin–Huxley compartments coupled by the resistance of the axoplasm
 * (the "cable equation"), used to show an action potential travelling.
 *
 * Two builds of the same fibre:
 *  - unmyelinated: channels everywhere → the spike creeps along continuously;
 *  - myelinated: channels only at short nodes of Ranvier, the internodes are wrapped in myelin
 *    (tiny capacitance, tiny leak, no channels) → the spike "jumps" node to node (saltatory conduction).
 * `demyelinate` strips myelin from a stretch of internodes (the multiple-sclerosis demonstration).
 *
 * Units: mV, ms, cm, µF, mS, µA (so mS·mV = µA and µF·mV/ms = µA).
 * Voltage is advanced with backward Euler (tridiagonal solve), gates with exponential Euler:
 * unconditionally stable even though node compartments are ~100× smaller than internode ones.
 */
import { HH_DEFAULTS, alphaH, alphaM, alphaN, betaH, betaM, betaN, gateStep, hInf, mInf, nInf, q10Factor, restingPotential } from './hodgkinHuxley';

export interface CableOptions {
  myelinated: boolean;
  /** total length, mm */
  lengthMm: number;
  /** axon (inner) diameter, µm */
  diameterUm: number;
  /** axoplasm resistivity, Ω·cm */
  Ri: number;
  /** compartment length for bare (unmyelinated) fibre, mm */
  dxMm: number;
  /** myelinated: distance between nodes, mm */
  internodeMm: number;
  /** myelinated: node of Ranvier length, µm */
  nodeUm: number;
  /** myelinated: compartments per internode */
  internodeSegments: number;
  /** channel density at a node relative to the bare-axon HH densities */
  nodeDensity: number;
  /** specific capacitance / leak of a myelinated internode (µF/cm², mS/cm²) */
  myelinCm: number;
  myelinGl: number;
  /** damage a stretch of internodes: index range [from, to) and severity 0..1 (1 = myelin gone) */
  demyelinate: { from: number; to: number; severity: number } | null;
  tempC: number;
  /** integration step, ms */
  dt: number;
}

export const CABLE_DEFAULTS: Readonly<CableOptions> = Object.freeze({
  myelinated: false,
  lengthMm: 30,
  diameterUm: 10,
  Ri: 100,
  dxMm: 0.1,
  internodeMm: 1,
  nodeUm: 2,
  internodeSegments: 6,
  nodeDensity: 10,
  myelinCm: 0.005,
  myelinGl: 0.002,
  demyelinate: null,
  tempC: 6.3,
  dt: 0.005,
});

export type CompartmentKind = 'bare' | 'node' | 'myelin' | 'damaged';

/** standard stimulus used by the app and the tests: current density (see Cable.step) and duration */
export const STIM_DENSITY = 4000;
export const STIM_MS = 0.3;

export class Cable {
  readonly opts: CableOptions;
  readonly n: number;
  /** compartment centre positions, mm */
  readonly x: Float64Array;
  readonly kind: CompartmentKind[];
  /** indices of node-of-Ranvier compartments (empty when unmyelinated) */
  readonly nodes: number[] = [];
  /** internode index of each compartment (−1 for nodes / bare fibre) */
  readonly internodeOf: Int16Array;
  readonly V: Float64Array;
  readonly m: Float64Array;
  readonly h: Float64Array;
  readonly nGate: Float64Array;
  readonly vRest: number;
  t = 0;

  // per-compartment absolute parameters
  private cap: Float64Array;
  private gNaBar: Float64Array;
  private gKBar: Float64Array;
  private gLeak: Float64Array;
  /** axial conductance between compartment i and i+1, mS */
  private gAx: Float64Array;
  // solver scratch
  private diag: Float64Array;
  private rhs: Float64Array;
  private cp: Float64Array;
  private inj: Float64Array;

  constructor(options: Partial<CableOptions> = {}) {
    const o = (this.opts = { ...CABLE_DEFAULTS, ...options });
    const d = o.diameterUm * 1e-4; // cm
    const lens: number[] = []; // cm
    const kinds: CompartmentKind[] = [];
    const inter: number[] = [];
    if (!o.myelinated) {
      const count = Math.max(2, Math.round(o.lengthMm / o.dxMm));
      for (let i = 0; i < count; i++) { lens.push((o.lengthMm / count) * 0.1); kinds.push('bare'); inter.push(-1); }
    } else {
      const nInter = Math.max(1, Math.round(o.lengthMm / o.internodeMm));
      const segLen = (o.lengthMm / nInter / o.internodeSegments) * 0.1;
      for (let k = 0; k <= nInter; k++) {
        this.nodes.push(lens.length);
        lens.push(o.nodeUm * 1e-4); kinds.push('node'); inter.push(-1);
        if (k === nInter) break;
        const dm = o.demyelinate;
        const damaged = !!dm && dm.severity > 0 && k >= dm.from && k < dm.to;
        for (let s = 0; s < o.internodeSegments; s++) { lens.push(segLen); kinds.push(damaged ? 'damaged' : 'myelin'); inter.push(k); }
      }
    }
    const n = (this.n = lens.length);
    this.kind = kinds;
    this.internodeOf = Int16Array.from(inter);
    this.x = new Float64Array(n);
    this.cap = new Float64Array(n);
    this.gNaBar = new Float64Array(n);
    this.gKBar = new Float64Array(n);
    this.gLeak = new Float64Array(n);
    this.gAx = new Float64Array(n);
    this.V = new Float64Array(n);
    this.m = new Float64Array(n);
    this.h = new Float64Array(n);
    this.nGate = new Float64Array(n);
    this.diag = new Float64Array(n);
    this.rhs = new Float64Array(n);
    this.cp = new Float64Array(n);
    this.inj = new Float64Array(n);

    const H = HH_DEFAULTS;
    this.vRest = restingPotential(H);
    const sev = o.demyelinate?.severity ?? 0;
    // geometric (log) interpolation between healthy myelin and bare, channel-free membrane
    const dmCm = o.myelinCm * Math.pow(H.C / o.myelinCm, sev);
    const dmGl = o.myelinGl * Math.pow(H.gL / o.myelinGl, sev);
    const rAx = new Float64Array(n); // kΩ, end to end
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const L = lens[i];
      const A = Math.PI * d * L;
      this.x[i] = (pos + L / 2) * 10;
      pos += L;
      rAx[i] = (o.Ri * L) / ((Math.PI * d * d) / 4) / 1000;
      const k = kinds[i];
      if (k === 'bare') { this.cap[i] = H.C * A; this.gNaBar[i] = H.gNa * A; this.gKBar[i] = H.gK * A; this.gLeak[i] = H.gL * A; }
      else if (k === 'node') {
        this.cap[i] = H.C * A; this.gNaBar[i] = H.gNa * o.nodeDensity * A; this.gKBar[i] = H.gK * o.nodeDensity * A;
        this.gLeak[i] = H.gL * o.nodeDensity * A;
      } else if (k === 'myelin') { this.cap[i] = o.myelinCm * A; this.gLeak[i] = o.myelinGl * A; }
      else { this.cap[i] = dmCm * A; this.gLeak[i] = dmGl * A; }
    }
    for (let i = 0; i < n - 1; i++) this.gAx[i] = 1 / (rAx[i] / 2 + rAx[i + 1] / 2);
    this.reset();
  }

  get lengthMm() { return this.opts.lengthMm; }

  reset() {
    const v = this.vRest;
    this.V.fill(v);
    this.m.fill(mInf(v));
    this.h.fill(hInf(v));
    this.nGate.fill(nInf(v));
    this.inj.fill(0);
    this.t = 0;
  }

  /** index of the excitable compartment (node, or any bare compartment) nearest to xMm */
  indexAt(xMm: number): number {
    let best = 0, bd = Infinity;
    if (this.nodes.length) {
      for (const i of this.nodes) { const dd = Math.abs(this.x[i] - xMm); if (dd < bd) { bd = dd; best = i; } }
      return best;
    }
    for (let i = 0; i < this.n; i++) { const dd = Math.abs(this.x[i] - xMm); if (dd < bd) { bd = dd; best = i; } }
    return best;
  }

  /** linear interpolation of V at a position (mm) */
  voltageAt(xMm: number): number {
    const x = this.x, n = this.n;
    if (xMm <= x[0]) return this.V[0];
    if (xMm >= x[n - 1]) return this.V[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= xMm) lo = mid; else hi = mid; }
    const f = (xMm - x[lo]) / (x[hi] - x[lo]);
    return this.V[lo] + (this.V[hi] - this.V[lo]) * f;
  }

  /**
   * Advance by dtMs. `stim` injects current at the excitable compartment nearest xMm. `density` is
   * µA per cm² of a 0.2 mm stretch of bare axon, so the same number is the same total current in
   * both builds of the fibre.
   */
  step(dtMs: number, stim?: { xMm: number; density: number } | null) {
    const o = this.opts;
    const nSub = Math.max(1, Math.ceil(dtMs / o.dt - 1e-9));
    const dt = dtMs / nSub;
    const n = this.n;
    const { V, m, h, nGate, cap, gNaBar, gKBar, gLeak, gAx, diag, rhs, cp, inj } = this;
    const H = HH_DEFAULTS;
    const phi = q10Factor(o.tempC);
    inj.fill(0);
    if (stim && stim.density !== 0) {
      inj[this.indexAt(stim.xMm)] = stim.density * Math.PI * (o.diameterUm * 1e-4) * 0.02; // µA
    }
    for (let s = 0; s < nSub; s++) {
      for (let i = 0; i < n; i++) {
        let gNa = 0, gK = 0;
        const active = gNaBar[i] > 0;
        if (active) {
          const v = V[i];
          m[i] = gateStep(m[i], phi * alphaM(v), phi * betaM(v), dt);
          h[i] = gateStep(h[i], phi * alphaH(v), phi * betaH(v), dt);
          nGate[i] = gateStep(nGate[i], phi * alphaN(v), phi * betaN(v), dt);
          gNa = gNaBar[i] * m[i] * m[i] * m[i] * h[i];
          const n2 = nGate[i] * nGate[i];
          gK = gKBar[i] * n2 * n2;
        }
        const cdt = cap[i] / dt;
        const left = i > 0 ? gAx[i - 1] : 0;
        const right = i < n - 1 ? gAx[i] : 0;
        // passive (channel-free) membrane leaks toward the resting potential
        const eLeak = active ? H.EL : this.vRest;
        diag[i] = cdt + gNa + gK + gLeak[i] + left + right;
        rhs[i] = cdt * V[i] + gNa * H.ENa + gK * H.EK + gLeak[i] * eLeak + inj[i];
      }
      // Thomas algorithm; off-diagonals are −gAx
      cp[0] = -gAx[0] / diag[0];
      rhs[0] = rhs[0] / diag[0];
      for (let i = 1; i < n; i++) {
        const lower = -gAx[i - 1];
        const den = diag[i] - lower * cp[i - 1];
        cp[i] = i < n - 1 ? -gAx[i] / den : 0;
        rhs[i] = (rhs[i] - lower * rhs[i - 1]) / den;
      }
      V[n - 1] = rhs[n - 1];
      for (let i = n - 2; i >= 0; i--) V[i] = rhs[i] - cp[i] * V[i + 1];
      this.t += dt;
    }
  }
}

export interface ConductionResult {
  /** did a spike reach the last probe? */
  arrived: boolean;
  /** m/s measured between the first two probes (NaN if it never got there) */
  velocity: number;
  /** time (ms) at which each probe first crossed −20 mV, NaN if never */
  crossings: number[];
  /** number of upward −20 mV crossings seen at each probe */
  spikeCounts: number[];
}

/** stimulate a fresh cable (at its start unless xStimMm is given) and time the spike past a row of probes */
export function runConduction(
  cable: Cable, opts: { probes?: number[]; maxMs?: number; xStimMm?: number; density?: number } = {},
): ConductionResult {
  const L = cable.lengthMm;
  const probes = opts.probes ?? [0.25 * L, 0.75 * L, 0.97 * L];
  const idx = probes.map((p) => cable.indexAt(p));
  const crossings = probes.map(() => NaN);
  const counts = probes.map(() => 0);
  const above = probes.map(() => false);
  const maxMs = opts.maxMs ?? 40;
  const stim = { xMm: opts.xStimMm ?? 0, density: opts.density ?? STIM_DENSITY };
  cable.reset();
  const dt = 0.02;
  while (cable.t < maxMs) {
    cable.step(dt, cable.t < STIM_MS ? stim : null);
    for (let k = 0; k < idx.length; k++) {
      const up = cable.V[idx[k]] > -20;
      if (up && !above[k]) { counts[k]++; if (Number.isNaN(crossings[k])) crossings[k] = cable.t; }
      above[k] = up;
    }
  }
  const velocity = (cable.x[idx[1]] - cable.x[idx[0]]) / (crossings[1] - crossings[0]); // mm/ms = m/s
  return { arrived: !Number.isNaN(crossings[crossings.length - 1]), velocity, crossings, spikeCounts: counts };
}
