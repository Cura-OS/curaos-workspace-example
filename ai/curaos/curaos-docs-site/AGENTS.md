---
name: curaos-docs-site
description: "CuraOS documentation site - MkDocs Material standalone static (external/customer/offline/air-gap, client-side search) + Backstage TechDocs build harness (internal per-service portal) + TypeDoc API docs (Markdown). Hosting: NGINX/K8s + GitHub Pages (secondary mirror) + Zarf component (air-gap). workflow_dispatch-only; local `just ci` is the merge gate."
tags: [docs, mkdocs-material, backstage-techdocs, typedoc, nginx, zarf, github-pages, m15]
language: Bash + TypeScript (Bun test) + Python (MkDocs)
framework: MkDocs Material + Backstage TechDocs + TypeDoc
infrastructure: NGINX (K8s static host), GitHub Pages (secondary mirror), Zarf bundle (air-gap)
tooling: mkdocs, mkdocs-material, typedoc, typedoc-plugin-markdown, "@techdocs/cli", Bun, just, shellcheck, Renovate
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/0110-cicd-release.md
  context: ai/curaos/curaos-docs-site/CONTEXT.md
  requirements: ai/curaos/curaos-docs-site/Requirements.md
  research: ai/curaos/docs/research/2026-06-06-m15-s4-docs-site-curaos-docs-site.md
  grill: ai/curaos/docs/grills/m15-s4-513-docs-site-curaos-docs-site.md
parent: ai/curaos/AGENTS.md
---

## Mission

Own the CuraOS documentation site: one Markdown source, three surfaces - an
**external** MkDocs Material standalone static site (customer/operator docs,
client-side search, zero-egress air-gap render), an **internal** Backstage
TechDocs build harness (per-service developer portal), and **TypeScript API
docs** generated as Markdown via TypeDoc. Code lives in the `curaos-docs-site`
submodule (`curaos/curaos-docs-site/`); this tree holds the agent docs only.

## Scope boundary (binding)

- This repo BUILDS + HOSTS docs; it does NOT own authored content. The authored
  external Markdown source of truth lives in this mirror tree under
  `ai/curaos/curaos-docs-site/docs-content/` (kept doc-graph-reachable); the
  build scripts copy it into the build workspace at build time. The
  `curaos-docs-site` code repo carries CODE + build config + hosting manifests +
  tests + README + CHANGELOG ONLY per [[curaos-repo-boundary-rule]].
- S4 ships the TechDocs build HARNESS, NOT a Backstage runtime deploy and NOT
  per-repo `docs/`/`catalog-info.yaml`/`mkdocs.yml` seeded into the 91 service
  repos (that would violate repo-boundary). Backstage runtime + per-repo seeding
  are future stories requiring ADR-0110 reconciliation.
- GitHub Pages = **secondary public mirror**; primary = NGINX/K8s static + Zarf
  component (air-gap). Bundle signing/assembly = Story 3 (#512) - do not pull it
  into this repo.
- TypeDoc documents TypeScript code APIs ONLY; OpenAPI/AsyncAPI contract docs are
  **linked, not replaced**.

## Toolchain Registry

- Local CI gate (merge authority): `just ci` (or `bash ci.sh`) - install →
  shellcheck → pin-guard → typecheck → API docs → mkdocs strict → offline smoke
  → techdocs → bun test.
- External site: `just external --content-dir <mirror/docs-content> --api-dir <api-out>`.
- API docs: `just api --entry <pkg/src/index.ts> --out <ai/curaos/<pkg>/docs/api>`.
- TechDocs harness: `just techdocs --service <name> --docs-dir <mirror/docs>`.
- Offline proof: `just offline-smoke` (zero-egress static render + offline search).
- Pin guard: `bash scripts/pin-guard.sh`.
- Mirror check: `bash scripts/check-ai-mirror.sh` (from workspace root).
- Doc graph: `bun scripts/check-doc-graph.js`.

## Judgment Boundaries

- NEVER add `on: push` / `on: pull_request` / `on: schedule` to
  `.github/workflows/pages.yml` - it is `workflow_dispatch`-only per
  [[curaos-local-ci-first-rule]].
- NEVER ship a remote-CDN asset reference (Google Fonts, unpkg shim, etc.) in the
  external site - `theme.font: false` + `scripts/offline-smoke.sh` enforce
  zero-egress air-gap rendering. A remote `<script>/<link>` in the built
  `index.html` FAILS the smoke.
- NEVER use a floating image tag or a tag-pinned GitHub Action. Every base image
  is `@sha256:<64-hex>`; every Action is SHA-pinned; every Python dep is `==`
  pinned (the pin-guard FAILS otherwise).
- NEVER mask an absent tool with `|| true`. A genuinely-absent `mkdocs` emits an
  explicit `SKIP:` notice in the local gate; the bun tests still cover behaviour.
- NEVER seed authored prose, ADR links, or `docs/`+`catalog-info.yaml` into the
  `curaos-docs-site` code repo or the 91 service repos (repo-boundary rule).
