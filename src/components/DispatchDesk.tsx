"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CheckCircle, Circle, PaperPlaneTilt, Prohibit, Trophy } from "@phosphor-icons/react";
import { Cluster } from "@/sim/cluster";
import type { SimRecord } from "@/sim/events";
import { audioBus } from "@/audio/audioBus";
import { backgroundMusic, type Intensity } from "@/audio/music";
import { Link } from "@/i18n/navigation";
import { keyColor } from "@/stage/keyColors";
import { AudioDirector } from "./AudioDirector";
import { FactoryCanvas } from "./FactoryCanvas";
import { Hud } from "./Hud";
import { gameButtonClass } from "./ui/GameButton";
import { Keycap } from "./ui/Keycap";
import { Backdrop } from "./ui/Backdrop";

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
  const cluster = useMemo(() => new Cluster([{ name: "orders", partitions: PARTITIONS }]), []);
  const topic = cluster.topic("orders");
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
      partitioner: ts("partitioner"),
      topic: (name: string) => ts("topic", { name }),
      partition: (n: number) => ts("partition", { n }),
      next: (n: number) => ts("next", { n }),
    }),
    [ts],
  );

  const maxCount = Math.max(4, ...counts);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden isolate bg-scene">
      <Backdrop />
      <AudioDirector intensity={intensity} />

      {/* HUD */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pt-3 sm:px-5 [@media(max-height:560px)]:pt-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/world" aria-label={t("back")} className={gameButtonClass({ size: "icon" })}>
            <ArrowLeft weight="bold" />
          </Link>
          <div className="min-w-0 leading-tight">
            <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("level")}</p>
            <h1 className="truncate font-display text-xl font-extrabold tracking-tight sm:text-2xl">{t("title")}</h1>
          </div>
        </div>
        <Hud />
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Mission card */}
        <aside className="card z-10 m-3 mr-0 hidden w-80 shrink-0 flex-col self-start p-5 sm:ml-5 lg:flex" aria-label={t("mission")}>
          <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-producer-dark">{t("mission")}</p>
          <p className="mt-1.5 text-base leading-relaxed text-ink-2">{t("missionText")}</p>
          <ol className="mt-4 space-y-2.5">
            {OBJECTIVES.map((id) => (
              <li key={id} className={`flex items-start gap-2.5 text-base font-semibold ${done[id] ? "text-broker" : "text-ink"}`}>
                <motion.span
                  key={String(done[id])}
                  initial={done[id] ? { scale: 0.3 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  className="mt-px"
                >
                  {done[id] ? <CheckCircle size={20} weight="fill" /> : <Circle size={20} weight="bold" className="text-ink/25" />}
                </motion.span>
                <span>
                  {t(`objectives.${id}`)}
                  {id === "send5" && !done.send5 && <span className="ml-1 font-mono text-xs text-ink-2">{Math.min(sent, 5)}/5</span>}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-paper-2">
            <motion.div
              className="h-full rounded-full bg-broker"
              animate={{ width: `${(doneCount / OBJECTIVES.length) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          </div>
          <dl className="mt-5 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-2 border-t border-line pt-4 text-sm text-ink-2">
            <dt className="flex gap-1">
              <Keycap>1</Keycap>
              <Keycap>5</Keycap>
            </dt>
            <dd>{t("controls.customers")}</dd>
            <dt>
              <Keycap>0</Keycap>
            </dt>
            <dd>{t("controls.noKey")}</dd>
            <dt className="flex gap-1">
              <Keycap>M</Keycap>
              <Keycap>⇧M</Keycap>
            </dt>
            <dd>
              {t("controls.music")} · {t("controls.sfx")}
            </dd>
          </dl>
        </aside>

        {/* Factory floor */}
        <section className="relative min-w-0 flex-1" data-testid="stage">
          <FactoryCanvas cluster={cluster} labels={labels} onLanded={onLanded} />

          <div className="card absolute left-3 top-2 px-3 py-1.5 font-display text-xs font-bold text-ink-2 lg:hidden">
            {t("mission")} · <span className="text-broker">{doneCount}/{OBJECTIVES.length}</span>
          </div>

          {/* Oopi, the hub's guide bot, explains each discovery */}
          <AnimatePresence>
            {(insight || allDone) && (
              <motion.div
                key={insight ?? "done"}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="absolute inset-x-3 top-2 mx-auto flex max-w-xl items-end gap-2"
                role="status"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/sprites/oopi.png" alt="" width={72} height={72} className="-mb-1 size-16 shrink-0 drop-shadow-sm sm:size-[72px]" />
                <div className="card relative flex-1 px-4 py-3">
                  {insight ? (
                    <>
                      <p className="font-display text-base font-extrabold text-partition">{t(`insights.${insight}.title`)}</p>
                      <p className="mt-0.5 text-base leading-snug text-ink-2">{t(`insights.${insight}.body`)}</p>
                    </>
                  ) : (
                    <p className="flex items-center gap-2">
                      <Trophy size={22} weight="fill" className="shrink-0 text-producer" />
                      <span>
                        <span className="font-display text-base font-extrabold text-broker">{t("complete.title")} </span>
                        <span className="text-sm text-ink-2">{t("complete.body")}</span>
                      </span>
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Dispatch dock */}
      <footer className="relative z-10 px-3 pb-3 sm:px-5 [@media(max-height:560px)]:pb-2">
        <div className="card mx-auto flex w-fit max-w-full items-center gap-x-5 px-3 py-2.5 sm:px-4">
          <div className="-my-2 flex min-w-0 items-center gap-2 overflow-x-auto py-2 [scrollbar-width:none]">
            {CUSTOMERS.map((c, i) => (
              <button key={c} type="button" onClick={() => send(c)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 pl-2.5`} aria-label={t("sendTo", { key: c })}>
                <span className="size-3.5 rounded-[4px] ring-2 ring-producer ring-offset-1 ring-offset-paper" style={{ background: keyColor(c) }} aria-hidden />
                <span className="font-mono">{c}</span>
                <Keycap className="max-md:hidden">{i + 1}</Keycap>
              </button>
            ))}
            <button type="button" onClick={() => send(null)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 text-ink-2`}>
              <Prohibit size={16} weight="bold" />
              <span className="font-mono">{t("noKey")}</span>
              <Keycap className="max-md:hidden">0</Keycap>
            </button>
            <form
              className="flex shrink-0 items-center gap-2 border-l border-line pl-2"
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
                className="h-10 w-32 rounded-xl border border-line bg-paper-2 px-3 font-mono text-sm font-semibold text-ink outline-none transition placeholder:text-ink-2/60 focus:border-partition focus:bg-white"
              />
              <button type="submit" className={gameButtonClass({ variant: "accent", size: "sm" })} aria-label={t("send")}>
                <PaperPlaneTilt size={16} weight="fill" />
                <span className="hidden sm:inline">{t("send")}</span>
              </button>
            </form>
          </div>

          <div className="flex shrink-0 items-end gap-2.5 border-l border-line pl-4 max-sm:hidden [@media(max-height:560px)]:hidden" aria-live="polite" aria-label={t("stats")}>
            {counts.map((n, p) => (
              <div key={p} className="flex flex-col items-center gap-1">
                <div className="flex h-9 w-6 items-end overflow-hidden rounded-md bg-paper-2">
                  <motion.div className="w-full rounded-md bg-partition" animate={{ height: `${(n / maxCount) * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 20 }} />
                </div>
                <span className="font-mono text-xs font-bold text-partition">
                  P{p}
                  <span className="text-ink-2">·{n}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
