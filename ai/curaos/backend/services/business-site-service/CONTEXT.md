# CONTEXT — business-site-service

**ADR-0206 aligned.** Last updated: 2026-05-24

> ADR-0206 redefines this as B2B multi-location physical-site management (NOT website builder).

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17 + Valkey

---

## Key Design Decisions

- Site records are authoritative in `site-core-service` — business-site-service holds only chain metadata FK.
- Map UI uses MapLibre GL JS + PMTiles from `geospatial-core-service` (no separate tile server).
- Footfall analytics from `personal-tracking-service` aggregates — anonymized, consent-gated. Never raw location data.
- Staff/inventory: FK references only; no cross-service data duplication.

---

## Files That Must Not Break

- Kafka topics (produced): `business.site.location-added`, `business.site.chain-updated`, `business.site.location-closed`
- Kafka topics (consumed): `site.created`, `site.closed`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up
```
