---
name: personal-workflow-service
description: Personal-tier workflow overlay - GTD, goal, habit, reading-list, travel, finance Temporal + cron templates for individual users. Registered via workflow-core-service into Workflow Manager (ADR-0122).
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure:
  - postgres-pg17
  - kafka
  - nats
  - temporal (via workflow-core-service → Workflow Manager)
  - activepieces (via workflow-core-service → Workflow Manager)
  - cerbos
tooling: Bun
apis: []
events:
  produces: [personal.workflow.goal.milestone-reached, personal.workflow.habit.streak-broken, personal.workflow.instance.completed]
  consumes: [calendar events (neutral), task completions (neutral), notification acks (neutral)]
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
depends_on:
  - workflow-core-service
adrs:
  - 0204
  - 0122
  - 0114
  - 0121b
  - 0120
  - 0123
---

# personal-workflow-service

Personal-tier workflow overlay. 8 templates v1: gtd-capture-process, goal-tracker, habit-tracker, reading-list, errand-batcher, personal-finance-check, travel-prep, birthday-tracker. Per-user data isolation. AI NL quick-add via LiteLLM.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then ADR-0204 §3.3. Then this file.

Key invariant: **personal template library only** - per-user isolation required, no engine code, no cross-user data.
