---
name: curaos-scripts
description: Developer tooling scripts for bootstrapping and managing CuraOS environments.
tags: [tooling, scripts]
language: bash
framework: none
infrastructure: none
tooling:
  - bash
  - powershell
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [dev]
docs:
  adr: ai/curaos/docs/adr/
---

# curaos-scripts

Developer tooling scripts for bootstrapping and managing CuraOS environments.

## Module agent contract

This file is the cross-CLI agent contract for this module. The frontmatter above carries structured metadata previously held in `codex.json`. All CLI agents that read `AGENTS.md` (Codex, OpenCode, Cursor, Aider) consume this file natively; Claude Code reads it via `@AGENTS.md` import.

Read the workspace-level `curaos-workspace/AGENTS.md` first for charter, NFRs, contracts, and operating rules. This file holds module-local intent only.
