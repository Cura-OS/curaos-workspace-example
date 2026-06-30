---
name: business-workflow-service
description: Business-tier workflow overlay - pre-built Temporal + Activepieces business workflow templates (deal pipeline, approvals, onboarding, escalations) registered via workflow-core-service into Workflow Manager (ADR-0122).
tags: [service, business]
language: typescript
framework: nestjs
infrastructure:
  - postgres-pg17
  - kafka
  - nats
  - temporal (via workflow-core-service → Workflow Manager)
  - activepieces (via workflow-core-service → Workflow Manager)
  - cerbos
  - openbao
tooling: Bun
apis: []
events:
  produces: [business.workflow.deal.stage-changed, business.workflow.approval.requested, business.workflow.approval.decided, business.workflow.onboarding.completed]
  consumes: [business-sales-service domain events, business-hr-service domain events, business-finance-service domain events]
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  adr: ai/curaos/docs/adr/
depends_on:
  - workflow-core-service
---

# business-workflow-service

Business-tier workflow overlay. Pre-built template library (10 templates v1: deal-pipeline, contract-approval, employee-onboarding, customer-escalation, finance-approval, vendor-onboarding, performance-review, invoice-approval, lead-enrichment, expense-report). Thin overlay on workflow-core-service → Workflow Manager.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then ADR-0204 §3.2. Then this file.

Key invariant: **template library only** - no engine, no runtime, no custom visual editor.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [ADR-0204](../../../docs/adr/0204-cluster-workflow-automation-overlays.md) §3.2
- [ADR-0122](../../../docs/adr/0122-foundation-workflow-manager.md) - Workflow Manager canonical spec

## Toolchain Registry

```bash
bun install
bun test                    # unit tests
bun test:integration        # real PG17 + Kafka + Temporal
bun run lint                # Biome
bun run typecheck
bun run ci                  # exits 0 = done
```

## Judgment Boundaries

**NEVER:**
- Add a workflow engine, Temporal worker runtime, or custom visual editor - template library only.
- Register templates directly against Temporal/Activepieces - all registration goes through workflow-core-service → Workflow Manager (ADR-0122).
- Duplicate template logic that already exists in workflow-core-service.

**ASK:**
- Adding a new template beyond the 10 v1 templates.
- Changes to event topics produced/consumed.

**ALWAYS:**
- Register templates via workflow-core-service APIs, not direct infrastructure calls.
- Run `bun run ci` before reporting done.
