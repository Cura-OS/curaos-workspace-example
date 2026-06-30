---
name: conversion-core-service
description: Format-bridge sidecar pool orchestrator - Tika 2.x, Pandoc 3.x, LibreOffice 24.x, Tesseract 5.x, Whisper.cpp, FFmpeg, Ghostscript. HL7v2↔FHIR R4 bridge. BullMQ, gRPC. NestJS TypeScript. ADR-0206.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), SeaweedFS S3, K8s
tooling:
  - bun
  - vitest
  - eslint
  - prettier
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
runtime: node22
adr: 0206
---

# conversion-core-service

Format-bridge primitive library. Orchestrates sidecar pool (Tika, Pandoc, LibreOffice, Tesseract, Whisper.cpp, FFmpeg, Ghostscript). Hosts HL7v2 ↔ FHIR R4 bridge for HealthStack. No vertical logic.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, LibreOffice limits, gRPC stubs, HL7v2 pipeline, commands
- [Requirements](Requirements.md) - sidecar pool, capabilities, API, events, Done criteria

## Toolchain Registry

```bash
bun install
bun build                   # nest build → dist/
bun test                    # unit tests (Vitest)
bun test:e2e                # integration with sidecar pool
bun run lint                # ESLint + Prettier
bun run typecheck
bun run ci                  # exits 0 = done
```

Note: `docker compose up` boots service + PG17 + Valkey + sidecar pool for integration tests.

## Judgment Boundaries

**NEVER:**
- Call sidecars via REST - gRPC only (licence isolation boundary).
- Increase LibreOffice BullMQ concurrency above 2 without explicit testing.
- Store large binaries in PG - all converted artifacts to SeaweedFS (ADR-0101 DA13 Q6 canonical object store); job record holds presigned URL only.
- Transfer large files via gRPC payload - use shared K8s `emptyDir` volume.
- Use Kotlin/Spring Boot - superseded by NestJS/TypeScript (ADR-0206).

**ASK:**
- Adding a new sidecar type or upgrading a sidecar major version.

**ALWAYS:**
- Public API = tRPC procedures + REST `POST /convert`; sidecar transport = gRPC only (licence isolation).
- Run `bun run ci` before reporting done.
