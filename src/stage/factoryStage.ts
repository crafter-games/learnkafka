import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SimEvent, SimRecord } from "@/sim/events";
import type { Topic } from "@/sim/topic";
import { keyColor } from "./keyColors";
import { COLORS } from "./theme";
import { Tweens, easeInOutCubic, easeOutBack, easeOutCubic, wait } from "./tweens";

// World layout in model units (1 conveyor tile = 1). Tune here.
const MODELS = "/assets/models/factory-kit/";
const LANE_GAP = 1.55;
const SLOTS = 9; // visible conveyor tiles per partition
const PRODUCER = new THREE.Vector3(-4.6, 0, 0);
const SCANNER_X = -2.2;
const FEED_MS = 420;
const FLIGHT_MS = 560;
const ARC = 1.3;
const FLOOR_X = { min: -6, max: SLOTS + 2 };
const CAMERA_DIR = new THREE.Vector3(0.32, 1.05, 1).normalize();

export type StageLabels = {
  producer: string;
  partitioner: string;
  topic: (name: string) => string;
  partition: (n: number) => string;
  next: (n: number) => string;
};

type Lane = {
  z: number;
  material: THREE.MeshStandardMaterial;
  boxes: Map<number, THREE.Object3D>;
  viewStart: number;
  next: THREE.Object3D;
  nextLabel: HTMLElement;
  title: HTMLElement;
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();
function model(name: string): Promise<THREE.Object3D> {
  if (!cache.has(name)) {
    cache.set(
      name,
      loader.loadAsync(`${MODELS}${name}.glb`).then((g) => {
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        return g.scene;
      }),
    );
  }
  return cache.get(name)!.then((s) => s.clone(true));
}

/** CSS2D label: the renderer positions the outer element via transform, so styles and
 *  animations live on the inner element (a CSS animation on `transform` would override it). */
function label(className: string, text = "") {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  inner.className = className;
  inner.textContent = text;
  outer.appendChild(inner);
  return { outer, inner };
}
const css2d = (l: { outer: HTMLElement }) => new CSS2DObject(l.outer);

/** Live isometric diorama of a topic: producer → partitioner → one conveyor per partition. */
export class FactoryStage {
  private renderer: THREE.WebGLRenderer;
  private labels2d: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private tweens = new Tweens();
  private lanes: Lane[] = [];
  private producer = new THREE.Group();
  private scanner = new THREE.Group();
  private hashLabel!: HTMLElement;
  private hashObj!: CSS2DObject;
  private frame = 0;
  private last = performance.now();
  private resizeObs: ResizeObserver;
  private disposed = false;
  readonly ready: Promise<void>;

  constructor(
    private host: HTMLElement,
    private topic: Topic,
    private text: StageLabels,
    private onLanded: (record: SimRecord) => void = () => {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.style.display = "block";
    host.appendChild(this.renderer.domElement);

    this.labels2d = new CSS2DRenderer();
    Object.assign(this.labels2d.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    host.appendChild(this.labels2d.domElement);

    this.lights();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.ready = this.build().then(() => {
      this.resize();
      this.loop();
    });
  }

  private lights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9d97c7, 1.9));
    const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
    sun.position.set(-4, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0008;
    Object.assign(sun.shadow.camera, { left: -12, right: 14, top: 9, bottom: -9, near: 1, far: 40 });
    this.scene.add(sun);
  }

  private laneZ(p: number) {
    return (p - (this.topic.numPartitions - 1) / 2) * LANE_GAP;
  }

  private slotX(lane: Lane, offset: number) {
    return 0.5 + (offset - lane.viewStart);
  }

  private async build() {
    const n = this.topic.numPartitions;
    const depth = (n - 1) * LANE_GAP + 3.4;

    // Floor: a diorama platform of checkerboard tiles; outside it only shadows show (page colour)
    const half = Math.ceil(depth / 2);
    const { min: minX, max: maxX } = FLOOR_X;
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = -0.3;
    shadowCatcher.receiveShadow = true;
    this.scene.add(shadowCatcher);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX + 0.3, 0.3, half * 2 + 0.3),
      new THREE.MeshStandardMaterial({ color: 0x8a84b8, roughness: 0.9 }),
    );
    slab.position.set((minX + maxX) / 2, -0.15, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.scene.add(slab);
    const tiles: Promise<void>[] = [];
    for (let x = minX; x < maxX; x += 2) {
      for (let z = -half; z < half; z += 2) {
        tiles.push(model("top-large-checkerboard").then((t) => void (t.position.set(x + 1, 0.002, z + 1), this.scene.add(t))));
      }
    }

    // Producer depot (machine) and the partitioner (scanner arch over a feeder belt)
    const machine = await model("machine-window");
    machine.rotation.y = Math.PI / 2;
    this.producer.add(machine);
    this.producer.position.copy(PRODUCER);
    this.scene.add(this.producer);
    const prodLabel = css2d(label("stage-tag stage-tag--producer", this.text.producer));
    prodLabel.position.set(0, 1.75, 0);
    this.producer.add(prodLabel);

    for (let x = PRODUCER.x + 0.9; x < SCANNER_X + 0.6; x += 1) {
      const belt = await model("conveyor-stripe-sides");
      belt.position.set(x + 0.5, 0, 0);
      this.scene.add(belt);
    }
    const scanner = await model("scanner-high");
    this.scanner.add(scanner);
    this.scanner.position.set(SCANNER_X, 0, 0);
    this.scene.add(this.scanner);
    const scanLabel = css2d(label("stage-tag stage-tag--partitioner", this.text.partitioner));
    scanLabel.position.set(0, 1.6, 0);
    this.scanner.add(scanLabel);
    const hash = label("stage-hash");
    this.hashLabel = hash.inner;
    this.hashObj = css2d(hash);
    this.hashObj.position.set(0, 0, 1.25);
    this.hashObj.visible = false;
    this.scanner.add(this.hashObj);

    // Partitions: one conveyor per partition
    const topicTag = css2d(label("stage-tag stage-tag--topic", this.text.topic(this.topic.name)));
    topicTag.position.set(SLOTS - 1.2, 0.2, this.laneZ(0) - 1.05);
    this.scene.add(topicTag);

    for (let p = 0; p < n; p++) {
      const z = this.laneZ(p);
      let material: THREE.MeshStandardMaterial | null = null;
      for (let i = 0; i < SLOTS; i++) {
        const belt = await model("conveyor-stripe-sides");
        belt.position.set(i + 0.5, 0, z);
        belt.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          material ??= (mesh.material as THREE.MeshStandardMaterial).clone();
          mesh.material = material;
        });
        this.scene.add(belt);
      }
      const end = await model("conveyor-stripe-part-end");
      end.position.set(SLOTS + 0.25, 0, z);
      this.scene.add(end);

      const titleLabel = label("stage-lane", `P${p}`);
      const title = titleLabel.inner;
      const titleObj = css2d(titleLabel);
      titleObj.position.set(-0.55, 0.3, z);
      this.scene.add(titleObj);

      // Log-end marker: where the next record will land
      const next = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.02, 0.56),
        new THREE.MeshBasicMaterial({ color: COLORS.partition, transparent: true, opacity: 0.28 }),
      );
      ring.position.y = 0.42;
      next.add(ring);
      const nextL = label("stage-next", this.text.next(0));
      const nextLabel = nextL.inner;
      const nextObj = css2d(nextL);
      nextObj.position.set(0, 0.45, 0);
      next.add(nextObj);
      next.position.set(0.5, 0, z);
      this.scene.add(next);

      this.lanes.push({ z, material: material!, boxes: new Map(), viewStart: 0, next, nextLabel, title });
    }
    await Promise.all(tiles);

    // A couple of robot arms at the far end hint at the consumers to come
    for (const p of [0, n - 1]) {
      const arm = await model("robot-arm-a");
      arm.position.set(SLOTS + 1.2, 0, this.laneZ(p) + (p === 0 ? -0.9 : 0.9));
      this.scene.add(arm);
    }
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels2d.setSize(w, h);
    this.fit(w / h);
  }

  /** Orthographic fit: project the content bounds onto the camera plane. */
  private fit(aspect: number) {
    const half = Math.ceil(((this.topic.numPartitions - 1) * LANE_GAP + 3.4) / 2);
    const bounds = new THREE.Box3(
      new THREE.Vector3(FLOOR_X.min - 0.2, -0.3, -half - 0.2),
      new THREE.Vector3(FLOOR_X.max + 0.2, 1.6, half + 0.2),
    );
    const center = bounds.getCenter(new THREE.Vector3());
    this.camera.position.copy(center).addScaledVector(CAMERA_DIR, 30);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(inv);
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    const pad = 1.03;
    let halfW = ((maxX - minX) / 2) * pad;
    let halfH = ((maxY - minY) / 2) * pad;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    Object.assign(this.camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH, near: 0.1, far: 80 });
    this.camera.updateProjectionMatrix();
    // Labels scale with the world so small screens don't drown in tags
    const pxPerUnit = this.host.clientHeight / (halfH * 2);
    this.host.style.setProperty("--stage-zoom", String(Math.min(1.15, Math.max(0.55, pxPerUnit / 62))));
  }

  private loop = () => {
    if (this.disposed) return;
    const now = performance.now();
    this.tweens.update(Math.min(64, now - this.last));
    this.last = now;
    this.renderer.render(this.scene, this.camera);
    this.labels2d.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.loop);
  };

  private async makeBox(record: SimRecord) {
    const box = new THREE.Group();
    const body = await model("box-small");
    box.add(body);
    const sticker = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.012, 0.3),
      new THREE.MeshStandardMaterial({ color: keyColor(record.key), roughness: 0.6 }),
    );
    sticker.position.set(0, 0.556, 0);
    box.add(sticker);
    const tag = css2d(label("stage-key", record.key ?? "∅"));
    tag.position.set(0, 0.75, 0);
    box.add(tag);
    return box;
  }

  private async showHash(record: SimRecord) {
    this.hashLabel.textContent =
      record.key === null ? `null → sticky → P${record.partition}` : `murmur2("${record.key}") % ${this.topic.numPartitions} = ${record.partition}`;
    this.hashObj.visible = true;
    this.hashLabel.classList.remove("is-on");
    void this.hashLabel.offsetWidth; // restart CSS animation
    this.hashLabel.classList.add("is-on");
    await wait(1500);
    this.hashObj.visible = false;
  }

  private puff(at: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), mat.clone());
      bit.position.copy(at);
      this.scene.add(bit);
      const to = { x: at.x + Math.cos(a) * 0.55, y: at.y + 0.15 + Math.random() * 0.2, z: at.z + Math.sin(a) * 0.4 };
      void this.tweens.to(bit.position, to, 380, easeOutCubic);
      void this.tweens.to(bit.material, { opacity: 0 }, 380).then(() => {
        this.scene.remove(bit);
        bit.geometry.dispose();
        (bit.material as THREE.Material).dispose();
      });
    }
  }

  private pulseLane(lane: Lane) {
    lane.material.emissive.setHex(COLORS.partition);
    lane.material.emissiveIntensity = 0.55;
    void this.tweens.to(lane.material, { emissiveIntensity: 0 }, 650);
    lane.title.classList.remove("is-hit");
    void lane.title.offsetWidth;
    lane.title.classList.add("is-hit");
  }

  async handle(event: SimEvent) {
    if (event.type !== "appended" || event.topic !== this.topic.name || this.disposed) return;
    await this.ready;
    const record = event.record;
    const lane = this.lanes[record.partition];

    // Scroll the conveyor window when the log outgrows the visible tiles (keep one for "next")
    if (record.offset - lane.viewStart >= SLOTS - 1) {
      lane.viewStart = record.offset - SLOTS + 2;
      for (const [off, b] of lane.boxes) {
        if (off < lane.viewStart) {
          lane.boxes.delete(off);
          void this.tweens.to(b.scale, { x: 0.01, y: 0.01, z: 0.01 }, 260).then(() => this.scene.remove(b));
        } else {
          void this.tweens.to(b.position, { x: this.slotX(lane, off) }, 320, easeInOutCubic);
        }
      }
    }
    const leo = this.topic.partitions[record.partition].length;
    lane.nextLabel.textContent = this.text.next(leo);
    void this.tweens.to(lane.next.position, { x: this.slotX(lane, leo) }, 300, easeOutBack);

    // Producer squash
    this.producer.scale.set(1.08, 0.9, 1.08);
    void this.tweens.to(this.producer.scale, { x: 1, y: 1, z: 1 }, 260, easeOutBack);

    // Out of the depot, along the feeder, through the partitioner…
    const box = await this.makeBox(record);
    box.position.set(PRODUCER.x + 0.6, 0.4, 0);
    box.scale.setScalar(0.4);
    this.scene.add(box);
    void this.tweens.to(box.scale, { x: 1, y: 1, z: 1 }, 220, easeOutBack);
    await this.tweens.to(box.position, { x: SCANNER_X }, FEED_MS, easeInOutCubic);
    this.scanner.scale.set(1.1, 0.92, 1.1);
    void this.tweens.to(this.scanner.scale, { x: 1, y: 1, z: 1 }, 240, easeOutBack);
    void this.showHash(record);

    // …then an arc onto its partition's conveyor
    const start = box.position.clone();
    const end = new THREE.Vector3(this.slotX(lane, record.offset), 0.4, lane.z);
    const spin = (Math.random() - 0.5) * 1.2;
    await this.tweens.progress(FLIGHT_MS, (t) => {
      box.position.lerpVectors(start, end, t);
      box.position.y += Math.sin(Math.PI * t) * ARC;
      box.rotation.y = spin * Math.sin(Math.PI * t);
    });
    box.position.x = this.slotX(lane, record.offset);
    box.rotation.y = 0;
    lane.boxes.set(record.offset, box);

    // Impact: squash & stretch, offset stamp, dust, lane pulse
    box.scale.set(1.18, 0.8, 1.18);
    void this.tweens.to(box.scale, { x: 1, y: 1, z: 1 }, 240, easeOutBack);
    const stamp = css2d(label("stage-offset", String(record.offset)));
    stamp.position.set(0, -0.05, 0.42);
    box.add(stamp);
    this.puff(new THREE.Vector3(box.position.x, 0.45, lane.z));
    this.pulseLane(lane);
    this.onLanded(record);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.renderer.domElement.remove();
    this.labels2d.domElement.remove();
  }
}
