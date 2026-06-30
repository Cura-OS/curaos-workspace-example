# M12 clinical-flow real-infra runbook (operator-driven)

> Agent-doc mirror of `curaos/test/integration/m12-clinical-flow/` (the test CODE
> lives in `curaos/`; this runbook is the agent doc). Source issue:
> [curaos-ai-workspace#390](https://github.com/your-org/curaos-ai-workspace/issues/390)
> · Epic [#26](https://github.com/your-org/curaos-ai-workspace/issues/26)
> acceptance #1 (live edge of #4).

## Why this exists (CI-gated vs live split)

The in-process acceptance suite (`bun test`) is the **CI gate** — it proves the
full-flow choreography + the audit-chain reconciliation (ADR-0157) + the
PHI-boundary value scan + the consent PROCEED/REJECT decisions + terminology
`$validate-code` participation + the SLA timer signals. It does **not** prove
broker durability, real HAPI `$validate-code`, a real 5-service deployment, or
the deployed audit-core validator + `ConsentInterceptor`. Those need **real
infra** and are exercised here — the `[live-e2e]` block, **skipped** unless
`E2E_LIVE=1`, with **no in-process fallback** so a missing stack never
green-washes.

## Stack (resolved infra decisions)

| Component | Choice (v1) | Source |
|---|---|---|
| Message broker | **Redpanda v24.3.1** (Kafka-API-compatible) | ADR-0102 / ADR-0203 (deployed v1 broker) |
| FHIR terminology | **HAPI FHIR** `$validate-code` (LOINC / RxNorm) | encounter-lifecycle §5; ADR-0115 |
| Database | **PostgreSQL (CNPG)**, DB-per-tenant | ADR-0163 / curaos_postgres_rule |
| Audit chain | neutral Diamond **`audit-core`** validator (`chain.broken.v1` on a bad link) | ADR-0157 / #300 / #318 |
| Consent | deployed **`ConsentInterceptor`** (HAPI 8.x parity) | #389 / ADR-0115 §4.14.3 |
| PHI egress | **Presidio** sidecar (egress scrub) | #388 / ADR-0114 |

## Compose stack (operator brings this up)

```yaml
# docker-compose.real-infra.yml (sketch — wire the 5 service images per ops/)
services:
  postgres:
    image: ghcr.io/cloudnative-pg/postgresql:16
    environment: { POSTGRES_PASSWORD: dev }
    ports: ["5432:5432"]
  redpanda:
    image: docker.redpanda.com/redpandadata/redpanda:v24.3.1
    command: ["redpanda","start","--smp","1","--mode","dev-container","--kafka-addr","PLAINTEXT://0.0.0.0:9092","--advertise-kafka-addr","PLAINTEXT://localhost:9092"]
    ports: ["9092:9092"]
  hapi-fhir:
    image: hapiproject/hapi:latest      # $validate-code endpoint (LOINC/RxNorm loaded)
    ports: ["8080:8080"]
  # encounter-service / scheduling-service / clinical-doc-service /
  # orders-service / terminology-service — built from backend/services/*,
  # each wired to redpanda + postgres + the PHI-boundary + consent gates.
```

```bash
docker compose -f docker-compose.real-infra.yml up -d
# wait for health; load the LOINC + RxNorm CodeSystems into HAPI so
# $validate-code can resolve the order code 58410-2 (LOINC CBC panel).
```

## Run the live block

```bash
cd curaos/test/integration/m12-clinical-flow
E2E_LIVE=1 \
  PG_URL=postgres://postgres:dev@localhost:5432/postgres \
  KAFKA_BROKERS=localhost:9092 \
  HAPI_BASE_URL=http://localhost:8080/fhir \
  bun test
```

When `E2E_LIVE` is unset (the default, incl. CI) the `[live-e2e]` block is
**skipped** and only the in-process layer runs.

## Live assertions the operator must implement against the stack

Each currently throws a `live-e2e: implement against …` sentinel — wire them to
the real clients (these are the genuine production-infra proofs the in-process
layer cannot make):

1. **Full flow on real Redpanda across all 5 deployed services** — publish
   `Appointment.booked`, drive the flow through the deployed consumers, assert
   the lifecycle topics land on real Redpanda with per-key ordering, ending at
   `Appointment.fulfilled`.
2. **Live HAPI `$validate-code`** — call HAPI's `$validate-code` for the order's
   LOINC code (accept) and an unknown code (reject); assert the order is placed
   only on a validated code.
3. **Audit chain against the deployed validator** — feed the flow's emitted
   `AuditEvent`s through the deployed `audit-core` validator; assert it
   reconciles intact (no `chain.broken.v1`) and that a tampered leg trips it.
4. **Consent REJECT through the deployed `ConsentInterceptor`** — flip the
   patient's consent toggle to deny, attempt the clinical-doc authoring write,
   assert the deployed interceptor blocks it (read + write).

## Teardown

```bash
docker compose -f docker-compose.real-infra.yml down -v
```

## Cross-references

- Test code: `curaos/test/integration/m12-clinical-flow/`
- In-process harness: `src/event-bus.ts`, `src/clinical-flow.ts`, `src/audit-leg.ts`, `src/fixtures.ts`
- Acceptance suite: `test/clinical-flow-e2e.test.ts`
- Demo narrative: [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md)
- Package README (CI vs live table): `curaos/test/integration/m12-clinical-flow/README.md`
