# RFC-0001: CuraID — Identity and Access Platform

> **Status: SUPERSEDED (2026-05-24).** This RFC captures the pre-pivot Flutter/Kotlin-Spring plan. Current stack is NestJS + React Native (Expo) + Next.js per [[curaos-nestjs-docs-first-rule]] + [[curaos-bun-primary-rule]]. Path references like `curaos-apps/packages/cura_os/<snake>` describe a layout that NO LONGER exists — current layout is `curaos/frontend/apps/<kebab>` + `curaos/frontend/packages/<kebab>`. Kept for historical record per [[curaos-knowledge-persistence-rule]] L6. Concrete CuraID identity-service rewrite tracked in ADR-0120 (0120-foundation-auth.md — NestJS Auth foundation).

## Status
Superseded by ADR-0120 (0120-foundation-auth.md — NestJS Auth foundation) — Flutter/Kotlin-Spring plan retained for archaeology only.

## Owners
- CuraOS Architecture Team (workspace steward: Agent — CuraOS)
- Service maintainers: Agent — identity-service (root)

## Created
2025-10-08

## Summary
CuraID is the identity and access management (IAM) capability that anchors tenancy, authentication, and authorization across CuraOS. It replaces the interim use of third-party IAM stacks (Keycloak, FusionAuth) with a Kotlin/Spring Boot service (`backend/services/identity-service`) and companion Flutter experiences (`frontend/curaos-apps/packages/cura_os/hosted_login`, `.../admin_app`) that align with CuraOS design guardrails. The platform ships both as a standalone product and as the identity microservice inside CuraOS deployments.

## Problem Statement
Keycloak and FusionAuth provide comprehensive IAM features but introduce heavy customisation surfaces, limited Kotlin-first extension seams, and duplicated user flows between business and personal overlays. CuraOS requires a native, event-led identity service that can operate as an independent product while integrating cleanly with multitenant microservices, Flutter micro-products, and the shared workflow/builder tooling without forking.

## Goals
- Standards-first protocol coverage: OIDC, OAuth 2.1, SAML 2.0, SCIM 2.0, WebAuthn/FIDO2, and session/token hygiene that passes conformance suites referenced in `backend/services/identity-service/Requirements.md`.
- Treat multi-tenancy as a first-class concern with SaaS (per-tenant schema) and on-prem (single schema) profiles, driven by the tenancy routing design already documented in the identity service README.
- Kotlin/Spring Boot microservice that embraces DDD and event-driven patterns consistent with the CuraOS backend charter, including append-only audit ledgers and Kafka-first integration points.
- Flutter-based Admin Console, Hosted Login, and Self-Service Portal built from the existing `frontend/curaos-apps/packages/cura_os/*` packages, shareable across personal/business/HealthStack overlays.
- Extensible, observable, and developer-friendly APIs/SDKs (Kotlin, Dart, JS/TS, Go) published through the shared docs automation (`make docs`) and discoverable in the workspace codex metadata.

## Non-Goals
- Support for proprietary or non-standard identity protocols outside the listed specs.
- Ownership of billing, licensing, or entitlements beyond identity, tenancy, and policy scopes.

## Architecture
| Layer | Scope | CuraOS anchor |
| ----- | ----- | ------------- |
| Core Service | Kotlin + Spring Boot microservice structured around domain modules (Tenant, Identity, Credential, Session, Client, Policy, Federation, Audit, Settings) | `backend/services/identity-service` |
| Protocol Gateway | OIDC/OAuth2 token services, discovery endpoints, SAML bindings | `backend/services/identity-service/apps/api` |
| Flow Orchestrator | Extensible login/registration/MFA pipeline with policy hooks | `backend/services/identity-service/apps/api`, `frontend/curaos-apps/packages/cura_os/hosted_login` |
| Sync Service | SCIM 2.0 provider/consumer, LDAP bridge, workspace automation integration | `backend/services/identity-service/apps/api`, Kafka events |
| UI Layer | Flutter Admin Console, Self-Service Portal, embeddable widgets | `frontend/curaos-apps/packages/cura_os/admin_app`, `hosted_login`, `ui_kit` |
| Event Bus | Kafka topics (`identity.users.v1`, `identity.sessions.v1`, `identity.audit.v1`, `identity.scim.v1`) | `docker-compose.yml`, workspace Kafka conventions |
| Storage | Postgres (primary), Redis (cache/sessions), MinIO (attachments), optional external KMS | Compose profiles + Helm charts (ops/helm/curaid TBD) |

## Key Features
- Multi-tenancy with delegated administration, per-tenant branding, and locale customisation.
- Standards compliance: OIDC/OAuth 2.1, SAML 2.0, SCIM 2.0, WebAuthn, MFA (TOTP, WebAuthn, recovery codes).
- Policy surface that unifies RBAC (roles, scopes) and ABAC (attributes, contextual claims) with tenancy-aware enforcement.
- Federation with external IdPs (OIDC, SAML, LDAP) including just-in-time linking/provisioning, audit trails, and revocation flows.
- Event-sourced audit trail with hash-chaining aligned to platform observability requirements (OTLP traces, Prometheus metrics, ECS JSON logs).
- SDKs maintained alongside the service to unblock Kotlin-based microservices, Flutter micro-products, Node/JS clients, and Go automation tooling.
- Theming and white-label support for hosted login and admin surfaces driven by shared UI kits.

## Developer Experience
- REST (OpenAPI 3.1) and GraphQL Admin APIs with persisted queries and schema documentation generated through `make docs`.
- CLI tool (`curaid`) for tenant setup, key rotation, import/export flows that can be distributed as part of developer tooling (future package under `frontend/curaos-apps/packages/cura_os/api_client`).
- TDD pipeline anchored on JUnit 5, Testcontainers, Spring security test suites, and OIDC conformance harnesses, executed via Gradle tasks.
- Workspace automation ensures codex metadata (`backend/services/identity-service/codex.json`) and documentation (`docs/rfcs`, `docs/submodules`) stay in sync during CI generation.

## Integration Points
- Ships as Git submodule `backend/services/identity-service` with automation entries in `settings.gradle.kts` and workspace scripts.
- Emits Kafka events (`identity.*`) consumed by downstream services (e.g., `backend/services/org-service`, `backend/services/notify-service`) and Flutter packages (via WebSockets or GraphQL subscriptions).
- Consumed by Flutter frontends through shared packages `frontend/curaos-apps/packages/cura_os/hosted_login`, `.../admin_app`, and `.../api_client`.
- Coordinates with tenancy and policy modules across the platform: onboarding flows integrate with `backend/services/org-service`, while automation hooks publish to workflow engines (`backend/services/workflow-core-service`).

## Deployment Profiles
- **Local:** Docker Compose (`docker-compose.yml`) using Postgres, Redis, Kafka, Mailpit, MinIO, and default keys seeded via Make targets.
- **On-Prem:** Helm chart (`ops/helm/curaid`, forthcoming) with sealed secrets, ingress, and optional external KMS/HSM integration.
- **SaaS:** Multi-region with external KMS, dedicated audit export pipelines, and tenant isolation enforcement via header/claim routing.

## Roadmap
| Phase | Scope | Notes |
| ----- | ----- | ----- |
| R1 | Tenants, users, OIDC core, sessions, admin API/UI, audit events | Aligns with current `Requirements.md` acceptance criteria; required for Compose stack parity. |
| R2 | MFA, WebAuthn, federation (OIDC), SCIM provider | Enables migration from external IdPs; unlocks HealthStack pilots. |
| R3 | SAML IdP/SP, LDAP sync, ABAC policies, risk controls | Introduces adaptive policies for regulated overlays. |
| R4 | SCIM consumer, delegated admin, analytics, theming marketplace | Completes multi-directional provisioning and white-label expansion. |

## Impact
- **Backend:** identity-service is authoritative for authentication, tokens, and tenancy metadata. Other services depend on published events and policy assertions.
- **Frontend:** hosted login, admin, and self-service apps unify branding and reduce duplicate authentication UI work across overlays.
- **Ops:** introduces standard secrets management, key rotation, and identity lifecycle automation. Requires updates to infrastructure scripts and Helm charts.
- **Docs/Automation:** new RFC becomes baseline reference for future identity changes; codex metadata informs Codex CLI workflows and repository scaffolding.

## Open Questions
- How aggressively should we prioritise ABAC + risk signals (device, geo) before R3?
- Do we vend SDKs from this repo or individual language-specific repositories with workspace references?
- What level of out-of-the-box analytics (sign-in funnels, MFA enrollment, tenant usage) is expected by SaaS vs. on-prem adopters?

## References
- `backend/services/identity-service/README.md`
- `backend/services/identity-service/Requirements.md`
- `frontend/curaos-apps/packages/cura_os/hosted_login/README.md` (future)
- Keycloak documentation — https://www.keycloak.org/docs/latest/
- FusionAuth documentation — https://fusionauth.io/docs/
- Zitadel documentation — https://zitadel.com/docs
- Ory Stack documentation — https://www.ory.sh/docs

## Codex Artifact
The RFC is paired with `backend/services/identity-service/codex.json` so agents can rapidly discover language, tooling, and protocol coverage for CuraID.
