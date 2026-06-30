# @curaos/codegen-sdk — Agent Context

## Quick facts
- Node.js only (CLI tool); not consumed at runtime by frontend packages
- Five recipes: ui.react-next, ui.react-native, ui.astro, ui.lit-widget, lib.nestjs-shared
- Templates in `src/templates/<recipe>/`; Handlebars

## Key files
- `src/scaffold.ts` — scaffold() entry point
- `src/validate.ts` — validate() entry point
- `src/recipes/` — recipe definitions + option schemas
- `src/templates/` — Handlebars template trees per recipe

## Agent rules
- Generated files must include `// @generated — do not edit` comment where appropriate.
- Recipe templates must stay in sync with ADR-0153 conventions; update both when a convention changes.
- Run `bunx turbo run build lint test` before marking done.
