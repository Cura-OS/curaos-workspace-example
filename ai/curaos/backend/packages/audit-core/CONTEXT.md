# @curaos/audit-core - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/audit-core/`.
- Purpose: audit hash chain primitives used by audit services and compliance projections.
- Risk class: security and compliance.

## Agent Rules

- Keep hash inputs explicit, ordered, and regression-tested.
- Do not silently change chain compatibility.
- Add tests for canonicalization or digest changes.
