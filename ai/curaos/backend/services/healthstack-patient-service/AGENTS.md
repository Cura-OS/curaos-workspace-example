---
name: healthstack-patient-service
description: "M7-S3 overlay landing. Full agent context in this directory"
tags: [service, healthstack]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL (CNPG), Valkey, Redpanda (Kafka API), Temporal, K8s
tooling: Bun
apis: []
events:
  produces: [curaos.healthstack.patient.admitted.v1]
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
layer: "healthstack"
domain: "healthstack"
owner: "platform"
status: active
version: "0.0.1"
---

# healthstack-patient-service

> M7-S3 overlay landing. Full agent context in this directory:
> [CONTEXT.md](CONTEXT.md) + [Requirements.md](Requirements.md).
> The full pre-M7 design intent (FHIR Patient/RelatedPerson/Person via
> HAPI sidecar + SanteMPI MPI + Cerbos + SMART-on-FHIR) stays in
> [Requirements.md](Requirements.md) - M7-S3 ships the first-mold subset
> (PHI table + cross-schema FK + view + audit envelope + AES-256 SSN
> encryption + stub auth guard). The fuller stack lights up across
> M7-S4 (BPM workflow) → M7-S6 (role matrix) → M8 (FHIR + MPI).

## Hard rules (binding, do not break)

- **PHI lives here.** Every PHI column (DOB, gender, race, ethnicity,
  SSN, primary language, FHIR id, etc.) belongs on `healthstack.patients`,
  never on `core.patients`. Zod schemas in
  `src/patients/healthstack-patients.dto.ts` enforce the boundary by
  rejecting `mrn`, `tenant_id`, `party_id`, `state` on this controller.
- **No runtime imports of `@curaos/patient-core-service`.** Only
  type-level contracts may be referenced. Cross-service comms via Kafka
  audit topic + HTTP only. CI guard lands in M7-S8 (dep-cruiser).
- **Audit-first.** Every CRUD on the overlay emits a reference-only
  audit envelope on `curaos.core.audit.event.v1` with
  `resourceId = core.patients.id` (NOT overlay id) and
  `changedFields = column NAMES only`. The Zod `superRefine` rejects
  DOB/SSN/name patterns at the envelope boundary.
- **`ssn_encrypted` is always ciphertext.** Plaintext SSN must never
  land on disk - `SsnEncryptionService` encrypts before persistence.
  CI tests regex-check the column never matches `\d{3}-\d{2}-\d{4}`.

## M7-S3 file map (code)

```
src/
  app.module.ts                                    # ts-morph auto-wire anchors
  index.ts                                          # barrel
  main.ts                                           # NestJS standalone boot
  audit/
    audit-event.schema.ts                           # Zod 4 strict envelope + PHI scrub
    audit-publisher.service.ts                      # SHA-256 hash chain
  auth/
    auth.guard.ts                                   # stub (M7-S6 replaces)
  db/
    schema.ts                                       # pgSchema('healthstack') + view
    migrations.ts                                   # TS string export mirror
  events/
    healthstack-patient-event-producer.ts           # audit topic + future overlay topics
  patients/
    healthstack-patients.controller.ts
    healthstack-patients.service.ts
    healthstack-patients.dto.ts
    healthstack-patients.module.ts
    in-memory-healthstack-patients.repository.ts
  security/
    ssn-encryption.service.ts                       # AES-256-GCM + SECRETS_PROVIDER hook

drizzle/migrations/0000_initial.sql                 # shipped artifact

test/
  unit/{audit-event-schema,auth-guard,migrations,
        healthstack-patients-dto,
        healthstack-patients-service,
        ssn-encryption}.test.ts
  integration/healthstack-patients-http.test.ts
  integration/healthstack-patients-live.test.ts     # gated by HEALTHSTACK_PATIENT_DATABASE_URL
  integration/core-migration.fixture.ts             # snapshot of patient-core 0000_initial.sql
```

## Decisions in scope this milestone

- D1 (separate overlay schema + FK + view) → see code map above.
- D5 (reference-only audit) → `audit-event.schema.ts` + `audit-publisher.service.ts`.
- D2 admission/discharge topics → registered as constants in
  `events/healthstack-patient-event-producer.ts`, but NOT emitted on
  yet - M7-S4 BPM workflow scope.

## Out of scope (later milestones)

- BPM workflow attach (M7-S4): admission/discharge/clinical-updated
  Kafka events; saga ordering against core `PatientRegistered`.
- Full SMART-on-FHIR + Cerbos role matrix + break-glass (M7-S6).
- `dep-cruiser` CI guard blocking `@curaos/patient-core-service`
  runtime imports (M7-S8).
- HAPI FHIR 8.x sidecar + SanteMPI integration + consent cache
  (M8 - see `Requirements.md` for the full design).
