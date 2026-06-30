> **SUPERSEDED by ADR-0122 (Temporal + Activepieces + @nestjs/schedule; flow defs = Flow IR JSON).** CFDL was the pre-pivot design language (RFC-0002, superseded) and is not the live workflow format. Retained for schema archaeology.

# CuraFlow Definition Language (CFDL)

CFDL is the JSON-first workflow definition format from the pre-pivot design. It is intentionally Git-friendly, schema verifiable, and extensible without inheriting BPMN XML complexity.

## Layout
- `v1/schema.json` — Source-of-truth JSON Schema for CFDL documents.
- Sample definitions live under `docs/workflows/` to exercise schema coverage and serve as fixtures.
- Additional versions (`v2`, etc.) will live alongside v1; schema URLs remain stable.

## Authoring Guidelines
- Keep definitions within `docs/workflows/` or service-specific folders so they can be validated in CI.
- Reference the schema via `$schema` in each definition: `"$schema": "https://schemas.curaos.dev/cfdl/v1.json"`.
- Store task templates inside the `forms` array or reference external packages using URLs/URNs.

## Validation (historical)
The original validator was invoked via `make cfdl-validate` (no Makefile/justfile exists in `curaos`; Bun is the mandated runner per [[curaos-bun-primary-rule]]). If a validator is needed for archaeological purposes, run `bun run validate:cfdl` (add a Bun script targeting the schema dir) or use `ajv-cli` directly: `bunx ajv validate -s v1/schema.json -d <definition.json>`.
