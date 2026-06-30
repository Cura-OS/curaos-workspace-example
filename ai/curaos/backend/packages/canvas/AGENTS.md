---
name: curaos-canvas
description: "Shared drag-drop builder canvas + node-graph canvas primitives for visual tools (ADR-0121d)."
tags: [package]
language: typescript
framework: react
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/canvas"
adrs:
  - ADR-0121d
  - ADR-0209
target: browser
---

# @curaos/canvas (ADR-0121d)

Dual-mode canvas: builder drag-drop + node-graph. Undo/redo, pan/zoom, keyboard. Web-only.

## Commands
```bash
bunx turbo run build --filter=@curaos/canvas
bunx turbo run lint --filter=@curaos/canvas
bunx turbo run test --filter=@curaos/canvas
bunx turbo run storybook:build --filter=@curaos/canvas
```
