---
name: opposite-harness-grill
kind: atomic
version: 0.2.0
inputs:
  pr: { type: string, required: false, description: "owner/repo#N PR to grill" }
  diff_ref: { type: string, required: false, description: "git ref/range (default working tree)" }
  subject: { type: string, required: true, description: "what is being grilled, e.g. 'm9-s2 identity dual-write'" }
  report_path: { type: string, required: false, description: "where to write the grill verdict; relative paths anchor at the resolved workspace root, never the caller cwd (default ai/curaos/docs/grills/<subject-slug>-pr<num>.md when pr is set, else ai/curaos/docs/grills/<bounded-subject-slug>-<sha12>.md; synthetic runs default under scripts/test-fixtures/grills/)" }
  synthetic: { type: boolean, required: false, description: "mark this run as a synthetic/fixture exercise: the report is quarantined under scripts/test-fixtures/grills/, never beside real verdicts, and carries the GRILL-SYNTHETIC marker. Also inferred when the subject contains the word 'synthetic' (the issue-621 fixture class). Default false." }
  opposite_harness: { type: string, required: false, description: "which harness runs the adversary: 'codex' when the orchestrator is Claude (default), 'claude' when the orchestrator is Codex. Routes the grill through that harness's RESCUE agent - NOT a raw codex exec / claude -p shell call (those hang on approval prompts + stale broker sockets)." }
  opposite_harness_agent: { type: string, required: false, description: "override the rescue agent subagent_type for the Codex->Claude direction (install-specific name; codex->codex-rescue is the confirmed Claude->Codex default)." }
  same_harness_agent: { type: string, required: false, description: "agentType to use only when allow_same_harness_fallback=true" }
  probe_timeout_ms: { type: number, required: false, description: "bounded harness-probe timeout; default 30000 (codex cold-start ~14s + hooks needs headroom; the inner alarm derives from this with a 2s margin)" }
  grill_timeout_ms: { type: number, required: false, description: "bounded adversarial grill timeout; default 600000" }
  poll_timeout_ms: { type: number, required: false, description: "P1b bounded poll budget for the written report after the rescue dispatch returns (a job-id placeholder or a still-flushing report); default 30000, capped by the remaining grill budget. <=0 degrades to a single reportWrittenSince check." }
  poll_interval_ms: { type: number, required: false, description: "P1b poll interval while waiting for the written report; default 5000" }
  dimensions: { type: array, required: false, description: "P5a opt-in parallel grill dimensions (subset of security/correctness/contract-PHI/performance); when set, fan out one adversary per dimension and fan-in dedup. Default unset = single-pass grill (unchanged)." }
  cache_bust: { type: string, required: false, description: "P4b cache-bust token threaded by an independent re-grill cycle so a fresh cycle recomputes instead of reusing a same-head verdict; the cache key binds (head_sha, prompt-template-hash, cache_bust)." }
  prior_findings: { type: array, required: false, description: "P1-3 unresolved findings carried in from prior full-review/re-grill cycles. A DELTA re-grill (diff_ref=<prev-sha>..HEAD) only sees changed hunks, so the adversary MUST re-verify each prior finding against the current code and keep any still-unresolved finding in `issues` + `unresolved_findings`; a clean delta that did not touch a prior finding's code does NOT resolve it. Only a finding the adversary explicitly confirms fixed is dropped." }
  allow_same_harness_fallback: { type: boolean, required: false, description: "opt-in same-harness fallback when opposite harness is unavailable; default false" }
outputs:
  verdict: { type: string, description: "pass | issues-found | block | skipped-harness-unavailable" }
  grill: { type: string, description: "opposite-harness | blocked-harness-unavailable | same-harness-fallback" }
  issues: { type: array, description: "confirmed issues the grill surfaced" }
  unresolved_findings: { type: array, description: "P1-3 the still-unresolved subset (this cycle's findings PLUS any carried prior_findings the adversary could not confirm fixed); the caller carries this forward so a clean delta never silently drops a prior full-review finding." }
  report_path: { type: string, description: "absolute path of the persisted grill verdict" }
  verified_sha: { type: string, description: "the git head commit SHA the grill actually reviewed; empty when the adversarial leg did not complete" }
  workflow_defect: { type: boolean, description: "true when the workflow infrastructure, not the grilled PR, failed to produce the required artifact" }
  workflow_defect_kind: { type: string, description: "machine-readable workflow defect reason when workflow_defect=true" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: fs
verification: T2
models:
  grill: sonnet
composes: []
symphony:
  tracker_adapter: github-explicit-sync
  trigger_mode: manual-orchestrator
  workspace_owner: workflow-owned-root
  workspace_lifecycle: local-state-retention
  hooks: workflow-defined
  agent_runner: [claude-workflow, agent-workflow-kit, hermes-native, codex-adapter, generic-playbook]
  prompt_inputs: contract-inputs
  strict_rendering: fail-closed
  state_model: local-sqlite-issue-plus-run-state-plus-github-labels
  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite
  retry_reconcile: executor-defined
  observability: local-events-evidence-and-logs
  safety_posture: curaos-t1-t2-t3
  github_sync: explicit-checkpoint-only
  validation: contract-verification-plus-closeout
  tdd_evidence: required-for-script-code-changes
---

# opposite-harness-grill

Adversarial Tier-2 grill of a code change. Per [[curaos-verification-stack-rule]], CODE grilling is cross-harness (Codex↔Claude). This workflow runs the opposite harness through its rescue agent and persists the verdict to `ai/curaos/docs/grills/` per the binding location rule (NEVER `.scratch/`).

## When to invoke

Inside `pr-verify-merge` after the 3-lens review, before the merge gate, for changes that warrant adversarial scrutiny (auth, PHI, schema, contracts, generated code).

## Behavior

A fresh adversary in the OPPOSITE harness tries to BREAK the change: construct failure scenarios, find unhandled edges, refute correctness claims. Before dispatch, the workflow runs a bounded deterministic local `harness-probe` (`probe_timeout_ms`, default 30s) for the selected CLI/auth/model path; this probe is direct executor code, not an agent prompt, so a live `claude --version` / `codex --version` result cannot be erased by model output. The codex probe's inner `alarm` is derived from `probe_timeout_ms` (with a 2s margin, floor 18s) rather than hardcoded - a hardcoded `alarm 15` falsely reported codex "unavailable" because codex cold-start (CLI boot + SessionStart hooks + a minimal turn) measures ~14s and tips over 15s under hook overhead, spuriously blocking every PR. If the probe fails or times out, the workflow fails fast with `verdict: skipped-harness-unavailable`, `grill: blocked-harness-unavailable`, and still writes a report containing `GRILL: blocked-harness-unavailable` plus `GRILL-PROBE:` evidence. That result is visible to the merge gate; it is not a silent single-reviewer fallback.

When the probe passes, the adversary runs through the opposite harness's RESCUE agent (`agentType: codex:codex-rescue` when the orchestrator is Claude; the Codex-side claude-rescue agent when the orchestrator is Codex) with a bounded `grill_timeout_ms` (default 600s). The workflow never uses raw unbounded `codex exec` / `claude -p` shell calls for the full grill path. If the rescue agent times out, the same `blocked-harness-unavailable` report is written. If the rescue agent returns `pass`/`issues-found`/`block` but returns an empty `report_path`, a path that does not resolve to the requested artifact, or no fresh write at that artifact path, the executor writes a blocked report itself and returns `verdict: skipped-harness-unavailable` with `workflow_defect:true` / `workflow_defect_kind:"opposite-harness-report-missing"`; a missing grill artifact is a failed adversarial leg, not a completed review. This explicitly covers the Codex-side `claude-rescue` failure mode where the agent reports `pass` without writing the required report.

Default report filenames are derived in executor code (RP-33). A PR grill gets the canonical archive name `<subject-slug>-pr<num>.md` (wave subjects are milestone-story scoped, so this realizes the binding `<milestone-story>-pr<num>.md` convention in `ai/curaos/docs/grills/README.md`); a subject already ending in `-pr<num>` is not double-suffixed. Only PR-less local-diff grills fall back to the machine slug: the subject normalized, truncated to a safe prefix, and suffixed with a stable 12-character SHA-256 hash. Both forms stay bounded, so long issue/research subjects cannot produce `ENAMETOOLONG`. An explicit `report_path` remains honored for orchestrator-provided canonical names only when it resolves under the run's report directory (`ai/curaos/docs/grills/` for real runs; the quarantine directory for synthetic runs). A caller-supplied path outside that directory is rejected with a blocked report at a safe default path and `workflow_defect_kind:"opposite-harness-report-path-outside-grills"`.

Synthetic/fixture exercises of this workflow (defect verification, stub runs) must never land beside real verdicts (RP-33; the issue-621 fixture class). A run is synthetic when the caller passes `synthetic: true` (explicit, primary) or the subject contains the word `synthetic` (backstop; intentionally NOT `fixture`, which appears in real wave subjects describing fixture-based tests). Synthetic runs default their report under `scripts/test-fixtures/grills/`, validate explicit paths against that directory instead of the live archive, and stamp the `GRILL-SYNTHETIC: true` marker line into deterministic blocked reports plus require it in adversary-written reports. Detection predicates are mirrored at `scripts/lib/grill-fixture-quarantine.js` (with an archive scan used for the blocked-stub ratio metric and the live-archive cleanliness gate in its bun suite).

Report destinations resolve from an absolute workspace root in executor code (RP-27): `WORKSPACE_ROOT` env override (validated against the `AGENTS.md` + `ai/` marker), else git `rev-parse --show-toplevel` plus a `--show-superproject-working-tree` climb out of nested submodule checkouts, else a cwd fallback for stub runs outside any marker-bearing checkout. Relative `report_path` values anchor at that root, never the caller cwd, and the writer carries no `..`-relative paths. Run from a linked worktree, the verdict lands in that worktree's tracked `ai/curaos/docs/grills/` (git-visible on the lane branch) instead of escaping into git-invisible paths (the `.worktrees/ai/` stray-doc class). The resolution helper is mirrored at `scripts/lib/workspace-root.js` for other artifact writers and the RP-75 local-state GC, whose fail-closed evidence clause (GC FAILS, never deletes, on `.scratch` files matching `VERDICT:` and on non-worktree dirs under `.worktrees/`) is encoded in `scripts/lib/gc-evidence-guard.js` to this workflow's convention.

The adversary pins the exact commit it reviews before reading the diff: for a PR grill, the PR `headRefOid` at grill time; for a local diff, `git rev-parse HEAD`. It returns this as `verified_sha` (normalized in executor code: anything that is not a full 40-hex sha becomes `""`) and writes the line `GRILL-VERIFIED-SHA: <sha>` into the report. Downstream merge gates (`pr-verify-merge` + the `milestone-wave` verify leg) compare `verified_sha` against the PR's current REST `/pulls/N` `head.sha` and fail closed on missing, malformed, or mismatched values - a push after the grill invalidates the verdict (the #202 class: merged on cycle-2 code while the cycle-3 fix was never pushed). Blocked/unavailable paths return `verified_sha: ""`.

`allow_same_harness_fallback` exists only as an explicit opt-in escape hatch; default `false` preserves the cross-harness requirement. When it is true and the opposite probe fails, the workflow continues through `same_harness_agent` if provided, otherwise through the normal rescue agent, sets `grill: same-harness-fallback`, and requires the report to include `GRILL: same-harness-fallback` plus the failed `GRILL-PROBE:` evidence. Writes the verdict to `report_path` (binding: `ai/curaos/docs/grills/<milestone-story>-pr<num>.md`; re-grills append a `## Re-grill verification` section).

### HTTP integration tests - static review only (sandbox contract)

Per [[curaos-verification-stack-rule]] §3.7 (issue #155), the adversary prompt carries a binding constraint: **do NOT run `bun test` on any HTTP / supertest integration test** (files that call `app.listen(0)`, `request(app.getHttpServer())`, or any `.listen(0)` server handoff). The Codex sandbox (`-s workspace-write`, Seatbelt / seccomp) blocks ephemeral-port TCP bind, so those tests crash with a false `Failed to start server. Is port 0 in use?` even when they pass `0 fail` in the orchestrator shell. The adversary does **static source review** of those files instead (test + controller/route/handler correctness, coverage, edges, boundary/PHI) and treats the orchestrator-pasted raw stdout in the PR body as the authoritative runtime evidence for the HTTP tests. Non-HTTP / unit / pure tests may still be run normally. The orchestrator runs the HTTP tests locally and pastes the stdout into the PR body **before** dispatching this grill.

### Speedup behavior (issue #706)

- **Rescue force-wait + bounded poll (P1 / P1b).** The rescue dispatch is awaited to completion so the adversary returns the WRITTEN report, not a job-id placeholder. After the dispatch returns, if the artifact is not yet present the executor runs a bounded poll (`poll_interval_ms`, default 5s, up to `poll_timeout_ms`, default 30s, capped by the remaining grill budget) for the written report BEFORE returning `workflow_defect:opposite-harness-report-missing`. This removes the need for externally hand-rolled background file-watchers. `poll_timeout_ms<=0` degrades to the single `reportWrittenSince` check.
- **Exhaustive-first prompt (P2c).** The first-grill prompt demands a COMPLETE, severity-ranked, deduplicated findings list as the structured `issues` array in ONE pass (ordered critical -> high -> medium -> low, no duplicate `(severity, what)` pairs). This kills the one-finding-per-cycle thrash that drove multi-cycle re-grills.
- **Grill report cache key (P4b + P1-1).** A grill verdict is cache-keyed on `(head_sha, prompt-template-hash, cache_bust)`. The `head_sha` is RESOLVED IN EXECUTOR CODE before the key is computed (`resolveHeadSha` runs the same `verifiedShaCmd` the adversary pins from - PR `headRefOid` / `git rev-parse HEAD` - and normalizes to 40-hex). Binding the RESOLVED head, not the PR ref, is load-bearing: a second commit on the SAME PR moves the head, so the key changes and a stale PASS is NOT reused (P1-1; the prior PR-ref-bound key collided across commits on one PR). A re-run within one cycle can reuse the verdict; an independent re-grill cycle threads a distinct `cache_bust` so it recomputes. The key + resolved head are logged for the cache-aware orchestrator.
- **Parallel grill dimensions (P5a, opt-in) + fan-in soundness (P1-4 / P2).** When `dimensions` is set (subset of `security` / `correctness` / `contract-PHI` / `performance`), the executor fans out one adversary per dimension concurrently (`Promise.all`, so wall-clock = max(dimension), not sum), writes a per-dimension report sibling, then fan-in dedups the findings into a single executor-written canonical aggregate report. Fan-in fail-closed rules: (P1-4) ALL dimensions must report the SAME 40-hex head sha - a divergent or missing sha BLOCKS (a mixed-head fan-out reviewed different commits, so it is not one review); an errored dimension (its `.catch` returns `skipped-harness-unavailable`) or a dimension returning no recognized pass/issues-found/block verdict ALSO blocks (never folded into a pass). (P2) the dedup key is `(severity, title, location/evidence-hash)`, not just `(severity, title)` - two distinct findings sharing a severity+title but pointing at different locations/evidence BOTH survive; only a genuine duplicate (same severity, title, AND location/evidence) collapses. The aggregate carries the consensus `verified_sha`. Default unset = single exhaustive pass (unchanged).
- **Delta re-grill carries prior findings (P1-3).** A delta re-grill (`diff_ref=<prev-sha>..HEAD`) only inspects changed hunks. The caller (`pr-verify-merge` / `milestone-wave`) keeps ONE stable `report_path` across every cycle (re-grills APPEND a `## Re-grill verification` section, never fork a fresh file that could replace the full-review verdict) and threads `prior_findings` into each re-grill so the adversary RE-VERIFIES every still-open finding against the current code. A clean delta that did not touch a prior finding's code does NOT resolve it; the executor folds any un-re-asserted prior finding into `unresolved_findings` so a carried full-review finding is never silently dropped. Only an explicit `pass` (cleared) or `block` (escalated) verdict ends the carry.
- **Workspace-root marker assertion (P5b).** Before writing any report, the executor asserts the resolved workspace root carries the `AGENTS.md` + `ai/` marker. A real `git rev-parse --show-toplevel` that is NOT the marker-bearing workspace root (a code submodule or uninitialized nested checkout) fails closed with `workflow_defect_kind:"grill-report-root-unsafe"`, so a verdict never lands inside a code submodule. The pure cwd fallback outside any git checkout (stub/fixture path) is allowed.

## Gates

- verdict=block on a confirmed exploitable/correctness/boundary failure → `pr-verify-merge` does not merge.
- verdict=skipped-harness-unavailable / grill=blocked-harness-unavailable on probe failure or timeout → `pr-verify-merge` treats the adversarial leg as blocked, not completed.
- Empty, mismatched, missing, or stale `report_path` after the rescue result → deterministic blocked report + `skipped-harness-unavailable` + machine-readable `workflow_defect:true`. A report file that existed before the current grill started does not satisfy the gate; the adversary must return the requested path and write or append during this run.
- Default filename generation must stay bounded so long subjects cannot exceed filesystem filename limits: PR grills emit `<subject-slug>-pr<num>.md` (the canonical `<milestone-story>-pr<num>.md` shape), PR-less grills the hashed `<safe-prefix>-<sha12>.md` machine slug.
- Explicit `report_path` must resolve under the run's report directory (`ai/curaos/docs/grills/` for real runs; `scripts/test-fixtures/grills/` for synthetic runs); outside paths fail closed and are not passed to the adversary.
- Synthetic runs (`synthetic: true` or a subject containing the word `synthetic`) never write into the live archive; their reports carry `GRILL-SYNTHETIC: true` and quarantine under `scripts/test-fixtures/grills/`.
- Report destinations resolve from the absolute workspace root (env override -> git superproject climb -> cwd fallback); relative `report_path` anchors there, never at the caller cwd, and never via `..`-relative hops.
- Grill report MUST persist to `ai/curaos/docs/grills/`, never `.scratch/`.
- `verified_sha` is REQUIRED in the agent result and the report (`GRILL-VERIFIED-SHA:` line); a grill that cannot prove which commit it reviewed is treated as blocked by the merge gates, never as a completed review.

## Determinism

Harness availability probing and blocked-report evidence are deterministic executor behavior. Adversarial LLM judgement remains best-effort; the persisted verdict + the merge-gate decision are the durable artifacts.
