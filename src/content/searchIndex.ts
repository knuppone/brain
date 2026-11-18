import type { LevelId } from '../state/store';
import { HEAD_LAYERS } from './head';
import { STRUCTURES } from './regions';
import { SEARCH_ITEMS as SYSTEMS_ITEMS } from './systems';
import { SEARCH_ITEMS as CELLS_ITEMS } from './cells';

export interface SearchEntry {
  level: LevelId;
  id: string;
  name: string;
  tagline: string;
}

const from = (level: LevelId, items: { id: string; name: string; tagline: string }[]): SearchEntry[] =>
  items.map(({ id, name, tagline }) => ({ level, id, name, tagline }));

export const SEARCH_INDEX: SearchEntry[] = [
  ...from('head', HEAD_LAYERS),
  ...from('brain', STRUCTURES),
  ...from('systems', SYSTEMS_ITEMS),
  ...from('cells', CELLS_ITEMS),
];

export function search(query: string, limit = 12): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: [number, SearchEntry][] = [];
  for (const e of SEARCH_INDEX) {
    const name = e.name.toLowerCase();
    const hay = `${name} ${e.tagline.toLowerCase()} ${e.id}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 50;
    if (name.includes(q)) score += 20;
    if (new RegExp(`\\b${words[0].replace(/[^a-z0-9]/g, '')}`).test(name)) score += 10;
    scored.push([score - name.length * 0.01, e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((s) => s[1]);
}
