import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { model } from "./models";
import { Tweens, easeInOutCubic, easeOutBack } from "./tweens";

// The world select screen: one tiny isometric island per world, joined by a dotted route.
// The camera glides between islands like a level-select map.

export type IslandSpec = {
  id: number;
  title: string;
  locked: boolean;
  /** 0–1 completion, drawn as a ring of flags on the island. */
  progress: number;
};

const LOCK_SVG = '<svg aria-hidden="true" viewBox="0 0 256 256" width="14" height="14"><path fill="currentColor" d="M208 80h-32V56a48 48 0 0 0-96 0v24H48a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V96a16 16 0 0 0-16-16ZM96 56a32 32 0 0 1 64 0v24H96Z"/></svg>';
const SPACING = 8.5;
const RADIUS = 3.3;
const CAMERA_DIR = new THREE.Vector3(0.6, 1.25, 1).normalize();
const VIEW_HEIGHT = 15; // world units visible vertically (tune)

/** Island position along a gentle zig-zag route. */
const islandPos = (i: number) => new THREE.Vector3(i * SPACING, 0, i % 2 ? -2.6 : 2.6);

type Island = { group: THREE.Group; top: THREE.Mesh; tag: HTMLElement; spec: IslandSpec; movers: THREE.Object3D[] };

export class WorldMapStage {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private tweens = new Tweens();
  private islands: Island[] = [];
  private focus = new THREE.Vector3();
  private selected = 0;
  private frame = 0;
  private last = performance.now();
  private t = 0;
  private disposed = false;
  private resizeObs: ResizeObserver;
  private insets = { top: 0, bottom: 0 };
  private raycaster = new THREE.Raycaster();
  readonly ready: Promise<void>;

  constructor(
    private host: HTMLElement,
    private specs: IslandSpec[],
    private onPick: (index: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "pan-y";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    host.appendChild(this.labels.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9d97c7, 1.9));
    const sun = new THREE.DirectionalLight(0xfff1de, 2.3);
    sun.position.set(-6, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.renderer.domElement.addEventListener("pointerdown", this.onPointer);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.ready = this.build().then(() => {
      this.focus.copy(islandPos(this.selected));
      this.resize();
      this.loop();
    });
  }

  private sun: THREE.DirectionalLight;

  private async build() {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), new THREE.ShadowMaterial({ opacity: 0.14 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(this.specs.length * SPACING * 0.5, -0.9, 0);
    shadow.receiveShadow = true;
    this.scene.add(shadow);

    // Dotted route between islands
    const pts = this.specs.map((_, i) => islandPos(i).setY(-0.35));
    if (pts.length > 1) {
      const curve = new THREE.CatmullRomCurve3(pts);
      const dots = Math.round(curve.getLength() / 0.7);
      const dotGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12);
      for (let i = 0; i <= dots; i++) {
        const p = curve.getPoint(i / dots);
        if (pts.some((c) => c.distanceTo(p) < RADIUS + 0.2)) continue;
        const locked = this.specs[Math.min(this.specs.length - 1, Math.round((i / dots) * (pts.length - 1) + 0.5))]?.locked;
        const dot = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ color: locked ? 0xb3aed0 : 0xf08a24 }));
        dot.position.copy(p);
        dot.receiveShadow = true;
        this.scene.add(dot);
      }
    }

    for (const [i, spec] of this.specs.entries()) this.islands.push(await this.buildIsland(i, spec));
  }

  private async buildIsland(i: number, spec: IslandSpec): Promise<Island> {
    const group = new THREE.Group();
    group.position.copy(islandPos(i));
    group.userData.island = i;

    const dim = spec.locked;
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS, RADIUS * 0.82, 0.9, 6),
      new THREE.MeshStandardMaterial({ color: dim ? 0x9a95b8 : 0x7d77b0, roughness: 0.9, flatShading: true }),
    );
    rock.position.y = -0.45;
    rock.castShadow = true;
    rock.receiveShadow = true;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS - 0.08, RADIUS - 0.08, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: dim ? 0xd2cee4 : 0xc9c3e6, roughness: 1 }),
    );
    top.position.y = 0.02;
    top.receiveShadow = true;
    group.add(rock, top);

    const movers: THREE.Object3D[] = [];
    const place = async (name: string, x: number, z: number, ry = 0, s = 1) => {
      const m = await model(name);
      m.position.set(x, 0.08, z);
      m.rotation.y = ry;
      m.scale.setScalar(s);
      group.add(m);
      return m;
    };

    // Each world's island shows what it's about
    if (spec.id === 1) {
      await place("machine-window", -1.7, 0, Math.PI / 2, 0.9);
      for (let x = -0.9; x <= 1.2; x += 1) await place("conveyor-stripe-sides", x, 0);
      for (const x of [-0.5, 0.6]) movers.push(await place("box-small", x, 0, 0, 0.9));
      movers.forEach((b) => (b.position.y = 0.45));
    } else if (spec.id === 2) {
      await place("scanner-high", -1.5, 0, 0, 0.9);
      for (const z of [-1.1, 0, 1.1]) for (let x = -0.5; x <= 1.6; x += 1) await place("conveyor-stripe-sides", x, z, 0, 0.9);
      for (const [x, z] of [[0, -1.1], [1, 0], [0.4, 1.1]] as const) {
        const b = await place("box-small", x, z, 0, 0.8);
        b.position.y = 0.42;
        movers.push(b);
      }
    } else if (spec.id === 3) {
      await place("machine-window", -1.2, -0.4, Math.PI / 2, 0.95);
      await place("hopper-high-square", 1.2, -0.8, 0, 0.8);
      for (const [x, z] of [[0.3, 1], [0.9, 1.3], [0.6, 0.6], [-0.4, 1.4]] as const) await place("box-small", x, z, Math.random(), 0.85);
      await place("warning-orange", 1.6, 1.1, 0, 0.9);
    } else if (spec.id === 4) {
      for (let x = -1.6; x <= 0.5; x += 1) await place("conveyor-stripe-sides", x, 0.6, 0, 0.9);
      for (const [x, z] of [[1.3, -0.8], [1.5, 0.9], [-0.4, -1.4]] as const) movers.push(await place("robot-arm-a", x, z, 0, 0.85));
      const b = await place("box-small", -0.6, 0.6, 0, 0.8);
      b.position.y = 0.42;
    } else if (spec.id === 5) {
      for (const [x, z] of [[-1.5, -0.6], [0, -1.1], [1.5, -0.6]] as const) await place("machine-window", x, z, 0, 0.75);
      await place("screen-wide", 0, 1.2, 0, 0.8);
      for (const x of [-1.2, 0, 1.2]) {
        const b = await place("box-small", x, 0.25, 0, 0.7);
        movers.push(b);
      }
    } else if (spec.id === 6) {
      for (const z of [-0.7, 0.7]) for (let x = -1.5; x <= 1.5; x += 1) await place("conveyor-stripe-sides", x, z, 0, 0.85);
      for (const [x, z, color] of [[-0.5, -0.7, 0x3f9f62], [1, 0.7, 0x3f9f62], [0.4, -0.7, 0xe5484d]] as const) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.45), new THREE.MeshStandardMaterial({ color }));
        plate.position.set(x, 0.42, z);
        plate.castShadow = true;
        group.add(plate);
      }
      for (const [x, z] of [[-1.2, -0.7], [0, 0.7]] as const) {
        const b = await place("box-small", x, z, 0, 0.75);
        b.position.y = 0.4;
      }
      movers.push(await place("robot-arm-a", 2.2, 0, 0, 0.75));
    } else if (spec.id === 7) {
      await place("hopper-high-square", -1.4, -0.5, 0, 0.8);
      for (let x = -0.6; x <= 1.5; x += 1) await place("conveyor-stripe-sides", x, 0.6, 0, 0.85);
      for (const [x, z] of [[0.8, -1], [1.3, -0.7], [1.05, -1.3]] as const) {
        const b = await place("box-small", x, z, 0, 0.7);
        b.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.color.lerp(new THREE.Color(0x7fb2ff), 0.55);
            mesh.material = mat;
          }
        });
      }
      for (const x of [-0.3, 0.7]) movers.push(await place("box-small", x, 0.6, 0, 0.75));
      movers.forEach((m) => (m.position.y = 0.42));
    } else if (spec.id === 8) {
      // Connect pipes data in from a "database" hopper; Streams crunches it at a screen
      await place("hopper-high-square", -1.6, -0.6, 0, 0.75);
      for (let x = -0.7; x <= 1.4; x += 1) await place("conveyor-stripe-sides", x, -0.6, 0, 0.85);
      await place("screen-wide", 0.4, 1.1, 0, 0.8);
      movers.push(await place("robot-arm-a", 1.6, 0.7, 0, 0.75));
      for (const x of [-0.4, 0.7]) {
        const b = await place("box-small", x, -0.6, 0, 0.75);
        b.position.y = 0.42;
        movers.push(b);
      }
    } else {
      // Upcoming worlds: under construction
      await place("warning-orange", -0.8, 0.6, 0, 0.9);
      await place("warning-orange", 0.9, -0.4, 0, 0.9);
      await place("structure-yellow-medium", 0, 1.2, Math.PI / 2, 0.8);
      await place("screen-wide", 0.2, -1.2, 0.3, 0.8);
    }

    if (dim) group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh !== rock && mesh !== top) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.lerp(new THREE.Color(0xc9c6da), 0.55);
        mesh.material = mat;
      }
    });

    const outer = document.createElement("div");
    const tag = document.createElement("div");
    tag.className = "island-tag";
    outer.appendChild(tag);
    const tagObj = new CSS2DObject(outer);
    tagObj.position.set(0, -1.2, RADIUS + 0.3);
    group.add(tagObj);
    tag.innerHTML = `<b>${spec.id}</b><span>${spec.title}</span>${spec.locked ? LOCK_SVG : ""}`;
    tag.classList.toggle("is-locked", spec.locked);

    // Completion flags around the rim
    const flags = Math.round(spec.progress * 6);
    for (let k = 0; k < flags; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7), new THREE.MeshStandardMaterial({ color: 0x2b2840 }));
      pole.position.set(Math.cos(a) * (RADIUS - 0.35), 0.4, Math.sin(a) * (RADIUS - 0.35));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: 0xf08a24 }));
      flag.position.set(pole.position.x + 0.16, 0.65, pole.position.z);
      group.add(pole, flag);
    }

    this.scene.add(group);
    return { group, top, tag, spec, movers };
  }

  /** Focus an island: the camera glides there and the island lifts. */
  select(index: number) {
    this.selected = Math.max(0, Math.min(this.islands.length - 1, index));
    for (const [i, isl] of this.islands.entries()) isl.tag.classList.toggle("is-selected", i === this.selected);
    const target = islandPos(this.selected);
    void this.tweens.to(this.focus, { x: target.x, y: 0, z: target.z }, 650, easeInOutCubic);
    const g = this.islands[this.selected]?.group;
    if (g) {
      g.scale.setScalar(0.92);
      void this.tweens.to(g.scale, { x: 1, y: 1, z: 1 }, 420, easeOutBack);
    }
  }

  setInsets(insets: { top: number; bottom: number }) {
    this.insets = insets;
    this.resize();
  }

  private onPointer = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.islands.map((i) => i.group), true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && o.userData.island === undefined) o = o.parent;
    if (o) this.onPick(o.userData.island as number);
  };

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  /** Ortho camera centred on the focus point, placed in the middle of the free (non-UI) area. */
  private place() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    const narrow = w < 700;
    const s = (narrow ? VIEW_HEIGHT * 0.75 : VIEW_HEIGHT) / Math.max(200, h - this.insets.top - this.insets.bottom);
    const viewW = w * s;
    const viewH = h * s;
    this.camera.position.copy(this.focus).addScaledVector(CAMERA_DIR, 40);
    this.camera.lookAt(this.focus);
    // Shift so the focus sits in the middle of the free area
    const freeMid = this.insets.top + (h - this.insets.top - this.insets.bottom) / 2;
    const dy = (freeMid - h / 2) * s;
    Object.assign(this.camera, { left: -viewW / 2, right: viewW / 2, top: viewH / 2 + dy, bottom: -viewH / 2 + dy });
    this.camera.updateProjectionMatrix();
    this.sun.position.copy(this.focus).add(new THREE.Vector3(-6, 14, 9));
    this.sun.target.position.copy(this.focus);
    this.host.style.setProperty("--stage-zoom", String(Math.min(1.2, Math.max(0.75, 1 / s / 40))));
  }

  private loop = () => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(64, now - this.last);
    this.last = now;
    this.t += dt / 1000;
    this.tweens.update(dt);
    // Idle life: the selected island bobs, boxes ride the conveyors, robots sway
    for (const [i, isl] of this.islands.entries()) {
      const target = i === this.selected ? 0.25 + Math.sin(this.t * 2) * 0.08 : 0;
      isl.group.position.y += (target - isl.group.position.y) * 0.1;
      if (isl.spec.locked) continue;
      for (const [k, m] of isl.movers.entries()) {
        if (isl.spec.id === 4 || isl.spec.id === 6) m.rotation.y = Math.sin(this.t * 1.5 + k) * 0.6;
        else if (isl.spec.id === 5) m.position.y = 0.08 + Math.abs(Math.sin(this.t * 2 + k)) * 0.35;
        else {
          m.position.x += dt * 0.0006;
          if (m.position.x > 1.6) m.position.x = -0.9;
        }
      }
    }
    this.place();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.loop);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointer);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
