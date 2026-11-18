/**
 * Hodgkin–Huxley model of the squid giant axon membrane (1952), written in the modern
 * sign convention: V is the inside potential relative to outside, rest ≈ −65 mV.
 *
 * Units: mV, ms, µF/cm², mS/cm², µA/cm².  Positive injected current depolarises.
 * Pure TypeScript, no dependencies — unit-tested in tests/hodgkinHuxley.test.ts.
 */

export interface HHParams {
  /** membrane capacitance, µF/cm² */
  C: number;
  /** maximal conductances, mS/cm² */
  gNa: number;
  gK: number;
  gL: number;
  /** reversal (Nernst) potentials, mV */
  ENa: number;
  EK: number;
  EL: number;
  /** fraction of Na⁺ channels left unblocked (TTX → ~0) */
  naAvail: number;
  /** fraction of voltage-gated K⁺ channels left unblocked (TEA → ~0) */
  kAvail: number;
  /** temperature in °C; the original fit is 6.3 °C, gate kinetics speed up with Q10 = 3 */
  tempC: number;
}

export const HH_DEFAULTS: Readonly<HHParams> = Object.freeze({
  C: 1, gNa: 120, gK: 36, gL: 0.3, ENa: 50, EK: -77, EL: -54.387, naAvail: 1, kAvail: 1, tempC: 6.3,
});

/** x / (1 − e^(−x/s)) with its removable singularity at x = 0 handled (→ s) */
function vtrap(x: number, s: number): number {
  const r = x / s;
  if (Math.abs(r) < 1e-6) return s * (1 + r / 2);
  return x / (1 - Math.exp(-r));
}

export const alphaM = (V: number) => 0.1 * vtrap(V + 40, 10);
export const betaM = (V: number) => 4 * Math.exp(-(V + 65) / 18);
export const alphaH = (V: number) => 0.07 * Math.exp(-(V + 65) / 20);
export const betaH = (V: number) => 1 / (1 + Math.exp(-(V + 35) / 10));
export const alphaN = (V: number) => 0.01 * vtrap(V + 55, 10);
export const betaN = (V: number) => 0.125 * Math.exp(-(V + 65) / 80);

export const mInf = (V: number) => alphaM(V) / (alphaM(V) + betaM(V));
export const hInf = (V: number) => alphaH(V) / (alphaH(V) + betaH(V));
export const nInf = (V: number) => alphaN(V) / (alphaN(V) + betaN(V));

/** kinetic speed-up relative to 6.3 °C (Q10 = 3) */
export const q10Factor = (tempC: number) => Math.pow(3, (tempC - 6.3) / 10);

/** advance a gate x' = a(1−x) − b·x exactly over dt assuming a, b constant (exponential Euler) */
export function gateStep(x: number, a: number, b: number, dt: number): number {
  const sum = a + b;
  const inf = a / sum;
  return inf + (x - inf) * Math.exp(-dt * sum);
}

/** resting potential for a parameter set: where the steady-state ionic current is zero */
export function restingPotential(p: HHParams = HH_DEFAULTS): number {
  const f = (V: number) => {
    const m = mInf(V), h = hInf(V), n = nInf(V);
    return p.gNa * p.naAvail * m * m * m * h * (V - p.ENa) + p.gK * p.kAvail * n * n * n * n * (V - p.EK) + p.gL * (V - p.EL);
  };
  // lowest zero crossing above E_K: scan upward, then bisect
  let lo = p.EK - 5, hi = lo;
  for (let V = lo; V <= p.ENa; V += 0.5) {
    if (f(V) > 0) { hi = V; break; }
    lo = V;
  }
  if (hi <= lo) return p.EL;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

const MAX_SUBSTEP = 0.01; // ms

export class HodgkinHuxley {
  readonly p: HHParams;
  /** membrane potential, mV */
  V = -65;
  /** Na⁺ activation, Na⁺ inactivation (1 = available), K⁺ activation — each 0..1 */
  m = 0;
  h = 0;
  n = 0;
  /** simulated time, ms */
  t = 0;

  constructor(params: Partial<HHParams> = {}) {
    this.p = { ...HH_DEFAULTS, ...params };
    this.reset();
  }

  /** settle at the resting potential of the unblocked membrane */
  reset(V = restingPotential({ ...this.p, naAvail: 1, kAvail: 1 })) {
    this.V = V;
    this.m = mInf(V);
    this.h = hInf(V);
    this.n = nInf(V);
    this.t = 0;
  }

  /** fraction of Na⁺ channels conducting: m³h */
  get naOpen() { return this.m * this.m * this.m * this.h; }
  /** fraction of K⁺ channels conducting: n⁴ */
  get kOpen() { const n2 = this.n * this.n; return n2 * n2; }
  /** conductances, mS/cm² (including any block) */
  get gNa() { return this.p.gNa * this.p.naAvail * this.naOpen; }
  get gK() { return this.p.gK * this.p.kAvail * this.kOpen; }
  /** ionic currents, µA/cm²; negative = positive charge flowing INTO the cell */
  get iNa() { return this.gNa * (this.V - this.p.ENa); }
  get iK() { return this.gK * (this.V - this.p.EK); }
  get iL() { return this.p.gL * (this.V - this.p.EL); }

  /**
   * Advance by dtMs with a constant injected current (µA/cm²).
   * Sub-steps internally (≤ 0.01 ms). Gates and voltage both use exponential-Euler updates,
   * which stay stable for this stiff system (validated against RK4 in the tests).
   */
  step(dtMs: number, injected = 0) {
    if (!(dtMs > 0)) return;
    const nSub = Math.max(1, Math.ceil(dtMs / MAX_SUBSTEP - 1e-9));
    const dt = dtMs / nSub;
    const p = this.p;
    const phi = q10Factor(p.tempC);
    for (let i = 0; i < nSub; i++) {
      const V = this.V;
      this.m = gateStep(this.m, phi * alphaM(V), phi * betaM(V), dt);
      this.h = gateStep(this.h, phi * alphaH(V), phi * betaH(V), dt);
      this.n = gateStep(this.n, phi * alphaN(V), phi * betaN(V), dt);
      const gNa = p.gNa * p.naAvail * this.m * this.m * this.m * this.h;
      const n2 = this.n * this.n;
      const gK = p.gK * p.kAvail * n2 * n2;
      const gTot = gNa + gK + p.gL;
      const vInf = (gNa * p.ENa + gK * p.EK + p.gL * p.EL + injected) / gTot;
      this.V = vInf + (V - vInf) * Math.exp((-dt * gTot) / p.C);
      this.t += dt;
    }
  }
}

/** reference integrator (classic RK4 on the full 4-D system) used by the tests to validate step() */
export function rk4Step(s: { V: number; m: number; h: number; n: number }, dt: number, I: number, p: HHParams = HH_DEFAULTS) {
  const phi = q10Factor(p.tempC);
  const f = (V: number, m: number, h: number, n: number): [number, number, number, number] => [
    (I - p.gNa * p.naAvail * m * m * m * h * (V - p.ENa) - p.gK * p.kAvail * n * n * n * n * (V - p.EK) - p.gL * (V - p.EL)) / p.C,
    phi * (alphaM(V) * (1 - m) - betaM(V) * m),
    phi * (alphaH(V) * (1 - h) - betaH(V) * h),
    phi * (alphaN(V) * (1 - n) - betaN(V) * n),
  ];
  const k1 = f(s.V, s.m, s.h, s.n);
  const k2 = f(s.V + (dt / 2) * k1[0], s.m + (dt / 2) * k1[1], s.h + (dt / 2) * k1[2], s.n + (dt / 2) * k1[3]);
  const k3 = f(s.V + (dt / 2) * k2[0], s.m + (dt / 2) * k2[1], s.h + (dt / 2) * k2[2], s.n + (dt / 2) * k2[3]);
  const k4 = f(s.V + dt * k3[0], s.m + dt * k3[1], s.h + dt * k3[2], s.n + dt * k3[3]);
  s.V += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  s.m += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  s.h += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  s.n += (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
}
