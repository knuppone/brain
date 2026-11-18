/**
 * The "Axon" view of the Membrane level: a stretch of axon coloured by the local membrane
 * voltage from the cable simulation, with optional myelin segments and nodes of Ranvier.
 *
 * 1 unit = 0.5 mm along the axon (30 mm → 60 units). The thickness is exaggerated ~175×
 * and the node gaps are drawn much wider than their real 1–2 µm.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MEM_COLORS } from '../../content/membrane';
import { ADDITIVE } from './membranePatch';
import { AXON_SAMPLES } from '../../state/membraneState';

export const AXON = { length: 60, radius: 1.75, mmPerUnit: 0.5, internodes: 30, myelinR: 2.75, gap: 0.56 };

const STOPS: [number, number, number, number][] = [
  [-82, 0.07, 0.11, 0.42],
  [-65, 0.2, 0.25, 0.44],
  [-52, 0.62, 0.3, 0.3],
  [-20, 1.0, 0.55, 0.16],
  [15, 1.0, 0.8, 0.3],
  [45, 1.0, 0.97, 0.72],
];

export function voltageColor(V: number, out: THREE.Color): THREE.Color {
  if (V <= STOPS[0][0]) return out.setRGB(STOPS[0][1], STOPS[0][2], STOPS[0][3]);
  for (let i = 1; i < STOPS.length; i++) {
    if (V <= STOPS[i][0]) {
      const a = STOPS[i - 1], b = STOPS[i];
      const f = (V - a[0]) / (b[0] - a[0]);
      return out.setRGB(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
    }
  }
  const l = STOPS[STOPS.length - 1];
  return out.setRGB(l[1], l[2], l[3]);
}

function makeTag(text: string, cls = 'tag', color?: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  if (color) {
    const dot = document.createElement('i');
    dot.style.background = color;
    el.appendChild(dot);
  }
  el.appendChild(document.createTextNode(text));
  return new CSS2DObject(el);
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export interface AxonDrive {
  /** evenly resampled membrane potential along the axon */
  V: Float32Array;
  myelin: boolean;
  damage: 'none' | 'mild' | 'severe';
  /** internode index range [from, to) that is damaged */
  damaged: [number, number];
  stimX: number; // mm
  labels: boolean;
  highlight: string | null;
}

export class AxonModel {
  readonly group = new THREE.Group();
  private tube: THREE.Mesh;
  private tubeSample: Uint16Array;
  private sheaths: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private sheathScale: Float32Array;
  private halos: THREE.Sprite[] = [];
  private electrode = new THREE.Group();
  private tags: CSS2DObject[] = [];
  private tagMyelin: CSS2DObject;
  private tagNode: CSS2DObject;
  private tagDamage: CSS2DObject;
  private tagBare: CSS2DObject;
  private proxyAxon: THREE.Mesh;
  private proxyMyelin: THREE.Mesh;
  private labelsOn = true;
  private last: AxonDrive | null = null;
  private ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  private flash = new Float32Array(AXON.internodes + 1);
  private nodePrev = new Float32Array(AXON.internodes + 1).fill(-65);

  constructor() {
    const L = AXON.length;
    // --- the axon itself: vertex colours carry the voltage
    const geo = new THREE.CylinderGeometry(AXON.radius, AXON.radius, L, 20, AXON_SAMPLES - 1, true);
    geo.rotateZ(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    this.tubeSample = new Uint16Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this.tubeSample[i] = Math.round(((pos.getX(i) + L / 2) / L) * (AXON_SAMPLES - 1));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * smoothstep(0.3, 0.95, vColor.r) * 1.25;',
      );
    };
    this.tube = new THREE.Mesh(geo, mat);
    this.group.add(this.tube);
    // rounded ends
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.25, 0.44), roughness: 0.45 });
    for (const sgn of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(AXON.radius, 20, 12), capMat);
      cap.position.x = (sgn * L) / 2;
      cap.scale.x = 0.6;
      this.group.add(cap);
    }

    // --- myelin: one rounded sleeve per internode
    const n = AXON.internodes;
    const inter = L / n;
    const half = inter / 2 - AXON.gap / 2;
    const prof: THREE.Vector2[] = [];
    const R = AXON.myelinR, cr = 0.5;
    prof.push(new THREE.Vector2(AXON.radius * 0.96, -half));
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(R - cr + Math.sin(a) * cr, -half + cr - Math.cos(a) * cr)); }
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, half - cr + Math.sin(a) * cr)); }
    prof.push(new THREE.Vector2(AXON.radius * 0.96, half));
    const sheathGeo = new THREE.LatheGeometry(prof, 28);
    sheathGeo.rotateZ(-Math.PI / 2);
    this.sheaths = new THREE.InstancedMesh(sheathGeo, new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.62, metalness: 0.0,
    }), n);
    this.sheaths.frustumCulled = false;
    this.sheathScale = new Float32Array(n).fill(0);
    this.group.add(this.sheaths);

    // --- node-of-Ranvier rings that flash as the spike arrives
    this.rings = new THREE.InstancedMesh(new THREE.TorusGeometry(AXON.radius + 0.3, 0.26, 10, 32), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false, ...ADDITIVE,
    }), n + 1);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 2;
    _q.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    for (let k = 0; k <= n; k++) {
      this.rings.setMatrixAt(k, _m.compose(_p.set(-L / 2 + k * inter, 0, 0), _q, _s.set(1, 1, 1)));
      this.rings.setColorAt(k, _c.setRGB(0, 0, 0));
    }
    this.group.add(this.rings);

    // --- soft halos riding on the spike(s)
    const tex = glowTexture();
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffc66b, transparent: true, depthWrite: false, opacity: 0, ...ADDITIVE,
      }));
      sp.scale.setScalar(9);
      sp.renderOrder = 1;
      this.halos.push(sp);
      this.group.add(sp);
    }

    // --- stimulating electrode
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 14), new THREE.MeshStandardMaterial({
      color: 0xd9dde8, metalness: 0.7, roughness: 0.25, emissive: 0xffb86b, emissiveIntensity: 0.25,
    }));
    tip.rotation.z = Math.PI;
    tip.position.y = AXON.radius + 1.3;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 5, 8), new THREE.MeshStandardMaterial({ color: 0x9aa3b8, metalness: 0.6, roughness: 0.35 }));
    shaft.position.y = AXON.radius + 5;
    const stimTag = makeTag('stimulus', 'tag small');
    stimTag.position.y = AXON.radius + 8.4;
    this.electrode.add(tip, shaft, stimTag);
    this.group.add(this.electrode);
    this.tags.push(stimTag);

    // --- ruler (truthful along the length)
    const rulerPts: number[] = [];
    const y = -5.6;
    rulerPts.push(-L / 2, y, 0, L / 2, y, 0);
    for (let mm = 0; mm <= 30; mm += 1) {
      const x = -L / 2 + mm / AXON.mmPerUnit;
      const h = mm % 10 === 0 ? 0.9 : mm % 5 === 0 ? 0.6 : 0.3;
      rulerPts.push(x, y, 0, x, y + h, 0);
      if (mm % 10 === 0) {
        const t = makeTag(`${mm} mm`, 'tag small');
        t.position.set(x, y - 1.3, 0);
        this.group.add(t);
        this.tags.push(t);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rulerPts, 3));
    this.group.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8a94ad, transparent: true, opacity: 0.7 })));

    // --- labels
    this.tagBare = makeTag('bare axon: channels all along it', 'tag mem-name', MEM_COLORS.axon);
    this.tagBare.position.set(-6, 4.2, 0);
    this.tagMyelin = makeTag('myelin sheath', 'tag mem-name', MEM_COLORS.myelin);
    this.tagMyelin.position.set(-L / 2 + inter * 6.5, 5.0, 0);
    this.tagNode = makeTag('node of Ranvier', 'tag mem-name', MEM_COLORS.node);
    this.tagNode.position.set(-L / 2 + inter * 10, -3.9, 0);
    this.tagDamage = makeTag('damaged myelin', 'tag mem-name', MEM_COLORS.threshold);
    this.tagDamage.position.set(0, 5.4, 0);
    const end = makeTag('to the synapses →', 'tag small');
    end.position.set(L / 2 - 2, 4.4, 0);
    this.group.add(this.tagBare, this.tagMyelin, this.tagNode, this.tagDamage, end);
    this.tags.push(this.tagBare, this.tagMyelin, this.tagNode, this.tagDamage, end);

    // --- pick proxies
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    this.proxyAxon = new THREE.Mesh(new THREE.CylinderGeometry(AXON.radius * 1.3, AXON.radius * 1.3, L, 10), hidden);
    this.proxyAxon.rotation.z = Math.PI / 2;
    this.proxyMyelin = new THREE.Mesh(new THREE.CylinderGeometry(AXON.myelinR, AXON.myelinR, L, 12), hidden);
    this.proxyMyelin.rotation.z = Math.PI / 2;
    this.group.add(this.proxyAxon, this.proxyMyelin);
  }

  hideDom() {
    for (const t of this.tags) t.element.style.display = 'none';
  }

  pick(ray: THREE.Raycaster): { id: string; point: THREE.Vector3 } | null {
    const d = this.last;
    this.group.updateMatrixWorld();
    if (d?.myelin) {
      const hit = ray.intersectObject(this.proxyMyelin, false)[0];
      if (hit) {
        const x = this.group.worldToLocal(hit.point.clone()).x + AXON.length / 2;
        const inter = AXON.length / AXON.internodes;
        const k = Math.floor(x / inter);
        const nearNode = Math.abs(x - Math.round(x / inter) * inter) < AXON.gap / 2 + 0.12;
        const stripped = d.damage === 'severe' && k >= d.damaged[0] && k < d.damaged[1];
        if (nearNode) return { id: 'node', point: hit.point };
        if (!stripped) return { id: 'myelin', point: hit.point };
      }
    }
    const hit = ray.intersectObject(this.proxyAxon, false)[0];
    return hit ? { id: 'axon', point: hit.point } : null;
  }

  focusOf(id: string): THREE.Vector3 {
    if (id === 'node') return this.tagNode.position.clone().setY(0);
    if (id === 'myelin') return this.tagMyelin.position.clone().setY(0);
    return new THREE.Vector3(0, 0, 0);
  }

  update(dt: number, d: AxonDrive) {
    this.last = d;
    const L = AXON.length;
    const n = AXON.internodes;
    const inter = L / n;

    // voltage → vertex colours
    const col = this.tube.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const ramp = new Float32Array(AXON_SAMPLES * 3);
    for (let i = 0; i < AXON_SAMPLES; i++) {
      voltageColor(d.V[i], _c);
      ramp[i * 3] = _c.r; ramp[i * 3 + 1] = _c.g; ramp[i * 3 + 2] = _c.b;
    }
    for (let v = 0; v < this.tubeSample.length; v++) {
      const s = this.tubeSample[v] * 3;
      arr[v * 3] = ramp[s]; arr[v * 3 + 1] = ramp[s + 1]; arr[v * 3 + 2] = ramp[s + 2];
    }
    col.needsUpdate = true;

    // myelin sleeves grow / shrink; damaged ones are thin or gone
    const k = 1 - Math.exp(-7 * dt);
    const cream = new THREE.Color(MEM_COLORS.myelin);
    const sick = new THREE.Color(0xa98f78);
    for (let i = 0; i < n; i++) {
      const dmg = d.damage !== 'none' && i >= d.damaged[0] && i < d.damaged[1];
      const target = !d.myelin ? 0 : dmg ? (d.damage === 'mild' ? 0.4 : 0) : 1;
      this.sheathScale[i] += (target - this.sheathScale[i]) * k;
      const s = Math.max(this.sheathScale[i], 0.0001);
      // radial scale only; never thinner than the axon itself
      const rs = s < 0.02 ? 0.0001 : 0.62 + 0.38 * s;
      this.sheaths.setMatrixAt(i, _m.compose(_p.set(-L / 2 + (i + 0.5) * inter, 0, 0), _q.identity(), _s.set(s < 0.02 ? 0.0001 : 1, rs, rs)));
      _c.copy(dmg ? sick : cream);
      if (d.highlight === 'myelin') _c.lerp(new THREE.Color(0xffffff), 0.25);
      this.sheaths.setColorAt(i, _c);
    }
    this.sheaths.instanceMatrix.needsUpdate = true;
    if (this.sheaths.instanceColor) this.sheaths.instanceColor.needsUpdate = true;
    this.sheaths.visible = this.sheathScale.some((s) => s > 0.02);

    // node rings: each node flashes at the moment it fires, then fades — so the spike is seen to hop
    const fade = Math.exp(-dt / 0.3);
    for (let i = 0; i <= n; i++) {
      const v = d.V[Math.min(AXON_SAMPLES - 1, Math.round((i / n) * (AXON_SAMPLES - 1)))];
      if (v > -35 && this.nodePrev[i] <= -35) this.flash[i] = 1;
      else this.flash[i] *= fade;
      this.nodePrev[i] = v;
      const on = d.myelin ? 0.1 + this.flash[i] * 1.5 + THREE.MathUtils.smoothstep(v, -50, 20) * 0.25 + (d.highlight === 'node' ? 0.25 : 0) : 0;
      this.rings.setColorAt(i, _c.set(MEM_COLORS.node).multiplyScalar(on));
      const sc = 1 + this.flash[i] * 0.55;
      this.rings.setMatrixAt(i, _m.compose(_p.set(-L / 2 + i * inter, 0, 0), this.ringQ, _s.set(sc, sc, 1)));
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.rings.visible = d.myelin;

    // halos on the local voltage maxima
    let h = 0;
    for (let i = 1; i < AXON_SAMPLES - 1 && h < this.halos.length; i++) {
      const v = d.V[i];
      if (v > -25 && v >= d.V[i - 1] && v > d.V[i + 1]) {
        const sp = this.halos[h++];
        sp.position.set(-L / 2 + (i / (AXON_SAMPLES - 1)) * L, 0, 0);
        (sp.material as THREE.SpriteMaterial).opacity = d.myelin ? 0 : THREE.MathUtils.smoothstep(v, -25, 25) * 0.7;
        sp.scale.setScalar(11);
        // skip the rest of this hump
        while (i < AXON_SAMPLES - 1 && d.V[i] > -25) i++;
      }
    }
    for (; h < this.halos.length; h++) (this.halos[h].material as THREE.SpriteMaterial).opacity = 0;

    this.electrode.position.x = -L / 2 + d.stimX / AXON.mmPerUnit;

    // labels
    const dmgMid = -L / 2 + ((d.damaged[0] + d.damaged[1]) / 2) * inter;
    this.tagDamage.position.x = dmgMid;
    this.tagDamage.element.lastChild!.textContent = d.damage === 'severe' ? 'myelin lost' : 'thinned myelin';
    this.labelsOn = d.labels;
    for (const t of this.tags) t.visible = d.labels;
    this.tagBare.visible = d.labels && !d.myelin;
    this.tagMyelin.visible = d.labels && d.myelin;
    this.tagNode.visible = d.labels && d.myelin;
    this.tagDamage.visible = d.labels && d.myelin && d.damage !== 'none';
  }
}
