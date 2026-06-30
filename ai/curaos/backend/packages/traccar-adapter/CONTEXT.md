# @curaos/traccar-adapter - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/traccar-adapter/`.
- Purpose: normalize Traccar devices, positions, and events into CuraOS fleet shapes.
- Boundary: adapter only, not fleet domain ownership.

## Agent Rules

- Keep Traccar-specific details behind the adapter seam.
- Validate configuration before use.
- Preserve deterministic normalization tests.
