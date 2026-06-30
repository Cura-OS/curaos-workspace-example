# M10 cross-service integration — real-infra runbook (operator-driven)

> Agent-doc mirror of `curaos/test/integration/m10-cross-service/` (the test CODE
> lives in `curaos/`; this runbook is the agent doc). Source issue:
> [curaos-ai-workspace#285](https://github.com/your-org/curaos-ai-workspace/issues/285)
> · Epic [#24](https://github.com/your-org/curaos-ai-workspace/issues/24) acceptance #3.

## Why this exists (CI-gated vs live-infra split)

The integration matrix runs in **two layers**:

1. **In-process choreography** (`bun test`) — the **CI gate**. Proves the
   event/query choreography + the snake_case wire-contract shape + tenant
   isolation + reference-only PHI across the 7 services, with **no broker**. This
   is what `bun run ci` / `just ci` runs and gates merge on. It is a faithful
   proof of the *contract* (the cross-service contract IS the wire envelope), but
   it does **not** prove broker durability, PG-native search ranking, signed-URL
   expiry, or PG transaction isolation.
2. **Real-infra** (`RUN_REAL_INFRA=1 bun test`) — **operator-driven, NOT in CI**.
   The `describe('[live-infra]')` block in `cross-service-flows.test.ts` carries
   the live-only assertions. Each case **throws if reached without live infra**
   (no in-process fallback) so a missing broker can never green-wash. This runbook
   is the procedure to stand the stack up and run that block.

**Do not wire this block into CI.** GitHub auto-CI is `workflow_dispatch`-only
(billing); the local `just ci` gate is the merge gate and it runs only the
in-process layer. The real-infra layer is run by a human operator (or a
deployed-environment smoke job) against a live cluster.

## Stack (resolved infra decisions)

| Component | Choice (v1) | Source |
|---|---|---|
| Message broker | **Redpanda v24.3.1** (Kafka-API-compatible) | ADR-0102 / RESOLUTION-MAP "Broker for v1" (RESOLVED-SHIPPED M9-S7 #104). Strimzi is **Connect-only** (Debezium CDC), not a managed broker. Wire contract stays Apache-Kafka-4.x-portable. |
| Settings flag transport | **NATS** for `SettingsFlagToggled`; Kafka for tenant/user | `SETTINGS_EVENT_TRANSPORT` in `settings-event-producer.ts` |
| Database / search | **PostgreSQL (CNPG)** — PG-only search v1: pgvector + tsvector + pg_trgm | ADR-0163 (OpenSearch **removed** from v1; revisit HealthStack M11) |
| Object storage | **SeaweedFS** + signed URLs | storage-service providers |
| Report PDF render | **Gotenberg** | reports-service providers |

## Compose stack (operator brings this up)

Bring up a local compose stack with the four backends. Use the **Redpanda**
image (not `apache/kafka`/Strimzi) so the deployed-broker reality is exercised:

```yaml
# docker-compose.real-infra.yml (operator-owned; NOT committed as a CI input)
services:
  postgres:
    image: ghcr.io/cloudnative-pg/postgresql:16   # CNPG PG; enable pgvector + pg_trgm
    environment: { POSTGRES_PASSWORD: dev }
    ports: ["5432:5432"]
  redpanda:
    image: docker.redpanda.com/redpandadata/redpanda:v24.3.1
    command: ["redpanda","start","--smp","1","--mode","dev-container","--kafka-addr","PLAINTEXT://0.0.0.0:9092","--advertise-kafka-addr","PLAINTEXT://localhost:9092"]
    ports: ["9092:9092"]
  nats:
    image: nats:2-alpine
    command: ["-js"]            # JetStream for the settings flag transport
    ports: ["4222:4222"]
  seaweedfs:
    image: chrislusf/seaweedfs:latest
    command: ["server","-s3"]
    ports: ["8333:8333"]
```

```bash
docker compose -f docker-compose.real-infra.yml up -d
# wait for health, then enable PG extensions:
#   CREATE EXTENSION IF NOT EXISTS vector;  CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

## Run the live block

```bash
cd curaos/test/integration/m10-cross-service
RUN_REAL_INFRA=1 \
  PG_URL=postgres://postgres:dev@localhost:5432/postgres \
  KAFKA_BROKERS=localhost:9092 \
  NATS_URL=nats://localhost:4222 \
  S3_ENDPOINT=http://localhost:8333 \
  bun test
```

When `RUN_REAL_INFRA` is unset (the default, incl. CI) the `[live-infra]` block
is **skipped** and only the in-process layer runs.

## Live assertions the operator must implement against the stack

Each currently throws a `live-infra: implement against …` sentinel — wire them to
the real clients (these are the genuine durability/ranking proofs the in-process
layer cannot make):

1. **Redpanda durability across consumer restart** — publish `notify.delivered`,
   restart the consumer group, assert offset resume + no message loss.
2. **PG-native search ranking** — index the notify history into PG (tsvector +
   pg_trgm), run a ranked federated query, assert the expected notification ranks.
3. **Signed-URL fetch before expiry** — render a report PDF (Gotenberg), store it
   (SeaweedFS), mint a signed URL, fetch it before expiry, assert 200 + bytes.

## Teardown

```bash
docker compose -f docker-compose.real-infra.yml down -v
```

## Cross-references

- Test code: `curaos/test/integration/m10-cross-service/`
- In-process harness: `src/event-bus.ts`, `src/audit-leg.ts`, `src/fixtures.ts`
- Flows: `test/cross-service-flows.test.ts`
- Package README (CI vs live table): `curaos/test/integration/m10-cross-service/README.md`
