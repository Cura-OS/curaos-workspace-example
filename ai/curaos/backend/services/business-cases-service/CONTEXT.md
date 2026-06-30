# business-cases-service — Agent Context

**ADR-0205 §3.11** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | Kafka/NATS (ADR-0102) | Temporal client (ADR-0122) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT + mTLS (ADR-0156) | OTel (ADR-0107) | TypeSpec → REST + tRPC

---

## Dependency Graph

```
business-cases-service
  ──▶ document-core-service (case attachments via CaseAttachment.document_id)
  ──▶ party-service (reporter_party_id, assigned_to_party_id)
  ──▶ crm-service (event: opportunity.lost → auto-case)
  ──▶ notify-service (SLA warning + breach notifications)
  ──▶ Temporal (ADR-0122) — case-sla workflow
  ──▶ PostgreSQL 17, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155

Consumed by:
  business-projects-service (case resolution optionally linked to project task)
  analytics (ADR-0113) — throughput + SLA breach metrics
```

---

## Key Design Constraints

- **SLA timer via Temporal only.** No `setTimeout` or cron in application code for SLA. Temporal timer activities handle warning + breach.
- **Attachments via document-core.** Never store file bytes in business-cases-service PG. `CaseAttachment` stores only `document_id`.
- **Assignment policies are tenant-configurable.** `Queue.assignment_policy` is a field, not hardcoded logic. Each policy (round_robin, manual, skill_based) is a pluggable strategy.
- **`is_internal` comment flag.** Internal comments visible to agents only (Cerbos gated); not visible to case reporter.

---

## Files Must Not Break

- `business.case.sla.breached` Kafka topic — consumed by business-workflow-service escalation.
- `business.case.resolved` — consumed by analytics + optionally by business-projects.
- document-core API contract for attachments.

---

## Test Requirements

- SLA workflow (Temporal test server): warning fires at T-1h; breach fires at T-0.
- `crm.opportunity.lost` → case auto-created (configurable toggle per tenant).
- Queue round-robin: 3 agents, 6 cases → 2 each.
- Internal comment: reporter JWT → `GET /cases/:id/comments` omits `is_internal = true` comments.
- Cerbos: agent sees only assigned-queue cases; admin sees all.
