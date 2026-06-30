---
name: doc-governance
kind: composite
version: 0.1.1
inputs:
  manifest: { type: string, required: true, desc: "absolute path to a newline-delimited file of doc paths to govern, OR a glob the orchestrator pre-expanded" }
  standards: { type: string, required: false, desc: "absolute path to the standards baseline; defaults to ai/research/doc-review-standards.md" }
  mode: { type: string, required: false, desc: "review-only | review-and-fix (default review-and-fix)" }
  cluster_size: { type: number, required: false, desc: "max docs per review agent (default 30)" }
outputs:
  clusters_reviewed: { type: number, desc: "count of review clusters" }
  findings: { type: number, desc: "total findings raised" }
  confirmed_regressions: { type: number, desc: "regressions confirmed by the adversarial sweep" }
  edits_applied: { type: number, desc: "fixes applied (0 in review-only mode)" }
  gates: { type: object, desc: "{ doc_graph_pass, mirror_pass, node_count, edge_count }" }
  report_path: { type: string, desc: "absolute path of the persisted governance report" }
guarantees:
  idempotent: false
  determinism: control-flow-only
  side_effects: fs
verification: T2
models:
  review: opus
  sweep: opus
  fix: sonnet
  verify: sonnet
composes: []
symphony:
  tracker_adapter: github-explicit-sync
  trigger_mode: manual-orchestrator
  workspace_owner: workflow-owned-root
  workspace_lifecycle: local-state-retention
  hooks: workflow-defined
  agent_runner: [claude-workflow, agent-workflow-kit, hermes-native, codex-adapter, generic-playbook]
  prompt_inputs: contract-inputs
  strict_rendering: fail-closed
  state_model: local-sqlite-issue-plus-run-state-plus-github-labels
  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite
  retry_reconcile: executor-defined
  observability: local-events-evidence-and-logs
  safety_posture: curaos-t1-t2-t3
  github_sync: explicit-checkpoint-only
  validation: contract-verification-plus-closeout
  tdd_evidence: required-for-script-code-changes
---

# doc-governance

Govern a set of CuraOS docs: review against the standards baseline, adversarially verify the review's own edits, fix confirmed regressions, and verify the doc-graph + mirror gates. This is the persisted form of the pipeline proven on the 2026-05-29 685-doc review (which caught 31 cross-cluster regressions a single review pass shipped).

## When to invoke

- A doc set needs a standards-grounded review + tightening (rules, prompts, ADRs, per-module triples).
- After any large doc edit, to verify no cross-doc contradiction / fabricated citation / dropped substance was introduced.
- NOT for a single small doc (just edit it); the cost only pays off across a cluster.

## Inputs

See frontmatter. `manifest` is the doc-set; `standards` defaults to the researched baseline. `mode=review-only` skips the fix phase (reports findings for human/orchestrator action).

## Phases

1. **Cluster** (deterministic) - partition the manifest into clusters of ≤`cluster_size`, grouping siblings (same dir) together. Pure code, no agent.
2. **Review** (`opus`, fan-out) - one reviewer per cluster reads every file, grades against the standards baseline, returns structured findings each citing a standard ID. Frozen records (grills/research/superseded-ADR) get link/fact fixes only.
3. **Adversarial sweep** (`opus`, fan-out) - independent reviewers re-read the review's proposed edits/diff hunting: backwards-fix, invented-canonical, cross-doc-contradiction, dropped-substance, broken-link, wrong-value. Each flag must quote evidence + name the violated authority. **This is the phase that catches what per-cluster review misses.**
4. **Fix** (`sonnet`, fan-out; skipped if `mode=review-only`) - apply confirmed findings surgically; keep correct sibling edits; verify every cited ADR/rule resolves on disk; no file create/rename/move.
5. **Verify** (`sonnet`, gate) - run `check-doc-graph.js` + `check-ai-mirror.sh` (real exit codes, no pipe-masking; `--write` regen is the only sanctioned DOC-GRAPH edit). Fix any introduced broken link without reverting substance. **Programmatic gate** - must be EXIT=0.

## Gates

- Every finding cites a standard ID (from the baseline) - else not reportable.
- Frozen records: link/fact fixes only, never restructure.
- Fix phase: no file create/rename/move (protects doc-graph + mirror).
- Verify: doc-graph EXIT=0 + mirror EXIT=0 are **blocking programmatic gates**.
- 3-cycle cap on the verify-fix loop → escalate to the orchestrator (T3).

## Determinism

Control flow + the verify gate are deterministic. Review/sweep/fix are best-effort LLM `agent()` stages - the adversarial sweep is the correctness backstop, not the review's self-report.

## Outputs

A persisted governance report (`report_path`) + the structured summary (see frontmatter `outputs`). The orchestrator reads the report; confirmed regressions in `review-only` mode become the next fix batch.

## Stages (inlined)

The review / adversarial-sweep / fix / verify stages run as inline phases within this workflow (no separate atomic executors exist yet). If other composites later need them standalone, they can be extracted into atomic workflows and this contract's `composes` updated - until then `composes: []` (honest: the sync gate enforces that a non-empty `composes` actually `workflow()`-composes real executors).
