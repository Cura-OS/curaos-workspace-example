# M2 Package Publishing Workflow

Issue: your-org/curaos#30

## Scope

This workflow publishes the five M2 packages to a Verdaccio-compatible internal registry:

- `@curaos/tenancy`
- `@curaos/audit-sdk`
- `@curaos/event-interceptors`
- `@curaos/providers`
- `@curaos/drizzle-citus-poc`

Public npm publishing is out of scope.

## Local Contract

```bash
docker compose -f ops/dev/verdaccio/docker-compose.yml up -d
bun install --frozen-lockfile
bun test scripts/m2-package-publishing.test.js
tmp_tarballs=$(mktemp -d)
bun scripts/pack-m2-packages.mjs --tarball-dir "$tmp_tarballs" --version 0.2.0
bun scripts/publish-m2-packages.mjs --registry http://localhost:4873 --tarball-dir "$tmp_tarballs" --dry-run
bun scripts/publish-m2-packages.mjs --registry http://localhost:4873 --tarball-dir "$tmp_tarballs" --publish
bun scripts/smoke-m2-packages.mjs --registry http://localhost:4873 --version 0.2.0
```

Real publish requires a named `curaos-ci` or `curaos-admin` Verdaccio user and a token in `.npmrc`. Self-registration is disabled; local operators provision users directly in `ops/dev/verdaccio/htpasswd`.

## GitHub Workflow Contract

`.github/workflows/publish-packages.yml` is manual `workflow_dispatch` only.

Inputs:

- `version`: coordinated semver applied to all five packages in the CI workspace.
- `registry-url`: Verdaccio-compatible registry. Public npm URLs are rejected.
- `tag`: internal npm dist-tag, default `m2`.
- `dry-run`: default true; real publish requires `VERDACCIO_TOKEN` and a registry URL matching the approved `VERDACCIO_REGISTRY_URL` repository variable. If the variable is unset, the approved registry defaults to `http://localhost:4873`.
- `sign-artifacts`: default false; true requires `cosign` on the runner.

Data flow:

1. `validate` job installs frozen dependencies, validates metadata, builds all five packages, runs focused tests, runs the live Drizzle/Citus PoC, and typechecks. No registry token or OIDC permission is present.
2. `package` job installs, builds, applies the workflow version, and creates exact package tarballs with Bun `pm pack --ignore-scripts`. No registry token or OIDC permission is present.
3. `sign` job downloads those tarballs and, only when `sign-artifacts=true`, signs the exact tarballs with `cosign sign-blob` and uploads `.sigstore.json` bundles. This is the only job with `id-token: write`.
4. `publish` job downloads the exact tarballs, writes scoped `.npmrc` only inside the publish step, dry-runs or publishes those tarballs, and runs the Verdaccio smoke test for real publishes.
5. Smoke verification installs all five packages into an isolated temp project, then runs Node ESM `import()` and Node CJS `require()` checks.

## Integration Map

Producers:

- `.github/workflows/publish-packages.yml` produces versioned Bun-packed tarballs and optional cosign bundles.
- `scripts/pack-m2-packages.mjs` applies the coordinated version and packs the exact tarballs.
- `scripts/publish-m2-packages.mjs` publishes the tarball set.
- `scripts/smoke-m2-packages.mjs` produces Node import and require registry-consumption evidence.

Consumers:

- `ops/dev/verdaccio/config.yaml` accepts authenticated `@curaos/*` reads and restricts publish to `curaos-ci` / `curaos-admin`.
- M3+ services consume the packages by semver.

Must-not-break files:

- `backend/packages/tenancy/src/index.ts`
- `backend/packages/audit-sdk/src/index.ts`
- `backend/packages/event-interceptors/src/index.ts`
- `backend/packages/providers/src/index.ts`
- `backend/packages/drizzle-citus-poc/src/schema.ts`
- `ops/dev/verdaccio/docker-compose.yml`
- `ops/dev/verdaccio/config.yaml`

## Signing

Cosign is wired as an optional tarball signing step, not assumed infrastructure. When `sign-artifacts=true`, the workflow fails if `cosign` is not present. Signatures cover the same `.tgz` files that publish consumes, and signature bundles are uploaded as workflow artifacts.

## Package Format

The M2 packages publish CommonJS output with explicit `require`, `import`, and `default` export-map entries. Node ESM import of CommonJS packages is supported and verified in the smoke test. Native ESM publishing is deferred until the package source uses Node-compatible ESM emit with explicit `.js` relative specifiers.
