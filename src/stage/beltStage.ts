import { Application, Container, Graphics, Text } from "pixi.js";
import type { SimEvent, SimRecord } from "@/sim/events";
import type { Topic } from "@/sim/topic";
import { hexToNumber, keyColor } from "./keyColors";
import { COLORS, STAGE, type StageFonts } from "./theme";
import { Tweens, easeInOutCubic, easeOutBack, easeOutCubic, wait } from "./tweens";

// Layout (logical px, tune)
const DOCK = { x: 150, y: 360 };
const BELT = { x: 330, width: 900, height: 92, gap: 140 };
const SLOT = { first: 118, step: 80, w: 62, h: 54 };
const VISIBLE_SLOTS = 9;
const FLIGHT_MS = 620; // tune
const ARC_HEIGHT = 120; // tune

export type StageLabels = {
  producer: string;
  topic: (name: string) => string;
  partition: (n: number) => string;
  next: (n: number) => string;
};

type Belt = {
  root: Container;
  glow: Graphics;
  name: Text;
  nextMarker: Container;
  nextLabel: Text;
  parcels: Map<number, Container>;
  viewStart: number;
  y: number;
};

export class BeltStage {
  private world = new Container();
  private fx = new Container();
  private belts: Belt[] = [];
  private tweens: Tweens;
  private dock = new Container();
  private dockBody = new Container();
  /** Logical bounds of everything drawn; the camera fits this, not the full 1280×720. */
  private content: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: STAGE.width, h: STAGE.height };

  constructor(
    private app: Application,
    private topic: Topic,
    private fonts: StageFonts,
    private labels: StageLabels,
    private onLanded: (record: SimRecord) => void,
  ) {
    this.tweens = new Tweens(app.ticker);
    app.stage.addChild(this.world);
    this.build();
    this.world.addChild(this.fx);
    this.layout();
    app.renderer.on("resize", () => this.layout());
  }

  private text(text: string, size: number, color: number, font: "ui" | "mono" = "ui", weight: "500" | "600" | "700" = "600") {
    return new Text({
      text,
      style: { fontFamily: font === "mono" ? this.fonts.mono : this.fonts.ui, fontSize: size, fill: color, fontWeight: weight },
      resolution: 2,
    });
  }

  private beltY(p: number) {
    const n = this.topic.numPartitions;
    return STAGE.height / 2 + (p - (n - 1) / 2) * BELT.gap;
  }

  private slotLocalX(belt: Belt, offset: number) {
    return SLOT.first + (offset - belt.viewStart) * SLOT.step;
  }

  private build() {
    const n = this.topic.numPartitions;
    const top = this.beltY(0) - BELT.height / 2;
    const bottom = this.beltY(n - 1) + BELT.height / 2;

    // Topic frame groups the partitions
    const frame = new Graphics()
      .roundRect(BELT.x - 28, top - 60, BELT.width + 56, bottom - top + 92, 28)
      .fill({ color: COLORS.partition, alpha: 0.04 })
      .stroke({ width: 3, color: COLORS.partition, alpha: 0.22 });
    const tag = new Container();
    const tagText = this.text(this.labels.topic(this.topic.name), 18, COLORS.bg, "mono", "700");
    tagText.position.set(14, 6);
    const tagBg = new Graphics().roundRect(0, 0, tagText.width + 28, 34, 12).fill(COLORS.partition);
    tag.addChild(tagBg, tagText);
    tag.position.set(BELT.x - 8, top - 78);
    this.world.addChild(frame, tag);

    const left = DOCK.x - 110;
    this.content = { x: left, y: top - 140, w: BELT.x + BELT.width + 44 - left, h: bottom - top + 200 };

    for (let p = 0; p < n; p++) {
      const y = this.beltY(p);
      const root = new Container();
      root.position.set(BELT.x, y);

      const glow = new Graphics()
        .roundRect(-8, -BELT.height / 2 - 8, BELT.width + 16, BELT.height + 16, 24)
        .fill({ color: COLORS.partition, alpha: 0.22 });
      glow.alpha = 0;

      // Conveyor: chunky body, darker track, roller notches
      const band = new Graphics()
        .roundRect(0, -BELT.height / 2 + 6, BELT.width, BELT.height, 20)
        .fill(0x060a17)
        .roundRect(0, -BELT.height / 2, BELT.width, BELT.height, 20)
        .fill(0x111a36)
        .stroke({ width: 3, color: COLORS.partition, alpha: 0.65 });
      const track = new Graphics().roundRect(84, -SLOT.h / 2 - 8, BELT.width - 104, SLOT.h + 16, 14).fill(0x0a1024);
      for (let x = 96; x < BELT.width - 24; x += 20) {
        track.moveTo(x, SLOT.h / 2 + 4).lineTo(x + 8, SLOT.h / 2 + 4).stroke({ width: 2, color: COLORS.partition, alpha: 0.12 });
      }
      // Empty slot ghosts show where offsets will go
      for (let s = 0; s < VISIBLE_SLOTS; s++) {
        track
          .roundRect(SLOT.first + s * SLOT.step - SLOT.w / 2, -SLOT.h / 2, SLOT.w, SLOT.h, 10)
          .stroke({ width: 2, color: COLORS.partition, alpha: 0.08 });
      }

      const name = this.text(`P${p}`, 30, COLORS.partition, "ui", "700");
      name.anchor.set(0.5);
      name.position.set(44, -8);
      const sub = this.text(this.labels.partition(p), 12, COLORS.muted, "ui", "600");
      sub.anchor.set(0.5);
      sub.position.set(44, 22);

      // "next offset" marker = the log-end offset, where the next record will land
      const nextMarker = new Container();
      const nm = new Graphics()
        .roundRect(-SLOT.w / 2, -SLOT.h / 2, SLOT.w, SLOT.h, 10)
        .fill({ color: COLORS.partition, alpha: 0.06 })
        .stroke({ width: 2, color: COLORS.partition, alpha: 0.45 });
      const nextLabel = this.text(this.labels.next(0), 13, COLORS.partition, "mono", "700");
      nextLabel.anchor.set(0.5);
      nextMarker.addChild(nm, nextLabel);
      nextMarker.position.set(SLOT.first, 0);
      nextMarker.alpha = 0.85;

      root.addChild(glow, band, track, nextMarker, name, sub);
      this.world.addChild(root);
      this.belts.push({ root, glow, name, nextMarker, nextLabel, parcels: new Map(), viewStart: 0, y });
    }

    // Producer depot
    const shadow = new Graphics().roundRect(-78, -62, 156, 138, 26).fill(0x05080f);
    const body = new Graphics()
      .roundRect(-78, -70, 156, 138, 26)
      .fill(0x2a2110)
      .stroke({ width: 3, color: COLORS.producer });
    const roof = new Graphics().roundRect(-74, -66, 148, 30, 22).fill(COLORS.producer);
    const door = new Graphics().roundRect(-34, -22, 68, 52, 10).fill(0x120d05).stroke({ width: 2, color: COLORS.producer, alpha: 0.5 });
    for (let i = 0; i < 3; i++) door.moveTo(-26, -10 + i * 13).lineTo(26, -10 + i * 13).stroke({ width: 2, color: COLORS.producer, alpha: 0.25 });
    const label = this.text(this.labels.producer, 16, COLORS.bg, "ui", "700");
    label.anchor.set(0.5);
    label.position.set(0, -51);
    const sign = this.text("→", 22, COLORS.producer, "ui", "700");
    sign.anchor.set(0.5);
    sign.position.set(0, 50);
    this.dockBody.addChild(shadow, body, roof, door, label, sign);
    this.dock.addChild(this.dockBody);
    this.dock.position.set(DOCK.x, DOCK.y);
    this.world.addChild(this.dock);
  }

  private layout() {
    const { width, height } = this.app.screen;
    const c = this.content;
    const pad = 16;
    const s = Math.min((width - pad * 2) / c.w, (height - pad * 2) / c.h);
    this.world.scale.set(s);
    this.world.position.set((width - c.w * s) / 2 - c.x * s, (height - c.h * s) / 2 - c.y * s);
  }

  private makeParcel(record: SimRecord) {
    const c = new Container();
    const tape = hexToNumber(keyColor(record.key));
    const box = new Graphics()
      .roundRect(-SLOT.w / 2 + 2, -SLOT.h / 2 + 5, SLOT.w - 4, SLOT.h - 4, 10)
      .fill({ color: 0x000000, alpha: 0.35 })
      .roundRect(-SLOT.w / 2 + 2, -SLOT.h / 2, SLOT.w - 4, SLOT.h - 4, 10)
      .fill(COLORS.producer)
      .rect(-SLOT.w / 2 + 2, -SLOT.h / 2 + 12, SLOT.w - 4, 8)
      .fill(tape);
    const key = this.text(record.key ?? "∅", 13, 0x2a1800, "mono", "700");
    key.anchor.set(0.5);
    key.position.set(0, 3);
    if (key.width > SLOT.w - 12) key.scale.set((SLOT.w - 12) / key.width);
    c.addChild(box, key);
    return c;
  }

  private makeStamp(offset: number) {
    const c = new Container();
    const label = this.text(String(offset), 14, COLORS.bg, "mono", "700");
    label.anchor.set(0.5);
    const w = Math.max(28, label.width + 14);
    const bg = new Graphics().roundRect(-w / 2, -12, w, 24, 12).fill(COLORS.partition).stroke({ width: 2, color: COLORS.bg });
    c.addChild(bg, label);
    c.position.set(0, SLOT.h / 2 + 8);
    return c;
  }

  /** Formula pill: the abstract layer of the key → partition mapping. */
  private async showHash(record: SimRecord) {
    const label =
      record.key === null
        ? `key = null → sticky → P${record.partition}`
        : `murmur2("${record.key}") % ${this.topic.numPartitions} = ${record.partition}`;
    const pill = new Container();
    const t = this.text(label, 16, COLORS.text, "mono", "700");
    t.anchor.set(0.5);
    const w = t.width + 28;
    const bg = new Graphics()
      .roundRect(-w / 2, -14, w, 36, 18)
      .fill(0x05080f)
      .roundRect(-w / 2, -18, w, 36, 18)
      .fill(0x1b1440)
      .stroke({ width: 2, color: COLORS.consumer });
    pill.addChild(bg, t);
    pill.position.set(DOCK.x + 40, DOCK.y - 112);
    pill.alpha = 0;
    pill.scale.set(0.8);
    this.fx.addChild(pill);
    void this.tweens.to(pill.scale, { x: 1, y: 1 }, 220, easeOutBack);
    await this.tweens.to(pill, { alpha: 1, y: DOCK.y - 122 }, 180);
    await wait(1100);
    await this.tweens.to(pill, { alpha: 0, y: DOCK.y - 134 }, 260);
    pill.destroy({ children: true });
  }

  private sparks(x: number, y: number, color: number) {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      const dist = 34 + Math.random() * 22;
      const dot = new Graphics().circle(0, 0, 3 + Math.random() * 2).fill(color);
      dot.position.set(x, y);
      this.fx.addChild(dot);
      void this.tweens.to(dot, { x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0 }, 380, easeOutCubic).then(() => dot.destroy());
    }
  }

  private moveNextMarker(belt: Belt, partition: number) {
    const leo = this.topic.partitions[partition].length;
    belt.nextLabel.text = this.labels.next(leo);
    void this.tweens.to(belt.nextMarker, { x: this.slotLocalX(belt, leo) }, 260, easeOutBack);
  }

  async handle(event: SimEvent) {
    if (event.type !== "appended" || event.topic !== this.topic.name) return;
    const record = event.record;
    const belt = this.belts[record.partition];
    void this.showHash(record);

    // Producer squash on send
    this.dockBody.scale.set(1.12, 0.88);
    void this.tweens.to(this.dockBody.scale, { x: 1, y: 1 }, 260, easeOutBack);

    // Scroll the belt window when the log outgrows the visible slots (keep one slot for "next")
    if (record.offset - belt.viewStart >= VISIBLE_SLOTS - 1) {
      belt.viewStart = record.offset - VISIBLE_SLOTS + 2;
      for (const [off, parcel] of belt.parcels) {
        if (off < belt.viewStart) {
          belt.parcels.delete(off);
          void this.tweens.to(parcel, { alpha: 0, x: parcel.x - SLOT.step }, 300).then(() => parcel.destroy({ children: true }));
        } else {
          void this.tweens.to(parcel, { x: this.slotLocalX(belt, off) }, 300, easeInOutCubic);
        }
      }
    }
    this.moveNextMarker(belt, record.partition);

    // Parcel flies in an arc from the depot to its slot (world space), then parents to the belt
    const parcel = this.makeParcel(record);
    const start = { x: DOCK.x, y: DOCK.y - 20 };
    const end = { x: BELT.x + this.slotLocalX(belt, record.offset), y: belt.y };
    parcel.position.set(start.x, start.y);
    parcel.scale.set(0.3);
    this.fx.addChild(parcel);
    void this.tweens.to(parcel.scale, { x: 1, y: 1 }, 260, easeOutBack);
    const spin = (Math.random() - 0.5) * 0.5;
    await this.tweens.progress(FLIGHT_MS, (p) => {
      parcel.x = start.x + (end.x - start.x) * p;
      parcel.y = start.y + (end.y - start.y) * p - Math.sin(Math.PI * p) * ARC_HEIGHT;
      parcel.rotation = spin * Math.sin(Math.PI * p);
    });
    if (parcel.destroyed) return;

    // Land: reparent into belt-local coordinates
    parcel.rotation = 0;
    belt.root.addChild(parcel);
    parcel.position.set(this.slotLocalX(belt, record.offset), 0);
    belt.parcels.set(record.offset, parcel);

    // Impact: squash & stretch, stamp pop, sparks, partition glow (signaling)
    parcel.scale.set(1.22, 0.78);
    void this.tweens.to(parcel.scale, { x: 1, y: 1 }, 220, easeOutBack);
    const stamp = this.makeStamp(record.offset);
    stamp.scale.set(0);
    parcel.addChild(stamp);
    void this.tweens.to(stamp.scale, { x: 1, y: 1 }, 260, easeOutBack);
    this.sparks(end.x, end.y + 8, COLORS.partition);
    belt.glow.alpha = 1;
    void this.tweens.to(belt.glow, { alpha: 0 }, 650);
    belt.name.scale.set(1.25);
    void this.tweens.to(belt.name.scale, { x: 1, y: 1 }, 300, easeOutBack);
    this.onLanded(record);
  }

  destroy() {
    this.world.destroy({ children: true });
  }
}
