# CuraOS Documentation

CuraOS (Care Oriented Stack) is a composable, self-hosted-first platform: a
generic neutral core with opt-in vertical overlays (Health, Education, ERP). It
is built so you run it on your own infrastructure, compose only the pieces you
need, and extend it through documented seams instead of forking it.

This is the customer and operator documentation: how to install it, how it is
put together, what the apps do, how to call the API, how to wire up auth, and
how to operate it day to day.

## What is running today

CuraOS is in active development (pre-1.0), but it is not vaporware. A live
deployment runs on self-hosted Kubernetes right now:

- **22 frontend app projects**: 20 web apps plus 2 Expo mobile apps. The local
  real-data render gate exercises all 20 web apps, and the public reference
  deployment exposes 19 vanity web hosts today.
- **38 routed backend services** behind the local API gateway, exposing 83
  generated gateway domains from the same `DOMAIN_ROUTE_MAP` that emits the
  local route map and the Kubernetes ingress manifest.
- **OIDC single sign-on** through Pocket-ID (Authorization Code with PKCE),
  brokered by the identity service into a CuraOS session.
- **Self-hosted runtime**: Kubernetes (k3d), CNPG-managed PostgreSQL, Valkey,
  and an ingress controller, with the public edge fronted by Caddy and
  Cloudflare.

Capability claims that are not yet generally available are called out as design
intent rather than shipped behavior.

## Start here

<div class="grid cards" markdown>

- **[Getting started](getting-started/index.md)**

    The five-minute tour: concepts, the live surfaces, and your first steps.

- **[Install (self-host)](install/index.md)**

    Deploy CuraOS on Kubernetes with CNPG, Valkey, and ingress.

- **[Architecture](architecture/index.md)**

    The layered model, the charter principles, and the real stack.

- **[Apps guide](apps/index.md)**

    What each frontend app project does and where to find the public hosts.

- **[API reference](api/index.md)**

    How to call the API gateway, and the path convention.

- **[Services catalogue](services/index.md)**

    Every service, grouped by layer, with its path prefix.

- **[Auth setup](auth/index.md)**

    Pocket-ID OIDC and the Authorization Code + PKCE flow.

- **[Security & compliance](security/index.md)**

    The security model, GDPR and HIPAA posture, and the PHI boundary.

</div>

## Charter, in one paragraph

Self-hosted first, generic before vertical, composable, builder-led, and
event-led. Multi-tenant from one codebase, with tenant data isolation as a
core boundary: PHI and PII stay in overlay schemas, never in the neutral core.
Every deployment model (cloud SaaS, on-prem, hybrid, home-lab/air-gap) is meant
to ship from the same artifacts.

The full architecture and the principles behind it are in
[Architecture](architecture/index.md).
