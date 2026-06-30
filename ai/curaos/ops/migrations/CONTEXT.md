# Migration Runner — Context

## Current Contract

`curaos/ops/migrations/` owns the shared base image, runner entrypoint, Helm Job template, and forward-only migration policy used by schema-bearing CuraOS services.

Runtime behavior:
- Per-service overlay images extend `migration-runner.Dockerfile`.
- `wait-for-postgres.sh` uses `pg_isready`; the runner has no `curl` dependency.
- `run-migrations.ts` connects only to `DATABASE_URL`, serializes per-service migrations with a Postgres advisory lock, and logs sanitized failure metadata.
- `job-template.yaml` runs as a Helm pre-install/pre-upgrade Job with `serviceAccountName: "{{ .Values.service.name }}-migrator"` and `automountServiceAccountToken: false`.

## Integration Points

Produced artifacts:
- `ghcr.io/cura-care-oriented-stack/curaos-migration-runner:<version>` base image.
- Per-service `*-migrator:<version>` overlay images.
- Helm migration Jobs stamped from `job-template.yaml`.

Consumers:
- Service subcharts under `curaos/ops/zarf/charts/curaos-umbrella/` (per-service entries land in M8-S3).
- Zarf migration image bundles under `curaos/ops/zarf/`.
- Service-owned `drizzle/migrations/` directories.

Must not break:
- `curaos/ops/migrations/migration-runner.Dockerfile`
- `curaos/ops/migrations/run-migrations.ts`
- `curaos/ops/migrations/scripts/wait-for-postgres.sh`
- `curaos/ops/migrations/job-template.yaml`
- `curaos/ops/migrations/forward-only-policy.md`

## Operator Contract

Service charts must provide a ServiceAccount named `{{ .Values.service.name }}-migrator` with `automountServiceAccountToken: false`. No Role or RoleBinding is required because the migration Job does not call the Kubernetes API.
