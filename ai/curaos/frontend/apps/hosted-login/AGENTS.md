---
name: curaos-hosted-login
description: "DEPRECATED - superseded by CuraOS Auth portal (ADR-0120). No new development."
tags: [frontend, app, neutral]
language: TypeScript
framework: none
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
status: deprecated
superseded-by: auth-portal (ADR-0120)
adrs:
  - ADR-0120
  - ADR-0209
---

# curaos-hosted-login (DEPRECATED)

Superseded by CuraOS Auth portal. See ADR-0120 and Requirements.md for deprecation checklist.

## Agent contract

Read workspace `AGENTS.md` first. Do not add code to this package.

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
