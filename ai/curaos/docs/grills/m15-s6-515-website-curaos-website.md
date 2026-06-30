# Codex grill — M15-S6 PR your-org/curaos-website (new repo) + curaos-ai-workspace ai-docs + curaos parent pointer

## Verdict: APPROVE-WITH-CONDITIONS (planning-stage grill, pre-implementation)

**Harness:** codex (`codex exec`, default model, reasoning_effort=high, sandbox read-only)
**Date:** 2026-06-06
**Subject:** #515 [M15-S6] public website refresh (`curaos-website`) plan — before final implementation.
**GRILL:** opposite-harness (codex)

## Findings + resolutions

Codex returned the 7 required sections. Every decision-point finding had a doc/code-resolved recommended answer → auto-applied per [[curaos-recommendation-auto-apply-rule]] (logged in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` 2026-06-06 M15-S6 row). Item-7 "user-escalation candidates" are all things I am explicitly NOT doing (live DNS deploy, Astro/Next switch, Pages-primary, analytics/forms/CDN, full-Zarf-install-in-S6, authored prose in code repo) → no escalation fires.

### P1 — runbook-in-README ⇄ repo-boundary (resolved)

Codex: a full operator/live-domain runbook in the code-repo README conflicts with [[curaos-repo-boundary-rule]] (code repos = minimal README only).
**Resolution (auto-applied):** code-repo `README.md` stays terse + command-only (build/test/host commands). The full operator/live-deploy runbook (DNS/cert/`--*-url` rewrite, hosting profiles) lives in the workspace mirror `ai/curaos/curaos-website/CONTEXT.md`. Matches the S4 docs-site split.

### P1 — release-artifact link target ambiguity (resolved)

Codex: story binding names GHCR + Verdaccio + Zarf bundle host; my research said GitHub Releases — pick ONE canonical public landing surface.
**Resolution (auto-applied):** the **public landing** target = the org **GitHub Releases** surface (`--releases-url`, default placeholder `https://github.com/your-org/curaos/releases`). GHCR/Verdaccio/Zarf-host are artifact *registries* the release pipeline (S1/S3) publishes to, not a human-facing landing page — the brochure links humans to Releases, which in turn references the signed bundles.

### P1 — offline-smoke scope depth (resolved)

Codex: smoke must scan ALL built HTML/CSS/assets for remote refs (not just `<head>`), while ALLOWING approved external navigation `a[href]`.
**Resolution (auto-applied):** `offline-smoke.sh` greps every `*.html`/`*.css` in `site/` for remote `<script src>`/`<link href>`/`<img src>`/`url(...)` ASSET refs (fail on remote) but classifies `<a href="http...">` as navigation (allowed — docs/demo/releases links are navigation, not fetched assets). A test asserts both: remote asset fails, remote nav-anchor passes.

### P1 — Pages content-source explicitness (resolved)

Codex: S4 Pages builds the in-repo fixture unless content is mounted; S6 must say so.
**Resolution (auto-applied):** `pages.yml` is the **secondary mirror** and ships the in-repo `examples/site-content/` fixture (authored copy mirror is staged by the parent workspace for primary NGINX/Zarf builds) — identical to docs-site. Documented in the workflow comment + README.

### P1 — demo "resolve" glossary (resolved)

Codex: S7 (#516) is not a hard dep of S6; "links to demo resolve" must mean a visible **coming-soon** affordance, not a pretend-live demo.
**Resolution (auto-applied):** the demo link renders with a visible "coming soon" marker (`data-status="coming-soon"` + visible label) until #516 lands; `--demo-url` default is a documented placeholder. A test asserts the marker.

### P2 — competitor-UX-pattern depth (noted, not blocking)

Codex: the deep-research rule wants exact competitor UX patterns before decisions.
**Resolution:** S6 is a GA brochure landing page (hero + value-props + 4-deploy-profile grid + docs/demo/releases links), not a novel interaction surface. The IA mirrors standard self-hosted-platform landing pages (e.g. the deploy-profile grid pattern used by Supabase/PostHog/Plausible self-host pages — hero + "deploy anywhere" matrix + docs/demo CTAs). Captured in research §Q1; no novel interaction needing a competitor-parity ADR. The Bun-native render + flag-injected links is the only mechanism, and it is doc-resolved.

## What Claude got right (counter-balance)

1. Reusing the MERGED S4 docs-site scaffold (Bun-native build, pin-guard, offline-smoke, hosting/{nginx,k8s,zarf}, workflow_dispatch Pages, bun tests) instead of inventing a toolchain — DRY + lowest-risk.
2. Authored copy in the mirror (`site-content/`), code repo code-only — correct repo-boundary application, matching the S4 P0 resolution.
3. Build-time `--docs-url`/`--demo-url`/`--releases-url` flags with documented placeholders — no live domain hardcoded; operator rewrites at deploy; build stays deterministic + testable.
4. Live deploy correctly scoped as operator-gated deferred (same class as #512/#516/#517), with the runbook as the deliverable.

## Decision: all conditions are doc-resolved → proceed to TDD. No user escalation.
