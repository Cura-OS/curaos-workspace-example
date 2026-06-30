# Agent Context — healthstack-consent-service

**ADR refs:** ADR-0208 §3.10 · ADR-0115 · ADR-0157 · ADR-0161 · ADR-0162 · ADR-0120

---

## Role

Consent authority source for all HealthStack services. Every clinical service calls `consent.decision()` before returning PHI. Break-glass emergency access gateway. HIPAA BPPC profile enforcement.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| ORM | MikroORM (@mikro-orm/nestjs, clinical aggregate per [[curaos-orm-rule]]) + Atlas |
| DB | PostgreSQL 17, schema-per-tenant |
| Cache | Valkey (consent decisions, TTL 15min) |
| Workflow | healthstack-workflow-service → Temporal (break-glass) |
| Events | Kafka 4 (outbox) |
| API | TypeSpec REST + tRPC (internal decision API) |
| Auth | Better Auth + SMART-on-FHIR + Cerbos ABAC |

---

## Critical Patterns

### Deny-by-Default
```typescript
// consent.decision() must return deny if:
// 1. No Consent resource found for patient + purpose
// 2. Consent found but period.end is past
// 3. Consent.status !== 'active'
// 4. Valkey unreachable AND hapi fallback fails → throw 503 (never permit on uncertainty)
```

### Break-Glass Flow
```
POST /consent/break-glass
  → validate requestor Cerbos role has emergency-access permission
  → start Temporal workflow break-glass-approval (timeout 15min)
  → on approval: grant Cerbos break-glass role (4h TTL)
  → create audit record (PHI_EMERGENCY_ACCESS) BEFORE granting
  → emit healthstack.consent.break-glass-activated
  → notify-service → privacy officer
  → Temporal timer at 4h → emit break-glass-expired → revoke Cerbos grant
```

### Consent Cache Invalidation
```
healthstack.consent.updated (Kafka)
  → consumed by healthstack-patient-service
  → patient-service invalidates Valkey key: consent:{tenantId}:{patientId}
  → next consent.decision() call re-warms from HAPI
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on ALL controller methods — even consent decision calls.
- Per-tenant `phi_audit_mode`: `single-source | dual-reconciled | hapi-primary`.
- Break-glass records: category `PHI_EMERGENCY_ACCESS`; 10-year retention.
- Decision records (permit/deny): standard category; 6-year retention.

---

## Key Files (once scaffolded)

```
src/
  consent/
    consent.controller.ts         # FHIR Consent CRUD + revoke; @HealthstackAudit() on all
    consent.service.ts            # HAPI REST calls, expiry enforcement
    consent-decision.service.ts   # decision() tRPC — Valkey → HAPI fallback → deny-by-default
    consent-breakglass.service.ts # break-glass request + Cerbos grant
  events/
    consent.events.ts             # outbox producers
    consent-expiry.listener.ts    # pre-expiry outreach trigger
```

---

## Testing

- Unit: deny-by-default, expiry enforcement, BPPC profile mapping.
- Integration: recorded HAPI payloads for Consent CRUD.
- Break-glass: Temporal workflow mock + dual sign-off simulation.
- Valkey invalidation: end-to-end Kafka → patient-service cache miss.
- Break-glass expiry CI test: token auto-expires ≤ 4h.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Deny-by-default test passes
- [ ] Break-glass auto-expiry ≤ 4h test green
- [ ] SMART scopes in TypeSpec for all FHIR endpoints
- [ ] AsyncAPI 3 schemas in Apicurio
