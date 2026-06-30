# CONTEXT.md — notify-service

## Purpose

Multi-channel notification delivery behind one internal API (ADR-0201 §3.1).
Neutral platform-shared service (ADR-0201 §1). v0 channels: email (Haraka
provider abstraction), in-app (SSE), webhook. SMS/push DEFERRED (ADR-0201
§3.1.2). Scaffolded from the `@curaos/codegen` `--plain-service` mold (M10).

## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (schema `notify_core`, schema-per-tenant) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 (`.strict()` write schemas) per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL 17 (CNPG) per `ai/rules/curaos_postgres_rule.md`
- Events: Kafka 4 + NATS JetStream, outbox pattern per ADR-0201 §2.3
- Email transport: nodemailer SMTP → Postfix/Haraka MTA (provider abstraction)

- Neutral capability: NO PHI/PII rows. References + non-clinical labels only.

## Data model (`notify_core` schema, ADR-0201 §3.1.1)

| Table | Purpose |
|---|---|
| `notification_templates` | channel + locale + Handlebars body; versioned |
| `notification_queue` | outbox rows: channel, recipient, template_ref, payload, status, attempt_count; idempotent on `(tenant_id, idempotency_key)` |
| `notification_log` | immutable per-delivery log + provider response |
| `notification_preferences` | per-user per-channel opt-out + quiet-hours |
| `webhook_subscriptions` | tenant webhook endpoints + HMAC secret + retry policy; delivery guarantee + tier overlay published in [webhook-delivery-contract.md](webhook-delivery-contract.md) (ADR-0120 Q2) |
| `audit_outbox` / `audit_chain_heads` / `idempotency_keys` | codegen baseline (durable audit + replay cache) |

## Integration Points

- Consumes `curaos.notify.requested.v1` from any upstream service (party, task,
  order, clinical, workflow, reports).
- Consumes `curaos.notify.preference.updated.v1` from user-service.
- Emits `curaos.notify.delivered.v1` → audit, analytics.
- Emits `curaos.notify.failed.v1` → ops alerts, DLQ.
- Reads default locale + channel-enabled flags from settings-service.
- REST (ADR-0201 §3.1.4): `POST /notifications`, `POST /notifications/batch`,
  `GET /notifications/:id`, `GET /notifications/stream` (SSE), `POST
  /webhooks/subscriptions`. All routes JWT-guarded; tenant/actor JWT-derived.

## Provider abstraction (ADR-0201 §2.6)

`EmailProvider` interface, two impls bound by `PROVIDER_EMAIL=local|external`:
`CuraOSLocalEmailProvider` (Haraka/nodemailer, default) + `ExternalEmailProvider`
(SendGrid/Postmark/Mailgun BYO). In-app SSE is first-party only (not delegated).

## Decisions / Open Questions

- OQ-02 (in-app SSE multi-instance fan-out: Valkey Pub/Sub vs NATS subject-per-user)
  is DEFERRED to the composition layer. v0 ships an in-process `NotifyStreamService`
  registry as the single-instance answer + the seam a backplane plugs into.
- OQ-01 (Expo web-push / VAPID) is part of the deferred push channel; not in v0.

## References

- [webhook-delivery-contract.md](webhook-delivery-contract.md) — canonical webhook delivery-guarantee contract (ADR-0120 Q2 resolution)
- `ai/curaos/docs/adr/0201-cluster-platform-shared-services.md` §3.1 — canonical decisions
- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/backend/services/notify-service/Requirements.md` — full spec
