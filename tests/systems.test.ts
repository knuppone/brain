import { describe, expect, it } from 'vitest';
import { SEARCH_ITEMS, SYSTEMS } from '../src/content/systems';
import { ANATOMY } from '../src/scene/procedural/systemsAnatomy';
import { structureById } from '../src/content/regions';

describe('systems content', () => {
  it('has unique ids and a search entry for every system', () => {
    const ids = SYSTEMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SEARCH_ITEMS.map((s) => s.id)).toEqual(ids);
  });

  it('every system has anatomy, and lit structures exist', () => {
    for (const s of SYSTEMS) {
      expect(ANATOMY[s.id], s.id).toBeDefined();
      for (const id of s.lit) expect(structureById.has(id), `${s.id}: ${id}`).toBe(true);
    }
  });

  it('pathway stations and segments match the numbered steps', () => {
    for (const s of SYSTEMS.filter((x) => x.kind === 'pathways')) {
      const n = s.steps!.length;
      const a = ANATOMY[s.id];
      expect(a.stations.map((st) => st.n).sort(), s.id).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      for (const t of a.tracts) {
        expect(t.kind).toBe('seg');
        if (t.kind === 'seg') expect(t.step >= 1 && t.step <= n, `${s.id} step ${t.step}`).toBe(true);
      }
    }
  });

  it('nuclei and tags refer to content entries', () => {
    for (const s of SYSTEMS) {
      const a = ANATOMY[s.id];
      const nuclei = new Set(s.nuclei?.map((n) => n.id));
      const routes = new Set(s.routes?.map((r) => r.id));
      for (const n of a.nuclei) expect(nuclei.has(n.id), `${s.id}: ${n.id}`).toBe(true);
      for (const t of a.tags) expect(nuclei.has(t.ref) || routes.has(t.ref), `${s.id}: ${t.ref}`).toBe(true);
    }
  });

  it('keeps authored points inside a plausible head-sized box (MNI mm)', () => {
    for (const s of SYSTEMS) {
      for (const t of ANATOMY[s.id].tracts) {
        const pts = t.kind === 'seg' ? t.pts : [t.from, ...t.routes.flat()];
        for (const [x, y, z] of pts) {
          expect(Math.abs(x) <= 75 && y >= -110 && y <= 80 && z >= -85 && z <= 85, `${s.id}: ${x},${y},${z}`).toBe(true);
        }
      }
    }
  });
});
