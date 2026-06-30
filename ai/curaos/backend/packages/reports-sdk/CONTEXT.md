# `@curaos/reports-sdk` — agent context

## Why this package exists (M10 #282, Epic #24)

Any consumer service needs a typed client for `reports-service` without hand-writing
HTTP/Kafka plumbing. ADR-0103 (TypeSpec-first, RESOLVED DA13) + ADR-0201 §2.9:
the service's `.tsp` REST contract + AsyncAPI event contract are the source of
truth; the SDK is generated from them. Generated from the recipe `@curaos/notify-sdk`
(#278) established for the M10 SDK class (#278-284).

## Generation recipe (the reusable pattern)

```
reports-service/specs/reports.tsp
  --(tsp compile, @typespec/openapi3)-->  reports-service OpenAPI 3.1
  --(@hey-api/openapi-ts + @hey-api/client-fetch)-->  src/rest/  (REST client)

reports-service/specs/reports.asyncapi.yaml
  --(@asyncapi/parser + json-schema-to-typescript)-->  src/events.gen.ts  (event types)
```

`scripts/generate.mjs` runs the steps in order — `bun run generate` is the single
regenerate command.

## Public surface

| Export | Purpose |
|---|---|
| `reportssHealth`, `reportssProtectedProbe`, `reportssProtectedWrite`, `reportssRead` | Typed REST operation functions |
| `client` | The fetch client instance; `client.setConfig({ baseUrl })` / `createClient()` to target a service |
| `*Data` / `*Responses` / `*Errors` + request/response types | REST request/response types |
| event payload + `EventHeaders` wire-types (snake_case) | event-consumer surface (when the AsyncAPI defines events) |

## Integration map

- **Producer of types** — none (leaf consumer package).
- **Consumes (build-time)** — `reports-service/specs/reports.tsp` + `reports-service/specs/reports.asyncapi.yaml`
  (contracts) → generated into `src/`.
- **Consumed by** — downstream services + the M10 capstone integration test
  (#285); any consumer that calls reports-service or consumes its events.
- **Must-not-break files** — `reports-service/specs/*` (the contracts). A change there
  requires `bun run generate` here in the same PR.
- **Gates with package-specific handling** —
  - `tsconfig.json` relaxes `exactOptionalPropertyTypes` + `noUnusedLocals/Parameters`
    for THIS package (the @hey-api generated runtime isn't authored to those
    strict flags). Type safety (strict/strictNullChecks/noImplicitAny) stays on.
  - `.dependency-cruiser.cjs` carve-out for `backend/packages/reports-sdk/src/rest/(client|core)/*.gen.ts`
    — the @hey-api client has a vendor-internal `types.gen ↔ utils.gen` cycle.

## Verdaccio publish

`publishConfig.registry: http://localhost:4873` + `access: restricted`; `.npmrc`
scopes `@curaos`. `files: ["dist"]` publishes the built output only. Live
`@curaos/*` publish requires a provisioned `curaos-ci`/`curaos-admin` Verdaccio
account (htpasswd, out-of-band — blocked on
[#307](https://github.com/your-org/curaos-ai-workspace/issues/307)).
Validated here via `bun pm pack` + `bun publish --dry-run` + an external packed-tarball
install smoke (zero consumer code).

## Hard rules

- Generated `src/` is committed; never hand-edit it. Edit the contract + regen.
- `dist/` is gitignored — build artifact, never committed.
- Recipe changes that apply to all SDKs feed back per [[curaos-generator-evolution-rule]].
