"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { Topic } from "@/sim/topic";
import type { SimRecord } from "@/sim/events";
import { audioBus } from "@/audio/audioBus";
import { useSettings } from "@/store/settings";
import { BeltCanvas } from "./BeltCanvas";
import { Hud } from "./Hud";

const CUSTOMERS = ["alice", "bob", "carol", "dave", "erin"];
const PARTITIONS = 3;

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
  const [insight, setInsight] = useState(false);
  const seen = useRef<Record<string, number>>({});
  const toggleMuted = useSettings((s) => s.toggleMuted);

  useEffect(() => {
    const bus = audioBus();
    bus.preload();
    const off = topic.events.on((e) => bus.handleSimEvent(e));
    window.__TEST__ = {
      endOffsets: () => topic.endOffsets(),
      partitions: () => topic.partitions,
      produce: (key: string | null) => topic.produce(key, `order-${Date.now()}`),
    };
    return () => {
      off();
      delete window.__TEST__;
    };
  }, [topic]);

  const send = useCallback(
    (key: string | null) => {
      topic.produce(key, `order-${Date.now()}`);
      if (key !== null) {
        const n = (seen.current[key] ?? 0) + 1;
        seen.current[key] = n;
        if (n === 2) setInsight(true);
      }
    },
    [topic],
  );

  const onLanded = useCallback((r: SimRecord) => {
    audioBus().play("stamp");
    setCounts((c) => c.map((n, i) => (i === r.partition ? Math.max(n, r.offset + 1) : n)));
  }, []);

  // Keyboard: 1–5 sends a customer, 0 sends a null key, M mutes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key.toLowerCase() === "m") toggleMuted();
      const i = Number(e.key);
      if (i >= 1 && i <= CUSTOMERS.length) send(CUSTOMERS[i - 1]);
      if (e.key === "0") send(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, toggleMuted]);

  const labels = useMemo(
    () => ({
      producer: ts("producer"),
      topic: (name: string) => ts("topic", { name }),
      partition: (n: number) => ts("partition", { n }),
      offset: ts("offset"),
    }),
    [ts],
  );

  const chip =
    "rounded-xl border px-4 py-2 font-mono text-sm font-semibold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-partition";

  return (
    <main className="grid-bg flex h-dvh flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6 [@media(max-height:520px)]:pt-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("title")}</h1>
          <p className="font-mono text-xs text-partition sm:text-sm">{t("subtitle")}</p>
        </div>
        <Hud backHref="/" />
      </header>

      <p className="px-4 pt-2 text-sm text-muted sm:px-6 [@media(max-height:520px)]:hidden">{t("hint")}</p>

      <section className="relative min-h-0 flex-1" data-testid="stage">
        <BeltCanvas topic={topic} labels={labels} onLanded={onLanded} />
        <AnimatePresence>
          {insight && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-partition/40 bg-panel/90 px-4 py-2 text-sm font-semibold text-partition shadow-lg shadow-partition/10 backdrop-blur"
              role="status"
            >
              ✦ {t("insight")}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <footer className="border-t border-white/5 bg-panel/70 px-4 py-4 backdrop-blur sm:px-6 [@media(max-height:520px)]:py-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 [@media(max-height:520px)]:gap-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted [@media(max-height:520px)]:sr-only">{t("customers")}</p>
            <div className="flex flex-wrap gap-2">
              {CUSTOMERS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => send(c)}
                  className={`${chip} border-producer/50 bg-producer/10 text-producer hover:bg-producer/20`}
                >
                  <span className="mr-1.5 text-xs opacity-60">{i + 1}</span>
                  {c}
                </button>
              ))}
              <button
                type="button"
                onClick={() => send(null)}
                className={`${chip} border-white/15 text-muted hover:text-text`}
              >
                <span className="mr-1.5 text-xs opacity-60">0</span>
                {t("noKey")}
              </button>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const k = customKey.trim();
                  if (k) send(k.slice(0, 24));
                }}
              >
                <input
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder={t("custom")}
                  aria-label={t("custom")}
                  maxLength={24}
                  className="w-32 rounded-xl border border-white/15 bg-bg/60 px-3 py-2 font-mono text-sm outline-none focus:border-partition"
                />
                <button type="submit" className={`${chip} border-partition/50 text-partition hover:bg-partition/10`}>
                  {t("send")}
                </button>
              </form>
            </div>
          </div>

          <div aria-live="polite">
            <p className="mb-2 text-xs uppercase tracking-widest text-muted [@media(max-height:520px)]:sr-only">{t("stats")}</p>
            <div className="flex gap-2 font-mono text-sm">
              {counts.map((n, p) => (
                <span key={p} className="rounded-lg border border-partition/30 px-3 py-2 text-partition">
                  P{p}: <b className="text-text">{n}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
