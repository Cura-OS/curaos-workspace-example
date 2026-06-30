# audit-service §8 - PR + Commit Conventions

- Scope: `audit` for this service.
- Any change to `src/chain/` requires `SECURITY REVIEW` tag in PR title and review from security lead.
- Breaking changes to `CuraOSAuditEvent` schema require Apicurio schema registry version bump + migration plan.
- Every PR: Vitest green + chain integrity test green + ESLint green + 100% coverage on chain/ingestion.

Workspace-level conventions: see [[curaos-repo-conventions-rule]].
