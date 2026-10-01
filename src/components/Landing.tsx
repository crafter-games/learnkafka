"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Eye, Lightning, Play, Target } from "@phosphor-icons/react";
import { Link, useRouter } from "@/i18n/navigation";
import { audioBus } from "@/audio/audioBus";
import { backgroundMusic } from "@/audio/music";
import { AudioDirector } from "./AudioDirector";
import { Hud } from "./Hud";
import { gameButtonClass } from "./ui/GameButton";
import { Keycap } from "./ui/Keycap";
import { Logo } from "./ui/Logo";

const KEY_TAPES = ["#f472b6", "#a3e635", "#60a5fa", "#fb923c"];

function begin() {
  audioBus().play("click", { bus: "ui", rate: 1 });
  void backgroundMusic().start();
}

/** A looping "game screenshot": parcels appended to three partition belts. */
function HeroMonitor() {
  const belts = [
    [0, 2, 0, 1],
    [1, 3, 3],
    [2, 0, 2, 2, 1],
  ];
  return (
    <div className="panel relative w-full max-w-xl rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between font-mono text-xs text-muted">
        <span className="text-partition">topic: orders</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 animate-pulse-dot rounded-full bg-broker" /> live
        </span>
      </div>
      <svg viewBox="0 0 560 250" className="w-full" aria-hidden="true">
        {belts.map((tapes, p) => {
          const y = 42 + p * 82;
          return (
            <g key={p}>
              <rect x="56" y={y - 30} width="496" height="60" rx="14" fill="#0b1226" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="2" />
              {Array.from({ length: 7 }, (_, s) => (
                <rect key={s} x={74 + s * 66} y={y - 20} width="52" height="40" rx="8" fill="none" stroke="#22d3ee" strokeOpacity="0.12" strokeDasharray="4 4" />
              ))}
              <text x="10" y={y + 7} fill="#22d3ee" fontFamily="var(--font-display)" fontSize="22" fontWeight="700">
                P{p}
              </text>
              {tapes.map((tape, o) => (
                <motion.g
                  key={o}
                  initial={{ x: -90, y: -30, opacity: 0, scale: 0.6 }}
                  animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  transition={{
                    delay: 0.5 + o * 0.9 + p * 0.3,
                    duration: 0.55,
                    ease: [0.34, 1.56, 0.64, 1],
                    repeat: Infinity,
                    repeatDelay: 6 - o * 0.9,
                  }}
                  style={{ originX: `${100 + o * 66}px`, originY: `${y}px` }}
                >
                  <rect x={74 + o * 66} y={y - 20} width="52" height="40" rx="8" fill="#ffb020" />
                  <rect x={74 + o * 66} y={y - 8} width="52" height="6" fill={KEY_TAPES[tape]} />
                  <rect x={88 + o * 66} y={y + 14} width="24" height="16" rx="8" fill="#22d3ee" />
                  <text x={100 + o * 66} y={y + 26} textAnchor="middle" fill="#0b1020" fontFamily="var(--font-code)" fontSize="11" fontWeight="700">
                    {o}
                  </text>
                </motion.g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute -bottom-5 left-6 rotate-[-4deg] rounded-xl bg-consumer px-3 py-1.5 font-display text-sm font-semibold text-bg shadow-[0_4px_0_#6d4fd1]">
        murmur2(key) % 3
      </div>
    </div>
  );
}

function Skyline() {
  // Decorative city silhouette (landing only — never on learning screens)
  const buildings = [
    [0, 70], [50, 120], [110, 90], [160, 150], [220, 80], [270, 130], [330, 100], [390, 170], [450, 95],
    [500, 140], [560, 85], [610, 125], [670, 160], [730, 90], [780, 135], [840, 110], [900, 150], [960, 80],
  ];
  return (
    <svg viewBox="0 0 1020 180" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-60" aria-hidden="true">
      {buildings.map(([x, h], i) => (
        <g key={i}>
          <rect x={x} y={180 - h} width="54" height={h} fill="#0f1630" />
          {Array.from({ length: Math.floor(h / 28) }, (_, w) => (
            <rect key={w} x={x + 10 + (w % 2) * 20} y={190 - h + w * 24} width="10" height="8" rx="2" fill={w % 3 === 0 ? "#ffb020" : "#22d3ee"} opacity={w % 3 === 0 ? 0.5 : 0.18} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function Landing() {
  const t = useTranslations("landing");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        begin();
        router.push("/play");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const features = [
    { key: "visual", Icon: Eye, color: "text-partition" },
    { key: "predict", Icon: Target, color: "text-consumer" },
    { key: "real", Icon: Lightning, color: "text-producer" },
  ] as const;

  return (
    <main className="world-bg relative flex min-h-dvh flex-col overflow-hidden px-4 sm:px-8">
      <AudioDirector intensity={0} />
      <Skyline />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between pt-5">
        <Logo />
        <Hud />
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-12 py-12 lg:flex-row lg:justify-between">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-xl text-center lg:text-left"
        >
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-broker/30 bg-broker/10 px-3.5 py-1.5 font-display text-sm font-semibold text-broker">
            <span className="size-2 animate-pulse-dot rounded-full bg-broker" />
            {t("kicker")}
          </span>
          <h1 className="mt-5 font-display text-6xl font-bold leading-[0.95] tracking-tight sm:text-8xl">
            Kafka
            <br />
            <span className="text-producer drop-shadow-[0_6px_0_var(--producer-dark)]">Express</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted sm:text-xl">{t("tagline")}</p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
            <Link href="/play" onClick={begin} className={gameButtonClass({ variant: "primary", size: "lg" })}>
              <Play weight="fill" />
              {t("start")}
              <Keycap className="ml-1 text-[#2a1800]">Enter</Keycap>
            </Link>
          </div>

          <ul className="mt-10 grid gap-3 sm:grid-cols-3">
            {features.map(({ key, Icon, color }, i) => (
              <motion.li
                key={key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.06, duration: 0.35 }}
                className="panel flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
              >
                <Icon size={26} weight="duotone" className={`shrink-0 ${color}`} />
                <span className="text-sm font-semibold leading-snug">{t(`facts.${key}`)}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-xl animate-float"
        >
          <HeroMonitor />
        </motion.div>
      </div>
    </main>
  );
}
