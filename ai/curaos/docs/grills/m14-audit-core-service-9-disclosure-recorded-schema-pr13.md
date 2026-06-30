# M14 audit-core-service#9 PR13 opposite-harness grill

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe failed","evidence":"harness-probe failed"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 20000

Subject: `m14 audit-core-service 9 disclosure-recorded schema`

The committed `opposite-harness-grill` workflow (`wf_8669ed27-875`) failed fast
before an adversarial review could run because the Claude opposite-harness probe
was unavailable. No CodeRabbit-only or same-harness fallback should be treated as
a completed opposite-harness grill for this issue.

## Native fallback re-grill verification

GRILL: opposite-harness
GRILL-HARNESS: claude
GRILL-AGENT: claude-cli-opus-high
GRILL-TIMEOUT-MS: 600000

The workflow probe produced a false unavailable result: manual probe showed
Claude Code `2.1.162` at `/Users/dev/.local/bin/claude`. Codex therefore ran a
bounded read-only native fallback re-grill with `claude -p --model opus
--effort high` after the implementation was tightened.

Fix audit before re-grill:

- RED 1: the new tests failed because `DISCLOSURE_RECORDED_EVENT`,
  `DisclosureRecordedEventSchema`, and the package-barrel exports did not exist.
  Commit `905324c` added the schema, const, inferred type, and exports.
- RED 2: the Claude grill found PHI-like value smuggling through reference-only
  `subject_ref`, `purpose`, and `request_ref`. Commit `905324c` tightened those
  reference fields and kept recipient name/address as required accounting fields
  instead of treating recipient identity as neutral-storage PHI leakage.
- Verification before PASS: manual probe confirmed Claude Code `2.1.162`, the
  bounded native fallback used `claude -p --model opus --effort high`, and the
  focused test showed the reference-field PHI rejection case passing.

VERDICT: PASS

Acceptance verified:

- `DISCLOSURE_RECORDED_EVENT` matches `curaos.healthstack.disclosure.recorded.v1`.
- All 13 fields from `ai/curaos/docs/research/m14-compliance-prereqs.md` are present.
- `subject_ref`, `purpose`, `legal_basis`, `request_ref`, and `phi_description`
  reject DOB/SSN/"First Last" PHI-like values.
- `recipient_name` and `recipient_address` remain required HIPAA accounting
  recipient fields and are intentionally exempt from the personal-name heuristic.
- Tests cover barrel export, required fields, PHI-like rejections, nullable
  recipient/request fields, strict unknown-key rejection, and invalid datetime.
- Mirror docs record the field list, scan behavior, and recipient-field rationale.

Remaining findings: none.
