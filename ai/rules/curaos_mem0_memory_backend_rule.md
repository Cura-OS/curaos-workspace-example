---
name: curaos-mem0-memory-backend-rule
title: mem0 + Honcho cross-tool memory/personalization backend (self-hosted, via local MCP shims)
description: Two self-hosted backends run side-by-side across the local agentic CLIs/IDEs, each via its own zero-dep local stdio MCP shim. mem0 (mem0.example.com, OSS REST + X-API-Key) = always-on explicit FACT memory (9 mem0 tools). Honcho (honcho.example.com, v3 REST + JWT bearer) = selective deep PERSONALIZATION / theory-of-mind (deriver builds per-peer representation; Dialectic API). Both supersede the "all memory MCPs banned" line in [[curaos-mcp-stack-rule]] for the self-hosted-shim path only; the Mem0 CLOUD MCP, Honcho CLOUD MCP (mcp.honcho.dev), and Letta/Zep/OpenMemory stay banned. ai/rules/ + Claude file-memories remain canonical source of truth; both backends are queryable mirrors, not the system of record.
metadata:
  node_type: memory
  type: feedback
  originSessionId: mem0-integration-2026-06-21
---

User directive (2026-06-21): adopt self-hosted Mem0 as the shared memory backend across every
agentic CLI/IDE on the workstation, pointing at the self-hosted instance, and migrate the CuraOS
workspace file-memories into it. Then (same date) add self-hosted Honcho alongside mem0 as the deep
personalization / theory-of-mind layer, wired the same way (per-tool stdio MCP shim), so BOTH run
side-by-side in every tool.

## The rule

### Honcho personalization layer (added 2026-06-21)

- **Backend:** self-hosted Honcho v3 REST server at `https://honcho.example.com` (Cloudflare ->
  Hetzner Caddy -> honcho-api container + deriver + pgvector + redis; deriver/dialectic/embedder
  on build-host LM Studio over NetBird: `gemma-4-12b-it-qat` + mxbai 1024-dim). Auth =
  `Authorization: Bearer <admin JWT>` (`USE_AUTH=true`). Lives in the private homelab repo
  `services/honcho/`.
- **Integration mechanism:** a local zero-dependency **stdio MCP shim**
  (`honcho-selfhosted-mcp.mjs`) registered as the `honcho` MCP server in each tool's own config,
  ALONGSIDE the `mem0` server (never replacing it). The shim exposes Honcho's core tools
  (`add_message`, `dialectic_query`, `get_working_representation`, `get_context`, `search`, plus
  `create_peer`/`create_session`/`list_peers`/`list_sessions`) and translates MCP calls to the
  Honcho v3 REST API. The official Honcho MCP server is CLOUD-ONLY (hardcoded `mcp.honcho.dev` +
  a `hch-` org key minted at app.honcho.dev; no self-hosted base-url override) and the self-hosted
  FastAPI server speaks REST not MCP, so the shim is the correct path. Canonical source + install
  + per-tool config in homelab `services/honcho/clients/CLIENTS.md` and workspace
  `ai/research/2026-06-21-honcho-integration/`.
- **JWT handling:** never embed the JWT in any tool's MCP config. The shim resolves it from
  `HONCHO_JWT` -> `HONCHO_ENV_FILE` -> `~/.config/honcho/honcho.env` (chmod 600, in no repo) ->
  homelab `services/honcho/admin-jwt.txt`. Never print/commit the JWT to any public or
  git-tracked-public location.
- **Role split (load-aware):** mem0 = **always-on** explicit fact memory; Honcho = **selective**
  deep personalization. Honcho's deriver runs a 12B model per message on build-host, so use Honcho
  selectively (capture salient interactions + query the Dialectic API / representation when
  personalization helps) - do NOT mirror every message into Honcho.

### mem0 fact-memory layer

- **Backend:** self-hosted Mem0 OSS REST server at `https://mem0.example.com` (Cloudflare ->
  Hetzner Caddy -> mem0-api container; LLM + embedder on build-host LM Studio over NetBird). Auth =
  `X-API-Key: <ADMIN_API_KEY>`. Lives in the private homelab repo `services/mem0/`.
- **Integration mechanism:** a local zero-dependency **stdio MCP shim**
  (`mem0-selfhosted-mcp.mjs`) registered as the `mem0` MCP server in each tool's own config. The
  shim exposes the 9 official mem0 tools and translates MCP calls to the OSS REST API. The
  official mem0 plugin's MCP server is hardcoded to the Mem0 CLOUD (`mcp.mem0.ai`, Platform key)
  and cannot target a self-hosted box, so the shim is the correct path. Canonical source +
  install + per-tool config documented in homelab `services/mem0/CLIENTS.md` and workspace
  `ai/research/2026-06-21-mem0-integration/`.
- **Key handling:** never embed the API key in any tool's MCP config. The shim resolves it from
  `MEM0_API_KEY` -> `MEM0_ENV_FILE` -> `~/.config/mem0/mem0.env` (chmod 600, in no repo) ->
  homelab `services/mem0/mem0.env`. Never print/commit the key to any public or git-tracked-public
  location.
- **Source of truth unchanged:** `ai/rules/` (workspace rules) + Claude file-memories
  (`memory/*.md` + `MEMORY.md`) remain canonical per [[curaos-memory-agents-sync-rule]]. mem0 is a
  DUAL-STORE queryable MIRROR, not the system of record. Re-migration is idempotent (reset-then-load).
- **Migration scope:** `user_id=curaos-workspace`, `agent_id=<type>` (project/feedback/reference),
  `infer=false` (verbatim), metadata preserves `source_file` + `[[links]]`. The ~44
  `ai/rules/curaos_*.md` are RULES, not auto-memory, and are NOT bulk-loaded; `MEMORY.md` (which
  links every rule slug) IS migrated so rule slugs stay recall-reachable.

## What stays banned (carve-out is narrow)

- The Mem0 **CLOUD** MCP (`mcp.mem0.ai`, needs a Mem0 Platform key) - banned; self-host only.
- The Honcho **CLOUD** MCP (`mcp.honcho.dev`, needs a Honcho org `hch-` key) - banned; self-host
  only (via the `honcho-selfhosted-mcp.mjs` shim against `honcho.example.com`).
- Letta, Zep, OpenMemory (sunset upstream) MCPs - still banned per [[curaos-mcp-stack-rule]].
- Anthropic KG Memory MCP - still banned (redundant).

## PHI boundary

mem0 AND Honcho here store personal workstation/agent memories only (workspace state, feedback,
references, agent personalization). Do NOT store PHI/PII in mem0 OR Honcho. The HealthStack PHI
boundary ([[curaos-postgres-rule]] + [[curaos-mcp-stack-rule]] hard bans) is unchanged.

## Precedence note

This rule supersedes the single "all memory MCPs banned" line in [[curaos-mcp-stack-rule]] for the
self-hosted-shim path only (that line is struck through with a pointer here), for BOTH the mem0 and
Honcho self-hosted shims. All other MCP-stack bans and hard bans remain in force.
