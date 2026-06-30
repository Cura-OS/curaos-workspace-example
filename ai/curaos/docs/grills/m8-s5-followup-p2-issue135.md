# M8-S5 Followup P2 Issue 135 — Adversarial Review

Issue: [curaos-ai-workspace#135](https://github.com/your-org/curaos-ai-workspace/issues/135)

Reviewer: Claude Code, `claude-opus-4-7`, high effort, read-only.

## Verdict

APPROVE-WITH-CONDITIONS.

The no-`curl`, PHI-safe logging, and ServiceAccount/RBAC contract work is correct and narrow. Conditions before closeout:

- Populate this grill report file instead of leaving an empty graph node.
- Regenerate and verify `ai/curaos/docs/DOC-GRAPH.md`.
- Keep ServiceAccount Helm helper/codegen emission out of this issue unless a separate generator-evolution lane is opened.
- Document that the runner never logs raw Postgres `message`, `detail`, `hint`, or `query` fields.

## Missing Questions

- ServiceAccount template ownership remains a future decision: per-service chart, umbrella chart helper, or codegen template.
- The PHI sanitizer intentionally redacts raw Postgres message text and retains only safe metadata. Broader HIPAA Safe Harbor identifier recognition in metadata is a future observability/logging concern, not part of this P2 followup.

## Docs / ADR Conflicts

- New `ai/curaos/ops/migrations/` docs require doc-graph regeneration and `bash scripts/check-docs.sh`.
- The Role/RoleBinding stance is now consistent across README, `CONTEXT.md`, and `Requirements.md`: none is required unless a future issue adds Kubernetes API access.

## Glossary Conflicts

- "sanitize" is the exported runner behavior; "scrub" is the low-level action for sensitive string values. Current names are acceptable but should stay stable.
- "migration-runner" refers to the base image and module; "migrator" refers to the per-service Job/container/ServiceAccount.

## Hidden Dependencies / Subtasks

- ServiceAccount YAML emission belongs in a future Helm/codegen lane if repeated chart authoring creates drift.
- Broader PHI recognition beyond raw message suppression and email/SSN/ISO date metadata scrubbing belongs in a future shared observability/logging policy lane.
- No Zarf layer numbering, runbook, codegen Dockerfile flag, or identity-service change is needed for #135.

## Prototype Candidates

- Future: Helm helper or codegen template for the migrator ServiceAccount.
- Future: synthetic PHI corpus for shared logging scrub coverage.

## User-Escalation Candidates

None for this issue. The sanitizer now suppresses raw Postgres message text; broader shared logging coverage can be split later.

## Recommended Answers From Docs / Code

- No `curl` dependency: verified. `migration-runner.Dockerfile` installs `postgresql16-client`, `tini`, and `ca-certificates`; readiness uses `pg_isready` only.
- PHI-safe `pg` error logging: verified for issue scope. `run-migrations.ts` logs `sanitizePostgresErrorForLog(err)`, which replaces raw `message` with a redacted marker, drops `detail`, `hint`, and `query`, and redacts email-, SSN-, and ISO-date-like values from retained metadata fields.
- ServiceAccount/RBAC: verified. `job-template.yaml` sets pod-level `automountServiceAccountToken: false`; README and mirror docs require ServiceAccount-level `automountServiceAccountToken: false` and state no Role/RoleBinding is needed because the Job does not call the Kubernetes API.
