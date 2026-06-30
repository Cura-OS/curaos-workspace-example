---
name: ops-manifests
description: Agent mirror for Kubernetes manifest sources under curaos/ops/manifests.
tags: [ops, manifests, kubernetes]
language: YAML
framework: Kubernetes manifests
infrastructure: Kubernetes, NGINX ingress, k3d
tooling: kubectl, k3d, Bun checks
apis:
  - https://api.example.com/api/v1
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: CONTEXT.md
  requirements: Requirements.md
---

# ops/manifests

## Mission

Kubernetes manifest changes must preserve local-first verification, generated gateway route parity, and no-deploy-before-local-green policy.

## Toolchain Registry

- Validate docs: `bash scripts/check-docs.sh`
- Validate mirror: `bash scripts/check-ai-mirror.sh`
- Validate route contracts: `bun run gen:api-gateway`
- Inspect live manifests: `kubectl get deploy -n curaos`

## Judgment Boundaries

- Do not deploy before local green verification.
- Preserve generated gateway route parity with `DOMAIN_ROUTE_MAP`.
- Use the live ops substrate rule before declaring live infrastructure blocked.
