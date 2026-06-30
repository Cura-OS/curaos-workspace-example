# CONTEXT — conversion-core-service

**ADR-0206 aligned.** Last updated: 2026-05-24

---

## Runtime & Tooling

- **Language/Framework:** TypeScript / NestJS (Node 22 LTS) — NOT Kotlin/Spring Boot
- **Package manager:** bun
- **Test runner:** Vitest + Supertest
- **Linter/formatter:** ESLint + Prettier
- **Build:** `nest build` → `dist/`
- **Docker:** multi-stage Dockerfile; compose boots service + PG17 + Valkey + sidecar pool

---

## Key Design Decisions

- LibreOffice is NOT thread-safe: BullMQ worker for LibreOffice jobs configured `concurrency: 2`, isolated worker. Do not increase without testing.
- Large file transfer between main pod and sidecar via shared K8s `emptyDir` volume — avoids gRPC 4MB message limit for binaries.
- No large binaries stored in PG. All converted artifacts written to SeaweedFS (ADR-0101 DA13 Q6 canonical object store, S3-API compatible); job record holds presigned URL only.
- HL7v2 parse uses `hl7-standard` npm; FHIR resource construction uses `@smile-cdr/fhir-client`. Custom transform pipeline maps HL7v2 segments to FHIR fields — not a generic mapper.
- Sidecar health probe checked before every dispatch. If probe fails, queue pauses and emits `conversion.sidecar.unhealthy`.

---

## LibreOffice Resource Limits (K8s)

```yaml
resources:
  limits:
    memory: "2Gi"
    cpu: "1000m"
  requests:
    memory: "512Mi"
    cpu: "250m"
replicas: 2  # max default; scale conservatively
```

Open question (ADR-0206 §8.2): pre-warm pool (always-on) vs on-demand — deferred until business-conversion SLA defined.

---

## Sidecar gRPC Stubs

Each sidecar exposes a gRPC service. NestJS uses `@grpc/grpc-js` with proto stubs generated at build time. Proto files live in `proto/` directory. Do not call sidecar via REST — gRPC boundary maintains licence isolation.

---

## HL7v2 ↔ FHIR Pipeline

```
HL7v2 message (string)
  → hl7-standard parse → HL7Message object
  → custom segment mappers (MSH, PID, PV1, OBX...)
  → @smile-cdr/fhir-client FHIR R4 resource builders
  → FHIR Bundle JSON
```

Inverse path for FHIR → HL7v2.

---

## API Transport Boundary

Public API = tRPC procedures (`convertDocument`, `extractText`, `extractMetadata`, `convertHL7toFHIR`, `convertFHIRtoHL7`) + REST `POST /convert` (multipart). Sidecar transport = gRPC only (licence isolation — do not conflate with the public tRPC API).

## Files That Must Not Break

- tRPC procedures: `convertDocument`, `extractText`, `extractMetadata`, `convertHL7toFHIR`, `convertFHIRtoHL7`
- REST route: `POST /convert` (multipart)
- Kafka topics (produced): `conversion.job.completed`, `conversion.job.failed`, `conversion.sidecar.unhealthy`

---

## Commands

```bash
bun install
bun build
bun test
bun test:e2e
docker compose up  # boots service + PG17 + sidecar pool
```

---

## Implementation status — domain (#350, M11 W4)

Domain landed on the merged codegen scaffold (service PR conversion-core-service#1, curaos pointer bumped on `agent/bump-conversion-core-domain-m11-350`). What is BUILT in-process vs. what binds at the modulith composition root:

**Built (in-process, tested):**
- `src/conversions/conversion-job.types.ts` — `ConversionJobStatus` state machine (`assertTransition` single chokepoint) + `SidecarKind`.
- `src/conversions/conversion-job.store.ts` — `ConversionJobStore` port + `InMemoryConversionJobStore` (tenant-scoped find/transition). `conversion_job` Drizzle table + migration `0002`.
- `src/conversions/conversion-job.service.ts` — orchestrator: create → dispatch → running → completed|failed, emits job events, writes audit, OTel spans.
- `src/sidecars/sidecar-dispatcher.ts` — `SidecarDispatcher` PORT + in-memory double.
- `src/events/conversion-job-event-producer.ts` — `curaos.core.conversion.job.{created,dispatched,completed,failed}.v1` (root producer; distinct `job` aggregate from the scaffold resource-CRUD events).
- `src/hl7-fhir/bridge.ts` — neutral HL7v2 ↔ FHIR R4 byte mechanics (parse, Bundle assemble, lossless round-trip; shape-only errors, no PHI echo).
- `src/observability/tracer.ts` — OTel-shaped `Tracer` seam (no-op default).
- REST `POST /conversions/jobs` + `GET /conversions/jobs/:id`; TypeSpec + AsyncAPI catalogs updated.

**Composition-root wiring (driver-free shell — ports default to in-memory):**
- `CONVERSION_JOB_STORE` → `PostgresConversionJobStore` (Drizzle) — no PG in CI; in-memory store models the same tenant-scoped contract.
- `SIDECAR_DISPATCHER` → gRPC adapter (`@grpc/grpc-js`) to Tika/Pandoc/LibreOffice/Tesseract sidecars (heavy parsers `hl7-standard` / `@smile-cdr/fhir-client` live IN the sidecar per the license boundary).
- `CONVERSION_JOB_EVENT_PRODUCER` → kafkajs producer.
- `CONVERSION_TRACER` → `@opentelemetry/api` tracer.
- Job queue (BullMQ + Valkey) → bound at the composition root via the same port pattern.

**Deferred (FORESIGHT follow-ups — out of #350 acceptance):** idempotency interceptor + reaper on POST jobs; the real gRPC sidecar adapter + BullMQ/Valkey wiring; 5-sidecar implementation scope confirmation. See `ai/curaos/docs/adr/AUTO-DECISION-LOG.md` #350.

**Note on the in-process `Hl7FhirBridge`:** the heavy production parsers run in the `hl7-fhir` sidecar; this module does the deterministic envelope/segment mechanics the orchestrator needs (so the lifecycle is testable in CI with zero heavy deps). The CONTEXT pipeline above describes the full sidecar path.
