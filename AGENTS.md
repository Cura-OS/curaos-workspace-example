# AGENTS.md - Workspace Example

This repository is a sanitized example of a multi-agent engineering workspace. It shows the governance layer around a product repo, not the product itself.

## Layout

```text
.
├── AGENTS.md
├── README.md
├── SETUP.md
├── ai/
│   ├── example/
│   │   ├── AGENTS.md
│   │   └── CONTEXT.md
│   └── rules/
├── docs/
│   └── agents/
└── scripts/
```

## Rules

- Read this file before making project-specific changes.
- Keep product code out of this example.
- Keep secrets, customer data, private domains, private infrastructure, and internal roadmap details out of this repo.
- Store reusable agent rules under `ai/rules/`.
- Store project-specific agent context under `ai/example/`.
- Keep Markdown links local and valid.
- Do not add em dash or en dash characters.

## Agent Workflow

1. Read `README.md` and `SETUP.md`.
2. Read `ai/rules/README.md`.
3. Read the nearest project context under `ai/example/`.
4. Make the smallest change that keeps the example useful and sanitized.
5. Run the documented checks before committing.

## Checks

```bash
python3 scripts/check-public-docs.py
gitleaks detect --no-banner --redact
```

## Rule Index

Generated from `ai/rules/*` frontmatter by `node scripts/generate-rule-index.js --write`. Do not edit the table by hand.

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
