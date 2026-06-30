# CONTEXT.md — integrations-core-service

## Purpose

Neutral iPaaS connector hub + webhook delivery engine. Owned, reused by personal + business overlays + any future vertical. Domain overlay: `neutral`. No PHI/PII/financial rows persisted here — overlays own protected schemas. Connector credentials live in OpenBao (`node-vault`), NEVER in Postgres.

## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (connection config, no secrets in PG) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG), schema-per-tenant (`integrations_core`) per `ai/rules/curaos_postgres_rule.md`
- Named libs (composition layer): `@activepieces/pieces-framework` (connector catalogue), `openid-client` (OAuth2/OIDC/PKCE), `node-vault` (OpenBao per-tenant credential vault), `bullmq`+`ioredis` (queue + rate-limit), `worker_threads` (plugin sandbox). The core package keeps these driver-free (modulith rule) — abstractions only.

## Domain model (Drizzle, `integrations_core` schema)

- `connections` — a tenant's bound connector instance. Stores CONFIG ONLY; `credential_ref` is an opaque OpenBao path. Unique `(tenant_id, connector_key)`.
- `webhook_subscriptions` — an outbound webhook target. `target_url` SSRF-validated; `secret_ref` is the OpenBao path to the per-subscription HMAC secret (never the secret); `tier` (critical/standard/best_effort) selects the retry overlay.
- `webhook_deliveries` — the durable at-least-once outbound-delivery OUTBOX. Mirrors `audit_outbox`: `claim_id` + `locked_until` lease fence (#156/#315), `webhook_id` UNIQUE-per-tenant idempotency key, PARTIAL pending index.
- `webhook_dead_letters` — parked DLQ rows (park-for-replay; best-effort = drop-with-metric, not retained).

## Webhook delivery guarantee (resolves ADR-0122 M11 Q2; implements #328/#332 contract)

- DEFAULT at-least-once + `webhook-id` idempotency key + HMAC-SHA256 signed (`webhook-signature: v1,<base64>` over `{id}.{ts}.{body}`) + ±5-min replay window.
- Tier overlay (NOT a correctness change): critical=12 attempts/park+alert, standard=8/park, best_effort=4/drop-with-metric. Exponential backoff with full jitter.
- Ack semantics: 2xx ack; 4xx permanent → DLQ (no retry); 5xx/429/timeout transient → retry until exhausted → DLQ.
- Inbound: HMAC-verified → `integrations.webhook.received` (forged/stale rejected, never emitted).
- SSRF (BINDING): outbound targets validated at subscription time + re-checked on resolved address at delivery time (DNS-rebinding); private/loopback/link-local/CGNAT/metadata (169.254.169.254) blocked; `redirect: manual`.

## Integration Points

- Consumed by `personal-integrations-service` and `business-integrations-service` (deferred, GA wave 2 #325).
- Events PRODUCED (root producer — AsyncAPI `specs/integrations.asyncapi.yaml`):
  - `curaos.core.integrations.{created,updated,deleted}.v1` (domain CRUD envelope, snake_case)
  - `curaos.core.integrations.webhook.received.v1`
  - `curaos.core.integrations.webhook.dead-lettered.v1`
  - `curaos.core.integrations.connection.failed.v1`
- REST (TypeSpec `specs/integrations.tsp` → OpenAPI 3.1): `/api/v1/integrations` (gateway), tenant-scoped via `TenantInterceptor` + JWT-derived actor.
- Observability: driver-free OTel span seam (`src/observability/otel.ts`), default-on; host binds a real tracer at composition.

## Decisions

- Delivery guarantee per #328/#332 contract (Standard Webhooks wire format) — semver bump on existing channel, no `-v2` path ([[curaos-rolling-update-rule]]).
- DB-side `now()` is the single clock source for the relay claim due-check + lease expiry (avoids client/server skew stalling a freshly-enqueued row). Generator-evolution finding (see PR).
- Storage: schema-per-tenant (`integrations_core`), Citus shard key = `tenant_id`.

## References

- `ai/curaos/backend/services/notify-service/webhook-delivery-contract.md` — the binding delivery contract
- `ai/curaos/docs/research/m11-fleet-geospatial-site-conversion-integrations-backend-choices.md` §10
- `ai/rules/curaos_postgres_rule.md`, `curaos_rolling_update_rule.md`, `curaos_generator_evolution_rule.md`, `curaos_modulith_standalone_rule.md`
- `ai/curaos/backend/services/integrations-core-service/Requirements.md`
