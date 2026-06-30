---
name: workflow-core-service
description: Neutral NestJS workflow primitive library - thin gateway to CuraOS Workflow Manager (ADR-0122). Exports WorkflowCoreModule and @curaos/workflow-activities to overlay services.
tags: [service, core]
language: typescript
framework: nestjs
infrastructure:
  - postgres-pg17
  - valkey
  - kafka
  - nats
  - temporal (via Workflow Manager)
  - activepieces (via Workflow Manager sidecar)
  - openbao
tooling: Bun
apis:
  - REST
  - tRPC
  - gRPC (internal, to Workflow Manager)
events:
  - workflow.template.registered
  - workflow.template.deprecated
  - workflow.instance.started
  - workflow.instance.completed
  - workflow.instance.failed
  - subject-rights.requested.v1
  - subject-rights.step-completed.v1
  - curaos.security.break-glass.requested.v1
  - curaos.security.break-glass.approval-recorded.v1
  - curaos.security.break-glass.rejected.v1
  - curaos.security.break-glass.elevation-requested.v1
  - curaos.security.break-glass.expired.v1
  - curaos.security.break-glass.review-queued.v1
  - curaos.security.break-glass.review-completed.v1
deployment_profiles:
  - local
  - on-prem
  - saas
  - air-gap
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
runtime: nestjs + temporal-ts-sdk (client)
engine_via_workflow_manager: temporal + activepieces-ce + nestjs-schedule (runtime in Workflow Manager per ADR-0122)
testing:
  - bun test
  - temporalio-testing
adrs:
  - 0204
  - 0122
  - 0123
  - 0100
  - 0101
  - 0102
  - 0104
  - 0107
  - 0108
  - 0115
  - 0120
---

# workflow-core-service

Neutral NestJS workflow primitive library. Gateway to CuraOS Workflow Manager (ADR-0122). No engine logic here - engine = Temporal + Activepieces + cron in Workflow Manager.

## Companion documents

- [CONTEXT](CONTEXT.md) - stack, rules, dependency tree, operating rules
- [Requirements](Requirements.md) - full spec, DoD, build sequence

## Module agent contract

Read the workspace [AGENTS.md](../../../../../AGENTS.md) first. Then [ADR-0204](../../../docs/adr/0204-cluster-workflow-automation-overlays.md) §3.1. Then this file.

Key invariant: this service is a **thin overlay gateway**. If implementation logic feels heavyweight, it belongs in Workflow Manager or an overlay service - not here. Subject-rights and break-glass lifecycle work emits durable events only; workflow-core must not traverse PHI-bearing overlay schemas or mutate identity roles directly.
