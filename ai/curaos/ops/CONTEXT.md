# Agent — Ops

## Mission
Coordinate infrastructure automation so CuraOS can be deployed repeatably across local, on-prem, and hybrid environments while enabling or disabling HealthStack, EducationStack, and ERP overlays through configuration.

## Sub-areas

| Child | Path | Role |
|---|---|---|
| dev | [dev/AGENTS.md](dev/AGENTS.md) | Local-dev k3d cluster, Citus, Verdaccio bootstrap |
| migrations | [migrations/AGENTS.md](migrations/AGENTS.md) | Shared Bun migrator image + Helm Job template + forward-only policy |
| chaos | [chaos/AGENTS.md](chaos/AGENTS.md) | Non-production Chaos Mesh experiment catalog and evidence contract |
| zarf | [zarf/AGENTS.md](zarf/AGENTS.md) | Singular Zarf air-gap bundle (ADR-0164); consumed by all service Helm charts |

## Integration map

- **Producers:** service subcharts under `curaos/ops/zarf/charts/curaos-umbrella/` (per-service entries land in M8-S3); migration images from `curaos/ops/migrations/`; HealthStack PHI live gate manifests under `curaos/ops/zarf/manifests/healthstack-phi-live-gates.yaml`.
- **Consumers:** service Helm charts (via Zarf bundle deploy); `curaos/ops/migrations/job-template.yaml` consumed by each service chart's pre-install hook; `@curaos/healthstack-phi-boundary` consumes namespace-derived `APISIX_GATEWAY_URL` and `PRESIDIO_URL` from `ConfigMap/healthstack-phi-boundary-live-env`.
- **CI:** GitHub Actions workflows under `curaos/.github/workflows/` (e.g. `zarf-package.yml`). Task runner: Bun + Turborepo.

## HealthStack PHI Live Gate

- Research: `ai/curaos/docs/research/2026-06-05-issue-407-apisix-presidio-live-gates.md`.
- Ops files: `curaos/ops/zarf/values/apisix-healthstack-gateway.yaml`, `curaos/ops/zarf/manifests/healthstack-phi-live-gates.yaml`, and `curaos/ops/zarf/zarf.yaml`.
- Data flow: HealthStack FHIR request -> APISIX `healthstack-active-required` plugin -> route sink / future service backend -> Presidio anonymizer URL for egress scrub proof -> PHI-boundary assertions.
- Deploy-time invariant: `APISIX_GATEWAY_URL` and `PRESIDIO_URL` derive from `PHI_BOUNDARY_NAMESPACE`, and Presidio pods run with non-root locked-down pod/container security contexts.
- Must not break: `curaos/backend/packages/healthstack-phi-boundary/**` remains package-owned. Parent ops lanes may expose endpoints and config maps only; package-level live adapters/tests are owned by the package lane.
- Local proof boundary: static tests verify manifest wiring. Live APISIX CRD reconciliation and Presidio HTTP behavior require a deployed staging or local Kubernetes cluster.

## Guardrails
- Keep provisioning stateless and idempotent; surface drift detection and dry-run modes.
- Do not embed business workflows or tenant data in scripts — delegate to services.
- Secrets at deploy time come from Zarf deploy-time variables (`DB_PASSWORD`, cosign keys via `assets/cosign.pub`). Do not hardcode secrets in the repo.
