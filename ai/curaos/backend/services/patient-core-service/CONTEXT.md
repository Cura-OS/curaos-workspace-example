# CONTEXT.md — patient-core-service

## Purpose

Neutral primitives for patient (patient demographics neutral primitives). Owned, reused by personal + business overlays + any future vertical. Domain overlay: `healthstack`.

## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle 0.45.2 (`schemaFilter: ['core']`) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`; LISTEN/NOTIFY-driven transactional outbox
- Kafka producer: in-process (pluggable) — real producer wires in at modulith app layer
- PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).

## Data model (M7-S2 binding — `ai/curaos/docs/m7-user-decisions.md` D1)

```
core.patients
  id            uuid PK  (gen_random_uuid)
  party_id      uuid     UNIQUE  (FK → party-core-service `party_core.parties`)
  mrn           text     UNIQUE per (tenant_id, mrn)
  tenant_id     uuid     (Citus shard key)
  state         text     CHECK ('active' | 'deactivated')
  deactivated_at timestamptz
  created_at    timestamptz
  updated_at    timestamptz

core.patients_outbox    -- transactional outbox; LISTEN/NOTIFY trigger
  id              uuid PK
  topic           text
  message_key     text   -- = hash(tenant_id, patient_id) (sha256 hex)
  payload         text   -- JSON event
  headers         text   -- JSON
  idempotency_key text   UNIQUE
  status          text   CHECK ('pending' | 'published' | 'failed')
  retry_count     integer
  scheduled_at    timestamptz
  published_at    timestamptz
  ...
```

**NO PHI columns** at this layer. DOB/SSN/gender/race/ethnicity/clinical
fields belong to `healthstack.patients` overlay (M7-S3 scope), linked by
`healthstack.patients(patient_id) → core.patients(id) ON DELETE CASCADE`.

## Integration Points

### Consumers
- `personal-patient-service`, `business-patient-service` — read-only consumers of `curaos.core.patient.*` events.
- `healthstack-patient-service` — overlay consumer; owns `healthstack.patients` + clinical PHI.
- `audit-core-service` — consumes `curaos.core.audit.event.v1` for 7-year retention.

### Produced events (M7 D2 binding)
- `curaos.core.patient.registered.v1` — emitted on `POST /patients` success.
- `curaos.core.patient.updated.v1` — emitted on `PATCH /patients/:id` success.
- `curaos.core.patient.deactivated.v1` — emitted on `DELETE /patients/:id` success.
- `curaos.core.audit.event.v1` — reference-only audit envelope (D5) per CRUD.

Partition key: `sha256(tenantId || ":" || patientId)` (hex) → preserves
per-patient ordering across all three core topics. Topic-side retention
(30d core, 7d healthstack, 7y audit) is configured at provisioning time.

### REST surface
- `GET /patients` — list (paginated, `?limit=&offset=&tenantId=`).
- `GET /patients/:id` — by id.
- `POST /patients` — create. Body: `{partyId, mrn, tenantId}`. Rejects PHI fields.
- `PATCH /patients/:id` — update neutral fields (currently `mrn` only).
- `DELETE /patients/:id` — soft delete (sets `state='deactivated'` + `deactivated_at`).
- `GET /patients/health` — liveness (unauthenticated).

All mutating routes gated by `AuthGuard` (stub — full role matrix in M7-S6).

## Audit chain end-to-end (M7-S7 binding)

- `test/integration/audit-chain-e2e.test.ts` locks the three-event audit
  chain shape on the neutral side: register → update ("admit") →
  deactivate ("discharge") on a single `core.patients` row. Each event
  links to the prior via `previousHash = sha256(eventId || occurredAt ||
  resourceId || prevHash)`; chain start has `previousHash = null`.
- Hash chain key is `tenantId:resourceId` — distinct tenants and
  distinct resources start independent chains.
- PHI scrub: every published envelope is regex-scanned for DOB
  (`\d{4}-\d{2}-\d{2}` outside `occurredAt`), SSN, and "First Last"
  name patterns. Same regexes the schema's `superRefine` enforces.
- Tamper detection: corrupting any of `eventId | occurredAt |
  resourceId | previousHash` makes the recomputed hash mismatch the
  stored hash; the test locks the recompute logic that downstream
  `audit-core-service` (M9-S5) consumers run.
- `AUDIT_PHI_SCAN_DUMP=1 bun test` dumps every captured envelope to
  `.audit-phi-scan-fixtures/*.json` for the parent repo's
  `scripts/audit-phi-scan.sh` out-of-process tripwire.

## Open Questions

- M7-S3: `healthstack.patients` overlay + cross-schema FK + `patients_full` view.
- M7-S6: full role matrix + SMART-on-FHIR scope claims on the JWT.
- M9: replace `InMemoryPatientsRepository` with codegen-emitted Drizzle repo.
- M9-S5: durable hash-chain head storage in `audit-core-service`; the
  in-process chain map here is per-process only.

## References

- `ai/curaos/docs/m7-user-decisions.md` — D1, D2, D5 (binding for this service).
- `ai/curaos/docs/research/m7-overlay-extension-patterns.md` — research basis.
- `ai/rules/curaos_postgres_rule.md` — Postgres + outbox pattern.
- `ai/rules/curaos_validation_rule.md` — Zod 4.
- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema.
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror.
- `ai/curaos/backend/services/patient-core-service/Requirements.md` — full spec.
