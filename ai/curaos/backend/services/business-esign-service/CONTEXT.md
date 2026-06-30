# business-esign-service - Agent Context

**ADR-0205 §3.4** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS + Fastify (TypeScript) |
| Primary DB | PostgreSQL 17 (schema-per-tenant, ADR-0101) |
| Messaging | Kafka/NATS + outbox (ADR-0102) |
| Workflow | Temporal TS SDK via `@curaos/workflow-client` (ADR-0122) - runs workflows, not workers |
| Auth | Better Auth + Cerbos ABAC (ADR-0120) |
| Tenancy | `@curaos/tenancy` TenantModule (ADR-0155) - mandatory |
| Token flow | JWT Layer 1 (user) + OTP magic-link (external signers) + mTLS Layer 3 per ADR-0156 |
| Audit | Hash-chain PG per ADR-0104 |
| Observability | OTel + Grafana (ADR-0107) |
| API spec | TypeSpec → REST |

---

## Dependency Graph

```
business-esign-service
  ──▶ esign-core-service (signature primitives)
  ──▶ document-core-service (document bytes + retention policy)
  ──▶ crm-service (counterparty BAA lookup)
  ──▶ hr-service (onboarding doc trigger)
  ──▶ notify-service (signer notifications)
  ──▶ Temporal (ADR-0122) - multi-signer workflows
  ──▶ PostgreSQL 17, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104

Consumed by:
  business-docs-service (envelope trigger after document approval)
  crm-service (signed contract linkage)
```

---

## Key Design Constraints

- **Temporal workflow client only.** business-esign-service schedules workflows via `@curaos/workflow-client`; workers run in ADR-0122 Workflow Manager.
- **Document-byte ownership.** business-esign-service owns envelope document-core access, retention coordination, and business byte-embedding flows for wet/PAdES/XAdES artifacts. It sends esign-core only document references, live hashes, detached signature requests, and verification material.
- **Crypto boundary.** esign-core owns signing keys, detached signature construction, certificate-chain validation, timestamp-token validation, revocation checks, and verification verdicts. business-esign-service orchestrates the ceremony and applies core outputs to business documents; no key handling or verification-chain logic here.
- **HIPAA BAA check is blocking.** `hipaa_baa_required = true` must block the entire envelope send until a valid BAA is confirmed. Never proceed optimistically.
- **External signer OTP TTL: 72 hours** (configurable; max 7 days for regulated markets). Token issued by this service; validated by esign-core.
- **Envelope void is final.** Once voided, status cannot transition. Temporal compensation workflow notifies all parties.

---

## Files Must Not Break

- `business.esign.envelope.completed` Kafka topic - consumed by business-docs-service, crm-service, hr-service.
- `esign-core` API contract - `POST /signatures` and `POST /signatures/:id/complete` shapes.

---

## Test Requirements

- Integration: sequential multi-signer workflow (Temporal test server).
- Decline compensation: signer 2 declines → envelope voided → all parties notified.
- HIPAA: BAA check blocks envelope send (mock crm-service response).
- External signer: magic link flow end-to-end.
- Retention: completed envelope sets 6-year retention on document-core (mock).
