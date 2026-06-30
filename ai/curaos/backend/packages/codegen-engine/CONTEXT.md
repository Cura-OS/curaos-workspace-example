# codegen-engine — Agent Context

## Status

M1 stub scaffolded 2026-05-25. Full impl per [ai/curaos/docs/HANDOVER.md](../../../docs/HANDOVER.md) (codegen milestone).

## Intent

Template engine driving `@curaos/codegen-sdk` recipes. Owns Handlebars template processing, AST mutation, and emitter pipeline. Produces backend service scaffolds (`lib.nestjs-shared`, service trios) and frontend app scaffolds (`ui.react-next`, `ui.react-native`, `ui.astro`, `ui.lit-widget`).
