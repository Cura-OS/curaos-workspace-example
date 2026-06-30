# @curaos/accounting-sdk - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/accounting-sdk/`.
- Purpose: typed REST client and event wire types generated from accounting contracts.
- Contract owner: `accounting-core-service`.

## Agent Rules

- Do not hand-write transport logic when a contract or generator can express it.
- Keep SDK types backward-compatible unless the owning contract version changes.
- Run focused typecheck and build before reporting done.
