/**
 * Turns a Morph into one merged BufferGeometry (tapered tubes + soma + boutons) and provides the
 * shared cell material: MeshStandardMaterial extended with per-vertex "part" and "path" data so
 * the shader can colour parts, run a spike down the axon and flash dendrites on synaptic input.
 */
import * as THREE from 'three';
import { PART, STRIDE, type Morph, type SomaShape } from './cellsMorph';
import { PART_COLORS, SIGNAL_COLORS } from '../../content/cells';
import { ink, setGlowBlend } from '../theme3d';

const SIDES = [0, 5, 4, 7, 0];

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  part: number[] = [];
  path: number[] = [];
  rad: number[] = [];
  idx: number[] = [];
  get count() { return this.pos.length / 3; }

  tube(pts: number[], part: number) {
    const n = pts.length / STRIDE;
    if (n < 2) return;
    const sides = SIDES[part] || 5;
    const base = this.count;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    const P = new THREE.Vector3(), Q = new THREE.Vector3(), prevT = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * STRIDE, b = Math.min(n - 1, i + 1) * STRIDE;
      T.set(pts[b] - pts[a], pts[b + 1] - pts[a + 1], pts[b + 2] - pts[a + 2]);
      if (T.lengthSq() < 1e-10) T.set(0, 1, 0);
      T.normalize();
      if (i === 0) {
        N.set(1, 0, 0);
        if (Math.abs(T.x) > 0.9) N.set(0, 0, 1);
        N.addScaledVector(T, -N.dot(T)).normalize();
      } else {
        // parallel transport of the frame
        Q.crossVectors(prevT, T);
        const s = Q.length();
        if (s > 1e-5) {
          Q.multiplyScalar(1 / s);
          N.applyAxisAngle(Q, Math.asin(Math.min(1, s)));
        }
        N.addScaledVector(T, -N.dot(T)).normalize();
      }
      prevT.copy(T);
      B.crossVectors(T, N);
      const o = i * STRIDE;
      P.set(pts[o], pts[o + 1], pts[o + 2]);
      const r = pts[o + 3];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        v.copy(N).multiplyScalar(Math.cos(ang)).addScaledVector(B, Math.sin(ang));
        this.pos.push(P.x + v.x * r, P.y + v.y * r, P.z + v.z * r);
        this.nrm.push(v.x, v.y, v.z);
        this.part.push(part);
        this.path.push(pts[o + 4]);
        this.rad.push(r);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k, b = base + i * sides + ((k + 1) % sides);
        const c = a + sides, d = b + sides;
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }

  blob(geo: THREE.BufferGeometry, p: THREE.Vector3, scale: THREE.Vector3, part: number, path: number, rad: number) {
    const base = this.count;
    const gp = geo.getAttribute('position'), gn = geo.getAttribute('normal');
    for (let i = 0; i < gp.count; i++) {
      this.pos.push(p.x + gp.getX(i) * scale.x, p.y + gp.getY(i) * scale.y, p.z + gp.getZ(i) * scale.z);
      this.nrm.push(gn.getX(i), gn.getY(i), gn.getZ(i));
      this.part.push(part);
      this.path.push(path);
      this.rad.push(rad);
    }
    const gi = geo.getIndex()!;
    for (let i = 0; i < gi.count; i++) this.idx.push(base + gi.getX(i));
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aPath', new THREE.Float32BufferAttribute(this.path, 1));
    g.setAttribute('aRad', new THREE.Float32BufferAttribute(this.rad, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const somaCache = new Map<SomaShape, THREE.BufferGeometry>();
/** unit soma shapes */
export function somaGeometry(shape: SomaShape): THREE.BufferGeometry {
  let g = somaCache.get(shape);
  if (g) return g;
  g = new THREE.SphereGeometry(1, 18, 12);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = (y + 1) / 2;
    if (shape === 'pyramid') {
      // broad base, tapering into the apical dendrite
      const w = 1.12 - 0.72 * Math.pow(t, 1.25) - 0.1 * Math.pow(1 - t, 3);
      x *= w; z *= w; y *= 1.3;
    } else if (shape === 'ovoid') {
      x *= 0.86; z *= 0.86; y *= 1.18;
    } else if (shape === 'flask') {
      const w = 1.05 - 0.32 * Math.pow(t, 1.5);
      x *= w; z *= w * 0.92; y *= 1.22;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  somaCache.set(shape, g);
  return g;
}

let blobGeo: THREE.BufferGeometry | null = null;
let bigBlobGeo: THREE.BufferGeometry | null = null;

export function buildCellGeometry(m: Morph): THREE.BufferGeometry {
  const b = new Builder();
  for (const br of m.branches) b.tube(br.pts, br.part);
  if (m.soma) {
    const r = m.soma.r;
    b.blob(somaGeometry(m.soma.shape), m.soma.p, new THREE.Vector3(r, r, r), PART.soma, 0, r * 4);
  }
  blobGeo ??= new THREE.SphereGeometry(1, 7, 5);
  bigBlobGeo ??= new THREE.SphereGeometry(1, 14, 10);
  const s = new THREE.Vector3();
  for (const bl of m.blobs) {
    s.set(bl.r, bl.r, bl.r);
    if (bl.squash) s.multiply(bl.squash);
    b.blob(bl.r > 0.7 ? bigBlobGeo : blobGeo, bl.p, s, bl.part, bl.path, bl.r * 0.55);
  }
  return b.build();
}

// --------------------------------------------------------------------------- material

export interface SharedUniforms {
  uTime: { value: number };
  /** 0..1: colour neurons by part */
  uParts: { value: number };
  /** depth fade: start, end (view-space distance), strength */
  uFog: { value: THREE.Vector3 };
  /** minimum tube radius per unit of view depth (keeps hair-thin axons about a pixel wide) */
  uMinR: { value: number };
  uPartColors: { value: THREE.Color[] };
  uExc: { value: THREE.Color };
  uInh: { value: THREE.Color };
  /** 0 = dark stage (cells glow), 1 = light stage (cells are drawn as ink that fades into the paper) */
  uLight: { value: number };
}

const PART_LIST = [PART_COLORS.soma, PART_COLORS.dendrite, PART_COLORS.axon, PART_COLORS.myelin, PART_COLORS.terminal];
/** part colours as ink; myelin is a pale cream that needs a hand-picked dark version */
export const PART_INK = PART_LIST.map((c, i) => (i === 3 ? new THREE.Color('#857a62') : ink(c, 0.15)));
export const SIGNAL_INK = { excite: new THREE.Color('#e04a00'), inhibit: new THREE.Color('#0058d6') };

/** switch the uniforms every cell shares between the dark and the light stage */
export function setSharedLight(shared: SharedUniforms, light: boolean) {
  shared.uLight.value = light ? 1 : 0;
  shared.uPartColors.value.forEach((c, i) => (light ? c.copy(PART_INK[i]) : c.set(PART_LIST[i])));
  if (light) { shared.uExc.value.copy(SIGNAL_INK.excite); shared.uInh.value.copy(SIGNAL_INK.inhibit); }
  else { shared.uExc.value.set(SIGNAL_COLORS.excite); shared.uInh.value.set(SIGNAL_COLORS.inhibit); }
}

export function makeSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uParts: { value: 0 },
    uFog: { value: new THREE.Vector3(1e5, 2e5, 0) },
    uMinR: { value: 0 },
    uPartColors: { value: PART_LIST.map((c) => new THREE.Color(c)) },
    uExc: { value: new THREE.Color(SIGNAL_COLORS.excite) },
    uInh: { value: new THREE.Color(SIGNAL_COLORS.inhibit) },
    uLight: { value: 0 },
  };
}

export interface CellUniforms {
  /** 1 = fully lit, towards 0 = faded into the background */
  uDim: { value: number };
  /** path position (world units from the soma) of up to four travelling spikes; negative = none */
  uSpikes: { value: THREE.Vector4 };
  /** soma flash when the cell fires */
  uFire: { value: number };
  /** x: excitation on dendrites + soma, y: inhibition at the soma, z: inhibition on the distal tuft */
  uFlash: { value: THREE.Vector3 };
  /** longest dendrite / axon path, world units */
  uLen: { value: THREE.Vector2 };
  /** amplitude of slow tip motion (microglia) */
  uWiggle: { value: number };
  /** 1 for neurons (part colours apply), 0 for glia */
  uPartMask: { value: number };
  uSpikeColor: { value: THREE.Color };
  uHover: { value: number };
  uGlow: { value: number };
}

export function makeCellMaterial(color: string, shared: SharedUniforms, opts: { neuron: boolean; inhibitory?: boolean; wiggle?: number; maxDend: number; maxAxon: number }):
{ material: THREE.MeshStandardMaterial; uniforms: CellUniforms; setLight: (light: boolean) => void } {
  const uniforms: CellUniforms = {
    uDim: { value: 1 },
    uSpikes: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uFire: { value: 0 },
    uFlash: { value: new THREE.Vector3() },
    uLen: { value: new THREE.Vector2(opts.maxDend, opts.maxAxon) },
    uWiggle: { value: opts.wiggle ?? 0 },
    uPartMask: { value: opts.neuron ? 1 : 0 },
    uSpikeColor: { value: new THREE.Color(opts.inhibitory ? '#9fe0ff' : '#ffe2b0') },
    uHover: { value: 0 },
    uGlow: { value: 0.22 },
  };
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart; attribute float aPath; attribute float aRad;
        uniform float uTime; uniform float uMinR; uniform float uWiggle; uniform vec2 uLen;
        uniform float uLight; uniform float uFire; uniform vec3 uFlash; uniform vec4 uSpikes;
        varying float vPart; varying float vPath; varying float vDepth;
        float vSpikeAt(float s) {
          if (s < 0.0) return 0.0;
          float d = aPath - s;
          return d > 0.0 ? exp(-d * d / 3.0) : exp(d / 9.0);
        }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPart = aPart; vPath = aPath;
        if (uWiggle > 0.0) {
          float wk = uWiggle * smoothstep(0.2, 1.0, aPath / uLen.x);
          transformed += wk * vec3(
            sin(uTime * 0.9 + position.y * 1.7 + position.z * 1.1),
            sin(uTime * 0.7 + position.x * 1.3 + position.z * 0.9),
            sin(uTime * 0.8 + position.x * 1.9 + position.y * 1.2));
        }
        float cellDepth = -(modelViewMatrix * vec4(transformed, 1.0)).z;
        float minR = uMinR * cellDepth;
        if (uLight > 0.5) {
          // ink cannot glow: a signal makes the stroke heavier instead
          float vDend = 1.0 - step(1.5, aPart);
          float vNd = clamp(aPath / uLen.x, 0.0, 1.0);
          float sig = (1.0 - vDend) * (vSpikeAt(uSpikes.x) + vSpikeAt(uSpikes.y) + vSpikeAt(uSpikes.z) + vSpikeAt(uSpikes.w)) * 1.5
            + vDend * (uFlash.x * (0.45 + 0.55 * exp(-vNd * 2.5)) + uFlash.y * exp(-vNd * 10.0) + uFlash.z * smoothstep(0.5, 0.8, vNd)) * 0.9
            + vDend * uFire * exp(-vNd * 5.0);
          minR *= 1.0 + min(sig, 2.2);
        }
        transformed += objectNormal * max(0.0, minR - aRad);
        vDepth = cellDepth;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uParts; uniform float uPartMask; uniform float uDim; uniform float uFire; uniform float uHover;
        uniform float uGlow; uniform float uLight;
        uniform vec3 uFog; uniform vec3 uFlash; uniform vec2 uLen; uniform vec4 uSpikes;
        uniform vec3 uPartColors[5]; uniform vec3 uExc; uniform vec3 uInh; uniform vec3 uSpikeColor;
        varying float vPart; varying float vPath; varying float vDepth;
        float spikeAt(float s) {
          if (s < 0.0) return 0.0;
          float d = vPath - s;
          return d > 0.0 ? exp(-d * d / 3.0) : exp(d / 9.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        int partIdx = int(vPart + 0.5);
        vec3 partCol = uPartColors[partIdx];
        diffuseColor.rgb = mix(diffuseColor.rgb, partCol, uParts * uPartMask);
        if (partIdx == 3) diffuseColor.rgb = mix(diffuseColor.rgb, uPartColors[3], 0.8) * mix(0.45, 1.0, uLight);
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
        if (uLight > 0.5) diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, mix(0.45, 1.0, uDim));
        else diffuseColor.rgb = mix(lum * vec3(0.5, 0.54, 0.66), diffuseColor.rgb, uDim) * mix(0.15, 0.86, uDim);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float isSoma = 1.0 - step(0.5, vPart);
        float isDend = 1.0 - step(1.5, vPart);
        float isAxon = 1.0 - isDend;
        float nd = clamp(vPath / uLen.x, 0.0, 1.0);
        float dark = 1.0 - uLight;
        totalEmissiveRadiance += diffuseColor.rgb * (uGlow + uHover * 0.55) * (partIdx == 3 ? 0.45 : 1.0) * dark;
        float pulse = spikeAt(uSpikes.x) + spikeAt(uSpikes.y) + spikeAt(uSpikes.z) + spikeAt(uSpikes.w);
        float lit = mix(0.07, 1.0, uDim);
        totalEmissiveRadiance += uSpikeColor * pulse * isAxon * 2.4 * lit * dark;
        float epsp = uFlash.x * isDend * (0.45 + 0.55 * exp(-nd * 2.5));
        float ipsp = uFlash.y * isDend * exp(-nd * 10.0) + uFlash.z * isDend * smoothstep(0.5, 0.8, nd);
        totalEmissiveRadiance += (uExc * epsp * 0.85 + uInh * ipsp * 1.3) * lit * dark;
        float fire = uFire * (isSoma * 1.8 + (isDend - isSoma) * 0.6 * exp(-nd * 5.0));
        totalEmissiveRadiance += vec3(1.0, 0.93, 0.78) * fire * lit * dark;`)
      .replace('#include <opaque_fragment>', `
        float fogF = smoothstep(uFog.x, uFog.y, vDepth) * uFog.z;
        if (uLight > 0.5) {
          // ink on paper: flatter shading, signals as saturated darker colour, distance and dimming as transparency
          vec3 inkCol = mix(min(outgoingLight, diffuseColor.rgb * 1.25), diffuseColor.rgb, 0.7) * (1.0 - 0.38 * uHover) * (1.0 - 0.5 * (uGlow - 0.2));
          float sPulse = clamp(pulse * isAxon * 1.3, 0.0, 1.0);
          float sExc = clamp(epsp * 0.9, 0.0, 1.0);
          float sInh = clamp(ipsp * 1.2, 0.0, 1.0);
          float sFire = clamp(fire, 0.0, 1.0);
          inkCol = mix(inkCol, uExc, sExc);
          inkCol = mix(inkCol, uInh, sInh);
          inkCol = mix(inkCol, uSpikeColor, max(sPulse, sFire));
          float sig = max(max(sPulse, sFire), max(sExc, sInh)) * lit;
          outgoingLight = inkCol;
          float a = mix(0.1, 1.0, uDim * uDim) * (1.0 - fogF);
          diffuseColor.a = mix(a, 1.0, sig * 0.7);
        } else {
          outgoingLight = mix(outgoingLight, vec3(0.03, 0.045, 0.085), fogF);
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'cells-cell-v1';
  const base = new THREE.Color(color), inked = ink(color, 0.14);
  const spikeDark = new THREE.Color(opts.inhibitory ? '#9fe0ff' : '#ffe2b0');
  const spikeInk = new THREE.Color(opts.inhibitory ? '#0046c8' : '#d42a00');
  const setLight = (light: boolean) => {
    material.color.copy(light ? inked : base);
    uniforms.uSpikeColor.value.copy(light ? spikeInk : spikeDark);
    if (material.transparent !== light) { material.transparent = light; material.needsUpdate = true; }
  };
  return { material, uniforms, setLight };
}

/** tiny instanced bumps along dendrites (specimens) */
export function buildSpineMesh(m: Morph, color: string): THREE.InstancedMesh | null {
  const n = m.spines.length / 6;
  if (!n) return null;
  const geo = new THREE.SphereGeometry(1, 4, 3);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const o = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const k = i * 6;
    d.set(m.spines[k + 3], m.spines[k + 4], m.spines[k + 5]);
    const len = 0.2 + ((i * 7919) % 13) / 60;
    o.position.set(m.spines[k] + d.x * len * 0.7, m.spines[k + 1] + d.y * len * 0.7, m.spines[k + 2] + d.z * len * 0.7);
    o.quaternion.setFromUnitVectors(up, d);
    o.scale.set(0.085, len, 0.085);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** additive glow sprites: soma flashes, travelling spikes, synaptic sparks */
export class GlowPoints {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private n = 0;
  readonly max: number;
  private mat: THREE.ShaderMaterial;

  constructor(max: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uMinPx: { value: 5 }, uLight: { value: 0 } },
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; uniform float uScale; uniform float uMinPx;
        varying vec4 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(aSize * uScale / -mv.z, uMinPx);
          vColor = aColor;
        }`,
      fragmentShader: `
        varying vec4 vColor; uniform float uLight;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = pow(max(0.0, 1.0 - r), 2.2);
          // light stage: a soft blot of ink instead of added light
          if (uLight > 0.5) { gl_FragColor = vec4(vColor.rgb, min(0.9, pow(max(0.0, 1.0 - r), 1.5) * vColor.a * 0.8)); return; }
          gl_FragColor = vec4(vColor.rgb * a * vColor.a + vec3(1.0) * pow(a, 6.0) * vColor.a * 0.5, 1.0);
        }`,
      // add light without touching the canvas alpha (the page background shows through the canvas)
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      depthWrite: false, depthTest: true, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setLight(light: boolean) {
    this.mat.uniforms.uLight.value = light ? 1 : 0;
    setGlowBlend(this.mat, light, {
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
  }

  begin() { this.n = 0; }

  add(p: THREE.Vector3, color: THREE.Color, intensity: number, size: number) {
    if (this.n >= this.max || intensity <= 0.01) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b; this.col[i * 4 + 3] = intensity;
    this.size[i] = size;
  }

  end(pxPerUnitAtDepth1: number) {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aColor').needsUpdate = true;
    g.getAttribute('aSize').needsUpdate = true;
    this.mat.uniforms.uScale.value = pxPerUnitAtDepth1;
  }
}

/** merged tubes with the same vertex attributes as a cell (white-matter fibres and the like) */
export function buildTubeSet(items: { pts: THREE.Vector3[]; r: number; part: number }[]): THREE.BufferGeometry {
  const b = new Builder();
  for (const it of items) {
    const flat: number[] = [];
    let path = 0;
    it.pts.forEach((p, i) => {
      if (i) path += p.distanceTo(it.pts[i - 1]);
      const cap = it.part === PART.myelin && (i === 0 || i === it.pts.length - 1) ? 0.72 : 1;
      flat.push(p.x, p.y, p.z, it.r * cap, path);
    });
    b.tube(flat, it.part);
  }
  return b.build();
}
