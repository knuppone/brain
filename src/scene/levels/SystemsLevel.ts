import * as THREE from 'three';
import { Level, type CameraHome } from '../Level';

/** placeholder — replaced by the real level */
export class SystemsLevel extends Level {
  readonly id = 'systems' as const;
  readonly metersPerUnit = 1e-6;
  readonly home: CameraHome = {
    position: new THREE.Vector3(0, 0, 10), target: new THREE.Vector3(), minDistance: 4, maxDistance: 30,
  };
  protected async load() {
    this.root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), new THREE.MeshStandardMaterial({ color: 0x8899bb, flatShading: true })));
  }
}
