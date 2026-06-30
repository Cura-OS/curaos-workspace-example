# Getting started

This page is the short tour: the core concepts, the live surfaces you can open
right now, and where to go next depending on whether you want to use CuraOS or
host it yourself.

## Concepts in five minutes

CuraOS is a **platform**, not a single application. Three ideas hold it together:

1. **Neutral core before vertical.** A generic core provides reusable
   capabilities (identity, tenancy, party, audit, notify, search, storage,
   calendar, tasks, documents, commerce, and more). Vertical overlays
   (HealthStack, EducationStack, ERP) extend the core; they never fork it.

2. **Builder-led experiences.** Apps are composed through a workflow/BPM engine
   and an app/site builder. Behavior is configured against documented seams,
   so you change what the system does without hand-forking code.

3. **Event-led integration.** Services talk through durable, versioned events
   first, with synchronous APIs second. This keeps services loosely coupled and
   makes the system safe to extend.

The dependency direction is always **vertical to neutral, never the reverse**.
That single invariant is what keeps the core reusable across markets.

## See it running

These are live, reachable surfaces. Sign-in is OIDC through Pocket-ID; some
apps require an account.

| Surface | URL | What it is |
| --- | --- | --- |
| Admin | `https://admin.example.com` | Tenant and platform administration |
| Builder | `https://builder.example.com` | App and site builder |
| Front office | `https://front-office.example.com` | Staff operations desk |
| API gateway | `https://api.example.com` | Entry point to versioned `/api/v1` domains |
| Sign in | `https://login.example.com` | Shared OIDC sign-in surface |

A full list of every app is in the [Apps guide](../apps/index.md).

### Reach the platform

The API gateway routes to each service under a path prefix, and the apps reach it
over the same host. The fastest confirmation that the platform is up is to open
any app subdomain above and complete the OIDC sign-in: a successful redirect
through Pocket-ID and back into a CuraOS session exercises the gateway, the
identity broker, and the app together.

The current local reference stack routes 38 services through the gateway and
exposes 83 generated `/api/v1` domains. See the
[API reference](../api/index.md) for the path convention and the
[Services catalogue](../services/index.md) for services, ports, and domains.

## Choose your path

=== "I want to use CuraOS"

    Open the apps above, sign in through Pocket-ID, and explore. The
    [Apps guide](../apps/index.md) explains what each app is for. If you are
    integrating an external system, read [Integration](../integration/index.md).

=== "I want to host CuraOS"

    Read [Install (self-host)](../install/index.md) for the Kubernetes deployment
    (CNPG Postgres, Valkey, ingress), then [Auth setup](../auth/index.md) to wire
    up Pocket-ID, and [Operations](../operations/index.md) for day-2 runbooks.

=== "I want to understand the design"

    Read [Architecture](../architecture/index.md) for the layered model and the
    charter, and [Capabilities](../capabilities/index.md) for what the core and
    overlays provide.

## Status and expectations

CuraOS is pre-1.0 and under active development. The live deployment above is
real, but the platform is hardening along its roadmap: not every deployment
profile is proven at scale yet, and APIs may still change within their versioned
deprecation windows. Where a capability is planned rather than shipped, the docs
say so.
