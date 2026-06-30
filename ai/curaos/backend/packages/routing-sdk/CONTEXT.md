# @curaos/routing-sdk - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/routing-sdk/`.
- Purpose: provider-neutral routing seams and Valhalla mapping.
- Deployment constraint: self-hosted and air-gap viable.

## Agent Rules

- Keep provider-specific code behind adapters.
- Avoid managed routing lock-in.
- Normalize route results into stable CuraOS types.
