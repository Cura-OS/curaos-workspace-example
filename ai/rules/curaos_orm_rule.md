---
name: curaos-orm-rule
title: ORM (Drizzle / MikroORM / Kysely 3-tier)
description: 3-tier ORM strategy - Drizzle (default), MikroORM (clinical aggregate roots), Kysely (analytics + escape hatch); Prisma is off-default but not banned
paths:
  - "curaos/backend/**/schema.ts"
  - "curaos/backend/**/migrations/**"
  - "curaos/backend/**/drizzle.config.*"
  - "curaos/backend/**/mikro-orm.config.*"
  - "curaos/backend/**/*.entity.ts"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-1 walkthrough of research digest):

## The rule

CuraOS uses a **3-tier ORM strategy**:

| Tier | Tool | Use for |
|---|---|---|
| Default | **Drizzle** | 95% of services - CRUD, REST/tRPC/GraphQL endpoints, simple domain, all neutral services |
| Domain | **MikroORM** | HealthStack clinical services w/ aggregate roots (Patient → Encounter → Order → Notes → CarePlans → Problems → Meds → Lab → Imaging - explicit allowlist) |
| Analytics / escape hatch | **Kysely** | reports-service, search-service, observability-service, any hot-path query that ORM gets in the way of |

**Prisma is OFF-DEFAULT but not banned.** A new service may opt into Prisma if author documents in the service `Requirements.md` why Drizzle blocks them AND accepts binary-management plumbing per "Prisma costs" section below. Treat as last-resort, not a default option agents reach for.

**TypeORM is BANNED for new services** (unmaintained-ish, no edge, decorator-heavy w/ SWC circular-import bugs, agents have stale training data).

## How to apply

- New service scaffolds: Drizzle (unless on MikroORM allowlist)
- Codegen recipes (per ADR-0123): Drizzle template = default; MikroORM template gated to HealthStack-clinical recipes; Kysely template = analytics service recipe
- Existing services on Prisma: no forced migration; keep Prisma until refactor naturally surfaces
- Existing services on TypeORM (none today): if any surface, migrate to Drizzle when touched
- AI-doc per service (`ai/curaos/backend/services/<svc>/AGENTS.md` frontmatter): declare `data: drizzle|mikroorm|kysely|prisma` so agents reading the contract pick the right tool

<!-- fold: rationale, non-binding -->

## Per-tool guidance

### Drizzle (default)

- Schema lives in `src/schema.ts` per service; types inferred from schema with zero codegen step
- Migrations: plain SQL files under `migrations/`; `bunx drizzle-kit generate` produces them; review in PR
- Query API mirrors SQL - agents reading code see what hits the DB
- Edge-safe, air-gap-safe, no binary dep, pure JS
- MCP server available for agent introspection
- Docs: https://orm.drizzle.team/

### MikroORM (clinical aggregates only)

- Use ONLY for services on the explicit allowlist above (~19 HealthStack services per ADR-0208)
- Unit of Work + Identity Map pattern minimizes DB round-trips when whole aggregate loads + mutates together
- Decorator-based entities: `@Entity()`, `@ManyToOne()`, `@OneToMany(() => Encounter, e => e.patient)`
- SWC circular-import gotcha: use `Relation<>` wrapper types (per docs.nestjs.com note + research 02 §2)
- `@mikro-orm/nestjs` module provides first-class NestJS DI
- Always call `em.flush()` explicitly at request boundary (don't rely on global hooks)
- Docs: https://mikro-orm.io/docs/installation

### Kysely (analytics + escape hatch)

- No migrations runner - pair w/ Drizzle migrations or raw SQL files
- Pure query builder; types from schema definition (no codegen)
- Use when ORM relations get in the way (complex reporting joins, window functions, full-text search ranking)
- Agents see SQL almost-verbatim → easier to debug
- Docs: https://kysely.dev/

## Prisma costs (if a service opts in)

Document these in the service `Requirements.md` "Open Questions" section:

1. **Binary deployment**: ~50MB Rust binary per platform/arch; rebuild Docker image on every Prisma version bump per arch (amd64 + arm64 + musl/glibc)
2. **Air-gap install**: `postinstall` hook fetches binary from `binaries.prisma.sh` by default → fails in air-gap; must set `PRISMA_QUERY_ENGINE_BINARY` env var pointing at pre-cached binary AND mirror Prisma's binary CDN
3. **Cloud path blocked**: Prisma Accelerate + Driver Adapters (Neon/PlanetScale/D1) violate AGENTS.md §3 charter "no managed-cloud lock-in" - not options
4. **CI overhead**: `prisma generate` codegen step needs Node in CI even when runtime is Bun (per ai/rules/curaos_bun_primary_rule.md)
5. **Standalone-mode boot**: per ai/rules/curaos_modulith_standalone_rule.md a fresh clone + `bun install` must boot; Prisma adds extra setup before that works

If those costs are acceptable for the service's specific use case → Prisma allowed. Otherwise use Drizzle.

## Agentic-tool friendliness

Why Drizzle wins for AI-agent workflows specifically:
- Zero codegen step → no "did you re-run prisma generate?" pitfall agents fall into
- TS schema file IS the source of truth - agents read one file, know everything
- Queries mirror SQL → agent training data covers SQL universally; agents debug faster
- Plain SQL migration files → reviewable in PR diff (Prisma migrations are JSON)
- MCP server available for live agent introspection
- Smaller "magic surface" than Prisma → fewer hallucinated APIs

## Update needed in ADR-0099 + ADR-0100 + ADR (ORM strategy)

Per digest §6:
- ADR-0099 (charter) - add "Data layer strategy" section pointing here
- ADR-0100 (foundation runtime, OPEN) - note ORM picks alongside NestJS pick
- ADR (NEW, full ORM strategy) - number TBD (0130 unverified in RESOLUTION-MAP; use next free number ≥0212): full options matrix + tradeoffs; this rule = short form
