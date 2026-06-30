# personal-esign-service - Agent Context

**ADR-0205 §3.5** | Personal overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | Kafka/NATS (ADR-0102) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT Layer 1 (ADR-0156) | OTel (ADR-0107)

---

## Dependency Graph

```
personal-esign-service
  ──▶ esign-core-service (signature primitives)
  ──▶ document-core-service (document reference)
  ──▶ notify-service (countersignature request notification)
  ──▶ PostgreSQL 17, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0156

Consumes events from:
  business-esign-service (envelope.sent → personal signing queue)
```

---

## Key Design Constraints

- **No Temporal dependency.** Personal signing is simple two-party at most; no workflow engine needed.
- **Document-byte ownership.** personal-esign-service owns owner-scoped document-core access and personal byte-embedding flows for wet/PAdES/XAdES artifacts. It sends esign-core only document references, live hashes, detached signature requests, and verification material.
- **Crypto boundary.** esign-core owns signing keys, detached signature construction, certificate-chain validation, timestamp-token validation, revocation checks, and verification verdicts. personal-esign-service may use byte-embedding libraries only to apply core outputs to documents it owns; no key handling or verification-chain logic here.
- **Owner-scoped.** Every query is scoped to `owner_party_id = current_user.party_id` - no cross-user data access.

---

## Files Must Not Break

- `personal.esign.signature.completed` Kafka topic - may be consumed by personal analytics.
- `personal.esign.request.sent` Kafka topic - emitted when user sends a countersignature request.
- esign-core `POST /signatures` API contract.

---

## Test Requirements

- Unit: pending queue filtering, request status tracking.
- Integration: `business.esign.envelope.sent` event → appears in personal queue.
- E2E: user signs via personal queue → `personal.esign.signature.completed` emitted.
