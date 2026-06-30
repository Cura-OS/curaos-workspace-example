---
name: curaos-ops-zarf
description: "CuraOS air-gap Zarf bundle layout - single tar.zst per release; 10 layered components per ADR-0164; multi-arch (amd64 + arm64); CNPG + Citus + SeaweedFS backup; K3s w/ Cilium-safe flags."
tags: [air-gap, packaging, zarf, ops, infrastructure, m8]
language: YAML (Zarf v0.76+ schema)
framework: Zarf 0.76
infrastructure: K3s, Cilium, CNPG (Citus PG 17), pgBouncer, Redpanda, Harbor (optional), GlitchTip, Pyrra, SeaweedFS S3
tooling: Zarf, Helm, cosign, syft (SBOM), BuildKit, Buildah, Renovate
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/0164-zarf-bundle-layout.md
  context: ai/curaos/ops/zarf/CONTEXT.md
  requirements: ai/curaos/ops/zarf/Requirements.md
---

## Mission

Pin the layout of the singular CuraOS air-gap release artifact
(`curaos-vX.Y.Z.tar.zst`) so every milestone story (M8-S1…S7, future M9+) attaches to
the same component shape. One artifact, one install command, reproducible builds, offline
cosign verification. Multi-arch (linux/amd64 + linux/arm64).

## Toolchain Registry

- Schema validate: `bunx ajv compile -s https://raw.githubusercontent.com/zarf-dev/zarf/v0.76.0/zarf.schema.json -d curaos/ops/zarf/zarf.yaml --strict=false`
- Deploy-order guard: `bash curaos/tools/build/zarf-deploy-order-check.sh`
- Digest placeholder guard: `bash curaos/tools/build/zarf-digest-check.sh` (warns) / `--strict` (M8-S4+)
- Mirror check: `bash scripts/check-ai-mirror.sh`
- Doc graph check: `bun scripts/check-doc-graph.js`
- Bundle build (Zarf binary required; M8-S4 onward): `zarf package create curaos/ops/zarf --confirm --max-package-size 4000 --skip-sbom=false --flavor amd64 -o /tmp`
- CI closure: all four checks above MUST exit 0 (digest-check `--strict` from M8-S4).

## Judgment Boundaries

- NEVER raise `metadata.architecture` to anything other than `multi` - per [[curaos-image-build-rule]] §D3.
- NEVER reorder the 10 components without updating ADR-0164 §2.1 + `zarf-deploy-order-check.sh` in the same commit.
- NEVER default `BACKUP_S3_ENDPOINT` to MinIO - AGPLv3 risk per [[curaos-postgres-rule]] §Q6. SeaweedFS only.
- NEVER drop K3s flags (`--flannel-backend=none --disable-network-policy --disable-kube-proxy …`) from `curaos-k3s-init` per [[curaos-cni-rule]] §35-44.
- NEVER ship CuraOS-owned images with `<digest>` placeholders in a release tag - digest-check `--strict` is the gate.
- NEVER add a component without updating `component-budget.md` multi-arch totals + ADR-0164 §2.3.
- ASK before adding a Helm chart not already in this layout (charts increase bundle size + supply-chain surface).
- ASK before bumping Zarf schema version (v0.76 → v1.x) - `requires:` field becomes available; layout migrates.
- ALWAYS run all four CI guards before claiming the layout is buildable.
- ALWAYS update `ai/curaos/docs/adr/RESOLUTION-MAP.md` when this layout amends a prior ADR question.

## Context Map

```yaml
mirror_target: curaos/ops/zarf/
sibling_modules:
  workflow-bpm: backend/services/workflow-core-service
  identity: backend/services/identity-service
related_adrs:
  - ai/curaos/docs/adr/0164-zarf-bundle-layout.md
  - ai/curaos/docs/adr/0158-air-gap-bundle-sla.md
  - ai/curaos/docs/adr/0109-containers-orchestration.md
binding_rules:
  - ai/rules/curaos_airgap_rule.md
  - ai/rules/curaos_image_build_rule.md
  - ai/rules/curaos_version_pinning_rule.md
  - ai/rules/curaos_cni_rule.md
  - ai/rules/curaos_postgres_rule.md
ci_guards:
  - curaos/tools/build/zarf-digest-check.sh
  - curaos/tools/build/zarf-deploy-order-check.sh
notable: # see CONTEXT.md 'Open items' for canonical file-state truth
  values/cilium.yaml: real (kubeProxyReplacement=true)
  assets/cosign.pub: real keyed pub (M8-S4 #86 - sigstore-policy-controller + ClusterImagePolicy)
  assets/k3s-install.sh: STUB (M8-S4 ships pinned installer)
  manifests/migration-jobs.yaml: real stub manifest (M8-S2 landed)
  charts/curaos-umbrella/Chart.yaml: STUB (M8-S3 wires deps)
  charts/glitchtip/Chart.yaml: M8-S3 stub
```

## Personas Registry

- bundle-author: layout edits + budget recompute (sonnet tier)
- security-reviewer: cosign / SBOM / supply-chain audit (opus tier)
- ops-reviewer: install-flow + rollback sanity (sonnet tier)
