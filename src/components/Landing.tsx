"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Link } from "@/i18n/navigation";
import { audioBus } from "@/audio/audioBus";
import { Hud } from "./Hud";

const BELTS = [0, 1, 2];

/** Decorative hero: three partitions with parcels being appended. */
function HeroBelts() {
  return (
    <svg viewBox="0 0 600 240" className="w-full max-w-xl" aria-hidden="true">
      {BELTS.map((p) => {
        const y = 40 + p * 80;
        return (
          <g key={p}>
            <rect x="60" y={y - 24} width="520" height="48" rx="12" fill="#0f1630" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="2" />
            <text x="22" y={y + 6} fill="#22d3ee" fontFamily="var(--font-code)" fontSize="18" fontWeight="700">
              P{p}
            </text>
            {[0, 1, 2, 3].map((o) => (
              <motion.g
                key={o}
                initial={{ x: -60, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4 + o * 0.5 + p * 0.22, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
              >
                <rect x={84 + o * 64} y={y - 16} width="48" height="32" rx="6" fill="#ffb020" />
                <rect x={96 + o * 64} y={y + 18} width="24" height="14" rx="7" fill="#22d3ee" />
                <text x={108 + o * 64} y={y + 29} textAnchor="middle" fill="#0b1020" fontFamily="var(--font-code)" fontSize="10" fontWeight="700">
                  {o}
                </text>
              </motion.g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function Landing() {
  const t = useTranslations("landing");

  return (
    <main className="grid-bg relative flex min-h-dvh flex-col px-4 sm:px-8">
      <div className="flex justify-end pt-4">
        <Hud />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 py-10 lg:flex-row lg:justify-between">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-lg text-center lg:text-left"
        >
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-partition">{t("kicker")}</p>
          <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
            {t("title").split(" ")[0]} <span className="text-producer">{t("title").split(" ")[1]}</span>
          </h1>
          <p className="mt-5 text-lg text-muted">{t("tagline")}</p>

          <Link
            href="/play"
            onClick={() => audioBus().play("click", { bus: "ui", rate: 1 })}
            className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-producer px-7 py-4 text-lg font-bold text-bg shadow-[0_0_40px_-8px] shadow-producer/60 transition hover:-translate-y-0.5 hover:shadow-producer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-producer"
          >
            {t("start")} <span aria-hidden>→</span>
          </Link>

          <ul className="mt-8 flex flex-wrap justify-center gap-2 text-sm lg:justify-start">
            {(["visual", "predict", "real"] as const).map((k) => (
              <li key={k} className="rounded-full border border-white/10 bg-panel/70 px-3 py-1 text-muted">
                {t(`facts.${k}`)}
              </li>
            ))}
          </ul>
        </motion.div>

        <HeroBelts />
      </div>
    </main>
  );
}
