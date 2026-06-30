---
name: notify-service
description: "Neutral multi-channel notification delivery (email/in-app/webhook) - ADR-0201 §3.1 plain shared service."
tags: [service, neutral, platform-shared]
language: TypeScript
framework: NestJS 11
infrastructure: PostgreSQL 17 (CNPG, schema-per-tenant), Kafka/NATS, Haraka MTA, Bun 1.3.14
tooling: Bun, Drizzle, Zod 4, Turborepo
apis: []
events:
  produces: [curaos.notify.delivered.v1, curaos.notify.failed.v1]
  consumes: [curaos.notify.preference.updated.v1, curaos.notify.requested.v1]
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  adr: ai/curaos/docs/adr/0201-cluster-platform-shared-services.md
  context: ai/curaos/backend/services/notify-service/CONTEXT.md
  requirements: ai/curaos/backend/services/notify-service/Requirements.md
---

# notify-service - Agent Contract

> Neutral platform-shared service (ADR-0201 §1, M10 Epic #24). PLAIN single-root
> (`@curaos/notify-service`, no core/personal/business trio). Multi-channel
> notification delivery behind one internal API: email (Haraka provider
> abstraction), in-app (SSE), webhooks. SMS/push DEFERRED for v0 (ADR-0201 §3.1.2).

## Mission

Abstract all outbound notification channels behind a single internal API.
Upstream services emit `curaos.notify.requested.v1` or call the REST fast-path;
notify-service handles routing, templating, dedup, delivery, and retry, then
emits `curaos.notify.delivered.v1` / `.failed.v1`.

- Neutral capability: NO PHI/PII rows persisted here. Email/push bodies carry
  deep-links + non-clinical labels only; PHI summaries live behind click-through
  auth in the app (ADR-0201 §3.1.6).

## Toolchain Registry

- Install: `bun install` (workspace `bun install --frozen-lockfile` is the gate)
- Test: `bun test`
- Lint: `bun run lint` (oxlint)
- Typecheck: `bun run typecheck`
- CI closure: `bun run ci` exits 0 (lint + typecheck + test + build)

## Judgment Boundaries

- NEVER push to `main` without PR review
- NEVER edit migration files post-merge (forward-only per [[curaos-rolling-update-rule]])
- NEVER persist PHI/PII in this neutral layer; NO PHI in email/webhook payloads
- NEVER trust a body-supplied `tenantId`/`actorId` - derive from the JWT principal
- ASK before adding new dependencies
- ASK before destructive ops (`rm -rf`, `git reset --hard`, `DROP TABLE`, force push)
- ALWAYS run `bun run ci` before reporting done
- ALWAYS write a failing test before fixing a bug

## Channels (v0)

| Channel | Local default | 3rd-party BYO | Status |
|---|---|---|---|
| Email | Postfix + Haraka relay (nodemailer SMTP) | SendGrid / Postmark / Mailgun | live |
| In-app | SSE on `/notifications/stream` | - (first-party only) | live |
| Webhook | Self-hosted signed retry queue (HMAC-SHA256) - at-least-once per [webhook-delivery-contract.md](webhook-delivery-contract.md) | - (tenant registers endpoint) | live |
| SMS | None (HIPAA gate) | Twilio / Vonage (BAA) | DEFERRED |
| Push | Expo OSS (OQ-01 spike) | OneSignal / FCM | DEFERRED |

## Context Map

```yaml
monorepo: bun workspaces + turborepo
layer: plain-service (neutral)
schema: notify_core (schema-per-tenant)
events:
  inbound: [curaos.notify.requested.v1, curaos.notify.preference.updated.v1]
  outbound: [curaos.notify.delivered.v1, curaos.notify.failed.v1, curaos.webhook.delivered.v1]
provider_abstraction:
  email: EMAIL_PROVIDER (CuraOSLocalEmailProvider | ExternalEmailProvider), PROVIDER_EMAIL=local|external
notable:
  ai/: agent docs mirror - no code here
```

## Personas Registry

- explorer: read-only codebase analysis (haiku tier)
- implementer: feature + bugfix worker (sonnet tier)
- reviewer: PR review w/ architecture lens (sonnet tier)
