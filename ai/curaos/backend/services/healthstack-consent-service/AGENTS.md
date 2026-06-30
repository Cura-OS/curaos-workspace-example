---
name: healthstack-consent-service
description: HealthStack consent authority - FHIR Consent/BPPC, real-time consent decision tRPC, break-glass dual-sign, Valkey cache invalidation.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal
tooling:
  - fastify
  - mikro-orm
  - atlas
  - hapi-fhir-sidecar
  - valkey
  - kafka
  - cerbos
  - temporal
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
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
  - ADR-0161
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: deep
---

# healthstack-consent-service

FHIR Consent authority for HealthStack. Every clinical service calls `consent.decision()` before returning PHI. Break-glass emergency access with Temporal dual-sign workflow + Cerbos 4h auto-expiry grant. HIPAA BPPC profiles.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then read `CONTEXT.md` and `Requirements.md`.

**This service is the PHI access gate for the entire HealthStack cluster.**

## Key rules for agents working in this module

1. `@HealthstackAudit()` on every controller method - including consent decision calls.
2. Deny-by-default is absolute: uncertain consent state = deny, never permit.
3. Break-glass audit record created BEFORE granting access - chronological order is a compliance requirement.
4. Valkey consent decision cache TTL 15min; invalidation on `healthstack.consent.updated` Kafka event.
5. Break-glass Cerbos grant auto-expires 4h - Temporal timer, not application-level timeout.
6. `phi_audit_mode` is per-tenant config - never hard-code audit mode in service logic.
7. Codegen recipe: `healthstack:fhir-service --resources Consent --break-glass --bppc`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
