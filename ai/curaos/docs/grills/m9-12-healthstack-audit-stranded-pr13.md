---
milestone: M9
story: 12
pr_branch: agent/fix-audit-stranded-findings-12
base_commit: b796090
head_commit: 0a0b3f6
grill_type: T2-adversarial
harness: codex-reviews-claude
date: 2026-06-01
verdict: APPROVE
---

# Grill: M9-12 — healthstack-patient-service audit stranded findings

**Diff:** `git diff b796090..0a0b3f6` — single commit "fix(audit): resolve 7 stranded durable-audit findings incl Critical b..."

**Files changed:** 9 (4 src + 5 test)

---

## Verdict: APPROVE

All 5 checks PASS. The fix is correctly scoped, the fail-closed boot guarantee is
restored, the mutex serialization is sound, the schema default is correct, the HIPAA
guard and DDL parity assertions are load-bearing, and no regression or new defect
is introduced.

---

## Check 1 — CRITICAL boot probe

**Verdict:** PASS

**Evidence:** `src/db/durable-stores.factory.ts` lines +31–+42 (relative to b796090 hunk `@@ -59,60 +59,74`)

```
+    try {
+      await pg`SELECT 1`;
+    } catch (probeCause) {
+      await pg.end({ timeout: 5 }).catch(() => undefined);
+      throw probeCause;
+    }
     const db = drizzle(pg) as unknown as SharedDrizzleClient;
     cachedClient = { db, pg: pg as unknown as RawPgClient };
     return cachedClient;
```

**Reasoning:**

- The `await pg\`SELECT 1\`` probe is inside the inner `try` block, which is itself
  inside the outer `try`. It runs BEFORE `const db = drizzle(pg)` and BEFORE
  `cachedClient = { db, pg }` — the assignment is 3 lines below the probe.
- On probe failure: the inner `catch (probeCause)` calls `pg.end()` (pool
  terminated), re-throws `probeCause`. The outer `catch (cause)` wraps it in
  the descriptive boot error and rethrows. `cachedClient` is never assigned.
  Next call re-probes.
- On probe success: the inner `catch` is skipped, execution falls through to
  `drizzle(pg)` and `cachedClient = ...`. The pool stays open — `pg` IS the
  durable runtime client.
- No path exists where a bad DSN gets cached or a good client's pool gets
  closed. The fail-closed guarantee is fully restored.

---

## Check 2 — InMemory tx mutex

**Verdict:** PASS

**Evidence:** `src/db/audit-outbox.service.ts` lines +9–+33 (relative to b796090 hunk `@@ -371,70 +380,85`)

```typescript
  private txTail: Promise<unknown> = Promise.resolve();
  ...
  async transaction<T>(operation): Promise<T> {
    const run = async (): Promise<T> => {
      const draft = cloneState(this.state);   // (a) INSIDE run
      const tx = { enqueue: async (input) => enqueueIntoState(draft, input) };
      const result = await operation(tx);
      this.state = draft;
      return result;
    };
    const gated = this.txTail.then(run, run); // (b) .then(run, run)
    this.txTail = gated.catch(() => undefined);
    return await gated;                       // (c) caller awaits gated
  }
```

**Reasoning:**

- **(a) Clone happens inside `run`**, not at `transaction()` call-site. `run` only
  starts executing once the prior promise in `txTail` settles (resolved or
  rejected). Therefore each tx clones `this.state` AFTER the prior tx has
  committed (or rolled back). No two concurrent txs share the same base.

- **(b) `.then(run, run)`** passes `run` as BOTH the fulfillment and rejection
  handler of the prior tail. A rejected prior tx still triggers `run` for the
  next queued caller — the queue is not poisoned. `txTail = gated.catch()`
  swallows the current tx's rejection from the tail so that a future tx's `.then`
  sees a resolved tail, not an unhandled rejection.

- **(c) `return await gated`** — the current caller awaits `gated`, which is
  `txTail.then(run, run)` resolved/rejected with RUN's own result/error. The
  caller observes its OWN operation's result or rejection, not the prior tx's.

- No interleaving can produce a lost row: the serializing mutex ensures each `run`
  sees the committed state of all prior runs. No silent swallow of another
  caller's error — `gated.catch()` swallows only from the tail-link perspective;
  the awaiting caller still receives the raw rejection from `run`.

---

## Check 3 — schema default

**Verdict:** PASS

**Evidence:** `src/audit/audit-chain-head.store.ts` lines +1–+7 (relative to b796090 hunk `@@ -321,61 +321,67`)

```typescript
-    private readonly schemaName: string = 'core',
+    // #12 (MAJOR): default to the healthstack schema, NOT the codegen-default
+    // `'core'`. ...
+    private readonly schemaName: string = HEALTHSTACK_CHAIN_HEAD_SCHEMA,
```

**Reasoning:**

- Default changed from `'core'` to `HEALTHSTACK_CHAIN_HEAD_SCHEMA` (= `'healthstack'`),
  which is the schema the shipped migration creates.
- The identifier-validation regex `if (!/^[a-z_][a-z0-9_]*$/.test(schemaName))`
  is not touched — it still runs immediately after the constructor parameter, and
  `'healthstack'` satisfies it.
- Caller impact: `rg` scan shows the boot factory (`durable-stores.factory.ts`)
  passes `HEALTHSTACK_CHAIN_HEAD_SCHEMA` **explicitly**, so it is unaffected by
  the default change. No other caller in `src/` constructs
  `DrizzleAuditChainHeadStore` without an explicit schema — and even if they
  did, the new default is now the correct one. No regression path.

---

## Check 4 — HIPAA SSN guard + DDL parity + CAS tests

**Verdict:** PASS

**Evidence (a — SSN guard):**
`test/integration/audit-outbox-durability.postgres.test.ts` lines +54–+76:

```typescript
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;

async function assertNoPlaintextSsnInOutbox(): Promise<void> {
  const rows = await admin.unsafe<{ payload: string }[]>(
    `SELECT payload::text AS payload FROM "healthstack".audit_outbox`,
  );
  for (const row of rows) {
    expect(row.payload).not.toMatch(SSN_PATTERN);
  }
}
```

And lines +143–+148 (called at end of live CAS test):
```typescript
await assertNoPlaintextSsnInOutbox();
```

Also a positive-control unit test (lines +148–+164 in the integration file):
```typescript
test('SSN_PATTERN detects a canonical SSN and ignores SSN-free payloads', () => {
  expect('{"ssn":"123-45-6789"}').toMatch(SSN_PATTERN);
  expect('{"hash":"84709d8e576c..."}').not.toMatch(SSN_PATTERN);
});
```

The guard is load-bearing:
- It queries the **persisted JSONB** (`payload::text`), not an in-memory value.
- It scans the raw text, so a regression anywhere in the envelope serialization
  would be caught regardless of field name.
- The positive-control test ensures the regex itself cannot silently rot.
- Against b796090 (pre-fix), this test did not exist — it would have been absent,
  not green.

**Evidence (b — DDL parity):**
`src/db/schema.ts` hunk `@@ -216,37 +217,50`:

```typescript
    index('healthstack_audit_outbox_pending_idx')
      .on(table.scheduledAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'healthstack_audit_outbox_status_check',
      sql`${table.status} IN ('pending','published','failed')`,
    ),
```

`test/unit/audit-outbox-schema-ddl-parity.test.ts` asserts both at the
Drizzle model level using `getTableConfig(auditOutbox)`:
- Finds the pending index by name, asserts `pending?.config.where` is defined
  and matches `/status"?\s*=\s*'pending'/i`.
- Finds the status check by name, asserts it contains `'pending'`, `'published'`,
  `'failed'`.

Against b796090 the index had no `.where()` predicate and the `check` import +
call did not exist — both assertions would fail RED.

**Evidence (c — CAS barrier):**
`test/integration/audit-outbox-durability.postgres.test.ts` lines +93–+141:

```typescript
const round2Barrier = makeBarrier(2);
const gatedPublish = (p, corr) => {
  const realGet = p.chainStore.get.bind(p.chainStore);
  let gated = false;
  (p.chainStore as { get: typeof realGet }).get = async (t, r, dbExec) => {
    const head = await realGet(t, r, dbExec);
    if (!gated) {
      gated = true;
      await round2Barrier.arriveAndWait();  // both must READ before either CAS-writes
    }
    return head;
  };
  return p.publisher.publish({ ...inputFor(corr), action: 'UPDATE' });
};
const round2 = await Promise.allSettled([gatedPublish(a, 'corr-live-A2'), gatedPublish(b, 'corr-live-B2')]);
...
expect(rejected2).toHaveLength(1);
expect((rejected2[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
```

Both contenders are gated on the barrier (releases when both have called
`arriveAndWait()`), so both have read the same committed chain head before either
races its CAS write. The test then asserts exactly 1 `ConflictException`. This was
absent in b796090 — the round-2 check previously had no `rejected2` assertion and
no barrier, making the conflict path flaky. Both assertions would be missing against
b796090 (test didn't exist), so they are load-bearing additions.

---

## Check 5 — no new defect / no regression

**Verdict:** PASS

**Evidence:** `git diff --numstat b796090..HEAD`

```
7   1   src/audit/audit-chain-head.store.ts
33  9   src/db/audit-outbox.service.ts
14  0   src/db/durable-stores.factory.ts
15  1   src/db/schema.ts
103 2   test/integration/audit-outbox-durability.postgres.test.ts
64  0   test/unit/audit-chain-head-schema-default.test.ts
98  0   test/unit/audit-outbox-inmemory-tx-mutex.test.ts
61  0   test/unit/audit-outbox-schema-ddl-parity.test.ts
56  0   test/unit/durable-stores-boot-probe.test.ts
```

Only 9 files changed, all in `src/db/`, `src/audit/`, and `test/`. No migration
files, no PHI-envelope logic, no relay/replayer logic, no event-producer logic.

Source analysis:
- `durable-stores.factory.ts`: probe inserted between `postgres(dsn)` and
  `drizzle(pg)`; no other logic changed.
- `audit-outbox.service.ts`: `transaction()` refactored to add mutex; no other
  methods touched.
- `audit-chain-head.store.ts`: one default-parameter value changed; regex, tableRef
  construction, and all query methods are untouched.
- `schema.ts`: index predicate added, `check` import + constraint added; all
  column definitions and other indexes are untouched.

No new race introduced: the mutex is a strict serialization — it does not add
concurrency, only removes it for the in-memory path. No type holes: all added code
is typed consistently with the surrounding service. No silent failures: every new
error path either throws or awaits a `.catch(() => undefined)` that is intentional
(pool teardown best-effort on failed probe).

---

## Conditions / Required changes

None. All 5 checks pass cleanly. Recommend merge.
