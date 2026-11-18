import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mni } from '../BrainModel';
import type { FanSpec, P3, SegSpec, TargetSpec } from './systemsAnatomy';

export const toScene = (p: P3) => mni(p[0], p[1], p[2]);
const toMni = (v: THREE.Vector3): P3 => [-v.x * 10, v.z * 10, v.y * 10];
const mirrored = (pts: THREE.Vector3[]) => pts.map((p) => new THREE.Vector3(-p.x, p.y, p.z));

/** small deterministic PRNG so the fibres look the same on every load */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** picks well-spread points on the atlas meshes (cortex, deep nuclei, cerebellum) to aim fibres at */
export class VertexSampler {
  private cache = new Map<string, THREE.BufferAttribute[]>();

  constructor(private group: THREE.Object3D) {}

  private attrs(prefixes: string[]) {
    const key = prefixes.join('|');
    let hit = this.cache.get(key);
    if (!hit) {
      hit = [];
      for (const o of this.group.children) {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !prefixes.some((p) => m.name.startsWith(p))) continue;
        if (/unknown|corpuscallosum/.test(m.name)) continue;
        hit.push(m.geometry.attributes.position as THREE.BufferAttribute);
      }
      this.cache.set(key, hit);
    }
    return hit;
  }

  sample(spec: TargetSpec, rand: () => number): THREE.Vector3[] {
    if ('pts' in spec) return spec.pts.map(toScene);
    const attrs = this.attrs(spec.mesh);
    const total = attrs.reduce((n, a) => n + a.count, 0);
    if (!total) return [];
    const cands: THREE.Vector3[] = [];
    const want = spec.n * 16;
    for (let tries = 0; tries < want * 6 && cands.length < want; tries++) {
      let i = Math.floor(rand() * total);
      let a = attrs[0];
      for (const b of attrs) {
        if (i < b.count) { a = b; break; }
        i -= b.count;
      }
      const v = new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i));
      if (spec.filter && !spec.filter(toMni(v))) continue;
      cands.push(v);
    }
    if (!cands.length) return [];
    // farthest-point sampling → even coverage
    const chosen: THREE.Vector3[] = [cands[Math.floor(rand() * cands.length)]];
    const dist = cands.map((c) => c.distanceToSquared(chosen[0]));
    while (chosen.length < Math.min(spec.n, cands.length)) {
      let best = 0;
      for (let i = 1; i < cands.length; i++) if (dist[i] > dist[best]) best = i;
      const c = cands[best];
      chosen.push(c);
      for (let i = 0; i < cands.length; i++) dist[i] = Math.min(dist[i], cands[i].distanceToSquared(c));
    }
    const centre = new THREE.Vector3();
    cands.forEach((c) => centre.add(c));
    centre.divideScalar(cands.length);
    return chosen.map((c) => {
      const p = c.clone();
      if (spec.shrink) p.lerp(centre, spec.shrink * (0.4 + rand() * 0.9));
      if (spec.inset) {
        const core = new THREE.Vector3(Math.sign(p.x) * 2.4, 0.8, -1.5);
        p.add(core.sub(p).normalize().multiplyScalar(spec.inset));
      }
      return p;
    });
  }
}

interface Fibre {
  pts: THREE.Vector3[];
  radius: number;
  step: number;
  thick: boolean;
}

function fanFibres(spec: FanSpec, sampler: VertexSampler, rand: () => number): Fibre[] {
  const from = toScene(spec.from);
  const targets = sampler.sample(spec.targets, rand);
  const jitter = spec.jitter ?? 0.2;
  // resample each highway densely so a fibre can leave it anywhere
  const routes = spec.routes.map((r) => {
    const curve = new THREE.CatmullRomCurve3([from, ...r.map(toScene)], false, 'centripetal');
    const len = curve.getLength();
    const n = Math.max(2, Math.ceil(len / 0.4));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) pts.push(curve.getPointAt(i / n));
    return { pts, ds: len / n };
  });
  const out: Fibre[] = [];
  for (const T of targets) {
    let best = routes[0];
    let bi = best.pts.length - 1;
    if (spec.exit === 'end') {
      // choose the highway that ends nearest the target
      let bd = Infinity;
      for (const r of routes) {
        const d = r.pts[r.pts.length - 1].distanceTo(T);
        if (d < bd) { bd = d; best = r; bi = r.pts.length - 1; }
      }
    } else {
      let cost = Infinity;
      for (const r of routes) {
        for (let i = 1; i < r.pts.length; i++) {
          const c = 0.5 * i * r.ds + r.pts[i].distanceTo(T);
          if (c < cost) { cost = c; best = r; bi = i; }
        }
      }
    }
    const off = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2 * jitter);
    const pts: THREE.Vector3[] = [from.clone().addScaledVector(off, 0.25)];
    const every = Math.max(1, Math.round(1.3 / best.ds));
    for (let i = every; i < bi; i += every) {
      pts.push(best.pts[i].clone().addScaledVector(off, Math.min(1, 0.25 + (i * best.ds) / 2)));
    }
    const exit = best.pts[bi].clone().add(off);
    if (exit.distanceTo(pts[pts.length - 1]) > 0.35) pts.push(exit);
    const last = pts[pts.length - 1];
    const d = last.distanceTo(T);
    if (d > 1.6) {
      // a gentle bend on the way out to the target
      const mid = last.clone().lerp(T, 0.55);
      mid.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(d * 0.12));
      pts.push(mid);
    }
    if (d > 0.15) pts.push(T.clone());
    if (pts.length < 2) continue;
    out.push({ pts, radius: spec.radius ?? 0.03, step: 0, thick: false });
    if (spec.mirror) out.push({ pts: mirrored(pts), radius: spec.radius ?? 0.03, step: 0, thick: false });
  }
  return out;
}

function segFibres(spec: SegSpec): Fibre[] {
  const pts = spec.pts.map(toScene);
  const f: Fibre = { pts, radius: spec.radius ?? 0.085, step: spec.step, thick: true };
  return spec.mirror ? [f, { ...f, pts: mirrored(pts) }] : [f];
}

export interface BuiltTracts {
  geometry: THREE.BufferGeometry | null;
  /** points along the fibres, for cheap hover picking */
  pick: THREE.Vector3[];
  /** `step` of the fibre each pick point belongs to */
  pickStep: number[];
}

/**
 * Turns tract specs into one merged tube geometry.
 * Extra attributes: aU = arclength from the fibre's start (cm), aInfo = (fibre length, random phase, step).
 */
export function buildTracts(specs: (FanSpec | SegSpec)[], sampler: VertexSampler, seed: number): BuiltTracts {
  const rand = mulberry32(seed);
  const fibres = specs.flatMap((s) => (s.kind === 'fan' ? fanFibres(s, sampler, rand) : segFibres(s)));
  const parts: THREE.BufferGeometry[] = [];
  const pick: THREE.Vector3[] = [];
  const pickStep: number[] = [];
  for (const f of fibres) {
    const curve = new THREE.CatmullRomCurve3(f.pts, false, 'centripetal');
    const len = curve.getLength();
    if (!(len > 0.05)) continue;
    const segs = f.thick
      ? THREE.MathUtils.clamp(Math.ceil(len * 6), 10, 110)
      : THREE.MathUtils.clamp(Math.ceil(len * 2.4), 8, 46);
    const g = new THREE.TubeGeometry(curve, segs, f.radius, f.thick ? 7 : 4, false);
    const uv = g.attributes.uv;
    const aU = new Float32Array(uv.count);
    const aInfo = new Float32Array(uv.count * 3);
    const phase = f.thick ? 0 : rand();
    for (let i = 0; i < uv.count; i++) {
      aU[i] = uv.getX(i) * len;
      aInfo[i * 3] = len;
      aInfo[i * 3 + 1] = phase;
      aInfo[i * 3 + 2] = f.step;
    }
    g.deleteAttribute('uv');
    g.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    g.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 3));
    parts.push(g);
    const np = Math.max(3, Math.ceil(len / 0.9));
    for (let i = 0; i <= np; i++) {
      pick.push(curve.getPointAt(i / np));
      pickStep.push(f.step);
    }
  }
  const geometry = parts.length ? mergeGeometries(parts, false) : null;
  parts.forEach((p) => p.dispose());
  return { geometry, pick, pickStep };
}

/**
 * Additive blending that leaves the canvas alpha alone, so glows add onto the page background
 * instead of punching dark opaque shapes into the transparent canvas.
 */
export const ADDITIVE = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

/** additive glowing tube with pulses travelling along its length */
export function tractMaterial(color: THREE.Color, thick: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    ...ADDITIVE,
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: 0 },
      uTrunk: { value: thick ? 1 : 0.3 },
      uFlow: { value: 0 },
      uStep: { value: 0 },
      uSpacing: { value: thick ? 3.2 : 7 },
      uBase: { value: thick ? 0.5 : 0.3 },
      uSharp: { value: thick ? 5 : 9 },
    },
    vertexShader: /* glsl */ `
      attribute float aU; attribute vec3 aInfo;
      varying float vU; varying vec3 vInfo; varying vec3 vN; varying vec3 vV;
      void main(){
        vU = aU; vInfo = aInfo;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity, uFlow, uStep, uSpacing, uBase, uSharp, uTrunk;
      varying float vU; varying vec3 vInfo; varying vec3 vN; varying vec3 vV;
      void main(){
        float ph = fract((vU - uFlow) / uSpacing + vInfo.y);
        float pulse = pow(ph, uSharp);                 // bright head, fading tail behind it
        float sf = 1.0, pf = 1.0;
        if (uStep > 0.5) {
          if (abs(vInfo.z - uStep) < 0.5) { sf = 1.25; }
          else if (vInfo.z < uStep) { sf = 0.42; pf = 0.25; }
          else { sf = 0.09; pf = 0.0; }
        }
        float tip = smoothstep(vInfo.x - 0.35, vInfo.x, vU);
        float core = 0.4 + 0.6 * pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
        // many fibres share the first centimetres: dim them there so the trunk does not burn out
        float trunk = mix(uTrunk, 1.0, smoothstep(0.5, 5.0, vU));
        float glow = ((uBase + tip * 0.35) * sf + pulse * pf * sf * 1.5) * trunk;
        vec3 col = uColor * glow + vec3(1.0, 0.97, 0.92) * pulse * pf * sf * 0.4 * trunk;
        gl_FragColor = vec4(col * core * uOpacity, 1.0);
      }`,
  });
}

let haloTex: THREE.Texture | null = null;
/** soft round glow for nuclei and stations */
export function haloTexture(): THREE.Texture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

/** see-through rim-lit sphere (the eyeballs of the visual pathway) */
export function orbMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, ...ADDITIVE,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        gl_FragColor = vec4(uColor * (0.06 + f * 0.7) * uOpacity, 1.0);
      }`,
  });
}
