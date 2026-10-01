"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  ArrowLineRight, Check, Clock, Database, Factory, FileText, Flag, Hash, Lightning, ListNumbers, Note, Package, Plug, Robot, Rows, Scan, Signpost, Table, Tag, Timer, X,
  type Icon,
} from "@phosphor-icons/react";
import type { Input, LevelCtx, Msg, StreamsPanel } from "@/levels/types";
import { streamView, tableView } from "@/sim/streams";
import type { Cluster } from "@/sim/cluster";
import { gameButtonClass } from "../ui/GameButton";

const ICONS: Record<string, Icon> = {
  package: Package, tag: Tag, file: FileText, note: Note, clock: Clock, robot: Robot, scan: Scan, flag: Flag,
  hash: Hash, counter: ListNumbers, next: ArrowLineRight, factory: Factory, sign: Signpost, rows: Rows,
  database: Database, plug: Plug, table: Table, timer: Timer,
};

/** Renders a level message with <b> and <code> rich tags. */
export function Text({ m, className }: { m: Msg; className?: string }) {
  const t = useTranslations("levels");
  return (
    <span className={className}>
      {t.rich(m.key, {
        ...m.values,
        b: (c) => <strong className="font-bold text-ink">{c}</strong>,
        code: (c) => <code className="rounded bg-paper-2 px-1 py-0.5 font-mono text-[0.9em] text-partition-dark">{c}</code>,
      })}
    </span>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-ink px-4 py-3 font-mono text-sm leading-relaxed text-paper">
      <code>{code}</code>
    </pre>
  );
}

export function MappingCard({ items, breaks, big }: { items: { icon: string; thing: Msg; kafka: Msg }[]; breaks?: Msg; big?: boolean }) {
  const t = useTranslations("level");
  return (
    <div className={big ? "" : "mt-3"}>
      {!big && <p className="mb-1.5 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("mapping")}</p>}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper-2/60">
        {items.map((it, i) => {
          const I = ICONS[it.icon] ?? Package;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className={`grid items-center gap-2 px-3 leading-snug ${big ? "grid-cols-[28px_1fr_auto_1fr] py-2.5 text-[1.0625rem] sm:text-[1.25rem]" : "grid-cols-[20px_1fr_auto_1fr] py-1.5 text-[0.9375rem]"}`}
            >
              <I size={big ? 26 : 18} weight="duotone" className="text-producer-dark" />
              <Text m={it.thing} className="text-ink-2" />
              <span className="text-ink/30">→</span>
              <Text m={it.kafka} className="font-semibold text-partition-dark" />
            </motion.li>
          );
        })}
      </ul>
      {breaks && <Breaks m={breaks} />}
    </div>
  );
}

export function Breaks({ m, big }: { m: Msg; big?: boolean }) {
  const t = useTranslations("level");
  return (
    <p className={`rounded-xl border border-dashed border-producer/50 bg-producer/5 leading-snug text-ink-2 ${big ? "px-4 py-3 text-[1.125rem] sm:text-[1.3rem]" : "mt-3 px-3 py-2 text-sm"}`}>
      <span className="font-display font-bold text-producer-dark">{t("breaks")} </span>
      <Text m={m} />
    </p>
  );
}

/** The answer UI shared by predictions and the recall check. */
export function AnswerInput({
  input,
  partitions,
  disabled,
  picked,
  answer,
  onAnswer,
  big,
}: {
  big?: boolean;
  input: Input;
  partitions?: number;
  disabled: boolean;
  picked?: string | number;
  answer?: string | number;
  onAnswer: (value: string | number) => void;
}) {
  const t = useTranslations("level");
  const [num, setNum] = useState("");

  const state = (value: string | number) => {
    if (picked === undefined) return "";
    if (String(value) === String(answer)) return "ring-2 ring-broker bg-broker/10 border-broker disabled:opacity-100";
    if (String(value) === String(picked)) return "ring-2 ring-danger bg-danger/10 border-danger disabled:opacity-100";
    return "opacity-50";
  };
  const mark = (value: string | number) =>
    picked === undefined ? null : String(value) === String(answer) ? <Check weight="bold" className="ml-auto shrink-0 text-broker" /> : String(value) === String(picked) ? <X weight="bold" className="ml-auto shrink-0 text-danger" /> : null;

  if (input.type === "choice") {
    return (
      <div className={`grid gap-2 ${big ? "sm:grid-cols-2 sm:gap-3" : ""}`}>
        {input.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            data-value={o.id}
            disabled={disabled}
            onClick={() => onAnswer(o.id)}
            className={`${gameButtonClass({ size: "md" })} h-auto min-h-12 justify-start px-4 text-left font-sans font-semibold ${big ? "min-h-14 py-3 text-[1.1875rem] sm:text-[1.3rem]" : "py-2.5 text-[1.0625rem]"} ${state(o.id)}`}
          >
            <span className="font-mono text-sm text-ink-2">{String.fromCharCode(65 + i)}</span>
            <Text m={o.label} />
            {mark(o.id)}
          </button>
        ))}
      </div>
    );
  }

  if (input.type === "partition") {
    return (
      <div className={`flex flex-wrap gap-2 ${big ? "justify-center gap-3" : ""}`}>
        {Array.from({ length: partitions ?? 1 }, (_, p) => (
          <button
            key={p}
            type="button"
            data-value={p}
            disabled={disabled}
            onClick={() => onAnswer(p)}
            className={`${gameButtonClass({ variant: picked === undefined ? "accent" : "secondary", size: "md" })} font-display ${big ? "h-16 min-w-24 text-2xl" : "min-w-16 text-lg"} ${state(p)}`}
          >
            P{p}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form
      className={`flex gap-2 ${big ? "justify-center" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (num.trim() !== "") onAnswer(Number(num));
      }}
    >
      <label className="sr-only" htmlFor="answer-number">
        {t("yourAnswer")}
      </label>
      <input
        id="answer-number"
        type="number"
        inputMode="numeric"
        min={0}
        autoFocus
        disabled={disabled}
        value={num}
        onChange={(e) => setNum(e.target.value)}
        className={`h-12 w-28 rounded-xl border border-line bg-paper-2 px-3 text-center font-mono text-xl font-bold text-ink outline-none focus:border-partition focus:bg-white ${state(Number(num))}`}
      />
      <button type="submit" disabled={disabled || num === ""} className={gameButtonClass({ variant: "accent", size: "md" })}>
        {t("check")}
      </button>
      {picked !== undefined && String(picked) !== String(answer) && (
        <span className="self-center font-mono text-sm font-bold text-broker">= {answer}</span>
      )}
    </form>
  );
}

export function Meter({ label, value, max, danger, unit }: { label: Msg; value: number; max: number; danger: number; unit?: string }) {
  const hot = value >= danger;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between">
        <Text m={label} className="font-display text-sm font-bold text-ink-2" />
        <span className={`font-mono text-lg font-extrabold ${hot ? "text-danger" : "text-ink"}`}>
          {value}
          {unit && <span className="ml-0.5 text-sm font-bold text-ink-2">{unit}</span>}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-paper-2">
        <motion.div
          className={`h-full rounded-full ${hot ? "bg-danger" : "bg-partition"}`}
          animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
        />
      </div>
    </div>
  );
}

/** Completion order of records; flags a key whose sequence number went backwards. */
export function Deliveries({ items }: { items: { key: string | null; value: string }[] }) {
  const t = useTranslations("level");
  const lastSeq = new Map<string, number>();
  const rows = items.slice(-8).map((r, i) => {
    const n = Number(r.value.replace("#", ""));
    const k = r.key ?? "∅";
    const ok = !r.value.startsWith("#") || (lastSeq.get(k) ?? 0) < n;
    if (r.value.startsWith("#")) lastSeq.set(k, Math.max(lastSeq.get(k) ?? 0, n));
    return { ...r, ok, i };
  });
  return (
    <div className="mt-4">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("delivered")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">{t("nothingYet")}</p>
      ) : (
        <ol className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <motion.li
              key={`${r.i}-${items.length}`}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-sm font-bold ${r.ok ? "bg-paper-2 text-ink" : "bg-danger/15 text-danger"}`}
            >
              {r.key ?? "∅"} {r.value.startsWith("#") ? r.value : ""}
              {!r.ok && <X weight="bold" />}
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Where each key landed first vs. where it hashes now (after adding partitions). */
export function KeyMoves({ cluster, topic, keys }: { cluster: Cluster; topic: string; keys: string[] }) {
  const t = useTranslations("level");
  const tp = cluster.topic(topic);
  const rows = keys.map((k) => {
    // Before the resize every record of a key sat on one partition; any record elsewhere is "before"
    const now = tp.partitionFor(k);
    const mine = tp.partitions.flat().filter((r) => r.key === k);
    return { k, before: mine.find((r) => r.partition !== now)?.partition ?? (mine.length ? now : undefined), now };
  });
  return (
    <div className="mt-4">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("keyMoves", { n: tp.numPartitions })}</p>
      <ul className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-1 font-mono text-base">
        {rows.map(({ k, before, now }) => {
          const moved = before !== undefined && before !== now;
          return (
            <li key={k} className="contents">
              <span className="font-bold">{k}</span>
              <span className="text-ink-2">P{before ?? "?"}</span>
              <span className="text-ink/30">→</span>
              <span className={moved ? "rounded-md bg-danger/15 px-1.5 font-bold text-danger" : "text-broker"}>P{now}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The producer's view: which orders it was told are saved, which are waiting, which were lost. */
export function Receipts({ receipts }: { receipts: { n: number; key: string; status: "pending" | "acked" | "lost" | "rejected" }[] }) {
  const t = useTranslations("level");
  return (
    <div className="mt-4">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("receipts")}</p>
      {receipts.length === 0 ? (
        <p className="text-sm text-ink-2">{t("nothingYet")}</p>
      ) : (
        <ol className="flex flex-wrap gap-1.5">
          {receipts.slice(-12).map((r, i) => (
            <li
              key={`${i}-${r.n}`}
              className={`rounded-lg px-2 py-1 font-mono text-sm font-bold ${r.status === "acked" ? "bg-broker/15 text-broker" : r.status === "lost" ? "bg-danger/15 text-danger line-through" : r.status === "rejected" ? "bg-producer/15 text-producer-dark" : "bg-paper-2 text-ink-2"}`}
            >
              #{r.n} {r.status === "acked" ? "✓" : r.status === "lost" ? "✗" : r.status === "rejected" ? "⊘" : "…"}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function GroupStats({ processed, duplicates, lost, lag }: { processed: number; duplicates: number; lost: number; lag: number }) {
  const t = useTranslations("level.group");
  const cell = (label: string, value: number, tone: string) => (
    <div className="rounded-xl bg-paper-2 px-3 py-2 text-center">
      <div className={`font-mono text-2xl font-extrabold ${tone}`}>{value}</div>
      <div className="text-xs font-semibold text-ink-2">{label}</div>
    </div>
  );
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {cell(t("processed"), processed, "text-ink")}
      {cell(t("duplicates"), duplicates, duplicates ? "text-danger" : "text-ink")}
      {cell(t("lost"), lost, lost ? "text-danger" : "text-ink")}
      {cell(t("lag"), lag, "text-partition")}
    </div>
  );
}

/** Which replicas are in sync, and the high watermark consumers can read up to. */
export function IsrPanel({ rs }: { rs: { replicas: string[]; isr: Set<string>; down: Set<string>; leader: string | null; highWatermark: () => number } }) {
  const t = useTranslations("level.isr");
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper-2/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">ISR</span>
        {rs.replicas.map((r) => {
          const n = r.replace(/\D/g, "");
          const state = rs.down.has(r) ? "down" : rs.isr.has(r) ? "in" : "out";
          return (
            <span key={r} className={`rounded-lg px-2 py-0.5 font-mono text-sm font-bold ${state === "in" ? "bg-broker/15 text-broker" : state === "out" ? "bg-producer/15 text-producer-dark" : "bg-ink/10 text-ink-2 line-through"}`}>
              b{n}
              {rs.leader === r ? " ★" : ""}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-2">
        {rs.leader ? t("hw", { hw: rs.highWatermark() }) : <span className="font-semibold text-danger">{t("offline")}</span>}
      </p>
    </div>
  );
}

/** What each consumer has been handed, by isolation level (aborted records struck through). */
export function SeenBy({ readers }: { readers: { label: string; color: string; isolation: string; seen: { key: string | null; value: string; aborted: boolean }[] }[] }) {
  const t = useTranslations("level");
  return (
    <div className="mt-4 space-y-2.5">
      {readers.map((r) => (
        <div key={r.label}>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <span className="size-2.5 rounded-full" style={{ background: r.color }} />
            {r.label} <code className="rounded bg-paper-2 px-1 font-mono text-xs text-ink-2">{r.isolation}</code>
          </p>
          {r.seen.length === 0 ? (
            <p className="text-sm text-ink-2">{t("nothingYet")}</p>
          ) : (
            <ol className="flex flex-wrap gap-1">
              {r.seen.slice(-10).map((x, i) => (
                <li key={i} className={`rounded-md px-1.5 py-0.5 font-mono text-xs font-bold ${x.aborted ? "bg-danger/15 text-danger line-through" : "bg-paper-2 text-ink"}`}>
                  {x.value}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

/** The state a consumer rebuilds by reading the log: latest value per key. */
export function StateTable({ table }: { table: Map<string, string> }) {
  const t = useTranslations("level");
  return (
    <div className="mt-4">
      <p className="mb-1.5 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("table")}</p>
      {table.size === 0 ? (
        <p className="text-sm text-ink-2">{t("nothingYet")}</p>
      ) : (
        <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-xl bg-paper-2 px-3 py-2 font-mono text-sm">
          {[...table].map(([k, v]) => (
            <li key={k} className="contents">
              <span className="font-bold">{k}</span>
              <span className="text-ink-2">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Feedback({ correct, explain }: { correct: boolean; explain: Msg }) {
  const t = useTranslations("level");
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mt-3 rounded-xl border px-4 py-3 text-base leading-snug ${correct ? "border-broker/40 bg-broker/10" : "border-danger/30 bg-danger/5"}`}
      role="status"
    >
      <p className={`font-display font-bold ${correct ? "text-broker" : "text-danger"}`}>{correct ? t("right") : t("notQuite")}</p>
      <Text m={explain} className="text-ink-2" />
    </motion.div>
  );
}

const panelTitle = "mb-1.5 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2";

function Status({ tone, children }: { tone: "ok" | "bad" | "busy"; children: React.ReactNode }) {
  const cls = tone === "ok" ? "bg-broker/15 text-broker" : tone === "bad" ? "bg-danger/15 text-danger" : "bg-producer/15 text-producer-dark";
  return <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-display text-xs font-bold ${cls}`}>{children}</span>;
}

/** World 8 live panels: the connector's source table, stream vs table, the state store, windows. */
export function StreamsView({ kind, ctx, topic }: { kind: StreamsPanel; ctx: LevelCtx; topic: string }) {
  const t = useTranslations("level.streams");
  if (kind === "connect" && ctx.connector) {
    const c = ctx.connector;
    const committed = c.committed();
    const first = Math.max(0, c.table.length - 8);
    return (
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={panelTitle}>{t("source")}</p>
          {c.running ? <Status tone="ok">{t("running")}</Status> : <Status tone="bad"><Lightning weight="fill" /> {t("crashed")}</Status>}
        </div>
        <ol className="overflow-hidden rounded-xl border border-line bg-paper-2 font-mono text-sm">
          {c.table.slice(first).map((row, j) => {
            const i = first + j;
            return (
              <li key={row.id} className={`flex items-center gap-2 px-3 py-1 ${i === committed && i > 0 ? "border-t-2 border-partition" : i > first ? "border-t border-line" : ""}`}>
                <span className="shrink-0 font-bold">{row.id}</span>
                <span className="flex-1 truncate text-ink-2">{row.value}</span>
                {i < c.position ? <Check weight="bold" className="text-broker" aria-label={t("copied")} /> : <span className="text-ink/30">…</span>}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-sm leading-snug text-ink-2">{t("flushed", { n: committed })}</p>
        <p className={`mt-1 text-sm font-bold ${c.duplicates ? "text-danger" : "text-ink-2"}`}>{t("duplicates", { n: c.duplicates })}</p>
      </div>
    );
  }
  if (kind === "table") {
    const events = streamView(ctx.cluster, topic).slice(-7);
    const table = tableView(ctx.cluster, topic);
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className={panelTitle}>KStream</p>
          <ol className="space-y-1 font-mono text-sm">
            {events.map((r) => (
              <li key={r.offset} className="truncate rounded-md bg-paper-2 px-2 py-0.5">
                <b>{r.key}</b> <span className="text-ink-2">{r.value === "" ? "∅" : r.value}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className={panelTitle}>KTable</p>
          {table.size === 0 ? (
            <p className="text-sm text-ink-2">{t("empty")}</p>
          ) : (
            <ul className="space-y-1 font-mono text-sm">
              {[...table].map(([k, v]) => (
                <motion.li key={k} layout className="truncate rounded-md bg-partition/10 px-2 py-0.5">
                  <b>{k}</b> <span className="text-partition-dark">{v}</span>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
  if (kind === "store" && ctx.app) {
    const a = ctx.app;
    return (
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={panelTitle}>{t("store")}</p>
          {a.restoring ? (
            <Status tone="busy">{t("restoring", { done: a.restoring.done, total: a.restoring.total })}</Status>
          ) : a.running ? (
            <Status tone="ok">{t("running")}</Status>
          ) : (
            <Status tone="bad"><Lightning weight="fill" /> {t("crashed")}</Status>
          )}
        </div>
        {a.store.size === 0 ? (
          <p className="rounded-xl bg-paper-2 px-3 py-2 text-sm text-ink-2">{t("storeEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-xl bg-paper-2 px-3 py-2 font-mono text-sm">
            {[...a.store].map(([k, v]) => (
              <li key={k} className="contents">
                <span className="font-bold">{k}</span>
                <span className="text-right text-partition-dark">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (kind === "windows" && ctx.windows) {
    const w = ctx.windows;
    return (
      <div className="mt-3">
        <p className={panelTitle}>{t("windows")}</p>
        <p className="mb-2 font-mono text-sm text-ink-2">{t("streamTime", { s: w.streamTime, grace: w.grace })}</p>
        <ul className="space-y-1.5">
          {w.windows().slice(-4).map((win) => (
            <li key={win.start} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-sm ${win.closed ? "border-line bg-paper-2 text-ink-2" : "border-partition/40 bg-partition/10"}`}>
              <span className="w-20">[{win.start}–{win.end})</span>
              <span className="flex-1 font-bold">{t("count", { n: win.count })}</span>
              {win.closed ? <Status tone="bad">{t("closed")}</Status> : <Status tone="ok">{t("open")}</Status>}
            </li>
          ))}
        </ul>
        <p className={`mt-2 text-sm font-bold ${w.dropped ? "text-danger" : "text-ink-2"}`}>{t("dropped", { n: w.dropped })}</p>
      </div>
    );
  }
  return null;
}
