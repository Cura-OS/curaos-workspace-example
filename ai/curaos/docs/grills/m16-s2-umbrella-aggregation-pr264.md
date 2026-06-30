# Codex grill: M16-S2 PR your-org/curaos#264 umbrella chart dependencies aggregation

## Verdict: BLOCK (harness-unavailable; adversarial leg blocked, not a code BLOCK)

GRILL: blocked-harness-unavailable

## What happened

The opposite-harness (codex) adversarial grill could not produce a verdict for this change. The codex CLI is reachable for a short probe (a 60s direct `codex exec ... "Return exactly OK."` returned `OK`, exit 0), but the full high-effort plan/diff grill hung past 15 minutes and produced no `--output-last-message` report before the bounded alarm killed it. This matches the known codex cold-start / long-run hang class (session-23 #507, plus the `opposite-harness-grill` workflow's 18s probe alarm being too tight for cold start, recorded here as workflow-defect).

Two attempts were made:
1. `agent-workflow-kit workflow-run opposite-harness-grill` (probe_timeout_ms 20000) -> `skipped-harness-unavailable` (probe exited 142 / alarm at 18s, even though the probe printed `OK`).
2. `agent-workflow-kit workflow-run opposite-harness-grill` (probe_timeout_ms 60000) -> `workflow_defect: opposite-harness-report-missing` (the dispatched codex-rescue agent returned an empty 12-token result because there was no diff on HEAD at plan time, and wrote no report).
3. Direct `codex exec` plan grill (high effort, 360s alarm) -> hung > 15 min, killed (SIGALRM, exit 144), no report file written.

## Disposition

Per `docs/agents/one-task-execution-prompt.md` §4: a grill timeout / non-conforming output is a blocked adversarial leg. Per the deterministic-executor clause, the workflow-defect is recorded and the runbook continued natively. The change is fully verified locally (12 new tests green vs real helm v4.2.0; zarf-digest-check guard #4 pass/fail behavior proven; no new codegen suite failures; zero em/en dashes). The T2 PR gate (CodeRabbit + `pr-verify-merge`) provides the cross-check at review time; the merge gate must treat this `blocked-harness-unavailable` leg as not-yet-satisfied (a re-grill should run when the codex runtime is healthy).

## Scope reviewed (self-review in lieu of opposite harness)

- `tools/codegen/src/umbrella-emit.ts`: discovery parses `.gitmodules` `path = backend/services/<slug>` with a single-segment kebab guard (rejects `..` / nested paths); deduped + sorted; throws on missing `.gitmodules` and on empty service set (stub guard). `file://` depth verified at 4 levels (`../../../../backend/services/<slug>/chart`) via `path.relative`.
- `tools/build/zarf-digest-check.sh` guard #4: fails on `0.1.0-stub` / `M8-S3` sentinel and on empty/all-commented deps (awk-scoped so the `maintainers:` `- name:` cannot satisfy it); passes for the real emitted chart; guards 1/2/3/5 untouched.
- Tests: fixture trio scaffold + umbrella emit + `helm dependency build` + `helm template` green; unit assertions on discovery, deps content, version-floor match, guard #4 pass/fail, no-dash.

## Re-grill verification

Pending a healthy codex runtime. Re-run:
`agent-workflow-kit workflow-run opposite-harness-grill --json '{"subject":"M16-S2 umbrella aggregation diff","opposite_harness":"codex","probe_timeout_ms":60000,"grill_timeout_ms":600000}'`
and append the verdict here.
