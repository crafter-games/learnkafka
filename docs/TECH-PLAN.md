# Technical plan — Kafka Express

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (latest, App Router, TypeScript, `output: "standalone"`) | Requirement; standalone output gives a small Docker image |
| Styling | Tailwind CSS v4 + CSS variables from the GDD palette | Fast, themeable |
| i18n | `next-intl` with `[locale]` segment (`/en`, `/es`), middleware locale detection | First-class App Router support; typed messages |
| Simulation render | `pixi.js` v8 + `@pixi/react` (client-only, `dynamic(..., { ssr:false })`) | Handles hundreds of animated sprites at 60 fps |
| UI animation | `motion` (Framer Motion) | Menus, cards, quizzes |
| Audio | `howler` behind our own `AudioBus` (master/music/sfx/ui, ducking, layered music) | Mobile unlock, sprites, fades |
| State | `zustand` (+ `persist` → localStorage) for progress, settings, Leitner boxes | Tiny; works outside React (sim → audio) |
| Tests | Vitest (sim engine, partitioner, scheduler) + Playwright (playtests with screenshots) | Sim must match Kafka semantics |

## Architecture

```
app/[locale]/            pages: landing, map, level/[id], sandbox, review
src/sim/                 PURE TS Kafka model — no React, no Pixi
  murmur2.ts             Kafka-compatible hash (tested against known vectors)
  cluster.ts topic.ts partition.ts producer.ts consumerGroup.ts
  events.ts              typed SimEvent union + tiny emitter
src/stage/               Pixi renderer: subscribes to SimEvents → tweens/sprites
src/audio/               AudioBus + SFX map (SimEvent → sound key)
src/levels/              level definitions (data): steps, predictions, incidents, checks
  w1/1-1-first-parcel.ts ...
src/learning/            leitner.ts (spacing), mastery.ts (80% gate), adaptive.ts
messages/en.json es.json UI strings; level text keyed by level id
public/audio/            sfx + music (CC0 / generated), CREDITS.md
```

Key rule: **the simulation emits events and has no other side effects.** The stage, the audio and the level engine all subscribe to those events. This keeps the sim unit-testable, keeps sound effects tied to real Kafka events, and lets `window.__TEST__` expose sim state for Playwright playtests.

Level definitions are data (typed TS objects) referencing message keys, so a new level needs **no new engine code** and translation is just JSON.

## Deployment (Dokploy VPS)

1. Create a GitHub repo (e.g. `<owner>/learnkafka`) and push.
2. `Dockerfile` (multi-stage, node:22-alpine, `next build` standalone) with `HOSTNAME=0.0.0.0`, `PORT=3000`.
3. Run:
   ```bash
   PROJECT=$(vps project create learnkafka --json | jq -r '.projectId')
   ENV_ID=$(vps project info "$PROJECT" --json | jq -r '.environments[0].environmentId')
   APP=$(vps github deploy <owner>/learnkafka -e "$ENV_ID" --branch main --build-type dockerfile --dockerfile ./Dockerfile --json | jq -r '.applicationId')
   crafters domain add learnkafka --ip $(vps status --json | jq -r '.ip')
   vps domain add learnkafka.crafter.run --app "$APP" --port 3000 --json
   ```
4. Redeploys: `vps app redeploy <appId>` (or Dokploy autodeploy on push).

## Milestone breakdown

- **M1**: scaffold (create-next-app, next-intl, tailwind, pixi, howler, zustand) → `murmur2` + Partition/Topic sim with tests → Pixi stage with 3 belts + produce interaction → 4 SFX via AudioBus → EN/ES → Dockerfile → deploy.
- **M2**: level engine state machine + step components (Brief, MappingCard, Predict, Watch, Complete, Solo, Incident, RecallCheck, Result) → localStorage progress + mastery gate → World 1 content (EN/ES) → playtest script.
- **M3**: Producers sim (batching, acks, idempotence), Consumer group sim (assignment, rebalance protocols, commits, lag) → Worlds 2–4 → sandbox → Leitner Morning Shift → world map.
- **M4**: music (Suno) + full SFX, ducking, onboarding glossary, reduced motion, a11y (keyboard, ARIA for quizzes), CREDITS, Lighthouse, playtest the production Docker build.

## Risks

- **Content accuracy.** Every Kafka claim cites `docs/research/kafka-curriculum.md`. Items marked [unverified] are checked before they ship.
- **Translation quality.** Spanish uses neutral Latin American Spanish. Kafka terms (offset, broker, partition) stay in English and get a glossary gloss.
- **Audio autoplay.** The AudioBus unlocks audio on the first user gesture.
