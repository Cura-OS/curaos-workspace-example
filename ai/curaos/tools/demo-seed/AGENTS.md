---
name: demo-seed
description: M15-S2 watermarked synthetic demo-tenant seed generator. Synthea FHIR R4 → HealthStack import (health) + faker/fishery factories (education + commerce/ERP). Visible + machine-readable synthetic watermark on every PII-shaped field; Presidio/PHI gate fails closed on real-looking data; cross-domain links carry no PHI.
tags: [tooling, demo-seed, m15, synthetic-data, phi-gate]
language: TypeScript
framework: Bun + @faker-js/faker + fishery
infrastructure: monorepo (Bun workspaces + Turborepo)
tooling: Bun, faker, fishery, "@curaos/healthstack-phi-boundary"
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [dev]
docs:
  adr: ai/curaos/docs/adr/
  context: ai/curaos/tools/demo-seed/CONTEXT.md
  requirements: ai/curaos/tools/demo-seed/Requirements.md
---

# AGENTS.md - tools/demo-seed

CuraOS M15-S2 (#511) watermarked synthetic demo-tenant seed generator. Cross-CLI agent contract for Claude Code, Codex, Gemini CLI, OpenCode operating on `curaos/tools/demo-seed/`.

## Mission

Emit ONE reproducible, fully synthetic demo tenant spanning HealthStack + Education + Commerce/ERP. Every PII-shaped field carries a **visible + machine-readable synthetic watermark**; a **Presidio/PHI gate fails closed** on any non-watermarked or real-looking value; cross-domain links are **reference-only** (no PHI). It is a **generator, not a loader** - it emits a deterministic JSON manifest and never mutates a real tenant.

## Toolchain Registry

- Install: `bun install` (from `curaos/` root)
- Run: `bun run demo:seed` (root) / `bun tools/demo-seed/src/index.ts` (direct); flags `--seed=N --out=f.json --presidio`
- Test: `bun test tools/demo-seed`
- Typecheck: `cd tools/demo-seed && bun run typecheck`
- Lint: `bun run lint:oxlint tools/demo-seed` (root config)
- Doc graph: `bun scripts/check-doc-graph.js` (workspace root)
- Mirror doctor: `bash scripts/check-ai-mirror.sh` (workspace root)

## Judgment Boundaries

- NEVER fork the PHI vocabulary. The canonical PHI detector + Presidio scrubber + reference-only check live in `@curaos/healthstack-phi-boundary` and are REUSED here (single PHI-vocabulary owner per [[curaos-reuse-dry-rule]]). If the audit/boundary patterns evolve, this seed inherits them automatically.
- NEVER emit an un-watermarked entity. Every producer wraps its output with `withWatermark`; the manifest gate (`assertManifestSafe`) fails closed if any entity loses the watermark or a PII-shaped field lacks a visible marker.
- NEVER cross-link a PHI value into a neutral / education / commerce payload. Cross-domain links use OPAQUE refs only and are validated by `assertCrossDomainLinkPhiFree` (reuses `checkReferenceOnlyEnvelope`).
- NEVER commit a large generated Synthea corpus. Keep `fixtures/fhir-r4/` small + synthetic; live Synthea (Java) generation is env-gated via `SYNTHEA_BUNDLE_DIR`.
- NEVER write into a real tenant / DB / API from this package. It emits a JSON manifest; loading is the onboarding-wizard (S5) / demo-tenant (S7) job.
- ALWAYS keep the seed deterministic: `faker.seed(N)` + `faker.setDefaultRefDate(<fixed ISO>)`. Never use relative-date faker APIs without a fixed ref date.
- ALWAYS run `bun run typecheck` + `bun test tools/demo-seed` + `bun run lint:oxlint tools/demo-seed` before reporting done.

## Context Map

```yaml
monorepo: bun workspaces (workspaces[] includes tools/*)
task_runner: turborepo
related:
  phi_boundary: backend/packages/healthstack-phi-boundary (@curaos/healthstack-phi-boundary - reused PHI gate)
  shared_tsconfig: backend/packages/tsconfig (@curaos/tsconfig)
  consumers: onboarding-wizard (S5 #514), demo-tenant (S7 #516), docs-site tutorials (S4 #513), GA E2E (S8 #517)
  ai_mirror: ai/curaos/tools/demo-seed/ (1:1 with curaos/tools/demo-seed/)
binding_decisions:
  health: Synthea FHIR R4 → HealthStack import adapter (live Synthea env-gated)
  education_commerce: "@faker-js/faker" + fishery typed factories
  watermark: visible per-field markers + machine-readable { __synthetic, __watermark } envelope
  gate: reuse @curaos/healthstack-phi-boundary; verify watermark FIRST then scan unwatermarked residue
```

## Personas Registry

- reviewer: gate PHI-boundary reuse + watermark-on-every-entity + cross-domain no-PHI (high effort)
- worker: producer + fixture + factory implementation passes (medium effort)
