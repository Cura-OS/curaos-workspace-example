# curaos-docs-site — CONTEXT

Integration map + rationale for the CuraOS documentation site. Code: `curaos/curaos-docs-site/`. Governing decision: [ADR-0110 §3.15](../docs/adr/0110-cicd-release.md). Backing research: [2026-06-06-m15-s4-docs-site-curaos-docs-site.md](../docs/research/2026-06-06-m15-s4-docs-site-curaos-docs-site.md). Grill: [m15-s4-513](../docs/grills/m15-s4-513-docs-site-curaos-docs-site.md). Parent epic: [#29](https://github.com/your-org/curaos-ai-workspace/issues/29).

## Three surfaces, one Markdown source

```text
authored content (ai/curaos/curaos-docs-site/docs-content/**.md)  ─┐
TypeDoc API md  (ai/curaos/<package>/docs/api/**.md)               ├─► build-external.sh ─► mkdocs build --strict ─► site/  (static, offline, client-side search)
per-service mirror Markdown (ai/curaos/<service>/*.md)            ─┘                                                       │
                                                                                                                          ├─► hosting/nginx (K8s) · hosting/k8s · hosting/zarf (air-gap component) · GitHub Pages (secondary mirror)
per-service entity (build-time catalog-info.yaml + mkdocs.yml)  ─► build-techdocs.sh ─► @techdocs/cli generate ──► techdocs-site/  (Backstage-consumable)
TS package entrypoint  ─► build-api-docs.sh ─► typedoc + typedoc-plugin-markdown ─► ai/curaos/<package>/docs/api/  (doc-graph nodes)
```

## Producers / consumers

- **Produces:** the external static site (NGINX image + K8s manifests + Zarf component input + GitHub Pages mirror), per-service TechDocs build output (Backstage-consumable), and TypeDoc Markdown into `ai/curaos/<package>/docs/api/`. **Consumed by** Story 6 (#515 website links), Story 7 (#516 demo tenant tutorials), Story 8 (#517 install-guide-matches-reality).
- **Consumes:** authored Markdown from this mirror's `docs-content/`, per-service Markdown from the `ai/curaos/<service>/` mirror, TS package entrypoints, and — at release time — the signed publish path from `curaos-deploy` (#510) that pushes the NGINX docs image to GHCR.
- **No runtime domain events** — this is a build/host-time docs pipeline.

## Must-not-break (exact paths)

| Path | Why |
|---|---|
| `scripts/check-doc-graph.js` + `ai/curaos/docs/DOC-GRAPH.md` | doc-graph reachability; TypeDoc API output + authored `docs-content/` must stay reachable. |
| `ai/curaos/docs/adr/0110-cicd-release.md` §3.15 | the governing docs-stack decision; do not contradict. |
| [[curaos-repo-boundary-rule]] | the `curaos-docs-site` code repo + the 91 service repos stay code-only. |
| `curaos/ops/zarf/zarf.yaml` | the air-gap bundle the `hosting/zarf` component feeds. |
| Markdown source readability for agents | authored content stays plain Markdown in the mirror, never locked behind a render step. |

## Decisions (this module)

| Decision | Choice | Source |
|---|---|---|
| Authored content home | `ai/curaos/curaos-docs-site/docs-content/` (mirror); copied into build workspace | [[curaos-repo-boundary-rule]] > ADR (AGENTS §13b); grill 2026-06-06 |
| Code repo contents | build config + scripts + hosting manifests + tests + README/CHANGELOG only | [[curaos-repo-boundary-rule]] |
| Air-gap zero-egress | `theme.font: false` (no Google Fonts CDN) + HTTP serve via NGINX; no `offline` `file://` shim | grill 2026-06-06; [[curaos-airgap-rule]] |
| Browser search | Material stock `search` plugin (lunr.js, client-side) | ADR-0110 §3.15 |
| GitHub Pages role | secondary public mirror; primary = NGINX/K8s + Zarf | ADR-0110 §3.15 |
| TypeDoc scope | TS code APIs only; OpenAPI/AsyncAPI linked, not replaced | ADR-0110 §3.15 |
| TechDocs in S4 | build harness only; Backstage runtime + per-repo seeding deferred | grill 2026-06-06; repo-boundary |
| CI trigger | `pages.yml` `workflow_dispatch`-only; `just ci` is merge gate | [[curaos-local-ci-first-rule]] |
| Tool-absent policy | explicit `SKIP:` in local gate; never `\|\| true` | [[curaos-local-ci-first-rule]] |

## Submodule wiring

`curaos-docs-site` is a real top-level submodule at `curaos/curaos-docs-site/` (kebab-case, code-only). ai-docs mirror = this directory (`ai/curaos/curaos-docs-site/`). Like `curaos-deploy`, a top-level docs submodule is outside the trees the mirror checker (`scripts/check-ai-mirror.sh`) compares (`backend/services`, `backend/packages`, `frontend/apps`, `frontend/packages`, `ops`), so the parent submodule pointer + these ai-docs are the wiring of record.
