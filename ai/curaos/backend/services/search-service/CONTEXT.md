# Agent Context — search-service

**Cluster:** ADR-0201 Platform Shared Services
**Last updated:** 2026-06-02

---

## Scaffold status (M10-273)

Scaffolded from the `@curaos/codegen` `--plain-service` recipe (package
`@curaos/search-service`, dir `backend/services/search-service`), then the search
domain was filled per ADR-0201 §3.3. **Implemented in the scaffold PR:**

- `query/` — `POST /search` (federated), `POST /search/:domain` (bm25 | hybrid),
  `POST /search/suggest`, `GET /search/health`. tenantId is JWT-derived.
- `admin/` — `POST /admin/indexes` (register), `PUT /admin/indexes/:alias/reindex`,
  `GET /admin/indexes/:alias/status`, `DELETE /admin/indexes/:alias/docs/:id`
  (GDPR). Write routes are `tenant-admin`-only.
- `providers/search/` — `SearchProvider` port + `InMemorySearchProvider` (the
  `CuraOSLocalSearchProvider` OpenSearch client binds at the modulith host).
- `providers/hybrid/` — `HybridSearchProvider` port (ParadeDB `pg_search` +
  `pgvector`, RRF fusion) + `InMemoryHybridSearchProvider`.
- `admin/search-registry.repository.ts` — registry port + in-memory adapter over
  the 3 metadata tables.
- `events/search-event-producer.ts` — index-lifecycle events
  (`curaos.search.index.requested/completed/error.v1`), snake_case wire shape.
- Drizzle schema + `0001_search_domain.sql` for `search_index_registrations` /
  `search_reindex_jobs` / `search_connector_configs` (NEUTRAL metadata only).
- Audit-outbox + chain-head + auth infra inherited verbatim from the mold.
- Unit + integration (auth-matrix, audit-chain-e2e) tests; `bun run ci` green.

**Deferred to follow-up Stories (NOT in the scaffold PR):** the concrete
OpenSearch/ParadeDB/Algolia/Meilisearch + vLLM/OpenAI/Cohere adapters, the
Debezium CDC consumer, the `curaos.party.erasure.requested.v1` consumer wiring,
the reindex worker (the job stays `queued`), the TypeSpec/AsyncAPI spec files,
and the reaper for `idempotency_keys`. The ports + in-memory fakes are the
contract those adapters implement.

---

## Stack (locked — ADR-0100, ADR-0201)

- Language: TypeScript (strict)
- Runtime: Bun primary; Node.js 22 LTS fallback only when Bun cannot
- Framework: NestJS 11, Fastify adapter
- ORM: Drizzle (service metadata only — `search_index_registrations`, `search_reindex_jobs`, `search_connector_configs`)
- DB: PostgreSQL 17 (schema-per-tenant) — for service metadata; indexed content lives in OpenSearch
- Search: OpenSearch 2 self-hosted — local default
- CDC: Debezium 3 on Kafka Connect (infra layer)
- Events: Kafka 4 (`@nestjs/microservices`) + NATS JetStream
- Auth/Access: JWT Bearer + Cerbos ABAC + OPA-WASM
- Secrets: OpenBao (injected at pod startup; never env vars)
- Observability: OTel SDK, structured JSON logs, Loki/Tempo/VictoriaMetrics/Grafana
- Test: Vitest + Testcontainers (real PG + OpenSearch in CI)
- Package: `@curaos/search-service`

---

## Module Structure

```
search-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── query/
│   │   ├── query.module.ts
│   │   ├── query.controller.ts          # POST /search, /search/{domain}, /search/suggest
│   │   └── query.service.ts             # federated query, single-domain, autocomplete
│   ├── admin/
│   │   ├── admin.controller.ts          # POST /admin/indexes, PUT reindex, GET status, DEL doc
│   │   └── admin.service.ts             # connector config, reindex job, GDPR hard-delete
│   ├── providers/
│   │   ├── search/
│   │   │   ├── search.provider.interface.ts      # SearchProvider
│   │   │   ├── local-search.provider.ts          # @opensearch-project/opensearch client
│   │   │   └── external-search.provider.ts       # Algolia / Meilisearch SDK
│   │   └── rerank/
│   │       ├── rerank.provider.interface.ts      # SemanticRerankProvider
│   │       ├── local-rerank.provider.ts          # vLLM embedding HTTP API (ADR-0114)
│   │       └── external-rerank.provider.ts       # OpenAI text-embedding / Cohere Embed
│   ├── consumers/
│   │   ├── cdc.consumer.ts              # Kafka CDC topics from Debezium → OpenSearch bulk index
│   │   ├── index-request.consumer.ts    # Kafka: curaos.search.index.requested.v1
│   │   ├── storage.consumer.ts          # Kafka: storage.object.uploaded/deleted
│   │   └── erasure.consumer.ts          # Kafka: curaos.party.erasure.requested.v1
│   ├── outbox/
│   │   └── outbox.scheduler.ts
│   └── persistence/
│       └── schema.ts
├── test/
│   ├── unit/
│   └── integration/                     # Testcontainers: PG + OpenSearch + Kafka
└── specs/
    ├── search.tsp                        # TypeSpec REST spec
    └── search-events.asyncapi.yaml       # AsyncAPI 3 event schema
```

---

## Key Behavioral Rules

- **Provider selection:** `PROVIDER_SEARCH=local|external`, `PROVIDER_RERANK=local|external|none`. NestJS DI module swap.
- **Tenant isolation:** All OpenSearch queries add `must: term: { tenant_id }` filter. Index alias always prefixed `{tenant_id}.`. Never expose cross-tenant results.
- **CDC consumer idempotency:** Debezium CDC events are at-least-once. Consumer uses OpenSearch document `_id = {source_table}.{row_id}` for upsert (PUT with `doc_as_upsert=true`). Duplicate events → no-op.
- **GDPR hard-delete:** `erasure.requested.v1` → `DELETE /admin/indexes/{alias}/docs/{id}` across all tenant indexes for that party. Emit completion event after all deletes.
- **Reranking gate:** `rerank=true` query param only accepted when `search.rerank.enabled=true` in settings-service. If disabled → return BM25 results without reranking.
- **Index alias zero-downtime reindex:** New index created with version suffix (`{alias}_v2`), alias swapped atomically after reindex completes.
- **Single connector preference:** One Debezium PG connector per PG cluster, topic-per-table routing. `search_connector_configs` stores connector config reference; admin API manages lifecycle.
- **DLQ:** Every Kafka consumer has dead-letter topic. Alert on any DLQ message.

---

## Index Mapping Convention

Index alias format: `{tenant_id}.{domain}.{entity}` (e.g., `acme.identity.party`).

Every registered index mapping must declare:
- `source_domain`: which service owns the source data
- `id_field`: PG primary key field (used as OpenSearch `_id`)
- `tenant_field`: field containing tenant_id (required; used in all queries as filter)
- `version`: mapping schema version (semver)

---

## Env Vars (injected by OpenBao)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `KAFKA_BROKERS` | Kafka broker list |
| `NATS_URL` | NATS JetStream |
| `PROVIDER_SEARCH` | `local` (OpenSearch) or `external` |
| `OPENSEARCH_NODE` | OpenSearch endpoint |
| `OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD` | OpenSearch credentials |
| `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY` | For external Algolia provider |
| `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | For external Meilisearch provider |
| `PROVIDER_RERANK` | `none` (default) or `local` (vLLM) or `external` (OpenAI/Cohere) |
| `VLLM_EMBEDDING_ENDPOINT` | vLLM embedding API base URL |
| `OPENAI_API_KEY` / `COHERE_API_KEY` | For external rerank providers |

---

## Commands

```bash
# Dev
bun dev

# Test
bun test
bun test:integration     # Testcontainers (PG + OpenSearch + Kafka)

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

- `SearchProvider` interface with OpenSearch (local) + Algolia/Meilisearch (external) implementations.
- `SemanticRerankProvider` interface with vLLM (local) + OpenAI/Cohere (external) implementations.
- CDC consumer processing Debezium Kafka topics → OpenSearch bulk upsert with idempotency.
- Admin API: register mapping, trigger reindex, status, GDPR hard-delete endpoint.
- Federated cross-domain query with tenant isolation filter.
- Single-domain query routing (BM25 only vs. hybrid BM25+vector).
- Autocomplete via prefix + fuzzy query.
- GDPR erasure consumer: hard-delete all party docs across tenant indexes.
- Integration tests green in CI with Testcontainers.
- OTel traces + metrics (indexing throughput, query latency P50/P95, CDC lag) in Grafana.
- OpenBao injection verified.
