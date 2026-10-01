"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CheckCircle, Circle, Lightbulb, PaperPlaneTilt, Prohibit, Trophy } from "@phosphor-icons/react";
import { Topic } from "@/sim/topic";
import type { SimRecord } from "@/sim/events";
import { audioBus } from "@/audio/audioBus";
import { backgroundMusic, type Intensity } from "@/audio/music";
import { Link } from "@/i18n/navigation";
import { keyColor } from "@/stage/keyColors";
import { AudioDirector } from "./AudioDirector";
import { BeltCanvas } from "./BeltCanvas";
import { Hud } from "./Hud";
import { gameButtonClass } from "./ui/GameButton";
import { Keycap } from "./ui/Keycap";

const CUSTOMERS = ["alice", "bob", "carol", "dave", "erin"];
const PARTITIONS = 3;
const RUSH = { sends: 4, windowMs: 3000, holdMs: 6000 }; // tune
const INSIGHT_MS = 5200;

type ObjectiveId = "send5" | "sameKey" | "noKey" | "allBelts";
const OBJECTIVES: ObjectiveId[] = ["send5", "sameKey", "noKey", "allBelts"];

declare global {
  interface Window {
    __TEST__?: Record<string, unknown>;
  }
}

export function DispatchDesk() {
  const t = useTranslations("play");
  const ts = useTranslations("stage");
  const topic = useMemo(() => new Topic("orders", PARTITIONS), []);
  const [counts, setCounts] = useState<number[]>(() => Array(PARTITIONS).fill(0));
  const [customKey, setCustomKey] = useState("");
  const [done, setDone] = useState<Record<ObjectiveId, boolean>>({ send5: false, sameKey: false, noKey: false, allBelts: false });
  const [insight, setInsight] = useState<ObjectiveId | null>(null);
  const [intensity, setIntensity] = useState<Intensity>(1);
  const doneRef = useRef(done);
  const seen = useRef<Record<string, number>>({});
  const sentAt = useRef<number[]>([]);
  const rushTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const insightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sent = counts.reduce((a, b) => a + b, 0);
  const doneCount = OBJECTIVES.filter((o) => done[o]).length;
  const allDone = doneCount === OBJECTIVES.length;

  const complete = useCallback((id: ObjectiveId) => {
    if (doneRef.current[id]) return;
    doneRef.current = { ...doneRef.current, [id]: true };
    setDone(doneRef.current);
    audioBus().play("unlock", { bus: "ui", rate: 1 });
    setInsight(id);
    // Explanations duck the music so the player can read (seductive-details rule)
    backgroundMusic().duck(true);
    clearTimeout(insightTimer.current);
    insightTimer.current = setTimeout(() => {
      setInsight(null);
      backgroundMusic().duck(false);
    }, INSIGHT_MS);
  }, []);

  useEffect(() => {
    const bus = audioBus();
    bus.preload();
    const off = topic.events.on((e) => bus.handleSimEvent(e));
    window.__TEST__ = {
      endOffsets: () => topic.endOffsets(),
      partitions: () => topic.partitions,
      produce: (key: string | null) => topic.produce(key, `order-${Date.now()}`),
      musicStarted: () => backgroundMusic().started,
    };
    return () => {
      off();
      delete window.__TEST__;
      clearTimeout(rushTimer.current);
      clearTimeout(insightTimer.current);
      backgroundMusic().duck(false);
    };
  }, [topic]);

  const send = useCallback(
    (key: string | null) => {
      topic.produce(key, `order-${Date.now()}`);
      if (key === null) complete("noKey");
      else {
        const n = (seen.current[key] ?? 0) + 1;
        seen.current[key] = n;
        if (n === 2) complete("sameKey");
      }
      // Rush hour: many sends in a short window raises the music intensity
      const now = Date.now();
      sentAt.current = [...sentAt.current.filter((at) => now - at < RUSH.windowMs), now];
      if (sentAt.current.length >= RUSH.sends) {
        setIntensity(2);
        clearTimeout(rushTimer.current);
        rushTimer.current = setTimeout(() => setIntensity(1), RUSH.holdMs);
      }
    },
    [topic, complete],
  );

  const onLanded = useCallback((r: SimRecord) => {
    audioBus().play("stamp");
    setCounts((c) => c.map((n, i) => (i === r.partition ? Math.max(n, r.offset + 1) : n)));
  }, []);

  useEffect(() => {
    if (sent >= 5) complete("send5");
    if (counts.every((n) => n > 0)) complete("allBelts");
  }, [counts, sent, complete]);

  // Keyboard: 1–5 sends a customer, 0 sends a null key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || e.repeat) return;
      const i = Number(e.key);
      if (i >= 1 && i <= CUSTOMERS.length) send(CUSTOMERS[i - 1]);
      if (e.key === "0") send(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);

  const labels = useMemo(
    () => ({
      producer: ts("producer"),
      topic: (name: string) => ts("topic", { name }),
      partition: (n: number) => ts("partition", { n }),
      next: (n: number) => ts("next", { n }),
    }),
    [ts],
  );

  const maxCount = Math.max(4, ...counts);

  return (
    <main className="world-bg flex h-dvh flex-col overflow-hidden">
      <AudioDirector intensity={intensity} />

      {/* HUD */}
      <header className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-5 [@media(max-height:560px)]:pt-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label={t("back")} className={gameButtonClass({ size: "icon" })}>
            <ArrowLeft />
          </Link>
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-partition">{t("level")}</p>
            <h1 className="truncate font-display text-xl font-bold leading-tight sm:text-2xl">{t("title")}</h1>
          </div>
        </div>
        <Hud />
      </header>

      <div className="relative flex min-h-0 flex-1 gap-4 px-3 py-3 sm:px-5 [@media(max-height:560px)]:py-2">
        {/* Mission card */}
        <aside className="panel hidden w-72 shrink-0 flex-col rounded-3xl p-5 lg:flex" aria-label={t("mission")}>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-producer">{t("mission")}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("missionText")}</p>
          <ol className="mt-5 space-y-3">
            {OBJECTIVES.map((id) => (
              <li key={id} className={`flex items-start gap-2.5 text-sm font-semibold transition-colors ${done[id] ? "text-broker" : "text-text"}`}>
                <motion.span
                  key={String(done[id])}
                  initial={done[id] ? { scale: 0.3, rotate: -30 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 14 }}
                  className="mt-px"
                >
                  {done[id] ? <CheckCircle size={20} weight="fill" /> : <Circle size={20} weight="bold" className="text-muted" />}
                </motion.span>
                <span className={done[id] ? "opacity-80" : ""}>
                  {t(`objectives.${id}`)}
                  {id === "send5" && !done.send5 && <span className="ml-1 font-mono text-xs text-muted">({Math.min(sent, 5)}/5)</span>}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-2xl border-2 border-line bg-bg-deep/50 p-3.5">
            <p className="mb-2.5 font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">{t("controls.title")}</p>
            <ul className="space-y-2 text-sm text-text/90">
              <li className="flex items-center gap-2"><Keycap>1</Keycap>–<Keycap>5</Keycap><span>{t("controls.customers")}</span></li>
              <li className="flex items-center gap-2"><Keycap>0</Keycap><span>{t("controls.noKey")}</span></li>
              <li className="flex items-center gap-2"><Keycap>M</Keycap><span>{t("controls.music")}</span></li>
              <li className="flex items-center gap-2"><Keycap>⇧M</Keycap><span>{t("controls.sfx")}</span></li>
            </ul>
          </div>
          <div className="mt-auto pt-6">
            <div className="mb-1.5 flex justify-between font-display text-xs font-semibold text-muted">
              <span>{t("progress")}</span>
              <span>
                {doneCount}/{OBJECTIVES.length}
              </span>
            </div>
            <div className="h-3.5 overflow-hidden rounded-full border-2 border-line bg-bg-deep">
              <motion.div
                className="h-full rounded-full bg-broker"
                animate={{ width: `${(doneCount / OBJECTIVES.length) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              />
            </div>
          </div>
        </aside>

        {/* Stage */}
        <section className="panel relative min-w-0 flex-1 overflow-hidden rounded-3xl" data-testid="stage">
          <BeltCanvas topic={topic} labels={labels} onLanded={onLanded} />

          {/* Compact mission progress when the side card is hidden */}
          <div className="absolute left-3 top-3 rounded-full border-2 border-line bg-bg/80 px-3 py-1 font-display text-xs font-semibold text-muted backdrop-blur lg:hidden">
            {t("mission")} · <span className="text-broker">{doneCount}/{OBJECTIVES.length}</span>
          </div>

          <AnimatePresence>
            {insight && (
              <motion.div
                key={insight}
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className="absolute inset-x-3 top-3 mx-auto flex max-w-xl items-start gap-3 rounded-2xl border-2 border-partition/40 bg-bg/90 p-3.5 shadow-[0_6px_0_var(--bg-deep)] backdrop-blur sm:p-4"
                role="status"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-partition text-bg">
                  <Lightbulb size={20} weight="fill" />
                </span>
                <span>
                  <span className="block font-display text-base font-bold text-partition">{t(`insights.${insight}.title`)}</span>
                  <span className="block text-sm leading-snug text-text/90">{t(`insights.${insight}.body`)}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {allDone && !insight && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="absolute inset-x-3 top-3 mx-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-broker/50 bg-bg/90 p-4 shadow-[0_6px_0_var(--bg-deep)] backdrop-blur"
                role="status"
              >
                <Trophy size={32} weight="duotone" className="shrink-0 text-producer" />
                <span>
                  <span className="block font-display text-lg font-bold text-broker">{t("complete.title")}</span>
                  <span className="block text-sm text-muted">{t("complete.body")}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Dispatch dock */}
      <footer className="px-3 pb-3 sm:px-5 [@media(max-height:560px)]:pb-2">
        <div className="panel flex items-center justify-between gap-x-6 gap-y-3 rounded-3xl px-4 py-3 sm:px-5 lg:flex-wrap [@media(max-height:560px)]:py-2">
          <div className="-my-2 flex min-w-0 items-center gap-2 overflow-x-auto py-2 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
            <span className="mr-1 font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted [@media(max-height:560px)]:sr-only">
              {t("customers")}
            </span>
            {CUSTOMERS.map((c, i) => (
              <button key={c} type="button" onClick={() => send(c)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 pl-2`} aria-label={t("sendTo", { key: c })}>
                <span className="flex h-7 w-6 flex-col justify-center overflow-hidden rounded-md bg-producer" aria-hidden>
                  <span className="h-1.5 w-full" style={{ background: keyColor(c) }} />
                </span>
                <span className="font-mono font-bold">{c}</span>
                <Keycap className="text-muted max-md:hidden">{i + 1}</Keycap>
              </button>
            ))}
            <button type="button" onClick={() => send(null)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 text-muted`}>
              <Prohibit size={18} weight="bold" />
              <span className="font-mono font-bold">{t("noKey")}</span>
              <Keycap className="max-md:hidden">0</Keycap>
            </button>
            <form
              className="flex shrink-0 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const k = customKey.trim();
                if (k) send(k.slice(0, 24));
              }}
            >
              <label htmlFor="custom-key" className="sr-only">
                {t("custom")}
              </label>
              <input
                id="custom-key"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder={t("custom")}
                maxLength={24}
                autoComplete="off"
                className="h-10 w-36 rounded-2xl border-2 border-line bg-bg-deep/70 px-3.5 font-mono text-sm font-semibold outline-none transition focus:border-partition"
              />
              <button type="submit" className={gameButtonClass({ variant: "accent", size: "sm" })} aria-label={t("send")}>
                <PaperPlaneTilt size={18} weight="fill" />
                <span className="hidden sm:inline">{t("send")}</span>
              </button>
            </form>
          </div>

          <div className="flex shrink-0 items-end gap-3 max-sm:hidden [@media(max-height:560px)]:hidden" aria-live="polite" aria-label={t("stats")}>
            {counts.map((n, p) => (
              <div key={p} className="flex flex-col items-center gap-1">
                <div className="flex h-10 w-7 items-end overflow-hidden rounded-lg border-2 border-line bg-bg-deep [@media(max-height:560px)]:h-7">
                  <motion.div className="w-full rounded-md bg-partition" animate={{ height: `${(n / maxCount) * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 20 }} />
                </div>
                <span className="font-mono text-xs font-bold text-partition">
                  P{p}
                  <span className="text-text">·{n}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
