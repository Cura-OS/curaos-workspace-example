# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: subissue-wire-deterministic-pr474

## Native Codex fallback grill (2026-06-05)

GRILL: same-harness-fallback
GRILL-SCOPE: PR #474 deterministic sub-issue wiring executor, REST helper changes, prompt/playbook contract changes, persisted API research.

### Verdict

PASS for the native fallback review. This does not satisfy the blocked opposite-harness leg above.

### Adversarial checks

1. **Pagination failure scenario:** `listSubIssues()` now calls `gh api --paginate` and then JSON parses the result. Tested against parent `#24`, which has more than the default page size: `listSubIssues("your-org/curaos-ai-workspace", 24)` returned `length: 38`, not `[]` or a parse error.
2. **Stale-parent scenario:** #317 had native parent #24 while frontmatter/project truth pointed to #26. `wf_f863e17e-06c` dry-run reported `reparented: #317 from #24 to #26`; `wf_614a5cc0-4bb` applied it. REST verification showed #317 parent #26, #26 lists #317/#356/#407/#408, and #24 no longer lists #317.
3. **Post-repair idempotence:** `wf_fe391414-b31` dry-run returned all four M12 children in `already_wired` and no `subissues_added` or `reparented`, so the executor does not repeat writes after convergence.
4. **Agent-claim regression:** `scripts/workflow-truth-contract.test.js` now asserts `gh-subissue-wire` imports `scripts/lib/gh-project.js`, calls `addSubIssue`/`removeSubIssue`/`addBlockedBy`, and does not call `agent(...)` for edge writes.
5. **Prompt/playbook drift:** `docs/agents/milestone-orchestration-prompt.md`, `docs/agents/workflows/gh-subissue-wire.md`, and `docs/agents/workflows/pm-triage-gate.md` now state that LLM-claimed edge writes are not proof, REST is the wiring path, and stale native parents are reversible tracker repairs.

### Residual risk

No confirmed blocker found in native fallback. Merge gate should still remember the top-level `GRILL: blocked-harness-unavailable` line: same-harness fallback is evidence, not a completed opposite-harness review.
