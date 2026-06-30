# @curaos/commission-engine - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/commission-engine/`.
- Purpose: calculate commission rate, split, override, and clawback statements.
- Money model: integer minor units only.

## Agent Rules

- Do not introduce floating-point money math.
- Keep calculations deterministic and replayable.
- Add table-driven tests for new commission rules.
