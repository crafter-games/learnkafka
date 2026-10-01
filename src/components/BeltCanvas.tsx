"use client";

import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { BeltStage, type StageLabels } from "@/stage/beltStage";
import { COLORS } from "@/stage/theme";
import type { Topic } from "@/sim/topic";
import type { SimRecord } from "@/sim/events";

type Props = {
  topic: Topic;
  labels: StageLabels;
  onLanded: (record: SimRecord) => void;
};

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function BeltCanvas({ topic, labels, onLanded }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Keep latest callbacks/labels without re-creating the Pixi app
  const latest = useRef({ labels, onLanded });
  useEffect(() => {
    latest.current = { labels, onLanded };
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let stage: BeltStage | null = null;
    let unsubscribe = () => {};
    const app = new Application();

    (async () => {
      await app.init({
        resizeTo: el,
        background: COLORS.bg,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      await document.fonts.ready;
      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }
      el.appendChild(app.canvas);
      app.canvas.setAttribute("aria-hidden", "true");
      stage = new BeltStage(
        app,
        topic,
        { ui: cssVar("--font-display", "system-ui"), mono: cssVar("--font-code", "monospace") },
        latest.current.labels,
        (r) => latest.current.onLanded(r),
      );
      unsubscribe = topic.events.on((e) => void stage?.handle(e));
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      if (stage) {
        stage.destroy();
        app.destroy(true, { children: true });
      }
    };
  }, [topic]);

  return <div ref={host} className="absolute inset-0" />;
}
