# CONTEXT — site-core-service

**ADR-0206 aligned.** Last updated: 2026-05-24

> ADR-0206 redefines this service as the physical-location primitives service. Prior site-builder context is retired.

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17/PostGIS + Valkey

---

## Key Design Decisions

- PostGIS used for `point` (geocoordinate) and `polygon` (boundary) columns; Drizzle `sql` template tag for raw spatial ops (escape-hatch per [[curaos-orm-rule]]).
- Geocoding delegated to `geospatial-core-service` tRPC — no Nominatim calls directly.
- FHIR mapping delegated to `conversion-core-service` gRPC — no FHIR library imports in this service.
- Site hierarchy stored as adjacency list (`parent_id FK`); queried via PostgreSQL recursive CTE.
- Valkey caches geocode results keyed by address hash (TTL 7d, matches geo-core TTL).

---

## FHIR Location Mode Support

- `instance` — specific identifiable place (a particular clinic room).
- `kind` — class of location (any isolation room of type X).
- Both modes required from day one for HealthStack scheduling workflows.

---

## HealthStack Integration (ADR-0115)

- `healthstack-patient-service` calls `getSite` tRPC + subscribes to `site.created`.
- `healthstack-clinical-scheduling` calls `nearestSites` + `exportFHIRLocation`.
- PHI boundary: patient-home coordinates live in `personal-site-service`, not here.

---

## Implemented domain slice (#353, M11 W4)

The W4 NEUTRAL-CORE slice landed the addressable-location domain ON the codegen
mold (no hand-scaffold). What shipped:

- **Schema/migration:** `drizzle/schema.ts` `siteLocation` (`site_core.site_location`)
  + forward-only `drizzle/migrations/0003_site_domain.sql` (journaled idx 3). Columns:
  `type, name, status(active|inactive|closed), fhir_mode(instance|kind), part_of`
  (self-FK hierarchy), `address jsonb` (structured non-PHI facility address),
  `geocode jsonb` + `geocode_status` (the RESOLVED coordinate FROM geospatial-core —
  no coordinate math here), `custom_fields jsonb`, `closed_at`, `deleted_at`.
- **Domain seam:** `src/sites/site-store.ts` (`SiteStore` + `InMemorySiteStore` +
  `PostgresSiteStore`) — recursive-CTE `getHierarchy` walk (tenant-scoped at anchor
  AND recursive step), tx-threaded so the write + outbox enqueue commit on ONE
  boundary (durable-iff-write). DI token `SITE_STORE`.
- **Service:** `src/sites/sites.service.ts` — `createSite` (same-tenant `partOf`
  guard), `updateSite` (closed-guard), `closeSite` (idempotent terminal guard),
  `resolveGeocode` (stores the geospatial-core result), `getSiteHierarchy`,
  `exportFhirLocation`. Each mutation enqueues its domain event in-tx.
- **Events:** `src/events/site-domain-events.ts` — `SiteCreated/Updated/Closed/
  GeocodeResolved` → topics `curaos.core.site.{created,updated,closed,
  geocode.resolved}.v1`, snake_case wire envelope, sha256 partition key, routed
  through the scaffolded durable `DomainOutboxService`.
- **FHIR:** `src/sites/fhir-location.ts` — `exportFhirLocation` (instance|kind R4
  Location projection; `kind` omits concrete position/address).
- **DTOs:** `src/sites/site.dto.ts` Zod 4 strict schemas (Create/Update/Close/
  ResolveGeocode/SiteAddress). **Coordinates are NOT accepted on write** — they are
  the resolved result FROM geospatial-core (no reverse-couple).
- **REST:** `src/sites/sites.controller.ts` — `GET /sites`, `POST /sites`,
  `GET /sites/:id`, `GET /sites/:id/hierarchy`, `GET /sites/:id/fhir`,
  `PATCH /sites/:id`, `POST /sites/:id/close`, `POST /sites/:id/geocode`. Mirrored
  in `specs/site.tsp` + `specs/site.asyncapi.yaml`.

Deferred to GA wave 2 (#325): tRPC surface, PostGIS point/polygon spatial queries
(`nearestSites`/`sitesInBounds`/`siteContainsPoint`), Valkey geocode cache,
personal-/business-site overlays, conversion-core gRPC FHIR bridge wiring.

## Files That Must Not Break

- REST routes (mirror `specs/site.tsp`): `GET /sites`, `POST /sites`, `GET /sites/:id`,
  `GET /sites/:id/hierarchy`, `GET /sites/:id/fhir`, `PATCH /sites/:id`,
  `POST /sites/:id/close`, `POST /sites/:id/geocode`
- Future tRPC procedures (GA wave 2): `createSite`, `updateSite`, `getSite`, `listSites`, `getSiteHierarchy`, `exportFHIRLocation`, `nearestSites`, `sitesInBounds`, `siteContainsPoint`
- Kafka topics (produced): `site.created`, `site.updated`, `site.closed`, `site.geocode.resolved`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up
```
