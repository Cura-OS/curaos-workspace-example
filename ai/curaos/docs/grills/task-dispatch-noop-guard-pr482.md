# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: task-dispatch-noop-guard-pr482

## Native Codex fallback review (2026-06-05)

Verdict: issues-found, fixed before merge.

Finding:
- P2: The first no-op guard blocked empty/mismatched branch-agent output, but if the branch agent actually created the branch and failed only to report it, the single checkout could remain on that transient branch. This weakens the wave stop predicate and can contaminate the next serialized lane. Fixed by restoring or stashing back to the default branch before returning `branch-create-failed` from `task-execute` and inline `milestone-wave` dispatch.

Re-check:
- The updated executors call `restoreDefaultBranchAfterBranchFailure` before returning the blocker.
- The workflow playbooks and truth-contract test now bind the restore/stash behavior.
