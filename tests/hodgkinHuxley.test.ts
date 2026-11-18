import { describe, expect, it } from 'vitest';
import { HH_DEFAULTS, HodgkinHuxley, alphaM, alphaN, hInf, mInf, nInf, restingPotential, rk4Step } from '../src/sim/hodgkinHuxley';

const DT = 0.01;

/** run with pulses [{at, dur, amp}] plus a constant bias; returns the sampled trace */
function run(hh: HodgkinHuxley, ms: number, pulses: { at: number; dur: number; amp: number }[] = [], bias = 0) {
  const V: number[] = [];
  const steps = Math.round(ms / DT);
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    let I = bias;
    for (const p of pulses) if (t >= p.at && t < p.at + p.dur) I += p.amp;
    hh.step(DT, I);
    V.push(hh.V);
  }
  return V;
}
const peakIn = (V: number[], from: number, to: number) => Math.max(...V.slice(Math.round(from / DT), Math.round(to / DT)));
const spikeTimes = (V: number[], level = 0) => {
  const out: number[] = [];
  for (let i = 1; i < V.length; i++) if (V[i - 1] <= level && V[i] > level) out.push(i * DT);
  return out;
};
const widthAt = (V: number[], level: number) => V.filter((v) => v > level).length * DT;

describe('Hodgkin–Huxley membrane', () => {
  it('rate functions are finite at their removable singularities', () => {
    expect(alphaM(-40)).toBeCloseTo(1, 6);
    expect(alphaN(-55)).toBeCloseTo(0.1, 6);
    expect(alphaM(-40 + 1e-9)).toBeCloseTo(alphaM(-40), 6);
    for (const v of [-40, -55, -65, 0]) {
      expect(Number.isFinite(mInf(v))).toBe(true);
      expect(Number.isFinite(nInf(v))).toBe(true);
    }
  });

  it('rests near −65 mV and stays there', () => {
    expect(restingPotential()).toBeGreaterThan(-66);
    expect(restingPotential()).toBeLessThan(-64);
    const hh = new HodgkinHuxley();
    const V = run(hh, 50);
    expect(Math.max(...V) - Math.min(...V)).toBeLessThan(0.05);
    expect(hh.V).toBeCloseTo(-65, 0);
    expect(hh.h).toBeCloseTo(hInf(hh.V), 3);
    // at rest almost no Na⁺ channels conduct
    expect(hh.naOpen).toBeLessThan(0.001);
  });

  it('a brief suprathreshold pulse gives a full spike peaking around +30…+45 mV', () => {
    const hh = new HodgkinHuxley();
    const V = run(hh, 20, [{ at: 1, dur: 0.5, amp: 20 }]);
    const peak = Math.max(...V);
    expect(peak).toBeGreaterThan(30);
    expect(peak).toBeLessThan(45);
    // undershoot below rest toward E_K, then recovery
    expect(Math.min(...V)).toBeLessThan(-70);
    expect(Math.min(...V)).toBeGreaterThan(HH_DEFAULTS.EK);
    expect(hh.V).toBeGreaterThan(-67);
    // the whole spike is a couple of milliseconds wide
    expect(widthAt(V, -20)).toBeGreaterThan(0.5);
    expect(widthAt(V, -20)).toBeLessThan(2.5);
  });

  it('is all-or-none: subthreshold pulses fizzle, suprathreshold ones give the same size spike', () => {
    const sub = Math.max(...run(new HodgkinHuxley(), 20, [{ at: 1, dur: 0.5, amp: 8 }]));
    expect(sub).toBeLessThan(-55);
    const a = Math.max(...run(new HodgkinHuxley(), 20, [{ at: 1, dur: 0.5, amp: 16 }]));
    const b = Math.max(...run(new HodgkinHuxley(), 20, [{ at: 1, dur: 0.5, amp: 30 }]));
    expect(a).toBeGreaterThan(30);
    expect(Math.abs(a - b)).toBeLessThan(4); // nearly double the stimulus, almost the same spike
  });

  it('has a refractory period: a second pulse soon after fails, a later one succeeds', () => {
    const early = run(new HodgkinHuxley(), 30, [{ at: 1, dur: 0.5, amp: 20 }, { at: 5, dur: 0.5, amp: 20 }]);
    expect(peakIn(early, 0, 4.5)).toBeGreaterThan(30);
    expect(peakIn(early, 5, 30)).toBeLessThan(-30);
    const late = run(new HodgkinHuxley(), 40, [{ at: 1, dur: 0.5, amp: 20 }, { at: 19, dur: 0.5, amp: 20 }]);
    expect(peakIn(late, 19, 40)).toBeGreaterThan(25);
    expect(spikeTimes(late).length).toBe(2);
  });

  it('Na⁺ inactivation (h) collapses during the spike and recovers slowly', () => {
    const hh = new HodgkinHuxley();
    const hRest = hh.h;
    let hMin = 1;
    for (let i = 0; i < 600; i++) { hh.step(DT, i * DT >= 1 && i * DT < 1.5 ? 20 : 0); hMin = Math.min(hMin, hh.h); }
    expect(hRest).toBeGreaterThan(0.5);
    expect(hMin).toBeLessThan(0.15);
  });

  it('with Na⁺ channels blocked (TTX) there is no spike', () => {
    const V = run(new HodgkinHuxley({ naAvail: 0 }), 30, [{ at: 1, dur: 0.5, amp: 30 }]);
    expect(Math.max(...V)).toBeLessThan(-40);
  });

  it('with K⁺ channels mostly blocked (TEA) the spike is much broader', () => {
    const normal = run(new HodgkinHuxley(), 30, [{ at: 1, dur: 0.5, amp: 20 }]);
    const tea = run(new HodgkinHuxley({ kAvail: 0.05 }), 30, [{ at: 1, dur: 0.5, amp: 20 }]);
    expect(Math.max(...tea)).toBeGreaterThan(30);
    expect(widthAt(tea, -40)).toBeGreaterThan(5 * widthAt(normal, -40));
  });

  it('sustained current gives repetitive firing whose rate grows with the current, not the spike size', () => {
    const rate = (I: number) => {
      const V = run(new HodgkinHuxley(), 400, [], I);
      const t = spikeTimes(V).filter((x) => x > 100);
      return { hz: t.length / 0.3, peak: peakIn(V, 100, 400) };
    };
    const r0 = rate(2), r1 = rate(8), r2 = rate(15), r3 = rate(30);
    expect(r0.hz).toBe(0);
    expect(r1.hz).toBeGreaterThan(40);
    expect(r2.hz).toBeGreaterThan(r1.hz);
    expect(r3.hz).toBeGreaterThan(r2.hz);
    expect(r3.peak).toBeLessThanOrEqual(r1.peak + 1); // spikes do not get bigger
  });

  it('step() agrees with a fine RK4 reference and is independent of how the time is chunked', () => {
    const hh = new HodgkinHuxley();
    const ref = { V: hh.V, m: hh.m, h: hh.h, n: hh.n };
    const coarse = new HodgkinHuxley();
    let tPeak = 0, tPeakRef = 0, pk = -100, pkRef = -100;
    for (let i = 0; i < 1500; i++) {
      const t = i * DT;
      const I = t >= 1 && t < 1.5 ? 20 : 0;
      hh.step(DT, I);
      for (let k = 0; k < 10; k++) rk4Step(ref, DT / 10, I);
      if (hh.V > pk) { pk = hh.V; tPeak = t; }
      if (ref.V > pkRef) { pkRef = ref.V; tPeakRef = t; }
    }
    expect(Math.abs(pk - pkRef)).toBeLessThan(1.5);
    expect(Math.abs(tPeak - tPeakRef)).toBeLessThan(0.1);
    // a frame-sized step is sub-stepped internally
    for (let i = 0; i < 30; i++) coarse.step(0.5, i * 0.5 >= 1 && i * 0.5 < 1.5 ? 20 : 0);
    const fine = new HodgkinHuxley();
    let pkFine = -100;
    for (let i = 0; i < 1500; i++) { fine.step(DT, i * DT >= 1 && i * DT < 1.5 ? 20 : 0); pkFine = Math.max(pkFine, fine.V); }
    expect(coarse.V).toBeCloseTo(fine.V, 1);
    expect(coarse.t).toBeCloseTo(15, 6);
  });
});
