# @curaos/connector-sdk - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/connector-sdk/`.
- Purpose: typed connector framework, registry, action props, and OAuth vault seam.
- Provenance: port-adapted from Activepieces concepts under MIT, no source copied.

## Agent Rules

- Store secrets through `@curaos/secrets` seams, never raw connector config.
- Keep connector pieces typed and generator-ingestable.
- Preserve person-consent and organization-automation use cases.
