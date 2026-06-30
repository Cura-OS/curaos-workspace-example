# CONTEXT.md — personal-hr-service

## Purpose

Individual-context hr overlay (individual worker/clinician credential ownership (licensure, DEA/NPI, PSV) extending hr-core-service). Extends `@curaos/hr-core-service` with single-user / single-household workflows. Domain overlay: `neutral`.
## Stack

- Runtime: NestJS 11 on Bun 1.3.14
- Extends: `@curaos/hr-core-service`
- Context isolation: `src/personal-context.ts`
- ORM: Drizzle (primary)
- Validation: Zod 4



- Neutral capability: NO PHI/PII/financial rows persisted here — overlays own protected schemas.

## Money / minor-units (#369, DECISION 369-1)

Any money amount is integer **minor units** (cents). Two helpers ship in the
write-surface DTO (`src/.../personal-hr.dto.ts`) — use them, never
hand-roll `z.number().int()`:

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

- Depends on `hr-core-service` (events + DTOs + primitives)
- Surfaces personal-scope endpoints on REST `/api/v1/personal/hr`
- Events produced:
  - TODO(track): no generated domain-event catalog yet; add concrete produced-topic contracts when the service event model is finalized.
- Events consumed:
  - TODO(track): no generated consumer topic map yet; document concrete upstream contracts when the service starts consuming events.

## Open Questions

- TODO: confirm personal-context propagation pattern (request-scoped vs JWT-claim)
- TODO: confirm offline/sync requirements


## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/backend/services/hr-core-service/CONTEXT.md` — core layer
- `ai/curaos/backend/services/personal-hr-service/Requirements.md` — full spec
