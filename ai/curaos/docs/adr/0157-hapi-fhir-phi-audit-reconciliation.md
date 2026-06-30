# ADR-0157 — HAPI FHIR PHI Audit Reconciliation: Three-Mode Pipeline

**Status:** Accepted
**Date:** 2026-05-24
**Deciders:** Platform Architecture, HealthStack Engineering, Compliance
**Supersedes:** ADR-0151 F-004 (resolves Critical finding)
**Amends:** ADR-0104 §Sub-decision 4, ADR-0115 §4.2.2, ADR-0150 §2, ADR-0208 §audit

---

## 1. Status

**Accepted.** This ADR resolves ADR-0151 F-004 Critical: HAPI FHIR JVM sidecar PHI audit pathway gap. The gap was that ADR-0115 committed HAPI FHIR 8.x as a JVM sidecar without specifying how HAPI-native audit events integrate with the CuraOS hash-chained audit ledger (ADR-0104). HIPAA §164.312(b) requires a complete, ordered audit trail of all PHI access. Two disjoint audit systems — NestJS Kafka audit + HAPI FHIR native audit — cannot produce that trail without explicit reconciliation.

---

## 2. Context

### 2.1 The Gap

HAPI FHIR 8.x runs as a JVM sidecar (K8s pod per tenant, per ADR-0109 Capsule namespace isolation). It writes PHI directly to its own PostgreSQL schema (~130 JPA tables). NestJS `@curaos/event-interceptors` wrap NestJS service calls but **cannot intercept JVM-internal HAPI writes**. HAPI FHIR has its own audit mechanism (`AuditEvent` FHIR R4/R5 resource, ConsentInterceptor, IServerInterceptor). ADR-0104 specifies a hash-chained audit table keyed per-tenant, but only describes auth-service events. The result: PHI access events land in two places — HAPI's PostgreSQL schema and the CuraOS Kafka audit pipeline — with no specified join.

### 2.2 Regulatory Drivers

- **HIPAA §164.312(b):** Audit controls. Covered entities must implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems containing PHI. "Activity" includes all read, write, update, and delete operations.
- **HIPAA §164.308(a)(1)(ii)(D):** Information system activity review. Must be able to produce an ordered, attributable log on request.
- **TEFCA QHIN requirements:** QHIN participants must maintain audit logs per IAS v1.0 §5.4 — FHIR-standard AuditEvent resources, queryable via FHIR API.
- **BAA tenants:** Business Associate Agreement tenants expect audit logs producible in standard form (FHIR AuditEvent) for BAA partner review.
- **GDPR Art. 30:** Records of processing activities. Log must be attributable to a data subject.

### 2.3 Tenant Spectrum

CuraOS serves tenants ranging from small practices (SMB) to TEFCA QHIN participants. Their audit requirements differ:

| Tenant profile | Regulatory bar | Preferred audit form |
|---|---|---|
| SMB (solo practice, small clinic) | HIPAA baseline | Any complete trail |
| Enterprise (hospital, IDN) | HIPAA + HITECH + state law | HL7-standard AuditEvent preferred |
| BAA partner | HIPAA BAA terms | Producible AuditEvent via FHIR API |
| TEFCA QHIN | TEFCA IAS §5.4 | FHIR AuditEvent primary source |

A single audit architecture does not serve all profiles optimally. The user decision: **per-tenant choice via config (`tenant.healthstack.audit-mode`)**, with three defined modes.

### 2.4 HAPI FHIR Audit Capabilities (relevant to this ADR)

- **IServerInterceptor / AuditEventInterceptor:** Fires on every FHIR operation (read, search, create, update, delete, transaction). Can write `AuditEvent` FHIR resources into HAPI's own JPA store.
- **ConsentInterceptor:** Veto/allow hook per patient consent. Fires before resource is returned. CuraOS consent service (ADR-0115, HealthStack overlay) feeds this interceptor.
- **HAPI AuditEvent table:** HAPI stores `AuditEvent` as a FHIR resource in `HFJ_RESOURCE` + `HFJ_RES_VER` tables. Queryable via `GET /fhir/AuditEvent?...` FHIR API.
- **No native Kafka sink in HAPI 8.x:** HAPI does not publish audit events to Kafka natively. A bridge is required.

---

## 3. Decision

### 3.1 Three Modes (per-tenant)

Mode is set via `tenant.healthstack.audit-mode` config. Default per tenant profile is specified in §4. All three modes satisfy HIPAA §164.312(b) when correctly deployed. Modes differ in which system holds primary source of truth and how CuraOS enrichment is added.

---

#### Mode A — NestJS audit-service single source

**Default for:** SMB tenants (solo practice, small clinic, non-regulated SaaS tiers).

**Architecture:**

```
NestJS HealthStack service
  └─ @HealthstackAudit() interceptor (every FHIR-touching method)
       ├─ captures: actor, action, FHIR resource type + id, tenant_id,
       │            SMART scope, consent state, purpose-of-use, timestamp
       └─ publishes → Kafka topic: cura.healthstack.audit.events
            └─ audit-service consumer
                 ├─ appends hash-chained entry (ADR-0104)
                 └─ writes to audit PG (hot tier)

HAPI FHIR sidecar:
  └─ audit_logging.enabled = false   (HAPI AuditEvent interceptor disabled)
  └─ HAPI writes PHI to JPA tables (no audit side-effect inside HAPI)
```

**Key constraint:** `@HealthstackAudit()` must decorate every NestJS method that issues a HAPI FHIR call. Missing decorator = audit gap = HIPAA violation.

**CI guard enforcement (Mode A):**
- ESLint rule `@curaos/eslint-config/healthstack/require-audit` — static analysis enforces `@HealthstackAudit()` on every method in classes decorated `@HealthstackFhirService()`.
- Pre-commit hook runs ESLint on changed HealthStack modules.
- Integration test suite: every FHIR endpoint exercised → audit entry asserted in audit DB within 5 s.
- PR gate: audit coverage report — any uncovered FHIR call blocks merge.

**Pros:**
- Simplest operational model. One audit chain. No reconciliation.
- CuraOS enrichment (tenant_id, hash-chain, actor display name, geographic data) applied at source.
- No HAPI AuditEvent storage overhead.

**Cons:**
- If NestJS wrapper is bypassed (direct HAPI call, programming error, future SDK change), audit gap is invisible at runtime. CI guard is the only defense.
- Audit format is CuraOS-native, not FHIR AuditEvent. Regulatory inspectors receive a translated export, not a primary FHIR resource.
- Not suitable for TEFCA QHIN participants.

---

#### Mode B — HAPI native + bridge (dual-reconciled)

**Default for:** Enterprise tenants (hospital systems, IDNs, multi-site groups) requiring HL7-standard audit alongside CuraOS enrichment.

**Architecture:**

```
NestJS HealthStack service
  └─ @HealthstackAudit() interceptor (still active)
       └─ publishes → Kafka topic: cura.healthstack.audit.events (NestJS events)

HAPI FHIR sidecar:
  └─ audit_logging.enabled = true
  └─ AuditEventInterceptor enabled (HAPI native)
       └─ writes AuditEvent FHIR resources → HAPI JPA PostgreSQL schema

Bridge job (NestJS @nestjs/schedule, 30-second poll interval):
  └─ queries HAPI: GET /fhir/AuditEvent?date=gt{last_watermark}&_count=500
  └─ publishes each AuditEvent → Kafka topic: cura.healthstack.audit.hapi-native

audit-service consumer:
  └─ consumes both topics:
       cura.healthstack.audit.events        (NestJS wrapper events)
       cura.healthstack.audit.hapi-native   (HAPI native events)
  └─ deduplication key: (fhir_resource_type + fhir_resource_id + operation + tenant_id + timestamp_window_1s)
  └─ merged event written to hash-chained audit ledger (ADR-0104 extended)
  └─ reconciliation status: BOTH_PRESENT | NESTJS_ONLY | HAPI_ONLY | CONFLICT

Nightly reconciliation job (00:30 tenant-local-time):
  └─ queries audit ledger for prior 24h events with status != BOTH_PRESENT
  └─ publishes alert to: cura.healthstack.audit.reconciliation-gaps topic
  └─ alert-service routes to: PagerDuty (sev-2) or Slack + email (sev-3) per tenant config
  └─ report written to: audit_reconciliation_report table (retained 7 years per §5)
```

**Deduplication logic detail:**

```typescript
// Conceptual — exact impl in audit-service
interface AuditEventUnified {
  dedup_key: string;       // sha256(tenant_id + fhir_resource_type + fhir_resource_id + operation + floor(timestamp / 1000))
  nestjs_event_id?: string;
  hapi_audit_event_id?: string;  // HAPI AuditEvent.id (FHIR resource ID)
  reconciliation_status: 'BOTH_PRESENT' | 'NESTJS_ONLY' | 'HAPI_ONLY' | 'CONFLICT';
  merged_at: timestamp;
  // ... enriched fields from both sources
}
```

Timestamp window of 1 second accounts for JVM→Kafka bridge latency. If two events share the same resource + operation but timestamps differ by >1 s, they are treated as distinct events (not duplicates) and a CONFLICT alert fires.

**Pros:**
- Belt-and-suspenders. If NestJS wrapper fails, HAPI native audit still captures the event (HAPI_ONLY status triggers alert, not silent gap).
- FHIR-standard AuditEvent queryable via HAPI FHIR API for HL7-standard regulatory inspection.
- CuraOS enrichment (hash-chain, tenant_id, actor display name) added via audit-service merge step.

**Cons:**
- More moving parts: bridge job, two Kafka topics, reconciliation job, dedup logic.
- Bridge poll latency: up to 30 s before HAPI native event reaches audit ledger (acceptable for compliance; not for real-time alerting — NestJS wrapper event arrives in <2 s).
- HAPI AuditEvent storage in JPA tables adds PostgreSQL write load (~20-40 bytes per FHIR operation overhead in JPA index).
- Dedup window edge cases require careful clock synchronization (NTP drift <500 ms required; enforced via K8s node clock sync).

---

#### Mode C — HAPI native primary + CuraOS enrichment

**Default for:** Regulated tenants — TEFCA QHIN participants, BAA tenants, tenants under state audit requirements specifying FHIR-standard audit.

**Architecture:**

```
NestJS HealthStack service
  └─ @HealthstackAudit() interceptor: DISABLED for FHIR-touching operations
     (still active for non-FHIR operations: consent decisions, tenant admin, etc.)

HAPI FHIR sidecar:
  └─ audit_logging.enabled = true
  └─ AuditEventInterceptor enabled — PRIMARY SOURCE OF TRUTH
       └─ writes AuditEvent FHIR resources → HAPI JPA PostgreSQL schema
       └─ AuditEvent.agent[0].who = SMART client identity (from JWT sub claim)
       └─ AuditEvent.purposeOfEvent = SMART scope mapped to HL7 purpose-of-use code

Bridge job (NestJS @nestjs/schedule, 30-second poll):
  └─ queries HAPI: GET /fhir/AuditEvent?date=gt{last_watermark}&_count=500
  └─ enriches each event:
       ├─ resolves AuditEvent.agent[0].who → CuraOS actor display name (identity-service lookup)
       ├─ appends tenant_id (from HAPI pod's tenant env var, not from event — avoids spoofing)
       ├─ appends geographic data (actor IP → region, per ADR-0099 data residency)
       └─ appends hash-chain link (ADR-0104 extended — see §6.3)
  └─ publishes enriched event → Kafka topic: cura.healthstack.audit.hapi-primary

audit-service consumer:
  └─ consumes cura.healthstack.audit.hapi-primary
  └─ writes to hash-chained audit ledger (enrichment only; HAPI AuditEvent.id is primary key)
  └─ HAPI AuditEvent resource remains queryable via FHIR API (primary regulatory artifact)

Regulatory export:
  └─ Audit inspector queries HAPI FHIR API: GET /fhir/AuditEvent?patient=Patient/123&date=...
  └─ CuraOS audit-service provides enriched view: GET /audit/fhir-events?tenant=...&patient=...
       (returns HAPI AuditEvent resources + CuraOS enrichment fields as FHIR extension elements)
```

**TEFCA-specific compliance:**

TEFCA IAS v1.0 §5.4 requires AuditEvent resources to be queryable via standard FHIR API. Mode C satisfies this natively: HAPI stores AuditEvent as first-class FHIR resources; the regulatory inspector queries them directly. CuraOS enrichment is stored as FHIR `extension` elements on the AuditEvent (using CuraOS-defined extension URLs), so the enriched event is still valid FHIR R4/R5.

**Pros:**
- FHIR-standard primary source. TEFCA-compliant out of the box.
- CuraOS hash-chain and enrichment are additive, not the primary record. Regulatory inspection does not depend on CuraOS internal systems.
- No deduplication complexity (single source).

**Cons:**
- NestJS wrapper disabled for FHIR operations. If bridge job fails, CuraOS hash-chain falls behind (alert fires; HAPI audit still complete).
- Tenant must operate under HAPI native AuditEvent data model. Custom audit fields not expressible in FHIR AuditEvent require FHIR extension definitions.
- Bridge poll latency: same 30-s window as Mode B for enrichment.

---

## 4. Per-Tenant Configuration

### 4.1 Config Schema

```yaml
# Location: tenant.healthstack.yaml (per-tenant config, in Vault per ADR-0108)
audit:
  mode: dual-reconciled          # single-source | dual-reconciled | hapi-primary
  retention:
    hot_days: 90                 # PostgreSQL hot tier (audit-service DB)
    warm_days: 2555              # ClickHouse warm tier (7 years = 2555 days; HIPAA minimum 6y)
    cold_years: 10               # SeaweedFS WORM cold tier (immutable objects)
  reconciliation:
    nightly_check: true          # Mode B only; ignored in Mode A and C
    alert_on_gap: true
    gap_alert_severity: sev-2    # sev-1 | sev-2 | sev-3
    gap_alert_channels:
      - pagerduty
      - slack
  bridge:
    poll_interval_seconds: 30    # Mode B and C only; min 10, max 300
    batch_size: 500              # HAPI AuditEvent query page size
    watermark_store: valkey      # valkey (default) | pg
```

### 4.2 Default Mode by Tenant Profile

Profile is set at tenant provisioning time and can be overridden:

| `tenant.profile` | Default `audit.mode` | Rationale |
|---|---|---|
| `smb` | `single-source` | Simplicity; HIPAA baseline sufficient |
| `enterprise` | `dual-reconciled` | Belt-and-suspenders; HL7 audit expected |
| `baa-partner` | `dual-reconciled` | BAA terms; FHIR AuditEvent expected |
| `tefca-qhin` | `hapi-primary` | TEFCA IAS §5.4 mandatory |
| `regulated` | `hapi-primary` | State law specifies FHIR-standard |

### 4.3 Runtime Config Propagation

- Config is stored in Vault (`secret/tenant/{tenant_id}/healthstack`).
- NestJS HealthStack service reads config at startup via `@nestjs/config` + Vault provider (ADR-0108).
- HAPI FHIR sidecar reads `HAPI_AUDIT_ENABLED` env var injected by K8s Helm chart, derived from tenant config at pod start. **HAPI does not read Vault directly** — env injection is the boundary.
- Bridge job reads tenant config from NestJS config service (shared module).
- Mode change (e.g., SMB → enterprise upgrade) requires pod restart to apply HAPI env var change. NestJS config change is hot-reloadable.

---

## 5. Audit Event Schema

### 5.1 Unified Audit Event (all modes publish to audit-service)

```typescript
// @curaos/audit-contracts v1 — AuditEvent canonical shape
interface CuraOSAuditEvent {
  // Identity
  event_id: string;           // UUID v7 (time-ordered)
  tenant_id: string;          // CuraOS tenant ID (never derived from HAPI)
  correlation_id: string;     // Distributed trace ID (OpenTelemetry)

  // Actor (HIPAA: who)
  actor_id: string;           // CuraOS identity ID (maps to FHIR Practitioner | Patient | RelatedPerson)
  actor_display: string;      // Display name at time of event (not re-resolved after archival)
  actor_ip: string;           // Client IP (hashed for cold tier)
  actor_region: string;       // ISO 3166-2 region code
  actor_type: 'practitioner' | 'patient' | 'related-person' | 'system' | 'admin';

  // Action (HIPAA: what)
  fhir_resource_type: string; // e.g. "Patient", "Observation", "MedicationRequest"
  fhir_resource_id: string;   // FHIR resource ID
  fhir_version_id?: string;   // FHIR resource version (for update/delete)
  operation: 'read' | 'search' | 'create' | 'update' | 'delete' | 'transaction' | 'patch';
  fhir_query_params?: string; // For search: sanitized query string (no PHI)

  // SMART + consent (HIPAA: purpose)
  smart_scope: string;        // e.g. "patient/Observation.read"
  purpose_of_use: string;     // HL7 v3 PurposeOfUse code: TREATMENT | PAYMENT | OPERATIONS | SYSADMIN | BREAK-GLASS
  consent_state: 'permit' | 'deny' | 'no-consent-record' | 'break-glass';
  consent_policy_id?: string; // Links to consent-service (ADR-0115)

  // Outcome (HIPAA: result)
  outcome: 'success' | 'minor-failure' | 'serious-failure' | 'major-failure';
  http_status?: number;
  error_code?: string;

  // Timing (HIPAA: when)
  occurred_at: string;        // ISO 8601 UTC
  recorded_at: string;        // When audit-service wrote the entry (may differ by bridge latency)

  // Source metadata (mode-specific)
  source: 'nestjs-wrapper' | 'hapi-native-bridge';
  hapi_audit_event_id?: string; // FHIR AuditEvent.id (Mode B and C only)

  // Hash-chain (ADR-0104 extended)
  chain_seq: bigint;          // Monotonic sequence within tenant chain
  chain_hash: string;         // SHA-256(prev_hash + event fields)
  prev_hash: string;          // Hash of prior entry (genesis entry uses tenant_id + '0')
}
```

### 5.2 HIPAA §164.312(b) Coverage Mapping

| HIPAA element | CuraOS field |
|---|---|
| User identification | `actor_id` + `actor_display` |
| Type of event | `operation` + `fhir_resource_type` |
| Date and time | `occurred_at` |
| Success or failure | `outcome` |
| Origin of event | `actor_ip` + `actor_region` |

### 5.3 Retention Tiers

| Tier | Storage | Retention | Notes |
|---|---|---|---|
| Hot | PostgreSQL (audit-service DB) | `hot_days` (default 90) | Full event, indexed, queryable |
| Warm | ClickHouse (columnar) | `warm_days` (default 2555 / 7y) | Full event, append-only, compressed |
| Cold | SeaweedFS WORM | `cold_years` (default 10) | Immutable object; actor_ip hashed; GDPR right-to-be-forgotten compliant |

HIPAA minimum: 6 years from creation or last effective date. Default warm tier (7 years) exceeds minimum. TEFCA QHINs: no additional audit retention requirement beyond HIPAA baseline as of TEFCA v1.

---

## 6. Reconciliation Logic (Mode B)

### 6.1 Dedup Algorithm

```
dedup_key = sha256(
  tenant_id
  + fhir_resource_type
  + fhir_resource_id
  + operation
  + floor(occurred_at_epoch_ms / 1000)   // 1-second window
)
```

Events with the same `dedup_key` from both topics are merged into a single `CuraOSAuditEvent` with `reconciliation_status = BOTH_PRESENT`. Fields from the NestJS wrapper take precedence for CuraOS-specific enrichment (actor_display, SMART scope, consent_state). Fields from HAPI native take precedence for FHIR-standard fields (fhir_resource_id, fhir_version_id, hapi_audit_event_id).

### 6.2 Reconciliation Statuses

| Status | Meaning | Action |
|---|---|---|
| `BOTH_PRESENT` | NestJS wrapper + HAPI native both fired | None (expected) |
| `NESTJS_ONLY` | NestJS wrapper fired; HAPI native missing | Alert sev-3 (config mismatch — HAPI audit may be disabled) |
| `HAPI_ONLY` | HAPI native fired; NestJS wrapper missing | Alert sev-2 (wrapper bypass — possible audit gap in CuraOS enrichment) |
| `CONFLICT` | Same resource + operation, timestamp delta >1 s | Alert sev-2 (clock skew or duplicate operation) |

### 6.3 Nightly Reconciliation Report

Job runs at 00:30 tenant-local-time (or UTC if tenant has no local-time preference).

```
report_window: prior 24 hours (00:00:00 to 23:59:59 UTC)
query:
  SELECT reconciliation_status, count(*) as event_count, array_agg(event_id) as sample_ids
  FROM audit_events
  WHERE tenant_id = ? AND recorded_at BETWEEN ? AND ?
  GROUP BY reconciliation_status
```

Report written to `audit_reconciliation_reports` table. If any `HAPI_ONLY` or `CONFLICT` records exist, alert fires. `NESTJS_ONLY` count > 0 triggers a sev-3 config review alert (Mode B misconfiguration suspected).

---

## 7. CI Guards

### 7.1 ESLint Rule — `require-audit`

Rule: `@curaos/eslint-config/healthstack/require-audit`

Enforces: Any method in a class decorated `@HealthstackFhirService()` that calls `this.hapiClient.*` (or any method from `@curaos/hapi-client`) must be decorated `@HealthstackAudit()`.

```typescript
// FAIL — missing @HealthstackAudit
@HealthstackFhirService()
class ObservationService {
  async getObservation(id: string) {          // ESLint error: missing @HealthstackAudit
    return this.hapiClient.read('Observation', id);
  }
}

// PASS
@HealthstackFhirService()
class ObservationService {
  @HealthstackAudit({ resourceType: 'Observation', operation: 'read' })
  async getObservation(id: string) {
    return this.hapiClient.read('Observation', id);
  }
}
```

Rule is enforced in Mode A (required) and Mode B (defense-in-depth). In Mode C, `@HealthstackAudit()` on FHIR operations is still present but marks `source: 'nestjs-wrapper'` and is NOT published to audit ledger for FHIR ops — it's a no-op publish that is swallowed, preserving code consistency while HAPI native is primary.

### 7.2 Integration Test Requirement

Every FHIR endpoint in HealthStack integration test suite:

```
Given: FHIR endpoint called (e.g. GET /fhir/Patient/123)
When: Request completes (success or failure)
Then: audit_events table contains entry with:
  - fhir_resource_type = 'Patient'
  - fhir_resource_id = '123'
  - operation = 'read'
  - tenant_id = test_tenant_id
  - outcome = 'success' | 'minor-failure' | ...
  - recorded_at within 5 seconds of request time
```

Test fails CI if audit entry not present within 5-second poll timeout.

### 7.3 Audit Coverage Report (PR Gate)

CI step runs `audit-coverage` tool (custom; lives in `tools/audit-coverage/`):

1. Parses TypeScript AST of all `@HealthstackFhirService()` classes.
2. Counts methods calling `hapiClient.*`.
3. Counts methods decorated `@HealthstackAudit()`.
4. Reports coverage ratio.
5. Blocks merge if coverage < 100%.

Coverage report posted as PR comment. Zero-tolerance policy: 100% coverage required.

### 7.4 Reconciliation Alert CI Canary

In staging environment (Mode B), a canary test intentionally bypasses `@HealthstackAudit()` on one endpoint and verifies that:

1. HAPI native audit fires (`HAPI_ONLY` status appears in audit ledger).
2. Nightly reconciliation job (triggered manually in CI) produces a non-empty gap report.
3. Alert fires to test Slack channel.

This canary validates the Mode B safety net end-to-end.

---

## 8. SMART Scope + Audit Detail

### 8.1 SMART Scope Capture

Every FHIR request is authenticated via SMART-on-FHIR (ADR-0120). The SMART scope granted to the client is extracted from the JWT `scope` claim and included in the audit event.

```
JWT: { "scope": "patient/Observation.read patient/Patient.read", "sub": "user-uuid" }
→ audit event: { "smart_scope": "patient/Observation.read", ... }  // per-operation scope
```

For transaction bundles, each entry's operation scope is audited individually. A transaction containing a `Patient` read and an `Observation` write produces two audit entries with their respective scopes.

### 8.2 Purpose of Use

SMART-on-FHIR v2 `fhirContext` extension or a CuraOS custom claim (`curaos.purpose_of_use`) carries the HL7 v3 PurposeOfUse code. Accepted values:

| Code | Meaning | Notes |
|---|---|---|
| `TREATMENT` | Treatment | Default for clinician access |
| `PAYMENT` | Payment | Billing and claims workflows |
| `OPERATIONS` | Health care operations | Quality, analytics |
| `SYSADMIN` | System administration | Admin tools, migrations |
| `BREAK-GLASS` | Emergency override | Requires reason; sev-1 alert fires immediately |

If `purpose_of_use` is absent from the token, audit-service defaults to `TREATMENT` and flags `purpose_inferred: true` in the event.

### 8.3 Break-Glass Audit

Break-glass access (emergency override of consent restriction) triggers:

1. `consent_state = 'break-glass'` in audit event.
2. `purpose_of_use = 'BREAK-GLASS'`.
3. Immediate sev-1 PagerDuty alert (all modes, no config override).
4. Break-glass reason stored in `break_glass_reason` field (free text, required).
5. Consent-service (ADR-0115) records break-glass incident with clinician attestation.

Break-glass events are never deduped or suppressed by the reconciliation logic. Both HAPI native and NestJS wrapper entries are preserved independently.

### 8.4 Consent State Integration

Before `@HealthstackAudit()` publishes an audit event, it calls consent-service (ADR-0115) to retrieve the current consent state for the patient × purpose-of-use × actor. This call is synchronous and in the hot path.

- **permit:** Access allowed. Audit entry created with `consent_state = 'permit'`.
- **deny:** Access blocked. Audit entry still created with `consent_state = 'deny'` and `outcome = 'serious-failure'`. HAPI call is NOT made.
- **no-consent-record:** No consent record found. Access proceeds under HIPAA Treatment exception. Audit entry flags `consent_state = 'no-consent-record'`.
- **break-glass:** See §8.3.

In Mode C (HAPI primary), consent enforcement happens at HAPI's `ConsentInterceptor` (fed by consent-service). NestJS audit interceptor still records consent state for non-FHIR operations.

---

## 9. Failure Modes

### 9.1 Kafka Unavailable

| Mode | Impact | Mitigation |
|---|---|---|
| A (single-source) | Audit events lost for duration of outage. HIPAA gap. | NestJS HealthStack service switches to degraded mode: FHIR calls blocked (configurable per `audit.on_kafka_failure: block | warn`). Default `block`. |
| B (dual-reconciled) | NestJS audit events lost. HAPI native audit continues (stored in JPA). Bridge job catches up on reconnect. | Sev-2 alert on Kafka disconnect. Bridge job retries with exponential backoff. |
| C (hapi-primary) | Bridge job cannot enrich. HAPI audit continues (primary source intact). | Sev-3 alert. Bridge resumes and catches up after reconnect. |

**Recommendation:** Mode A tenants should evaluate Mode B if their HIPAA posture cannot accept the block-on-Kafka-failure UX.

### 9.2 HAPI Sidecar Unavailable

All modes: NestJS HealthStack service cannot complete FHIR operations. Returns 503 to caller. Audit event with `outcome = 'major-failure'` is published (NestJS wrapper fires on exception path; HAPI never reached). No PHI access occurred; audit gap does not exist for failed requests.

### 9.3 Bridge Job Failure (Mode B and C)

- Bridge watermark stored in Valkey (or PostgreSQL per config). If bridge pod restarts, it resumes from last watermark.
- Max catch-up window: `bridge.poll_interval_seconds` × missed polls. With 30-s interval and 1-hour outage: 120 polls × 500 events = 60,000 events caught up in ~60 minutes post-restart.
- If bridge falls >4 hours behind: sev-2 alert. Manual catch-up procedure in runbook `ai/curaos/docs/ops/audit-bridge-catchup.md`.

### 9.4 Dedup Collision (Mode B)

Two legitimately distinct PHI accesses (same patient, same operation, within 1 second, by different actors) would share a `dedup_key`. Resolution:

- `dedup_key` includes actor_id: `sha256(tenant_id + actor_id + fhir_resource_type + fhir_resource_id + operation + floor(occurred_at_epoch_ms / 1000))`.
- Two different actors accessing the same resource within 1 second produce distinct `dedup_key` values.
- Same actor, same resource, two operations within 1 second: second event gets `chain_seq + 1`; reconciliation status set to `CONFLICT` for human review. This is an edge case (typical FHIR read-then-read pattern is >1 s apart due to UI roundtrip).

### 9.5 Clock Skew

NestJS and HAPI JVM are in the same K8s pod (per-tenant pod per ADR-0109). Clock skew between NestJS and JVM processes within one pod is negligible (<10 ms). Clock skew across pods (bridge job polls from a different pod) is bounded by K8s node NTP sync (<50 ms on standard config). The 1-second dedup window is designed to absorb this margin. If NTP is misconfigured and skew exceeds 500 ms, the CONFLICT status fires as an early warning.

---

## 10. Performance Impact

### 10.1 Mode A

- `@HealthstackAudit()` interceptor adds: ~1 ms for consent-service call (cached in Valkey, TTL 60 s) + ~0.5 ms for Kafka publish (async, non-blocking). Total hot-path overhead: ~1.5 ms P99.
- Consent-service cache hit rate expected >95% for repeat actor × patient × purpose combinations.

### 10.2 Mode B

- Mode A overhead applies to NestJS path.
- HAPI native AuditEvent write: ~5 ms (JPA insert into `HFJ_RESOURCE` + `HFJ_RES_VER` tables; HAPI internal, cannot be optimized from NestJS side).
- Bridge job: runs async every 30 s; HAPI query load is a single paginated search. At 10,000 FHIR ops/hour: 300 events per 30-s window; single page, negligible HAPI load.
- audit-service dedup + merge: ~2 ms per event (in-memory dedup map with 1-s TTL).

### 10.3 Mode C

- NestJS path: `@HealthstackAudit()` disabled for FHIR ops; no hot-path overhead from NestJS side.
- HAPI native AuditEvent: same ~5 ms as Mode B.
- Bridge enrichment: async, no hot-path impact.

### 10.4 PostgreSQL audit table write throughput

Target: 10,000 FHIR ops/min per tenant (enterprise tier). Audit event size: ~2 KB uncompressed. Write rate: 10,000 rows/min × 2 KB = ~20 MB/min per tenant. PostgreSQL table-partitioned by `recorded_at` (monthly partitions). ClickHouse warm tier migration job runs nightly for rows older than `hot_days`. PostgreSQL hot tier remains small (<90 days).

---

## 11. Amendments to Existing ADRs

### 11.1 ADR-0104 — Identity / Auth Hash-Chained Audit

**Amendment:** Extend hash-chain design to support HAPI native event ingestion (Mode B and C).

Changes:
- §Sub-decision 4: Add `source` field (`nestjs-wrapper` | `hapi-native-bridge`) to audit event schema.
- §Sub-decision 4: `hapi_audit_event_id` field added (nullable; populated in Mode B/C).
- §Sub-decision 4: Hash-chain algorithm unchanged. Hash input includes all canonical fields regardless of source; `hapi_audit_event_id` included in hash input when present.
- New §Sub-decision 8: Bridge ingestion. HAPI native events ingested via bridge job into the same hash-chained ledger. Bridge events are first-class chain entries, not secondary annotations. Sequence continuity preserved (no gaps in `chain_seq` regardless of source).
- New §Sub-decision 9: Reconciliation status. Mode B adds `reconciliation_status` column to audit table. Not part of hash input (metadata, not event content).

### 11.2 ADR-0115 — HealthStack Overlays

**Amendment:** Replace ambiguous §4.2.2 audit wording with three-mode spec reference.

Original text (§4.2.2): "HAPI FHIR JPA on PostgreSQL 17. Use Atlas (ADR-0110) for all schema migrations."

Amended addition: "Audit integration per ADR-0157. Default audit mode per tenant profile: SMB → `single-source`, enterprise → `dual-reconciled`, TEFCA QHIN / BAA / regulated → `hapi-primary`. HAPI `audit_logging.enabled` env var injected by Helm chart per tenant config. ConsentInterceptor wired to consent-service in all modes."

### 11.3 ADR-0150 — Baseline Alignment Rules

**Amendment:** §2 provider abstraction — add `AuditProvider` as named interface example.

Addition to §2 provider table:

| Concern | Interface | Local default | 3rd-party option |
|---|---|---|---|
| PHI audit | `AuditProvider` | CuraOS audit-service (hash-chained Kafka + PG) | HAPI native AuditEvent (Mode C) |

`AuditProvider` interface exposes: `publish(event: CuraOSAuditEvent): Promise<void>`. Implementations: `KafkaAuditProvider` (default), `HapiNativeAuditProvider` (Mode C — no-op publish; HAPI handles). Mode selection determines which provider is injected at startup.

### 11.4 ADR-0208 — HealthStack Cluster Clinical Services

**Amendment:** Add per-service audit mode requirements.

Addition to §audit (new section if not present):

Each HealthStack clinical service must declare its required audit mode in its `healthstack-service.yaml` manifest:

```yaml
# Example: encounter-service
healthstack:
  audit_mode_min: single-source   # minimum required mode for this service
  audit_mode_preferred: dual-reconciled
  phi_resource_types:             # FHIR resource types this service touches
    - Encounter
    - Condition
    - Observation
```

Services declaring `phi_resource_types` are automatically included in the ESLint audit-coverage scan and integration test audit assertion suite. Services with `audit_mode_min: hapi-primary` cannot be deployed to tenants with `audit.mode: single-source` (Helm chart validation gate enforces this).

---

## 12. Action Items

| Item | Owner | Deadline | Blocking |
|---|---|---|---|
| Implement `@HealthstackAudit()` decorator + `@HealthstackFhirService()` marker | HealthStack Engineering | Sprint N | All FHIR service development |
| Implement `@curaos/eslint-config/healthstack/require-audit` ESLint rule | Platform DX | Sprint N | Mode A CI gate |
| Implement audit-service consumer for `cura.healthstack.audit.events` topic | Audit Engineering | Sprint N | Mode A |
| Implement HAPI AuditEvent bridge job (`@nestjs/schedule` + HAPI FHIR REST query) | HealthStack Engineering | Sprint N+1 | Mode B, C |
| Implement dedup + reconciliation logic in audit-service | Audit Engineering | Sprint N+1 | Mode B |
| Implement nightly reconciliation report + alert routing | Platform Ops | Sprint N+1 | Mode B |
| Implement `audit-coverage` CLI tool (PR gate) | Platform DX | Sprint N | Mode A CI gate |
| Write Helm chart injection for `HAPI_AUDIT_ENABLED` per tenant config | Platform Ops | Sprint N+1 | Mode B, C |
| Implement consent-service sync call in `@HealthstackAudit()` + Valkey cache | HealthStack + Consent Engineering | Sprint N+1 | §8.4 |
| Write integration test audit assertion harness | QA Engineering | Sprint N+1 | CI gate §7.2 |
| Write Mode B canary test (bypass + detect) | QA Engineering | Sprint N+2 | §7.4 |
| Define FHIR extension URLs for CuraOS enrichment fields (Mode C) | HealthStack Engineering | Sprint N+1 | Mode C |
| Write ops runbook: `audit-bridge-catchup.md` | Platform Ops | Sprint N+1 | §9.3 |
| Apply ADR-0104 amendments (extend schema + chain spec) | Architecture | Sprint N | ADR coherence |
| Apply ADR-0115 amendments (audit wording) | Architecture | Sprint N | ADR coherence |
| Apply ADR-0150 amendments (AuditProvider) | Architecture | Sprint N | ADR coherence |
| Apply ADR-0208 amendments (per-service audit mode manifest) | Architecture | Sprint N+1 | ADR coherence |

---

## 13. Open Questions

**OQ-1:** Should the consent-service call in `@HealthstackAudit()` be synchronous (blocking FHIR call until consent verified) or asynchronous (audit published optimistically, consent violation flagged post-hoc)?

Current decision: synchronous, because optimistic access with post-hoc flagging violates HIPAA consent enforcement (PHI already delivered before flag). Synchronous adds ~1 ms hot-path latency (Valkey-cached). Revisit if P95 latency budget exceeded.

**OQ-2:** In Mode B, should the bridge job use HAPI FHIR REST (`GET /fhir/AuditEvent?date=gt...`) or direct PostgreSQL query against HAPI's JPA schema?

Current decision: HAPI FHIR REST. Reasons: (1) avoids coupling to HAPI internal schema (JPA table structure changes between HAPI versions); (2) FHIR API is the supported integration surface. Trade-off: slower than direct SQL. If bridge falls behind at enterprise scale, revisit direct JPA query with schema-version pin.

**OQ-3:** GDPR right-to-be-forgotten vs. audit log immutability. For Mode C (HAPI primary), HAPI stores AuditEvent as a FHIR resource. Can a GDPR subject request deletion of their AuditEvent entries? HIPAA requires retention; GDPR allows deletion of personal data.

Interim position: Audit logs are retained under HIPAA as legal obligation (GDPR Art. 17(3)(b) — legal obligation exemption). Actor IP is hashed at cold-tier migration for minimal PII in cold storage. Subject requests are logged but not actioned on audit entries. Legal review required per jurisdiction before deployment.

**OQ-4:** Distributed tracing — should `correlation_id` in audit events link to OpenTelemetry trace spans? If yes, audit-service must consume the OTEL trace context from Kafka message headers. This would allow a single trace to show both the FHIR operation span and the audit-write span. Proposed: add to Sprint N+2 scope once OTEL is baseline (ADR-0XXX OTEL).

---

## 14. References

- ADR-0104 — Identity / Auth Hash-Chained Audit (amended by this ADR)
- ADR-0109 — K8s Capsule Namespace Isolation (per-tenant pod scoping)
- ADR-0115 — HealthStack Overlays (HAPI FHIR sidecar, ConsentInterceptor, amended by this ADR)
- ADR-0120 — Auth (SMART-on-FHIR JWT, SMART scopes)
- ADR-0123 — NestJS Interceptors + event-bus interceptor abstraction
- ADR-0150 — Baseline Alignment Rules (AuditProvider amendment)
- ADR-0151 F-004 — Cross-Cluster Coherence Scan: HAPI FHIR JVM sidecar PHI audit pathway gap (resolved by this ADR)
- ADR-0208 — HealthStack Cluster Clinical Services (audit mode manifest amendment)
- HIPAA §164.312(b) — Audit Controls
- HIPAA §164.308(a)(1)(ii)(D) — Information System Activity Review
- TEFCA IAS v1.0 §5.4 — Audit Log Requirements
- SMART on FHIR v2 specification — `fhirContext` extension, scope syntax
- HAPI FHIR 8.x — IServerInterceptor, AuditEventInterceptor, ConsentInterceptor documentation
- HL7 FHIR R4 AuditEvent resource specification
- HL7 v3 PurposeOfUse code system
