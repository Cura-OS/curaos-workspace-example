# personal-crm - Agent Context

## Quick Facts

- Code path: `curaos/frontend/apps/personal-crm/`.
- Purpose: personal CRM workflows over CuraOS UI and API client packages.
- Runtime config: generated `src/env.ts` and deploy-time public config injection.

## Agent Rules

- Do not read `process.env.NEXT_PUBLIC_*` directly in client code.
- Preserve personal, person-centric workflows.
- Generator-owned defects must be fixed in the generator and regenerated.
