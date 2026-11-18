import { describe, expect, it } from 'vitest';
import { Cable, STIM_DENSITY, STIM_MS, runConduction } from '../src/sim/cable';
import { hInf } from '../src/sim/hodgkinHuxley';

describe('axon cable', () => {
  it('stays at rest without a stimulus', () => {
    for (const myelinated of [false, true]) {
      const c = new Cable({ myelinated });
      c.step(5);
      expect(Math.max(...c.V) - Math.min(...c.V)).toBeLessThan(0.5);
      expect(c.V[0]).toBeCloseTo(-65, 0);
    }
  });

  it('a spike propagates end to end along the bare axon, once', () => {
    const r = runConduction(new Cable({ myelinated: false }));
    expect(r.arrived).toBe(true);
    expect(r.crossings[0]).toBeLessThan(r.crossings[1]);
    expect(r.crossings[1]).toBeLessThan(r.crossings[2]);
    expect(r.spikeCounts).toEqual([1, 1, 1]);
    // thin unmyelinated fibres conduct at roughly a metre per second
    expect(r.velocity).toBeGreaterThan(0.4);
    expect(r.velocity).toBeLessThan(3);
  });

  it('the myelinated fibre is clearly faster (saltatory conduction)', () => {
    const bare = runConduction(new Cable({ myelinated: false }));
    const my = runConduction(new Cable({ myelinated: true }));
    expect(my.arrived).toBe(true);
    expect(my.spikeCounts).toEqual([1, 1, 1]);
    expect(my.velocity).toBeGreaterThan(5 * bare.velocity);
  });

  it('myelinated spikes are regenerated at nodes while internodes carry no channels', () => {
    const c = new Cable({ myelinated: true });
    expect(c.nodes.length).toBe(31);
    const maxV = new Float64Array(c.n).fill(-100);
    for (let t = 0; t < 4; t += 0.02) {
      c.step(0.02, t < STIM_MS ? { xMm: 0, density: STIM_DENSITY } : null);
      for (let i = 0; i < c.n; i++) maxV[i] = Math.max(maxV[i], c.V[i]);
    }
    // every node far from the ends fires a full-size spike
    for (const i of c.nodes.slice(3, -3)) expect(maxV[i]).toBeGreaterThan(10);
    // gates never move in the internodes
    const mid = c.nodes[10] + 3;
    expect(c.kind[mid]).toBe('myelin');
    expect(c.h[mid]).toBeCloseTo(hInf(c.vRest), 6);
  });

  it('travels one way: the membrane behind the spike is refractory and never re-fires', () => {
    const c = new Cable({ myelinated: false });
    const up = new Uint8Array(c.n);
    const counts = new Uint8Array(c.n);
    let checked = false;
    for (let t = 0; t < 40; t += 0.02) {
      c.step(0.02, t < STIM_MS ? { xMm: 0, density: STIM_DENSITY } : null);
      for (let i = 0; i < c.n; i++) {
        const a = c.V[i] > -20 ? 1 : 0;
        if (a && !up[i]) counts[i]++;
        up[i] = a;
      }
      if (!checked && c.voltageAt(15) > 0) {
        checked = true;
        // ahead of the spike: Na⁺ channels available; just behind it: inactivated (refractory)
        expect(c.h[c.indexAt(20)]).toBeGreaterThan(0.5);
        expect(c.h[c.indexAt(13.5)]).toBeLessThan(0.2);
        expect(c.voltageAt(20)).toBeLessThan(-60);
      }
    }
    expect(checked).toBe(true);
    expect(Math.max(...counts)).toBe(1);
    expect(counts[c.indexAt(15)]).toBe(1);
  });

  it('a spike started mid-axon spreads both ways, and two spikes that collide annihilate', () => {
    const c = new Cable({ myelinated: false, lengthMm: 16 });
    const r = runConduction(c, { xStimMm: 8, probes: [2, 14, 15.5] });
    expect(r.spikeCounts[0]).toBe(1);
    expect(r.spikeCounts[1]).toBe(1);
    // stimulate both ends: each probe sees exactly one spike — they do not pass through each other
    const d = new Cable({ myelinated: false, lengthMm: 16 });
    const counts = [0, 0];
    const up = [false, false];
    const probes = [d.indexAt(4), d.indexAt(12)];
    for (let t = 0; t < 40; t += 0.02) {
      d.step(0.02, t < STIM_MS ? { xMm: 0, density: STIM_DENSITY } : t < 2 * STIM_MS ? { xMm: 16, density: STIM_DENSITY } : null);
      probes.forEach((p, k) => { const a = d.V[p] > -20; if (a && !up[k]) counts[k]++; up[k] = a; });
    }
    expect(counts).toEqual([1, 1]);
  });

  it('demyelination slows conduction, and severe demyelination blocks it', () => {
    const healthy = runConduction(new Cable({ myelinated: true }));
    const mild = runConduction(new Cable({ myelinated: true, demyelinate: { from: 13, to: 17, severity: 0.7 } }));
    const severe = runConduction(new Cable({ myelinated: true, demyelinate: { from: 13, to: 17, severity: 1 } }));
    expect(mild.arrived).toBe(true);
    expect(mild.crossings[2]).toBeGreaterThan(healthy.crossings[2] * 1.5);
    expect(severe.arrived).toBe(false);
    expect(severe.spikeCounts[0]).toBe(1); // it still reaches the damage…
    expect(severe.spikeCounts[1]).toBe(0); // …but never gets past it
  });
});
