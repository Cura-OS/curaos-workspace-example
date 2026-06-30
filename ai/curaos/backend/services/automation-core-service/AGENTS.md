---
name: automation-core-service
description: Neutral NestJS automation primitive library - piece registry gateway + trigger/action SDK for all automation overlay services. Thin wrapper on CuraOS Workflow Manager Activepieces runtime (ADR-0122).
tags: [service, core]
language: typescript
framework: nestjs
infrastructure:
  - postgres-pg17
  - valkey
  - kafka
  - nats
  - activepieces (via Workflow Manager sidecar)
  - temporal (via Workflow Manager)
  - openbao
  - harbor (piece OCI registry)
tooling: Bun
apis:
  - REST
  - tRPC
  - webhook-ingress (via APISIX)
events:
  - automation.template.registered
  - automation.instance.triggered
  - automation.instance.completed
  - automation.instance.failed
  - automation.piece.health-changed
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
runtime: activepieces-ce + bullmq + temporalio-client
testing:
  - jest
adrs:
  - 0204
  - 0122
  - 0123
  - 0100
  - 0102
  - 0101
  - 0103
  - 0108
---

# automation-core-service

Neutral NestJS automation primitive library. Piece registry gateway + trigger/action SDK. Activepieces runtime lives in CuraOS Workflow Manager (ADR-0122); this service is the gateway layer.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, rules, dependency tree, operating rules
- [Requirements](Requirements.md) - full spec, DoD, build sequence

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then ADR-0204 §3.4. Then this file.

Key invariant: **thin gateway**. Automation execution logic belongs in Workflow Manager, not here. Template content belongs in overlay services, not here.
