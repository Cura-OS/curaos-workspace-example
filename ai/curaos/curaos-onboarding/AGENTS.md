---
name: curaos-onboarding
description: "CuraOS first-run onboarding wizard - an idempotent, isolation-safe step machine (tenant bootstrap -> admin -> branding -> guided-tour) driven against an injectable OnboardingBackend port. Headless engine + CLI; the builder-studio M4 surface renders forms against its Zod schemas. Guided-tour path consumes @curaos/demo-seed (#511). Code-only submodule; local `just ci` is the merge gate."
tags: [onboarding, wizard, tenant-bootstrap, admin, branding, builder-led, idempotent, multi-tenant, m15]
language: TypeScript (Bun test)
framework: none (Bun runtime + bun:test + Zod 4)
infrastructure: none in-repo (live identity/tenancy/branding injected via OnboardingBackend port)
tooling: Bun, oxlint, tsc, just, Renovate
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  context: ai/curaos/curaos-onboarding/CONTEXT.md
  requirements: ai/curaos/curaos-onboarding/Requirements.md
  research: ai/curaos/docs/research/2026-06-06-m15-s5-onboarding-wizard-curaos-onboarding.md
  grill: ai/curaos/docs/grills/m15-s5-514-onboarding-wizard-curaos-onboarding.md
parent: ai/curaos/AGENTS.md
---

# curaos-onboarding - agent contract

Code lives at `curaos/curaos-onboarding/` (code-only submodule per
[[curaos-repo-boundary-rule]]). This mirror holds the agent docs. Backing
research: [2026-06-06-m15-s5-onboarding-wizard-curaos-onboarding.md](../docs/research/2026-06-06-m15-s5-onboarding-wizard-curaos-onboarding.md).
Grill: [m15-s5-514](../docs/grills/m15-s5-514-onboarding-wizard-curaos-onboarding.md).
Parent epic: [#29](https://github.com/your-org/curaos-ai-workspace/issues/29) ·
Story: [#514](https://github.com/your-org/curaos-ai-workspace/issues/514).

## Mission

Take a fresh CuraOS deployment from empty to a usable tenant via a first-run
wizard: tenant bootstrap → admin → branding → guided-tour. Idempotent re-run;
tenant isolation enforced; cloud-profile completes in < 15 min (#29 acceptance §2).

## Scope boundary (binding)

- **Owns:** the surface-agnostic wizard engine, the `OnboardingBackend` port, the
  `InMemoryBackend` fixture, the Zod input schemas, the guided-tour adapter, and
  the CLI.
- **Does NOT own / must-not-break:** identity/tenancy contracts, RBAC, tenant
  isolation. The wizard CONSUMES these through the port; it never edits the
  Kotlin services or their schemas. The first admin is created as `tenant-owner`
  only - the engine never escalates privileges.
- **Builder-led (charter §3):** the M4 builder (`builder-studio`) renders one
  form per step against the exported `stepSchemas`; this repo owns the engine +
  schemas, not the builder forms (those are a thin downstream consumer).

## Toolchain Registry

- Local CI gate (merge authority): `just ci` (or `bash ci.sh`) - install →
  oxlint → tsc → bun test. No docker required.
- Run the wizard headless: `bun src/cli.ts --dry-run` (in-memory fixture) or
  `--config=onboarding.json`; `--example` prints a config template.
- Mirror check: `bash scripts/check-ai-mirror.sh` (from workspace root).
- Doc graph: `bun scripts/check-doc-graph.js`.

## Judgment Boundaries

- NEVER add a concrete identity/tenancy/branding HTTP client to this submodule -
  it is operator/integration-owned and injected via `OnboardingBackend` (keeps
  every deployment profile viable + the submodule code-only).
- NEVER make a wizard step non-idempotent. Every backend method is
  `ensure`-semantics keyed by (`tenantRef`, natural key); a re-run converges.
- NEVER let a step touch a `tenantRef` other than the one bootstrapped in this
  run - tenant isolation is a hard invariant, proven by `tests/isolation.test.ts`.
- NEVER add `on: push` / `on: pull_request` to `.github/workflows/ci.yml` - it is
  `workflow_dispatch`-only per [[curaos-local-ci-first-rule]].
- The live `< 15-min` timing is an operator-gated verification (`RUNBOOK.md`);
  do not fabricate an in-CI timing claim.
