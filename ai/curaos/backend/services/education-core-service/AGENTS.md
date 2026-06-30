---
name: education-core-service
description: EducationStack foundation - curriculum primitives, LRS (xAPI 2.0), LTI 1.3, Activity Definition IR, SCORM/cmi5 adapters, and H5P sidecar seams. Foundation layer for all EducationStack services.
tags: [service, education]
language: typescript
framework: nestjs
infrastructure: Valkey, Redpanda (Kafka API), Temporal, SeaweedFS S3
tooling:
  - bun
  - temporal-ts-sdk
  - flyway
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
adr_authority: ADR-0207
---

# education-core-service

EducationStack foundation service. Owns curriculum/course/lesson/competency primitives, Learning Record Store (xAPI 2.0), LTI 1.3 Platform+Tool, Activity Definition IR, SCORM/cmi5 adapters, and H5P sidecar seams only.

## Module agent contract

Read workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.

**Stack:** NestJS (TypeScript) + PG17 + Valkey + Kafka/NATS + Temporal TS SDK. Not Spring Boot / Kotlin - stack locked by ADR-0100 + ADR-0207.

**Dependency rule:** This service depends downward only (neutral core + platform services). It is never a consumer of `education-organization-service`, `education-personal-service`, or any HealthStack service. CI import-boundary lint enforces this.

**LRS rule:** xAPI 2.0 conformance is non-negotiable. Run ADL conformance suite before any LRS API change. Verb registry validation is tenant-configurable (reject/warn/coerce) but registry must exist.

**LTI key rule:** Always maintain 2 active JWKS key pairs. Never rotate to 0-or-1 active keys; active launches break.

**SCORM rule:** SCORM 1.2 is import-only. No new SCORM 1.2 authoring surface.

**OSS rule:** Do not embed GPL/AGPL packages (`@lumieducation/h5p-server`, Moodle, Canvas, Sakai, Chamilo). H5P is BYO/LTI/sidecar/legal-reviewed only. Pattern-borrow only.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack rules, key library notes, LRS architecture, files that must not break
- [Requirements](Requirements.md) - mission, domain model, events, API surface, OSS stack, done criteria
