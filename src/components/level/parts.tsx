"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  ArrowLineRight, Check, Clock, Factory, FileText, Flag, Hash, ListNumbers, Note, Package, Robot, Rows, Scan, Signpost, Tag, X,
  type Icon,
} from "@phosphor-icons/react";
import type { Input, Msg } from "@/levels/types";
import type { Cluster } from "@/sim/cluster";
import { gameButtonClass } from "../ui/GameButton";

const ICONS: Record<string, Icon> = {
  package: Package, tag: Tag, file: FileText, note: Note, clock: Clock, robot: Robot, scan: Scan, flag: Flag,
  hash: Hash, counter: ListNumbers, next: ArrowLineRight, factory: Factory, sign: Signpost, rows: Rows,
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

export function MappingCard({ items, breaks }: { items: { icon: string; thing: Msg; kafka: Msg }[]; breaks?: Msg }) {
  const t = useTranslations("level");
  return (
    <div className="mt-4">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("mapping")}</p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper-2/60">
        {items.map((it, i) => {
          const I = ICONS[it.icon] ?? Package;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className="grid grid-cols-[22px_1fr_auto_1fr] items-center gap-2 px-3 py-2.5 text-base"
            >
              <I size={18} weight="duotone" className="text-producer-dark" />
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

export function Breaks({ m }: { m: Msg }) {
  const t = useTranslations("level");
  return (
    <p className="mt-3 rounded-xl border border-dashed border-producer/50 bg-producer/5 px-3 py-2 text-sm leading-snug text-ink-2">
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
}: {
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
      <div className="grid gap-2">
        {input.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            data-value={o.id}
            disabled={disabled}
            onClick={() => onAnswer(o.id)}
            className={`${gameButtonClass({ size: "md" })} h-auto min-h-13 justify-start px-4 py-3 text-left font-sans text-lg font-semibold ${state(o.id)}`}
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
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: partitions ?? 1 }, (_, p) => (
          <button
            key={p}
            type="button"
            data-value={p}
            disabled={disabled}
            onClick={() => onAnswer(p)}
            className={`${gameButtonClass({ variant: picked === undefined ? "accent" : "secondary", size: "md" })} min-w-16 font-display text-lg ${state(p)}`}
          >
            P{p}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form
      className="flex gap-2"
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
export function Receipts({ receipts }: { receipts: { n: number; key: string; status: "pending" | "acked" | "lost" }[] }) {
  const t = useTranslations("level");
  return (
    <div className="mt-4">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("receipts")}</p>
      {receipts.length === 0 ? (
        <p className="text-sm text-ink-2">{t("nothingYet")}</p>
      ) : (
        <ol className="flex flex-wrap gap-1.5">
          {receipts.slice(-12).map((r) => (
            <li
              key={r.n}
              className={`rounded-lg px-2 py-1 font-mono text-sm font-bold ${r.status === "acked" ? "bg-broker/15 text-broker" : r.status === "lost" ? "bg-danger/15 text-danger line-through" : "bg-paper-2 text-ink-2"}`}
            >
              #{r.n} {r.status === "acked" ? "✓" : r.status === "lost" ? "✗" : "…"}
            </li>
          ))}
        </ol>
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
