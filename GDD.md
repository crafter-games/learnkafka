# Kafka Express

> You are the new dispatcher at **Kafka Express**, the logistics hub that moves every event in the city. You route parcels, run conveyor belts and keep the delivery crews working, so that the city's events never get lost, duplicated or stuck.

| | |
| --- | --- |
| Engine | Next.js (App Router, TS) + **PixiJS v8** simulation stage + React/Motion UI |
| Platform | Web. Desktop-first; tablet and phone playable in landscape |
| View | 2D, flat-vector top-down "control room" diagram that animates |
| Scope | Small release. v1 = Worlds 1–4 (17 levels) + sandbox + daily review |
| References | Mini Metro (clean animated networks), Human Resource Machine (puzzles teach a system), Brilliant (lesson → practice → review) |
| Languages | English + Spanish (`/en`, `/es`) |
| Domain | `learnkafka.crafter.run` (Dokploy VPS) |

Design rules are derived from `docs/research/learning-science.md`. Kafka facts come from `docs/research/kafka-curriculum.md` (Kafka 4.3).

## Core loop

Each level takes 3–6 minutes and runs as **Brief → Predict → Watch / Complete / Solo → Incident → Recall check**.
1. A one-sentence brief plus a **mapping card** (e.g. belt = partition) with a "where the metaphor breaks" note.
2. Before every simulation step, the player **predicts** the outcome by tapping a partition or choosing a consumer.
3. The simulation plays the result. A correct prediction gets a click and a glow. A wrong one gets a slow-motion replay with a one-line *why*.
4. An **incident** (a jam, a crash, duplicates) must be fixed with the tools learned so far.
5. A **recall check** with the stage hidden: 3–5 items in mixed formats. Scoring 80% or more unlocks the next level. Below that, the player gets a remedial variant with new numbers.

Players come back for the **Morning Shift**, a daily 3–5 card spaced review of their weakest concepts, and to unlock new **tools** for the sandbox.

## First 30 seconds

1. The landing page shows a dark city skyline with belts humming quietly, the title, a language toggle (EN/ES) and **Start shift**. Music starts on the first click (browser autoplay rule).
2. A 60-second glossary pre-training: 5 icons (event parcel, topic, partition belt, offset stamp, consumer crew). Each icon is tapped to reveal its name.
3. Level 1.1: one parcel sits on the dock. The player drags it onto the belt, it gets stamped **offset 0**, and a satisfying *thunk* plays.
4. Prediction: "The next parcel gets which stamp?" The player taps **1**, it is confirmed, and the first star appears.

## Controls

| Action | Mouse / Keyboard | Touch |
| --- | --- | --- |
| Produce / place parcel | drag, or click a source then a belt; `1–9` picks a partition | drag / tap-tap |
| Predict | click target; `1–9`, `Enter` confirms | tap |
| Step / play / pause sim | `Space` (step), `P` (play/pause) | ▶ button |
| Adjust dial (partitions, acks, linger…) | slider / `←→` | slider |
| Mute music / all | `M` / `Shift+M` | 🔈 always visible in HUD |
| Back / pause menu | `Esc` | ☰ |

## Mechanics

### Simulation model (deterministic, tick-based, no real Kafka)
- Tick = 100 ms (tune). Every visual and sound is driven by **sim events** (`produced`, `appended`, `fetched`, `committed`, `rebalanceStart`, `brokerDown`, …).
- Partitioning uses real `murmur2(key) % n`, so learners can check the results against real Kafka.
- Defaults shown match Kafka 4.3: `acks=all`, `enable.idempotence=true`, `linger.ms=5`, `batch.size=16384`, `auto.offset.reset=latest`, `enable.auto.commit=true`.

### Concreteness fading (per world)
- Early levels use the **metaphor** (parcels, belts, trucks, crews), middle levels use **icons** (boxes and arrows), and the final level of each world is **abstract**: real config snippets and `kafka-console-*` / `kafka-consumer-groups --describe` output that the player reads or edits.

### Mastery and spacing
- Each concept has a memory strength stored in a Leitner box (1, 2, 4, 8 and 16 days, tune). Concepts are re-asked in levels N+2 and N+5.
- Review rounds **interleave** confusable pairs: `acks=1` vs `all`, partition vs replica, commit before vs after processing.
- Adaptive difficulty targets 70–85% success: two misses in a row add a hint step, and three perfect answers skip the "Watch" stage.

### Levels v1

| # | World | Level | Teaches | Incident / challenge |
|---|---|---|---|---|
| 1.1 | Events & Log | First parcel | record = key, value, headers, timestamp | build a record from parts |
| 1.2 | | The belt never forgets | append-only; reading ≠ deleting | two crews read the same parcels |
| 1.3 | | Stamps | offsets per partition | predict the next offsets |
| 1.4 | | Sorting docks | topics | route mixed parcels to topics (abstract: `kafka-topics --create`) |
| 2.1 | Partitions & Keys | Traffic jam | partitions = parallelism | *challenge-first*: one belt overflows |
| 2.2 | | Same customer, same belt | key hashing → per-key order | *challenge-first*: round-robin breaks order |
| 2.3 | | No label? | null keys, sticky batches | — |
| 2.4 | | New belt, new chaos | adding partitions remaps keys | order breaks after a resize |
| 3.1 | Producers | Trucks wait or go | batching, `linger.ms`, `batch.size` | latency vs throughput sliders |
| 3.2 | | Vacuum pack | compression per batch | fit X MB/s into a pipe |
| 3.3 | | Signed receipts | `acks` 0/1/all | leader crashes after the ack |
| 3.4 | | Lost receipt | retries + idempotence | duplicates appear when idempotence is off |
| 4.1 | Consumers & Groups | Pull, don't push | poll loop, position | — |
| 4.2 | | Crews | consumer groups, 1 partition → 1 member, idle extras | 5 crews on 3 belts |
| 4.3 | | New hire | rebalance: eager vs cooperative vs KIP-848 | minimise stopped belts |
| 4.4 | | Bookmarks | commits, at-least/at-most-once, `auto.offset.reset` | crash between process and commit |
| 4.5 | | **Boss: Rush hour** | lag (high watermark − committed) | lag climbs; fix it with the right lever |

**Sandbox ("Control room")**: free play with the dials unlocked so far (partitions, keys, acks, linger, consumers, crash buttons). There is no scoring.

## Win, fail, restart

- **Fail** a recall check (under 80%) → a remedial variant with new numbers, no penalty screen.
- **Fail** an incident (lag over the limit or a parcel lost) → slow-motion replay of the cause, then retry from the incident start.
- **Win** a level → 1–3 stars (stars = mastery on the check, not speed). The next level unlocks and a tool may unlock in the sandbox.
- **Restart** is instant from the pause menu.

## Challenge and progression

- Difficulty ramps by adding dials and failure modes, not speed. Each world adds about 2 dials and 1 failure mode.
- Progress is a **world map** of the hub: districts light up as worlds are mastered. A **concept mastery map** shows the strength of each concept.
- **No global leaderboards, no XP for logging in.** Streaks count completed reviews only and are shown against the player's own past.

## Game feel

- Parcel lands → squash & stretch (scale 1.15 → 1, 120 ms) and an offset stamp pop.
- Correct prediction → target glow + rising chime. Wrong → gentle desaturate, then a 0.5× replay.
- Broker crash → 150 ms screen shake (4 px, tune), red flash on the affected belt, and alarm SFX.
- Rebalance → the paused belts dim and a "whoosh" plays as partitions slide to their new crews.
- **Juice budget:** effects only on events that matter to Kafka. No decorative particles while the player is learning (seductive-details rule).
- `prefers-reduced-motion` turns off shake and flashes.

## Art direction

- **Style**: flat vector drawn in code (Pixi Graphics + SVG UI), rounded shapes, 2 px strokes, isometric-free.
- **Palette**: `#0B1020` bg · `#141B34` panels · `#FFB020` producers/parcels · `#22D3EE` partitions/belts · `#A78BFA` consumers · `#34D399` brokers/healthy · `#F43F5E` danger · `#E6EAF2` text.
- **Readability**: each Kafka role always has the same colour and shape. Labels sit *on* the objects (offset on the parcel). Only the thing that changed animates. Text contrast is at least 4.5:1.
- **Type**: Space Grotesk (UI), JetBrains Mono (offsets, configs, CLI).
- **Stage**: logical 1280×720, scaled to fit, letterboxed. The HUD is anchored to the safe area.
- **HUD**: top-left level title + step dots · top-right mute, language, pause · bottom concept dock with dials.

## Audio

- **Buses**: master / music / sfx / ui. Music **ducks −12 dB** during Brief, Predict and Recall check, and plays at full volume in menus, the sandbox and incidents.
- **Music**: `music_calm` (lo-fi synth, ~90 BPM) for the map and levels; an `music_incident` layer is added on top when an incident starts (same key and tempo, crossfaded in 1 s). Generated with the Suno skill.
- **SFX** (each one is a Kafka event): produce, append/stamp, fetch, commit, rebalance, broker down, leader elected, duplicate, lag warning, correct, wrong, unlock, UI click.

## Assets

| Key | Description | Source | Status |
| --- | --- | --- | --- |
| sprites (all) | parcels, belts, trucks, crews, brokers | code-drawn (Pixi Graphics) | todo |
| ui_icons | HUD and menu icons | game-icons.net / Lucide (MIT) | todo |
| font_ui / font_mono | Space Grotesk / JetBrains Mono | Google Fonts via `next/font` (OFL) | todo |
| sfx_produce | soft whoosh | kenney:interface-sounds / jsfxr | todo |
| sfx_stamp | thunk + click | kenney:impact-sounds | todo |
| sfx_fetch | short pickup | kenney:interface-sounds | todo |
| sfx_commit | bookmark click | kenney:ui-audio | todo |
| sfx_rebalance | whoosh sweep | jsfxr | todo |
| sfx_broker_down | alarm | kenney:sci-fi-sounds | todo |
| sfx_leader_elected | triumphant blip | jsfxr | todo |
| sfx_duplicate | double-honk | jsfxr | todo |
| sfx_lag_warn | rising pulse | jsfxr | todo |
| sfx_correct / sfx_wrong | chime / soft buzz | kenney:interface-sounds | todo |
| sfx_unlock | sparkle | kenney:interface-sounds | todo |
| music_calm | calm loop, ~90 BPM | generate (Suno) | todo |
| music_incident | tension layer, same key/tempo | generate (Suno) | todo |

## Milestones

1. **M1: Core verb, deployed**: on a blank stage, click/drag to produce a keyed parcel. It hashes (murmur2) onto 1 of 3 belts, gets an offset stamp and plays its SFX. EN/ES toggle works. Live at `learnkafka.crafter.run`.
2. **M2: Level loop**: level engine (Brief → Predict → Watch/Complete/Solo → Incident → Recall check), mastery gate, progress saved in localStorage. **World 1 complete.**
3. **M3: Content**: Worlds 2–4, sandbox, Morning Shift spaced review, world map.
4. **M4: Juice & ship**: adaptive music, full SFX, glossary onboarding, reduced motion, accessibility pass, CREDITS, playtest of the production build.

## Out of scope for v1

- Worlds 5–9: Brokers & Replication, Delivery semantics & Transactions, Retention/Compaction/Tiered, Share groups & Performance, Ecosystem (Connect/Streams/Schema Registry/Security) → v1.1+
- User accounts / Postgres sync (v2), leaderboards (never global), voice narration, a real Kafka cluster backend, multiplayer.

## Changelog

- 2026-10-01: GDD created after research and a design interview (all recommendations accepted).
- 2026-10-01: M1 done — dispatch desk (murmur2 keyed + sticky null-key partitioning, 3 belts, SFX, EN/ES), deployed to learnkafka.crafter.run. Camera fits content bounds instead of the full 1280×720 (better on phones).
