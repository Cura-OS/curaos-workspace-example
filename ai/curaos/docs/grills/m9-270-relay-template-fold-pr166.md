# Grill — M9 #270 audit-outbox RELAY template `markFailed` guard fold-back

- **Issue:** `your-org/curaos-ai-workspace#270`
- **PR:** `your-org/curaos#166`
- **Branch:** `agent/fix-codegen-relay-markfailed-270`
- **Commit:** `d912655`
- **Direction:** Claude → Codex (opposite-harness adversarial, read-only)
- **Reviewer:** Codex (`codex exec`, account-default model, `model_reasoning_effort=high`, `--sandbox read-only`)
- **Scope:** working-tree diff — codegen RELAY template trio + new snapshot test
- **Date:** 2026-06-01

## Change under review

Folds the merged identity-service#68 (PR#71) service-level fix back into the
codegen RELAY template trio so a future regen cannot reintroduce the defect:
the per-row `markFailed` in
`tools/codegen/templates/service-{core,personal,business}/src/db/audit-outbox-relay.ts.hbs`
is now wrapped in its OWN `try/catch`. Without that guard, a throw FROM
`markFailed` (a DB blip on the failure-write itself) escapes the per-key loop and
aborts the OUTER `for (group of byKey.values())` loop, skipping every later
partition key for that poll — the exact cross-key starvation the relay's per-key
isolation promises to prevent. A new snapshot test
(`tools/codegen/__tests__/templates/audit-outbox-relay-markfailed-guard.test.ts`)
renders all three layers via `emitServiceLive` and asserts the wrapped guard on
the emitted relay.

NOTE: this is the RELAY template — a DIFFERENT file from the STORE template
(`audit-outbox.service.ts.hbs`) that #156 (PR#162) fixed with FOR UPDATE SKIP
LOCKED + lease — so non-conflicting.

## Verdict: ACCEPT (no functional blocker)

| Lens | Codex finding |
|---|---|
| Fold-back correctness | **ACCEPT** — template block matches the merged identity-service shape: inner `try { await this.outbox.markFailed(...) } catch {}` then `failed += 1; break;`. |
| Trio symmetry | **ACCEPT** — changed block byte-identical across `service-core`, `service-personal`, `service-business`. |
| Regression guard | **ACCEPT** — renders generated services for all 3 layers, asserts inner `try` precedes `markFailed`, asserts `catch` after the guarded call, and would fail RED on a bare `await this.outbox.markFailed(...)`. |
| `markPublished` symmetry | No new change needed — the existing per-row `markPublished` catch already contains failure and breaks only the current key. |
| Handlebars escaping | No issue — added block is plain TS/comment text, no `{{...}}`. |
| Missing questions | None. |

## Findings dispositioned

1. **(item 5) "BLOCKER: test file untracked"** — Codex ran read-only at a moment
   the new test was still untracked, so `git diff` omitted it. RESOLVED: the test
   is committed in `d912655` (verified `git ls-files --error-unmatch` exit 0).
   The blocker was a pre-commit-snapshot artifact; it is moot post-commit. Codex
   itself qualified it: *"accept once tracked … no functional blocker in the
   template behavior."*
2. **(item 2) provenance labels in test/comment text** (`#270`, `identity-service#68`)
   — minor naming nit. Dispositioned as NON-issue: the sibling codegen tests
   (`audit-outbox-race-lease.test.ts`, `audit-outbox-relay-mode-flag.test.ts`)
   and their template comments carry the identical `#NNN`/`PR#` provenance
   convention. This change is CONSISTENT with the established directory pattern;
   stripping it here would diverge from precedent. No change made.

## Orchestrator-verified note

Tests were NOT run by the read-only reviewer. The implementer verified the
RED→GREEN transition directly:
- RED (unfixed template): 6 fail / 0 pass on the new guard test.
- GREEN (after fold-back): 6 pass / 0 fail; full codegen suite 394 pass / 0 fail.
- Trio byte-identical confirmed by `diff` (core==personal==business).
- Regenerate-smoke: all 3 emitted layers carry the guarded `markFailed` +
  sentinel comment.
