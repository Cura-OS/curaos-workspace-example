---
name: curaos-events
description: "Typed event schemas + bus client (Node.js) + SSE subscription hook (browser). Outbox-pattern publish."
tags: [package]
language: typescript
framework: none
infrastructure: Redpanda (Kafka API)
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/events"
adrs:
  - ADR-0209
target: node+browser
---

# @curaos/events

Event bus client + typed schemas. Server: publish/subscribe via broker. Browser: schemas + SSE hooks.

## Commands
```bash
bunx turbo run build --filter=@curaos/events
bunx turbo run lint --filter=@curaos/events
bunx turbo run test --filter=@curaos/events
```
