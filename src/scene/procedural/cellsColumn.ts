/**
 * Layout of the cortical-column scene: where each cell sits, how the model circuit is wired
 * through real (drawn) axon collaterals, and the isolated specimens. Pure data — no meshes.
 * World units are 10 µm; +y points to the pial surface.
 */
import { Vector3 } from 'three';
import { LAYERS, type CellTypeId } from '../../content/cells';
import { canonicalCircuit, type CircuitSpec, type NeuronKind } from '../../sim/cellsCircuit';
import {
  growAxon, growDendrites, Morph, PART, Rng, SOMA_R, type Env, type MorphKind, type Route, type Target,
} from './cellsMorph';

export const SLAB = { w: 100, h: 250, d: 44 };
export const PIA_Y = SLAB.h / 2;
/** µm below the pia -> world y */
export const depthY = (um: number) => PIA_Y - um / 10;
/** spike conduction speed, world units per simulated millisecond */
export const SPIKE_SPEED = 14;

const layer = (id: string) => LAYERS.find((l) => l.id === id)!;
export const L1_Y = depthY(layer('L1').bottom);
export const WM_Y = depthY(layer('WM').top);

export interface ColumnCell {
  kind: MorphKind;
  typeId: CellTypeId | null;
  /** index into the circuit's neurons, or -1 */
  neuron: number;
  morph: Morph;
  /** where a glow should appear when the cell fires */
  glowAt: Vector3;
}

export interface Column {
  cells: ColumnCell[];
  /** circuit with delays taken from the drawn axon lengths */
  spec: CircuitSpec;
  /** for every synapse: the path a spike follows from the presynaptic soma */
  routes: Route[];
  /** which cell each circuit neuron is */
  cellOfNeuron: number[];
  capillary: Vector3[];
  /** passing axons in the white matter and the myelin sleeves not owned by a drawn oligodendrocyte */
  wmFibres: Vector3[][];
  wmSheaths: Vector3[][];
}

const KIND_TYPE: Record<NeuronKind, { kind: MorphKind; typeId: CellTypeId | null }> = {
  thalamic: { kind: 'thalamic', typeId: null },
  stellate: { kind: 'stellate', typeId: 'stellate' },
  pyr23: { kind: 'pyr23', typeId: 'pyramidal' },
  pyr5: { kind: 'pyr5', typeId: 'pyramidal' },
  pyr6: { kind: 'pyr6', typeId: 'pyramidal' },
  basket: { kind: 'basket', typeId: 'basket' },
  martinotti: { kind: 'martinotti', typeId: 'martinotti' },
  chandelier: { kind: 'chandelier', typeId: 'chandelier' },
};

/** soma positions (x, y, z) for the circuit neurons, by id */
const SOMA: Record<string, [number, number, number]> = {
  T0: [-24, -125, -9], T1: [3, -125, 7], T2: [27, -125, -3],
  S0: [-31, 23, 4], S1: [-10, 15, -9], S2: [11, 26, 8], S3: [32, 17, -5],
  A0: [-41, 84, -6], A1: [-28, 58, 9], A2: [-14, 76, -11], A3: [0, 50, 3], A4: [13, 88, 10], A5: [27, 61, -9], A6: [41, 79, 4],
  B0: [-36, -13, -8], B1: [-12, -27, 8], B2: [13, -10, -4], B3: [37, -23, 10],
  C0: [-23, -58, 5], C1: [24, -67, -7],
  K0: [0, 20, 14], K1: [6, 68, -3], K2: [1, -19, -13],
  M0: [-21, 46, -14], M1: [24, -3, 14],
  X0: [21, 97, -12],
};

const GLIA: { kind: MorphKind; typeId: CellTypeId; at: [number, number, number] }[] = [
  { kind: 'astrocyte', typeId: 'astrocyte', at: [-33, 77, 13] },
  { kind: 'astrocyte', typeId: 'astrocyte', at: [-2, 34, -15] },
  { kind: 'astrocyte', typeId: 'astrocyte', at: [34, 3, 2] },
  { kind: 'astrocyte', typeId: 'astrocyte', at: [-40, -44, 12] },
  { kind: 'astrocyte', typeId: 'astrocyte', at: [40, 44, 15] },
  { kind: 'oligodendrocyte', typeId: 'oligodendrocyte', at: [-24, -106, 2] },
  { kind: 'oligodendrocyte', typeId: 'oligodendrocyte', at: [22, -111, -4] },
  { kind: 'microglia', typeId: 'microglia', at: [-42, 31, -13] },
  { kind: 'microglia', typeId: 'microglia', at: [43, 33, -14] },
  { kind: 'microglia', typeId: 'microglia', at: [-4, -44, -15] },
  { kind: 'microglia', typeId: 'microglia', at: [42, -72, 9] },
];

/** Catmull-Rom through control points, sampled evenly */
function spline(ctrl: Vector3[], n: number): Vector3[] {
  const out: Vector3[] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let s = 0; s <= n; s++) {
    const u = (s / n) * (ctrl.length - 1);
    const i = Math.min(Math.floor(u), ctrl.length - 2), t = u - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t2 = t * t, t3 = t2 * t;
    out.push(new Vector3()
      .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
      .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
      .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
      .addScaledVector(p3, 0.5 * t3 - 0.5 * t2));
  }
  return out;
}

export function capillaryPath(): Vector3[] {
  return spline([
    new Vector3(-56, 70, 6), new Vector3(-38, 68, 6), new Vector3(-18, 52, -6), new Vector3(4, 33, -8),
    new Vector3(22, 12, -2), new Vector3(40, 0, -4), new Vector3(56, -6, -8),
  ], 90);
}

/** horizontal myelinated fibres in the white matter, each cut into sleeves with nodes between */
function whiteMatter(rng: Rng): { fibres: Vector3[][]; sheaths: Vector3[][] } {
  const fibres: Vector3[][] = [];
  const sheaths: Vector3[][] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const y = -SLAB.h / 2 + 2.5 + (i % 6) * 4.6 + rng.range(-1, 1);
    const z = -SLAB.d / 2 + 4 + ((i * 5) % n) * ((SLAB.d - 8) / (n - 1));
    const ph = rng.range(0, 6);
    const pts: Vector3[] = [];
    for (let x = -SLAB.w / 2 - 4; x <= SLAB.w / 2 + 4; x += 1.5) {
      pts.push(new Vector3(x, y + 1.3 * Math.sin(x * 0.07 + ph), z + 1.1 * Math.sin(x * 0.05 + ph * 2)));
    }
    fibres.push(pts);
    let k = Math.floor(rng.range(0, 4));
    while (k + 7 < pts.length) {
      const len = Math.floor(rng.range(7, 10));
      sheaths.push(pts.slice(k, Math.min(pts.length, k + len)));
      k += len + 1;
    }
  }
  return { fibres, sheaths };
}

export function buildColumn(seed = 11): Column {
  const base = canonicalCircuit();
  const env: Env = { piaY: PIA_Y, l1Y: L1_Y, axonEndY: -SLAB.h / 2 + 4, wmY: WM_Y, riseTo: depthY(layer('L4').bottom) + 6 };
  const capillary = capillaryPath();
  const wmRng = new Rng(seed * 31 + 5);
  const wm = whiteMatter(wmRng);

  const cells: ColumnCell[] = [];
  const rngs: Rng[] = [];
  const cellOfNeuron: number[] = [];

  // stage 1: bodies and dendrites, so that axons have something to aim at
  base.neurons.forEach((n, i) => {
    const { kind, typeId } = KIND_TYPE[n.kind];
    const at = new Vector3(...SOMA[n.id]);
    const rng = new Rng(seed * 1000 + i * 77 + 3);
    rngs.push(rng);
    cellOfNeuron.push(cells.length);
    cells.push({ kind, typeId, neuron: i, morph: growDendrites(kind, rng, at, env), glowAt: at.clone() });
  });

  // stage 2: every synapse of the model becomes a drawn collateral ending on its target
  const dendPts = cells.map((c) => c.morph.points(PART.dendrite));
  const routes: Route[] = new Array(base.synapses.length);
  base.neurons.forEach((n, i) => {
    const cell = cells[i];
    const rng = rngs[i];
    const from = cell.kind === 'thalamic' ? new Vector3(SOMA[n.id][0], env.riseTo!, SOMA[n.id][2]) : cell.morph.soma!.p;
    const syns: number[] = [];
    const targets: Target[] = [];
    base.synapses.forEach((s, si) => {
      if (s.pre !== i) return;
      const post = cells[cellOfNeuron[s.post]];
      const soma = post.morph.soma!;
      let p: Vector3;
      if (s.zone === 'soma') p = soma.p.clone();
      else if (s.zone === 'ais') p = soma.p.clone().add(new Vector3(0.5, -soma.r * 1.25 - 1.2, 0));
      else {
        const pts = dendPts[cellOfNeuron[s.post]];
        let cand = s.zone === 'tuft'
          ? pts.filter((q) => q.p.y > env.l1Y - 2)
          : pts.filter((q) => q.path > soma.r + 5 && q.path < 42 && q.r < 0.45);
        if (!cand.length) cand = pts;
        cand = cand.slice().sort((a, b) => a.p.distanceTo(from) - b.p.distanceTo(from)).slice(0, s.zone === 'tuft' ? 12 : 7);
        const q = rng.pick(cand);
        // the bouton sits on the surface of the dendrite
        p = q.p.clone().add(rng.dir().multiplyScalar(q.r + 0.3));
      }
      syns.push(si);
      targets.push({ p, zone: s.zone, somaR: soma.r });
    });
    growAxon(cell.morph, cell.kind, rng, targets, env);
    syns.forEach((si, k) => { routes[si] = cell.morph.routes[k]; });
  });

  const spec: CircuitSpec = {
    neurons: base.neurons,
    synapses: base.synapses.map((s, si) => ({ ...s, delay: Math.max(0.8, routes[si].length / SPIKE_SPEED) })),
  };

  // glia
  const sheathTaken = new Set<number>();
  GLIA.forEach((g, i) => {
    const at = new Vector3(...g.at);
    const rng = new Rng(seed * 500 + i * 131 + 17);
    const genv: Env = { ...env, capillary };
    if (g.kind === 'oligodendrocyte') {
      const near = wm.sheaths
        .map((s, k) => ({ k, d: s[Math.floor(s.length / 2)].distanceTo(at) }))
        .filter((s) => !sheathTaken.has(s.k) && s.d < 24 && s.d > 3)
        .sort((a, b) => a.d - b.d)
        .slice(0, 8);
      near.forEach((s) => sheathTaken.add(s.k));
      genv.sheaths = near.map((s) => wm.sheaths[s.k]);
    }
    cells.push({ kind: g.kind, typeId: g.typeId, neuron: -1, morph: growDendrites(g.kind, rng, at, genv), glowAt: at });
  });

  return {
    cells, spec, routes, cellOfNeuron, capillary,
    wmFibres: wm.fibres, wmSheaths: wm.sheaths.filter((_, k) => !sheathTaken.has(k)),
  };
}

// ----------------------------------------------------------------------------- specimens

export interface Ghost {
  kind: 'soma' | 'tube';
  /** soma: centre and radius; tube: polyline and radius */
  p?: Vector3;
  r: number;
  pts?: Vector3[];
  color: string;
}

export interface Specimen {
  typeId: CellTypeId;
  kind: MorphKind;
  morph: Morph;
  /** neighbouring structures drawn faintly for context (a target cell body, a capillary, axons) */
  ghosts: Ghost[];
}

const SPECIMEN_KIND: Record<CellTypeId, MorphKind> = {
  pyramidal: 'pyr23', stellate: 'stellate', basket: 'basket', martinotti: 'martinotti', chandelier: 'chandelier',
  astrocyte: 'astrocyte', oligodendrocyte: 'oligodendrocyte', microglia: 'microglia',
  purkinje: 'purkinje', granule: 'granule', msn: 'msn', dopaminergic: 'dopaminergic',
};

export function buildSpecimen(typeId: CellTypeId, seed = 5): Specimen {
  const kind = SPECIMEN_KIND[typeId];
  const rng = new Rng(seed * 97 + typeId.length * 13 + typeId.charCodeAt(0));
  const at = new Vector3(0, 0, 0);
  const env: Env = { piaY: 50, l1Y: 40, axonEndY: -40, wmY: -200, specimen: true };
  const ghosts: Ghost[] = [];
  const targets: Target[] = [];
  const pyrR = SOMA_R.pyr23;

  if (typeId === 'martinotti') { env.piaY = 48; env.l1Y = 36; }
  if (typeId === 'astrocyte') {
    const cap = [new Vector3(15, -16, -3), new Vector3(16.5, -5, -1), new Vector3(15.5, 6, 2), new Vector3(17, 17, 3)];
    const pts = spline(cap, 30);
    env.capillary = pts.slice(6, 22);
    ghosts.push({ kind: 'tube', pts, r: 1.15, color: '#b8454f' });
  }
  if (typeId === 'oligodendrocyte') {
    env.sheaths = [];
    const lanes: [number, number][] = [[-9, 3], [-5, -4], [6, 4], [9, -3], [1, 7]];
    lanes.forEach(([x, z], i) => {
      const pts: Vector3[] = [];
      for (let y = -24; y <= 24; y += 1.5) pts.push(new Vector3(x + 0.8 * Math.sin(y * 0.12 + i), y, z + 0.6 * Math.cos(y * 0.1 + i)));
      ghosts.push({ kind: 'tube', pts, r: 0.2, color: '#8f96a8' });
      const a = 4 + ((i * 5) % 9);
      env.sheaths!.push(pts.slice(a, a + 10));
      if (i % 2 === 0) env.sheaths!.push(pts.slice(a + 11, a + 20));
    });
  }
  if (typeId === 'basket') {
    for (const p of [new Vector3(17, 5, 2), new Vector3(-15, -9, -3), new Vector3(4, -19, 5)]) {
      ghosts.push({ kind: 'soma', p, r: pyrR, color: '#8d7a5c' });
      targets.push({ p, zone: 'soma', somaR: pyrR });
    }
  }
  if (typeId === 'chandelier') {
    for (const p of [new Vector3(13, -6, 2), new Vector3(-11, -10, -2), new Vector3(2, -17, 4)]) {
      ghosts.push({ kind: 'soma', p, r: pyrR, color: '#8d7a5c' });
      const ais = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => p.clone().add(new Vector3(0, -pyrR - i * 1.4, 0)));
      ghosts.push({ kind: 'tube', pts: ais, r: 0.22, color: '#8d7a5c' });
      targets.push({ p: p.clone().add(new Vector3(0.5, -pyrR * 1.25 - 1.2, 0)), zone: 'ais', somaR: pyrR });
    }
  }

  const morph = growDendrites(kind, rng, at, env);
  growAxon(morph, kind, rng, targets, env);
  return { typeId, kind, morph, ghosts };
}
