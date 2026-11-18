/**
 * Where the systems run. Everything is authored in MNI millimetres (x right, y anterior, z superior)
 * for the LEFT hemisphere (x < 0) and mirrored to the right where `mirror` is set.
 * Positions are approximate textbook locations, tuned by eye against the atlas meshes.
 */

export type P3 = [number, number, number];

export interface NucleusSpec {
  /** matches SystemNucleus.id in content */
  id: string;
  at: P3;
  /** radius, cm */
  r: number;
  mirror?: boolean;
}

/** where the fibres of a fan end */
export type TargetSpec =
  | { pts: P3[] }
  | {
      /** mesh name prefixes of the left hemisphere, e.g. 'ctx-lh-' or 'sub-lh-putamen' */
      mesh: string[];
      n: number;
      /** cortex: pull the end point this many cm below the surface */
      inset?: number;
      /** deep structures: pull the end point this fraction toward the structure's centre */
      shrink?: number;
      filter?: (p: P3) => boolean;
    };

/** many fine fibres leaving one nucleus along shared "highways" and peeling off toward their targets */
export interface FanSpec {
  kind: 'fan';
  from: P3;
  /** candidate highways (not including `from`) */
  routes: P3[][];
  targets: TargetSpec;
  /** 'best': leave the highway where it is closest to the target; 'end': follow it to its end */
  exit?: 'best' | 'end';
  radius?: number;
  jitter?: number;
  mirror?: boolean;
}

/** one thick, directional tube of a functional pathway; lights up with station `step` */
export interface SegSpec {
  kind: 'seg';
  step: number;
  pts: P3[];
  radius?: number;
  mirror?: boolean;
}

export interface StationSpec {
  /** 1-based, index into the content steps */
  n: number;
  at: P3;
  mirror?: boolean;
  /** label nudge in px */
  dx?: number;
  dy?: number;
}

export interface TagSpec {
  at: P3;
  /** a SystemNucleus.id or SystemRoute.id; the tag shows its name (and role) */
  ref: string;
  dx?: number;
  dy?: number;
}

export interface SystemAnatomy {
  nuclei: NucleusSpec[];
  tracts: (FanSpec | SegSpec)[];
  stations: StationSpec[];
  tags: TagSpec[];
  /** camera for this system, scene centimetres */
  view: { position: P3; target: P3 };
  /** extra glassy spheres (the eyes), MNI centre + radius in cm */
  orbs?: { at: P3; r: number; mirror?: boolean }[];
}

// ---------------------------------------------------------------- shared white-matter routes
/** medial forebrain bundle: brainstem → lateral hypothalamus → basal forebrain */
const MFB: P3[] = [[-6, -8, -11], [-7, 5, -9]];
/** around the front of the corpus callosum and back along the cingulum */
const CINGULUM: P3[] = [[-6, 22, -5], [-6, 37, 5], [-7, 35, 21], [-8, 16, 33], [-8, -10, 38], [-8, -36, 36], [-10, -58, 26], [-12, -76, 14]];
/** into the frontal white matter */
const FRONTAL: P3[] = [[-15, 24, -5], [-23, 42, 2]];
/** external capsule, then back through the lateral white matter */
const EXTERNAL: P3[] = [[-27, 8, -2], [-32, -6, 13], [-33, -26, 25], [-31, -48, 29]];
/** sideways past the amygdala into the temporal lobe and on to the occipital lobe */
const TEMPORAL: P3[] = [[-20, -5, -13], [-32, -12, -15], [-38, -32, -9], [-35, -54, -4], [-27, -74, -1]];

/** the highways a brainstem / hypothalamic nucleus uses to reach the whole forebrain */
function ascending(prefix: P3[]): P3[][] {
  return [
    [...prefix, ...MFB, ...CINGULUM],
    [...prefix, ...MFB, ...FRONTAL],
    [...prefix, ...MFB, ...EXTERNAL],
    [...prefix, MFB[0], ...TEMPORAL],
  ];
}
const CORTEX = (n: number, filter?: (p: P3) => boolean): TargetSpec => ({ mesh: ['ctx-lh-'], n, inset: 0.3, filter });
const DEEP = (name: string, n: number, shrink = 0.4): TargetSpec => ({ mesh: [`sub-lh-${name}`], n, shrink });
const CEREBELLUM = (n: number): TargetSpec => ({ mesh: ['cb-lh'], n, shrink: 0.3 });

const LATERAL: SystemAnatomy['view'] = { position: [41, 9, 13], target: [0, 0.6, -1.5] };

function diffuse(opts: {
  nucleus: P3; prefix: P3[]; cortex: number; deep: [string, number][]; cerebellumFrom?: P3; cerebellum?: number;
  spinalFrom?: P3; fibre?: number;
}): FanSpec[] {
  const routes = ascending(opts.prefix);
  const fans: FanSpec[] = [
    { kind: 'fan', from: opts.nucleus, routes, targets: CORTEX(opts.cortex), mirror: true, radius: opts.fibre },
    ...opts.deep.map(([name, n]): FanSpec => ({
      kind: 'fan', from: opts.nucleus, routes, targets: DEEP(name, n), mirror: true, radius: opts.fibre,
    })),
  ];
  if (opts.cerebellum) {
    const from = opts.cerebellumFrom ?? opts.nucleus;
    fans.push({
      kind: 'fan', from, routes: [[[-7, -46, -30], [-16, -56, -34]]], targets: CEREBELLUM(opts.cerebellum), mirror: true,
      radius: opts.fibre,
    });
  }
  if (opts.spinalFrom) {
    fans.push({
      kind: 'fan', from: opts.spinalFrom, routes: [[[-2, -40, -50], [-2.5, -44, -64]]], exit: 'end', jitter: 0.12,
      targets: { pts: [[-2, -46, -75], [-4, -46, -74], [-3, -47, -76]] }, mirror: true, radius: opts.fibre,
    });
  }
  return fans;
}

const VTA: P3 = [-4, -16, -14];
const SNC: P3 = [-10, -18, -12];
const DR: P3 = [-1, -28, -10];
const MR: P3 = [-1, -32, -22];
const CR: P3 = [-1, -37, -44];
const LC: P3 = [-5, -37, -26];
const NBM: P3 = [-18, -2, -10];
const SEPTUM: P3 = [-2, 6, -3];
const PPT: P3 = [-7, -32, -18];
const TMN: P3 = [-6, -8, -14];

// thalamic relays and other landmarks
const LGN: P3 = [-23, -25, -5];
const MGN: P3 = [-16, -26, -6];
const VPL: P3 = [-17, -20, 5];
const VL: P3 = [-13, -12, 6];
const ANT: P3 = [-6, -6, 10];
const CHIASM: P3 = [-3.5, 3, -16];
const EYE: P3 = [-32, 56, -38];
const V1: P3 = [-10, -84, 5];
const IC: P3 = [-6, -35, -10];
const CN: P3 = [-10, -38, -40];
const A1: P3 = [-44, -22, 8];
const WERNICKE: P3 = [-56, -44, 16];
const BROCA: P3 = [-46, 15, 12];
const PREMOTOR: P3 = [-33, 8, 48];
const M1: P3 = [-34, -20, 54];
const CAPSULE: P3 = [-22, -14, 8];
const PUTAMEN: P3 = [-26, 2, 4];
const PALLIDUM: P3 = [-20, -3, -2];
const S1: P3 = [-38, -30, 52];
const ENTO: P3 = [-24, -8, -34];
const HIPPO: P3 = [-26, -24, -14];
const MAMM: P3 = [-4, -8, -14];
const CINGULATE: P3 = [-7, -14, 38];
const AMYG: P3 = [-24, -6, -20];
const HYPO: P3 = [-5, -2, -10];
const VMPFC: P3 = [-6, 40, -14];
const flip = (p: P3): P3 => [-p[0], p[1], p[2]];

export const ANATOMY: Record<string, SystemAnatomy> = {
  // ------------------------------------------------------------------ chemical
  dopamine: {
    nuclei: [
      { id: 'vta', at: VTA, r: 0.2, mirror: true },
      { id: 'snc', at: SNC, r: 0.24, mirror: true },
    ],
    tracts: [
      // nigrostriatal: up and forward into the striatum
      { kind: 'fan', from: SNC, routes: [[[-14, -12, -7], [-20, -6, -2]]], exit: 'end', targets: DEEP('putamen', 15, 0.3), mirror: true, radius: 0.036, jitter: 0.16 },
      { kind: 'fan', from: SNC, routes: [[[-13, -11, -5], [-15, -3, 4]]], exit: 'end', targets: DEEP('caudate', 9, 0.3), mirror: true, radius: 0.036, jitter: 0.14 },
      // mesolimbic: along the medial forebrain bundle to the ventral striatum, amygdala, hippocampus
      { kind: 'fan', from: VTA, routes: [[[-6, -8, -11], [-8, 3, -9]]], exit: 'end', targets: DEEP('accumbens', 9, 0.3), mirror: true, radius: 0.036, jitter: 0.1 },
      { kind: 'fan', from: VTA, routes: [[[-9, -10, -13], [-17, -7, -16]]], exit: 'end', targets: DEEP('amygdala', 3), mirror: true, radius: 0.03, jitter: 0.08 },
      { kind: 'fan', from: VTA, routes: [[[-9, -10, -13], [-18, -12, -17]]], exit: 'end', targets: DEEP('hippocampus', 2), mirror: true, radius: 0.03, jitter: 0.08 },
      // mesocortical: on to the prefrontal cortex and anterior cingulate
      {
        kind: 'fan', from: VTA, mirror: true, radius: 0.034, jitter: 0.14,
        routes: [
          [...MFB, [-9, 20, -6], [-13, 36, 0], [-18, 48, 6]],
          [...MFB, ...CINGULUM.slice(0, 4)],
          [...MFB, [-14, 16, 2], [-22, 26, 16], [-28, 30, 28]],
        ],
        targets: CORTEX(40, (p) => p[1] > 14 || (p[1] > -4 && p[0] > -14 && p[2] > 18)),
      },
    ],
    stations: [],
    tags: [
      { at: SNC, ref: 'snc', dx: 120, dy: 4 },
      { at: VTA, ref: 'vta', dx: 80, dy: 46 },
      { at: [-27, 2, 10], ref: 'nigrostriatal', dy: -8 },
      { at: [-9, 10, -9], ref: 'mesolimbic', dx: -70, dy: 56 },
      { at: [-26, 52, 10], ref: 'mesocortical', dy: -10 },
    ],
    view: { position: [31, 5, 23], target: [0.4, 0.3, 0.6] },
  },
  serotonin: {
    nuclei: [
      { id: 'dorsalraphe', at: [0, -28, -10], r: 0.24 },
      { id: 'medianraphe', at: [0, -32, -22], r: 0.2 },
      { id: 'caudalraphe', at: [0, -37, -44], r: 0.17 },
    ],
    tracts: diffuse({
      nucleus: DR, prefix: [[-3, -18, -13]], cortex: 46,
      deep: [['thalamus', 3], ['hippocampus', 3], ['amygdala', 2], ['putamen', 2], ['caudate', 2]],
      cerebellumFrom: MR, cerebellum: 8, spinalFrom: CR,
    }),
    stations: [],
    tags: [
      { at: [0, -28, -10], ref: 'dorsalraphe', dx: -64, dy: 4 },
      { at: [0, -37, -44], ref: 'caudalraphe', dx: 70, dy: 20 },
    ],
    view: LATERAL,
  },
  noradrenaline: {
    nuclei: [{ id: 'lc', at: LC, r: 0.17, mirror: true }],
    tracts: diffuse({
      nucleus: LC, prefix: [[-5, -28, -13], [-4, -18, -13]], cortex: 46,
      deep: [['thalamus', 4], ['hippocampus', 3], ['amygdala', 2]],
      cerebellum: 9, spinalFrom: LC,
    }),
    stations: [],
    tags: [{ at: LC, ref: 'lc', dx: -60, dy: 10 }],
    view: LATERAL,
  },
  acetylcholine: {
    nuclei: [
      { id: 'nbm', at: NBM, r: 0.22, mirror: true },
      { id: 'septum', at: [0, 6, -3], r: 0.17 },
      { id: 'ppt', at: PPT, r: 0.18, mirror: true },
    ],
    tracts: [
      {
        kind: 'fan', from: NBM, mirror: true,
        routes: [
          [[-11, 12, -6], ...CINGULUM],
          [[-20, 22, -3], [-25, 42, 3]],
          [[-27, 4, -2], ...EXTERNAL.slice(1)],
          [[-28, -8, -16], ...TEMPORAL.slice(2)],
        ],
        targets: CORTEX(46),
      },
      { kind: 'fan', from: NBM, routes: [[[-21, -4, -15]]], exit: 'end', targets: DEEP('amygdala', 3), mirror: true },
      // septohippocampal fibres travel in the fornix
      {
        kind: 'fan', from: SEPTUM, exit: 'end', mirror: true, jitter: 0.07, radius: 0.034,
        routes: [[[-2, 0, 12], [-3, -16, 21], [-10, -32, 19], [-22, -40, 8], [-28, -36, -4]]],
        targets: DEEP('hippocampus', 7, 0.35),
      },
      { kind: 'fan', from: PPT, routes: [[[-8, -26, -8]]], exit: 'end', targets: DEEP('thalamus', 8, 0.3), mirror: true, radius: 0.034 },
    ],
    stations: [],
    tags: [
      { at: NBM, ref: 'nbm', dx: -50, dy: 62 },
      { at: [0, 6, -3], ref: 'septum', dx: -90, dy: -44 },
      { at: PPT, ref: 'ppt', dx: 110, dy: 54 },
    ],
    view: { position: [39, 9, 17], target: [0, 0.6, -1.3] },
  },
  histamine: {
    nuclei: [{ id: 'tmn', at: TMN, r: 0.19, mirror: true }],
    tracts: [
      { kind: 'fan', from: TMN, routes: [[MFB[1], ...CINGULUM], [MFB[1], ...FRONTAL], [MFB[1], ...EXTERNAL], TEMPORAL], targets: CORTEX(38), mirror: true },
      { kind: 'fan', from: TMN, routes: [[[-8, -12, -4]]], exit: 'end', targets: DEEP('thalamus', 5, 0.3), mirror: true },
      { kind: 'fan', from: TMN, routes: [[[-12, -9, -15]]], targets: DEEP('hippocampus', 3), mirror: true },
      {
        kind: 'fan', from: TMN, routes: [[[-4, -20, -14], [-3, -32, -30], [-2.5, -40, -52]]], exit: 'end', jitter: 0.12, mirror: true,
        targets: { pts: [[-2, -45, -70], [-4, -45, -68], [-3, -42, -60]] },
      },
    ],
    stations: [],
    tags: [{ at: TMN, ref: 'tmn', dx: -40, dy: 30 }],
    view: LATERAL,
  },
  fast: { nuclei: [], tracts: [], stations: [], tags: [], view: { position: [34, 10, 28], target: [0, 0.4, -1.4] } },

  // ------------------------------------------------------------------ pathways
  vision: {
    nuclei: [],
    tracts: [
      { kind: 'seg', step: 2, pts: [EYE, [-29, 44, -35], [-15, 22, -24], CHIASM], mirror: true },
      // uncrossed (outer retina) and crossed (nose-side retina) fibres of the optic tract
      { kind: 'seg', step: 3, pts: [CHIASM, [-10, -7, -12], [-18, -18, -8], LGN], mirror: true },
      { kind: 'seg', step: 3, pts: [CHIASM, [0, 1, -16.5], [4.5, -1, -15.5], [10, -7, -12], [18, -18, -8], flip(LGN)], mirror: true, radius: 0.07 },
      // optic radiation, with Meyer's loop swinging through the temporal lobe
      { kind: 'seg', step: 4, pts: [LGN, [-31, -38, 1], [-30, -58, 5], [-20, -77, 7], V1], mirror: true },
      { kind: 'seg', step: 4, pts: [LGN, [-31, -19, -11], [-36, -34, -9], [-30, -62, -3], [-15, -80, 0], V1], mirror: true, radius: 0.06 },
      { kind: 'seg', step: 5, pts: [V1, [-16, -87, 19], [-22, -78, 36], [-24, -64, 48]], mirror: true },
      { kind: 'seg', step: 6, pts: [V1, [-20, -81, -8], [-32, -62, -14], [-42, -44, -20]], mirror: true },
    ],
    stations: [
      { n: 1, at: EYE, mirror: true },
      { n: 2, at: [0, 3, -16], dy: 30 },
      { n: 3, at: LGN, mirror: true },
      { n: 4, at: V1, mirror: true, dy: 8 },
      { n: 5, at: [-24, -64, 48], mirror: true },
      { n: 6, at: [-42, -44, -20], mirror: true, dy: 30 },
    ],
    tags: [],
    orbs: [{ at: EYE, r: 1.15, mirror: true }],
    view: { position: [37, 17, 19], target: [0.6, -0.4, -0.8] },
  },
  movement: {
    nuclei: [],
    tracts: [
      { kind: 'seg', step: 1, pts: [[-33, 43, 20], [-35, 27, 36], PREMOTOR], mirror: true },
      // basal ganglia loop
      { kind: 'seg', step: 2, pts: [PREMOTOR, [-31, 6, 26], PUTAMEN], mirror: true, radius: 0.065 },
      { kind: 'seg', step: 2, pts: [PUTAMEN, PALLIDUM, VL], mirror: true, radius: 0.065 },
      { kind: 'seg', step: 2, pts: [VL, [-20, -14, 28], [-30, -18, 46], M1], mirror: true, radius: 0.065 },
      { kind: 'seg', step: 3, pts: [PREMOTOR, [-35, -6, 54], M1], mirror: true },
      // corona radiata: the body map converges on the internal capsule
      { kind: 'seg', step: 4, pts: [M1, [-29, -18, 34], CAPSULE], mirror: true },
      { kind: 'seg', step: 4, pts: [[-52, -8, 30], [-36, -12, 22], CAPSULE], mirror: true, radius: 0.055 },
      { kind: 'seg', step: 4, pts: [[-8, -30, 66], [-18, -22, 40], CAPSULE], mirror: true, radius: 0.055 },
      { kind: 'seg', step: 5, pts: [CAPSULE, [-14, -18, -13], [-7, -24, -34], [-4.5, -36, -52], [0, -42, -60], [4, -45, -66]], mirror: true },
      { kind: 'seg', step: 6, pts: [[4, -45, -66], [5, -46, -71], [5, -46, -78]], mirror: true },
      // cerebellar loop: cortex → pons → opposite cerebellum → thalamus → cortex
      { kind: 'seg', step: 7, pts: [[-7, -24, -34], [3, -28, -36], [13, -41, -37], [24, -58, -34]], mirror: true, radius: 0.065 },
      { kind: 'seg', step: 7, pts: [[24, -58, -34], [14, -54, -30], [6, -41, -22], [0, -30, -14], [-6, -22, -5], VL], mirror: true, radius: 0.065 },
    ],
    stations: [
      { n: 1, at: PREMOTOR, mirror: true, dx: -50, dy: -22 },
      { n: 2, at: PUTAMEN, mirror: true, dx: -80, dy: 16 },
      { n: 3, at: M1, mirror: true, dx: 50, dy: -22 },
      { n: 4, at: CAPSULE, mirror: true, dx: 84, dy: 6 },
      { n: 5, at: [0, -42, -60], dx: 74, dy: 14 },
      { n: 6, at: [-5, -46, -77], mirror: true, dx: -50, dy: 22 },
      { n: 7, at: [-24, -58, -34], mirror: true, dx: -66, dy: 22 },
    ],
    tags: [],
    view: { position: [31, 7, 34], target: [0, 0, -0.8] },
  },
  touch: {
    nuclei: [],
    tracts: [
      { kind: 'seg', step: 1, pts: [[-5, -47, -80], [-5, -46, -70], [-4, -44, -58]], mirror: true },
      { kind: 'seg', step: 2, pts: [[-4, -44, -58], [-3.5, -43, -54], [0, -40, -50], [4, -36, -45]], mirror: true },
      { kind: 'seg', step: 3, pts: [[4, -36, -45], [7, -32, -30], [11, -26, -12], flip(VPL)], mirror: true },
      { kind: 'seg', step: 4, pts: [flip(VPL), [24, -22, 26], flip(S1)], mirror: true },
      { kind: 'seg', step: 4, pts: [flip(VPL), [26, -20, 22], [52, -16, 30]], mirror: true, radius: 0.055 },
      { kind: 'seg', step: 4, pts: [flip(VPL), [16, -26, 36], [8, -38, 66]], mirror: true, radius: 0.055 },
    ],
    stations: [
      { n: 1, at: [-5, -47, -79], mirror: true, dx: -50, dy: 20 },
      { n: 2, at: [0, -41, -51], dx: 74, dy: 14 },
      { n: 3, at: VPL, mirror: true, dx: -64, dy: 10 },
      { n: 4, at: S1, mirror: true },
    ],
    tags: [],
    view: { position: [24, 7, 39], target: [0, 0, -0.8] },
  },
  hearing: {
    nuclei: [],
    tracts: [
      { kind: 'seg', step: 1, pts: [[-36, -24, -36], [-22, -32, -39], CN], mirror: true },
      { kind: 'seg', step: 2, pts: [CN, [0, -34, -40], [8, -32, -36], [10, -34, -22], flip(IC)], mirror: true },
      { kind: 'seg', step: 2, pts: [CN, [-11, -35, -28], IC], mirror: true, radius: 0.06 },
      { kind: 'seg', step: 3, pts: [IC, [-11, -31, -7], MGN], mirror: true },
      { kind: 'seg', step: 4, pts: [MGN, [-28, -27, 0], A1], mirror: true },
      // language: left hemisphere only
      { kind: 'seg', step: 5, pts: [A1, [-52, -32, 11], WERNICKE] },
      { kind: 'seg', step: 6, pts: [WERNICKE, [-48, -46, 28], [-38, -34, 32], [-36, -10, 30], [-42, 6, 22], BROCA] },
    ],
    stations: [
      { n: 1, at: CN, mirror: true, dx: 90, dy: 24 },
      { n: 2, at: IC, mirror: true, dx: -100, dy: 34 },
      { n: 3, at: MGN, mirror: true, dx: -110, dy: -4 },
      { n: 4, at: A1, mirror: true, dx: 60, dy: 44 },
      { n: 5, at: WERNICKE, dx: 50, dy: -30 },
      { n: 6, at: BROCA, dx: -50, dy: -34 },
    ],
    tags: [],
    view: { position: [31, 9, 29], target: [1.4, -0.4, -1] },
  },
  memory: {
    nuclei: [],
    tracts: [
      { kind: 'seg', step: 1, pts: [[-56, -24, -16], [-40, -16, -28], ENTO], mirror: true, radius: 0.055 },
      { kind: 'seg', step: 1, pts: [[-44, -62, 30], [-37, -50, 4], [-32, -30, -22], ENTO], mirror: true, radius: 0.055 },
      { kind: 'seg', step: 1, pts: [[-28, 40, 10], [-26, 20, -12], [-30, 4, -26], ENTO], mirror: true, radius: 0.055 },
      { kind: 'seg', step: 2, pts: [ENTO, [-26, -15, -24], HIPPO], mirror: true },
      { kind: 'seg', step: 3, pts: [HIPPO, [-28, -36, -4], [-22, -40, 10], [-10, -32, 20], [-3, -16, 22], [-2, -2, 16], [-3, 4, 4]], mirror: true },
      { kind: 'seg', step: 4, pts: [[-3, 4, 4], [-4, 2, -6], MAMM], mirror: true },
      { kind: 'seg', step: 5, pts: [MAMM, [-6, -10, -2], ANT], mirror: true },
      { kind: 'seg', step: 6, pts: [ANT, [-12, 2, 22], [-10, -4, 34], CINGULATE], mirror: true },
      { kind: 'seg', step: 7, pts: [CINGULATE, [-8, -40, 32], [-12, -50, 10], [-20, -40, -8], [-27, -22, -24], ENTO], mirror: true, radius: 0.07 },
    ],
    stations: [
      { n: 1, at: ENTO, mirror: true, dx: 30, dy: 34 },
      { n: 2, at: HIPPO, mirror: true, dx: -60, dy: 26 },
      { n: 3, at: [-10, -32, 20], mirror: true, dx: -44 },
      { n: 4, at: MAMM, mirror: true, dx: 70, dy: 26 },
      { n: 5, at: ANT, mirror: true, dx: -100, dy: -8 },
      { n: 6, at: CINGULATE, mirror: true },
      { n: 7, at: [-12, -50, 10], mirror: true, dx: 80, dy: -4 },
    ],
    tags: [],
    view: { position: [38, 11, -4], target: [1.2, 0.2, -1.2] },
  },
  fear: {
    nuclei: [],
    tracts: [
      { kind: 'seg', step: 1, pts: [IC, [-11, -31, -7], [-16, -24, -2]], mirror: true, radius: 0.06 },
      { kind: 'seg', step: 1, pts: [CHIASM, [-10, -7, -12], [-18, -18, -8], [-16, -24, -2]], mirror: true, radius: 0.06 },
      { kind: 'seg', step: 2, pts: [[-16, -24, -2], [-22, -16, -12], AMYG], mirror: true },
      { kind: 'seg', step: 3, pts: [[-16, -24, -2], [-30, -26, 2], A1], mirror: true, radius: 0.07 },
      { kind: 'seg', step: 3, pts: [A1, [-52, -12, -10], [-40, -5, -22], AMYG], mirror: true, radius: 0.07 },
      { kind: 'seg', step: 4, pts: [AMYG, [-14, -3, -15], HYPO], mirror: true },
      { kind: 'seg', step: 4, pts: [AMYG, [-14, -13, -15], [-5, -28, -11], [-4, -36, -30], [-3, -42, -58]], mirror: true },
      { kind: 'seg', step: 5, pts: [VMPFC, [-12, 22, -14], [-18, 6, -18], AMYG], mirror: true },
    ],
    stations: [
      { n: 1, at: [-16, -24, -2], mirror: true, dx: -20, dy: -8 },
      { n: 2, at: AMYG, mirror: true, dx: 40, dy: 36 },
      { n: 3, at: A1, mirror: true },
      { n: 4, at: [-5, -30, -14], mirror: true, dx: 96, dy: 30 },
      { n: 5, at: VMPFC, mirror: true, dx: 20, dy: 30 },
    ],
    tags: [],
    view: { position: [34, 2, 26], target: [1, -0.4, -0.2] },
  },
};
