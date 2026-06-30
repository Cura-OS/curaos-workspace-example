# contract-core-service - Agent Context

## Quick Facts

- Code path: `curaos/backend/services/contract-core-service/`.
- Purpose: neutral contracts, lines, renewals, and parties.
- SDK owner: `backend/packages/contract-sdk`.

## Agent Rules

- Do not rebuild e-sign here; reference `esign-core-service`.
- Use `@curaos/recurrence` for renewal cadence.
- Keep neutral service data free of vertical-only protected records.
- Regenerate SDKs after contract changes.
