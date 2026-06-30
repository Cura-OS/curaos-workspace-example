# Services catalogue

CuraOS is composed of many small services rather than one monolith. Each service
owns one capability, ships independently, and is reachable through the API
gateway under a stable path prefix. This page is the catalogue: what exists, how
it is grouped, and the naming convention that tells you a service's layer at a
glance.

!!! note "Repository versus deployment"
    The platform repository contains 93 backend service directories across the
    neutral core, the HealthStack overlay, the EducationStack overlay, and the
    personal and business variants. The current local reference stack routes 38
    services through the gateway and exposes 83 gateway domains. The source of
    truth is
    generated from `DOMAIN_ROUTE_MAP` and rendered to
    `ops/dev/local-stack/route-map.txt` plus the Kubernetes ingress manifest.

## Naming convention

The name of a service tells you which layer it belongs to:

`<domain>-core-service`
:   A neutral, vertical-agnostic capability. The default owner of a domain.

`personal-<domain>-service`
:   A personal variant: the subject is an individual, and the data isolation
    follows personal ownership.

`business-<domain>-service`
:   A business variant: the subject is an organization, with org-level data
    isolation.

`healthstack-<domain>-service`
:   A HealthStack overlay service. The clinical overlay also uses a few plain
    `<domain>-service` names (for example `encounter-service`); the HealthStack
    boundary is carried in namespaces, events, and schemas rather than in every
    file name.

`education-<scope>-service`
:   An EducationStack overlay service.

Personal and business variants exist **only** where the subject owner and data
isolation genuinely differ. Where they do not, a single neutral
`*-core-service` owns the capability. See
[Capabilities](../capabilities/index.md) for the rule behind the split.

## Repository service directory inventory

The repository currently contains 93 backend service directories. A service
appears in the local routed stack only when it also appears in
`ops/dev/local-stack/svc-ports.txt` and `route-map.txt`; otherwise it is planned,
scaffolded, an overlay-depth service, or an alias kept for compatibility.

| Service directory | Layer |
| --- | --- |
| `accounting-core-service` | Neutral core |
| `audit-core-service` | Neutral core |
| `audit-service` | Legacy or scaffolded alias |
| `automation-core-service` | Neutral core |
| `builder-core-service` | Neutral core |
| `business-automation-service` | Business variant |
| `business-cases-service` | Business variant |
| `business-conversion-service` | Business variant |
| `business-docs-service` | Business variant |
| `business-donation-service` | Business variant |
| `business-esign-service` | Business variant |
| `business-patient-service` | Business variant |
| `business-projects-service` | Business variant |
| `business-scheduling-service` | Business variant |
| `business-shop-service` | Business variant |
| `business-site-service` | Business variant |
| `business-workflow-service` | Business variant |
| `calendar-core-service` | Neutral core |
| `clinical-doc-service` | HealthStack overlay |
| `commerce-core-service` | Neutral core |
| `conversion-core-service` | Neutral core |
| `crm-core-service` | Neutral core |
| `crm-service` | Legacy or scaffolded alias |
| `document-core-service` | Neutral core |
| `documents-core-service` | Neutral core |
| `donation-core-service` | Neutral core |
| `education-core-service` | EducationStack overlay |
| `education-organization-service` | EducationStack overlay |
| `education-personal-service` | EducationStack overlay |
| `encounter-service` | HealthStack overlay |
| `esign-core-service` | Neutral core |
| `event-core-service` | Neutral core |
| `fleet-core-service` | Neutral core |
| `geospatial-core-service` | Neutral core |
| `healthstack-automation-service` | HealthStack overlay |
| `healthstack-billing-service` | HealthStack overlay |
| `healthstack-careplans-service` | HealthStack overlay |
| `healthstack-claims-service` | HealthStack overlay |
| `healthstack-consent-service` | HealthStack overlay |
| `healthstack-devices-service` | HealthStack overlay |
| `healthstack-education-service` | HealthStack overlay |
| `healthstack-ems-service` | HealthStack overlay |
| `healthstack-imaging-service` | HealthStack overlay |
| `healthstack-interop-service` | HealthStack overlay |
| `healthstack-lab-service` | HealthStack overlay |
| `healthstack-meds-service` | HealthStack overlay |
| `healthstack-messaging-service` | HealthStack overlay |
| `healthstack-notes-service` | HealthStack overlay |
| `healthstack-patient-service` | HealthStack overlay |
| `healthstack-problems-service` | HealthStack overlay |
| `healthstack-quality-service` | HealthStack overlay |
| `healthstack-workflow-service` | HealthStack overlay |
| `hr-core-service` | Neutral core |
| `hr-service` | Legacy or scaffolded alias |
| `identity-service` | Neutral core |
| `integrations-core-service` | Neutral core |
| `integrations-service` | Legacy or scaffolded alias |
| `inventory-core-service` | Neutral core |
| `notify-service` | Neutral core |
| `orders-service` | HealthStack overlay |
| `org-core-service` | Neutral core |
| `org-service` | Legacy or scaffolded alias |
| `party-core-service` | Neutral core |
| `party-service` | Legacy or scaffolded alias |
| `patient-core-service` | HealthStack overlay |
| `personal-automation-service` | Personal variant |
| `personal-calendar-service` | Personal variant |
| `personal-conversion-service` | Personal variant |
| `personal-crm-service` | Personal variant |
| `personal-donation-service` | Personal variant |
| `personal-esign-service` | Personal variant |
| `personal-hr-service` | Personal variant |
| `personal-notes-service` | Personal variant |
| `personal-patient-service` | Personal variant |
| `personal-shop-service` | Personal variant |
| `personal-site-service` | Personal variant |
| `personal-tasks-service` | Personal variant |
| `personal-tracking-service` | Personal variant |
| `personal-workflow-service` | Personal variant |
| `plugin-runtime-service` | Neutral core |
| `procure-service` | Legacy or scaffolded alias |
| `procurement-core-service` | Neutral core |
| `reports-service` | Neutral core |
| `sales-core-service` | Neutral core |
| `scheduling-service` | HealthStack overlay |
| `search-service` | Neutral core |
| `settings-service` | Neutral core |
| `site-core-service` | Neutral core |
| `storage-service` | Neutral core |
| `tasks-core-service` | Neutral core |
| `tenancy-core-service` | Neutral core |
| `terminology-service` | HealthStack overlay |
| `workflow-core-service` | Neutral core |

## Neutral core

Vertical-agnostic capability services. Each is reusable across every market and
holds references and metadata only, never protected data.

| Service | Capability |
| --- | --- |
| `identity-service` | Authentication subjects, sessions, credentials, OIDC brokering |
| `tenancy-core-service` | Tenants, organizations, isolation boundaries |
| `org-core-service` | Organization structure and hierarchy |
| `party-core-service` | People and organizations modelled as parties |
| `audit-core-service` | Tamper-evident audit trail |
| `settings-service` | Per-tenant and per-user settings |
| `notify-service` | Notifications across channels |
| `search-service` | Cross-domain search |
| `reports-service` | Reporting and analytics surfaces |
| `storage-service` | Object and file storage references |
| `documents-core-service` | Document management |
| `calendar-core-service` | Scheduling and calendars |
| `tasks-core-service` | Work items and task management |
| `geospatial-core-service` | Geospatial primitives |
| `fleet-core-service` | Vehicle and asset fleet |
| `commerce-core-service` | Commerce primitives |
| `sales-core-service` | Sales pipeline |
| `procurement-core-service` | Procurement |
| `inventory-core-service` | Inventory |
| `hr-core-service` | Human resources |
| `crm-core-service` | Customer relationship management |
| `accounting-core-service` | Accounting |
| `esign-core-service` | Electronic signature |
| `conversion-core-service` | File and format conversion |
| `donation-core-service` | Donations and fundraising |
| `event-core-service` | Events (the domain, for example bookable events) |
| `integrations-core-service` | External integration connectors |
| `site-core-service` | Site and page authoring |

### Platform foundation

Three of the neutral services are the spine every domain routes through:

| Service | Role |
| --- | --- |
| `workflow-core-service` | Workflow / BPM engine: human tasks, automation, SLA timing |
| `builder-core-service` | App and site builder: generates surfaces from BPM definitions and contracts |
| `automation-core-service` | Low-code actions, connectors, and scheduling |
| `plugin-runtime-service` | Runs extension plugins in a sandboxed runtime |

See [Workflow & builder](../builder/index.md) for how these three work together.

## HealthStack overlay

The clinical overlay extends the core. All clinical PHI stays inside the overlay
schemas, never in the neutral core.

| Service | Capability |
| --- | --- |
| `healthstack-patient-service` | Patient records |
| `encounter-service` | Clinical encounters |
| `healthstack-problems-service` | Problem lists |
| `clinical-doc-service` | Clinical documents |
| `healthstack-lab-service` | Lab orders and results |
| `healthstack-meds-service` | Medications |
| `healthstack-imaging-service` | Imaging |
| `healthstack-claims-service` | Claims |
| `healthstack-billing-service` | Clinical billing |
| `healthstack-consent-service` | Consent management |
| `healthstack-careplans-service` | Care plans |
| `healthstack-devices-service` | Medical devices |
| `healthstack-ems-service` | Emergency medical services |
| `healthstack-interop-service` | Interoperability (clinical exchange) |
| `healthstack-quality-service` | Quality measures |
| `terminology-service` | Clinical terminology |
| `healthstack-scheduling` (`business-scheduling-service`, `scheduling-service`) | Clinical scheduling |
| `healthstack-workflow-service` | Clinical workflow extensions |
| `healthstack-automation-service` | Clinical automation extensions |
| `healthstack-messaging-service` | Clinical messaging |
| `healthstack-notes-service` | Clinical notes |
| `healthstack-education-service` | Patient education |

## EducationStack overlay

| Service | Capability |
| --- | --- |
| `education-core-service` | Neutral education capability (student lifecycle, course authoring) |
| `education-organization-service` | Organization-scoped education |
| `education-personal-service` | Individual-scoped education |

## Personal and business variants

Where a domain's subject owner genuinely differs, a `personal-*` and a
`business-*` variant exist alongside (or instead of) the neutral core service.

The repository includes the variants listed below. A variant is part of the
38-service local reference gateway only when it appears in
`ops/dev/local-stack/svc-ports.txt` and `route-map.txt`.

| Domain | Personal | Business |
| --- | --- | --- |
| Workflow | `personal-workflow-service` | `business-workflow-service` |
| Automation | `personal-automation-service` | `business-automation-service` |
| Site | `personal-site-service` | `business-site-service` |
| Shop / commerce | `personal-shop-service` | `business-shop-service` |
| Donation | `personal-donation-service` | `business-donation-service` |
| Tasks | (neutral `tasks-core-service`) | (neutral `tasks-core-service`) |
| Notes | `personal-notes-service` | (neutral `documents-core-service`) |
| Tracking | `personal-tracking-service` | (neutral `fleet-core-service`) |
| Calendar | `personal-calendar-service` | (neutral `calendar-core-service`) |
| Patient | (neutral `patient-core-service`) | (neutral `patient-core-service`) |

Planned or scaffolded variants such as CRM, HR, e-sign, conversion, cases, and
projects live in the repository, but the docs and gateway treat them as active
only when their generated route and port entries are present.

## Calling a service

Every service is reached the same way: through the API gateway, under a
versioned `/api/v1/<domain>` path, with an OIDC bearer token (health endpoints
excepted).

```bash
# Unauthenticated liveness probe.
curl -i https://api.example.com/api/v1/identity/healthz

# Authenticated read.
curl https://api.example.com/api/v1/tenancy \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

The full path convention and authentication details are in the
[API reference](../api/index.md). The durable event topics each service
publishes are described in [Event contracts](../events/index.md).

## Local routed services and ports

The local stack gateway listens on port `4100`. Service ports below come from
`ops/dev/local-stack/svc-ports.txt`; route domains come from the generated
`ops/dev/local-stack/route-map.txt`.

| Service | Local port | Gateway domains |
| --- | --- | --- |
| `accounting-core-service` | `4001` | `/api/v1/accounting`, `/api/v1/payouts` |
| `audit-core-service` | `4002` | `/api/v1/audit` |
| `automation-core-service` | `4003` | `/api/v1/automation`, `/api/v1/connectors`, `/api/v1/flows`, `/api/v1/automation-runs`, `/api/v1/services`, `/api/v1/templates` |
| `business-automation-service` | `4004` | `/api/v1/business-automation` |
| `business-donation-service` | `4005` | `/api/v1/campaigns`, `/api/v1/donors`, `/api/v1/donation-summary`, `/api/v1/donation-activity` |
| `business-site-service` | `4006` | `/api/v1/builder`, `/api/v1/business-site` |
| `business-workflow-service` | `4007` | `/api/v1/workflow`, `/api/v1/bpm`, `/api/v1/process-definitions` |
| `calendar-core-service` | `4008` | `/api/v1/calendar` |
| `clinical-doc-service` | `4009` | `/api/v1/healthstack-clinical-docs`, `/api/v1/clinical` |
| `commerce-core-service` | `4010` | `/api/v1/checkout`, `/api/v1/catalog`, `/api/v1/commerce` |
| `donation-core-service` | `4011` | `/api/v1/donations`, `/api/v1/causes`, `/api/v1/receipts`, `/api/v1/recurring` |
| `fleet-core-service` | `4012` | `/api/v1/fleet`, `/api/v1/vehicles`, `/api/v1/dispatch`, `/api/v1/maintenance`, `/api/v1/crew`, `/api/v1/trips`, `/api/v1/fleet-alerts`, `/api/v1/fleet-summary` |
| `geospatial-core-service` | `4013` | `/api/v1/geospatial` |
| `healthstack-billing-service` | `4014` | `/api/v1/healthstack-billing` |
| `healthstack-consent-service` | `4015` | `/api/v1/consent` |
| `healthstack-messaging-service` | `4016` | `/api/v1/healthstack-messaging` |
| `identity-service` | `4017` | `/api/v1/identity`, `/api/v1/users`, `/api/v1/account` |
| `inventory-core-service` | `4018` | `/api/v1/inventory` |
| `notify-service` | `4019` | `/api/v1/notify`, `/api/v1/communications` |
| `orders-service` | `4020` | `/api/v1/orders`, `/api/v1/healthstack-orders`, `/api/v1/shop-orders` |
| `patient-core-service` | `4038` | `/api/v1/patients`, `/api/v1/patient`, `/api/v1/contracts` |
| `personal-calendar-service` | `4021` | `/api/v1/personal-calendar` |
| `personal-donation-service` | `4022` | `/api/v1/giving` |
| `personal-notes-service` | `4023` | `/api/v1/notes`, `/api/v1/folders` |
| `personal-shop-service` | `4024` | `/api/v1/shop`, `/api/v1/personal-shops` |
| `personal-site-service` | `4039` | `/api/v1/studio` |
| `personal-tracking-service` | `4025` | `/api/v1/tracking`, `/api/v1/trackers`, `/api/v1/personal-tracking`, `/api/v1/goals` |
| `personal-workflow-service` | `4037` | `/api/v1/pworkflow-flows`, `/api/v1/pworkflow-runs`, `/api/v1/pworkflow-templates`, `/api/v1/pworkflow-dashboard`, `/api/v1/personal-workflow` |
| `plugin-runtime-service` | `4026` | `/api/v1/plugins` |
| `procurement-core-service` | `4027` | `/api/v1/procurement` |
| `reports-service` | `4028` | `/api/v1/reports`, `/api/v1/analytics`, `/api/v1/ops` |
| `sales-core-service` | `4029` | `/api/v1/sales` |
| `scheduling-service` | `4030` | `/api/v1/healthstack-scheduling`, `/api/v1/scheduling` |
| `settings-service` | `4031` | `/api/v1/settings` |
| `site-core-service` | `4032` | `/api/v1/site` |
| `storage-service` | `4033` | `/api/v1/storage` |
| `tasks-core-service` | `4034` | `/api/v1/personal-tasks`, `/api/v1/clinical-tasks` |
| `tenancy-core-service` | `4035` | `/api/v1/tenancy` |

## Contract coverage for routed services

Service-local contracts live under `backend/services/<service>/specs/`. SDK
configs live under `backend/packages/*-sdk/openapi-ts.config.ts`.

| Service | TypeSpec | AsyncAPI | SDK config |
| --- | --- | --- | --- |
| `accounting-core-service` | Yes | Yes | No |
| `audit-core-service` | No | No | No |
| `automation-core-service` | Yes | Yes | No |
| `business-automation-service` | Yes | Yes | No |
| `business-donation-service` | Yes | Yes | No |
| `business-site-service` | Yes | Yes | No |
| `business-workflow-service` | Yes | Yes | No |
| `calendar-core-service` | Yes | Yes | `calendar-sdk` |
| `clinical-doc-service` | Yes | Yes | `clinical-doc-sdk` |
| `commerce-core-service` | Yes | Yes | No |
| `donation-core-service` | Yes | Yes | No |
| `fleet-core-service` | Yes | Yes | No |
| `geospatial-core-service` | Yes | Yes | No |
| `healthstack-billing-service` | Yes | Yes | No |
| `healthstack-consent-service` | Yes | Yes | No |
| `healthstack-messaging-service` | Yes | Yes | No |
| `identity-service` | Yes | No | No |
| `inventory-core-service` | Yes | Yes | No |
| `notify-service` | Yes | Yes | `notify-sdk` |
| `orders-service` | Yes | Yes | `orders-sdk` |
| `personal-calendar-service` | Yes | Yes | No |
| `personal-donation-service` | Yes | Yes | No |
| `personal-notes-service` | Yes | Yes | No |
| `personal-shop-service` | Yes | Yes | No |
| `personal-tracking-service` | Yes | Yes | No |
| `personal-workflow-service` | Yes | Yes | No |
| `plugin-runtime-service` | Yes | Yes | No |
| `procurement-core-service` | Yes | Yes | No |
| `reports-service` | Yes | Yes | `reports-sdk` |
| `sales-core-service` | Yes | Yes | No |
| `scheduling-service` | Yes | Yes | `scheduling-sdk` |
| `settings-service` | Yes | Yes | `settings-sdk` |
| `site-core-service` | Yes | Yes | No |
| `storage-service` | Yes | Yes | `storage-sdk` |
| `tasks-core-service` | Yes | Yes | `tasks-sdk` |
| `tenancy-core-service` | Yes | Yes | No |
| `patient-core-service` | No | No | No |
| `personal-site-service` | Yes | Yes | No |

## Additional contract-bearing services outside the routed stack

Some service directories already carry TypeSpec, AsyncAPI, or SDK generation
contracts but are not in the current local gateway. They become routed only when
they also appear in `svc-ports.txt` and `route-map.txt`.

| Service | TypeSpec | AsyncAPI | SDK config |
| --- | --- | --- | --- |
| `builder-core-service` | Yes | Yes | No |
| `business-shop-service` | Yes | Yes | No |
| `conversion-core-service` | Yes | Yes | No |
| `crm-core-service` | Yes | Yes | No |
| `documents-core-service` | Yes | Yes | No |
| `encounter-service` | Yes | Yes | `encounter-sdk` |
| `esign-core-service` | Yes | Yes | No |
| `event-core-service` | Yes | Yes | No |
| `hr-core-service` | Yes | Yes | No |
| `integrations-core-service` | Yes | Yes | No |
| `personal-automation-service` | Yes | Yes | No |
| `personal-crm-service` | Yes | Yes | No |
| `personal-hr-service` | Yes | Yes | No |
| `search-service` | Yes | Yes | `search-sdk` |
| `terminology-service` | Yes | Yes | `terminology-sdk` |
| `workflow-core-service` | Yes | No | No |
