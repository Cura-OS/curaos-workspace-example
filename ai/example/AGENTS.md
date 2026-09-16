---
name: example
description: "Sanitized sample of a project-specific agent documentation mirror. Pattern only; ships no product code."
tags: [example, mirror, sample]
language: none
framework: none
infrastructure: none
tooling:
  - just
  - bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: []
docs:
  context: ai/example/CONTEXT.md
  rules: ai/rules/README.md
  root: AGENTS.md
---

# Example Project Agent Contract

Read this before changing files under the example project. This folder is the
project-specific agent documentation mirror. It intentionally holds only a small
sanitized sample and ships no product code, secrets, or infrastructure.

## Mission

Show the shape of a per-project agent mirror: where project context, rules, and
module docs sit relative to a code tree, without exposing any real product. When
you adopt the template, replace this mirror with your own project per SETUP.md,
and keep the code tree beside `ai/` rather than inside it.

## Toolchain Registry

- Package manager and task runner: `bun` and `just` (see the repo `justfile`).
- Docs and link check: `python3 scripts/check-public-docs.py`.
- Full local gate: `just ci` (docs, mirror, pins, and the JS and shell suites).
- No product build, service, or deployment tooling ships in this sample.

## Judgment Boundaries

- Keep product code outside `ai/`; this tree carries agent context only.
- Keep project context in `CONTEXT.md`; keep cross-cutting policy in `ai/rules/`.
- Link to shared rules instead of copying their text.
- Add module-level docs only after the matching module exists in the code tree.
- Never commit secrets, customer data, private infrastructure, or internal
  roadmap detail to this repository.
- Never use em dash or en dash characters in any file.
