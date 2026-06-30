# @curaos/auth-sdk - Agent Context

## Quick facts
- Root path is a stub only; no root `package.json` should exist here.
- Real package home: `curaos/backend/services/identity-service/packages/auth-sdk/`.
- Published workspace name stays `@curaos/auth-sdk`.
- Surface includes the typed identity-service auth client plus JOSE/JWKS/DPoP primitives.

## Key files
- `curaos/backend/services/identity-service/packages/auth-sdk/src/index.ts` - `createAuthClient` and public barrel.
- `curaos/backend/services/identity-service/packages/auth-sdk/src/jose-dpop.ts` - `createJoseJwks`, `jwksPublicView`, `verifyDpopProof`, and replay seam.
- `curaos/backend/services/identity-service/packages/auth-sdk/test/auth-client.test.ts` - generated client behavior.
- `curaos/backend/services/identity-service/packages/auth-sdk/test/jose-dpop.test.ts` - JOSE/JWKS/DPoP behavior.

## Agent rules
- Do not add `curaos/backend/packages/auth-sdk/package.json`; it duplicates the nested workspace package name.
- Keep `@curaos/auth-sdk` owned by the nested identity-service package unless generator assumptions are changed in the same lane.
- DPoP replay storage must stay caller-provided for production; the in-memory store is test and single-instance only.
- Run package-local build, typecheck, and test plus a root filtered Turbo gate before marking done.
