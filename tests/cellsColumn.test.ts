import { describe, expect, it } from 'vitest';
import { CELL_TYPES, SEARCH_ITEMS } from '../src/content/cells';
import { Circuit } from '../src/sim/cellsCircuit';
import { buildColumn, buildSpecimen, PIA_Y, SLAB } from '../src/scene/procedural/cellsColumn';
import { PART, STRIDE } from '../src/scene/procedural/cellsMorph';

const column = buildColumn();
const { spec } = column;
const of = (kind: string) => spec.neurons.map((n, i) => (n.kind === kind ? i : -1)).filter((i) => i >= 0);
const sum = (counts: Uint32Array, idx: number[]) => idx.reduce((a, i) => a + counts[i], 0);
const pyramids = [...of('pyr23'), ...of('pyr5'), ...of('pyr6')];

describe('cortical column layout', () => {
  it('draws one axon route per model synapse, ending near its target', () => {
    expect(column.routes.length).toBe(spec.synapses.length);
    spec.synapses.forEach((s, i) => {
      const r = column.routes[i];
      expect(r, `route ${i}`).toBeTruthy();
      expect(r.pts.length).toBe(r.cum.length);
      for (let k = 1; k < r.cum.length; k++) expect(r.cum[k]).toBeGreaterThanOrEqual(r.cum[k - 1]);
      expect(s.delay).toBeGreaterThanOrEqual(0.8);
      expect(s.delay).toBeLessThan(20);
      const post = column.cells[column.cellOfNeuron[s.post]].morph;
      if (s.zone === 'soma') expect(r.end.distanceTo(post.soma!.p)).toBeLessThan(post.soma!.r * 1.5);
    });
  });

  it('keeps every cell inside (or just around) the slab and under the pia', () => {
    for (const c of column.cells) {
      const b = c.morph.bounds();
      expect(b.max.y).toBeLessThanOrEqual(PIA_Y + 0.5);
      expect(b.min.y).toBeGreaterThanOrEqual(-SLAB.h / 2 - 6);
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeLessThan(SLAB.w / 2 + 45);
      for (const br of c.morph.branches) {
        expect(br.pts.length % STRIDE).toBe(0);
        expect(br.pts.every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('gives layer V pyramidal cells an apical dendrite that reaches layer I', () => {
    for (const n of of('pyr5')) {
      const m = column.cells[column.cellOfNeuron[n]].morph;
      const top = Math.max(...m.points(PART.dendrite).map((p) => p.p.y));
      expect(top).toBeGreaterThan(PIA_Y - 22);
    }
  });

  it('still relays a volley in order and runs away without inhibition, with the drawn delays', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const c = new Circuit(spec, seed);
      c.run(150);
      c.drain();
      const t0 = c.t;
      c.stimulate();
      const early = c.run(60);
      const median = (idx: number[]) => {
        const ts = c.spikes.filter((s) => idx.includes(s.neuron)).map((s) => s.t - t0).sort((a, b) => a - b);
        return ts.length ? ts[ts.length >> 1] : Infinity;
      };
      const s = median(of('stellate')), a = median(of('pyr23')), b = median(of('pyr5'));
      expect(s).toBeLessThan(a);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(60);
      const late = c.run(200);
      expect(sum(late, pyramids)).toBeLessThan(sum(early, pyramids) + 8);

      const off = new Circuit(spec, seed);
      off.inhibition = false;
      off.run(150);
      off.stimulate();
      expect(sum(off.run(120), pyramids)).toBeGreaterThan(sum(early, pyramids) * 2);
    }
  });
});

describe('specimens and content', () => {
  it('builds a labelled specimen for every cell type', () => {
    for (const t of CELL_TYPES) {
      const s = buildSpecimen(t.id);
      expect(s.morph.branches.length, t.id).toBeGreaterThan(3);
      for (const l of t.labels) expect(s.morph.landmarks[l.key], `${t.id}.${l.key}`).toBeTruthy();
    }
  });

  it('makes the Purkinje dendritic tree flat and dense', () => {
    const m = buildSpecimen('purkinje').morph;
    const pts = m.points(PART.dendrite);
    expect(pts.length).toBeGreaterThan(2500);
    const zs = pts.map((p) => p.p.z), xs = pts.map((p) => p.p.x);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1.5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(35);
  });

  it('lists every cell type for search with a one-line tagline', () => {
    expect(SEARCH_ITEMS.length).toBe(CELL_TYPES.length);
    for (const s of SEARCH_ITEMS) {
      expect(s.id && s.name && s.tagline).toBeTruthy();
      expect(s.tagline.length).toBeLessThan(110);
    }
  });
});
