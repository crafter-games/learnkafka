"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Play } from "@phosphor-icons/react";
import { Link, useRouter } from "@/i18n/navigation";
import { audioBus } from "@/audio/audioBus";
import { backgroundMusic } from "@/audio/music";
import { Cluster } from "@/sim/cluster";
import { AudioDirector } from "./AudioDirector";
import { FactoryCanvas } from "./FactoryCanvas";
import { Hud } from "./Hud";
import { gameButtonClass } from "./ui/GameButton";
import { Keycap } from "./ui/Keycap";
import { Logo } from "./ui/Logo";

const ATTRACT_KEYS = ["alice", "bob", "carol", "alice", "dave", "erin", "bob", null, "carol", "alice"];
const ATTRACT_MS = 1400;

function begin() {
  audioBus().play("click", { bus: "ui", rate: 1 });
  void backgroundMusic().start();
}

export function Landing() {
  const t = useTranslations("landing");
  const ts = useTranslations("stage");
  const router = useRouter();
  const cluster = useMemo(() => new Cluster([{ name: "orders", partitions: 3 }]), []);
  const topic = cluster.topic("orders");

  // Attract mode: the hub keeps working in the background (silently)
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (topic.endOffsets().reduce((a, b) => a + b, 0) > 40) return;
      topic.produce(ATTRACT_KEYS[i++ % ATTRACT_KEYS.length], "demo");
    }, ATTRACT_MS);
    return () => clearInterval(id);
  }, [topic]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        begin();
        router.push("/world");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

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

  const steps = ["visual", "predict", "real"] as const;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-ground">
      <AudioDirector intensity={1} />

      <header className="relative z-10 flex items-center justify-between px-4 pt-4 sm:px-6">
        <Logo />
        <Hud />
      </header>

      <div className="relative flex flex-1 flex-col lg:block">
        <div className="relative h-[52vh] lg:absolute lg:inset-y-0 lg:left-[36%] lg:right-0 lg:h-auto">
          <FactoryCanvas cluster={cluster} labels={labels} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="card relative z-10 mx-4 mb-6 max-w-md p-7 sm:mx-6 lg:absolute lg:left-6 lg:top-1/2 lg:mb-0 lg:-translate-y-1/2 lg:p-9"
        >
          <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-producer-dark">{t("kicker")}</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">{t("headline")}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">{t("tagline")}</p>

          <Link href="/world" onClick={begin} className={`${gameButtonClass({ variant: "primary", size: "lg" })} mt-7 w-full sm:w-auto`}>
            <Play weight="fill" />
            {t("start")}
            <Keycap className="ml-1 border-white/30 bg-white/15 text-white shadow-none">Enter</Keycap>
          </Link>

          <ol className="mt-8 space-y-2.5 border-t border-line pt-5 text-base text-ink-2">
            {steps.map((k, i) => (
              <li key={k} className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-bold text-partition">0{i + 1}</span>
                <span>{t(`facts.${k}`)}</span>
              </li>
            ))}
          </ol>
        </motion.div>
      </div>
    </main>
  );
}
