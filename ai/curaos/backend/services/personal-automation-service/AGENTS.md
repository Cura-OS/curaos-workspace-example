---
name: personal-automation-service
description: Personal-tier automation overlay - Zapier/IFTTT-class Activepieces flows for individuals (gmail-to-task, calendar-brief, rss-readinglist, slack-save, photo-album, bank-log, github-pr-reminder, birthday-post). Per-user OpenBao credential vault. Registered via automation-core-service into Workflow Manager (ADR-0122).
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure:
  - postgres-pg17
  - kafka
  - nats
  - activepieces (via automation-core-service → Workflow Manager)
  - openbao (per-user paths)
  - cerbos
tooling: Bun
apis: []
events:
  produces: [personal.automation.run.completed, personal.automation.run.failed]
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
depends_on:
  - automation-core-service
adrs:
  - 0204
  - 0122
  - 0114
  - 0121b
  - 0121d
  - 0120
  - 0123
  - 0108
---

# personal-automation-service

Personal-tier automation overlay. 8 Activepieces flow templates v1. Per-user credential vault (OpenBao). Simplified Workflow Canvas UI for citizen developers. NL automation creation via LiteLLM.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then ADR-0204 §3.6. Then this file.

Key invariants:
- **per-user data isolation is a hard boundary** - no admin override without an OpenFGA consent-relationship grant (ADR-0120 ReBAC layer)
- **no PHI** - escalate to healthstack-automation-service if clinical data appears
- **OQ-4 must resolve** before P3.6 credential vault implementation
