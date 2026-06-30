# M10 #295 PR #191 adversarial grill: audit-outbox skipped-row checkpoint

**Reviewer:** Codex (cross-harness adversarial review — Codex reviewing Claude code)
**PR:** your-org/curaos#191
**Closes:** curaos-ai-workspace#295
**Branch:** `agent/m10-295-replayer-skip-offset-claude-5e295f2a`
**Commit:** `a1c7323` (off curaos main `cf35788`)
**Date:** 2026-06-02

---

## Summary verdict

**APPROVE**, with two non-blocking follow-ups.

Reason: generated default path wires `InProcessReplayCheckpoint.recordSkipped`, skip branch awaits it, all three layers are byte-identical, and read-only execution against `a1c7323` blobs proves all-unmapped tail reads `[3, 0]` across restart.

---

## Findings by severity

| Severity | Finding | Verdict |
|---|---|---|
| **P0** | None. | PASS |
| **P1** | None. | PASS |
| **P2** | Optional override gap: `recordSkipped` is optional and called via `checker.recordSkipped?.(offset)`, so a custom override checker without the method silently keeps old behavior. Generated path is covered by `new InProcessReplayCheckpoint()` which implements `recordSkipped`. Evidence: `tools/codegen/templates/service-core/src/db/audit-outbox-replayer.ts.hbs:74-81`, `:183-185`; `tools/codegen/templates/service-core/src/db/audit-outbox.module.ts.hbs:90-92`, `:109-112`. | FOLLOW-UP |
| **P2** | No monotonic guard inside `recordSkipped`; it directly assigns `this.offset = offset`. Generated readers prevent backward movement via ascending `sinceSeq`, but custom readers are trusted. Evidence: `tools/codegen/templates/service-core/src/db/audit-outbox.module.ts.hbs:90-92`; `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:461-469`, `:918-933`. | FOLLOW-UP |
| **P3** | Current checkout was `cf35788` on `main`; new test file is only in `a1c7323`, so direct path test was not runnable without checkout. Read-only in-memory blob harness used instead. | INFO |

---

## Attack vectors

### 1. OPTIONAL GAP

**Verdict: PASS for generated code, PARTIAL for custom override checkers.**

Evidence:
- `tools/codegen/templates/service-core/src/db/audit-outbox-replayer.ts.hbs:74-81`: method is optional — `recordSkipped?(offset: string)`.
- `tools/codegen/templates/service-core/src/db/audit-outbox-replayer.ts.hbs:183-185`: skip branch calls `await checker.recordSkipped?.(offset);`.
- `tools/codegen/templates/service-core/src/db/audit-outbox.module.ts.hbs:72-92`: generated default `InProcessReplayCheckpoint` implements `recordSkipped`.
- `tools/codegen/templates/service-core/src/db/audit-outbox.module.ts.hbs:109-112`: injected target defaults to `new InProcessReplayCheckpoint()`.

Whole-repo `git grep` at `a1c7323` found `AUDIT_OUTBOX_REPLAY_TARGET` only in generated module templates and test; no generated binding to a checker without `recordSkipped`.

---

### 2. OFFSET ORDERING

**Verdict: PASS for generated readers.**

Evidence:
- `tools/codegen/templates/service-core/src/db/audit-outbox-replayer.ts.hbs:167-185`: one row at a time; mapped calls `recordDurable(fact, offset)`, skipped calls `recordSkipped?.(offset)`.
- `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:461-469`: in-memory reader filters `seq > afterSeq`, sorts ascending.
- `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:918-933`: Postgres reader uses `WHERE seq > ...` and `ORDER BY seq ASC`.

Skip cannot advance past a later unprocessed mapped row because rows arrive strictly in ascending sequence order.

---

### 3. MONOTONICITY

**Verdict: PASS for generated readers, PARTIAL for custom reader use.**

Evidence:
- `tools/codegen/templates/service-core/src/db/audit-outbox.module.ts.hbs:81-84`: `recordDurable` assigns `this.offset = offset`.
- `tools/codegen/templates/service-core/src/db/audit-outbox.module.ts.hbs:90-92`: `recordSkipped` assigns `this.offset = offset`.
- Generated readers enforce ascending order as cited above; no additional guard inside `recordSkipped` itself.

---

### 4. MIXED TAIL

**Verdict: PASS.**

Evidence:
- `tools/codegen/templates/service-core/src/db/audit-outbox-replayer.ts.hbs:170-185`: mapped and skipped branches both advance the checkpoint path.
- `tools/codegen/__tests__/templates/audit-outbox-replayer-skipped-rows.test.ts:203-230`: tests mapped(20), skipped(21), mapped(22), skipped(23), skipped(24), expects checkpoint `24` and second restart `rowsRead` `0`.

Read-only blob harness result:
```json
{ "mixedReads": [5, 0], "mixedCheckpoint": "24" }
```

---

### 5. TRIO SYMMETRY

**Verdict: PASS.**

Evidence:
- `tools/codegen/__tests__/templates/audit-outbox-replayer-skipped-rows.test.ts:50-58` asserts byte identity across `service-{core,personal,business}` for replayer and module templates.
- SHA-256 at `a1c7323`: all replayers `966c4f5e4422be28394cd306477fe2e111265170b6616c1a54dca3bc03af10ea`; all modules `0bf2492e77917f35b77f3d0c6b18f2255fc0a66cc1d53988bcd4be3192dc53dd`.
- Core/personal/business line windows matched for replayer `:61-82`, `:163-188`, and module `:72-92`.

---

### 6. TEST STRENGTH

**Verdict: PASS.**

Evidence:
- `tools/codegen/__tests__/templates/audit-outbox-replayer-skipped-rows.test.ts:169-200`: all-unmapped tail first read `3`, checkpoint `12`, second restart `0`, reads `[3, 0]`.
- `tools/codegen/__tests__/templates/audit-outbox-replayer-skipped-rows.test.ts:69-75`: asserts awaited skip call.
- `tools/codegen/__tests__/templates/audit-outbox-replayer-skipped-rows.test.ts:78-85`: asserts generated checkpoint implementation updates `this.offset`.

Mutation check against `a1c7323` blobs:
```json
{
  "baseline":      { "reads": [3, 0], "checkpoint": "12" },
  "removedCall":   { "reads": [3, 3], "checkpoint": null },
  "unimplemented": { "reads": [3, 3], "checkpoint": null }
}
```

Removing the skip call or leaving `recordSkipped` unimplemented both cause the second-restart read to return `3` instead of `0` — test goes RED in both mutation scenarios.

---

### 7. REGRESSION CHECK: #294 lease-fence / #260 tx-CAS

**Verdict: PASS.**

Evidence:
- `git diff --name-only cf35788..a1c7323` shows only the seven requested files changed.
- Diff filter for `*audit-outbox-store*`, `*audit-outbox.service*`, `*audit-outbox-relay*`, `*lease*`, `*tx*`, `*cas*` returned no files.
- Unchanged service template still contains lease-fence paths at `tools/codegen/templates/service-core/src/db/audit-outbox.service.ts.hbs:198-210`, `:300-323`, `:477-481`, `:941-948`.
- Replayer only calls `sinceSeq`, `recordDurable`, `recordSkipped` at `:163-185`; no tx/relay store path touched.

---

## Verification notes

- Read all requested files via `git show a1c7323:<path>`.
- Current checkout was `cf35788` on `main`; direct test path was absent.
- Ran read-only in-memory Bun harness loading `a1c7323` blobs via `git show`.
- Initial report write attempt to this file was blocked by Codex read-only sandbox; final write performed by Claude Code host.
