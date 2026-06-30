# M7 First Mold Output — User Decisions (2026-05-27)

> Binding decisions for the M7 wave. Every M7 Story worker prompt must quote these verbatim under "USER DECISION (binding)". Reference: `ai/curaos/docs/research/m7-overlay-extension-patterns.md`.

## D1 — Schema extension model

**Decision: C. Separate overlay schema + FK + view**

- `core.patients` table owned by `patient-core-service`. Codegen target. Columns: `id`, `party_id` FK, `mrn`, `tenant_id`, `created_at`, `updated_at`. No PHI columns.
- `healthstack.patients` table owned by `healthstack-patient-service`. Columns: `id`, `patient_id` FK references `core.patients(id) ON DELETE CASCADE`, `date_of_birth`, `gender`, `race`, `ethnicity`, `ssn_encrypted`, `primary_language`, `fhir_id` unique, `fhir_meta`, `is_deceased`, `deceased_date`.
- Read-only `pgView patients_full` joins both for HealthStack consumer ergonomics. Promotable to `pgMaterializedView` if read latency demands it (refresh via outbox trigger).
- Drizzle `schemaFilter: ['core']` in `patient-core-service` drizzle.config — codegen never sees `healthstack` schema. `healthstack-patient-service` has its own `drizzle.config.ts` with `schemaFilter: ['healthstack']`.
- Migrations: core migrations regenerable by codegen on M9; overlay migrations independent + replay-safe.

**Why:** Hard PHI boundary at the schema level (separate row-level security, tablespace, credentials). M9-regen-safe. Drizzle 0.45.2 supports cross-schema `references()` since 0.30+. Prior art: OpenMRS, HAPI FHIR JPA, Medplum, Aidbox, Salesforce Health Cloud, Bahmni.

**Forbidden alternatives:** Single-table ALTER (PHI bleeds into core). Polymorphic STI (PHI bleeds into core + discriminator not FHIR-shaped).

## D2 — Kafka topic strategy

**Decision: B. Separate topic per layer**

- Core layer: `curaos.core.patient.registered.v1`, `curaos.core.patient.updated.v1`, `curaos.core.patient.deactivated.v1`. Retention 30 days. No encryption-at-rest requirement.
- HealthStack layer: `curaos.healthstack.patient.admitted.v1`, `curaos.healthstack.patient.discharged.v1`, `curaos.healthstack.patient.clinical-updated.v1`, `curaos.healthstack.patient.consent-captured.v1`. Retention 7 days. AES-256 encryption-at-rest. ACL deny-all except `healthstack-consumers` group.
- Partition key: `hash(tenant_id, patient_id)`. Consumer groups: `healthstack-patient-service.tenant-{id}`.
- Cross-layer ordering via `X-Correlation-ID` header + M5 BPM saga. Admission workflow gates on `PatientRegistered` core event before publishing `PatientAdmitted` overlay event.
- Audit events published to neutral `curaos.core.audit.event.v1` — see D5 envelope.

**Why:** Differential `retention.ms` per HIPAA classification (PHI shorter). Per-topic ACL keeps core consumers (billing, scheduling) from accidentally subscribing to clinical events. Per-topic AsyncAPI channel = clean contract per team.

**Forbidden alternatives:** Same topic w/ event-type prefix (impossible to set differential retention).

## D3 — Modulith loading

**Decision: A. Static import + env-var conditional `imports[]`**

```typescript
// apps/curaos-modulith/src/app.module.ts
import { HealthstackPatientModule } from '@curaos/healthstack-patient-service';
import { PatientCoreModule } from '@curaos/patient-core-service';

const overlayModules = () => {
  const active: unknown[] = [];
  if (process.env.CURAOS_OVERLAY_HEALTHSTACK === 'true') {
    active.push(HealthstackPatientModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        dbSchema: cfg.get('HEALTHSTACK_DB_SCHEMA', 'healthstack'),
        kafkaTopicPrefix: 'curaos.healthstack',
      }),
      inject: [ConfigService],
    }));
  }
  return active;
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PatientCoreModule.forRootAsync({ /* ... */ }),
    ...overlayModules(),
  ],
})
export class AppModule {}
```

- Env var `CURAOS_OVERLAY_HEALTHSTACK=true|false` gates inclusion at AppModule construction time.
- Standalone mode: each overlay service's own `apps/<service>/src/main.ts` imports its module directly (no env-var check).
- Tree-shaking via Bun bundler removes unused overlay code when env-var is false at build time. Alternative: NestJS 8+ `LazyModuleLoader` for true zero-cost runtime exclusion.

**Why:** Compile-time safety (TypeScript catches export shape changes at CI). Zero `require()` runtime risk. Matches NestJS BullMQ/Mongoose/MikroORM pattern. Standalone-mode parity per [[curaos-modulith-standalone-rule]].

**Forbidden alternatives:** Dynamic manifest loader (`require()` RCE-adjacent). Container-label service discovery (breaks standalone-mode boot).

## D4 — Builder schema consumption

**Decision: C. Hybrid (compile-time base + runtime overlay)**

- Compile-time: `@curaos/patient-contracts` package exports `patientBaseSchema` (JSON Schema Draft-07). Generated from `patient-core-service` Drizzle introspection via M6 codegen + published to Verdaccio.
- Runtime: `GET /api/v1/contracts/patient?tenantId={id}&overlay=healthstack` returns merged schema with overlay fields + tenant-specific customisations. Served by `healthstack-patient-service`.
- `builder-studio` boot: imports base schema synchronously (RJSF renders immediately). On tenant session start, fetches overlay schema; re-renders RJSF with merged schema (~50ms on local network).
- Schema versioning: `?version=v1` query param. `@curaos/patient-contracts` is semver-pinned. Breaking contract changes caught at PR time by typecheck on builder-studio.
- Degraded mode: if runtime fetch fails, builder falls back to compile-time base schema with a "degraded mode — overlay unavailable" banner.

**Why:** CI build never blocked on running API. Per-tenant field customisation without redeployment. Exact match to RJSF's `schema` + `uiSchema` pattern that M4 already uses.

**Forbidden alternatives:** Compile-time only (tenant fields require redeploy). Runtime only (CI needs running API).

## D5 — Audit envelope for PHI events (research-only, charter-bound — no user choice required)

**Decision: Reference-only envelope with SHA-256 hash chain (IHE BALP-aligned)**

```typescript
interface AuditEventEnvelope {
  eventId: string;          // UUID v7 monotonic
  correlationId: string;    // X-Correlation-ID
  traceId: string;          // OpenTelemetry trace
  occurredAt: string;       // ISO-8601 UTC
  actorId: string;          // party-core UUID (NOT name/email)
  actorType: 'user' | 'service' | 'system';
  tenantId: string;
  resourceType: string;     // 'Patient', 'Encounter', ...
  resourceId: string;       // core.patients.id UUID
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXPORT';
  outcome: 'success' | 'failure' | 'partial';
  changedFields?: string[]; // FIELD NAMES ONLY — never values
  changeValues?: Record<string, string[]>; // ADR-0212 amendment — reference-only: RBAC role-codes (closed RBAC_ROLES enum) + opaque UUID refs + allowlisted typed refs ONLY, never PHI; scanned by the PHI superRefine
  previousHash: string | null;
  hash: string;             // SHA-256(eventId + occurredAt + resourceId + previousHash)
}
```

- Audit publishes to neutral `curaos.core.audit.event.v1` topic. 7-year retention (HIPAA minimum).
- `changedFields` lists names only (`['gender', 'primaryLanguage']`) — never values.
- Hash chain provides tamper-evidence without storing content. UUID v7 + Kafka per-partition ordering ensures monotonicity.

**Why:** Charter §6 HIPAA + [[curaos-healthstack-vision]] mandate PHI-free audit. IHE BALP v1.1.4 + HAPI FHIR BALP Interceptor are the precedent. No PHI value in `audit-core-service` storage — references only.

**Hard rule:** Any audit event payload containing PHI values (DOB, SSN, names, addresses, clinical values) MUST fail a CI test. Acceptance: regex scan `JSON.stringify(event)` for `\d{4}-\d{2}-\d{2}`, `ssn|social.*security`, `[A-Z][a-z]+\s[A-Z][a-z]+` patterns.

**AMENDMENT 2026-05-29 ([ADR-0212](adr/0212-m9-s2-changevalues-reference-only-audit.md), user-authorized reopening of this binding decision):** the envelope MAY carry an optional `changeValues` field for value-aware audit-divergence parity (M9-S2 #200). It is **reference-only and PHI-safe by construction**: values match `z.enum(RBAC_ROLES)` (closed) OR an opaque UUID OR `<ActorMembership|PractitionerRole|Credential|Policy|Org>:<uuid|role-code>`; keys match a closed `CHANGE_VALUE_KEYS` enum; free-form strings are rejected. The "never values" rule above is **unchanged for `changedFields`**; the PHI superRefine `JSON.stringify` scan **continues to cover `changeValues`** (it is NOT excluded from the scan — see ADR-0212 §2.2 + negative CI tests N1-N12). RBAC role-codes + opaque UUIDs are not among the 18 HIPAA identifiers (§160.103) and are consistent with the IHE BALP v1.1.4 precedent cited above.

---

*Bound on 2026-05-27 via §3.6 escalation funnel after `ai/curaos/docs/research/m7-overlay-extension-patterns.md` research landed. References: research doc + 22 inline citations.*
