"use client";

import { useEffect, useRef } from "react";
import type { Cluster } from "@/sim/cluster";
import type { SimRecord } from "@/sim/events";
import type { ConsumerSpec, FactoryStage, StageLabels } from "@/stage/factoryStage";

type Props = {
  cluster: Cluster;
  labels: StageLabels;
  slots?: number;
  consumers?: ConsumerSpec[];
  onLanded?: (record: SimRecord) => void;
  onReady?: (stage: FactoryStage) => void;
  className?: string;
};

/** Mounts the Three.js factory diorama for a cluster; the sim drives it through events. */
export function FactoryCanvas({ cluster, labels, slots, consumers, onLanded, onReady, className = "absolute inset-0" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ labels, onLanded, onReady, slots, consumers });
  useEffect(() => {
    latest.current = { labels, onLanded, onReady, slots, consumers };
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
      const { labels, slots, consumers } = latest.current;
      const s = new FactoryStage(el, cluster, labels, { slots, consumers, onLanded: (r) => latest.current.onLanded?.(r) });
      stage = s;
      unsubscribe = cluster.events.on((e) => void s.handle(e));
      void s.ready.then(() => {
        if (cancelled) return;
        el.setAttribute("data-ready", "true");
        latest.current.onReady?.(s);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stage?.dispose();
    };
  }, [cluster]);

  return <div ref={host} className={className} />;
}
