# CONTEXT.md - personal-crm-service

## Purpose

Individual-context crm overlay (individual contact/relationship graph (personal address book, network) extending crm-core-service). Extends `@curaos/crm-core-service` with single-user / single-household workflows. Domain overlay: `neutral`.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14
- Extends: `@curaos/crm-core-service`
- Context isolation: `src/personal-context.ts`
- ORM: Drizzle (primary)
- Validation: Zod 4



- Neutral capability: NO PHI/PII/financial rows persisted here - overlays own protected schemas.

## Money / minor-units (#369, DECISION 369-1)

Any money amount is integer **minor units** (cents). Two helpers ship in the
write-surface DTO (`src/.../personal-crm.dto.ts`) - use them, never
hand-roll `z.number().int()`:

- `SafeMinor` / `SafeMinorNonNeg` - **IMMEDIATE backstop** (active now). Reject a
  JSON-number amount `> Number.MAX_SAFE_INTEGER` (2^53-1) fail-CLOSED, so a value
  that lost precision crossing 2^53 in `JSON.parse` can never post a corrupted
  ledger entry. Mirrors `accounting-core-service` `SafeMinor`.
- `MoneyMinorString` - **CANONICAL TARGET** (forward migration, documented; not
  yet active on legacy producers). Money is `bigint` internally and a decimal
  **string on the wire** at every API/DTO/event boundary, so no boundary ever
  round-trips an amount through a JS double. When a producer/consumer pair
  migrates to the string contract (dual-emit → drop, rolling-update, no `-v2`
  per `ai/rules/curaos_rolling_update_rule.md`), swap `SafeMinor` →
  `MoneyMinorString` on that field and `BigInt()` it for the engine.

### Money on the wire - `domain-event-catalog` (#371)

The `src/events/domain-event-catalog.ts` seam ships the PRODUCER-side wire
serializer + the dual-emit flag (DECISION 369-1):

- `moneyMinorStr(value: number | bigint)` - serialize a minor-units amount to the
  CANONICAL lossless decimal-string wire form. A `bigint` is lossless for any
  magnitude; a JS `number` is accepted only when `Number.isSafeInteger` (else it
  THROWS fail-CLOSED, so a corrupt double never becomes a "lossless-looking"
  string).
- `isMoneyWireDualEmit()` - reads `CURAOS_MONEY_WIRE_DUAL_EMIT` (default **ON**).
- **Dual-emit-then-drop:** for every money field emit BOTH `<field>` (legacy
  number, DEPRECATED) AND `<field>_str` (the `moneyMinorStr()` string), gated by
  the flag. Consumers prefer the `_str` sibling. The legacy number is dropped only
  LATER, telemetry-gated - NEVER alongside this fold. Set
  `CURAOS_MONEY_WIRE_DUAL_EMIT=off` to roll back to pure-legacy wire.

See `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` (369-1).

## Integration Points

- Depends on `crm-core-service` (the `@curaos/crm-core-service` barrel ONLY: `CrmsService` composed by `party_id` reference; never reaches into core `src/`). Dependency direction stays vertical to neutral (depcruise-guarded).
- Surfaces personal-scope endpoints on REST `/api/v1/personal/crm` (controller base `personal/crm`; gateway adds the `/api/v1` prefix per `specs/crm.tsp` `@server`). The mold-locked scaffold probes stay on `/personal-crms/health,protected,whoami`.
- REST surface (#3): `personal_contact` CRUD, `personal_relationship` create/list, `personal_contact_group` CRUD, `personal_contact_method` add/remove (PII), `personal_contact_consent` set/read, plus an overlay `health` route (`layer`/`scope`/`coreAvailable`). Owner is ALWAYS `principal.actorId` (JWT-derived via `PersonalContext.bind`); cross-user read/mutate reads as 404. `Idempotency-Key` replays POST mutations.
- Events produced (REFERENCE-ONLY, ids never PII; `src/crms/personal-crm-event-producer.ts`, `specs/crm.asyncapi.yaml`):
  - `curaos.personal.crm.contact.{created,updated,deleted}.v1`
  - `curaos.personal.crm.relationship.created.v1`
  - `curaos.personal.crm.group.{created,updated,deleted}.v1`
  - `curaos.personal.crm.method.{added,removed}.v1`
  - `curaos.personal.crm.consent.set.v1`
  - Every mutation also emits a names-only audit envelope on `curaos.core.audit.event.v1` (`changedFields` = snake_case column NAMES, never a value) inside the SAME domain-outbox transaction (`auditOutbox.bindTo(tx.db)`), durable-iff-write.
- Events consumed:
  - None yet. The overlay is a producer + REST surface; downstream consumers (HealthStack patient-relationship, Donation, Event) read the reference ids and resolve PII back through this service under the `personal_contact_consent` gate.

## Open Questions

- RESOLVED (#3): personal-context propagation is JWT-claim derived. `PersonalContext.bind(principal)` returns an `OwnerScope { tenantId, userId = principal.actorId }`; the owner is the authenticated caller, never a body/path/header value. The store scopes every read/mutate by `(tenantId, userId)`, complementing the DB composite cross-user FK (#2).
- TODO: confirm offline/sync requirements


## References

- `ai/rules/curaos_agents_md_schema_rule.md` - AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` - 1:1 mirror
- `ai/curaos/backend/services/crm-core-service/CONTEXT.md` - core layer
- `ai/curaos/backend/services/personal-crm-service/Requirements.md` - full spec
