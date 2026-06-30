# CONTEXT - @curaos/scheduling-sdk

## Current State

`@curaos/scheduling-sdk` is a generated SDK package for scheduling contracts. It emits REST and event surfaces from service contracts and verifies committed output with drift tests.

## Integration Notes

- Source service: `backend/services/scheduling-service`
- SDK package: `backend/packages/scheduling-sdk`
- Contract source: `backend/services/scheduling-service/specs/scheduling.tsp`
- Local OpenAPI config: `backend/packages/scheduling-sdk/openapi-ts.tsconfig.json`

## Must Not Break

- `backend/packages/scheduling-sdk/openapi-ts.config.ts`
- `backend/packages/scheduling-sdk/openapi-ts.tsconfig.json`
- `backend/packages/scheduling-sdk/scripts/generate.mjs`
- `backend/packages/scheduling-sdk/test/drift.test.ts`
