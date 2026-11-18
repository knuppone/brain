import { describe, expect, it } from 'vitest';
import { Circuit, canonicalCircuit } from '../src/sim/cellsCircuit';

const spec = canonicalCircuit();
const of = (kind: string) => spec.neurons.map((n, i) => (n.kind === kind ? i : -1)).filter((i) => i >= 0);
const sum = (counts: Uint32Array, idx: number[]) => idx.reduce((a, i) => a + counts[i], 0);
const pyramids = [...of('pyr23'), ...of('pyr5'), ...of('pyr6')];
const inter = [...of('basket'), ...of('martinotti'), ...of('chandelier')];

describe('cortical microcircuit', () => {
  it('has a sane wiring diagram', () => {
    expect(spec.neurons.length).toBe(26);
    for (const s of spec.synapses) {
      expect(s.pre).not.toBe(s.post);
      expect(spec.neurons[s.pre].inhibitory).toBe(s.w < 0);
      expect(spec.neurons[s.post].input).toBe(false);
    }
  });

  it('stays calm at rest', () => {
    for (const seed of [1, 2, 3]) {
      const c = new Circuit(spec, seed);
      const counts = c.run(1000);
      expect(sum(counts, pyramids) / pyramids.length).toBeLessThan(4);
    }
  });

  it('passes a thalamic volley layer 4 -> 2/3 -> 5 and then settles', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = new Circuit(spec, seed);
      c.run(200);
      c.drain();
      const t0 = c.t;
      c.stimulate();
      c.run(40);
      const first = (idx: number[]) => {
        const ts = c.spikes.filter((s) => idx.includes(s.neuron)).map((s) => s.t - t0);
        return ts.length ? ts.sort((x, y) => x - y)[ts.length >> 1] : Infinity;
      };
      const s = first(of('stellate')), a = first(of('pyr23')), b = first(of('pyr5'));
      expect(s).toBeLessThan(a);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(40);
      expect(first(of('basket'))).toBeLessThan(40);
      // feedback inhibition ends the response
      const late = c.run(150);
      expect(sum(late, pyramids)).toBeLessThan(6);
    }
  });

  it('runs away when inhibition is switched off', () => {
    for (const seed of [1, 2, 3]) {
      const on = new Circuit(spec, seed);
      on.run(100);
      on.stimulate();
      const withInh = sum(on.run(100), pyramids);

      const off = new Circuit(spec, seed);
      off.inhibition = false;
      off.run(100);
      off.stimulate();
      const counts = off.run(100);
      expect(sum(counts, inter)).toBe(0);
      expect(sum(counts, pyramids)).toBeGreaterThan(withInh * 3);
    }
  });

  it('delivers each spike after its synaptic delay', () => {
    const c = new Circuit(spec, 5);
    c.stimulate();
    c.run(30);
    const { spikes, arrivals } = c.drain();
    expect(spikes.length).toBeGreaterThan(5);
    for (const a of arrivals) {
      const syn = spec.synapses[a.synapse];
      const match = spikes.some((s) => s.neuron === syn.pre && Math.abs(a.t - s.t - syn.delay) < 0.3);
      expect(match).toBe(true);
    }
    expect(c.spikes.length).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const a = new Circuit(spec, 9), b = new Circuit(spec, 9);
    a.stimulate(); b.stimulate();
    expect(Array.from(a.run(300))).toEqual(Array.from(b.run(300)));
  });
});
