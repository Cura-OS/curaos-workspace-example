---
name: healthstack-claims-service
description: HealthStack claims - FHIR Claim/ClaimResponse/EOB/Coverage, Da Vinci PAS prior auth, Da Vinci PCT GFE, X12 EDI via clearinghouse, eligibility 270/271.
tags: [service, healthstack]
language: typescript
framework: nestjs
infrastructure: Redpanda (Kafka API)
tooling:
  - fastify
  - hapi-fhir-sidecar
  - cqf-ruler-sidecar
  - openbao
  - kafka
apis: []
events:
  produces: []
  consumes: []
deployment_profiles:
  - local
  - on-prem
  - saas
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
  - ADR-0162
  - ADR-0120
cluster: healthstack
depth: medium
---

# healthstack-claims-service

Medical claims lifecycle. FHIR `Claim` assembly from encounter close. Da Vinci PAS prior auth. Da Vinci PCT GFE for cost transparency. X12 EDI 837/835/270/271 via healthstack-interop-service clearinghouse adapter. Claims contain densest ePHI - full audit mandatory.

## Module agent contract

Read workspace `curaos-workspace/AGENTS.md` first. Then `CONTEXT.md` + `Requirements.md`.

## Key rules for agents working in this module

1. `@HealthstackAudit()` on ALL controller methods - claims have densest ePHI.
2. Clearinghouse submission: `PHI_EXTERNAL_CLAIMS` audit category.
3. Clearinghouse credentials: OpenBao per-tenant - never in env vars or config files.
4. X12 EDI production generation: delegate to clearinghouse adapter (healthstack-interop-service) - pyx12 for validation only.
5. Da Vinci PAS: payer FHIR endpoint per tenant config; never hardcode payer URLs.
6. Codegen recipe: `healthstack:fhir-service --resources Claim,ClaimResponse,ExplanationOfBenefit,Coverage --davinci-pas --davinci-pct`

## Companion documents

- [CONTEXT](CONTEXT.md)
- [Requirements](Requirements.md)
- [Requirements-raw](Requirements-raw.md)
