---
name: curaos-symphony-alignment-rule
title: Symphony alignment for agent workflows and local-first orchestration
description: Symphony alignment: repository-owned workflow contracts, isolated per-work-item runs, strict prompt rendering, single-authority orchestration state, retry and reconciliation, local-first progress ledger with explicit GitHub sync, and harness-neutral adapters for Claude, Codex internal harness tools, Agent Workflow Kit, Hermes, and other agents.
---

# CuraOS Symphony Alignment Rule

Binding rule: OpenAI Symphony is an input specification for CuraOS agent orchestration. It strengthens the existing CuraOS workflow library; it does not replace CuraOS gates, tracker policy, local CI, or harness routing.

## Required behavior

1. Every reusable agent workflow must have a repository-owned playbook contract that a non-owning harness can read and execute.
1a. Every CuraOS request starts by selecting the matching Symphony-aligned repository workflow for the active harness before freeform execution. Claude uses native `Workflow`. Codex uses internal Codex harness tools and skills first: `multi_agent_v1` subagents, Codex app tools, `tool_search`-discovered capabilities, native skill loading, local issue rows, and direct playbook execution. Agent Workflow Kit uses `workflow-run` only when the active harness is not Codex or the user explicitly requests that CLI path. Hermes, Gemini, OpenCode, Cursor, Aider, and generic harnesses execute the same playbook natively with their own tools while preserving gates and evidence. If no playbook fits, use the closest context-load/local-issue path and file a local follow-up to add or extend the workflow.
2. Every executable workflow must keep a machine-checkable contract in sync with the playbook through `scripts/check-workflow-sync.js` or the successor conformance gate.
3. Workflow contracts must map the Symphony concepts explicitly: tracker adapter, polling cadence, workspace root, lifecycle hooks, agent runner, prompt template, validation errors, issue state, retry, reconciliation, observability, and safety posture.
4. Claude Code uses its native `Workflow` runner when available. Codex must not route CuraOS orchestration through `agent-workflow-kit workflow-run`, `workflow-status`, or `workflow-events` by default. Codex runs repository playbooks natively with internal Codex harness tools, skills, subagents, local issue tracking, and visible progress updates. Non-Codex harnesses that have Agent Workflow Kit may use `agent-workflow-kit workflow-run`. Hermes and other harnesses without either layer execute the playbook natively using their own tools, while preserving the same contract, gates, evidence, and tracker semantics.
5. GitHub is the CuraOS tracker adapter. Do not import Symphony's Linear-only assumptions as policy. Keep GitHub calls REST-first, cached, diff-first, and explicit-sync only.
6. Codex app-server is one runner adapter, not the universal execution model. Codex-only settings stay behind an adapter boundary. Do not make Hermes, Claude, or generic playbooks depend on Codex fields.
7. Local-first tracking is mandatory for Symphony adoption work. Machine issue state must persist in local SQLite at `.scratch/state/symphony-work/local-issues.sqlite`; markdown ledgers are human summaries. GitHub sync happens only at explicit checkpoints for PRs, commits, issue seeding, or a deliberately requested roadmap mirror refresh. Once an explicit sync checkpoint exists, sync is dual-way by default: add safe missing local issue or Project data to GitHub, then pull GitHub issue, comment, hierarchy, and Project state back into SQLite.
7a. Local issue tracking is mandatory for all CuraOS agent work, not only adoption work. Every task, subtask, blocker, follow-up, and verification lane gets a local issue row before it becomes invisible chat-only work. Agents must find the existing main issue first and attach child work with `parent_id`; create a new main issue only for a durable deliverable, cross-module epic, or explicit roadmap outcome.
7b. Git sync recovery is preserve-first. Never reset, clean, revert, checkout over, overwrite, delete, or discard dirty local work to make orchestration state look clean. When root, parent, or nested submodule state is dirty or divergent, freeze broad dispatch, inventory every affected checkout, attach scan, dispatch, verify, and follow-up child rows to the local issue, push WIP branches or draft PRs, then verify local and remote heads before any cleanup or branch switch.
8. Each run must preserve isolated per-work-item state, a persistent workpad or equivalent local ledger, and a reflection note with decisions, blockers, validation evidence, and follow-up capture.
8a. Harnesses must surface wave options instead of silently starting broad orchestration. When open ready issues, newly unblocked issues, or prerequisite blockers justify a batch, ask the user whether to run a ready-open-issues wave or an unblock-prep wave; after approval, execute the matching Symphony workflow to a verified stop state.
8b. Lane planning is pack-first, then parallel. Skill-aware harnesses must load standalone `macro-subagent-orchestration` for broad waves and must not also load the micro subagent skills for the same wave. Local issue rows may represent tiny scan, dispatch, verify, blocker, and follow-up facts, but worker lanes and PRs must bundle compatible rows by `owner_path`, checkout, target branch, and verification surface. Do not create one worker or PR per child row unless a recorded split reason exists: working-tree collision, generator/SDK barrier, high-risk isolation, pointer-chain level, runtime dependency, merge dependency, or explicit user instruction.
8c. Codex shard fallback is mandatory when live subagent behavior ignores the configured cap. If `multi_agent_v1` refuses more than six live subagents, keep the parent six slots on the critical macro lanes and launch one `codex exec` orchestrator shard for each additional block of up to six collision-free lanes. Each shard must run the same Symphony playbook natively with Codex tools, local SQLite issue rows, no Agent Workflow Kit CLI by default, and an evidence path recorded by the parent.
9. Workflow and Symphony-alignment scripts/code must follow strict TDD. A failing focused test must be run and recorded before implementation, then the smallest code change must make it green before refactor.
10. A successful run needs evidence, not a summary. Local CI, workflow sync, doc graph, no-secret checks, TDD evidence, and task-specific validation stay binding under [[curaos-verification-stack-rule]], [[curaos-local-ci-first-rule]], and [[test-driven-development]].
11. Safety posture is explicit per harness. Workspace path containment, secret redaction, approval gates, T3 blockers, and PHI boundaries override any upstream example that uses broader permissions.
12. Imported upstream skills or examples must be reviewed for conflicts. In particular, upstream Codex commit examples that add AI attribution trailers are incompatible with CuraOS commit policy.
13. Any defect found while aligning generated workflows, prompts, SDKs, or codegen-owned surfaces must feed back into the generator or shared owner per [[curaos-generator-evolution-rule]].

## Adoption artifacts

- Research source: `ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md`
- Plan: `docs/agents/SYMPHONY-ALIGNMENT-PLAN.md`
- Local goal ledger: `docs/agents/SYMPHONY-ADOPTION-GOALS.md`

Done for a Symphony alignment change means all touched docs are reachable in the doc graph, `node scripts/check-workflow-sync.js` passes, `node scripts/generate-rule-index.js` passes, `bash scripts/check-docs.sh` passes, and the local goal ledger is updated before any GitHub sync.

<!-- fold: rationale, non-binding -->

## Rationale

Symphony's strongest ideas match existing CuraOS direction: repository-owned workflow policy, isolated workspaces, single-authority orchestration state, retries with reconciliation, strict prompt rendering, and operator-visible evidence. CuraOS already has a deterministic workflow library, GitHub roadmap tooling, local CI, and cross-harness rules. The right adoption path is to map Symphony concepts onto the current owners and add conformance gates, not to copy a Linear and Codex-specific implementation wholesale.

## Links

- [[curaos-roadmap-workflow-rule]]
- [[curaos-swarm-collaboration-rule]]
- [[curaos-verification-stack-rule]]
- [[curaos-local-ci-first-rule]]
- [[curaos-context-engineering-rule]]
- [[curaos-reuse-dry-rule]]
