# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: workflow-branch-dispatch-pr484

## Native Codex fallback review (2026-06-05)

Verdict: issues-found, fixed before merge.

Findings:
- P2: Branch creation was moved into deterministic executor code, but the PR phase still accepted an empty PR-agent self-report and could return `pr-open` with `pr: ""`. Fixed by normalizing the PR ref, restoring/stashing back to default branch, and returning `blocked` with `pr-create-failed` when the PR ref is empty.
- P2: CodeRabbit found two valid follow-up gaps: default-branch operations were hardcoded to `main`, and post-PR restore failures were ignored. Fixed by resolving the repository default branch from `origin/HEAD`, using it for checkout/pull/diff prompts, and blocking with `post-pr default-branch restore failed` when cleanup fails.

Re-check:
- `task-execute` and inline `milestone-wave` now guard empty PR refs and post-PR restore failures.
- The workflow playbooks and truth-contract test now bind the empty-PR-ref block.
