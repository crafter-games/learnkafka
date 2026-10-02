"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ArrowCounterClockwise, ArrowLeft, ArrowRight, Brain, MapTrifold, Star } from "@phosphor-icons/react";
import type { Headers, SimRecord } from "@/sim/events";
import { audioBus } from "@/audio/audioBus";
import { backgroundMusic } from "@/audio/music";
import { Link } from "@/i18n/navigation";
import { buildCheck, nextLevel, starsFor, type BuiltQuestion } from "@/levels";
import type { Level, Prediction } from "@/levels/types";
import { LevelSession, newSeed } from "@/levels/session";
import { useProgress } from "@/learning/progress";
import { AudioDirector } from "../AudioDirector";
import { FactoryCanvas } from "../FactoryCanvas";
import { Hud } from "../Hud";
import { gameButtonClass } from "../ui/GameButton";
import { AnswerInput, Breaks, CodeBlock, Deliveries, StreamsView, Verdict, GroupStats, IsrPanel, SeenBy, StateTable, KeyMoves, MappingCard, Meter, Receipts, Text } from "./parts";
import { DialogueBox, Rich, usePages, type Page } from "./dialogue";
import { RecallQuiz } from "./RecallQuiz";
import { useInsets } from "../useInsets";
import { ToolDock, type ToolHandlers } from "./ToolDock";
import { Backdrop } from "../ui/Backdrop";

type Phase = "steps" | "check" | "result";

/** Human label of the right answer (choice text, P<n>, or the number). */
function answerLabel(p: Prediction, tl: ReturnType<typeof useTranslations>) {
  if (p.input.type === "choice") {
    const o = p.input.options.find((x) => x.id === String(p.answer));
    return o ? tl(o.label.key, o.label.values) : String(p.answer);
  }
  return p.input.type === "partition" ? `P${p.answer}` : String(p.answer);
}

declare global {
  interface Window {
    __TEST__?: Record<string, unknown>;
  }
}

/** `onRestart` remounts the player: a fresh cluster, new numbers, back to step 1. */
export function LevelPlayer({ level, onRestart }: { level: Level; onRestart: () => void }) {
  const t = useTranslations("level");
  const tl = useTranslations("levels");
  const ts = useTranslations("stage");
  const recordCheck = useProgress((s) => s.recordCheck);

  const [session] = useState(() => new LevelSession(level));
  const { cluster, ctx } = session;
  const [phase, setPhase] = useState<Phase>("steps");
  const [stepIndex, setStepIndex] = useState(0);
  const [, setTick] = useState(0); // re-render on sim events (task progress)

  // Prediction / watch state
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [picked, setPicked] = useState<string | number | undefined>(undefined);
  const [revealing, setRevealing] = useState(false);
  const [watchDone, setWatchDone] = useState(false);
  const [taskStarted, setTaskStarted] = useState(false);
  const [questionRead, setQuestionRead] = useState(false);
  const objectiveRef = useRef<HTMLDivElement>(null);
  const pages = usePages();

  // Check state
  const [seed, setSeed] = useState(newSeed);
  const [questions, setQuestions] = useState<BuiltQuestion[]>([]);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const step = level.steps[stepIndex];
  const isLastStep = stepIndex === level.steps.length - 1;
  const headerRef = useRef<HTMLElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const restart = () => {
    audioBus().play("click", { bus: "ui", rate: 0.9 });
    onRestart();
  };

  useEffect(() => cluster.events.on(() => setTick((n) => n + 1)), [cluster]);

  const onLanded = useCallback(
    (r: SimRecord) => {
      audioBus().play("stamp");
      session.landedRecord(r);
    },
    [session],
  );

  /** Enter a step: snapshot counters, build its prediction, start its watch script. */
  const enterStep = (i: number) => {
    const next = level.steps[i];
    session.markStepStart();
    setStepIndex(i);
    setPicked(undefined);
    setRevealing(false);
    setWatchDone(false);
    setTaskStarted(false);
    setQuestionRead(false);
    setPrediction(next.kind === "predict" ? next.build(ctx) : null);
    if (next.kind === "watch") void next.script(ctx).then(() => setWatchDone(true));
    if (next.kind === "task") next.onEnter?.(ctx);
  };

  useEffect(() => {
    session.retain();
    return () => session.release();
  }, [session]);

  // Explanations duck the music; hands-on steps let it breathe
  useEffect(() => {
    const reading = phase !== "steps" || step.kind === "brief" || step.kind === "predict";
    backgroundMusic().duck(reading);
    return () => backgroundMusic().duck(false);
  }, [phase, step]);

  const taskProgress = step.kind === "task" ? step.progress(ctx, session.stepStart) : null;
  const taskDone = !!taskProgress && taskProgress.done >= taskProgress.total;

  const insets = useInsets(
    {
      header: headerRef,
      side: sideRef,
      dock: dockRef,
      objective: objectiveRef,
    },
    [phase, stepIndex, taskStarted, taskDone, picked, revealing],
  );

  const [celebrated, setCelebrated] = useState(-1);
  if (taskDone && celebrated !== stepIndex) {
    setCelebrated(stepIndex);
    audioBus().play("unlock", { bus: "ui", rate: 1 });
  }

  const canAdvance = step.kind === "brief" || (step.kind === "watch" && watchDone) || (step.kind === "predict" && picked !== undefined && !revealing) || taskDone;

  // ---- Dialogue content for the current step (short pages, big type) ----
  const showDock = step.kind === "task" && taskStarted && !taskDone;
  const dialogueKey = `${stepIndex}-${step.kind === "task" ? (taskDone ? "done" : "intro") : step.kind === "predict" ? (picked === undefined ? "q" : revealing ? "reveal" : "fb") : "x"}`;
  const dialoguePages: Page[] = (() => {
    if (step.kind === "brief") {
      const out: Page[] = pages.text(step.body, tl(step.title.key, step.title.values));
      if (step.mapping)
        out.push({
          kind: "node",
          heading: t("mapping"),
          node: <MappingCard items={step.mapping} big />,
        });
      if (step.breaks) out.push({ kind: "node", node: <Breaks m={step.breaks} big /> });
      if (step.code) out.push({ kind: "node", node: <CodeBlock code={step.code} /> });
      return out;
    }
    if (step.kind === "watch") return pages.text(step.body, tl(step.title.key, step.title.values));
    if (step.kind === "task") return taskDone ? pages.text(step.success, t("taskDone")) : pages.text(step.body, tl(step.title.key, step.title.values));
    if (!prediction) return [];
    if (picked === undefined)
      return [
        {
          kind: "node",
          node: (
            <>
              <Rich markup={pages.markup(prediction.prompt)} />
              {prediction.code && (
                <div className="mt-3 text-base">
                  <CodeBlock code={prediction.code} />
                </div>
              )}
            </>
          ),
        },
      ];
    if (revealing) return [{ kind: "text", markup: t("watch") }];
    const ok = String(picked) === String(prediction.answer);
    return pages.text(prediction.explain, ok ? t("right") : `${t("notQuite")} ${t("answerWas", { answer: answerLabel(prediction, tl) })}`);
  })();
  const dialogueCanAdvance = step.kind === "task" ? true : canAdvance;
  const dialogueAdvance = () => {
    if (step.kind === "task" && !taskDone) {
      audioBus().play("click", { bus: "ui", rate: 1 });
      setTaskStarted(true);
      return;
    }
    advance();
  };
  const dialogueLabel = step.kind === "task" && !taskDone ? t("letsGo") : step.kind === "watch" && !watchDone ? t("watching") : isLastStep ? t("toCheck") : t("next");

  const livePanels =
    (step.kind === "task" && taskStarted) || step.kind === "watch" ? (
      <>
        {step.kind === "task" && step.meters?.(ctx).map((m, i) => <Meter key={i} {...m} />)}
        {step.isr && ctx.replicas && <IsrPanel rs={ctx.replicas} />}
        {step.table && ctx.log && <StateTable table={ctx.log.table()} />}
        {step.seen && ctx.readers && level.txn && (
          <SeenBy
            readers={ctx.readers.map((r, i) => ({
              label: level.txn!.readers[i].label,
              color: level.txn!.readers[i].color,
              isolation: r.isolation,
              seen: r.seen,
            }))}
          />
        )}
        {step.receipts && ctx.replicas && <Receipts receipts={ctx.replicas.receipts} />}
        {step.groupStats && ctx.group && <GroupStats processed={ctx.group.processedCount} duplicates={ctx.group.duplicates} lost={ctx.group.lost()} lag={ctx.group.lag()} />}
        {step.kind === "task" && step.keyMoves && <KeyMoves cluster={cluster} topic={step.keyMoves.topic} keys={step.keyMoves.keys} />}
        {step.streams && <StreamsView kind={step.streams} ctx={ctx} topic={level.topics[0].name} consumers={level.consumers} />}
        {step.deliveries && <Deliveries items={ctx.delivered} />}
      </>
    ) : null;
  const hasLivePanels =
    !!livePanels &&
    ((step.kind === "task" && !!(step.meters || step.isr || step.table || step.seen || step.receipts || step.groupStats || step.keyMoves || step.deliveries || step.streams)) ||
      (step.kind === "watch" && !!(step.isr || step.table || step.seen || step.receipts || step.groupStats || step.deliveries || step.streams)));

  const startCheck = useCallback(
    (s: number) => {
      setQuestions(buildCheck(level, s));
      setAnswers([]);
      setPhase("check");
    },
    [level],
  );

  const advance = () => {
    if (!canAdvance) return;
    audioBus().play("click", { bus: "ui", rate: 1 });
    if (isLastStep) startCheck(seed);
    else enterStep(stepIndex + 1);
  };

  const answerPrediction = async (value: string | number) => {
    if (!prediction || picked !== undefined) return;
    setPicked(value);
    audioBus().play(String(value) === String(prediction.answer) ? "correct" : "wrong", { bus: "ui", rate: 1 });
    if (prediction.reveal) {
      setRevealing(true);
      await prediction.reveal(ctx);
      setRevealing(false);
    }
  };

  const finishCheck = (results: boolean[]) => {
    const stars = starsFor(results.filter(Boolean).length, questions.length);
    recordCheck(
      level.id,
      stars,
      questions.map((q, i) => ({ concept: q.concept, correct: results[i] })),
    );
    audioBus().play(stars > 0 ? "unlock" : "wrong", { bus: "ui", rate: 1 });
    setAnswers(results);
    setPhase("result");
  };

  const handlers: ToolHandlers = {
    action: (id) => {
      audioBus().play(/Crash/.test(id) ? "wrong" : /Restart/.test(id) ? "unlock" : "click", { bus: "ui", rate: id === "eventLate15" ? 0.8 : 1 });
      session.action(id);
      setTick((n) => n + 1);
    },
    actionPressed: (id) => {
      const a = ctx.auth;
      if (!a) return undefined;
      const map = { aclReadOrders: ["analytics", "Read", "topic:orders"], aclReadGroup: ["analytics", "Read", "group:analytics"], aclWriteInvoices: ["billing", "Write", "topic:invoices"], aclWriteOrders: ["analytics", "Write", "topic:orders"] } as const;
      const m = map[id as keyof typeof map];
      return m ? a.allows(m[0], m[1], m[2]) : undefined;
    },
    actionEnabled: (id) => {
      const { connector, app } = ctx;
      if (id === "connectorCrash") return !!connector?.running;
      if (id === "connectorRestart") return !!connector && !connector.running;
      if (id === "appCrash") return !!app?.running;
      if (id === "appRestart") return !!app && !app.running && !app.restoring;
      if (id === "removeField") return !!ctx.schemas?.registry.latest(ctx.schemas.subject)?.fields.some((f) => f.name === "note");
      if (id === "shareJoin") return (ctx.share?.alive.length ?? 9) < 4;
      if (id === "shareCrash") return (ctx.share?.alive.length ?? 0) > 1;
      return true;
    },
    send: (via, key, topic = "orders") => {
      session.send(via, key, topic);
      setTick((n) => n + 1);
    },
    setting: (field) => {
      if (field === "protocol" || field === "commit" || field === "maxPollRecords") return ctx.group?.opts[field];
      if (field === "acks") return ctx.replicas?.acks;
      if (field === "minInsync") return ctx.replicas?.minInsync;
      if (field === "retainSegments") return ctx.log ? (Number.isFinite(ctx.log.opts.retainSegments) ? ctx.log.opts.retainSegments : "all") : undefined;
      if (field === "unclean") return ctx.replicas?.unclean;
      if (field === "grace") return ctx.windows?.grace;
      if (field === "groupType") return ctx.share?.mode;
      if (field === "onFailure") return ctx.share?.onFailure;
      if (field === "sequential" || field === "zeroCopy" || field === "tls" || field === "batch") return ctx.perf?.settings[field];
      if (field === "quota") return ctx.perf?.quota;
      if (field === "compatibility") return ctx.schemas?.registry.compatibility;
      if (field === "listener") return ctx.security?.protocol;
      if (field === "idempotent") return ctx.retrying?.idempotent;
      return ctx.batching?.config[field];
    },
    setSetting: (field, value) => {
      audioBus().play("click", { bus: "ui", rate: 1.2 });
      session.setSetting(field, value);
      setTick((n) => n + 1);
    },
    member: (action) => {
      audioBus().play(action === "crash" ? "wrong" : "click", {
        bus: "ui",
        rate: action === "join" ? 1.2 : 0.8,
      });
      session.member(action);
      setTick((n) => n + 1);
    },
    members: () => ctx.group?.alive.length ?? 0,
    broker: (action, name) => {
      audioBus().play(action === "revive" ? "unlock" : action === "crash" ? "wrong" : "click", { bus: "ui", rate: action === "crash" ? 0.7 : 1 });
      session.broker(action, name);
      setTick((n) => n + 1);
    },
    brokers: () =>
      ctx.replicas
        ? ctx.replicas.replicas.map((r) => ({
            name: r,
            down: ctx.replicas!.down.has(r),
            slow: ctx.replicas!.slow.has(r),
            leader: ctx.replicas!.leader === r,
          }))
        : [],
    txn: (action) => {
      audioBus().play(action === "commit" ? "unlock" : action === "abort" ? "wrong" : "click", { bus: "ui", rate: 1 });
      session.txnAction(action);
      setTick((n) => n + 1);
    },
    txnOpen: () => !!ctx.txn?.open,
    clean: () => {
      audioBus().play("unlock", { bus: "ui", rate: 0.9 });
      ctx.log?.clean();
      setTick((n) => n + 1);
    },
    tombstone: (topic, key) => {
      session.tombstone(topic, key);
      setTick((n) => n + 1);
    },
    crashController: () => {
      audioBus().play("wrong", { bus: "ui", rate: 0.8 });
      session.crashController();
      setTick((n) => n + 1);
    },
    crash: () => {
      audioBus().play("wrong", { bus: "ui", rate: 0.7 });
      ctx.replicas?.crashLeader();
      setTick((n) => n + 1);
    },
    produce: (topic, key, value, headers: Headers, roundRobin) => {
      session.produce(topic, key, value, headers, roundRobin);
    },
    addPartition: (topic) => {
      session.addPartition(topic);
      audioBus().play("unlock", { bus: "ui", rate: 1.3 });
    },
    fetch: (group, topic, partition) => {
      if (!cluster.fetch(group, topic, partition)) audioBus().play("wrong", { bus: "ui", rate: 1.2 });
    },
    route: (ok, topic, key, value) => {
      session.route(ok, topic, key, value);
      if (!ok) {
        audioBus().play("wrong", { bus: "ui", rate: 1 });
        setTick((n) => n + 1);
      }
    },
  };

  useEffect(() => {
    window.__TEST__ = {
      ...window.__TEST__,
      phase: () => phase,
      step: () => ({ index: stepIndex, kind: step.kind }),
      prediction: () =>
        prediction && {
          answer: prediction.answer,
          input: prediction.input.type,
        },
      cluster: () => ({
        endOffsets: cluster.topicList.map((tp) => tp.endOffsets()),
      }),
      musicStarted: () => backgroundMusic().started,
    };
  });

  const labels = useMemo(
    () => ({
      producer: ts("producer"),
      partitioner: ts("partitioner"),
      topic: (name: string) => ts("topic", { name }),
      partition: (n: number) => ts("partition", { n }),
      next: (n: number) => ts("next", { n }),
      batch: (p: number, count: number, size: number) =>
        ts("batch", {
          p,
          bar: "▮".repeat(count) + "▯".repeat(Math.max(0, size - count)),
        }),
      ackLost: ts("ackLost"),
      dupDropped: (seq: number) => ts("dupDropped", { seq }),
      replica: (name: string, role: "leader" | "follower" | "lagging" | "down") => ts("replica", { n: name.replace(/\D/g, ""), role }),
      controller: (name: string, role: "active" | "standby" | "down") => ts("controller", { n: name.replace(/\D/g, ""), role }),
      rejected: (reason: string) => ts(`rejected.${reason}`),
      segment: (index: number, state: "active" | "closed" | "remote") => ts("segment", { index, state }),
    }),
    [ts],
  );

  const correctCount = answers.filter(Boolean).length;
  const stars = phase === "result" ? starsFor(correctCount, questions.length) : 0;
  const upNext = nextLevel(level.id);

  return (
    <main className="relative h-dvh overflow-hidden isolate bg-scene">
      <Backdrop />
      <AudioDirector intensity={phase === "steps" && step.kind === "task" ? 2 : phase === "result" ? 1 : 0} />

      {/* The factory fills the screen; UI floats on top and the camera frames the free area */}
      {phase === "steps" && (
        <section className="absolute inset-0" data-testid="stage">
          <FactoryCanvas
            cluster={cluster}
            labels={labels}
            slots={level.slots}
            consumers={level.consumers}
            replicas={level.producer?.replicas?.names}
            memberArms={!!level.group}
            controllers={level.producer?.replicas?.controllers}
            consumersOverride={level.txn?.readers.map((r) => ({
              group: r.group,
              label: r.label,
              color: r.color,
            }))}
            segmentSize={level.storage?.options.segmentSize}
            insets={insets}
            onLanded={onLanded}
          />
        </section>
      )}

      <header ref={headerRef} className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-3 pt-3 sm:px-5">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
          <Link href="/world" aria-label={t("map")} className={gameButtonClass({ size: "icon" })}>
            <ArrowLeft weight="bold" />
          </Link>
          <div className="min-w-0 leading-tight">
            <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-ink-2">{t("levelLabel", { world: level.world, id: level.id })}</p>
            <h1 className="truncate font-display text-xl font-extrabold tracking-tight sm:text-2xl">
              <Text m={level.title} />
            </h1>
          </div>
        </div>
        <ol className="card pointer-events-auto hidden items-center gap-1.5 px-3 py-2 md:flex" aria-label={t("progress")}>
          {level.steps.map((_, i) => (
            <li key={i} className={`h-2 rounded-full transition-all ${phase !== "steps" || i < stepIndex ? "w-2 bg-broker" : i === stepIndex ? "w-6 bg-partition" : "w-2 bg-ink/20"}`} />
          ))}
          <li className={`ml-1 grid size-5 place-items-center rounded-full ${phase === "steps" ? "bg-ink/10 text-ink-2" : "bg-producer text-white"}`}>
            <Brain size={12} weight="bold" />
          </li>
        </ol>
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" onClick={restart} aria-label={t("restart")} title={t("restart")} className={gameButtonClass({ size: "icon" })}>
            <ArrowCounterClockwise weight="bold" />
          </button>
          <Hud />
        </div>
      </header>

      {phase === "steps" && (
        <>
          {/* Phones: objective + live data stack under the header; wide screens: their own spots */}
          <div className="absolute inset-x-3 top-[72px] z-10 flex flex-col items-center gap-2 lg:contents">
            {/* Task objective: a compact bar at the top centre while the player works */}
            {step.kind === "task" && taskStarted && !taskDone && taskProgress && (
              <div
                ref={objectiveRef}
                data-objective
                className="card flex w-full max-w-[560px] items-center gap-3 px-4 py-2.5 lg:absolute lg:left-1/2 lg:top-[72px] lg:z-10 lg:w-[560px] lg:-translate-x-1/2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-xs font-bold uppercase tracking-[0.14em] text-producer-dark">{t("objective")}</span>
                  <span className="block truncate font-display text-lg font-extrabold leading-tight">
                    <Text m={step.title} />
                  </span>
                </span>
                <span className="w-28 shrink-0">
                  <span className="block h-2.5 overflow-hidden rounded-full bg-paper-2">
                    <motion.span
                      className="block h-full rounded-full bg-broker"
                      animate={{
                        width: `${(Math.min(taskProgress.done, taskProgress.total) / taskProgress.total) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="mt-1 block text-right font-mono text-xs font-bold text-ink-2">
                    {Math.min(taskProgress.done, taskProgress.total)}/{taskProgress.total}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setTaskStarted(false)}
                  className={gameButtonClass({
                    variant: "ghost",
                    size: "sm",
                  })}
                  aria-label={t("reread")}
                >
                  ?
                </button>
              </div>
            )}

            {/* Live data (meters, receipts, ISR…): right on desktop, under the header on phones */}
            {hasLivePanels && (
              <aside ref={sideRef} className="card max-h-[24dvh] w-full overflow-y-auto px-4 pb-4 pt-1 lg:absolute lg:right-4 lg:top-[84px] lg:z-10 lg:max-h-[calc(100dvh-220px)] lg:w-[320px]">
                {livePanels}
              </aside>
            )}
          </div>

          <div ref={dockRef} className="absolute inset-x-3 bottom-3 z-10 flex flex-col items-center gap-3 sm:bottom-4">
            {step.kind === "predict" && prediction && picked !== undefined && <Verdict key={stepIndex} correct={String(picked) === String(prediction.answer)} />}
            {/* Big centred answers for predictions */}
            {step.kind === "predict" && prediction && questionRead && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`card max-w-[720px] p-4 sm:p-5 ${prediction.input.type === "choice" ? "w-full" : "w-fit"}`}>
                <AnswerInput
                  key={stepIndex}
                  big
                  input={prediction.input}
                  partitions={prediction.input.type === "partition" ? cluster.topic(prediction.input.topic).numPartitions : undefined}
                  disabled={picked !== undefined}
                  picked={picked}
                  answer={prediction.answer}
                  onAnswer={(v) => void answerPrediction(v)}
                />
              </motion.div>
            )}

            {showDock ? (
              <ToolDock tools={(step as Extract<typeof step, { kind: "task" }>).tools} consumers={level.consumers ?? []} partitions={(tp) => cluster.topic(tp).numPartitions} on={handlers} />
            ) : (
              <DialogueBox
                key={dialogueKey}
                speaker="Oopi"
                kicker={t(`kind.${step.kind}`)}
                tone={step.kind === "predict" && prediction && picked !== undefined && !revealing ? (String(picked) === String(prediction.answer) ? "good" : "bad") : undefined}
                pages={dialoguePages}
                canAdvance={dialogueCanAdvance}
                onAdvance={dialogueAdvance}
                advanceLabel={dialogueLabel}
                onLastPage={() => step.kind === "predict" && setQuestionRead(true)}
                footer={step.kind === "predict" && picked === undefined ? <span className="text-sm font-semibold text-ink-2">{t("chooseAbove")}</span> : undefined}
              />
            )}
          </div>
        </>
      )}

      {/* Recall check: the stage is hidden on purpose (testing effect) */}
      {phase === "check" && questions.length > 0 && (
        <div className="absolute inset-0 flex flex-col pt-16">
          <RecallQuiz key={seed} questions={questions} title={t("checkTitle")} onFinish={finishCheck} />
        </div>
      )}

      {phase === "result" && (
        <div className="absolute inset-0 flex items-center justify-center px-4 pb-6 pt-20">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-md p-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/sprites/oopi.png" alt="" width={88} height={88} className="mx-auto size-22" />
            <div className="mt-2 flex justify-center gap-1.5" aria-label={t("stars", { n: stars })}>
              {[1, 2, 3].map((n) => (
                <motion.span
                  key={n}
                  initial={{ scale: 0, rotate: -40 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    delay: 0.15 * n,
                    type: "spring",
                    stiffness: 400,
                    damping: 12,
                  }}
                >
                  <Star size={40} weight="fill" className={n <= stars ? "text-producer" : "text-ink/15"} />
                </motion.span>
              ))}
            </div>
            <h2 className="mt-3 font-display text-2xl font-extrabold">{stars > 0 ? t("passed") : t("almost")}</h2>
            <p className="mt-1 text-ink-2">{t("score", { correct: correctCount, total: questions.length })}</p>
            {stars === 0 && <p className="mt-3 text-sm text-ink-2">{t("remedial")}</p>}
            <div className="mt-6 grid gap-2.5">
              {stars > 0 && upNext ? (
                <Link
                  href={`/level/${upNext.id}`}
                  className={gameButtonClass({
                    variant: "primary",
                    size: "md",
                  })}
                >
                  {t("nextLevel")}: {tl(upNext.title.key)}
                  <ArrowRight weight="bold" />
                </Link>
              ) : stars === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const s = seed + 1;
                    setSeed(s);
                    startCheck(s);
                  }}
                  className={gameButtonClass({
                    variant: "primary",
                    size: "md",
                  })}
                >
                  <ArrowCounterClockwise weight="bold" />
                  {t("retryCheck")}
                </button>
              ) : null}
              <Link href="/world" className={gameButtonClass({ size: "md" })}>
                <MapTrifold weight="bold" />
                {t("map")}
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}
