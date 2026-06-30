---
name: terminology-service
description: "Neutral terminology primitives (FHIR R4 terminology over Snowstorm + LOINC/RxNorm/ICD-10/UCUM) - healthstack baseline."
tags: [service, core, healthstack]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/backend/services/terminology-service/CONTEXT.md
  requirements: ai/curaos/backend/services/terminology-service/Requirements.md
---

# terminology-service - Agent Contract

> `healthstack` overlay terminology service (FHIR R4 terminology over Snowstorm + LOINC/RxNorm/ICD-10/UCUM). Domain overlay: `healthstack`. Reference data, not PHI.

## Mission

Front-end FHIR R4 terminology (`$expand`/`$lookup`/`$validate-code`/`$translate`) over Snowstorm (SNOMED) + HAPI FHIR JPA (LOINC/RxNorm/ICD-10/UCUM) as the independent, pull-only root of the M12 clinical cluster. Owns `CodeSystem`/`ValueSet`/`ConceptMap`, the `healthstack.terminology.valueset-updated` event, the SNOMED jurisdiction allow-list, and air-gap RF2 bundles. Terminology is reference data - it carries no patient data (only the `tenant.terminology_jurisdiction` flag).




## Toolchain Registry

- Install: `bun install`
- Test: `bun test`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0

## Judgment Boundaries

- NEVER push to `main` without PR review
- NEVER edit migration files post-merge
- NEVER persist ANY PHI/PII/patient data in this service - terminology is
  REFERENCE DATA only (code systems, value sets, concept maps + the tenant
  `terminology_jurisdiction` flag). It holds no patient rows at all; there is no
  "overlay PHI schema" here to put PHI in (charter §5.2).
- ASK before adding new dependencies
- ASK before destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write a failing test before fixing a bug
- PHI boundary: terminology persists NO PHI. If a future change would introduce
  any patient-identifying field, STOP - that data belongs in a clinical overlay
  service (encounter / clinical-doc / orders), never here.





## Migration Authoring

The mold ships a table-only seed migration (`drizzle/migrations/0000_audit_outbox.sql`:
`CREATE SCHEMA` + `audit_outbox` table + indexes - NO trigger). Keep that contract for
every migration you add:

- **Init/table migrations stay table-only.** A `0001_init.sql` (and any later
  schema-changing migration) contains PURE `CREATE TABLE` / `CREATE INDEX` / FK DDL.
- **NEVER put the outbox LISTEN/NOTIFY trigger inline in an init migration.** The
  `pg_notify` publisher trigger (`CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER`) belongs
  in its OWN forward-only, idempotent `0002_outbox_publisher.sql` (`DROP TRIGGER IF EXISTS`
  then `CREATE TRIGGER`), applied AFTER the table it targets exists.
- Why: org-core-service#2 + party-core-service#226 both hand-authored a trigger-bearing
  `0001_init.sql` and had to split it out post-merge. Authoring table-first keeps the apply
  order safe and the init migration replay-clean ([[curaos-generator-evolution-rule]] §3.11).

## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: plain
related:
  shared-dto: backend/packages/shared-dto
  observability: backend/packages/observability
notable:
  ai/: agent docs mirror - no code here
```

## Personas Registry

- explorer: read-only codebase analysis (haiku tier)
- implementer: feature + bugfix worker (sonnet tier)
- reviewer: PR review w/ architecture lens (sonnet tier)
- hipaa-auditor: PHI boundary + audit-chain review (opus tier)
