/**
 * Procedural cell morphologies for the Cells level.
 *
 * A Morph is a soma plus a set of branches (polylines with a radius and the path length from the
 * soma at every point). Two growth methods are used:
 *  - grow(): recursive random walk with tropism, jitter and branching — long dendrites, axons;
 *  - colonize(): space colonisation toward a cloud of attractor points — dense, space-filling
 *    trees (Purkinje fan, astrocyte bush, local axon plexuses).
 * World units are 10 µm. Radii are deliberately thicker than life so cells stay legible.
 */
import { Vector3 } from 'three';
import type { LandmarkKey } from '../../content/cells';

export const PART = { soma: 0, dendrite: 1, axon: 2, myelin: 3, bouton: 4 } as const;

export class Rng {
  private a: number;
  constructor(seed: number) { this.a = seed >>> 0; }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  /** uniformly distributed unit vector */
  dir(out = new Vector3()): Vector3 {
    const z = this.range(-1, 1), a = this.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
    return out.set(s * Math.cos(a), z, s * Math.sin(a));
  }
  /** uniformly distributed point inside the unit ball */
  ball(out = new Vector3()): Vector3 {
    return this.dir(out).multiplyScalar(Math.cbrt(this.next()));
  }
}

/** x, y, z, radius, path-from-soma per point */
export const STRIDE = 5;
export interface Branch { part: number; pts: number[] }
export interface Blob { part: number; p: Vector3; r: number; path: number; squash?: Vector3 }
export type SomaShape = 'pyramid' | 'sphere' | 'ovoid' | 'flask';
export interface Soma { p: Vector3; r: number; shape: SomaShape }
/** the way a spike travels from the soma to one synapse: points and their path length */
export interface Route { pts: Vector3[]; cum: number[]; end: Vector3; length: number }
export type SynZone = 'dend' | 'soma' | 'tuft' | 'ais';
export interface Target { p: Vector3; zone: SynZone; somaR?: number }

export class Morph {
  branches: Branch[] = [];
  blobs: Blob[] = [];
  soma: Soma | null = null;
  landmarks: Partial<Record<LandmarkKey, Vector3>> = {};
  routes: Route[] = [];
  /** x,y,z, nx,ny,nz per dendritic spine (specimens only) */
  spines: number[] = [];
  maxDend = 1;
  maxAxon = 1;
  /** main axon (index into branches), if any */
  trunk = -1;

  add(part: number, pts: number[]): number {
    const end = pts[pts.length - 1];
    if (part === PART.dendrite) this.maxDend = Math.max(this.maxDend, end);
    else if (part === PART.axon) this.maxAxon = Math.max(this.maxAxon, end);
    this.branches.push({ part, pts });
    return this.branches.length - 1;
  }

  /** all points of one part as vectors with their path length */
  points(part: number): { p: Vector3; path: number; r: number }[] {
    const out: { p: Vector3; path: number; r: number }[] = [];
    for (const b of this.branches) {
      if (b.part !== part) continue;
      for (let i = 0; i < b.pts.length; i += STRIDE) {
        out.push({ p: new Vector3(b.pts[i], b.pts[i + 1], b.pts[i + 2]), r: b.pts[i + 3], path: b.pts[i + 4] });
      }
    }
    return out;
  }

  /** coarse x,y,z,r samples used for picking and framing */
  skeleton(): Float32Array {
    const out: number[] = [];
    if (this.soma) out.push(this.soma.p.x, this.soma.p.y, this.soma.p.z, this.soma.r * 1.2);
    for (const b of this.branches) {
      const n = b.pts.length / STRIDE;
      const every = b.part === PART.axon ? 3 : 2;
      for (let i = 0; i < n; i += every) out.push(b.pts[i * STRIDE], b.pts[i * STRIDE + 1], b.pts[i * STRIDE + 2], b.pts[i * STRIDE + 3]);
    }
    return new Float32Array(out);
  }

  bounds(): { center: Vector3; radius: number; min: Vector3; max: Vector3 } {
    const s = this.skeleton();
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < s.length; i += 4) {
      min.x = Math.min(min.x, s[i]); min.y = Math.min(min.y, s[i + 1]); min.z = Math.min(min.z, s[i + 2]);
      max.x = Math.max(max.x, s[i]); max.y = Math.max(max.y, s[i + 1]); max.z = Math.max(max.z, s[i + 2]);
    }
    const center = min.clone().add(max).multiplyScalar(0.5);
    return { center, radius: Math.max(max.distanceTo(min) / 2, 1), min, max };
  }
}

// ------------------------------------------------------------------ random-walk growth

export interface GrowOpts {
  part: number;
  from: Vector3;
  dir: Vector3;
  r0: number;
  r1: number;
  len: number;
  path0: number;
  step?: number;
  jitter?: number;
  trop?: Vector3;
  tropK?: number;
  /** chance of a side branch per unit length */
  branch?: number;
  /** remaining levels of branching */
  depth?: number;
  angle?: [number, number];
  /** child length as a fraction of this branch's length */
  childLen?: [number, number];
  /** no branching before this many steps */
  branchAfter?: number;
  yMax?: number;
  yMin?: number;
  /** overrides applied to side branches */
  child?: Partial<GrowOpts>;
}

export interface GrowResult { end: Vector3; dir: Vector3; path: number; r: number; branch: number }

const tmp = new Vector3();

/** a unit vector at `angle` radians from d, in a random direction around it */
export function deflect(d: Vector3, angle: number, rng: Rng): Vector3 {
  const perp = rng.dir(tmp).cross(d);
  if (perp.lengthSq() < 1e-6) perp.set(d.y, -d.x, 0);
  perp.normalize();
  return d.clone().multiplyScalar(Math.cos(angle)).addScaledVector(perp, Math.sin(angle)).normalize();
}

export function grow(m: Morph, rng: Rng, o: GrowOpts): GrowResult {
  const step = o.step ?? 2;
  const n = Math.max(2, Math.round(o.len / step));
  const p = o.from.clone();
  const d = o.dir.clone().normalize();
  const pts: number[] = [p.x, p.y, p.z, o.r0, o.path0];
  const depth = o.depth ?? 0;
  const jitter = o.jitter ?? 0.15;
  let path = o.path0;
  let r = o.r0;
  let shrink = 1;
  for (let i = 1; i <= n; i++) {
    d.addScaledVector(rng.dir(tmp), jitter);
    if (o.trop) d.addScaledVector(o.trop, o.tropK ?? 0.1);
    d.normalize();
    if (o.yMax !== undefined && p.y + d.y * step * 2.5 > o.yMax) {
      d.y = Math.min(d.y, (o.yMax - p.y) / (step * 2.5));
      d.normalize();
    }
    if (o.yMin !== undefined && p.y + d.y * step * 2.5 < o.yMin) {
      d.y = Math.max(d.y, (o.yMin - p.y) / (step * 2.5));
      d.normalize();
    }
    p.addScaledVector(d, step);
    path += step;
    const k = i / n;
    r = (o.r0 + (o.r1 - o.r0) * Math.pow(k, 0.8)) * shrink;
    r = Math.max(r, o.r1);
    pts.push(p.x, p.y, p.z, r, path);
    if (depth > 0 && o.branch && i < n - 1 && i >= (o.branchAfter ?? 1) && rng.next() < o.branch * step) {
      const [a0, a1] = o.angle ?? [0.5, 0.9];
      const cd = deflect(d, rng.range(a0, a1), rng);
      const [l0, l1] = o.childLen ?? [0.45, 0.75];
      grow(m, rng, {
        ...o, ...o.child, child: o.child, from: p.clone(), dir: cd, r0: Math.max(r * 0.8, o.child?.r1 ?? o.r1),
        r1: o.child?.r1 ?? o.r1, len: Math.max(step * 2, o.len * rng.range(l0, l1)), depth: depth - 1, path0: path,
        branchAfter: 1,
      });
      d.addScaledVector(cd, -0.22).normalize();
      shrink *= 0.93;
    }
  }
  const branch = m.add(o.part, pts);
  return { end: p, dir: d, path, r, branch };
}

// --------------------------------------------------------------- space colonisation

export interface ColonizeOpts {
  part: number;
  root: Vector3;
  path0: number;
  attractors: Vector3[];
  step: number;
  /** attractors closer than this to the tree are consumed */
  kill: number;
  rTip: number;
  rMax: number;
  /** pipe-model exponent: parent^e = sum(child^e) */
  pipe?: number;
  /** nodes grown before colonisation starts (e.g. a trunk), in order from the root */
  lead?: Vector3[];
  jitter?: number;
  /** put a bouton on every n-th node */
  boutonEvery?: number;
  boutonR?: number;
}

export function colonize(m: Morph, rng: Rng, o: ColonizeOpts): { nodes: Vector3[]; tips: Vector3[] } {
  const nodes: Vector3[] = [o.root.clone()];
  const parent: number[] = [-1];
  for (const p of o.lead ?? []) { parent.push(nodes.length - 1); nodes.push(p.clone()); }

  const att = o.attractors;
  const near = new Int32Array(att.length);
  const nearD = new Float32Array(att.length).fill(Infinity);
  const alive = new Uint8Array(att.length).fill(1);
  const update = (from: number) => {
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      for (let i = from; i < nodes.length; i++) {
        const dsq = att[a].distanceToSquared(nodes[i]);
        if (dsq < nearD[a]) { nearD[a] = dsq; near[a] = i; }
      }
      if (nearD[a] < o.kill * o.kill) alive[a] = 0;
    }
  };
  update(0);

  const acc = new Map<number, Vector3>();
  const jitter = o.jitter ?? 0.25;
  const childDirs = new Map<number, Vector3[]>();
  for (let iter = 0; iter < 600; iter++) {
    acc.clear();
    for (let a = 0; a < att.length; a++) {
      if (!alive[a]) continue;
      const i = near[a];
      let v = acc.get(i);
      if (!v) { v = new Vector3(); acc.set(i, v); }
      v.add(tmp.copy(att[a]).sub(nodes[i]).normalize());
    }
    if (!acc.size) break;
    const first = nodes.length;
    for (const [i, v] of acc) {
      if (v.lengthSq() < 1e-6) v.copy(rng.dir(tmp));
      v.normalize().addScaledVector(rng.dir(tmp), jitter).normalize();
      // do not sprout twice in (almost) the same direction from one node
      const dirs = childDirs.get(i) ?? [];
      if (dirs.some((dd) => dd.dot(v) > 0.93)) continue;
      dirs.push(v.clone());
      childDirs.set(i, dirs);
      parent.push(i);
      nodes.push(nodes[i].clone().addScaledVector(v, o.step));
    }
    if (nodes.length === first) {
      // stuck: drop the attractors that could not be reached
      let dropped = false;
      for (let a = 0; a < att.length; a++) {
        if (alive[a] && acc.has(near[a])) { alive[a] = 0; dropped = true; break; }
      }
      if (!dropped) break;
      continue;
    }
    update(first);
  }

  // radii by the pipe model, then emit one polyline per unbranched run
  const kids: number[][] = nodes.map(() => []);
  for (let i = 1; i < nodes.length; i++) kids[parent[i]].push(i);
  const e = o.pipe ?? 2.4;
  const rad = new Float32Array(nodes.length);
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (!kids[i].length) rad[i] = o.rTip;
    else {
      let s = 0;
      for (const k of kids[i]) s += Math.pow(rad[k], e);
      rad[i] = Math.min(o.rMax, Math.pow(s, 1 / e));
    }
  }
  const tips: Vector3[] = [];
  const sidePrefix = new Map<number, { x: number; y: number; z: number; r: number; path: number }>();
  const stack: { node: number; path: number }[] = [{ node: 0, path: o.path0 }];
  let count = 0;
  while (stack.length) {
    const start = stack.pop()!;
    let i = start.node;
    let path = start.path;
    const pts: number[] = [nodes[i].x, nodes[i].y, nodes[i].z, rad[i], path];
    for (;;) {
      const ks = kids[i];
      if (!ks.length) { tips.push(nodes[i]); break; }
      // continue along the thickest child, start new branches at the others
      let main = ks[0];
      for (const k of ks) if (rad[k] > rad[main]) main = k;
      for (const k of ks) {
        if (k === main) continue;
        const pk = path + nodes[k].distanceTo(nodes[i]);
        // a side branch starts on the parent node so that it is attached
        stack.push({ node: k, path: pk });
        sidePrefix.set(k, { x: nodes[i].x, y: nodes[i].y, z: nodes[i].z, r: Math.min(rad[i], rad[k] * 1.1), path });
      }
      path += nodes[main].distanceTo(nodes[i]);
      i = main;
      pts.push(nodes[i].x, nodes[i].y, nodes[i].z, rad[i], path);
      if (o.boutonEvery && ++count % o.boutonEvery === 0) {
        m.blobs.push({ part: PART.bouton, p: nodes[i].clone(), r: o.boutonR ?? 0.3, path });
      }
    }
    const pre = sidePrefix.get(start.node);
    if (pre) { pts.unshift(pre.x, pre.y, pre.z, pre.r, pre.path); sidePrefix.delete(start.node); }
    if (pts.length >= 2 * STRIDE) m.add(o.part, pts);
  }
  return { nodes, tips };
}

// ------------------------------------------------------------------------- helpers

/** smooth curved polyline from a to b */
function curve(rng: Rng, a: Vector3, b: Vector3, opts: { bow?: number; step?: number; aDir?: Vector3; bDir?: Vector3 } = {}): Vector3[] {
  const L = a.distanceTo(b);
  const step = opts.step ?? 2.5;
  const n = Math.max(3, Math.round(L / step));
  const along = b.clone().sub(a).normalize();
  const side = rng.dir().cross(along).normalize();
  const bow = (opts.bow ?? 0.18) * L;
  const c1 = a.clone().addScaledVector(opts.aDir ?? along, L * 0.33).addScaledVector(side, bow);
  const c2 = b.clone().addScaledVector(opts.bDir ?? along, -L * 0.33).addScaledVector(side, bow * rng.range(-0.4, 0.8));
  const w1 = rng.dir().cross(along).normalize();
  const ph1 = rng.range(0, 6.28), ph2 = rng.range(0, 6.28);
  const amp = Math.min(1.6, L * 0.035);
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const p = new Vector3()
      .addScaledVector(a, u * u * u).addScaledVector(c1, 3 * u * u * t)
      .addScaledVector(c2, 3 * u * t * t).addScaledVector(b, t * t * t);
    const env = Math.sin(Math.PI * t);
    p.addScaledVector(w1, env * amp * Math.sin(t * 9 + ph1)).addScaledVector(side, env * amp * 0.7 * Math.sin(t * 14 + ph2));
    out.push(p);
  }
  return out;
}

function polyline(m: Morph, part: number, pts: Vector3[], r0: number, r1: number, path0: number): { branch: number; cum: number[] } {
  const flat: number[] = [];
  const cum: number[] = [];
  let path = path0;
  for (let i = 0; i < pts.length; i++) {
    if (i) path += pts[i].distanceTo(pts[i - 1]);
    cum.push(path);
    flat.push(pts[i].x, pts[i].y, pts[i].z, r0 + ((r1 - r0) * i) / (pts.length - 1), path);
  }
  return { branch: m.add(part, flat), cum };
}

function trunkPoints(m: Morph): { p: Vector3; path: number }[] {
  if (m.trunk < 0) return [];
  const b = m.branches[m.trunk].pts;
  const out: { p: Vector3; path: number }[] = [];
  for (let i = 0; i < b.length; i += STRIDE) out.push({ p: new Vector3(b[i], b[i + 1], b[i + 2]), path: b[i + 4] });
  return out;
}

/** thicken the first stretch of the main axon into a cone: the axon hillock */
function hillock(m: Morph, somaR: number) {
  const b = m.branches[m.trunk].pts;
  for (let i = 0; i < b.length; i += STRIDE) b[i + 3] += 0.42 * somaR * Math.exp(-b[i + 4] / (0.9 * somaR));
  m.landmarks.hillock = new Vector3(b[STRIDE], b[STRIDE + 1], b[STRIDE + 2]);
}

/** wrap stretches of the main axon in myelin sleeves separated by nodes of Ranvier */
export function myelinate(m: Morph, from: number, to: number, seg = 9, gap = 1.3, keep?: (p: Vector3) => boolean) {
  const t = trunkPoints(m);
  if (t.length < 3) return;
  const at = (path: number) => {
    for (let i = 1; i < t.length; i++) {
      if (t[i].path >= path) {
        const k = (path - t[i - 1].path) / Math.max(t[i].path - t[i - 1].path, 1e-6);
        return t[i - 1].p.clone().lerp(t[i].p, k);
      }
    }
    return t[t.length - 1].p.clone();
  };
  const end = Math.min(to, t[t.length - 1].path - 1);
  let first = true;
  for (let s = from; s + seg * 0.5 < end; s += seg + gap) {
    const e = Math.min(s + seg, end);
    const pts: number[] = [];
    const n = Math.max(2, Math.round((e - s) / 2));
    const mid = at((s + e) / 2);
    if (keep && !keep(mid)) continue;
    for (let i = 0; i <= n; i++) {
      const path = s + ((e - s) * i) / n;
      const p = at(path);
      const cap = i === 0 || i === n ? 0.72 : 1;
      pts.push(p.x, p.y, p.z, 0.46 * cap, path);
    }
    m.branches.push({ part: PART.myelin, pts });
    if (first) {
      m.landmarks.myelin = mid;
      m.landmarks.node = at(e + gap / 2);
      first = false;
    }
  }
}

/**
 * Lay an axon collateral from the cell's main axon (or from `from`) to a target and remember the
 * whole way from the soma as a Route, so a spike can be animated along it.
 */
export function addRoute(m: Morph, rng: Rng, target: Target, opts: { r?: number; from?: { p: Vector3; path: number } } = {}): Route {
  const t = trunkPoints(m);
  let startIdx = -1;
  let start = opts.from ?? null;
  if (!start && t.length) {
    // leave the trunk where it passes closest to the target (but not right at the hillock)
    let best = Infinity;
    for (let i = Math.min(2, t.length - 1); i < t.length; i++) {
      const d = t[i].p.distanceTo(target.p) + t[i].path * 0.15;
      if (d < best) { best = d; startIdx = i; }
    }
    start = t[startIdx];
  }
  if (!start) start = { p: m.soma ? m.soma.p.clone() : target.p.clone(), path: 0 };

  let end = target.p.clone();
  const somaR = target.somaR ?? 1.5;
  if (target.zone === 'soma') {
    // stop at the surface of the target cell body
    const dir = start.p.clone().sub(target.p).normalize();
    end = target.p.clone().addScaledVector(dir, somaR * 1.12);
  }
  const r = opts.r ?? 0.13;
  const pts = curve(rng, start.p, end, { bow: target.zone === 'soma' ? 0.12 : 0.2 });
  const { cum } = polyline(m, PART.axon, pts, r, r * 0.9, start.path);

  const routePts: Vector3[] = [];
  const routeCum: number[] = [];
  if (startIdx >= 0) for (let i = 0; i < startIdx; i++) { routePts.push(t[i].p); routeCum.push(t[i].path); }
  else if (opts.from && t.length) {
    for (const q of t) { if (q.path < opts.from.path) { routePts.push(q.p); routeCum.push(q.path); } }
  }
  for (let i = 0; i < pts.length; i++) { routePts.push(pts[i]); routeCum.push(cum[i]); }
  const endPath = cum[cum.length - 1];

  if (target.zone === 'soma') {
    // the "basket": a few turns of axon around the cell body, studded with boutons
    const turns = 1.6, n = 26;
    const axis = new Vector3(rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3)).normalize();
    const u = end.clone().sub(target.p);
    u.addScaledVector(axis, -u.dot(axis)).normalize();
    const v = axis.clone().cross(u);
    const ring: Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, a = k * turns * Math.PI * 2;
      const h = (0.35 - k * 0.9) * somaR;
      const rr = Math.sqrt(Math.max(0.2, 1.25 * 1.25 - (h / somaR) * (h / somaR))) * somaR;
      ring.push(target.p.clone().addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr).addScaledVector(axis, h));
    }
    ring[0].copy(end);
    const { cum: rc } = polyline(m, PART.axon, ring, r, r * 0.8, endPath);
    for (let i = 3; i <= n; i += 4) m.blobs.push({ part: PART.bouton, p: ring[i], r: 0.3, path: rc[i] });
    m.landmarks.basket = ring[6].clone();
  } else if (target.zone === 'ais') {
    // chandelier "cartridge": a vertical row of boutons along the target's axon initial segment
    const row: Vector3[] = [];
    for (let i = 0; i <= 5; i++) row.push(end.clone().add(new Vector3(0.25 * Math.sin(i * 2.1), -i * 0.85, 0.25 * Math.cos(i * 2.1))));
    const { cum: rc } = polyline(m, PART.axon, row, r, r * 0.8, endPath);
    for (let i = 0; i <= 5; i++) m.blobs.push({ part: PART.bouton, p: row[i], r: 0.27, path: rc[i] });
    m.landmarks.cartridge = row[2].clone();
  } else {
    m.blobs.push({ part: PART.bouton, p: end.clone(), r: 0.36, path: endPath });
  }
  m.maxAxon = Math.max(m.maxAxon, endPath + 6);
  const route: Route = { pts: routePts, cum: routeCum, end, length: endPath };
  m.routes.push(route);
  return route;
}

/** scatter dendritic spines (specimens only) */
export function addSpines(m: Morph, rng: Rng, perUnit: number, minPath: number, maxR = 1) {
  const a = new Vector3(), b = new Vector3(), d = new Vector3();
  for (const br of m.branches) {
    if (br.part !== PART.dendrite) continue;
    for (let i = STRIDE; i < br.pts.length; i += STRIDE) {
      if (br.pts[i + 4] < minPath || br.pts[i + 3] > maxR) continue;
      a.set(br.pts[i - 5], br.pts[i - 4], br.pts[i - 3]);
      b.set(br.pts[i], br.pts[i + 1], br.pts[i + 2]);
      d.copy(b).sub(a);
      const len = d.length();
      d.normalize();
      const n = Math.floor(len * perUnit + rng.next());
      for (let k = 0; k < n; k++) {
        const nrm = rng.dir(tmp).cross(d).normalize();
        const p = a.clone().lerp(b, rng.next()).addScaledVector(nrm, br.pts[i + 3]);
        m.spines.push(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z);
      }
    }
  }
}

function decorativeCollaterals(m: Morph, rng: Rng, count: number, len: [number, number], minPath = 8) {
  const t = trunkPoints(m).filter((q) => q.path > minPath);
  if (!t.length) return;
  for (let i = 0; i < count; i++) {
    const q = t[Math.floor(((i + rng.range(0.2, 0.8)) / count) * t.length * 0.8)];
    const dir = new Vector3(rng.range(-1, 1), rng.range(-0.25, 0.3), rng.range(-0.7, 0.7)).normalize();
    const g = grow(m, rng, {
      part: PART.axon, from: q.p.clone(), dir, r0: 0.12, r1: 0.09, len: rng.range(len[0], len[1]), path0: q.path,
      step: 2.5, jitter: 0.22, branch: 0.05, depth: 1, angle: [0.5, 1.1],
    });
    m.blobs.push({ part: PART.bouton, p: g.end.clone(), r: 0.3, path: g.path });
    m.landmarks.terminals = g.end.clone();
  }
}

// ------------------------------------------------------------------------ cell kinds

export type MorphKind =
  | 'pyr23' | 'pyr5' | 'pyr6' | 'stellate' | 'basket' | 'martinotti' | 'chandelier' | 'thalamic'
  | 'astrocyte' | 'oligodendrocyte' | 'microglia' | 'purkinje' | 'granule' | 'msn' | 'dopaminergic';

export interface Env {
  /** y of the pial surface (dendrites stay below it) */
  piaY: number;
  /** y of the bottom of layer I */
  l1Y: number;
  /** y where descending axons stop (inside white matter) */
  axonEndY: number;
  /** y of the top of the white matter (axons are myelinated below this) */
  wmY: number;
  /** isolated specimen: add spines, myelin and other close-up detail */
  specimen?: boolean;
  /** a point on a capillary an astrocyte end-foot should reach */
  capillary?: Vector3[];
  /** how high a thalamic fibre climbs before it branches */
  riseTo?: number;
  /** axon stretches an oligodendrocyte should wrap */
  sheaths?: Vector3[][];
}

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

export const SOMA_R: Record<MorphKind, number> = {
  pyr23: 1.75, pyr5: 2.6, pyr6: 1.8, stellate: 1.35, basket: 1.6, martinotti: 1.45, chandelier: 1.35, thalamic: 0,
  astrocyte: 1.15, oligodendrocyte: 1.05, microglia: 0.8, purkinje: 2.4, granule: 0.48, msn: 1.15, dopaminergic: 1.9,
};

/** stage 1: soma and dendrites (or glial processes) */
export function growDendrites(kind: MorphKind, rng: Rng, at: Vector3, env: Env): Morph {
  const m = new Morph();
  const R = SOMA_R[kind];
  const D = PART.dendrite;
  if (kind !== 'thalamic') m.soma = { p: at.clone(), r: R, shape: 'sphere' };
  m.landmarks.soma = at.clone();

  if (kind === 'pyr23' || kind === 'pyr5' || kind === 'pyr6') {
    m.soma!.shape = 'pyramid';
    const big = kind === 'pyr5';
    const top = at.clone().addScaledVector(UP, R * 1.25);
    // layer VI cells stop short of the surface; the others reach layer I
    const reach = kind === 'pyr6' ? Math.min(env.l1Y - 55, at.y + 70) : env.l1Y - rng.range(2, 9);
    const trunkLen = Math.max(12, reach - top.y);
    const r0 = big ? 0.72 : 0.5;
    const trunk = grow(m, rng, {
      part: D, from: top, dir: UP, r0, r1: r0 * 0.5, len: trunkLen, path0: R, step: 2.5, jitter: 0.045, trop: UP, tropK: 0.12,
      branch: big ? 0.05 : 0.06, depth: 2, angle: [0.95, 1.4], branchAfter: 2,
      childLen: [Math.min(0.5, 14 / trunkLen), Math.min(0.7, 30 / trunkLen)],
      child: { jitter: 0.16, tropK: 0.015, r1: 0.11, branch: 0.035, childLen: [0.4, 0.7], angle: [0.5, 0.9] },
      yMax: env.piaY - 2,
    });
    // apical tuft, flattening out under the pia
    const nTuft = kind === 'pyr6' ? 2 : rng.int(3, 4);
    for (let i = 0; i < nTuft; i++) {
      const a = (i / nTuft) * Math.PI * 2 + rng.range(0, 1);
      const dir = new Vector3(Math.cos(a) * 0.9, 0.75, Math.sin(a) * 0.6).normalize();
      const g = grow(m, rng, {
        part: D, from: trunk.end.clone(), dir, r0: trunk.r * 0.85, r1: 0.1, len: rng.range(big ? 24 : 18, big ? 36 : 28),
        path0: trunk.path, step: 2.2, jitter: 0.17, trop: UP, tropK: 0.03, branch: 0.075, depth: 2, angle: [0.45, 0.9],
        childLen: [0.45, 0.8], yMax: env.piaY - 1.5,
      });
      if (i === 0) m.landmarks.tuft = g.end.clone().lerp(trunk.end, 0.4);
    }
    // basal skirt
    const nBasal = big ? 6 : 5;
    for (let i = 0; i < nBasal; i++) {
      const a = (i / nBasal) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dir = new Vector3(Math.cos(a), rng.range(-0.75, -0.1), Math.sin(a) * 0.85).normalize();
      const g = grow(m, rng, {
        part: D, from: at.clone().add(new Vector3(dir.x * R * 0.9, -R * 0.75, dir.z * R * 0.9)), dir, r0: big ? 0.46 : 0.36, r1: 0.11,
        len: rng.range(big ? 26 : 19, big ? 38 : 28), path0: R, step: 2.2, jitter: 0.15, branch: env.specimen ? 0.1 : 0.07,
        depth: env.specimen ? 3 : 2,
        angle: [0.4, 0.8], childLen: [0.5, 0.8], branchAfter: 2,
      });
      if (i === 1) m.landmarks.dendrites = g.end.clone().lerp(at, 0.45);
    }
    m.landmarks.spines = trunk.end.clone().lerp(top, 0.55);
    if (env.specimen) addSpines(m, rng, 2.2, R + 5, 0.6);
  } else if (kind === 'stellate' || kind === 'msn') {
    const n = kind === 'msn' ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const dir = rng.dir();
      if (i < 3) dir.y = Math.abs(dir.y) * (i === 0 ? 1 : -1);
      dir.z *= 0.8;
      dir.normalize();
      const g = grow(m, rng, {
        part: D, from: at.clone().addScaledVector(dir, R * 0.9), dir, r0: 0.34, r1: 0.11, len: rng.range(15, 23), path0: R,
        step: 1.8, jitter: 0.17, branch: kind === 'msn' ? 0.12 : 0.085, depth: 2, angle: [0.4, 0.85], childLen: [0.5, 0.85], branchAfter: 2,
      });
      if (i === 1) { m.landmarks.dendrites = g.end.clone().lerp(at, 0.3); m.landmarks.spines = g.end.clone().lerp(at, 0.65); }
    }
    if (env.specimen) addSpines(m, rng, kind === 'msn' ? 3.2 : 1.8, R + 3, 0.6);
  } else if (kind === 'basket' || kind === 'chandelier') {
    m.soma!.shape = 'ovoid';
    const n = kind === 'basket' ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const dir = rng.dir();
      dir.y = dir.y * 1.4 + (i % 2 ? 0.5 : -0.5);
      dir.z *= 0.8;
      dir.normalize();
      const g = grow(m, rng, {
        part: D, from: at.clone().addScaledVector(dir, R * 0.95), dir, r0: 0.32, r1: 0.11, len: rng.range(20, 32), path0: R,
        step: 2.2, jitter: 0.1, branch: 0.035, depth: 1, angle: [0.4, 0.8], childLen: [0.4, 0.7], branchAfter: 2,
      });
      if (i === 1) m.landmarks.dendrites = g.end.clone().lerp(at, 0.4);
    }
  } else if (kind === 'martinotti') {
    m.soma!.shape = 'ovoid';
    // bitufted: one tuft up, one tuft down
    for (let i = 0; i < 5; i++) {
      const up = i % 2 === 0;
      const dir = new Vector3(rng.range(-0.6, 0.6), up ? 1 : -1, rng.range(-0.5, 0.5)).normalize();
      const g = grow(m, rng, {
        part: D, from: at.clone().addScaledVector(dir, R), dir, r0: 0.3, r1: 0.11, len: rng.range(16, 26), path0: R, step: 2.2,
        jitter: 0.13, branch: 0.06, depth: 2, angle: [0.35, 0.75], childLen: [0.5, 0.8], branchAfter: 2,
      });
      if (i === 1) m.landmarks.dendrites = g.end.clone().lerp(at, 0.4);
    }
  } else if (kind === 'astrocyte') {
    const att: Vector3[] = [];
    const rad = env.specimen ? 12 : 10.5;
    const n = env.specimen ? 520 : 230;
    while (att.length < n) {
      const p = rng.ball();
      if (p.length() < 0.2) continue;
      p.multiply(new Vector3(1, 1.08, 0.92)).multiplyScalar(rad).add(at);
      att.push(p);
    }
    colonize(m, rng, {
      part: D, root: at.clone(), path0: 0, attractors: att, step: env.specimen ? 1.0 : 1.25, kill: env.specimen ? 1.1 : 1.45,
      rTip: 0.085, rMax: 0.42, pipe: 2.1, jitter: 0.4,
    });
    m.landmarks.process = at.clone().add(new Vector3(-rad * 0.6, rad * 0.45, 0));
    // end-feet on the nearest capillary
    const cap = env.capillary ?? [];
    const near = cap.map((p) => ({ p, d: p.distanceTo(at) })).filter((c) => c.d < 30).sort((a, b) => a.d - b.d);
    const feet = near.length ? [near[0], near[Math.min(near.length - 1, 5)]] : [];
    feet.forEach((f, i) => {
      if (i && f.p.distanceTo(feet[0].p) < 4) return;
      const dir = f.p.clone().sub(at).normalize();
      const pts = curve(rng, at.clone().addScaledVector(dir, R * 0.8), f.p, { bow: 0.1, step: 1.6 });
      const { cum } = polyline(m, D, pts, 0.36, 0.26, R);
      m.blobs.push({ part: D, p: f.p.clone(), r: 1.2, path: cum[cum.length - 1] });
      m.landmarks.endfoot = f.p.clone();
    });
  } else if (kind === 'microglia') {
    m.soma!.shape = 'ovoid';
    const n = 5;
    for (let i = 0; i < n; i++) {
      const dir = rng.dir();
      const g = grow(m, rng, {
        part: D, from: at.clone().addScaledVector(dir, R * 0.8), dir, r0: 0.22, r1: 0.07, len: rng.range(6.5, 9.5), path0: R,
        step: 0.9, jitter: 0.33, branch: 0.3, depth: 3, angle: [0.5, 1.2], childLen: [0.4, 0.7], branchAfter: 2,
      });
      if (i === 0) m.landmarks.process = g.end.clone();
    }
  } else if (kind === 'oligodendrocyte') {
    const sheaths = env.sheaths ?? [];
    sheaths.forEach((s, i) => {
      // the sleeve itself
      const flat: number[] = [];
      let path = 0;
      const mid = s[Math.floor(s.length / 2)];
      const reach = mid.distanceTo(at);
      for (let k = 0; k < s.length; k++) {
        if (k) path += s[k].distanceTo(s[k - 1]);
        const cap = k === 0 || k === s.length - 1 ? 0.72 : 1;
        flat.push(s[k].x, s[k].y, s[k].z, 0.5 * cap, reach + path);
      }
      m.branches.push({ part: PART.myelin, pts: flat });
      // the arm that reaches it
      const dir = mid.clone().sub(at).normalize();
      const pts = curve(rng, at.clone().addScaledVector(dir, R * 0.8), mid.clone().addScaledVector(dir, -0.45), { bow: 0.14, step: 1.6 });
      polyline(m, D, pts, 0.2, 0.13, R);
      if (i === 0) { m.landmarks.process = pts[Math.floor(pts.length / 2)].clone(); m.landmarks.sheath = mid.clone(); }
      if (i === 0) m.landmarks.node = s[s.length - 1].clone().add(s[s.length - 1].clone().sub(s[s.length - 2]).normalize().multiplyScalar(0.7));
    });
  } else if (kind === 'purkinje') {
    m.soma!.shape = 'flask';
    // attractors fill a flat, fan-shaped region above the soma
    const att: Vector3[] = [];
    while (att.length < 4400) {
      const x = rng.range(-27, 27), y = rng.range(3, 46);
      const th = Math.atan2(x, y - 1);
      const rho = Math.hypot(x, y - 1);
      const R1 = 44 * (0.62 + 0.38 * Math.cos(th * 0.95));
      if (Math.abs(th) > 1.42 || rho > R1 || rho < 4.5) continue;
      att.push(new Vector3(at.x + x, at.y + R + y, at.z + rng.range(-0.35, 0.35)));
    }
    const lead = [1.2, 2.6, 4].map((h) => new Vector3(at.x + rng.range(-0.2, 0.2), at.y + R * 1.15 + h, at.z));
    colonize(m, rng, {
      part: D, root: at.clone().addScaledVector(UP, R * 1.1), path0: R, attractors: att, lead, step: 0.7, kill: 0.78,
      rTip: 0.06, rMax: 1.05, pipe: 2.9, jitter: 0.1,
    });
    // keep the fan flat
    for (const b of m.branches) for (let i = 0; i < b.pts.length; i += STRIDE) b.pts[i + 2] = at.z + (b.pts[i + 2] - at.z) * 0.6;
    m.landmarks.dendrites = at.clone().add(new Vector3(-17, R + 24, 0));
    if (env.specimen) addSpines(m, rng, 1.0, 10, 0.12);
  } else if (kind === 'granule') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dir = new Vector3(Math.cos(a), rng.range(-0.75, -0.05), Math.sin(a)).normalize();
      const g = grow(m, rng, {
        part: D, from: at.clone().addScaledVector(dir, R * 0.9), dir, r0: 0.09, r1: 0.065, len: rng.range(1.8, 3), path0: R,
        step: 0.35, jitter: 0.14,
      });
      // the claw: three short fingers
      for (let f = 0; f < 3; f++) {
        const fd = deflect(g.dir, rng.range(0.7, 1.1), rng);
        grow(m, rng, { part: D, from: g.end.clone(), dir: fd, r0: 0.075, r1: 0.05, len: 0.55, path0: g.path, step: 0.14, jitter: 0.05, trop: g.dir, tropK: 0.3 });
      }
      if (i === 0) { m.landmarks.claw = g.end.clone(); }
      if (i === 2) m.landmarks.dendrites = g.end.clone().lerp(at, 0.5);
    }
  } else if (kind === 'dopaminergic') {
    m.soma!.shape = 'ovoid';
    for (let i = 0; i < 4; i++) {
      const dir = new Vector3(rng.range(-1, 1), i === 0 ? -1.2 : rng.range(-0.5, 0.4), rng.range(-0.6, 0.6)).normalize();
      if (i === 1) dir.x = -Math.abs(dir.x) - 0.5;
      dir.normalize();
      const g = grow(m, rng, {
        part: D, from: at.clone().addScaledVector(dir, R * 0.9), dir, r0: 0.5, r1: 0.14, len: rng.range(30, 46), path0: R, step: 2.4,
        jitter: 0.1, branch: 0.02, depth: 1, angle: [0.4, 0.8], childLen: [0.4, 0.7], branchAfter: 3,
      });
      if (i === 1) m.landmarks.dendrites = g.end.clone().lerp(at, 0.45);
    }
  }
  return m;
}

/** stage 2: the axon, including one collateral per synaptic target (m.routes follows `targets`) */
export function growAxon(m: Morph, kind: MorphKind, rng: Rng, targets: Target[], env: Env): void {
  const A = PART.axon;
  const at = m.soma?.p ?? new Vector3();
  const R = SOMA_R[kind];

  if (kind === 'pyr23' || kind === 'pyr5' || kind === 'pyr6') {
    const from = at.clone().addScaledVector(DOWN, R * 1.0);
    const len = Math.max(20, from.y - env.axonEndY - rng.range(0, 6));
    const g = grow(m, rng, {
      part: A, from, dir: DOWN, r0: 0.17, r1: 0.14, len, path0: R, step: 2.5, jitter: 0.05, trop: DOWN, tropK: 0.1,
    });
    m.trunk = g.branch;
    hillock(m, R);
    m.landmarks.axon = trunkPoints(m)[Math.min(7, Math.floor(len / 2.5) - 1)].p.clone();
    for (const t of targets) addRoute(m, rng, t);
    decorativeCollaterals(m, rng, env.specimen ? 4 : 2, env.specimen ? [14, 24] : [12, 26], env.specimen ? 20 : 10);
    if (env.specimen) {
      myelinate(m, R + 7, len - 4, 8.5, 1.3);
      const t = trunkPoints(m);
      const endFork = t[t.length - 1];
      for (let i = 0; i < 3; i++) {
        const dir = new Vector3(rng.range(-1, 1), -0.6, rng.range(-0.6, 0.6)).normalize();
        const tg = grow(m, rng, { part: A, from: endFork.p.clone(), dir, r0: 0.13, r1: 0.1, len: rng.range(5, 9), path0: endFork.path, step: 1.5, jitter: 0.2 });
        m.blobs.push({ part: PART.bouton, p: tg.end.clone(), r: 0.42, path: tg.path });
        m.landmarks.terminals = tg.end.clone();
      }
    } else {
      // deep stretches of the axon are myelinated on their way into the white matter
      myelinate(m, R + 10, len, 9, 1.3, (p) => p.y < env.wmY + 14);
    }
  } else if (kind === 'stellate' || kind === 'msn') {
    const from = at.clone().addScaledVector(DOWN, R * 0.95);
    const len = kind === 'msn' ? 38 : 14;
    const g = grow(m, rng, {
      part: A, from, dir: new Vector3(rng.range(-0.3, 0.3), -1, 0).normalize(), r0: 0.15, r1: 0.12, len, path0: R, step: 2,
      jitter: 0.1, trop: DOWN, tropK: 0.05,
    });
    m.trunk = g.branch;
    hillock(m, R);
    m.landmarks.axon = trunkPoints(m)[Math.min(4, Math.floor(len / 2) - 1)].p.clone();
    for (const t of targets) addRoute(m, rng, t);
    decorativeCollaterals(m, rng, kind === 'msn' ? 4 : env.specimen ? 4 : 1, [10, 20], 4);
  } else if (kind === 'basket' || kind === 'chandelier') {
    const dir = new Vector3(rng.range(-0.6, 0.6), rng.sign() * 0.8, rng.range(-0.3, 0.3)).normalize();
    const g = grow(m, rng, { part: A, from: at.clone().addScaledVector(dir, R), dir, r0: 0.16, r1: 0.13, len: 9, path0: R, step: 1.8, jitter: 0.1 });
    m.trunk = g.branch;
    hillock(m, R * 0.7);
    const tp = trunkPoints(m);
    const root = tp[tp.length - 1];
    m.landmarks.axon = root.p.clone();
    // dense local plexus
    const att: Vector3[] = [];
    const spread = kind === 'basket' ? new Vector3(30, 24, 15) : new Vector3(24, 16, 13);
    for (let i = 0; i < (kind === 'basket' ? 70 : 34); i++) att.push(rng.ball().multiply(spread).add(at));
    const before = m.blobs.length;
    colonize(m, rng, {
      part: A, root: root.p.clone(), path0: root.path, attractors: att, step: 2.6, kill: 3.4, rTip: 0.1, rMax: 0.14, pipe: 4,
      jitter: 0.3, boutonEvery: 6, boutonR: 0.26,
    });
    if (m.blobs.length > before) m.landmarks.terminals = m.blobs[m.blobs.length - 1].p.clone();
    for (const t of targets) addRoute(m, rng, t, { from: root });
  } else if (kind === 'martinotti') {
    const from = at.clone().addScaledVector(UP, R);
    const len = Math.max(10, env.l1Y + 6 - from.y);
    const g = grow(m, rng, {
      part: A, from, dir: UP, r0: 0.16, r1: 0.13, len, path0: R, step: 2.5, jitter: 0.07, trop: UP, tropK: 0.1, yMax: env.piaY - 3,
    });
    m.trunk = g.branch;
    hillock(m, R * 0.7);
    const tp = trunkPoints(m);
    const root = tp[tp.length - 1];
    m.landmarks.axon = tp[Math.floor(tp.length / 2)].p.clone();
    // fan out sideways inside layer I
    const att: Vector3[] = [];
    for (let i = 0; i < 46; i++) {
      att.push(new Vector3(root.p.x + rng.range(-36, 36), rng.range(env.l1Y + 2, env.piaY - 3), root.p.z + rng.range(-13, 13)));
    }
    colonize(m, rng, {
      part: A, root: root.p.clone(), path0: root.path, attractors: att, step: 2.6, kill: 3.6, rTip: 0.1, rMax: 0.14, pipe: 4,
      jitter: 0.25, boutonEvery: 5, boutonR: 0.26,
    });
    m.landmarks.terminals = root.p.clone().add(new Vector3(12, 3, 0));
    for (const t of targets) addRoute(m, rng, t, { from: root });
  } else if (kind === 'thalamic') {
    // no soma here: the fibre comes up out of the white matter and branches in layer IV
    const g = grow(m, rng, {
      part: A, from: at.clone(), dir: new Vector3(rng.range(-0.25, 0.25), 1, 0).normalize(), r0: 0.17, r1: 0.14,
      len: Math.max(20, (env.riseTo ?? env.l1Y) - at.y), path0: 0, step: 2.6, jitter: 0.06, trop: UP, tropK: 0.09,
    });
    m.trunk = g.branch;
    const tp = trunkPoints(m);
    const root = tp[tp.length - 1];
    const att: Vector3[] = [];
    for (let i = 0; i < 30; i++) att.push(rng.ball().multiply(new Vector3(20, 9, 12)).add(root.p).add(new Vector3(0, 4, 0)));
    colonize(m, rng, {
      part: A, root: root.p.clone(), path0: root.path, attractors: att, step: 2.6, kill: 3.6, rTip: 0.1, rMax: 0.14, pipe: 4,
      jitter: 0.3, boutonEvery: 5, boutonR: 0.26,
    });
    for (const t of targets) addRoute(m, rng, t, { from: root });
    myelinate(m, 2, root.path - 22, 9, 1.3);
  } else if (kind === 'purkinje') {
    const from = at.clone().addScaledVector(DOWN, R * 1.0);
    const g = grow(m, rng, { part: A, from, dir: DOWN, r0: 0.2, r1: 0.17, len: 34, path0: R, step: 2.2, jitter: 0.06, trop: DOWN, tropK: 0.1 });
    m.trunk = g.branch;
    hillock(m, R * 0.8);
    m.landmarks.axon = trunkPoints(m)[12].p.clone();
    myelinate(m, R + 6, 31, 7, 1.2);
    const t = trunkPoints(m);
    const q = t[6];
    const rc = grow(m, rng, {
      part: A, from: q.p.clone(), dir: new Vector3(0.9, 0.5, 0.1).normalize(), r0: 0.12, r1: 0.09, len: 18, path0: q.path, step: 2,
      jitter: 0.15, trop: UP, tropK: 0.06, branch: 0.06, depth: 1,
    });
    m.blobs.push({ part: PART.bouton, p: rc.end.clone(), r: 0.32, path: rc.path });
    const end = t[t.length - 1];
    for (let i = 0; i < 3; i++) {
      const dir = new Vector3(rng.range(-1, 1), -0.7, rng.range(-0.5, 0.5)).normalize();
      const tg = grow(m, rng, { part: A, from: end.p.clone(), dir, r0: 0.13, r1: 0.1, len: rng.range(4, 7), path0: end.path, step: 1.4, jitter: 0.2 });
      m.blobs.push({ part: PART.bouton, p: tg.end.clone(), r: 0.42, path: tg.path });
    }
  } else if (kind === 'granule') {
    const from = at.clone().addScaledVector(UP, R * 0.95);
    const g = grow(m, rng, { part: A, from, dir: UP, r0: 0.075, r1: 0.06, len: 8.5, path0: R, step: 1, jitter: 0.05, trop: UP, tropK: 0.12 });
    m.trunk = g.branch;
    m.landmarks.axon = trunkPoints(m)[5].p.clone();
    for (const s of [-1, 1]) {
      const pf = grow(m, rng, {
        part: A, from: g.end.clone(), dir: new Vector3(s, 0.05, 0), r0: 0.06, r1: 0.055, len: 10, path0: g.path, step: 1, jitter: 0.015,
        trop: new Vector3(s, 0, 0), tropK: 0.2,
      });
      for (let i = 1; i <= 3; i++) {
        const b = m.branches[pf.branch].pts;
        const k = Math.floor((b.length / STRIDE) * (i / 3.4)) * STRIDE;
        m.blobs.push({ part: PART.bouton, p: new Vector3(b[k], b[k + 1], b[k + 2]), r: 0.13, path: b[k + 4] });
      }
      if (s === 1) m.landmarks.parallel = pf.end.clone().lerp(g.end, 0.5);
    }
  } else if (kind === 'dopaminergic') {
    const dir = new Vector3(0.45, 1, 0).normalize();
    const g = grow(m, rng, {
      part: A, from: at.clone().addScaledVector(dir, R), dir, r0: 0.15, r1: 0.12, len: 46, path0: R, step: 2.4, jitter: 0.09,
      trop: new Vector3(0.2, 1, 0).normalize(), tropK: 0.06,
    });
    m.trunk = g.branch;
    hillock(m, R * 0.6);
    const tp = trunkPoints(m);
    m.landmarks.axon = tp[Math.floor(tp.length * 0.55)].p.clone();
    const c = g.end.clone().add(new Vector3(4, 34, 0));
    const att: Vector3[] = [];
    for (let i = 0; i < 2400; i++) att.push(rng.ball().multiply(new Vector3(52, 34, 20)).add(c));
    colonize(m, rng, {
      part: A, root: g.end.clone(), path0: g.path, attractors: att, step: 2.3, kill: 2.9, rTip: 0.085, rMax: 0.15, pipe: 3.4,
      jitter: 0.32, boutonEvery: 3, boutonR: 0.2,
    });
    m.landmarks.arbor = c.clone().add(new Vector3(-36, 16, 0));
  }
}
