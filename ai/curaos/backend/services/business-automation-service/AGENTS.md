---
name: business-automation-service
description: Business-tier automation overlay - pre-built Activepieces flows for CRM/sales/finance/HR/ops (crm-lead-to-deal, contract-signed-notify, invoice-sync, hr-offboarding, support-sla, sales-report, social-listen, inventory-reorder). Registered via automation-core-service into Workflow Manager (ADR-0122).
tags: [service, business]
language: typescript
framework: nestjs
infrastructure:
  - postgres-pg17
  - kafka
  - nats
  - activepieces (via automation-core-service → Workflow Manager)
  - cerbos
  - openbao
  - harbor
tooling: Bun
apis: []
events:
  produces: [business.automation.run.completed, business.automation.run.failed, business.automation.piece.credential-expired]
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
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
  - 0120
  - 0123
  - 0108
  - 0150
---

# business-automation-service

Business-tier automation overlay. 8 Activepieces flow templates v1. BYO connector model (HubSpot, Salesforce, DocuSign, Zendesk, etc.) - tenant-scoped credentials via OpenBao. Custom pieces via signed Harbor OCI artifacts.

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then ADR-0204 §3.5. Then this file.

Key invariant: **automation flow library only** - no runtime ownership, BYO credentials, no hardcoded 3rd-party keys.
