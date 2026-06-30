# CONTEXT — personal-tracking-service

**ADR-0206 aligned.** Last updated: 2026-05-24

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

- PostGIS `POINT` column for location; BRIN index on `recorded_at` (append-only time-series — efficient for bulk range scans).
- Geofence polygon evaluation delegated to `geospatial-core-service` — no local geofence engine.
- Health platform OAuth (HealthKit, Google Health Connect) managed by `integrations-service` — tokens in OpenBao, not in this service.
- All tracking data rows tagged `user_id`; Cerbos enforces user-owns-own-data (no cross-user read possible at query level).
- Retention purge cron runs nightly; deletes rows older than user's configured retention (default 90d).

---

## HealthStack Integration (ADR-0115)

- `healthstack-patient-service` subscribes to `tracking.location.pinged` for home-care proximity alerts.
- OpenFGA consent-relationship grant (ADR-0120) required before patient location is visible to any clinician.

---

## Files That Must Not Break

- Kafka topics (produced): `tracking.location.pinged`, `tracking.geofence.entered`, `tracking.geofence.exited`, `tracking.activity.daily-summary`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up
```
