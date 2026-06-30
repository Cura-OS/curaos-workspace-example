# CONTEXT — business-conversion-service

**ADR-0206 aligned.** Last updated: 2026-05-24

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17 + Temporal dev server

---

## Key Design Decisions

- No conversion engine here. All format work delegated to `conversion-core-service` via tRPC/BullMQ.
- Temporal workflows implement retry, timeout, and compensation logic for multi-step batch jobs.
- SSE for real-time progress (not WebSocket — stateless pods easier to scale).
- Output artifacts stored in SeaweedFS (from conversion-core presigned URLs; ADR-0101 canonical object store replacing MinIO) — not in this service's DB.

---

## Files That Must Not Break

- Kafka topics (produced): `business.conversion.batch.started`, `business.conversion.batch.completed`
- Kafka topics (consumed): `conversion.job.completed`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up
```
