# API reference

CuraOS exposes its capabilities through an API gateway in front of the backend
services. In the live reference deployment the gateway is at
`https://api.example.com`, and it routes to each service by a path prefix.

!!! note "Event-led first"
    CuraOS is event-led: durable, versioned events are the primary cross-service
    contract, and synchronous APIs are secondary. Use the HTTP API for queries
    and commands where request/response latency matters; use the event
    contracts for cross-service integration. See
    [Integration](../integration/index.md).

## Calling the gateway

Each public domain lives under a versioned gateway path. The shape is:

```
https://api.example.com/api/v1/<domain>/<resource>
```

For example, the identity service health check:

```bash
curl -i https://api.example.com/api/v1/identity/healthz
# HTTP/2 200
```

Health endpoints (`/api/v1/<domain>/healthz`) are unauthenticated so you can
probe liveness without a token. Everything else requires an OIDC access token.

## Authentication

The API accepts a bearer access token issued by Pocket-ID via the Authorization
Code with PKCE flow. Acquire a token through the OIDC flow (see
[Auth setup](../auth/index.md)), then send it on each request:

```bash
curl https://api.example.com/api/v1/tenancy \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

Tokens are scoped per tenant and per role. RBAC (with optional ABAC) governs
what a token may do.

## The service catalog

The current local reference stack runs 38 routed backend services behind the
gateway and exposes 83 gateway domains. The source of truth is generated from
`DOMAIN_ROUTE_MAP` in `tools/codegen/src/api-gateway-emit.ts`; the same map
emits `ops/dev/local-stack/route-map.txt`, the Kubernetes ingress manifest, and
the route-contract checker. They group as follows.

### Neutral core

Vertical-agnostic capability services, each under its own prefix. Examples:

| Prefix | Capability |
| --- | --- |
| `/api/v1/identity` | Authentication subjects, sessions, credentials |
| `/api/v1/tenancy` | Tenants, organizations, isolation boundaries |
| `/api/v1/audit` | Tamper-evident audit trail |
| `/api/v1/notify` | Notifications across channels |
| `/api/v1/storage` | Object and file storage references |
| `/api/v1/calendar` | Scheduling and calendars |
| `/api/v1/personal-tasks` | Work items and task management |
| `/api/v1/commerce` | Commerce primitives |

(The full set covers settings, reports, geospatial, fleet, sales, procurement,
inventory, HR, CRM, accounting, e-sign, donation, event, integrations, and site.)
The complete, grouped list of every service and its prefix is in the
[Services catalogue](../services/index.md).

### Vertical overlays

Overlay services extend the core. The HealthStack overlay adds clinical
capabilities (patient, encounter, scheduling, clinical documents, orders, lab,
meds, imaging, claims, consent, interop, terminology, devices, care plans). Its
PHI stays inside overlay schemas.

### Personal and business variants

Where a domain genuinely differs by subject owner, a `personal-*` and
`business-*` variant exists alongside the neutral core service.

## Versioning

APIs are versioned with deprecation sunset dates and backward-compatible
migrations. All active versions are honored until they are deactivated, so an
integration built against a current version keeps working through the
deprecation window.

## Contract sources

The wire contracts live with the services and SDK packages:

| Contract surface | Source path | Current count |
| --- | --- | --- |
| HTTP TypeSpec | `backend/services/*/specs/*.tsp` | 52 specs |
| Durable events | `backend/services/*/specs/*.asyncapi.yaml` | 50 specs |
| Generated SDK clients | `backend/packages/*-sdk/openapi-ts.config.ts` | 12 SDK configs |

The SDK configs currently cover `calendar-sdk`, `clinical-doc-sdk`,
`encounter-sdk`, `notify-sdk`, `orders-sdk`, `reports-sdk`, `scheduling-sdk`,
`search-sdk`, `settings-sdk`, `storage-sdk`, `tasks-sdk`, and
`terminology-sdk`.

`DOMAIN_ROUTE_MAP` in `tools/codegen/src/api-gateway-emit.ts` is the gateway
routing source of truth. It emits the local route map, Kubernetes ingress
rules, and route-contract checks, so docs, gateway paths, and generated clients
stay aligned.

## Generated reference

A generated TypeScript API reference (TypeDoc) is produced at build time for the
SDK and contract packages. Contract specifications are the source of truth for
the wire format: OpenAPI / TypeSpec for HTTP and AsyncAPI for durable events.
Service-local `specs/` directories hold those contracts, and SDK packages with
`openapi-ts.config.ts` consume the published HTTP contracts. TypeDoc documents
the code-level API, not the wire contract.

Next: [Auth setup](../auth/index.md) for the OIDC flow,
[Event contracts](../events/index.md) for the durable event surface, and
[Integration](../integration/index.md) for the end-to-end integration flow.
