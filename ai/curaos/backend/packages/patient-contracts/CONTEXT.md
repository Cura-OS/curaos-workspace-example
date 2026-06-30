# `@curaos/patient-contracts` — agent context

> Mirror of `curaos/backend/packages/patient-contracts/`. M7-S5 first
> publish (v0.1.0). M9 codegen replaces the by-hand emission.

## Why this package exists (M7 D4)

Per `ai/curaos/docs/m7-user-decisions.md` D4 (hybrid):

> Compile-time: `@curaos/patient-contracts` package exports
> `patientBaseSchema` (JSON Schema Draft-07). Generated from
> `patient-core-service` Drizzle introspection via M6 codegen + published
> to Verdaccio. Runtime: `GET /api/v1/contracts/patient` returns merged
> schema. Builder boot: imports base synchronously, re-renders on
> overlay fetch resolve. Degraded mode: base + banner if fetch fails.

Without the compile-time base, builder-studio CI would block on a
running healthstack API. With it, the form mounts immediately and the
runtime overlay is purely additive.

## Public surface

| Export | Purpose |
|---|---|
| `patientBaseSchema` | Draft-07 schema for `core.patients` (no PHI) |
| `PATIENT_BASE_SCHEMA_VERSION` | Schema version (`v1`) — bumps trigger a new export |
| `PATIENT_BASE_REQUIRED_FIELDS` | `['partyId', 'mrn', 'tenantId']` — drives `ui:order` |
| `PATIENT_BASE_FIELDS` | All base field names — drift gate input |
| `PatientBase` | TS form-input shape |
| `mergePatientSchema(envelope)` | Base + overlay → merged Draft-07 |
| `findOverlayMissingBaseFields(overlay)` | Drift gate; empty list = pass |
| `buildOverlaySchema(props, required?)` | Server helper to compose an overlay that never narrows base |
| `PatientContractEnvelope` / `MergedPatientSchema` | Wire + render types |

## Consumers

- **`@curaos/builder-studio`** — imports `patientBaseSchema` at boot
  (`src/components/PatientForm/PatientFormPage.tsx`), fetches overlay on
  mount, merges with `mergePatientSchema`.
- **`@curaos/healthstack-patient-service`** — uses
  `buildOverlaySchema(HEALTHSTACK_OVERLAY_PROPERTIES)` in
  `src/contracts/patient-contract.builder.ts` so the response envelope
  always passes the drift gate.

## Hard rules

1. **No PHI columns may be added here.** PHI columns live in the
   overlay (`healthstack-patient-service/src/contracts/patient-contract.builder.ts`).
2. **Drizzle column rename → same-PR mirror update.** Any rename in
   `patient-core-service/src/db/schema.ts` MUST update `patient-base-schema.ts`
   in the same PR (Definition of Done #9).
3. **Snapshot test locks shape.** The package owns the canonical shape
   until M9 codegen lands; the M9 codegen MUST emit a structurally
   identical schema (snapshot test will catch divergence).

## M9 transition plan

When M9 (regen cluster) lands:

1. Move the hand-written constants to a Handlebars template under
   `curaos/tools/codegen/templates/contracts-package/`.
2. Codegen reads `core.patients` Drizzle introspection + emits the same
   `src/patient-base-schema.ts` shape.
3. Snapshot test stays in this package's `test/` dir.
4. M11 codegen emits analogous `@curaos/personal-patient-contracts` +
   `@curaos/business-patient-contracts` packages via the same template.

## Wire format (runtime envelope)

```json
{
  "version": "v1",
  "base": { "$schema": "...", "$id": ".../patient/base/v1.json", "...": "..." },
  "overlay": { "$schema": "...", "title": "patient (base + overlay)", "...": "..." }
}
```

## Tests

- `test/patient-base-schema.test.ts` — snapshot invariants (PHI-free,
  required-field set, UUID + MRN patterns, readOnly flags, schema
  version).
- `test/merge.test.ts` — merge helper invariants (base column shape
  wins on collision, drift gate true-positives, dedup of `required`).

100% line + func coverage as of M7-S5.

## Versioning + publish (M7-S5.3)

`@curaos/patient-contracts` is **hand-crafted** (not codegen-emitted in M7;
the M9 codegen will replace this — see [[curaos-speed-patterns-rule]] §generator-evolution).
Publish target: internal **Verdaccio** registry (`http://localhost:4873`
by default; CI override via `vars.VERDACCIO_REGISTRY_URL`). Public npm
publish is rejected by the workflow guard.

### Manifest contract

`backend/packages/patient-contracts/package.json` MUST keep:

- `private: false`
- `publishConfig.access: "restricted"` (matches M2 manifest validator)
- `publishConfig.registry: "http://localhost:4873"` (workflow overrides
  via `--registry` flag + `.npmrc`)
- `type: "commonjs"` + `main: "./dist/index.js"` + `types: "./dist/index.d.ts"`
- `files: ["dist"]`
- `packageManager: "bun@1.3.14"`

### Bump version

```bash
# from repo root
cd backend/packages/patient-contracts

# pick one — semver per [[curaos-version-pinning-rule]]
bun pm version patch    # 0.1.0 → 0.1.1 (bug fix, no schema shape change)
bun pm version minor    # 0.1.x → 0.2.0 (additive field, snapshot still passes)
bun pm version major    # 0.x.y → 1.0.0 (breaking — bumps PATIENT_BASE_SCHEMA_VERSION)

# rebuild + verify
cd ../../..
bun run --filter @curaos/patient-contracts build
bun run --filter @curaos/patient-contracts test
```

> Major bumps require updating `PATIENT_BASE_SCHEMA_VERSION` in
> `src/patient-base-schema.ts` AND the snapshot test fixture in
> `test/patient-base-schema.test.ts`. Drizzle column renames in
> `patient-core-service` follow the same-PR mirror rule (Hard rules §2).

### Publish locally (manual)

Verdaccio must be running first:

```bash
docker compose -f ops/dev/verdaccio/docker-compose.yml up -d
# provision a publisher (one-time setup)
docker exec -it curaos-verdaccio sh -c 'htpasswd -B /verdaccio/conf/htpasswd curaos-ci'
# login + token (writes to ~/.npmrc)
npm login --registry http://localhost:4873 --auth-type=legacy
```

Then publish:

```bash
cd backend/packages/patient-contracts

# dry-run (no network write)
bun publish --dry-run --registry http://localhost:4873

# real publish
bun publish --registry http://localhost:4873
```

Override registry via `VERDACCIO_URL` env (CI uses
`vars.VERDACCIO_REGISTRY_URL`):

```bash
bun publish --registry "${VERDACCIO_URL:-http://localhost:4873}"
```

### Publish via CI

GitHub Actions workflow:
[`curaos/.github/workflows/publish-patient-contracts.yml`](../../../../../curaos/.github/workflows/publish-patient-contracts.yml).

- Trigger: **`workflow_dispatch` only** (per M1 user directive in
  [[curaos-roadmap-workflow-rule]] — no auto-publish on merge).
- Inputs: `version`, `registry-url`, `tag`, `dry-run`.
- Required secrets: `VERDACCIO_TOKEN` (for non-dry-run only).
- Required vars: `VERDACCIO_REGISTRY_URL` (approved registry; defaults
  to `http://localhost:4873` if unset).
- Steps: build → test → typecheck → registry guard (rejects npmjs.org) →
  pin manifest version → `bun publish` → smoke-install from registry.

### Verify from outside the workspace

After publishing, confirm a standalone `bun add` resolves clean (no
workspace symlink needed):

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
printf '{"type":"module","private":true}\n' > package.json
printf '@curaos:registry=http://localhost:4873\n' > .npmrc
bun add --exact @curaos/patient-contracts@0.1.0
node -e "const m = require('@curaos/patient-contracts'); console.log(Object.keys(m));"
```

Expected output:

```
[ 'patientBaseSchema', 'PATIENT_BASE_SCHEMA_VERSION', 'PATIENT_BASE_REQUIRED_FIELDS', 'PATIENT_BASE_FIELDS', 'mergePatientSchema', 'findOverlayMissingBaseFields', 'buildOverlaySchema' ]
```

### Registry write access

- Local: any user provisioned in `curaos/ops/dev/verdaccio/htpasswd`
  (commit the bcrypt hash via `htpasswd -B`, not a real password).
- CI: `curaos-ci` token stored as repo secret `VERDACCIO_TOKEN`.
- `config.yaml` allow-list: `curaos-ci` + `curaos-admin` only (see
  `ops/dev/verdaccio/config.yaml` packages section). Add other
  publishers there + via htpasswd; never grant `$all`.

### Known limitations (M7-S5.3 closeout)

- htpasswd starts empty by design — first publisher must provision a
  user. Documented in `ops/dev/verdaccio/htpasswd` header comment.
- The workflow is `workflow_dispatch`-only by user directive; an
  auto-publish-on-main job is intentionally NOT shipped in M7 and will
  revisit once M1 auto-publish gate lifts (see
  [[curaos-roadmap-workflow-rule]]).
- M9 codegen replaces the hand-crafted manifest. When that lands the
  publish workflow stays the same — only the source shape moves into a
  Handlebars template under `tools/codegen/templates/contracts-package/`.
