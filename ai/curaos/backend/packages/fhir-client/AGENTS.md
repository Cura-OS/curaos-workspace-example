---
name: curaos-fhir-client
description: "FHIR R4 REST client with typed resources, SMART-on-FHIR, and audit event emission. HealthStack overlay only."
tags: [package]
language: typescript
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
npm: "@curaos/fhir-client"
adrs:
  - ADR-0209
overlay: healthstack
target: browser+native
phi: true
---

# @curaos/fhir-client (HealthStack only)

FHIR R4 client. Typed resources, SMART app launch, PHI audit. Neutral packages must not import.

## Commands
```bash
bunx turbo run build --filter=@curaos/fhir-client
bunx turbo run lint --filter=@curaos/fhir-client
bunx turbo run test --filter=@curaos/fhir-client
```
