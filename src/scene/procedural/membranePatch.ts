/**
 * The "Channels" view of the Membrane level: a patch of lipid bilayer (1 unit = 1 nm) with
 * voltage-gated Na⁺ and K⁺ channels, K⁺ leak channels, a Na⁺/K⁺ pump and drifting ions.
 * Everything is instanced; the patch is driven each frame from the Hodgkin–Huxley state.
 *
 * Layout: x = along the membrane, y = up (outside the cell), z = toward the viewer.
 * The front row of channels is drawn cut open (front lobe removed) so the gates inside
 * the pore are visible, like a textbook cross-section.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MEM_COLORS } from '../../content/membrane';

export type ProteinKind = 'na' | 'k' | 'leak' | 'pump';
type ChannelState = 'closed' | 'open' | 'inactivated';

export const PATCH = { x0: -40, x1: 40, zBack: -11, zFront: 8.5, yMax: 15, headY: 2.3, faceY: 3.5 };
const PITCH = 10;
const RING = 2.9; // lobe ring radius
const LOBE_R = 1.7;
const LOBE_HALF = 4.7; // half height of a lobe
const PUMP_PERIOD_MS = 6;
const CHARGE_Y = 6.1;

const KIND_ID: Record<ProteinKind, string> = { na: 'na-channel', k: 'k-channel', leak: 'leak-channel', pump: 'pump' };
const KIND_COLOR: Record<ProteinKind, string> = {
  na: MEM_COLORS.naChannel, k: MEM_COLORS.kChannel, leak: MEM_COLORS.leak, pump: MEM_COLORS.pump,
};
const KIND_LABEL: Record<ProteinKind, string> = {
  na: 'Na⁺ channel', k: 'K⁺ channel', leak: 'K⁺ leak channel', pump: 'Na⁺/K⁺ pump',
};

interface Protein {
  kind: ProteinKind;
  x: number;
  z: number;
  front: boolean;
  /** footprint radius for lipids / ions */
  r: number;
  /** quantile used to sample this channel's state from the HH probabilities */
  u: number;
  jitterF: number;
  jitterP: number;
  state: ChannelState;
  blocked: boolean;
  gate: number; // 0 closed … 1 open (animated)
  ball: number; // 0 free … 1 plugged (animated)
  plug: number; // 0 … 1 toxin plug seated (animated)
  glow: number;
  emit: number;
  lobe0: number;
  lobeN: number;
  /** index among channels of the same kind */
  nth: number;
  color: THREE.Color;
  target: THREE.Color;
  stateTag?: CSS2DObject;
}

interface Ion {
  sp: 0 | 1; // 0 = Na⁺, 1 = K⁺
  i: number; // instance index within its species mesh
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  side: 1 | -1; // +1 outside the cell, −1 inside
  home: 1 | -1;
  mode: 0 | 1 | 2 | 3 | 4; // free | transit | fading out | fading in | scripted (pump)
  s: number; // scale
  ttl: number;
  // transit
  t: number;
  ax: number; ay: number; az: number;
  ex: number; ez: number;
  cx: number; cz: number;
  dir: 1 | -1;
}

export interface PatchDrive {
  V: number; m: number; h: number; n: number;
  ENa: number; EK: number;
  ttx: boolean; tea: boolean;
  /** simulated ms advanced this frame (0 when paused) */
  simDt: number;
  /** slow-motion factor, ms of simulation per second */
  speed: number;
  labels: boolean;
  highlight: string | null;
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glyphTexture(glyph: '+' | '−' | 'glow'): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (glyph === 'glow') {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  } else {
    const stroke = (w: number, style: string) => {
      g.strokeStyle = style; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(16, 32); g.lineTo(48, 32);
      if (glyph === '+') { g.moveTo(32, 16); g.lineTo(32, 48); }
      g.stroke();
    };
    stroke(17, 'rgba(8,10,20,0.6)');
    stroke(9, '#fff');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTag(text: string, cls = 'tag', color?: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  if (color) {
    const dot = document.createElement('i');
    dot.style.background = color;
    el.appendChild(dot);
  }
  el.appendChild(document.createTextNode(text));
  return new CSS2DObject(el);
}

/** additive blending that leaves the canvas alpha untouched (the stage background is CSS behind a transparent canvas) */
export const ADDITIVE = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
} as const;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export class MembranePatch {
  readonly group = new THREE.Group();
  readonly proteins: Protein[] = [];
  /** live counts for the read-outs */
  counts = { naOpen: 0, naInactivated: 0, naTotal: 0, kOpen: 0, kTotal: 0 };

  private uTime = { value: 0 };
  private lobes!: THREE.InstancedMesh;
  private flaps!: THREE.InstancedMesh;
  private balls!: THREE.InstancedMesh;
  private beads!: THREE.InstancedMesh;
  private plugs!: THREE.InstancedMesh;
  private glows!: THREE.InstancedMesh;
  private ionMesh!: [THREE.InstancedMesh, THREE.InstancedMesh];
  private ions: Ion[] = [];
  private pumpIons: Ion[] = [];
  private pump!: Protein;
  private pumpPhase = 0.05;
  private atp!: THREE.Mesh;
  private atpTag!: CSS2DObject;
  private foot!: THREE.Mesh;
  private chargeTop!: THREE.Points;
  private chargeBottom!: THREE.Points;
  private texPlus = glyphTexture('+');
  private texMinus = glyphTexture('−');
  private chargeSlots = 0;
  private proxies: THREE.Object3D[] = [];
  private tags: CSS2DObject[] = [];
  private rand = mulberry32(20240607);
  private time = 0;
  private channels: Protein[] = [];
  private labelsOn = true;

  constructor() {
    this.layout();
    this.buildLipids();
    this.buildProteins();
    this.buildIons();
    this.buildCharges();
    this.buildTags();
    this.buildProxies();
  }

  // ------------------------------------------------------------------ layout
  private layout() {
    const front: ProteinKind[] = ['pump', 'na', 'k', 'na', 'k', 'na', 'leak'];
    const back: ProteinKind[] = ['leak', 'k', 'na', 'k', 'na', 'k', 'na', 'na'];
    const add = (kind: ProteinKind, x: number, z: number, isFront: boolean) => {
      this.proteins.push({
        kind, x, z, front: isFront, r: kind === 'leak' ? 3.7 : 4.9, u: 0.5, jitterF: 0.6 + this.rand() * 0.9, jitterP: this.rand() * 6.28,
        state: 'closed', blocked: false, gate: 0, ball: 0, plug: 0, glow: 0, emit: this.rand(), lobe0: 0, lobeN: 0, nth: 0,
        color: new THREE.Color(KIND_COLOR[kind]), target: new THREE.Color(KIND_COLOR[kind]),
      });
    };
    front.forEach((k, i) => add(k, (i - 3) * PITCH, 6.6, true));
    back.forEach((k, i) => add(k, (i - 3.5) * PITCH, -5, false));
    // Quantiles: channels with the lowest u open first, those with the highest inactivate first.
    // Front-row (cut-open) channels get the low ranks so the action happens where it can be seen.
    for (const kind of ['na', 'k'] as const) {
      const list = this.proteins.filter((p) => p.kind === kind);
      const f = list.filter((p) => p.front), b = list.filter((p) => !p.front);
      const order: Protein[] = [];
      while (f.length || b.length) {
        if (f.length) order.push(f.shift()!);
        if (order.length >= 2 && b.length) order.push(b.shift()!);
        else if (!f.length && b.length) order.push(b.shift()!);
      }
      order.forEach((p, i) => { p.u = (i + 0.5) / order.length; p.nth = i; });
      this.channels.push(...list);
    }
    this.counts.naTotal = this.proteins.filter((p) => p.kind === 'na').length;
    this.counts.kTotal = this.proteins.filter((p) => p.kind === 'k').length;
    this.pump = this.proteins.find((p) => p.kind === 'pump')!;
  }

  private wobble(mat: THREE.MeshStandardMaterial, amp: number) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          transformed += vec3(
            sin(uTime * 2.1 + ip.x * 3.1 + ip.z * 1.3),
            sin(uTime * 2.9 + ip.x * 1.7 + ip.z * 2.9),
            cos(uTime * 2.4 + ip.x * 2.3 - ip.z * 1.9)) * ${amp.toFixed(3)};
        #endif`,
      );
    };
  }

  private buildLipids() {
    const spacing = 0.95;
    const rowH = spacing * 0.866;
    const pts: { x: number; z: number }[] = [];
    let row = 0;
    for (let z = PATCH.zBack + 0.4; z <= PATCH.zFront - 0.3; z += rowH, row++) {
      for (let x = PATCH.x0 + 0.4 + (row % 2) * spacing * 0.5; x <= PATCH.x1 - 0.3; x += spacing) {
        let ok = true;
        for (const p of this.proteins) {
          const dx = x - p.x, dz = z - p.z;
          const rr = p.kind === 'leak' ? 3.3 : 4.5;
          if (dx * dx + dz * dz < rr * rr) { ok = false; break; }
        }
        if (ok) pts.push({ x: x + (this.rand() - 0.5) * 0.22, z: z + (this.rand() - 0.5) * 0.22 });
      }
    }
    const n = pts.length * 2;
    const headGeo = new THREE.SphereGeometry(0.54, 8, 6);
    const t1 = new THREE.CylinderGeometry(0.12, 0.1, 1.75, 4, 1, true);
    t1.rotateZ(0.06); t1.translate(-0.21, -1.32, 0);
    const t2 = new THREE.CylinderGeometry(0.12, 0.1, 1.75, 4, 1, true);
    t2.rotateZ(-0.06); t2.translate(0.21, -1.32, 0);
    const tailGeo = mergeGeometries([t1, t2])!;
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xcdbf9b, roughness: 0.8 });
    this.wobble(headMat, 0.09);
    this.wobble(tailMat, 0.09);
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const tails = new THREE.InstancedMesh(tailGeo, tailMat, n);
    const base = new THREE.Color(MEM_COLORS.lipid);
    let i = 0;
    for (const leaf of [1, -1]) {
      for (const p of pts) {
        _e.set(leaf === 1 ? (this.rand() - 0.5) * 0.25 : Math.PI + (this.rand() - 0.5) * 0.25, this.rand() * 6.28, (this.rand() - 0.5) * 0.25, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(p.x + (leaf === 1 ? 0 : 0.3), leaf * (PATCH.headY + (this.rand() - 0.5) * 0.22), p.z);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        heads.setMatrixAt(i, _m);
        tails.setMatrixAt(i, _m);
        _c.copy(base).offsetHSL((this.rand() - 0.5) * 0.03, 0, (this.rand() - 0.5) * 0.1);
        heads.setColorAt(i, _c);
        i++;
      }
    }
    heads.frustumCulled = tails.frustumCulled = false;
    this.group.add(heads, tails);
  }

  // ---------------------------------------------------------------- proteins
  private buildProteins() {
    // lobes
    let lobeCount = 0;
    for (const p of this.proteins) {
      p.lobe0 = lobeCount;
      p.lobeN = p.kind === 'leak' || p.kind === 'pump' ? 2 : p.front ? 3 : 4;
      lobeCount += p.lobeN;
    }
    const lobeGeo = new THREE.CapsuleGeometry(LOBE_R, (LOBE_HALF - LOBE_R) * 2, 6, 14);
    const lobeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.08 });
    this.lobes = new THREE.InstancedMesh(lobeGeo, lobeMat, lobeCount);
    this.lobes.frustumCulled = false;
    for (const p of this.proteins) {
      if (p.kind === 'pump') { this.placePumpLobes(-1); continue; }
      const angles = p.kind === 'leak' ? [0, Math.PI] : p.front ? [0, Math.PI / 2, Math.PI] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      const ring = p.kind === 'leak' ? 2.0 : RING;
      angles.forEach((a, j) => {
        _p.set(p.x + Math.cos(a) * ring, 0, p.z - Math.sin(a) * ring);
        _q.setFromEuler(_e.set(0, a + Math.PI / 2, 0));
        if (p.kind === 'leak') _s.set(1.55, 0.86, 0.8); else _s.set(1.36, 1, 1);
        this.lobes.setMatrixAt(p.lobe0 + j, _m.compose(_p, _q, _s));
      });
    }
    this.group.add(this.lobes);
    this.paintLobes(true);

    // activation gates: two flaps per voltage-gated channel, hinged on the pore walls
    const flapGeo = new THREE.BoxGeometry(1.22, 0.34, 2.3);
    flapGeo.translate(0.61, 0, 0);
    this.flaps = new THREE.InstancedMesh(flapGeo, new THREE.MeshStandardMaterial({
      color: 0xfff4d2, roughness: 0.35, emissive: 0xfff0c0, emissiveIntensity: 0.25,
    }), this.channels.length * 2);
    this.flaps.frustumCulled = false;
    this.group.add(this.flaps);

    // inactivation ball and chain (Na⁺ channels only)
    const nNa = this.counts.naTotal;
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.98, 16, 12), new THREE.MeshStandardMaterial({
      color: MEM_COLORS.ball, roughness: 0.35, emissive: MEM_COLORS.ball, emissiveIntensity: 0.35,
    }), nNa);
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.36, 8, 6), new THREE.MeshStandardMaterial({
      color: 0xf2b6a0, roughness: 0.5,
    }), nNa * 6);
    this.balls.frustumCulled = this.beads.frustumCulled = false;
    this.group.add(this.balls, this.beads);

    // toxin plugs (TTX on Na⁺ channels from outside, TEA on K⁺ channels from inside)
    this.plugs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 0), new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.0, flatShading: true,
    }), this.channels.length);
    this.plugs.frustumCulled = false;
    this.channels.forEach((p, i) => this.plugs.setColorAt(i, _c.set(p.kind === 'na' ? MEM_COLORS.ttx : MEM_COLORS.tea)));
    this.group.add(this.plugs);

    // glowing column inside an open pore
    const glowGeo = new THREE.CylinderGeometry(0.8, 0.8, LOBE_HALF * 2 + 1.5, 12, 1, true);
    this.glows = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...ADDITIVE,
    }), this.proteins.length);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 2;
    this.proteins.forEach((p, i) => {
      _m.compose(_p.set(p.x, 0, p.z), _q.identity(), _s.set(p.kind === 'leak' ? 0.6 : 1, 1, 1));
      this.glows.setMatrixAt(i, _m);
      this.glows.setColorAt(i, _c.setRGB(0, 0, 0));
    });
    this.group.add(this.glows);

    // pump extras: cytoplasmic "foot" where ATP docks, and the ATP itself
    this.foot = new THREE.Mesh(new THREE.SphereGeometry(2.3, 20, 14), new THREE.MeshStandardMaterial({
      color: MEM_COLORS.pump, roughness: 0.45, emissive: 0xfff29a, emissiveIntensity: 0,
    }));
    this.foot.scale.set(1, 0.8, 1);
    this.foot.position.set(this.pump.x + 3.6, -7.0, this.pump.z - 0.6);
    this.atp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), new THREE.MeshStandardMaterial({
      color: 0xfff29a, emissive: 0xffe566, emissiveIntensity: 0.9, flatShading: true, roughness: 0.4,
    }));
    this.atpTag = makeTag('ATP', 'tag small mem-atp');
    this.atpTag.position.set(0, -1.6, 0);
    this.atp.add(this.atpTag);
    this.group.add(this.foot, this.atp);
    this.tags.push(this.atpTag);
  }

  /** the pump's two jaws rock between open-to-inside (j = −1) and open-to-outside (j = +1) */
  private placePumpLobes(j: number) {
    const p = this.pump;
    const tilt = 0.2 * j;
    for (let k = 0; k < 2; k++) {
      const sgn = k === 0 ? -1 : 1;
      _p.set(p.x + sgn * 2.45, 0, p.z);
      _q.setFromEuler(_e.set(0, 0, -sgn * tilt));
      _s.set(1.2, 1.28, 1.7);
      this.lobes.setMatrixAt(p.lobe0 + k, _m.compose(_p, _q, _s));
    }
  }

  private paintLobes(force = false) {
    let dirty = force;
    for (const p of this.proteins) {
      if (!force && p.color.equals(p.target)) continue;
      if (force) p.color.copy(p.target); else p.color.lerp(p.target, 0.18);
      if (Math.abs(p.color.r - p.target.r) + Math.abs(p.color.g - p.target.g) + Math.abs(p.color.b - p.target.b) < 0.004) p.color.copy(p.target);
      for (let j = 0; j < p.lobeN; j++) {
        // the back wall of a cut-open channel is shaded so the pore reads as a slot
        const inner = p.front && p.lobeN === 3 && j === 1;
        this.lobes.setColorAt(p.lobe0 + j, inner ? _c.copy(p.color).multiplyScalar(0.42) : p.color);
      }
      dirty = true;
    }
    if (dirty && this.lobes.instanceColor) this.lobes.instanceColor.needsUpdate = true;
  }

  // -------------------------------------------------------------------- ions
  private buildIons() {
    const geo = new THREE.SphereGeometry(0.56, 12, 9);
    const mk = (color: string, count: number) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.85, roughness: 0.35,
      }), count);
      mesh.frustumCulled = false;
      return mesh;
    };
    const plan: [0 | 1, 1 | -1, number][] = [[0, 1, 112], [0, -1, 10], [1, -1, 112], [1, 1, 6]];
    const counts = [0, 0];
    for (const [sp, side, n] of plan) {
      for (let k = 0; k < n; k++) {
        const ion = this.blankIon(sp, counts[sp]++);
        ion.side = ion.home = side;
        this.spawn(ion, false);
        ion.mode = 0; ion.s = 1;
        this.ions.push(ion);
      }
    }
    // five ions choreographed by the pump: 3 Na⁺ out, 2 K⁺ in
    for (let k = 0; k < 5; k++) {
      const sp = k < 3 ? 0 : 1;
      const ion = this.blankIon(sp, counts[sp]++);
      ion.mode = 4; ion.s = 0;
      this.pumpIons.push(ion);
    }
    this.ionMesh = [mk(MEM_COLORS.na, counts[0]), mk(MEM_COLORS.k, counts[1])];
    this.group.add(this.ionMesh[0], this.ionMesh[1]);
  }

  private blankIon(sp: 0 | 1, i: number): Ion {
    return { sp, i, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, side: 1, home: 1, mode: 0, s: 1, ttl: Infinity, t: 0, ax: 0, ay: 0, az: 0, ex: 0, ez: 0, cx: 0, cz: 0, dir: 1 };
  }

  private spawn(ion: Ion, far: boolean) {
    const r = this.rand;
    for (let tries = 0; tries < 12; tries++) {
      ion.x = PATCH.x0 + 1 + r() * (PATCH.x1 - PATCH.x0 - 2);
      ion.z = PATCH.zBack + 0.5 + r() * (PATCH.zFront - PATCH.zBack);
      const lo = far ? 9 : PATCH.faceY + 0.6;
      ion.y = ion.side * (lo + r() * (PATCH.yMax - lo - 0.5));
      if (!this.insideProtein(ion.x, ion.y, ion.z)) break;
    }
    ion.vx = ion.vy = ion.vz = 0;
    ion.ttl = Infinity;
  }

  private insideProtein(x: number, y: number, z: number) {
    if (Math.abs(y) > 8.2) return false;
    for (const p of this.proteins) {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz < (p.r + 0.4) * (p.r + 0.4) && Math.abs(y) < (p.kind === 'pump' ? 8.2 : 5.6)) return true;
    }
    return false;
  }

  private gauss() {
    const r = this.rand;
    return (r() + r() + r() - 1.5) * 2;
  }

  /** send the nearest suitable ion through channel p; dir +1 = outward (K⁺), −1 = inward (Na⁺) */
  private launch(p: Protein, sp: 0 | 1, dir: 1 | -1) {
    const from = -dir as 1 | -1;
    const my = from * 6.5;
    let best: Ion | null = null, bd = Infinity;
    for (const ion of this.ions) {
      if (ion.sp !== sp || ion.mode !== 0 || ion.side !== from) continue;
      const dx = ion.x - p.x, dy = ion.y - my, dz = ion.z - p.z;
      const d = dx * dx + dy * dy * 1.5 + dz * dz;
      if (d < bd) { bd = d; best = ion; }
    }
    if (!best) return;
    best.mode = 1; best.t = 0; best.dir = dir;
    best.ax = best.x; best.ay = best.y; best.az = best.z;
    best.cx = p.x; best.cz = p.z + (p.front ? 0.5 : 0);
    best.ex = p.x + (this.rand() - 0.5) * 7; best.ez = p.z + (this.rand() - 0.2) * 4;
  }

  private stepIons(dt: number, running: boolean) {
    const damp = Math.exp(-4 * dt);
    const kick = 9 * Math.sqrt(dt);
    for (const ion of this.ions) {
      if (ion.mode === 1) {
        // approach the mouth, slip through the pore, drift away on the far side
        ion.t += dt / 1.05;
        const t = ion.t;
        const from = -ion.dir;
        const yIn = from * 6.2, yOut = -from * 6.2;
        if (t < 0.38) {
          const k = ease(t / 0.38);
          ion.x = ion.ax + (ion.cx - ion.ax) * k; ion.y = ion.ay + (yIn - ion.ay) * k; ion.z = ion.az + (ion.cz - ion.az) * k;
        } else if (t < 0.8) {
          const k = (t - 0.38) / 0.42;
          ion.x = ion.cx; ion.z = ion.cz; ion.y = yIn + (yOut - yIn) * k;
        } else if (t < 1) {
          const k = ease((t - 0.8) / 0.2);
          ion.x = ion.cx + (ion.ex - ion.cx) * k; ion.z = ion.cz + (ion.ez - ion.cz) * k; ion.y = yOut - from * 3.4 * k;
        } else {
          ion.mode = 0;
          ion.side = -from as 1 | -1;
          ion.vx = (this.rand() - 0.5) * 4; ion.vy = ion.side * 3; ion.vz = (this.rand() - 0.5) * 3;
          ion.ttl = ion.side === ion.home ? Infinity : 3 + this.rand() * 2.5;
        }
        continue;
      }
      if (ion.mode === 2) { ion.s -= dt * 2.5; if (ion.s <= 0) { ion.s = 0; ion.side = ion.home; this.spawn(ion, true); ion.mode = 3; } continue; }
      if (ion.mode === 3) { ion.s += dt * 2; if (ion.s >= 1) { ion.s = 1; ion.mode = 0; } }
      if (!running) continue;
      ion.vx = ion.vx * damp + this.gauss() * kick;
      ion.vy = ion.vy * damp + this.gauss() * kick;
      ion.vz = ion.vz * damp + this.gauss() * kick;
      ion.x += ion.vx * dt; ion.y += ion.vy * dt; ion.z += ion.vz * dt;
      if (ion.x < PATCH.x0) { ion.x = PATCH.x0; ion.vx = Math.abs(ion.vx); } else if (ion.x > PATCH.x1) { ion.x = PATCH.x1; ion.vx = -Math.abs(ion.vx); }
      if (ion.z < PATCH.zBack) { ion.z = PATCH.zBack; ion.vz = Math.abs(ion.vz); } else if (ion.z > PATCH.zFront + 0.8) { ion.z = PATCH.zFront + 0.8; ion.vz = -Math.abs(ion.vz); }
      const ay = ion.y * ion.side;
      if (ay < PATCH.faceY) { ion.y = ion.side * PATCH.faceY; ion.vy = ion.side * Math.abs(ion.vy); }
      else if (ay > PATCH.yMax) { ion.y = ion.side * PATCH.yMax; ion.vy = -ion.side * Math.abs(ion.vy); }
      if (ay < 8.4) {
        for (const p of this.proteins) {
          const dx = ion.x - p.x, dz = ion.z - p.z;
          const rr = p.r + 0.5;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && ay < (p.kind === 'pump' ? 8.2 : 5.6)) {
            const d = Math.sqrt(d2) || 1;
            ion.x = p.x + (dx / d) * rr; ion.z = p.z + (dz / d) * rr;
            ion.vx += (dx / d) * 2; ion.vz += (dz / d) * 2;
          }
        }
      }
      if (ion.ttl !== Infinity) { ion.ttl -= dt; ion.vy += ion.side * 6 * dt; if (ion.ttl <= 0) ion.mode = 2; }
    }
  }

  private writeIons() {
    for (const list of [this.ions, this.pumpIons]) {
      for (const ion of list) {
        _m.compose(_p.set(ion.x, ion.y, ion.z), _q.identity(), _s.setScalar(Math.max(ion.s, 0.0001)));
        this.ionMesh[ion.sp].setMatrixAt(ion.i, _m);
      }
    }
    this.ionMesh[0].instanceMatrix.needsUpdate = true;
    this.ionMesh[1].instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------------------- charges
  private buildCharges() {
    const top: number[] = [], bottom: number[] = [];
    const slots: [number, number][] = [];
    // a clear row of charges hugging each face, drawn just in front of the cut edge
    for (let x = PATCH.x0 + 1.2; x <= PATCH.x1 - 1; x += 2.35) slots.push([x, PATCH.zFront + 2.2]);
    // shuffle so that a partial fill is spread evenly
    const r = mulberry32(7);
    const order = slots.map((s) => ({ s, k: r() })).sort((a, b) => a.k - b.k).map((o) => o.s);
    for (const [x, z] of order) { top.push(x, CHARGE_Y, z); bottom.push(x, -CHARGE_Y, z); }
    this.chargeSlots = order.length;
    const mk = (arr: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({
        map: this.texPlus, size: 9.5, sizeAttenuation: true, transparent: true, depthWrite: false, color: 0xffffff, alphaTest: 0.02,
      }));
      pts.frustumCulled = false;
      pts.renderOrder = 3;
      return pts;
    };
    this.chargeTop = mk(top);
    this.chargeBottom = mk(bottom);
    this.group.add(this.chargeTop, this.chargeBottom);
  }

  private updateCharges(V: number) {
    const n = Math.round(this.chargeSlots * clamp01(Math.abs(V) / 75));
    const insideNeg = V < 0;
    const plus = 0xff9db0, minus = 0x9fb4ff;
    const topM = this.chargeTop.material as THREE.PointsMaterial;
    const botM = this.chargeBottom.material as THREE.PointsMaterial;
    topM.map = insideNeg ? this.texPlus : this.texMinus; topM.color.setHex(insideNeg ? plus : minus);
    botM.map = insideNeg ? this.texMinus : this.texPlus; botM.color.setHex(insideNeg ? minus : plus);
    this.chargeTop.geometry.setDrawRange(0, n);
    this.chargeBottom.geometry.setDrawRange(0, n);
  }

  // -------------------------------------------------------------------- tags
  private buildTags() {
    const seen = new Set<ProteinKind>();
    for (const p of this.proteins) {
      // label the middle Na⁺ channel rather than the first, to spread the labels out
      if (p.front && !seen.has(p.kind) && !(p.kind === 'na' && p.x < -5)) {
        seen.add(p.kind);
        const tag = makeTag(KIND_LABEL[p.kind], 'tag mem-name', KIND_COLOR[p.kind]);
        tag.position.set(p.x, p.kind === 'pump' ? 10.4 : 9.6, p.z);
        this.group.add(tag);
        this.tags.push(tag);
      }
      if ((p.kind === 'na' || p.kind === 'k') && p.front) {
        const tag = makeTag('closed', 'tag small mem-state');
        tag.position.set(p.x, LOBE_HALF + 1.5, p.z);
        tag.element.dataset.state = 'closed';
        p.stateTag = tag;
        this.group.add(tag);
        this.tags.push(tag);
      }
    }
    const region = (text: string, x: number, y: number, z: number, color: string) => {
      const tag = makeTag(text, 'tag mem-region', color);
      tag.position.set(x, y, z);
      this.group.add(tag);
      this.tags.push(tag);
    };
    region('OUTSIDE THE CELL · crowded with Na⁺', PATCH.x0 + 16, 14, PATCH.zBack, MEM_COLORS.na);
    region('INSIDE THE CELL · crowded with K⁺', PATCH.x0 + 15, -13.5, PATCH.zFront, MEM_COLORS.k);
    const bl = makeTag('lipid bilayer', 'tag small', MEM_COLORS.lipid);
    bl.position.set(PATCH.x0 + 2.6, 0, PATCH.zFront + 0.6);
    this.group.add(bl);
    this.tags.push(bl);
  }

  setLabels(on: boolean) {
    if (on === this.labelsOn) return;
    this.labelsOn = on;
    for (const t of this.tags) t.visible = on;
  }

  /** hide label DOM nodes when the level leaves the scene */
  hideDom() {
    for (const t of this.tags) t.element.style.display = 'none';
  }

  // ----------------------------------------------------------------- picking
  private buildProxies() {
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    for (const p of this.proteins) {
      const h = p.kind === 'pump' ? 17 : p.kind === 'na' ? 14 : 10.5;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, h, 10), mat);
      m.position.set(p.x, p.kind === 'pump' || p.kind === 'na' ? -1.6 : 0, p.z);
      m.userData.id = KIND_ID[p.kind];
      this.group.add(m);
      this.proxies.push(m);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PATCH.x1 - PATCH.x0, 5.6, PATCH.zFront - PATCH.zBack), mat);
    slab.position.set(0, 0, (PATCH.zFront + PATCH.zBack) / 2);
    slab.userData.id = 'bilayer';
    this.group.add(slab);
    this.proxies.push(slab);
  }

  pick(ray: THREE.Raycaster): { id: string; point: THREE.Vector3 } | null {
    this.group.updateMatrixWorld();
    const hit = ray.intersectObjects(this.proxies, false)[0];
    let best: { id: string; point: THREE.Vector3 } | null = hit ? { id: hit.object.userData.id as string, point: hit.point } : null;
    let bd = hit ? hit.distance : Infinity;
    // ions: nearest one whose (slightly enlarged) sphere the ray passes through
    const inv = _m.copy(this.group.matrixWorld).invert();
    const local = ray.ray.clone().applyMatrix4(inv);
    for (const list of [this.ions, this.pumpIons]) {
      for (const ion of list) {
        if (ion.s < 0.5) continue;
        _p.set(ion.x, ion.y, ion.z);
        if (local.distanceSqToPoint(_p) < 0.9 * 0.9) {
          const d = local.origin.distanceTo(_p);
          if (d < bd + 0.6) { bd = d; best = { id: ion.sp === 0 ? 'na-ion' : 'k-ion', point: _p.clone().applyMatrix4(this.group.matrixWorld) }; }
        }
      }
    }
    return best;
  }

  /** a good point to look at for a selectable id */
  focusOf(id: string): THREE.Vector3 {
    const kind = (Object.keys(KIND_ID) as ProteinKind[]).find((k) => KIND_ID[k] === id);
    if (kind) {
      const list = this.proteins.filter((p) => p.kind === kind && p.front);
      const p = list[Math.floor((list.length - 1) / 2)];
      return new THREE.Vector3(p.x, -1, p.z);
    }
    if (id === 'na-ion') return new THREE.Vector3(0, 8, 2);
    if (id === 'k-ion') return new THREE.Vector3(0, -8, 4);
    return new THREE.Vector3(14, 0, PATCH.zFront);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, d: PatchDrive) {
    const running = d.simDt > 0;
    if (running) this.time += dt;
    this.uTime.value = this.time;
    this.setLabels(d.labels);

    const naP = d.m * d.m * d.m * d.h;
    const kP = d.n * d.n * d.n * d.n;
    let naOpen = 0, naInact = 0, kOpen = 0;
    const rateBoost = Math.pow(Math.min(Math.max(d.speed / 0.5, 1), 16), 0.55);
    const anim = (cur: number, target: number, k: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));

    this.channels.forEach((p, ci) => {
      // --- sample the state of this individual channel from the HH probabilities
      const u = p.u + 0.045 * Math.sin(this.time * p.jitterF * 2.2 + p.jitterP);
      let state: ChannelState = 'closed';
      if (p.kind === 'na') state = u > d.h ? 'inactivated' : u < naP ? 'open' : 'closed';
      else state = u < kP ? 'open' : 'closed';
      p.blocked = p.kind === 'na' ? d.ttx : d.tea;
      const conducting = state === 'open' && !p.blocked;
      if (p.kind === 'na') { if (conducting) naOpen++; if (state === 'inactivated') naInact++; } else if (conducting) kOpen++;
      const label = p.blocked ? 'blocked' : state;
      if (p.stateTag && p.stateTag.element.dataset.state !== label) {
        p.stateTag.element.dataset.state = label;
        p.stateTag.element.textContent = label === 'open' ? 'OPEN' : label;
      }
      p.state = state;

      // --- animate gate, ball, plug, glow
      const gateOpen = state === 'open' || (state === 'inactivated' && d.V > -52);
      p.gate = anim(p.gate, gateOpen ? 1 : 0, 16);
      p.ball = anim(p.ball, state === 'inactivated' ? 1 : 0, 11);
      p.plug = anim(p.plug, p.blocked ? 1 : 0, 5);
      p.glow = anim(p.glow, conducting ? 1 : 0, 14);

      const base = _c.set(KIND_COLOR[p.kind]);
      if (p.blocked) p.target.copy(base).lerp(new THREE.Color(0x5a5f6e), 0.62);
      else if (state === 'open') p.target.copy(base).multiplyScalar(1.35);
      else if (state === 'inactivated') p.target.copy(base).lerp(new THREE.Color(0x3b2a33), 0.5);
      else p.target.copy(base);
      if (d.highlight === KIND_ID[p.kind]) p.target.lerp(new THREE.Color(0xffffff), 0.16);

      // flaps
      const hingeY = -1.9, hingeX = RING - LOBE_R;
      const a = p.gate * 1.38;
      _m.compose(_p.set(p.x - hingeX, hingeY, p.z), _q.setFromEuler(_e.set(0, 0, -a)), _s.set(1, 1, 1));
      this.flaps.setMatrixAt(ci * 2, _m);
      _m.compose(_p.set(p.x + hingeX, hingeY, p.z), _q.setFromEuler(_e.set(0, Math.PI, a, 'ZYX')), _s.set(1, 1, 1));
      this.flaps.setMatrixAt(ci * 2 + 1, _m);

      // toxin plug: TTX sits in the outer mouth, TEA in the inner mouth
      const out = p.kind === 'na' ? 1 : -1;
      const py = out * (LOBE_HALF - 0.2 + (1 - ease(p.plug)) * 6);
      _m.compose(_p.set(p.x, py, p.z + (p.front ? 0.3 : 0)), _q.setFromEuler(_e.set(this.time * 0.4, this.time * 0.3 + ci, 0)), _s.setScalar(Math.max(p.plug, 0.0001)));
      this.plugs.setMatrixAt(ci, _m);

      // ion traffic
      if (conducting && running) {
        const drive = p.kind === 'na' ? (d.ENa - d.V) / 115 : (d.V - d.EK) / 117;
        p.emit += dt * 5.5 * Math.max(0, drive) * rateBoost;
        while (p.emit >= 1) { p.emit -= 1; this.launch(p, p.kind === 'na' ? 0 : 1, p.kind === 'na' ? -1 : 1); }
      }
    });

    // inactivation balls and their chains
    let bi = 0;
    for (const p of this.proteins) {
      if (p.kind !== 'na') continue;
      const ax = p.x + RING, ay = -LOBE_HALF + 0.2, az = p.z;
      const sway = Math.sin(this.time * 1.7 + p.jitterP) * 0.5;
      const fx = p.x + RING + 1.4 + sway, fy = -LOBE_HALF - 3.6 + Math.cos(this.time * 1.3 + p.jitterP) * 0.25, fz = p.z + 1.2;
      const tx = p.x, ty = -3.55, tz = p.z;
      const k = ease(clamp01(p.ball));
      const bx = fx + (tx - fx) * k, by = fy + (ty - fy) * k, bz = fz + (tz - fz) * k;
      _m.compose(_p.set(bx, by, bz), _q.identity(), _s.set(1, 1, 1));
      this.balls.setMatrixAt(bi, _m);
      // chain: quadratic Bézier sagging below the straight line
      const mx = (ax + bx) / 2 + 0.6, my = Math.min(ay, by) - 1.6 - k * 0.6, mz = (az + bz) / 2 + 0.8;
      for (let j = 0; j < 6; j++) {
        const t = (j + 0.6) / 6.6, it = 1 - t;
        _p.set(it * it * ax + 2 * it * t * mx + t * t * bx, it * it * ay + 2 * it * t * my + t * t * by, it * it * az + 2 * it * t * mz + t * t * bz);
        this.beads.setMatrixAt(bi * 6 + j, _m.compose(_p, _q, _s));
      }
      bi++;
    }

    // leak channels: always open, a steady trickle of K⁺ outward
    this.proteins.forEach((p, i) => {
      if (p.kind === 'leak') {
        p.glow = 0.3;
        p.target.set(KIND_COLOR.leak);
        if (d.highlight === KIND_ID.leak) p.target.lerp(new THREE.Color(0xffffff), 0.16);
        if (running) {
          p.emit += dt * Math.min(1.1, 0.42 * Math.max(0, (d.V - d.EK) / 12));
          if (p.emit >= 1) { p.emit -= 1; this.launch(p, 1, 1); }
        }
      }
      if (p.kind === 'pump') {
        p.target.set(KIND_COLOR.pump);
        if (d.highlight === KIND_ID.pump) p.target.lerp(new THREE.Color(0xffffff), 0.16);
      }
      const g = p.glow * (p.kind === 'leak' ? 0.32 : 0.5);
      _c.set(p.kind === 'na' ? MEM_COLORS.na : MEM_COLORS.k).multiplyScalar(g);
      this.glows.setColorAt(i, _c);
    });

    this.updatePump(d.simDt);
    this.stepIons(dt, running);
    this.writeIons();
    this.updateCharges(d.V);
    this.paintLobes();

    this.flaps.instanceMatrix.needsUpdate = true;
    this.balls.instanceMatrix.needsUpdate = true;
    this.beads.instanceMatrix.needsUpdate = true;
    this.plugs.instanceMatrix.needsUpdate = true;
    this.lobes.instanceMatrix.needsUpdate = true;
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
    this.counts.naOpen = naOpen; this.counts.naInactivated = naInact; this.counts.kOpen = kOpen;
  }

  /** scripted pump cycle: 3 Na⁺ out, ATP split, 2 K⁺ in */
  private updatePump(simDt: number) {
    this.pumpPhase = (this.pumpPhase + simDt / PUMP_PERIOD_MS) % 1;
    const ph = this.pumpPhase;
    const p = this.pump;
    // jaws: −1 open to the inside, +1 open to the outside
    let j = -1;
    if (ph > 0.22 && ph <= 0.3) j = -1 + 2 * ease(seg(ph, 0.22, 0.3));
    else if (ph > 0.3 && ph <= 0.62) j = 1;
    else if (ph > 0.62 && ph <= 0.7) j = 1 - 2 * ease(seg(ph, 0.62, 0.7));
    this.placePumpLobes(j);

    const slotY = [1.5, 0, -1.5];
    this.pumpIons.forEach((ion, k) => {
      const z = p.z + 0.4;
      if (ion.sp === 0) {
        // Na⁺: gather below → bind in the cavity → released above
        const wx = p.x + (k - 1) * 2.2, wy = -9.5 - (k % 2) * 1.2;
        const inT = ease(seg(ph, 0.02 + k * 0.045, 0.14 + k * 0.045));
        const outT = ease(seg(ph, 0.31 + k * 0.03, 0.47 + k * 0.03));
        const appear = ph < 0.5 ? 1 : seg(ph, 0.86, 0.98);
        const cx = p.x, cy = slotY[k];
        if (ph >= 0.5) { ion.x = wx; ion.y = wy; ion.s = appear; }
        else if (outT > 0) { ion.x = cx + (k - 1) * 2.6 * outT; ion.y = cy + (10.5 - cy + k * 0.7) * outT; ion.s = 1 - seg(ph, 0.44 + k * 0.03, 0.5); }
        else { ion.x = wx + (cx - wx) * inT; ion.y = wy + (cy - wy) * inT; ion.s = 1; }
        ion.z = z;
      } else {
        // K⁺: arrive from above → bind → released below
        const kk = k - 3;
        const wx = p.x + (kk - 0.5) * 2.6, wy = 10 + kk * 1.2;
        const inT = ease(seg(ph, 0.44 + kk * 0.04, 0.58 + kk * 0.04));
        const outT = ease(seg(ph, 0.71 + kk * 0.04, 0.88 + kk * 0.04));
        const cx = p.x, cy = kk === 0 ? 0.9 : -0.9;
        if (ph < 0.38) { ion.s = 0; ion.x = wx; ion.y = wy; }
        else if (outT > 0) { ion.x = cx + (kk - 0.5) * 3.2 * outT; ion.y = cy + (-10.5 - cy) * outT; ion.s = 1 - seg(ph, 0.86 + kk * 0.04, 0.95 + kk * 0.03); }
        else { ion.x = wx + (cx - wx) * inT; ion.y = wy + (cy - wy) * inT; ion.s = seg(ph, 0.38, 0.44); }
        ion.z = z;
      }
    });

    // ATP docks on the foot, is split as the jaws flip, and leaves as ADP
    const fx = this.foot.position.x, fy = this.foot.position.y, fz = this.foot.position.z;
    const dock = ease(seg(ph, 0.08, 0.2));
    const leave = ease(seg(ph, 0.32, 0.46));
    const flash = ph > 0.2 && ph < 0.34 ? Math.sin(seg(ph, 0.2, 0.34) * Math.PI) : 0;
    const visible = ph > 0.06 && ph < 0.46;
    this.atp.visible = visible;
    this.atp.position.set(fx + 2.2 + (1 - dock) * 6 + leave * 6, fy - 1.2 - (1 - dock) * 3 - leave * 4, fz + 1.6);
    this.atp.rotation.set(ph * 20, ph * 14, 0);
    this.atp.scale.setScalar(visible ? 1 - leave * 0.45 : 0.001);
    (this.atp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + flash * 2 - leave * 0.4;
    (this.foot.material as THREE.MeshStandardMaterial).emissiveIntensity = flash * 0.7;
    const text = ph < 0.24 ? 'ATP' : 'ADP + Pᵢ';
    if (this.atpTag.element.textContent !== text) this.atpTag.element.textContent = text;
    this.atpTag.visible = this.labelsOn && visible;
  }
}
