# subscription-core-service - Agent Context

## Quick Facts

- Code path: `curaos/backend/services/subscription-core-service/`.
- Purpose: neutral Subscription and Plan resources.
- SDK owner: `backend/packages/subscription-sdk`.

## Agent Rules

- Use `@curaos/recurrence` for subscription cadence.
- Keep billing-specific policy in billing, commerce, or overlay services unless generic.
- Regenerate SDKs after TypeSpec changes.
- Verify migrations from zero.
