/**
 * A small stochastic model of one chemical synapse. Pure TypeScript, no rendering.
 *
 * Space: units of 100 nm. The cleft is the half-disc x²+z² < R², z < 0 (the scene is a cutaway; the
 * cut plane z = 0 acts as a mirror, which is exactly what the missing half would do), between the
 * presynaptic membrane at y = +H and the postsynaptic membrane at y = −H.
 * Time: "movie seconds" — the whole story is slowed roughly a thousand-fold and not every stage equally.
 */

export type TransmitterId = 'glutamate' | 'gaba' | 'dopamine' | 'serotonin' | 'acetylcholine';
export type DrugId =
  | 'ssri' | 'cocaine' | 'amphetamine' | 'antipsychotic' | 'benzo' | 'alcohol' | 'ketamine'
  | 'nicotine' | 'donepezil' | 'nerveagent' | 'botox' | 'curare';
export type ReceptorKind = 'ampa' | 'nmda' | 'gabaa' | 'd1' | 'd2' | '5ht' | 'nachr';

export const TRANSMITTER_IDS: TransmitterId[] = ['glutamate', 'gaba', 'dopamine', 'serotonin', 'acetylcholine'];

/** which transmitter systems each drug acts on in this model */
export const DRUG_TRANSMITTERS: Record<DrugId, TransmitterId[]> = {
  ssri: ['serotonin'],
  cocaine: ['dopamine'],
  amphetamine: ['dopamine'],
  antipsychotic: ['dopamine'],
  benzo: ['gaba'],
  alcohol: ['gaba', 'glutamate'],
  ketamine: ['glutamate'],
  nicotine: ['acetylcholine'],
  donepezil: ['acetylcholine'],
  nerveagent: ['acetylcholine'],
  botox: ['acetylcholine'],
  curare: ['acetylcholine'],
};

export const GEO = {
  /** cleft radius */
  R: 3.1,
  /** half the (exaggerated) cleft width */
  H: 0.45,
  /** the astrocyte seals the rim from angle 0 (the +x side) to this angle (towards the back); the rest is open */
  ASTRO_TO: (52 * Math.PI) / 180,
  VESICLE_R: 0.2,
};

export const V_REST = -70;
export const V_THRESHOLD = -55;
const V_RESET = -75;
const E_EXC = 0;
const E_CL = -85;
const TAU_M = 1.0;
/** fraction of NMDA receptors whose Mg²⁺ plug has been pushed out at voltage v (a smooth step around −60 mV) */
export const mgUnblock = (v: number) => 1 / (1 + Math.exp(-(v + 60.5) / 2));

export const AP_TIME = 0.6;
const CA_OPEN = 0.35;
const FUSE_TIME = 0.42;
const D = 2.2;
const MOLECULES_PER_VESICLE = 12;
const ESCAPE_P = 0.16;
export const MAX_MOLECULES = 640;
export const TRACE_N = 600;
export const TRACE_DT = 1 / 50;
const H_STEP = 1 / 120;

/** molecule states */
export const M_FREE = 0, M_UPTAKE_PRE = 1, M_UPTAKE_ASTRO = 2, M_ESCAPE = 3, M_DEGRADE = 4;

export interface Vesicle {
  state: 'reserve' | 'toDock' | 'docked' | 'fusing' | 'recycle';
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  slot: number;
  /** 0..1 how full of transmitter */
  fill: number;
  timer: number;
  armed: boolean;
  emitted: number;
}

export interface Receptor {
  kind: ReceptorKind;
  x: number; z: number;
  /** spare AMPA receptor waiting inside the spine (LTP toy) */
  latent: boolean;
  /** 0..1 insertion animation */
  present: number;
  bound: boolean;
  /** occupied by a drug that mimics the transmitter (nicotine) */
  agonist: boolean;
  timer: number;
  blocked: boolean;
  conducting: boolean;
  /** smoothed 0..1 */
  open: number;
}

export interface Transporter {
  site: 'pre' | 'astro';
  x: number; y: number; z: number;
  /** does it carry the current transmitter at all */
  active: boolean;
  blocked: boolean;
  reversed: boolean;
  flash: number;
}

export interface Enzyme { x: number; y: number; z: number; flash: number }

export interface SimEvent { type: 'fuse' | 'bind' | 'uptake' | 'degrade' | 'escape' | 'postspike' | 'ltp' | 'efflux'; x: number; y: number; z: number }

export const SLOTS: { x: number; z: number }[] = [
  { x: -1.8, z: -0.45 }, { x: -0.9, z: -0.45 }, { x: 0, z: -0.45 }, { x: 0.9, z: -0.45 }, { x: 1.8, z: -0.45 },
  { x: -1.2, z: -1.3 }, { x: 0, z: -1.3 }, { x: 1.2, z: -1.3 },
];

export const CA_CHANNELS: { x: number; z: number }[] = [
  { x: -1.35, z: -0.42 }, { x: -0.45, z: -0.42 }, { x: 0.45, z: -0.42 }, { x: 1.35, z: -0.42 },
  { x: -0.6, z: -1.3 }, { x: 0.6, z: -1.3 }, { x: 0, z: -0.9 },
];

const RECEPTOR_SITES: { x: number; z: number }[] = [
  { x: -2.0, z: -0.42 }, { x: -1.2, z: -0.42 }, { x: -0.4, z: -0.42 }, { x: 0.4, z: -0.42 }, { x: 1.2, z: -0.42 }, { x: 2.0, z: -0.42 },
  { x: -1.6, z: -1.2 }, { x: -0.8, z: -1.2 }, { x: 0, z: -1.2 }, { x: 0.8, z: -1.2 }, { x: 1.6, z: -1.2 },
  { x: -0.8, z: -1.95 }, { x: 0, z: -1.95 }, { x: 0.8, z: -1.95 },
];
const LATENT_SITES: { x: number; z: number }[] = [
  { x: -1.6, z: -0.8 }, { x: 1.6, z: -0.8 }, { x: -0.8, z: -0.8 }, { x: 0.8, z: -0.8 }, { x: -0.4, z: -1.6 }, { x: 0.4, z: -1.6 },
];

const KIND_PATTERN: Record<TransmitterId, ReceptorKind[]> = {
  glutamate: ['ampa', 'nmda', 'ampa', 'ampa', 'nmda', 'ampa', 'ampa', 'ampa', 'nmda', 'ampa', 'ampa', 'nmda', 'ampa', 'nmda'],
  gaba: ['gabaa'],
  dopamine: ['d1', 'd2'],
  serotonin: ['5ht'],
  acetylcholine: ['nachr'],
};

const UNBIND_TAU: Record<ReceptorKind, number> = { ampa: 0.35, nmda: 1.2, gabaa: 0.6, d1: 0.9, d2: 0.9, '5ht': 0.9, nachr: 0.3 };
export const isGPCR = (k: ReceptorKind) => k === 'd1' || k === 'd2' || k === '5ht';

/** which transporters carry which transmitter (strength 0..1) */
const UPTAKE: Record<TransmitterId, { pre: number; astro: number }> = {
  glutamate: { pre: 0.25, astro: 1 },
  gaba: { pre: 1, astro: 0.5 },
  dopamine: { pre: 1, astro: 0 },
  serotonin: { pre: 1, astro: 0 },
  acetylcholine: { pre: 0, astro: 0 },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SynapseSim {
  transmitter: TransmitterId = 'glutamate';
  drugs = new Set<DrugId>();
  /** chance that a docked vesicle fuses when a spike arrives */
  pRelease = 0.5;
  /** spikes per movie-second fired automatically (0 = off) */
  autoRate = 0;
  /** other synapses keep the cell near threshold */
  background = false;
  stepMode = false;

  t = 0;
  vm = V_REST;
  /** 0..1 slow internal signal produced by G-protein-coupled receptors */
  messenger = 0;
  /** 0..1 calcium near the active zone */
  ca = 0;
  caOpen = 0;
  /** calcium that entered the spine through NMDA receptors (drives the LTP toy) */
  spineCa = 0;
  /** 0 = at rest, 1..6 = stage of the sequence */
  stage = 0;
  held = false;
  /** positions 0..1 of spikes travelling down the axon */
  aps: number[] = [];

  vesicles: Vesicle[] = [];
  receptors: Receptor[] = [];
  transporters: Transporter[] = [];
  enzymes: Enzyme[] = [];

  mN = 0;
  readonly mx = new Float32Array(MAX_MOLECULES);
  readonly my = new Float32Array(MAX_MOLECULES);
  readonly mz = new Float32Array(MAX_MOLECULES);
  readonly mState = new Uint8Array(MAX_MOLECULES);
  readonly mTimer = new Float32Array(MAX_MOLECULES);
  readonly mRef = new Int16Array(MAX_MOLECULES);

  /** membrane potential history (ring buffer, newest at traceHead − 1); +30 marks a postsynaptic spike */
  readonly trace = new Float32Array(TRACE_N).fill(V_REST);
  readonly traceMessenger = new Float32Array(TRACE_N);
  traceHead = 0;

  events: SimEvent[] = [];
  totalReleased = 0;
  totalFused = 0;
  postSpikes = 0;
  lastPostSpike = -99;
  spikesArrived = 0;
  ltpInserted = 0;

  private rng: () => number;
  private acc = 0;
  private traceAcc = 0;
  private queue: number[] = [];
  private autoTimer = 0;
  private refr = 0;
  private ltpCooldown = 0;
  private slotWait: number[] = SLOTS.map(() => 0);
  private seen: boolean[] = [false, false, false, false, false, false, false];
  private holds: { stage: number; at: number }[] = [];
  private cycleActive = false;
  private firstReleaseAt = -99;
  private lastActivity = -99;
  private spare = NaN;

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.buildVesicles();
    this.buildTransporters();
    this.buildEnzymes();
    this.buildReceptors();
    this.applyDrugs();
  }

  // ------------------------------------------------------------------ setup
  private gauss() {
    if (!Number.isNaN(this.spare)) { const s = this.spare; this.spare = NaN; return s; }
    let u = 0, v = 0, s = 0;
    do { u = this.rng() * 2 - 1; v = this.rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * m;
    return u * m;
  }

  private buildVesicles() {
    this.vesicles = [];
    const n = 46;
    let tries = 0;
    const homes: { x: number; y: number; z: number }[] = [];
    while (homes.length < n && tries++ < 5000) {
      const y = 1.25 + this.rng() * 4.0;
      // the bouton is widest around y ≈ 3
      const rMax = 3.3 - Math.abs(y - 3) * 0.42;
      const x = (this.rng() * 2 - 1) * rMax;
      const z = -0.3 - this.rng() * 2.1;
      if (Math.hypot(x, z) > rMax) continue;
      if (homes.some((h) => (h.x - x) ** 2 + (h.y - y) ** 2 + (h.z - z) ** 2 < 0.47 * 0.47)) continue;
      homes.push({ x, y, z });
    }
    SLOTS.forEach((s, i) => {
      const h = homes[i];
      this.vesicles.push({
        state: 'docked', x: s.x, y: GEO.H + GEO.VESICLE_R + 0.03, z: s.z, hx: h.x, hy: h.y, hz: h.z,
        slot: i, fill: 1, timer: 0, armed: false, emitted: 0,
      });
    });
    for (let i = SLOTS.length; i < homes.length; i++) {
      const h = homes[i];
      this.vesicles.push({ state: 'reserve', x: h.x, y: h.y, z: h.z, hx: h.x, hy: h.y, hz: h.z, slot: -1, fill: 1, timer: 0, armed: false, emitted: 0 });
    }
  }

  private buildTransporters() {
    const pre: [number, number][] = [[-2.55, -0.4], [2.55, -0.4], [-2.3, -1.35], [2.3, -1.35], [-1.55, -2.2], [1.55, -2.2], [0, -2.65]];
    this.transporters = pre.map(([x, z]) => ({ site: 'pre' as const, x, y: GEO.H, z, active: false, blocked: false, reversed: false, flash: 0 }));
    for (const deg of [5, 15, 25, 35, 45]) {
      const a = (deg * Math.PI) / 180;
      this.transporters.push({ site: 'astro', x: GEO.R * Math.cos(a), y: 0, z: -GEO.R * Math.sin(a), active: false, blocked: false, reversed: false, flash: 0 });
    }
  }

  private buildEnzymes() {
    const at: [number, number][] = [[-1.6, -0.42], [-0.0, -0.42], [1.6, -0.42], [-1.2, -1.6], [0.4, -1.6], [1.2, -0.8], [-0.4, -0.8], [2.2, -1.1], [-2.2, -1.1]];
    this.enzymes = at.map(([x, z]) => ({ x, y: -GEO.H + 0.3, z, flash: 0 }));
  }

  private buildReceptors() {
    const pat = KIND_PATTERN[this.transmitter];
    this.receptors = RECEPTOR_SITES.map((s, i) => ({
      kind: pat[i % pat.length], x: s.x, z: s.z, latent: false, present: 1, bound: false, agonist: false, timer: 0,
      blocked: false, conducting: false, open: 0,
    }));
    if (this.transmitter === 'glutamate') {
      for (const s of LATENT_SITES) {
        this.receptors.push({ kind: 'ampa', x: s.x, z: s.z, latent: true, present: 0, bound: false, agonist: false, timer: 0, blocked: false, conducting: false, open: 0 });
      }
    }
    this.ltpInserted = 0;
  }

  private applyDrugs() {
    const has = (d: DrugId) => this.has(d);
    const up = UPTAKE[this.transmitter];
    for (const tr of this.transporters) {
      tr.active = (tr.site === 'pre' ? up.pre : up.astro) > 0;
      tr.blocked = tr.active && tr.site === 'pre' && (has('ssri') || has('cocaine'));
      tr.reversed = tr.active && tr.site === 'pre' && has('amphetamine') && !tr.blocked;
    }
    for (const r of this.receptors) {
      r.blocked = (r.kind === 'nmda' && has('ketamine')) || (r.kind === 'd2' && has('antipsychotic')) || (r.kind === 'nachr' && has('curare'));
      if (r.blocked && r.kind !== 'nmda') { r.bound = false; r.agonist = false; }
      if (!has('nicotine')) r.agonist = false;
    }
  }

  /** is this drug switched on and relevant to the current transmitter */
  has(d: DrugId) {
    return this.drugs.has(d) && DRUG_TRANSMITTERS[d].includes(this.transmitter);
  }

  setTransmitter(id: TransmitterId) {
    if (id === this.transmitter) return;
    this.transmitter = id;
    this.mN = 0;
    this.messenger = 0;
    this.spineCa = 0;
    this.buildReceptors();
    this.applyDrugs();
    for (const v of this.vesicles) v.fill = Math.max(v.fill, v.state === 'recycle' ? 0 : 1);
  }

  setDrugs(ids: Iterable<DrugId>) {
    this.drugs = new Set(ids);
    this.applyDrugs();
  }

  /** undo the LTP toy: remove the extra AMPA receptors */
  resetLTP() {
    for (const r of this.receptors) if (r.kind === 'ampa' && RECEPTOR_SITES.every((s) => s.x !== r.x || s.z !== r.z)) { r.latent = true; r.present = 0; r.bound = false; }
    this.ltpInserted = 0;
    this.spineCa = 0;
  }

  // ---------------------------------------------------------------- actions
  fire() {
    this.launch();
  }

  burst(n = 5, interval = 0.26) {
    for (let i = 0; i < n; i++) this.queue.push(this.t + i * interval);
    this.queue.sort((a, b) => a - b);
  }

  setStepMode(on: boolean) {
    if (on === this.stepMode) return;
    this.stepMode = on;
    if (!on) { this.held = false; this.holds = []; }
  }

  /** step-through mode: continue to the next stage */
  next() {
    if (!this.held) return;
    this.held = false;
    if (this.holds.length) this.holds[0].at = Math.max(this.holds[0].at, this.t + 0.18);
  }

  private launch() {
    this.aps.push(0);
    this.cycleActive = true;
    this.lastActivity = this.t;
    this.seen.fill(false);
    this.holds = [];
    this.see(1);
  }

  private see(stage: number) {
    if (this.seen[stage] || !this.cycleActive) return;
    // clean-up only counts once this spike's transmitter is actually out
    if (stage === 6 && !this.seen[4]) return;
    this.seen[stage] = true;
    if (this.stepMode) {
      const delay = [0, 0.3, 0.16, 0.2, 0.22, 0.12, 0.3][stage];
      this.holds.push({ stage, at: this.t + delay });
      if (stage === 1) this.stage = 1;
    } else this.stage = stage;
  }

  // ---------------------------------------------------------------- readouts
  get freeCount() {
    let n = 0;
    for (let i = 0; i < this.mN; i++) if (this.mState[i] === M_FREE) n++;
    return n;
  }
  get boundCount() {
    let n = 0;
    for (const r of this.receptors) if (r.bound) n++;
    return n;
  }
  /** fraction of installed receptors that are open (ion channels) or active (G-protein-coupled) */
  get openFraction() {
    let n = 0, tot = 0;
    for (const r of this.receptors) {
      if (r.latent) continue;
      tot++;
      if (isGPCR(r.kind) ? r.bound && !r.blocked : r.conducting) n++;
    }
    return tot ? n / tot : 0;
  }
  get dockedCount() {
    let n = 0;
    for (const v of this.vesicles) if (v.state === 'docked') n++;
    return n;
  }
  get ampaCount() {
    let n = 0;
    for (const r of this.receptors) if (r.kind === 'ampa' && !r.latent) n++;
    return n;
  }
  /** true while a spike's consequences are still playing out */
  get busy() {
    return this.cycleActive;
  }

  // ------------------------------------------------------------------- step
  step(dt: number) {
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= H_STEP && n++ < 40) {
      this.acc -= H_STEP;
      this.tick(H_STEP);
    }
    if (n >= 40) this.acc = 0;
  }

  private addMolecule(x: number, y: number, z: number) {
    if (this.mN >= MAX_MOLECULES) return;
    const i = this.mN++;
    this.mx[i] = x; this.my[i] = y; this.mz[i] = z;
    this.mState[i] = M_FREE; this.mTimer[i] = 0; this.mRef[i] = -1;
  }

  private removeMolecule(i: number) {
    const j = --this.mN;
    if (i !== j) {
      this.mx[i] = this.mx[j]; this.my[i] = this.my[j]; this.mz[i] = this.mz[j];
      this.mState[i] = this.mState[j]; this.mTimer[i] = this.mTimer[j]; this.mRef[i] = this.mRef[j];
    }
  }

  private tick(h: number) {
    if (this.held) return;
    this.t += h;
    const rng = this.rng;

    // --- spikes
    while (this.queue.length && this.queue[0] <= this.t) { this.queue.shift(); this.launch(); }
    if (this.autoRate > 0) {
      this.autoTimer -= h;
      if (this.autoTimer <= 0) { this.launch(); this.autoTimer += 1 / this.autoRate; }
    } else this.autoTimer = 0;
    for (let i = this.aps.length - 1; i >= 0; i--) {
      this.aps[i] += h / AP_TIME;
      if (this.aps[i] >= 1) { this.aps.splice(i, 1); this.arrive(); }
    }

    // --- calcium
    if (this.caOpen > 0) { this.caOpen = Math.max(0, this.caOpen - h); this.lastActivity = this.t; }
    this.ca += ((this.caOpen > 0 ? 1 : 0) - this.ca) * (1 - Math.exp(-h / (this.caOpen > 0 ? 0.06 : 0.22)));

    this.tickVesicles(h);
    this.tickTransporters(h);
    this.tickMolecules(h);
    this.tickReceptors(h);
    this.tickVoltage(h);
    this.tickStage();

    this.traceAcc += h;
    if (this.traceAcc >= TRACE_DT) {
      this.traceAcc -= TRACE_DT;
      this.trace[this.traceHead] = this.t - this.lastPostSpike < TRACE_DT * 1.5 ? 30 : this.vm;
      this.traceMessenger[this.traceHead] = this.messenger;
      this.traceHead = (this.traceHead + 1) % TRACE_N;
    }
    void rng;
  }

  private arrive() {
    this.spikesArrived++;
    this.see(2);
    // leftover calcium from the previous spike makes release a little more likely (facilitation)
    const p = this.has('botox') ? 0 : Math.min(1, this.pRelease * (1 + 1.2 * this.ca));
    this.caOpen = CA_OPEN;
    for (const v of this.vesicles) {
      if (v.state === 'docked' && !v.armed && this.rng() < p) {
        v.armed = true;
        v.timer = 0.07 + this.rng() * 0.2;
      }
    }
  }

  private tickVesicles(h: number) {
    const rng = this.rng;
    const dockY = GEO.H + GEO.VESICLE_R + 0.03;
    const content = this.has('amphetamine') ? 0.35 : 1;
    for (const v of this.vesicles) {
      switch (v.state) {
        case 'reserve': {
          const s = Math.sqrt(2 * 0.012 * h);
          v.x += (v.hx - v.x) * h * 0.9 + s * this.gauss();
          v.y += (v.hy - v.y) * h * 0.9 + s * this.gauss();
          v.z += (v.hz - v.z) * h * 0.9 + s * this.gauss();
          if (v.fill < 1) v.fill = Math.min(1, v.fill + h / 3);
          break;
        }
        case 'toDock': {
          const s = SLOTS[v.slot];
          const dx = s.x - v.x, dy = dockY - v.y, dz = s.z - v.z;
          const d = Math.hypot(dx, dy, dz);
          const stepLen = 5 * h;
          if (d <= stepLen) { v.x = s.x; v.y = dockY; v.z = s.z; v.state = 'docked'; v.armed = false; }
          else { v.x += (dx / d) * stepLen; v.y += (dy / d) * stepLen; v.z += (dz / d) * stepLen; }
          break;
        }
        case 'docked':
          if (v.armed) {
            v.timer -= h;
            if (v.timer <= 0) {
              v.state = 'fusing'; v.timer = 0; v.emitted = 0; v.armed = false;
              this.totalFused++;
              this.see(3);
              this.events.push({ type: 'fuse', x: v.x, y: GEO.H, z: v.z });
            }
          }
          break;
        case 'fusing': {
          v.timer += h;
          this.lastActivity = this.t;
          const k = v.timer / FUSE_TIME;
          const total = Math.round(MOLECULES_PER_VESICLE * content);
          const due = Math.floor(total * Math.min(1, Math.max(0, (k - 0.2) / 0.6)));
          while (v.emitted < due) {
            this.addMolecule(v.x + (rng() - 0.5) * 0.16, GEO.H - 0.04, Math.min(-0.02, v.z + (rng() - 0.5) * 0.16));
            v.emitted++;
            this.totalReleased++;
            if (this.firstReleaseAt < 0 || !this.seen[4]) this.firstReleaseAt = this.firstReleaseAt > this.t - 1 ? this.firstReleaseAt : this.t;
          }
          v.fill = 1 - Math.min(1, Math.max(0, (k - 0.2) / 0.6));
          if (k >= 1) {
            // the membrane is pinched back off beside the active zone and the empty vesicle is refilled
            const a = Math.PI * (0.15 + 0.7 * rng());
            this.slotWait[v.slot] = 0.05 + rng() * 0.12;
            v.slot = -1;
            v.state = 'recycle'; v.timer = 0; v.fill = 0;
            v.x = 2.75 * Math.cos(a) * (rng() < 0.5 ? 1 : -1) * 0.98; v.z = -Math.abs(2.75 * Math.sin(a)) * 0.9; v.y = GEO.H + 0.25;
          }
          break;
        }
        case 'recycle': {
          v.timer += h;
          const k = 1 - Math.exp(-h * 1.3);
          v.x += (v.hx - v.x) * k; v.y += (v.hy - v.y) * k; v.z += (v.hz - v.z) * k;
          v.fill = Math.min(1, v.timer / 3.2);
          if (v.timer > 3.2) v.state = 'reserve';
          break;
        }
      }
    }
    // empty release sites recruit the nearest full reserve vesicle
    for (let s = 0; s < SLOTS.length; s++) {
      if (this.slotWait[s] <= 0) continue;
      this.slotWait[s] -= h;
      if (this.slotWait[s] > 0) continue;
      let best: Vesicle | null = null, bd = Infinity;
      for (const v of this.vesicles) {
        if (v.state !== 'reserve' || v.fill < 1) continue;
        const d = (v.x - SLOTS[s].x) ** 2 + (v.y - dockY) ** 2 + (v.z - SLOTS[s].z) ** 2;
        if (d < bd) { bd = d; best = v; }
      }
      if (best) { best.state = 'toDock'; best.slot = s; }
      else this.slotWait[s] = 0.3;
    }
  }

  private tickTransporters(h: number) {
    for (const tr of this.transporters) {
      if (tr.flash > 0) tr.flash = Math.max(0, tr.flash - h * 2.5);
      // amphetamine: the transporter runs backwards and pushes transmitter out with no spike at all
      if (tr.reversed && this.rng() < 1.5 * h) {
        this.addMolecule(tr.x, GEO.H - 0.05, tr.z);
        tr.flash = 1;
        this.events.push({ type: 'efflux', x: tr.x, y: tr.y, z: tr.z });
      }
    }
    for (const e of this.enzymes) if (e.flash > 0) e.flash = Math.max(0, e.flash - h * 2.2);
  }

  private tickMolecules(h: number) {
    const { R, H, ASTRO_TO } = GEO;
    const sig = Math.sqrt(2 * D * h);
    const up = UPTAKE[this.transmitter];
    const kPre = 1 - Math.exp(-16 * up.pre * h);
    const kAstro = 1 - Math.exp(-22 * up.astro * h);
    const inhib = this.has('nerveagent') ? 1 : this.has('donepezil') ? 0.8 : 0;
    const kEnz = this.transmitter === 'acetylcholine' ? 1 - Math.exp(-14 * (1 - inhib) * h) : 0;
    const kBind = 1 - Math.exp(-4.5 * h);
    const benzo = this.has('benzo');

    for (let i = this.mN - 1; i >= 0; i--) {
      const st = this.mState[i];
      if (st === M_FREE) {
        let x = this.mx[i] + sig * this.gauss();
        let y = this.my[i] + sig * this.gauss();
        let z = this.mz[i] + sig * this.gauss();
        if (z > 0) z = -z;
        const r = Math.hypot(x, z);
        if (r > R) {
          const theta = Math.atan2(-z, x);
          // the astrocyte seals part of the rim; elsewhere the narrow surroundings let only some molecules slip out
          if (theta < ASTRO_TO || this.rng() > ESCAPE_P) {
            const k = (2 * R - r) / r;
            x *= k; z *= k;
          } else {
            this.mState[i] = M_ESCAPE; this.mTimer[i] = 0;
            this.mx[i] = x; this.my[i] = y; this.mz[i] = z;
            this.events.push({ type: 'escape', x, y, z });
            if (this.seen[5] || this.t - this.firstReleaseAt > 0.8) this.see(6);
            continue;
          }
        }
        if (y > H) y = 2 * H - y;
        if (y < -H) y = -2 * H - y;
        if (y > H) y = H;
        this.mx[i] = x; this.my[i] = y; this.mz[i] = z;

        // receptors on the postsynaptic membrane
        if (y < -H + 0.22) {
          let boundNow = false;
          for (const rc of this.receptors) {
            if (rc.latent || rc.present < 0.9 || rc.bound || rc.agonist) continue;
            if (rc.blocked && rc.kind !== 'nmda') continue;
            const dx = rc.x - x, dz = rc.z - z;
            if (dx * dx + dz * dz < 0.1 && this.rng() < kBind) {
              rc.bound = true;
              rc.timer = -UNBIND_TAU[rc.kind] * (benzo && rc.kind === 'gabaa' ? 1.6 : 1) * Math.log(1 - this.rng());
              this.events.push({ type: 'bind', x: rc.x, y: -H, z: rc.z });
              boundNow = true;
              break;
            }
          }
          if (boundNow) { this.removeMolecule(i); continue; }
          if (kEnz > 0) {
            let eaten = false;
            for (const e of this.enzymes) {
              const dx = e.x - x, dz = e.z - z;
              if (dx * dx + dz * dz < 0.2 && this.rng() < kEnz) {
                this.mState[i] = M_DEGRADE; this.mTimer[i] = 0;
                this.mx[i] = e.x; this.my[i] = e.y; this.mz[i] = e.z;
                e.flash = 1; eaten = true;
                this.events.push({ type: 'degrade', x: e.x, y: e.y, z: e.z });
                if (this.seen[5] || this.t - this.firstReleaseAt > 0.8) this.see(6);
                break;
              }
            }
            if (eaten) continue;
          }
        }
        // transporters in the presynaptic membrane
        if (kPre > 0 && y > H - 0.22) {
          for (let ti = 0; ti < this.transporters.length; ti++) {
            const tr = this.transporters[ti];
            if (tr.site !== 'pre' || !tr.active || tr.blocked || tr.reversed) continue;
            const dx = tr.x - x, dz = tr.z - z;
            if (dx * dx + dz * dz < 0.27 && this.rng() < kPre) { this.takeUp(i, ti, M_UPTAKE_PRE); break; }
          }
          if (this.mState[i] !== M_FREE) continue;
        }
        // transporters on the astrocyte at the rim
        if (kAstro > 0 && r > R - 0.5 && x > 0 && this.rng() < kAstro) {
          let best = -1, bd = Infinity;
          for (let ti = 0; ti < this.transporters.length; ti++) {
            const tr = this.transporters[ti];
            if (tr.site !== 'astro' || !tr.active || tr.blocked) continue;
            const d = (tr.x - x) ** 2 + (tr.z - z) ** 2;
            if (d < bd) { bd = d; best = ti; }
          }
          if (best >= 0 && bd < 1.2) this.takeUp(i, best, M_UPTAKE_ASTRO);
        }
      } else if (st === M_UPTAKE_PRE || st === M_UPTAKE_ASTRO) {
        const tr = this.transporters[this.mRef[i]];
        this.mTimer[i] += h / 0.4;
        const k = Math.min(1, h * 10);
        if (st === M_UPTAKE_PRE) {
          this.mx[i] += (tr.x - this.mx[i]) * k; this.mz[i] += (tr.z - this.mz[i]) * k;
          this.my[i] += (H + 0.45 - this.my[i]) * k * 0.6;
        } else {
          const s = 1 + 0.2 / GEO.R;
          this.mx[i] += (tr.x * s - this.mx[i]) * k * 0.6; this.mz[i] += (tr.z * s - this.mz[i]) * k * 0.6;
          this.my[i] += (0 - this.my[i]) * k;
        }
        if (this.mTimer[i] >= 1) this.removeMolecule(i);
      } else if (st === M_ESCAPE) {
        const r = Math.hypot(this.mx[i], this.mz[i]) || 1;
        this.mx[i] += sig * 0.7 * this.gauss() + (this.mx[i] / r) * h * 0.9;
        this.mz[i] = Math.min(0, this.mz[i] + sig * 0.7 * this.gauss() + (this.mz[i] / r) * h * 0.9);
        this.my[i] += sig * 0.5 * this.gauss();
        this.mTimer[i] += h / 1.3;
        if (this.mTimer[i] >= 1) this.removeMolecule(i);
      } else if (st === M_DEGRADE) {
        this.mTimer[i] += h / 0.35;
        if (this.mTimer[i] >= 1) this.removeMolecule(i);
      }
    }
  }

  private takeUp(i: number, ti: number, state: number) {
    this.mState[i] = state; this.mTimer[i] = 0; this.mRef[i] = ti;
    const tr = this.transporters[ti];
    tr.flash = 1;
    this.events.push({ type: 'uptake', x: tr.x, y: tr.y, z: tr.z });
    if (this.seen[5] || this.t - this.firstReleaseAt > 0.8) this.see(6);
  }

  private tickReceptors(h: number) {
    const nicotine = this.has('nicotine');
    const kOpen = 1 - Math.exp(-h / 0.05);
    for (const r of this.receptors) {
      if (r.latent) continue;
      if (r.present < 1) r.present = Math.min(1, r.present + h / 1.0);
      if (r.bound) {
        r.timer -= h;
        if (r.timer <= 0) {
          r.bound = false;
          this.addMolecule(r.x, -GEO.H + 0.14, r.z);
          if (this.seen[5]) this.see(6);
        }
      } else if (nicotine && r.kind === 'nachr' && !r.blocked) {
        if (r.agonist) {
          r.timer -= h;
          if (r.timer <= 0) r.agonist = false;
        } else if (this.rng() < 0.5 * h) {
          r.agonist = true;
          r.timer = -0.8 * Math.log(1 - this.rng());
        }
      }
      const occupied = r.bound || r.agonist;
      const usable = occupied && !r.blocked && r.present >= 0.9;
      const target = !usable ? 0 : r.kind === 'nmda' ? mgUnblock(this.vm) : 1;
      r.conducting = !isGPCR(r.kind) && target > 0.5;
      r.open += (target - r.open) * kOpen;
    }
  }

  private tickVoltage(h: number) {
    let gE = 0, gI = 0, nmdaFlux = 0, up = 0, nUp = 0, down = 0, nDown = 0;
    const benzo = this.has('benzo'), alcohol = this.has('alcohol');
    for (const r of this.receptors) {
      if (r.latent) continue;
      switch (r.kind) {
        case 'ampa': gE += 0.048 * r.open; break;
        case 'nmda': { const g = 0.125 * r.open * (alcohol ? 0.45 : 1); gE += g; nmdaFlux += r.open * (alcohol ? 0.45 : 1); break; }
        case 'nachr': gE += 0.075 * r.open; break;
        case 'gabaa': gI += 0.12 * r.open * (benzo ? 1.7 : 1) * (alcohol ? 1.35 : 1); break;
        case 'd1': case '5ht': nUp++; up += r.open; break;
        case 'd2': nDown++; down += r.open; break;
      }
    }
    // slow second-messenger signal from G-protein-coupled receptors (D1-like raise it, D2-like lower it)
    const targetM = Math.max(0, Math.min(1, 1.4 * ((nUp ? up / nUp : 0) - 0.5 * (nDown ? down / nDown : 0))));
    const tau = targetM > this.messenger ? 0.6 : 3.5;
    this.messenger += (targetM - this.messenger) * (1 - Math.exp(-h / tau));
    if (this.messenger < 1e-4) this.messenger = 0;

    let v = this.vm;
    const eL = this.background ? V_REST + 3 : V_REST;
    v += (-(v - eL) / TAU_M + gE * (E_EXC - v) + gI * (E_CL - v)) * h;
    if (this.background && this.rng() < 6 * h) v += 3 * (1 + 0.8 * this.messenger);
    if (this.refr > 0) {
      this.refr -= h;
      v = Math.min(v, V_THRESHOLD - 3);
    } else if (v >= V_THRESHOLD) {
      this.postSpikes++;
      this.lastPostSpike = this.t;
      this.refr = 0.28;
      v = V_RESET;
      this.events.push({ type: 'postspike', x: 0, y: -GEO.H, z: -1 });
    }
    this.vm = v;

    // LTP toy: calcium through NMDA receptors recruits spare AMPA receptors
    this.spineCa += nmdaFlux * h * 0.7 - (this.spineCa * h) / 2.2;
    if (this.ltpCooldown > 0) this.ltpCooldown -= h;
    if (this.spineCa > 1 && this.ltpCooldown <= 0) {
      const spare = this.receptors.find((r) => r.latent);
      if (spare) {
        spare.latent = false; spare.present = 0;
        this.ltpInserted++;
        this.spineCa -= 0.4;
        this.ltpCooldown = 0.6;
        this.events.push({ type: 'ltp', x: spare.x, y: -GEO.H, z: spare.z });
      }
    }
  }

  private tickStage() {
    if (!this.cycleActive) return;
    let free = 0;
    for (let i = 0; i < this.mN; i++) if (this.mState[i] === M_FREE) free++;
    let occupied = 0, open = 0;
    for (const r of this.receptors) {
      if (r.bound) occupied++;
      if (r.bound && (isGPCR(r.kind) ? !r.blocked : r.conducting)) open++;
    }
    if (this.seen[3] && !this.seen[4] && free > 0 && this.t - this.firstReleaseAt > 0.1) this.see(4);
    if (this.seen[4] && !this.seen[5] && open > 0) this.see(5);
    if (free > 0 || occupied > 0) this.lastActivity = this.t;

    if (this.stepMode && this.holds.length && this.t >= this.holds[0].at) {
      this.stage = this.holds.shift()!.stage;
      this.held = true;
      return;
    }
    const quiet = this.aps.length === 0 && this.queue.length === 0 && this.caOpen <= 0 && this.holds.length === 0 &&
      !this.vesicles.some((v) => v.state === 'fusing' || v.armed);
    // with amphetamine or a blocked clearance route molecules never quite vanish — time out instead
    if (quiet && (this.t - this.lastActivity > 0.5 || (this.t - this.firstReleaseAt > 7 && this.seen[3]) )) {
      this.cycleActive = false;
      this.stage = 0;
    } else if (quiet && this.has('amphetamine') && this.t - Math.max(this.firstReleaseAt, 0) > 5 && this.seen[2]) {
      this.cycleActive = false;
      this.stage = 0;
    }
  }
}
