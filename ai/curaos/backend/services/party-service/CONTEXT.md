# party-service — Agent Context

**Service:** party-service
**Cluster:** ADR-0200 (Identity · Party · Org · Audit)
**Runtime:** NestJS + TypeScript 5.x (ADR-0100)
**Last updated:** 2026-05-24

---

## 1. Current State

**Status: Clean slate (NestJS scaffold not yet generated)**

- Prior Kotlin/Spring Boot stubs replaced. Generate via `backend.nestjs-service` codegen recipe.
- Core gRPC contracts (`CreatePerson`, `AnonymizePerson`, `ResolveSmartUser`) must be defined before identity-service onboarding saga can be implemented.
- No production traffic; pre-v1 GA.

---

## 2. Active ADR References

| ADR | Relevance |
|-----|-----------|
| [ADR-0099](../../../docs/adr/0099-charter-priorities-vision.md) | Generic-before-vertical; party = neutral registry |
| [ADR-0100](../../../docs/adr/0100-foundation-platform-runtime.md) | NestJS TypeScript 5.x |
| [ADR-0150](../../../docs/adr/0150-baseline-alignment-rules.md) | Local + 3rd-party rule; AddressValidation provider options |
| [ADR-0154](../../../docs/adr/0154-provider-abstraction-convention.md) | AddressValidationProvider, PhoneValidationProvider convention |
| [ADR-0155](../../../docs/adr/0155-tenant-routing-curaos-tenancy.md) | TenantModule mandatory; schema-per-tenant; ESLint rules |
| [ADR-0157](../../../docs/adr/0157-hapi-fhir-phi-audit-reconciliation.md) | ResolveSmartUser feeds fhir_user JWT claim; SMART scope audit |
| [ADR-0162](../../../docs/adr/0162-hipaa-2026-compliance-roadmap.md) | PII encryption; GDPR erasure saga role; 30-day erasure window |
| [ADR-0200](../../../docs/adr/0200-cluster-identity-party-org-audit.md) | Cluster ADR; gRPC contracts with identity + org; event topics |

---

## 3. Integration Map

```
identity-service
  ──gRPC──▶ party-service.CreatePerson       (onboarding saga)
  ──gRPC──▶ party-service.AnonymizePerson    (GDPR erasure saga)
  ──gRPC──▶ party-service.ResolveSmartUser   (SMART token issuance)

party-service
  ──Kafka──▶ curaos.party.person.created     (consumed by healthstack-fhir-service to create FHIR Patient/Practitioner)
  ──Kafka──▶ curaos.party.person.erased      (consumed by identity-service GDPR saga as signal)
  ──Kafka──▶ curaos.audit.events             (AuditInterceptor; all mutations)
  ◀──Kafka── curaos.identity.user.registered (trigger: create linked person party if not exists)

party-service
  ──gRPC──▶ Temporal (party merge saga)
  ──Valkey── ResolveSmartUser cache (t:{tenantId}:smart_user:{user_id})
  ──OpenBao── PII encryption keys (per-tenant, per-field)
```

---

## 4. Key Decisions and Rationale

### D-001: party-service is neutral — no HealthStack imports
- No `@healthstack/*` package dependencies in party-service.
- `fhir_id` stored as opaque string in `party_external_refs` under system `fhir_id` — party-service doesn't interpret it.
- FHIR resource creation triggered by `curaos.party.person.created` Kafka event → healthstack-fhir-service. party-service does not call HAPI FHIR directly.

### D-002: PII encryption at field level (not column encryption)
- `date_of_birth`, `given_name`, `family_name`, all contact values: encrypted via OpenBao transit engine (unconditionally — per AGENTS.md §1 PII encryption rule).
- Per-tenant encryption key: `party-pii-{tenant_id}` in OpenBao.
- Persistence middleware intercepts writes to encrypt before storage and decrypts on reads before returning domain objects.
- Field-level encryption chosen over PG TDE alone because PG TDE protects disk only; field encryption protects against accidental query exposure (e.g., raw SQL in logs).

### D-003: gRPC for identity-service calls (not REST)
- `ResolveSmartUser` is on the hot path (called at every SMART token issuance). gRPC has lower latency than REST + JSON parsing.
- `CreatePerson` and `AnonymizePerson` are saga activities — gRPC provides typed contracts that the Temporal activity framework can validate.
- gRPC proto definitions in `@curaos/party-contracts` shared package; consumed by both party-service and identity-service.

### D-004: Valkey cache for ResolveSmartUser
- `fhir_id` for a user_id is stable (doesn't change after FHIR resource creation). Cacheable with TTL 24h.
- Cache key: `t:{tenantId}:smart_user:{userId}` → `{ fhir_resource_type, fhir_id, fhir_ref }` JSON.
- Cache invalidated on `AnonymizePerson` (GDPR: erased user has no FHIR user anymore).
- Cache miss: DB lookup; populate cache; return.

### D-005: Party relationship graph is shallow
- party-service models direct person-to-person and person-to-org relationships (≤2 hops useful).
- Full org hierarchy (department → division → hospital system) lives in org-service using PG ltree.
- Party relationships are for cross-domain associations: guardian, emergency contact, practitioner at location — concepts that span HealthStack, HR, and other overlays.

---

## 5. Implementation Notes for Agents

### Scaffolding order
1. `backend.nestjs-service` — NestJS scaffold.
2. `interceptor.nestjs-tenant-router` — TenantInterceptor.
3. `interceptor.nestjs-audit` — AuditInterceptor.
4. Hand-write: gRPC proto definitions in `proto/party.proto`; generate NestJS gRPC controllers.
5. Hand-write: PII encryption persistence middleware (`src/persistence/pii-encryption.middleware.ts`).
6. Hand-write: `ResolveSmartUser` with Valkey cache layer.
7. Hand-write: Temporal party merge saga (`src/workflows/`).
8. Hand-write: `AddressValidationProvider` and `PhoneValidationProvider` implementations.

### gRPC proto contract (critical — shared with identity-service)
```protobuf
// proto/party.proto
service PartyService {
  rpc CreatePerson (CreatePersonRequest) returns (CreatePersonResponse);
  rpc AnonymizePerson (AnonymizePersonRequest) returns (AnonymizePersonResponse);
  rpc ResolveSmartUser (ResolveSmartUserRequest) returns (ResolveSmartUserResponse);
}

message ResolveSmartUserResponse {
  string fhir_resource_type = 1; // "Patient" | "Practitioner" | ""
  string fhir_id = 2;
  string fhir_ref = 3; // e.g. "Patient/abc-123"
}
```
Proto changes require coordination with identity-service team (shared `@curaos/party-contracts` package bump).

### PII encryption gotchas
- Encryption happens in persistence middleware, NOT in controller or service layer.
- If you add a new PII field to `persons` table, you MUST add it to the middleware encryption list.
- Do NOT log raw field values from persons table; middleware decrypts for application use only.
- Encrypted values are base64url strings in DB; do NOT filter/sort on encrypted columns (use `party_id` or non-encrypted fields for filtering).

### AnonymizePerson implementation
```typescript
// Must null ALL PII fields; set display_name = "[Removed]"; set status = "erased"
// Must NOT delete the party row (tombstone required for GDPR proof)
// Must invalidate ResolveSmartUser cache
// Must emit curaos.party.person.erased AFTER successful DB update
// Emit BEFORE returning response to saga (saga waits for Kafka signal)
```

### Testing approach
- **Unit (Vitest):** mock Drizzle (with PII middleware), mock Valkey, mock gRPC server.
- **Integration (Testcontainers):** real PG (schema-per-test-tenant), real Valkey, real Kafka.
- **ResolveSmartUser test:** create person with fhir_id external ref; call gRPC; assert response; assert Valkey cache set; call again; assert cache hit (assert Drizzle repo not called second time).
- **AnonymizePerson test:** create person with full PII; call gRPC; assert all PII nulled; assert tombstone fields present; assert Kafka `curaos.party.person.erased` emitted; assert Valkey cache invalidated.
- **Audit emission test:** all mutations produce `curaos.audit.events` within 5s.

---

## 6. Build Milestones

| Milestone | Deliverable |
|-----------|-------------|
| M1 | Scaffold + TenantModule + AuditInterceptor + health |
| M2 | Person CRUD + PII encryption middleware |
| M3 | gRPC server: CreatePerson, AnonymizePerson, ResolveSmartUser |
| M4 | ResolveSmartUser Valkey cache |
| M5 | Organization CRUD + party contacts + external refs |
| M6 | Party relationships |
| M7 | Kafka consumer: identity.user.registered → auto-create person |
| M8 | Party merge Temporal saga |
| M9 | GDPR erasure full path verified (coordinated with identity-service) |
| M10 | AddressValidation + PhoneValidation providers |
