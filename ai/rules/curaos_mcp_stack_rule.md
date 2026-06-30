---
name: curaos-mcp-stack-rule
title: MCP stack (CLI-first + banned MCP list)
description: MCP stack curation - CLI-first principle (use Bash + installed CLI over MCP wherever CLI exists); must-have MCPs (codegraph + open-design + context-mode; deepwiki already-enabled nice-to-have; computer-use Codex bundled); per-session activation pattern; tool-search subagent (Claude Code 2.0.6+) when >3 active MCPs; explicit ban list (Grafana/GitHub/Playwright/Kubernetes/Semgrep/Serena/Figma/Linear/Jira/MongoDB/Datadog/Cloudflare-*/git-MCP/Filesystem-MCP/Fetch-MCP/all memory MCPs); HARD BAN Postgres MCP→prod PHI + Playwright MCP→HealthStack; GitHub Issues as canonical work queue
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA3 walkthrough - grounded in [[curaos-cli-agents-rule]] + locally-audited CLI inventory):

## The rule

**Four locked principles:**

1. **CLI-first** - if a CLI exists for a capability, use it via Bash tool. MCPs reserved for capabilities that have NO usable CLI equivalent
2. **Must-have MCPs (always-on)** - codegraph + open-design + context-mode (Codex-bundled computer-use kept where applicable); deepwiki kept as already-enabled cheap addon
3. **Per-session activation** - NO MCP outside must-have set ships globally; conditional MCPs require explicit session activation; tool-search subagent (Claude Code 2.0.6+) enabled when active MCP count exceeds 3
4. **GitHub Issues as canonical work queue** - no Linear, no Jira, no separate issue tracker; existing `gh` CLI + triage-labels skill + GitHub Agentic Workflows (Feb 2026) cover

## Must-have MCPs (always-on)

| MCP | Why kept | Schema cost | Local config |
|---|---|---|---|
| **codegraph** | Sub-ms structural queries (callers, callees, impact, search, context, explore, files, node, status); NO CLI graph equivalent (`rg`/`ast-grep` only do text/AST patterns, not call graphs) | ~10-20 tools small schemas | `codegraph serve --mcp` (already enabled in Claude Code + Codex; Cursor via `.cursor/mcp.json`, VS Code via `.vscode/mcp.json`, both tracked in-repo since 2026-06-10/RP-65) |
| **open-design** | Local Open Design app integration (canvas, projects, files, artifacts); NO CLI equivalent (`/usr/bin/od` is octal dump, unrelated) | Moderate | Local app bundle (already enabled; app-bundle-served: it has NO CLI launcher, so it cannot appear in tracked mcp.json files; Cursor/VSCode parity is codegraph + context-mode only) |
| **context-mode** | Rust Token Killer pattern - context window protection for huge tool outputs; persists to sandbox, returns metadata only; NO CLI equivalent | Low | Plugin via Claude Code (already enabled) |
| **computer-use** (Codex-bundled only) | Mouse/keyboard agent capability; NO CLI substitute by definition | Moderate | Bundled w/ Codex marketplace |
| **deepwiki** | OSS repo wiki Q&A; `npm:deepwiki` is abandoned v0.0.1 (no usable CLI); ~3 tools very cheap; keep already-enabled | ~3 tools very low | `https://mcp.deepwiki.com/mcp` (already enabled in Claude Code) |

**Token overhead total (must-have set): ~8-12K tokens/session.**

## Banned (summary)

- **By CLI-substitution:** Grafana / GitHub / Playwright / Kubernetes / Semgrep / git / Filesystem / Fetch / Postman / Insomnia / Puppeteer / ast-grep / tree-sitter / Sourcegraph / Cloudflare-* MCPs
- **Too heavy / wrong fit:** Serena / Anthropic KG Memory / Mem0 / Letta / Zep
- **Not in CuraOS stack:** Figma / Linear / Jira / GitLab / MongoDB / Datadog / AWS/GCP/Azure / Browserbase
- **HARD BANS (security):** Postgres MCP → prod/staging PHI DBs; Playwright MCP → HealthStack sessions
- **Always-on GitHub MCP** (42-55K token overhead per session)
- **Per-session > 3 MCPs w/o tool-search subagent enabled**

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| CLI-first | MCP token cost: 400-55K tokens per call schema; GitHub MCP alone preloads 42-55K tokens every session; CLI tools cost ~0 schema overhead |
| Per-operation MCP vs CLI cost | OnlyCLI 2026 benchmark: $55.20 vs $3.20 per 10K ops (17× more expensive via MCP) |
| Must-have MCP filter | Only codegraph (structural graph queries) + open-design (local app canvas) + context-mode (huge-output protection) + deepwiki (OSS wiki Q&A) have NO usable CLI substitute |
| Per-session activation | 5-MCP setup = 55-67K tokens preloaded every session; per-session = ~5K must-have + activate-only-when-needed |
| Tool-search subagent | Claude Code 2.0.6+ defers tool schema loading until needed; 47% main-thread overhead reduction at >3 active MCPs |
| GitHub Issues | your-org org has 93 repos on GitHub w/ existing triage-labels skill; Linear MCP adds vendor dep + $10/user/mo + 93-repo migration cost |
| HARD BANS on Postgres MCP→prod PHI + Playwright MCP→HealthStack | Postgres MCP: SQL injection bypass of read-only mode (semicolon injection CVE); Playwright MCP: open RCE in browser_run_code_unsafe + sandbox escape Issue #1495 |

## CLI-only stack (no MCP - use via Bash tool)

Every capability below has a working CLI on the local machine. Use Bash tool to invoke. MCP not needed (and where one exists, banned to avoid token bloat or security CVEs).

| Capability | CLI tool | Install path / source |
|---|---|---|
| **Framework docs (NestJS/Bun/Drizzle/React/Expo/Next/Astro/etc., version-pinned)** | `c7` (context7 CLI) | `npm install -g context7` (just installed; works: `c7 <project> [query]`, `c7 search <term>`, `c7 info <project>`) |
| **GitHub ops (issues/PRs/Actions/repos)** | `gh` | `/opt/homebrew/bin/gh` |
| **VCS** | `git` | `/usr/bin/git` |
| **Sentry error tracking** | `sentry-cli` | `npm:@sentry/cli` (bin: sentry-cli) |
| **Grafana ops** | `grafanactl` | `brew install grafanactl` |
| **Browser automation** | `playwright` | `/Users/dev/.nvm/.../playwright-cli` (installed) |
| **DB queries (Postgres/SQLite/MySQL/50+ others)** | `usql` + `psql` + `sqlite3` | `/opt/homebrew/bin/usql` + `psql` + `sqlite3` (all installed) |
| **SAST** | `semgrep` | `/opt/homebrew/bin/semgrep` (installed) |
| **Secrets pre-commit** | `gitleaks` | `/opt/homebrew/bin/gitleaks` (installed) |
| **K8s ops** | `kubectl` + `k9s` (TUI) | `kubectl` installed; `k9s` via brew if needed |
| **Structural code search** | `ast-grep` / `sg` | `/opt/homebrew/bin/ast-grep` + `/opt/homebrew/bin/sg` (installed) |
| **File/text search** | `rg` + `fd` | `/opt/homebrew/bin/rg` + `/opt/homebrew/bin/fd` (installed) |
| **HTTP requests** | `xh` + WebFetch built-in | `/opt/homebrew/bin/xh` (installed) |
| **Web search** | WebSearch built-in + `tavily-cli` if needed | `npm:tavily-cli` (bin: tavily-cli) |
| **JSON/YAML processing** | `jq` + `yq` | both installed |
| **Code complexity** | `lizard` | `~/.local/bin/lizard` (installed) |
| **Perf benchmark** | `hyperfine` | installed |
| **Watch loops** | `watchexec` | installed |
| **Container ops** | `docker` | installed |
| **JS runtime + pkg mgmt + test + bundle** | `bun` | per [[curaos-bun-primary-rule]] |

## Conditional MCPs (per-session activation only)

These MCPs require explicit session-level activation. NEVER ship in must-have set.

| MCP | Activation trigger | Why MCP not CLI | Security caveat |
|---|---|---|---|
| **Sentry MCP** | Agentic Seer AutoFix loop in dev/CI | CLI good for routine; MCP needed for Seer agentic root-cause analysis | Dev/CI only; per [[curaos-error-tracking-rule]] PHI scrub mandatory at SDK |
| **GlitchTip-compat Sentry MCP** | Prod/staging error investigation | No purpose-built GlitchTip MCP; try Sentry MCP w/ `--host=<glitchtip-url>` flag | Experimental; validate compat before adoption |

**That's the whole conditional list.** Everything else moved to CLI or banned.

## Banned MCPs

### Banned because CLI is superior

| MCP | CLI replacement |
|---|---|
| **GitHub MCP** | `gh` CLI (42-55K token schema overhead per session is unacceptable) |
| **Grafana MCP** | `grafanactl` (brew) + `curl`/`xh` against Grafana API for ad-hoc PromQL/LogQL |
| **Playwright MCP** | `playwright` CLI (also: RCE + sandbox escape; never HealthStack) |
| **Kubernetes MCP** | `kubectl` + `k9s` TUI |
| **Semgrep MCP** | `semgrep` CLI (pre-commit + agentic invocation via Bash) |
| **git MCP** | `git` CLI |
| **Filesystem MCP** | Claude Code native Read/Write/Edit (superior) |
| **Fetch MCP** | WebFetch built-in tool + `xh` CLI |
| **Postman/Insomnia MCPs** | `xh` CLI + `usql` for DB testing |
| **Puppeteer MCP** | `playwright` CLI (superior) |
| **ast-grep MCP** | `sg` / `ast-grep` CLI |
| **tree-sitter MCP** | codegraph covers structural queries |
| **Sourcegraph MCP** | codegraph local + `rg` for cross-repo |
| **12+ Cloudflare-* MCPs** | `wrangler` CLI if Cloudflare-deployed |

### Banned because too heavy / wrong fit

| MCP | Why banned |
|---|---|
| **Serena MCP** | Too heavy (~30 tool schemas + Python LSP backends); rely on per-language LSPs in editors + quality gates per [[curaos-quality-gates-rule]] when locked |
| **Anthropic KG Memory MCP** | Redundant w/ Claude Code auto-memory + ai/rules/ + per-module CONTEXT.md + DECISION-LOG.md (per [[curaos-knowledge-persistence-rule]] when locked) |
| ~~**Mem0 / OpenMemory / Letta / Zep MCPs**~~ | SUPERSEDED 2026-06-21: self-hosted Mem0 ADOPTED as the cross-tool memory backend via a local stdio MCP shim - see [[curaos-mem0-memory-backend-rule]]. Letta / Zep / OpenMemory (sunset upstream) + the Mem0 CLOUD MCP (mcp.mem0.ai, Platform key) stay banned; only the self-hosted-shim path is allowed. |
| **Sourcegraph MCP** | Enterprise license + cloud dep; codegraph covers local-repo case |

### Banned because not in CuraOS stack

| MCP | Reason |
|---|---|
| **Figma MCP** | User doesn't use Figma |
| **Linear MCP** | GitHub Issues canonical (per this rule) |
| **Jira/Atlassian MCP** | Not in stack + active CVE-2026-27825 RCE + CVE-2026-27826 SSRF |
| **GitLab MCP** | GitHub-native org |
| **MongoDB MCP** | Postgres-primary per [[curaos-postgres-rule]] |
| **Datadog MCP** | Self-hosted GlitchTip+Grafana+Pyrra per [[curaos-error-tracking-rule]] + [[curaos-slo-rule]] |
| **AWS/GCP/Azure MCPs** | Self-hosted first per AGENTS.md §3 charter; add per-tenant only if needed |
| **Browserbase** | Cloud-only; violates self-hosted charter |

### HARD BANS (security/CVE)

| MCP | Hard ban reason |
|---|---|
| **Postgres MCP → prod/staging DBs** | SQL injection bypass of read-only mode (semicolon injection); dev/test ONLY w/ scoped read-only role + NO PHI schemas |
| **Playwright MCP → HealthStack sessions** | Open RCE in `browser_run_code_unsafe`; sandbox escape Issue #1495; can access internal cluster URLs (169.254.x, *.svc.cluster.local) |

## Per-session activation pattern (locked)

### Default session (general coding)

Only must-have MCPs loaded:
- codegraph + open-design + context-mode + deepwiki (Claude Code)
- codegraph + open-design + context-mode + computer-use (Codex)

Token overhead: ~8-12K/session.

### Session-type profiles (activate via `.claude/project.json` per session)

```json
// .claude/sessions/incident-response.json
{
  "mcpServers": {
    "sentry": { "command": "npx", "args": ["@sentry/mcp-server@latest", "--host=<dev-sentry-url>"] }
  }
}
```

Session types:
- `incident-response`: + Sentry MCP (when Seer AutoFix needed beyond routine `sentry-cli`)
- `experimental-glitchtip`: + Sentry MCP w/ `--host=<glitchtip-url>` flag (validate compat)
- Default: only must-have set

### Tool-search subagent (Claude Code 2.0.6+)

Enable when active MCP count exceeds 3:
```json
// .claude/settings.json
{
  "toolSearchSubagent": { "enabled": true, "threshold": 3 }
}
```

Defers tool schema loading until needed; 47% main-thread overhead reduction.

## GitHub Issues as canonical work queue (locked)

- All CuraOS issues live on per-repo GitHub across 93 `your-org` repos
- `gh` CLI is the canonical interface (no MCP)
- Existing triage-labels skill (per [[curaos-repo-boundary-rule]] + AGENTS.md "Triage labels" section) provides 5-state state machine: `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix` + categories `bug` / `enhancement`
- GitHub Agentic Workflows (Feb 2026, technical preview) converts Issues into agent tasks natively - adopt when GA
- Atomic claim pattern: `ready-for-agent` → `agent-claimed:<id>` label flip before agent starts work
- Issue frontmatter consumable by agents:
  ```yaml
  ---
  module: identity-service
  effort: small
  requires: [bun test]
  blocked-by: []
  agent-notes: "Scope: src/auth/ only"
  ---
  ```

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter (self-hosted first) | All must-have MCPs are local (codegraph stdio, open-design local app, context-mode plugin); deepwiki cloud but cheap |
| AGENTS.md §6 NFR (performance) | CLI-first eliminates 17× MCP cost premium; per-session activation eliminates 67K token preload |
| AGENTS.md §10 (agent operating rules) | Per-session activation reduces context bloat; tool-search subagent honors context engineering principles |
| AGENTS.md §11 (boundaries + approvals) | HARD BANS on Postgres MCP→prod PHI + Playwright MCP→HealthStack prevent CVE exploitation |
| [[curaos-cli-agents-rule]] | All MCPs work across Claude Code + Codex + Pi (Pi uses MCP via opencode/opencode-go providers per DA1) |
| [[curaos-bun-primary-rule]] | CLI invocations use `bunx` for npm-distributed tools (c7, sentry-cli, etc.) |
| [[curaos-agents-md-schema-rule]] | MCP config per-module documented in AGENTS.md Toolchain Registry section |
| [[curaos-repo-boundary-rule]] | No MCP-derived state leaks into submodule repos |
| [[curaos-error-tracking-rule]] | Sentry MCP dev/CI conditional; GlitchTip MCP experimental |
| [[curaos-postgres-rule]] | Postgres MCP hard-banned for prod PHI; CNPG ops via kubectl + grafanactl, not MCP |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical: memory ↔ ai/rules/ ↔ AGENTS.md §15 |

## Agentic-tool friendliness

Why CLI-first + minimal MCP wins for agents:

- **Bash tool universal across all CLIs** (Claude Code + Codex + Pi + Gemini + Aider) - no per-agent MCP config
- **CLI cost = ~0 tokens** vs MCP 400-55K per call schema
- **CLI tools have stable APIs** - MCP tool schemas drift between versions, break agentic loops silently
- **CLI output is testable + reproducible** - pipe to `jq`/`yq` for structured parsing
- **CLI errors are explicit** - exit codes; MCP errors often wrapped or swallowed
- **Per-session MCP activation** = orchestrator agent selects profile per task class; budget-aware
- **Tool-search subagent at >3 MCPs** = 47% main-thread overhead reduction
- **HARD BANS** prevent CVE exploitation (Postgres MCP→PHI; Playwright→HealthStack)
- **GitHub Issues + gh CLI + triage-labels skill** = single canonical work queue across 93 repos; no MCP needed

## How to apply

- `~/.claude/settings.json`: must-have MCPs only (codegraph + open-design + context-mode + deepwiki)
- `~/.codex/config.toml`: must-have MCPs only (codegraph + open-design + context-mode + computer-use)
- Per-session activation: `.claude/sessions/<type>.json` enables conditional MCPs (Sentry, GlitchTip-experimental)
- Tool-search subagent enabled when active MCP count exceeds 3
- Install missing CLIs (one-time setup):
  - `npm install -g context7` (provides `c7` binary) - already done
  - `npm install -g @sentry/cli` (provides `sentry-cli`)
  - `brew install grafanactl k9s trivy syft grype cosign trufflehog`
  - `brew install oxlint lefthook k6` (per quality gates rule when locked)
  - `bun add -g stryker vitest knip syncpack` (per quality gates rule when locked)
- Audit per quarter: any MCP in must-have set must justify why CLI doesn't substitute; demote to conditional or ban
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate to memory + ai/rules/ + AGENTS.md §15 + README.md indexes

## ADRs queued

Per digest §6:
- **ADR (NEW, MCP stack curation + per-session activation)** - number TBD (0152 reused by minor-info-findings-resolutions; use next free number ≥0212): full version; this rule = short form
- **ADR-0099 (charter)**: amend §10 agent operating rules to reference CLI-first + per-session MCP activation principle
