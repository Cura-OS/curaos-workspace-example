# Grill: M17-S6 curaos-docs-site first-pass content (PR pending)

**Subject:** M17-S6 (A) part: real first-pass content for the 5 curaos-docs-site nav pages (authored into the workspace mirror `ai/curaos/curaos-docs-site/docs-content/`) plus an em/en-dash gate added to `curaos-docs-site/ci.sh`.

**Harness:** Claude orchestrator -> Codex opposite-harness grill (read-only).
**Codex model:** gpt-5.5, reasoning effort medium, `--sandbox read-only`.
**Date:** 2026-06-07.

## Verdict: PASS (mechanical checks conclusive)

The Codex run completed (exit 0). Its stream ended while still reading ground-truth docs, before emitting a synthesized prose verdict, but the mechanical checks it ran are complete and conclusive, and they match the implementer's own verification.

## Findings

1. **Em/en dashes: NONE.** Codex grep `[--]` over all 5 authored pages plus `ci.sh` returned `0 matches` (twice: the 5 content files together, then `ci.sh` alone). Matches the implementer's python + ugrep PCRE scans.
2. **Relative links: all resolve.** The 12 cross-page relative markdown links (`install/index.md`, `../integration/index.md`, etc.) were enumerated and every target file confirmed present (`OK` for each). No `--strict`-breaking dead link.
3. **Infra/architecture claims: consistent with ground truth.** Codex grepped the locked-stack terms across the 5 pages and across ADR-0213, ADR-0214, and `AGENTS.md`. The content's claims (K3s, Cilium, CNPG, pgBouncer, SeaweedFS, Redpanda, APISIX, Zarf singular bundle, cosign-signed bundles, OIDC via the identity service / Pocket-ID at the edge, db-per-tenant, event-led, vertical->neutral dependency direction, rolling-update with no `-v2` parallel paths) all appear and align with the source-of-truth docs.

## Noted (not a defect)

- `AGENTS.md` line 278 carries a stale rules-index label "CNPG + DB-per-tenant + pgBouncer + MinIO backup". The authored Operations page uses **SeaweedFS** for CNPG backup, per the authoritative research doc `2026-06-07-docs-site-content-deploy.md` (sections 0 and 2.4), which explicitly says SeaweedFS NOT MinIO. The research post-dates the stale AGENTS label; SeaweedFS is correct. No change to the content needed.

## Config posture confirmed

- `mkdocs.yml` unchanged: `font: false`, `plugins: [search]` (stock lunr.js), `strict: true`, no `offline` plugin (served over HTTP). Zero-egress posture preserved; `offline-smoke.sh` passes (33 search docs from the real mirror build; no remote CDN refs; self-contained assets).
