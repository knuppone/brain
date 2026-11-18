import { describe, expect, it } from 'vitest';
import { SynapseSim, V_REST, V_THRESHOLD, type DrugId, type TransmitterId } from '../src/sim/synapse';

function make(seed: number, transmitter: TransmitterId = 'glutamate', drugs: DrugId[] = []) {
  const s = new SynapseSim(seed);
  s.setTransmitter(transmitter);
  s.setDrugs(drugs);
  return s;
}
/** run for `seconds`, returning voltage extremes and the time-integral of transmitter in the cleft */
function run(s: SynapseSim, seconds: number) {
  let max = -Infinity, min = Infinity, area = 0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    s.step(dt);
    max = Math.max(max, s.vm); min = Math.min(min, s.vm);
    area += (s.freeCount + s.boundCount) * dt;
  }
  return { max, min, area };
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const mean = (f: (seed: number) => number) => SEEDS.reduce((a, s) => a + f(s), 0) / SEEDS.length;

describe('synapse simulation', () => {
  it('releases nothing without a spike', () => {
    for (const tr of ['glutamate', 'gaba', 'dopamine', 'serotonin', 'acetylcholine'] as TransmitterId[]) {
      const s = make(3, tr);
      const r = run(s, 8);
      expect(s.totalReleased).toBe(0);
      expect(s.mN).toBe(0);
      expect(Math.abs(r.max - V_REST)).toBeLessThan(0.01);
      expect(s.stage).toBe(0);
    }
  });

  it('a spike releases transmitter, opens receptors and is then cleared', () => {
    const s = make(2);
    s.pRelease = 1;
    s.fire();
    const r = run(s, 3);
    expect(s.totalReleased).toBeGreaterThan(0);
    expect(r.max).toBeGreaterThan(V_REST + 1);
    run(s, 14);
    expect(s.freeCount + s.boundCount).toBeLessThanOrEqual(1);
    expect(s.stage).toBe(0);
    expect(s.dockedCount).toBe(8); // vesicles recycled and re-docked
  });

  it('amphetamine pushes dopamine out with no spike; nicotine opens receptors with no acetylcholine', () => {
    const a = make(1, 'dopamine', ['amphetamine']);
    run(a, 6);
    expect(a.totalReleased).toBe(0);
    expect(a.freeCount).toBeGreaterThan(3);
    expect(a.messenger).toBeGreaterThan(0.05);
    expect(a.stage).toBe(0); // no spike, so the six-step sequence never starts
    // cocaine plugs the transporter, so amphetamine cannot run it backwards
    const both = make(1, 'dopamine', ['amphetamine', 'cocaine']);
    run(both, 6);
    expect(both.mN).toBe(0);

    const n = make(1, 'acetylcholine', ['nicotine']);
    const r = run(n, 8);
    expect(n.mN).toBe(0);
    expect(r.max).toBeGreaterThan(V_REST + 1.5);
  });

  it('transmitter lingers when reuptake is blocked', () => {
    const cases: [TransmitterId, DrugId][] = [['dopamine', 'cocaine'], ['serotonin', 'ssri']];
    for (const [tr, drug] of cases) {
      const normal = mean((seed) => { const s = make(seed, tr); s.fire(); return run(s, 10).area; });
      const blocked = mean((seed) => { const s = make(seed, tr, [drug]); s.fire(); return run(s, 10).area; });
      expect(blocked).toBeGreaterThan(normal * 1.5);
    }
  });

  it('acetylcholine lingers when acetylcholinesterase is blocked — more with a nerve agent than with donepezil', () => {
    const area = (drugs: DrugId[]) => mean((seed) => { const s = make(seed, 'acetylcholine', drugs); s.fire(); return run(s, 10).area; });
    const normal = area([]), donepezil = area(['donepezil']), agent = area(['nerveagent']);
    expect(donepezil).toBeGreaterThan(normal * 1.3);
    expect(agent).toBeGreaterThan(donepezil);
  });

  it('botulinum toxin stops release completely', () => {
    const s = make(5, 'acetylcholine', ['botox']);
    s.burst(5);
    const r = run(s, 6);
    expect(s.spikesArrived).toBe(5);
    expect(s.totalReleased).toBe(0);
    expect(s.totalFused).toBe(0);
    expect(Math.abs(r.max - V_REST)).toBeLessThan(0.01);
  });

  it('curare blocks the response even though acetylcholine is released', () => {
    const s = make(5, 'acetylcholine', ['curare']);
    s.pRelease = 1;
    s.fire();
    const r = run(s, 4);
    expect(s.totalReleased).toBeGreaterThan(0);
    expect(Math.abs(r.max - V_REST)).toBeLessThan(0.01);
  });

  it('glutamate depolarises (EPSP) and GABA hyperpolarises (IPSP)', () => {
    for (const seed of SEEDS) {
      const g = make(seed, 'glutamate'); g.fire();
      const rg = run(g, 3);
      expect(rg.max).toBeGreaterThan(V_REST + 0.4);
      expect(rg.min).toBeGreaterThan(V_REST - 0.01);
      const i = make(seed, 'gaba'); i.pRelease = 1; i.fire();
      const ri = run(i, 3);
      expect(ri.min).toBeLessThan(V_REST - 1);
      expect(ri.max).toBeLessThan(V_REST + 0.01);
    }
  });

  it('a single spike stays below threshold; a burst sums and fires the next neuron', () => {
    const single = mean((seed) => { const s = make(seed); s.fire(); const r = run(s, 4); expect(s.postSpikes).toBe(0); return r.max; });
    let fired = 0;
    const burst = mean((seed) => { const s = make(seed); s.burst(5); const r = run(s, 5); if (s.postSpikes > 0) fired++; return s.postSpikes > 0 ? V_THRESHOLD : r.max; });
    expect(single).toBeLessThan(V_THRESHOLD - 4);
    expect(burst).toBeGreaterThan(single + 4);
    expect(fired).toBeGreaterThanOrEqual(SEEDS.length - 2);
  });

  it('benzodiazepine enlarges the IPSP but does nothing without GABA', () => {
    const quiet = make(1, 'gaba', ['benzo']);
    expect(Math.abs(run(quiet, 4).min - V_REST)).toBeLessThan(0.01);
    const plain = mean((seed) => { const s = make(seed, 'gaba'); s.pRelease = 1; s.fire(); return run(s, 4).min; });
    const benzo = mean((seed) => { const s = make(seed, 'gaba', ['benzo']); s.pRelease = 1; s.fire(); return run(s, 4).min; });
    expect(benzo).toBeLessThan(plain - 0.5);
  });

  it('NMDA receptors stay shut for a lone spike and open during a burst; bursts insert AMPA receptors (LTP toy)', () => {
    const s = make(4);
    s.fire();
    let nmdaOpen = false;
    const watch = (frames: number) => {
      for (let i = 0; i < frames; i++) { s.step(1 / 60); nmdaOpen ||= s.receptors.some((r) => r.kind === 'nmda' && r.conducting); }
    };
    watch(240);
    expect(nmdaOpen).toBe(false);
    const before = s.ampaCount;
    for (let k = 0; k < 3; k++) { s.burst(5); watch(360); }
    expect(nmdaOpen).toBe(true);
    expect(s.ampaCount).toBeGreaterThan(before);
    // ketamine blocks the NMDA pore, so no extra receptors are added
    const k = make(4, 'glutamate', ['ketamine']);
    for (let n = 0; n < 3; n++) { k.burst(5); run(k, 6); }
    expect(k.ampaCount).toBe(before);
    s.resetLTP();
    expect(s.ampaCount).toBe(before);
  });

  it('dopamine does not move the voltage directly but raises a slow internal signal; haloperidol blocks D2', () => {
    const s = make(2, 'dopamine'); s.pRelease = 1; s.fire();
    let peakM = 0, maxDv = 0;
    for (let i = 0; i < 300; i++) { s.step(1 / 60); peakM = Math.max(peakM, s.messenger); maxDv = Math.max(maxDv, Math.abs(s.vm - V_REST)); }
    expect(peakM).toBeGreaterThan(0.1);
    expect(maxDv).toBeLessThan(0.01);
    const h = make(2, 'dopamine', ['antipsychotic']);
    expect(h.receptors.filter((r) => r.kind === 'd2').every((r) => r.blocked)).toBe(true);
    expect(h.receptors.filter((r) => r.kind === 'd1').some((r) => r.blocked)).toBe(false);
  });

  it('step-through mode pauses at each stage in order', () => {
    const s = make(6); s.pRelease = 1; s.stepMode = true;
    s.fire();
    const stages: number[] = [];
    for (let i = 0; i < 60 * 40 && stages.length < 6; i++) {
      s.step(1 / 60);
      if (s.held) { stages.push(s.stage); const t = s.t; s.step(0.5); expect(s.t).toBe(t); s.next(); }
    }
    expect(stages).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a busy synapse runs low on docked vesicles (short-term depression)', () => {
    const s = make(7); s.pRelease = 0.9;
    s.burst(5, 0.25);
    let minDocked = 8;
    for (let i = 0; i < 180; i++) { s.step(1 / 60); minDocked = Math.min(minDocked, s.dockedCount); }
    expect(minDocked).toBeLessThan(3);
  });
});
