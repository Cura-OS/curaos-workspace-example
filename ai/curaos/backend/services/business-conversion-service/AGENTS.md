---
name: business-conversion-service
description: "B2B conversion workflow overlay - Temporal workflows for pdf-to-editable, batch-ocr, office-to-pdf, HL7v2-FHIR batch, data-format-bridge, csv-to-excel-chart. SSE progress. NestJS TypeScript. ADR-0206."
tags: [service, business]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun
tooling: Bun, Vitest, ESLint, Prettier
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [local, on-prem, saas, air-gap]
docs:
  adr: ai/curaos/docs/adr/0206-cluster-fleet-geospatial-site-conversion-integrations.md
  context: ai/curaos/backend/services/business-conversion-service/CONTEXT.md
  requirements: ai/curaos/backend/services/business-conversion-service/Requirements.md
---

# business-conversion-service

B2B conversion workflow overlay on `conversion-core-service`. Pre-built Temporal workflows for enterprise conversion patterns. No conversion engine - all format work via conversion-core.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

**Key constraint:** No sidecar calls here. All format conversion delegated to `conversion-core-service`.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, design decisions, commands
- [Requirements](Requirements.md) - pre-built workflows, events, Done criteria
