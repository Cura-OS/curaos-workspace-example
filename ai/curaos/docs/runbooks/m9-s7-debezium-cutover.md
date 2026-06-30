# M9-S7 #104 — Debezium WAL CDC cutover runbook (operator-driven)

> **Status:** the Debezium CDC path is AVAILABLE behind the per-service
> `CURAOS_OUTBOX_RELAY` flag (default `poller`). The flag default is `poller`
> for ALL four M9 neutral services — i.e. the CDC path is **OFF by default**.
> Flipping a service to `debezium` (and stopping its in-process poller) is an
> **operator step**, gated on a deployed connector + a parallel-run that proves
> identical topic/key/value output. This runbook is that procedure. Nothing here
> runs automatically; the PR only makes the path available.

Binding decision: [AUTO-DECISION-LOG.md](../adr/AUTO-DECISION-LOG.md)
§"2026-06-01 — M9-S7 #104 Debezium CDC broker-path resolution".
Infra manifests: `curaos/ops/zarf/manifests/cdc-debezium.yaml` +
`curaos/ops/zarf/manifests/cnpg-citus-cluster.yaml`.
Grill: [m9-s7-104-redpanda-broker-conflict-pr160.md](../grills/m9-s7-104-redpanda-broker-conflict-pr160.md).

---

## 0. Scope — which services, which relay surface

The four M9 neutral services are **heterogeneous**; the cutover is meaningful only
where an in-process poll-relay timer exists:

| Service | Outbox surface (table) | In-process relay timer? | What the flag gates |
|---|---|---|---|
| `identity-service` | `identity_core.audit_outbox` + `AuditOutboxRelayService` (`onModuleInit` timer) | **Yes** | `CURAOS_OUTBOX_RELAY=debezium` makes `onModuleInit()` a no-op → the poll timer never starts → Debezium is the sole relay. |
| `party-core-service` | `party_core.parties_outbox` (`OutboxService` store) | **No** (no `setInterval` / `start()` / `OnModuleInit` relay — verified) | Nothing to gate in-process — the durable outbox table already exists and Debezium reads its WAL via the connector. There is NO `CURAOS_OUTBOX_RELAY` read in party/org code and none is added: the service has no poll timer, so the flag would have nothing to do. |
| `org-core-service` | `org_core.orgs_outbox` (`OutboxService` store) | **No** | Same as party. |
| `audit-core-service` | none — **consumer-side** | n/a | Consumes `curaos.core.audit.event.v1` identically regardless of which relay produced the message (idempotent chain head). No wiring. |

Consequence: only `identity-service` has an in-process relay whose timer the flag
stops, so it is the ONLY service that received a code change. For party/org, the
WAL-CDC path is achieved purely by the `KafkaConnector` reading their outbox
table's WAL — there is no in-process drain to disable and no flag read to add.
audit-core is untouched. (Adding a poll-relay timer to party/org just to give the
flag something to gate would be NEW unapproved scope, not a fold-back.)

M3/M5/M7 services (patient-core, healthstack-*, workflow-core) **stay on the
poller** — do NOT touch them or their NOTIFY listeners/triggers.

---

## EventRouter wire-compatibility proof (topic / key / value identical)

The cutover is safe iff the Debezium Outbox Event Router SMT emits a stream the
audit-core consumer cannot distinguish from today's in-process poller, so the
consumer needs zero changes. The precise claim, stated honestly:

- **topic + key + value are byte-identical** to the poller (proven field-by-field
  below).
- **headers are NOT claimed byte-identical** by stock EventRouter — the SMT
  always emits an `id` header (no native disable), which the poller does not. We
  strip it with a follow-on `DropHeaders` SMT, leaving `{ x-idempotency-key }`,
  matching the poller (whose `headers` jsonb column is `{}` in practice — no
  caller sets custom headers, verified). **But headers do not matter to the
  consumer at all:** the audit-core consumer
  (`audit-chain-head.store.ts`) dedupes on the PAYLOAD-derived hash-chain key
  `(tenantId, resourceType, resourceId)` via `INSERT ... ON CONFLICT DO NOTHING`
  and reads NO Kafka header. So even a stray header is inert. "Consumer needs
  zero changes" rests on topic+key+value identity, not header identity.

The poller's wire contract is `AuditOutboxRelayService.commandFor(row)`
(codegen template `tools/codegen/templates/service-core/src/db/audit-outbox-relay.ts.hbs`,
landed broker-agnostic via curaos#159):

```ts
private commandFor(row: AuditOutboxRecord): AuditOutboxPublishCommand {
  return {
    topic: row.topic,                       // (1)
    key: row.messageKey,                    // (2)
    value: row.value,                       // (3)
    headers: {
      ...row.headers,
      ...(row.idempotencyKey
        ? { 'x-idempotency-key': row.idempotencyKey }   // (4)
        : {}),
    },
    idempotencyKey: row.idempotencyKey,
  };
}
```

Mapped onto the outbox table columns (the EventRouter source) and the SMT config
in `cdc-debezium.yaml`:

| # | Poller emit | Outbox column | EventRouter SMT config | Result |
|---|---|---|---|---|
| (1) topic | `row.topic` | `topic` (= `curaos.core.audit.event.v1`) | `route.by.field: topic` + `route.topic.replacement: ${routedByValue}` | topic taken verbatim from the row's `topic` column — **identical** |
| (2) key | `row.messageKey` (= `payload.tenantId`) | `message_key` | `table.field.event.key: message_key` | Kafka message key = `message_key` — **identical** partition key |
| (3) value | `row.value` (= `payload`, the `AuditEventEnvelope`, a parsed object) | `payload` (`jsonb`) | `table.field.event.payload: payload` + `table.expand.json.payload: true` + JsonConverter (`value.converter.schemas.enable: false`) | `expand.json.payload: true` re-parses the `jsonb` so the value is the structured object (NOT an escaped JSON string), matching the poller's parsed-object emit — **identical bytes** |
| (4) header `x-idempotency-key` | `row.idempotencyKey` (= `payload.eventId`) | `idempotency_key` | `table.fields.additional.placement: idempotency_key:header:x-idempotency-key` | header present + equal; the SMT's mandatory `id` header is stripped by the `DropHeaders` SMT. Header set = poller's. **Inert to the consumer regardless** (it reads no header). |

**Delivery semantics:** the poller is at-least-once (publish then mark; a crash
between re-publishes → double-publish). Debezium is also at-least-once (offset
commit lag → re-deliver). Both are absorbed by the SAME idempotent consumer
(audit-core `audit-chain-head.store.ts` `INSERT ... ON CONFLICT DO NOTHING` on the
hash-chain key `(tenantId, resourceType, resourceId)` derived from the message
PAYLOAD — NOT from any Kafka header). So a re-delivery from either relay → the
chain-head conditional-swap no-ops on a verified-equal hash → no double-advance.
No new idempotency machinery; the consumer is unchanged.

A unit-level lock on `commandFor()` (the curaos#159 test on the codegen trio +
the identity flag tests) proves the mapped fields stay stable; the table above
proves the SMT reproduces topic/key/value. The **live** topic/key/value
equivalence (connector deployed, parallel run, topic-diff) is the operator step
in §2-3 below — it is NOT provable without a live Redpanda + Strimzi-Connect +
Citus cluster and is therefore explicitly out of this PR's verified scope.

---

## 1. Pre-cutover — deploy the connector path (default OFF)

1. Deploy the `strimzi-connect` Zarf component (Strimzi operator Connect-only).
   Confirm the operator is `Running` in namespace `redpanda` and the
   `KafkaConnect/curaos-debezium-connect` resource reaches `Ready` (it bakes the
   Debezium PG plugin 3.5.1.Final via `spec.build`, pushes to the in-cluster
   registry, and connects to `redpanda.redpanda.svc:9093`).
2. Confirm the CNPG `debezium` managed role exists on `curaos-citus-workers`
   (and coordinator) and the `debezium-cdc` Secret is present.
3. Confirm the `Publication` CRs are `Ready` (filtered, scoped to each outbox
   table) and the per-worker replication slots are created.
4. Leave EVERY service on `CURAOS_OUTBOX_RELAY=poller` (default). The connectors
   start consuming the WAL; the pollers ALSO still run. Double-publish is safe
   (idempotent consumer). This is the parallel-run window.

## 2. Parallel-run verification (the topic/key/value identity gate)

For each service in turn, with BOTH relays live, capture the produced messages
on `curaos.core.audit.event.v1` and assert the Debezium-produced envelopes match
the poller-produced ones on **topic, key, and value bytes** (the consumer-visible
contract). Headers may differ by the stripped `id` header only — the consumer
reads no header, so this is informational, not a gate. The idempotent consumer
means duplicates are harmless during this window. Do NOT proceed until the
topic/key/value diff is clean for the service.

## 3. Per-service cutover (telemetry-gated, one service at a time)

Once §2 is clean for a service:

- **identity-service:** set `CURAOS_OUTBOX_RELAY=debezium` in its deployment env
  and roll the pods. `onModuleInit()` no-ops → the poll timer stops → Debezium is
  the sole relay. Verify the poller is no longer publishing (its relay-batch
  metric goes flat) and Debezium continues. The durable outbox table, atomic
  enqueue, UUIDv7 `eventId`, and idempotency key all stay.
- **party-core-service / org-core-service:** NO env/config change in the service.
  These services have no in-process poll relay and read no `CURAOS_OUTBOX_RELAY`
  flag, so there is nothing to flip. The cutover for them is purely operational:
  deploy the `KafkaConnector` (it begins reading the `parties_outbox` /
  `orgs_outbox` WAL). Because no poller ever drained these tables in-process, the
  outbox rows simply accumulate `pending` and Debezium relays them — the
  per-row `markPublished` is a no-op concern here (see §6 outbox retention).
- **audit-core-service:** no action — consumer-side.

## 4. Rollback (per [[curaos-rolling-update-rule]])

Set `CURAOS_OUTBOX_RELAY` back to `poller` (or unset it) and roll the pods. For
identity-service this re-arms the in-process timer, which drains any `pending`
rows immediately — safe because both mechanisms emit the same idempotent
at-least-once contract. No `-v2`/parallel path, no schema change, no data
migration. The connector can be left running during rollback (double-publish is
safe) or scaled to zero. There is no irreversible step.

## 6. Outbox retention under CDC (operator note — grill finding)

Debezium reads the WAL but does NOT call `markPublished` on the outbox rows, so
under a steady-state Debezium relay the outbox tables are no longer drained to
`published` by an in-process loop:

- **identity-service:** while on `debezium`, rows stay `pending` (the poll timer
  is off and nothing marks them). The status column is then only meaningful again
  on a rollback to `poller`, when the re-armed timer drains the backlog. This is
  safe (the idempotent consumer absorbs the re-publish) but the table grows.
- **party-core / org-core:** these never had an in-process drain, so rows already
  accumulate `pending`; CDC does not change that, it just relays them.

Action (operator, before/at cutover): add a retention/cleanup policy for the
captured outbox tables — e.g. a periodic `DELETE FROM <schema>.<outbox> WHERE
created_at < now() - <retention>` job (rows are already relayed via the WAL;
the table is not the system of record for delivery once Debezium owns the
slot). This is OUT OF SCOPE for this infra PR (it is a deployment-time
operational policy, not a manifest), but MUST exist before a production cutover.
Tracked as a follow-up (see closeout `FORESIGHT`).

## 7. What is verified vs operator-driven (honesty boundary)

- **Verified at PR time (no live cluster):** manifests parse + structural
  validity (7 CDC docs + 3 CNPG docs); zarf deploy-order + zero-egress guards;
  the EventRouter→`commandFor()` topic/key/value mapping proof (table above) +
  table-name match against each service's Drizzle schema/migration; the codegen
  relay-flag unit lock (curaos#159) + the identity flag tests. Per-module local
  CI green.
- **Operator-driven (requires a live Redpanda + Strimzi-Connect + Citus
  cluster), NOT in this PR:** KafkaConnect reaching `Ready`; the per-worker
  Citus slot fan-out + slot health; the live parallel-run topic/key/value diff
  (§2); the actual telemetry-gated cutover (§3); the outbox retention job (§6). A
  claimed live-CDC pass that was not run on a real cluster is a false-green and
  is forbidden.
