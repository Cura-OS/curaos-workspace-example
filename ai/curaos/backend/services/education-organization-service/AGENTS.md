---
name: education-organization-service
description: EducationStack institutional layer - institution registry, accreditation lifecycle (Temporal), enrollment management, faculty/staff assignments, OneRoster 1.2 SIS sync.
tags: [service, education]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - bun
  - temporal-ts-sdk
  - drizzle
  - otel
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
  readme: README.md
runtime: bun
data: drizzle
validation: zod
adr_authority: ADR-0207
---

# education-organization-service

EducationStack institutional layer. Owns institution registry, accreditation lifecycle, enrollment management, faculty/staff assignment (delegated to hr-service), and OneRoster 1.2 roster sync.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

**Stack:** NestJS (TypeScript) + PG17 + Valkey + Kafka/NATS + Temporal TS SDK + Drizzle + Zod. Stack locked by ADR-0100 + ADR-0207 and workspace rules.

**People model rule:** No duplicate people model. Faculty and staff = hr-service employees. This service stores only FacultyAssignment (staffId FK + courseId + role). Never copy HR attributes here.

**Institution model rule:** Institution entity extends org-core-service Org (same institutionId = orgId). Never create a parallel Org model.

**Dependency rule:** Depends on education-core-service downward. Never depends on education-personal-service or any HealthStack service. CI import-boundary lint enforces this.

**Accreditation rule:** All accreditation stage logic runs as Temporal workflows registered via Workflow Manager. No bespoke state-machine code in service layer.

**Enrollment rule:** Waitlist uses Valkey sorted-set. Capacity + prerequisite checks mandatory in enrollment approval workflow before ACCEPTED state.

**OneRoster rule:** Inbound sync errors quarantined in oneroster_sync_errors table; never silently dropped.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack rules, accreditation architecture, waitlist design, files that must not break
- [Requirements](Requirements.md) - mission, domain model, events, API surface, done criteria
