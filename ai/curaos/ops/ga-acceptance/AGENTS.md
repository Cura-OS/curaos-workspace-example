---
name: ops/ga-acceptance
description: "ga-acceptance module; see Requirements.md"
tags: [ops, ga-acceptance]
language: TypeScript
framework: none
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/ops/ga-acceptance/CONTEXT.md
node_type: agents
owner: platform-engineering
status: active
milestone: M15
parent: ../AGENTS.md
mirrors: curaos/ops/ga-acceptance
---

# AGENTS - ops/ga-acceptance

Agent contract for the **GA install-from-scratch E2E harness** (#517). Mirrors code at `curaos/ops/ga-acceptance/`.

## What this is

The acceptance harness that proves CuraOS v1 GA "install-from-scratch" for **3 profiles** - on-prem, air-gap, hybrid (cloud DEFERRED-V2 per [ADR-0213](../../docs/adr/0213-m15-ga-verification-infra-topology.md)). See [CONTEXT.md](CONTEXT.md) for the integration map.

## Files (code repo)

- `ga-install-from-scratch.sh` - driver `--profile {on-prem|air-gap|hybrid} [--dry-run|--plan-only]`. Owns per-profile step sequence (`plan_steps`) + assertions (`assert_pods_ready`, `assert_phi_gate_clean`, `assert_hybrid_phi_placement`, `assert_zero_egress_clean`). Air-gap leg delegates to `curaos/scripts/assert-zero-egress.sh` (#330) - no duplication.
- `ga-install-from-scratch.test.ts` - dry-run/assertion logic tests (cluster-free; `GA_*` env vars inject simulated outcomes so a dirty PHI gate / pods-not-ready / hybrid-PHI-on-control-plane / leaked air-gap egress all exit 2).
- `README.md` - runbook.

## Binding rules

- [[curaos-airgap-rule]] - zero-egress contract (air-gap profile).
- [[curaos-orchestration-rule]] - k3d profile parity; traefik/servicelb/metrics-server disabled.
- [[curaos-rolling-update-rule]] - reuse `assert-zero-egress.sh`, never fork a parallel copy.
- [[curaos-local-ci-first-rule]] - `shellcheck` + `bun test` are the (A) gate; live cluster run is the orchestrator's (B) step.

## Done

(A) harness authored + `shellcheck`/`bun test` green (merged curaos#257). (B) live 3-profile run on build-host/Hetzner is the orchestrator's step; blocked on per-service Helm packaging - see [research](../../docs/research/2026-06-07-m15-ga-service-packaging-gap.md).
