# Codex grill — M10 notify-service scaffold (#271) PR notify-service#1

## Verdict: PASS (orchestrator-verified — Codex stalled, see note)

## Codex grill status: STALLED → orchestrator-verified fallback

The cross-harness Codex grill (`codex exec -m gpt-5-codex -c model_reasoning_effort=high
--sandbox read-only`) was dispatched against the notify domain working tree but
**hung for 22+ minutes with zero output** (no `--output-last-message` file written;
process terminated, exit 144). Per `ai/curaos/docs/grills/README.md` + the one-task
prompt §4 ("If Codex stalls, default model effort high; if still hangs verify directly +
record orchestrator-verified note"), this report records the **orchestrator's own
adversarial verification** in lieu of the Codex verdict. A re-grill can append a
`## Re-grill verification` section here once the harness is responsive.

## Verification performed (orchestrator, direct)

| Lane | Result |
|---|---|
| `bun run ci` (lint+typecheck+test+build) | exit 0 — 42 tests pass / 0 fail / 93 expect() |
| Integration (auth-matrix + audit-chain-e2e, real HTTP via `app.listen(0)`) | pass — full auth matrix, tenant cross-leak 403, forged-header strip, JWT gates, PHI-scrub |
| `tsc --noEmit` (`exactOptionalPropertyTypes: true`) | clean |
| oxlint | warnings only (no errors; most in mold-emitted audit-outbox) |
| `check-migrations.ts` (forward-only) | PASS, 0 violations |
| semgrep `--config auto` on `src/notify/` | 0 findings |
| gitleaks | no leaks |
| CodeRabbit `review --plain --base main` | 6 findings — 4 addressed in-code, 2 mold-class documented |

## Adversarial review checklist (orchestrator)

1. **Body-trusted identity** — every write derives `tenantId`/`actorId` from
   `ensurePrincipal(request)` (JWT principal); `.strict()` Zod schemas reject extra
   keys. CONFIRMED no body-supplied identity path.
2. **Deferred-channel leak** — `NOTIFY_CHANNELS = ['email','in_app','webhook']`; Zod
   `z.enum` + DB `CHECK (channel IN (...))` both reject `sms`/`push`. CONFIRMED.
3. **Route-ordering hazard** — Express `:id` vs literals. `health`/`protected`/`stream`
   are declared BEFORE `notifications/:id`; verified the auth-matrix integration test
   hits all of `/notifications/health|protected|:id` and passes (literal routes win).
   CONFIRMED no `:id` shadowing of `/stream`.
4. **SSE cross-user subscription** — `streamInApp` keys the subscription on the JWT
   `principal.tenantId` + `principal.actorId`; a caller can only ever stream their own
   events (no path/query param feeds the key). CONFIRMED.
5. **Webhook secret / https** — `WebhookSubscriptionSchema` forces `https://` + ≥16-char
   secret; secret persisted as a ref (HMAC-SHA256 signing, composition root). CONFIRMED.
6. **PHI boundary** — neutral `notify_core` schema; recipient/payload columns documented
   reference-only; no clinical name columns. CONFIRMED.
7. **Idempotency** — `(tenant_id, idempotency_key)` UNIQUE + in-memory dedup mirror; the
   Postgres store inherits the audit-outbox `INSERT ... ON CONFLICT` race-safety pattern.
   CONFIRMED.
8. **Event envelope** — snake_case wire payload + correlation headers + sha256 partition
   key; matches the shared-contract convention the codegen producer uses. CONFIRMED.

## What the implementation got right (counter-balance)

1. Reused the mold's audit-outbox + auth/JWT trust template unchanged; only filled the
   domain — no parallel auth path (rolling-update-rule respected).
2. Provider abstraction is interface-first (`EmailProvider` + DI token + selector) with
   NO conditional branching in business logic (ADR-0201 §2.6).
3. Closed two real mold gaps in the domain migration (`audit_chain_heads` +
   `idempotency_keys` were declared-but-unmigrated by the 0000 baseline).

## P0/P1/P2 findings (from CodeRabbit, since Codex produced none)

- **P0 (fixed):** `main.ts` `void bootstrap()` swallowed startup errors → `.catch()` + exit 1.
- **P1 (fixed):** `enqueue`/`deliver` docstrings overclaimed opt-out short-circuit → corrected.
- **P1 (fixed):** audit-chain-e2e SSN-scrub assertion was vacuously true → added SSN-shaped header.
- **P2 (mold, documented):** `Dockerfile.migrator` placeholder digest (shared across all
  services; blocked on base-image publish) + `0000_snapshot.json` check-constraint drift
  (mold pattern — SQL-only checks). Both flagged for generator-evolution.
