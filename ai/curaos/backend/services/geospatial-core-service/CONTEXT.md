# CONTEXT — geospatial-core-service

**ADR-0206 aligned.** Last updated: 2026-06-03

---

## Implementation State (#346 — M11 W3, PostGIS domain)

The scaffold-merged service now carries the spatial domain (PR
`geospatial-core-service#1`):

- **Schema + migration** (`drizzle/schema.ts`, `drizzle/migrations/0002_geospatial_domain.sql`):
  `CREATE EXTENSION postgis`; `locations geography(Point,4326)`,
  `geofences geometry(Polygon,4326)`, `routes geometry(LineString,4326)` — all
  GIST-indexed; + the durable `domain_outbox`. Forward-only, additive.
- **Spatial queries** — raw PostGIS `ST_*` (per [[curaos-orm-rule]]):
  `nearestLocations` (`ST_Distance` geography + `<->` KNN), `geofencesContaining`
  (`ST_Contains`), route `ST_Length(geography)`. `SpatialStore` port:
  `InMemorySpatialStore` (turf — units) / `PostgresSpatialStore` (prod).
- **Root event catalog** (`src/events/geospatial-domain-events.ts` +
  `specs/geospatial.asyncapi.yaml`): 11 concrete `curaos.core.geospatial.*.v1`
  channels — location/geofence/route lifecycle + geofence `entered`/`exited`.
  Consumed by **fleet #347 + site #353** (stable contract; AsyncAPI parses with
  0 error diagnostics). The generic scaffold `geospatial-event-producer.ts` was
  superseded by this concrete catalog and removed.
- **Durable domain-outbox** (`src/db/domain-outbox.{service,relay,module}.ts`,
  reused from the commerce-core mold): `GeoDomainService` enqueues each
  mutation's event in the SAME tx (durable-before-ack) → post-commit relay →
  Redpanda. Bound via `DomainOutboxModule.register()`.
- **Tiles** (`src/tiles/tile-proxy.service.ts`): PMTiles HTTP-range proxy, no
  tile-server process; z/x/y bounds-checked. `RangeFetcher` port (object storage)
  + `TileArchiveReader` test seam.
- **REST** (`geospatials.controller.ts` + `specs/geospatial.tsp`): POST
  `locations`/`geofences`/`routes`, `locations/nearest`, `geofences/evaluate`,
  GET `tiles/{z}/{x}/{y}`. Actor + tenant JWT-derived (never body-supplied).
- **Tests**: 62 unit + 5 live PostGIS integration (`postgis:17-3.5`,
  skip-if-no-`GEOSPATIAL_CORE_DATABASE_URL`).

Named libs (exact pins): `@turf/turf 7.3.5`, `axios 1.17.0`, `kysely 0.27.6`,
`pmtiles 3.2.1`, `wkx 0.5.0`.

**Generator-evolution finding:** the commerce-core `domain_outbox` mold template
inserts `gen_random_uuid()::text` into a `uuid` id column — raises "column id is
of type uuid but expression is of type text" on a real-PG insert (masked in
commerce because its domain-outbox test uses the in-memory store). Fixed here
(`COALESCE(...)::uuid`); flagged for `tools/codegen` fold-back.

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** Biome (format + lint) per [[curaos-repo-conventions-rule]]
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + Postgres/PostGIS + Valkey + sidecars

---

## Key Design Decisions

- PostGIS 3.5 on PG17 — spatial queries via raw SQL (use `db.execute(sql\`...\`)` with Drizzle; PostGIS geometry types require raw SQL regardless of ORM). Drizzle is the rule-default ORM per [[curaos-orm-rule]]; non-spatial models use Drizzle schema + migrations.
- Nominatim geocoding cached in Valkey (TTL 7d) before hitting sidecar.
- GraphHopper primary routing; OSRM batch distance matrix only.
- PMTiles served via HTTP range-request proxy — no tile server process needed.
- All sidecar calls guarded by health probe; queues pause on `sidecar.unhealthy`.
- `GeospatialCoreModule` is the only public export; internal domain services are not exported.

---

## Spatial Index Strategy

- `GIST` index on `geometry` columns (polygon, point) for containment and nearest queries.
- `BRIN` index on `recorded_at` for append-only tracking time-series (low write overhead, acceptable for bulk range scans).
- Partition tracking tables by tenant + monthly time range.

---

## Sidecar Lifecycle Contract

1. Health probe: `/health` HTTP on sidecar before dispatching request.
2. SIGTERM: finish in-flight request → exit. NestJS queues pause on unhealthy.
3. Shared `emptyDir` volume between sidecar and main pod for large file transfer (avoids gRPC payload limits).
4. Restart policy: `OnFailure` with exponential backoff; alert on > 3 restarts/hour.

---

## OSM Data Lifecycle (nightly cron)

```
go-pmtiles extract (regional planet)
  → Nominatim reimport (warm standby swap)
  → GraphHopper graph rebuild (blue/green pod swap)
  → OSRM preprocessing (replace pod)
  → PMTiles archive → upload MinIO → CDN invalidation
```

Staleness alert fires if `geospatial.osm-data.updated` not emitted within 48h.

---

## HealthStack Integration (ADR-0115)

- `healthstack-clinical-scheduling` calls `route` tRPC procedure for provider→patient home routing.
- No PHI in geospatial-core-service tables. Patient home coordinates live in `personal-site-service`.

---

## Files That Must Not Break

- `GeospatialCoreModule` export surface (imported by fleet, tracking, site, HealthStack scheduling)
- tRPC router procedure names: `geocode`, `reverseGeocode`, `route`, `distanceMatrix`, `nearestFacilities`, `pointInSite`, `tileProxy`
- Kafka topic names: `geospatial.geocode.cache-miss`, `geospatial.osm-data.updated`, `geospatial.osm-data.stale`, `geospatial.routing.failed`

---

## Performance Targets (P95)

| Operation | Target |
|---|---|
| Geocode (Valkey hit) | < 20ms |
| Geocode (Nominatim) | < 500ms |
| Route (car, < 200km) | < 300ms |
| Distance matrix (100×100) | < 2s |
| Point-in-polygon (GIST) | < 50ms |

---

## Commands

```bash
bun install
bun build
bun test          # vitest
bun test:e2e      # supertest integration
docker compose up  # boots service + PG/PostGIS + Valkey + sidecars
```
