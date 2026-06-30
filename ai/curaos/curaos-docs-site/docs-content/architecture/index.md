# Architecture

CuraOS stands for Care Oriented Stack, and the name is the mental model: opt-in
vertical overlays sit as a layer **on top of** one neutral-core foundation, and
they depend **downward** on it.

## The layered model

```
  VERTICAL OVERLAYS (opt-in)
  +-------------+  +----------------+  +-----+
  | HealthStack |  | EducationStack |  | ERP |
  +------+------+  +-------+--------+  +--+--+
         |                 |             |
         v                 v             v        (dependency: overlay -> core)
  +-----------------------------------------------+
  |                 NEUTRAL CORE                  |
  |  identity, tenancy, party, audit, notify,     |
  |  search, storage, calendar, tasks, commerce,  |
  |  workflow/BPM, builder, automation, ...       |
  +-----------------------------------------------+
```

The arrow direction is the **charter invariant**: dependencies always point from
a vertical overlay into the neutral core, never the reverse. CI guards this so
the core stays reusable across markets. An overlay can use the core; the core
never knows an overlay exists.

## Charter principles

These are the binding commitments the architecture serves.

Self-hosted first
:   Deployable on customer infrastructure with no managed-cloud lock-in. Hybrid
    and air-gap are supported, not bolted on.

Generic before vertical
:   Reusable neutral capability comes first. Verticals extend it through
    documented seams; they never fork it.

Composable
:   Services, libraries, and clients ship independently and combine per tenant
    and per market.

Builder-led
:   Experiences are expressed through the workflow/BPM engine and the app/site
    builder, so behavior is configured, not hand-forked.

Event-led
:   Durable, versioned messaging is the primary integration path; synchronous
    APIs are secondary.

Multi-tenant
:   SaaS, on-prem, and hybrid all run from one codebase.

Tenant data isolation
:   PHI and PII stay in overlay schemas. Neutral services hold references and
    metadata only, never protected data.

## The real stack

The live reference deployment runs as composable services on Kubernetes:

- **Runtime**: Kubernetes (k3d in the reference), one workload per service.
- **Data**: PostgreSQL managed by the CloudNativePG (CNPG) operator, one
  database per tenant. Valkey for caching and ephemeral state.
- **Messaging**: durable, versioned events as the primary cross-service contract
  (outbox pattern, stable topic naming).
- **API**: a gateway in front of the services, routing by path prefix.
- **Identity**: Pocket-ID as the OIDC provider (Authorization Code with PKCE).
- **Edge**: ingress-nginx in-cluster; Caddy plus Cloudflare for the public edge.

## Boundaries that must not break

CuraOS publishes its seams and treats them as contracts:

- **APIs** are versioned, with deprecation sunset dates and backward-compatible
  migrations.
- **Events** are durable with versioned schemas and stable topic names, using
  the outbox pattern for reliable publish.
- **Data** models carry semantic versions; all active versions are honored until
  deactivated.

## Reliability and non-functional commitments

- Idempotent writes, correlation IDs, outbox/inbox, retries with backoff, and
  dead-letter handling.
- Observability is default-on: tracing, structured logs, and metrics, with
  tenant-aware dashboards.
- Security is defense in depth: strong auth (OIDC + PKCE), RBAC with optional
  ABAC, tamper-evident audit, and a logged break-glass path.
- Privacy and compliance target GDPR and HIPAA, with the PHI/PII boundary
  enforced at both the schema and the service layer.

The full security model, the GDPR and HIPAA posture, and the PHI boundary are in
[Security & compliance](../security/index.md).

Next: the [Capabilities](../capabilities/index.md) the core and overlays provide,
the [Services catalogue](../services/index.md) for every service, and the
[Apps guide](../apps/index.md) for the surfaces built on top.
