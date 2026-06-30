# M15 — v1 GA Packaging + Launch Readiness: Atomic Story Breakdown

**Date:** 2026-06-06
**Parent Epic:** [#29 — M15 v1 GA packaging + launch readiness](https://github.com/your-org/curaos-ai-workspace/issues/29)
**Backing research (persisted, merged):**
- `ai/curaos/docs/research/2026-06-05-m15-launch-readiness-open-questions.md` (demo-data + docs-stack decisions)

**Governing ADRs/rules:** ADR-0109 (containers/orchestration), ADR-0110 (CI/CD release), ADR-0164 (Zarf bundle layout), [[curaos-orchestration-rule]] (K8s prod + Compose/Bun dev + Zarf air-gap), [[curaos-airgap-rule]] (Zarf singular format), [[curaos-image-build-rule]] (BuildKit dev/CI + Buildah air-gap), [[curaos-version-pinning-rule]] (exact pins + SHA-pin Actions + digest-pin images), [[curaos-doc-graph-rule]] (LLM-wiki), [[curaos-local-ci-first-rule]], [[curaos-repo-boundary-rule]], [[curaos-foresight-rule]], [[curaos-generator-evolution-rule]].

> **Status of this artifact:** BREAKDOWN + SPEC only. No code, no new research. This file IS the deliverable of the M15 pre-activation breakdown — the orchestrator copies each `## Story Nx` section into a `gh issue create` body, wires §3.4 parent/child + Project fields, applies native `blocked-by` dependency edges, and labels each `foresight` (quarantined Backlog until M15 activates per [[curaos-foresight-rule]]). M14 (#28) is CLOSED/COMPLETED 2026-06-05, so the prior `blocked-by:#28` future dependency is **satisfied**; what remained was this story seeding.

---

## Binding decisions (apply to ALL stories — pre-resolved from research, NO `[TBD]`)

| Concern | Decision | Source |
|---|---|---|
| Release pipeline | **CI → semver tag → BuildKit image build → cosign sign → publish** to GHCR + Verdaccio + Zarf bundle host. GH Actions are `workflow_dispatch`-only ([[curaos-local-ci-first-rule]]); the release pipeline is invoked deliberately, not on every push. | ADR-0110; [[curaos-local-ci-first-rule]] |
| Bundle format | **Zarf singular format** for air-gap; Compose for dev/home-lab; K8s manifests/Helm for cloud + hybrid. One artifact set, four profiles (cloud SaaS, on-prem, hybrid, home-lab/air-gap). | [[curaos-airgap-rule]]; [[curaos-orchestration-rule]]; ADR-0164 |
| Image build | **BuildKit** for dev/CI image builds; **Buildah** for the air-gap build path. Images digest-pinned. | [[curaos-image-build-rule]]; [[curaos-version-pinning-rule]] |
| Signing | **cosign** keyless/keyed signatures on every v1.0.0 image + Zarf bundle; SBOM attached (SBOM gate per AGENTS §8 security gates). | ADR-0110; AGENTS §8 |
| Version pinning | Exact pins; SHA-pin any GH Action; digest-pin every base + service image for the GA artifact. | [[curaos-version-pinning-rule]] |
| Docs stack | **Backstage TechDocs** (internal service/developer portal, MkDocs under the hood) + **MkDocs Material standalone** (customer-facing/offline/air-gap). Docusaurus = fallback only. Source Markdown stays in `ai/curaos/` mirror; doc-graph reachability preserved. API docs via **TypeDoc + `typedoc-plugin-markdown`** into `ai/curaos/<package>/docs/api/`. | research §Q2; ADR-0110; [[curaos-doc-graph-rule]] |
| Demo data | **Single watermarked synthetic demo tenant.** HealthStack = **Synthea** (FHIR R4/C-CDA/CSV); education = authored synthetic course/enrollment fixtures via education-core contracts; commerce/ERP = **`@faker-js/faker` + typed factories (`fishery`)**. Visible + machine-readable synthetic watermark on every name/SKU/email/document. **Presidio PHI/PII scan gate** rejects accidental real data. Never cross-link PHI into neutral/education payloads. | research §Q1; [[curaos-agent-eval-obs-rule]] |
| Onboarding wizard | First-run tenant bootstrap + admin user creation + branding upload; cloud profile completes < 15 min (acceptance #2). Builder-led where the M4 builder can express it (charter §3). | #29 acceptance §2; charter §3 |
| New owning repos | M15 introduces 4 deploy/docs repos as **real submodules** (NO staging/`_planned/` dirs, kebab-case, code-only per [[curaos-repo-boundary-rule]]): `curaos-deploy`, `curaos-docs-site`, `curaos-website`, `curaos-onboarding`. Each repo-creation folds into its owning story; ai-docs land under `ai/curaos/<mirror>`. | charter §1; [[curaos-repo-boundary-rule]] |
| In-flight generator/SDK barrier | Do NOT dispatch any story that scaffolds/regenerates while ANY codegen / `@curaos/*-sdk` / `@curaos/contracts` lane carries `agent-claimed:*` or `agent-PR-open`. | [[curaos-generator-evolution-rule]] |

**Per-story DoD addendum (all stories):** `just ci` / `bun run ci` green (paste verbatim stdout per [[curaos-local-ci-first-rule]]); release/bundle stories prove the artifact builds + signs reproducibly (cosign verify + SBOM present); `Requirements.md` + `AGENTS.md` + `CONTEXT.md` under the new repo's `ai/curaos/<mirror>/`; DOC-GRAPH refresh; `ai/curaos/docs/ISSUE-ROADMAP.md` row; roadmap mirror; ai-mirror gate green; new submodule pointer committed in `curaos/` parent.

---

## Wave order (native `blocked-by` dependency edges)

**Seeded issues (2026-06-06):** S1 #510 · S2 #511 · S3 #512 · S4 #513 · S5 #514 · S6 #515 · S7 #516 · S8 #517 — all native sub-issues of #29, Project `M15`/`Backlog`, `foresight`-quarantined.

```text
WAVE 1 (roots — no upstream GA artifact)
  Story 1 (#510) release-pipeline (curaos-deploy)        blocked-by: []   (every bundle + image needs the signed build path)
  Story 2 (#511) synthetic demo-tenant seed              blocked-by: []   (watermarked Synthea + factory fixtures + PHI scan)

WAVE 2 (depend on the signed pipeline / seed)
  Story 3 (#512) signed v1.0.0 bundles (4 profiles)      blocked-by: [#510]
  Story 4 (#513) docs site (TechDocs + MkDocs Material)  blocked-by: [#510]
  Story 5 (#514) first-run onboarding wizard             blocked-by: [#511]

WAVE 3 (depend on bundles + docs + wizard + seed)
  Story 6 (#515) public website refresh                  blocked-by: [#513]
  Story 7 (#516) public demo tenant provisioning         blocked-by: [#511, #512, #514]
  Story 8 (#517) GA acceptance E2E (install-from-scratch) blocked-by: [#512, #514, #516]
```

---

## Story 1 — Release pipeline (`curaos-deploy`)

**Frontmatter:** `type: story · module: release-pipeline · milestone: M15 · cycle: C6-Production-Hardening · initiative: Self-hosted · priority: critical · effort: L · parent: #29 · blocked-by: [] · foresight: true`

**Scope:** Create the `curaos-deploy` submodule. Implement the deliberate release pipeline: CI gate → semver tag → BuildKit image build (digest-pinned bases) → cosign sign + SBOM attach → publish to GHCR (images) + Verdaccio (packages) + Zarf bundle host. GH Actions `workflow_dispatch`-only.

**Acceptance:** A dry-run release of a sample service produces a cosign-verifiable signed image + attached SBOM in GHCR; pipeline definition committed; version pins exact + Actions SHA-pinned. `cosign verify` passes in the DoD evidence.

**Event producers/consumers:** Produces release artifacts (consumed by Stories 3, 7). No runtime domain events.
**Must-not-break:** existing `just ci` local gate; [[curaos-version-pinning-rule]]; GHCR/Verdaccio auth.

## Story 2 — Synthetic demo-tenant seed

**Frontmatter:** `module: demo-seed · priority: high · effort: L · parent: #29 · blocked-by: [] · foresight: true`

**Scope:** Build the watermarked synthetic demo tenant seed. HealthStack via Synthea (FHIR R4/C-CDA/CSV → HealthStack import/interop → patient/encounter/clinical-doc/orders). Education via education-core contracts (course/enrollment/activity/assessment). Commerce/ERP via `@faker-js/faker` + `fishery` typed factories (catalog/order/invoice/payment/stock). Visible + machine-readable synthetic watermark on all PII-shaped fields. Presidio PHI/PII scan gate that REJECTS non-watermarked/real-looking data.

**Acceptance:** Seed produces a reproducible demo tenant; Presidio scan gate passes (0 real-PHI hits); watermark assertion passes on every entity; cross-domain links never carry PHI into neutral/education payloads.
**Event producers:** Health/education/commerce producer paths per research §Q1. **Consumers:** onboarding wizard (S5), demo tenant (S7), docs tutorials (S4), GA E2E (S8).
**Must-not-break:** PHI boundary; neutral no-PHI contracts; audit chain; tenant isolation; `@curaos/healthstack-phi-boundary` Layer-6 schemas.

## Story 3 — Signed v1.0.0 bundles (4 deployment profiles)

**Frontmatter:** `module: release-bundles · priority: critical · effort: L · parent: #29 · blocked-by: [#510] · foresight: true`

**Scope:** Produce v1.0.0 signed bundles for all 4 profiles: cloud SaaS (K8s/Helm), on-prem (K8s), hybrid (control-plane + data-plane split), home-lab/air-gap (Zarf singular format via Buildah). Compose for dev/home-lab. All images digest-pinned, bundles cosign-signed.

**Acceptance:** Each of the 4 profile bundles builds + signs; air-gap Zarf bundle assembles with zero external egress at deploy time; `cosign verify` passes per bundle.
**Must-not-break:** [[curaos-airgap-rule]] zero-egress; [[curaos-orchestration-rule]] profile parity; ADR-0164 Zarf layout.

## Story 4 — Docs site (Backstage TechDocs + MkDocs Material)

**Frontmatter:** `module: docs-site (curaos-docs-site) · priority: high · effort: M · parent: #29 · blocked-by: [#510] · foresight: true`

**Scope:** Create `curaos-docs-site` submodule. Internal: per-service Markdown → `mkdocs.yml`/catalog metadata → CI TechDocs build → Backstage docs tab. External: curated customer/operator Markdown → MkDocs Material standalone static → hosted behind NGINX/K8s + GitHub Pages (cloud) + Zarf bundle (air-gap). API docs via TypeDoc + `typedoc-plugin-markdown` into `ai/curaos/<package>/docs/api/`. LLM-wiki + doc-graph reachability preserved.

**Acceptance:** Docs site builds + search works (browser-side MkDocs Material search); offline/air-gap static output renders; doc-graph reachability intact (`scripts/check-doc-graph.js` green); TypeDoc API docs present.
**Must-not-break:** doc graph; ADR-0110; repo-boundary; Markdown source readability for agents.

## Story 5 — First-run onboarding wizard (`curaos-onboarding`)

**Frontmatter:** `module: onboarding (curaos-onboarding) · priority: high · effort: M · parent: #29 · blocked-by: [#511] · foresight: true`

**Scope:** Create `curaos-onboarding` submodule. First-run wizard: tenant bootstrap + admin user creation + branding/theme upload. Builder-led where the M4 builder expresses it. Uses the demo seed (S2) for the guided-tour path.

**Acceptance:** Cloud-profile wizard completes a tenant bootstrap + admin + branding in < 15 min (acceptance #2 of #29); idempotent re-run; tenant isolation enforced.
**Must-not-break:** identity/tenancy contracts; RBAC; tenant isolation.

## Story 6 — Public website refresh (`curaos-website`)

**Frontmatter:** `module: website (curaos-website) · priority: medium · effort: M · parent: #29 · blocked-by: [#513] · foresight: true`

**Scope:** Create `curaos-website` submodule. Public site refresh (chosen domain) linking the docs site (S4), demo tenant (S7), and release artifacts.

**Acceptance:** Site builds + deploys; links to docs + demo resolve; offline build artifact for air-gap brochure-ware.
**Must-not-break:** docs-site links; brand bundle (i18n/RTL per NFR §6 localization).

## Story 7 — Public demo tenant provisioning

**Frontmatter:** `module: demo-tenant · priority: high · effort: M · parent: #29 · blocked-by: [#511, #512, #514] · foresight: true`

**Scope:** Provision + expose a public watermarked demo tenant from the signed bundle (S3), seeded by S2, bootstrapped via the wizard (S5). Reachable, reset-on-schedule, read-mostly.

**Acceptance:** Demo tenant reachable from public network; seeded data present + watermarked; scheduled reset works; PHI scan gate clean.
**Must-not-break:** tenant isolation; PHI boundary; the watermark/Presidio gate from S2.

## Story 8 — GA acceptance E2E (install-from-scratch)

**Frontmatter:** `module: ga-acceptance · priority: critical · effort: M · parent: #29 · blocked-by: [#512, #514, #516] · foresight: true`

**Scope:** End-to-end GA acceptance proving #29 acceptance §1: an external user installs from scratch on (a) public cloud k8s, (b) air-gap home lab, (c) hybrid — each reaching a working first-run wizard + demo flow. Cross-vertical demo (enroll student + place purchase order in isolated tenants) where M13 overlays are present.

**Acceptance:** All 3 install profiles reach a green first-run + demo; signed v1.0.0 verified at install; docs install-guide matches reality; acceptance §1-§5 of #29 met.
**Must-not-break:** all prior-milestone acceptance; the 4-profile parity; air-gap zero-egress.

---

## Seeding checklist (orchestrator, at M15 activation)

1. For each Story above: `gh issue create` with the frontmatter + body; label `foresight` + `enhancement` (NOT `ready-for-agent` until M15 dispatch).
2. Wire native sub-issue edges: each Story `parent` = #29; apply `blocked-by` per the wave graph (resolve the `#StoryN` placeholders to real issue numbers once created).
3. Project fields: add each to `CuraOS Roadmap`, set `curaOS Milestone = M15`, `Status = Backlog`, `Priority`/`Effort`/`Issue Kind` from frontmatter.
4. Create the 4 new submodules (`curaos-deploy`, `curaos-docs-site`, `curaos-website`, `curaos-onboarding`) as part of their owning Story (S1/S4/S6/S5), real repos, no staging dirs.
5. Keep all 8 quarantined Backlog until M15 is explicitly activated (the `blocked-by:#28` future dependency is already satisfied — #28 CLOSED 2026-06-05).
