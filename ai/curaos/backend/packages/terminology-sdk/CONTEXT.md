# CONTEXT - @curaos/terminology-sdk

## Current State

`@curaos/terminology-sdk` is a generated SDK package for terminology contracts. It emits REST and event surfaces from service contracts and verifies committed output with drift tests.

## Integration Notes

- Source service: `backend/services/terminology-service`
- SDK package: `backend/packages/terminology-sdk`
- Contract source: `backend/services/terminology-service/specs/terminology.tsp`
- Local OpenAPI config: `backend/packages/terminology-sdk/openapi-ts.tsconfig.json`

## Must Not Break

- `backend/packages/terminology-sdk/openapi-ts.config.ts`
- `backend/packages/terminology-sdk/openapi-ts.tsconfig.json`
- `backend/packages/terminology-sdk/scripts/generate.mjs`
- `backend/packages/terminology-sdk/test/drift.test.ts`
