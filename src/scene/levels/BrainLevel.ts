import * as THREE from 'three';
import { Level, type CameraHome } from '../Level';
import { BrainModel } from '../BrainModel';
import { useCore } from '../../state/store';
import { useBrain } from '../../state/brainState';
import { structureById } from '../../content/regions';

export class BrainLevel extends Level {
  readonly id = 'brain' as const;
  readonly metersPerUnit = 0.01;
  readonly home: CameraHome = {
    position: new THREE.Vector3(30, 9, 34),
    target: new THREE.Vector3(0, 0.4, -1.6),
    minDistance: 12,
    maxDistance: 95,
  };

  private brain!: BrainModel;
  private unsub: (() => void)[] = [];
  private hovered: string | null = null;
  /** set when a click in the 3D view made the selection, so we do not fly the camera */
  private clickSelected = false;
  private autoHid: 'left' | null = null;

  protected async load() {
    this.brain = await BrainModel.load((p) => this.ctx.progress(p));
  }

  enter() {
    this.root.add(this.brain.group);
    this.sync();
    this.unsub.push(
      useBrain.subscribe(() => this.sync()),
      useCore.subscribe((s, p) => {
        if (s.selection.brain !== p.selection.brain) {
          this.onSelection(s.selection.brain);
          this.sync();
        }
      }),
    );
  }

  arrived() {
    // arriving with something already chosen (search, tour): bring it into view
    const id = useCore.getState().selection.brain;
    if (id) this.onSelection(id);
  }

  exit() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    this.hovered = null;
    this.brain.setView({ hovered: null });
  }

  private sync() {
    const b = useBrain.getState();
    let selected = useCore.getState().selection.brain;
    // show the selected structure at whichever granularity it lives on
    let granularity = b.granularity;
    const s = selected ? structureById.get(selected) : undefined;
    if (s?.kind === 'area') granularity = 'areas';
    if (s?.kind === 'lobe') granularity = 'lobes';
    if (granularity !== b.granularity) {
      useBrain.getState().set({ granularity });
      return;
    }
    this.brain.setView({
      granularity, selected, hovered: this.hovered, cortexOpacity: b.cortexOpacity, showLeft: b.showLeft,
      showRight: b.showRight, explode: b.explode, clipAxis: b.clipAxis, clipPos: b.clipPos, glass: false,
      lit: [],
    });
  }

  /** when something is chosen from a list / search, bring it into view */
  private onSelection(id: string | null) {
    const b = useBrain.getState();
    if (this.autoHid && (!id || this.clickSelected)) {
      if (!id) { b.set({ showLeft: true }); this.autoHid = null; }
    }
    if (!id || this.clickSelected) {
      this.clickSelected = false;
      return;
    }
    const s = structureById.get(id);
    if (!s) return;
    const c = this.brain.centroidOf(id, 'rh');
    const cortical = s.kind === 'area' || s.kind === 'fiber';
    const medial = cortical && Math.abs(c.x) < 1.9;
    if (medial && b.showLeft && b.showRight && b.clipAxis === 'none') {
      // medial surfaces face the midline: hide the left hemisphere to look at the right one's inner face
      b.set({ showLeft: false });
      this.autoHid = 'left';
    } else if (!medial && this.autoHid) {
      b.set({ showLeft: true });
      this.autoHid = null;
    }
    const r = Math.max(this.brain.radiusOf(id), 2.5);
    const dist = THREE.MathUtils.clamp(r * 5, 32, 60);
    let dir: THREE.Vector3;
    if (medial) dir = new THREE.Vector3(1, 0.18, 0.12);
    else if (cortical || s.kind === 'lobe') {
      const lc = this.brain.centroidOf(id, 'lh');
      dir = lc.clone().sub(this.brain.center);
      dir.x = Math.max(dir.x, 2.5);
      dir.y += 1.2;
    } else dir = this.ctx.camera.position.clone().sub(this.ctx.controls.target);
    dir.normalize();
    const target = s.kind === 'lobe' || cortical ? this.home.target.clone() : this.brain.centroidOf(id);
    const d = s.kind === 'lobe' || cortical ? 46 : dist;
    void this.ctx.flyTo(target.clone().add(dir.multiplyScalar(d)), target, 1.0);
  }

  update(dt: number) {
    this.brain.update(dt);
  }

  onHover(ray: THREE.Raycaster | null) {
    const hit = ray ? this.brain.pick(ray) : null;
    const id = hit?.id ?? null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.brain.setView({ hovered: id });
      const s = id ? structureById.get(id) : null;
      useCore.getState().set({ hover: s ? { text: s.name, sub: s.tagline } : null });
    }
    return !!id;
  }

  onClick(ray: THREE.Raycaster) {
    const hit = this.brain.pick(ray);
    const cur = useCore.getState().selection.brain;
    this.clickSelected = true;
    const next = hit?.id ?? null;
    if (next === cur) { this.clickSelected = false; return; }
    useCore.getState().select('brain', next);
    this.clickSelected = false;
  }

  onDoubleClick(ray: THREE.Raycaster) {
    const hit = this.brain.pick(ray);
    if (!hit) return;
    // double-click a lobe to drill into its areas; otherwise frame the structure
    const s = structureById.get(hit.id);
    if (s?.kind === 'lobe') {
      useBrain.getState().set({ granularity: 'areas' });
      this.clickSelected = true;
      useBrain.getState().set({ granularity: 'areas' });
      const again = this.brain.pick(ray);
      this.brain.setView({ granularity: 'areas' });
      const fine = this.brain.pick(ray) ?? again;
      useCore.getState().select('brain', fine?.id ?? hit.id);
      this.clickSelected = false;
      return;
    }
    const dir = this.ctx.camera.position.clone().sub(this.ctx.controls.target).normalize();
    const r = Math.max(this.brain.radiusOf(hit.id), 2.2);
    void this.ctx.flyTo(hit.point.clone().add(dir.multiplyScalar(r * 4.5)), hit.point, 0.8);
  }

  diveTarget() {
    const sel = useCore.getState().selection.brain;
    return sel ? this.brain.centroidOf(sel) : null;
  }
}
