# Cross-harness grill — curaos-ai-workspace#293 (audit-publisher CAS/tx-boundary mold fix)

- **Reviewer harness:** Codex (`codex exec`, `model_reasoning_effort=high`, `--sandbox read-only`)
- **Reviewed branch:** `agent/fix-audit-publisher-mold-293`
- **Reviewed commit (round 1):** `edcd9c9`
- **Reviewed commit (round 2 / re-grill):** `dfd0a86`
- **Scope:** `curaos/tools/codegen/templates/**` (the mold-class template fixes for #293)
- **PR:** https://github.com/your-org/curaos/pull/170

## Round 1 verdict (commit edcd9c9)

Codex returned the following (verbatim summary):

1. **CORRECTNESS BUG (Critical #298 still broken for real `drizzle(postgres-js)`):**
   `PostgresAuditChainHeadStore.compareAndSet()` read affected rows only via
   `result.rowCount`, but the real postgres-js client exposes affected rows as
   `count` (and returns SELECT rows array-like). Reading only `rowCount`/`.rows`
   against the production client made a **successful** CAS return `false` →
   spurious `ConflictException` → the tx enqueue never runs. The outbox store
   already acknowledged the array-like shape via its `rowsOf` helper.
2. **MISSING EDGE:** the #298 snapshot test only asserts template TEXT (no
   rendered-execution rollback test), so the `rowCount` bug passed; and
   `store.get()` reads committed state outside `tx.db` (a 2nd publish in the same
   uncommitted tx can't see the 1st head advance).
3. **INFORMATIONAL:** InMemory/File stores accept-and-ignore `db`, so
   "rollback discards both" only holds for the Postgres backend (by design — the
   non-Postgres backends are dev/test only, no multi-process durability window).
4. **WRONG/INCOMPLETE (#185 / #486 personal+business):** the auth-matrix spoof
   test + e2e PHI-scrub test hit UNPREFIXED routes (`/<plural>/...`), but the
   personal/business controllers mount at `personal-<plural>`/`business-<plural>`
   — so those routes 404 for non-core layers and don't exercise the guard.
5. **OK:** #315 early-return correct (producer.send only on no-tx path, exactly
   once); #298 type-compatibility OK (`AuditOutboxDrizzleExecutor` structurally
   satisfies `AuditChainHeadDrizzleExecutor`); #299 live-vs-clone OK (reads
   return clones, leases + markPublished/markFailed mutate live state by id);
   #236, #349, #287, #224, #54, #19, #123, #184 correct.

### Disposition

- **Finding 1 (Critical, real bug):** FIXED in commit `dfd0a86`. Added
  `rowsAffected(result) = result.rowCount ?? result.count ?? 0` (used by both CAS
  branches) and `selectRows(result)` (array-tolerant, used by `get()`), mirroring
  the outbox store's `rowsOf`. The #298 tx-discipline fix is now correct against
  the real postgres-js client. Snapshot test extended to lock both helpers.
- **Finding 2 (test depth):** ACK. The codegen suite is a template-TEXT snapshot
  suite (templates are not rendered+executed there); rendered-execution coverage
  of the audit chain lives in the per-service generated `audit-chain-e2e.test.ts`
  + the service integration tier. The `get()`-outside-tx behavior is intentional:
  one publish per business mutation per tx; conflict detection reads committed
  state and the conditional UPDATE enforces atomicity. Noted, not changed.
- **Finding 3:** ACK, by design — documented in the chain-head store.
- **Finding 4 (#185/#486 route prefix):** CONFIRMED PRE-EXISTING + ORTHOGONAL.
  The auth-matrix + e2e test templates use layer-AGNOSTIC unprefixed routes and
  are bound by a byte-identity-across-trio contract (m9-s2 P7). The controllers
  mount at `personal-`/`business-` prefixes with NO `setGlobalPrefix`, so EVERY
  route reference in those test files (the pre-existing `HEALTH`/`PROTECTED`
  consts too) is mismatched for non-core layers. This predates #293 and is a
  separate route-prefix/global-prefix architecture decision (fixing it would
  violate the P7 byte-identity contract or require an app-prefix change). The new
  #185 verifying assertion (`response.body.actorId === verifiedActor`) is kept
  layer-agnostic (preserving P7) and is genuinely verifying for `core` where the
  routes are correct. Captured as a FORESIGHT follow-up, not fixed inline.
- **Finding 5 (OK):** no action.

## Re-grill verification (commit dfd0a86)

Re-grill (Codex, `model_reasoning_effort=high`, read-only) scoped to the
`audit-chain-head.store.ts.hbs` shape-tolerance fix:

> **VERDICT: fixed**
>
> 1. CAS fixed: `rowsAffected` uses `rowCount ?? count ?? 0`; both INSERT and
>    UPDATE return `> 0`, so postgres-js `count` and test `{ rowCount }` both work.
> 2. `get()` fixed: `selectRows` accepts direct arrays or `{ rows }`, so
>    postgres-js SELECT arrays and test executors both return `current_hash`.
> 3. No new issue found: helpers are generic/name-agnostic; no service-core-only
>    symbol or branch-specific behavior introduced.

**Note on round-1 grill delivery:** the first two re-grill invocations stalled
without writing `--output-last-message` (Codex background hang); the third
foreground invocation returned cleanly with the verdict above (orchestrator can
re-verify by re-running the prompt in `/tmp/codex-regrill-293.txt`).

All grill findings are either fixed (Critical #298 result-shape) or dispositioned
as pre-existing-and-orthogonal (route prefix) / by-design (in-memory rollback).
No open Critical reviewer flag remains.
