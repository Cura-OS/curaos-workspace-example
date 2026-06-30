---
name: curaos-design-generation-rule
title: Design generation (OpenDesign-driven, generator-ingestable)
description: New designs/widgets/pages/themes MUST be produced via OpenDesign od CLI + OD MCP + design skills + online research, comply with each app's intent + general CuraOS design principles, and be expressed as generator-ingestable config (gen:ui-app/ui-app-native produce the full output); bespoke special-case designs allowed only if regeneratable from config; zero hand-coded out-of-generator UI; enrich the generator when it cannot emit a design
metadata:
  node_type: memory
  type: feedback
---

# Design Generation Rule (OpenDesign-driven, generator-ingestable)

Status: Binding. User directive 2026-06-16. Extends [[curaos-generator-evolution-rule]] + the generator-first / zero-special-edits directive to the DESIGN layer.

## Rule

Any new design, widget, page, layout, or theme for a CuraOS app MUST be produced through the design toolchain and then expressed as **generator-ingestable config**, never as hand-coded one-off UI. The toolchain, in order of reach:

1. **OpenDesign `od` CLI + OpenDesign MCP** - the primary surface for creating + iterating designs. Use `od` (and the `mcp__open-design__*` tools: `start_run`, `get_artifact`, `write_file`, `list_skills`, etc.) to prompt for and render the design (core widgets, design language, per-app special cases). The OD active-context defaults apply (operate on the open project/file unless told otherwise).
2. **Impeccable skills** - invoke the relevant design/frontend skills (e.g. `frontend-design`, design-iteration, figma-sync equivalents) on top of OD for craft + critique.
3. **Online research** - look up current design patterns, the app's domain conventions, competitor/platform references, and accessibility/i18n/RTL norms before inventing. Designs must comply with both the SPECIFIC app's intent (its Requirements/CONTEXT) and the GENERAL CuraOS design principles (the `@curaos/ui` design language, per-app accent palette, grouped iconed nav, the OD app-shell grammar).

## Bespoke designs are allowed - if they stay generator-ingestable

Apps with special design cases MAY get full bespoke designs (not just the default CRUD shell). The HARD constraint: the design output must be **config/data the generators ingest** so `gen:ui-app` / `gen:ui-app-native` (and any backend contract emitter) produce the full intended output from it. A bespoke design that can only be hand-coded into one app is FORBIDDEN - it is the special-edit anti-pattern that produced the ~14% functional shells.

This means: when OD produces a new widget or page that the current generator cannot emit, the fix is to **enrich the generator** (add the template/emitter/schema/config-shape) so the design becomes a reproducible, regeneratable artifact - then drive it from per-app config. The design and its generator support land together. Never fork the design into a hand-maintained app file.

## What "generator-ingestable" means concretely

- A design decision becomes one of: a `@curaos/ui` primitive/variant, an emitter template, a per-app config field (accent, nav grouping, screen/widget descriptor), or a contract-derived schema the emitter reads. It is data + a generator that consumes it.
- Per-app override config (special-case apps) lives alongside the app's ai-docs / a generator-read config, NOT as edits to emitted files.
- The round-trip MUST hold: regenerating the app from config reproduces the design exactly. If a regen would wipe the design, the design is not yet generator-ingestable and the work is not done.

## Workflow

For any design task: (1) OD `od`/MCP + design skills + research to produce the design; (2) reconcile against the app's intent + general principles; (3) express it as generator config + enrich the generator to consume it (frontend emitter and, where the design implies new data, the backend contract); (4) regenerate + verify the output matches the design; (5) fold every uncovered edge case back into the generator per [[curaos-generator-evolution-rule]]. Zero out-of-generator special edits.

## Links
- [[curaos-generator-evolution-rule]] (every edge case folds into the generator)
- [[curaos-speed-patterns-rule]] (generator-first culture)
- ADR-0219 (frontend v1 functional-parity program), ADR-0216/0217 (app emitters)
- `generator-first-zero-special-edits` (the governing user directive this design rule serves)
