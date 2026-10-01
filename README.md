# Kafka Express

Learn Apache Kafka by playing. A visual, game-like web app (EN/ES) built on
learning-science principles: predict-then-watch, retrieval checks, spaced review.

- Design: [`GDD.md`](GDD.md) · Tech plan: [`docs/TECH-PLAN.md`](docs/TECH-PLAN.md)
- Research: [`docs/research/`](docs/research)

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # simulation unit tests (murmur2 matches the Java client)
node scripts/gen-sfx.mjs   # regenerate synthesized SFX
```

Playtests (needs a running server):

```bash
node ~/.claude/skills/game-playtest/scripts/playtest-web.mjs playtest/scripts/*.json --url http://localhost:3000
```

## Deploy

Docker (`output: "standalone"`) on Dokploy → https://learnkafka.crafter.run
