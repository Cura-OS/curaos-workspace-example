# ADR-0206 — Cluster: Fleet + Geospatial + Tracking + Site + Conversion + Integrations

**Status:** Accepted
**Date:** 2026-05-24
**Cluster:** Wave 1 Lite — Fleet + Geospatial + Tracking + Site + Conversion + Integrations
**Parent ADRs:**
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data Layer](0101-data-layer.md)
- [ADR-0102 Messaging](0102-event-messaging.md)
- [ADR-0103 API Gateway](0103-api-surface.md)
- [ADR-0104 Audit](0104-identity-auth.md)
- [ADR-0107 Observability](0107-observability.md)
- [ADR-0108 Secrets Management](0108-security-secrets.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 Auth + RBAC](0120-foundation-auth.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)

---

## 1. Context

### 1.1 What this cluster is

Ten services spanning physical-world primitives (geospatial, sites, fleet), personal location/activity tracking, format conversion, and external system integration. These services form the **physical-world and connectivity layer** of CuraOS: they anchor digital records to real locations, real assets, and real external systems.

All ten services are **neutral capabilities** — no vertical domain logic lives inside them. HealthStack, EducationStack, and ERP overlays consume them via events and APIs. Dependency direction: overlays → these neutral services. CI guards against reversal.

### 1.2 Ten services in scope

| Service | Tier | Purpose |
|---|---|---|
| `geospatial-core-service` | Neutral core | PostGIS-backed spatial primitives; geocoding; routing sidecars; tile serving |
| `personal-tracking-service` | Personal overlay | Individual location/activity logs; wearable/health-platform ingestion |
| `fleet-service` | Neutral core | Vehicle/asset/driver/route/maintenance management; FHIR EMS-aware |
| `site-core-service` | Neutral core | Physical-location primitives (address, geocode, capacity, amenities); FHIR Location interop |
| `business-site-service` | Business overlay | Multi-location B2B management (hospital networks, retail chains, franchise) |
| `personal-site-service` | Personal overlay | Individual property records (patient home, personal address) |
| `conversion-core-service` | Neutral core | Format-bridge primitives; sidecar pool (Tika/Pandoc/LibreOffice); HL7v2 ↔ FHIR bridge |
| `business-conversion-service` | Business overlay | B2B conversion workflows (PDF→editable, CSV→Excel, OCR, batch transforms) |
| `personal-conversion-service` | Personal overlay | Individual file-converter tooling (SaaS-class UX) |
| `integrations-service` | Neutral core | External system integration hub; iPaaS-class; per-tenant credential vault |

### 1.3 Dependency map

```
geospatial-core-service  ◀──  personal-tracking-service
                         ◀──  fleet-service
                         ◀──  site-core-service
                                    ◀──  business-site-service
                                    ◀──  personal-site-service

conversion-core-service  ◀──  business-conversion-service
                         ◀──  personal-conversion-service
                         ◀──  healthstack-interop-service (ADR-0115, HL7v2↔FHIR)

integrations-service     ◀──  business-automation-service (ADR-0204)
                         ◀──  any overlay needing external connector vault

fleet-service            ──▶  healthstack-ems-service (ADR-0115)
site-core-service        ──▶  healthstack-patient-service (ADR-0115)
geospatial-core-service  ──▶  healthstack-clinical-scheduling (ADR-0115)
```

Neutral cores do not import overlay modules. Overlays import core modules via typed NestJS module exports.

---

## 2. Decision summary

| Decision | Pick | Rationale |
|---|---|---|
| **Runtime** | NestJS (TS) per ADR-0100 | All 10 services |
| **Geospatial DB** | PostgreSQL 17 + PostGIS 3.5 | BSD license; sub-millisecond spatial index queries; native PG17 extension — no separate geo DB needed |
| **Geocoding sidecar** | Nominatim (BSD) on OSM data | Self-hosted; no external API dependency; airgap-safe; regionally extracted planet files via go-pmtiles |
| **Routing sidecar** | GraphHopper (Apache 2.0) primary; OSRM (BSD) secondary | GraphHopper: request-time custom profiles (vehicle type, avoid-toll, hazmat) essential for fleet; OSRM for high-throughput distance matrix where static profiles suffice |
| **Tile serving** | PMTiles + MapLibre GL JS | Single-file archive; HTTP range-request serving from object storage (no tile server process); MapLibre renders client-side |
| **Document conversion** | Apache Tika 2.x (Apache 2.0) + Pandoc 3.x (GPLv2, sidecar) + LibreOffice 24.x headless (LGPL, sidecar) | Tika: metadata extraction + text extraction from 1 000+ formats; Pandoc: Markdown/HTML/DOCX/RST round-trips; LibreOffice: ODF/DOCX/XLSX/PPTX → PDF and back. All run as isolated sidecar containers; main service calls via gRPC. |
| **Integration connector library** | Activepieces CE pieces (MIT) per ADR-0122 + custom NestJS connector plugins per ADR-0123 | 330+ prebuilt connectors (2025 count); custom pieces via TypeScript SDK; per ADR-0122/0123 plugin model |
| **Per-tenant credential vault** | OpenBao v2.x (MPL-2.0) per ADR-0108 | Namespaces GA in v2.3.1 (June 2025); per-tenant secret isolation without Enterprise license; dynamic secrets for short-lived credentials |
| **Spatial index type** | GIST (geometry) + BRIN (time-series tracks) | GIST for polygon/point containment; BRIN for append-only tracking time-series — both native PostGIS |
| **Messaging** | Kafka/NATS per ADR-0102; outbox pattern | All 10 services |
| **Data** | PG17 schema-per-tenant + Valkey per ADR-0101 | All 10 services |
| **Auth + RBAC** | Better Auth + Cerbos ABAC per ADR-0120 | All 10 services |
| **Audit** | Hash-chain PG per ADR-0104 | All 10 services |
| **Observability** | OTel + Grafana per ADR-0107 | All 10 services |
| **Modulith topology** | Runtime flag modulith vs microservice per ADR-0099 §5 | All 10 services |
| **Multi-tenant isolation** | Schema-per-tenant (SaaS) / namespace (enterprise) / cluster (on-prem) per ADR-0101 | All 10 services |

---

## 3. Per-service specification

### 3.1 `geospatial-core-service`

**Role:** Spatial primitive backbone for all geospatial-aware services. Owned by platform team. No vertical domain logic.

**Responsibilities:**
- Expose `GeospatialCoreModule` (NestJS module) imported by fleet, tracking, site, and HealthStack scheduling services.
- **Geocoding API**: address → coordinates and reverse. Nominatim sidecar (Kubernetes sidecar container or separate Deployment sharing OSM extract). Cache results in Valkey (TTL 7d) to reduce sidecar load.
- **Routing API**: origin + destination + vehicle profile → route (geometry, duration, distance, turn-by-turn). GraphHopper sidecar (Java process, K8s Deployment). Custom profiles: car, ambulance, bicycle, pedestrian, hazmat. OSRM sidecar for distance-matrix batch requests (fleet ETA grid).
- **Tile serving**: PMTiles file served from MinIO/S3. NestJS acts as thin proxy for HTTP range requests; no server-side tile rendering.
- **Spatial query API**: point-in-polygon (site boundary check), nearest-N (nearest facility, nearest driver), bounding-box search, route-corridor search — all via PostGIS functions exposed as tRPC procedures.
- **OSM data lifecycle**: nightly cron job pulls regional planet extracts (go-pmtiles extract), updates Nominatim and GraphHopper graph, rebuilds PMTiles archive. Alerting on stale data (>48h).

> **Resolution pin (ORM):** Prisma superseded by Drizzle for geospatial per [[curaos-orm-rule]] (AGENTS.md §13b). Module docs already reflect Drizzle; this ADR retains the original Prisma record for historical accuracy only.

**Key libraries:**
- `pg` + `@prisma/client` (PostGIS geometry types via raw SQL for spatial ops; Prisma for non-spatial models)
- `wkx` — WKB/WKT parse in Node
- `@turf/turf` — client-side and server-side geometry utilities (bearing, buffer, along, nearest-point)
- `axios` (Nominatim HTTP client, internal sidecar)
- `@nestjs/microservices` (Kafka/NATS)

**Sidecar containers:**
| Sidecar | Image | Role |
|---|---|---|
| `nominatim` | `mediagis/nominatim:4.x` | Geocoding; OSM extract loaded at startup |
| `graphhopper` | `graphhopper/graphhopper:latest` | Routing with custom profiles |
| `osrm-backend` | `ghcr.io/project-osrm/osrm-backend` | High-throughput distance matrix |

**API surface:**
- tRPC: `geocode`, `reverseGeocode`, `route`, `distanceMatrix`, `nearestFacilities`, `pointInSite`, `tileProxy`
- REST (APISIX public): `GET /geo/geocode`, `GET /geo/route`, `GET /geo/tiles/{z}/{x}/{y}`

**Events produced:** `geospatial.geocode.cache-miss`, `geospatial.osm-data.updated`, `geospatial.routing.failed`

**Codegen recipes (ADR-0123):**
- `geospatial-core:spatial-query` — scaffold a new PostGIS-backed spatial query procedure + Turfjs helper
- `geospatial-core:routing-profile` — scaffold a GraphHopper custom vehicle profile

---

### 3.2 `personal-tracking-service`

**Role:** Individual location and activity log. Privacy-first; data belongs to the user.

**Responsibilities:**
- Ingest location pings (mobile SDK, BLE beacon, manual check-in) and activity events (steps, routes, visits).
- Store time-series location records in PG with PostGIS point geometry + BRIN index on timestamp.
- BYO health-platform integrations: HealthKit (iOS) and Google Fit/Health Connect (Android) via `integrations-service` connector. OAuth tokens stored in OpenBao per-user namespace.
- Expose personal activity timeline API: daily routes, visit history, activity summary.
- Privacy controls: per-user data retention policy (default 90d rolling), explicit consent to share with org (e.g., home-care visits visible to assigned clinician with consent — Cerbos SpiceDB relationship).
- Geofence alerts: user configures entry/exit geofences → evaluated on ping ingestion → emit `tracking.geofence.entered` / `tracking.geofence.exited`.

**HealthStack tie-in:** `healthstack-patient-service` (ADR-0115) reads home-address geofences for home-care proximity alerts via event subscription. No direct DB coupling.

**Key libraries:** `@turf/turf` (geofence evaluation), `bullmq` (ping ingestion queue), `@nestjs/schedule` (retention purge cron)

**Events produced:** `tracking.location.pinged`, `tracking.geofence.entered`, `tracking.geofence.exited`, `tracking.activity.daily-summary`

**Privacy enforcement:** all tracking data rows are tagged `user_id`; Cerbos policy enforces user-owns-own-data. Tenant admin access requires explicit Cerbos relationship grant + audit log entry.

**Codegen recipes:** `personal-tracking:geofence` — scaffold a geofence definition + alert handler + personal dashboard card

---

### 3.3 `fleet-service`

**Role:** Vehicle/asset/driver/route/maintenance management. Neutral core; FHIR EMS-aware for HealthStack.

**Responsibilities:**
- **Asset registry**: vehicles (type, VIN, capacity, equipment), assets (medical devices on vehicles), drivers (license, certifications, availability), depots.
- **Route management**: planned routes (GraphHopper via `geospatial-core-service`), live route tracking (driver app location pings → `personal-tracking-service` events), ETA updates.
- **Dispatch**: assign vehicle + driver to mission; emit `fleet.dispatch.assigned`; receive status updates (`fleet.dispatch.en-route`, `fleet.dispatch.arrived`, `fleet.dispatch.completed`).
- **Maintenance**: maintenance schedule per vehicle (mileage/time triggers via `@nestjs/schedule`); work-order creation; maintenance history log.
- **HealthStack EMS integration**: `healthstack-ems-service` (ADR-0115) calls fleet-service dispatch API to request ambulance + crew for emergency mission. Fleet-service is authoritative for vehicle availability; EMS-service is authoritative for clinical mission data. Integration via tRPC + Kafka events, never shared DB.

**FHIR awareness:** fleet-service can export vehicle as FHIR `Device` resource and driver as FHIR `Practitioner` stub — consumed by healthstack-ems-service for FHIR Bundle assembly. Mapping via `conversion-core-service` HL7/FHIR bridge.

**Key libraries:**
- `geospatial-core-service` tRPC client (routing, distance matrix for ETA)
- `bullmq` (dispatch queue, maintenance cron)
- `@nestjs/event-emitter` (internal fleet state machine)

**API surface:**
- tRPC (internal): `dispatchVehicle`, `getVehicleETA`, `reportMaintenance`, `listAvailableVehicles`
- REST (APISIX, fleet ops console): CRUD for assets, drivers, routes; dispatch UI

**Events produced:** `fleet.vehicle.dispatched`, `fleet.vehicle.arrived`, `fleet.vehicle.maintenance-due`, `fleet.route.deviated`, `fleet.driver.availability-changed`

**Events consumed:** `tracking.location.pinged` (driver location → live ETA update), `healthstack.ems.mission.created` (dispatch trigger from EMS)

**Codegen recipes:** `fleet:vehicle-type` — scaffold a new vehicle-type profile + maintenance schedule + dispatch rule

---

### 3.4 `site-core-service`

**Role:** Physical-location primitives shared across all domains. Source of truth for addressable locations.

**Responsibilities:**
- **Site record**: name, address (structured), geocoordinate (PostGIS point), polygon boundary (PostGIS polygon), type (facility, office, residential, outdoor), capacity, amenities, operating hours, status (active/closed/under-construction).
- **Geocoding on create/update**: calls `geospatial-core-service` geocode API; stores result; caches in Valkey.
- **FHIR Location interop**: bidirectional mapping between site record and FHIR R4 `Location` resource. `healthstack-patient-service` and `healthstack-clinical-scheduling` consume site records via this mapping. Mapping executed by `conversion-core-service` FHIR bridge.
- **Hierarchy**: `partOf` relationship mirrors FHIR Location hierarchy — a clinic is part of a hospital campus, which is part of a health network. Arbitrary depth, stored as PG adjacency list + recursive CTE queries.
- **Spatial queries**: sites within bounding box, nearest N sites to point, sites containing point — delegated to `geospatial-core-service`.

**FHIR Location mode support:** `instance` (specific identifiable place) and `kind` (class of location, e.g., "any isolation room") per FHIR R4 spec — required for HealthStack scheduling workflows.

**Key libraries:** `@turf/turf`, `geospatial-core-service` tRPC client, `conversion-core-service` gRPC client (FHIR mapping)

**Events produced:** `site.created`, `site.updated`, `site.closed`, `site.geocode.resolved`

**Codegen recipes:** `site-core:site-type` — scaffold a new site type definition + FHIR Location mapping + spatial query

---

### 3.5 `business-site-service`

**Role:** B2B multi-location management overlay on `site-core-service`.

**Responsibilities:**
- Multi-location chain management: create/manage groups of sites under a single org tenant (hospital network, retail chain, franchise). Sites registered in `site-core-service`; business-site-service adds chain metadata (brand, operating standards, staff allocation, inventory allocation per location).
- **Inventory + staff per location**: references inventory-service and HR/org-service records scoped to site. No data duplication — foreign keys only.
- **Cross-location analytics**: occupancy trends, footfall estimates (from `personal-tracking-service` aggregate, anonymized, consent-gated), performance comparison across locations.
- **Admin UI**: CuraOS Builder App (ADR-0121b) — location map view (MapLibre GL JS + PMTiles from `geospatial-core-service`), location list, per-location drill-down dashboard.

**Events produced:** `business.site.location-added`, `business.site.chain-updated`, `business.site.location-closed`

**Events consumed:** `site.created` (to detect new sites belonging to org), `site.closed` (trigger chain-level alert)

**Codegen recipes:** `business-site:location-group` — scaffold a location-group + chain analytics page + map widget

---

### 3.6 `personal-site-service`

**Role:** Individual property records (personal tier).

**Responsibilities:**
- User's own address book / property list: home, work, frequently visited places. Sites registered in `site-core-service`; personal-site-service adds personal metadata (label, notes, visit frequency, access instructions).
- **HealthStack home-care integration**: `healthstack-patient-service` reads the patient's home site record (with patient consent) for home-visit scheduling. personal-site-service emits `personal.site.home-address-updated` → healthstack-patient-service updates its patient home-address cache.
- **Privacy**: personal site data is user-owned. No cross-user access. Tenant admin cannot read personal site data without explicit Cerbos consent relationship + audit entry.

**Events produced:** `personal.site.home-address-updated`, `personal.site.added`, `personal.site.removed`

**Codegen recipes:** `personal-site:place-type` — scaffold a personal place type + personal dashboard widget

---

### 3.7 `conversion-core-service`

**Role:** Format-bridge primitive library. Sidecar pool orchestrator. Source of truth for all format conversion logic.

**Responsibilities:**
- Orchestrate a pool of conversion sidecar containers. Main NestJS service receives conversion requests, routes to appropriate sidecar via gRPC, returns result.
- **Sidecar pool:**

| Sidecar | Image | Formats handled |
|---|---|---|
| `tika-server` | `apache/tika:2.x` | Metadata + text extraction from 1 000+ types (PDF, Office, images, archives) |
| `pandoc` | `pandoc/core:3.x` | Markdown ↔ DOCX ↔ HTML ↔ RST ↔ LaTeX; note: new XML-based DOCX only (not legacy .doc) |
| `libreoffice` | custom `libreoffice:24.x-headless` | ODF/DOCX/XLSX/PPTX → PDF; PDF → editable (via embedded OCR); heavyweight, pool size capped |

- **HL7v2 ↔ FHIR bridge** (critical for HealthStack): `healthstack-interop-service` (ADR-0115) delegates HL7v2 message parse + FHIR R4 Bundle assembly to this service. Implementation: `@smile-cdr/fhir-client` + `hl7-standard` npm packages + custom transform pipeline.
- **OCR**: Tesseract 5.x sidecar for image → text (receipt scanning, scanned docs).
- **Conversion job queue**: BullMQ queue; LibreOffice jobs isolated to single worker (LibreOffice not thread-safe; high memory per conversion — capped at 2 concurrent jobs per pod).
- **Result storage**: converted artifacts written to MinIO/S3 (ADR-0101 storage layer); job result carries presigned URL. No large binaries in PG.

**Key libraries:**
- `bullmq` (job queue for sidecar dispatch)
- `@grpc/grpc-js` (gRPC to sidecars)
- `@smile-cdr/fhir-client` (FHIR R4 resource handling)
- `hl7-standard` (HL7v2 parse)

**API surface:**
- tRPC (internal): `convertDocument`, `extractText`, `extractMetadata`, `convertHL7toFHIR`, `convertFHIRtoHL7`
- REST (APISIX, for UI upload flows): `POST /convert` (multipart)

**Events produced:** `conversion.job.completed`, `conversion.job.failed`, `conversion.sidecar.unhealthy`

**Resource limits (K8s):** LibreOffice pod: 2Gi RAM limit, max 2 replicas default. Tika pod: 512Mi RAM, auto-scaled. Pandoc pod: 256Mi RAM, auto-scaled.

**Codegen recipes:**
- `conversion-core:transform-pipeline` — scaffold a new format transform pipeline (input type → output type) + BullMQ job + sidecar gRPC stub
- `conversion-core:fhir-mapping` — scaffold a new FHIR resource mapping (source schema → FHIR resource type)

---

### 3.8 `business-conversion-service`

**Role:** B2B conversion workflow overlay on `conversion-core-service`.

**Pre-built conversion workflows (v1 — Temporal workflows via ADR-0122 Workflow Manager):**

| Workflow | Input | Output | Use case |
|---|---|---|---|
| `pdf-to-editable` | Scanned PDF | DOCX (editable) | Contract review, form digitization |
| `csv-to-excel-chart` | CSV data file | XLSX with pivot + chart | Finance/ops reporting |
| `batch-ocr` | ZIP of scanned images | ZIP of text files | Document archive digitization |
| `office-to-pdf-sign-ready` | DOCX/XLSX/PPTX | PDF/A | Pre-e-sign preparation |
| `hl7-fhir-batch` | HL7v2 message batch | FHIR Bundle JSON | HealthStack interop (re-exported from conversion-core) |
| `data-format-bridge` | Any tabular format (CSV/TSV/JSON/XLSX) | Target format | ETL pre-processing |

**Admin UI:** CuraOS Builder App — conversion job dashboard, batch upload, job history, output download. Progress streamed via SSE.

**Codegen recipes:** `business-conversion:workflow` — scaffold a new B2B conversion Temporal workflow + Builder UI page

---

### 3.9 `personal-conversion-service`

**Role:** Individual file-converter tooling (SaaS-class UX for end users).

**Pre-built conversion tools (v1):**

| Tool | Description |
|---|---|
| `pdf-to-word` | Personal PDF → DOCX conversion |
| `image-ocr` | Photo/scan → editable text |
| `audio-transcribe` | Audio file → text transcript (Whisper.cpp sidecar, MIT) |
| `video-to-audio` | Extract audio from video (FFmpeg sidecar, LGPL) |
| `document-format` | Convert between common document formats (Pandoc-backed) |
| `compress-pdf` | Reduce PDF file size (Ghostscript sidecar, AGPL — sidecar isolation contains license boundary) |

**UX:** drag-and-drop single file, progress bar, download link. Implemented as CuraOS Builder App page (ADR-0121b) with file upload widget. No account required for basic tools (rate-limited per IP via APISIX); enhanced limits for authenticated users.

**Storage policy:** converted output stored in per-user MinIO prefix; auto-deleted after 24h unless user saves explicitly.

**Codegen recipes:** `personal-conversion:tool` — scaffold a personal conversion tool + Builder page + storage policy

---

### 3.10 `integrations-service`

**Role:** External system integration hub. iPaaS-class connector runtime. Per-tenant credential vault.

**Responsibilities:**
- **Connector runtime**: host Activepieces CE pieces (330+ connectors, 2025 count) as the system-of-record for external integrations. NestJS integration plugins (ADR-0123) wrap pieces into domain-aware connectors.
- **Per-tenant credential vault**: OpenBao v2.x namespaces (GA v2.3.1, June 2025, Linux Foundation governance). Each org tenant gets an isolated OpenBao namespace. Dynamic secrets for short-lived DB/API credentials. Integration tokens (OAuth, API key, webhook secret) stored as KV v2 secrets.
- **OAuth flow management**: server-side OAuth 2.0 PKCE flows for 3rd-party SaaS (Salesforce, HubSpot, Google Workspace, Microsoft 365, etc.). Tokens stored in OpenBao; rotation handled by integrations-service background job.
- **Webhook registry**: receive inbound webhooks from external systems; validate signature; emit typed Kafka event. APISIX terminates TLS; integrations-service handles payload routing per tenant.
- **Connection health monitoring**: scheduled ping per configured connection; emit `integrations.connection.healthy` / `integrations.connection.failed`; BullMQ retry with exponential backoff.
- **Plugin registry**: tenant can install signed custom connector plugins (OCI artifacts from Harbor per ADR-0123). Plugin sandbox: each plugin runs in isolated Worker thread (Node.js `worker_threads`); resource limits enforced.
- **Rate-limit proxy**: outbound calls to external APIs are rate-limited per-tenant per-connector (token bucket in Valkey) to avoid external API quota exhaustion.

**Key libraries:**
- Activepieces CE SDK (`@activepieces/pieces-framework`, MIT) — connector development kit
- `openid-client` (OAuth 2.0 / OIDC flows)
- `@nestjs/bull` + `bullmq` (connection health + token refresh queues)
- `node-vault` (OpenBao HTTP API client — API-compatible with Vault)
- `@nestjs/microservices` (Kafka/NATS)

**API surface:**
- tRPC (internal): `listConnectors`, `configureConnection`, `testConnection`, `getCredential`, `registerWebhook`
- REST (APISIX public): `POST /webhooks/{tenant}/{connector}` (inbound webhook ingress)
- Admin UI: CuraOS Builder App — connector library, connection status board, OAuth connect flow, credential audit log

**Events produced:** `integrations.connection.configured`, `integrations.connection.healthy`, `integrations.connection.failed`, `integrations.webhook.received`, `integrations.credential.rotated`

**Events consumed:** none as primary consumer; integrations-service is the leaf that other services call, not an event-driven reactor.

**Security posture:**
- All credentials transit encrypted (TLS 1.3 in-cluster via cert-manager).
- OpenBao audit log enabled; every credential read emits audit event (ADR-0104 hash-chain).
- Plugin sandbox: Worker thread isolation; no filesystem access; network calls only to allowlisted domains per connector manifest.
- Outbound requests via egress proxy (Squid/Envoy sidecar) for audit trail.

**Codegen recipes (ADR-0123):**
- `integrations:connector` — scaffold a new Activepieces piece with trigger + actions + OpenBao credential schema + connection test
- `integrations:webhook-handler` — scaffold an inbound webhook handler + Kafka event emitter + HMAC signature verification

---

## 4. Cross-service architecture

### 4.1 HealthStack integration points

| CuraOS neutral service | HealthStack overlay | Integration mechanism |
|---|---|---|
| `fleet-service` | `healthstack-ems-service` | tRPC dispatch API + Kafka events (`fleet.vehicle.dispatched`, `healthstack.ems.mission.created`) |
| `geospatial-core-service` | `healthstack-clinical-scheduling` | tRPC routing API (provider address → patient home routing for home-visit scheduling) |
| `site-core-service` | `healthstack-patient-service` | tRPC site lookup + `site.created` Kafka event; FHIR Location export via `conversion-core-service` |
| `conversion-core-service` | `healthstack-interop-service` | tRPC `convertHL7toFHIR` / `convertFHIRtoHL7`; batch HL7v2 ingest pipeline |
| `personal-site-service` | `healthstack-patient-service` | `personal.site.home-address-updated` Kafka event → patient home-address cache refresh |

**PHI boundary:** HealthStack overlays own PHI. Neutral services hold only references (patient_id, site_id) + non-PHI metadata. Geospatial coordinates of patient home are stored in `personal-site-service` (personal tier, user-owned), not in `geospatial-core-service` shared tables.

### 4.2 Shared event topology (selected)

```
[mobile SDK / BLE beacon]
         │ location ping
         ▼
personal-tracking-service  ──▶  tracking.location.pinged  ──▶  fleet-service (driver ETA)
                                                           ──▶  site-core-service (geofence eval)
                                                           ──▶  healthstack-patient-service (home-care proximity)

[external system webhook]
         │
         ▼
integrations-service  ──▶  integrations.webhook.received  ──▶  business-automation-service
                      ──▶  typed domain event              ──▶  any subscribed service

[document upload]
         │
         ▼
conversion-core-service (BullMQ job)
         │ result presigned URL
         ▼
conversion.job.completed  ──▶  business-conversion-service / personal-conversion-service
                          ──▶  healthstack-interop-service (HL7v2 result)
```

### 4.3 Sidecar lifecycle

All conversion and geo sidecars follow the same operational contract:
- **Health probe**: `/health` HTTP endpoint; NestJS checks before dispatching job.
- **Graceful drain**: SIGTERM → finish in-flight job → exit. NestJS queues pause on sidecar unhealthy signal.
- **Resource quotas**: enforced at K8s pod level (see §3.7 LibreOffice caps).
- **Restart policy**: `OnFailure` with exponential backoff; alert on >3 restarts/hour.
- **Data locality**: sidecars share an emptyDir volume with main service pod for large file transfer (avoids gRPC payload limits for binary blobs).

### 4.4 OSM data and routing graph lifecycle

```
Cron (nightly) → go-pmtiles extract (regional planet)
                      │
                      ├──▶ Nominatim: reimport OSM data (warm standby swap)
                      ├──▶ GraphHopper: rebuild routing graph (blue/green swap)
                      ├──▶ OSRM: preprocess graph (replace pod)
                      └──▶ PMTiles archive: upload to MinIO → CloudFront/CDN invalidation
```

Staleness alert: `geospatial.osm-data.stale` event if rebuild not confirmed within 48h window.

---

## 5. Non-functional requirements

### 5.1 Performance targets

| Operation | P95 target | Mechanism |
|---|---|---|
| Geocode (cached) | < 20ms | Valkey TTL cache |
| Geocode (uncached) | < 500ms | Nominatim sidecar warm |
| Route (car, <200km) | < 300ms | GraphHopper pre-loaded graph |
| Distance matrix (100×100) | < 2s | OSRM batch endpoint |
| Spatial point-in-polygon | < 50ms | PostGIS GIST index |
| Document convert (< 5MB DOCX→PDF) | < 10s | LibreOffice sidecar, BullMQ |
| Webhook ingest → Kafka publish | < 100ms | APISIX → integrations-service → Kafka |
| Credential read (OpenBao) | < 30ms | OpenBao in-cluster, Valkey lease cache |

### 5.2 Scale model

- **Geospatial / tracking**: PostGIS partitioned by tenant + time range (monthly partitions for tracking). BRIN index on `recorded_at` column.
- **Conversion**: horizontal scale of Tika + Pandoc sidecars; LibreOffice capped (memory). BullMQ concurrency per pod configurable per environment.
- **Integrations**: stateless NestJS pods; state in PG (connection config) + OpenBao (credentials) + Valkey (rate-limit bucket). Scale by pod count.

### 5.3 Privacy and data residency

- **personal-tracking-service**: location data never leaves tenant's PG schema. Aggregate analytics (anonymized) only with explicit org consent model. Retention cron enforced.
- **personal-site-service**: home address stored per-user, never in shared tables.
- **integrations-service**: OAuth tokens + API keys stored exclusively in OpenBao per-tenant namespace. Never logged. Audit log records access events only (credential read, who, when, which connector), not credential values.

---

## 6. Licence summary

| Component | Licence | Use |
|---|---|---|
| PostGIS | BSD | Linked into PostgreSQL 17 — no restriction |
| GraphHopper | Apache 2.0 | Sidecar deployment — no restriction |
| OSRM | BSD | Sidecar deployment — no restriction |
| Nominatim | GPL v2 (sidecar) | Isolated sidecar; no GPL propagation to NestJS service |
| OpenStreetMap data | ODbL | Attribution required in UI tile layer |
| PMTiles / Protomaps | BSD | No restriction |
| MapLibre GL JS | BSD | Front-end, no restriction |
| Apache Tika | Apache 2.0 | Sidecar — no restriction |
| Pandoc | GPL v2 (sidecar) | Isolated sidecar; GPL does not propagate to calling service via gRPC boundary |
| LibreOffice | LGPL v3 (sidecar) | Isolated sidecar; LGPL satisfied by dynamic linking within sidecar image |
| Ghostscript | AGPL v3 (sidecar) | Isolated sidecar — AGPL network-service clause does NOT require source disclosure of calling service when sidecar is separately deployed and only called via network RPC |
| Whisper.cpp | MIT | Sidecar — no restriction |
| FFmpeg | LGPL v2.1 | Sidecar — no restriction |
| Activepieces CE | MIT | No restriction |
| OpenBao | MPL-2.0 | File-level copyleft; does not propagate through HTTP API boundary |
| Tesseract | Apache 2.0 | Sidecar — no restriction |

**Sidecar isolation principle:** GPL/AGPL/LGPL components run exclusively in separate containers, communicating over gRPC or HTTP. This network boundary prevents licence propagation to the NestJS service codebase. Legal review confirmed for Nominatim, Pandoc, Ghostscript before production deployment.

---

## 7. Codegen recipes summary (ADR-0123)

| Recipe key | Service | Scaffolds |
|---|---|---|
| `geospatial-core:spatial-query` | geospatial-core-service | PostGIS query + tRPC procedure + Turf helper |
| `geospatial-core:routing-profile` | geospatial-core-service | GraphHopper custom vehicle profile YAML |
| `personal-tracking:geofence` | personal-tracking-service | Geofence definition + alert handler + dashboard card |
| `fleet:vehicle-type` | fleet-service | Vehicle-type profile + maintenance schedule + dispatch rule |
| `site-core:site-type` | site-core-service | Site type + FHIR Location mapping + spatial query |
| `business-site:location-group` | business-site-service | Location group + analytics page + map widget |
| `personal-site:place-type` | personal-site-service | Personal place type + dashboard widget |
| `conversion-core:transform-pipeline` | conversion-core-service | Format transform + BullMQ job + sidecar gRPC stub |
| `conversion-core:fhir-mapping` | conversion-core-service | FHIR resource mapping pipeline |
| `business-conversion:workflow` | business-conversion-service | Temporal conversion workflow + Builder UI page |
| `personal-conversion:tool` | personal-conversion-service | Personal conversion tool + Builder page + storage policy |
| `integrations:connector` | integrations-service | Activepieces piece + OpenBao credential schema + connection test |
| `integrations:webhook-handler` | integrations-service | Inbound webhook handler + Kafka emitter + HMAC verification |

---

## 8. Open questions / deferred decisions

| # | Question | Blocker / owner |
|---|---|---|
| 8.1 | GraphHopper vs Valhalla for multi-modal routing (transit + walk + bike combined) — Valhalla supports transit; GraphHopper requires custom extension | Evaluate if transit overlay required in HealthStack scheduling |
| 8.2 | LibreOffice pod cold-start latency (~10s) — pre-warm pool (always-on pod) vs on-demand (cost vs latency tradeoff) | Business-conversion SLA definition |
| 8.3 | Nominatim regional extract granularity — full planet (~60GB) vs continental vs national. Impacts disk + rebuild time | Deployment region definition at tenant onboarding |
| 8.4 | Activepieces piece sandboxing model — Worker thread (chosen) vs separate process vs WASM sandbox — revisit if plugin security audit raises concerns | Security review of custom tenant pieces |
| 8.5 | OpenBao HA topology — single cluster with namespace isolation vs per-tenant-cluster (for regulated enterprises) | Enterprise on-prem customer requirements |

---

## 9. Definition of Done

A service in this cluster is **done** when:
1. NestJS module exports are stable; consuming overlays import without modification.
2. All sidecar images pinned to digest-locked versions in Helm chart.
3. Codegen recipes registered in ADR-0123 recipe registry and smoke-tested.
4. PostGIS migrations versioned; spatial indexes confirmed via `EXPLAIN ANALYZE`.
5. HealthStack integration events flowing end-to-end in staging (fleet ↔ EMS, site ↔ patient, conversion ↔ interop).
6. OpenBao namespace provisioning automated in tenant-onboarding workflow (fleet-service, integrations-service).
7. OSM data lifecycle cron tested with staleness alert firing.
8. LibreOffice + Pandoc + Tika licence review completed and documented.
9. OTel traces visible per-service in Grafana; P95 targets verified under synthetic load.
10. Cerbos policies deployed for all personal-tier services; cross-user access blocked in integration tests.
