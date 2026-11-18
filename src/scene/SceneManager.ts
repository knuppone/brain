import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LEVELS, levelIndex, navigation, useCore, type LevelId } from '../state/store';
import type { Level, LevelContext } from './Level';

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function niceScale(meters: number): { value: number; label: string } {
  const units: [number, string][] = [
    [1e-9, 'nm'], [1e-6, 'µm'], [1e-3, 'mm'], [1e-2, 'cm'], [1, 'm'],
  ];
  let unit = units[0];
  for (const u of units) if (meters >= u[0]) unit = u;
  const raw = meters / unit[0];
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return { value: nice * pow * unit[0], label: `${+(nice * pow).toPrecision(2)} ${unit[1]}` };
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private levels = new Map<LevelId, Level>();
  private active: Level | null = null;
  private busy = false;
  private queued: LevelId | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerInside = false;
  private pointerDirty = false;
  private downAt: { x: number; y: number; t: number } | null = null;
  private lastClick = 0;
  private clock = new THREE.Clock();
  private time = 0;
  private diveAccum = 0;
  private diveDecay = 0;
  private flight: { cancel: () => void } | null = null;
  private fadeEl: HTMLElement;
  private disposed = false;
  private scaleTick = 0;

  constructor(private container: HTMLElement, fadeEl: HTMLElement) {
    this.fadeEl = fadeEl;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 2000);
    this.camera.position.set(0, 0, 60);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.zoomToCursor = false;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1a1420, 0.3);
    const key = new THREE.DirectionalLight(0xfff1e0, 2.5);
    key.position.set(4, 7, 9);
    const rim = new THREE.DirectionalLight(0x7fa8ff, 1.1);
    rim.position.set(-7, 3, -8);
    // lights follow the camera so the subject is always well lit while orbiting
    const rig = new THREE.Group();
    rig.add(key, rim);
    this.camera.add(rig);
    this.scene.add(hemi, this.camera);

    this.bindEvents();
    this.resize();
    navigation.goTo = (level) => void this.goTo(level);
    useCore.subscribe((s, p) => { if (s.panelOpen !== p.panelOpen) this.resize(); });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  register(level: Level) {
    const ctx: LevelContext = {
      camera: this.camera,
      controls: this.controls,
      renderer: this.renderer,
      scene: this.scene,
      flyTo: (p, t, s) => this.flyTo(p, t, s),
      progress: (p) => {
        if (useCore.getState().loading) useCore.getState().set({ loadProgress: p });
      },
    };
    level.init(ctx);
    this.levels.set(level.id, level);
  }

  get current(): Level | null {
    return this.active;
  }

  async start(id: LevelId) {
    const level = this.levels.get(id)!;
    await level.ensureLoaded();
    this.activate(level);
    this.camera.position.copy(level.home.position).multiplyScalar(1.35);
    this.controls.target.copy(level.home.target);
    useCore.getState().set({ loading: false, level: id });
    void this.flyTo(level.home.position, level.home.target, 1.6);
  }

  private activate(level: Level) {
    if (this.active) {
      this.active.exit();
      // CSS2D labels are only repositioned while their object is in the scene: hide the
      // outgoing level's labels or they would stay frozen on screen
      this.active.root.traverse((o) => {
        const el = (o as unknown as { isCSS2DObject?: boolean; element?: HTMLElement });
        if (el.isCSS2DObject && el.element) el.element.style.display = 'none';
      });
      this.scene.remove(this.active.root);
    }
    this.active = level;
    this.scene.add(level.root);
    this.resize();
    this.controls.minDistance = level.home.minDistance;
    this.controls.maxDistance = level.home.maxDistance;
    const d = level.home.position.distanceTo(level.home.target);
    this.camera.near = Math.max(d / 400, 0.001);
    this.camera.far = d * 60;
    this.camera.updateProjectionMatrix();
    level.enter();
  }

  async goTo(id: LevelId) {
    const core = useCore.getState();
    if (this.busy) {
      this.queued = id;
      return;
    }
    if (!this.active || this.active.id === id) return;
    const next = this.levels.get(id);
    if (!next) return;
    this.busy = true;
    core.set({ pendingLevel: id, diveHint: null, hover: null });
    const goingIn = levelIndex(id) > levelIndex(this.active.id);
    const from = this.active;

    // 1. dive toward (or pull away from) the subject while the stage fades
    const target = (goingIn && from.diveTarget()) || this.controls.target.clone();
    const dir = this.camera.position.clone().sub(target);
    const end = target.clone().add(dir.multiplyScalar(goingIn ? 0.28 : 2.2));
    this.fadeEl.dataset.dir = goingIn ? 'in' : 'out';
    this.fadeEl.classList.add('on');
    const loaded = next.ensureLoaded();
    this.controls.minDistance = 0;
    this.controls.maxDistance = Infinity;
    await Promise.all([this.flyTo(end, target, 0.55, true), loaded]);

    // 2. swap worlds
    this.activate(next);
    core.set({ level: id, pendingLevel: null });
    const home = next.home;
    const off = home.position.clone().sub(home.target);
    this.camera.position.copy(home.target).add(off.clone().multiplyScalar(goingIn ? 2.4 : 0.45));
    this.controls.target.copy(home.target);
    this.controls.update();

    // 3. arrive
    this.fadeEl.classList.remove('on');
    await this.flyTo(home.position, home.target, 0.9, true);
    this.controls.minDistance = home.minDistance;
    this.controls.maxDistance = home.maxDistance;
    this.busy = false;
    next.arrived();
    if (this.queued && this.queued !== id) {
      const q = this.queued;
      this.queued = null;
      void this.goTo(q);
    }
    this.queued = null;
  }

  resetView() {
    if (this.active) void this.flyTo(this.active.home.position, this.active.home.target, 0.8);
  }

  flyTo(position: THREE.Vector3, target: THREE.Vector3, seconds = 0.9, force = false): Promise<void> {
    if (this.busy && !force) return Promise.resolve();
    this.flight?.cancel();
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    // interpolate in spherical coords around the target for natural arcs
    const s0 = new THREE.Spherical().setFromVector3(p0.clone().sub(t0));
    const s1 = new THREE.Spherical().setFromVector3(position.clone().sub(target));
    let dTheta = s1.theta - s0.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    const start = performance.now();
    return new Promise((resolve) => {
      let cancelled = false;
      this.flight = { cancel: () => { cancelled = true; resolve(); } };
      const s = new THREE.Spherical();
      const step = () => {
        if (cancelled || this.disposed) return;
        const k = Math.min(1, (performance.now() - start) / (seconds * 1000));
        const e = ease(k);
        const tgt = t0.clone().lerp(target, e);
        s.radius = Math.exp(THREE.MathUtils.lerp(Math.log(s0.radius), Math.log(s1.radius), e));
        s.phi = THREE.MathUtils.lerp(s0.phi, s1.phi, e);
        s.theta = s0.theta + dTheta * e;
        this.camera.position.setFromSpherical(s).add(tgt);
        this.controls.target.copy(tgt);
        if (k < 1) requestAnimationFrame(step);
        else { this.flight = null; resolve(); }
      };
      step();
    });
  }

  // ---------------------------------------------------------------- events
  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerInside = e.pointerType !== 'touch';
      this.pointerDirty = true;
    });
    el.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.pointerDirty = true;
    });
    el.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.flight?.cancel();
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.downAt;
      this.downAt = null;
      if (!d || this.busy || !this.active) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const now = performance.now();
      if (now - this.lastClick < 320) {
        this.active.onDoubleClick(this.raycaster);
        this.lastClick = 0;
      } else {
        this.active.onClick(this.raycaster);
        this.lastClick = now;
      }
    });
    // scrolling past a zoom limit dives to the next / previous level
    el.addEventListener('wheel', (e) => this.onWheel(e.deltaY), { passive: true });
    window.addEventListener('resize', this.resize);
  }

  private onWheel(deltaY: number) {
    if (this.busy || !this.active) return;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const idx = levelIndex(this.active.id);
    const atMin = dist <= this.controls.minDistance * 1.02 && deltaY < 0 && idx < LEVELS.length - 1;
    const atMax = dist >= this.controls.maxDistance * 0.98 && deltaY > 0 && idx > 0;
    if (!atMin && !atMax) {
      this.diveAccum = 0;
      if (useCore.getState().diveHint) useCore.getState().set({ diveHint: null });
      return;
    }
    const dir = atMin ? 'in' : 'out';
    this.diveAccum += Math.min(Math.abs(deltaY), 120);
    this.diveDecay = 1.2;
    const progress = Math.min(1, this.diveAccum / 700);
    if (progress >= 1) {
      this.diveAccum = 0;
      void this.goTo(LEVELS[idx + (atMin ? 1 : -1)].id);
    } else {
      useCore.getState().set({ diveHint: { dir, progress } });
    }
  }

  private resize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the subject centred in the part of the stage the UI leaves free: shift the
    // projection instead of the camera so orbiting still feels centred on the subject.
    const phone = w <= 860;
    const open = useCore.getState().panelOpen;
    const inset = phone
      ? { left: 0, right: 0, top: 96, bottom: (open ? h * 0.42 : 0) + 56 }
      : { left: 190, right: open ? 392 : 0, top: 40, bottom: 70 };
    const freeW = w - inset.left - inset.right;
    const freeH = h - inset.top - inset.bottom;
    const dx = (inset.left - inset.right) / 2;
    const dy = (inset.top - inset.bottom) / 2;
    if (this.active?.manualFraming) {
      this.camera.clearViewOffset();
      this.camera.fov = w / h < 0.8 ? 46 : 32;
      this.camera.updateProjectionMatrix();
      return;
    }
    this.camera.setViewOffset(w, h, -dx, -dy, w, h);
    // widen the field of view when the free area is small or narrow so the home framing still fits
    const fit = Math.min(freeW / 820, freeH / 640, 1);
    this.camera.fov = THREE.MathUtils.clamp(32 / Math.max(fit, 0.45), 32, 62);
    this.camera.updateProjectionMatrix();
  };

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    this.controls.update();
    const level = this.active;
    if (level) {
      if (this.pointerDirty && !this.busy && !this.downAt) {
        this.pointerDirty = false;
        if (this.pointerInside) {
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const hit = level.onHover(this.raycaster);
          this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        } else {
          level.onHover(null);
        }
      }
      level.update(dt, this.time);
    }
    if (this.diveDecay > 0) {
      this.diveDecay -= dt;
      if (this.diveDecay <= 0) {
        this.diveAccum = 0;
        useCore.getState().set({ diveHint: null });
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);

    // scale bar: how many metres span ~110 px at the orbit target
    if (level && (this.scaleTick = (this.scaleTick + 1) % 6) === 0) {
      const dist = this.camera.position.distanceTo(this.controls.target);
      const worldPerPx =
        (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.renderer.domElement.clientHeight;
      const metersPerPx = worldPerPx * level.metersPerUnit;
      const nice = niceScale(metersPerPx * 110);
      const px = nice.value / metersPerPx;
      const prev = useCore.getState().scaleBar;
      if (!prev || prev.label !== nice.label || Math.abs(prev.px - px) > 0.5) {
        useCore.getState().set({ scaleBar: { px, label: nice.label } });
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
