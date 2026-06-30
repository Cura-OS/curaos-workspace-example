# identity-service §8 - PR + Commit Conventions

- Conventional commits: `feat(identity): add FIDO2 step-up MFA`, `fix(identity): correct DPoP proof validation`.
- Scope: `identity` for this service.
- Breaking API changes: `feat(identity)!: ...` + update TypeSpec + bump major in TypeSpec version tag.
- Every PR must have:
  - Vitest unit + integration tests for all changed paths.
  - ESLint clean (`bun run lint` exit 0).
  - Audit emission verified in integration test.
  - HIPAA guard tests if touching auth or session paths.

Workspace-level conventions: see [[curaos-repo-conventions-rule]] for Conventional Commits format + branch naming + PR template.
