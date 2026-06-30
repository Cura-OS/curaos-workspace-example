---
name: curaos-ops-chaos
description: "CuraOS non-production Chaos Mesh experiment catalog and evidence contract."
tags: [ops, chaos, resilience, slo, m14]
language: YAML
framework: Chaos Mesh 2.8.2
infrastructure: Kubernetes, Zarf, Cilium, Pyrra/OpenSLO, VictoriaMetrics
tooling: kubectl, bun, Chaos Mesh, Zarf
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [staging, non-production]
docs:
  context: ai/curaos/ops/chaos/CONTEXT.md
  requirements: ai/curaos/ops/chaos/Requirements.md
---

## Mission

Maintain repeatable non-production chaos experiments and evidence artifacts for
CuraOS resilience hardening.

## Toolchain Registry

- Static experiment guard: `bash curaos/tools/build/chaos-experiments-check.sh`
- Chaos Mesh Zarf guard: `bash curaos/tools/build/zarf-chaos-mesh-check.sh`
- Evidence fixture guard: `bash curaos/tools/build/chaos-evidence-check.sh --fixtures`
- Live evidence guard: `bash curaos/tools/build/chaos-evidence-check.sh --require-live curaos/ops/chaos/evidence/runs/<run-id>.json`
- Mirror check: `bash scripts/check-ai-mirror.sh`

## Judgment Boundaries

- NEVER run chaos manifests in production, customer PHI environments, or any
  namespace without explicit staging/non-production approval.
- NEVER apply the whole experiment directory for live execution; apply exactly
  one experiment manifest at a time.
- NEVER use `mode: all`, `RemoteCluster`, `externalTargets`, wildcard verbs, or
  production namespaces.
- ALWAYS preserve `chaos-testing` as the experiment CR namespace unless an ADR or
  rule changes the contract.
- ALWAYS capture evidence through the committed evidence collector before
  calling a live run complete.

## Context Map

```yaml
mirror_target: curaos/ops/chaos/
related_modules:
  zarf: ai/curaos/ops/zarf/AGENTS.md
  slo: ai/curaos/ops/slo/CONTEXT.md
binding_rules:
  - ai/rules/curaos_orchestration_rule.md
  - ai/rules/curaos_slo_rule.md
  - ai/rules/curaos_quality_gates_rule.md
  - ai/rules/curaos_airgap_rule.md
ci_guards:
  - curaos/tools/build/chaos-experiments-check.sh
  - curaos/tools/build/zarf-chaos-mesh-check.sh
  - curaos/tools/build/chaos-evidence-check.sh
```
