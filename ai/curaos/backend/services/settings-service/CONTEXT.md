# Agent Context — settings-service

**Cluster:** ADR-0201 Platform Shared Services
**Last updated:** 2026-06-01

---

## Scaffold state (M10-274, 2026-06-01)

The service was generated from the `@curaos/codegen` service-core mold, then
domain-filled per ADR-0201 §3.4. **What landed in the scaffold PR:**

- Drizzle schema for the 5 domain tables (`settings_tenant`, `settings_user`,
  `settings_defaults`, `settings_audit`, `feature_flag_overrides`) + the
  inherited audit-outbox / chain-head / idempotency infra tables. Migration
  `0001_settings_domain.sql` (forward-only; `0000` owns the outbox).
- `src/settings/` domain module: `SettingsService` (resolution `default →
  tenant → user`, value-hash audit/event path), `SettingsController` (the
  §3.4.5 REST surface), `SettingsRepository` port + `InMemorySettingsRepository`
  shell default, `FeatureFlagProvider` port + `CuraOSLocalFeatureFlagProvider`.
- `src/events/settings-event-producer.ts`: the real §3.4.4 topics
  (`curaos.settings.tenant.updated.v1` Kafka, `.flag.toggled.v1` NATS,
  `.user.updated.v1` Kafka) with the value-hash-only (no raw value) envelope.
- Inherited auth-by-default (JWT verify + roles), audit-outbox relay/replayer.
- 37 tests (11 unit + 17 auth-matrix + 9 audit-chain-e2e) green under `bun:test`.

**Still TODO (own follow-up Stories, NOT this scaffold):** the Drizzle adapter
binding (replace `InMemorySettingsRepository`), live Unleash/LaunchDarkly/
Flagsmith SDK adapters, OPA-WASM policy guard, Valkey cache + NATS invalidation
consumer, GDPR erasure Kafka consumer wiring, TypeSpec `.tsp` + AsyncAPI specs,
JSON-Schema namespace registration (`POST /admin/settings/schema/{namespace}`).
These adapters are injected at the modulith composition layer
([[curaos-modulith-standalone-rule]]) — the scaffold ships driver-free ports +
the local default so the service builds + tests without PG/Valkey/Unleash/Kafka.

> NOTE: the scaffold uses `bun:test` (codegen mold default), not Vitest as the
> stack table below states; integration tests against real PG/Valkey/Unleash
> need live infra (Testcontainers) and run in the dispatch-only CI tier.

---

## Stack (locked — ADR-0100, ADR-0201)

- Language: TypeScript (strict)
- Runtime: Bun primary; Node.js 22 LTS fallback only when Bun cannot
- Framework: NestJS 11, Fastify adapter
- ORM: Drizzle (schema + drizzle-kit migrations)
- DB: PostgreSQL 17 (schema-per-tenant)
- Cache: Valkey 8 (`ioredis`) — primary hot cache for resolved settings
- Feature flags: Unleash self-hosted — local default (`unleash-client`)
- Policy: OPA-WASM (`opa-wasm`) for `policy_protected` key writes
- Events: Kafka 4 (`@nestjs/microservices`) + NATS JetStream (hot-reload invalidation)
- Auth/Access: JWT Bearer + Cerbos ABAC + OPA-WASM
- Secrets: OpenBao (injected at pod startup; never env vars)
- Observability: OTel SDK, structured JSON logs, Loki/Tempo/VictoriaMetrics/Grafana
- Test: Vitest + Testcontainers (real PG + Valkey + Unleash in CI)
- Package: `@curaos/settings-service`

---

## Module Structure

```
settings-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── settings/
│   │   ├── settings.module.ts
│   │   ├── settings.controller.ts      # GET/PUT/DEL /settings/tenant/{key}, /settings/user/{userId}/{key}
│   │   └── settings.service.ts         # resolution: platform default → tenant → user; OPA guard
│   ├── flags/
│   │   ├── flags.controller.ts         # GET /settings/flags, /settings/flags/{flagKey}
│   │   ├── flags.service.ts            # flag evaluation; resolution order
│   │   └── providers/
│   │       ├── flag.provider.interface.ts     # FeatureFlagProvider
│   │       ├── local-flag.provider.ts         # unleash-client Node SDK
│   │       ├── external-launchdarkly.provider.ts
│   │       └── external-flagsmith.provider.ts
│   ├── admin/
│   │   └── schema.controller.ts        # POST /admin/settings/schema/{namespace}
│   ├── cache/
│   │   ├── cache.service.ts            # Valkey wrapper — settings:{tenant_id}:{key} TTL 60s
│   │   └── cache-invalidation.consumer.ts  # NATS: settings.*.updated.v1 → Valkey DEL
│   ├── policy/
│   │   └── opa.guard.ts                # OPA-WASM evaluation for policy_protected writes
│   ├── consumers/
│   │   └── erasure.consumer.ts         # Kafka: curaos.party.erasure.requested.v1
│   ├── outbox/
│   │   └── outbox.scheduler.ts
│   └── persistence/
│       └── schema.ts
├── test/
│   ├── unit/
│   └── integration/                    # Testcontainers: PG + Valkey + Unleash
└── specs/
    ├── settings.tsp                     # TypeSpec REST spec
    └── settings-events.asyncapi.yaml    # AsyncAPI 3 event schema
```

---

## Key Behavioral Rules

- **Provider selection:** `FLAG_PROVIDER=unleash|launchdarkly|flagsmith`. NestJS DI module swap — one provider active per deployment.
- **Resolution order (immutable):** platform default (`settings_defaults`) → tenant override (`settings_tenant`) → user override (`settings_user`). Never skip a level; user override only possible for non-`admin_only` keys.
- **Cache TTL:** 60 s TTL on every `settings:{tenant_id}:{key}` Valkey key. NATS JetStream push invalidation on write (immediate). Services with local in-process cache: 5 s TTL max before re-querying Valkey.
- **OPA guard:** Any PUT to `policy_protected=true` key → `opa.guard.ts` evaluates policy bundle before write proceeds. Deny → 403 with policy reason.
- **Audit immutability:** Every successful write appends a row to `settings_audit` with `old_value_hash` + `new_value_hash` (SHA-256). Table is append-only; no UPDATE/DELETE permitted by application.
- **Key namespace validation:** PUT to unknown key namespace → 400 Bad Request. Namespace registered via `POST /admin/settings/schema/{namespace}` with JSON Schema.
- **GDPR:** `erasure.requested.v1` → DELETE all `settings_user` rows for `user_id = party_id`. Emit `erasure.completed.v1`.
- **DLQ:** Every Kafka consumer has dead-letter topic. Alert on DLQ messages.

---

## Env Vars (injected by OpenBao)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `VALKEY_URL` | Valkey connection |
| `KAFKA_BROKERS` | Kafka broker list |
| `NATS_URL` | NATS JetStream |
| `FLAG_PROVIDER` | `unleash` (default) or `launchdarkly` or `flagsmith` |
| `UNLEASH_URL` | Unleash server API URL |
| `UNLEASH_CLIENT_SECRET` | Unleash client API key |
| `LAUNCHDARKLY_SDK_KEY` | LaunchDarkly server-side SDK key |
| `FLAGSMITH_ENVIRONMENT_KEY` | Flagsmith environment API key |
| `OPA_WASM_BUNDLE_PATH` | Path to OPA-WASM bundle (mounted volume) |

---

## Commands

```bash
# Dev
bun dev

# Test
bun test
bun test:integration     # Testcontainers (PG + Valkey + mock Unleash)

# Build
bun build

# DB
bun run db:migrate
bun run db:generate

# Spec
bun typespec compile
```

---

## Acceptance Criteria

- `FeatureFlagProvider` interface with Unleash (local) + LaunchDarkly + Flagsmith (external) implementations.
- OPA-WASM guard enforced on all `policy_protected=true` key writes.
- Valkey cache with 60 s TTL + NATS push invalidation on every write.
- Flag resolution order: platform default → tenant → user; tested for all three levels.
- Kafka producers: `tenant.updated.v1`, `flag.toggled.v1`, `user.updated.v1`.
- GDPR erasure consumer: `settings_user` rows purged for party.
- `settings_audit` append-only with SHA-256 value hashes.
- TypeSpec REST spec + AsyncAPI 3 schema registered.
- Vitest integration tests green in CI with Testcontainers.
- OTel traces + metrics (cache hit/miss, flag evaluation latency, policy outcomes) in Grafana.
- OpenBao injection verified.
