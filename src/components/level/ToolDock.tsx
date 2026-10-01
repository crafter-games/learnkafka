"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { CreditCard, Lightning, PaperPlaneTilt, Plus, Prohibit, Receipt, Scan } from "@phosphor-icons/react";
import type { Headers } from "@/sim/events";
import type { Tool } from "@/levels/types";
import { randInt, seeded } from "@/levels/types";
import { newSeed } from "@/levels/session";
import type { ConsumerSpec } from "@/stage/factoryStage";
import { keyColor } from "@/stage/keyColors";
import { gameButtonClass } from "../ui/GameButton";
import { Keycap } from "../ui/Keycap";

export type SettingValue = string | number | boolean;

export type ToolHandlers = {
  send: (via: "retrying" | "replicas", key: string, topic?: string) => void;
  setting: (field: Extract<Tool, { type: "setting" }>["field"]) => SettingValue | undefined;
  setSetting: (field: Extract<Tool, { type: "setting" }>["field"], value: SettingValue) => void;
  crash: () => void;
  member: (action: "join" | "leave" | "crash") => void;
  members: () => number;
  produce: (topic: string, key: string | null, value: string, headers: Headers, roundRobin?: boolean) => void;
  addPartition: (topic: string) => void;
  fetch: (group: string, topic: string, partition: number) => void;
  route: (ok: boolean, topic: string, key: string, value: string) => void;
};

function ProduceTool({ tool, on }: { tool: Extract<Tool, { type: "produce" }>; on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  const [custom, setCustom] = useState("");
  const [withHeaders, setWithHeaders] = useState(false);
  const [n, setN] = useState(1);
  const [last, setLast] = useState<string | null | undefined>(undefined);
  const [seq, setSeq] = useState<Record<string, number>>({});
  const headers: Headers = withHeaders ? { source: "web" } : {};
  const value = `{"order":${1040 + n}}`;
  const send = (key: string | null) => {
    // In sequence mode each customer's orders are numbered #1, #2… so ordering is visible
    const k = key ?? "∅";
    const next = (seq[k] ?? 0) + 1;
    on.produce(tool.topic, key, tool.sequence ? `#${next}` : value, headers, tool.roundRobin);
    setSeq((s) => ({ ...s, [k]: next }));
    setLast(key);
    setN((x) => x + 1);
  };

  // 1–9 send the matching customer
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || e.repeat) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < tool.keys.length) sendRef.current(tool.keys[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.keys]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {tool.headers && (
        <div className="hidden rounded-xl border border-line bg-paper-2 px-3 py-2 font-mono text-xs leading-snug text-ink-2 md:block" aria-label={t("preview")}>
          <span className="text-ink/40">{"{"}</span> key: <b className="text-partition-dark">{last === undefined ? "…" : JSON.stringify(last)}</b>, value:{" "}
          <b className="text-ink">{value}</b>, headers: <b className="text-ink">{JSON.stringify(headers)}</b>, timestamp: <b className="text-ink">now</b>{" "}
          <span className="text-ink/40">{"}"}</span>
        </div>
      )}
      {tool.keys.map((k, i) => (
        <button key={k} type="button" onClick={() => send(k)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 pl-2.5`}>
          <span className="size-3.5 rounded-[4px] ring-2 ring-producer ring-offset-1 ring-offset-paper" style={{ background: keyColor(k) }} aria-hidden />
          <span className="font-mono">
            {k}
            {tool.sequence && <span className="text-ink-2"> #{(seq[k] ?? 0) + 1}</span>}
          </span>
          <Keycap className="max-md:hidden">{i + 1}</Keycap>
        </button>
      ))}
      {tool.allowNull && (
        <button type="button" onClick={() => send(null)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 text-ink-2`}>
          <Prohibit size={16} weight="bold" />
          <span className="font-mono">{t("noKey")}</span>
        </button>
      )}
      {tool.headers && (
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" checked={withHeaders} onChange={(e) => setWithHeaders(e.target.checked)} className="size-4 accent-[var(--partition)]" />
          {t("addHeader")} <code className="font-mono text-xs">source=web</code>
        </label>
      )}
      {tool.allowCustom && (
        <form
          className="flex shrink-0 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) send(custom.trim().slice(0, 24));
          }}
        >
          <label htmlFor="tool-key" className="sr-only">
            {t("anyKey")}
          </label>
          <input
            id="tool-key"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={t("anyKey")}
            autoComplete="off"
            maxLength={24}
            className="h-10 w-28 rounded-xl border border-line bg-paper-2 px-3 font-mono text-sm font-semibold outline-none focus:border-partition focus:bg-white"
          />
          <button type="submit" className={gameButtonClass({ variant: "accent", size: "sm" })} aria-label={t("send")}>
            <PaperPlaneTilt size={16} weight="fill" />
          </button>
        </form>
      )}
    </div>
  );
}

function FetchTool({ tool, groups, on }: { tool: Extract<Tool, { type: "fetch" }>; groups: ConsumerSpec[]; on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups
        .filter((g) => tool.groups.includes(g.group))
        .map((g) => (
          <button key={g.group} type="button" onClick={() => on.fetch(g.group, tool.topic, tool.partition)} className={`${gameButtonClass({ size: "md" })} gap-2`}>
            <Scan size={18} weight="bold" style={{ color: g.color }} />
            {t("read", { group: g.label })}
          </button>
        ))}
    </div>
  );
}

function AddPartitionTool({ tool, partitions, on }: { tool: Extract<Tool, { type: "addPartition" }>; partitions: number; on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  const full = partitions >= tool.max;
  return (
    <button type="button" disabled={full} onClick={() => on.addPartition(tool.topic)} className={gameButtonClass({ variant: "accent", size: "md" })}>
      <Plus weight="bold" />
      {full ? t("maxPartitions", { n: partitions }) : t("addPartition", { n: partitions })}
    </button>
  );
}

function SendTool({ tool, on }: { tool: Extract<Tool, { type: "send" }>; on: ToolHandlers }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tool.keys.map((k) => (
        <button key={k} type="button" onClick={() => on.send(tool.via, k, tool.topic)} className={`${gameButtonClass({ size: "sm" })} shrink-0 gap-2 pl-2.5`}>
          <span className="size-3.5 rounded-[4px] ring-2 ring-producer ring-offset-1 ring-offset-paper" style={{ background: keyColor(k) }} aria-hidden />
          <span className="font-mono">{k}</span>
        </button>
      ))}
    </div>
  );
}

/** Segmented control for a producer setting (linger.ms, batch.size, acks…). */
function SettingTool({ tool, on }: { tool: Extract<Tool, { type: "setting" }>; on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  const current = on.setting(tool.field);
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={t(`fields.${tool.field}`)}>
      <span className="font-mono text-sm font-bold text-ink-2">{t(`fields.${tool.field}`)}</span>
      <div className="flex overflow-hidden rounded-xl border border-line bg-paper-2 p-0.5">
        {tool.options.map((o) => {
          const active = String(o) === String(current);
          return (
            <button
              key={String(o)}
              type="button"
              role="radio"
              aria-checked={active}
              data-setting={`${tool.field}=${o}`}
              onClick={() => on.setSetting(tool.field, o)}
              className={`h-9 min-w-11 rounded-[10px] px-2.5 font-mono text-sm font-bold transition ${active ? "bg-partition text-white shadow-[0_2px_0_var(--partition-dark)]" : "text-ink-2 hover:bg-white"}`}
            >
              {typeof o === "boolean" ? t(o ? "on" : "off") : String(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MembersTool({ tool, on }: { tool: Extract<Tool, { type: "members" }>; on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  const n = on.members();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tool.actions.map((a) => (
        <button
          key={a}
          type="button"
          disabled={(a === "join" && n >= tool.max) || (a !== "join" && n === 0)}
          onClick={() => on.member(a)}
          className={`${gameButtonClass({ variant: a === "join" ? "accent" : "secondary", size: "md" })} ${a === "crash" ? "border-danger/40 text-danger" : ""}`}
        >
          {a === "join" ? <Plus weight="bold" /> : a === "crash" ? <Lightning weight="fill" /> : null}
          {t(`member.${a}`, { n })}
        </button>
      ))}
    </div>
  );
}

function CrashTool({ on }: { on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  return (
    <button type="button" onClick={on.crash} className={`${gameButtonClass({ size: "md" })} border-danger/40 text-danger`}>
      <Lightning weight="fill" />
      {t("crash")}
    </button>
  );
}

type RouteEvent = { kind: "order" | "payment"; key: string; text: string };

function makeQueue(): RouteEvent[] {
  const rng = seeded(newSeed());
  const keys = ["alice", "bob", "carol", "dave", "erin"];
  return Array.from({ length: 40 }, (_, i) => {
    const kind = rng() < 0.5 ? "order" : "payment";
    const key = keys[randInt(rng, 0, keys.length - 1)];
    return { kind, key, text: kind === "order" ? `order #${1100 + i}` : `€${randInt(rng, 5, 90)}.00` };
  });
}

function RouteTool({ tool, on }: { tool: Extract<Tool, { type: "route" }>; on: ToolHandlers }) {
  const t = useTranslations("level.tools");
  const [queue] = useState(makeQueue);
  const [i, setI] = useState(0);
  const [shake, setShake] = useState(0);
  const ev = queue[i % queue.length];
  const target = ev.kind === "order" ? "orders" : "payments";
  const Icon = ev.kind === "order" ? Receipt : CreditCard;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`${i}-${shake}`}
          initial={{ opacity: 0, y: 10, x: 0 }}
          animate={shake ? { opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] } : { opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-3 rounded-xl border border-line bg-paper-2 px-3.5 py-2"
        >
          <Icon size={26} weight="duotone" className={ev.kind === "order" ? "text-producer-dark" : "text-partition"} />
          <span className="leading-tight">
            <span className="block font-display text-sm font-bold">{t(ev.kind)}</span>
            <span className="font-mono text-xs text-ink-2">
              {ev.key} · {ev.text}
            </span>
          </span>
        </motion.div>
      </AnimatePresence>
      {tool.topics.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            const ok = name === target;
            on.route(ok, name, ev.key, ev.text);
            if (ok) setI((x) => x + 1);
            else setShake((s) => s + 1);
          }}
          className={gameButtonClass({ variant: "secondary", size: "md" })}
        >
          → <span className="font-mono">{name}</span>
        </button>
      ))}
    </div>
  );
}

export function ToolDock({ tools, consumers, partitions, on }: { tools: Tool[]; consumers: ConsumerSpec[]; partitions: (topic: string) => number; on: ToolHandlers }) {
  return (
    <div className="card mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4">
      {tools.map((tool, i) =>
        tool.type === "produce" ? (
          <ProduceTool key={i} tool={tool} on={on} />
        ) : tool.type === "fetch" ? (
          <FetchTool key={i} tool={tool} groups={consumers} on={on} />
        ) : tool.type === "addPartition" ? (
          <AddPartitionTool key={i} tool={tool} partitions={partitions(tool.topic)} on={on} />
        ) : tool.type === "send" ? (
          <SendTool key={i} tool={tool} on={on} />
        ) : tool.type === "setting" ? (
          <SettingTool key={i} tool={tool} on={on} />
        ) : tool.type === "crash" ? (
          <CrashTool key={i} on={on} />
        ) : tool.type === "members" ? (
          <MembersTool key={i} tool={tool} on={on} />
        ) : (
          <RouteTool key={i} tool={tool} on={on} />
        ),
      )}
    </div>
  );
}
