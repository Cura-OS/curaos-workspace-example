---
name: healthstack-automation-service
description: HealthStack clinical automation overlay - 8 Activepieces flows, consent gate on all patient outreach, delegates to automation-core-service ADR-0204.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - fastify
  - activepieces
  - kafka
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
  requirements_raw: Requirements-raw.md
  readme: README.md
adr_refs:
  - ADR-0208
  - ADR-0115
  - ADR-0099
  - ADR-0157
  - ADR-0162
  - ADR-0122
  - ADR-0204
  - ADR-0200
  - ADR-0201
cluster: healthstack
depth: light
---

# healthstack-automation-service

Thin HealthStack overlay on automation-core-service (ADR-0204) Activepieces runtime. Registers 8 clinical automation flows at bootstrap. Consent check via healthstack-consent-service mandatory before every patient-facing outreach action. Suppressed outreach (consent deny) audited.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on all controller methods.
2. Patient outreach: `PHI_AUTOMATED_OUTREACH` audit category.
3. Consent check BEFORE every patient-facing action - suppress silently on deny; audit suppression.
4. This service does NOT own Activepieces runtime - delegate to automation-core-service.
5. ALL 8 flows must be registered at bootstrap before service is ready.
6. Tenant activation: flows are disabled by default; enabled per tenant subscription.
7. Codegen recipe: `healthstack:automation-flow --engine activepieces --domain clinical`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
