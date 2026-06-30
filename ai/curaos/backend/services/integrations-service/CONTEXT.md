# CONTEXT — integrations-service

**ADR-0206 aligned.** Last updated: 2026-05-24

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17 + Valkey + OpenBao dev server

---

## Key Design Decisions

- Activepieces CE `@activepieces/pieces-framework` is the connector SDK. Do not reimplement connector logic from scratch; wrap pieces in NestJS plugin per ADR-0123.
- OpenBao v2.x required (not HashiCorp Vault); API-compatible at HTTP level. `node-vault` client works unchanged.
- Namespaces (GA v2.3.1) provide per-tenant secret isolation without Enterprise license.
- Plugin sandbox uses Node.js `worker_threads` — not separate process, not WASM (see ADR-0206 §8.4 open question; revisit if security audit raises concerns).
- Rate limiting uses Valkey token bucket per `(tenant_id, connector_id)` key. Do not use NestJS ThrottlerModule for this — it is not per-connector-aware.
- Inbound webhooks: APISIX terminates TLS and forwards to `POST /webhooks/{tenant}/{connector}`. integrations-service validates HMAC before emitting Kafka event.
- All outbound HTTP calls route via egress proxy sidecar for audit trail.

---

## OpenBao Namespace Convention

```
<org_tenant_id>/          ← OpenBao namespace root
  kv/                     ← KV v2 mount
    connectors/<connector_id>/token   ← OAuth tokens
    connectors/<connector_id>/apikey  ← API keys
    connectors/<connector_id>/webhook-secret
  dynamic/                ← dynamic secrets mount (DB, AWS, etc.)
```

---

## Connector Plugin Contract (ADR-0123)

A connector plugin is an OCI artifact containing:
- `piece.ts` — Activepieces piece definition (triggers + actions)
- `credential-schema.ts` — OpenBao KV schema + validation
- `manifest.json` — allowed network domains, resource limits, version

Plugin loaded via `worker_threads`; main thread communicates via `MessagePort`.

---

## Files That Must Not Break

- tRPC procedure names: `listConnectors`, `configureConnection`, `testConnection`, `getCredential`, `registerWebhook`
- REST route: `POST /webhooks/{tenant}/{connector}`
- Kafka topics: `integrations.connection.configured`, `integrations.connection.healthy`, `integrations.connection.failed`, `integrations.webhook.received`, `integrations.credential.rotated`
- OpenBao namespace mount paths (breaking changes require migration)

---

## HealthStack / Overlay Integration

- integrations-service is a leaf — overlays call it for external connectivity. No HealthStack-specific logic lives here.
- `healthstack-interop-service` uses integrations-service OAuth connector to reach external EHR systems.

---

## Performance Targets (P95)

| Operation | Target |
|---|---|
| Webhook ingest → Kafka publish | < 100ms |
| Credential read (OpenBao + Valkey cache) | < 30ms |
| Connection health ping | < 500ms (external-dependent) |

---

## Commands

```bash
bun install
bun build
bun test          # vitest
bun test:e2e      # supertest integration
docker compose up  # boots service + PG17 + Valkey + OpenBao dev
```

---

## Local OpenBao Dev Setup

```bash
# start OpenBao in dev mode (no persistence, for local only)
docker run --rm -p 8200:8200 -e OPENBAO_DEV_ROOT_TOKEN_ID=devroot openbao/openbao:2.x server -dev
# OPENBAO_ADDR=http://localhost:8200 OPENBAO_TOKEN=devroot
```
