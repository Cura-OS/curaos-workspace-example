# Grill — m9 #156 codegen audit-outbox enqueue race + pending() lease

- **Issue:** `your-org/curaos#156` — fix(codegen) audit-outbox template enqueue race-safety + `pending()` lease-claiming (stranded on directly-merged PR #155).
- **Harness:** Claude → Codex (`gpt-5.5`, reasoning effort high), read-only `--sandbox read-only`.
- **Date:** 2026-06-01.
- **Scope reviewed:** the planning approach for the trio template fix, BEFORE implementation. Read-only adversarial planning grill per `docs/agents/one-task-execution-prompt.md` §4.
- **Verdict:** **PASS with one critical plan correction** — no user-escalation candidates; all decision points carry recommended answers which the implementer auto-applies per `ai/rules/curaos_recommendation_auto_apply_rule.md` (logged in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md`).

## Critical correction caught by the grill

`UPDATE ... RETURNING` row order is **not guaranteed** in Postgres. The relay
(`audit-outbox-relay.ts.hbs`) groups `pending()` rows by `messageKey` and relies on
ascending-`seq` order within each partition key. A bare claim-`UPDATE ... RETURNING` would
silently break per-tenant ordering.

**Fix applied:** wrap the claim in CTEs and add an outer `ORDER BY seq ASC`:

```sql
WITH claim AS (
  SELECT id FROM <schema>.audit_outbox
  WHERE status = 'pending' AND scheduled_at <= :now
    AND (locked_until IS NULL OR locked_until <= :now)
  ORDER BY seq ASC
  LIMIT :n
  FOR UPDATE SKIP LOCKED
),
updated AS (
  UPDATE <schema>.audit_outbox o
  SET locked_until = :now + :leaseMs
  FROM claim WHERE o.id = claim.id
  RETURNING <SELECT_COLUMNS>
)
SELECT <SELECT_COLUMNS> FROM updated ORDER BY seq ASC
```

## Decision points (item 6) — all auto-applied, no escalation

1. **Ordering** — claim-CTE + updated-CTE + final `SELECT ... ORDER BY seq ASC`. Do not rely on UPDATE RETURNING order. *(applied)*
2. **`ON CONFLICT`** — `DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING ...`, NOT `DO NOTHING RETURNING` (which returns no row on the conflict path, breaking existing-row return). *(applied)*
3. **Nullable `idempotency_key`** — keep DB column nullable; runtime key is effectively non-null via `idempotencyKeyFor()` → `value.eventId`. No NOT NULL migration in this fix (that would be a separate forward-migration story). *(applied)*
4. **Lease duration** — env `CURAOS_AUDIT_OUTBOX_LEASE_MS`, default `30000`, validated non-negative finite integer; must exceed `pollIntervalMs` (default 1000ms) + batch publish time so a row is not re-claimed mid-publish. *(applied)*
5. **`pending()` mutability** — accept the contract change: `pending()` is now claim-and-lease. Keep the public method name `pending()` (rolling-update; no `-v2`). `markPublished`/`markFailed` already clear `locked_until`, so the terminal-release contract survives. *(applied)*
6. **In-memory parity** — `InMemoryAuditOutboxStore.pending()` must also set `lockedUntil` on returned rows so the relay's in-memory tests still observe lease semantics. *(applied)*
7. **Tests** — add behavioral tests (fake executor capturing the emitted SQL; in-memory claim/re-claim/expiry), not only substring snapshot assertions. *(applied — new `audit-outbox-race-lease.test.ts`)*

## Glossary / docs notes (item 2/3)

- The store + relay doc-comments describe `pending()` as a read-only surface — updated in the templates to "claim-and-lease".
- `idempotency_key` comments say "= payload.eventId, UNIQUE" while the column is nullable; reconciled in code comment (runtime key always non-null via `value.eventId` fallback). No schema change.

## Hidden deps (item 4) — service-level regen left to orchestrator

- The in-memory `pending()` becoming mutating affects **identity-service** relay tests that call `service.pending()` as inspection (a submodule; another worker owns identity-service#68 + healthstack#12). Per the task brief, the SERVICE-level regen/patch is **noted for the orchestrator** in the PR body — this PR's deliverable is the **template fix + codegen behavioral/snapshot tests**, trio-symmetric.

## Escalation candidates (item 7)

**None.** No irreversible/destructive/T3 decision. A NOT NULL migration on `idempotency_key` would be escalation-worthy but is explicitly NOT proposed here.

## Raw grill output

Captured at `/tmp/curaos-opposite-grill-156.md` during the session (transient). The 7 numbered
sections above reproduce its load-bearing content verbatim in intent.
