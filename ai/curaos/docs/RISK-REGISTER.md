# Risk Register: recurring agent-failure patterns

One row per recurring failure pattern observed in this workspace: what keeps going wrong, where it happened, what deterministic guard (script or gate) stops it, and when it last recurred. Created by remediation item RP-29 (see [workspace review remediation plan](research/2026-06-10-workspace-review-remediation-plan.md)); pattern rows sourced from the [workspace deep review](research/2026-06-10-workspace-deep-review.md) section 2 plus a one-time seed grep of the session memory store.

**Binding policy** (canonical line lives in [[curaos-knowledge-persistence-rule]] Layer 6): any lesson recorded twice (memory, HANDOVER, postmortem, session retro) MUST get a row here in the same session that records the second occurrence. Rows whose Guard column is `NONE` and whose last recurrence is older than 3 sessions auto-convert to quarantined foresight issues per [[curaos-foresight-rule]]; the automation is the LESSON-mining + aging sweep (RP-45), live as `scripts/session-closeout` steps 9-10.

**Why this register exists:** patterns that received converger scripts stopped recurring (see RR-17); prose-only lessons all recurred (RR-13 through RR-16). Writing a lesson down twice without a guard row is the documented failure mode, not a mitigation.

## Column contract

| Column | Meaning |
|---|---|
| ID | Stable row key (`RR-NN`); other docs reference rows by this ID (for example a rules-as-tooling invariant marked `gate: NONE, tracked in RISK-REGISTER`) |
| Pattern | The recurring failure, phrased as the behavior that repeats |
| Incidents | Evidence trail: session memory files, review findings, PR/issue numbers |
| Guard | Concrete script/gate path if one exists today; `NONE (planned: RP-NN ...)` when only a remediation item exists; `NONE` alone when nothing is planned |
| Last recurrence | Session id (`session-NN`) or date of the most recent observed occurrence |

Sweep parsing contract (RP-45): a row is unguarded iff its Guard cell starts with the literal token `NONE`. When the aging sweep (`scripts/session-closeout` step 10) emits a foresight-capture payload for an unguarded aged row, it stamps the Guard cell with `[foresight-payload-emitted <date>]`; the cell still starts with `NONE` (the unguarded predicate holds), and the stamp is the durable dedupe record (a later run files nothing for that row). New lessons mined from memory (step 9) land as `NONE (candidate: auto-mined, needs review + guard decision)` rows plus an entry in the mined-lesson ledger at the end of this file.

## Register

| ID | Pattern | Incidents | Guard | Last recurrence |
|---|---|---|---|---|
| RR-01 | Inline "KEEP IN SYNC" code copies drift; fixes land in one copy only | merged-flag fixed in pr-verify-merge but missed in milestone-wave; thread-gate logic diverged; pickImplementModel 3-copy drift (deep review s2 row 1) | shared phase bodies extracted to `scripts/lib/` (`merge-hygiene.js`, `triage-status.js`, `model-tier.js` single `pickImplementModel` owner) + `scripts/workflow-truth-contract.test.js` extractFunction-equality pins on the remaining inline copies (RP-20) | 2026-06-10 review |
| RR-02 | Binding rules enforced only by LLM attention, no deterministic gate | generator barrier ignored; em-dash ban violated repeatedly incl. self-regression PR #310 (session-36); AI-trailer ban unenforced (deep review s2 row 2) | `scripts/check-no-dashes.sh` + `scripts/check-commit-msg.sh` + milestone-wave RP-04 barrier filter (truth-contract pinned) + binding policy: `curaos_quality_gates_rule.md` "Rules-as-tooling: two-tier enforcement policy" (RP-22; deterministic-invariant inventory lists the remaining NONE rows) | session-36 |
| RR-03 | Guards fail open on external failure (GraphQL error, truncated `--limit`, missing input treated as pass) | notification-gate THREADS_JSON; dep-graph silent empty edges; check-roadmap `--limit 500` truncation; barrier probe `--limit 30` clear-to-dispatch (deep review s2 row 3) | partial: label-sweep fail-closed (#654) + `scripts/pr-notification-gate`/`scripts/sweep-pr-notifications` fail closed on GraphQL failure (RP-02) + converger page-or-fail-closed caps, exit 2 before any mutation (RP-07) + fail-closed convention + 5-class failure-fixture checklist in `curaos_quality_gates_rule.md` (RP-23); dep-graph degrade surfacing in `scripts/lib/dep-graph.js` (loud `degraded` flag + calibration append refusal), consumer wiring still landing (RP-46) | 2026-06-10 review |
| RR-04 | Stale state docs mislead the next session (HANDOVER, ISSUE-ROADMAP, CONTEXT.md, unbannered superseded research) | session-28 acted on stale memory for milestone state; CONTEXT.md said "M9 in flight" at review time (deep review s2 row 4) | `scripts/session-closeout` (step 5 freshness gate + step 6 Current-state-block gate) + `ai/rules/curaos_knowledge_persistence_rule.md` Live-state precedence | 2026-06-10 review |
| RR-05 | Silent label/board write failures; single-select option IDs regenerate on any field mutation | missing label = silent no-op; `updateProjectV2Field` regenerated ALL option IDs, bit 3 sessions (session-30, session-30c; gh-project-sync memory) (deep review s2 row 5) | `scripts/sweep-label-seed` + `scripts/lib/gh-project.js` single-select catch-refresh-retry on option-not-found (RP-25 write side; option-ID purge from memory files still queued at `.scratch/integration-queue/rp-25.md`) | session-30c |
| RR-06 | merged != reviewed-settled: CodeRabbit posts threads 6-10 min after checks pass; merge proceeds anyway | recurred ~2x through merge path; session-30 "Review skipped at merge, findings landed minutes later"; session-31 "check SUCCESS still carried inline threads" (deep review s2 row 6) | `scripts/workflows/pr-verify-merge.workflow.js` review-settled gate (`reviewNotSettled` probe vs head sha, settle window, fail-closed on unparseable probe) + milestone prompt §9 BINDING precondition + §3.13 last-action ordering (RP-18) | session-31 |
| RR-07 | Hand-synced index rows drift across copies (AGENTS s15, rules README, field counts) | "8 worktree cap" vs amended rule; 5-label vs 7-label; 10-vs-11 fields; 44-vs-48 rule count (deep review s2 row 7) | `scripts/generate-rule-index.js` (README table + AGENTS §15 generated from rule frontmatter; drift + em-dash fail-closed) wired via `scripts/check-docs.sh` into `just ci` and the lefthook doc gate (RP-26) | 2026-06-10 review |
| RR-08 | Artifacts written into wipeable or git-invisible dirs | P0 grill verdict in `.scratch/grills/`; `.worktrees/ai/` relative-path escape stranded 6 mirror docs + 2 services same day (deep review s2 row 8) | `scripts/lib/workspace-root.js` resolveWorkspaceRoot (no `../` escapes; inline mirror pinned in `opposite-harness-grill.workflow.js`) + grill verdicts default under `ai/curaos/docs/grills/` with synthetic-run quarantine (`scripts/lib/grill-fixture-quarantine.js`) + GC fails closed on evidence (`scripts/lib/gc-evidence-guard.js` via `scripts/gc-local-state.sh`) (RP-27/RP-33/RP-75) | 2026-06-10 review |
| RR-09 | Memory fiction: unverified claims persisted to memory | local-ci-pivot.md "#202 merged" never happened; MEMORY.md index missing 2 session files; "44 rules" vs 48 actual (deep review s2 row 9) | `scripts/session-closeout` (step 7 merge/SHA claim re-verification + step 8 index completeness, RP-28) + `scripts/check-knowledge-drift.sh` (RP-61) | 2026-06-10 review |
| RR-10 | Lessons recorded 2-4x in memory but never codified into a guard | re-pin discipline, branch cleanup, submodule fetch-before-update, fish shell: all recurred as prose; converger-backed patterns stopped (deep review s2 row 10) | this register + binding line in [[curaos-knowledge-persistence-rule]] (RP-29) + `scripts/session-closeout` steps 9-10 lesson-mining + aging sweep (RP-45) | session-36 |
| RR-11 | Prose-only multi-step procedures keep failing under execution | two-level pointer bump errors; stale submodule HEAD without fetch; routine `--no-verify` pushes (deep review s2 row 11) | `scripts/lib/workflow-git.js` bumpPointerChain/bumpSubmodulePointer (fetch every level first + per-level rev-list verification) + `scripts/check-submodule-pins.sh` wired as `just pins` into `just ci` (pre-push via `.githooks/pre-push`); hook env verified fail-closed, `--no-verify` no longer needed (RP-30) | session-36 |
| RR-12 | Module agent docs record design intent as current state | identity-service AGENTS-sections: 14 of 19 deps absent, 3 of 8 test commands nonexistent, false `test_runner: vitest` (deep review s2 row 12) | `scripts/check-agents-schema.js` (11-key schema + command/dependency existence drift + STUB-banner checks; warn-first with legacy allowlist, wired via `scripts/check-docs.sh`) + planned-do-not-import marker / STUB banner / status enum in `curaos_agents_md_schema_rule.md` (RP-14/RP-16/RP-31) | 2026-06-10 review |
| RR-13 | Re-pin discipline: submodule pointer pinned to branch HEAD instead of MERGED main SHA (squash-merge makes branch HEAD unreachable from main) | session-29 LESSONS (memory index + topic file: "re-pin to MERGED main SHA not branch HEAD"); session-29 re-pinned curaos#252/#253/#254 after catching it | `scripts/check-submodule-pins.sh` (every staged gitlink must be an ancestor of its submodule origin default branch tip, rev-list verified; `just pins` inside `just ci`) (RP-30) | session-29 |
| RR-14 | Branch cleanup: merged PR branches left on origin; `--delete-branch` silently fails | session-23 (~200 stale branches not cleaned); session-30 (`gh pr merge --delete-branch` left curaos-deploy branches; verify ls-remote) | post-merge `git ls-remote --exit-code --heads` branch-deletion verification in milestone prompt §9 + one-task prompt §8.5 + `pr-verify-merge.workflow.js` merge leg + playbook step 4 (RP-18) | session-30 |
| RR-15 | Submodule fetch-before-update: `git submodule update --init` leaves a silent STALE HEAD when the clone lacks the pinned commit | session-36 (build-host checkout 312 commits behind; memory index + topic file both record: `git submodule foreach 'git fetch origin'` THEN `submodule update --force`) | `scripts/lib/workflow-git.js` fetch-before-verify at every level (bumpPointerChain phase 1 fetch + stale-tracking-ref detection + rev-list ancestor proof) (RP-30) | session-36 |
| RR-16 | Fish shell on remote boxes breaks compound bash commands (quoting, subshells, `$""`) | session-30 (build-host is fish, wrap `bash -lc`); session-31 (Hetzner box is fish); session-36 (wrap ALL cmds `bash -lc` or scp a script) | NONE | session-36 |
| RR-17 | merged != whole-closed: closing a PR is not closing the work; stranded labels/threads across org repos | session-15 / m9-wave-state LESSON (5 stranded-finding bug issues from directly-merged PRs; sweep ALL org repos, not tracker-only) | `scripts/sweep-closed-issue-labels` + `scripts/sweep-pr-notifications` (recurrence stopped after convergers landed) | session-15 |

## Maintenance protocol

1. **Add a row** when a lesson is recorded for the second time anywhere (memory, HANDOVER, postmortem, retro). Same session, no deferral.
2. **Update Last recurrence** whenever a row's pattern bites again, even if a guard exists (a recurrence with a guard in place means the guard has a gap; note it in the row).
3. **Fill the Guard column** the moment a script/gate lands; replace `NONE (planned: ...)` with the concrete path.
4. **Aging (guard = NONE):** rows older than 3 sessions without a guard become quarantined foresight issues per [[curaos-foresight-rule]]; automated by `scripts/session-closeout` step 10 (RP-45), which emits a foresight-capture payload (dry_run, staging invariants asserted: needs-triage + foresight labels, Backlog, no ready-for-agent) and stamps the row; ROUTING the emitted payload through the foresight-capture workflow files the issue, never a bare `gh issue create`.
5. **Never delete rows.** A guarded, non-recurring row is the success record that justifies the register (RR-17). Mark long-stable rows in prose if needed; keep the trail.

## Seed provenance

Seeded 2026-06-10 from:

- Deep review section 2 ("Mistakes-in-handling patterns + systemic guards") rows 1-12 -> RR-01 .. RR-12.
- One-time grep of the session memory store (`~/.claude/projects/<workspace>/memory/*.md`) for `LESSON:|ROOT CAUSE:|CORRECTION:|REGRESSION:` (plus plural/unpunctuated variants), which surfaced the four named prose-only recurring patterns -> RR-13 .. RR-16, and the converger-efficacy example -> RR-17.

## Mined-lesson ledger (RP-45 sweep state)

Dedupe store for the step-9 lesson-mining sweep in `scripts/session-closeout`: one entry per lesson line ever mined (or reviewed at seed time). Do not hand-edit; removing an entry re-mines its lesson. The `row=SEED` entries below record the memory lessons already reviewed and distilled into RR-01..RR-17 during the RP-29 seed, so the first sweep run does not re-file them as candidates.

<!-- mined-lesson 00fb605d10f2 src=session-21-m10-debt-cleanup.md row=SEED 2026-06-10 -->
<!-- mined-lesson 76f0bb8762c5 src=session-22-foresight-workflow-repair.md row=SEED 2026-06-10 -->
<!-- mined-lesson 8e8e081c622f src=session-28-m15-prep.md row=SEED 2026-06-10 -->
<!-- mined-lesson 6624d9d0a311 src=session-30-m15-live-infra-ready.md row=SEED 2026-06-10 -->
<!-- mined-lesson c60d076f3c84 src=session-30d-m17-redesign-docs.md row=SEED 2026-06-10 -->
<!-- mined-lesson ce1bec06ecb7 src=session-31-website-visual-truthfulness.md row=SEED 2026-06-10 -->
<!-- mined-lesson 6dc6bbaae09c src=session-36-588b-live-build.md row=SEED 2026-06-10 -->
<!-- mined-lesson e7aadb1a6821 src=session-37-fable-tier-refresh.md row=SEED 2026-06-10 -->
