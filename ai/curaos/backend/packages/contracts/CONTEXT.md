# @curaos/contracts - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/contracts/`.
- Purpose: reusable import-job mold and CSV adapter contracts.
- Provenance: port-adapted concepts from WorldVistA health-data-standards under Apache-2.0, no source copied.

## Agent Rules

- Keep failed-row quarantine reasoned and inspectable.
- Preserve seen, merged, and needs-review counts.
- Do not make runtime demo data mock-only; imports must support persisted records.
