---
name: personal-conversion-service
description: Personal file converter - pdf-to-word, image-ocr, audio-transcribe, video-to-audio, document-format, compress-pdf. Drag-and-drop UX, 24h auto-delete, APISIX rate limit. NestJS TypeScript. ADR-0206.
tags: [service, personal]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
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
runtime: node22
adr: 0206
---

# personal-conversion-service

Individual file-converter tooling (SaaS-class UX). Delegates all format work to `conversion-core-service`. Per-user MinIO storage with 24h auto-delete. No account required for basic tools.

## Module agent contract

Read `curaos-workspace/AGENTS.md` first. This file holds module-local intent only.

**Stack:** NestJS / TypeScript / Node 22 - NOT Kotlin/Spring Boot.

**Key constraint:** No sidecar calls here. All format conversion via `conversion-core-service` tRPC.

## Companion documents

- [CONTEXT](CONTEXT.md) - runtime, storage policy, rate limiting, commands
- [Requirements](Requirements.md) - pre-built tools, UX, Done criteria
