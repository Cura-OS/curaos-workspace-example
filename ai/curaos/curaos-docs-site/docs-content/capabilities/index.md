# Capabilities

Every app sits on the same foundation. The neutral core provides reusable,
vertical-agnostic capabilities; vertical overlays extend the core through
documented seams. Behavior is built and configured, not forked.

## Platform foundation

These three are the spine that every domain routes through.

Workflow / BPM core
:   Orchestrates human tasks, automation, and SLA timing. Every domain routes
    through it, so process logic lives in one place rather than being scattered
    across services.

App / site builder
:   Generates admin, ops, and external surfaces from BPM definitions, domain
    contracts, and shared theming. This is how the web app suite stays
    consistent.

Automation core
:   Low-code actions, connectors, and scheduling, so integrations and routine
    work are configured rather than coded.

How these three turn a domain definition into a running app is described in
[Workflow & builder](../builder/index.md).

## Neutral capabilities

Generic and vertical-agnostic. Each is owned by a neutral core service and is
reusable across every market. The set includes:

- Identity, Tenancy, Org, Party
- Audit, Settings, Notify
- Search, Reports
- Storage, Documents
- Calendar, Tasks
- Geospatial, Fleet
- Commerce, Sales, Procurement, Inventory
- HR, CRM, Accounting
- E-Sign, Conversion, Donation, Event, Integrations, Site

Personal (`personal-*`) and business (`business-*`) variants of a domain exist
only where the subject ownership and data isolation genuinely differ; otherwise a
single neutral `*-core-service` owns the capability.

## Vertical overlays

Opt-in, and they extend the core only.

HealthStack
:   Patient, encounter, scheduling, clinical documents, orders, lab, meds,
    imaging, claims, consent, interop, EMS, terminology, devices, care plans, and
    quality. Clinical PHI stays inside the overlay schemas.

EducationStack
:   Student lifecycle, course authoring, and accreditation.

ERP
:   Extended commerce and business operations.

The dependency direction is always overlay to core, never the reverse.

## Cross-cutting commitments

These hold across every capability:

- **Versioned contracts.** APIs and durable events carry versioned schemas with
  deprecation windows, so consumers are never broken silently.
- **Tenant data isolation.** PHI and PII live in overlay schemas; neutral
  services hold references and metadata only.
- **Observability by default.** Tracing, structured logs, and metrics are on by
  default, with tenant-aware dashboards.
- **Security in depth.** OIDC with PKCE, RBAC with optional ABAC, tamper-evident
  audit, and a logged break-glass path.

For the complete, grouped list of every service that owns these capabilities, see
the [Services catalogue](../services/index.md). To see how they are exposed over
the wire, read the [API reference](../api/index.md) and
[Event contracts](../events/index.md). For the structure behind it, see
[Architecture](../architecture/index.md). For the privacy and compliance posture,
see [Security & compliance](../security/index.md).
