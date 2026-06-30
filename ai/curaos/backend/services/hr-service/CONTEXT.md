# hr-service — Agent Context

**ADR-0205 §3.10** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack (locked by ADR-0205 + ADR-0100)

| Concern | Choice |
|---|---|
| Runtime | NestJS + Fastify (TypeScript) |
| Primary DB | PostgreSQL 17 (schema-per-tenant, ADR-0101) |
| Cache | Valkey (ADR-0101) |
| Messaging | Kafka/NATS + outbox (ADR-0102) |
| Workflow | Temporal TS SDK via `@curaos/workflow-client` (ADR-0122) |
| Auth | Better Auth + Cerbos ABAC (ADR-0120) |
| Tenancy | `@curaos/tenancy` TenantModule (ADR-0155) — mandatory |
| Token flow | JWT Layer 1 (user) + mTLS Layer 3 (service) per ADR-0156 |
| Audit | Hash-chain PG per ADR-0104 |
| Observability | OTel + Grafana (ADR-0107) |
| API spec | TypeSpec → REST + tRPC |

---

## Dependency Graph

```
hr-service
  ──▶ party-service (ADR-0200) — person identity (read-only)
  ──▶ org-service (ADR-0200) — org units, reporting lines (read-only)
  ──▶ identity-service (ADR-0200) — user → employee linkage
  ──▶ document-core-service — performance review documents
  ──▶ calendar-core-service (ADR-0203) — leave calendar block (via event)
  ──▶ Temporal (ADR-0122) — leave-approval workflow
  ──▶ PostgreSQL 17, Valkey, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104

Consumed by:
  business-projects-service (TimeEntry.project_id linkage)
  business-esign-service (onboarding doc signed event consumer)
  business-donation-service (employee donor records — optional)
```

---

## Key Design Constraints

- **HR-specific attributes only.** Never replicate name, email, phone from party-service into hr-service PG. Read person data via party-service API (or via event-cached denormalized view for performance — cache in Valkey with `party.updated` invalidation).
- **No AGPL imports.** Frappe HR, OrangeHRM, Kimai are GPL/AGPL. Do not add them as dependencies under any circumstance.
- **Compensation field access gated by Cerbos ABAC.** `base_salary`, `allowances`, `equity_units`, `benefits_plan_id` are `confidential` fields. Cerbos resource policy: `hr-manager` role or own employee record only.
- **Leave balance integrity.** `balance_before` and `balance_after` written in same PG transaction as leave status change. Never update balance outside this transaction.
- **Temporal workflow client only.** `hr-service` uses `@curaos/workflow-client` to schedule workflows — it does not run a Temporal worker. Workers are managed by ADR-0122 Workflow Manager service.
- **Payroll export is read-only.** No payment processing, no tax calculation. Export only; integration to payroll system via Activepieces.

---

## Files Must Not Break

- `db/migrations/hr/` — additive changes only; `compensation` table changes require a new migration, not column alter.
- `hr.employee.created` Kafka topic — consumed by business-projects (time entry project linkage init).
- `hr.leave.approved` Kafka topic — consumed by calendar-core-service.
- Party-service read path — `GET /parties/:id` is a hot path; cache with Valkey key `party:{id}:summary` TTL 5m; invalidate on `party.updated` event.

---

## Modulith vs Microservice (ADR-0099 §5)

Runtime flag controls topology. In modulith: in-process. In microservice: independent container; business-projects reads TimeEntry via gRPC or Kafka query.

---

## Test Requirements

- Unit: leave balance state machine, compensation ABAC enforcement, payroll export format.
- Integration: leave-approval Temporal workflow end-to-end (test server mode). Calendar event emitted on approval.
- ABAC test: non-HR-manager JWT → `GET /employees/:id` returns employee record but omits compensation fields.
- Integration: `identity.user.created` event → employee shell auto-created.
- Audit: status change and compensation change produce hash-chain entries.
