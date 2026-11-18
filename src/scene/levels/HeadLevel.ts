import * as THREE from 'three';
import { Level, type CameraHome } from '../Level';
import { BrainModel, loadGLB } from '../BrainModel';
import { useCore } from '../../state/store';
import { useHead } from '../../state/headState';
import { HEAD_LAYERS, headLayerById } from '../../content/head';

interface Shell {
  id: string;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  index: number;
  planes: THREE.Plane[];
  open: number[];
  opacity: number;
  baseOpacity: number;
}

const FAR = 1e3;

export class HeadLevel extends Level {
  readonly id = 'head' as const;
  readonly metersPerUnit = 0.01;
  readonly home: CameraHome = {
    position: new THREE.Vector3(33, 7, 50),
    target: new THREE.Vector3(0, -1.2, -1.2),
    minDistance: 26,
    maxDistance: 120,
  };

  private brain!: BrainModel;
  private shells: Shell[] = [];
  private unsub: (() => void)[] = [];
  private hovered: string | null = null;

  protected async load() {
    const [brain, scalp, skull, meninges] = await Promise.all([
      BrainModel.load((p) => this.ctx.progress(0.2 + p * 0.5)),
      loadGLB('scalp.glb'),
      loadGLB('skull.glb'),
      loadGLB('meninges.glb'),
    ]);
    this.ctx.progress(0.95);
    this.brain = brain;
    const find = (g: THREE.Object3D, name: string) => {
      const all: THREE.Mesh[] = [];
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) all.push(o as THREE.Mesh); });
      return all.find((m) => m.name.includes(name) || !!m.parent?.name.includes(name)) ?? all[0];
    };
    const defs: [string, THREE.Mesh, Partial<THREE.MeshStandardMaterialParameters>, number][] = [
      ['scalp', find(scalp, 'scalp'), { roughness: 0.72 }, 1],
      ['skull', find(skull, 'skull'), { roughness: 0.58 }, 1],
      ['dura', find(meninges, 'dura'), { roughness: 0.5 }, 1],
      ['arachnoid', find(meninges, 'arachnoid'), { roughness: 0.12, metalness: 0.0 }, 0.42],
    ];
    defs.forEach(([id, src, params, baseOpacity], index) => {
      // stepped cut: each deeper layer is cut a little further back, like a staircase
      const step = index * 0.75;
      const planes = [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), FAR),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR),
      ];
      const open = [-0.4 + step, -0.6 + step];
      const material = new THREE.MeshStandardMaterial({
        color: headLayerById.get(id)!.color,
        side: THREE.DoubleSide,
        clippingPlanes: planes,
        clipIntersection: true,
        transparent: baseOpacity < 1,
        opacity: baseOpacity,
        ...params,
      });
      const geometry = src.geometry;
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = id;
      mesh.renderOrder = 10 - index;
      this.root.add(mesh);
      this.shells.push({ id, mesh, material, index, planes, open, opacity: baseOpacity, baseOpacity });
    });
  }

  enter() {
    this.root.add(this.brain.group);
    this.applyBrain();
    this.unsub.push(
      useHead.subscribe(() => this.applyBrain()),
      useCore.subscribe((s, p) => {
        if (s.selection.head !== p.selection.head) this.applyBrain();
      }),
    );
  }

  exit() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    this.hovered = null;
  }

  private applyBrain() {
    const { peel } = useHead.getState();
    const sel = useCore.getState().selection.head;
    // last step of the peel swaps natural tissue colour for the functional colour map
    this.brain.resetView({ colored: peel >= 4.5, granularity: 'lobes' });
    void sel;
  }

  update(dt: number) {
    const { peel, cutaway } = useHead.getState();
    const sel = useCore.getState().selection.head;
    const k = 1 - Math.exp(-dt * 8);
    for (const s of this.shells) {
      const target = THREE.MathUtils.clamp(s.index + 1 - peel, 0, 1) * s.baseOpacity;
      s.opacity += (target - s.opacity) * k;
      const m = s.material;
      m.opacity = s.opacity;
      const transparent = s.opacity < 0.985;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.depthWrite = !transparent || s.baseOpacity < 1 ? !transparent : false;
        m.needsUpdate = true;
      }
      m.depthWrite = s.opacity > 0.9;
      s.mesh.visible = s.opacity > 0.01;
      s.planes.forEach((p, pi) => {
        const open = cutaway ? s.open[pi] : FAR;
        // planes ease open/closed; clamp so easing from "far" is quick
        const cur = Math.min(p.constant, 14);
        p.constant = cutaway ? cur + (open - cur) * k : cur + (16 - cur) * k * 1.5;
        if (!cutaway && p.constant > 13.5) p.constant = FAR;
      });
      const lit = sel === s.id || this.hovered === s.id;
      m.emissive.set(m.color);
      m.emissiveIntensity += ((sel === s.id ? 0.2 : lit ? 0.1 : 0) - m.emissiveIntensity) * k;
    }
    this.brain.update(dt);
  }

  private pick(ray: THREE.Raycaster): string | null {
    const visible = this.shells.filter((s) => s.opacity > 0.25);
    const hits = ray.intersectObjects([...visible.map((s) => s.mesh)], false);
    let best: { id: string; d: number } | null = null;
    for (const h of hits) {
      const s = this.shells.find((x) => x.mesh === h.object)!;
      // clipIntersection: a point is removed only if it is behind *all* planes
      const cut = s.planes.every((p) => p.distanceToPoint(h.point) < 0);
      if (cut) continue;
      best = { id: s.id, d: h.distance };
      break;
    }
    const b = this.brain.pick(ray);
    if (b) {
      const d = b.point.distanceTo(ray.ray.origin);
      if (!best || d < best.d) return 'pia';
    }
    return best?.id ?? null;
  }

  onHover(ray: THREE.Raycaster | null) {
    const id = ray ? this.pick(ray) : null;
    if (id !== this.hovered) {
      this.hovered = id;
      const layer = id ? headLayerById.get(id) : null;
      useCore.getState().set({ hover: layer ? { text: layer.name, sub: layer.tagline } : null });
    }
    return !!id;
  }

  onClick(ray: THREE.Raycaster) {
    useCore.getState().select('head', this.pick(ray));
  }

  onDoubleClick(ray: THREE.Raycaster) {
    const id = this.pick(ray);
    if (!id) return;
    // double-click a layer to peel down to it
    const idx = HEAD_LAYERS.findIndex((l) => l.id === id);
    useHead.getState().set({ peel: Math.min(idx + 1, 5) });
  }

  diveTarget() {
    return new THREE.Vector3(0, 1, -1.5);
  }
}
