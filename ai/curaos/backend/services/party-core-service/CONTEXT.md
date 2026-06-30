# CONTEXT.md — party-core-service

## Purpose

Neutral primitives for the `parties` table in the **Diamond model** ([ADR-0210](../../../docs/adr/0210-m9-diamond-model-party-org-identity.md)). One of four peer tables (`actors`, `parties`, `orgs`, `identities`) joined inward to a shared `actors` root via UNIQUE 1:1 FK. The `parties` row carries vertical-agnostic identity-side metadata: `kind ∈ {person, organization, service-account}`, `display_name`, `tenant_id`, soft-delete via `deleted_at`.

PHI demographics (DOB, SSN, names, addresses) live in HealthStack overlay tables keyed on `parties.id` — never on this row.

## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per [[curaos-foundation-runtime-directives]])
- ORM: Drizzle 0.45 (primary) per [[curaos-orm-rule]]
- Validation: Zod 4 (`.strict()` + PHI-rejection refinement) per [[curaos-validation-rule]]
- Storage: PostgreSQL (CNPG) — schema `party_core` per [[curaos-postgres-rule]]
- Auth: JWT verification via `jose` (ES256 prod / HS256 dev) — bearer is the ONLY identity source

## Integration Points

### Produces (Redpanda / Kafka)

- `curaos.core.party.registered.v1` — created
- `curaos.core.party.updated.v1` — display_name or kind changed
- `curaos.core.party.deleted.v1` — soft-deleted (deleted_at set)
- `curaos.core.audit.event.v1` — shared neutral audit topic per M7 D5; per-mutation hash-chained envelope

Partition key: `sha256(tenant_id || ":" || party_id)` so per-party ordering survives re-issued events.

### Consumes

In modulith mode (M9 baseline): cross-module call from `IdentityModule.createHuman()` inside the same DB transaction. In standalone mode (post-extraction): `curaos.core.actor.registered.v1` events from identity-service feed `parties` row creation via outbox consumer (deferred; covered by M9-S5.1 #124 reconciliation pattern).

### REST API

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET    | `/parties/health` | any auth | liveness; anonymous → 401 |
| GET    | `/parties` | user / clinician / tenant-admin | paginated list (limit/offset) |
| GET    | `/parties/:id` | user / clinician / tenant-admin | 403 on cross-tenant, 404 on absent |
| POST   | `/parties` | clinician / tenant-admin | supports `Idempotency-Key` header; `actor_id` derived from JWT, NEVER body |
| PATCH  | `/parties/:id` | clinician / tenant-admin | updates `displayName`, `kind` |
| DELETE | `/parties/:id` | tenant-admin | soft-delete (sets `deleted_at`) |

## Boundary rules (binding)

- `actor_id` for CREATE is ALWAYS `request.principal.actorId` (JWT-verified). The strict Zod DTO rejects body-supplied `actorId|actor_id|clinicianActorId`. Forging the actor via body would let any caller with `clinician` role attribute the write to a different clinician — privilege escalation + audit-trail forgery.
- `tenant_id` from body must equal `principal.tenantId` (403 on mismatch). Cross-tenant access at any verb surfaces as 403 (NOT 404, since revealing existence leaks).
- `parties.actor_id` UNIQUE ⇒ exactly one party per actor. Second create for same `(actorId)` → 409 unless `Idempotency-Key` is supplied (in which case the existing row is returned verbatim).
- `parties` table carries NO PHI columns. PHI lives in HealthStack overlay tables; the DTO PHI-rejection list catches accidental smuggling.

## Generator-evolution markers

Every file emitted by `@curaos/codegen` carries `// codegen-source: tools/codegen/templates/...` in its header. Files customised by M9-S3 also carry `// codegen-customised: M9-S3`. Any edge cases discovered during integration MUST fold back into the codegen templates (per [[curaos-generator-evolution-rule]]) — local-only hot-fixes are forbidden.

Known generator follow-up items (in scope for the M9-S11 codegen-evolution Story):

- Pluralisation: codegen emits `partys` (`{{kebabCase name}} + 's'`) instead of canonical English `parties`. M9-S3 patched in place; generator needs an irregular-plural map.
- `roles.decorator.ts` template missing `AllowAnyRole` decorator (present in hand-rolled patient-core). Codegen baseline is permissive (no fail-closed); patient-core upgraded to fail-closed in M7-S6 cycle-2 grill — same upgrade still pending in template.
- `audit-publisher.service.ts` template does NOT wrap audit publish in outbox transaction (cycle-2 P0-B fix in patient-core). M9-S3 carries the codegen baseline; the outbox-tx upgrade is a generator follow-up.
- `audit-chain-head.store.ts` template emits `{ ...(parsed.heads ?? {}) }` which trips oxlint `unicorn/no-useless-fallback-in-spread`. M9-S3 patched locally with `FOLDBACK-TODO codegen` comment.

## Open Questions

None blocking. Schema deviation from issue body (`actor_party_links` join table) resolved in favour of ADR-0210 1:1 inward FK — the N:M join lives in `actor_memberships` (org-core-service, M9-S4).

## References

- [ADR-0210 Diamond model](../../../docs/adr/0210-m9-diamond-model-party-org-identity.md) — schema binding
- [Requirements.md](Requirements.md) — full spec
- [AGENTS.md](AGENTS.md) — agent contract
- [[curaos-generator-evolution-rule]] — folds back the M9-S3 patches into codegen
- [[curaos-postgres-rule]] — Citus distribution key + DB-per-tenant
- [[curaos-validation-rule]] — Zod 4 strict + PHI rejection
- patient-core-service — closest reference implementation (M7-S6 / M7-S7)
