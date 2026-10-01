"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Play } from "@phosphor-icons/react";
import { useRouter } from "@/i18n/navigation";
import { audioBus } from "@/audio/audioBus";
import { backgroundMusic } from "@/audio/music";
import { Cluster } from "@/sim/cluster";
import { AudioDirector } from "./AudioDirector";
import { FactoryCanvas } from "./FactoryCanvas";
import { Hud } from "./Hud";
import { gameButtonClass } from "./ui/GameButton";
import { Keycap } from "./ui/Keycap";

const ATTRACT_KEYS = ["alice", "bob", "carol", "alice", "dave", "erin", "bob", null, "carol", "alice", "frank", "dave"];
const ATTRACT_MS = 900;
const IRIS_MS = 650;

export function Landing() {
  const t = useTranslations("landing");
  const ts = useTranslations("stage");
  const router = useRouter();
  const cluster = useMemo(() => new Cluster([{ name: "orders", partitions: 4 }]), []);
  const topic = cluster.topic("orders");
  // Where the iris transition grows from (the button), in px; null = idle
  const [iris, setIris] = useState<{ x: number; y: number } | null>(null);
  const [vh, setVh] = useState(800);

  // Attract mode: the hub keeps working in the background (silently)
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (topic.endOffsets().reduce((a, b) => a + b, 0) > 60) return;
      topic.produce(ATTRACT_KEYS[i++ % ATTRACT_KEYS.length], "demo");
    }, ATTRACT_MS);
    return () => clearInterval(id);
  }, [topic]);

  const start = useCallback(
    (from?: HTMLElement | null) => {
      if (iris) return;
      audioBus().play("unlock", { bus: "ui", rate: 1 });
      void backgroundMusic().start();
      const r = from?.getBoundingClientRect();
      setVh(window.innerHeight);
      setIris(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      router.prefetch("/world");
      setTimeout(() => router.push("/world"), IRIS_MS);
    },
    [iris, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        start(document.getElementById("start-shift"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  const labels = useMemo(
    () => ({
      producer: ts("producer"),
      partitioner: ts("partitioner"),
      topic: (name: string) => ts("topic", { name }),
      partition: (n: number) => ts("partition", { n }),
      next: (n: number) => ts("next", { n }),
    }),
    [ts],
  );

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ground">
      <AudioDirector intensity={1} />

      {/* The live factory is the backdrop; framed in the lower part so the title reads above it */}
      <div className="absolute inset-0">
        <FactoryCanvas cluster={cluster} labels={labels} insets={{ top: vh * 0.34, bottom: 24, left: 12, right: 12 }} />
      </div>
      {/* Soft light behind the title + gentle edge vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 42% at 50% 24%, color-mix(in oklab, var(--ground) 92%, transparent) 0%, color-mix(in oklab, var(--ground) 55%, transparent) 55%, transparent 100%), radial-gradient(ellipse 120% 90% at 50% 60%, transparent 60%, color-mix(in oklab, var(--ink) 18%, transparent) 100%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-end px-4 pt-4 sm:px-6">
        <Hud />
      </header>

      <section className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-[6vh] text-center sm:pt-[8vh]">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-full bg-ink px-3.5 py-1.5 font-display text-xs font-bold uppercase tracking-[0.16em] text-paper"
        >
          {t("kicker")}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
          className="mt-4 font-display text-[clamp(3rem,10vw,6.5rem)] font-extrabold leading-[0.9] tracking-tight text-ink [text-shadow:0_4px_0_var(--paper)]"
        >
          Kafka <span className="text-producer [text-shadow:0_4px_0_var(--producer-dark)]">Express</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-4 max-w-xl text-lg font-semibold leading-snug text-ink sm:text-xl">
          {t("headline")}
        </motion.p>

        <motion.button
          id="start-shift"
          type="button"
          onClick={(e) => start(e.currentTarget)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, scale: [1, 1.04, 1] }}
          transition={{ delay: 0.5, scale: { repeat: Infinity, duration: 1.6, ease: "easeInOut", delay: 1.2 } }}
          className={`${gameButtonClass({ variant: "primary", size: "lg" })} mt-8 h-16 px-10 text-2xl`}
        >
          <Play weight="fill" />
          {t("start")}
          <Keycap className="ml-1 border-white/30 bg-white/15 text-white shadow-none max-sm:hidden">Enter</Keycap>
        </motion.button>
      </section>

      <p className="absolute bottom-3 left-1/2 z-10 w-[calc(100%-32px)] -translate-x-1/2 text-center text-xs text-ink-2 sm:left-auto sm:right-4 sm:w-auto sm:translate-x-0 sm:text-right">
        {t("credits")}{" "}
        <a href="https://github.com/crafter-games/learnkafka/blob/main/CREDITS.md" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2 hover:text-ink">
          CREDITS.md
        </a>
      </p>

      {/* Iris wipe into the world map */}
      {iris && (
        <motion.div
          aria-hidden
          className="fixed inset-0 z-50 bg-ink"
          initial={{ clipPath: `circle(0px at ${iris.x}px ${iris.y}px)` }}
          animate={{ clipPath: `circle(150vmax at ${iris.x}px ${iris.y}px)` }}
          transition={{ duration: IRIS_MS / 1000, ease: [0.7, 0, 0.84, 0] }}
        />
      )}
    </main>
  );
}
