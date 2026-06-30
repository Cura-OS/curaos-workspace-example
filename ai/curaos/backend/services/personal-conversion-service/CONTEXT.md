# CONTEXT — personal-conversion-service

**ADR-0206 aligned.** Last updated: 2026-05-24

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17

---

## Key Design Decisions

- No sidecar calls here. All format conversion delegated to `conversion-core-service` via tRPC.
- Per-user MinIO prefix: `personal-conversion/{user_id}/{job_id}/output.*`. Auto-delete TTL managed by MinIO object lifecycle rule (not cron).
- Rate limiting for unauthenticated: APISIX rate-limit plugin per source IP. Authenticated: per-user key.
- Ghostscript (AGPL v3 sidecar) is isolated in `conversion-core-service` — licence does not propagate here.

---

## Files That Must Not Break

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
