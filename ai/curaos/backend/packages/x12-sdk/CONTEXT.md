# @curaos/x12-sdk - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/x12-sdk/`.
- Purpose: 837P, 837I, 835, 270, 271, envelopes, and paper form rendering.
- Money model: integer minor units.
- Risk class: PHI and revenue-cycle correctness.

## Agent Rules

- Treat claim and eligibility payloads as PHI-capable.
- Keep conformance fixtures separate from copied source.
- Preserve canonical Claim shape as the single source for EDI and paper forms.
