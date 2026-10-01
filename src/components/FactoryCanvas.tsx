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
  replicas?: string[];
  memberArms?: boolean;
  controllers?: string[];
  /** Consumer arms when the level has no `consumers` (e.g. transaction readers). */
  consumersOverride?: ConsumerSpec[];
  /** World 7: show segment boundaries (records per segment). */
  segmentSize?: number;
  /** Floating UI covering the canvas (px), so the factory is framed in the free area. */
  insets?: { top?: number; right?: number; bottom?: number; left?: number };
  onLanded?: (record: SimRecord) => void;
  onReady?: (stage: FactoryStage) => void;
  className?: string;
};

/** Mounts the Three.js factory diorama for a cluster; the sim drives it through events. */
export function FactoryCanvas({ cluster, labels, slots, consumers: consumersProp, consumersOverride, segmentSize, replicas, memberArms, controllers, insets, onLanded, onReady, className = "absolute inset-0" }: Props) {
  const consumers = consumersProp ?? consumersOverride;
  const host = useRef<HTMLDivElement>(null);
  const stageRef = useRef<FactoryStage | null>(null);
  const insetKey = JSON.stringify(insets ?? {});
  useEffect(() => {
    stageRef.current?.setInsets(JSON.parse(insetKey));
  }, [insetKey]);
  const latest = useRef({ labels, onLanded, onReady, slots, consumers, replicas, memberArms, controllers, insets, segmentSize });
  useEffect(() => {
    latest.current = { labels, onLanded, onReady, slots, consumers, replicas, memberArms, controllers, insets, segmentSize };
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
      const { labels, slots, consumers, replicas, memberArms, controllers, segmentSize } = latest.current;
      const s = new FactoryStage(el, cluster, labels, { slots, consumers, replicas, memberArms, controllers, segmentSize, onLanded: (r) => latest.current.onLanded?.(r) });
      stage = s;
      stageRef.current = s;
      s.setInsets(JSON.parse(JSON.stringify(latest.current.insets ?? {})));
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
