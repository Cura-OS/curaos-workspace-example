# Grill report: feat/workspace-remediation-waves (workspace remediation, 79-item plan)

- Subject: full branch diff vs main implementing ai/curaos/docs/research/2026-06-10-workspace-review-remediation-plan.md
- Harness pair: Claude (implementer) -> Codex (adversary), per curaos_verification_stack_rule T2
- Final verdict: ACCEPT
- GRILL-VERIFIED-SHA: e488b4d2cfd12a6a86d7dbef10e1225a1f027e85
- Date: 2026-06-10

## Round history

| Round | Subject sha | Verdict | Findings |
|---|---|---|---|
| 1 | 0dc33dd | revise | G-01 agents-schema gate ran warn mode in ci; G-02 retry test asserted source tokens not behavior; G-03 webhook replay ledger failed open on corrupt state; G-04 socket-bound webhook test red in sandbox |
| 2 | 34e86d1 | revise | G-01/G-02 verified fixed; N-01 ENOTDIR codified as empty ledger (must fail closed); G-04 retest blocked by sandbox mkdtemp EPERM |
| 3 | fdfa4c2 | revise | N-01 code correct, test coverage gap (no LEDGER_UNREADABLE assertion, no handleDelivery path); workspace-root test TMPDIR-sensitive |
| 4 | e488b4d | revise (sandbox-only) | ZERO new findings; all source evidence verified; verdict held solely on sandbox mkdtemp EPERM; "branch is structurally ready" |
| 5 | e488b4d | ACCEPT | Host `just ci` evidence (ALL GATES GREEN, exit 0) per curaos_local_ci_first_rule evidence-pasting + fresh sandbox-runnable checks all green (check-docs, ai-mirror, submodule-pins, no-dashes, RP-27 lockstep) |

## Notable catches credited to the grill

- Warn-mode schema gate masquerading as enforced (G-01): ci now runs --mode=fail with allowlist ratchet.
- Fail-open webhook replay ledger (G-03 + N-01): ENOENT-only empty; everything else 503 LEDGER_UNREADABLE, end-to-end tested.
- Bun execFileSync env-snapshot behavior (round-3 chase): process.env mutations silently dropped without explicit env; fixed in workspace-root lib + byte-synced grill mirror.
- One source-token test that survived the RP-34 executed-path migration (G-02): now executes the real retry path.

Re-grills append below per grill lifecycle.
