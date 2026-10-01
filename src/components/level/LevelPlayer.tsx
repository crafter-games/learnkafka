"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
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
import { AnswerInput, Breaks, CodeBlock, Deliveries, Feedback, GroupStats, IsrPanel, SeenBy, StateTable, KeyMoves, MappingCard, Meter, Receipts, Text } from "./parts";
import { RecallQuiz } from "./RecallQuiz";
import { useInsets } from "../useInsets";
import { ToolDock, type ToolHandlers } from "./ToolDock";

type Phase = "steps" | "check" | "result";

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

  // Check state
  const [seed, setSeed] = useState(newSeed);
  const [questions, setQuestions] = useState<BuiltQuestion[]>([]);
  const [answers, setAnswers] = useState<boolean[]>([]);

  const step = level.steps[stepIndex];
  const isLastStep = stepIndex === level.steps.length - 1;
  const headerRef = useRef<HTMLElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const insets = useInsets({ header: headerRef, side: sideRef, dock: dockRef }, [phase, stepIndex]);
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
    setPrediction(next.kind === "predict" ? next.build(ctx) : null);
    if (next.kind === "watch") void next.script(ctx).then(() => setWatchDone(true));
    if (next.kind === "task") next.onEnter?.(ctx);
  };

  useEffect(() => () => session.dispose(), [session]);

  // Explanations duck the music; hands-on steps let it breathe
  useEffect(() => {
    const reading = phase !== "steps" || step.kind === "brief" || step.kind === "predict";
    backgroundMusic().duck(reading);
    return () => backgroundMusic().duck(false);
  }, [phase, step]);

  const taskProgress = step.kind === "task" ? step.progress(ctx, session.stepStart) : null;
  const taskDone = !!taskProgress && taskProgress.done >= taskProgress.total;

  const [celebrated, setCelebrated] = useState(-1);
  if (taskDone && celebrated !== stepIndex) {
    setCelebrated(stepIndex);
    audioBus().play("unlock", { bus: "ui", rate: 1 });
  }

  const canAdvance =
    step.kind === "brief" || (step.kind === "watch" && watchDone) || (step.kind === "predict" && picked !== undefined && !revealing) || taskDone;

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
    recordCheck(level.id, stars, questions.map((q, i) => ({ concept: q.concept, correct: results[i] })));
    audioBus().play(stars > 0 ? "unlock" : "wrong", { bus: "ui", rate: 1 });
    setAnswers(results);
    setPhase("result");
  };

  const handlers: ToolHandlers = {
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
      if (field === "idempotent") return ctx.retrying?.idempotent;
      return ctx.batching?.config[field];
    },
    setSetting: (field, value) => {
      audioBus().play("click", { bus: "ui", rate: 1.2 });
      session.setSetting(field, value);
      setTick((n) => n + 1);
    },
    member: (action) => {
      audioBus().play(action === "crash" ? "wrong" : "click", { bus: "ui", rate: action === "join" ? 1.2 : 0.8 });
      session.member(action);
      setTick((n) => n + 1);
    },
    members: () => ctx.group?.alive.length ?? 0,
    broker: (action, name) => {
      audioBus().play(action === "revive" ? "unlock" : action === "crash" ? "wrong" : "click", { bus: "ui", rate: action === "crash" ? 0.7 : 1 });
      session.broker(action, name);
      setTick((n) => n + 1);
    },
    brokers: () => ctx.replicas ? ctx.replicas.replicas.map((r) => ({ name: r, down: ctx.replicas!.down.has(r), slow: ctx.replicas!.slow.has(r), leader: ctx.replicas!.leader === r })) : [],
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

  // Enter = next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (phase === "steps") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    window.__TEST__ = {
      ...window.__TEST__,
      phase: () => phase,
      step: () => ({ index: stepIndex, kind: step.kind }),
      prediction: () => prediction && { answer: prediction.answer, input: prediction.input.type },
      cluster: () => ({ endOffsets: cluster.topicList.map((tp) => tp.endOffsets()) }),
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
      batch: (p: number, count: number, size: number) => ts("batch", { p, bar: "▮".repeat(count) + "▯".repeat(Math.max(0, size - count)) }),
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
    <main className="relative h-dvh overflow-hidden bg-ground">
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
            consumersOverride={level.txn?.readers.map((r) => ({ group: r.group, label: r.label, color: r.color }))}
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
            <li
              key={i}
              className={`h-2 rounded-full transition-all ${phase !== "steps" || i < stepIndex ? "w-2 bg-broker" : i === stepIndex ? "w-6 bg-partition" : "w-2 bg-ink/20"}`}
            />
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
        <aside
          ref={sideRef}
          className="absolute inset-x-3 bottom-3 z-10 flex max-h-[52dvh] flex-col gap-2 lg:bottom-auto lg:left-5 lg:right-auto lg:top-[84px] lg:max-h-[calc(100dvh-100px)] lg:w-[400px]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="card flex min-h-0 flex-col overflow-hidden"
            >
                <div className="min-h-0 overflow-y-auto px-5 pb-2 pt-4">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/sprites/oopi.png" alt="" width={36} height={36} className="size-9 shrink-0" />
                <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-producer-dark">{t(`kind.${step.kind}`)}</p>
              </div>

              {step.kind === "brief" && (
                <>
                  <h2 className="mt-2 font-display text-[1.375rem] font-extrabold leading-tight">
                    <Text m={step.title} />
                  </h2>
                  <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-ink-2">
                    <Text m={step.body} />
                  </p>
                  {step.code && <div className="mt-3"><CodeBlock code={step.code} /></div>}
                  {step.mapping ? <MappingCard items={step.mapping} breaks={step.breaks} /> : step.breaks && <Breaks m={step.breaks} />}
                </>
              )}

              {(step.kind === "watch" || step.kind === "task") && (
                <>
                  <h2 className="mt-2 font-display text-[1.375rem] font-extrabold leading-tight">
                    <Text m={step.title} />
                  </h2>
                  <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-ink-2">
                    <Text m={step.body} />
                  </p>
                </>
              )}

              {step.kind === "task" && taskProgress && (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                    <motion.div className="h-full rounded-full bg-broker" animate={{ width: `${(Math.min(taskProgress.done, taskProgress.total) / taskProgress.total) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-ink-2">
                    {Math.min(taskProgress.done, taskProgress.total)}/{taskProgress.total}
                  </p>
                  {taskDone && (
                    <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-xl bg-broker/10 px-3 py-2 text-sm font-semibold text-broker">
                      <Text m={step.success} />
                    </motion.p>
                  )}
                </div>
              )}

              {step.kind === "task" && step.meters?.(ctx).map((m, i) => <Meter key={i} {...m} />)}
              {(step.kind === "task" || step.kind === "watch") && step.isr && ctx.replicas && <IsrPanel rs={ctx.replicas} />}
              {(step.kind === "task" || step.kind === "watch") && step.table && ctx.log && <StateTable table={ctx.log.table()} />}
              {(step.kind === "task" || step.kind === "watch") && step.seen && ctx.readers && level.txn && (
                <SeenBy readers={ctx.readers.map((r, i) => ({ label: level.txn!.readers[i].label, color: level.txn!.readers[i].color, isolation: r.isolation, seen: r.seen }))} />
              )}
              {(step.kind === "task" || step.kind === "watch") && step.receipts && ctx.replicas && <Receipts receipts={ctx.replicas.receipts} />}
              {(step.kind === "task" || step.kind === "watch") && step.groupStats && ctx.group && (
                <GroupStats processed={ctx.group.processedCount} duplicates={ctx.group.duplicates} lost={ctx.group.lost()} lag={ctx.group.lag()} />
              )}
              {step.kind === "task" && step.keyMoves && <KeyMoves cluster={cluster} topic={step.keyMoves.topic} keys={step.keyMoves.keys} />}
              {((step.kind === "task" || step.kind === "watch") && step.deliveries) && <Deliveries items={ctx.delivered} />}

              {step.kind === "predict" && prediction && (
                <>
                  <h2 className="mt-2 font-display text-xl font-extrabold leading-snug">
                    <Text m={prediction.prompt} />
                  </h2>
                  {prediction.code && <div className="mt-3"><CodeBlock code={prediction.code} /></div>}
                  <div className="mt-3">
                    <AnswerInput
                      key={stepIndex}
                      input={prediction.input}
                      partitions={prediction.input.type === "partition" ? cluster.topic(prediction.input.topic).numPartitions : undefined}
                      disabled={picked !== undefined}
                      picked={picked}
                      answer={prediction.answer}
                      onAnswer={(v) => void answerPrediction(v)}
                    />
                  </div>
                  {picked !== undefined && !revealing && <Feedback correct={String(picked) === String(prediction.answer)} explain={prediction.explain} />}
                  {revealing && <p className="mt-3 text-sm font-semibold text-partition">{t("watch")}</p>}
                </>
              )}

              </div>
              <div className="border-t border-line px-5 py-3">
              <button type="button" onClick={advance} disabled={!canAdvance} className={`${gameButtonClass({ variant: "primary", size: "md" })} w-full`}>
                {isLastStep ? t("toCheck") : t("next")}
                <ArrowRight weight="bold" />
              </button>
              </div>
            </motion.div>
          </AnimatePresence>

          {step.kind === "task" && (
            <div ref={dockRef} className="lg:fixed lg:bottom-3 lg:left-[436px] lg:right-5">
              <ToolDock tools={step.tools} consumers={level.consumers ?? []} partitions={(tp) => cluster.topic(tp).numPartitions} on={handlers} />
            </div>
          )}
        </aside>
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
                <motion.span key={n} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15 * n, type: "spring", stiffness: 400, damping: 12 }}>
                  <Star size={40} weight="fill" className={n <= stars ? "text-producer" : "text-ink/15"} />
                </motion.span>
              ))}
            </div>
            <h2 className="mt-3 font-display text-2xl font-extrabold">{stars > 0 ? t("passed") : t("almost")}</h2>
            <p className="mt-1 text-ink-2">{t("score", { correct: correctCount, total: questions.length })}</p>
            {stars === 0 && <p className="mt-3 text-sm text-ink-2">{t("remedial")}</p>}
            <div className="mt-6 grid gap-2.5">
              {stars > 0 && upNext ? (
                <Link href={`/level/${upNext.id}`} className={gameButtonClass({ variant: "primary", size: "md" })}>
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
                  className={gameButtonClass({ variant: "primary", size: "md" })}
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
