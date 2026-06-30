---
name: curaos-context-engineering-rule
title: Context engineering (Anthropic 5 criteria + BATS)
description: Context engineering - Anthropic 5 criteria (relevance/sufficiency/isolation/economy/provenance); stable-first cache ordering (tool defs → system → docs → conv → user) + cache_control breakpoints + max_tokens=0 pre-warm; 1h TTL for low-frequency (<3 reads/5min) + default 5m; .claudeignore mandatory; BATS 4-regime budget tracker (HIGH≥70% / MEDIUM 30-70% / LOW 10-30% / CRITICAL <10%); JIT loading via tool calls (no eager loads); sliding 2-step window agentic loops (42% savings vs naive); sub-agent summary-only return ≤2K tokens (never raw); /compact at 60% proactive; persisted output for huge results (context-mode MCP); critical instructions at start+end (lost-in-the-middle)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA4 walkthrough - grounded in [[curaos-cli-agents-rule]] + [[curaos-mcp-stack-rule]]; empirical-driven, no either/or tradeoff):

## The rule

**Six locked principles:**

1. **Anthropic 5 criteria** - relevance / sufficiency / isolation / economy / provenance
2. **Cache discipline** - stable-first ordering + `cache_control` breakpoints + pre-warm + explicit TTL
3. **Context window protection** - `.claudeignore` + JIT loading + sub-agent isolation + persisted output
4. **BATS 4-regime budget tracker** w/ automatic behavior change
5. **Sliding window for agentic loops** - 2-step window prevents O(N²) cost
6. **Lost-in-the-middle defense** - critical instructions at start+end of system prompt

## Banned

- Eager full-context load (use JIT + RAG via codegraph)
- Raw tool output passed up agent chain (use summary-only return)
- Naive agentic loops without sliding window (O(N²) cost trap)
- Single model for all tasks (use layered tiering per [[curaos-cli-agents-rule]])
- Timestamps / UUIDs in cached prefix (destroys cache hits)
- Dynamic user data in system prompt prefix (100% miss rate)
- /compact only when context cliff (use proactively at 60%)
- Eager `Read` of every file in working set (use JIT via tool calls)
- 200K+ context loads for tasks answerable via search (RAG cheaper)
- Memory MCPs as substitute for file-based knowledge (per [[curaos-mcp-stack-rule]] all memory MCPs banned)
- Critical instructions buried in middle of system prompt (lost-in-the-middle)
- 5-min TTL on low-frequency workloads (<3 reads/5min) → use explicit 1h TTL
- Procedural memory in vector stores (procedural = files; semantic = vector)
- Skipping pre-warm on session start (one max_tokens=0 call amortizes across session)
- Swarm dispatch without budget circuit breakers (unbounded fan-out cost)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| Anthropic 5 criteria | Anthropic Engineering Blog Sep 2025 "Effective Context Engineering for AI Agents" - canonical reference |
| Stable-first cache ordering | Cache breakpoint = prefix match; anything after breakpoint processed fresh |
| Explicit 1h TTL for low-frequency | Anthropic silently dropped default TTL 60min→5min on 2026-03-06; 30-60% cost increase for sessions w/ <3 reads per 5 min |
| Pre-warm via max_tokens=0 | Populates cache before first real request; first user request hits warm cache |
| .claudeignore | 80%+ token reduction on codebase navigation tasks (avoid node_modules/dist/build artifacts) |
| BATS 4-regime | Comparable accuracy at 10× lower budget (Nov 2025 BATS framework) |
| JIT loading | 95% context reduction for long-running agents vs eager loading (Morph 2026) |
| Sub-agent summary-only return | Tool results = 30,400 of 48,400 total tokens in naive setups; 39.9-59.7% removable w/o accuracy loss |
| Sliding 2-step window | 42% cost savings on 10-step file-reading agent ($1.49 naive → $0.86 sliding window; Augment Code 2026) |
| /compact at 60% | Proactive compaction prevents cascade failure; CLAUDE.md re-injects post-compact |
| Persisted output (context-mode MCP per [[curaos-mcp-stack-rule]]) | Tool results to disk; agent receives path + 100-200 token summary, not raw content |
| Lost-in-the-middle | LLM attention strongest at start + end; middle of 200K context degrades retrieval |

## 1. Cache discipline (mandatory across all sessions)

### Stable-first ordering law

System prompt structure MUST be ordered most-stable → least-stable:

```
[1] Tool definitions        ← cache breakpoint here (most stable)
[2] System instructions     ← cache breakpoint here (stable)
[3] Background docs         ← cache breakpoint here (per-session stable)
[4] Conversation history    ← automatic caching
[5] Current user message    ← always fresh
```

**Anti-patterns that destroy cache hits:**
- Timestamps / UUIDs in cached prefix → every request = cache miss + write
- Dynamic user data (`{user.name}`) in system prompt prefix → 100% miss rate
- Tool definition objects w/ unstable JSON key ordering → breaks prefix match
- Web search / citations toggles mid-session → invalidates system + message cache

### Explicit TTL discipline

```python
# High-frequency session (>3 reads per 5 min) - default 5-min TTL OK
{"type": "ephemeral"}

# Low-frequency session (<3 reads per 5 min) - opt-in 1-hour TTL (2× write cost)
{"type": "ephemeral", "ttl": "1h"}
```

**Decision tree:**
- ≥3 reads per 5 minutes: default 5-min TTL (cheaper writes; cache hits within window)
- 5+ reads per hour but <3 per 5 min: explicit 1-hour TTL (pays 2× write once; amortizes over more reads)
- <5 reads per hour: skip caching entirely (cache write cost exceeds savings)

### Pre-warm pattern

```python
# At session start, send max_tokens=0 request to populate cache
client.messages.create(
  model="claude-sonnet-4-6",
  system=[
    {"type": "text", "text": tool_defs, "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": system_instructions, "cache_control": {"type": "ephemeral"}}
  ],
  max_tokens=0
)
```

Pays write cost; first user request hits warm cache.

### Token math (Sonnet 4.6 $3.00/M input)

```
50,000-token system prompt
Standard input:        $0.150 per request (no cache)
Cache write (5m):      $0.1875 one-time
Cache read:            $0.015 per hit

Break-even: 1.4 reads/window
10 reads/window: $0.1875 + 9×$0.015 = $0.3225 vs $1.50 = 78% saving

Extended 1h TTL (2× write):
Cache write:           $0.30 one-time
Break-even:            2.2 reads/hour
20 reads/hour:         $0.585 vs $3.00 = 80.5% saving
```

## 2. Context window protection (mandatory)

### `.claudeignore` (workspace root)

```
node_modules/
dist/
build/
.next/
.turbo/
.bun/
.git/
**/coverage/
**/playwright-report/
**/.cache/
**/tmp/
**/*.lock
**/*.log
```

Equivalent for non-Claude agents: `.agentignore` or explicit `fd`/`rg` queries scoped to `src/`.

**Result:** 80%+ token reduction on codebase navigation tasks.

### JIT (Just-in-Time) loading

Instead of loading entire repos at start:
1. Agent maintains lightweight references (file paths, query IDs, links)
2. Dynamically loads via tool calls when needed (via codegraph_search, Read, Bash:rg)
3. Discards loaded content after use (tool result clearing from deep history)

**Result:** 95% context reduction for long-running agents vs eager loading (Morph 2026 analysis).

### Sub-agent isolation protocol

```
Worker agent receives (≤2K tokens):
  - Task specification (500-1000 tokens)
  - Relevant files only (fetched JIT)
  - Tool subset for this task (NOT global toolset)
  - Return format spec

Worker agent returns (≤2K tokens):
  - Structured summary
  - Artifact written to disk; orchestrator receives path
  - NOT: raw tool outputs, full file contents, debug traces
```

**Never pass raw tool output up the chain.** Empirical: 30,400 of 48,400 total tokens were tool results in naive agent context; 39.9-59.7% removable w/o accuracy loss.

### Persisted output for huge tool results (per [[curaos-mcp-stack-rule]] context-mode MCP)

Pattern for large outputs (git diff, test output, full file content):

```
1. Tool runs; writes result to sandbox file (via context-mode MCP)
2. Agent receives path + summary (100-200 tokens), not raw content
3. If analysis needed: dedicated sub-agent reads file, returns summary
4. Main agent context never sees raw output
```

This is the "Rust Token Killer" pattern via context-mode MCP. All heavy output stays in sandbox; only structured metadata crosses into primary context.

## 3. BATS 4-regime budget tracker (mandatory)

| Regime | Remaining budget | Behavior |
|---|---|---|
| **HIGH** | ≥70% | Normal operation; load context freely |
| **MEDIUM** | 30-70% | Prefer tighter tool outputs; sub-agent isolation for any new exploration |
| **LOW** | 10-30% | Compress history; skip optional context; defer non-critical reads |
| **CRITICAL** | <10% | Only critical-path tool calls; trigger compaction or sub-agent reset |

**Compression strategies by regime:**
- LOW: scheduled compression every 10-15 tool calls (22.7% token reduction)
- CRITICAL: anchored iterative summarization (fixed anchor updated every N turns; new turns summarized against anchor not raw history)
- CRITICAL: ACON (failure-driven guideline optimization) - distill lessons from failed attempts into compact procedural notes, discard raw failure traces

## 4. Sliding 2-step window for agentic loops (mandatory)

### O(N²) cost problem

Naive agentic loop bills entire prior history per tool call:

```
Total_naive = N×S + u×N(N+1)/2 + r×N(N-1)/2

Where:
  S = system prompt tokens
  u = new input per step
  r = output per step
  N = number of steps

Concrete (Sonnet 4.6, 10-step file-reading agent):
  Naive:      $1.49
  Sliding 2-step window: $0.86  (42% savings)
```

### Fix

- Keep sliding window of 2 prior iterations max in active context
- Every 10-15 tool calls: compress history to summary
- Store artifacts to disk; agent reconstructs state from file paths, not conversation
- Sub-agent dispatch for complex multi-step exploration (isolated context)

## 5. /compact discipline (Claude Code)

### Invocation rules

- Invoke proactively before approaching 60% context utilization (NOT at 85% - too late)
- Use `/compact <focus>` w/ hint about what to preserve
- Survives `/compact`: root CLAUDE.md (auto-reinjected); auto memory MEMORY.md first 200 lines / 25KB
- DOES NOT survive: inline conversation context not in file; nested subdir CLAUDE.md (reloads when Claude reads files in that dir); chat-only instructions
- Never rely on conversation memory for cross-session continuity → write to CLAUDE.md / MEMORY.md / HANDOVER.md (per [[curaos-knowledge-persistence-rule]] when locked)

## 6. Lost-in-the-middle defense (mandatory)

LLM attention strongest at beginning + end of context. Information buried at 50% depth degrades retrieval accuracy significantly.

**Mitigations:**
1. Place most critical instructions at START AND END of system prompt
2. Use RAG (or codegraph_search) to surface specific chunks rather than loading entire codebase
3. Reranking pass before injection (if RAG used)

**Pattern in CuraOS system prompts:**
```
[START]
CRITICAL: Always run `bun run ci` before reporting done.
CRITICAL: NEVER push to main without PR review.
...
[middle: contextual details]
...
[END]
REMINDER: Confirm `bun run ci` exit 0 + show output before marking done.
REMINDER: Use codegraph_search before rg for structural queries.
```

## RAG vs context-loading decision matrix

| Scenario | Use RAG / JIT | Use Full Context Load |
|---|---|---|
| Document corpus > 1M tokens | Yes | No (cost-prohibitive) |
| Cross-lingual / paraphrase-heavy queries | Yes | No |
| Single document < 50K tokens | No | Yes (simpler, more accurate) |
| Codebase navigation (agents) | JIT tool-based (codegraph) | NO eager load |
| Structured facts retrieval | RAG / Mem0 hybrid | No |
| Complete in-context reasoning required | No | Yes |
| Enterprise (50K-100K pre-reasoning) | RAG + MCP for metadata | Long-context for reasoning phase |

### Cost example: 200-page document, 100 queries (Sonnet 4.6)

```
Full-context load:
  100 × 150K × $3.00/M = $45.00

RAG (avg 5K retrieved per query):
  100 × 5K × $3.00/M = $1.50
  + retrieval infra ≈ $0.50
  Total: ~$2.00

Savings: 95.6%
Tradeoff: RAG misses cross-document reasoning
```

**Hybrid pattern (production recommendation):**
- Phase 1: RAG retrieves candidate chunks (budget model or embedding)
- Phase 2: Retrieved chunks + question → mid-tier model for reasoning
- Phase 3: If reasoning requires full doc → escalate to long-context flagship w/ cache

## Long-context handling (when 200K+ helps vs hurts)

### Helps

- Single large document needing complete analysis (legal contract, codebase audit)
- Tasks requiring cross-reference across many sections of same document
- Repository-aware coding where file interdependencies matter
- Debugging where full error + stack + source needed simultaneously

### Hurts

- Tasks where answer is locatable via search (use RAG / codegraph)
- Many independent sub-tasks (use parallel sub-agents w/ isolated contexts per DA1 swarm pattern)
- Creative tasks where noise degrades quality
- Cost-sensitive pipelines where input volume dominates

**Gemini 2.5 Pro 2M use case:** Loading entire NestJS monorepo for cross-module impact analysis; $1.25/M makes 2M-token loads $2.50/request - cheaper than equivalent multi-turn exploration.

## Token tiering routing (cross-reference [[curaos-cli-agents-rule]] DA1)

Per DA1 layered tiering:
- **Budget tier** (~60% of calls): Gemini Flash-Lite ($0.075/M) / Haiku 4.5 ($1/M) / Pi opencode free Zen (nemotron / deepseek-flash-free / big-pickle)
- **Mid tier** (~30% of calls): Sonnet 4.6 ($3/M) / Codex gpt-5.5 medium / Pi opencode-go qwen3.6-plus
- **Flagship tier** (~10% of calls): Opus 4.8 ($5/M) / Codex gpt-5.5 xhigh / reasoning-heavy only
- **Frontier tier** (<5% of calls): Fable 5 ($10/M) / adversarial gates + wave planning + architecture-defining work only

**Target blended:** $0.40-$0.80 per million input tokens vs $3-$5 naive single-model.

**Batch API stacking:** 50% off + 95% off on cached tokens in async mode (24-hour window). Use for nightly evals, analytics, regression runs.

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter | Context discipline reduces cloud LLM cost; supports self-hosted budget tier (Pi opencode/opencode-go) |
| AGENTS.md §6 NFR (performance) | BATS budget tracker + JIT loading + sub-agent isolation = predictable per-session cost |
| AGENTS.md §10 (agent operating rules) | Verification stack (per [[curaos-verification-stack-rule]] when locked) depends on sub-agent isolation defined here |
| [[curaos-cli-agents-rule]] | Model tiering matrix references this rule for routing logic |
| [[curaos-mcp-stack-rule]] | context-mode MCP implements persisted-output pattern; codegraph for JIT structural queries |
| [[curaos-agents-md-schema-rule]] | AGENTS.md <150 lines fits one cache window prefix; full module context loads in one round-trip |
| [[curaos-repo-conventions-rule]] | TSDoc on shared exports lets agents read parameter shapes via JIT without reading impl |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical |

## Agentic-tool friendliness

Why context engineering wins for AI agents specifically:

- **Cache discipline** = 78-95% cost reduction on system-prompt-heavy workloads
- **BATS budget tracker** = predictable cost ceiling per session; orchestrator agent can route mid-session based on regime
- **Sliding 2-step window** = O(N²) → O(N) tool call cost
- **Sub-agent summary-only return** = parent context stays under control even w/ 200+ agent swarm
- **Persisted output via context-mode MCP** = huge tool results never crash main context
- **JIT via codegraph** = structural queries cost <0.1% of full file reads
- **/compact proactively at 60%** = prevents cascade failure; CLAUDE.md re-injects
- **Lost-in-the-middle defense** = critical instructions actually honored vs buried + ignored
- **TTL explicit by frequency** = avoids silent 30-60% cost regression from 2026-03-06 Anthropic change

## How to apply

- Every CuraOS session ships w/ `.claudeignore` (or `.agentignore` for non-Claude agents) at workspace root
- System prompts ordered stable-first w/ explicit `cache_control` breakpoints at boundaries 1+2
- Low-frequency sessions explicitly set `{"type": "ephemeral", "ttl": "1h"}`
- Orchestrator agents enforce BATS regime monitoring + behavior change at thresholds
- Sub-agent dispatch w/ `isolation: worktree` returns summaries only (≤2K tokens)
- Tool results > 10K tokens routed through context-mode MCP for sandbox persistence
- `/compact <focus>` invoked proactively at 60% utilization (NOT at 85%)
- Critical instructions placed at START + END of every system prompt
- Codegen recipes emit cache-friendly system prompts by default
- Per-session BATS regime + token cost logged to Langfuse (per [[curaos-agent-eval-obs-rule]] when locked)

## ADRs queued

Per digest §6:
- **ADR-0153 (NEW, context engineering rules)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §6 NFR performance subsection to reference BATS 4-regime tracker + cache discipline
