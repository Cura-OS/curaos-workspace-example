---
name: curaos-website
description: "CuraOS public website - offline/air-gap-renderable static brochure site (Bun-native zero-framework build; self-contained HTML, inlined CSS, relative-only assets, zero external egress). Links the docs site (S4), demo tenant (S7, coming-soon placeholder until #516), and release artifacts (GitHub Releases). Hosting: NGINX/K8s + Zarf component (air-gap) + GitHub Pages (secondary mirror). workflow_dispatch-only; local `just ci` is the merge gate."
tags: [website, brochure, static-site, bun, nginx, zarf, github-pages, air-gap, i18n, m15]
language: TypeScript (Bun) + Bash
framework: none (Bun-native static renderer)
infrastructure: NGINX (K8s static host), GitHub Pages (secondary mirror), Zarf bundle (air-gap)
tooling: Bun, just, shellcheck, Renovate
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/0110-cicd-release.md
  context: ai/curaos/curaos-website/CONTEXT.md
  requirements: ai/curaos/curaos-website/Requirements.md
  research: ai/curaos/docs/research/2026-06-06-m15-s6-public-website-curaos-website.md
  grill: ai/curaos/docs/grills/m15-s6-515-website-curaos-website.md
parent: ai/curaos/AGENTS.md
---

## Mission

Own the CuraOS public website: an offline / air-gap-renderable static brochure
site (hero + value props + 4-deploy-profile grid + docs/demo/releases links).
Built with a **Bun-native zero-framework** renderer that emits a self-contained
`site/` (inlined CSS, relative-only assets, no remote `<script>/<link>`/font) so
it renders with zero network egress. Code lives in the `curaos-website`
submodule (`curaos/curaos-website/`); this tree holds the agent docs +
authored marketing copy only.

## Scope boundary (binding)

- This repo BUILDS + HOSTS the brochure; it does NOT own authored copy. The
  authored marketing copy source of truth lives in this mirror tree under
  `ai/curaos/curaos-website/site-content/` (kept doc-graph-reachable); the build
  scripts copy it into the build workspace at build time. The `curaos-website`
  code repo carries CODE + build config + hosting manifests + tests + minimal
  README/CHANGELOG ONLY per [[curaos-repo-boundary-rule]].
- The full operator/live-deploy runbook (DNS/cert + `--*-url` rewrite + hosting
  profiles) lives in this mirror's [CONTEXT.md](CONTEXT.md), NOT the code-repo
  README (which stays terse + command-only per repo-boundary).
- Links are build-time flags (`--docs-url` / `--demo-url` / `--releases-url`)
  with documented placeholder defaults; the operator rewrites them at deploy.
  NO live domain is hardcoded in the repo.
- The demo link (S7 #516) renders a visible **coming-soon** placeholder until
  the demo tenant lands; do NOT pretend a live demo exists.
- Bundle signing/assembly = Story 3 (#512); this repo only emits the Zarf
  component input.

## Toolchain Registry

- Local CI gate (merge authority): `just ci` (or `bash ci.sh`) - install →
  shellcheck → pin-guard → typecheck → build → offline-smoke → bun test.
- Build: `just build --content-dir <mirror/site-content> --docs-url <…> --demo-url <…> [--demo-live true] --releases-url <…> --lang <…> --dir <ltr|rtl>`.
- Offline proof: `just offline-smoke` (zero-egress static render).
- Pin guard: `bash scripts/pin-guard.sh`.
- Mirror check: `bash scripts/check-ai-mirror.sh` (from workspace root).
- Doc graph: `bun scripts/check-doc-graph.js`.

## Judgment Boundaries

- NEVER add `on: push` / `on: pull_request` / `on: schedule` to
  `.github/workflows/pages.yml` - it is `workflow_dispatch`-only per
  [[curaos-local-ci-first-rule]].
- NEVER ship a remote-CDN asset reference (Google Fonts, unpkg, analytics,
  remote `<script>/<link>/<img>`, CSS `url(https…)`) in the built site -
  `scripts/offline-smoke.sh` FAILS on any remote ASSET ref (external navigation
  `<a href>` links are allowed).
- NEVER hardcode a live public domain in the repo - links are build-time flags
  defaulting to documented placeholders.
- NEVER use a floating image tag or a tag-pinned GitHub Action. Every base image
  is `@sha256:<64-hex>`; every Action is SHA-pinned (the pin-guard FAILS
  otherwise).
- NEVER mask an absent tool with `|| true`. A genuinely-absent `shellcheck`
  emits an explicit `SKIP:` notice in the local gate; the bun tests still cover
  behaviour.
- NEVER seed authored marketing prose, ADR links, or strategic runbooks into the
  `curaos-website` code repo (repo-boundary rule).
