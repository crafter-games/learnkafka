"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ArrowRight, Check, LockSimple, Package, Star } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { WORLDS } from "@/levels";
import { isUnlocked, useProgress } from "@/learning/progress";
import { AudioDirector } from "./AudioDirector";
import { Hud } from "./Hud";
import { Text } from "./level/parts";
import { gameButtonClass } from "./ui/GameButton";
import { Logo } from "./ui/Logo";

const UPCOMING = [2, 3, 4] as const;
const noop = () => () => {};

export function WorldMap() {
  const t = useTranslations("map");
  const levels = useProgress((s) => s.levels);
  // Progress lives in localStorage: render lock state only after mount to avoid a hydration mismatch
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const world = WORLDS[0];
  const next = mounted ? world.levels.find((l) => isUnlocked(levels, l.id) && !(levels[l.id]?.stars > 0)) : undefined;

  return (
    <main className="relative min-h-dvh bg-ground">
      <AudioDirector intensity={0} />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-4 sm:px-6">
        <Link href="/" aria-label={t("home")}>
          <Logo />
        </Link>
        <Hud />
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-producer-dark">{t("world", { n: world.id })}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("w1.title")}</h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-ink-2">{t("w1.body")}</p>

        <ol className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {world.levels.map((l, i) => {
            const unlocked = mounted && isUnlocked(levels, l.id);
            const stars = levels[l.id]?.stars ?? 0;
            const current = next?.id === l.id;
            return (
              <motion.li key={l.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
                <div className={`card relative flex h-full flex-col p-5 ${current ? "ring-2 ring-producer" : ""} ${unlocked ? "" : "opacity-60"}`}>
                  <div className="flex items-center justify-between">
                    <span
                      className={`grid size-10 place-items-center rounded-xl font-display text-lg font-extrabold ${stars > 0 ? "bg-broker text-white" : unlocked ? "bg-partition text-white shadow-[0_3px_0_var(--partition-dark)]" : "bg-ink/10 text-ink-2"}`}
                    >
                      {stars > 0 ? <Check weight="bold" /> : unlocked ? i + 1 : <LockSimple weight="bold" size={18} />}
                    </span>
                    <span className="flex gap-0.5" aria-label={t("stars", { n: stars })}>
                      {[1, 2, 3].map((n) => (
                        <Star key={n} size={18} weight="fill" className={n <= stars ? "text-producer" : "text-ink/12"} />
                      ))}
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-lg font-extrabold leading-tight">
                    <Text m={l.title} />
                  </h2>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-2">
                    <Text m={l.summary} />
                  </p>
                  {unlocked ? (
                    <Link href={`/level/${l.id}`} className={`${gameButtonClass({ variant: current ? "primary" : "secondary", size: "sm" })} mt-4`}>
                      {stars > 0 ? t("replay") : t("play")}
                      <ArrowRight weight="bold" />
                    </Link>
                  ) : (
                    <p className="mt-4 text-xs font-semibold text-ink-2">{t("locked")}</p>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_2fr]">
          <Link href="/play" className="card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-producer text-white shadow-[0_3px_0_var(--producer-dark)]">
              <Package size={26} weight="fill" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg font-extrabold">{t("sandbox.title")}</span>
              <span className="text-sm text-ink-2">{t("sandbox.body")}</span>
            </span>
            <ArrowRight weight="bold" className="text-ink-2 transition group-hover:translate-x-1" />
          </Link>
          <div className="grid gap-3 sm:grid-cols-3">
            {UPCOMING.map((n) => (
              <div key={n} className="rounded-[20px] border border-dashed border-ink/20 p-4">
                <p className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-2">{t("world", { n })}</p>
                <p className="mt-1 font-display font-bold text-ink/70">{t(`w${n}`)}</p>
                <p className="mt-1 text-xs text-ink-2">{t("soon")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
