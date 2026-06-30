# @curaos/cds-sdk - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/cds-sdk/`.
- Purpose: injected evaluator contracts for clinical decision support.
- Consumers: HealthStack clinical services.

## Agent Rules

- Keep evaluators provider-neutral and injectable.
- Fail closed on evaluator errors.
- Do not move PHI into neutral packages.
