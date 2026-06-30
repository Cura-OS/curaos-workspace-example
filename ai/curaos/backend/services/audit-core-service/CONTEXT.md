# CONTEXT.md — audit-core-service

## Purpose

Neutral primitives for audit (canonical durable audit chain head store + tamper-evident hash chain (ADR-0210 neutral root)). Owned, reused by personal + business overlays + any future vertical. Domain overlay: `neutral`.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`

## Integration Points

- Consumed by `personal-audit-service` and `business-audit-service`
- Events CONSUMED (M9-S5.2, #248):
  - `curaos.core.audit.event.v1` (`AUDIT_TOPIC`) — the neutral audit stream every
    generated service's `*AuditPublisher` emits to. audit-core is the **first and
    canonical consumer**; the kafkajs `KafkaAuditConsumer` subscribes `fromBeginning`
    on first boot and re-validates the SHA-256 hash chain on consume.
- Events PRODUCED (M9-S5.2, #248) — reference-only, never PHI:
  - `curaos.core.audit.chain.verified.v1` — emitted after an envelope's chain is
    re-validated + the head advanced; payload `{tenantId, resourceType, resourceId,
    chainHead, eventId, occurredAt}`.
  - `curaos.core.audit.chain.broken.v1` — emitted on a chain break (hash mismatch /
    discontinuity / CAS conflict); payload is the `AuditChainHeadConflictError` shape
    `{tenantId, resourceType, resourceId, expectedPrevious, storedPrevious, reason}`.
    audit-core **fails closed** on a break: the canonical `audit_chain_heads` head is
    NOT advanced for a broken/forged event.
- Events VALIDATED (M14, audit-core-service#9):
  - `curaos.healthstack.disclosure.recorded.v1` — Zod-4 schema exported from the
    package barrel for HIPAA accounting-of-disclosures payloads. Required fields
    mirror `ai/curaos/docs/research/m14-compliance-prereqs.md`: `tenant_id`,
    `subject_ref`, `disclosure_id`, `disclosed_at`, `recipient_name`,
    `recipient_address`, `phi_description`, `purpose`, `legal_basis`,
    `request_ref`, `source_service`, `correlation_id`, and `audit_chain_ref`.
    `phi_description`, `subject_ref`, `purpose`, `legal_basis`, and
    `request_ref` are reference/category fields and reject DOB/SSN/"First Last"
    PHI-like values before neutral audit storage. `recipient_name` and
    `recipient_address` remain required HIPAA accounting recipient fields and
    are intentionally not run through the personal-name heuristic.
- Events PROJECTED (M14, audit-core-service#10):
  - `curaos.healthstack.disclosure.recorded.v1` events materialize into the
    tenant-scoped `disclosure_accounting` projection keyed by
    `(tenant_id, disclosure_id)`. Replay is idempotent; duplicate events update
    one projection row rather than creating report duplicates.
  - Six-year report reads use the request timestamp as the upper bound and
    compute `requestedAt - 6 years` as the default lower bound. Reads filter by
    JWT-derived tenant id plus `subject_ref`; tenant query overrides remain
    blocked by `AuthGuard`.
- Events PROJECTED (M14, audit-core-service#8):
  - `cura.compliance.subject-rights.step-completed` evidence events materialize
    into the tenant-scoped `subject_rights_certificate_evidence` projection
    keyed by `(tenant_id, request_id, service_name, action, step)`.
  - Projection rows carry `tenant_id`, `request_id`, `subject_ref`,
    `subject_type`, `service_name`, `action`, `step`, item counts, bounded
    exception codes/counts, audit-chain refs, event id, correlation id, and
    timestamps. They never store raw subject names, export bundle contents, or
    PHI/PII values.
  - The `SubjectRightsCertificateConsumer` subscribes to
    `curaos.workflow.events.v1` from the beginning and awaits projection before
    its handler resolves, preserving process-then-commit semantics under Kafka
    auto-commit. Duplicate delivery upserts one row.
- Events PROJECTED (M14, audit-core-service#12):
  - Workflow-core break-glass lifecycle events from workflow-core-service#33
    (`curaos.security.break-glass.requested.v1`,
    `approval-recorded.v1`, `elevation-requested.v1`, `expired.v1`,
    `rejected.v1`, `review-queued.v1`, `review-completed.v1`) and
    identity-service#79 break-glass use/failure events materialize into the
    tenant-scoped break-glass audit evidence projection.
  - Projection rows carry tenant id, request id, event type, deterministic
    evidence id, requester id, resource scope, reason/category, lifecycle state,
    review state, actor id, approver ids, bounded justification/outcome text,
    duration/window timestamps, correlation id, optional audit-chain ref, and
    projection timestamps. They never store raw patient names, subject names,
    clinical payloads, credential values, or raw event payloads.
  - `BreakGlassAuditEvidenceConsumer` subscribes to `curaos.workflow.events.v1`
    and `curaos.identity.events.v1` from the beginning and awaits projection
    before handler resolution. Duplicate delivery upserts one evidence row by
    tenant/request/event/evidence id.
  - Query shape: `postActionReviewQueue({ tenantId, requestId? })` returns
    currently queued post-action review evidence only when no later completed
    review event exists; `complianceExport({ tenantId, from?, to?, requestId?,
    requesterId?, resourceScope?, lifecycleState?, reviewState?, eventTypes? })`
    returns reference-only evidence for compliance export.
- Retention/report gate (M14, audit-core-service#11):
  - [`audit-retention-runbook.md`](audit-retention-runbook.md) maps the HIPAA
    six-year disclosure accounting floor to the existing seven-year audit event
    retention path plus the reference-only `disclosure_accounting` projection.
  - Service-local verification command:
    `bun run test:disclosure-report-runbook`. It proves six-year lookback,
    tenant scoping, and neutral output redaction for the disclosure accounting
    report.
- Consume-path gate: every consumed envelope passes the reference-only Zod-4
  `AuditEventEnvelopeSchema` PHI superRefine (DOB/SSN/"First Last") BEFORE the chain is
  touched — a PHI-bearing envelope is `rejected`, never validated, never archived.
- Chain re-validation wires to the **existing** `AuditChainHeadStore` (S5.1 scaffold,
  `src/audit/audit-chain-head.store.ts`) via read-and-verify + compare-and-set — the
  hash chain is NOT re-implemented in the consumer.
- Runtime gating: the kafkajs consumer connects to a broker only when
  `AUDIT_CONSUMER_ENABLED=1` (+ `KAFKA_BROKERS`, `AUDIT_CONSUMER_GROUP_ID`); the
  broker-agnostic `AuditChainValidator` is always available for direct/modulith calls.
- Runtime gating: the subject-rights certificate consumer connects only when
  `SUBJECT_RIGHTS_CERTIFICATE_CONSUMER_ENABLED=1` (+ `KAFKA_BROKERS`,
  `SUBJECT_RIGHTS_CERTIFICATE_CONSUMER_GROUP_ID`); the projection service is
  always available for direct/modulith calls.
- Generator fold-back (research §8, [[curaos-generator-evolution-rule]]):
  `KafkaAuditConsumer` + `AuditChainValidator` are reusable by **every** audit-stream
  consumer and belong in the codegen `templates/service-core/src/events/` family
  alongside `{{kebabCase name}}-event-producer.ts.hbs`. The fold-back lands in the
  S5.3 (#244) lane (the in-flight-generator-barrier-aware lane), NOT in this S5.2 PR
  (cross-repo `tools/codegen` is out of the S5.2 owned paths).
- APIs: REST `/audits/disclosures/accounting` for disclosure accounting lookup
  plus existing `/audits/*` health/protected/read scaffolds.
## Open Questions

- TODO: confirm canonical event names with domain owners
- TODO: confirm storage partition strategy (DB-per-tenant vs schema-per-tenant)


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- [`Requirements.md`](Requirements.md) — full spec
- [`audit-retention-runbook.md`](audit-retention-runbook.md) — tiered-retention ops runbook (M9-S5.4: KIP-405 hot 90d → SeaweedFS S3 cold 7y, per-tenant override, air-gap-off)
- [`research/2026-06-05-disclosure-retention-runbook-gate.md`](research/2026-06-05-disclosure-retention-runbook-gate.md) — M14 disclosure accounting retention/report gate research
- [`research/2026-06-05-subject-rights-certificate-projection.md`](research/2026-06-05-subject-rights-certificate-projection.md) — M14 subject-rights certificate audit evidence projection research
- [`research/2026-06-05-break-glass-audit-projection.md`](research/2026-06-05-break-glass-audit-projection.md) — M14 break-glass audit projection and review evidence research
