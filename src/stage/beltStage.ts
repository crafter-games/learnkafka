import { Application, Container, Graphics, Text } from "pixi.js";
import type { SimEvent, SimRecord } from "@/sim/events";
import type { Topic } from "@/sim/topic";
import { COLORS, STAGE, type StageFonts } from "./theme";
import { Tweens, easeInOutCubic, easeOutBack, wait } from "./tweens";

// Layout (logical px, tune)
const DOCK = { x: 170, y: 380 };
const BELT = { x: 360, width: 860, height: 84, gap: 150 };
const SLOT = { first: 110, step: 78 };
const VISIBLE_SLOTS = 9;

export type StageLabels = {
  producer: string;
  topic: (name: string) => string;
  partition: (n: number) => string;
  offset: string;
};

type Belt = {
  root: Container;
  glow: Graphics;
  parcels: Map<number, Container>;
  viewStart: number;
  y: number;
};

export class BeltStage {
  private world = new Container();
  private belts: Belt[] = [];
  private tweens: Tweens;
  private dock = new Container();
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
    this.layout();
    app.renderer.on("resize", () => this.layout());
  }

  private text(text: string, size: number, color: number, mono = false, weight: "400" | "600" | "700" = "600") {
    const t = new Text({
      text,
      style: { fontFamily: mono ? this.fonts.mono : this.fonts.ui, fontSize: size, fill: color, fontWeight: weight },
      resolution: 2,
    });
    return t;
  }

  private beltY(p: number) {
    const n = this.topic.numPartitions;
    return STAGE.height / 2 + (p - (n - 1) / 2) * BELT.gap;
  }

  private build() {
    const n = this.topic.numPartitions;
    const top = this.beltY(0) - BELT.height / 2;
    const bottom = this.beltY(n - 1) + BELT.height / 2;

    // Topic frame groups the partitions
    const frame = new Graphics()
      .roundRect(BELT.x - 30, top - 56, BELT.width + 60, bottom - top + 86, 22)
      .fill({ color: COLORS.panel, alpha: 0.55 })
      .stroke({ width: 2, color: COLORS.partition, alpha: 0.25 });
    const topicLabel = this.text(this.labels.topic(this.topic.name), 20, COLORS.partition, true);
    topicLabel.position.set(BELT.x - 6, top - 44);
    this.world.addChild(frame, topicLabel);
    const left = DOCK.x - 90;
    this.content = { x: left, y: top - 150, w: BELT.x + BELT.width + 40 - left, h: bottom - top + 190 };

    for (let p = 0; p < n; p++) {
      const y = this.beltY(p);
      const root = new Container();
      root.position.set(BELT.x, y);

      const glow = new Graphics()
        .roundRect(-6, -BELT.height / 2 - 6, BELT.width + 12, BELT.height + 12, 18)
        .fill({ color: COLORS.partition, alpha: 0.18 });
      glow.alpha = 0;

      const band = new Graphics()
        .roundRect(0, -BELT.height / 2, BELT.width, BELT.height, 14)
        .fill(0x0f1630)
        .stroke({ width: 2, color: COLORS.partition, alpha: 0.6 });
      // Chevrons hint at append direction
      for (let x = SLOT.first + SLOT.step * VISIBLE_SLOTS - 30; x < BELT.width - 16; x += 22) {
        band.moveTo(x, -10).lineTo(x + 8, 0).lineTo(x, 10).stroke({ width: 2, color: COLORS.partition, alpha: 0.35 });
      }

      const name = this.text(`P${p}`, 26, COLORS.partition, true, "700");
      name.anchor.set(0.5);
      name.position.set(44, -8);
      const sub = this.text(this.labels.partition(p), 12, COLORS.muted);
      sub.anchor.set(0.5);
      sub.position.set(44, 20);

      root.addChild(glow, band, name, sub);
      this.world.addChild(root);
      this.belts.push({ root, glow, parcels: new Map(), viewStart: 0, y });
    }

    // Producer dock
    const body = new Graphics()
      .roundRect(-70, -60, 140, 120, 20)
      .fill({ color: COLORS.producer, alpha: 0.12 })
      .stroke({ width: 2, color: COLORS.producer });
    const icon = new Graphics()
      .roundRect(-26, -32, 52, 40, 8)
      .fill(COLORS.producer)
      .moveTo(-26, -18)
      .lineTo(26, -18)
      .stroke({ width: 3, color: 0x7a4a00 });
    const label = this.text(this.labels.producer, 16, COLORS.producer, false, "700");
    label.anchor.set(0.5);
    label.position.set(0, 34);
    this.dock.addChild(body, icon, label);
    this.dock.position.set(DOCK.x, DOCK.y);
    this.world.addChild(this.dock);
  }

  private layout() {
    const { width, height } = this.app.screen;
    const c = this.content;
    const s = Math.min(width / c.w, height / c.h);
    this.world.scale.set(s);
    this.world.position.set((width - c.w * s) / 2 - c.x * s, (height - c.h * s) / 2 - c.y * s);
  }

  private makeParcel(record: SimRecord) {
    const c = new Container();
    const box = new Graphics()
      .roundRect(-30, -26, 60, 52, 9)
      .fill(COLORS.producer)
      .moveTo(-30, -10)
      .lineTo(30, -10)
      .stroke({ width: 3, color: 0x7a4a00, alpha: 0.6 });
    const key = this.text(record.key ?? "∅", 13, 0x2a1800, true, "700");
    key.anchor.set(0.5);
    key.position.set(0, 7);
    if (key.width > 54) key.scale.set(54 / key.width);
    c.addChild(box, key);
    return c;
  }

  private makeStamp(offset: number) {
    const c = new Container();
    const label = this.text(String(offset), 14, COLORS.bg, true, "700");
    label.anchor.set(0.5);
    const w = Math.max(26, label.width + 12);
    const bg = new Graphics().roundRect(-w / 2, -11, w, 22, 11).fill(COLORS.partition);
    c.addChild(bg, label);
    c.position.set(0, 36);
    return c;
  }

  private slotX(belt: Belt, offset: number) {
    return BELT.x + SLOT.first + (offset - belt.viewStart) * SLOT.step;
  }

  /** Formula callout: the abstract layer of the key → partition mapping. */
  private async showHash(record: SimRecord) {
    const label = record.key === null
      ? `key = null → sticky → P${record.partition}`
      : `murmur2("${record.key}") % ${this.topic.numPartitions} = ${record.partition}`;
    const t = this.text(label, 17, COLORS.text, true, "600");
    t.anchor.set(0.5);
    t.position.set(DOCK.x, DOCK.y - 100);
    t.alpha = 0;
    this.world.addChild(t);
    await this.tweens.to(t, { alpha: 1, y: DOCK.y - 110 }, 180);
    await wait(900);
    await this.tweens.to(t, { alpha: 0 }, 300);
    t.destroy();
  }

  async handle(event: SimEvent) {
    if (event.type !== "appended" || event.topic !== this.topic.name) return;
    const record = event.record;
    const belt = this.belts[record.partition];
    void this.showHash(record);

    // Scroll the belt window when the log outgrows the visible slots
    if (record.offset - belt.viewStart >= VISIBLE_SLOTS) {
      belt.viewStart = record.offset - VISIBLE_SLOTS + 1;
      for (const [off, parcel] of belt.parcels) {
        if (off < belt.viewStart) {
          belt.parcels.delete(off);
          void this.tweens.to(parcel, { alpha: 0, x: parcel.x - SLOT.step }, 300).then(() => parcel.destroy());
        } else {
          void this.tweens.to(parcel, { x: this.slotX(belt, off) }, 300, easeInOutCubic);
        }
      }
    }

    const parcel = this.makeParcel(record);
    parcel.position.set(DOCK.x, DOCK.y - 10);
    parcel.scale.set(0.2);
    this.world.addChild(parcel);
    belt.parcels.set(record.offset, parcel);

    void this.tweens.to(parcel.scale, { x: 1, y: 1 }, 220, easeOutBack);
    await this.tweens.to(parcel, { x: BELT.x - 10, y: belt.y }, 380, easeInOutCubic);
    await this.tweens.to(parcel, { x: this.slotX(belt, record.offset) }, 320, easeInOutCubic);
    if (parcel.destroyed) return;

    // Land: squash & stretch, stamp pop, partition glow (signaling)
    parcel.scale.set(1.18, 0.82);
    void this.tweens.to(parcel.scale, { x: 1, y: 1 }, 160, easeOutBack);
    const stamp = this.makeStamp(record.offset);
    stamp.scale.set(0);
    parcel.addChild(stamp);
    void this.tweens.to(stamp.scale, { x: 1, y: 1 }, 220, easeOutBack);
    belt.glow.alpha = 1;
    void this.tweens.to(belt.glow, { alpha: 0 }, 600);
    this.onLanded(record);
  }

  destroy() {
    this.world.destroy({ children: true });
  }
}
