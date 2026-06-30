> **SUPERSEDED by ADR-0121 family (GrapesJS + Payload CMS + @xyflow/react builder stack).** CBCF was the pre-pivot Flutter composition format (RFC-0003, superseded); retained for schema archaeology.

# Cura Builder Composition Format (CBCF)

CBCF describes forms, pages, navigation, and bindings from the pre-pivot builder design. The format is JSON-first (with optional YAML authoring) and references shared component registry entries and workflow tasks.

## Layout
- `v1/schema.json` — Source-of-truth JSON Schema for CBCF documents validated by `make builder-validate`.
- Sample compositions live under `docs/compositions/` to demonstrate schema coverage and builder usage patterns.
- Additional versions (v2, etc.) will live alongside v1; schema URLs remain stable.

## Work in progress
- Draft specifications should reside here so teams can iterate before wider rollout.

## Relationship to other specs
- **CFDL:** Workflow definitions reference CBCF forms/pages for human tasks. CBCF files can embed references back to CFDL to ensure consistency.
- **Component Registry:** CBCF components aligned with registry metadata managed by site-core-service and implemented in the pre-pivot `ui_kit` Flutter package (no longer current; current builder stack = GrapesJS + Payload per ADR-0121).

## Validation (historical)
The original validator was invoked via `make builder-validate` (no Makefile/justfile exists in `curaos`; Bun is the mandated runner per [[curaos-bun-primary-rule]]). For archaeological validation, use `bunx ajv validate -s v1/schema.json -d <composition.json>` directly.
