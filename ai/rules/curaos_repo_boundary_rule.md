---
name: curaos-repo-boundary-rule
title: Repo boundary
description: STRICT separation - curaos repo + all submodules (live count from `curaos/.gitmodules`) are human-accessible code repos; no workspace ai-doc / ADR links / impl decisions ever leak into them
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User correction (2026-05-24, twice now):

## The rule

**curaos repo + all submodules (derive the live count from `curaos/.gitmodules`) are normal human-accessible repos. They contain:**
- Source code (when scaffolded)
- Auto-generated READMEs OK if they don't reference workspace/ADRs
- Bare minimum: `.gitmodules`, `README` (minimal), `CHANGELOG` (minimal), maybe `.gitkeep` dirs
- **Nothing else from workspace.**

## What NEVER goes in curaos or its submodules:
- Links to ADRs (any URL pattern like `curaos-ai-workspace/ai/curaos/docs/adr/*`)
- ADR stack-decision tables / inventory tables / mirror-of-ADR content
- References to "workspace" or "ai/curaos/" mirror
- Implementation values I (agent) chose: env vars, gitignore patterns, config snippets, version numbers
- Planning artifacts: PRDs, tasks, issues, roadmaps

**ADRs are decisions, not plans, not impl.** Their content stays in the workspace ONLY. They will later be migrated to GitHub Projects + per-repo PRDs/issues/tasks using Matt's setup skill.

## Why the user is right
- ADRs change → mirror content drifts → confusion
- curaos is the **monorepo container**, not the planning canon
- Per-repo PRDs/issues attached to GitHub Project will replace the mirror-in-README pattern
- I keep adding impl-decision content that doesn't belong; user has corrected me TWICE

## How to apply

When working in `curaos/` or any of the 91 submodule repos:
- READMEs: minimal - service name + one-line purpose + status (e.g., "clean slate, scaffolding pending"). NO stack tables, NO ADR links, NO workspace links.
- `.gitignore`: standard universal patterns only (OS, IDE, common build dirs) - NOT language-specific picks that imply stack decisions
- `.env.example`: SKIP unless user explicitly asks. Don't invent env vars.
- `CHANGELOG.md`: minimal entries describing what physically happened (files added/removed). NO references to ADR numbers or strategic context. Strategic context belongs in workspace.
- Docker compose / K8s manifests / scripts: DO NOT WRITE until user asks. Even then, generated via Codegen (ADR-0123) later - not by hand.
- New files inside submodules: only when scaffolding actual code via Codegen Engine.

## Per-cluster ai-doc behavior in workspace

In the WORKSPACE `ai/curaos/` mirror - ADR links + cluster references + stack tables ARE OK. That's the canonical planning location. The boundary is: curaos repo (clean) ↔ workspace ai/curaos/ (planning).

## Future migration

User will use Matt's setup skill to migrate workspace docs to GitHub Projects (PRDs + issues + tasks) attached per-repo. After migration:
- curaos repo will get GitHub Project board with issues
- Each submodule may get its own GitHub Project + per-module PRDs
- Workspace ADRs become root governance; per-repo work becomes operational

## Behavior change

Stop writing implementation details, configs, or stack-reference content in curaos repo + submodules.

When asked to "clean up" or "align with ADRs" in curaos/submodules:
- Just delete what's wrong/outdated
- Don't replace with new content unless it's strictly structural (e.g., directory `.gitkeep` to preserve empty path)
- If user wants a file written, ask what content they want; don't invent.
