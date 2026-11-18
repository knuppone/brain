import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LevelId } from '../state/store';

export interface LevelContext {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** smooth camera flight; resolves when done */
  flyTo: (position: THREE.Vector3, target: THREE.Vector3, seconds?: number) => Promise<void>;
  /** report loading progress 0..1 for this level */
  progress: (p: number) => void;
}

export interface CameraHome {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** orbit zoom limits (distance from target, world units) */
  minDistance: number;
  maxDistance: number;
}

/**
 * One scale of the journey. A level owns a root group in its own world units and
 * tells the manager how big a unit is so the scale bar stays truthful.
 */
export abstract class Level {
  abstract readonly id: LevelId;
  /** metres per world unit (e.g. 0.01 when units are centimetres) */
  abstract readonly metersPerUnit: number;
  abstract readonly home: CameraHome;

  readonly root = new THREE.Group();
  protected ctx!: LevelContext;
  private loaded: Promise<void> | null = null;

  init(ctx: LevelContext) {
    this.ctx = ctx;
  }

  /** idempotent: build / fetch everything this level needs */
  ensureLoaded(): Promise<void> {
    if (!this.loaded) this.loaded = this.load();
    return this.loaded;
  }

  protected abstract load(): Promise<void>;

  /** called when the level becomes the active one (root is already in the scene) */
  enter(): void {}
  /** called right before the level is removed from the scene */
  exit(): void {}
  /** per-frame; dt in seconds, t = seconds since app start */
  update(_dt: number, _t: number): void {}

  /** pointer moved over the canvas (not dragging). Return true if something is hovered. */
  onHover(_ray: THREE.Raycaster | null): boolean {
    return false;
  }
  /** click / tap (no drag) */
  onClick(_ray: THREE.Raycaster): void {}
  /** double click / double tap */
  onDoubleClick(_ray: THREE.Raycaster): void {}

  /** where the camera should dive when the user zooms "through" this level */
  diveTarget(): THREE.Vector3 | null {
    return null;
  }
}
