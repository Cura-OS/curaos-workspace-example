# CONTEXT - @curaos/encounter-sdk

## Current State

`@curaos/encounter-sdk` is a generated SDK package for encounter contracts. It emits REST and event surfaces from service contracts and verifies committed output with drift tests.

## Integration Notes

- Source service: `backend/services/encounter-service`
- SDK package: `backend/packages/encounter-sdk`
- Contract source: `backend/services/encounter-service/specs/encounter.tsp`
- Local OpenAPI config: `backend/packages/encounter-sdk/openapi-ts.tsconfig.json`

## Must Not Break

- `backend/packages/encounter-sdk/openapi-ts.config.ts`
- `backend/packages/encounter-sdk/openapi-ts.tsconfig.json`
- `backend/packages/encounter-sdk/scripts/generate.mjs`
- `backend/packages/encounter-sdk/test/drift.test.ts`
