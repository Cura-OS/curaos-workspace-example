# @curaos/identity-federation - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/identity-federation/`.
- Purpose: provider-neutral federation adapter contracts and SAML primitives.
- Risk class: authentication and authorization.

## Agent Rules

- Fail closed on malformed assertions.
- Keep provider adapters isolated behind typed seams.
- Do not add managed-cloud-only assumptions.
