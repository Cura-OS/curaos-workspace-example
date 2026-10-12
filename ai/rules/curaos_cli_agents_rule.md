---
name: curaos-cli-agents-rule
title: Per-project Codex and Claude Rice tooling
description: Configured native Rice client/MCP and project skills, maintained toolkit reference and native harness execution.
---

# Per-project agent tooling

Codex and Claude retrieve current task context and linked knowledge through the configured native Rice client/MCP and project-installed skills. Follow the same owning code, review, provenance and delivery contracts through their own native tools. Shared language/infra/execution guidance is global; tools, MCP, skills and hooks remain project-specific.

Use an installed CLI when it owns the operation. Keep maintained code in the owning project/toolchain and never introduce or directly execute Python for this non-Python template. The template launcher is configuration/cwd glue, not a substitute Rice implementation.

Follow [setup](../../SETUP.md) to persist the explicit toolkit/client/profile references. A missing binding refuses; there is no copied workflow or local task-store fallback. Rice also supplies live streams, push, machine/runner integration and onboarding, beyond knowledge retrieval.
