# Dispatch — agent command center

An agent orchestration dashboard: dispatch a mission, the team lead (Elena) plans 2–4 subagents, each runs as a streaming Claude call, and a synthesis step merges the results. Rebuilt from the single-file prototype as a Next.js app with a real backend and persistence.

## Setup

```bash
npm install
cp .env.example .env      # set ANTHROPIC_API_KEY (needed from milestone 2 on)
npm run setup             # create the SQLite schema + seed core roster and example workflows
npm run dev
```

## Stack

- Next.js (App Router) + TypeScript strict
- SQLite via Drizzle + libsql (`DATABASE_URL`, defaults to `file:./dispatch.db`; schema kept portable to Postgres — statuses are text columns enforced by zod at the API boundary, JSON fields are zod-validated text)
- zod validation on every API input (`src/server/validation.ts`, includes the orchestrator plan schema for milestone 2)

Note: the build spec offered Prisma or Drizzle; Drizzle was chosen because Prisma's engine binaries can't be fetched in the build environment. The schema is a 1:1 translation of the agreed Prisma schema.

## Status: Milestone 1 of 5

Done — scaffold, schema, seed, roster UI:

- Schema: `agents`, `workflows`, `runs`, `task_nodes` (with `parent_node_id` for v1.5 nesting), `events` (with per-run `seq` for SSE resume)
- Seed: the six core teammates with the prototype's exact face configs, plus the two example workflows
- Shell: sidebar nav with per-agent dots, mobile drawer, stat tiles (counts computed live from the DB)
- Command center: dispatch bar (UI only — engine is milestone 2), agent roster grid with computed stats, recent activity, quick actions
- Agent detail: emblem hero, computed stats, subagent board (empty until runs exist), remove for custom teammates (core protected; history-preserving 409 if records exist)
- Add teammate: dialog with hue picker; server assigns a random face
- Workflows: seeded list rendered read-only (Run/create wire up in milestones 2–3)
- Activity: event feed from the `events` table
- Avatar system ported to React (`src/components/avatar/Emblem.tsx`) — includes a fix over the prototype: var()-based colors are applied via `style`, since `var()` is invalid in SVG presentation attributes, so emblems now actually adapt to dark mode

Next — Milestone 2: run engine end-to-end (`POST /api/runs` → plan → concurrent subagents → synthesis) with SSE streaming into the live runs view.

## Layout

```
src/db/            schema + client singleton
src/server/        queries, validation (orchestrator/ arrives in M2)
src/app/           routes: /, /agents/[id], /workflows, /runs, /activity, /api/*
src/components/    avatar, shell, agents, command
scripts/seed.ts    core roster + example workflows
```
