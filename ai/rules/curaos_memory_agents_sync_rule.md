---
name: curaos-memory-agents-sync-rule
title: Memory ↔ ai/rules/ sync policy
description: ai/rules/ is canonical for workspace rules; memory/ holds only non-rule auto-memory types (user/feedback/project/reference). No duplicate rule storage.
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User directive (2026-05-25 - supersedes 2026-05-24 bidirectional-sync rule):

## The rule

**`ai/rules/curaos_*.md` is the SINGLE canonical store for every CuraOS workspace rule.** Claude memory (`~/.claude/projects/-Users-dev-workspace-curaos-workspace/memory/`) MUST NOT duplicate rule files. Memory holds only the four legitimate auto-memory types per Claude Code spec:

| Type | Purpose | Example |
|---|---|---|
| `user` | Who the user is, role, expertise | "deep TypeScript, learning HealthStack domain" |
| `feedback` | Behavioral guidance from corrections + confirmations | "always interview per DA; never batch-lock decisions" |
| `project` | Active work state, deadlines, motivations | "DA11 cost gateway adopted via Presidio + LiteLLM" |
| `reference` | External system pointers | "GitHub Issues canonical work queue per [[curaos-mcp-stack-rule]]" |

Workspace rules (technical decisions, stack picks, banned-tool lists, gating policies) live ONLY in `ai/rules/`. Cross-referenced from MEMORY.md by link, never copied.

**Why:** double-storage causes (1) double context load per session, (2) drift between memory↔workspace, (3) silent rule-version conflicts when one side edits without the other. `ai/rules/` is the cross-CLI canon (Codex, Gemini, OpenCode, Cursor, Aider all read it via AGENTS.md §15 links); Claude Code's memory loads MEMORY.md alone per session. Memory cites rules by `[[curaos-<slug>-rule]]` link; AGENTS.md §15 lists every rule for non-Claude agents.

## Sync mandate (now one-direction only)

| Action | ai/rules/ | MEMORY.md | AGENTS.md §15 | ai/rules/README.md |
|---|---|---|---|---|
| Add rule | create `<name>.md` | DO NOT copy content; cite by `[[name]]` if relevant | add row | add row |
| Edit rule | edit `<name>.md` | n/a (no copy exists) | update row description if material | update row description if material |
| Delete rule | delete `<name>.md` | remove any `[[link]]` references | remove row | remove row |
| Rename rule | rename in ai/rules/ | update any `[[link]]` references | update row | update row |
| New non-rule memory (user/feedback/project/reference) | n/a | create memory file + add MEMORY.md entry | n/a | n/a |

## What stays in memory/

- `curaos_memory_agents_sync_rule.md` - THIS file (self-reference; bootstrap policy that tells Claude memory how to behave; bidirectional exception)
- Any future user/feedback/project/reference type memory per auto-memory spec
- `MEMORY.md` index - points to non-rule entries + `[[link]]`s to ai/rules/ for binding rules

## What moves to ai/rules/ only

- Every technical decision (DA1-DA12 + future)
- Every stack pick (runtime, ORM, validation, observability, etc.)
- Every banned-tool list
- Every gating policy (quality, verification, knowledge persistence, etc.)
- Every behavioral rule that binds CLI agents beyond Claude Code

## Behavior change for every agent

- **Adding a rule:** write to `ai/rules/<slug>.md` + update `ai/rules/README.md` + update `AGENTS.md §15`. Do NOT copy to memory.
- **Adding a memory:** if the content is a behavioral/technical rule, it goes to ai/rules/ instead. If it's user/feedback/project/reference, it goes to memory/ + MEMORY.md.
- **Reading context:** Claude Code loads MEMORY.md per session (small, non-rule entries). When a rule is needed, follow `[[link]]` and load `ai/rules/<slug>.md` on-demand. Non-Claude agents read AGENTS.md §15 + the linked rule file directly.

<!-- fold: rationale, non-binding -->

## Migration (2026-05-25)

All `curaos_*_rule.md` files previously duplicated in `memory/` are **deleted from memory/**. They remain in `ai/rules/`. MEMORY.md no longer indexes rule files; new entries point to rule SLUGS via `[[link]]` instead.

## Detection (drift check)

```bash
# Memory must NOT contain rule files (other than this sync rule + reference memories)
ls ~/.claude/projects/-Users-dev-workspace-curaos-workspace/memory/curaos_*_rule.md 2>/dev/null \
  | grep -v 'curaos_memory_agents_sync_rule.md' \
  | wc -l
# Expected: 0

# Every ai/rules/ file MUST appear in ai/rules/README.md + AGENTS.md §15
for f in ai/rules/curaos_*.md; do
  name=$(basename "$f")
  grep -q "$name" ai/rules/README.md || echo "MISSING_README: $name"
  grep -q "$name" AGENTS.md || echo "MISSING_AGENTS: $name"
done
```
