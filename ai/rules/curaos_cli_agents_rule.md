---
name: curaos-cli-agents-rule
title: CLI agents stack (multi-primary Claude+Codex+Pi+Gemini+Aider+Cursor)
description: CLI agent stack - multi-primary (Claude Code orchestrator + Codex CLI sandboxed CI + Pi broker for Zen Go/free models + xai-auth lane); layered model tiering across all 4 stacks (Frontier/Orchestrator/Worker/Reviewer - Claude Fable 5/Opus 4.8/Sonnet 4.6/Haiku 4.5); Pi via opencode + opencode-go (+ user-added xai-auth) providers ONLY (NEVER openai-codex via Pi - use Codex CLI direct; NEVER github-copilot via Pi - Claude Code direct cleaner + PHI BAA simpler); Gemini CLI exploration tier (consumer free tier ends 2026-06-18); Aider polyglot escape; Cursor IDE-only; AGENTS.md primary + @AGENTS.md import bridge; OpenCode CLI + Copilot CLI banned as primary
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA1 walkthrough - grounded in [[curaos-agents-md-schema-rule]] + [[curaos-repo-conventions-rule]]):

## The rule

**Three locked components:**

1. **Multi-primary CLI stack** - Claude Code (orchestrator + swarm dispatcher), Codex CLI (sandboxed worker for CI), Pi CLI (broker for opencode + opencode-go Zen models); Gemini CLI (exploration tier); Aider (polyglot escape); Cursor (IDE only)
2. **Layered model tiering** across all 4 stacks - Orchestrator / Worker / Reviewer-Formatter mapping per-stack
3. **AGENTS.md primary + `@AGENTS.md` import bridge** - single source of truth across all CLI agents

## Banned

- OpenCode CLI as primary (skip; Pi exposes opencode/opencode-go models more cleanly)
- Copilot CLI as primary (use `gh` CLI for GitHub ops + Claude Code for code work)
- `pi --provider openai-codex` (use Codex CLI direct instead)
- `pi --provider github-copilot` (use Claude Code direct - cleaner BAA path for PHI)
- All-Opus tiering (5× cost vs layered for marginal quality gain)
- All-Sonnet tiering (2-3× cost vs layered for mechanical work)
- `rulesync` tool (extra dep; AGENTS.md+@import already accomplishes same reach)
- Per-CLI duplicate instruction files (GEMINI.md w/ same content as AGENTS.md = drift risk)
- `--dangerously-skip-permissions` on shared CI runners (only isolated sandbox CI environments)
- `sandbox_mode = "danger-full-access"` in Codex CI runs (only local dev)
- Cursor as CI agent (no headless mode)
- HealthStack PHI sessions via Codex/Gemini/Aider w/o BAA confirmed for that provider
- Codex orchestration through Agent Workflow Kit CLI tools by default. When Codex is the active harness, use internal Codex harness tools and skills for workflow orchestration unless the user explicitly requests the CLI path.

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| Multi-primary (not single CLI) | Diversifies vendor risk; different agents win different dimensions (Claude=quality+hooks, Codex=Rust binary+sandbox, Pi=cheap-model broker, Gemini=free-tier+1M ctx) |
| Layered model tiering | 40-60% cost reduction vs all-Sonnet, 80% vs all-Opus; Sonnet 4.6 near-Opus parity (SWE 79.6 vs 80.8); Haiku passes ≥90% mechanical task rubrics |
| Pi as opencode/opencode-go-only broker (+ user-added xai-auth lane 2026-06) | Cheaper non-Anthropic non-OpenAI alternatives (kimi-k2.6, glm-5.1, qwen3.6-plus) + free tier (nemotron-3-ultra-free, deepseek-v4-flash-free, big-pickle); BAA scope smaller w/o crossing through Copilot/Codex MS infra |
| NEVER Pi → openai-codex | Use Codex CLI direct - better sandbox modes (Seatbelt/Landlock), `codex exec` headless, model selection via `-m` flag |
| NEVER Pi → github-copilot | Claude Code direct cleaner; Copilot routes Claude through MS - extra BAA hop for PHI; redundant |
| AGENTS.md primary + import | 60K+ repos use AGENTS.md (Linux Foundation AAIF); native in Codex/Copilot/Cursor/Aider/OpenHands; Claude Code bridges via @AGENTS.md import; cross-CLI single source of truth |
| Cursor IDE-only | No headless CLI mode - not for CI; .cursor/rules/*.mdc handle IDE-specific glob-scoped rules |
| OpenCode + Copilot CLI banned as primary | OpenCode no production-grade headless; Copilot CLI limited hooks + GitHub-narrow (use `gh` CLI via Bash tool instead) |
| SWE-bench evidence | Claude Code 80.9% > Codex GPT-5.5 ~72% > Gemini ~71%; Aider GPT-5-high 88% on polyglot bench (architect mode) |

## Stack components (locked)

### 1. Claude Code = primary orchestrator + swarm dispatcher

- **Why primary:** Best SWE-bench (80.9%); 24+ hook lifecycle events (unmatched); native sub-agents (`Task` tool + `isolation: worktree`); auto memory; path-scoped `.claude/rules/`
- **Roles:** Orchestrator (architecture, multi-file reasoning); Worker (general impl, NestJS/TS); Reviewer/Formatter (lint, mechanical)
- **Bridge:** `CLAUDE.md` imports `@AGENTS.md` per [[curaos-agents-md-schema-rule]]
- **Headless:** `claude -p "<prompt>" --output-format json` for CI; `--dangerously-skip-permissions` only in isolated CI sandboxes
- **Config:** `.claude/settings.json` w/ hooks + permissions + MCP servers

### 2. Codex CLI = secondary worker for sandboxed CI

- **Why secondary:** Rust binary fastest startup; kernel-level sandboxing (Seatbelt/macOS, Landlock+seccomp/Linux) - more secure than container for PHI-adjacent work; native AGENTS.md
- **Roles:** Worker (sandboxed file ops); CI pipeline runs via `codex exec`
- **When Codex is the active orchestrator:** use internal Codex harness tools and skills first: `multi_agent_v1` subagents, Codex app tools, `tool_search`-discovered capabilities, native skill loading, local issue rows, and direct execution of `docs/agents/workflows/*.md` playbooks. Do not shell out to `agent-workflow-kit workflow-run`, `workflow-status`, or `workflow-events` for CuraOS orchestration unless the user explicitly asks for that CLI path or a local issue records the exceptional blocker.
- **Native model lineup (from `~/.codex/models_cache.json` 2026-06-09):**
  - `gpt-5.5` (default frontier; reasoning none/low/medium/high/xhigh)
  - `gpt-5.4`, `gpt-5.4-mini`
  - `gpt-5.3-codex-spark` (interactive TUI only - ChatGPT Pro, no API; never headless)
  - `codex-auto-review` (internal approval-review model)
  - Removed from sign-in picker: `gpt-5.2`, `gpt-5.3-codex` (deprecated); `gpt-5.x-codex` API ids shut down 2026-07-23
- **Config:** `~/.codex/config.toml` w/ `model = "gpt-5.5"`, `model_reasoning_effort = "xhigh"` (drop to `medium` for worker lanes), `sandbox_mode = "workspace"` (NEVER `danger-full-access` in CI)
- **Headless:** `codex exec "<prompt>"` or `codex e ...`

### 3. Pi CLI = broker for opencode + opencode-go Zen models ONLY

- **Why Pi as broker:** Single CLI exposes ~30+ non-Anthropic non-OpenAI models via opencode + opencode-go providers; cheaper alternatives for non-critical work; free-tier available
- **Allowed providers via Pi:**
  - `pi --provider opencode --model <X>` → free Zen tier (nemotron-3-ultra-free, deepseek-v4-flash-free, big-pickle, qwen3.6-plus-free, minimax-m3-free, north-mini-code-free)
  - `pi --provider opencode-go --model <X>` → paid Zen Go tier (kimi-k2.6, glm-5.1, qwen3.7-max, qwen3.6-plus, qwen3.5-plus, minimax-m2.7, mimo-v2.5-pro, deepseek-v4-flash) - `deepseek-v4-pro` REMOVED from Zen 2026-06
  - `pi --provider xai-auth --model grok-4.3` → xAI flagship lane (user-configured live default 2026-06)
- **Banned providers via Pi:**
  - `pi --provider openai-codex` - use Codex CLI direct (better sandbox + headless)
  - `pi --provider github-copilot` - use Claude Code direct (cleaner + PHI BAA simpler w/o MS hop)
- **Roles:** Worker (cheaper alternatives when budget pressure); Reviewer/Formatter (free-tier mechanical work)
- **Config:** `~/.pi/agent/settings.json` or `--provider <X> --model <Y>` flags
- **Headless:** `pi -p "<prompt>"` (non-interactive mode)

### 4. Gemini CLI = exploration tier (free until 2026-06-18, then paid-API/enterprise only)

- **Why kept:** 1000 req/day free (consumer free tier ENDS 2026-06-18 - after that only paid Gemini API keys or enterprise Code Assist; Antigravity CLI is Google's successor harness); 1M context (the 2M tier was Gemini 1.5 Pro, retired)
- **Models (2026-06-09):** frontier `gemini-3.1-pro-preview` (3.5 Pro not yet released); worker `gemini-3.5-flash`; mechanical `gemini-3.1-flash-lite`
- **Roles:** Cheap exploration sessions; cross-module impact analysis within 1M ctx
- **Headless:** `gemini -p "<prompt>" --no-interactive` w/ JSON output
- **Config:** USER-GLOBAL ONLY (`~/.gemini/settings.json` w/ `context.fileName: AGENTS.md`); no per-repo config committed (see note below)

### 5. Aider = polyglot escape (when codegraph + Claude insufficient)

- **Why kept:** Semantic PageRank repo-map (best for polyglot); architect mode (`gpt-5.5` high planner + Haiku 4.5 editor; the 88% polyglot bench was GPT-5-high era)
- **Roles:** Polyglot navigation when CuraOS adds non-TS services (Go, Rust)
- **Headless:** `aider --yes-always --message "<prompt>"` w/ files
- **Config:** USER-GLOBAL ONLY (`~/.aider.conf.yml` w/ `read: AGENTS.md`); no per-repo config committed (see note below)

Gemini + Aider are USER-GLOBAL-ONLY harnesses for this workspace (decided 2026-06-10, RP-65): no per-repo `.gemini/settings.json` or `.aider.conf.yml` is committed. Rationale: no active local use to keep such configs honest (audit-confirmed drift surface), and the Gemini consumer CLI free tier ends 2026-06-18. If either harness enters active use, configure it user-globally (`~/.gemini/settings.json` with `context.fileName: AGENTS.md`; `~/.aider.conf.yml` with `read: AGENTS.md`) and only then revisit per-repo configs.

### 6. Cursor = IDE only

- **Why kept:** `.cursor/rules/*.mdc` glob-scoped rules for IDE-specific behavior; Cursor Automations for always-on background agents
- **Roles:** Local IDE-bound work; never CI
- **No headless mode** - skip for any scripted use

### 7. Banned as primary CLI

- **OpenCode CLI** - no production-grade headless; BYO-key only; functionality covered by Claude Code + Codex; **Pi exposes opencode/opencode-go models more cleanly than OpenCode CLI itself**
- **Copilot CLI** - limited hooks; GitHub-ecosystem-narrow; use `gh` CLI via Bash tool for GitHub ops + Claude Code for code work

## Layered model tiering matrix (locked)

| Tier | Claude Code direct | Codex CLI direct | Pi → opencode-go (paid Zen Go) | Pi → opencode (free Zen) |
|---|---|---|---|---|
| **Frontier** (adversarial gates, wave planning, architecture-defining work, <5% requests) | `claude-fable-5` | `gpt-5.5` reasoning=xhigh | `kimi-k2.6` OR `qwen3.7-max` | - (no frontier-tier free) |
| **Orchestrator** (architecture, multi-file reasoning, <10% requests) | `claude-opus-4-8` | `gpt-5.5` reasoning=high | `kimi-k2.6` OR `glm-5.1` | - (no orchestrator-tier free) |
| **Worker** (general impl, NestJS/TS, ~30% requests) | `claude-sonnet-4-6` | `gpt-5.4` OR `gpt-5.5` reasoning=medium | `glm-5.1` OR `qwen3.6-plus` | `nemotron-3-ultra-free` |
| **Reviewer/Formatter** (lint, format, mechanical, ~60% requests) | `claude-haiku-4-5` | `gpt-5.4-mini` reasoning=low | `deepseek-v4-flash` OR `qwen3.5-plus` | `deepseek-v4-flash-free`, `big-pickle` |

**Routing logic:**
1. **Default:** Claude Code direct (Anthropic native) for all tiers
2. **CI sandboxed runs:** Codex CLI direct w/ corresponding tier
3. **Budget-constrained sessions** (when daily Anthropic spend approaches cap): Pi → opencode-go for paid alternatives
4. **Exploration / non-critical mechanical work:** Pi → opencode free Zen tier (nemotron, deepseek-flash-free, big-pickle)
5. **Large-context cross-module impact** (>1M tokens): Gemini CLI 2M Pro
6. **Polyglot navigation:** Aider w/ architect mode

**HealthStack PHI sessions:** ONLY Claude Code direct (Anthropic BAA) OR Pi → opencode/opencode-go (verify BAA per Zen provider before adoption); NEVER Codex/Gemini/Aider w/o BAA confirmed.

## Per-agent config bridge pattern (locked)

```
curaos-workspace/
├── AGENTS.md                  # canonical cross-CLI source of truth (per [[curaos-agents-md-schema-rule]])
├── CLAUDE.md                  # @AGENTS.md import + Claude-specific addenda only
├── .cursor/rules/*.mdc        # IDE-specific glob-scoped rules (Cursor only)
├── .codex/config.toml         # Codex sandbox + model + per-project overrides
└── ~/.pi/agent/settings.json  # Pi user-global provider + model defaults
```

Gemini (`~/.gemini/settings.json`) + Aider (`~/.aider.conf.yml`) are user-global only; no per-repo entry point is committed (RP-65, 2026-06-10).

**Bridge rules:**
- AGENTS.md is canonical; every CLI honors it (native or via import)
- CLAUDE.md is ONLY `@AGENTS.md` + Claude-specific addenda - never duplicate AGENTS.md content
- Per-CLI files (`.codex/config.toml`, `~/.aider.conf.yml`, etc.) ONLY for tool-unique features (sandbox modes, repo-map, model defaults) - never for instructions
- NO `rulesync` tool - extra dep w/o payoff; current AGENTS.md+@import already cross-CLI

## CuraOS-specific recommendations

### Workspace-level files (already aligned w/ this rule via DA2+DA8 commits)

```
.claude/
├── settings.json              # hooks + model tiering + MCP servers
├── settings.local.json        # gitignored personal overrides
├── rules/
│   ├── nestjs.md              # paths: backend/**/*.ts
│   ├── healthstack.md         # paths: backend/services/healthstack-*/**
│   └── k8s.md                 # paths: ops/**/*.yaml
└── agents/
    ├── explorer.md            # read-only Haiku for codebase analysis
    ├── reviewer.md            # Haiku read-only for code review
    └── security-auditor.md    # Opus for HIPAA/GDPR audit
```

### Model tiering in `.claude/settings.json`

```json
{
  "model": "claude-sonnet-4-6",
  "smallModel": "claude-haiku-4-5",
  "largeModel": "claude-fable-5",
  "agents": {
    "frontier-gate": { "model": "claude-fable-5" },
    "orchestrator":  { "model": "claude-opus-4-8" },
    "worker":        { "model": "claude-sonnet-4-6" },
    "reviewer":      { "model": "claude-haiku-4-5" },
    "formatter":     { "model": "claude-haiku-4-5" }
  }
}
```

### Codex CLI per-CuraOS profile (`~/.codex/config.toml`)

```toml
[profile.curaos]
model = "gpt-5.5"
model_reasoning_effort = "medium"
sandbox_mode = "workspace"
approval_policy = "on-request"

[profile.curaos-ci]
model = "gpt-5.4-mini"
sandbox_mode = "read-only"
approval_policy = "never"
```

### Pi CLI per-CuraOS profile

```bash
# Worker tier - paid Zen Go
pi --provider opencode-go --model kimi-k2.6 -p "<task>"

# Cheap mechanical - free Zen
pi --provider opencode --model deepseek-v4-flash-free -p "<task>"

# Large-context exploration - free Zen (1M ctx, knowledge cutoff 2026-02)
pi --provider opencode --model nemotron-3-ultra-free -p "<task>"
```

### Multi-agent swarm pattern for CuraOS (96 submodules)

1. **Orchestrator** (Claude Code Fable 5 for wave planning; Opus 4.8 for routine orchestration) reads `ai/curaos/AGENTS.md` + target module CONTEXT.md
2. Orchestrator spawns 6 parallel worker agents via `Task` tool, one per submodule batch
3. Each worker (Claude Code Sonnet 4.6) reads `ai/curaos/<module>/AGENTS.md` before touching code
4. Workers return results; orchestrator assembles + verifies (`bun run ci`)
5. Reviewer sub-agent (Claude Code Haiku 4.5) does final lint/format pass
6. **Budget overrun fallback:** orchestrator routes excess workers to Pi → opencode-go `kimi-k2.6` OR Codex CLI `gpt-5.4`
7. **Free-tier dispatch** (for mechanical-only work): Pi → opencode `nemotron-3-ultra-free` OR `deepseek-v4-flash-free`

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter (self-hosted first) | Pi opencode + opencode-go = self-hosted-compatible model brokerage; Claude Code Opus/Sonnet still cloud but optional |
| AGENTS.md §10 (read repo context first) | All CLIs honor AGENTS.md (native or via @AGENTS.md import) per [[curaos-agents-md-schema-rule]] |
| AGENTS.md §11 (boundaries + approvals) | Codex `sandbox_mode = "workspace"` + Claude Code hooks enforce approvals |
| AGENTS.md §12 (per-project onboarding) | All CLIs read AGENTS.md hierarchy (workspace → module → service) |
| [[curaos-agents-md-schema-rule]] | This rule depends on it - AGENTS.md is the cross-CLI contract |
| [[curaos-repo-conventions-rule]] | Conventional Commits + agent/<type> branches honored by all CLIs |
| [[curaos-ai-mirror-rule]] | All CLIs read ai/curaos/<module>/AGENTS.md mirror |
| [[curaos-repo-boundary-rule]] | Per-CLI config files never leak workspace state into submodules |
| [[curaos-modulith-standalone-rule]] | All CLIs work on standalone module clones via per-module AGENTS.md |
| [[curaos-bun-primary-rule]] | Toolchain Registry in AGENTS.md uses bun; all CLIs invoke `bun run ci` |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical: memory ↔ ai/rules/ ↔ AGENTS.md §15 |
| [[curaos-local-vs-3rdparty-rule]] | Pi opencode-go = 3rd-party model brokerage abstraction; Anthropic/Codex = direct |

## Agentic-tool friendliness

Why this multi-primary + layered tiering wins:

- **Claude Code orchestrator** → richest hooks + sub-agent isolation + auto memory for solo + swarm
- **Codex CLI sandboxed worker** → kernel-level sandbox for PHI-adjacent CI ops (safer than container)
- **Pi broker** → swap cheap non-Anthropic models in mid-session w/o switching CLI; budget control valve
- **Pi opencode tier (free)** → mechanical work for free (formatter, lint pass) - saves 60-80% Anthropic spend on routine work
- **Gemini 2M ctx** → cross-module impact analysis in one round-trip
- **Aider repo-map** → polyglot navigation when CuraOS adds Go/Rust services
- **AGENTS.md universal bridge** → write once, every CLI honors
- **NO Pi → openai-codex** → eliminates CLI/provider overlap; Codex CLI native is cleaner for OpenAI models
- **NO Pi → github-copilot** → eliminates BAA hop through MS for PHI workloads
- **NO OpenCode/Copilot as primary** → fewer rule files to maintain; functionality already covered

## How to apply

- Default Claude Code interactive sessions for all CuraOS work
- Codex CLI invoked from CI workflows (`codex exec` non-interactive w/ `sandbox_mode = "workspace"`)
- Pi CLI invoked when budget pressure (route worker tier to `pi --provider opencode-go --model kimi-k2.6`) OR free mechanical work (`pi --provider opencode --model nemotron-3-ultra-free`)
- Gemini CLI for exploration (free tier until 2026-06-18, then paid API key) OR cross-module impact analysis (1M ctx)
- Aider for polyglot work when CuraOS adds non-TS services
- Cursor for IDE-bound interactive work only (never CI)
- AGENTS.md in every workspace + module level (per [[curaos-agents-md-schema-rule]])
- CLAUDE.md = `@AGENTS.md` import + Claude-specific addenda only
- Per-CLI config files (`.codex/config.toml`, `~/.pi/agent/settings.json`, `~/.gemini/settings.json`, `~/.aider.conf.yml`) for tool-unique features ONLY (Gemini + Aider user-global only per RP-65)

## Open items (Q-list from digest)

- Q3: LangGraph adoption - deferred (stay Claude Code sub-agents only until multi-step workflow blocker)
- Q4: Cloud agent platforms (Devin/Augment) - deferred (not primary loop; evaluate when local swarm hits scaling wall)
- Q5: rulesync - skipped per this rule
- Q10: Tool-search subagent (Claude Code 2.0.6+) - enable for any session w/ >3 active MCPs (deferred to [[curaos-context-engineering-rule]] when locked)

## ADRs

ADR-0150 (`0150-baseline-alignment-rules.md`) covers baseline alignment rules for DRAFT ADRs 0101-0115 (different topic). ADR-0154 (`0154-provider-abstraction-convention.md`) covers provider abstraction convention (different topic). Cross-ref `ai/curaos/docs/adr/RESOLUTION-MAP.md` for the actual CLI-agent-stack and model-tiering ADR numbers.
