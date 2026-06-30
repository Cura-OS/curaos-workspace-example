# CONTEXT.md — encounter-service

## Purpose

Neutral primitives for encounter (FHIR R4 Encounter lifecycle (admit→discharge) + EpisodeOfCare, Flowable-gated transitions, outbox events). Domain overlay: `healthstack`.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`
- PHI boundary: never persist PHI outside this service's overlay schema (HIPAA).




## Money / minor-units (#369, DECISION 369-1)

Any money amount is integer **minor units** (cents). Two helpers ship in the
write-surface DTO (`src/.../encounter.dto.ts`) — use them, never hand-roll
`z.number().int()`:

- `SafeMinor` / `SafeMinorNonNeg` — **IMMEDIATE backstop** (active now). Reject a
  JSON-number amount `> Number.MAX_SAFE_INTEGER` (2^53-1) fail-CLOSED, so a value
  that lost precision crossing 2^53 in `JSON.parse` can never post a corrupted
  ledger entry. Mirrors `accounting-core-service` `SafeMinor`.
- `MoneyMinorString` — **CANONICAL TARGET** (forward migration, documented; not
  yet active on legacy producers). Money is `bigint` internally and a decimal
  **string on the wire** at every API/DTO/event boundary, so no boundary ever
  round-trips an amount through a JS double. When a producer/consumer pair
  migrates to the string contract (dual-emit → drop, rolling-update, no `-v2`
  per `ai/rules/curaos_rolling_update_rule.md`), swap `SafeMinor` →
  `MoneyMinorString` on that field and `BigInt()` it for the engine.

### Money on the wire — `domain-event-catalog` (#371)

The `src/events/domain-event-catalog.ts` seam ships the PRODUCER-side wire
serializer + the dual-emit flag (DECISION 369-1):

- `moneyMinorStr(value: number | bigint)` — serialize a minor-units amount to the
  CANONICAL lossless decimal-string wire form. A `bigint` is lossless for any
  magnitude; a JS `number` is accepted only when `Number.isSafeInteger` (else it
  THROWS fail-CLOSED, so a corrupt double never becomes a "lossless-looking"
  string).
- `isMoneyWireDualEmit()` — reads `CURAOS_MONEY_WIRE_DUAL_EMIT` (default **ON**).
- **Dual-emit-then-drop:** for every money field emit BOTH `<field>` (legacy
  number, DEPRECATED) AND `<field>_str` (the `moneyMinorStr()` string), gated by
  the flag. Consumers prefer the `_str` sibling. The legacy number is dropped only
  LATER, telemetry-gated — NEVER alongside this fold. Set
  `CURAOS_MONEY_WIRE_DUAL_EMIT=off` to roll back to pure-legacy wire.

See `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` (369-1).

## Integration Points

- Events: TODO — list produced/consumed event names once contracts are designed
- APIs: REST `/api/v1/encounter` (TBD path conventions)
## Open Questions

- TODO: confirm canonical event names with domain owners
- TODO: confirm storage partition strategy (DB-per-tenant vs schema-per-tenant)
- TODO: confirm PHI minimum-necessary boundary with HIPAA reviewer

## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/encounter-service/Requirements.md` — full spec
