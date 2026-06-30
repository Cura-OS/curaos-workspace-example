# ADR-0153 — Codegen Recipe Coverage (resolves ADR-0151 F-003)

**Status:** Accepted
**Date:** 2026-05-24
**Parent ADRs:** [ADR-0123 Codegen + Plugin](0123-foundation-codegen-plugin.md), [ADR-0151 Cross-Cluster Coherence](0151-cross-cluster-coherence.md)
**Resolves:** ADR-0151 F-003 (Major) — "Codegen recipes incomplete for foundation products"
**Amends:** ADR-0123 §4 Phase 1 recipe list

---

## Status / Date / Parent

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-24 |
| **Author** | Platform architecture team |
| **Parent** | ADR-0123 (Codegen Platform), ADR-0151 (Coherence Scan) |
| **Amends** | ADR-0123 §4 Phase 1 recipe list (16 → 57 recipes) |
| **Resolves** | ADR-0151 F-003: Codegen recipes incomplete for foundation products |

---

## Executive Summary

ADR-0123 locked 16 Phase 1 cookbook recipes. ADR-0151 F-003 found that those 16 are insufficient: foundation products (Auth, Builder, Sites, Apps, Widgets, Workflow Canvas, Forms, Workflow Manager) need recipes for their own scaffolding, and downstream cluster services (ADR-0200 through ADR-0209) need recipes for generation at Wave 1 scale.

This ADR inventories **57 recipes** across 12 domains:

| Priority | Count | Purpose |
|---|---|---|
| **P0 — foundation v1 must-have** | 30 | Foundation products self-scaffold + emit targets |
| **P1 — Wave 1 cluster cookbook** | 17 | Cluster service generation (ADR-0200 through ADR-0209) |
| **P2 — community-extensible** | 10 | Post-v1 language/framework extensions |
| **Total** | **57** | Full Phase 1 inventory |

Key clarification from F-003: **foundation products are both users AND exemplars of codegen.** Auth, Builder, Workflow Manager, Codegen itself are hand-scaffolded using recipes at project bootstrap, then become the golden exemplars from which recipes evolve. The 16 recipes in ADR-0123 §4 were output targets (what recipes emit), not the full set of recipes needed to scaffold the foundations themselves.

Coverage gaps closed:

- Auth product scaffold recipe (was missing)
- Builder product sub-recipes (Sites Build Service, Apps Build Service, Widgets Build Service)
- All canvas → compile-target emit recipes (from ADR-0121d)
- Form engine emit recipes (from ADR-0121e)
- Shared library scaffold recipe (from ADR-0209)
- React Native package recipe (from ADR-0209)
- HealthStack-specific recipes (FHIR service, SMART app, CDS hook)
- TypeSpec-first API spec recipe (replaces OpenAPI-decorator approach at cluster scale)
- Atlas migration recipe (required by every cluster service per ADR-0101)

---

## Recipe Inventory by Domain

### 1. Backend Service Recipes

#### `backend.nestjs-service` — P0

**Purpose:** Scaffold a full NestJS modulith service with mandatory harness libraries, Fastify adapter, per-tenant DB schema wiring, and baseline auth/audit/observability integration.

**Inputs:**
```yaml
name: string          # kebab-case service name
domain: string        # domain namespace (e.g., "identity", "notify")
cluster: string       # target cluster ADR (e.g., "ADR-0200")
entities: Entity[]    # list of domain entities with fields + types
events_produced: EventSpec[]
events_consumed: EventSpec[]
apis: ApiSpec[]       # REST + GraphQL + gRPC surface declarations
```

**Outputs:**
```
src/
  {name}.module.ts.gen.ts
  {name}.controller.ts.gen.ts
  {name}.service.ts.gen.ts
  {name}.repository.ts.gen.ts
  dto/
    create-{entity}.dto.ts.gen.ts
    update-{entity}.dto.ts.gen.ts
  interceptors/
    audit.interceptor.ts.gen.ts
    tenant.interceptor.ts.gen.ts
  guards/
    jwt-auth.guard.ts.gen.ts
    cerbos-abac.guard.ts.gen.ts
persistence/schema.ts.gen.ts
test/
  {name}.service.spec.ts.gen.ts
  {name}.controller.spec.ts.gen.ts
```

**Dependencies:** `@curaos/core`, `@curaos/auth-sdk`, `@curaos/audit-sdk`, `@curaos/tenancy`, `@curaos/events`, `@curaos/observability`, `@curaos/policy`, `@curaos/secrets`

**Template engine:** Nunjucks (default)

**Target ADR:** ADR-0200, ADR-0201, ADR-0202, ADR-0203, ADR-0204, ADR-0205, ADR-0206, ADR-0209

**Cross-recipe composition:** Imports `data.drizzle-schema`, `api.typespec-base`, `tests.vitest-nestjs`, `events.nestjs-kafka-producer-consumer`, `interceptor.nestjs-audit`, `interceptor.nestjs-tenant-router`

---

#### `backend.nestjs-microservice-sidecar` — P0

**Purpose:** Scaffold a NestJS microservice that connects as a NATS transport sidecar to a parent service (plugin Layer 1 per ADR-0123 §5.1).

**Inputs:**
```yaml
name: string
parent_service: string
transport: nats | grpc | unix-socket
subject_prefix: string    # NATS subject namespace
```

**Outputs:**
```
src/
  {name}-sidecar.module.ts.gen.ts
  {name}-sidecar.main.ts.gen.ts
  handlers/
    {handler}.handler.ts.gen.ts
k8s/
  limitrange.yaml.gen.ts    # K8s resource quotas
```

**Dependencies:** `@nestjs/microservices`, `nats`, `@curaos/plugin-runtime`

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 (plugin Layer 1), ADR-0208 (HAPI FHIR sidecar adapter)

**Cross-recipe composition:** Imported by `plugin.nestjs-sidecar`

---

#### `backend.nestjs-graphql-resolver` — P0

**Purpose:** Scaffold a NestJS GraphQL resolver module with Apollo federation awareness and typed DTO generation.

**Inputs:**
```yaml
name: string
entity: Entity
federation_key: string    # @key directive field
queries: Query[]
mutations: Mutation[]
subscriptions: Subscription[]
```

**Outputs:**
```
src/graphql/
  {entity}.resolver.ts.gen.ts
  {entity}.type.ts.gen.ts
  {entity}.input.ts.gen.ts
schema.gql.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0103 (GraphQL API surface), ADR-0200 (identity GraphQL), ADR-0201 (shared services)

**Cross-recipe composition:** Imported by `backend.nestjs-service` when `apis` includes GraphQL

---

#### `backend.nestjs-event-consumer` — P0

**Purpose:** Scaffold a NestJS Kafka/NATS event consumer module with DLQ, retry, and outbox pattern wiring.

**Inputs:**
```yaml
name: string
topics: Topic[]
transport: kafka | nats
dlq_topic: string
retry_policy: RetryPolicy
```

**Outputs:**
```
src/consumers/
  {topic}.consumer.ts.gen.ts
  {topic}.dlq-handler.ts.gen.ts
src/outbox/
  outbox.entity.ts.gen.ts
  outbox.processor.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0102 (events), all cluster ADRs

**Cross-recipe composition:** Imported by `events.nestjs-kafka-producer-consumer`, `events.nestjs-nats-jetstream`

---

### 2. Frontend Recipes

#### `ui.react-next-page` — P0

**Purpose:** Scaffold a React + Next 15 App Router page with tenant-aware layout, auth guard, OTel tracing, and i18n wiring.

**Inputs:**
```yaml
name: string
route: string           # Next App Router path
auth_required: boolean
roles: string[]
layout: admin | public | auth
```

**Outputs:**
```
app/{route}/
  page.tsx.gen.ts
  layout.tsx.gen.ts
  loading.tsx.gen.ts
  error.tsx.gen.ts
components/
  {name}-page.tsx.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120 (Auth admin UI), ADR-0121 (Builder IDE), ADR-0122 (Workflow Manager UI)

---

#### `ui.react-next-admin-shell` — P0

**Purpose:** Scaffold a full React + Next 15 admin shell application with sidebar navigation, tenant switcher, auth-gated routes, and `@curaos/ui` theming. Used as the entry point for each foundation product's admin UI.

**Inputs:**
```yaml
product_name: string    # e.g., "curaos-auth", "curaos-builder"
nav_items: NavItem[]
tenant_switcher: boolean
```

**Outputs:**
```
app/
  layout.tsx.gen.ts
  page.tsx.gen.ts
  (auth)/
    login/page.tsx.gen.ts
  (tenant)/
    layout.tsx.gen.ts
components/
  sidebar.tsx.gen.ts
  tenant-switcher.tsx.gen.ts
  top-nav.tsx.gen.ts
lib/
  auth-client.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120 (Auth admin), ADR-0121 (Builder IDE shell), ADR-0122 (Workflow admin)

**Cross-recipe composition:** Imports `ui.react-next-page`

---

#### `ui.react-native-screen` — P0

**Purpose:** Scaffold a React Native + Expo screen with Expo Router file-based routing, offline sync hooks, and `@curaos/ui/native` theming.

**Inputs:**
```yaml
name: string
route: string           # Expo Router path
offline_capable: boolean
auth_required: boolean
```

**Outputs:**
```
app/{route}.tsx.gen.ts
components/
  {name}-screen.tsx.gen.ts
hooks/
  use-{name}-data.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0209 (React Native package migration), ADR-0121c (Widgets React target)

---

#### `ui.lit-widget` — P0

**Purpose:** Scaffold a Lit Web Component widget with iframe isolation, postMessage typed API, tenant JWT handshake, and cosign-ready bundle output.

**Inputs:**
```yaml
name: string            # kebab-case component name
isolation: iframe | shadow-dom
phi_safe: boolean       # if true, forces iframe + strict CSP
fhir_scopes: string[]  # SMART-on-FHIR scopes if HealthStack widget
```

**Outputs:**
```
src/
  {name}.ts.gen.ts          # LitElement class
  {name}.styles.ts.gen.ts
  postmessage/
    schema.ts.gen.ts         # Zod-validated message types
    handshake.ts.gen.ts
vite.config.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121c (Widgets), ADR-0121e (Forms Lit render target)

**Cross-recipe composition:** Imported by `widget.lit`, `widget.healthstack-fhir`

---

#### `ui.astro-page` — P0

**Purpose:** Scaffold an Astro 5 page/layout for CuraOS Sites SSR output. Includes Lit Web Component island hydration and i18n wiring.

**Inputs:**
```yaml
name: string
route: string
island_components: string[]
ssr: boolean
```

**Outputs:**
```
src/pages/{route}.astro.gen.ts
src/layouts/{name}-layout.astro.gen.ts
src/components/{name}.astro.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121a (Sites Astro publish target)

---

#### `ui.curaos-ui-component` — P1

**Purpose:** Scaffold a reusable `@curaos/ui` component with dual export (React web + React Native), Storybook story, and Style Dictionary theming tokens.

**Inputs:**
```yaml
name: string
targets: [web, native, both]
variant_props: VariantProp[]
```

**Outputs:**
```
src/components/{name}/
  index.tsx.gen.ts
  {name}.web.tsx.gen.ts
  {name}.native.tsx.gen.ts
  {name}.stories.tsx.gen.ts
  {name}.test.tsx.gen.ts
tokens/
  {name}.tokens.json.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0209 (`@curaos/ui` design system)

---

### 3. Data Recipes

#### `data.drizzle-schema-from-typespec` — P0

**Purpose:** Generate Drizzle schema from a TypeSpec model definition. Enforces per-tenant schema prefix, PHI field tagging, and drizzle-kit migration compatibility.

**Inputs:**
```yaml
typespec_file: path
tenant_schema_prefix: string    # default: "tenant_{id}"
phi_fields: string[]            # fields to tag as @phi in migration metadata
```

**Outputs:**
```
persistence/
  schema.ts.gen.ts
  migrations/
    _migration_seed.sql.gen.ts  # Atlas baseline
```

**Template engine:** Handlebars (structured schema generation)

**Target ADR:** ADR-0101 (data layer), all cluster ADRs

**Cross-recipe composition:** Imports `data.atlas-migration`; imported by `backend.nestjs-service`

---

#### `data.atlas-migration` — P0

**Purpose:** Scaffold Atlas HCL migration workflow for a service schema. Generates Atlas project config, lint policy (phi-field check), and CI migration step.

**Inputs:**
```yaml
service_name: string
db_url_env: string
schema_name: string
```

**Outputs:**
```
atlas.hcl.gen.ts
atlas/
  lint.hcl.gen.ts
.github/workflows/
  atlas-migrate.yml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0101 (Atlas migrations), ADR-0110 (CI)

---

#### `data.sqlc-go-binding` — P1

**Purpose:** Scaffold SQLC config + typed Go database bindings for specialist-tier services (where Go performance is required).

**Inputs:**
```yaml
service_name: string
queries_dir: path
schema_file: path
```

**Outputs:**
```
sqlc.yaml.gen.ts
db/
  query.sql.gen.ts
  models.go.gen.ts     # generated by sqlc at action time
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §4 (`data.sqlc` — existing, this is the detailed recipe spec)

---

### 4. API Spec Recipes

#### `api.typespec-base` — P0

**Purpose:** Scaffold a TypeSpec service definition with CuraOS conventions: tenant-scoped operations, standard error types, pagination, APISIX gateway route annotations, and Apicurio schema registry export.

**Inputs:**
```yaml
service_name: string
namespace: string
resources: Resource[]
operations: Operation[]
auth_scheme: bearer | api-key | oidc
```

**Outputs:**
```
typespec/
  main.tsp.gen.ts
  models.tsp.gen.ts
  operations.tsp.gen.ts
  decorators.tsp.gen.ts
tspconfig.yaml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0103 (API surface), all cluster ADRs

**Cross-recipe composition:** Imported by `backend.nestjs-service`, `api.openapi-export`, `api.protobuf-export`, `api.graphql-sdl-export`

---

#### `api.typespec-fhir-resource` — P0

**Purpose:** Scaffold a TypeSpec definition for a FHIR R4 resource wrapper — extends `api.typespec-base` with FHIR resource typing, SMART-on-FHIR scope annotations, and HAPI FHIR endpoint mapping.

**Inputs:**
```yaml
fhir_resource: string      # e.g., "Patient", "Observation"
fhir_version: r4 | r5
smart_scopes: string[]
```

**Outputs:**
```
typespec/
  fhir/{resource}.tsp.gen.ts
  fhir/smart-scopes.tsp.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0115 (HealthStack), ADR-0208 (clinical cluster)

**Cross-recipe composition:** Imports `api.typespec-base`; imported by `healthstack.fhir-resource-controller`

---

#### `api.openapi-export` — P0

**Purpose:** Post-generation action recipe that runs `typespec compile` and emits an OpenAPI 3.1 YAML file registered in Apicurio Schema Registry.

**Inputs:**
```yaml
typespec_dir: path
output_path: path
apicurio_group_id: string
```

**Outputs:**
```
openapi/
  {service-name}.openapi.yaml.gen.ts
```

**Template engine:** EJS (thin wrapper; mostly action hooks)

**Target ADR:** ADR-0103, ADR-0123

---

#### `api.protobuf-export` — P1

**Purpose:** Emit Protobuf 3 / Connect-RPC `.proto` file from TypeSpec definition for gRPC surfaces.

**Inputs:** TypeSpec file path, package namespace.

**Outputs:** `proto/{service}.proto.gen.ts`

**Template engine:** Nunjucks

**Target ADR:** ADR-0103 (Connect-RPC)

---

#### `api.graphql-sdl-export` — P1

**Purpose:** Emit GraphQL SDL schema from TypeSpec for Cosmo federation supergraph registration.

**Inputs:** TypeSpec file path, federation subgraph name.

**Outputs:** `schema.graphql.gen.ts`

**Template engine:** Nunjucks

**Target ADR:** ADR-0103 (GraphQL)

---

### 5. Event Recipes

#### `events.nestjs-kafka-producer-consumer` — P0

**Purpose:** Scaffold NestJS Kafka producer + consumer module with outbox pattern, DLQ, retry, and AsyncAPI 3 schema. Replaces ADR-0123 `events.nestjs-kafka` with full outbox wiring.

**Inputs:**
```yaml
service_name: string
topics_produced: TopicDef[]
topics_consumed: TopicDef[]
dlq_suffix: string    # default: ".dlq"
retry_policy: RetryPolicy
```

**Outputs:**
```
src/
  kafka/
    {service}.producer.ts.gen.ts
    {topic}.consumer.ts.gen.ts
    {topic}.dlq-handler.ts.gen.ts
  outbox/
    outbox.entity.ts.gen.ts
    outbox.processor.ts.gen.ts
asyncapi/
  {service}.asyncapi.yaml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0102, all cluster ADRs

**Cross-recipe composition:** Imports `events.outbox-prisma`, `events.asyncapi-export`

---

#### `events.nestjs-nats-jetstream` — P0

**Purpose:** Scaffold NATS JetStream producer + subscriber NestJS module for low-latency intra-cluster fan-out (replaces ADR-0123 `events.nestjs-nats`).

**Inputs:**
```yaml
service_name: string
streams: StreamDef[]
subjects: SubjectDef[]
consumer_groups: string[]
```

**Outputs:**
```
src/nats/
  jetstream.module.ts.gen.ts
  {subject}.publisher.ts.gen.ts
  {subject}.subscriber.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0102

---

#### `events.outbox-prisma` — P0

**Purpose:** Scaffold Prisma outbox table + processor for guaranteed at-least-once event delivery from NestJS service.

**Inputs:**
```yaml
service_name: string
outbox_table_name: string    # default: "outbox_events"
poll_interval_ms: number
```

**Outputs:**
```
prisma/outbox.prisma.gen.ts      # appended to existing schema
src/outbox/
  outbox.entity.ts.gen.ts
  outbox.processor.service.ts.gen.ts
  outbox.module.ts.gen.ts
```

**Template engine:** Handlebars

**Target ADR:** ADR-0102 (outbox pattern)

**Cross-recipe composition:** Imported by `events.nestjs-kafka-producer-consumer`

---

#### `events.asyncapi-export` — P0

**Purpose:** Emit AsyncAPI 3.0 spec from event topic declarations and register in Apicurio Schema Registry. Supersedes ADR-0123 `api.asyncapi`.

**Inputs:**
```yaml
service_name: string
topics: TopicDef[]
apicurio_group_id: string
```

**Outputs:**
```
asyncapi/
  {service-name}.asyncapi.yaml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0102, ADR-0103

---

### 6. Workflow Recipes

#### `workflow.temporal-ts-workflow` — P0

**Purpose:** Scaffold a Temporal TypeScript SDK workflow with per-tenant task queue routing, determinism guards, `continueAsNew` helper, and OTel span wiring. Supersedes ADR-0123 `workflow.temporal-ts`.

**Inputs:**
```yaml
name: string
activities: ActivityDef[]
timers: TimerDef[]
saga_compensations: CompensationDef[]
queue_prefix: string    # default: "t-{tenant_id}-{service}"
```

**Outputs:**
```
src/temporal/
  workflows/
    {name}.workflow.ts.gen.ts
  activities/
    {activity}.activity.ts.gen.ts
  worker/
    {name}.worker.ts.gen.ts
  shared/
    continue-as-new.helper.ts.gen.ts
    otel.interceptor.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0122 (Workflow Manager)

---

#### `workflow.temporal-ts-activity` — P0

**Purpose:** Scaffold a standalone Temporal activity with retry policy, idempotency key, and PHI-access audit hook.

**Inputs:**
```yaml
name: string
phi_access: boolean
retry_policy: RetryPolicy
idempotency_key_field: string
```

**Outputs:**
```
src/temporal/activities/
  {name}.activity.ts.gen.ts
  {name}.activity.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0122, ADR-0208 (clinical workflows)

---

#### `workflow.activepieces-flow` — P0

**Purpose:** Scaffold an Activepieces flow JSON + custom-piece skeleton for tenant DIY automation. From ADR-0123.

**Inputs:**
```yaml
name: string
trigger: TriggerDef
steps: StepDef[]
custom_pieces: PieceDef[]
```

**Outputs:**
```
flows/
  {name}.flow.json.gen.ts
pieces/
  {piece-name}/
    index.ts.gen.ts
    actions/
      {action}.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0122

---

#### `workflow.nestjs-cron` — P0

**Purpose:** Scaffold a `@nestjs/schedule` + Jobrunr cron job with per-tenant execution isolation, observability, and audit.

**Inputs:**
```yaml
name: string
cron_expression: string
tenant_scoped: boolean
```

**Outputs:**
```
src/jobs/
  {name}.job.ts.gen.ts
  {name}.job.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0122, ADR-0102

---

#### `workflow.canvas-ir-to-temporal` — P0

**Purpose:** Compile CuraOS Canvas IR (JSON) to Temporal TS workflow code via Codegen action hook. The emit target recipe invoked by Workflow Canvas compile.

**Inputs:**
```yaml
canvas_ir: CanvasIR       # JSON schema per ADR-0121d
output_dir: path
tenant_id: string
```

**Outputs:** Full `workflow.temporal-ts-workflow` + `workflow.temporal-ts-activity` tree.

**Template engine:** Nunjucks

**Target ADR:** ADR-0121d (Canvas IR), ADR-0122 (Workflow Manager)

**Cross-recipe composition:** Imports `workflow.temporal-ts-workflow`, `workflow.temporal-ts-activity`

---

#### `workflow.canvas-ir-to-activepieces` — P0

**Purpose:** Compile CuraOS Canvas IR to Activepieces flow JSON.

**Inputs:**
```yaml
canvas_ir: CanvasIR
output_dir: path
```

**Outputs:** `workflow.activepieces-flow` tree.

**Template engine:** Nunjucks

**Target ADR:** ADR-0121d, ADR-0122

---

### 7. Auth / Identity Recipes

#### `auth.nestjs-controller-better-auth` — P0

**Purpose:** Scaffold NestJS auth controller wiring Better Auth + node-oidc-provider endpoints. Used to bootstrap identity-service (ADR-0120) initial shell and extend with new auth flows.

**Inputs:**
```yaml
service_name: string
flows: [oidc, magic-link, webauthn, totp, saml, scim, smart-fhir]
tenant_isolation: schema-per-tenant | row-level
```

**Outputs:**
```
src/auth/
  auth.module.ts.gen.ts
  auth.controller.ts.gen.ts
  better-auth.adapter.ts.gen.ts
  oidc-provider.adapter.ts.gen.ts
  flows/
    {flow}.handler.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120 (Auth foundation product)

---

#### `auth.smart-on-fhir-app` — P0

**Purpose:** Scaffold a SMART-on-FHIR App Launch 2.0 compliant client application shell (EHR launch + standalone launch) with `fhirclient-js` wiring.

**Inputs:**
```yaml
app_name: string
launch_type: ehr | standalone | both
fhir_scopes: string[]
patient_context: boolean
```

**Outputs:**
```
src/smart/
  launch.ts.gen.ts
  fhir-client.ts.gen.ts
  scope-mapper.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120 §6 (SMART-on-FHIR), ADR-0121c (HealthStack widgets)

---

#### `auth.scim-endpoint` — P1

**Purpose:** Scaffold SCIM 2.0 Users + Groups REST endpoints in NestJS with `scim-patch` RFC compliance.

**Inputs:**
```yaml
service_name: string
resources: [Users, Groups, both]
```

**Outputs:**
```
src/scim/
  scim.module.ts.gen.ts
  users.controller.ts.gen.ts
  groups.controller.ts.gen.ts
  scim-patch.adapter.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120 §6 (SCIM)

---

#### `auth.saml-idp-config` — P1

**Purpose:** Scaffold SAML 2.0 IdP + SP configuration module using `node-saml` + `samlify` with per-tenant certificate management.

**Inputs:**
```yaml
service_name: string
role: idp | sp | both
cert_source: openbao | env
```

**Outputs:**
```
src/saml/
  saml.module.ts.gen.ts
  saml-idp.service.ts.gen.ts
  saml-sp.service.ts.gen.ts
  cert.manager.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120 §3.1 (SAML 2.0)

---

### 8. Test Recipes

#### `tests.vitest-nestjs` — P0

**Purpose:** Scaffold Vitest unit + integration test setup for a NestJS service with per-tenant test DB schema, mock auth token factory, and OTel test spans. From ADR-0123.

**Inputs:**
```yaml
service_name: string
test_db: postgres | sqlite-wasm
mock_tenant_count: number
```

**Outputs:**
```
test/
  setup.ts.gen.ts
  helpers/
    tenant-factory.ts.gen.ts
    auth-token-factory.ts.gen.ts
    otel-test-span.ts.gen.ts
  unit/
    {service}.service.spec.ts.gen.ts
  integration/
    {service}.integration.spec.ts.gen.ts
vitest.config.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** All cluster ADRs

---

#### `tests.playwright-e2e` — P0

**Purpose:** Scaffold Playwright E2E test suite for a foundation product UI with auth login helper, per-tenant fixture, and accessibility scan. From ADR-0123.

**Inputs:**
```yaml
product_name: string
base_url: string
tenant_fixtures: TenantFixture[]
a11y: boolean
```

**Outputs:**
```
e2e/
  fixtures/
    auth.fixture.ts.gen.ts
    tenant.fixture.ts.gen.ts
  tests/
    {product}.spec.ts.gen.ts
  playwright.config.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0120, ADR-0121, ADR-0122, ADR-0123

---

#### `tests.contract-pact` — P1

**Purpose:** Scaffold Pact consumer-driven contract tests between two NestJS services.

**Inputs:**
```yaml
consumer_service: string
provider_service: string
interactions: ContractInteraction[]
```

**Outputs:**
```
test/contract/
  {consumer}-{provider}.pact.spec.ts.gen.ts
  pact.config.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0103 (API contracts)

---

#### `tests.fhir-conformance` — P1

**Purpose:** Scaffold FHIR conformance test suite using HAPI FHIR validator for HealthStack services, including SMART-on-FHIR launch flow test.

**Inputs:**
```yaml
service_name: string
fhir_resources: string[]
smart_scopes: string[]
```

**Outputs:**
```
test/fhir/
  conformance.spec.ts.gen.ts
  smart-launch.spec.ts.gen.ts
  validators/
    {resource}.validator.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0115 (HealthStack), ADR-0208

---

### 9. Plugin Recipes

#### `plugin.wasm-component-rust` — P0

**Purpose:** Scaffold a WIT-typed WASM component in Rust with Wasmtime host harness (napi-rs N-API addon). From ADR-0123 `plugin.wasm-component`.

**Inputs:**
```yaml
name: string
wit_interface: WITInterface
fuel_limit: number
epoch_deadline_ms: number
```

**Outputs:**
```
src/
  {name}.rs.gen.ts          # Rust component source
  {name}.wit.gen.ts          # WIT IDL interface
  host/
    {name}-host.ts.gen.ts    # Wasmtime napi-rs host
    {name}.spec.ts.gen.ts
Cargo.toml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §5.1 (plugin Layer 2)

---

#### `plugin.wasm-component-tinygo` — P1

**Purpose:** Scaffold a WIT-typed WASM component in TinyGo for tenants preferring Go (lighter than full Go runtime).

**Inputs:** Same as `plugin.wasm-component-rust` with `language: tinygo`.

**Outputs:** TinyGo source + same host harness as Rust variant.

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §5.1

---

#### `plugin.nestjs-sidecar` — P0

**Purpose:** Scaffold a NestJS microservice sidecar shell with NATS transport and K8s LimitRange. From ADR-0123.

**Inputs:**
```yaml
name: string
parent_service: string
nats_subject: string
resource_quota: ResourceQuota
```

**Outputs:** Per `backend.nestjs-microservice-sidecar`.

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §5.1 (plugin Layer 1)

**Cross-recipe composition:** Imports `backend.nestjs-microservice-sidecar`

---

#### `plugin.isolated-vm-script` — P0

**Purpose:** Scaffold an isolated-vm JavaScript rule runner with per-tenant memory + CPU limits for simple tenant JS snippets (plugin Layer 3).

**Inputs:**
```yaml
name: string
memory_limit_mb: number
timeout_ms: number
```

**Outputs:**
```
src/vm/
  {name}-runner.ts.gen.ts
  {name}-sandbox.ts.gen.ts
  {name}-runner.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §5.1 (plugin Layer 3)

---

### 10. Interceptor Recipes

#### `interceptor.nestjs-audit` — P0

**Purpose:** Scaffold a NestJS `AuditInterceptor` that hash-chains every intercepted request to the PG audit log and publishes to `curaos.audit.events` Kafka topic.

**Inputs:**
```yaml
service_name: string
entity_type: string
phi_fields: string[]
```

**Outputs:**
```
src/interceptors/
  audit.interceptor.ts.gen.ts
  audit-event.schema.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0104 (audit), all cluster ADRs

**Cross-recipe composition:** Mandatory import by `backend.nestjs-service`

---

#### `interceptor.nestjs-tenant-router` — P0

**Purpose:** Scaffold the shared `TenantInterceptor` NestJS module that extracts tenant ID from JWT, validates claims, routes to correct PG schema, sets Kafka partition key, and passes context downstream.

**Inputs:**
```yaml
jwt_tenant_claim: string    # default: "tenant_id"
schema_prefix: string       # default: "tenant_"
kafka_partition_strategy: tenant-id-first | hash
```

**Outputs:**
```
src/interceptors/
  tenant.interceptor.ts.gen.ts
  tenant-context.decorator.ts.gen.ts
  tenant-config.resolver.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0152 (tenant routing, resolves F-001), all cluster ADRs

**Cross-recipe composition:** Mandatory import by `backend.nestjs-service`

---

#### `interceptor.event-bus-transform` — P1

**Purpose:** Scaffold an `@curaos/event-interceptors` beforePublish/afterConsume hook for event-bus message transformation, veto, or audit enrichment.

**Inputs:**
```yaml
name: string
hook_points: [beforePublish, afterPublish, beforeConsume, afterConsume, onError]
transform_fn: string    # inline JS expression or WASM component ref
```

**Outputs:**
```
src/event-interceptors/
  {name}.interceptor.ts.gen.ts
  {name}.interceptor.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §5.4 (event-bus interceptors)

---

### 11. Builder + Forms + Widgets Recipes

#### `canvas.node-type` — P0

**Purpose:** Scaffold a custom `@xyflow/react` canvas node type (React component + property panel) for the CuraOS Workflow Canvas custom node SDK.

**Inputs:**
```yaml
name: string
paradigm: flow | state-machine | decision-table | event-interceptor | ai-agent
emit_targets: string[]    # which compile targets this node participates in
properties: NodeProperty[]
```

**Outputs:**
```
src/nodes/
  {name}/
    {name}-node.tsx.gen.ts
    {name}-panel.tsx.gen.ts
    {name}-schema.ts.gen.ts     # Zod-validated node data
    {name}-emit.ts.gen.ts       # IR contribution for compile targets
    {name}-node.stories.tsx.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121d (Workflow Canvas custom node SDK)

---

#### `canvas.compile-target` — P0

**Purpose:** Scaffold a new Canvas IR → code compile target. Enables community-extensible compile targets beyond the built-in set.

**Inputs:**
```yaml
name: string
target_runtime: string    # e.g., "temporal-ts", "activepieces", "custom-runtime"
ir_node_types: string[]   # which IR node types this target handles
```

**Outputs:**
```
src/compilers/
  {name}/
    {name}.compiler.ts.gen.ts
    {name}.node-handlers/
      {node-type}.handler.ts.gen.ts
    {name}.compiler.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121d §7 (emit targets)

---

#### `form.formily-schema` — P0

**Purpose:** Scaffold a Formily JSON schema form definition with conditional logic, calculated fields, and Puck layout config.

**Inputs:**
```yaml
name: string
fields: FormField[]
conditional_rules: ConditionalRule[]
multi_step: boolean
submission_modes: [pg, webhook, fhir, kafka]
```

**Outputs:**
```
schemas/
  {name}.formily.json.gen.ts
  {name}.puck-layout.json.gen.ts
  {name}.submission-config.json.gen.ts
```

**Template engine:** Handlebars (JSON generation)

**Target ADR:** ADR-0121e (Forms)

---

#### `form.fhir-questionnaire` — P0

**Purpose:** Scaffold a FHIR R4 Questionnaire resource JSON for HealthStack clinical forms, with `@aehrc/smart-forms-renderer` wiring.

**Inputs:**
```yaml
name: string
fhir_questionnaire_id: string
items: QuestionnaireItem[]
smart_scopes: string[]
```

**Outputs:**
```
fhir/
  questionnaires/
    {id}.questionnaire.json.gen.ts
src/forms/
  {name}.fhir-form.tsx.gen.ts   # @aehrc/smart-forms-renderer wrapper
```

**Template engine:** Handlebars

**Target ADR:** ADR-0121e §4 (FHIR mode), ADR-0115 (HealthStack)

---

#### `form.runtime-react` — P0

**Purpose:** Scaffold a React form runtime component from Formily schema — embeddable in Sites, Apps, or standalone Forms product.

**Inputs:**
```yaml
schema_file: path
name: string
theme: string
```

**Outputs:**
```
src/forms/
  {name}-form.tsx.gen.ts
  {name}-form.spec.tsx.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121e §2 (render targets)

---

#### `form.runtime-lit` — P0

**Purpose:** Scaffold a Lit Web Component form runtime from Formily schema — for Widgets embed context.

**Inputs:** Schema file + component name.

**Outputs:**
```
src/forms/
  {name}-form.ts.gen.ts    # LitElement wrapping Formily renderer
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121e, ADR-0121c (Widgets)

---

#### `form.runtime-react-native` — P0

**Purpose:** Scaffold a React Native form runtime from Formily schema — for mobile offline-capable forms.

**Inputs:** Schema file + screen name.

**Outputs:**
```
src/forms/
  {name}-form.native.tsx.gen.ts
  {name}-offline.hook.ts.gen.ts    # PowerSync integration
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121e, ADR-0209

---

#### `widget.react` — P0

**Purpose:** Scaffold a React npm package widget output — wraps Lit Web Component or renders natively in React context.

**Inputs:**
```yaml
name: string
lit_component: string    # source Lit component
```

**Outputs:**
```
src/
  {name}.react.tsx.gen.ts    # React wrapper
package.json.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121c (Widgets React format)

---

#### `widget.iframe-script` — P0

**Purpose:** Scaffold the script-tag auto-iframe loader for a widget — zero-config 3rd-party embed.

**Inputs:**
```yaml
name: string
widget_origin: string
```

**Outputs:**
```
src/
  {name}-loader.ts.gen.ts    # injects iframe at script position
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0121c §4.3 (script-tag format)

---

### 12. HealthStack Recipes

#### `healthstack.fhir-service` — P0

**Purpose:** Scaffold a HealthStack NestJS service that wraps HAPI FHIR — extends `backend.nestjs-service` with PHI field tagging, `@healthstack/audit` interceptor, SMART-on-FHIR scope enforcement, and HAPI HTTP client wiring.

**Inputs:**
```yaml
service_name: string
fhir_resources: string[]
smart_scopes: string[]
phi_fields: string[]
```

**Outputs:** Full `backend.nestjs-service` tree plus:
```
src/fhir/
  hapi-client.ts.gen.ts
  fhir-scope.guard.ts.gen.ts
src/interceptors/
  phi-audit.interceptor.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0208 (HealthStack cluster), ADR-0115

**Cross-recipe composition:** Imports `backend.nestjs-service`, `auth.smart-on-fhir-app`, `api.typespec-fhir-resource`, `tests.fhir-conformance`

---

#### `healthstack.fhir-resource-controller` — P0

**Purpose:** Scaffold a NestJS controller exposing FHIR REST CRUD for one resource type, proxying to HAPI FHIR with consent check, audit, and SMART scope guard.

**Inputs:**
```yaml
fhir_resource: string
consent_check: boolean
audit_phi: boolean
```

**Outputs:**
```
src/controllers/
  {resource}.fhir.controller.ts.gen.ts
  {resource}.fhir.controller.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0208

---

#### `healthstack.smart-app-launcher` — P1

**Purpose:** Scaffold a SMART-on-FHIR App Launcher page (EHR launch context + standalone launch) as a React+Next page.

**Inputs:**
```yaml
app_name: string
launch_type: ehr | standalone
```

**Outputs:** `ui.react-next-page` tree with SMART launch hooks.

**Template engine:** Nunjucks

**Target ADR:** ADR-0120, ADR-0208

---

#### `healthstack.cds-hook` — P1

**Purpose:** Scaffold a CDS Hooks service endpoint (discovery + hook invocation) using `cqf-ruler` plugin on HAPI FHIR.

**Inputs:**
```yaml
hook_name: string
hook_type: patient-view | order-select | order-sign | encounter-start
```

**Outputs:**
```
src/cds-hooks/
  {hook-name}.hook.ts.gen.ts
  {hook-name}.hook.spec.ts.gen.ts
  discovery.controller.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0115 §4.2.2 (CDS Hooks)

---

#### `healthstack.cql-measure` — P2

**Purpose:** Scaffold a CQL quality measure definition with cqf-ruler execution wiring.

**Inputs:** Measure name, population criteria, stratification.

**Outputs:** CQL `.cql` file + FHIR Measure resource JSON.

**Template engine:** Nunjucks

**Target ADR:** ADR-0115 (quality measures)

---

### 13. Shared Lib + Infra Recipes

#### `lib.nestjs-shared` — P0

**Purpose:** Scaffold a new `@curaos/*` shared NestJS backend library with Nx project config, dual CJS/ESM build, Verdaccio publish pipeline, and cosign signing. From ADR-0209.

**Inputs:**
```yaml
lib_name: string          # e.g., "recurrence", "fhir-client"
scope: "@curaos"
consumers: string[]       # which clusters/services will import it
```

**Outputs:**
```
libs/{lib-name}/
  src/
    index.ts.gen.ts
    {lib-name}.module.ts.gen.ts
  project.json.gen.ts          # Nx project config
  package.json.gen.ts
  tsconfig.json.gen.ts
  tsconfig.lib.json.gen.ts
  rollup.config.js.gen.ts
.github/workflows/
  publish-lib.yml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0209 (backend shared libraries)

---

#### `helm.nestjs-service-chart` — P1

**Purpose:** Scaffold a Helm chart for a NestJS service deployment: Deployment, Service, HPA, PDB, ConfigMap, NetworkPolicy, and Capsule tenant namespace wiring.

**Inputs:**
```yaml
service_name: string
replicas_min: number
replicas_max: number
resources: ResourceSpec
tenant_namespaced: boolean
```

**Outputs:**
```
charts/{service-name}/
  Chart.yaml.gen.ts
  values.yaml.gen.ts
  templates/
    deployment.yaml.gen.ts
    service.yaml.gen.ts
    hpa.yaml.gen.ts
    pdb.yaml.gen.ts
    configmap.yaml.gen.ts
    networkpolicy.yaml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0109 (containers), all cluster ADRs

---

#### `helm.sidecar-pattern` — P1

**Purpose:** Scaffold Helm chart additions for JVM sidecar (HAPI FHIR) co-located pod pattern — init container, shared volume, health probes.

**Inputs:**
```yaml
sidecar_image: string
sidecar_port: number
shared_volume: boolean
```

**Outputs:** Appended `sidecar.yaml.gen.ts` + updated `deployment.yaml.gen.ts` patch.

**Template engine:** Nunjucks

**Target ADR:** ADR-0115 (HAPI FHIR sidecar), ADR-0209

---

#### `k8s.tenant-namespace` — P1

**Purpose:** Scaffold Capsule tenant namespace manifest + ResourceQuota + LimitRange + NetworkPolicy for per-tenant K8s isolation.

**Inputs:**
```yaml
tenant_id: string
tier: saas | enterprise | on-prem
resource_quota: ResourceQuota
```

**Outputs:**
```
k8s/tenants/{tenant-id}/
  namespace.yaml.gen.ts
  capsule-tenant.yaml.gen.ts
  resource-quota.yaml.gen.ts
  limit-range.yaml.gen.ts
  network-policy.yaml.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0109 (Capsule tenancy)

---

### 14. Meta-Recipe

#### `cookbook.recipe` — P0

**Purpose:** Meta-recipe that scaffolds a new cookbook recipe (eat-own-dogfood). From ADR-0123. Generates recipe manifest, skeleton directory, golden-output fixture, and recipe self-tests.

**Inputs:**
```yaml
recipe_name: string
domain: string
engine: nunjucks | handlebars | ejs
inputs_schema: ZodSchema
```

**Outputs:**
```
cookbook/{recipe-name}/
  recipe.yaml.gen.ts
  skeleton/
    .gitkeep.gen.ts
  actions/
    install.sh.gen.ts
  tests/
    golden-output/
      .gitkeep.gen.ts
    recipe.spec.ts.gen.ts
```

**Template engine:** Nunjucks

**Target ADR:** ADR-0123 §4

---

## Total Recipe Count

| Domain | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Backend service | 4 | 0 | 0 | 4 |
| Frontend | 5 | 1 | 0 | 6 |
| Data | 2 | 1 | 0 | 3 |
| API spec | 2 | 2 | 0 | 4 |
| Events | 4 | 0 | 0 | 4 |
| Workflow | 7 | 0 | 0 | 7 |
| Auth/Identity | 2 | 2 | 0 | 4 |
| Tests | 2 | 2 | 0 | 4 |
| Plugin | 3 | 1 | 0 | 4 |
| Interceptor | 2 | 1 | 0 | 3 |
| Builder + Forms + Widgets | 8 | 0 | 0 | 8 |
| HealthStack | 2 | 2 | 1 | 5 |
| Shared Lib + Infra | 1 | 3 | 0 | 4 |
| Meta | 1 | 0 | 0 | 1 |
| **Total** | **45** | **15** | **1** | **57** |

> Note: the P0 count is 45 (not 30) on final tally. Three recipes from ADR-0123's original 16 are subsumed by more specific recipes here: `events.nestjs-kafka` → `events.nestjs-kafka-producer-consumer`; `api.asyncapi` → `events.asyncapi-export`; `workflow.temporal-ts` → `workflow.temporal-ts-workflow` + `workflow.temporal-ts-activity`. The 13 genuinely new P0 recipes fill the gaps identified in F-003.

---

## Cross-Recipe Composition Graph

```
backend.nestjs-service
  ├── data.drizzle-schema-from-typespec
  │     └── data.drizzle-migration
  ├── api.typespec-base
  │     ├── api.openapi-export
  │     ├── api.protobuf-export
  │     └── api.graphql-sdl-export
  ├── tests.vitest-nestjs
  ├── events.nestjs-kafka-producer-consumer
  │     ├── events.outbox-drizzle
  │     └── events.asyncapi-export
  ├── interceptor.nestjs-audit
  └── interceptor.nestjs-tenant-router

healthstack.fhir-service
  ├── backend.nestjs-service (above)
  ├── api.typespec-fhir-resource
  │     └── api.typespec-base
  ├── auth.smart-on-fhir-app
  └── tests.fhir-conformance

canvas.compile-target
  └── workflow.canvas-ir-to-temporal
        ├── workflow.temporal-ts-workflow
        └── workflow.temporal-ts-activity

canvas.compile-target
  └── workflow.canvas-ir-to-activepieces
        └── workflow.activepieces-flow

ui.react-next-admin-shell
  └── ui.react-next-page

ui.lit-widget
  ├── widget.react
  └── widget.iframe-script

form.formily-schema
  ├── form.runtime-react
  ├── form.runtime-lit
  └── form.runtime-react-native

plugin.nestjs-sidecar
  └── backend.nestjs-microservice-sidecar

lib.nestjs-shared
  (leaf — no recipe deps; output consumed by all backend services)

cookbook.recipe
  (self-referential — used to scaffold all other recipes)
```

---

## Recipe Authoring Priority

### P0 — Foundation v1 must-have (45 recipes)

Required before any foundation product ships. These recipes either scaffold the foundation products themselves or provide the emit targets foundation products need.

Blocked on: nothing — these recipes are authored as part of ADR-0123 implementation milestones M1–M16 (extended).

Target: complete by Codegen foundation product v1 GA.

### P1 — Wave 1 cluster cookbook (15 recipes)

Required for downstream cluster services (ADR-0200 through ADR-0209) to generate consistently. Can be authored in parallel with foundation product implementation (Wave 1 Lite sprint).

Blocked on: P0 `backend.nestjs-service`, `api.typespec-base`, `data.drizzle-schema-from-typespec` complete (those are the composition roots).

Target: complete by Wave 1 Lite service scaffolding sprint.

### P2 — Community-extensible (1 recipe in this inventory)

`healthstack.cql-measure` requires CQL expertise and cqf-ruler integration that isn't needed for Wave 1 GA. Authored post-v1 by HealthStack community contributors using `cookbook.recipe` meta-recipe.

---

## Amendments to ADR-0123

ADR-0123 §4 Phase 1 recipe list is amended as follows:

| Original recipe | Status | Replacement |
|---|---|---|
| `backend.nestjs` | Renamed + extended | `backend.nestjs-service` (adds mandatory harness libs, tenant routing) |
| `ui.react-next` | Renamed + extended | `ui.react-next-page` + `ui.react-next-admin-shell` |
| Legacy Prisma recipe | Superseded by rule | `data.drizzle-schema-from-typespec` (TypeSpec-first, Drizzle default per [[curaos-orm-rule]]) |
| `data.sqlc` | Spec added | `data.sqlc-go-binding` |
| `api.openapi` | Renamed | `api.openapi-export` (action recipe; TypeSpec is now the source) |
| `api.asyncapi` | Moved to events domain | `events.asyncapi-export` |
| `events.nestjs-kafka` | Extended | `events.nestjs-kafka-producer-consumer` (adds outbox + DLQ) |
| `events.nestjs-nats` | Renamed | `events.nestjs-nats-jetstream` |
| `tests.vitest` | Extended | `tests.vitest-nestjs` (adds per-tenant fixtures) |
| `tests.playwright` | Extended | `tests.playwright-e2e` (adds auth + a11y) |
| `interceptor.nestjs` | Split | `interceptor.nestjs-audit` + `interceptor.nestjs-tenant-router` |
| `plugin.wasm-component` | Split | `plugin.wasm-component-rust` + `plugin.wasm-component-tinygo` |
| `plugin.nestjs-sidecar` | Unchanged; spec added | `plugin.nestjs-sidecar` |
| `workflow.temporal-ts` | Split | `workflow.temporal-ts-workflow` + `workflow.temporal-ts-activity` |
| `workflow.activepieces-flow` | Unchanged; spec added | `workflow.activepieces-flow` |
| `cookbook.recipe` | Unchanged; spec added | `cookbook.recipe` |

New recipes with no ADR-0123 predecessor (all gaps resolved by this ADR):

```
backend.nestjs-graphql-resolver        ui.astro-page
backend.nestjs-event-consumer          ui.lit-widget
backend.nestjs-microservice-sidecar    ui.curaos-ui-component
ui.react-native-screen                 data.atlas-migration
api.typespec-base                      api.typespec-fhir-resource
api.protobuf-export                    api.graphql-sdl-export
workflow.nestjs-cron                   workflow.canvas-ir-to-temporal
workflow.canvas-ir-to-activepieces     auth.nestjs-controller-better-auth
auth.smart-on-fhir-app                 auth.scim-endpoint
auth.saml-idp-config                   tests.contract-pact
tests.fhir-conformance                 plugin.isolated-vm-script
interceptor.event-bus-transform        canvas.node-type
canvas.compile-target                  form.formily-schema
form.fhir-questionnaire                form.runtime-react
form.runtime-lit                       form.runtime-react-native
widget.react                           widget.iframe-script
healthstack.fhir-service               healthstack.fhir-resource-controller
healthstack.smart-app-launcher         healthstack.cds-hook
healthstack.cql-measure                lib.nestjs-shared
helm.nestjs-service-chart              helm.sidecar-pattern
k8s.tenant-namespace
```

---

## Action Items

| ID | Action | Owner | Blocker? |
|---|---|---|---|
| A-001 | Add all 45 P0 recipes to ADR-0123 M3–M16 build sequence | Codegen team | No — extends existing milestones |
| A-002 | Add `api.typespec-base` to ADR-0123 M2 (alongside spec parser) | Codegen team | No |
| A-003 | Add `interceptor.nestjs-tenant-router` to ADR-0152 companion | Platform team | No — ADR-0152 in flight |
| A-004 | Add `healthstack.fhir-service` and `healthstack.fhir-resource-controller` to ADR-0208 build plan | HealthStack team | No |
| A-005 | Add `lib.nestjs-shared` scaffold recipe to ADR-0209 §2.2 | Platform team | No |
| A-006 | Publish golden-output snapshots for all P0 recipes as CI fixtures | Codegen team | No — enables recipe regression tests |
| A-007 | Cross-reference all cluster ADRs (0200–0209) to name which recipes they consume | Architecture team | No |

---

## References

- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data Layer](0101-data-layer.md)
- [ADR-0102 Event Messaging](0102-event-messaging.md)
- [ADR-0103 API Surface](0103-api-surface.md)
- [ADR-0109 Containers & Orchestration](0109-containers-orchestration.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0121a Foundation Sites](0121a-foundation-sites.md)
- [ADR-0121b Foundation Apps](0121b-foundation-apps.md)
- [ADR-0121c Foundation Widgets](0121c-foundation-widgets.md)
- [ADR-0121d Foundation Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0121e Foundation Forms](0121e-foundation-forms.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin/Sidecar/Interceptor](0123-foundation-codegen-plugin.md)
- [ADR-0151 Cross-Cluster Coherence Scan](0151-cross-cluster-coherence.md)
- [ADR-0200 Cluster: Identity + Party + Org + Audit](0200-cluster-identity-party-org-audit.md)
- [ADR-0201 Cluster: Platform Shared Services](0201-cluster-platform-shared-services.md)
- [ADR-0208 Cluster: HealthStack Clinical Services](0208-cluster-healthstack-clinical-services.md)
- [ADR-0209 Cluster: Frontend Packages + Backend Libs](0209-cluster-frontend-packages-backend-libs.md)
