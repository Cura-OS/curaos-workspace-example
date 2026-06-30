# Codex grill — M15-S4 PR your-org/curaos-docs-site (new repo) + curaos-ai-workspace ai-docs + curaos parent pointer

## Verdict: APPROVE-WITH-CONDITIONS (planning-stage grill, pre-implementation)

**Harness:** codex (`codex exec`, default model, reasoning_effort=high, sandbox read-only)
**Date:** 2026-06-06
**Subject:** #513 [M15-S4] docs site (`curaos-docs-site`) plan — before final implementation.
**GRILL:** opposite-harness (codex)

## Findings + resolutions

Codex returned 7 numbered sections. All decision-point findings had doc-resolved recommended answers → auto-applied per [[curaos-recommendation-auto-apply-rule]] (logged in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` 2026-06-06 M15-S4 row). No finding required user escalation.

### P0 — repo-boundary ⇄ ADR-0110 §3.15 tension (resolved)

Codex: `docs-external/` authored Markdown inside the `curaos-docs-site` code repo conflicts with [[curaos-repo-boundary-rule]] (code repos = code + minimal README/CHANGELOG only); ADR-0110 §3.15 also asks every service repo to carry `docs/`/`catalog-info.yaml`/`mkdocs.yml`.

**Resolution (auto-applied):** Authored external-docs source of truth moves to `ai/curaos/curaos-docs-site/docs-content/` (mirror tree, doc-graph-reachable). Build scripts copy it into the build workspace. The `curaos-docs-site` code repo holds **build config + scripts + hosting manifests + tests + minimal README/CHANGELOG ONLY**. Per-service `docs/`/`catalog-info.yaml`/`mkdocs.yml` are NOT seeded into 91 service repos in S4 — S4 ships the build harness that consumes per-service mirror Markdown. Rule (precedence 1) > ADR (precedence 2) per AGENTS §13b.

### P1 — wording/glossary (resolved)

- "cloud = GitHub Pages" → **GitHub Pages = secondary public mirror**; primary = NGINX/K8s static + Zarf component (ADR-0110 §3.15 exact wording).
- "API docs" overloaded → **TypeDoc = code API docs for TS packages only**; OpenAPI/AsyncAPI contract docs **linked, not replaced**.
- "catalog metadata" → say `Backstage catalog-info.yaml` (build-time generated entity descriptor, not a committed per-repo file).

### P1 — air-gap acceptance depth (resolved)

Codex: does S4 prove full Zarf install or just local static render? **S4 = local zero-egress static render + emit Zarf-consumable component input.** Full bundle install proof = S3 (#512) / S8 (#517). Matches S4 acceptance "offline/air-gap static output renders".

### P1 — CI gate scope (resolved)

Codex: `mkdocs build --strict` alone is insufficient for M15 DoD. **CI gate (`bun run ci`/`just ci`) wraps:** install → mkdocs strict → techdocs generate → typedoc → offline static smoke → bun tests. Local gate is merge authority ([[curaos-local-ci-first-rule]]).

### P2 — hidden deps / subtasks (addressed)

- Issue-specific research artifact written: `ai/curaos/docs/research/2026-06-06-m15-s4-docs-site-curaos-docs-site.md`.
- Backstage runtime deployment (catalog plugin, publisher storage, auth) is **out of S4 scope** — S4 ships the TechDocs build harness only; runtime deploy is a future story.
- Content pipeline copies mirror Markdown into the build workspace without leaking ai-doc/ADR links into the code repo (build scripts strip nothing — authored content is plain customer docs, not ADR mirror content).
- TypeDoc output into `ai/curaos/<package>/docs/api/` triggers doc-graph refresh — handled by the verification `check-doc-graph.js --write` step.

## Genuine user-escalation candidates — NONE fired

Codex listed 4 escalation candidates, all conditional on doing things this plan does NOT do:
1. authored customer docs inside the code repo → **not done** (they live in the mirror).
2. seed `docs/`/`catalog-info.yaml`/`mkdocs.yml` into 91 service repos → **not done** (build harness consumes the mirror).
3. GitHub Pages as primary cloud host → **not done** (Pages = secondary mirror).
4. full air-gap Zarf install proof in S4 → **not done** (deferred to S3/S8; S4 proves local static render).

Since the plan avoids all four, no repo-boundary/ADR override is needed and no escalation is required.

## Conditions for APPROVE

1. Code repo stays code-only; authored content in the mirror. ✅ designed in.
2. Exact version pins (mkdocs 1.6.1, mkdocs-material 9.7.6, typedoc 0.28.19, typedoc-plugin-markdown 4.12.0, NGINX digest-pinned). ✅
3. `check-doc-graph.js` green after TypeDoc output. ✅ verified at closeout.
4. Offline/air-gap static render proven locally (zero-egress). ✅ smoke test.
