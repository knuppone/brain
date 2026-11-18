import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Level, type CameraHome } from '../Level';
import { useCore } from '../../state/store';
import { synapseSim, syncSim, useSynapse, useSynapseLive } from '../../state/synapseState';
import {
  CA_CHANNELS, GEO, SLOTS, M_DEGRADE, M_ESCAPE, M_FREE, isGPCR, mgUnblock,
  type DrugId, type ReceptorKind, type TransmitterId,
} from '../../sim/synapse';
import {
  COLORS, RECEPTOR_NAMES, STAGES, drugById, partById, transmitterById,
} from '../../content/synapse';
import {
  AXON_R, AXON_TOP, GlowPoints, ProteinSet, astroGeometry, astroProfile, bendX, cristaeTexture, cutRibbon, halfShell,
  membraneMaterial, moleculeGeometry, pacmanGeometry, postProfile, preProfile, radiusAt, type MembraneMaterial, type ProteinStyle,
} from '../procedural/synapseParts';

const { H, R } = GEO;
const col = (c: string) => new THREE.Color(c);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const BIG = new THREE.Sphere(new THREE.Vector3(), 60);
const MOL_CAP = 700;
/** the few labels that fit on a phone screen */
const PHONE_TAGS = new Set(['terminal', 'receptor', 'astrocyte', 'cleft']);

const RECEPTOR_STYLE: Record<ReceptorKind, ProteinStyle & { color: string }> = {
  ampa: { k: 4, ringR: 0.105, subR: 0.075, len: 0.2, widen: 0.6, twist: 0.3, color: '#dcc6f2' },
  nmda: { k: 4, ringR: 0.125, subR: 0.088, len: 0.25, widen: 0.55, twist: 0.3, color: '#8f7fe6' },
  gabaa: { k: 5, ringR: 0.12, subR: 0.072, len: 0.21, widen: 0.5, twist: 0.3, color: '#9fd0ee' },
  nachr: { k: 5, ringR: 0.12, subR: 0.072, len: 0.22, widen: 0.5, twist: 0.3, color: '#cfe39a' },
  d1: { k: 7, ringR: 0.1, subR: 0.042, len: 0.21, widen: 0.0, twist: 0.12, color: '#f2a5c8' },
  d2: { k: 7, ringR: 0.1, subR: 0.042, len: 0.21, widen: 0.0, twist: 0.12, color: '#b9a0f0' },
  '5ht': { k: 7, ringR: 0.1, subR: 0.042, len: 0.21, widen: 0.0, twist: 0.12, color: '#c9b6f7' },
};
const CA_STYLE: ProteinStyle = { k: 4, ringR: 0.1, subR: 0.07, len: 0.2, widen: 0.65, twist: 0.32 };
const TRANSPORTER_STYLE: ProteinStyle = { k: 2, ringR: 0.085, subR: 0.095, len: 0.22, widen: 0.35, twist: 0.2 };

interface Ion { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; kind: number }
interface Flash { x: number; y: number; z: number; life: number; max: number; size: number; color: THREE.Color }
interface Tag { id: string; obj: CSS2DObject; el: HTMLDivElement; minor: boolean }

export class SynapseLevel extends Level {
  readonly manualFraming = true;
  readonly id = 'synapse' as const;
  /** one world unit = 100 nanometres */
  readonly metersPerUnit = 1e-7;
  readonly home: CameraHome = {
    position: new THREE.Vector3(12, 9, 32), target: new THREE.Vector3(1.4, 1.5, 0), minDistance: 3.2, maxDistance: 85,
  };

  private unsub: (() => void)[] = [];
  private shown: TransmitterId | null = null;
  private preMat!: MembraneMaterial;
  private postMat!: MembraneMaterial;
  private pickables: { obj: THREE.Object3D; id: string; protein?: boolean }[] = [];
  private cleftPick!: THREE.Mesh;

  private vesShell!: THREE.InstancedMesh;
  private vesCore!: THREE.InstancedMesh;
  private coreMat!: THREE.MeshStandardMaterial;
  private pores!: THREE.InstancedMesh;
  private molecules!: THREE.InstancedMesh;
  private molMat!: THREE.MeshStandardMaterial;
  private molGeos = new Map<TransmitterId, THREE.BufferGeometry>();
  private receptors!: ProteinSet;
  private caChannels!: ProteinSet;
  private transporters!: ProteinSet;
  private gproteins!: THREE.InstancedMesh;
  private enzymes!: THREE.InstancedMesh;
  private markers!: THREE.InstancedMesh;
  private glow!: GlowPoints;
  private messengerLight!: THREE.Mesh;

  private ions: Ion[] = [];
  private flashes: Flash[] = [];
  private cloud: { x: number; y: number; z: number; ph: number }[] = [];
  private postWave = -1;
  private firedTimer = 0;
  private vt = 0;
  private liveTick = 0;
  private caSpawn = 0;
  private tags: Tag[] = [];
  private apTag!: Tag;
  private fireTag!: Tag;
  private stageTag!: Tag;
  private lastHeldStage = -1;
  private wasBusy = false;
  private hovered: string | null = null;
  private clickSelected = false;
  private preProf: THREE.Vector2[] = [];
  private mitoPos = [new THREE.Vector3(-1.7, 5.0, -2.7), new THREE.Vector3(2.3, 3.3, -2.75)];

  private tColor = col('#ffa53d');
  private cCa = col(COLORS.ca); private cNa = col(COLORS.na); private cCl = col(COLORS.cl);
  private cMess = col(COLORS.messenger); private cWhite = col('#ffffff'); private cSpike = col(COLORS.spike);
  private tmpC = new THREE.Color(); private tmpC2 = new THREE.Color();
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v3 = new THREE.Vector3(); private s3 = new THREE.Vector3();
  private e3 = new THREE.Euler();

  // ------------------------------------------------------------------- build
  protected async load() {
    const root = this.root;
    const pre = preProfile(), post = postProfile();
    this.preProf = pre;

    // membranes: back halves of the bouton and the spine, with a two-tone "bilayer" cut edge
    this.preMat = membraneMaterial(COLORS.pre, { opacity: 0.46 });
    this.postMat = membraneMaterial(COLORS.post, { opacity: 0.5 });
    this.postMat.userData.waveColor.value.set('#ffe0a0');
    const preShell = new THREE.Mesh(halfShell(pre, bendX), this.preMat);
    const postShell = new THREE.Mesh(halfShell(post), this.postMat);
    preShell.renderOrder = 1; postShell.renderOrder = 1;
    root.add(preShell, postShell);
    root.add(cutRibbon(pre, ['#c9d8ff', '#33415f', '#8fa8e6'], 0.13, bendX));
    root.add(cutRibbon(post, ['#ead8f6', '#44355a', '#c3a2dc'], 0.13));
    this.pickables.push({ obj: preShell, id: 'terminal' }, { obj: postShell, id: 'spine' });

    // active zone (where vesicles dock) and postsynaptic density (the scaffold that holds receptors)
    const az = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.05, 40, 1, false, Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#b9c9f2', transparent: true, opacity: 0.35, roughness: 0.6, depthWrite: false }));
    az.position.y = H + 0.07;
    const psd = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.3, 0.26, 40, 1, false, Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({ color: '#6b4f86', transparent: true, opacity: 0.55, roughness: 0.8, depthWrite: false }));
    psd.position.y = -H - 0.36;
    az.renderOrder = 2; psd.renderOrder = 2;
    root.add(az, psd);

    // astrocyte process wrapping the right-hand side of the cleft
    const aProf = astroProfile(pre, post);
    const arc = GEO.ASTRO_TO + 0.12;
    const ag = astroGeometry(aProf, arc);
    // drawn solid: it sits behind the translucent neurons from most viewpoints
    const astroMat = membraneMaterial('#4a9485', { opacity: 1, repeat: [18, 30] });
    astroMat.transparent = false; astroMat.depthWrite = true;
    const astro = new THREE.Mesh(ag.body, astroMat);
    const astroCaps = new THREE.Mesh(ag.caps, new THREE.MeshStandardMaterial({
      color: '#2f6e62', side: THREE.DoubleSide, roughness: 0.8,
    }));
    astro.renderOrder = 3; astroCaps.renderOrder = 4;
    const astroRim = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(aProf.map((p) => new THREE.Vector3(p.x, p.y, 0.006))),
      new THREE.LineBasicMaterial({ color: '#a6e6d6', transparent: true, opacity: 0.9 }));
    root.add(astro, astroCaps, astroRim);
    this.pickables.push({ obj: astro, id: 'astrocyte' }, { obj: astroCaps, id: 'astrocyte' });

    // mitochondria
    const mitoMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: cristaeTexture(), roughness: 0.55 });
    this.mitoPos.forEach((p, i) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.5, 6, 18), mitoMat);
      m.position.copy(p);
      m.rotation.set(0.2, 0.3, i === 0 ? 1.0 : -0.75);
      root.add(m);
      this.pickables.push({ obj: m, id: 'mitochondrion' });
    });

    // vesicles: glassy shell + glowing core of transmitter
    const nV = synapseSim.vesicles.length;
    this.vesShell = new THREE.InstancedMesh(new THREE.SphereGeometry(GEO.VESICLE_R, 20, 14),
      new THREE.MeshPhysicalMaterial({ color: '#e9f0ff', roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.2, depthWrite: false }), nV);
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.16 });
    this.vesCore = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(GEO.VESICLE_R * 0.8, 2), this.coreMat, nV);
    this.pores = new THREE.InstancedMesh(new THREE.TorusGeometry(0.2, 0.032, 8, 24).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), SLOTS.length);
    for (const m of [this.vesShell, this.vesCore, this.pores]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.boundingSphere = BIG; }
    this.vesShell.renderOrder = 5;
    root.add(this.vesCore, this.vesShell, this.pores);
    this.pickables.push({ obj: this.vesShell, id: 'vesicle' });

    // membrane proteins
    this.caChannels = new ProteinSet(CA_CHANNELS.length, 4);
    CA_CHANNELS.forEach((c, i) => this.caChannels.place(i, new THREE.Vector3(c.x, H, c.z), UP, CA_STYLE));
    this.receptors = new ProteinSet(24, 7);
    this.transporters = new ProteinSet(synapseSim.transporters.length, 2);
    synapseSim.transporters.forEach((t, i) => {
      if (t.site === 'pre') this.transporters.place(i, new THREE.Vector3(t.x, H, t.z), UP, TRANSPORTER_STYLE);
      else {
        const n = new THREE.Vector3(t.x, 0, t.z).normalize();
        this.transporters.place(i, new THREE.Vector3(t.x, 0, t.z).addScaledVector(n, 0.16), n, TRANSPORTER_STYLE);
      }
    });
    for (const set of [this.caChannels, this.receptors, this.transporters]) { set.mesh.boundingSphere = BIG; root.add(set.mesh); }
    this.pickables.push(
      { obj: this.caChannels.mesh, id: 'cachannel', protein: true },
      { obj: this.receptors.mesh, id: 'receptor', protein: true },
      { obj: this.transporters.mesh, id: 'transporter', protein: true },
    );

    this.gproteins = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.4 }), 24);
    this.enzymes = new THREE.InstancedMesh(pacmanGeometry(0.14), new THREE.MeshStandardMaterial({ color: '#d9f08f', roughness: 0.45, side: THREE.DoubleSide }), synapseSim.enzymes.length);
    this.markers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.12 }), 96);
    for (const m of [this.gproteins, this.enzymes, this.markers]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.boundingSphere = BIG;
      for (let i = 0; i < m.count; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, this.cWhite); }
      root.add(m);
    }
    this.pickables.push({ obj: this.enzymes, id: 'enzyme', protein: true });

    // transmitter molecules
    this.molMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.4 });
    for (const id of ['glutamate', 'gaba', 'dopamine', 'serotonin', 'acetylcholine'] as TransmitterId[]) this.molGeos.set(id, moleculeGeometry(id));
    this.molecules = new THREE.InstancedMesh(this.molGeos.get('glutamate')!, this.molMat, MOL_CAP);
    this.molecules.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.molecules.frustumCulled = false;
    root.add(this.molecules);

    this.glow = new GlowPoints(2200, this.ctx.renderer.getPixelRatio());
    root.add(this.glow.points);

    // slow "second messenger" glow inside the spine (G-protein-coupled receptors)
    this.messengerLight = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 16, 0, Math.PI * 2, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: COLORS.messenger, transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide }));
    this.messengerLight.position.set(0, -2.3, -0.2);
    this.messengerLight.scale.set(1.2, 0.8, 0.9);
    this.messengerLight.renderOrder = 0;
    root.add(this.messengerLight);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (this.cloud.length < 80) {
      const x = (rnd() * 2 - 1) * 2.9, y = -0.95 - rnd() * 2.9, z = -0.15 - rnd() * 2.6;
      if (Math.hypot(x, z) < 3.1 - Math.abs(y + 2) * 0.5) this.cloud.push({ x, y, z, ph: rnd() * 6.28 });
    }

    // invisible slab for picking the cleft itself
    this.cleftPick = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2 * H - 0.3, 24, 1, false, Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ visible: false }));
    root.add(this.cleftPick);

    this.buildTags();
    this.fitHome();
    syncSim();
    this.rebuild();
    this.draw();
  }

  private makeTag(id: string, text: string, pos: THREE.Vector3, minor = false, cls = ''): Tag {
    const el = document.createElement('div');
    el.className = `tag ${minor ? 'small syn-minor' : ''} ${cls}`;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.copy(pos);
    return { id, obj, el, minor };
  }

  private buildTags() {
    const T = (id: string, text: string, x: number, y: number, z: number, minor = false) =>
      this.tags.push(this.makeTag(id, text, new THREE.Vector3(x, y, z), minor));
    T('axon', 'Axon — the spike arrives this way', bendX(13.2) + 1.2, 13.2, 0, true);
    T('terminal', 'Axon terminal · the sender', -4.0, 5.0, 0);
    T('vesicle', 'Vesicles full of transmitter', 0.6, 5.9, -0.2);
    T('mitochondrion', 'Mitochondrion', this.mitoPos[0].x - 0.9, this.mitoPos[0].y + 0.9, this.mitoPos[0].z, true);
    T('cachannel', 'Ca²⁺ channels', -0.45, H + 0.5, -0.1, true);
    T('cleft', 'Synaptic cleft · drawn 4× too wide', -5.6, 0.25, 0);
    T('receptor', 'Receptors', 0, -1.25, 0);
    T('transporter', 'Transporter', 2.55, H + 0.55, -0.4, true);
    T('astrocyte', 'Astrocyte · a glial helper', 5.4, 3.1, 0);
    T('spine', 'Dendritic spine · the receiver', -3.3, -4.3, 0);
    T('dendrite', 'Dendrite of the next neuron', 5.4, -8.0, 0, true);
    this.apTag = this.makeTag('ap', 'Action potential', new THREE.Vector3(), false, 'syn-pulse');
    this.fireTag = this.makeTag('fire', 'The next neuron fires!', new THREE.Vector3(0, -6.0, 0), false, 'syn-fire');
    this.stageTag = this.makeTag('stage', '', new THREE.Vector3(), false, 'syn-stage');
  }

  /** frame the synapse in the free area between the rail, the panel and the dock */
  private view(target: THREE.Vector3, dist: number, azimuth = -18, elevation = 13) {
    const el = this.ctx.renderer.domElement;
    const w = el.clientWidth || 1440, h = el.clientHeight || 900;
    const phone = w / h < 0.8;
    const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad((phone ? 46 : 32) / 2));
    const a = THREE.MathUtils.degToRad(-Math.abs(azimuth)), e = THREE.MathUtils.degToRad(elevation); // always viewed from the open (left) side
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const t = target.clone();
    if (phone) t.y -= visH * 0.235;
    else if (w > 860) t.addScaledVector(right, visH * (useCore.getState().panelOpen ? 0.085 : -0.02)).y -= visH * 0.02;
    return { position: t.clone().addScaledVector(dir, dist), target: t };
  }

  private fitHome() {
    const el = this.ctx.renderer.domElement;
    const phone = (el.clientWidth || 1440) / (el.clientHeight || 900) < 0.8;
    const v = phone ? this.view(new THREE.Vector3(0.6, 1.4, 0), 48, -16, 12) : this.view(new THREE.Vector3(0.4, 0.5, 0), 26.5, -18, 13);
    this.home.position.copy(v.position);
    this.home.target.copy(v.target);
  }

  // ------------------------------------------------------------------ enter
  enter() {
    this.fitHome();
    window.addEventListener('resize', this.onResize);
    for (const t of [...this.tags, this.apTag, this.fireTag, this.stageTag]) this.root.add(t.obj);
    syncSim();
    this.applySelection(useCore.getState().selection.synapse, false);
    this.syncTags();
    this.unsub.push(
      useSynapse.subscribe((n, p) => {
        syncSim();
        if (n.labels !== p.labels) this.syncTags();
        if (n.stepMode !== p.stepMode && !n.stepMode) { this.lastHeldStage = -1; void this.ctx.flyTo(this.home.position, this.home.target, 0.9); }
      }),
      useCore.subscribe((n, p) => {
        if (n.selection.synapse !== p.selection.synapse) {
          this.applySelection(n.selection.synapse, !this.clickSelected);
          this.syncTags();
        }
      }),
    );
  }

  private onResize = () => this.fitHome();

  exit() {
    window.removeEventListener('resize', this.onResize);
    this.unsub.forEach((u) => u());
    this.unsub = [];
    // CSS2D elements are only removed from the page when their object leaves the scene graph
    for (const t of [...this.tags, this.apTag, this.fireTag, this.stageTag]) this.root.remove(t.obj);
    this.hovered = null;
    useSynapse.getState().set({ autoFire: false });
  }

  private applySelection(id: string | null, fly: boolean) {
    if (!id) return;
    const st = useSynapse.getState();
    if (transmitterById.has(id)) { st.set({ transmitter: id as TransmitterId }); return; }
    const d = drugById.get(id);
    if (d) {
      if (!d.transmitters.includes(st.transmitter)) st.set({ transmitter: d.transmitters[0] });
      st.toggleDrug(d.id as DrugId, true);
      return;
    }
    if (id === 'enzyme' && st.transmitter !== 'acetylcholine') st.set({ transmitter: 'acetylcholine' });
    if (!fly || !partById.has(id) || st.stepMode) return;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const views: Record<string, [THREE.Vector3, number, number, number]> = {
      terminal: [V(0, 3.6, -1), 22, 20, 12], vesicle: [V(0, 2.2, -1), 11, 18, 10], cachannel: [V(0, 0.75, -0.6), 6.5, 14, 14],
      cleft: [V(0, 0, -0.8), 9, 14, 7], receptor: [V(0, -0.5, -0.9), 6.5, 14, 26], transporter: [V(2.2, 0.3, -0.9), 7, 6, 8],
      enzyme: [V(0, -0.2, -0.9), 6, 12, 14], astrocyte: [V(4.4, 0.2, -1), 15, 24, 10], mitochondrion: [this.mitoPos[1].clone(), 9, -16, 8],
      spine: [V(0, -3.6, -1), 20, 20, 10],
    };
    const v = views[id];
    if (!v) return;
    const { position, target } = this.view(v[0], v[1], v[2], v[3]);
    void this.ctx.flyTo(position, target, 1.0);
  }

  /** hide labels that would sit underneath the info panel or the dock */
  private cullTags() {
    if (!useSynapse.getState().labels) return;
    const el = this.ctx.renderer.domElement;
    const w = el.clientWidth, h = el.clientHeight;
    const open = useCore.getState().panelOpen;
    const phone = w <= 860;
    const v = this.v3;
    for (const t of this.tags) {
      v.copy(t.obj.position).project(this.ctx.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      let ok = v.z < 1 && x > 40 && x < w - 40 && y > 70;
      if (phone) ok &&= PHONE_TAGS.has(t.id) && y < (open ? h * 0.54 - 110 : h - 130) && y > 110;
      else ok &&= !(open && x > w - 372 - 14 - 90) && !(y > h - 112 && x > 200);
      t.obj.visible = ok;
    }
  }

  private syncTags() {
    const on = useSynapse.getState().labels;
    const sel = useCore.getState().selection.synapse;
    for (const t of this.tags) {
      t.obj.visible = on;
      t.el.classList.toggle('syn-on', t.id === sel);
    }
  }

  /** everything that depends on which transmitter is in use */
  private rebuild() {
    const sim = synapseSim;
    this.shown = sim.transmitter;
    const info = transmitterById.get(sim.transmitter)!;
    this.tColor.set(info.color);
    this.coreMat.color.copy(this.tColor); this.coreMat.emissive.copy(this.tColor);
    this.molMat.color.copy(this.tColor); this.molMat.emissive.copy(this.tColor);
    this.molecules.geometry = this.molGeos.get(sim.transmitter)!;
    this.receptors.setCount(sim.receptors.length);
    sim.receptors.forEach((r, i) => this.receptors.place(i, new THREE.Vector3(r.x, -H, r.z), UP, RECEPTOR_STYLE[r.kind]));
    for (let i = 0; i < this.gproteins.count; i++) this.gproteins.setMatrixAt(i, ZERO);
    this.gproteins.instanceMatrix.needsUpdate = true;
    this.enzymes.visible = sim.transmitter === 'acetylcholine';
    this.ions.length = 0;
    const set = (id: string, text: string, pos?: [number, number, number]) => {
      const t = this.tags.find((x) => x.id === id)!;
      t.el.textContent = text;
      if (pos) t.obj.position.set(...pos);
    };
    set('receptor', info.receptorTag);
    if (sim.transmitter === 'acetylcholine') set('transporter', info.clearanceTag, [1.6, -H + 0.75, -0.42]);
    else if (sim.transmitter === 'glutamate') set('transporter', info.clearanceTag, [3.2, 0.45, -0.5]);
    else set('transporter', info.clearanceTag, [2.55, H + 0.55, -0.4]);
  }

  // ----------------------------------------------------------------- update
  update(dt: number) {
    const st = useSynapse.getState();
    const sim = synapseSim;
    const sdt = dt * st.speed;
    sim.step(sdt);
    if (sim.transmitter !== this.shown) this.rebuild();
    const vdt = sim.held ? 0 : sdt;
    this.vt += vdt;
    this.consumeEvents();
    this.spawn(vdt);
    this.draw();
    this.stepCamera();
    this.cullTags();

    this.liveTick -= dt;
    if (this.liveTick <= 0) {
      this.liveTick = 0.1;
      const live = useSynapseLive.getState();
      const next = {
        stage: sim.stage, held: sim.held, cleft: sim.freeCount + sim.boundCount, open: sim.openFraction, docked: sim.dockedCount,
        messenger: Math.round(sim.messenger * 50) / 50, ampa: sim.ampaCount, ltp: sim.ltpInserted, postSpikes: sim.postSpikes,
        sinceFired: Math.min(99, Math.round((sim.t - sim.lastPostSpike) * 2) / 2),
      };
      let changed = false;
      for (const k in next) if ((next as Record<string, unknown>)[k] !== (live as unknown as Record<string, unknown>)[k]) { changed = true; break; }
      if (changed) live.set(next);
    }
  }

  private consumeEvents() {
    const sim = synapseSim;
    for (const e of sim.events) {
      switch (e.type) {
        case 'fuse': this.flash(e.x, e.y - 0.05, e.z, this.tColor, 1.2, 0.4); break;
        case 'degrade': this.flash(e.x, e.y, e.z, this.cWhite, 0.5, 0.3); break;
        case 'efflux': this.flash(e.x, e.y - 0.15, e.z, this.tColor, 0.7, 0.35); break;
        case 'ltp': this.flash(e.x, e.y, e.z, this.cWhite, 1.6, 1.2); break;
        case 'postspike': this.postWave = 0; this.firedTimer = 1.6; break;
      }
    }
    sim.events.length = 0;
  }

  private flash(x: number, y: number, z: number, color: THREE.Color, size: number, life: number) {
    if (this.flashes.length > 60) return;
    this.flashes.push({ x, y, z, life, max: life, size, color });
  }

  /** purely visual particles: Ca²⁺ entering the terminal, ions entering the spine */
  private spawn(vdt: number) {
    const sim = synapseSim;
    if (vdt <= 0) return;
    if (sim.caOpen > 0) {
      this.caSpawn += vdt * 110;
      while (this.caSpawn >= 1 && this.ions.length < 420) {
        this.caSpawn -= 1;
        const c = CA_CHANNELS[(Math.random() * CA_CHANNELS.length) | 0];
        this.ions.push({
          x: c.x + (Math.random() - 0.5) * 0.08, y: H - 0.42 + Math.random() * 0.12, z: c.z + (Math.random() - 0.5) * 0.08,
          vx: (Math.random() - 0.5) * 0.5, vy: 2.2 + Math.random(), vz: (Math.random() - 0.5) * 0.5, life: 0.9, max: 0.9, kind: 0,
        });
      }
    }
    const ion = transmitterById.get(sim.transmitter)!.ion;
    for (const r of sim.receptors) {
      if (r.latent || isGPCR(r.kind) || r.open < 0.25) continue;
      if (Math.random() < vdt * 16 * r.open && this.ions.length < 420) {
        const kind = r.kind === 'nmda' && Math.random() < 0.5 ? 0 : ion === 'Cl⁻' ? 2 : 1;
        this.ions.push({
          x: r.x + (Math.random() - 0.5) * 0.06, y: -H + 0.34, z: r.z + (Math.random() - 0.5) * 0.06,
          vx: (Math.random() - 0.5) * 0.6, vy: -(2.3 + Math.random() * 0.8), vz: (Math.random() - 0.5) * 0.6, life: 0.7, max: 0.7, kind,
        });
      }
    }
    for (let i = this.ions.length - 1; i >= 0; i--) {
      const p = this.ions[i];
      p.life -= vdt;
      if (p.life <= 0) { this.ions[i] = this.ions[this.ions.length - 1]; this.ions.pop(); continue; }
      p.x += p.vx * vdt; p.y += p.vy * vdt; p.z = Math.min(-0.02, p.z + p.vz * vdt);
      // slow down and wander once through the pore
      const through = p.kind === 0 && p.vy > 0 ? p.y > H + 0.55 : p.y < -H - 0.45;
      if (through) { p.vy *= Math.exp(-vdt * 6); p.vx += (Math.random() - 0.5) * vdt * 8; p.vz += (Math.random() - 0.5) * vdt * 8; }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= vdt;
      if (this.flashes[i].life <= 0) { this.flashes[i] = this.flashes[this.flashes.length - 1]; this.flashes.pop(); }
    }
    if (this.postWave >= 0) { this.postWave += vdt / 0.55; if (this.postWave > 1.3) this.postWave = -1; }
    if (this.firedTimer > 0) this.firedTimer -= vdt;
  }

  private draw() {
    const sim = synapseSim;
    const { m4, q, v3, s3, e3, tmpC, tmpC2 } = this;
    const glow = this.glow;
    glow.setViewport(this.ctx.renderer.domElement.height);
    glow.begin();
    const t = this.vt;
    const amph = sim.has('amphetamine');

    // --- action potentials travelling down the axon and over the bouton
    const waves = this.preMat.userData.waves.value;
    for (let i = 0; i < 4; i++) waves[i] = i < sim.aps.length ? AXON_TOP - sim.aps[i] * (AXON_TOP - 0.3) : 999;
    const pw = this.postMat.userData.waves.value;
    pw[0] = this.postWave >= 0 ? -0.5 - this.postWave * 8.2 : 999;
    if (sim.aps.length) {
      const y = waves[sim.aps.length - 1];
      const yy = Math.max(y, 1.4);
      this.apTag.obj.visible = true;
      this.apTag.obj.position.set(bendX(yy) - radiusAt(this.preProf, yy) - 1.5, yy, 0);
    } else this.apTag.obj.visible = false;
    this.fireTag.obj.visible = this.firedTimer > 0;

    // --- vesicles
    const dockY = H + GEO.VESICLE_R + 0.03;
    let fusingMask = 0;
    sim.vesicles.forEach((v, i) => {
      let sx = 1, sy = 1, y = v.y, coreS = Math.cbrt(Math.max(0, v.fill)) * (amph && v.state !== 'recycle' ? 0.72 : 1);
      if (v.state === 'fusing') {
        const k = Math.min(1, v.timer / 0.42);
        y = dockY - k * (GEO.VESICLE_R + 0.01);
        sx = 1 + 0.75 * k; sy = Math.max(0.05, 1 - 0.9 * k);
        if (k > 0.85) { const f = (1 - k) / 0.15; sx *= f; sy *= f; }
        coreS *= 1 - k;
        fusingMask |= 1 << v.slot;
        m4.makeScale(0.7 + 0.9 * k, 1, 0.7 + 0.9 * k).setPosition(v.x, H - 0.01, v.z);
        this.pores.setMatrixAt(v.slot, m4);
        glow.add(v.x, H - 0.1, v.z, this.tColor, 0.8 + k * 0.5, 0.6 * (1 - k * 0.5));
      } else if (v.state === 'docked' && v.armed) {
        glow.add(v.x, v.y - 0.1, v.z, this.cCa, 0.7, 0.5);
      }
      m4.makeScale(sx, sy, sx).setPosition(v.x, y, v.z);
      this.vesShell.setMatrixAt(i, m4);
      m4.makeScale(coreS * sx, coreS * sy, coreS * sx).setPosition(v.x, y, v.z);
      this.vesCore.setMatrixAt(i, m4);
    });
    for (let s = 0; s < SLOTS.length; s++) if (!(fusingMask & (1 << s))) this.pores.setMatrixAt(s, ZERO);
    this.vesShell.instanceMatrix.needsUpdate = true; this.vesCore.instanceMatrix.needsUpdate = true; this.pores.instanceMatrix.needsUpdate = true;

    // --- calcium channels
    const caOpen = THREE.MathUtils.clamp(sim.caOpen > 0 ? 1 : sim.ca * 0.3, 0, 1);
    for (let i = 0; i < CA_CHANNELS.length; i++) {
      tmpC.set('#c9bd7a').lerp(this.cCa, caOpen);
      this.caChannels.update(i, caOpen, tmpC);
      if (sim.caOpen > 0) glow.add(CA_CHANNELS[i].x, H + 0.05, CA_CHANNELS[i].z, this.cCa, 0.55, 0.45);
    }
    this.caChannels.commit();

    // --- markers (drug plugs, Mg²⁺ blocks, helpers)
    let nM = 0;
    const marker = (x: number, y: number, z: number, size: number, c: THREE.Color, sy = 1) => {
      if (nM >= this.markers.count) return;
      m4.makeScale(size, size * sy, size).setPosition(x, y, z);
      this.markers.setMatrixAt(nM, m4);
      this.markers.setColorAt(nM, c);
      nM++;
    };
    const drugColor = (id: string) => tmpC2.set(drugById.get(id)!.color);

    // --- receptors
    const ionC = transmitterById.get(sim.transmitter)!.ion === 'Cl⁻' ? this.cCl : this.cNa;
    let nG = 0;
    const benzo = sim.has('benzo'), alcohol = sim.has('alcohol');
    sim.receptors.forEach((r, i) => {
      const style = RECEPTOR_STYLE[r.kind];
      const gp = isGPCR(r.kind);
      tmpC.set(style.color);
      if (r.blocked) tmpC.multiplyScalar(0.55);
      else tmpC.lerp(this.cWhite, 0.45 * r.open);
      this.receptors.update(i, gp ? 0 : r.open, tmpC, r.latent ? 0 : r.present);
      if (r.latent) return;
      const top = -H + style.len + 0.06;
      if (r.bound) this.molInstance(r.x, top, r.z, 1.1, i);
      if (r.agonist) marker(r.x, top, r.z, 0.075, drugColor('nicotine'));
      if (!gp && r.open > 0.05) glow.add(r.x, -H - 0.05, r.z, r.kind === 'nmda' ? this.cCa : ionC, 0.8, 0.5 * r.open);
      if (r.present < 1 && r.present > 0) glow.add(r.x, -H, r.z, this.cWhite, 1.0, 0.8 * (1 - r.present));
      if (r.blocked) {
        const id = r.kind === 'nmda' ? 'ketamine' : r.kind === 'd2' ? 'antipsychotic' : 'curare';
        marker(r.x, top - 0.04, r.z, 0.09, drugColor(id), 1.25);
      } else if (r.kind === 'nmda') {
        // the magnesium ion that plugs the pore until the spine is depolarised
        const u = r.bound ? mgUnblock(sim.vm) : 0;
        if (u < 0.95) marker(r.x, top - 0.05 + u * 0.4, r.z, 0.07 * (1 - u * 0.6), tmpC2.set('#59e37a'));
      }
      if (r.kind === 'gabaa' && benzo) marker(r.x + 0.2, top - 0.08, r.z, 0.065, drugColor('benzo'));
      if (alcohol && (r.kind === 'gabaa' || r.kind === 'nmda')) marker(r.x - 0.2, top - 0.1, r.z, 0.06, drugColor('alcohol'));
      if (gp && nG < this.gproteins.count) {
        // the G-protein: parked under the receptor, sent off into the cell when the receptor is activated
        const a = r.open;
        const wob = Math.sin(t * 3 + i) * 0.05 * a;
        m4.makeScale(1 + 0.25 * a, 1 + 0.25 * a, 1 + 0.25 * a).setPosition(r.x + 0.12 + wob + a * 0.12, -H - 0.3 - a * 0.42, r.z - a * 0.1);
        this.gproteins.setMatrixAt(nG, m4);
        const base = r.kind === 'd2' ? tmpC.set('#8fa0d8') : tmpC.set('#d9a0c4');
        if (r.blocked) base.multiplyScalar(0.5);
        this.gproteins.setColorAt(nG, base.lerp(r.kind === 'd2' ? tmpC2.set('#9fc0ff') : this.cMess, a * 0.6));
        if (a > 0.05) glow.add(r.x + 0.12 + a * 0.12, -H - 0.3 - a * 0.42, r.z - a * 0.1, r.kind === 'd2' ? tmpC2.set('#7f9cff') : this.cMess, 0.8, 0.6 * a);
        nG++;
      }
    });
    for (let i = nG; i < this.gproteins.count; i++) this.gproteins.setMatrixAt(i, ZERO);
    this.gproteins.instanceMatrix.needsUpdate = true;
    if (this.gproteins.instanceColor) this.gproteins.instanceColor.needsUpdate = true;
    this.receptors.commit();

    // --- transporters
    sim.transporters.forEach((tr, i) => {
      if (!tr.active) tmpC.set('#737c94');
      else if (tr.reversed) tmpC.set('#ffd24a').lerp(this.cWhite, 0.3 + 0.3 * Math.sin(t * 9 + i));
      else tmpC.set(tr.site === 'astro' ? '#bfe8c8' : '#ffcf8f').lerp(this.cWhite, tr.flash * 0.6);
      if (tr.blocked) tmpC.multiplyScalar(0.6);
      this.transporters.update(i, tr.flash, tmpC, tr.active ? 1 : 0.72, tr.flash * 1.2);
      if (tr.flash > 0.05) glow.add(tr.x, tr.y, tr.z, this.tColor, 0.8, 0.6 * tr.flash);
      if (tr.blocked) marker(tr.x, H - 0.27, tr.z, 0.1, drugColor(sim.has('ssri') ? 'ssri' : 'cocaine'), 1.2);
      if (tr.reversed) marker(tr.x + 0.2, H + 0.26, tr.z, 0.055, drugColor('amphetamine'));
    });
    this.transporters.commit();

    // --- botulinum toxin sits at the release sites
    if (sim.has('botox')) {
      drugColor('botox');
      for (const s of SLOTS) { marker(s.x - 0.2, H + 0.1, s.z + 0.12, 0.055, tmpC2); marker(s.x + 0.2, H + 0.1, s.z + 0.12, 0.055, tmpC2); }
    }

    // --- acetylcholinesterase
    if (this.enzymes.visible) {
      const all = sim.has('nerveagent'), most = sim.has('donepezil');
      sim.enzymes.forEach((e, i) => {
        const plugged = all || (most && i % 5 !== 2);
        const chomp = 1 + 0.25 * Math.sin(e.flash * Math.PI);
        e3.set(0, plugged ? 0.4 : t * 0.9 + i * 1.3, 0.35);
        q.setFromEuler(e3);
        m4.compose(v3.set(e.x, e.y, e.z), q, s3.setScalar(chomp));
        this.enzymes.setMatrixAt(i, m4);
        if (plugged) {
          v3.set(0.12, 0, 0).applyQuaternion(q);
          marker(e.x + v3.x, e.y + v3.y, e.z + v3.z, 0.07, drugColor(all ? 'nerveagent' : 'donepezil'));
        }
      });
      this.enzymes.instanceMatrix.needsUpdate = true;
    }
    for (let i = nM; i < this.markers.count; i++) this.markers.setMatrixAt(i, ZERO);
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;

    // --- transmitter molecules
    let nMol = this.nBoundDrawn;
    this.nBoundDrawn = 0;
    for (let i = 0; i < sim.mN && nMol < MOL_CAP; i++) {
      const stt = sim.mState[i];
      let s = 1;
      if (stt === M_ESCAPE) s = 1 - sim.mTimer[i];
      else if (stt === M_DEGRADE) s = 1 - sim.mTimer[i];
      else if (stt !== M_FREE) s = 1 - sim.mTimer[i] * 0.75;
      e3.set(i * 1.7 + t * 1.3, i * 2.3 + t * 0.9, i);
      q.setFromEuler(e3);
      m4.compose(v3.set(sim.mx[i], sim.my[i], sim.mz[i]), q, s3.setScalar(Math.max(0.01, s)));
      this.molecules.setMatrixAt(nMol++, m4);
      glow.add(sim.mx[i], sim.my[i], sim.mz[i], this.tColor, 0.36, 0.3 * s);
    }
    this.molecules.count = nMol;
    this.molecules.instanceMatrix.needsUpdate = true;

    // --- ions
    for (const p of this.ions) {
      const a = Math.min(1, p.life / (p.max * 0.5));
      glow.add(p.x, p.y, p.z, p.kind === 0 ? this.cCa : p.kind === 1 ? this.cNa : this.cCl, 0.26, 1.15 * a);
    }
    for (const f of this.flashes) {
      const k = f.life / f.max;
      glow.add(f.x, f.y, f.z, f.color, f.size * (1.4 - 0.4 * k), k);
    }
    // --- second messenger cloud
    const mess = sim.messenger;
    (this.messengerLight.material as THREE.MeshBasicMaterial).opacity = mess * 0.16;
    this.messengerLight.visible = mess > 0.01;
    const nCloud = Math.round(mess * this.cloud.length);
    for (let i = 0; i < nCloud; i++) {
      const c = this.cloud[i];
      glow.add(c.x + Math.sin(t * 0.7 + c.ph) * 0.25, c.y + Math.cos(t * 0.5 + c.ph * 2) * 0.2, c.z + Math.sin(t * 0.6 + c.ph * 3) * 0.15, this.cMess, 0.55, 0.4);
    }
    // --- a spike in the receiving neuron
    if (this.postWave >= 0) glow.add(0, -H - 0.6 - this.postWave * 6, -0.8, this.cSpike, 4 * (1 - this.postWave * 0.6), 0.22);
    glow.end();
  }

  private nBoundDrawn = 0;
  /** bound molecules are drawn first in the molecule mesh (they are not in the simulation's free list) */
  private molInstance(x: number, y: number, z: number, s: number, i: number) {
    this.e3.set(i, i * 2, 0);
    this.q.setFromEuler(this.e3);
    this.m4.compose(this.v3.set(x, y, z), this.q, this.s3.setScalar(s));
    this.molecules.setMatrixAt(this.nBoundDrawn++, this.m4);
    this.glow.add(x, y, z, this.tColor, 0.5, 0.45);
  }

  /** step-through mode: fly to where the current stage is happening */
  private stepCamera() {
    const sim = synapseSim;
    const st = useSynapse.getState();
    const show = st.stepMode && sim.stage > 0;
    this.stageTag.obj.visible = show;
    if (!st.stepMode) return;
    if (sim.held && sim.stage !== this.lastHeldStage) {
      this.lastHeldStage = sim.stage;
      const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
      const views: [THREE.Vector3, number, number, number][] = [
        [V(0, 0, 0), 30, 20, 13],
        [V(bendX(8) - 0.5, 7, 0), 26, 18, 8], [V(0, 0.9, -0.6), 12.5, 14, 12], [V(0, 0.6, -0.6), 12, 12, 8],
        [V(0, 0.1, -0.7), 12, 12, 7], [V(0, -0.5, -0.9), 12, 12, 22], [V(0.6, 0, -0.9), 15, 16, 12],
      ];
      const anchors = [V(0, 0, 0), V(bendX(9) - 2.4, 9, 0), V(0, H + 1.05, 0), V(0, H + 1.05, 0), V(0, H + 0.75, 0), V(0, -H - 0.95, 0), V(1.4, H + 1.0, 0)];
      const v = views[sim.stage];
      const { position, target } = this.view(v[0], v[1], v[2], v[3]);
      void this.ctx.flyTo(position, target, 0.9);
      this.stageTag.obj.position.copy(anchors[sim.stage]);
      this.stageTag.el.textContent = `${sim.stage} · ${STAGES[sim.stage - 1].title}`;
    }
    if (this.wasBusy && !sim.busy && this.lastHeldStage > 0) {
      this.lastHeldStage = -1;
      void this.ctx.flyTo(this.home.position, this.home.target, 1.1);
    }
    this.wasBusy = sim.busy;
  }

  // ---------------------------------------------------------------- picking
  private pick(ray: THREE.Raycaster): { id: string; point: THREE.Vector3; index: number } | null {
    type Hit = { id: string; point: THREE.Vector3; index: number; d: number };
    let best = null as Hit | null;
    let bestProtein = null as Hit | null;
    for (const p of this.pickables) {
      if (!p.obj.visible) continue;
      const hit = ray.intersectObject(p.obj, false)[0];
      if (!hit) continue;
      const h = { id: p.id, point: hit.point, index: hit.instanceId ?? -1, d: hit.distance };
      if (p.protein) { if (!bestProtein || h.d < bestProtein.d) bestProtein = h; }
      else if (!best || h.d < best.d) best = h;
    }
    // small proteins win over the big shapes behind or around them (unless something solid is clearly in front)
    if (bestProtein && (!best || best.id === 'terminal' || best.id === 'spine' || bestProtein.d < best.d + 0.5)) return bestProtein;
    const c = ray.intersectObject(this.cleftPick, false)[0];
    if (c && (!best || c.distance < best.d)) return { id: 'cleft', point: c.point, index: -1 };
    return best;
  }

  private describe(hit: { id: string; index: number }): { text: string; sub: string } {
    const sim = synapseSim;
    const info = transmitterById.get(sim.transmitter)!;
    if (hit.id === 'receptor' && hit.index >= 0) {
      const r = sim.receptors[this.receptors.proteinOf(hit.index)];
      if (r) {
        const n = RECEPTOR_NAMES[r.kind];
        return { text: n.name, sub: r.blocked ? 'Blocked by a drug.' : n.note };
      }
    }
    if (hit.id === 'transporter' && hit.index >= 0) {
      const tr = sim.transporters[this.transporters.proteinOf(hit.index)];
      if (tr && !tr.active) return { text: 'Transporter', sub: `Not used for ${info.name.toLowerCase()} at this site.` };
      if (tr) return { text: info.clearanceTag, sub: tr.blocked ? 'Blocked by a drug — it cannot pump.' : tr.reversed ? 'Running backwards: pushing transmitter out.' : 'Pumps transmitter out of the cleft.' };
    }
    const p = partById.get(hit.id)!;
    return { text: p.name, sub: p.tagline };
  }

  onHover(ray: THREE.Raycaster | null) {
    const hit = ray ? this.pick(ray) : null;
    const key = hit ? `${hit.id}:${hit.id === 'receptor' || hit.id === 'transporter' ? hit.index : ''}` : null;
    if (key !== this.hovered) {
      this.hovered = key;
      useCore.getState().set({ hover: hit ? this.describe(hit) : null });
    }
    return !!hit;
  }

  onClick(ray: THREE.Raycaster) {
    const hit = this.pick(ray);
    const cur = useCore.getState().selection.synapse;
    const next = hit?.id ?? null;
    if (next === cur) return;
    this.clickSelected = true;
    useCore.getState().select('synapse', next);
    this.clickSelected = false;
  }

  onDoubleClick(ray: THREE.Raycaster) {
    const hit = this.pick(ray);
    if (!hit) return;
    const dir = this.ctx.camera.position.clone().sub(this.ctx.controls.target).normalize();
    const big = hit.id === 'terminal' || hit.id === 'spine' || hit.id === 'astrocyte';
    void this.ctx.flyTo(hit.point.clone().addScaledVector(dir, big ? 14 : 6), hit.point, 0.8);
  }

  /** dive into the axon's membrane, where the spike itself is made */
  diveTarget() {
    return new THREE.Vector3(bendX(10.5) + AXON_R, 10.5, 0);
  }
}

