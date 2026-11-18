import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AREAS, DEEP, LOBES, structureById, type Structure } from '../content/regions';

/** MNI millimetres (x right, y front, z up) → scene centimetres (+x subject-left, +y up, +z front) */
export const mni = (x: number, y: number, z: number) => new THREE.Vector3(-x / 10, z / 10, y / 10);

export const modelUrl = (file: string) => `${import.meta.env.BASE_URL}models/${file}`;

export function loadGLB(file: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(modelUrl(file), (g) => resolve(g.scene), undefined, reject);
  });
}

export type Granularity = 'lobes' | 'areas';
export type ClipAxis = 'none' | 'sagittal' | 'coronal' | 'axial';

export interface BrainView {
  granularity: Granularity;
  selected: string | null;
  hovered: string | null;
  /** 0 = invisible cortex, 1 = solid */
  cortexOpacity: number;
  showLeft: boolean;
  showRight: boolean;
  explode: number;
  clipAxis: ClipAxis;
  /** -1..1 along the chosen axis */
  clipPos: number;
  /** see-through outline rendering of the whole brain (Systems level) */
  glass: boolean;
  /** ids that stay lit in glass mode */
  lit: string[];
}

const DEFAULT_VIEW: BrainView = {
  granularity: 'lobes', selected: null, hovered: null, cortexOpacity: 1, showLeft: true, showRight: true,
  explode: 0, clipAxis: 'none', clipPos: 0, glass: false, lit: [],
};

interface Part {
  mesh: THREE.Mesh;
  cap?: THREE.Mesh;
  prepass?: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  stem: string;
  hemi: 'lh' | 'rh' | 'mid';
  cortex: boolean;
  area?: Structure; // finest structure owning this mesh
  lobe?: Structure;
  centroid: THREE.Vector3;
  explodeDir: THREE.Vector3;
  targetColor: THREE.Color;
  targetOpacity: number;
  targetEmissive: number;
  targetOffset: THREE.Vector3;
}

const GREY = new THREE.Color('#8b8f9a');
const DARK = new THREE.Color('#596072');
const DIM = new THREE.Color('#6d7282');
const tmpC = new THREE.Color();

function glassMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#8fb4ff') }, uStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uColor * (0.05 + f * 0.75) * uStrength, 1.0);
      }`,
  });
}

export class BrainModel {
  readonly group = new THREE.Group();
  readonly center = new THREE.Vector3(0, 0.6, -1.6);
  readonly clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100);
  view: BrainView = { ...DEFAULT_VIEW };

  private parts: Part[] = [];
  private byStem = new Map<string, Part[]>();
  private glass = glassMaterial();
  private centroidCache = new Map<string, THREE.Vector3>();
  private dirty = true;
  private static instance: Promise<BrainModel> | null = null;

  static load(onProgress?: (p: number) => void): Promise<BrainModel> {
    if (!this.instance) this.instance = new BrainModel().build(onProgress);
    return this.instance;
  }

  private async build(onProgress?: (p: number) => void): Promise<BrainModel> {
    const files = ['cortex.glb', 'subcortical.glb', 'cerebellum.glb', 'brainstem.glb'];
    let done = 0;
    const scenes = await Promise.all(
      files.map((f) => loadGLB(f).then((s) => { onProgress?.(++done / files.length); return s; })),
    );
    const meshes: THREE.Mesh[] = [];
    for (const s of scenes) s.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    // the hypothalamus is tiny and absent from the atlas: add a small sculpted pair
    for (const [hemi, sx] of [['lh', 1], ['rh', -1]] as const) {
      const g = new THREE.SphereGeometry(1, 20, 14);
      g.scale(0.42, 0.42, 0.62);
      g.translate(sx * 0.48, -1.05, -0.15);
      const m = new THREE.Mesh(g);
      m.name = `sub-${hemi}-hypothalamus`;
      meshes.push(m);
    }

    const owner = new Map<string, Structure>();
    for (const s of [...AREAS, ...DEEP]) for (const stem of s.meshes) owner.set(stem, s);

    for (const mesh of meshes) {
      const name = (mesh.name || mesh.parent?.name || '').replace(/_\d+$/, '');
      const m = /^(ctx|sub|cb|bs)-(?:(lh|rh)-)?(.+)$/.exec(name);
      if (!m) continue;
      let stem = `${m[1]}-${m[3]}`;
      let hemi: Part['hemi'] = (m[2] as 'lh' | 'rh') ?? 'mid';
      // the cerebellum is one closed surface split into three patches: always show it whole
      if (m[1] === 'cb') { stem = name; hemi = 'mid'; }
      const cortex = m[1] === 'ctx';
      const area = owner.get(stem);
      const lobe = area?.kind === 'area' ? structureById.get(area.parent!) : undefined;
      const geometry = mesh.geometry;
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: cortex && !!geometry.attributes.color,
        roughness: cortex ? 0.62 : 0.5,
        metalness: 0.0,
        clippingPlanes: [this.clipPlane],
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0,
      });
      const fresh = new THREE.Mesh(geometry, material);
      fresh.name = name;
      const centroid = geometry.boundingBox!.getCenter(new THREE.Vector3());
      const part: Part = {
        mesh: fresh, material, stem, hemi, cortex, area, lobe, centroid,
        explodeDir: new THREE.Vector3(),
        targetColor: new THREE.Color(1, 1, 1), targetOpacity: 1, targetEmissive: 0, targetOffset: new THREE.Vector3(),
      };
      {
        // Back faces act as the "cut surface" when a clipping plane slices a closed shape:
        // drawn unlit and flat, they read as a filled cross-section.
        const capColor = cortex ? new THREE.Color(0xeadfce) : new THREE.Color(area?.color ?? '#cfc7bd').multiplyScalar(0.82);
        const cap = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: capColor, side: THREE.BackSide, clippingPlanes: [this.clipPlane] }),
        );
        cap.visible = false;
        cap.raycast = () => {};
        fresh.add(cap);
        part.cap = cap;
      }
      if (cortex) {
        // depth pre-pass: when the cortex is see-through only its nearest surface is drawn,
        // which keeps the ghosted brain clean instead of a stack of overlapping sheets
        const pre = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ colorWrite: false, clippingPlanes: [this.clipPlane] }),
        );
        pre.visible = false;
        pre.renderOrder = 1;
        pre.raycast = () => {};
        fresh.add(pre);
        part.prepass = pre;
      }
      fresh.userData.part = part;
      this.parts.push(part);
      if (!this.byStem.has(stem)) this.byStem.set(stem, []);
      this.byStem.get(stem)!.push(part);
      this.group.add(fresh);
    }

    // explode directions: cortex moves by lobe, everything else by its own centroid
    const lobeCentroid = new Map<string, THREE.Vector3>();
    for (const lobe of LOBES) {
      for (const hemi of ['lh', 'rh'] as const) {
        const ps = this.parts.filter((p) => p.lobe === lobe && p.hemi === hemi);
        const c = new THREE.Vector3();
        ps.forEach((p) => c.add(p.centroid));
        if (ps.length) lobeCentroid.set(`${lobe.id}-${hemi}`, c.divideScalar(ps.length));
      }
    }
    for (const p of this.parts) {
      const side = p.hemi === 'lh' ? 1 : p.hemi === 'rh' ? -1 : 0;
      if (p.cortex) {
        const c = p.lobe ? lobeCentroid.get(`${p.lobe.id}-${p.hemi}`)! : p.centroid;
        p.explodeDir.copy(c).sub(this.center).normalize().multiplyScalar(p.lobe ? 3.4 : 0.6);
        p.explodeDir.x += side * (p.lobe ? 2.4 : 1.6);
      } else if (p.stem.startsWith('cb')) {
        p.explodeDir.set(0, -1.6, -2.6);
      } else if (p.stem.startsWith('bs')) {
        p.explodeDir.set(0, -2.2 - (p.stem === 'bs-medulla' ? 1.2 : p.stem === 'bs-pons' ? 0.6 : 0), 0.4);
      } else {
        p.explodeDir.copy(p.centroid).sub(this.center).multiplyScalar(0.55);
        p.explodeDir.x += side * 0.5;
      }
    }
    this.refresh(true);
    return this;
  }

  setView(patch: Partial<BrainView>) {
    Object.assign(this.view, patch);
    this.dirty = true;
  }

  resetView(patch: Partial<BrainView> = {}) {
    this.view = { ...DEFAULT_VIEW, ...patch };
    this.dirty = true;
  }

  /** structure a part belongs to at the current granularity */
  private structureOf(p: Part): Structure | undefined {
    if (p.cortex && p.lobe && this.view.granularity === 'lobes') return p.lobe;
    return p.area;
  }

  private partsOf(id: string): Part[] {
    const s = structureById.get(id);
    if (!s) return [];
    return s.meshes.flatMap((stem) => this.byStem.get(stem) ?? []);
  }

  /** world-space centre of a structure (both hemispheres → the left one, for a readable anchor) */
  centroidOf(id: string, hemi: 'lh' | 'rh' | 'both' = 'both'): THREE.Vector3 {
    const key = `${id}:${hemi}`;
    const hit = this.centroidCache.get(key);
    if (hit) return hit.clone();
    const ps = this.partsOf(id).filter((p) => hemi === 'both' || p.hemi === hemi || p.hemi === 'mid');
    const box = new THREE.Box3();
    ps.forEach((p) => box.union(p.mesh.geometry.boundingBox!));
    const c = ps.length ? box.getCenter(new THREE.Vector3()) : this.center.clone();
    this.centroidCache.set(key, c);
    return c.clone();
  }

  /** bounding radius of a structure, for framing the camera */
  radiusOf(id: string): number {
    const box = new THREE.Box3();
    this.partsOf(id).forEach((p) => box.union(p.mesh.geometry.boundingBox!));
    return box.isEmpty() ? 8 : box.getSize(new THREE.Vector3()).length() / 2;
  }

  pick(ray: THREE.Raycaster): { id: string; point: THREE.Vector3 } | null {
    const visible = this.parts.filter((p) => p.mesh.visible).map((p) => p.mesh);
    const hits = ray.intersectObjects(visible, false);
    let fallback: { id: string; point: THREE.Vector3 } | null = null;
    for (const h of hits) {
      if (this.clipPlane.distanceToPoint(h.point) < 0) continue;
      const part = h.object.userData.part as Part;
      const s = this.structureOf(part);
      if (!s) continue;
      const solid = part.targetOpacity > 0.4 && !(this.view.glass && part.cortex);
      if (solid) return { id: s.id, point: h.point };
      if (!fallback && !part.cortex) fallback = { id: s.id, point: h.point };
    }
    return fallback;
  }

  private refresh(immediate = false) {
    const v = this.view;
    const sel = v.selected ? structureById.get(v.selected) : undefined;
    const selParts = new Set(v.selected ? this.partsOf(v.selected) : []);
    const hovParts = new Set(v.hovered ? this.partsOf(v.hovered) : []);
    const selIsDeep = !!sel && sel.kind !== 'lobe' && sel.kind !== 'area' && sel.kind !== 'fiber';
    const lit = new Set(v.lit.flatMap((id) => this.partsOf(id)));

    // clipping plane
    const span: Record<ClipAxis, [THREE.Vector3, number]> = {
      none: [new THREE.Vector3(-1, 0, 0), 1e3],
      sagittal: [new THREE.Vector3(-1, 0, 0), v.clipPos * 7.2],
      coronal: [new THREE.Vector3(0, 0, -1), v.clipPos * 9 - 1.6],
      axial: [new THREE.Vector3(0, -1, 0), v.clipPos * 6.5 + 1.2],
    };
    const [n, c] = span[v.clipAxis];
    this.clipPlane.normal.copy(n);
    this.clipPlane.constant = c;
    const clipping = v.clipAxis !== 'none';

    for (const p of this.parts) {
      const s = this.structureOf(p);
      const hemiVisible = p.hemi === 'lh' ? v.showLeft : p.hemi === 'rh' ? v.showRight : true;
      let opacity = hemiVisible ? 1 : 0;
      const base = tmpC.set(s?.color ?? '#cfc7bd');
      let emissive = 0;

      if (p.cortex) {
        opacity *= v.cortexOpacity;
        if (sel && !selParts.has(p)) {
          base.lerp(DIM, 0.78);
          if (selIsDeep) opacity *= 0.16;
        }
      } else if (sel && !selParts.has(p)) {
        base.lerp(selIsDeep ? DARK : GREY, selIsDeep ? 0.8 : 0.6);
      }
      if (selParts.has(p)) emissive = selIsDeep ? 0.4 : 0.22;
      if (hovParts.has(p) && !selParts.has(p)) emissive = 0.14;

      if (v.glass) {
        if (p.cortex) opacity = hemiVisible ? 1 : 0;
        else if (lit.has(p)) { opacity = 0.95; emissive = 0.35; }
        else { opacity *= 0.16; base.lerp(GREY, 0.5); }
      }

      p.targetColor.copy(base);
      p.targetOpacity = opacity;
      p.targetEmissive = emissive;
      p.targetOffset.copy(p.explodeDir).multiplyScalar(v.explode);

      const useGlass = v.glass && p.cortex;
      const want = useGlass ? this.glass : p.material;
      if (p.mesh.material !== want) p.mesh.material = want;
      if (p.cap) p.cap.visible = clipping && !useGlass && opacity > 0.98;
      // open patches (exploded lobes) should show their inner face; sliced solids use the cap instead
      const side = clipping ? THREE.FrontSide : THREE.DoubleSide;
      if (p.material.side !== side) { p.material.side = side; p.material.needsUpdate = true; }
      if (immediate) {
        p.material.color.copy(p.targetColor);
        p.material.opacity = opacity;
        p.material.emissiveIntensity = emissive;
        p.mesh.position.copy(p.targetOffset);
        this.applyOpacity(p);
      }
    }
    this.dirty = false;
  }

  private applyOpacity(p: Part) {
    const o = p.material.opacity;
    const transparent = o < 0.985;
    if (p.material.transparent !== transparent) {
      p.material.transparent = transparent;
      p.material.depthWrite = !transparent;
      p.material.depthFunc = THREE.LessEqualDepth;
      p.material.needsUpdate = true;
    }
    if (p.prepass) p.prepass.visible = transparent && o > 0.012 && p.mesh.material !== this.glass;
    p.mesh.visible = o > 0.012 || p.mesh.material === this.glass && p.targetOpacity > 0;
    p.mesh.renderOrder = transparent ? (p.cortex ? 3 : 2) : 0;
  }

  update(dt: number) {
    if (this.dirty) this.refresh();
    const k = 1 - Math.exp(-dt * 9);
    for (const p of this.parts) {
      const m = p.material;
      m.color.lerp(p.targetColor, k);
      m.emissive.copy(m.color);
      m.emissiveIntensity += (p.targetEmissive - m.emissiveIntensity) * k;
      if (Math.abs(m.opacity - p.targetOpacity) > 0.002) {
        m.opacity += (p.targetOpacity - m.opacity) * k;
        if (Math.abs(m.opacity - p.targetOpacity) <= 0.002) m.opacity = p.targetOpacity;
      }
      this.applyOpacity(p);
      p.mesh.position.lerp(p.targetOffset, k);
    }
  }
}
