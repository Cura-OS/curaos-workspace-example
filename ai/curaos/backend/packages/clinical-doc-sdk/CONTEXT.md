# CONTEXT - @curaos/clinical-doc-sdk

## Current State

`@curaos/clinical-doc-sdk` is a generated SDK package for clinical document contracts. It emits REST and event surfaces from service contracts and verifies committed output with drift tests.

## Integration Notes

- Source service: `backend/services/clinical-doc-service`
- SDK package: `backend/packages/clinical-doc-sdk`
- Contract source: `backend/services/clinical-doc-service/specs/clinical-doc.tsp`
- Local OpenAPI config: `backend/packages/clinical-doc-sdk/openapi-ts.tsconfig.json`

## Must Not Break

- `backend/packages/clinical-doc-sdk/openapi-ts.config.ts`
- `backend/packages/clinical-doc-sdk/openapi-ts.tsconfig.json`
- `backend/packages/clinical-doc-sdk/scripts/generate.mjs`
- `backend/packages/clinical-doc-sdk/test/drift.test.ts`
