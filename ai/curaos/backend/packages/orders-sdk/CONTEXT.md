# CONTEXT - @curaos/orders-sdk

## Current State

`@curaos/orders-sdk` is a generated SDK package for orders contracts. It emits REST and event surfaces from service contracts and verifies committed output with drift tests.

## Integration Notes

- Source service: `backend/services/orders-service`
- SDK package: `backend/packages/orders-sdk`
- Contract source: `backend/services/orders-service/specs/orders.tsp`
- Local OpenAPI config: `backend/packages/orders-sdk/openapi-ts.tsconfig.json`

## Must Not Break

- `backend/packages/orders-sdk/openapi-ts.config.ts`
- `backend/packages/orders-sdk/openapi-ts.tsconfig.json`
- `backend/packages/orders-sdk/scripts/generate.mjs`
- `backend/packages/orders-sdk/test/drift.test.ts`
