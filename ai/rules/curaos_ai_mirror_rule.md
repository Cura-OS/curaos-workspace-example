---
name: curaos-ai-mirror-rule
title: AI mirror (ai/curaos/ ↔ curaos/ 1:1)
description: ai/curaos/ folder layout MUST mirror curaos/ real layout 1:1; sync any structural change in same commit
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User directive (2026-05-24):

## The rule

**`ai/curaos/<path>` is a 1:1 structural mirror of `curaos/<path>`.** For every code dir or submodule at `curaos/<X>/`, an agent-doc dir at `ai/curaos/<X>/` MUST exist. Reverse also holds - no AI-only dirs without real counterpart. No `_planned/` or staging dirs; every module with agent docs MUST be a real submodule. Create the submodule first (`gh repo create` + `git submodule add`), then add ai-docs in the same commit cycle.

When `curaos/` adds/renames/moves a submodule or package, `ai/curaos/` MUST update in the same commit (or immediately after the submodule pointer bump). No drift tolerated.

## Specific naming alignment

| Real | AI mirror |
|---|---|
| `curaos/frontend/apps/<kebab>/` | `ai/curaos/frontend/apps/<kebab>/` |
| `curaos/frontend/packages/<kebab>/` | `ai/curaos/frontend/packages/<kebab>/` |
| `curaos/backend/services/<kebab>-service/` | `ai/curaos/backend/services/<kebab>-service/` |
| `curaos/backend/packages/<kebab>/` | `ai/curaos/backend/packages/<kebab>/` |
| `curaos/ops/<area>/` | `ai/curaos/ops/<area>/` |

## Forbidden

- snake_case dirs in submodule names - always kebab-case
- wrapper dirs like `curaos-apps/`, `cura_os/`, `cura_os_healthstack/` - flatten to `apps/<kebab>` + `packages/<kebab>`
- AI-only dirs without matching real submodule
- `_planned/` or `_staging/` dirs - create the real submodule first

## How to check

Run `/Users/dev/workspace/curaos-workspace/scripts/check-ai-mirror.sh`. Exit 0 = aligned, non-zero = drift.

## Why

User correction 2026-05-24: AI mirror had snake_case `cura_os/`/`cura_os_healthstack/` wrappers + 5 orphan dirs (clinician_app/patient_app/front_office/builder_studio/workflow_designer) w/ no real submodule. Painful manual mapping every time agent wanted to find docs for a service. Sync mandate eliminates lookup overhead.

## How to apply

- Before every commit that touches `curaos/` submodule structure (`.gitmodules`, `git submodule add/rm`, dir rename), update `ai/curaos/` mirror in same commit.
- After every commit to `curaos/` that adds/removes/renames a dir, run `scripts/check-ai-mirror.sh`. If FAIL, fix mirror BEFORE pushing.
- When user asks to add a new service/package/app: `gh repo create` under your-org first → `git submodule add` into `curaos/<path>/` → mirror dir under `ai/curaos/<path>/` w/ AGENTS.md+CONTEXT.md+Requirements.md → commit all together.
- When agent docs (Requirements.md / CONTEXT.md / AGENTS.md) exist for a module: they live ONLY in `ai/curaos/<path>/`, never in `curaos/<path>/`. Per [[curaos-repo-boundary-rule]].
