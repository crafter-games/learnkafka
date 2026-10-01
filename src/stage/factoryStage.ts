import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { Cluster } from "@/sim/cluster";
import type { SimEvent, SimRecord } from "@/sim/events";
import { CODECS, type Codec } from "@/sim/producer";
import { keyColor } from "./keyColors";
import { COLORS } from "./theme";
import { Tweens, easeInOutCubic, easeOutBack, easeOutCubic, wait } from "./tweens";

// World layout in model units (1 conveyor tile = 1). Tune here.
const MODELS = "/assets/models/factory-kit/";
const LANE_GAP = 1.55;
const TOPIC_GAP = 0.9; // extra space between topics
const PRODUCER_X = -4.6;
const SCANNER_X = -2.2;
const FEED_MS = 420;
const FLIGHT_MS = 560;
const ARC = 1.3;
const CAMERA_DIR = new THREE.Vector3(0.32, 1.05, 1).normalize();

export type StageLabels = {
  producer: string;
  partitioner: string;
  topic: (name: string) => string;
  partition: (n: number) => string;
  next: (n: number) => string;
  batch?: (partition: number, count: number, size: number) => string;
  ackLost?: string;
  dupDropped?: (seq: number) => string;
  replica?: (name: string, role: "leader" | "follower" | "down") => string;
};

export type ConsumerSpec = { group: string; label: string; color: string };

export type StageOptions = {
  /** Visible conveyor tiles per partition. */
  slots?: number;
  /** Consumer groups shown as robot arms at the end of the line. */
  consumers?: ConsumerSpec[];
  /** Topic names that are replicas of one partition (first = initial leader). */
  replicas?: string[];
  onLanded?: (record: SimRecord) => void;
};

type Lane = {
  topic: string;
  partition: number;
  z: number;
  material: THREE.MeshStandardMaterial;
  boxes: Map<number, THREE.Object3D>;
  viewStart: number;
  next: THREE.Object3D;
  nextLabel: HTMLElement;
  title: HTMLElement;
  cursors: Map<string, { obj: CSS2DObject; position: number }>;
  /** Everything belonging to the lane, so lanes reserved for future partitions can be revealed. */
  parts: THREE.Object3D[];
  active: boolean;
};

type Arm = { spec: ConsumerSpec; obj: THREE.Object3D };

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

/** Live isometric diorama: producer → partitioner → one conveyor per partition (per topic) → consumers. */
export class FactoryStage {
  private renderer: THREE.WebGLRenderer;
  private labels2d: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private tweens = new Tweens();
  private lanes: Lane[] = [];
  private arms = new Map<string, Arm>();
  private producer = new THREE.Group();
  private scanner = new THREE.Group();
  private hashLabel!: HTMLElement;
  private hashObj!: CSS2DObject;
  private batchLabel!: HTMLElement;
  private batchCounts = new Map<number, { count: number; size: number }>();
  private alertLabel!: HTMLElement;
  private alertObj!: CSS2DObject;
  private topicTags = new Map<string, HTMLElement>();
  private leader: string | undefined;
  private down = new Set<string>();
  private frame = 0;
  private last = performance.now();
  private resizeObs: ResizeObserver;
  private disposed = false;
  private slots: number;
  private floor = { minX: -6, maxX: 11, halfZ: 4 };
  readonly ready: Promise<void>;

  constructor(
    private host: HTMLElement,
    private cluster: Cluster,
    private text: StageLabels,
    private options: StageOptions = {},
  ) {
    this.slots = options.slots ?? 9;
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
    Object.assign(sun.shadow.camera, { left: -12, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
    this.scene.add(sun);
  }

  /** Lane z positions, grouped per topic and centred on the feeder belt. */
  private layoutLanes() {
    const zs: { topic: string; partition: number; z: number }[] = [];
    let z = 0;
    this.cluster.topicList.forEach((t, ti) => {
      if (ti > 0) z += TOPIC_GAP;
      const max = Math.max(t.numPartitions, this.cluster.specs.find((sp) => sp.name === t.name)?.max ?? 0);
      for (let p = 0; p < max; p++) {
        zs.push({ topic: t.name, partition: p, z });
        z += LANE_GAP;
      }
    });
    const span = z - LANE_GAP;
    return zs.map((l) => ({ ...l, z: l.z - span / 2 }));
  }

  private lane(topic: string, partition: number) {
    return this.lanes.find((l) => l.topic === topic && l.partition === partition)!;
  }

  private slotX(lane: Lane, offset: number) {
    return 0.5 + (offset - lane.viewStart);
  }

  private async build() {
    const layout = this.layoutLanes();
    const zMin = layout[0].z, zMax = layout[layout.length - 1].z;
    const armSpan = ((this.options.consumers?.length ?? 0) - 1) * 0.75 + 0.8;
    const halfZ = Math.ceil(Math.max(-zMin, zMax, armSpan) + 1.7);
    this.floor = { minX: -6, maxX: this.slots + (this.options.consumers?.length ? 4 : 2), halfZ };
    const { minX, maxX } = this.floor;

    // Floor: a diorama platform of checkerboard tiles; outside it only shadows show (page colour)
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = -0.3;
    shadowCatcher.receiveShadow = true;
    this.scene.add(shadowCatcher);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX + 0.3, 0.3, halfZ * 2 + 0.3),
      new THREE.MeshStandardMaterial({ color: 0x8a84b8, roughness: 0.9 }),
    );
    slab.position.set((minX + maxX) / 2, -0.15, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.scene.add(slab);
    const tiles: Promise<void>[] = [];
    for (let x = minX; x < maxX; x += 2) {
      for (let z = -halfZ; z < halfZ; z += 2) {
        tiles.push(model("top-large-checkerboard").then((t) => void (t.position.set(x + 1, 0.002, z + 1), this.scene.add(t))));
      }
    }

    // Producer depot and the partitioner (scanner arch over a feeder belt)
    const machine = await model("machine-window");
    machine.rotation.y = Math.PI / 2;
    this.producer.add(machine);
    this.producer.position.set(PRODUCER_X, 0, 0);
    this.scene.add(this.producer);
    const prodLabel = css2d(label("stage-tag stage-tag--producer", this.text.producer));
    prodLabel.position.set(0, 1.75, 0);
    this.producer.add(prodLabel);
    const batch = label("stage-batch");
    this.batchLabel = batch.inner;
    const batchObj = css2d(batch);
    batchObj.position.set(0, 2.35, 0);
    this.producer.add(batchObj);
    const alert = label("stage-alert");
    this.alertLabel = alert.inner;
    this.alertObj = css2d(alert);
    this.alertObj.position.set(0.4, 0.2, 1.1);
    this.alertObj.visible = false;
    this.producer.add(this.alertObj);

    for (let x = PRODUCER_X + 0.9; x < SCANNER_X + 0.6; x += 1) {
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

    // One conveyor per partition, grouped by topic
    this.leader = this.options.replicas?.[0];
    for (const t of this.cluster.topicList) {
      const first = layout.find((l) => l.topic === t.name)!;
      const tl = label("stage-tag stage-tag--topic", this.tagText(t.name));
      this.topicTags.set(t.name, tl.inner);
      const tag = css2d(tl);
      tag.position.set(this.slots + 0.4, 0.2, first.z - 0.95);
      this.scene.add(tag);
    }

    for (const { topic, partition, z } of layout) {
      const parts: THREE.Object3D[] = [];
      let material: THREE.MeshStandardMaterial | null = null;
      for (let i = 0; i < this.slots; i++) {
        const belt = await model("conveyor-stripe-sides");
        parts.push(belt);
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
      end.position.set(this.slots + 0.25, 0, z);
      this.scene.add(end);
      parts.push(end);

      const titleLabel = label("stage-lane", `P${partition}`);
      const titleObj = css2d(titleLabel);
      titleObj.position.set(-0.55, 0.3, z);
      this.scene.add(titleObj);
      parts.push(titleObj);

      // Log-end marker: where the next record will land
      const next = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.02, 0.56),
        new THREE.MeshBasicMaterial({ color: COLORS.partition, transparent: true, opacity: 0.28 }),
      );
      ring.position.y = 0.42;
      next.add(ring);
      const nextL = label("stage-next", this.text.next(this.cluster.topic(topic).partitions[partition]?.length ?? 0));
      const nextObj = css2d(nextL);
      nextObj.position.set(0, 0.45, 0);
      next.add(nextObj);
      next.position.set(0.5, 0, z);
      this.scene.add(next);
      parts.push(next, nextObj);

      const active = partition < this.cluster.topic(topic).numPartitions;
      const lane: Lane = { topic, partition, z, material: material!, boxes: new Map(), viewStart: 0, next, nextLabel: nextL.inner, title: titleLabel.inner, cursors: new Map(), parts, active };
      if (!active) for (const o of parts) o.visible = false;
      this.lanes.push(lane);
    }
    await Promise.all(tiles);

    // Consumers: one robot arm per group; otherwise two decorative arms hint at what's coming
    const consumers = this.options.consumers ?? [];
    if (consumers.length) {
      const gap = Math.max(1.5, (zMax - zMin) / Math.max(1, consumers.length - 1));
      for (const [i, spec] of consumers.entries()) {
        const arm = await model("robot-arm-a");
        const z = (zMin + zMax) / 2 + (i - (consumers.length - 1) / 2) * gap;
        arm.position.set(this.slots + 1.5, 0, z);
        const tag = label("stage-tag stage-tag--consumer", spec.label);
        tag.inner.style.background = spec.color;
        const tagObj = css2d(tag);
        tagObj.position.set(0, 1.9, 0);
        arm.add(tagObj);
        this.scene.add(arm);
        this.arms.set(spec.group, { spec, obj: arm });
        for (const lane of this.lanes) if (lane.active) this.ensureCursor(lane, spec);
      }
    } else {
      for (const z of [zMin - 0.9, zMax + 0.9]) {
        const arm = await model("robot-arm-a");
        arm.position.set(this.slots + 1.2, 0, z);
        this.scene.add(arm);
      }
    }
  }

  private tagText(name: string) {
    if (!this.options.replicas?.includes(name) || !this.text.replica) return this.text.topic(name);
    return this.text.replica(name, this.down.has(name) ? "down" : name === this.leader ? "leader" : "follower");
  }

  private refreshTags() {
    for (const [name, el] of this.topicTags) {
      el.textContent = this.tagText(name);
      el.classList.toggle("is-down", this.down.has(name));
      el.classList.toggle("is-leader", name === this.leader);
    }
  }

  private flashAlert(text: string) {
    this.alertLabel.textContent = text;
    this.alertObj.visible = true;
    this.alertLabel.classList.remove("is-on");
    void this.alertLabel.offsetWidth;
    this.alertLabel.classList.add("is-on");
    setTimeout(() => (this.alertObj.visible = false), 1500);
  }

  /** A small flag under the conveyor showing a group's position (next offset to read). */
  private ensureCursor(lane: Lane, spec: ConsumerSpec) {
    if (lane.cursors.has(spec.group)) return lane.cursors.get(spec.group)!;
    const l = label("stage-cursor", `▲ ${spec.label[0]}`);
    l.inner.title = spec.label;
    l.inner.style.background = spec.color;
    const obj = css2d(l);
    const idx = [...this.arms.keys()].indexOf(spec.group);
    obj.position.set(this.slotX(lane, 0), 0.05, lane.z + 0.55);
    obj.center.set(0.5, idx * -1.1);
    this.scene.add(obj);
    const cursor = { obj, position: 0 };
    lane.cursors.set(spec.group, cursor);
    return cursor;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels2d.setSize(w, h);
    this.fit(w / h);
  }

  /** Orthographic fit: project the platform bounds onto the camera plane. */
  private fit(aspect: number) {
    const { minX, maxX, halfZ } = this.floor;
    const bounds = new THREE.Box3(new THREE.Vector3(minX - 0.2, -0.3, -halfZ - 0.2), new THREE.Vector3(maxX + 0.2, 1.6, halfZ + 0.2));
    const center = bounds.getCenter(new THREE.Vector3());
    this.camera.position.copy(center).addScaledVector(CAMERA_DIR, 30);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    const inv = this.camera.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(inv);
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
    }
    const pad = 1.03;
    let halfW = ((x1 - x0) / 2) * pad;
    let halfH = ((y1 - y0) / 2) * pad;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    Object.assign(this.camera, { left: cx - halfW, right: cx + halfW, top: cy + halfH, bottom: cy - halfH, near: 0.1, far: 80 });
    this.camera.updateProjectionMatrix();
    // Labels scale with the world so small screens don't drown in tags
    const pxPerUnit = this.host.clientHeight / (halfH * 2);
    const zoom = pxPerUnit / 58;
    this.host.style.setProperty("--stage-zoom", String(Math.min(1.2, Math.max(0.72, zoom))));
    // Tiny stages (phones) keep only the essential labels
    this.host.toggleAttribute("data-compact", zoom < 0.62);
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
    const dup = record.headers["x-dup"] === "1";
    const codec = record.headers["x-codec"];
    // Compressed batches travel vacuum-packed: smaller boxes
    const squeeze = codec ? 0.55 + 0.45 * (CODECS[codec as Codec]?.ratio ?? 1) : 1;
    body.scale.set(squeeze, squeeze, squeeze);
    box.add(body);
    const sticker = new THREE.Mesh(
      new THREE.BoxGeometry(0.34 * squeeze, 0.012, 0.3 * squeeze),
      new THREE.MeshStandardMaterial({ color: dup ? COLORS.danger : keyColor(record.key), roughness: 0.6 }),
    );
    sticker.position.set(0, 0.556 * squeeze, 0);
    box.add(sticker);
    const text = `${record.key ?? "∅"}${record.value.startsWith("#") ? ` ${record.value}` : ""}${dup ? " · DUP" : ""}`;
    const tag = css2d(label(dup ? "stage-key stage-key--dup" : "stage-key", text));
    tag.position.set(0, 0.75, 0);
    box.add(tag);
    return box;
  }

  private async showHash(record: SimRecord) {
    const n = this.cluster.topic(record.topic).numPartitions;
    const where = this.cluster.topics.size > 1 ? `${record.topic}/P${record.partition}` : `P${record.partition}`;
    await this.showPill(record.key === null ? `null → sticky → ${where}` : `murmur2("${record.key}") % ${n} = ${record.partition}`);
  }

  private puff(at: THREE.Vector3, color = 0xffffff) {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
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

  /** Briefly light up a partition's conveyor (signaling: "this is the one"). */
  pulse(topic: string, partition: number, color: number = COLORS.partition) {
    const lane = this.lane(topic, partition);
    if (!lane) return;
    lane.material.emissive.setHex(color);
    lane.material.emissiveIntensity = 0.55;
    void this.tweens.to(lane.material, { emissiveIntensity: 0 }, 650);
    lane.title.classList.remove("is-hit");
    void lane.title.offsetWidth;
    lane.title.classList.add("is-hit");
  }

  async handle(event: SimEvent) {
    if (this.disposed) return;
    await this.ready;
    if (event.type === "appended") await this.onAppended(event.record);
    if (event.type === "fetched") this.onFetched(event.group, event.record, event.position);
    if (event.type === "partitionsAdded") this.revealLanes(event.topic, event.total);
    if (event.type === "buffered") this.onBuffered(event.partition, event.count, event.batchSize);
    if (event.type === "ackLost" && this.text.ackLost) this.flashAlert(this.text.ackLost);
    if (event.type === "duplicateRejected" && this.text.dupDropped) this.showPill(this.text.dupDropped(event.seq), "is-good");
    if (event.type === "brokerDown") this.onBrokerDown(event.topic);
    if (event.type === "leaderElected") {
      this.leader = event.topic;
      this.refreshTags();
      this.pulse(event.topic, 0, COLORS.broker);
    }
  }

  private onBuffered(partition: number, count: number, size: number) {
    if (count === 0) this.batchCounts.delete(partition);
    else this.batchCounts.set(partition, { count, size });
    const fmt = this.text.batch;
    this.batchLabel.textContent = fmt ? [...this.batchCounts.entries()].map(([p, b]) => fmt(p, b.count, b.size)).join("  ") : "";
    this.batchLabel.classList.toggle("is-empty", this.batchCounts.size === 0);
  }

  private onBrokerDown(topic: string) {
    this.down.add(topic);
    this.refreshTags();
    for (const lane of this.lanes) {
      if (lane.topic !== topic) continue;
      lane.material.color.setHex(0x55506e);
      lane.material.emissive.setHex(COLORS.danger);
      lane.material.emissiveIntensity = 0.25;
      lane.title.classList.add("is-down");
    }
    this.puff(new THREE.Vector3(this.slots / 2, 0.6, this.lane(topic, 0).z), COLORS.danger);
  }

  /** The dark pill under the partitioner, with an optional tone. */
  private async showPill(text: string, tone = "") {
    this.hashLabel.textContent = text;
    this.hashLabel.className = `stage-hash ${tone}`;
    this.hashObj.visible = true;
    void this.hashLabel.offsetWidth;
    this.hashLabel.classList.add("is-on");
    await wait(1500);
    this.hashObj.visible = false;
  }

  /** New partitions: the reserved conveyors drop into place. */
  private revealLanes(topic: string, total: number) {
    for (const lane of this.lanes) {
      if (lane.topic !== topic || lane.active || lane.partition >= total) continue;
      lane.active = true;
      lane.parts.forEach((o, i) => {
        o.visible = true;
        if (!(o instanceof CSS2DObject)) {
          const y = o.position.y;
          o.position.y = y + 2.5;
          void this.tweens.to(o.position, { y }, 420 + i * 25, easeOutBack);
        }
      });
      for (const arm of this.arms.values()) this.ensureCursor(lane, arm.spec);
      this.puff(new THREE.Vector3(this.slots / 2, 0.4, lane.z), COLORS.partition);
      this.pulse(topic, lane.partition);
    }
  }

  private async onAppended(record: SimRecord) {
    const lane = this.lane(record.topic, record.partition);

    // Scroll the conveyor window when the log outgrows the visible tiles (keep one for "next")
    if (record.offset - lane.viewStart >= this.slots - 1) {
      lane.viewStart = record.offset - this.slots + 2;
      for (const [off, b] of lane.boxes) {
        if (off < lane.viewStart) {
          lane.boxes.delete(off);
          void this.tweens.to(b.scale, { x: 0.01, y: 0.01, z: 0.01 }, 260).then(() => this.scene.remove(b));
        } else {
          void this.tweens.to(b.position, { x: this.slotX(lane, off) }, 320, easeInOutCubic);
        }
      }
      for (const c of lane.cursors.values()) void this.tweens.to(c.obj.position, { x: this.slotX(lane, Math.max(c.position, lane.viewStart)) }, 320);
    }
    const leo = this.cluster.topic(record.topic).partitions[record.partition].length;
    lane.nextLabel.textContent = this.text.next(leo);
    void this.tweens.to(lane.next.position, { x: this.slotX(lane, leo) }, 300, easeOutBack);

    this.producer.scale.set(1.08, 0.9, 1.08);
    void this.tweens.to(this.producer.scale, { x: 1, y: 1, z: 1 }, 260, easeOutBack);

    const copyFrom = record.headers["x-copy-from"];
    if (copyFrom) {
      // Replication: a follower fetches the record from the leader's conveyor
      const src = this.lane(copyFrom, 0);
      const box = await this.makeBox(record);
      const start = new THREE.Vector3(this.slotX(src, record.offset), 0.4, src.z);
      const end = new THREE.Vector3(this.slotX(lane, record.offset), 0.4, lane.z);
      box.position.copy(start);
      this.scene.add(box);
      await this.tweens.progress(520, (t) => {
        box.position.lerpVectors(start, end, t);
        box.position.y += Math.sin(Math.PI * t) * 0.9;
      });
      lane.boxes.set(record.offset, box);
      box.scale.set(1.15, 0.85, 1.15);
      void this.tweens.to(box.scale, { x: 1, y: 1, z: 1 }, 220, easeOutBack);
      const stamp = css2d(label("stage-offset", String(record.offset)));
      stamp.position.set(0, -0.05, 0.42);
      box.add(stamp);
      this.pulse(record.topic, record.partition);
      this.options.onLanded?.(record);
      return;
    }

    // Out of the depot, along the feeder, through the partitioner…
    const box = await this.makeBox(record);
    box.position.set(PRODUCER_X + 0.6, 0.4, 0);
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
    this.pulse(record.topic, record.partition);
    this.options.onLanded?.(record);
  }

  /** A robot arm scans a box: beam + badge. The box stays on the belt — reading never deletes. */
  private onFetched(group: string, record: SimRecord, position: number) {
    const arm = this.arms.get(group);
    const lane = this.lane(record.topic, record.partition);
    const box = lane.boxes.get(record.offset);
    if (!arm) return;
    const color = new THREE.Color(arm.spec.color);

    arm.obj.rotation.y = 0.25;
    void this.tweens.to(arm.obj.rotation, { y: 0 }, 380, easeOutBack);

    if (box) {
      const from = new THREE.Vector3().copy(arm.obj.position).setY(1.3);
      const to = new THREE.Vector3(box.position.x, 0.75, lane.z);
      const beam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from, to]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, linewidth: 2 }),
      );
      this.scene.add(beam);
      void this.tweens.to(beam.material, { opacity: 0 }, 650).then(() => {
        this.scene.remove(beam);
        beam.geometry.dispose();
      });
      box.scale.set(1.12, 1.12, 1.12);
      void this.tweens.to(box.scale, { x: 1, y: 1, z: 1 }, 260, easeOutBack);
      this.puff(to, color.getHex());
      const read = label("stage-read", "✓");
      read.inner.style.background = arm.spec.color;
      const readObj = css2d(read);
      const idx = [...this.arms.keys()].indexOf(group);
      readObj.position.set(-0.24 + idx * 0.22, 0.62, -0.22);
      box.add(readObj);
    }

    const cursor = this.ensureCursor(lane, arm.spec);
    cursor.position = position;
    void this.tweens.to(cursor.obj.position, { x: this.slotX(lane, Math.max(position, lane.viewStart)) }, 300, easeOutBack);
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
