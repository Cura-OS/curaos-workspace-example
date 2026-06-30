# CONTEXT — personal-site-service

**ADR-0206 aligned.** Last updated: 2026-05-24

> ADR-0206 redefines this as personal property records (home/work/place addresses). NOT personal website builder.

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

- Site records authoritative in `site-core-service` — this service holds FK + personal metadata only (label, notes, visit frequency, access instructions).
- Patient home coordinates stored here (personal tier, user-owned), not in `geospatial-core-service` shared tables — PHI boundary maintained.
- HealthStack access requires explicit OpenFGA consent-relationship grant (ADR-0120 ReBAC layer) + audit log entry.

---

## HealthStack Integration (ADR-0115)

- `healthstack-patient-service` subscribes to `personal.site.home-address-updated`.
- Clinician access to patient home site requires OpenFGA consent-relationship grant (ADR-0120).

---

## Files That Must Not Break

- Kafka topics (produced): `personal.site.home-address-updated`, `personal.site.added`, `personal.site.removed`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up
```
