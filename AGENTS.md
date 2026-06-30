# AGENTS.md - CuraOS Workspace

Workspace root for **CuraOS** (Care Oriented Stack) + sibling projects. Lives outside any single repo so every CLI agent (Claude Code, Codex, Gemini, OpenCode, Cursor, Aider) gets shared intent + guardrails before touching a sub-project.

**Tech-agnostic by design.** No language/framework/runtime/vendor at workspace level. Sub-projects pick stack on review. This file = **values, intentions, requirements, contracts**.

---

## 1. Workspace Layout

```
curaos-workspace/
├── AGENTS.md          # this file
├── CLAUDE.md          # @AGENTS.md import
├── ai/
│   ├── rules/         # canonical workspace rules (cross-CLI) - see §15
│   ├── curaos/        # 1:1 mirror of curaos/ tree (agent docs only, no code)
│   └── research/      # research + standards artifacts
└── curaos/            # primary product repo (code only)
    ├── README.md      # human entry
    ├── CHANGELOG.md
    ├── backend/{services,packages}/<kebab>/  # submodules (code only)
    ├── frontend/{apps,packages}/<kebab>/      # submodules (code only)
    └── ops/
```

**Hard rules:**
- `curaos/` + submodules = CODE + README + CHANGELOG + build files ONLY. No agent docs.
- All agent artifacts (AGENTS.md, CONTEXT.md, Requirements.md, ADRs, RFCs, specs) live under `ai/curaos/<mirror-path>/`.
- `ai/curaos/<path>` MUST be 1:1 structural mirror of `curaos/<path>`. Same-commit sync on add/rename/move. Drift check: `scripts/check-ai-mirror.sh`. See [[curaos-ai-mirror-rule]].
- Naming: kebab-case only. Snake_case + wrapper dirs (`curaos-apps/`, `cura_os/`) FORBIDDEN. Staging/`_planned/` dirs FORBIDDEN - create real submodule first.
- Per-module AGENTS.md = cross-CLI standard: YAML frontmatter (superseded `codex.json`) per [[curaos-agents-md-schema-rule]] + body links its CONTEXT.md + Requirements.md.

Sibling projects land as peers of `curaos/`; ai-docs under `ai/<sibling>/`.

---

## 2. Mission

Build **CuraOS** - composable platform. Generic neutral core + opt-in vertical overlays (Health, Education, ERP). Ship small, ship independently, compose per tenant/market.

Workspace agent role: keep core + overlays aligned. No duplication, no drift, no reverse coupling.

---

## 3. Charter (immutable)

- **Self-hosted first.** Deployable on customer infra. No managed-cloud lock-in. Hybrid + air-gap supported.
- **Generic before vertical.** Reusable neutral first. Verticals extend, never fork.
- **Composable.** Services/libs/clients ship independently, combine per tenant.
- **Builder-led.** All experiences via workflow/BPM engine + app/site builder.
- **Event-led.** Durable messaging primary; sync APIs secondary. Versioned contracts.
- **Documented seams.** Extension points + config hooks + data contracts published.
- **Multi-tenant.** SaaS + on-prem + hybrid from one codebase.
- **Tenant data isolation.** PHI/PII stays in overlay schemas. Neutral services = references + metadata only.

---

## 4. Deployment Models (all must stay viable)

| Model | Tenancy | Notes |
|---|---|---|
| Cloud SaaS | Per-tenant (schema or DB) | Vendor managed, horizontal scale |
| On-Prem | Single tenant | Customer infra, overlays opt-in |
| Hybrid | Vendor control plane + customer data plane | Audit + secrets on customer infra |
| Home lab / air-gap | Single tenant offline | Same artifacts, zero external calls |

Provision via self-hosted automation. No proprietary cloud-only IaC.

---

## 5. Domain Map (tech-agnostic)

### 5.0 Platform Foundation
- **Workflow/BPM Core** - orchestrates human tasks + automation + SLA. Every domain routes through.
- **App/Site Builder** - generates admin/ops/external surfaces from BPM defs + domain contracts + theming.
- **Automation Core** - low-code actions, connectors, scheduling.

### 5.1 Neutral Capabilities (generic, vertical-agnostic)

Identity, Tenancy, Org, Party, Audit, Settings, Notify, Search, Reports, Storage, Calendar, Tasks, Documents, Geospatial, Fleet, Commerce, Sales, Procurement, Inventory, HR, CRM, Accounting, E-Sign, Conversion, Donation, Event, Integrations, Site.

Each starts with the neutral `*-core-service` owner. `personal-*` and `business-*` variants are created only when [[curaos-triplet-split-rule]] names a divergent subject owner, domain behavior, protected storage need, and downstream consumer; no blanket triplet scaffolding.

### 5.2 Vertical Overlays (opt-in, extend core only)

- **HealthStack** - patient, encounter, scheduling, clinical docs, orders, lab, meds, imaging, claims, consent, interop, EMS, terminology, devices, care plans, quality.
- **EducationStack** - student lifecycle, course authoring, accreditation.
- **ERP** - extended commerce + business ops.

**Dependency direction: vertical → neutral. Never reverse.** CI must guard.

---

## 6. Non-Functional Requirements (commitments)

- **Performance** - sub-second P95 reference load. Async jobs start quickly.
- **Availability** - 99.9% monthly cloud profile.
- **Scalability** - stateless services, horizontal scale, partitioned state.
- **Security** - defense in depth. Strong auth (MFA + modern password hash + hardware key). RBAC + optional ABAC. Tamper-evident audit. Privilege escalation w/ approval. Break-glass logged w/ reason.
- **Privacy/Compliance** - GDPR + HIPAA. Consent enforcement. Subject-rights tooling. PHI boundary at schema + service.
- **Observability** - tracing + structured logs + metrics by default. Tenant-aware dashboards. Alert templates.
- **Localization** - full i18n. RTL. Locale-aware. Per-deployment legal/branding bundles.
- **Reliability** - idempotent writes, correlation IDs, outbox/inbox, retries w/ backoff, dead-letter.

---

## 7. Contracts (boundaries - must not break)

- **APIs** - versioned. Deprecation w/ sunset dates. Backward-compatible migrations.
- **Events** - durable, versioned schemas. Stable topic/stream naming. Outbox pattern.
- **Data** - semver across models/modules/schemas. All active versions honored until deactivated.
- **Mocks** - captured request/response = source of truth. Exercised in CI.
- **Demo/sample data** - app-visible demo, local dev, and live verification data MUST be real data persisted in the backing database through service-owned seeds or fixtures. Frontend/API mocks are allowed only for unit tests and CI e2e harnesses; they MUST NOT be the demo/runtime data plane.
- **Per-module docs** - every module ships `Requirements.md` + `AGENTS.md` w/ owners + deps + Done.

Naming (tech-agnostic):
- Services: `kebab-case` + `-service` suffix.
- Layer grouping: `<domain>-core-service`, `personal-<domain>-service`, `business-<domain>-service`.
- HealthStack clinical-overlay services use plain `<domain>-service` names; the `healthstack` boundary stays in namespaces, events, schemas, and docs.
- Namespaces mirror layer: neutral / healthstack / educationstack / erp.

---

## 8. Execution Standards

- **Docs** - every module: `Requirements.md` + `AGENTS.md` + ownership + Done. Every Markdown file stays in the generated doc graph via `bun scripts/check-doc-graph.js`; CI/agents enforce sync. The graph must keep a directed relationship path from root `AGENTS.md` to every Markdown file.
- **Reuse + DRY** - before adding code or docs, find the canonical owner and link/extend it. Cross-cutting policy lives in `ai/rules/`; ADRs link to rules instead of copying current rule text. See [[curaos-reuse-dry-rule]].
- **Generator-evolution** - root cause first, then shared fix. Every uncovered edge case in generated/scaffolded code (backend or frontend) folds back into the corresponding generator, SDK, or contract owner (`curaos/tools/codegen/` templates / emitters / playbooks / CLI flags / AST mutations / snapshot tests, `@curaos/*-sdk`, `@curaos/contracts`) in the same PR, OR via a `priority=critical` follow-up issue against that shared owner. Per-app or per-service manual fixes are last resort only after proving no shared owner can express the behavior; document that proof. Local-only hot-fixes leave the mold defective and are forbidden. Trio symmetry (core/personal/business + healthstack overlay) enforced. **In-flight generator/SDK barrier:** while ANY codegen/`@curaos/*-sdk`/`@curaos/contracts` lane carries `agent-claimed:*` OR `agent-PR-open`, downstream-milestone worker dispatch is BLOCKED - every service the next wave would produce inherits the defect the in-flight fix is removing (2x-3x more local hot-fixes than waiting). Proactive §3.4 triage of next-milestone Stories is permitted (label `blocked`). Override only on explicit user authorization. See [[curaos-generator-evolution-rule]].
- **Testing** - unit + integration (real deps, not mocked infra) + contract + E2E. Generated scaffolds may carry replayable mocks only for unit tests and CI e2e harnesses; demo/runtime data comes from database seeds.
- **CI/CD** - trunk-based, short-lived branches. Channels: stable / beta / canary.
- **Commits** - one accountable author only. Agents/subagents/reviewers must not add `Co-authored-by:`, `Generated-by:`, `AI-assisted-by:`, `Agent-ID:`, `Agent-Model:`, `Task-Issue:`, `Worktree:`, or similar AI/tool attribution trailers. Use concise Conventional Commits: `type(scope): imperative summary`; body only when it adds why/evidence; footers only for issue refs, breaking changes, or required sign-off.
- **Security gates** - SAST + DAST + SBOM + dependency pinning + pre-commit secret scan.
- **Observability** - instrumentation default-on, never opt-in.
- **Automation** - reproducible scripts provision envs + register test mocks + seed database-backed demo/integration data across tenants.

---

## 9. Definition of Done (workspace)

Change = done when:
1. Lands as neutral if reusable; vertical only if truly vertical.
2. Paired `Requirements.md` + `AGENTS.md` updated w/ owners + deps + Done.
3. Contracts (API/event/data) versioned; deprecations announced.
4. Tests unit/integration/contract/E2E green.
5. Observability + security gates green.
6. Tenant isolation respected; PHI/PII boundary preserved.
7. Docs (ADR, RFC, workflow, spec) reflect new state.
8. `ai/curaos/docs/DOC-GRAPH.md` refreshed and `bun scripts/check-doc-graph.js` passes for Markdown changes.
9. No duplicated canonical code or doc policy added; reusable behavior/decision text has one owner and links from consumers.
10. Submodule pointer in `curaos/` updated if work landed in submodule.

No deferrals without explicit user approval (§11).

---

## 10. Agent Operating Rules (every turn)

- **Read repo context first.** Target's `AGENTS.md` + `README.md` + `Requirements.md` + `CONTEXT.md` + `justfile` + build manifest. Project config wins.
- **Symphony-first workflow selection.** For every CuraOS request, choose the matching Symphony-aligned repo workflow for the active harness before freeform execution: Claude uses native `Workflow`, Agent Workflow Kit uses `workflow-run`, and Hermes, Codex, Gemini, OpenCode, Cursor, Aider, and other harnesses execute the same `docs/agents/workflows/<name>.md` playbook natively with their own tools. If no playbook fits, run the closest context-load/local-issue path and capture a local follow-up to add or extend the workflow.
- **Local issue hierarchy for all work.** Every task, subtask, blocker, follow-up, and verification lane gets a row in `.scratch/state/symphony-work/local-issues.sqlite` before it becomes invisible chat-only work. Find the existing main issue first; make the work a child issue via `parent_id` unless it qualifies as its own main issue because it owns a durable deliverable, cross-module epic, or explicit roadmap outcome. CLI + GitHub-mirror commands + the version gate: [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) ("Local-first issue CLI"). Only execute issues whose `Target Version` is the active release; file higher-version work forward and leave it pending. See [[curaos-version-planning-rule]].
- **Lane size before lane count.** Use standalone `macro-subagent-orchestration` for broad CuraOS waves before adding more agents; do not also load the micro subagent skills for the same wave. Local issue rows may be fine-grained, but worker lanes and PRs must bundle compatible work first. Pack every child issue, blocker fix, verification item, doc update, generated artifact, and follow-up that shares the same `owner_path`, checkout, target branch, and verification surface into one coherent lane. Split smaller only for working-tree collision, generator/SDK barrier, high-risk review isolation, pointer-chain level, runtime dependency, merge dependency, or explicit user request; record the split reason in the local issue event.
- **Codex shard fallback.** If Codex live subagents hit a six-agent runtime ceiling despite config allowing more, keep those six parent-session slots on the highest-priority macro lanes and launch one `codex exec` orchestrator shard for each additional block of up to six collision-free lanes. Record every shard command, lane batch, evidence path, and result in the local issue tracker.
- **Root cause before instance patch.** When a defect appears in a generated app, service, chart, SDK, route map, docs page, or contract, inspect the generator/SDK/contract source first and prefer a shared fix plus regeneration. Do not start with one-off per-app/per-service edits unless the shared owner is proven inapplicable.
- **No premature stack commitment.** Workspace-level: never pick lang/framework/tool. Propose 2-3 options vs §3 + §6. Wait for user.
- **Generic before vertical.** Reject vertical forks of core. Push extension points.
- **Builder + BPM first.** Can workflow engine + builder express this? If yes → configure not code.
- **Event-led default.** Cross-service interaction → durable event. Sync only when latency/query shape demands.
- **Data boundary check.** PHI/PII → overlay schema, not neutral.
- **Submodule awareness.** `curaos/backend/services/*` + `curaos/frontend/{apps,packages}/*` = git submodules. Commits in submodule repo; pointer updates in parent.
- **Tech-agnostic writing.** Workspace docs (this file, sibling intents) → no language/framework/vendor names. Stack picks in per-repo `Requirements.md` post-review.
- **Trust-but-verify subagent output.** Run status + diff + tests after every agent report.
- **Wave ask before broad orchestration.** When a harness sees enough open work, newly unblocked work, or blocked prerequisites to justify a batch, ask the user whether to run a ready-open-issues wave or an unblock-prep wave. Do not silently launch broad waves; once approved, run the wave to a fully verified stop state using the matching Symphony workflow.

---

## 11. Boundaries + Approvals

- **Never start unapproved scope.** Mid-work improvement → propose + wait. Self-induced regression fix = recovery, no re-approval.
- **Never defer approved work silently.** Done = fully done this session. Blocked? Name blocker, ask defer-or-proceed.
- **Never assign tasks to user.** Agent proposes + executes when authorized. Never "you should run X" / "next steps for you". Acceptable: "I can do X, want me to?"
- **Destructive ops = explicit confirm.** `rm -rf`, force push, schema drops, `terraform destroy`, submodule deinit - pause + ask same turn.
- **Submodule branch hygiene.** Never force-push shared branches. Never amend pushed commits. New commits only.

---

## 12. Per-Project Onboarding (read order on entry)

1. This file (workspace `AGENTS.md`).
2. **`ai/rules/README.md` + relevant `ai/rules/curaos_*.md`** - canonical decision rules. Rules are priority #1 for stack picks, banned tools, gates, naming, repo shape, and agent workflow.
3. **`ai/<repo>/docs/adr/RESOLUTION-MAP.md`** - ADR index + question status. ADRs are priority #2; read map before individual ADRs to know which ADR is superseded by a rule and what still needs user input.
4. `ai/<repo>/AGENTS.md` - repo agent contract.
5. `ai/<repo>/CONTEXT.md` - repo agent context.
6. `ai/<repo>/Requirements.md` - repo charter/spec.
7. Target repo `README.md` (human entry, in repo).
8. `ai/<repo>/docs/` - ADRs, RFCs, specs, workflows, compositions, submodule inventory.
9. Target repo build manifest (`Makefile`, build config) - never assume runner.

**Per-service/package** (e.g. `curaos/backend/services/identity-service/`):
- Code: `curaos/backend/services/identity-service/`.
- Agent artifacts: `ai/curaos/backend/services/identity-service/` w/ `AGENTS.md` + `CONTEXT.md` + `Requirements.md` (+ optional `AGENTS-sections/` per [[curaos-agents-md-schema-rule]] split pattern + `agents/` subfolder for extended specs).
- Read BOTH: ai-docs (intent) + repo (current code).

For `curaos/`: also read `curaos/.gitmodules`.

---

## 13. Stack-Review Workflow (per sub-project/service)

**Pre-flight (mandatory):**
- Read relevant `ai/rules/curaos_*.md` first. Rules are priority #1. If rule locks the answer → use it; do NOT re-propose stack picks.
- Read `ai/<repo>/docs/adr/RESOLUTION-MAP.md` second. ADRs are priority #2. If the relevant ADR's question is RESOLVED-RULE → follow linked rule. If STILL-OPEN → propose options below and wait.
- Read existing ADRs covering the module's area only after rule + map. ADR rationale is useful context, not higher priority than rules.

**Stack review (only when ADR/rule has not locked):**
1. Confirm charter (§3) + NFRs (§6) the module must satisfy.
2. Identify integration points (events produced/consumed, contracts exposed).
3. Propose 2-3 candidate stacks. Each: how it satisfies §3 + §6, ops cost, team-fit, deployment-model coverage (§4).
4. Wait for user pick.
5. Once picked: write decision into `ai/<repo>/<module>/Requirements.md` + new ADR under `ai/<repo>/docs/adr/`.
6. Update `ai/<repo>/<module>/CONTEXT.md` w/ stack-specific rules (linter/runner/test cmd) for future agents.
7. **Update `RESOLUTION-MAP.md`** + source ADR's Open Questions section + create/update relevant `ai/rules/curaos_*.md` if cross-cutting.

This file stays tech-agnostic forever.

## 13b. Rule + ADR precedence (when sources conflict)

| Source | Precedence | Notes |
|---|---|---|
| `ai/rules/curaos_*.md` (cross-cutting workspace rules) | 1 | Canonical for stack picks, banned tools, gates, naming, repo shape, and agent workflow |
| ADRs (`ai/curaos/docs/adr/*.md`) | 2 | Decision history + rationale. Lower than rules; Resolution Map points from ADR questions to current rule answers |
| Workspace `AGENTS.md` (this file) | 3 | Operating guardrails + read order. If this file conflicts with a rule decision, rule wins and this file must be patched |
| Module `AGENTS.md` + `AGENTS-sections/` | 4 | Per-module binding rules + sections (load on-demand per [[curaos-agents-md-schema-rule]]) |
| Module `CONTEXT.md` | 5 | Per-module integration map + rationale + decisions |
| Module `Requirements.md` | 6 | Per-module charter/spec |
| RFCs (`ai/curaos/docs/rfcs/*.md`) | 7 (historical) | Many superseded - check archival banners |

When sources conflict: higher-precedence wins; flag the conflict in PR; update the lower-precedence doc to reflect canonical pick. If rule + ADR conflict: rule wins; ADR gets resolution-pin banner per `RESOLUTION-MAP.md` convention.

---

## 14. Living Document

Prune stale rules. Add only what would cause concrete mistakes if missing. Test: "Would removing this cause an agent to misstep?" If no → cut.

Last updated: 2026-06-10.

---

## Agent skills

- **Issue tracker** - per-repo GitHub Issues across every `your-org` repo (workspace + curaos + all backend/frontend submodules; current count derivable from `curaos/.gitmodules`). Skill picks right repo per task. See `docs/agents/issue-tracker.md`.
- **Milestone issue seeding** - after scaffold/setup milestone completion and before implementation, seed roadmap + atomic `ready-for-agent` issues in GitHub. Current milestone state lives in `ai/curaos/docs/ISSUE-ROADMAP.md` and the HANDOVER; consult it for the active gate. See `docs/agents/issue-tracker.md`.
- **Roadmap project** - one org-level GitHub Project, `CuraOS Roadmap`, aggregates issues across repos. Do not create per-repo Projects by default. See `docs/agents/github-roadmap-project.md`.
- **Triage labels** - canonical 5 state labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) + 2 category labels (`bug`, `enhancement`); seeded across all org repos. Out-of-scope rejections → `.out-of-scope/<slug>.md` in host repo. See `docs/agents/triage-labels.md`.
- **Domain docs** - multi-context: per-module `CONTEXT.md` under `ai/curaos/` (no root CONTEXT.md); ADRs at `ai/curaos/docs/adr/`. See `docs/agents/domain.md`.
- **Adversarial grill reports** - cross-harness Tier-2 grill verdicts (Claude→Codex / Codex→Claude opposite-harness reviews per [[curaos-verification-stack-rule]]) live at `ai/curaos/docs/grills/<milestone-story>-pr<num>.md`. Re-grills append a `## Re-grill verification` section to the same file. **NEVER write grill reports to `.scratch/`** - that dir is for orchestrator-local lane state only and is wiped by worktree cleanup. See `ai/curaos/docs/grills/README.md` for the template + lifecycle.
- **Agent-workflow library** - deterministic-orchestration workflows (atomic + composite) as playbook+executor pairs: playbooks at `docs/agents/workflows/`, JS executors at `scripts/workflows/*.workflow.js`, contract synced by `scripts/check-workflow-sync.js`. Distinct from the product BPM/Flow-IR definitions under `ai/curaos/docs/workflows/`. See [`docs/agents/workflows/README.md`](docs/agents/workflows/README.md) + [design](docs/agents/workflows/HIERARCHY-DESIGN.md).

---

## 15. Workspace Rules

Canonical operating rules for every CLI agent (Codex, Gemini, OpenCode, Cursor, Aider, Claude Code) live as standalone files under [`ai/rules/`](ai/rules/README.md). Each file binding. Load before any non-trivial task.

<!-- BEGIN GENERATED: rule-index (node scripts/generate-rule-index.js --write) -->
| Rule | File |
|---|---|
| Agent eval + observability (DeepEval + Langfuse v3 + LiteLLM + Presidio) | [curaos_agent_eval_obs_rule.md](ai/rules/curaos_agent_eval_obs_rule.md) |
| AGENTS.md schema (per-module frontmatter + split pattern) | [curaos_agents_md_schema_rule.md](ai/rules/curaos_agents_md_schema_rule.md) |
| AI mirror (ai/curaos/ ↔ curaos/ 1:1) | [curaos_ai_mirror_rule.md](ai/rules/curaos_ai_mirror_rule.md) |
| Air-gap (Zarf singular format) | [curaos_airgap_rule.md](ai/rules/curaos_airgap_rule.md) |
| Architecture vision (injection molding) | [curaos_architecture_vision.md](ai/rules/curaos_architecture_vision.md) |
| Bun compile packaging (single-binary services, local==live compile parity) | [curaos_bun_compile_rule.md](ai/rules/curaos_bun_compile_rule.md) |
| Bun primary | [curaos_bun_primary_rule.md](ai/rules/curaos_bun_primary_rule.md) |
| Caveman terse communication (full/ultra; token-cut prose) | [curaos_caveman_rule.md](ai/rules/curaos_caveman_rule.md) |
| CLI agents stack (multi-primary Claude+Codex+Pi+Gemini+Aider+Cursor) | [curaos_cli_agents_rule.md](ai/rules/curaos_cli_agents_rule.md) |
| CNI (Cilium primary + sidecar-less mTLS) | [curaos_cni_rule.md](ai/rules/curaos_cni_rule.md) |
| Context engineering (Anthropic 5 criteria + BATS) | [curaos_context_engineering_rule.md](ai/rules/curaos_context_engineering_rule.md) |
| Decision methodology (interview funnel) | [curaos_decision_methodology.md](ai/rules/curaos_decision_methodology.md) |
| Demo/sample data (database-backed, no runtime API mocks) | [curaos_demo_sample_data_rule.md](ai/rules/curaos_demo_sample_data_rule.md) |
| Design generation (OpenDesign-driven, generator-ingestable) | [curaos_design_generation_rule.md](ai/rules/curaos_design_generation_rule.md) |
| Doc graph / LLM wiki maintenance | [curaos_doc_graph_rule.md](ai/rules/curaos_doc_graph_rule.md) |
| Error tracking (GlitchTip prod + Sentry SaaS dev) | [curaos_error_tracking_rule.md](ai/rules/curaos_error_tracking_rule.md) |
| Foresight + proactive task creation (capture discovered dependency work; triage relevant foresight like normal work) | [curaos_foresight_rule.md](ai/rules/curaos_foresight_rule.md) |
| Foundation runtime directives (NestJS) | [curaos_foundation_runtime_directives.md](ai/rules/curaos_foundation_runtime_directives.md) |
| Full-surface sweep (every page/view/action + real-API proof + docs/marketing alignment), local and live | [curaos_full_surface_sweep_rule.md](ai/rules/curaos_full_surface_sweep_rule.md) |
| Generator-evolution (every edge case feeds back into the generator) | [curaos_generator_evolution_rule.md](ai/rules/curaos_generator_evolution_rule.md) |
| HealthStack vision (patient-centric) | [curaos_healthstack_vision.md](ai/rules/curaos_healthstack_vision.md) |
| Image build (BuildKit dev/CI + Buildah air-gap) | [curaos_image_build_rule.md](ai/rules/curaos_image_build_rule.md) |
| Knowledge persistence (6-layer L1-L6) | [curaos_knowledge_persistence_rule.md](ai/rules/curaos_knowledge_persistence_rule.md) |
| Live ops substrate (build-host + example-homelab) | [curaos_live_ops_substrate_rule.md](ai/rules/curaos_live_ops_substrate_rule.md) |
| Local-CI-first (local `just ci` default gate + GH Actions `workflow_dispatch`-only + evidence-pasting) | [curaos_local_ci_first_rule.md](ai/rules/curaos_local_ci_first_rule.md) |
| Local vs 3rd-party provider | [curaos_local_vs_3rdparty_rule.md](ai/rules/curaos_local_vs_3rdparty_rule.md) |
| MCP stack (CLI-first + banned MCP list) | [curaos_mcp_stack_rule.md](ai/rules/curaos_mcp_stack_rule.md) |
| mem0 + Honcho cross-tool memory/personalization backend (self-hosted, via local MCP shims) | [curaos_mem0_memory_backend_rule.md](ai/rules/curaos_mem0_memory_backend_rule.md) |
| Memory ↔ ai/rules/ sync policy | [curaos_memory_agents_sync_rule.md](ai/rules/curaos_memory_agents_sync_rule.md) |
| Model tiering (per-harness only; no cross-harness auto) | [curaos_model_tiering_rule.md](ai/rules/curaos_model_tiering_rule.md) |
| Modulith + standalone duality | [curaos_modulith_standalone_rule.md](ai/rules/curaos_modulith_standalone_rule.md) |
| NestJS docs-first | [curaos_nestjs_docs_first_rule.md](ai/rules/curaos_nestjs_docs_first_rule.md) |
| No em-dashes (use hyphen, comma, semicolon, colon, or parentheses; zero em/en dashes in any output, doc, commit, issue, PR, or rendered content; ci.sh grep gate on content repos) | [curaos_no_em_dash_rule.md](ai/rules/curaos_no_em_dash_rule.md) |
| No Silent Block (never park work `blocked` in the background; same-turn escalation to user with exact unblock ask grouped by credential/approval/decision/live-infra + downstream cascade; exhaust build-host agent path first; batch all blockers; §11 not terminal while a clearable blocker is unsurfaced; re-escalate on resume; foresight marker is not an exemption for relevant work) | [curaos_no_silent_block_rule.md](ai/rules/curaos_no_silent_block_rule.md) |
| Orchestration (K8s prod + Compose/Bun dev + Zarf air-gap) | [curaos_orchestration_rule.md](ai/rules/curaos_orchestration_rule.md) |
| ORM (Drizzle / MikroORM / Kysely 3-tier) | [curaos_orm_rule.md](ai/rules/curaos_orm_rule.md) |
| Perf testing (k6 TS primary) | [curaos_perf_testing_rule.md](ai/rules/curaos_perf_testing_rule.md) |
| Ponytail lazy senior dev (YAGNI minimal code; ultra/full) | [curaos_ponytail_rule.md](ai/rules/curaos_ponytail_rule.md) |
| PostgreSQL (CNPG + DB-per-tenant + pgBouncer + SeaweedFS backup) | [curaos_postgres_rule.md](ai/rules/curaos_postgres_rule.md) |
| Quality gates (5-tier by cost) | [curaos_quality_gates_rule.md](ai/rules/curaos_quality_gates_rule.md) |
| Recommendation auto-apply (clear recommendation → take it, don't escalate; destructive-confirm + unapproved-scope-propose gates survive) | [curaos_recommendation_auto_apply_rule.md](ai/rules/curaos_recommendation_auto_apply_rule.md) |
| Repo boundary | [curaos_repo_boundary_rule.md](ai/rules/curaos_repo_boundary_rule.md) |
| Repo conventions (kebab-case + Conventional Commits + Turborepo) | [curaos_repo_conventions_rule.md](ai/rules/curaos_repo_conventions_rule.md) |
| Reuse + DRY for code and docs | [curaos_reuse_dry_rule.md](ai/rules/curaos_reuse_dry_rule.md) |
| RN E2E (Maestro primary) | [curaos_rn_e2e_rule.md](ai/rules/curaos_rn_e2e_rule.md) |
| Roadmap workflow (1 org Project + 7-layer hierarchy + sub-issues + Pocock skill flow + 9 canonical + 2 runtime labels + 10 fields + 10 views + Tier 1+2 automation + goal-gated Cycles) | [curaos_roadmap_workflow_rule.md](ai/rules/curaos_roadmap_workflow_rule.md) |
| Rolling update (no -v2 / -next / -new parallel paths - forward migration + feature flag + semver bump only) | [curaos_rolling_update_rule.md](ai/rules/curaos_rolling_update_rule.md) |
| Runtime decisions (stable-core + plugin/sidecar) | [curaos_runtime_decisions.md](ai/rules/curaos_runtime_decisions.md) |
| Self-serve, never hand the user work the agent can do | [curaos_self_serve_no_user_handoff_rule.md](ai/rules/curaos_self_serve_no_user_handoff_rule.md) |
| SLO mgmt (Pyrra + OpenSLO) | [curaos_slo_rule.md](ai/rules/curaos_slo_rule.md) |
| Speed patterns (generator-first Nx + Bun-native + Turborepo + Verdaccio + GHCR devcontainer) | [curaos_speed_patterns_rule.md](ai/rules/curaos_speed_patterns_rule.md) |
| Stack priorities | [curaos_stack_priorities.md](ai/rules/curaos_stack_priorities.md) |
| Swarm collaboration (bundle-first submodule lanes + GitHub Issues queue + uncapped collision-bounded lanes) | [curaos_swarm_collaboration_rule.md](ai/rules/curaos_swarm_collaboration_rule.md) |
| Symphony alignment for agent workflows and local-first orchestration | [curaos_symphony_alignment_rule.md](ai/rules/curaos_symphony_alignment_rule.md) |
| Triplet split (personal/business variants only for named divergent subject ownership + downstream consumer) | [curaos_triplet_split_rule.md](ai/rules/curaos_triplet_split_rule.md) |
| Validation (Zod 4 / Valibot / ArkType 3-tier) | [curaos_validation_rule.md](ai/rules/curaos_validation_rule.md) |
| Verification stack (3-tier T1/T2/T3 + cross-harness adversarial) | [curaos_verification_stack_rule.md](ai/rules/curaos_verification_stack_rule.md) |
| Verify-before-build / build-once-promote (runtime behavior proven locally BEFORE any image build or deploy) | [curaos_verify_before_build_rule.md](ai/rules/curaos_verify_before_build_rule.md) |
| Version pinning (latest stable + Renovate auto-PR + exact pins + SHA-pin Actions + digest-pin images) | [curaos_version_pinning_rule.md](ai/rules/curaos_version_pinning_rule.md) |
| Version-gated planning (Target Version top gate; v1 = M1-M17 working set; v1.1 = GA wave 2; future work filed forward never dropped; version working-set predicate = closure gate; scan/dispatch version-blind for parallelism) | [curaos_version_planning_rule.md](ai/rules/curaos_version_planning_rule.md) |
<!-- END GENERATED: rule-index -->

**Canonical source policy:** `ai/rules/` is single canonical store for workspace rules. Memory (`~/.claude/projects/.../memory/`) holds only non-rule auto-memory types (user/feedback/project/reference). See [[curaos-memory-agents-sync-rule]].


<!-- headroom:rtk-instructions -->
# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, prefix with `rtk` by default for stable,
non-interactive reads where compact filtered output is acceptable. Skip `rtk`
and run the raw command when freshness, streaming, interactivity, exact output,
or process state is the point.

## Key Commands
```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) - shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) - shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules
- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- On any second or repeated check of a live surface, skip `rtk` unless the command is known to be pure file content or static repo metadata. Repeated similar calls are where stale or cached output is most dangerous.
- Skip `rtk` for live or cache-sensitive checks: repeated `ps`, `pgrep`, `lsof`, `jobs`, `date`, workflow status, event tails, log tails, watches, and process-tree diagnostics.
- Skip `rtk` for orchestration monitoring and control: `agent-workflow-kit workflow-status`, `agent-workflow-kit workflow-events`, streamed `workflow-run`, `tmux` session checks, `tail -f`, and any command used to decide whether agents are still running or have advanced.
- Skip `rtk` for commands that are interactive, prompt for input, require a TTY, open a pager/editor, run a dev server, or keep a subscription/watch open.
- Skip `rtk` when debugging stale output, comparing near-identical calls, validating elapsed time, or checking whether a long-running process advanced.
- Skip `rtk` when the exact stdout, stderr, exit code, output ordering, or timing is evidence. If `rtk` and the raw command disagree, trust the raw command.
- `rtk proxy <cmd>` runs without filtering but still tracks usage. Use it only for non-cache-sensitive commands; do not use it for freshness-sensitive checks unless verified it cannot return cached or filtered output.
<!-- /headroom:rtk-instructions -->
