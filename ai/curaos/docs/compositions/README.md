> **CBCF is a superseded format (ADR-0121); these samples are historical fixtures.** See `docs/specs/cbcf/README.md` for details. Do not use as a template for new builder compositions — current builder stack = GrapesJS + Payload CMS + @xyflow/react (ADR-0121).

# Sample CBCF Compositions

Reference builder compositions that demonstrate how workflow-driven experiences render through CuraBuilder surfaces in the pre-pivot design. These samples align with the workflow definitions under `../workflows/` and double as fixtures for validation tooling.

- `identity-hosted-login.json` — hosted login flow tying identity enrollment tasks to shared builder components.

For archaeological validation, use `bunx ajv validate -s ../specs/cbcf/v1/schema.json -d <composition.json>` directly (`make builder-validate` is not runnable — no Makefile/justfile in `curaos`; Bun is the mandated runner per [[curaos-bun-primary-rule]]).
