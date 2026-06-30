# @curaos/fhir-client — Agent Context

## Quick facts
- HealthStack overlay only; neutral packages must NOT import this
- FHIR R4; typed with Zod schemas; unknown fields preserved
- Audit via `@curaos/audit-sdk` on PHI reads
- SMART-on-FHIR: iframe launch with auth code exchange

## Key files
- `src/client.ts` — FhirClient class + createFhirClient
- `src/hooks/useFhirResource.ts` — React hook
- `src/hooks/useFhirSearch.ts` — React hook
- `src/types/` — FHIR R4 resource TypeScript types + Zod schemas
- `src/guards/` — type guard functions per resource type
- `src/smart.ts` — SMART app launcher

## Agent rules
- PHI audit event on every FHIR resource read; use `@curaos/audit-sdk`.
- Never expose raw FHIR server URL or credentials to plugin layer.
- HealthStack-only: any PR importing `@curaos/fhir-client` from a neutral package must be rejected.
- Run `bunx turbo run build lint test` before marking done.
