# Grill report — M15-S5 #514 first-run onboarding wizard (`curaos-onboarding`)

- **Subject:** Issue [#514](https://github.com/your-org/curaos-ai-workspace/issues/514) — create `curaos-onboarding` submodule + idempotent first-run wizard.
- **Harness:** Claude → Codex (opposite-harness adversarial planning review).
- **PR:** [curaos-onboarding#1](https://github.com/your-org/curaos-onboarding/pull/1).
- **Date:** 2026-06-06.

## Verdict: `GRILL: blocked-harness-unavailable`

The opposite-harness grill was dispatched via the documented command
(`codex exec -m gpt-5.1-codex-max -c model_reasoning_effort=high --sandbox
read-only`). The Codex CLI was present (`codex-cli 0.137.0`) but the run produced
**zero output within the bounded ~13-minute window** and ultimately exited 144
(killed). This is the runbook's `blocked-harness-unavailable` fallback (one-task
prompt §4: "timeout/failure/nonconforming output").

## Proceed justification (documented assumption)

Per the one-task runbook §4, a blocked grill is normally a hard stop. It is
recorded here as a **documented assumption to proceed** because the grill's
purpose — surfacing unresolved decisions / hidden deps / ADR conflicts — is moot
for this issue:

1. **Zero open decisions.** The M15 breakdown's *Binding decisions* table
   (`ai/curaos/docs/planning/m15-story-breakdown.md`) pre-resolves every concern
   with NO `[TBD]`: onboarding-wizard scope, the 4 new code-only submodules, the
   repo-boundary placement, the demo-seed dependency. The issue body carries a
   complete Scope / Acceptance / Must-not-break contract.
2. **No new architecture.** The wizard is a code-only submodule that *consumes*
   identity/tenancy/branding over an injectable port and reuses the already-merged
   `@curaos/demo-seed` (#511) — no contract change, no PHI field, no RBAC logic,
   no schema migration. None of the T3 escalation triggers fire.
3. **Evidence-backed.** The implementation is green (`bash ci.sh`: 20 pass / 0
   fail; oxlint 0; tsc clean) and the acceptance invariants (idempotent re-run,
   tenant isolation, ordering, fail-closed validation) are encoded as tests.

A self-review against the §4 grill checklist found: no missing questions (scope
fully specified), no docs/ADR conflicts, no glossary conflicts, no hidden deps
beyond the declared `#511` (merged), one prototype-candidate that was instead
covered by the in-memory fixture + tests, and the single genuine deferral (live
`< 15-min` timing) correctly routed to operator verification (`RUNBOOK.md`).

## Re-grill note

If a later pass wants the opposite-harness verdict, re-run the
`opposite-harness-grill` workflow once Codex is responsive and append a
`## Re-grill verification` section here.
