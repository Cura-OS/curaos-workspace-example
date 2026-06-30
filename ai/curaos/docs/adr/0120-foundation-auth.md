# ADR-0120 — Foundation Product: Auth / IdP

> **Open Questions resolution (2026-05-25):** All 4 → **DEFERRED-MILESTONE** to identity-service M2/M3/M11 per `ai/curaos/backend/services/identity-service/AGENTS-sections/baseline.md`. Token flow (JWT+Opaque+mTLS), tenant routing, AuthZ chain (OPA+Cerbos+OpenFGA), HIPAA guards (no SMS OTP, FIDO2+TOTP, JWT 900s) all **RESOLVED-ADR** by ADR-0155 + ADR-0156 + ADR-0157 + ADR-0162. See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md), [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
**Companion research:** [`../research/0120-auth-research.md`](../research/0120-auth-research.md)

---

## 1. Context

**CuraOS Auth** is one of four foundation products that form the injection mold. It is:

- A **standalone SaaS Auth product** — sellable solo (CuraOS Auth-as-a-Service tier).
- The **identity layer** every other CuraOS service consumes.
- The first foundation product (everything else depends on identity).

Per ADR-0100, all foundation product cores are **NestJS (TypeScript)**. Auth = pure NestJS. No Java sidecar. No Keycloak in v1.

---

## 2. Decision summary

**CuraOS Auth v1 = pure NestJS product composed of battle-tested OSS dependencies, full per-tenant isolation, opt-in cross-tenant federation, three-layer authorization, config-driven over code-driven extensibility.**

Enterprise-grade from day 1. Must cover all CuraOS needs (HealthStack SMART-on-FHIR, enterprise SAML/SCIM, regulated tenants) + more.

Keycloak-as-optional-plugin deferred to v2/v3 (only if specific enterprise customers demand it).

---

## 3. Architecture

### 3.1 Core composition

| Concern | OSS dependency | License | Role |
|---|---|---|---|
| OIDC provider + sessions + base auth | **Better Auth** (alternative: **node-oidc-provider**) | Apache 2.0 / Apache 2.0 | Primary auth core. Better Auth for modern DX; node-oidc-provider for OIDC depth where Better Auth thin. |
| WebAuthn / FIDO2 / Passkeys | **SimpleWebAuthn** | MIT | Hardware key + passkey ceremonies. Industry standard for Node. |
| SAML 2.0 (enterprise SSO) | **node-saml** + **samlify** | MIT / MIT | Both IdP + SP. Enterprise IdP federation. |
| OAuth federation | **passport** + strategy libs | MIT | Google, Microsoft, GitHub, generic OIDC, custom IdP federation. |
| MFA — TOTP | **otplib** | MIT | TOTP/HOTP generation + verification. |
| MFA — backup codes / recovery | Custom NestJS module | — | Thin wrapper over crypto + storage. |
| SCIM 2.0 provisioning | **scim-patch** + custom NestJS controllers | MIT | No mature NestJS-native SCIM server exists; we build the surface, use scim-patch for RFC compliance. |
| SMART-on-FHIR | **fhirclient-js** + ported zedwerks logic to NestJS module | MIT + Apache 2.0 | Port the Keycloak SPI logic to TS. Config-driven scope mapper. |
| Password hashing | **argon2** | LGPL-3.0 (linker exception, fine for SaaS distribution) | Argon2id w/ pepper, recommended by OWASP ASVS L2. |
| JWT signing/verification | **jose** | MIT | Pure ESM JWT/JWS/JWE. Best DX in Node. |
| Token introspection + revocation | **node-oidc-provider** | Apache 2.0 | RFC 7662 + RFC 7009 native. |
| Magic link / email OTP | Custom NestJS module + notify-service | — | Trigger via ADR-0102 events to notify-service. |
| Audit interceptor | Custom NestJS `AuditInterceptor` | — | Wraps every auth-related call. Hash-chain per §3.1 + ADR-0157. |

### 3.2 Three-layer Authorization

| Layer | OSS | Where it runs | Purpose |
|---|---|---|---|
| **OPA** (Open Policy Agent) | OPA-WASM embedded in NestJS | In-process | Global org-wide rules, cross-cutting policies (e.g., "no PHI to external webhooks"). |
| **Cerbos** | NestJS @cerbos/grpc client → Cerbos PDP sidecar | Sidecar | Service-level ABAC (resource permissions per role + attribute). |
| **OpenFGA** | NestJS @openfga/sdk → OpenFGA sidecar | Sidecar | ReBAC for PHI patient-consent relationships, sharing graphs. |

All three are battle-tested OSS, Apache 2.0, NestJS-friendly.

---

## 4. Multi-tenant model — full per-tenant separation

**Per-tenant DB schema** (aligned with ADR-0101 PG schema-per-tenant).

Each tenant gets:
- Independent Auth state (users, roles, sessions, MFA factors, federation configs)
- Independent OIDC issuer URL (`https://auth.cura.os/t/<tenant>/`)
- Independent JWKS endpoint
- Independent branding (logo, color, copy, email templates)
- Independent password/MFA policy
- Independent SAML metadata + certificates
- Independent SCIM endpoints
- Independent SMART-on-FHIR config

**No shared realm.** A breach or misconfiguration in one tenant does NOT affect others.

### 4.1 Cross-tenant federation (opt-in, mutual consent)

When BOTH tenants explicitly enable a federation link:

| Pattern | Mechanism |
|---|---|
| **Cross-tenant SSO** | Tenant B trusts Tenant A as IdP via OIDC federation. User in A logs into B's apps without separate account. Signed by both tenant admins. Audit per cross-tenant token issued. |
| **User export** | Tenant emits user/role/permission/audit bundle (JSON + signed manifest, cosign signature). Includes selective scope (subset of users, time range, etc.). |
| **User import** | Receiving tenant inspects bundle, runs consent flow (user-by-user opt-in or bulk if pre-approved), imports under tenant's namespace. |
| **Tenant migration** | One-time full export + import flow when a tenant moves from one CuraOS deployment to another (e.g., on-prem → SaaS or vice versa). |
| **Tenant-to-tenant role mapping** | Configurable mapping table when federating (Tenant A's "doctor" role = Tenant B's "physician" role). |

All cross-tenant operations are audited + require mutual cryptographic consent (both tenant admin signatures, hash-chain logged).

---

## 5. Config-driven over code-driven extensibility

**Default:** everything tenants need to customize must be expressible as configuration (YAML/JSON via Builder UI per ADR-0121, or admin REST API).

| Customization | Config-only path |
|---|---|
| Password rules (length, complexity, breach check) | `tenant.auth.password.policy.yaml` |
| MFA enforcement (required for roles, step-up triggers) | `tenant.auth.mfa.policy.yaml` |
| Federation providers (OIDC, SAML, social) | `tenant.auth.federation.yaml` |
| Branding (logo, colors, copy per page, email templates) | `tenant.auth.branding.yaml` |
| SMART-on-FHIR scopes + launch context | `tenant.auth.smart-fhir.yaml` |
| Session lifetime, refresh policy, idle timeout | `tenant.auth.session.yaml` |
| Custom claims in JWT | `tenant.auth.claims.yaml` |
| SCIM attribute mappings | `tenant.auth.scim-mappings.yaml` |
| RBAC roles + permissions | `tenant.auth.rbac.yaml` |
| ABAC policies (Cerbos) | `tenant.auth.abac.yaml` |
| ReBAC schema (OpenFGA) | `tenant.auth.rebac.yaml` |

**Code-level extension only when config can't express:**
- Custom signup flow steps (e.g., HealthStack clinician-license verification API call)
- Custom MFA factor (e.g., proprietary hardware key)
- Custom audit sink (e.g., tenant's own SIEM)

Code extensions = NestJS plugins per ADR-0123 (WASM component OR NestJS microservice sidecar).

---

## 6. Enterprise-grade feature checklist (v1 must satisfy ALL)

| Category | v1 Required Feature |
|---|---|
| **Standards** | OIDC 1.0 + OAuth 2.1 + PKCE + DPoP + RFC 9068 (JWT Profile for OAuth2 Access Tokens) |
| **Standards** | SAML 2.0 IdP + SP |
| **Standards** | SCIM 2.0 (full read + write + filtering + bulk) |
| **Standards** | SMART-on-FHIR App Launch 2.0 (EHR launch + standalone launch) |
| **Standards** | LDAP/AD federation (read-only sync via SCIM-LDAP bridge) |
| **MFA** | TOTP + WebAuthn passkeys + hardware keys (FIDO2) + backup codes |
| **MFA** | Step-up authentication for privileged operations |
| **MFA** | Risk-based MFA (device fingerprint, location, behavior signals) |
| **MFA** | NO SMS for HIPAA contexts (NIST deprecation respected) |
| **Sessions** | Server-side session store (Valkey per ADR-0101) + revocation API |
| **Sessions** | Back-channel logout (RFC 8414) |
| **Sessions** | Refresh token rotation + reuse detection |
| **Sessions** | Concurrent session limits per user |
| **Auth flows** | Self-service signup (per-tenant enable/disable) |
| **Auth flows** | Invite flows (admin-invited users) |
| **Auth flows** | Account recovery (email + secondary + admin override) |
| **Auth flows** | Account merge (when user has multiple accounts across federation) |
| **Auth flows** | Break-glass emergency access (HIPAA, dual sign-off, reason code, full audit) |
| **Authorization** | OPA + Cerbos + OpenFGA three-layer (per §3.2 below) |
| **Audit** | Hash-chained PG audit (per §3.1 + ADR-0157) — every auth event |
| **Audit** | Nightly WORM export to SeaweedFS (per ADR-0101) |
| **Audit** | Real-time anomaly detection feed to security-service |
| **Compliance** | HIPAA Security Rule (encryption at rest + transit + audit + access controls) |
| **Compliance** | GDPR DSAR endpoints (data export per user; right to erasure) |
| **Compliance** | SOC 2 readiness (access reviews, password rotation, audit retention) |
| **Compliance** | OWASP ASVS L2 throughout |
| **Multi-tenant** | Full per-tenant DB schema isolation |
| **Multi-tenant** | Per-tenant OIDC issuer URL + JWKS + branding + policies |
| **Multi-tenant** | Cross-tenant federation (opt-in, mutual consent) |
| **Multi-tenant** | Tenant migration (export + import + verify) |
| **API surface** | REST + GraphQL + tRPC (per ADR-0103 — TS-native) admin + user endpoints |
| **API surface** | Webhooks for federation, signup, MFA, audit events |
| **API surface** | OpenAPI 3.1 spec auto-generated from NestJS decorators |
| **SDKs** | JS/TS SDK + Go SDK + Kotlin SDK + Python SDK + PHP SDK (auto-generated via Codegen platform ADR-0123) |
| **Admin UI** | Tenant admin console (React+Next per ADR-0106) for user mgmt, role mgmt, policy editing, audit review, federation config, branding |
| **Self-service UI** | User account portal (sign-in, MFA setup, password reset, sessions, devices, consent management, data export per GDPR) |
| **Air-gap** | Full offline operation (no external CRL, no external metadata fetch, local trust anchor) |
| **Performance** | Sub-200ms P95 for token issuance under reference load |
| **Scalability** | Horizontal scale (stateless NestJS replicas + Valkey session store + PG schema-per-tenant) |
| **Plugin SDK** | WASM Component + NestJS Microservice sidecar (per ADR-0123) for custom flows, MFA, audit sinks |

---

## 7. Rationale for "pure NestJS no Keycloak"

| Reason | Detail |
|---|---|
| **Stack coherence** | Per ADR-0100, all 4 foundation products in NestJS. Keycloak (JVM) breaks the rule. |
| **AI-agent friendliness (weight 5.0)** | TS-native auth code = agents author/extend easily. Keycloak SPI in Java requires separate agent tooling. |
| **Sellable as standalone product** | Pure NestJS Auth product = single-container deploy, no JVM ops burden. Customers buying CuraOS Auth-as-a-Service don't want to run Keycloak. |
| **Config-driven extensibility** | Better Auth + custom NestJS modules expose YAML/JSON config natively. Keycloak SPI requires Java code + Keycloak rebuild. |
| **Resource footprint** | Better Auth + NestJS ≈ 80–150MB RAM per replica. Keycloak ≈ 500MB–1GB. Critical for SMB on-prem + home-lab profiles. |
| **DX tight loop (weight 4.8)** | Hot-reload NestJS in dev. Keycloak build cycle is slow. |
| **No SPI/Java fork burden** | CuraOS doesn't maintain a Java codebase + Keycloak version-tracking forever. |
| **Modern UX patterns** | Better Auth, SimpleWebAuthn, Lucia patterns mirror modern auth UX (passkeys-first, magic links, social-first signup). |

### Trade-offs accepted

- Re-implementing some Keycloak features (themes, admin console depth, IdP federation breadth) costs upfront engineering. Mitigated by composing battle-tested OSS pieces, not reinventing.
- No instant Keycloak-extension marketplace. Mitigated by CuraOS plugin SDK (ADR-0123) growing its own marketplace.
- Federation breadth (Keycloak supports 30+ IdPs out of box) requires us to integrate each Passport strategy on demand. Acceptable — most enterprises need 5-10 IdPs, not 30.

---

## 8. Deferred to v2/v3

- **Keycloak as optional plugin** — enterprise customers already running Keycloak can use CuraOS Auth as a thin layer over their existing Keycloak. Build only when a specific paying customer demands it.
- **Custom SAML cert HSM integration** — software keys in OpenBao (per ADR-0108) suffice for v1. HSM integration when regulated customer requires it.
- **Decentralized identity (DID/VC)** — emerging spec; revisit if healthcare interop standards adopt (FHIR DI integration unclear in 2026).

---

## 9. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | NestJS shell + tenant interceptor + per-tenant DB schema (Prisma) |
| M2 | Better Auth integration + OIDC provider + sessions + cookie/JWT issuance |
| M3 | SimpleWebAuthn + TOTP + backup codes + MFA framework |
| M4 | SAML 2.0 (IdP + SP) + passport federation (Google, Microsoft, generic OIDC) |
| M5 | SCIM 2.0 endpoints |
| M6 | SMART-on-FHIR module (ported zedwerks logic + fhirclient-js + scope mapper) |
| M7 | Three-layer authorization (OPA-WASM + Cerbos sidecar + OpenFGA sidecar) |
| M8 | Audit interceptor + hash-chain PG + WORM export job |
| M9 | Cross-tenant federation + export/import + migration flows |
| M10 | Tenant admin console (React+Next) + user account portal |
| M11 | Plugin SDK (WASM component + NestJS microservice sidecar shells via Codegen ADR-0123) |
| M12 | Air-gap install bundle + ops docs |
| M13 | SDK generation (JS/TS/Go/Kotlin/Python/PHP via Codegen) |
| M14 | Performance + load testing + security audit + HIPAA compliance review |
| M15 | v1 GA — sellable standalone |

---

## 10. Open questions (resolved later)

1. **Better Auth vs node-oidc-provider** as primary OIDC engine — Better Auth is newer + more DX-friendly; node-oidc-provider is more standards-deep. Likely use Better Auth for surface + node-oidc-provider primitives where needed. Decided during M2.
2. **Webhook delivery guarantees** — at-least-once with idempotency keys, or strict ordering? Per-event-type decision in M11.
3. **CSP per tenant branding** — how to allow tenant CSS without XSS risk? Probably sandboxed iframe for login pages.
4. **Passwordless-only tenant tier** — should we offer a tenant config where passwords are disabled entirely (passkey + magic link only)? Likely yes for modern consumer SaaS tenants.

---

## 11. References

- [Research doc — 0120 Auth research](../research/0120-auth-research.md) (969 lines)
- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0104 Identity / Auth (legacy DRAFT)](0104-identity-auth.md) — superseded by this ADR for the foundation product layer
- Better Auth: https://better-auth.com/
- node-oidc-provider: https://github.com/panva/node-oidc-provider
- SimpleWebAuthn: https://simplewebauthn.dev/
- node-saml: https://github.com/node-saml/node-saml
- samlify: https://github.com/tngan/samlify
- passport: https://www.passportjs.org/
- scim-patch: https://www.npmjs.com/package/scim-patch
- fhirclient-js: https://github.com/smart-on-fhir/client-js
- OPA: https://www.openpolicyagent.org/
- Cerbos: https://www.cerbos.dev/
- OpenFGA: https://openfga.dev/
- argon2: https://github.com/ranisalt/node-argon2
- jose: https://github.com/panva/jose
