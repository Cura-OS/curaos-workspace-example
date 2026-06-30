# CONTEXT - tools/generators (workspace scaffold CLI)

AI-mirror node for `curaos/tools/generators/` (per workspace AGENTS.md
section 1 1:1 structural mirror). Code lives in the curaos repo:

- Package: `@curaos/generators` with the `curaos-gen` bin
  (`curaos/tools/generators/bin/curaos-gen.ts`), a @clack/prompts CLI exposing
  `gen:service` / `gen:package` / `gen:app` scaffolds per
  [[curaos-speed-patterns-rule]] DA12 + [[curaos-agents-md-schema-rule]].

## Status

Superseded for service/trio generation by the canonical codegen engine at
`curaos/tools/codegen/` (see [codegen CONTEXT](../codegen/CONTEXT.md), which
records this package as the prior generator). Kept for simple non-trio
scaffolds; new generator behavior lands in `tools/codegen/` per
[[curaos-generator-evolution-rule]].
