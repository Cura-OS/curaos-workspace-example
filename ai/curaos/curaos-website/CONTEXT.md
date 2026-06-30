# curaos-website — CONTEXT

Integration map + rationale + deploy runbook for the CuraOS public website. Code: `curaos/curaos-website/`. Governing decision: [ADR-0110 §3.15](../docs/adr/0110-cicd-release.md). Backing research: [2026-06-06-m15-s6-public-website-curaos-website.md](../docs/research/2026-06-06-m15-s6-public-website-curaos-website.md). Grill: [m15-s6-515](../docs/grills/m15-s6-515-website-curaos-website.md). Parent epic: [#29](https://github.com/your-org/curaos-ai-workspace/issues/29). Story: [#515](https://github.com/your-org/curaos-ai-workspace/issues/515).

## Build flow

```text
authored copy (ai/curaos/curaos-website/site-content/site.json)  ─┐
build-time link flags (--docs-url/--demo-url/--releases-url)      ├─► scripts/build.sh ─► src/build.ts ─► src/render.ts ─► site/index.html  (self-contained, zero-egress)
locale flags (--lang/--dir)                                      ─┘                                                          │
                                                                                                                            ├─► hosting/nginx (K8s) · hosting/k8s · hosting/zarf (air-gap component) · GitHub Pages (secondary mirror)
                                                                                                                            └─► scripts/offline-smoke.sh  (zero-egress proof)
```

## Producers / consumers

- **Produces:** the external static brochure `site/` (NGINX image + K8s manifests + Zarf component input + GitHub Pages mirror). No runtime domain events.
- **Consumes:** authored copy from this mirror's `site-content/`; and — by link, not build dependency — the **docs site** (S4 #513), the **demo tenant** (S7 #516, coming-soon until it lands), and the **release artifacts** surface (org GitHub Releases, populated by S1/S3).
- **No runtime domain events** — this is a build/host-time brochure pipeline.

## Producers / consumers — downstream

- **Consumed by** Story 7 (#516 — once the demo tenant is live, the operator flips `--demo-live true` + rewrites `--demo-url` to the real demo domain) and Story 8 (#517 — the GA acceptance E2E links-resolve check).

## Must-not-break (exact paths)

| Path | Why |
|---|---|
| `scripts/check-doc-graph.js` + `ai/curaos/docs/DOC-GRAPH.md` | doc-graph reachability; `site-content/` must stay reachable from root `AGENTS.md`. |
| `ai/curaos/docs/adr/0110-cicd-release.md` §3.15 | governing docs/website-stack decision; Pages = secondary mirror. |
| [[curaos-repo-boundary-rule]] | the `curaos-website` code repo stays code-only. |
| `curaos/ops/zarf/zarf.yaml` | the air-gap bundle the `hosting/zarf` component feeds (parallel to docs-site). |
| docs-site link target (S4) | the brochure links INTO the docs surface; do not break the docs URL contract. |
| brand bundle / i18n-RTL seam | NFR §6 localization; the `--dir rtl` seam must keep emitting `<html dir="rtl">`. |

## Decisions (this module)

| Decision | Choice | Source |
|---|---|---|
| Static-site stack | Bun-native zero-framework renderer (self-contained HTML, inlined CSS) | research §Q1; [[curaos-bun-primary-rule]]; [[curaos-reuse-dry-rule]] (reuse S4 scaffold) |
| Authored copy home | `ai/curaos/curaos-website/site-content/` (mirror); copied into build at build time | [[curaos-repo-boundary-rule]] > ADR (AGENTS §13b); grill 2026-06-06 |
| Code repo contents | build config + scripts + hosting manifests + tests + minimal README/CHANGELOG only | [[curaos-repo-boundary-rule]] |
| Operator runbook home | this CONTEXT.md (mirror), NOT the code-repo README | grill 2026-06-06; repo-boundary |
| Links | build-time `--docs-url`/`--demo-url`/`--releases-url` flags, documented-placeholder defaults | grill 2026-06-06 |
| Releases link target | org **GitHub Releases** (the human-facing landing surface); GHCR/Verdaccio/Zarf are registries, not a landing page | grill 2026-06-06 |
| Demo link | visible **coming-soon** placeholder + `--demo-live` flag until S7 (#516) lands | grill 2026-06-06; story acceptance |
| Air-gap zero-egress | inlined CSS + system fonts + relative-only assets; `offline-smoke.sh` rejects remote ASSET refs, allows nav `<a href>` | grill 2026-06-06; [[curaos-airgap-rule]] |
| i18n/RTL | `--lang`/`--dir` flags; default `en`/`ltr`; `--dir rtl` emits `<html dir="rtl">` | NFR §6 localization |
| GitHub Pages role | secondary public mirror; primary = NGINX/K8s + Zarf | ADR-0110 §3.15 |
| CI trigger | `pages.yml` `workflow_dispatch`-only; `just ci` is merge gate | [[curaos-local-ci-first-rule]] |

## Deploy runbook (operator — live-infra-gated)

The live public-domain deploy is operator-driven (same class as #512/#516/#517). The build + offline artifact + hosting manifests are checked in; the operator executes:

1. **Build with live link targets:**
   ```sh
   cd curaos/curaos-website
   bun install --frozen-lockfile
   just build \
     --content-dir ../../ai/curaos/curaos-website/site-content \
     --docs-url https://docs.<live-domain> \
     --demo-url https://demo.<live-domain> --demo-live <true|false> \
     --releases-url https://github.com/your-org/curaos/releases \
     --lang en --dir ltr
   just offline-smoke
   ```
   Flip `--demo-live true` + point `--demo-url` at the real demo only once S7 (#516) is live.
2. **Container host (cloud/on-prem/hybrid):** build `hosting/nginx/Dockerfile` (the release pipeline / `curaos-deploy` publishes the digest-pinned image to GHCR), apply `hosting/k8s/website.yaml` with the release-pinned image digest, front it with the cluster ingress + TLS cert + DNS for the public domain.
3. **Air-gap:** the `hosting/zarf/website.component.yaml` is composed into the signed Zarf bundle by Story 3 (#512) — no separate action here.
4. **Secondary Pages mirror:** `env -u GITHUB_TOKEN gh workflow run pages.yml --repo your-org/curaos-website --ref main` (manual; `workflow_dispatch`-only).

## Submodule wiring

`curaos-website` is a real top-level submodule at `curaos/curaos-website/` (kebab-case, code-only). ai-docs mirror = this directory (`ai/curaos/curaos-website/`). Like `curaos-deploy`/`curaos-docs-site`/`curaos-onboarding`, a top-level submodule is outside the trees the mirror checker (`scripts/check-ai-mirror.sh`) compares (`backend/services`, `backend/packages`, `frontend/apps`, `frontend/packages`, `ops`), so the parent submodule pointer + these ai-docs are the wiring of record.
