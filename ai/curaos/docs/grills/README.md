# Codex adversarial grill reports

Per [[curaos-verification-stack-rule]] Tier-2: cross-harness adversarial reviews. When Claude orchestrator dispatches Codex (or vice-versa) to grill a PR, the report lands here.

## Naming

`<milestone-story>-<pr-numbers>.md` - e.g. `m8-s1-pr88-134.md`, `m8-s2-pr86.md`.

For PR pairs (curaos code + workspace ADR), include both PR numbers separated by dash.

The `opposite-harness-grill` executor derives this name by default (RP-33): a PR grill writes `<subject-slug>-pr<num>.md` (wave subjects are milestone-story scoped, so the canonical shape falls out without orchestrator-supplied paths; a subject already ending in `-pr<num>` is not double-suffixed). Only PR-less local-diff grills fall back to the bounded hashed machine slug `<safe-prefix>-<sha12>.md`. Pre-RP-33 reports carrying machine slugs stay under their historical names; re-grills append to the existing file rather than renaming it.

## Lifecycle

1. **Orchestrator** spawns codex grill via `codex:codex-rescue` Agent.
2. **Codex** writes initial grill verdict (BLOCK / APPROVE-WITH-CONDITIONS / PASS) with P0/P1/P2 findings.
3. **Worker** fixes findings, pushes commits.
4. **Orchestrator** spawns re-grill - codex appends `## Re-grill verification` section to the same file.
5. **Re-grill verdict** APPROVE → orchestrator merges. PARTIAL → another fix loop. BLOCK-REGRESSION → harder reset.

## Harness-unavailable reports

When the `opposite-harness-grill` workflow's bounded `harness-probe` or rescue-agent timeout fails, it still writes a report here. That report is not a completed adversarial grill; it is explicit evidence that the T2 opposite-harness leg is blocked.

Required lines:

```markdown
GRILL: blocked-harness-unavailable
GRILL-PROBE: <last probe evidence or timeout reason>
GRILL-HARNESS: <codex|claude>
GRILL-AGENT: <rescue-agent-type>
GRILL-TIMEOUT-MS: <timeout>
```

Merge gates must treat `verdict: skipped-harness-unavailable` / `GRILL: blocked-harness-unavailable` as a blocked adversarial leg, not as CodeRabbit-only completion.

A report whose ONLY content is this deterministic blocked-harness evidence (no adversarial verdict, no `GRILL-VERIFIED-SHA:` line) is a **blocked stub**. `scripts/lib/grill-fixture-quarantine.js` (`scanGrillArchive`) classifies stubs and computes the archive stub ratio so the milestone-wave verify leg can alarm when merges keep proceeding on blocked adversarial legs (RP-33).

## Synthetic / fixture quarantine (RP-33)

Synthetic or fixture exercises of the grill workflow (defect verification, stub runs, harness probes) must NEVER land beside real verdicts in this directory. The `opposite-harness-grill` executor quarantines them:

- A run is synthetic when the caller passes `synthetic: true` (explicit, primary) or the subject contains the word `synthetic` (backstop; intentionally not `fixture`, which appears in real wave subjects describing fixture-based tests).
- Synthetic reports default under `scripts/test-fixtures/grills/` and carry the marker line `GRILL-SYNTHETIC: true`; explicit `report_path` values for synthetic runs are validated against that directory, not this one.
- Detection predicates live in `scripts/lib/grill-fixture-quarantine.js`; its bun suite (`scripts/lib/grill-fixture-quarantine.test.js`) fails if any marker-bearing or synthetic-subject report sits in this directory, keeping the live archive clean.
- The original `issue-621-synthetic-empty-report.md` fixture (a synthetic stub-run artifact committed here pre-quarantine) now lives at `scripts/test-fixtures/grills/issue-621-synthetic-empty-report.md`.

## Workspace-root resolution + GC fail-closed (RP-27)

Writers resolve this directory from an ABSOLUTE workspace root; never the caller cwd and never `..`-relative hops (which escaped linked worktrees into git-invisible paths: the `.worktrees/ai/` stray-doc class). Resolution order, implemented in `scripts/lib/workspace-root.js` and mirrored inline in `scripts/workflows/opposite-harness-grill.workflow.js`:

1. `WORKSPACE_ROOT` env override (absolute, validated against the `AGENTS.md` + `ai/` marker).
2. git `rev-parse --show-toplevel` plus a `--show-superproject-working-tree` climb out of nested submodule checkouts. A linked worktree of the workspace is a valid root: its tracked `ai/curaos/docs/grills/` is the git-visible destination on that lane's branch.
3. cwd fallback for stub/test runs outside any marker-bearing checkout.

GC fail-closed clause (born here per RP-27; `scripts/gc-local-state.sh` from RP-75 implements it to this convention via `scripts/lib/gc-evidence-guard.js`): local-state GC FAILS (exits nonzero), never deletes, when

- a `.scratch` file matches `VERDICT:` (a stranded grill verdict awaiting promotion to this dir), or
- a non-worktree dir sits under `.worktrees/` (a stray escaped artifact tree needing diff + disposition).

Unreadable `.scratch` candidates and a missing worktree registry also block: the GC cannot prove they are not evidence.

## Format

```markdown
# Codex grill - <milestone-story> PR <repo>#<num> [+ <repo>#<num>]

## Verdict: BLOCK / APPROVE-WITH-CONDITIONS / PASS

## P0 findings (block merge)
1. <title>
   - **Where:** path:line
   - **What:** concise defect description
   - **Why P0:** correctness/security impact
   - **Fix:** concrete proposed change

## P1 findings (must address before merge)
...

## P2 findings (followups acceptable)
...

## What Claude got right (counter-balance - minimum 3 items)
...

---

## Re-grill verification (YYYY-MM-DD, post-<commit-sha>)

**Verdict: APPROVE / PARTIAL / BLOCK-REGRESSION**

### P0 verification
...

### New defects (if any)
...
```

## HTTP integration tests - static review only (sandbox contract)

Per [[curaos-verification-stack-rule]] §3.7 (issue #155): the Codex adversary runs under a sandbox (`codex exec -s workspace-write`) whose Seatbelt / seccomp restrictions **block ephemeral-port TCP bind** (`listen(0)`). Any supertest / Nest.js HTTP integration test that calls `app.listen(0)` therefore crashes inside the sandbox (`TypeError: null is not an object (evaluating 'app.address().port')` / `Failed to start server. Is port 0 in use?`) even when it passes `0 fail` in the orchestrator shell - a **false negative**.

**Binding orchestrator grill-prompt addition (paste into every Codex grill prompt for a PR with HTTP tests):**

> Do NOT run `bun test` on any HTTP / supertest integration test (files that call `app.listen(0)`, `request(app.getHttpServer())`, or any `.listen(0)` server handoff) - the sandbox blocks the ephemeral-port bind and produces false `Failed to start server. Is port 0 in use?` failures. Do STATIC SOURCE REVIEW of those files instead: read the test + the controller/route/handler under test and reason about correctness, coverage, edge cases, and boundary/PHI handling. The orchestrator has already run those HTTP tests locally (no sandbox) and pasted the raw stdout (last 15 lines + exit code) into the PR body - treat that pasted stdout as the authoritative runtime evidence for the HTTP tests. Non-HTTP / unit / pure tests may still be run normally.

The orchestrator's responsibility: run the HTTP integration tests locally and paste the raw stdout into the PR body **before** dispatching the grill, so the adversary has the runtime signal it is forbidden to reproduce under the sandbox. A grill report that lists HTTP-test failures it produced by running `bun test` under the sandbox is disregarded for those files; the orchestrator-pasted stdout wins. The `opposite-harness-grill` workflow + playbook bake this same constraint into the adversary prompt on every invocation.

## T1 LLM-judge rubric + golden set (RP-58)

The archive doubles as labeled ground truth for the Tier-1 LLM judge. [`golden-set/t1-judge-rubric.md`](golden-set/t1-judge-rubric.md) states the explicit pass/fail criteria (derived from the `just ci` check list + the T1 sequence per [[curaos-verification-stack-rule]]), and [`golden-set/golden-set.json`](golden-set/golden-set.json) freezes 28 known-good/known-bad PR states curated from the reports in this directory (labels follow the INITIAL grill verdict; conditional verdicts, blocked stubs, and planning-only reports are excluded).

- Purpose: **drift detector on judge model refreshes, not a benchmark** (judge agreement stabilizes only with 100+ labels). Judge model + rubric version are pinned in the JSON.
- Runner: `bun scripts/check-golden-set.js` (integrity self-check; runs under `just ci` via its bun suite) and `--verdicts <file>` to compare a judge run; it exits nonzero when verdicts diverge from labels beyond `divergence_threshold` (missing/unknown verdicts count as divergent, fail-closed).
- The `golden-set/` subdirectory is intentionally outside `scanGrillArchive`'s non-recursive scan, so rubric + data never pollute the stub-ratio metric or the fixture-quarantine sweep.
- Curating a new entry: only non-stub reports with a crisp initial verdict (see the mapping table in the rubric); update `golden-set.json` and let the self-check enforce the 20-30 band + class balance.

## Why these live in `ai/curaos/docs/`

Workspace [`AGENTS.md`](../../../../AGENTS.md) §1 mandates that all agent artifacts (ADRs, RFCs, specs, reports) live under `ai/curaos/` - NOT in the curaos submodule. Grill reports are agent artifacts; they belong here.

`.scratch/` at workspace root was the previous home - untracked, fragile, swept away by worktree cleanups. This dir is canonical going forward.

## See also

- [[curaos-verification-stack-rule]] - 3-tier verification (T1 auto / T2 PR / T3 HITL)
- [[curaos-cli-agents-rule]] - multi-primary cross-harness stack
- [M12 #396 submodule naming inventory PR #425 grill](m12-396-submodule-naming-inventory-pr425.md)
