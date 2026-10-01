"use client";

import { useEffect, useRef } from "react";
import type { Topic } from "@/sim/topic";
import type { SimRecord } from "@/sim/events";
import type { FactoryStage, StageLabels } from "@/stage/factoryStage";

type Props = {
  topic: Topic;
  labels: StageLabels;
  onLanded?: (record: SimRecord) => void;
  className?: string;
};

/** Mounts the Three.js factory diorama for a topic; the sim drives it through events. */
export function FactoryCanvas({ topic, labels, onLanded, className = "absolute inset-0" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ labels, onLanded });
  useEffect(() => {
    latest.current = { labels, onLanded };
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stage: FactoryStage | null = null;
    let unsubscribe = () => {};
    let cancelled = false;

    // three.js is client-only and heavy: load it after first paint
    void import("@/stage/factoryStage").then(({ FactoryStage }) => {
      if (cancelled) return;
      stage = new FactoryStage(el, topic, latest.current.labels, (r) => latest.current.onLanded?.(r));
      unsubscribe = topic.events.on((e) => void stage?.handle(e));
      void stage.ready.then(() => el.setAttribute("data-ready", "true"));
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stage?.dispose();
    };
  }, [topic]);

  return <div ref={host} className={className} />;
}
