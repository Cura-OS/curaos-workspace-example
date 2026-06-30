> **CFDL is a superseded design language (ADR-0122); these samples are historical fixtures.** See `docs/specs/cfdl/README.md` for details. Do not use as a template for new workflow definitions — use Flow IR (ADR-0122) instead.

# Sample CFDL Definitions

This directory hosts curated workflow definitions that exercise the CFDL schema and provide guidance for service and UI teams. Keep samples domain-neutral unless they illustrate overlay-specific behavior.

- `identity-admin-enrollment.json` — baseline identity workflow that walks through new admin provisioning, MFA enrollment, and audit emission hooks.

Add new samples whenever we introduce additional workflow features or want reproducible fixtures for tests, demos, or documentation. For archaeological validation, use `bunx ajv validate -s ../specs/cfdl/v1/schema.json -d <definition.json>` (no Makefile/justfile in `curaos`; `make cfdl-validate` is not runnable).
