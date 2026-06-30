# Docs - Index

**Last updated:** 2026-06-27

## Current state

> Live execution state (active milestone, in-flight issues, blockers) lives in [HANDOVER.md](HANDOVER.md) + [ISSUE-ROADMAP.md](ISSUE-ROADMAP.md), regenerated from the tracker by `scripts/session-closeout` at every session close.
> For live state, HANDOVER + tracker WIN over auto-memory and over phase/milestone text in CONTEXT.md-class docs (precedence: [knowledge-persistence rule](../../rules/curaos_knowledge_persistence_rule.md) "Live-state precedence").
> Never trust a hardcoded "M(N) in flight" claim in a static doc; static docs carry pointers, not milestone numbers.

Canonical planning location for all CuraOS architectural decisions, product specifications, and
delivery guidance. Code lives in `curaos/` and its submodules. Everything agents need to plan and
reason about the platform lives here.

---

## Quick Navigation

| Need | Go to |
|---|---|
| Platform charter + vision | [adr/0099-charter-priorities-vision.md](adr/0099-charter-priorities-vision.md) |
| NestJS runtime decision | [adr/0100-foundation-platform-runtime.md](adr/0100-foundation-platform-runtime.md) |
| Cross-cutting baseline rules | [adr/0150-baseline-alignment-rules.md](adr/0150-baseline-alignment-rules.md) |
| Full ADR status table | [CONTEXT.md](CONTEXT.md) |
| Structured platform spec | [../Requirements.md](../Requirements.md) |
| Phase 3 entry + build order | [delivery-roadmap.md](delivery-roadmap.md) |
| How to start coding | [development-kickoff.md](development-kickoff.md) |
| Agent rules + mandatory deps | [../AGENTS.md](../AGENTS.md) |
| ADR cross-ref by topic | [CONTEXT.md §2](CONTEXT.md#2-cross-reference-index-by-topic) |
| Local CI gate + manual GH trigger | [ci-local.md](ci-local.md) |
| Operator unblock queue (generated) | [OPERATOR-QUEUE.md](OPERATOR-QUEUE.md) |
| Symphony orchestration research | [research/2026-06-27-symphony-orchestration-alignment.md](research/2026-06-27-symphony-orchestration-alignment.md) |
| External-source enrichment (XSRC) plan + ADRs | [external-source-enrichment/README.md](external-source-enrichment/README.md) |

---

## Subdirectory Map

### `adr/` - Architecture Decision Records

56 ADRs covering charter through Wave 1 Lite cluster decisions and M9 Diamond model (0096-archived → 0211).

**Canonical read order for new contributors:**
1. `0099-charter-priorities-vision.md` - canonical root
2. `0100-foundation-platform-runtime.md` - NestJS decision
3. `0150-baseline-alignment-rules.md` - cross-cutting rules
4. `0120-foundation-auth.md` · `0121-foundation-builder.md` · `0122-foundation-workflow-manager.md` · `0123-foundation-codegen-plugin.md` - four foundation products
5. `0151-cross-cluster-coherence.md` + `0152`-`0164` - findings + resolutions (incl. DA13 batch + Zarf layout)
6. `0200`-`0211` - Wave 1 Lite cluster decisions (~91 services) + M9 Diamond model + cosign offline contract

**Naming:** `<number>-<kebab-title>.md`. Sub-ADRs: `0121a-` through `0121e-`.

**Status values:** ACCEPTED · DRAFT · INFORMATIONAL · SUPERSEDED · ARCHIVED.
ADR-0099 wins all conflicts until the conflicting ADR is explicitly re-validated.

**Supersession chain highlights:**
- ADR-0104 → superseded by ADR-0120 (Auth)
- ADR-0105 → superseded by ADR-0122 (Workflow)
- ADR-0098 recommendation → superseded by ADR-0100 (NestJS)
- ADR-0121 §7 isolation → superseded by ADR-0161 (Clinical SLA)
- ADR-0115 §2.4 HIPAA → superseded by ADR-0162 (HIPAA 2026)

---

### `research/` - Companion Research Documents

Deep research docs produced as companions to specific ADRs.

| File | Companion ADR |
|---|---|
| `0099-vision-oss-landscape.md` | ADR-0099 (2098 lines - OSS landscape scan) |
| `0120-auth-research.md` | ADR-0120 |
| `0121-builder-research.md` | ADR-0121 |
| `0121-builder-canvas-research.md` | ADR-0121 |
| `0122-workflow-research.md` | ADR-0122 |
| `0123-codegen-plugin-research.md` | ADR-0123 |
| `2026-06-27-symphony-orchestration-alignment.md` | Symphony agent workflow adoption plan |

Naming convention: `<adr-number>-<topic>.md`.

---

### `specs/` - Per-Feature Detailed Specifications

Detailed requirements that feed service-level `CONTEXT.md` and `Requirements.md` files.

Current contents: `audit-service/baseline.md`, `cbcf/`, `cfdl/`.

Naming convention: `<domain>-<feature>.md` (e.g., `auth-scim-provisioning.md`).

---

### `rfcs/` - Forward-Looking Proposals

Multi-service proposals that coordinate before crystallizing into ADRs.

Current contents: `RFC-0001-curaid.md`, `RFC-0002-curaflow.md`, `RFC-0003-curabuilder.md`. Many RFCs are historical (precedence #7) - check for archival banners per §13b.

Naming convention: `<number>-<kebab-title>.md`.

---

### `workflows/` - Workflow Definitions

Temporal workflow definitions + Activepieces flow YAML for platform-level processes (tenant
provisioning, audit export, billing meter events, etc.).

Current contents: `README.md`, `identity-admin-enrollment.json`, `m2-package-publishing.md`.

---

### `compositions/` - Builder Composition Blueprints

CuraOS Builder Suite composition definitions - templates for common tenant UIs (admin console,
patient portal, learner dashboard, etc.).

Current contents: `README.md`, `identity-hosted-login.json`.

---

### `grills/` - Cross-Harness Tier-2 Grill Verdicts

Adversarial grill reports from Tier-2 cross-harness reviews (Claude→Codex / Codex→Claude).
Re-grills append a `## Re-grill verification` section to the same file.
Template and lifecycle: [`grills/README.md`](grills/README.md).

---

### `proposals/` - In-Flight Design Proposals

Design proposals under active review before crystallizing into ADRs or RFCs. Current contents: `roadmap-workflow-design.md`.

---

### `ops/` - Operations Runbooks

Operational guidance: instrumentation setup, Grafana dashboard references, alert runbooks, secret
rotation cadence, DR procedures. See `ops/instrumentation.md` when wiring services to telemetry.

### `runbooks/` - Release and Incident Procedures

Step-by-step operator runbooks for release install, rollback, recovery, and other procedures that
span repo code plus `ai/curaos/docs/adr/` decisions. Start with
[`runbooks/m8-airgap-install.md`](runbooks/m8-airgap-install.md) for the M8 offline Zarf install and
rollback flow.

---

### Submodule inventory

The canonical submodule inventory is [`curaos/.gitmodules`](../../../curaos/.gitmodules). No `submodules/` directory exists under `ai/curaos/docs/`. Scan `.gitmodules` directly to discover service paths.

Current HealthStack naming reconciliation inventory: [`research/2026-06-04-healthstack-submodule-naming-inventory.md`](research/2026-06-04-healthstack-submodule-naming-inventory.md).

---

## Delivery Standards

- Version docs alongside code. Doc updates land in the same PR as behavior changes.
- Cross-link specs to the modules they inform; mark whether content targets generic platform or overlay.
- Markdownlint + Vale in CI - doc failures are blocking.
- No sensitive data in repo - reference secure stores for credentials and regulated records.
- ADR numbers are sequential; do not reuse retired numbers.
- External URLs in ADRs must note the date accessed.

---

## References

- [Requirements.md](Requirements.md) - docs-layer charter
- [CONTEXT.md](CONTEXT.md) - ADR inventory + cross-ref index
- [delivery-roadmap.md](delivery-roadmap.md) - phased build sequence
- [development-kickoff.md](development-kickoff.md) - how to start coding
- [../Requirements.md](../Requirements.md) - platform-level structured spec
- [../CONTEXT.md](../CONTEXT.md) - workspace-level current state
- [../AGENTS.md](../AGENTS.md) - agent operating contract
