---
name: curaos-deploy
description: "CuraOS deliberate release pipeline - CI gate → semver tag → BuildKit image build (digest-pinned bases) → cosign sign + CycloneDX SBOM attest → publish to GHCR (images) + Verdaccio (packages) + Zarf image-list for the bundle host. workflow_dispatch-only; local `just ci` is the merge gate."
tags: [release, cicd, supply-chain, cosign, sbom, ghcr, verdaccio, zarf, m15]
language: Bash + TypeScript (Bun test)
framework: none (shell pipeline + bun:test)
infrastructure: GHCR (ghcr.io/cura-care-oriented-stack), Verdaccio (npm), Zarf bundle host
tooling: cosign, syft (CycloneDX SBOM), BuildKit (docker buildx), Bun, just, shellcheck, Renovate
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/0110-cicd-release.md
  context: ai/curaos/curaos-deploy/CONTEXT.md
  requirements: ai/curaos/curaos-deploy/Requirements.md
  research: ai/curaos/docs/research/2026-06-06-m15-s1-release-pipeline-curaos-deploy.md
  grill: ai/curaos/docs/grills/m15-s1-510-release-pipeline-curaos-deploy.md
parent: ai/curaos/AGENTS.md
---

## Mission

Own the **deliberate** release flow for CuraOS: take a CI-green service at an
explicit semver tag, build a digest-pinned image, sign it + attach a CycloneDX
SBOM with cosign, and publish to GHCR + Verdaccio while emitting a Zarf
image-list the bundle host (Story 3) consumes. The release is invoked manually -
never on push/PR. Code lives in the `curaos-deploy` submodule
(`curaos/curaos-deploy/`); this tree holds the agent docs only.

## Scope boundary (binding)

- This repo ORCHESTRATES; it does NOT re-implement the monorepo's
  reproducible-build (`curaos/tools/build/repro-build.sh`) or offline-verify
  (`curaos/tools/verify/cosign-verify.sh`) contracts. It reuses the same GHCR
  namespace + cosign key + Zarf layout those expect.
- S1 = images (+ SBOM) → GHCR, packages → Verdaccio, emit a Zarf image-list.
- S3 (#512) = the 4-profile signed-bundle layer (`bundles/bundle.sh` +
  `bundles/profiles.yaml` + `bundles/values/` + `lib/bundle-lib.sh`). It is a
  PROFILE OVERLAY on the in-tree umbrella chart + `ops/zarf/zarf.yaml` - it does
  NOT re-author charts (reuse-DRY). Air-gap is Zarf-singular; cloud/on-prem/hybrid
  are helm-rendered. Hybrid is a 2-plane NetBird split (ADR-0213).
- Per [[curaos-repo-boundary-rule]]: the `curaos-deploy` code repo carries CODE +
  README + CHANGELOG + build files ONLY. No ADR links, no workspace references.

## Toolchain Registry

- Local CI gate (merge authority): `just ci` (or `bash ci.sh`) - install →
  shellcheck → pin-guard → typecheck → bun test. No docker required.
- Pin guard: `bash lib/pin-guard.sh` (SHA-pin actions + digest-pin base images).
- Dry-run release: `just release --service <svc> --version vX.Y.Z --dry-run --curaos-root ../curaos`.
- Dry-run bundle set: `just bundle --version vX.Y.Z --profile all --dry-run --curaos-root ../curaos`.
- Mirror check: `bash scripts/check-ai-mirror.sh` (from workspace root).
- Doc graph: `bun scripts/check-doc-graph.js`.

## Judgment Boundaries

- NEVER add `on: push` / `on: pull_request` / `on: schedule` to
  `.github/workflows/release.yml` - it is `workflow_dispatch`-only per
  [[curaos-local-ci-first-rule]].
- NEVER use a floating image tag or a tag-pinned GitHub Action. Every base image
  is `@sha256:<64-hex>`; every Action is SHA-pinned (the pin-guard FAILS otherwise).
- NEVER mask an absent tool with `|| true`. A stage with its tool present that
  errors HARD-FAILS; a genuinely-absent tool emits an explicit `SKIP:` notice in
  a dry-run only.
- NEVER sign with a key outside the `ops/zarf/signing-trust` trust-root for the
  air-gap path (ADR-0211); cloud GHCR uses keyless OIDC.
- NEVER place a PHI/data service or a public IP on the hybrid CONTROL plane - the
  control plane (vendor node) is lean + stateless; PG/PHI/audit/secrets stay on
  the DATA plane (customer node). `assert_hybrid_split` FAILS the build otherwise.
- NEVER re-author the umbrella chart inside `bundles/` - overlay the in-tree chart
  at `<curaos-root>/ops/zarf/charts/curaos-umbrella` ([[curaos-reuse-dry-rule]]).
- NEVER configure MinIO as the object store - SeaweedFS only (ADR-0163 DA13-Q6).
