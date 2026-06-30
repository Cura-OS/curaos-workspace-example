# CuraOS service skeleton (Copier template)

Cross-repo service skeleton synced across all backend/services submodules via Copier 3-way merge per [[curaos-speed-patterns-rule]] DA12.

## Use

```bash
# New service (one-time)
copier copy ai/templates/service-skeleton/ curaos/backend/services/<service-name>/

# Update existing service from latest template (3-way merge)
copier update --conflict rej curaos/backend/services/<service-name>/

# Bulk update across all services
for d in curaos/backend/services/*/; do
  copier update --conflict rej "$d"
done
```

Per-project answers stored in `.copier-answers.yml` inside each service.

## What this template gives

- `package.json` w/ pinned NestJS 11.1.23 + Bun runtime + `@curaos/*` workspace deps
- `tsconfig.json` extending `@curaos/tsconfig/nestjs.json`
- `src/main.ts` NestJS bootstrap w/ Fastify adapter
- `src/app.module.ts` w/ `TenantModule.forRoot()` (mandatory per [ADR-0155](../../curaos/docs/adr/0155-tenant-routing-curaos-tenancy.md))
- `README.md` minimal (per [[curaos-repo-boundary-rule]] — submodule code-only)
- `.gitignore`

## What you add manually (per [[curaos-agents-md-schema-rule]])

Agent docs under `ai/curaos/backend/services/<service-name>/`:
- `AGENTS.md` w/ frontmatter + sections via `AGENTS-sections/` if >150 lines
- `CONTEXT.md`
- `Requirements.md`

## Companion: Nx generator

Faster path for one-off scaffolds: `bun run gen:service <name>` from `curaos/` (wired in curaos/package.json → `bun tools/codegen/src/index.ts service`; covers package.json + tsconfig + src/ only; Copier covers full lifecycle + bulk update).
