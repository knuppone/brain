import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Level, type CameraHome } from '../Level';
import { BrainModel } from '../BrainModel';
import { useCore } from '../../state/store';
import { useSystems } from '../../state/systemsState';
import { SYSTEMS, type BrainSystem } from '../../content/systems';
import { structureById } from '../../content/regions';
import { ANATOMY, type P3, type SystemAnatomy } from '../procedural/systemsAnatomy';
import { ink, onTheme, setGlowBlend } from '../theme3d';
import { ADDITIVE, buildTracts, haloTexture, orbMaterial, toScene, tractMaterial, VertexSampler } from '../procedural/systemsTracts';

interface Marker {
  kind: 'nucleus' | 'station';
  pos: THREE.Vector3;
  r: number;
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  /** nucleus: index into info.nuclei; station: step number */
  ref: number;
  phase: number;
}

interface Tag {
  obj: CSS2DObject;
  el: HTMLElement;
  step: number;
}

interface Sys {
  info: BrainSystem;
  anat: SystemAnatomy;
  group: THREE.Group;
  color: THREE.Color;
  /** `color` as ink for the light stage */
  inkColor: THREE.Color;
  mat: THREE.ShaderMaterial | null;
  orbMat: THREE.ShaderMaterial | null;
  markers: Marker[];
  tags: Tag[];
  pick: THREE.Vector3[];
  pickStep: number[];
  opacity: number;
  target: number;
  /** eases to 1 while this is the selected system (station markers only show then) */
  focus: number;
  tint: THREE.Color;
}

type Hit = { sys: Sys; marker?: Marker; step?: number };

const HOME_POS = new THREE.Vector3(34, 8, 30);
const HOME_TARGET = new THREE.Vector3(0, 0.2, -1.4);
const STEP_SECONDS = 2.8;
const GLASS_STRENGTH = 0.72;
/** a cooler, greyer outline than the default so blue tracts still stand out */
const GLASS_COLOR = '#93a5da';
/** light stage: a faint grey-blue pencil outline, well behind the ink tracts */
const GLASS_STRENGTH_LIGHT = 0.5;
const GLASS_COLOR_LIGHT = '#6f7ea8';
const WHITE = new THREE.Color(0xffffff);
const hsl = { h: 0, s: 0, l: 0 };

/** ink version of a (bright) system colour for the light stage */
function inkOf(color: THREE.Color): THREE.Color {
  color.getHSL(hsl);
  // near-white colours carry no real hue: draw them as slate rather than a vivid accident
  if (hsl.l > 0.88) return new THREE.Color('#5a6aa8');
  // yellows and greens need to go darker than blues and reds to hold a line on white
  const warm = hsl.h > 0.08 && hsl.h < 0.45;
  return ink(color, warm ? 0.4 : 0.48);
}

export class SystemsLevel extends Level {
  readonly id = 'systems' as const;
  readonly metersPerUnit = 0.01;
  readonly home: CameraHome = {
    position: HOME_POS.clone(), target: HOME_TARGET.clone(), minDistance: 12, maxDistance: 95,
  };

  private brain!: BrainModel;
  private systems: Sys[] = [];
  private byId = new Map<string, Sys>();
  private stage = new THREE.Group();
  private unsub: (() => void)[] = [];
  private flow = 0;
  private clock = 0;
  private stepTimer = 0;
  private hovered: Hit | null = null;
  /** the shared cortex outline shader, toned down while this level is on stage */
  private glass: THREE.ShaderMaterial | null = null;
  private sphere = new THREE.SphereGeometry(1, 20, 14);
  private light = false;

  protected async load() {
    this.brain = await BrainModel.load((p) => this.ctx.progress(p * 0.8));
    const sampler = new VertexSampler(this.brain.group);
    this.root.add(this.stage);
    SYSTEMS.forEach((info, i) => {
      this.systems.push(this.buildSystem(info, sampler, 1000 + i * 77));
      this.ctx.progress(0.8 + (0.2 * (i + 1)) / SYSTEMS.length);
    });
    this.systems.forEach((s) => this.byId.set(s.info.id, s));
  }

  private buildSystem(info: BrainSystem, sampler: VertexSampler, seed: number): Sys {
    const anat = ANATOMY[info.id];
    const group = new THREE.Group();
    group.visible = false;
    this.stage.add(group);
    const color = new THREE.Color(info.color);
    const sys: Sys = {
      info, anat, group, color, inkColor: inkOf(color), mat: null, orbMat: null, markers: [], tags: [], pick: [], pickStep: [],
      opacity: 0, target: 0, focus: 0, tint: color.clone(),
    };

    const built = buildTracts(anat.tracts, sampler, seed);
    sys.pick = built.pick;
    sys.pickStep = built.pickStep;
    if (built.geometry) {
      sys.mat = tractMaterial(color, info.kind === 'pathways');
      const mesh = new THREE.Mesh(built.geometry, sys.mat);
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      group.add(mesh);
    }

    const sides = (at: P3, mirror?: boolean) => {
      const p = toScene(at);
      return mirror ? [p, new THREE.Vector3(-p.x, p.y, p.z)] : [p];
    };
    const addMarker = (kind: Marker['kind'], pos: THREE.Vector3, r: number, ref: number) => {
      const mesh = new THREE.Mesh(
        this.sphere,
        new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, depthTest: false, depthWrite: false }),
      );
      mesh.position.copy(pos);
      mesh.scale.setScalar(r);
      mesh.renderOrder = 7;
      mesh.raycast = () => {};
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTexture(), color, ...ADDITIVE, depthTest: false, depthWrite: false, transparent: true,
      }));
      halo.position.copy(pos);
      halo.renderOrder = 8;
      halo.raycast = () => {};
      group.add(mesh, halo);
      sys.markers.push({ kind, pos, r, mesh, halo, ref, phase: sys.markers.length * 1.7 });
    };
    const addTag = (pos: THREE.Vector3, html: string, step: number, dx = 0, dy = 0) => {
      const wrap = document.createElement('div');
      wrap.className = 'sys-tag';
      wrap.style.setProperty('--sys', info.color);
      const len = Math.hypot(dx, dy);
      if (len > 18) {
        const lead = document.createElement('span');
        lead.className = 'sys-lead';
        lead.style.width = `${len}px`;
        lead.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
        wrap.appendChild(lead);
      }
      const el = document.createElement('div');
      el.className = 'tag';
      el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy - (len > 18 ? 0 : 16)}px))`;
      el.innerHTML = html;
      wrap.appendChild(el);
      const obj = new CSS2DObject(wrap);
      obj.position.copy(pos);
      obj.visible = false;
      group.add(obj);
      sys.tags.push({ obj, el, step });
    };

    anat.nuclei.forEach((n) => {
      const ref = info.nuclei?.findIndex((x) => x.id === n.id) ?? -1;
      sides(n.at, n.mirror).forEach((p) => addMarker('nucleus', p, n.r, ref));
    });
    anat.stations.forEach((st) => {
      const step = info.steps?.[st.n - 1];
      const pts = sides(st.at, st.mirror);
      pts.forEach((p) => addMarker('station', p, 0.17, st.n));
      if (step) addTag(pts[0], `<b class="sys-num">${st.n}</b>${step.label}`, st.n, st.dx, st.dy);
    });
    anat.tags.forEach((t) => {
      const nucleus = info.nuclei?.find((n) => n.id === t.ref);
      const route = info.routes?.find((r) => r.id === t.ref);
      const role = route?.role.includes(':') ? route.role.split(':')[0].toLowerCase() : '';
      const text = nucleus ? nucleus.name.replace(/ \(pars compacta\)/, '') : route ? route.name : t.ref;
      const html = `<i style="background:${info.color}"></i>${text}${role ? `<em> · ${role}</em>` : ''}`;
      addTag(toScene(t.at), html, 0, t.dx, t.dy);
    });
    // rim-lit shells of the deep structures this system starts in or lands on
    const stems = new Set(info.lit.flatMap((id) => structureById.get(id)?.meshes ?? []));
    if (stems.size || anat.orbs) sys.orbMat = orbMaterial(color);
    for (const o of this.brain.group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !stems.has(m.name.replace(/-(lh|rh)-/, '-'))) continue;
      const shell = new THREE.Mesh(m.geometry, sys.orbMat!);
      shell.renderOrder = 5;
      shell.raycast = () => {};
      group.add(shell);
    }
    if (anat.orbs) {
      for (const o of anat.orbs) {
        for (const p of sides(o.at, o.mirror)) {
          const m = new THREE.Mesh(this.sphere, sys.orbMat!);
          m.position.copy(p);
          m.scale.setScalar(o.r);
          m.renderOrder = 5;
          m.raycast = () => {};
          group.add(m);
        }
      }
    }
    return sys;
  }

  // ------------------------------------------------------------------ lifecycle
  enter() {
    this.root.add(this.brain.group);
    const [hp, ht] = this.frame(HOME_POS.clone(), HOME_TARGET.clone());
    this.home.position.copy(hp);
    this.home.target.copy(ht);
    const sel = this.selected();
    if (sel && sel.info.kind !== useSystems.getState().mode) useSystems.getState().set({ mode: sel.info.kind });
    this.brain.resetView({ glass: true, lit: [] });
    this.apply();
    // start from a clean stage rather than fading old state
    for (const s of this.systems) s.opacity = 0;
    this.unsub.push(
      onTheme((light) => this.setTheme(light)),
      useSystems.subscribe((s, p) => {
        if (s.mode !== p.mode) {
          const cur = this.selected();
          if (cur && cur.info.kind !== s.mode) {
            useCore.getState().select('systems', null);
            return;
          }
        }
        if (s.step !== p.step) this.stepTimer = 0;
        this.apply();
      }),
      useCore.subscribe((s, p) => {
        if (s.selection.systems !== p.selection.systems) this.onSelection();
      }),
    );
  }

  exit() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    this.hovered = null;
    if (this.glass) {
      // hand the shared outline back as BrainModel wants it for the theme showing now
      this.glass.uniforms.uStrength.value = 1;
      (this.glass.uniforms.uColor.value as THREE.Color).set(this.light ? this.brain.glassLight : this.brain.glassDark);
    }
    this.glass = null;
    useSystems.getState().set({ playing: false });
    // CSS2D tags stay in the DOM once our root leaves the scene: hide them by hand
    for (const s of this.systems) for (const t of s.tags) t.obj.element.style.display = 'none';
  }

  arrived() {
    // arriving with a system already chosen (search, tour): fly to its view
    if (this.selected()) this.onSelection();
  }

  /** glow on the dark stage, ink on the light one */
  private setTheme(light: boolean) {
    this.light = light;
    for (const s of this.systems) {
      const c = light ? s.inkColor : s.color;
      if (s.mat) {
        setGlowBlend(s.mat, light, ADDITIVE);
        s.mat.uniforms.uLight.value = light ? 1 : 0;
      }
      if (s.orbMat) {
        setGlowBlend(s.orbMat, light, ADDITIVE);
        s.orbMat.uniforms.uLight.value = light ? 1 : 0;
        (s.orbMat.uniforms.uColor.value as THREE.Color).copy(c);
      }
      for (const m of s.markers) {
        const dot = (m.mesh.material as THREE.MeshBasicMaterial).color;
        // the tract shader writes its colour without output encoding, so on the light stage give the
        // dots and discs the same raw values or they come out paler and yellower than their fibres
        if (light) dot.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
        else dot.copy(c).lerp(WHITE, 0.35);
        setGlowBlend(m.halo.material, light, ADDITIVE);
        if (light) m.halo.material.color.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
        else m.halo.material.color.copy(c);
      }
    }
    this.applyGlass();
    this.apply();
    // no cross-fade between the two palettes
    for (const s of this.systems) if (s.mat) (s.mat.uniforms.uColor.value as THREE.Color).copy(s.tint);
  }

  /** the tracts are the subject here: let the cortex outline recede behind them */
  private applyGlass() {
    if (!this.glass) return;
    this.glass.uniforms.uStrength.value = this.light ? GLASS_STRENGTH_LIGHT : GLASS_STRENGTH;
    (this.glass.uniforms.uColor.value as THREE.Color).set(this.light ? GLASS_COLOR_LIGHT : GLASS_COLOR);
  }

  private selected(): Sys | null {
    const id = useCore.getState().selection.systems;
    return (id && this.byId.get(id)) || null;
  }

  private onSelection() {
    const sel = this.selected();
    const st = useSystems.getState();
    const patch: Partial<ReturnType<typeof useSystems.getState>> = {};
    if (st.step !== 0) patch.step = 0;
    if (st.playing) patch.playing = false;
    if (sel && sel.info.kind !== st.mode) patch.mode = sel.info.kind;
    if (Object.keys(patch).length) st.set(patch);
    this.stepTimer = 0;
    this.apply();
    if (sel) {
      const v = sel.anat.view;
      const [pos, target] = this.frame(new THREE.Vector3(...v.position), new THREE.Vector3(...v.target));
      void this.ctx.flyTo(pos, target, 1.1);
    } else {
      void this.ctx.flyTo(this.home.position.clone(), this.home.target.clone(), 1.0);
    }
  }

  /**
   * On tall (phone) screens the info panel covers the lower half of the stage:
   * step back a little and aim below the brain so it sits in the free area above the dock.
   */
  private frame(position: THREE.Vector3, target: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    // the scene manager now centres the subject in the free area on every screen size
    if (this.ctx.camera.aspect >= 0 || true) return [position, target];
    const off = position.clone().sub(target).multiplyScalar(1.38);
    const drop = new THREE.Vector3(0, -0.19 * off.length(), 0);
    const t = target.clone().add(drop);
    return [t.clone().add(off), t];
  }

  /** derive what every system should look like from the two stores */
  private apply() {
    const st = useSystems.getState();
    const sel = this.selected();
    const hov = this.hovered?.sys ?? null;
    const fast = sel?.info.id === 'fast';
    for (const s of this.systems) {
      let target = 0;
      s.tint.copy(this.light ? s.inkColor : s.color);
      if (fast) {
        // glutamate & GABA: every point-to-point pathway, in one colour
        if (s.info.kind === 'pathways') { target = 0.75; s.tint.copy(this.light ? sel!.inkColor : sel!.color); }
      } else if (sel) {
        if (s === sel) target = 1;
        else if (st.showAll && s.info.kind === sel.info.kind && s.info.id !== 'fast') target = s === hov ? 0.4 : 0.16;
      } else if (s.info.kind === st.mode && s.info.id !== 'fast') {
        target = hov ? (s === hov ? 0.95 : 0.22) : 0.5;
      }
      s.target = target;
      const stepOn = s === sel && s.info.kind === 'pathways' ? st.step : 0;
      if (s.mat) s.mat.uniforms.uStep.value = stepOn;
      for (const t of s.tags) {
        t.obj.visible = s === sel && st.labels;
        t.el.classList.toggle('on', stepOn > 0 && t.step === stepOn);
        t.el.classList.toggle('dim', stepOn > 0 && t.step !== stepOn);
      }
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    this.brain.update(dt);
    if (!this.glass) {
      for (const o of this.brain.group.children) {
        const mat = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (mat?.uniforms?.uStrength) {
          this.glass = mat;
          break;
        }
      }
    }
    // every frame: BrainModel re-colours this shared material itself when the theme flips
    this.applyGlass();
    const st = useSystems.getState();
    const sel = this.selected();
    this.flow += dt * st.speed * 5.5;
    this.clock += dt;

    // walk a pathway station by station
    if (st.playing) {
      const n = sel?.info.steps?.length ?? 0;
      if (!n) st.set({ playing: false });
      else {
        this.stepTimer += dt * Math.max(st.speed, 0.25);
        if (this.stepTimer > STEP_SECONDS) {
          this.stepTimer = 0;
          if (st.step >= n) st.set({ step: 0, playing: false });
          else st.set({ step: st.step + 1 });
        }
      }
    }

    const k = 1 - Math.exp(-dt * 6);
    const step = sel && sel.info.kind === 'pathways' ? st.step : 0;
    for (const s of this.systems) {
      s.opacity += (s.target - s.opacity) * k;
      if (Math.abs(s.target - s.opacity) < 0.003) s.opacity = s.target;
      const on = s.opacity > 0.004;
      if (s.group.visible !== on) s.group.visible = on;
      if (!on) continue;
      if (s.mat) {
        s.mat.uniforms.uOpacity.value = s.opacity;
        s.mat.uniforms.uFlow.value = this.flow;
        (s.mat.uniforms.uColor.value as THREE.Color).lerp(s.tint, k);
      }
      const active = s === sel ? step : 0;
      s.focus += ((s === sel ? 1 : 0) - s.focus) * k;
      // shells of deep structures only light up for the selected system
      if (s.orbMat) s.orbMat.uniforms.uOpacity.value = s.opacity * (s.anat.orbs ? 0.35 + 0.65 * s.focus : s.focus);
      for (const m of s.markers) {
        const beat = 0.5 + 0.5 * Math.sin(this.clock * 2.4 + m.phase);
        let gain = 1;
        let size = 1;
        if (m.kind === 'station' && active > 0) {
          if (m.ref === active) { gain = 1.5; size = 1.5; }
          else if (m.ref < active) gain = 0.6;
          else { gain = 0.22; size = 0.8; }
        }
        if (m.kind === 'station') gain *= s.focus;
        const hover = this.hovered?.marker === m ? 1.25 : 1;
        m.mesh.scale.setScalar(m.r * size * hover * (1 + 0.08 * beat));
        (m.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.opacity * gain);
        const hs = m.r * (m.kind === 'nucleus' ? 7 : 5.5) * size * (1 + 0.22 * beat);
        m.halo.scale.set(hs, hs, 1);
        // light stage: the glow becomes a faint tinted disc under the dot
        m.halo.material.opacity = Math.min(1, s.opacity * gain * (0.5 + 0.3 * beat)) * (this.light ? 0.3 : 1);
      }
    }
  }

  // ------------------------------------------------------------------ picking
  private pick(ray: THREE.Raycaster): Hit | null {
    const r = ray.ray;
    const sel = this.selected();
    const live = this.systems.filter((s) => s.target > 0.05 && s.info.id !== 'fast');
    if (sel?.info.id === 'fast') return null;
    // markers first: nearest to the camera wins
    let best: Hit | null = null;
    let bestT = Infinity;
    const v = new THREE.Vector3();
    for (const s of live) {
      for (const m of s.markers) {
        if (m.kind === 'station' && s !== sel) continue;
        const rad = Math.max(m.r * 1.7, 0.32);
        if (r.distanceSqToPoint(m.pos) > rad * rad) continue;
        const t = v.copy(m.pos).sub(r.origin).dot(r.direction);
        if (t > 0 && t < bestT) { bestT = t; best = { sys: s, marker: m }; }
      }
    }
    if (best) return best;
    // then fibres: closest to the pointer wins, the selected system first
    let bestD = Infinity;
    for (const s of live) {
      const thr = s.info.kind === 'pathways' ? 0.3 : 0.2;
      const bias = s === sel ? 0.5 : 1;
      for (let i = 0; i < s.pick.length; i++) {
        const d = r.distanceSqToPoint(s.pick[i]);
        if (d < thr * thr && d * bias < bestD) { bestD = d * bias; best = { sys: s, step: s.pickStep[i] }; }
      }
    }
    return best;
  }

  onHover(ray: THREE.Raycaster | null) {
    const hit = ray ? this.pick(ray) : null;
    const prev = this.hovered;
    const same = hit?.sys === prev?.sys && hit?.marker === prev?.marker && hit?.step === prev?.step;
    if (!same) {
      this.hovered = hit;
      let hover: { text: string; sub?: string } | null = null;
      if (hit) {
        const info = hit.sys.info;
        const isSel = this.selected() === hit.sys;
        const m = hit.marker;
        const stepNo = m?.kind === 'station' ? m.ref : hit.step;
        const step = isSel && stepNo ? info.steps?.[stepNo - 1] : undefined;
        const nucleus = m?.kind === 'nucleus' ? info.nuclei?.[m.ref] : undefined;
        if (nucleus) hover = { text: nucleus.name, sub: `${info.name}: ${nucleus.tagline}` };
        else if (step) hover = { text: `${stepNo}. ${step.title}`, sub: step.explain };
        else hover = { text: info.name, sub: info.tagline };
      }
      useCore.getState().set({ hover });
      if (hit?.sys !== prev?.sys) this.apply();
    }
    return !!hit;
  }

  onClick(ray: THREE.Raycaster) {
    const hit = this.pick(ray);
    const core = useCore.getState();
    const sel = this.selected();
    if (!hit) {
      if (sel) core.select('systems', null);
      return;
    }
    if (hit.sys !== sel) {
      core.select('systems', hit.sys.info.id);
      return;
    }
    // inside the selected pathway, clicking a station or segment jumps to that step
    const stepNo = hit.marker?.kind === 'station' ? hit.marker.ref : hit.step;
    if (stepNo && sel.info.steps) useSystems.getState().set({ step: stepNo, playing: false });
  }

  diveTarget() {
    return this.brain.centroidOf('precentral', 'lh');
  }
}
