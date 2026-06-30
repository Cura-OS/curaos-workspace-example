# `@curaos/notify-sdk` — agent context

## Why this package exists (M10 #278, Epic #24)

Any consumer service needs a typed client for `notify-service` without
hand-writing HTTP/Kafka plumbing. ADR-0103 (TypeSpec-first, RESOLVED DA13) +
ADR-0201 §2.9: the service's `.tsp` REST contract + AsyncAPI event contract are
the source of truth; the SDK is generated from them. This is the FIRST real SDK
package (auth-sdk/audit-sdk were stubs), so it sets the recipe for the M10 SDK
class (#278-284).

## Generation recipe (the reusable pattern)

```
notify-service/specs/notify.tsp
  --(tsp compile, @typespec/openapi3@1.12.0)-->  notify-service/dist/openapi.yaml (OpenAPI 3.1)
  --(@hey-api/openapi-ts@0.98.1 + @hey-api/client-fetch@0.13.1)-->  src/rest/  (REST client)

notify-service/specs/notify.asyncapi.yaml
  --(@asyncapi/parser@3.6.0 + json-schema-to-typescript@15.0.4)-->  src/events.gen.ts  (event types)
```

`scripts/generate.mjs` runs all three steps in order — `bun run generate` is the
single regenerate command. `openapi-ts.config.ts` resolves the service OpenAPI by
relative path; `scripts/gen-events.mjs` parses the AsyncAPI and compiles each
component schema to TS.

## Public surface

| Export | Purpose |
|---|---|
| `notifysHealth`, `notifysProtectedProbe`, `notifysProtectedWrite`, `notifysRead` | Typed REST operation functions |
| `client` | The fetch client instance; `client.setConfig({ baseUrl })` to target a service |
| `HealthStatus`, `NotifyRead`, `NotifyWriteInput`, `WriteAck`, `ProblemResponse`, `Notifys*Data/Responses/Errors` | REST request/response types |
| `NotifyEventPayload`, `EventHeaders` | snake_case event wire-types for consumers |

## Integration map

- **Producer of types** — none (leaf consumer package).
- **Consumes (build-time)** — `notify-service/specs/notify.tsp` +
  `notify-service/specs/notify.asyncapi.yaml` (contracts) → generated into `src/`.
- **Consumed by** — downstream services + the M10 capstone integration test
  (#285); any consumer that calls notify-service or consumes its events.
- **Must-not-break files** — `notify-service/specs/*` (the contracts). A change
  there requires `bun run generate` here in the same PR.
- **Gates with package-specific handling** —
  - `tsconfig.json` relaxes `exactOptionalPropertyTypes` + `noUnusedLocals/Parameters`
    for THIS package (the @hey-api generated runtime isn't authored to those
    strict flags). Type safety (strict/strictNullChecks/noImplicitAny) stays on.
  - `.dependency-cruiser.cjs` carve-out for `backend/packages/<name>-sdk/src/rest/(client|core)/*.gen.ts`
    — the @hey-api client has a vendor-internal `types.gen ↔ utils.gen` cycle.

## Verdaccio publish

`publishConfig.registry: http://localhost:4873` + `access: restricted`; `.npmrc`
scopes `@curaos`. `files: ["dist"]` publishes the built output only. Live
`@curaos/*` publish requires a provisioned `curaos-ci`/`curaos-admin` Verdaccio
account (htpasswd, out-of-band). Validated here via `bun pm pack` (correct
dist-only tarball) + `bun publish --dry-run` (resolves to localhost:4873) + an
external packed-tarball install smoke (zero consumer code).

## Hard rules

- Generated `src/` is committed; never hand-edit it. Edit the contract + regen.
- `dist/` is gitignored — build artifact, never committed.
- Recipe changes that apply to all SDKs feed back per [[curaos-generator-evolution-rule]].
