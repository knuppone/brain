import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GEO, type TransmitterId } from '../../sim/synapse';

const { H } = GEO;

/** the axon leans away above the bouton (x offset as a function of height) */
export const bendX = (y: number) => (y > 6.5 ? -0.04 * (y - 6.5) ** 2 : 0);
export const AXON_TOP = 17;
export const AXON_R = 1.0;

function smooth(ctrl: [number, number][], n: number, closed = false): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, y]) => new THREE.Vector3(r, y, 0)), closed, 'centripetal');
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
}

/** presynaptic bouton + axon: (radius, y) from the centre of the active zone upwards */
export function preProfile(): THREE.Vector2[] {
  const flat = [0, 0.7, 1.4, 2.1, 2.6].map((r) => new THREE.Vector2(r, H));
  const rest = smooth([
    [2.9, H], [3.2, 0.56], [3.5, 0.86], [3.95, 1.6], [4.3, 2.8], [4.25, 4.1], [3.7, 5.3], [2.7, 6.3], [1.7, 7.2],
    [1.15, 8.3], [AXON_R, 9.6], [AXON_R, 12], [AXON_R, AXON_TOP],
  ], 90);
  return [...flat, ...rest];
}

/** dendritic spine: (radius, y) from the centre of the postsynaptic density downwards */
export function postProfile(): THREE.Vector2[] {
  const flat = [0, 0.7, 1.4, 2.1, 2.5].map((r) => new THREE.Vector2(r, -H));
  const rest = smooth([
    [2.8, -H], [3.1, -0.56], [3.4, -0.9], [3.65, -1.7], [3.55, -2.9], [3.0, -3.9], [2.0, -4.7], [1.25, -5.4],
    [0.95, -6.1], [0.95, -6.7], [1.3, -7.3], [2.4, -7.8], [4.6, -8.1], [8.5, -8.25],
  ], 90);
  return [...flat, ...rest];
}

export function radiusAt(profile: THREE.Vector2[], y: number): number {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return profile[profile.length - 1].x;
}

/** the back half (z < 0) of a surface of revolution, optionally bent sideways */
export function halfShell(profile: THREE.Vector2[], bend?: (y: number) => number, segments = 40): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile, segments, Math.PI / 2, Math.PI);
  if (bend) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + bend(p.getY(i)));
    g.computeVertexNormals();
  }
  return g;
}

/**
 * The cut face of a membrane in the plane z = 0: a three-band ribbon (outer leaflet, oily core, inner
 * leaflet) following the profile on both sides — the "lipid bilayer" seen edge-on.
 */
export function cutRibbon(profile: THREE.Vector2[], colors: [THREE.ColorRepresentation, THREE.ColorRepresentation, THREE.ColorRepresentation],
  thickness = 0.13, bend?: (y: number) => number, z = 0.004): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const bands = [-1, -0.36, 0.36, 1].map((k) => (k * thickness) / 2);
  const cols = colors.map((c) => new THREE.Color(c));
  const n = profile.length;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
      const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
      const nx = t.y, ny = -t.x;
      for (let k = 0; k < 4; k++) {
        const r = profile[i].x + nx * bands[k], y = profile[i].y + ny * bands[k];
        for (let dup = 0; dup < (k === 1 || k === 2 ? 2 : 1); dup++) {
          pos.push(side * r + (bend ? bend(profile[i].y) : 0), y, z);
          const c = cols[k === 0 ? 0 : k === 3 ? 2 : k === 1 ? (dup === 0 ? 0 : 1) : dup === 0 ? 1 : 2];
          col.push(c.r, c.g, c.b);
        }
      }
    }
    // 6 vertices per station: o0, o1|c1, c2|i2, i3
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 6, b = a + 6;
      for (const [u, v] of [[0, 1], [2, 3], [4, 5]]) idx.push(a + u, b + u, a + v, a + v, b + u, b + v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
}

let grain: THREE.Texture | null = null;
/** fine pebbled texture: a hint of the lipid head-groups that make up a membrane */
function grainTexture() {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 128, 128);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 1.2 + rnd() * 1.6;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grain = new THREE.CanvasTexture(c);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  return grain;
}

export interface MembraneMaterial extends THREE.MeshStandardMaterial {
  userData: { waves: { value: number[] }; waveColor: { value: THREE.Color }; waveWidth: { value: number } };
}

/** soft translucent membrane: fresnel rim + up to four travelling glow bands (action potentials) along y */
export function membraneMaterial(color: THREE.ColorRepresentation, opts: { opacity?: number; rim?: THREE.ColorRepresentation; repeat?: [number, number] } = {}): MembraneMaterial {
  const tex = grainTexture().clone();
  tex.repeat.set(...(opts.repeat ?? [26, 60]));
  tex.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    color, transparent: true, opacity: opts.opacity ?? 0.5, side: THREE.DoubleSide, depthWrite: false,
    roughness: 0.42, metalness: 0.0, bumpMap: tex, bumpScale: 0.6,
  }) as MembraneMaterial;
  const waves = { value: [999, 999, 999, 999] };
  const waveColor = { value: new THREE.Color('#fff2c4') };
  const waveWidth = { value: 1.1 };
  const rim = { value: new THREE.Color(opts.rim ?? color).lerp(new THREE.Color('#ffffff'), 0.35) };
  m.userData = { waves, waveColor, waveWidth };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWaves = waves;
    shader.uniforms.uWaveColor = waveColor;
    shader.uniforms.uWaveWidth = waveWidth;
    shader.uniforms.uRim = rim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAxY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAxY;\nuniform float uWaves[4];\nuniform vec3 uWaveColor;\nuniform float uWaveWidth;\nuniform vec3 uRim;')
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
        float wave = 0.0;
        for (int i = 0; i < 4; i++) { float d = (vAxY - uWaves[i]) / uWaveWidth; wave += exp(-d * d); }
        wave = min(wave, 1.6);
        outgoingLight += uRim * fres * 0.55 + uWaveColor * wave * 1.1;
        diffuseColor.a = clamp(diffuseColor.a + fres * 0.32 + wave * 0.35, 0.0, 1.0);
        #include <opaque_fragment>`);
  };
  return m;
}

/** astrocyte process: a closed blob profile hugging the bouton, the cleft mouth and the spine */
export function astroProfile(pre: THREE.Vector2[], post: THREE.Vector2[]): THREE.Vector2[] {
  const gap = 0.3;
  const ctrl: [number, number][] = [];
  for (const y of [2.2, 1.7, 1.25, 0.85]) ctrl.push([radiusAt(pre, y) + gap, y]);
  ctrl.push([3.42, 0.42], [3.24, 0.14], [3.24, -0.14], [3.42, -0.42]);
  for (const y of [-0.85, -1.3, -1.8, -2.3]) ctrl.push([radiusAt(post, y) + gap, y]);
  ctrl.push([4.4, -2.9], [5.3, -3.0], [6.3, -2.4], [6.9, -1.0], [6.95, 0.6], [6.5, 1.9], [5.7, 2.7], [5.0, 2.8]);
  return smooth(ctrl, 110, true);
}

export function astroGeometry(profile: THREE.Vector2[], arc: number): { body: THREE.BufferGeometry; caps: THREE.BufferGeometry } {
  const body = new THREE.LatheGeometry(profile, 28, Math.PI / 2, arc);
  const shape = new THREE.Shape(profile);
  const capA = new THREE.ShapeGeometry(shape, 1);
  const capB = capA.clone().rotateY(arc);
  return { body, caps: mergeGeometries([capA, capB])! };
}

// ----------------------------------------------------------------------------- proteins

export interface ProteinStyle {
  /** subunits around the pore */
  k: number;
  ringR: number;
  subR: number;
  /** half-length of each subunit along the membrane normal */
  len: number;
  /** how much the ring widens when fully open (fraction of ringR) */
  widen: number;
  /** lean of each subunit (radians) when closed → looks like an iris */
  twist: number;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** many small membrane proteins, each a ring of capsule "subunits", drawn as one InstancedMesh */
export class ProteinSet {
  readonly mesh: THREE.InstancedMesh;
  private anchors: { pos: THREE.Vector3; axis: THREE.Vector3; style: ProteinStyle }[] = [];
  constructor(readonly max: number, readonly kMax: number) {
    const geo = new THREE.CapsuleGeometry(1, 2, 3, 10);
    geo.scale(1, 0.5, 1); // total height 2 → unit half-length
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max * kMax);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < max * kMax; i++) { this.mesh.setMatrixAt(i, ZERO); this.mesh.setColorAt(i, _c.set('#ffffff')); }
    this.mesh.frustumCulled = false;
  }
  setCount(n: number) {
    this.anchors.length = Math.min(n, this.max);
    for (let i = n * this.kMax; i < this.max * this.kMax; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  place(i: number, pos: THREE.Vector3, axis: THREE.Vector3, style: ProteinStyle) {
    this.anchors[i] = { pos: pos.clone(), axis: axis.clone().normalize(), style };
  }
  /** which protein an instance id belongs to */
  proteinOf(instanceId: number) {
    return Math.floor(instanceId / this.kMax);
  }
  update(i: number, open: number, color: THREE.Color, present = 1, spin = 0) {
    const a = this.anchors[i];
    if (!a) return;
    const st = a.style;
    _y.copy(a.axis);
    _x.set(1, 0, 0);
    if (Math.abs(_y.x) > 0.9) _x.set(0, 0, 1);
    _z.crossVectors(_x, _y).normalize();
    _x.crossVectors(_y, _z).normalize();
    _q.setFromUnitVectors(_p.set(0, 1, 0), _y);
    for (let k = 0; k < this.kMax; k++) {
      const id = i * this.kMax + k;
      if (k >= st.k || present <= 0.001) { this.mesh.setMatrixAt(id, ZERO); continue; }
      const ang = (k / st.k) * Math.PI * 2 + spin;
      const rr = st.ringR * (1 + st.widen * open);
      const cx = Math.cos(ang), cz = Math.sin(ang);
      _p.copy(a.pos).addScaledVector(_x, cx * rr).addScaledVector(_z, cz * rr).addScaledVector(_y, -(1 - present) * st.len * 2.2);
      // lean the subunit tangentially when closed
      const lean = st.twist * (1 - open);
      _q2.setFromAxisAngle(_s.copy(_x).multiplyScalar(cx).addScaledVector(_z, cz).normalize(), lean).multiply(_q);
      _s.set(st.subR, st.len, st.subR).multiplyScalar(0.35 + 0.65 * present);
      _m.compose(_p, _q2, _s);
      this.mesh.setMatrixAt(id, _m);
      this.mesh.setColorAt(id, color);
    }
  }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// --------------------------------------------------------------------------- particles

/** soft additive glow sprites with per-point colour and size */
export class GlowPoints {
  readonly points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private n = 0;
  constructor(readonly max: number, pixelRatio: number) {
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 * pixelRatio } },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(size * uScale * projectionMatrix[1][1] * 0.5 / -mv.z, 160.0);
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vColor * a * a, 0.0);
        }`,
      // pure add to colour, leave the canvas alpha alone (the page background shows through the canvas)
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }
  /** uScale must be the drawing-buffer height so that `size` is in world units */
  setViewport(heightPx: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx;
  }
  begin() { this.n = 0; }
  add(x: number, y: number, z: number, c: THREE.Color, size: number, intensity = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r * intensity; this.col[i * 3 + 1] = c.g * intensity; this.col[i * 3 + 2] = c.b * intensity;
    this.size[i] = size;
  }
  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}

/** a recognisably different little shape for each transmitter (drawn hugely oversized) */
export function moleculeGeometry(id: TransmitterId): THREE.BufferGeometry {
  const r = 0.085;
  switch (id) {
    case 'glutamate': return new THREE.OctahedronGeometry(r * 1.15);
    case 'gaba': return new THREE.IcosahedronGeometry(r, 1);
    case 'dopamine': return new THREE.TorusGeometry(r * 0.85, r * 0.36, 6, 12);
    case 'serotonin': {
      const a = new THREE.IcosahedronGeometry(r * 0.78, 1).translate(-r * 0.5, 0, 0);
      const b = new THREE.IcosahedronGeometry(r * 0.6, 1).translate(r * 0.55, 0, 0);
      return mergeGeometries([a, b])!;
    }
    case 'acetylcholine': return new THREE.TetrahedronGeometry(r * 1.35);
  }
}

/** acetylcholinesterase "pac-man": a ball with a wedge-shaped mouth */
export function pacmanGeometry(r = 0.2): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 18, 12, 0.55, Math.PI * 2 - 1.1);
  g.rotateY(-Math.PI / 2);
  return g;
}

/** stripy texture suggesting the folded inner membrane of a mitochondrion */
export function cristaeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d98a62';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(120,52,30,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const y = 4 + i * 4;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * 0.11 + i * 1.7) * 2.2);
    if (i % 2 === 0) g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  return t;
}
