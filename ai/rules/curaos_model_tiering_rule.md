---
name: curaos-model-tiering-rule
title: Model tiering (per-harness only; no cross-harness auto)
description: Model tiering - per-CLI-harness tiering only (each tool calls its own models; NO cross-harness routing unless explicitly asked per session); task-class → model routing matrix within each stack (Claude Code Fable 5/Opus 4.8/Sonnet 4.6/Haiku 4.5; Codex gpt-5.5 (xhigh or high)/gpt-5.4/gpt-5.4-mini; Pi opencode-go kimi-k2.6/glm-5.1/qwen3.6-plus; Pi opencode free Zen nemotron-3-ultra-free/deepseek-v4-flash-free/big-pickle); logical tier vocabulary fable-opus-sonnet-haiku; NO distribution targets (agent decides per task); NO Batch API (CLI harnesses are sync); NO per-tenant cost attribution (product concern deferred v2/v3); NO budget-overrun cross-harness fallback chain; HealthStack PHI minimum Sonnet 4.6 within Claude Code (or Pi Zen w/ BAA verified); session can request cross-harness routing only when explicitly asked
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA5 walkthrough - re-walked w/ proper interview; grounded in [[curaos-cli-agents-rule]] DA1):

## The rule

**Five locked principles (narrow scope per user clarification):**

1. **Per-harness tiering only** - each CLI tool routes within its own model set; NO cross-harness orchestration unless explicitly asked
2. **Task-class → model routing matrix per stack** - orchestrator/worker/reviewer split within Claude Code; same within Codex; same within Pi
3. **NO distribution targets** - agent decides per task class (no enforced 60/30/10)
4. **NO Batch API adoption** - CLI harnesses (Claude Code, Codex CLI, Pi) are interactive/sync; Batch API not applicable unless future tooling supports it
5. **NO cross-harness budget-overrun fallback** - Claude Code does NOT auto-route to Pi; Codex does NOT auto-route to Claude Code; explicit session-level user instruction required to cross stacks

## Cross-harness session pattern (ONLY when explicitly asked)

User can request cross-harness routing per session:
- "Run this w/ Codex sandboxed" → orchestrator routes to Codex CLI
- "Use Pi cheap tier for this batch" → orchestrator routes to Pi opencode
- "Run via Gemini for 2M context" → orchestrator routes to Gemini CLI

**Default:** stay within current CLI's model set. Cross-harness routing requires explicit user instruction.

## HealthStack PHI routing (cross-harness override allowed for BAA)

Per [[curaos-cli-agents-rule]] DA1:
- **Allowed for PHI:** Claude Code direct (Anthropic BAA) OR Pi → opencode/opencode-go (verify BAA per Zen provider before adoption)
- **Banned for PHI:** Codex/Gemini/Aider/Cursor w/o explicit BAA confirmed
- **Tier minimum for PHI:** Sonnet 4.6 within Claude Code (or `kimi-k2.6` / `glm-5.1` via Pi w/ BAA verified)
- **NEVER for PHI:** Haiku 4.5 / `gpt-5.4-mini` / `nemotron-3-ultra-free` / `big-pickle` etc. budget-tier models (and never ANY free Zen model - they may train on inputs)

## What this rule does NOT do (user-clarified scope cuts)

- **Does NOT enforce distribution targets** (no 60/30/10 prescription)
- **Does NOT mandate Batch API** (CLI harnesses are sync; Batch n/a)
- **Does NOT cover per-tenant cost attribution** (product concern, deferred v2/v3)
- **Does NOT auto-route across harnesses** (Claude Code stays in Claude models unless user asks otherwise)
- **Does NOT define orchestrator `route_task()` decision tree spanning harnesses** (each harness routes internally only)

## Banned

- Auto cross-harness routing during session (Claude Code → Pi w/o user asking)
- Orchestrator decision tree that bridges harnesses (each CLI routes internally only)
- Distribution target enforcement (no 60/30/10 prescription)
- Batch API mandate (skip until CLI harnesses support; revisit if/when)
- Per-tenant cost attribution at rule level (product concern; deferred)
- Budget tier for HealthStack PHI tasks (Sonnet minimum; Haiku/budget-Zen banned)
- Codex/Gemini/Aider for HealthStack PHI w/o explicit BAA confirmed
- All-Opus or all-Fable tiering within Claude Code (5-10× cost vs layered for marginal quality)
- Wrong-harness model invocation (e.g., asking Codex to use claude-fable-5 - wrong stack)
- Stale Zen ids in configs: `deepseek-v4-pro` (removed from Zen 2026-06), `nemotron-3-super-free` (superseded), `minimax-m2.5-free` (superseded)
- `gpt-5.3-codex-spark` in headless `codex exec` lanes (interactive-TUI/Pro-only, no API)

<!-- fold: rationale, non-binding -->

## Why (clarified per user 2026-05-25)

| Constraint | User-clarified rationale |
|---|---|
| Per-harness tiering only | Each CLI tool calls its own models; cross-tool routing requires explicit session instruction, not orchestrator auto-routing |
| NO distribution targets | Agent picks per task (no 60/30/10 enforcement); avoids prescriptive constraint on flexibility |
| NO Batch API | Claude Code + Codex CLI + Pi are interactive sync agents; Batch API not applicable (apply later if/when async tooling adopted) |
| NO per-tenant attribution rule | This is a PRODUCT concern (per-tenant pricing/SaaS billing) not a DEV rule; deferred to v2/v3 product roadmap |
| NO cross-harness fallback | Tool calls models it has access to; do not cross-call other harnesses unless explicitly asked per session |
| HealthStack PHI Sonnet minimum | Per [[curaos-cli-agents-rule]] DA1: Claude Code direct (Anthropic BAA) OR Pi opencode/opencode-go w/ BAA verified; NEVER Codex/Gemini/Aider for PHI |

## Per-harness routing matrix (locked)

Each CLI agent routes within its OWN model set. NO automatic cross-harness routing.

### Claude Code direct (Anthropic models only)

| Task class | Model |
|---|---|
| Frontier gates: adversarial grill, T2 merge gate, wave planning, breakdown assess, architecture-defining (XL effort + ADR) impl | `claude-fable-5` |
| Architecture / multi-file reasoning / refactor planning / ADR writing / implement default | `claude-opus-4-8` |
| General impl (NestJS/TS modules, refactoring, agent orchestration) | `claude-sonnet-4-6` |
| Lint / format / boilerplate / classification / mechanical edits | `claude-haiku-4-5` |

**Fable 5 (GA 2026-06-09):** Mythos-class frontier tier ABOVE Opus - same safety posture as Mythos 5 plus always-on safety classifiers (falls back to Opus 4.8 in <5% of sessions), so it is the safe GA frontier. $10/$50 per MTok = 2x Opus 4.8; reserve it for the gates where a wrong call cascades (grill/merge/plan) and for architecture-defining implementation. Adaptive-thinking-only (explicit `thinking: disabled` 400s; omit the param), 1M ctx, 128K out. The logical tier vocabulary across the workflow library is now `fable | opus | sonnet | haiku`.

**Implementation-agent OPUS BIAS (user policy 2026-05-29):** for the DISPATCHED IMPLEMENTATION model (tdd-implement's implement agent), DEFAULT to Opus - it reaches the answer in fewer iterations, cheaper net than a Sonnet loop. Downgrade to Sonnet ONLY when the task is proven-simple (effort=S AND single owned-path AND fully-descriptive apply-as-is acceptance AND no ADR involvement). Haiku ONLY for pure-mechanical (rename/format/lint). Escalate to FABLE ONLY when architecture-defining (effort=XL AND adr_refs non-empty) - the frontier gate is deliberately narrow at 2x Opus cost. Any signal missing or uncertain → Opus. Complexity is DERIVED at runtime from the resolved `issue_spec` (effort / owned_paths count / adr_refs / acceptance) - NOT hardcoded. The derivation is `pickImplementModel()` (canonical: `scripts/lib/model-tier.js`, inlined in `context-load` + `tdd-implement` since the workflow sandbox forbids `require()`); `context-load` emits `recommended_model` (fable|opus|sonnet|haiku), the executors thread it as `impl_model`. Frontier gates that JUDGE (opposite-harness grill, pr-verify-merge gate, milestone-wave plan, breakdown assess → Fable); agents that PRODUCE/REASON (split, review, synthesis, foresight → Opus); mechanical helpers (run-a-git/gh-command-and-parse, classify-a-label, fill-a-template) correctly stay Haiku/Sonnet.

### Codex CLI direct (OpenAI models only - from `~/.codex/models_cache.json`, fetched 2026-06-09)

| Task class | Model | Reasoning level |
|---|---|---|
| Frontier gates / architecture / multi-file reasoning | `gpt-5.5` | `xhigh` |
| Deep reasoning (orchestrator) | `gpt-5.5` | `high` |
| General impl | `gpt-5.4` OR `gpt-5.5` | `medium` |
| Mechanical / formatting / quick edits | `gpt-5.4-mini` | `low` |

**Codex lineup notes (2026-06-09):** `gpt-5.3-codex-spark` is interactive-TUI-only (ChatGPT Pro, NO API access) - never use it for headless `codex exec` lanes. `gpt-5.2` + `gpt-5.3-codex` are deprecated for ChatGPT sign-in; the `gpt-5.x-codex` API ids (gpt-5-codex through gpt-5.2-codex) shut down permanently 2026-07-23. `gpt-5.5-codex` does NOT exist (plain `gpt-5.5` is the Codex frontier model).

### Pi CLI → opencode-go (paid Zen Go, non-Anthropic non-OpenAI)

| Task class | Model |
|---|---|
| Architecture / deep reasoning (open-weight frontier) | `kimi-k2.6` OR `qwen3.7-max` (Anthropic-format Zen endpoint; verify provider support before pinning) |
| General impl (alternative) | `glm-5.1` OR `qwen3.6-plus` OR `minimax-m2.7` (Anthropic-format endpoint only) |
| Cheap mechanical | `deepseek-v4-flash` OR `qwen3.5-plus` |

**Zen catalog churn (2026-06-09):** `deepseek-v4-pro` was REMOVED from the Zen catalog (still sold first-party by DeepSeek) - purge it from configs; `kimi-k2.6`/`glm-5.1` are the replacements. Re-fetch `https://opencode.ai/zen/v1/models` before pinning new ids.

### Pi CLI → opencode (free Zen tier)

| Task class | Model |
|---|---|
| General impl (free alternative for non-critical work) | `nemotron-3-ultra-free` OR `qwen3.6-plus-free` |
| Cheap mechanical | `deepseek-v4-flash-free` OR `big-pickle` OR `minimax-m3-free` |

**Free-tier churn (2026-06-09):** `nemotron-3-super-free` was superseded by `nemotron-3-ultra-free` (2026-06-04); `minimax-m2.5-free` by `minimax-m3-free`. Free Zen models may train on inputs - NEVER send PHI or proprietary code through them.

### Pi CLI → xai-auth (user-configured 2026-06)

- Live Pi default: `defaultProvider = "xai-auth"`, `defaultModel = "grok-4.3"` (thinking=high) per `~/.pi/agent/settings.json`; `grok-4.3` is xAI's flagship (1M ctx, reasoning_effort none/low/medium/high). Zen lanes remain available via `--provider opencode-go` / `--provider opencode`.

### Gemini CLI direct

- Free tier exploration (1000 req/day) ENDS 2026-06-18 for consumer tiers - after that Gemini CLI serves only paid Gemini API keys or enterprise Code Assist; Antigravity CLI is Google's successor harness
- Large-context impact analysis: 1M ctx max (the 2M-ctx tier no longer exists - that was Gemini 1.5 Pro, retired)
- Tiering: frontier/orchestrator `gemini-3.1-pro-preview` (3.5 Pro not yet released); worker `gemini-3.5-flash`; mechanical `gemini-3.1-flash-lite`

### Grok CLI (Grok Build) direct

- CLI cache exposes `grok-build` (512K ctx, advanced coding) + `grok-composer-2.5-fast` (Cursor Composer 2.5 proxy, default); API flagship is `grok-4.3` (use reasoning_effort to tier; xAI has no budget model - `grok-code-fast-1` retired, redirects to `grok-build-0.1`)

### Aider direct

- Polyglot repo-map work (when codegraph + Claude insufficient); architect mode (`gpt-5.5` high planner + Haiku 4.5 editor)

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §10 (agent operating rules) | Each CLI honors its own tiering matrix; respects user's explicit cross-harness routing instructions |
| AGENTS.md §11 (boundaries) | HealthStack PHI tier floor (Sonnet+) hard-coded; cross-harness routing requires explicit instruction |
| [[curaos-cli-agents-rule]] | This rule provides per-harness tiering detail; DA1 defines which CLIs exist |
| [[curaos-context-engineering-rule]] | BATS budget tracker may inform tier choice within a harness (not across harnesses) |
| [[curaos-mcp-stack-rule]] | Independent - model tiering doesn't affect MCP selection |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical |

## Agentic-tool friendliness

Why per-harness tiering wins:

- **Each tool calls its own models** - no surprise cross-harness routing during interactive session
- **Tiering within stack** - orchestrator/worker/reviewer split honored per CLI
- **Explicit cross-harness opt-in** - user controls when to switch tools mid-session
- **PHI BAA-only override** - cross-harness allowed ONLY when BAA verified for PHI workloads
- **No prescriptive distribution** - agent picks per task class; flexibility preserved
- **No premature cost-attribution complexity** - deferred to product layer where it belongs

## How to apply

- Claude Code frontier gates (grill/merge-gate/wave-plan/assess) use claude-fable-5; orchestrator + implement default claude-opus-4-8; workers claude-sonnet-4-6; reviewers claude-haiku-4-5
- Codex CLI default: `model = "gpt-5.5"`, `model_reasoning_effort = "xhigh"` per `~/.codex/config.toml` (drop to `medium` for worker lanes, `low` for `gpt-5.4-mini` mechanical lanes)
- Pi CLI default: `defaultProvider = "xai-auth"`, `defaultModel = "grok-4.3"` per `~/.pi/agent/settings.json` (user-configured 2026-06); Zen lanes via `--provider opencode-go --model kimi-k2.6` (paid) / `--provider opencode --model nemotron-3-ultra-free` (free)
- Cross-harness routing: ONLY when user explicitly asks ("run via Codex", "use Pi for this")
- HealthStack PHI sessions: minimum Sonnet 4.6 OR Pi kimi-k2.6/glm-5.1 w/ BAA verified
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate to memory + ai/rules/ + AGENTS.md §15

## ADRs queued

Per digest §6:
- **ADR (NEW, per-harness model tiering matrix)** - number TBD (0154 reused by provider-abstraction-convention; use next free number ≥0212): full version; this rule = short form
- **ADR-0099 (charter)**: no amendment needed (per-harness tiering is implementation detail, not charter-level)
