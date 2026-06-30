# TSConfig Package Context

This package mirrors `curaos/backend/packages/tsconfig/` and documents shared TypeScript compiler presets.

## Relationships

- Governed by workspace [AGENTS.md](../../../../../AGENTS.md).
- Parent package contract: [backend packages](../AGENTS.md).
- Specified by [Requirements.md](Requirements.md).
- Indexed in the workspace document graph: [DOC-GRAPH](../../../docs/DOC-GRAPH.md).

## Integration Map

Producers:
- `@curaos/tsconfig` publishes reusable JSON compiler presets.

Consumers:
- Backend services and packages extend these presets from their local `tsconfig.json` files.
- Frontend apps may consume app-specific presets when their build tool requires TypeScript configuration.

Files that must not break:
- `curaos/backend/packages/tsconfig/base.json`
- `curaos/backend/packages/tsconfig/nestjs.json`
- `curaos/backend/packages/tsconfig/react.json`
- `curaos/backend/packages/tsconfig/astro.json`
- `curaos/backend/packages/tsconfig/expo.json`
- `curaos/backend/packages/tsconfig/package.json`

Data flow:
- Preset JSON files define compiler defaults.
- Package manifests expose the preset files.
- Downstream packages extend the presets and add only local path/include settings.

## Current Decisions

- Bun remains the primary package manager per [[curaos-bun-primary-rule]].
- TypeScript config is shared as a package to prevent duplicated compiler settings across services and apps.
