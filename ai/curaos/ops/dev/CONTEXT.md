# Ops Dev Context

This path mirrors `curaos/ops/dev/` and documents local development operations.

## Relationships

- Governed by workspace [AGENTS.md](../../../../AGENTS.md).
- Parent ops contract: [ops](../AGENTS.md).
- Specified by [Requirements.md](Requirements.md).
- Indexed in the workspace document graph: [DOC-GRAPH](../../docs/DOC-GRAPH.md).

## Integration Map

Producers:
- Local-development scripts and manifests under `curaos/ops/dev/`.

Consumers:
- Developers and CLI agents preparing local CuraOS environments.
- Service and app test workflows that need local dependencies.

Files that must not break:
- `curaos/ops/README.md`
- Future files under `curaos/ops/dev/`
- Parent ops docs under `ai/curaos/ops/`

Data flow:
- Local dev manifests provision dependencies for services and apps.
- Service/app commands consume those dependencies through their own manifests and runner scripts.
- Production deployment remains governed by parent ops rules.

## Current Decisions

- Local development must preserve self-hosted and air-gap viability from workspace charter.
- Dev ops docs stay under `ai/curaos/ops/dev/`; code and manifests stay under `curaos/ops/dev/`.
