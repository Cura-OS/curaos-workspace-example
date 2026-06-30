# ADR-0104: Identity / Auth (OIDC, SCIM, MFA, RBAC/ABAC, audit)

> **🚫 SUPERSEDED** by [ADR-0120 Foundation Auth](0120-foundation-auth.md). CuraOS Auth = pure NestJS (Better Auth + SimpleWebAuthn + SAML + Passport + SCIM + ported SMART-on-FHIR + 3-layer AuthZ). Keycloak removed from foundation. This ADR's option scan + research stand as historical artifact.


## Status

Superseded by [ADR-0120](0120-foundation-auth.md). Date: 2026-05-24.

---

## Context

Identity is the load-bearing foundation for all 91 backend services in CuraOS. Every service call, every tenant-scoped resource, every PHI access, and every privileged action routes through the identity plane. Getting this wrong creates cascading compliance failures across HealthStack (HIPAA), ERP (SOX-adjacent), and all SaaS tenants (GDPR).

The central tension is **build vs. buy**. Building a custom OIDC/SAML/SCIM/WebAuthn stack on Kotlin + Spring Authorization Server is entirely possible — Spring's ecosystem covers most primitives — but the engineering surface is enormous, the audit burden is high, and the security risk of custom cryptographic flows is non-trivial. Conversely, embedding a third-party IdP requires accepting its operational model, licensing constraints, and extensibility limits. The right answer is almost certainly a hybrid: pick the best-of-breed open-source IdP for auth mechanics, then build only the thin integration layer (SMART-on-FHIR scopes, hash-chained audit, break-glass flows) that no IdP ships out of the box.

**Already committed (upstream ADRs):**
- Kotlin + Spring Boot 3.4, JVM 21 (ADR-0100)
- PostgreSQL 17, Valkey 8.x, SeaweedFS (ADR-0101)
- Kafka 4.x / NATS JetStream, Debezium, Apicurio (ADR-0102)
- Spring MVC + DGS/Cosmo GraphQL, APISIX gateway, HAPI FHIR (ADR-0103)

**Topology:** identity-service is one of 91 submodules. It is special: every other service depends on tokens it issues. Single point of failure risk is highest here. Deployment models (SaaS, on-prem, air-gap) all apply.

---

## Forces / Requirements

### Protocol surface
- OAuth 2.1 + PKCE as baseline for all clients (no implicit flow, no password grant except device)
- OIDC 1.0 for identity federation and ID tokens
- SAML 2.0 for enterprise IdP federation (common in healthcare: Epic, Cerner, hospital AD)
- SCIM 2.0 for org/user provisioning sync (HR systems, Azure AD, Okta)
- LDAP/AD bridge for on-prem customers still running Active Directory
- SMART App Launch 2.x for HealthStack clinical applications (patient/*.*, user/*.*, system/*.* scopes)
- Back-channel logout (OIDC Session Management spec) for federated logout propagation
- Token introspection endpoint (RFC 7662) for service-to-service validation

### MFA / credential security
- TOTP (RFC 6238) as baseline MFA
- WebAuthn / FIDO2 — hardware keys (YubiKey) + platform passkeys — as primary strong auth
- SMS OTP explicitly excluded: NIST SP 800-63B deprecated SMS as restricted authenticator; HIPAA enforcement patterns treat SMS as insufficient for PHI access
- Backup recovery codes
- Step-up authentication for privileged operations (break-glass, privilege escalation)
- Argon2id password hashing with per-user salt + server-side pepper (stored separately from DB)

### Tenant model
- Per-tenant brand isolation: logo, color scheme, login copy, email templates
- Per-tenant IdP federation: each tenant can bind its own corporate IdP (SAML or OIDC)
- Per-tenant policies: session timeout, MFA enforcement, allowed auth methods
- Per-tenant key material: JWT signing keys rotatable per tenant
- Tenant data isolation enforceable at IdP level, not just application level

### Access control
- RBAC: role→permission mapping for org-level operations (nurse, admin, billing, etc.)
- ABAC layer for policy-driven decisions (attribute-based: department, clearance level, data classification)
- Consent-based ReBAC for PHI: patient X consents to doctor Y accessing record Z
- Privilege escalation: request → approval workflow → time-bounded elevated role
- Break-glass / emergency access: HIPAA requires mechanism + mandatory logging with reason

### Audit
- Per-session PHI access logging (HIPAA §164.312(b))
- Auto-logoff after configurable inactivity (HIPAA §164.312(a)(2)(iii))
- Tamper-evident audit log (hash-chained)
- Every privileged escalation and break-glass access logged with actor, reason, time window
- Audit log queryable by tenant, actor, resource, time range
- Long-term retention (HIPAA: 6 years)

### Operational constraints
- Air-gap operation: no external CRL fetches, no remote metadata URL discovery, no cloud-based CDN for UI assets
- Multi-region: JWT issuer URL must be tenant-addressable; JWKS cached at gateway
- SAML metadata exchange via file upload in air-gap, not URL
- LDAP/AD failure modes: cache last successful sync; fall-back to local credentials after timeout
- Token caching: Valkey for JWKS, introspection responses, session state
- HSM or Vault Transit for key material in regulated deployments

---

## Decision Drivers (Weighted)

| Driver | Weight | Rationale |
|---|---|---|
| Multi-tenant isolation + scaling | 10 | 91 services, SaaS profile may reach thousands of tenants |
| Protocol coverage (OIDC + SAML + SCIM + LDAP) | 10 | All required; missing one means custom build |
| SMART-on-FHIR support | 9 | HealthStack cannot ship without it |
| Air-gap / self-hosted completeness | 9 | Core charter constraint |
| WebAuthn / FIDO2 maturity | 8 | HIPAA strong-auth requirement |
| License alignment with SaaS distribution | 8 | Must allow tenants to use without license fee per seat |
| HIPAA-specific features (auto-logoff, PHI audit) | 8 | Non-negotiable for HealthStack |
| Kotlin/Spring integration quality | 7 | Reduces glue code; Spring Security OIDC resource server is mature |
| UI customization (branded login per tenant) | 7 | SaaS table-stakes feature |
| CVE history and patch cadence | 7 | IdP = highest-value attack surface |
| OpenTelemetry / observability coverage | 6 | Required for distributed tracing across all 91 services |
| Operational footprint (memory, startup, container size) | 6 | On-prem + air-gap: fewer resources available |
| Community pulse + commercial backing | 5 | Reduces bus-factor risk |
| Learning curve | 4 | Team already knows Spring; IdP-specific ops is new regardless |

---

## Sub-decision 1: Identity Provider / Auth Server

### Overview: Build vs. Buy

Before evaluating options, the core question: should identity-service be custom-built on Kotlin + Spring, or should it embed / sidecar a purpose-built IdP?

**Custom build cost estimate:** Full OIDC 1.0 + OAuth 2.1 + SAML 2.0 SP and IdP + SCIM 2.0 server + WebAuthn + LDAP bridge + branded login UI + multi-tenant realm isolation + step-up auth + break-glass + SMART scopes + audit = 12–24 months of dedicated security-engineering time, with ongoing CVE exposure in custom cryptographic and protocol code. Spring Authorization Server handles the OAuth/OIDC core, but SAML, SCIM, WebAuthn, and SMART require additional libraries or hand-rolled implementations.

**Embed/sidecar cost:** Ops overhead to run and upgrade the IdP. Integration cost to wire it into Kotlin/Spring services. Customization within IdP's extension model. Typically 4–8 weeks to initial production-ready state.

The analysis below covers 10 options. All options evaluated assume self-hosted deployment.

---

### Option A: Custom Build — Kotlin + Spring Authorization Server

**What it is:** Spring Authorization Server 1.4 provides OAuth 2.1 + OIDC 1.0 issuer. Add Spring Security SAML2 for SP/IdP bridge, webauthn4j for FIDO2, WSO2 SCIM2 library or custom for SCIM server, UnboundID LDAP SDK for directory bridge.

**Adoption signal:** Spring Authorization Server (SAS) is actively maintained by the Spring team, saw 1.3 and 1.4 releases in 2024–2025. Used by organizations wanting full in-house control. Not a market-leading deployment for multi-tenant SaaS IdP use cases.

**Strengths:**
1. Full ownership — no third-party operational footprint or licensing risk
2. Native Kotlin/Spring integration — no protocol translation layer at the service boundary
3. Can colocate in existing JVM process or run as dedicated service
4. Fine-grained control over token claims, session lifecycle, and audit hooks
5. Spring ecosystem tooling (Spring Security tests, Testcontainers, etc.) applies directly
6. Can evolve authorization model freely (RBAC → ABAC → ReBAC) without IdP constraints

**Weaknesses:**
1. **Scope explosion:** SAML 2.0 IdP is not provided by SAS — Spring Security SAML2 is SP-side only. Building a SAML IdP from scratch is a multi-month engagement
2. **SCIM 2.0 server** not available in SAS — must be hand-rolled or adapted from poorly-maintained libraries
3. **WebAuthn / FIDO2** via webauthn4j works but requires building the full ceremony flow, attestation verification, credential storage, and admin UI
4. **Branded login UI** per tenant requires building a configurable frontend from scratch
5. **Security audit surface** — every custom protocol handler is a potential CVE vector; SAS itself has had lower CVE count but the surrounding custom code has none
6. **Time to production** — realistic estimate 12–18 months to reach feature parity with mature IdPs; during this time HealthStack is blocked
7. **No upstream community** for the custom SAML/SCIM/WebAuthn layers — all maintenance is internal

**Multi-tenant scaling:** Tenant isolation is application-level only (claims in token, application-enforced DB separation). Branded login requires custom routing logic.

**SMART-on-FHIR:** Must be built as a custom token mapper and scope handler on top of SAS. No existing reference implementation.

**Air-gap:** Fully compatible — no external dependencies by design.

**CVE history:** Spring Authorization Server itself: low CVE count. Custom code around it: unknown — the risk is in what you build, not the framework.

**Verdict:** Maximum control, maximum time cost, maximum ongoing security maintenance burden. Appropriate only if the team has dedicated IAM security engineers and 18+ months before HealthStack launch. **Rejected as primary path** for initial delivery; revisit for long-term migration after IdP is stabilized.

---

### Option B: Keycloak (Red Hat)

**What it is:** Apache 2.0 licensed, Java-based (migrated to Quarkus since v17). Most widely deployed self-hosted IdP. Backed by Red Hat.

**Adoption signal:** 20k+ GitHub stars. Deployed by Red Hat itself, Deutsche Telekom, Banco do Brasil, and thousands of enterprises. CNCF sandbox project (as of 2023). Multiple managed Keycloak vendors (Phase Two, SkyCloak, Cloud-IAM). Largest open-source IdP community. 25 CVEs in 2024, 16 in 2025 (avg severity 5.1/10).

**Protocol coverage:** OIDC 1.0, OAuth 2.1 (with PKCE), SAML 2.0 IdP + SP, SCIM 2.0 (experimental as of April 2026 — focused on Entra ID compat), LDAP/AD federation, WebAuthn/FIDO2 (native since v9), TOTP, social login. Back-channel logout supported. Token introspection endpoint native.

**Multi-tenancy:**
- **Realm-per-tenant** (traditional): Practical ceiling is ~50–100 realms before admin console performance degrades and memory pressure increases. Keycloak 26.4 benchmarks indicate 1,000+ realms are possible with cache tuning (realms cache size = 4× concurrent realms), but operational complexity is high at that scale.
- **Organizations model** (Keycloak 26+, GA): First-class SaaS multi-tenancy within a single realm. Each organization has its own members, roles, per-org IdP federation, invitation flows. Phase Two's `keycloak-orgs` extension extends this further. This is the recommended model for SaaS profiles with hundreds of tenants.
- **Hybrid:** Enterprise customers on dedicated realms; SMB/mid-market on shared realm with Organizations.

**Benchmarks (v26.4 official):**
- 1 vCPU → 15 password logins/sec sustained
- 1 vCPU → 120 refresh token requests/sec
- Max tested: 2,000 logins/sec + 10,000 token refreshes/sec on c8g.24xlarge + db.r8g.16xlarge
- Pod memory: 4–8 GB depending on load and cache size
- Quarkus migration (~v17+): ~50% reduction in startup time and memory vs. WildFly

**SMART-on-FHIR:**
- **Alvearie (IBM) extension** (`keycloak-extensions-for-fhir`): Provides SMART App Launch v1 authenticator, patient context narrowing, `aud` parameter validation. Reference implementation used in IBM FHIR Server.
- **zedwerks/keycloak-smart-fhir**: Actively maintained SPI extension for SMART on FHIR EHR-Launch. Supports launch context, patient scopes.
- **APISIX integration**: APISIX OIDC plugin validates SMART scopes via Keycloak introspection; documented reference at rob-ferguson.me with HAPI FHIR.
- Best-supported SMART-on-FHIR ecosystem among all options evaluated.

**Branded login UI:** Keycloakify (React-based Keycloak theme builder) enables full per-realm branded login pages. Organization-level theme customization added in 26+.

**Kotlin/Spring integration:** Spring Security OIDC resource server + Keycloak Spring adapter (or standard Spring Security OAuth2 client). Kotlin admin client (`keycloak-admin-client`) available. Standard, well-documented pattern.

**CVE history (notable):**
- CVE-2024-3656: Broken access control — low-privilege users could call admin endpoints (fixed in 24.0.5)
- CVE-2025-12110: Refresh token accepted after offline_access scope removal
- Debug mode binding JDWP to all interfaces
- XSS via wildcard redirect URI
- Patch cadence: ~monthly releases; Red Hat provides long-term support for enterprise customers
- Concern: CVE volume is higher than smaller IdPs, partly because attack surface is larger and Keycloak is more heavily pen-tested

**Observability:** Metrics via Micrometer (Prometheus endpoint), OpenTelemetry traces via Quarkus OTel extension. Structured logging. Keycloak Event SPI for publishing auth events to Kafka.

**Weaknesses:**
1. **SCIM 2.0 server** only experimental as of April 2026 — must use community extension (keycloak-scim-server, SCIM for Keycloak plugin) until official support matures
2. **CVE volume** is highest of any option (25 in 2024) — requires diligent patching strategy
3. **Admin UI complexity** — steep learning curve for ops teams
4. **Java/Quarkus footprint** — 4–8 GB RAM per pod is significant for small on-prem deployments
5. **Custom SPI development** requires Java (not Kotlin-friendly by default); Kotlin SPIs compile to JVM and work but are not idiomatic
6. **Realm-per-tenant model** does not scale past ~100 realms without tuning; Organizations model is newer (GA in 26) and less battle-tested at scale

**Air-gap:** Fully supported. Metadata file upload for SAML (no URL fetch required). LDAP/AD bridge works offline. No external call-outs required.

**Recommendation fit:** **Strong candidate for SaaS profile.** Best ecosystem for SMART-on-FHIR. Organizations model solves multi-tenancy. Largest community. SCIM immaturity is a near-term gap.

---

### Option C: Authentik (Authentik Security GmbH)

**What it is:** MIT/BSL-licensed (core features MIT; enterprise features BSL requiring subscription). Python + Django + Celery backend, PostgreSQL + Redis required. Self-hosted-first design.

**Adoption signal:** 15k+ GitHub stars. Rapidly growing in self-hosted community. Enterprise tier launched; competing with Okta/Entra for organizations migrating off managed IdPs. ~200 contributors. 2025.10 release added Single Logout (SLO) for SAML and OIDC.

**Protocol coverage:** OIDC 1.0, OAuth 2.0, SAML 2.0 IdP, LDAP provider, RADIUS provider, WebAuthn/FIDO2 (passkeys + hardware keys), TOTP. SCIM 2.0 outbound sync (push to downstream). Inbound SCIM provisioning: limited. Back-channel logout: added 2025.10. Mutual TLS login added 2025.

**Multi-tenancy:** Organizations feature added for enterprise tier. Flow-based customization per tenant. Per-org login pages via Blueprints. Not as mature as Keycloak Organizations for B2B SaaS at scale.

**SMART-on-FHIR:** No native SMART-on-FHIR extension. Would require custom OAuth scope mapper and launch context handling. Less ecosystem support than Keycloak.

**Branded login UI:** Flow-based UI editor. Per-tenant branding via policies. Good UX, but less mature than Keycloakify for complex branded experiences.

**Kotlin/Spring integration:** Standard Spring Security OIDC resource server. No Authentik-specific Spring adapter needed — standard JWKS validation.

**Observability:** Prometheus metrics endpoint. Limited native OTel traces (relies on gunicorn/celery instrumentation).

**CVE history:** Smaller attack surface than Keycloak; fewer CVEs historically. Python stack has its own dependency audit requirements.

**Weaknesses:**
1. **Python/Django stack** — not JVM; separate ops footprint from existing Kotlin services; Python dependency management adds complexity in air-gap
2. **Enterprise features require BSL license** — multi-org, enterprise LDAP features may require paid tier; verify terms for SaaS redistribution
3. **SMART-on-FHIR** — no support; would require substantial custom development
4. **SCIM inbound** (provisioning into Authentik) is limited compared to Keycloak
5. **Less battle-tested at scale** (>500 tenants) than Keycloak
6. **Smaller community** than Keycloak; fewer third-party integrations
7. **Redis required** — adds another managed dependency (though Valkey is already in stack)

**Air-gap:** Possible but Python pip offline mode adds operational overhead. PostgreSQL backend fits.

**Recommendation fit:** Strong for organizations without SMART-on-FHIR requirements. For CuraOS HealthStack, the absence of SMART ecosystem support is disqualifying without significant custom work.

---

### Option D: ZITADEL (Caos AG)

**What it is:** Apache 2.0 licensed (core). Go-based. Built multi-tenant SaaS-first. Event-sourced architecture on PostgreSQL (CockroachDB support dropped in 2024). Latest stable: v4.15.0 (2026-05-04). SOC 2 Type II certified.

**Adoption signal:** 10k+ GitHub stars, 200+ contributors. v4 GA announced. Growing enterprise adoption, particularly in cloud-native orgs. Smaller community than Keycloak but strong architectural coherence.

**Architecture:** CQRS + Event Sourcing on PostgreSQL. All state mutations are events; read models are projections. This gives a natural audit trail on the event store (though not specifically hash-chained). Single Go binary. v4: decoupled Go core + Next.js Login UI.

**Protocol coverage:** OIDC 1.0, OAuth 2.1, SAML 2.0, SCIM 2.0 (native), WebAuthn/FIDO2 (passkeys, hardware keys), TOTP. Device authorization flow. Back-channel logout. LDAP: external LDAP identity provider via import/sync (not a full LDAP bridge like Keycloak's user federation).

**Multi-tenancy:** Native SaaS-first model. Instances → Organizations → Projects. Organizations are first-class tenants with their own policies, IdP federations, branded login, user pools. Designed to support millions of organizations per instance. This is architecturally superior to Keycloak's realm model for SaaS scale.

**SMART-on-FHIR:** No native extension. Custom action/script approach possible via ZITADEL Actions (JavaScript-based pre/post-token hooks). Would require building SMART scope mapper and launch context handling. Less ecosystem support than Keycloak.

**Branded login UI:** v4 decoupled Next.js Login UI. Fully replaceable. Per-org branding via theming API. Good story for per-tenant customization.

**Kotlin/Spring integration:** Standard Spring Security OIDC resource server. Admin API client must be hand-crafted (no official Kotlin/Java SDK; community clients exist). gRPC API available.

**Observability:** OpenTelemetry native (Go). Prometheus metrics. Structured JSON logs.

**CVE history:** Smaller attack surface. Fewer CVEs historically. Newer codebase means less battle-tested security surface, but also fewer legacy vulnerabilities.

**Weaknesses:**
1. **SMART-on-FHIR** — no native support; custom Actions required; weaker ecosystem than Keycloak
2. **LDAP bridge** — inbound LDAP sync less mature than Keycloak user federation; may not cover all enterprise AD patterns
3. **SCIM** — native but implementation maturity vs. enterprise requirements (complex attribute mappings, group sync) needs validation
4. **Smaller ecosystem** — fewer third-party extensions, fewer ops automation scripts, fewer self-hosted guides
5. **Actions (JavaScript hooks)** — security surface for custom logic in a JVM-centric stack; Go-to-JVM interop requires API bridge
6. **No official Java/Kotlin admin SDK** — admin operations require REST/gRPC calls with hand-crafted clients
7. **v4 is relatively new** — Next.js Login UI separation is clean architecturally but adds JS ops knowledge requirement

**Air-gap:** Single Go binary + PostgreSQL. No external dependencies. Excellent air-gap story. SAML metadata file upload supported.

**Recommendation fit:** Best multi-tenant SaaS architecture of all options. PostgreSQL-native fits ADR-0101 perfectly. SMART-on-FHIR gap is solvable with custom Actions but requires work. Strong secondary candidate.

---

### Option E: Ory Stack (Kratos + Hydra + Keto + Oathkeeper)

**What it is:** Apache 2.0. Go. Composable microservices: Kratos = identity lifecycle (signup, MFA, recovery, sessions), Hydra = OAuth2/OIDC issuer, Keto = Zanzibar-style authorization, Oathkeeper = identity-aware proxy. PostgreSQL backend. Headless: you build all UI.

**Adoption signal:** Kratos 50k+ stars, Hydra 15k+ stars. Used by Segment, Sainsbury's. Production deployments documented. Ory Network managed cloud available. Strong community.

**Protocol coverage:**
- **OIDC/OAuth 2.1:** Hydra handles this; mature
- **SAML:** Hydra does NOT support SAML as an IdP. Kratos v25.4+ has some SAML support via Ory Polis (protocol translation bridge). This is a critical gap — SAML IdP capability is a hard requirement for enterprise healthcare customers
- **SCIM:** No native SCIM server. Would need to be built
- **WebAuthn/FIDO2:** Kratos supports WebAuthn (passkeys, hardware keys). Well-implemented
- **LDAP:** No native LDAP bridge. External identity provider via standard OIDC/SAML upstream only

**Multi-tenancy:** Workspace-level isolation in Ory Network. Self-hosted multi-tenancy requires running separate Kratos/Hydra instances per tenant or building tenant routing at the application layer. Not SaaS-native.

**SMART-on-FHIR:** No support. Would require building complete SMART scope layer on top of Hydra.

**Branded login UI:** Fully headless — you own 100% of the UI. Maximum flexibility, maximum build cost.

**Observability:** OTel native (Go). Prometheus. Structured logs.

**Weaknesses:**
1. **SAML IdP** — not supported in Hydra; Ory Polis (SAML bridge) is an additional service; adds operational complexity
2. **SCIM** — no native implementation required
3. **LDAP** — no native bridge; enterprise customers with AD-only auth face integration challenges
4. **Multi-tenancy** — not SaaS-native; requires per-tenant instance orchestration or application-layer tenant routing
5. **UI ownership** — building multi-tenant branded login flows from scratch is a significant frontend investment
6. **SMART-on-FHIR** — no support
7. **Glue complexity** — four services to operate (Kratos + Hydra + Keto + Oathkeeper) instead of one; distributed failure modes

**Air-gap:** Possible but requires running all four components; significantly more complex operationally.

**Recommendation fit:** Powerful for greenfield cloud-native organizations that want full customization and can afford the build cost. The SAML IdP gap and SCIM absence are blockers for CuraOS's enterprise healthcare requirements.

---

### Option F: Authelia

**What it is:** Apache 2.0. Go. Primarily a 2FA / SSO gateway in front of existing applications via reverse proxy integration. Not a full OAuth2/OIDC IdP in the same league as Keycloak or ZITADEL.

**Protocol coverage:** OIDC 1.0 (basic), WebAuthn, TOTP, Duo push. No SAML IdP. No SCIM. No LDAP server (consumes LDAP backends). Limited multi-tenant support.

**Assessment:** Authelia is purpose-built for homelab / self-hosted app SSO. It lacks SAML IdP, SCIM, multi-tenancy, and SMART-on-FHIR. **Out of scope for CuraOS** without fundamental architectural expansion.

**Verdict: Rejected.** Insufficient feature coverage for enterprise healthcare multi-tenant platform.

---

### Option G: Gluu / Janssen Project (Linux Foundation)

**What it is:** Apache 2.0. Java-based (Jans Auth Server, formerly Gluu Server). Linux Foundation incubated project (Janssen Project). Full-featured: OIDC, SAML 2.0, FIDO2, SCIM 2.0, UMA, CIBA. Historically used in healthcare interoperability.

**Adoption signal:** Strong heritage in government and healthcare identity (used in national digital ID programs). Smaller commercial community than Keycloak. Agama DSL for authentication journey orchestration. Listed as Digital Public Good.

**Protocol coverage:** OIDC, OAuth 2.0/2.1, SAML 2.0, SCIM 2.0, FIDO2, UMA (User Managed Access — relevant for patient consent), CIBA (Client Initiated Backchannel Authentication — relevant for healthcare workflows).

**SMART-on-FHIR:** Historically referenced in SMART-capable deployments. Gluu has documented SMART-on-FHIR patterns. Less active ecosystem than Keycloak extensions in 2024–2025.

**Multi-tenancy:** Configuration-level tenant separation. Less polished than Keycloak Organizations or ZITADEL Orgs.

**Weaknesses:**
1. **Community momentum declining** — Gluu Server is superseded by Janssen; transition has fragmented documentation
2. **Operational complexity** — historically required Couchbase or LDAP; Janssen moved to lighter backends but still complex
3. **Smaller ecosystem** vs. Keycloak: fewer integrations, fewer maintained extensions
4. **UI** — admin console less polished; branded login requires custom development
5. **Kotlin/Spring integration** — no official adapter; standard OIDC patterns work
6. **UMA complexity** — powerful for patient consent but steep learning curve

**Air-gap:** Documented air-gap patterns from government deployments.

**Recommendation fit:** Historically valid for healthcare identity, but Keycloak has surpassed it in ecosystem depth and community velocity. Janssen Project is a hedge — worth monitoring but not recommended as primary choice.

---

### Option H: WSO2 Identity Server

**What it is:** Apache 2.0. Java (OSGi/Carbon runtime). Enterprise-focused. OIDC, SAML 2.0, SCIM 2.0, FIDO2, OAuth 2.0, XACML (legacy ABAC), LDAP/AD federation, rich provisioning. Commercial support by WSO2 Inc.

**Adoption signal:** Large enterprise user base in banking, telecom, government. Less popular in cloud-native / self-hosted community than Keycloak. Heavy footprint.

**Strengths:**
1. Comprehensive enterprise protocol support (SCIM 2.0 native, SAML IdP mature)
2. XACML-based fine-grained authorization (legacy but functional)
3. Rich connector ecosystem for enterprise HR / ERP provisioning
4. Long track record in financial services and healthcare

**Weaknesses:**
1. **OSGi/Carbon footprint** — heaviest runtime of all options; memory-hungry
2. **UI/DX** — dated admin console; harder to customize than Keycloak
3. **Community** — smaller open-source community; mostly enterprise-adoption-driven
4. **SMART-on-FHIR** — no native extension
5. **Multi-tenancy** — supports multi-tenancy but less polished for SaaS patterns than Keycloak Organizations or ZITADEL
6. **Cost** — production support typically requires commercial contract; open-source version lags enterprise features

**Recommendation fit:** Strong for large enterprises running on-prem with existing WSO2 investment. Not the right fit for greenfield SaaS-first platform. **Not recommended.**

---

### Option I: FusionAuth (Inversoft)

**What it is:** Source-available Community tier with usage restrictions. Java-based. Multi-tenant first-class. Strong DX. Commercial product, not truly open-source.

**License concern:** FusionAuth Community Edition limits usage by MAU counts and features. SaaS redistribution (where CuraOS acts as a platform) requires commercial licensing. License terms have changed multiple times. **Air-gap deployment may require commercial license validation.**

**Strengths:** Excellent DX, clean API, multi-tenant native (Applications + Tenants model), good WebAuthn support, OIDC + SAML + SCIM.

**Weaknesses:**
1. **License** — not Apache 2.0 / MIT; SaaS redistribution terms unclear; commercial dependency
2. **Java** — JVM footprint similar to Keycloak
3. **SMART-on-FHIR** — no native support
4. **Vendor lock-in risk** — source-available means limited forking rights if vendor changes terms

**Recommendation fit:** Good product but licensing constraints conflict with CuraOS's self-hosted SaaS charter. **Rejected on license grounds.**

---

### Option J: Logto (Silverhand)

**What it is:** MPL-2.0. Node.js-based. Multi-tenant SaaS-first. Newer project (~2022). PostgreSQL backend. OIDC native. Growing community.

**Protocol coverage:** OIDC, OAuth 2.0, WebAuthn (passkeys). SAML support is limited/in progress. SCIM: no. LDAP: no.

**Assessment:** Promising for pure OIDC + passkeys SaaS identity use cases. Missing SAML IdP, SCIM, and LDAP for enterprise healthcare requirements. Node.js runtime differs from JVM stack.

**Recommendation fit:** Not suitable for CuraOS's enterprise protocol requirements. **Rejected for incomplete protocol coverage.**

---

### Option K: Managed-cloud IdPs (Auth0, Clerk, AWS Cognito, Azure AD B2C)

Listed for comparison only. All violate CuraOS's self-hosted-first charter. No external managed cloud dependency is acceptable for air-gap and on-prem profiles. Auth0 / Okta in particular are SaaS-only. **All rejected.**

---

### Comparison Matrix (IdP)

| Criterion | Custom (SAS) | Keycloak | Authentik | ZITADEL | Ory Stack | Gluu/Janssen |
|---|---|---|---|---|---|---|
| OIDC + OAuth 2.1 | Yes | Yes | Yes | Yes | Yes (Hydra) | Yes |
| SAML 2.0 IdP | Must build | Yes (mature) | Yes | Yes | Partial (Polis) | Yes |
| SCIM 2.0 Server | Must build | Experimental | Outbound only | Native | Must build | Native |
| WebAuthn / FIDO2 | webauthn4j | Native | Native | Native | Kratos | Native |
| LDAP / AD bridge | Must build | Native (user federation) | Native | Sync only | No | Native |
| SMART-on-FHIR | Must build | Via extensions | Must build | Via Actions | Must build | Limited |
| Multi-tenant (SaaS scale) | App-layer | Organizations (26+) | Orgs (enterprise) | Native (best) | Per-instance | Config-level |
| Per-tenant branding | Must build | Keycloakify | Flow editor | v4 Next.js | Must build | Must build |
| Air-gap | Full | Full | Medium (Python pip) | Full (Go binary) | Full (Go) | Full |
| PostgreSQL native | Yes | Yes (primary) | Yes | Yes (only) | Yes | Yes |
| Valkey/Redis compat | N/A | Infinispan | Redis required | Redis optional | Redis | No |
| OTel native | Spring | Via Quarkus | Limited | Yes (Go) | Yes (Go) | Limited |
| License | Apache 2.0 | Apache 2.0 | MIT/BSL | Apache 2.0 | Apache 2.0 | Apache 2.0 |
| CVE surface | Custom risk | High volume | Low | Low | Low | Medium |
| Community | Spring only | Largest | Growing | Growing | Large | Declining |
| Time to prod | 12–18 mo | 4–8 wk | 4–8 wk | 4–8 wk | 8–12 wk | 6–10 wk |

---

### Recommendation (IdP)

**Primary: Keycloak 26+ with Organizations model**

Keycloak is the recommended identity provider for the following reasons:

1. **SMART-on-FHIR ecosystem** is uniquely mature — Alvearie (IBM) and zedwerks extensions provide tested EHR-Launch and standalone-launch support with HAPI FHIR. Combined with APISIX OIDC plugin, the full HealthStack auth chain is documented and implementable in weeks, not months.

2. **Protocol completeness** — OIDC, SAML 2.0 IdP, WebAuthn/FIDO2, TOTP, LDAP user federation all native. SCIM is the only gap, addressable via community extension (keycloak-scim-server or Phase Two's extension) pending official SCIM GA.

3. **Multi-tenant model** — Keycloak 26 Organizations (GA) supports the SaaS profile. For enterprise on-prem, realm-per-major-tenant is a valid pattern. The hybrid approach (organizations for SMB/mid-market, dedicated realm for large enterprise or HIPAA-isolated tenants) aligns with deployment model §4.

4. **Keycloakify** enables full React-based branded login per realm/org — meeting the per-tenant branding requirement without bespoke frontend build.

5. **Air-gap compatibility** — Quarkus-based Keycloak runs entirely offline. SAML metadata via file upload. No external CRL or JWKS calls at runtime.

6. **Spring/Kotlin integration** — spring-security-oauth2-resource-server validates tokens against Keycloak JWKS. Keycloak admin client (Java) usable from Kotlin. Event SPI publishes auth events to Kafka for audit pipeline.

7. **Apache 2.0 license** — no SaaS redistribution constraints.

**Secondary / future consideration: ZITADEL**

ZITADEL's native org-per-tenant model, PostgreSQL-only backend (exact match with ADR-0101), Go binary simplicity, and native OTel are architecturally superior for a greenfield SaaS platform. The gaps (SMART-on-FHIR via custom Actions, LDAP sync limitations, smaller ecosystem) are solvable but add initial development cost. If the SMART-on-FHIR requirement were not present, ZITADEL would be the primary recommendation. **Recommendation: evaluate ZITADEL as primary for non-HealthStack tenant types (ERP, Education) if a split-IdP architecture is ever considered. Track ZITADEL ecosystem maturity; if SMART extensions emerge, reassess.**

**Deployment profile mapping:**

| Profile | IdP Config |
|---|---|
| SaaS (multi-tenant) | Single Keycloak cluster, Organizations model, Keycloak 26+ |
| Enterprise on-prem | Dedicated Keycloak realm per enterprise tenant, or customer-provided IdP federated via SAML/OIDC |
| Air-gap SMB | Keycloak single-node or two-node HA, realm-per-install |
| Hybrid | Vendor Keycloak control plane; customer-side LDAP/AD bridged via user federation |

**Sizing baseline (Keycloak 26.4):**
- SaaS: 2 vCPU / 6 GB RAM minimum per pod, 2+ pods for HA
- On-prem small: 2 vCPU / 4 GB RAM single node
- Cache tuning: realms cache = 4× concurrent tenants; users cache = 2× concurrent sessions

---

### Open Questions (IdP)

1. Dual-IdP consideration: run Keycloak for HealthStack tenants (SMART-on-FHIR) and ZITADEL for ERP/Education tenants? Operationally heavier but architecturally cleaner long-term.
2. What is the target tenant count at SaaS launch and at 3-year scale? This determines whether Organizations model is sufficient or dedicated realms are needed earlier.
3. Should each enterprise HIPAA customer get a dedicated Keycloak realm for maximum isolation, or is organization-level isolation (within shared realm) sufficient for HIPAA BAA coverage?
4. SCIM 2.0: use community keycloak-scim-server extension now, or wait for official Keycloak SCIM GA (in progress as of April 2026)?

---

## Sub-decision 2: Authorization Model (RBAC vs ABAC vs ReBAC)

### Context

Identity (who you are) is handled by the IdP. Authorization (what you can do) is a separate plane. CuraOS needs three overlapping permission patterns:

- **Org-level RBAC:** role = nurse, admin, billing; coarse-grained, intuitive, well-understood
- **Policy-level ABAC:** attribute-driven decisions (clearance level, department, data classification, time-of-day)
- **PHI consent-based ReBAC:** patient X consents to doctor Y accessing record Z (requires relationship graph)

No single authorization model covers all three well.

---

### Option A: RBAC via Spring Security roles + method-security

**What it is:** Spring Security `@PreAuthorize`, `hasRole()`, permission evaluators. Roles stored in Keycloak JWT claims. In-service enforcement.

**Strengths:**
1. Zero additional infrastructure — roles in token, enforcement in Spring annotations
2. Familiar to most Spring developers
3. Simple audit: role membership in JWT is self-describing

**Weaknesses:**
1. Role explosion at scale: 91 services × multiple roles × tenant customization = unmanageable permission matrix
2. Cannot express ABAC policies (time-of-day, department restrictions, data classification)
3. Cannot express consent-based PHI access (patient-granted, record-scoped)
4. Cross-service permission checks require network calls (no centralized PDP)

**Recommendation fit:** Necessary as the baseline layer. Insufficient alone.

---

### Option B: OPA (Open Policy Agent, Apache 2.0)

**What it is:** CNCF graduated project. Go-based sidecar or standalone service. Rego policy language. Decouples policy from code. Policies evaluated against JSON input (token claims + context).

**Production adoption:** Used by Netflix, Goldman Sachs, Atlassian. CNCF graduated. Large ecosystem.

**Performance:** 1–5 ms local evaluation. Sub-10 ms with sidecar pattern. Policy bundle distribution via OCI bundles or bundle server.

**Strengths:**
1. Expressive ABAC policies: time, department, clearance, data classification all expressible
2. Policy-as-code with version control, testing, CI gating
3. Multi-service: one OPA instance handles policies for N services
4. Can query Keycloak JWT claims, Kafka event context, external data via HTTP data extension
5. OpenTelemetry integration available

**Weaknesses:**
1. Rego learning curve: Prolog/Datalog-derived language is non-trivial for most engineers
2. Does not handle ReBAC / relationship-based queries natively (cannot answer "does doctor Y have consent to patient X's record Z?" without joining relationship data)
3. Policy distribution adds operational overhead
4. **August 2025: Apple hired OPA's core maintainers; OPA enterprise future uncertain.** Open Policy Foundation formed to steward OPA; community response ongoing. Risk of maintainer departure reducing velocity.

**Recommendation fit:** Strong for ABAC layer. Weak for ReBAC.

---

### Option C: Cedar (AWS, open-sourced 2023)

**What it is:** Apache 2.0. Rust-based. Formally verified policy language from AWS. Powers Amazon Verified Permissions.

**Strengths:**
1. Formally verified: mathematical guarantees on policy behavior
2. Sub-millisecond evaluation in benchmarks
3. Readable syntax (easier than Rego for most engineers)
4. Type-safe schemas enforced at validation time

**Weaknesses:**
1. Small community; limited integrations vs. OPA
2. AWS-aligned tooling creates perceived vendor dependency (even though Apache 2.0)
3. Cannot handle ReBAC natively — same limitation as OPA
4. JVM integration: Rust library; JNI or process-based evaluation required in Kotlin/Spring stack

**Recommendation fit:** Promising but ecosystem immaturity and JVM integration friction make it a secondary option. Monitor for 2027 reassessment.

---

### Option D: SpiceDB / OpenFGA (Zanzibar-style ReBAC)

**What it is:**
- **SpiceDB** (AuthZed, Apache 2.0): Go-based. ZedTokens for consistency. gRPC API. Self-hosted or managed.
- **OpenFGA** (CNCF, Apache 2.0): Evolved from Auth0 FGA. REST+gRPC. More relaxed consistency model.

**Performance:** SpiceDB: 5 ms p95 at millions of queries/sec in published benchmarks.

**Strengths:**
1. Relationship-based: perfectly models consent ("patient X grants doctor Y access to record Z via consent document C")
2. Handles hierarchical inheritance: org admin inherits all team permissions
3. Immutable audit trail (append-only relationship writes) aligns with HIPAA audit requirements
4. ZedTokens prevent New Enemy Problem (stale permission checks after consent revocation)

**Weaknesses:**
1. Centralized bottleneck: all permission checks route through SpiceDB; single point of latency
2. Cannot express ABAC policies (time-of-day, classification) — must model as relationships, which is awkward
3. Schema design (Zed schema / FGA model) requires expertise; non-trivial for complex healthcare permission hierarchies
4. Adds another infrastructure component (PostgreSQL-backed, but separate deployment)
5. gRPC-first API: Kotlin integration via protobuf-generated client; feasible but adds dependency

**Recommendation fit:** Best for PHI consent modeling. Overkill for simple org-level RBAC.

---

### Option E (Recommended): Hybrid — RBAC + OPA (ABAC) + SpiceDB (PHI Consent)

**Pattern:** Three-layer authorization stack with clean separation of concerns:

```
Layer 1 (Coarse RBAC):     Keycloak roles in JWT → Spring @PreAuthorize / method-security
                            → "Is this user a nurse in tenant X?"

Layer 2 (ABAC policy):     OPA sidecar per service group
                            → "Can billing-role access this endpoint at 2am on weekend?"
                            → "Is this data classified above user's clearance?"

Layer 3 (PHI Consent ReBAC): SpiceDB (or OpenFGA)
                              → "Does doctor Y have patient X's consent to read record Z?"
                              → Used only for HealthStack PHI endpoints
```

**Integration with Keycloak + APISIX:**
- APISIX: validates JWT + checks Keycloak-issued SMART scopes at gateway
- Service receives pre-validated JWT; Spring extracts roles for RBAC checks
- OPA sidecar: receives {user claims, endpoint, time, data attributes} → policy decision
- SpiceDB: called only by HealthStack services for PHI consent checks; not on critical path for non-health operations

**Real-world healthcare pattern:** Epic's authorization model uses role-based clinical context scoping (SMART scopes) + break-glass override + patient consent flags. This matches the three-layer approach.

**OPA risk mitigation:** Given August 2025 maintainer departure risk, evaluate **Cerbos** (Apache 2.0, Go, actively maintained, simpler than OPA, embedded or standalone mode) as OPA alternative. Cerbos uses YAML policy files, sub-millisecond evaluation in embedded mode, and does not require Rego. If OPA community stability resolves favorably, keep OPA. If not, Cerbos is the fallback.

**Comparison summary:**

| Authorization need | Solution | Notes |
|---|---|---|
| Org-level roles | Spring RBAC + Keycloak roles | In-JWT, zero infra |
| Policy-based access (ABAC) | OPA (or Cerbos fallback) | Sidecar pattern |
| PHI consent (patient-granted) | SpiceDB / OpenFGA | HealthStack only |
| Privilege escalation | Workflow-gated role assignment | Keycloak + approval-service event |
| Break-glass | Fixed "emergency" role, time-bounded | Keycloak + mandatory audit event |

---

### Recommendation

**Adopt the hybrid RBAC + OPA + SpiceDB model.**

- RBAC (Keycloak JWT roles) for all services as first layer
- OPA sidecar for ABAC policies on sensitive operations (admin functions, cross-department data, time-bounded access)
- SpiceDB for PHI consent relationships in HealthStack only
- Monitor OPA/Open Policy Foundation developments; Cerbos ready as standby
- OpenFGA preferred over SpiceDB if CNCF governance is required (OpenFGA is CNCF sandbox)

---

## Sub-decision 3: MFA / Hardware-Key Strategy

### Baseline requirements recap
- HIPAA: strong authentication required for PHI access
- NIST SP 800-63B AAL2/AAL3: hardware key achieves AAL3
- OWASP ASVS L2: TOTP minimum, hardware key recommended for privileged access

### MFA options evaluated

**TOTP (RFC 6238):**
- Baseline. Well-understood. All major authenticator apps (Authy, Google Authenticator, Bitwarden).
- Vulnerable to real-time phishing (MITM TOTP theft). Adequate for standard user sessions.
- Implementation: native in Keycloak. **Include as baseline.**

**WebAuthn / FIDO2 (passkeys + hardware keys):**
- W3C standard. Phishing-resistant: challenge is origin-bound, cannot be relayed.
- Hardware keys (YubiKey 5 Series, Google Titan): FIDO2 + PIV. Meet HIPAA AAL3.
- Platform passkeys (iOS, Android, Windows Hello): FIDO2, AAL2.
- Keycloak: native WebAuthn support since v9. `webauthn-policy` per realm, hardware key enforcement configurable.
- **Primary MFA for privileged users (admin, clinician accessing PHI).** Required for break-glass accounts.

**SMS OTP:**
- NIST SP 800-63B: designated as "restricted authenticator" — agencies must account for risks; private sector should avoid for sensitive data.
- SMS is SIM-swappable, interception-prone.
- **Explicitly excluded from PHI access paths.** May be offered as low-assurance option for non-health tenant profiles only with tenant-level policy enforcement.

**Push notification (Duo-style):**
- Convenient but requires third-party service (not air-gap compatible unless self-hosted Duo equivalent deployed).
- Compliance risk: push fatigue attacks (MFA bombing) are documented.
- **Excluded from default stack.** Tenant option only with self-hosted notification service.

**Email OTP / magic link:**
- Low-assurance. Suitable for account recovery, not PHI access.
- Available via Keycloak email OTP flow.

**Backup codes:**
- Required for account recovery when hardware key is unavailable.
- Generated at MFA enrollment, stored hashed in Keycloak.
- Codes are single-use. Exhaustion triggers re-enrollment flow.

**Step-up authentication:**
- Keycloak: `acr_values` claim in authorization request triggers step-up.
- Service can request higher assurance: `acr_values=urn:mace:incommon:iap:silver` for PHI endpoints.
- Step-up re-prompts MFA challenge without full re-login.
- **Required for:** privilege escalation, break-glass, bulk PHI export, user deletion.

**Break-glass / emergency access:**
- Dedicated `emergency-access` role, time-bounded (configurable: 1–4 hours).
- Activation requires: strong auth (WebAuthn hardware key) + written reason + manager approval (async is acceptable for true emergencies with post-hoc audit).
- Every break-glass activation publishes audit event to Kafka audit topic with actor, reason, timestamp, resource scope, expiry.
- Automatic role expiry via Keycloak session timeout + Jobrunr scheduled revocation job (ADR-0102 pattern).

**Auto-logoff:**
- HIPAA §164.312(a)(2)(iii): automatic logoff after period of inactivity.
- Keycloak: `ssoSessionIdleTimeout` per realm. Default recommendation: 15 minutes for PHI-access sessions, 60 minutes for non-PHI sessions.
- Configurable per tenant via realm/org settings.

### Recommendation

| User tier | Primary MFA | Step-up required |
|---|---|---|
| Standard user | TOTP | No |
| Clinician (PHI access) | WebAuthn (platform passkey minimum) | Yes (for bulk ops) |
| Admin (tenant admin) | WebAuthn (hardware key preferred) | Yes |
| Break-glass | WebAuthn hardware key + written reason | Always |
| Service-to-service | Client credentials + mTLS | N/A |

---

## Sub-decision 4: Audit Log (Tamper-Evident)

### Context

HIPAA §164.312(b) mandates audit controls. §164.308(a)(1)(ii)(D) requires information system activity review. The audit log must be:
- Tamper-evident (modification detectable)
- Complete (no gaps)
- Long-term retainable (6 years minimum)
- Queryable (by tenant, actor, resource, time range)
- Efficiently ingested (identity plane generates high event volume at SaaS scale)

### Option A: Hash-chained PostgreSQL table

**Pattern:** Each audit row contains `previous_hash` (SHA-256 of prior row's canonical form) and `self_hash` (SHA-256 of `{id, timestamp, actor, action, resource, tenant, previous_hash}`). Append-only enforced via PostgreSQL row-level security: INSERT allowed, UPDATE/DELETE denied for audit role.

**Libraries/reference:**
- Tracehold (Tracehold AI): commercial HMAC hash-chain audit log service, open patterns documented
- AppMaster blog: full PostgreSQL hash-chain implementation pattern
- Pattern: SHA-256 chain identical to git commit DAG and certificate transparency logs

**Verification:** Periodic chain-verification job (Jobrunr scheduled) replays hash chain; alerts on broken links.

**Strengths:**
1. Zero new infrastructure — PostgreSQL is already in stack (ADR-0101)
2. Simple to query with standard SQL (range queries, tenant filter, resource filter)
3. Mathematical tamper-detection: any modification breaks the hash chain for all subsequent rows
4. PostgreSQL row-level security prevents unauthorized updates

**Weaknesses:**
1. Sequential inserts constrain throughput (hash chain is serial by design)
2. Large-scale SaaS may need partitioned hash chains per tenant (each tenant has its own chain head)
3. Single PostgreSQL DB is still mutable by a compromised DB admin unless supplemented with secondary

### Option B: Append-only WORM storage (SeaweedFS)

**Pattern:** Export audit batches (daily or hourly) to SeaweedFS WORM buckets (ADR-0101: SeaweedFS supports WORM / object locking). Immutable by storage guarantee, not cryptographic proof.

**Weakness:** Storage-level immutability is enforced by SeaweedFS configuration, not cryptographically verifiable from outside the storage system.

### Option C: Event-sourced Kafka audit stream with cryptographic envelopes

**Pattern:** Every auth event publishes to Kafka `audit.*` topics with HMAC-signed envelope (using per-tenant Vault-managed key). Kafka's append-only log provides sequence integrity. Apicurio schema registry validates event schema (ADR-0102).

**Strengths:** Decoupled ingestion, high throughput. Kafka retention provides durability. Consumers can replay.

**Weaknesses:** Kafka retention is time-limited by default (configurable to years with tiered storage); query access requires dedicated consumer or Kafka Streams materialization. Less queryable than PostgreSQL for ad-hoc forensics.

### Option D: Dedicated audit-service (existing submodule)

CuraOS has an `audit-service` submodule. This service should be the **query and policy enforcement layer**, not the storage layer.

### Option E (Recommended): Combined hash-chain + WORM export + audit-service query

```
auth events
    │
    ├─→ Kafka topic: audit.identity.events  (signed envelope, Apicurio schema)
    │        │
    │        └─→ audit-service consumer
    │                 │
    │                 ├─→ PostgreSQL hash-chained ledger  (query layer, forensics)
    │                 └─→ Jobrunr: nightly WORM export to SeaweedFS (long-term retention)
    │
    └─→ APISIX access log  (per-request, lightweight, APISIX native)
```

**Chain design:**
- Per-tenant chain head (tenant_id + sequence_number as composite key prevents cross-tenant chain pollution)
- Columns: `id, tenant_id, seq, timestamp, actor_id, action, resource_type, resource_id, context_json, previous_hash, self_hash`
- `self_hash = SHA-256(id || tenant_id || seq || timestamp || actor_id || action || resource_type || resource_id || previous_hash)`
- PostgreSQL RLS: `audit_writer` role → INSERT only; `audit_reader` → SELECT only; no role gets UPDATE/DELETE
- Verification job: runs hourly via Jobrunr, checks last N rows per tenant; alerts via Kafka `system.alerts` topic on chain break

**HIPAA session audit:**
- Every PHI endpoint access emits audit event with session ID, user, patient resource, time
- Auto-logoff event recorded
- Break-glass activation/deactivation recorded with reason text

---

## Sub-decision 5: Per-Tenant Scaling Pattern

### Requirements
- SaaS: potentially hundreds to thousands of tenants
- On-prem: single tenant (but must use same codebase)
- Air-gap: single tenant; lightweight footprint critical
- Tenant isolation: one tenant must not be able to observe another tenant's users, tokens, or sessions

### Options evaluated

**Option A: Realm-per-tenant (traditional Keycloak)**
- Max practical: ~50–100 realms before admin console performance degrades. With aggressive cache tuning, up to 1,000 realms is documented (Keycloak 26.4). Each realm is a fully isolated context.
- Memory cost: ~2–5 MB per inactive realm in cache; active realms consume significantly more.
- **Use case:** enterprise on-prem deployments requiring maximum isolation (dedicated realm = dedicated key material, dedicated IdP federation, dedicated audit namespace). One enterprise customer = one realm.
- **Not recommended** for SaaS where tenant count exceeds 50–100.

**Option B: Organizations-per-tenant (Keycloak 26+ Organizations, GA)**
- Single realm hosts N organizations. Each org has: own members, own IdP federations, own branded login (via Keycloakify theming), own roles, own invitation flows, own SCIM endpoint (when available).
- Scales to 500+ organizations per cluster per Phase Two published guidance.
- User can be member of multiple organizations (cross-tenant user bridging, relevant for system admins).
- **Recommended for SaaS profile.** Combines scale with isolation.

**Option C: ZITADEL Organizations (if ZITADEL adopted)**
- Native instance → org model. Designed for millions of orgs per instance.
- Architecturally superior but requires ZITADEL adoption (see IdP recommendation above).

**Option D: Keycloak instance-per-tenant (enterprise isolation)**
- Dedicated Keycloak cluster per enterprise tenant.
- Maximum isolation: separate DB, separate key material, separate admin.
- Operationally expensive: each instance requires management, patching, HA configuration.
- **Use case only:** regulated enterprise customers (hospital systems, insurance networks) requiring air-gap or BAA with full data partition.

**Option E: Tenant-as-claim (no IdP-level separation)**
- Tenant identifier embedded in JWT claim. Application enforces isolation.
- Lowest infra cost. Highest risk: token forgery or claim manipulation bypasses isolation.
- **Rejected** for any deployment handling PHI.

### Recommended Pattern

```
Tenant type                     → Keycloak model
─────────────────────────────────────────────────────
SaaS SMB / mid-market           → Organization within shared realm
SaaS enterprise (no reg. req.)  → Organization with dedicated IdP federation
Enterprise HIPAA / air-gap      → Dedicated Keycloak realm (or dedicated instance)
Internal system accounts        → Master realm (Keycloak internal)
```

**Token isolation at gateway:** APISIX OIDC plugin extracts `tenant_id` claim from validated JWT. All upstream service calls include `X-Tenant-ID` header. Services enforce tenant isolation at data layer. This provides defense-in-depth beyond IdP-level isolation.

---

## Sub-decision 6: SMART-on-FHIR (HealthStack-specific)

### Standards
- SMART App Launch Framework 2.x (HL7 published)
- Scopes: `patient/{resourceType}.{read|write|*}`, `user/{resourceType}.{read|write|*}`, `system/{resourceType}.{read|write|*}`
- Launch context: `launch`, `launch/patient`, `launch/encounter`
- Discovery: `.well-known/smart-configuration` endpoint
- Audience (`aud`) parameter validation in authorization request

### SMART-on-FHIR support per IdP

| IdP | Native SMART | Extension Available | Effort |
|---|---|---|---|
| Keycloak | No (native) | Yes: Alvearie, zedwerks | Low |
| ZITADEL | No | Via Actions (JS hooks) | Medium |
| Authentik | No | Must build | High |
| Ory Hydra | No | Must build | High |
| Custom SAS | No | Must build | Very High |
| Gluu/Janssen | Documented | Limited ecosystem | Medium |

### Recommended Architecture: Keycloak + SMART Extension + HAPI FHIR + APISIX

```
Clinical App (SMART client)
    │
    │ 1. Discovery: GET /fhir/.well-known/smart-configuration
    ↓
HAPI FHIR Server (ADR-0103)
    │ → returns smart-configuration pointing to Keycloak authorization_endpoint
    │
    │ 2. Authorization request (with launch context + SMART scopes)
    ↓
Keycloak (SMART extension: Alvearie OR zedwerks)
    │ → validates aud parameter (FHIR server base URL)
    │ → presents patient-context selection (if launch/patient scope)
    │ → issues access token with SMART scopes as JWT claims
    │
    │ 3. API request with Bearer token
    ↓
APISIX Gateway
    │ → OIDC plugin validates token
    │ → checks required_scopes (e.g., patient/Patient.read)
    │ → forwards to HAPI FHIR with validated identity context
    │
    │ 4. HAPI FHIR processes request
    ↓
HAPI FHIR enforces patient-level access based on token claims
```

**Implementation steps:**
1. Deploy `zedwerks/keycloak-smart-fhir` extension on Keycloak (SPI jar). Supports EHR-Launch and standalone launch.
2. Configure Keycloak realm with FHIR-specific client scopes (`patient/*.read`, `user/*.read`, etc.)
3. HAPI FHIR: configure SMART capability statement (`SmartCapabilities`) declaring authorization endpoints
4. APISIX: OIDC plugin with `required_scopes` enforcement per route
5. Publish `.well-known/smart-configuration` via HAPI FHIR conformance endpoint

**SMART-on-FHIR scope mapping to RBAC:**
- `system/*.read` → service account role; client credentials grant only
- `user/*.read` → authenticated clinician; maps to RBAC role `clinician`
- `patient/*.read` → patient-facing app; maps to consent-validated access via SpiceDB

---

## Sub-decision 7: Email / Notification for Auth Flows

### Requirements
- Account verification (new signup)
- Password reset / account recovery
- MFA backup code delivery
- Invitation emails (SCIM-provisioned user onboarding)
- Air-gap: must work without external email relay

### Options

**Option A: Notification-service (existing CuraOS submodule) via configured SMTP**
- Identity-service emits `notify.send_email` events to Kafka
- Notification-service consumes and routes via configured SMTP relay (tenant-configurable)
- SMTP relay: self-hosted (Postfix, Haraka, Stalwart Mail) for air-gap; commercial relay (SendGrid, Postmark, SES) for SaaS
- Per-tenant email templates stored in identity-service configuration
- **Recommended pattern** — decoupled, consistent with event-led architecture (ADR-0102)

**Option B: Keycloak native SMTP**
- Keycloak has built-in SMTP configuration per realm
- Simple for initial setup
- Weakness: Keycloak email templates are themed but less flexible than full templating service; per-tenant template customization requires custom SPI
- **Use for development/early production; migrate to Option A as notification-service matures**

**Option C: Third-party SaaS relay (SendGrid, Postmark)**
- Violates air-gap charter for on-prem profiles
- Acceptable only for SaaS profile with explicit tenant acknowledgment
- Configure as fallback option in notification-service's relay selection logic

**Recommended:**
- Keycloak native SMTP for development and initial production (low ops overhead)
- Notification-service integration for production SaaS (consistent with platform event architecture)
- Per-tenant SMTP relay configuration: large enterprises may provide their own SMTP relay (relay-per-tenant config in notification-service)
- Air-gap deployments: bundled Postfix / Stalwart Mail in ops/docker-compose profiles (ADR ops layer)

---

## Cross-Cutting Concerns

### JWT validation at gateway vs. in-service

**Pattern:** APISIX OIDC plugin validates JWTs at gateway using cached JWKS (Valkey cache, TTL = key rotation interval minus 5 minutes). Services receive pre-validated identity context via trusted headers (`X-User-ID`, `X-Tenant-ID`, `X-Roles`, `X-ACR`). No per-request introspection hit on Keycloak from services.

**Introspection endpoint:** Available for services that need real-time token status (break-glass revocation check). Use sparingly — introspection is synchronous Keycloak call, not cached. Reserve for step-up and break-glass validation.

**Token format:** JWT (not opaque tokens) for all service-to-service and client flows. JWTs are self-contained and reduce Keycloak load. Opaque tokens only for specific delegation flows where revocability requires introspection.

### Refresh token rotation

Keycloak: enable refresh token rotation (`Refresh Token Rotation = true`). Each refresh token use issues a new refresh token and invalidates the prior. Stolen refresh token detection: if old token is reused, session is revoked.

### Session management

- Server-side sessions in Keycloak (Infinispan cache, distributed for HA)
- Valkey caches: JWKS endpoint responses (TTL = 1 hour, refreshed before expiry), introspection responses (TTL = token expiry minus buffer)
- Stateless JWT at service layer — no per-service session state
- PHI sessions: shorter idle timeout (15 min); non-PHI: 60 min; configurable per realm/org

### Logout propagation

- **Front-channel logout:** Browser redirect to each registered client's logout URI. Unreliable (requires active browser session).
- **Back-channel logout:** OIDC back-channel logout spec. Keycloak sends signed logout tokens to all registered clients' backchannel URIs. Services invalidate local session state. **Required for PHI sessions.**
- APISIX: upon receiving back-channel logout event, purge session from Valkey cache.

### Token caching strategy (Valkey)

```
Key pattern                    │ TTL           │ Notes
───────────────────────────────┼───────────────┼─────────────────────────────────
jwks:{tenant_id}               │ 55 min        │ Keycloak JWKS; refresh 5 min before expiry
introspect:{token_hash}        │ token_exp - now│ Introspection result; expire with token
session:{session_id}           │ session_idle  │ Active session marker for logoff
blacklist:{jti}                │ token_exp     │ Revoked token JTIs for break-glass
```

### Per-tenant key material

- Each Keycloak realm has its own RS256/ES256 signing key pair
- Key rotation: automated via Keycloak key provider rotation schedule (default: 90 days for active key, keep prior key for 30 days to validate existing tokens)
- HSM integration: for HIPAA-regulated enterprise tenants, Keycloak `pkcs11` keystore provider routes signing to HSM or HashiCorp Vault Transit (Vault already in ADR-0101 ops layer)
- Pepper for Argon2id: stored in Vault; not in DB. Loaded at Keycloak startup via Vault Agent sidecar.

### SAML metadata in air-gap

- Enterprise IdP metadata (XML) uploaded via Keycloak admin console (file upload, not URL fetch)
- CuraOS SP metadata exported from Keycloak admin console; delivered to enterprise IdP via secure file transfer
- Metadata refresh: manual on rotation schedule; Keycloak does not auto-fetch in air-gap
- Certificate pinning: SP certificates stored in Vault; rotation procedure documented in ops runbook

### LDAP/AD failure modes

- Keycloak user federation: configurable connection timeout and max retries
- Cache: Keycloak caches federated user attributes locally (configurable cache TTL per federation)
- Failure mode: if LDAP unreachable, Keycloak falls back to cached attributes for authentication (configurable: `importEnabled = true` for full local cache)
- Air-gap with on-prem AD: LDAP is local, no internet dependency; standard Keycloak user federation config applies

### Argon2id with pepper

```
Stored in DB:  Argon2id_hash(password + salt, m=19456, t=2, p=1)
Salt:          random 16 bytes, per-user, stored with hash
Pepper:        32-byte secret, stored in Vault Transit, NOT in DB
Hash input:    HMAC-SHA256(password, pepper) → feed as "password" to Argon2id
```

Parameters align with OWASP 2023 recommendations (m=19456 KiB, t=2 iterations, p=1 parallelism). Pepper stored separately means DB compromise alone does not enable offline dictionary attack.

### OWASP ASVS L2 checklist (identity-relevant items)

| ASVS Item | Implementation |
|---|---|
| V2.1: Argon2id | Keycloak password policy: argon2 algorithm |
| V2.2: MFA for all accounts | Keycloak realm policy: required actions |
| V2.5: Account recovery | Keycloak email-based recovery + backup codes |
| V3.4: Session idle timeout | Keycloak ssoSessionIdleTimeout per realm |
| V3.7: Re-auth for sensitive ops | Keycloak step-up via acr_values |
| V4.1: RBAC enforced | Spring @PreAuthorize + OPA |
| V7.1: Audit log | Hash-chained PostgreSQL + Kafka pipeline |
| V9.1: TLS everywhere | APISIX TLS termination; all internal mTLS via service mesh |
| V14.2: Dependency hardening | SBOM via Syft; Trivy image scan in CI |

---

## Recommendation Summary

### IdP
**Keycloak 26+ with Organizations model.** Apache 2.0. Quarkus runtime. Realm-per-tenant for enterprise HIPAA isolation; Organizations-per-tenant for SaaS multi-tenancy. SMART-on-FHIR via zedwerks extension. Branded login via Keycloakify. SCIM via community extension (keycloak-scim-server) until official GA.

### Authorization
**Three-layer hybrid:** RBAC (Keycloak JWT roles + Spring) → ABAC (OPA sidecar, Cerbos fallback) → ReBAC (SpiceDB for PHI consent, HealthStack only).

### MFA
**WebAuthn (hardware key) for privileged users; TOTP for standard users; SMS excluded from PHI paths.**

### Audit
**Hash-chained PostgreSQL + Kafka pipeline + nightly SeaweedFS WORM export.** Per-tenant chain heads. Append-only enforced via RLS. Jobrunr verification job hourly.

### Tenant model
**Organizations for SaaS; realm-per-tenant for enterprise HIPAA; instance-per-tenant only for highest-isolation regulated customers.**

### SMART-on-FHIR
**Keycloak + zedwerks/keycloak-smart-fhir extension + HAPI FHIR SMART capability statement + APISIX scope validation.**

### Auth flows (prose description in lieu of diagram)

**Standard login:** Browser → APISIX → Keycloak authorization endpoint (org-resolved) → user auth (password + TOTP/WebAuthn) → authorization code → token endpoint → JWT issued → APISIX caches JWKS → service validates JWT locally.

**SMART App Launch (EHR):** Clinical app → HAPI FHIR `/.well-known/smart-configuration` → Keycloak authorization endpoint with `launch`, `launch/patient`, SMART scopes → SMART extension validates aud, narrows to patient context → access token with patient scopes → APISIX validates required_scopes → HAPI FHIR enforces patient context.

**Break-glass:** Emergency actor → requests break-glass role → step-up challenge (WebAuthn hardware key) → enters written reason → `emergency-access` role granted with expiry (Jobrunr-scheduled revocation) → Kafka `audit.break-glass.activated` event emitted → post-incident audit review workflow triggered in workflow-service.

**SCIM provisioning:** Azure AD / Okta → SCIM 2.0 → Keycloak SCIM endpoint (community extension or official GA) → user/group provisioned into Keycloak organization → Keycloak event → Kafka `identity.user.provisioned` topic → downstream services (notification-service for welcome email, org-service for org membership).

**SAML enterprise federation:** Enterprise user → Keycloak organization with SAML IdP configured → Keycloak SP-initiated SAML request to enterprise IdP → SAML response → Keycloak maps assertion to internal user (just-in-time provisioning or pre-provisioned) → OIDC token issued → standard token flow continues.

---

## Open Questions for User

1. **Dual-IdP architecture?** Run Keycloak for HealthStack tenants (SMART-on-FHIR), ZITADEL for ERP/Education tenants (superior multi-tenancy, PostgreSQL-native, lighter footprint)? Pros: best-fit IdP per vertical. Cons: two IdPs to operate, more complex cross-vertical SSO.

2. **Tenant count planning:** What is the expected tenant count at launch (Y1) and at 3-year scale? This determines whether Keycloak Organizations model is sufficient now or whether dedicated realms for regulated customers must be provisioned from day one.

3. **HIPAA BAA scope:** Does the SaaS profile require a Business Associate Agreement signed with each HealthStack tenant? If so, does Keycloak organization-level isolation satisfy the BAA's data separation requirements, or does each HIPAA tenant require a dedicated Keycloak realm with dedicated DB schema?

4. **SCIM maturity threshold:** Accept community keycloak-scim-server extension now (lower risk, less official), or wait for official Keycloak SCIM GA (currently experimental as of April 2026)? What is the minimum SCIM feature set required at launch (Entra ID sync only, vs. full attribute mapping)?

5. **OPA vs. Cerbos decision:** Given August 2025 OPA maintainer departure, does the team have appetite to adopt OPA now with migration risk, or start with Cerbos (simpler, stable governance)? Or skip ABAC for MVP and add after HealthStack GA?

6. **SpiceDB vs. OpenFGA:** SpiceDB (AuthZed, stronger consistency, gRPC-first) vs. OpenFGA (CNCF sandbox, REST+gRPC, lighter consistency model)? Both are viable. Preference for CNCF governance would favor OpenFGA.

7. **Hardware key mandate:** Will privileged users (tenant admins, clinicians) be required to enroll hardware keys (YubiKey) at account activation, or is software passkeys (platform passkeys) sufficient for AAL2/AAL3 compliance in target healthcare segments?

8. **Break-glass approval flow:** Is synchronous manager approval required before break-glass role grant (blocks emergency access), or is post-hoc mandatory notification + audit acceptable (allows emergency access without delay)?

9. **Audit retention:** HIPAA minimum is 6 years. Some state regulations (California: 10 years for medical records). Should the SeaweedFS WORM retention policy default to 10 years to cover the highest common requirement?

10. **Pepper rotation procedure:** Argon2id pepper stored in Vault. How should pepper rotation be handled? Options: (a) rotate + re-hash all passwords on next login (transparent, slow convergence), (b) double-hash (old pepper then new pepper — complex), (c) store pepper version with hash and re-hash on login expiry. Operational decision required before implementation.

11. **Keycloak upgrade path:** With Red Hat as commercial backer, what is the update cadence commitment for this deployment? Plan for quarterly Keycloak upgrades (aligned with release cycle) or follow Red Hat Build of Keycloak LTS schedule (longer support, slower features)?

12. **ZITADEL as future migration target:** Accept ZITADEL as the long-term architectural goal once SMART-on-FHIR ecosystem matures, with Keycloak as production-stable bridge? Or commit to Keycloak indefinitely and invest in Keycloak-specific extensions?

---

## References

### Keycloak
- [Keycloak 26.4 Performance Benchmarks](https://www.keycloak.org/2025/10/keycloak-benchmark) — official throughput and memory sizing
- [Keycloak Multi-Tenancy Options (Phase Two)](https://phasetwo.io/blog/multi-tenancy-options-keycloak/) — realm-per-tenant vs Organizations tradeoffs
- [Keycloak Organizations Guide (KeycloakPro)](https://keycloakpro.com/blog/keycloak-multi-tenancy-organizations-guide) — Keycloak 26+ Organizations GA
- [Keycloak CVE History (stack.watch)](https://stack.watch/product/redhat/keycloak/) — 16 CVEs in 2025, 25 in 2024
- [CVE-2025-12110 Alert](https://bitninja.com/blog/cve-2025-12110-keycloak-security-alert-for-admins/) — refresh token scope bypass
- [Keycloak Quarkus Migration](https://shiftleftsecurity.de/index.php/2024/10/10/keycloak-with-quarkus-better-together/) — ~50% footprint reduction
- [SCIM as Experimental Feature (Keycloak April 2026)](https://www.keycloak.org/2026/04/scim-as-experimental-feature) — official SCIM status
- [keycloak-scim-server community project](https://github.com/Metatavu/keycloak-scim-server/) — community SCIM extension

### ZITADEL
- [Keycloak vs ZITADEL 2025 (HouseOfFOSS)](https://blog.houseoffoss.com/post/keycloak-vs-zitadel-which-open-source-identity-provider-should-you-choose-in-2025) — comparative analysis
- [ZITADEL v4 GA announcement](https://zitadel.com/blog/announcing-the-general-availability-of-zitadel-v4) — v4 architecture, Next.js Login UI
- [ZITADEL Event Store docs](https://zitadel.com/docs/concepts/eventstore/overview) — event-sourced architecture
- [ZITADEL Organizations docs](https://zitadel.com/docs/concepts/structure/organizations) — multi-tenancy model

### Authentik
- [Authentik GitHub](https://github.com/goauthentik/authentik) — 15k+ stars, MIT/BSL license
- [Authelia vs Authentik 2025 (HouseOfFOSS)](https://blog.houseoffoss.com/post/authelia-vs-authentik-which-self-hosted-identity-provider-is-better-in-2025)

### Ory Stack
- [Ory Hydra SAML limitations (GitHub Discussion)](https://github.com/ory/hydra/discussions/3251) — SAML not on Hydra roadmap
- [Ory Keto GitHub](https://github.com/ory/keto) — Zanzibar-style authorization

### SMART-on-FHIR
- [SMART on FHIR + HAPI FHIR + APISIX + Keycloak](https://rob-ferguson.me/add-authz-to-hapi-fhir-with-apisix-and-keycloak/) — full integration reference
- [Alvearie Keycloak FHIR Extensions (IBM)](https://github.com/Alvearie/keycloak-extensions-for-fhir) — SMART App Launch SPI
- [zedwerks/keycloak-smart-fhir](https://github.com/zedwerks/keycloak-smart-fhir) — EHR-Launch SPI, actively maintained
- [FHIR RBAC with Keycloak + SMART v2 (Health Samurai)](https://www.health-samurai.io/articles/implementing-role-based-access-control-for-fhir-resources-with-keycloak-and-smart-on-fhir-v2)

### Authorization Engines
- [OPA vs Cedar vs Zanzibar 2025 (OsoHQ)](https://www.osohq.com/learn/opa-vs-cedar-vs-zanzibar) — policy engine comparison
- [Authorization in 2025 (Medium)](https://medium.com/@giorgioprof/authorization-in-2025-a-practical-comparison-of-modern-solutions-a55fe9bf8069) — SpiceDB, Cerbos, Permit.io benchmarks
- [MCP Access Control: OPA vs Cedar (Natoma)](https://natoma.ai/blog/mcp-access-control-opa-vs-cedar-the-definitive-guide) — OPA maintainer risk context

### Audit Logging
- [Tamper-Evident Audit Trails in PostgreSQL (AppMaster)](https://appmaster.io/blog/tamper-evident-audit-trails-postgresql) — hash-chain implementation
- [Building HIPAA-Grade Audit Logging (Medium)](https://medium.com/@keshavagrawal/building-a-hipaa-grade-audit-logging-system-lessons-from-the-healthcare-trenches-d5a8bb691e3b)
- [Immutable Audit Log with HMAC Hash Chaining (Tracehold)](https://tracehold.ai/blog/immutable-audit-log-hmac-hash-chain/)

### State of open-source identity
- [State of Open-Source Identity 2025 (HouseOfFOSS)](https://blog.houseoffoss.com/post/the-state-of-open-source-identity-in-2025-authentik-vs-authelia-vs-keycloak-vs-zitadel)
- [Open Source Auth Providers 2025 (Tesseral)](https://tesseral.com/guides/open-source-auth-providers-in-2025-best-solutions-for-open-source-auth)
