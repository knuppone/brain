import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Level, type CameraHome } from '../Level';
import { useCore } from '../../state/store';
import { pushTraceSample, useCells } from '../../state/cellsState';
import {
  cellTypeById, LAYERS, PART_COLORS, SCENE_NOTES, SIGNAL_COLORS, TRACE_CELLS, type CellType, type CellTypeId,
} from '../../content/cells';
import { Circuit } from '../../sim/cellsCircuit';
import {
  buildColumn, buildSpecimen, depthY, PIA_Y, SLAB, SPIKE_SPEED, type Column, type Specimen,
} from '../procedural/cellsColumn';
import {
  buildCellGeometry, buildSpineMesh, buildTubeSet, GlowPoints, makeCellMaterial, makeSharedUniforms, somaGeometry,
  type CellUniforms,
} from '../procedural/cellsGeometry';
import { PART, type MorphKind, type Route } from '../procedural/cellsMorph';

/** simulated milliseconds per real second (slow motion) */
const SIM_RATE = 15;
const SIM_DT = 0.25;
const VIEW_DIR = new THREE.Vector3(0.3, 0.1, 1).normalize();

const LAYER_OF: Partial<Record<MorphKind, string>> = { pyr23: 'layer II/III', pyr5: 'layer V', pyr6: 'layer VI', stellate: 'layer IV' };

interface CellObj {
  typeId: CellTypeId | null;
  note: keyof typeof SCENE_NOTES | null;
  kind: MorphKind;
  mesh: THREE.Mesh;
  u: CellUniforms;
  skeleton: Float32Array;
  center: THREE.Vector3;
  half: THREE.Vector2;
  soma: THREE.Vector3;
  somaR: number;
  neuron: number;
  inhibitory: boolean;
  glia: boolean;
  /** simulated times of the most recent spikes (up to 4) */
  spikes: number[];
  dim: number;
  maxAxon: number;
}

interface Pulse { syn: number; t0: number }
interface Spark { p: THREE.Vector3; t: number; inh: boolean }

function free(width: number, height: number) {
  const narrow = width < 860;
  return {
    narrow,
    // share of the view left free by the rail, the panel and the dock, and where its centre is
    fh: narrow ? 0.94 : Math.max(0.3, (width - 200 - 400) / width),
    fv: narrow ? 0.31 : 0.8,
    sx: narrow ? 0 : (200 + (width - 400)) / 2 / width - 0.5,
    sy: narrow ? 0.225 : 0.012,
    fov: width / height < 0.8 ? 46 : 32,
  };
}

/** camera position / target that centres a box of the given half-size in the free part of the view */
function frameBox(center: THREE.Vector3, halfW: number, halfH: number, dir: THREE.Vector3, width: number, height: number) {
  const f = free(width, height);
  const tanV = Math.tan(THREE.MathUtils.degToRad(f.fov / 2));
  const aspect = width / height;
  const dist = Math.max((2 * halfH) / (f.fv * 2 * tanV), (2 * halfW) / (f.fh * 2 * tanV * aspect));
  const d = dir.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(d).normalize();
  const up = d.clone().cross(right).normalize();
  const viewH = 2 * dist * tanV, viewW = viewH * aspect;
  const target = center.clone().addScaledVector(right, -f.sx * viewW).addScaledVector(up, -f.sy * viewH);
  return { position: target.clone().addScaledVector(d, dist), target, dist };
}

export class CellsLevel extends Level {
  readonly id = 'cells' as const;
  /** one world unit is 10 µm */
  readonly metersPerUnit = 1e-5;
  readonly home: CameraHome = (() => {
    const f = frameBox(new THREE.Vector3(-4, 0, 0), SLAB.w / 2 + 16, SLAB.h / 2 + 8, VIEW_DIR, window.innerWidth, window.innerHeight);
    return { position: f.position, target: f.target, minDistance: 10, maxDistance: Math.max(900, f.dist * 1.45) };
  })();

  private shared = makeSharedUniforms();
  private column!: Column;
  private circuit!: Circuit;
  private cells: CellObj[] = [];
  private columnGroup = new THREE.Group();
  private specimenGroup = new THREE.Group();
  private glow = new GlowPoints(700);
  private labelEls: HTMLElement[] = [];
  private layerLabels = new THREE.Group();
  private partLabels = new THREE.Group();
  private rbc!: THREE.InstancedMesh;
  private capillary!: THREE.Mesh;
  private unsub: (() => void)[] = [];

  private pulses: Pulse[] = [];
  private sparks: Spark[] = [];
  private simAcc = 0;
  private wall = 0;
  private traceIdx: number[] = [];
  private inputFired = false;
  private lastStim = 0;

  private hovered: CellObj | null = null;
  private clicked: CellObj | null = null;
  private lastClick: { cell: CellObj; point: THREE.Vector3; at: number } | null = null;
  private shownSelection: string | null = null;
  private shownSpecimen: CellTypeId | null = null;
  private specimens = new Map<CellTypeId, {
    group: THREE.Group; u: CellUniforms; spec: Specimen; half: THREE.Vector2; center: THREE.Vector3; spines: THREE.InstancedMesh | null;
    color: THREE.Color;
  }>();
  private excColor = new THREE.Color(SIGNAL_COLORS.excite);
  private inhColor = new THREE.Color(SIGNAL_COLORS.inhibit);
  private dendColor = new THREE.Color(PART_COLORS.dendrite);
  private white = new THREE.Color('#fff3dc');

  // ------------------------------------------------------------------ build

  protected async load() {
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    this.ctx.progress(0.1);
    await tick();
    this.column = buildColumn();
    this.ctx.progress(0.5);
    await tick();

    this.circuit = new Circuit(this.column.spec, 21);
    this.traceIdx = TRACE_CELLS.map((t) => this.column.spec.neurons.findIndex((n) => n.id === t.neuron));

    for (const c of this.column.cells) {
      const type = c.typeId ? cellTypeById.get(c.typeId)! : null;
      const neuron = c.neuron >= 0 ? this.column.spec.neurons[c.neuron] : null;
      const color = type?.color ?? '#d8d2ad';
      const { material, uniforms } = makeCellMaterial(color, this.shared, {
        neuron: !!neuron, inhibitory: neuron?.inhibitory, wiggle: c.kind === 'microglia' ? 0.5 : 0,
        maxDend: c.morph.maxDend, maxAxon: c.morph.maxAxon,
      });
      const mesh = new THREE.Mesh(buildCellGeometry(c.morph), material);
      mesh.frustumCulled = false;
      this.columnGroup.add(mesh);
      const b = c.morph.bounds();
      this.cells.push({
        typeId: c.typeId, note: c.kind === 'thalamic' ? 'thalamic' : null, kind: c.kind, mesh, u: uniforms,
        skeleton: c.morph.skeleton(), center: b.center, half: new THREE.Vector2((b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2),
        soma: c.glowAt, somaR: c.morph.soma?.r ?? 1, neuron: c.neuron, inhibitory: !!neuron?.inhibitory, glia: !neuron,
        spikes: [], dim: 1, maxAxon: c.morph.maxAxon,
      });
    }
    this.ctx.progress(0.8);
    await tick();
    this.buildSetting();
    this.columnGroup.add(this.glow.points);
    this.root.add(this.columnGroup, this.specimenGroup);
    this.specimenGroup.visible = false;
    this.ctx.progress(1);
  }

  private tag(text: string, cls = 'tag small', color?: string): CSS2DObject {
    const el = document.createElement('div');
    el.className = cls;
    if (color) {
      const i = document.createElement('i');
      i.style.background = color;
      el.appendChild(i);
    }
    el.appendChild(document.createTextNode(text));
    this.labelEls.push(el);
    return new CSS2DObject(el);
  }

  /** layers, pia, white matter, capillary and the haze of "all the other cells" */
  private buildSetting() {
    const { w, h, d } = SLAB;
    const narrow = window.innerWidth < 860;

    // layer boundaries: faint outlines plus alternating tints on the back wall
    const lines: number[] = [];
    const rect = (y: number) => {
      const x = w / 2, z = d / 2;
      lines.push(-x, y, -z, x, y, -z, x, y, -z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, y, -z);
    };
    rect(PIA_Y);
    LAYERS.forEach((l, i) => {
      const y0 = depthY(l.top), y1 = depthY(l.bottom);
      rect(y1);
      if (i % 2 === 1 || l.id === 'WM') {
        const wall = new THREE.Mesh(
          new THREE.PlaneGeometry(w, y0 - y1),
          new THREE.MeshBasicMaterial({
            color: l.id === 'WM' ? 0xcfc9b4 : 0x7f9bd8, transparent: true, opacity: l.id === 'WM' ? 0.05 : 0.035,
            depthWrite: false, side: THREE.DoubleSide,
          }),
        );
        wall.position.set(0, (y0 + y1) / 2, -d / 2);
        this.columnGroup.add(wall);
      }
      const t = this.tag(narrow ? l.label.split(' · ')[0] : l.label);
      t.center.set(1, 0.5);
      t.position.set(-w / 2 - 3, (y0 + y1) / 2, d / 2);
      this.layerLabels.add(t);
    });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lines.push((sx * w) / 2, PIA_Y, (sz * d) / 2, (sx * w) / 2, -h / 2, (sz * d) / 2);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.columnGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9fb4dc, transparent: true, opacity: 0.13, depthWrite: false })));

    const pt = this.tag(narrow ? 'Pia' : 'Pia mater · brain surface');
    pt.center.set(0, 0.5);
    pt.position.set(w / 2 + 3, PIA_Y + 1, d / 2);
    const out = this.tag(narrow ? 'Output ↓' : 'Output to the rest of the brain ↓');
    out.center.set(0, 0.5);
    out.position.set(w / 2 + 3, -h / 2 + 8, d / 2);
    const inp = this.tag(narrow ? '↑ Input' : '↑ Input from the thalamus');
    inp.center.set(0, 0.5);
    inp.position.set(w / 2 + 3, -h / 2 + 22, d / 2);
    this.layerLabels.add(pt);
    if (!narrow) this.layerLabels.add(out, inp);
    this.columnGroup.add(this.layerLabels);

    // pia: a thin membrane on top
    const piaGeo = new THREE.PlaneGeometry(w + 8, d + 8, 24, 10);
    piaGeo.rotateX(-Math.PI / 2);
    const pp = piaGeo.getAttribute('position');
    for (let i = 0; i < pp.count; i++) pp.setY(i, 0.9 * Math.sin(pp.getX(i) * 0.13) * Math.cos(pp.getZ(i) * 0.21));
    piaGeo.computeVertexNormals();
    const pia = new THREE.Mesh(piaGeo, new THREE.MeshStandardMaterial({
      color: 0xe2a9a4, transparent: true, opacity: 0.2, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false,
    }));
    pia.position.y = PIA_Y + 1.2;
    this.columnGroup.add(pia);

    // white matter: passing axons and their myelin (drawn like a cell so it fades and dims with the rest)
    const wmGeo = buildTubeSet([
      ...this.column.wmFibres.map((pts) => ({ pts, r: 0.2, part: PART.axon })),
      ...this.column.wmSheaths.map((pts) => ({ pts, r: 0.5, part: PART.myelin })),
    ]);
    const wm = makeCellMaterial('#8f97ab', this.shared, { neuron: false, maxDend: 1, maxAxon: 1 });
    wm.uniforms.uGlow.value = 0.18;
    const wmMesh = new THREE.Mesh(wmGeo, wm.material);
    wmMesh.frustumCulled = false;
    this.columnGroup.add(wmMesh);
    const sk: number[] = [];
    for (const f of this.column.wmFibres) for (let i = 0; i < f.length; i += 3) sk.push(f[i].x, f[i].y, f[i].z, 0.5);
    this.cells.push({
      typeId: null, note: 'whiteMatter', kind: 'thalamic', mesh: wmMesh, u: wm.uniforms, skeleton: new Float32Array(sk),
      center: new THREE.Vector3(0, -h / 2 + 14, 0), half: new THREE.Vector2(w / 2, 14), soma: new THREE.Vector3(), somaR: 1,
      neuron: -1, inhibitory: false, glia: false, spikes: [], dim: 1, maxAxon: 1,
    });

    // capillary with red blood cells squeezing through in single file
    const curve = new THREE.CatmullRomCurve3(this.column.capillary.filter((_, i) => i % 6 === 0));
    this.capillary = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 120, 1.0, 10),
      new THREE.MeshStandardMaterial({ color: 0xd0555f, transparent: true, opacity: 0.34, roughness: 0.35, depthWrite: false, emissive: 0x4a0f18 }),
    );
    this.capillary.renderOrder = 2;
    this.rbc = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc8303c, roughness: 0.5, emissive: 0x5a0d14 }), 44,
    );
    this.rbc.frustumCulled = false;
    this.columnGroup.add(this.capillary, this.rbc);
    const csk: number[] = [];
    for (const p of this.column.capillary) csk.push(p.x, p.y, p.z, 1.1);
    this.cells.push({
      typeId: null, note: 'capillary', kind: 'thalamic', mesh: this.capillary, skeleton: new Float32Array(csk),
      u: makeCellMaterial('#000', this.shared, { neuron: false, maxDend: 1, maxAxon: 1 }).uniforms,
      center: new THREE.Vector3(), half: new THREE.Vector2(10, 10), soma: new THREE.Vector3(), somaR: 1,
      neuron: -1, inhibitory: false, glia: false, spikes: [], dim: 1, maxAxon: 1,
    });

    // haze: a hint of the thousands of cells we left out
    const n = 5200;
    const hp = new Float32Array(n * 3);
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      hp[i * 3] = (rnd() - 0.5) * w;
      // few cell bodies in layer I and in white matter
      let y = PIA_Y - rnd() * h;
      if ((y > PIA_Y - 20 || y < -h / 2 + 32) && rnd() < 0.7) y = PIA_Y - 20 - rnd() * (h - 52);
      hp[i * 3 + 1] = y;
      hp[i * 3 + 2] = (rnd() - 0.5) * d;
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    const haze = new THREE.Points(hg, new THREE.PointsMaterial({
      color: 0x7f97c8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.columnGroup.add(haze);

    // "label parts" tags on one big layer V pyramidal cell
    const rep = this.column.cells[this.column.cellOfNeuron[this.column.spec.neurons.findIndex((x) => x.id === 'B2')]];
    const lm = rep.morph.landmarks;
    const parts: [THREE.Vector3 | undefined, string, string][] = [
      [lm.tuft, 'Dendrites · receive', PART_COLORS.dendrite],
      [lm.soma, 'Cell body · adds up', PART_COLORS.soma],
      [lm.axon, 'Axon · sends', PART_COLORS.axon],
      [lm.myelin, 'Myelin · insulates', PART_COLORS.myelin],
    ];
    for (const [p, text, color] of parts) {
      if (!p) continue;
      const t = this.tag(text, 'tag', color);
      t.center.set(0, 0.5);
      t.position.copy(p).add(new THREE.Vector3(3.5, 0, 2));
      this.partLabels.add(t);
    }
    this.partLabels.visible = false;
    this.columnGroup.add(this.partLabels);
  }

  // --------------------------------------------------------------- specimens

  private getSpecimen(typeId: CellTypeId) {
    let s = this.specimens.get(typeId);
    if (s) return s;
    const type = cellTypeById.get(typeId)!;
    const spec = buildSpecimen(typeId);
    const m = spec.morph;
    const group = new THREE.Group();
    const { material, uniforms } = makeCellMaterial(type.color, this.shared, {
      neuron: type.isNeuron, inhibitory: type.transmitter?.effect === 'inhibitory', wiggle: typeId === 'microglia' ? 0.5 : 0,
      maxDend: m.maxDend, maxAxon: m.maxAxon,
    });
    const mesh = new THREE.Mesh(buildCellGeometry(m), material);
    mesh.frustumCulled = false;
    group.add(mesh);
    const spines = buildSpineMesh(m, type.color);
    if (spines) group.add(spines);

    for (const g of spec.ghosts) {
      const mat = new THREE.MeshStandardMaterial({ color: g.color, roughness: 0.6, transparent: true, opacity: g.kind === 'soma' ? 0.55 : 0.6 });
      if (g.kind === 'soma') {
        const sm = new THREE.Mesh(somaGeometry('pyramid'), mat);
        sm.position.copy(g.p!);
        sm.scale.setScalar(g.r);
        group.add(sm);
      } else {
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(g.pts!), g.pts!.length * 2, g.r, 8), mat));
      }
    }

    const b = m.bounds();
    const half = new THREE.Vector2(Math.max((b.max.x - b.min.x) / 2, (b.max.z - b.min.z) / 3), (b.max.y - b.min.y) / 2);
    const center = b.center.clone();
    // granule cell: frame the tiny body and its T-shaped axon
    if (typeId === 'granule') { half.set(8.5, 7.2); center.set(0, 3.4, 0); }

    // part labels with short leader lines, pushed outward and kept from overlapping
    const narrow = window.innerWidth < 860;
    const f = this.frameSpecimen(center, half);
    const pxWorld = (2 * f.dist * Math.tan(THREE.MathUtils.degToRad(free(window.innerWidth, window.innerHeight).fov / 2))) / window.innerHeight;
    const gap = 26 * pxWorld;
    const axisX = m.soma?.p.x ?? center.x;
    const items = type.labels
      .map((l) => ({ l, p: m.landmarks[l.key] }))
      .filter((x): x is { l: CellType['labels'][number]; p: THREE.Vector3 } => !!x.p)
      .sort((a, c) => c.p.y - a.p.y);
    const lineVerts: number[] = [];
    let lastY = Infinity;
    let flip = 1;
    for (const it of items) {
      const dx = it.p.x - axisX;
      let side = dx > half.x * 0.15 ? 1 : dx < -half.x * 0.15 ? -1 : (flip = -flip);
      if (narrow) side = 1;
      const y = Math.min(it.p.y + 4 * pxWorld, lastY - gap);
      lastY = y;
      const lp = new THREE.Vector3(it.p.x + side * 30 * pxWorld, y, it.p.z);
      const t = this.tag('', 'tag');
      const el = t.element;
      el.textContent = '';
      const bEl = document.createElement('b');
      bEl.textContent = it.l.title;
      bEl.style.fontWeight = '650';
      el.append(bEl, document.createTextNode(narrow ? '' : ` — ${it.l.note}`));
      t.center.set(side > 0 ? 0 : 1, 0.5);
      t.position.copy(lp);
      group.add(t);
      lineVerts.push(it.p.x, it.p.y, it.p.z, lp.x, lp.y, lp.z);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthTest: false })));

    group.visible = false;
    this.specimenGroup.add(group);
    s = { group, u: uniforms, spec, half, center, spines, color: new THREE.Color(type.color) };
    this.specimens.set(typeId, s);
    return s;
  }

  /** camera for a specimen, leaving room at the sides for its labels */
  private frameSpecimen(center: THREE.Vector3, half: THREE.Vector2) {
    const w = window.innerWidth, h = window.innerHeight;
    const reserve = w < 860 ? 1.5 : 1 / Math.max(0.35, 1 - 300 / (w - 600));
    return frameBox(center, (half.x * 1.08 + 1) * reserve, half.y * 1.14 + 1, VIEW_DIR, w, h);
  }

  // ------------------------------------------------------------- life cycle

  enter() {
    const cells = useCells.getState();
    this.lastStim = cells.stimTick;
    this.shownSelection = null;
    this.sync(false);
    if (this.shownSpecimen) {
      // arrived straight at a specimen (e.g. from search): frame it once the arrival flight is over
      const shown = this.shownSpecimen;
      setTimeout(() => {
        if (!this.unsub.length || this.shownSpecimen !== shown) return;
        const s = this.getSpecimen(shown);
        const f = this.frameSpecimen(s.center, s.half);
        void this.ctx.flyTo(f.position, f.target, 1.0);
      }, 1700);
    }
    this.unsub.push(
      useCells.subscribe((s, p) => {
        if (s.stimTick !== this.lastStim) {
          this.lastStim = s.stimTick;
          this.circuit.stimulate();
        }
        if (s.view === 'specimen' && p.view !== 'specimen' && !useCore.getState().selection.cells) {
          useCore.getState().select('cells', 'pyramidal');
          return;
        }
        this.sync(true);
      }),
      useCore.subscribe((s, p) => {
        if (s.selection.cells === p.selection.cells) return;
        if (!s.selection.cells && useCells.getState().view === 'specimen') {
          useCells.getState().set({ view: 'column' });
          return;
        }
        this.sync(true);
      }),
    );
  }

  exit() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    if (this.hovered) this.hovered.u.uHover.value = 0;
    this.hovered = null;
    // CSS2D labels are only updated while their scene is rendered: hide them by hand
    for (const el of this.labelEls) el.style.display = 'none';
  }

  /** bring the 3D scene in line with the selection and the level's options */
  private sync(fly: boolean) {
    const st = useCells.getState();
    const sel = useCore.getState().selection.cells;
    const type = sel ? cellTypeById.get(sel) ?? null : null;
    if (type && !type.inColumn && st.view === 'column') { st.set({ view: 'specimen' }); this.sync(fly); return; }
    if (!type && st.view === 'specimen') { st.set({ view: 'column' }); this.sync(fly); return; }
    if (type && type.group === 'glia' && !st.showGlia && sel !== this.shownSelection) { st.set({ showGlia: true }); this.sync(fly); return; }

    this.circuit.inhibition = st.inhibition;
    const wantSpecimen = st.view === 'specimen' && type ? type.id : null;
    const specimenChanged = wantSpecimen !== this.shownSpecimen;
    const selectionChanged = (type?.id ?? null) !== this.shownSelection;

    if (specimenChanged) {
      if (this.shownSpecimen) this.specimens.get(this.shownSpecimen)!.group.visible = false;
      this.shownSpecimen = wantSpecimen;
      if (wantSpecimen) this.getSpecimen(wantSpecimen).group.visible = true;
      this.columnGroup.visible = !wantSpecimen;
      this.specimenGroup.visible = !!wantSpecimen;
      this.specimenGroup.rotation.y = 0;
      this.wall = 0;
    }
    this.shownSelection = type?.id ?? null;
    this.partLabels.visible = st.labelParts;
    for (const c of this.cells) if (c.glia) c.mesh.visible = st.showGlia;

    if (!fly || (!specimenChanged && !selectionChanged)) { this.clicked = null; return; }
    if (wantSpecimen) {
      const s = this.getSpecimen(wantSpecimen);
      const f = this.frameSpecimen(s.center, s.half);
      void this.ctx.flyTo(f.position, f.target, 1.0);
    } else if (type) {
      const rep = this.clicked ?? this.representative(type.id);
      if (rep) {
        const f = frameBox(rep.center, rep.half.x * 1.5 + 14, rep.half.y * 1.12 + 8, VIEW_DIR, window.innerWidth, window.innerHeight);
        void this.ctx.flyTo(f.position, f.target, 1.0);
      }
    } else {
      void this.ctx.flyTo(this.home.position, this.home.target, 1.0);
    }
    this.clicked = null;
  }

  private representative(typeId: CellTypeId): CellObj | null {
    const all = this.cells.filter((c) => c.typeId === typeId);
    if (!all.length) return null;
    // pyramidal: show a layer II/III cell in the middle of the slab
    return all.find((c) => c.kind === 'pyr23' && Math.abs(c.soma.x) < 5) ?? all.sort((a, b) => Math.abs(a.soma.x) - Math.abs(b.soma.x))[0];
  }

  // ----------------------------------------------------------------- frame

  update(dt: number, t: number) {
    const st = useCells.getState();
    const cam = this.ctx.camera;
    const sh = this.shared;
    const height = this.ctx.renderer.domElement.clientHeight || 800;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = cam.position.distanceTo(this.ctx.controls.target);
    sh.uTime.value = t;
    sh.uParts.value += ((st.labelParts ? 1 : 0) - sh.uParts.value) * Math.min(1, dt * 6);
    sh.uMinR.value = (0.62 * 2 * tanV) / height;
    this.wall += dt;

    if (this.shownSpecimen) {
      sh.uFog.value.set(dist + 20, dist + 160, 0.5);
      this.updateSpecimen(dt);
      return;
    }
    sh.uFog.value.set(dist - 12, dist + 75, 0.72);

    // --- advance the circuit in slow motion
    const c = this.circuit;
    if (st.running) {
      this.simAcc += Math.min(dt, 0.05) * SIM_RATE;
      while (this.simAcc >= SIM_DT) {
        this.simAcc -= SIM_DT;
        c.step(SIM_DT);
        for (const s of c.spikes) if (this.column.spec.neurons[s.neuron].input) this.inputFired = true;
        pushTraceSample(this.traceIdx.map((i) => c.v[i]), this.inputFired);
        this.inputFired = false;
        this.consumeEvents();
      }
    }
    const now = c.t + (st.running ? this.simAcc : 0);

    // --- per-cell shader state
    const sel = this.shownSelection;
    const decay = Math.exp(-dt * 4.2), fireDecay = Math.exp(-dt * 6);
    for (const cell of this.cells) {
      let want = !sel || cell.typeId === sel ? 1 : 0.1;
      if (!st.inhibition && cell.inhibitory) want = Math.min(want, 0.22);
      cell.dim += (want - cell.dim) * Math.min(1, dt * 5);
      const u = cell.u;
      u.uDim.value = cell.dim;
      u.uGlow.value = cell.neuron >= 0 || cell.glia ? (sel && cell.typeId === sel ? 0.42 : 0.2) * cell.dim + 0.025 : 0.18 * cell.dim;
      u.uFire.value *= fireDecay;
      u.uFlash.value.multiplyScalar(decay);
      if (cell.neuron >= 0) {
        const sp = cell.spikes;
        const pos = (k: number) => {
          if (k >= sp.length) return -1;
          const d = (now - sp[k]) * SPIKE_SPEED;
          return d > cell.maxAxon + 30 ? -1 : d;
        };
        u.uSpikes.value.set(pos(0), pos(1), pos(2), pos(3));
      }
    }

    // --- additive glow: firing somata, spikes on their way, sparks where they land
    const g = this.glow;
    g.begin();
    for (const cell of this.cells) {
      if (cell.neuron < 0 || cell.u.uFire.value < 0.02) continue;
      const isInput = cell.kind === 'thalamic';
      g.add(cell.soma, cell.inhibitory ? this.inhColor : this.white, cell.u.uFire.value * (isInput ? 0.6 : 1.1) * (0.3 + 0.7 * cell.dim), cell.somaR * (isInput ? 5 : 7));
    }
    const p = new THREE.Vector3();
    let keep = 0;
    for (const pulse of this.pulses) {
      const route = this.column.routes[pulse.syn];
      const d = (now - pulse.t0) * SPIKE_SPEED;
      if (d > route.length) continue;
      this.pulses[keep++] = pulse;
      const pre = this.cells[this.column.cellOfNeuron[this.column.spec.synapses[pulse.syn].pre]];
      samplePath(route, d, p);
      g.add(p, pre.inhibitory ? this.inhColor : this.excColor, 0.9 * (0.25 + 0.75 * pre.dim), 3.4);
    }
    this.pulses.length = keep;
    keep = 0;
    for (const s of this.sparks) {
      const age = this.wall - s.t;
      if (age > 0.5) continue;
      this.sparks[keep++] = s;
      g.add(s.p, s.inh ? this.inhColor : this.excColor, 1.3 * (1 - age / 0.5), 4 + age * 9);
    }
    this.sparks.length = keep;
    g.end(height / (2 * tanV));

    // --- blood flow
    const cap = this.column.capillary;
    const o = dummy;
    for (let i = 0; i < this.rbc.count; i++) {
      const u = ((i / this.rbc.count + t * 0.03) % 1) * (cap.length - 1);
      const k = Math.min(Math.floor(u), cap.length - 2);
      o.position.copy(cap[k]).lerp(cap[k + 1], u - k);
      o.lookAt(cap[k + 1]);
      o.rotateX(Math.sin(i * 12.9) * 0.5);
      o.scale.set(0.62, 0.62, 0.24);
      o.updateMatrix();
      this.rbc.setMatrixAt(i, o.matrix);
    }
    this.rbc.instanceMatrix.needsUpdate = true;
  }

  private consumeEvents() {
    const { spikes, arrivals } = this.circuit.drain();
    const syn = this.column.spec.synapses;
    for (const s of spikes) {
      const cell = this.cells[this.column.cellOfNeuron[s.neuron]];
      cell.spikes.unshift(s.t);
      if (cell.spikes.length > 4) cell.spikes.length = 4;
      cell.u.uFire.value = 1;
      for (let i = 0; i < syn.length; i++) if (syn[i].pre === s.neuron) this.pulses.push({ syn: i, t0: s.t });
    }
    for (const a of arrivals) {
      const s = syn[a.synapse];
      const post = this.cells[this.column.cellOfNeuron[s.post]];
      const f = post.u.uFlash.value;
      if (s.w >= 0) f.x = Math.min(1.6, f.x + 0.75);
      else if (s.zone === 'tuft') f.z = Math.min(1.6, f.z + 1.1);
      else f.y = Math.min(1.6, f.y + 1.1);
      if (this.sparks.length < 160) this.sparks.push({ p: this.column.routes[a.synapse].end, t: this.wall, inh: s.w < 0 });
    }
  }

  /** slow turntable, plus a looping "input -> sum -> spike" demonstration for neurons */
  private updateSpecimen(dt: number) {
    const s = this.specimens.get(this.shownSpecimen!)!;
    const type = cellTypeById.get(this.shownSpecimen!)!;
    this.specimenGroup.rotation.y = 0.62 * Math.sin(this.wall * 0.28);
    const u = s.u;
    u.uDim.value = 1;
    u.uFire.value *= Math.exp(-dt * 5);
    u.uFlash.value.multiplyScalar(Math.exp(-dt * 2.6));
    if (s.spines) {
      const mat = s.spines.material as THREE.MeshStandardMaterial;
      mat.color.copy(s.color).lerp(this.dendColor, this.shared.uParts.value);
      mat.emissive.copy(mat.color);
    }
    if (!type.isNeuron) return;
    const period = 4.2;
    const ph = this.wall % period;
    const prev = ph - dt;
    if (prev < 0.4 && ph >= 0.4) u.uFlash.value.x = 1.3;
    if (prev < 1.05 && ph >= 1.05) u.uFire.value = 1;
    const travel = 1.7;
    const k = (ph - 1.05) / travel;
    u.uSpikes.value.x = k >= 0 && k <= 1.15 ? k * s.spec.morph.maxAxon : -1;
  }

  // ----------------------------------------------------------------- input

  private pick(ray: THREE.Raycaster): { cell: CellObj; point: THREE.Vector3 } | null {
    if (this.shownSpecimen) return null;
    const o = ray.ray.origin, d = ray.ray.direction;
    const cam = this.ctx.camera;
    const height = this.ctx.renderer.domElement.clientHeight || 800;
    const pxWorld = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / height;
    let best: CellObj | null = null;
    let bestScore = Infinity, bestT = 0;
    for (const cell of this.cells) {
      if (!cell.mesh.visible) continue;
      const s = cell.skeleton;
      for (let i = 0; i < s.length; i += 4) {
        const x = s[i] - o.x, y = s[i + 1] - o.y, z = s[i + 2] - o.z;
        const t = x * d.x + y * d.y + z * d.z;
        if (t < 1) continue;
        const dsq = x * x + y * y + z * z - t * t;
        const tol = Math.max(s[i + 3] * 1.2, 5 * pxWorld * t);
        if (dsq > tol * tol) continue;
        // nearest to the eye wins, with a bonus for hitting dead centre
        const score = t + (Math.sqrt(Math.max(dsq, 0)) / tol) * 12;
        if (score < bestScore) { bestScore = score; best = cell; bestT = t; }
      }
    }
    return best ? { cell: best, point: o.clone().addScaledVector(d, bestT) } : null;
  }

  onHover(ray: THREE.Raycaster | null) {
    const hit = ray ? this.pick(ray) : null;
    const cell = hit?.cell ?? null;
    if (cell !== this.hovered) {
      if (this.hovered) this.hovered.u.uHover.value = 0;
      this.hovered = cell;
      if (cell) cell.u.uHover.value = 1;
      let hover: { text: string; sub?: string } | null = null;
      if (cell?.typeId) {
        const type = cellTypeById.get(cell.typeId)!;
        const layer = LAYER_OF[cell.kind];
        hover = { text: layer ? `${type.name} · ${layer}` : type.name, sub: type.tagline };
      } else if (cell?.note) hover = { text: SCENE_NOTES[cell.note].name, sub: SCENE_NOTES[cell.note].tagline };
      useCore.getState().set({ hover });
    }
    return !!cell?.typeId;
  }

  onClick(ray: THREE.Raycaster) {
    if (this.shownSpecimen) return;
    const hit = this.pick(ray);
    const cur = useCore.getState().selection.cells;
    const next = hit?.cell.typeId ?? null;
    if (hit && !next) return;
    if (next === cur) return;
    this.clicked = hit?.cell ?? null;
    this.lastClick = hit ? { cell: hit.cell, point: hit.point, at: performance.now() } : null;
    useCore.getState().select('cells', next);
  }

  onDoubleClick(ray: THREE.Raycaster) {
    // the first click of a double click may already have set the camera moving: fall back to its hit
    const recent = this.lastClick && performance.now() - this.lastClick.at < 700 ? this.lastClick : null;
    const hit = this.pick(ray) ?? recent;
    if (!hit) return;
    const cell = hit.cell;
    const target = cell.typeId ? cell.soma : hit.point;
    const dir = this.ctx.camera.position.clone().sub(this.ctx.controls.target).normalize();
    void this.ctx.flyTo(target.clone().addScaledVector(dir, Math.max(42, cell.somaR * 22)), target, 0.9);
  }

  diveTarget() {
    if (this.shownSpecimen) {
      const s = this.specimens.get(this.shownSpecimen)!;
      const lm = s.spec.morph.landmarks;
      const p = (lm.terminals ?? lm.basket ?? lm.soma ?? new THREE.Vector3()).clone();
      return this.specimenGroup.localToWorld(p);
    }
    // a synapse from a layer II/III pyramidal cell onto a layer V dendrite
    const spec = this.column.spec;
    const i = spec.synapses.findIndex((s) => spec.neurons[s.pre].kind === 'pyr23' && spec.neurons[s.post].kind === 'pyr5');
    return this.column.routes[Math.max(0, i)].end.clone();
  }
}

const dummy = new THREE.Object3D();

/** point at path distance d (measured from the soma) along a route */
function samplePath(route: Route, d: number, out: THREE.Vector3): THREE.Vector3 {
  const { pts, cum } = route;
  if (d <= cum[0]) return out.copy(pts[0]);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const k = (d - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-6);
  return out.copy(pts[lo]).lerp(pts[hi], Math.min(1, k));
}

