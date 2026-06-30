# ADR-0156 — Auth Token Flow: JWT + Opaque Tokens + mTLS Three-Layer Spec

**Status:** Accepted
**Date:** 2026-05-24
**Resolves:** [ADR-0151 F-002 Major](0151-cross-cluster-coherence.md) — Auth token flow → Builder/Workflow missing explicit interchange spec
**Amends:**
- [ADR-0120 §6](0120-foundation-auth.md) — adds token format detail to API surface checklist
- [ADR-0103](0103-api-surface.md) — adds per-protocol token validation rules (REST/GraphQL/gRPC/Connect-RPC)
- [ADR-0109](0109-containers-orchestration.md) — formalises Cilium service mesh + SPIFFE/SPIRE adoption for workload identity
- [ADR-0150](0150-baseline-alignment-rules.md) — adds token issuance to provider abstraction registry
**Parent:** [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md), [ADR-0120 Foundation Auth](0120-foundation-auth.md)

---

## 1. Status

**Accepted.** User decision confirmed 2026-05-24: all three token layers combined — JWT for users + opaque tokens for sensitive operations + mTLS for service-to-service.

---

## 2. Context

### 2.1 Problem statement

ADR-0151 (Wave 2 coherence scan) Finding F-002 identified that while ADR-0120 specifies Auth's API surface (REST + GraphQL + tRPC + webhooks), every downstream product that references Auth does so without naming:

- Which token format it accepts at its own ingress
- How it validates tokens (edge vs in-service vs introspection call)
- Which Auth endpoint it calls for token exchange or validation
- How service-to-service calls authenticate when no user JWT is present

Consequence: without this spec, independent implementation teams will diverge. Expected failure modes include Builder always redirecting to Auth (fragmented UX), Workflow activities accessing PHI without introspection, Builder and Workflow calling different Auth endpoints (REST vs GraphQL), and Valkey session store keyed inconsistently across services.

### 2.2 Existing commitments this spec must honour

| ADR | Commitment |
|---|---|
| ADR-0120 | Better Auth + `jose` (JWT), `node-oidc-provider` (RFC 7662 introspection + RFC 7009 revocation), Valkey session store, WebAuthn step-up, hash-chained audit |
| ADR-0101 | Valkey for hot-path state; per-tenant PG schema for durable audit |
| ADR-0102 | Durable messaging (Kafka/NATS) for revocation events |
| ADR-0103 | REST + GraphQL + gRPC/Connect-RPC as accepted API protocols |
| ADR-0104 | Hash-chain audit on every auth-related access |
| ADR-0109 | Cilium CNI + Envoy sidecar; SPIFFE/SPIRE workload identity pattern referenced |
| ADR-0121/0122 | Builder + Workflow Manager both say "Auth per ADR-0120" without further detail |

### 2.3 Scope

This ADR covers:
1. Token format and validation rules for **user-facing requests** (Layer 1: JWT)
2. Token format and validation rules for **sensitive/privileged operations** (Layer 2: opaque tokens)
3. **Service-to-service authentication** in the absence of a user token (Layer 3: mTLS + SPIFFE)
4. Per-product integration rules for Builder, Workflow Manager, HealthStack clinical services, Apps/Sites/Widgets runtime
5. Failure modes, performance considerations, and amendment patches to sibling ADRs

Out of scope: tenant routing and context propagation (ADR-0152), consent workflow ↔ Auth federation (ADR-0151 F-016, separate ADR), SMART-on-FHIR App Launch 2.0 detailed flow (ADR-0120 §6 covers the standard; this ADR only handles token exchange mechanics).

---

## 3. Decision

CuraOS uses a **three-layer token architecture**. Each layer has a distinct purpose, issuer, format, validation path, and audit requirement. No layer is interchangeable with another.

| Layer | Token type | Scope | Validation path | Audit |
|---|---|---|---|---|
| 1 | JWT access token | All user-facing requests | Edge JWKS cache (APISIX) | Standard access log |
| 2 | Opaque token | Sensitive / privileged operations | Inline introspection call (RFC 7662) | Per-request introspection audit record |
| 3 | mTLS cert (SPIFFE) | Service-to-service calls | Mutual TLS handshake via Cilium/Envoy | Cilium flow log + audit sink |

All three layers are active simultaneously and compose without conflict. A user request that triggers a sensitive PHI write carries a JWT (Layer 1) into the edge and an opaque step-up token (Layer 2) as a separate header to the PHI service, while the PHI service's call to another backend service authenticates purely via Layer 3 mTLS.

---

## 4. Layer 1 — JWT Access Tokens (default user authentication)

### 4.1 Format

```
Authorization: Bearer <jwt>
```

- **Algorithm:** ES256 (ECDSA P-256). Ed25519 available as opt-in performance alternative per tenant; toggle via `tenant.auth.jwt.algorithm: EdDSA` in tenant config. Default stays ES256 for maximum JWKS compatibility with third-party validators (Stripe, AWS, GCP federation partners).
- **Issuer:** `https://auth.cura.os/t/<tenant_slug>/` — per-tenant OIDC issuer URL (ADR-0120 §4).
- **JWKS endpoint:** `https://auth.cura.os/t/<tenant_slug>/.well-known/jwks.json`
- **Library:** `jose` (MIT) for signing and verification throughout the NestJS stack.

### 4.2 Required claims

| Claim | Type | Description |
|---|---|---|
| `sub` | string | CuraOS user UUID (stable, non-recyclable) |
| `iss` | string | Per-tenant issuer URL |
| `aud` | string[] | Target service(s); APISIX validates `aud` matches the upstream service identifier |
| `exp` | number | Expiry — **15 minutes** from issuance |
| `iat` | number | Issued-at |
| `jti` | string | JWT ID — UUID v7 (sortable); used for revocation lookup |
| `tenant_id` | string | CuraOS internal tenant UUID (stable, non-recyclable) |
| `roles` | string[] | Tenant-scoped role list (`["clinician","tenant_admin"]`) |
| `scope` | string | Space-delimited OAuth 2.1 scope string |
| `cnf.jkt` | string | DPoP public key thumbprint (RFC 9449) — **required for all user-facing JWTs** |

Optional claims (present when applicable):

| Claim | Condition |
|---|---|
| `smart_launch_context` | SMART-on-FHIR EHR launch; contains `patient`, `encounter`, `fhirContext` |
| `cura_break_glass` | `true` when issued under break-glass flow; triggers enhanced audit downstream |
| `sid` | Server-side session ID in Valkey — used for back-channel logout |

### 4.3 DPoP binding (RFC 9449)

All JWT access tokens issued by CuraOS Auth are **DPoP-bound** by default. The client:

1. Generates an ephemeral asymmetric key pair (ES256 or EdDSA) per session.
2. Attaches `DPoP: <proof-jwt>` header on every request.
3. CuraOS Auth includes `cnf.jkt` (public key thumbprint) in the JWT.
4. APISIX verifies the DPoP proof against `cnf.jkt` before forwarding.

DPoP opt-out: machine-to-machine OAuth 2.1 `client_credentials` flows (non-user context) are exempt from DPoP; they use opaque tokens (Layer 2) or mTLS (Layer 3) instead.

### 4.4 Validation path

```
Client → APISIX ingress
         │
         ├── APISIX jwt-auth plugin fetches JWKS from Valkey L1 cache
         │   (cache TTL: 5 min; fallback fetch from Auth JWKS endpoint)
         │
         ├── Validates: signature, exp, aud, DPoP proof
         │
         ├── Injects headers downstream:
         │     X-User-Id: <sub>
         │     X-Tenant-Id: <tenant_id>
         │     X-Roles: <comma-separated roles>
         │     X-Scope: <scope string>
         │     X-Session-Id: <sid>
         │
         └── Forwards to upstream service
```

**Downstream services do NOT re-validate the JWT signature.** They trust the injected `X-*` headers (set only by APISIX, not client-settable). A NestJS `AuthenticatedUserGuard` reads these headers and builds the in-process `RequestUser` context object.

If `X-User-Id` is absent or `X-Tenant-Id` is absent on a protected route, the service returns `401 Unauthorized` without touching Auth.

### 4.5 Token refresh

- Refresh token delivered as **httpOnly, SameSite=Strict, Secure cookie** (`cura_rt`).
- TTL: 7 days (renewable); per-tenant policy override via `tenant.auth.session.yaml`.
- Refresh token rotation: every use issues a new refresh token and invalidates the old one (reuse detection per ADR-0120 §6).
- Refresh endpoint: `POST /auth/oauth2/token` with `grant_type=refresh_token`.
- Silent refresh: Auth Lit Web Component handles automatic pre-expiry refresh (triggered at 80% of access token lifetime).

### 4.6 JWKS rotation

- **Weekly automatic rotation** via SPIRE-managed key pair lifecycle (see Layer 3 §6.4 for SPIRE integration; Auth uses same SPIRE trust domain for its signing keys).
- Old key retained in JWKS for 24 hours post-rotation (overlap window) to drain in-flight tokens.
- Rotation event published to Kafka topic `auth.jwks.rotated` (tenant-scoped partition key).
- APISIX JWKS cache invalidated on rotation event receipt; no manual intervention needed.

---

## 5. Layer 2 — Opaque Tokens for Sensitive Operations

### 5.1 When required

A service **MUST** demand an opaque step-up token (and MUST NOT accept a plain JWT) when the operation falls into any of these categories:

| Category | Examples |
|---|---|
| Destructive resource operations | Permanent delete of patient record, bulk record purge, tenant deletion |
| Billing and subscription changes | Plan upgrade/downgrade, payment method update, subscription cancel |
| Tenant admin privileged operations | Role grant to admin, cross-tenant federation enable, SCIM endpoint reset |
| BAA-scope PHI read/write | HealthStack clinical data create/update/read in regulated contexts |
| Break-glass access | Emergency PHI access outside normal workflow |
| Audit log export | Downloading WORM audit archives |

The OpenAPI spec for each endpoint declares `x-curaos-auth: step-up` to signal the requirement. The API gateway rejects requests to such endpoints that lack a valid `X-Step-Up-Token` header.

### 5.2 Format and storage

- **Format:** cryptographically random 64-character URL-safe base64 string (48 bytes of entropy, base64url-encoded, no padding).
- **Generation:** `crypto.randomBytes(48).toString('base64url')` in NestJS Auth service.
- **Storage:** Valkey hash key `opaque:{tenant_id}:{token_hash}` where `token_hash = sha256(token)`.
  - Hash stored, not raw token, to limit blast radius of Valkey compromise.
  - Valkey TTL: **5 minutes** (hard max; no extension).
- **Metadata stored per token:**

```
{
  "user_id": "<sub>",
  "tenant_id": "<tenant_id>",
  "session_id": "<sid>",
  "operation_scope": "<string>",   // e.g. "phi:read", "admin:delete", "billing:change"
  "issued_at": "<ISO8601>",
  "expires_at": "<ISO8601>",
  "single_use": true|false,
  "used": false,
  "webauthn_challenge_verified": true,
  "reason_code": "<string|null>",  // required for break-glass
  "request_ip": "<string>",
  "user_agent": "<string>"
}
```

- **Single-use enforcement:** when `single_use: true`, the Valkey key is deleted atomically on first successful introspection (Lua script — no race condition). Subsequent calls with the same token return `401 Token already consumed`.

### 5.3 Issuance trigger — WebAuthn step-up

Opaque tokens are issued only after a successful WebAuthn ceremony:

```
Client                       Auth Service                  Valkey
  │                               │                           │
  ├─ POST /auth/step-up/begin ────►│                           │
  │   { operation_scope, jwt }    │                           │
  │                               ├── validates JWT (Layer 1) │
  │                               ├── generates WebAuthn chal.│
  │◄─ 200 { challenge, options } ─┤                           │
  │                               │                           │
  ├─ [user touches hardware key] ─►                           │
  │                               │                           │
  ├─ POST /auth/step-up/complete ─►│                           │
  │   { assertion, challenge }    │                           │
  │                               ├── verifies assertion      │
  │                               ├── generates opaque token  │
  │                               ├── STORE token+metadata ──►│
  │◄─ 200 { step_up_token } ──────┤                           │
```

- WebAuthn ceremony uses `SimpleWebAuthn` (ADR-0120 §3.1) — `verifyAuthenticationResponse`.
- Step-up token is returned in response body (not cookie); client holds it for the single downstream call.
- Auth service emits `auth.step_up.issued` event to Kafka/NATS with token hash + operation_scope (no raw token in event).

### 5.4 Introspection endpoint

**RFC 7662** introspection endpoint: `POST /auth/oauth2/introspect`

Request (from downstream service, service-to-service via mTLS Layer 3):

```http
POST /auth/oauth2/introspect HTTP/1.1
Host: auth.cura.os
Content-Type: application/x-www-form-urlencoded
(mTLS client cert present — see Layer 3)

token=<opaque_token>&token_type_hint=access_token
```

Response (active):

```json
{
  "active": true,
  "sub": "<user_id>",
  "tenant_id": "<tenant_id>",
  "operation_scope": "phi:read",
  "exp": 1748000000,
  "single_use": true
}
```

Response (inactive / expired / consumed):

```json
{
  "active": false
}
```

**Downstream service MUST:**
1. Call introspection before executing the privileged operation.
2. Abort with `403 Forbidden` if `active: false`.
3. Verify `operation_scope` matches the operation being performed.
4. Write an audit record (PHI access log per ADR-0104) referencing the introspection call.

**Downstream service MUST NOT:**
- Cache introspection results across requests (each operation = fresh introspection call).
- Accept a plain JWT in place of an opaque token for step-up-required endpoints.
- Proceed if introspection endpoint is unreachable (fail-closed, not fail-open).

### 5.5 Per-request audit

Every introspection call to `/auth/oauth2/introspect` triggers:

1. Auth service writes `auth.introspection.audit` record to PG `audit_log` table (hash-chained, per ADR-0104):
   ```
   { token_hash, user_id, tenant_id, operation_scope, requesting_service_spiffe_id,
     timestamp, result: "granted"|"denied"|"expired"|"consumed" }
   ```
2. Auth service publishes `auth.introspection.event` to Kafka topic (partition key: `tenant_id`).
3. HIPAA-regulated contexts additionally write to the PHI audit log in the HealthStack overlay schema.

### 5.6 Break-glass variant

Break-glass opaque tokens carry additional constraints:

- `reason_code` field required and non-empty (user must provide textual justification).
- `single_use: true` always — no reuse.
- TTL: 5 minutes (same as standard opaque).
- Dual sign-off enforced at issuance: a second admin must approve the step-up before Auth issues the token (implemented as a Temporal workflow — `BreakGlassApprovalWorkflow` in Workflow Manager).
- All break-glass events emit `auth.break_glass.access` to Kafka; subscribed by security-service for real-time alert.
- ADR-0120 §6 break-glass checklist item "dual sign-off, reason code, full audit" is satisfied by this flow.

---

## 6. Layer 3 — mTLS for Service-to-Service Authentication

### 6.1 Rationale

Services calling other services do not carry user JWTs internally. Forwarding user JWTs between services creates:
- Token amplification surface (one leaked JWT grants wide access)
- Tight coupling to Auth for every hop
- Latency (each hop would need introspection)

Instead: each pod holds a short-lived X.509 certificate identifying its workload. Mutual TLS ensures both parties authenticate before data flows. The SPIFFE ID embedded in the cert is the service's identity — no JWT needed.

### 6.2 SPIFFE/SPIRE workload identity

CuraOS adopts the SPIFFE standard (Secure Production Identity Framework for Everyone):

- **Trust domain:** `cura.os`
- **SPIFFE ID format:** `spiffe://cura.os/ns/{tenant_namespace}/sa/{service_account_name}`
  - Example (identity service in tenant `acme`): `spiffe://cura.os/ns/acme/sa/identity-service`
  - Example (platform-level workflow manager): `spiffe://cura.os/ns/platform/sa/workflow-manager`
- **SPIRE server:** runs as a Kubernetes `StatefulSet` in the `spire-system` namespace; one per cluster.
- **SPIRE agent:** runs as a `DaemonSet`; one pod per node. Attests workload identity via Kubernetes pod SAT (Service Account Token).
- **SVID rotation:** every **24 hours** (hard maximum; configurable down to 1 hour for high-security namespaces like `healthstack-phi`).
- **X.509-SVID delivery:** SPIRE agent delivers cert + private key via SPIFFE Workload API (Unix domain socket in pod). NestJS services mount the socket at `/run/spiffe/workload/workload.sock`.

### 6.3 Cilium policy enforcement

Cilium CNI (ADR-0109 addendum) enforces mTLS at the network layer:

```yaml
# Example CiliumNetworkPolicy — PHI service
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: phi-service-mtls-ingress
  namespace: healthstack-phi
spec:
  endpointSelector:
    matchLabels:
      app: phi-service
  ingress:
    - fromEndpoints:
        - matchLabels:
            spiffe-id: workflow-manager
        - matchLabels:
            spiffe-id: clinical-order-service
      toPorts:
        - ports:
            - port: "443"
              protocol: TCP
          rules:
            l7proto: tls
            tls:
              - secret:
                  name: cilium-ca
```

Only pods with a valid SPIFFE ID in the Cilium-trusted CA can reach PHI-classified endpoints. Unknown or unauthenticated callers are dropped at the network layer before the application sees the connection.

### 6.4 Envoy filter for Auth introspection calls (Layer 2 + Layer 3 composition)

When a service calls `/auth/oauth2/introspect` (Layer 2), that call itself is protected by Layer 3 mTLS:

- The Auth service's introspection endpoint only accepts connections from SPIFFE IDs on its allowlist.
- Envoy sidecar in the Auth pod terminates the mTLS and surfaces the caller's SPIFFE ID as `X-Forwarded-Client-Cert` (XFCC).
- Auth's NestJS introspection handler reads XFCC and records `requesting_service_spiffe_id` in the audit record.
- Auth rejects introspection calls from unlisted SPIFFE IDs with `403 Forbidden`.

Allow-listed SPIFFE IDs for introspection (maintained in Auth config, not hardcoded):

```yaml
# auth-service/config/introspect-allowlist.yaml
allowed_callers:
  - spiffe://cura.os/ns/*/sa/builder-service
  - spiffe://cura.os/ns/*/sa/workflow-manager
  - spiffe://cura.os/ns/healthstack-*/sa/*-clinical-service
  - spiffe://cura.os/ns/*/sa/audit-service
```

Wildcard `*` matches any tenant namespace. Service account name must be exact.

### 6.5 gRPC/Connect-RPC protocol

Service-to-service calls use **Connect-RPC** (per ADR-0103 gRPC/Connect-RPC decision). mTLS is transparent at the transport layer:

```typescript
// NestJS service client bootstrap (example)
import { createPromiseClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import * as fs from 'fs';

const transport = createGrpcTransport({
  baseUrl: 'https://phi-service.healthstack-phi.svc.cluster.local:443',
  httpVersion: '2',
  nodeOptions: {
    // SVID loaded from SPIFFE Workload API
    cert: fs.readFileSync('/run/spiffe/workload/svid.pem'),
    key: fs.readFileSync('/run/spiffe/workload/svid.key'),
    ca: fs.readFileSync('/run/spiffe/workload/bundle.pem'),
  },
});
```

The workload API helper (`@spiffe/spiffe-workload-api`) can be used to auto-refresh certs before SVID expiry — preferred over manual file reads.

### 6.6 No JWT forwarding between services

**This is a hard rule.** A NestJS service that receives a user JWT in `Authorization: Bearer` MUST:

1. Extract `X-User-Id`, `X-Tenant-Id`, `X-Roles`, `X-Scope` from the APISIX-injected headers.
2. Pass these as **metadata** in downstream Connect-RPC calls (gRPC metadata headers).
3. **NOT** forward the raw JWT to downstream services.

Downstream services read user context from Connect-RPC metadata, not from a JWT. If downstream needs to verify a sensitive operation, it calls Auth introspection via Layer 2 (opaque token), not by re-validating a JWT.

---

## 7. Token Formats — Reference Summary

| Property | JWT (Layer 1) | Opaque (Layer 2) | SPIFFE cert (Layer 3) |
|---|---|---|---|
| Format | Signed JWT (ES256 or EdDSA) | 64-char base64url random | X.509 SVID |
| Carrier | `Authorization: Bearer` header | `X-Step-Up-Token` header | mTLS handshake |
| Issuer | CuraOS Auth (per-tenant) | CuraOS Auth | SPIRE |
| TTL | 15 minutes | 5 minutes | 24 hours |
| Storage | Client memory + httpOnly cookie (refresh) | Valkey (hash by sha256(token)) | SPIFFE Workload API (in-memory) |
| Validation | APISIX JWKS cache (edge) | RFC 7662 introspection (per-request) | mTLS handshake + Cilium policy |
| Revocation | Valkey block-list + RFC 7009 revocation endpoint | Valkey TTL or atomic delete | SPIRE SVID revocation (CRL) |
| Signing key rotation | Weekly (SPIRE-managed) | N/A (random, no signing) | 24h (SPIRE SVID lifecycle) |
| Audit | Standard access log | Per-request introspection audit record (PG + Kafka) | Cilium flow log |
| DPoP bound | Yes (RFC 9449) | N/A | N/A |

---

## 8. Per-Product Integration Rules

### 8.1 Builder (ADR-0121)

| Interaction | Token layer | Detail |
|---|---|---|
| End-user login to Builder UI | Layer 1 | Auth Lit Web Component embedded in Builder shell (`<cura-auth-widget>`). No redirect to standalone Auth page. Component handles login, MFA, passkey ceremonies in-shadow-DOM. |
| Builder UI → Builder API (user actions) | Layer 1 | `Authorization: Bearer <jwt>` on all non-sensitive routes. APISIX validates at edge. |
| Builder UI → Builder API (tenant admin destructive ops) | Layer 2 | `X-Step-Up-Token: <opaque>` alongside JWT. Builder API calls Auth introspection before executing. |
| Builder service → Workflow Manager | Layer 3 | Connect-RPC with mTLS. User context forwarded as gRPC metadata headers. No JWT forwarded. |
| Builder service → other platform services | Layer 3 | Connect-RPC with mTLS. Same pattern. |
| Session persistence | Layer 1 | Valkey session keyed by `sid` claim in JWT. Cache invalidated on `auth.session.revoked` Kafka event. |

**Builder UI does NOT host its own login page.** The `<cura-auth-widget>` Lit Web Component (Auth product, ADR-0106) handles all auth UI including login, signup, MFA, passkey setup, and session expiry. Builder receives the JWT via the component's `auth:success` custom event and stores it in memory (never localStorage).

### 8.2 Workflow Manager (ADR-0122)

| Interaction | Token layer | Detail |
|---|---|---|
| User → Workflow Manager API | Layer 1 | JWT validates at APISIX edge; `X-*` headers injected. |
| Temporal worker → PHI service | Layer 3 | mTLS. User context (user_id, tenant_id) embedded in Temporal workflow input as typed `WorkflowContext` struct — not a JWT. |
| Temporal activity accessing PHI | Layer 2 | Activity worker calls Auth step-up introspection endpoint with the opaque token stored in Temporal workflow input. If `active: false`, activity raises `PhiAccessDeniedException` (non-retryable). |
| Workflow Manager → Auth for token info | Layer 3 → Layer 2 | Connect-RPC (mTLS) to `/auth/oauth2/introspect` with opaque token from workflow context. |
| Temporal task-queue routing | Layer 1 (tenant_id) | Task-queue name = `t-{tenant_id}-{service}` (ADR-0152 convention). Extracted from JWT `tenant_id` claim at workflow submission time; stored in workflow input thereafter. |

**Temporal workflows do NOT hold or refresh JWTs.** A workflow that runs for hours cannot depend on a 15-minute JWT. Instead, the workflow holds: `user_id`, `tenant_id`, `roles[]`, and (when a sensitive activity is needed) the opaque step-up token — issued fresh by the UI immediately before workflow submission, with TTL matched to the workflow's expected critical path.

If a long-running workflow needs a new step-up token mid-flight (e.g., a multi-day care-plan workflow that requires daily PHI writes), it raises a Temporal signal `request.step_up` which is routed to the UI for a fresh WebAuthn ceremony. The new opaque token is delivered back via Temporal signal `step_up.token` and stored in workflow state.

### 8.3 HealthStack clinical services

| Interaction | Token layer | Detail |
|---|---|---|
| Clinician → clinical API (read) | Layer 1 + Layer 2 | JWT for identity; opaque step-up for every PHI read. No plain-JWT PHI access. |
| Clinician → clinical API (write) | Layer 2 | Opaque step-up mandatory. Single-use enforcement. |
| Clinical service → lab / imaging service | Layer 3 | mTLS. PHI scoped by patient consent model (ADR-0104 / OpenFGA). |
| Break-glass access | Layer 2 (break-glass variant) | Opaque token with `cura_break_glass: true`, reason code, dual sign-off workflow. Triggers `auth.break_glass.access` event. |
| SMART-on-FHIR launch | Layer 1 with `smart_launch_context` | JWT includes `patient`, `encounter`, `fhirContext` claims. SMART scopes in `scope` claim. Validated at APISIX edge before forwarding to FHIR gateway. |
| HIPAA audit per PHI access | Layer 2 audit | Every introspection call for PHI produces a HIPAA audit record: user, patient_id, resource_type, operation, timestamp. Written to HealthStack overlay schema `phi_audit_log`. |

### 8.4 Apps / Sites / Widgets runtime (ADR-0121b, 0121a, 0121c)

| Interaction | Token layer | Detail |
|---|---|---|
| End-user request to tenant-built App/Site | Layer 1 | JWT issued by Auth for the tenant; validated at APISIX edge. End-user's tenant matches App's tenant. |
| App runtime → backend services | Layer 3 | mTLS. App runtime pods have SPIFFE ID `spiffe://cura.os/ns/{tenant}/sa/app-runtime`. |
| Widgets embedded in third-party sites | Layer 1 | Widget receives JWT from Auth in postMessage (cross-origin). Widget stores in memory only; no cookie. Short TTL enforced. |
| Admin operations in tenant App UI | Layer 2 | Step-up token for any destructive or admin operation surfaced via App runtime. |

---

## 9. Failure Modes and Mitigations

| Failure | Impact | Mitigation |
|---|---|---|
| JWKS endpoint unreachable | APISIX cannot validate JWTs → all requests rejected | APISIX uses Valkey JWKS cache (5-min TTL). Auth pods horizontal-scaled (min 3 replicas). JWKS rarely changes (weekly rotation). |
| Valkey unavailable | Opaque token introspection fails; refresh token rotation fails | Fail-closed for Layer 2 (privileged ops blocked, not opened). JWT Layer 1 unaffected (JWKS cached in APISIX memory). Valkey HA: 3-node cluster with Sentinel. |
| SPIRE server unreachable | SVID rotation fails; new pods cannot attest | SPIRE server HA (3 replicas + embedded etcd). Existing SVIDs remain valid until expiry (24h window). Agent caches last SVID on disk for crash recovery. |
| Auth introspection endpoint overloaded | Layer 2 calls time out → privileged ops fail | Auth service horizontal-scaled. Introspection is a Valkey hash lookup — sub-millisecond. Circuit breaker in NestJS clients (5s timeout, 3 retries, 30s open-circuit). |
| Opaque token replay attack | Attacker reuses consumed single-use token | Token hash stored in Valkey; consumed tokens deleted atomically (Lua). `used: true` state impossible to observe without deletion. |
| JWT leaked in flight | Bearer token usable until expiry (15 min) | DPoP binding (RFC 9449) — leaked JWT useless without DPoP private key. 15-min TTL bounds blast radius. `jti` revocation list in Valkey for immediate revocation when incident detected. |
| mTLS cert expired | Service-to-service calls rejected | SVID rotation at 24h. SPIRE agent auto-rotates with 8h pre-expiry headroom (rotates at t-8h). Cilium policy still enforces valid mTLS — expired cert = connection refused at network layer. |
| Break-glass dual sign-off timeout | Second admin doesn't approve within TTL | Break-glass approval workflow has configurable timeout (default 10 min). On timeout: workflow signals requestor with `step_up.denied` reason `approval_timeout`. |
| Temporal long-running workflow — step-up expiry | PHI activity cannot proceed | Workflow raises `request.step_up` signal; UI prompts fresh WebAuthn ceremony. Workflow waits on signal with configurable backoff (default 30 min wait, then `phi.access.expired` terminal event). |

---

## 10. Performance Impact

| Operation | Expected latency | Notes |
|---|---|---|
| JWT validation at APISIX | < 1 ms | JWKS in Valkey L1 cache; ES256 verify in APISIX Lua VM |
| Opaque token introspection | < 5 ms P95 | Valkey hash lookup + audit write (async) |
| WebAuthn step-up ceremony | 500 ms – 2 s | User interaction time dominates; server-side < 5 ms |
| mTLS handshake (first) | 2 – 5 ms | SPIFFE Workload API SVID cached; handshake on new connection only |
| mTLS handshake (resumed) | < 1 ms | TLS session resumption |
| SPIRE SVID rotation | < 50 ms | Background; zero impact on in-flight requests |
| JWKS rotation | < 100 ms | Valkey cache invalidation + re-fetch; APISIX handles gracefully |

Overall P95 auth overhead target: **< 10 ms** added latency per user-facing request on the critical path. Opaque introspection is the highest-cost path; budget is within the ADR-0120 sub-200ms P95 token issuance target.

---

## 11. Amendments to Sibling ADRs

### 11.1 ADR-0120 §6 — Token format addendum

The following rows are added to the ADR-0120 §6 Enterprise Feature Checklist:

| Category | v1 Required Feature |
|---|---|
| **Token formats** | JWT access tokens: ES256, DPoP-bound (RFC 9449), 15-min TTL, per-tenant JWKS |
| **Token formats** | Opaque step-up tokens: 64-char base64url, Valkey-backed, RFC 7662 introspection, 5-min TTL, single-use option |
| **Token formats** | mTLS workload identity: SPIFFE/SPIRE, 24h SVID TTL, Cilium policy enforcement |
| **Step-up issuance** | WebAuthn ceremony triggers opaque token issuance (RFC 7662 compatible) |
| **Break-glass** | Opaque break-glass token: reason_code required, dual sign-off via Temporal, single-use, Kafka alert |
| **Revocation** | JWT: `jti` block-list in Valkey + RFC 7009 endpoint; Opaque: Valkey TTL or atomic delete; SVID: SPIRE CRL |

### 11.2 ADR-0103 — Per-protocol token validation rules

| Protocol | Token validation rule |
|---|---|
| REST (NestJS HTTP) | Layer 1: APISIX edge validates JWT; service reads `X-*` headers. Layer 2: `X-Step-Up-Token` header; service calls Auth introspection. |
| GraphQL (NestJS) | Same as REST. APISIX validates JWT before GraphQL gateway. Step-up token in `x-step-up-token` HTTP header. |
| gRPC / Connect-RPC | Layer 3 mTLS for service-to-service. User context in gRPC metadata keys `x-user-id`, `x-tenant-id`, `x-roles`, `x-scope`. |
| WebSocket (future) | JWT in initial HTTP upgrade handshake. APISIX validates before upgrade. WS session inherits validated identity. Opaque step-up not supported over WS (use REST for privileged ops). |

### 11.3 ADR-0109 — Cilium mTLS + SPIFFE/SPIRE adoption

This ADR formally adopts the SPIFFE/SPIRE pattern referenced in ADR-0109 addendum:

- **SPIRE server:** `StatefulSet` in `spire-system` namespace; 3 replicas; embedded etcd for HA.
- **SPIRE agent:** `DaemonSet`; Kubernetes node attestation via SAT plugin.
- **SVID type:** X.509-SVID (not JWT-SVID — JWT-SVID deferred; X.509 is simpler and Cilium-native).
- **Trust bundle distribution:** SPIRE bundle endpoint exposed within cluster; downstream services mount bundle from `spire-bundle` ConfigMap.
- **Cilium integration:** Cilium reads SPIFFE IDs from X.509 certs presented in mTLS handshakes. `CiliumNetworkPolicy` `fromEntities` / `endpointSelector` combined with SPIFFE ID label selectors (Cilium identity labels set by SPIRE agent via Cilium API).

### 11.4 ADR-0150 — Provider abstraction registry

Token issuance is added to the provider abstraction registry defined in ADR-0150 §3:

| Abstraction | v1 concrete | Swap path |
|---|---|---|
| JWT token issuer | CuraOS Auth (NestJS + `jose` + Better Auth) | Replaceable with Keycloak v2 plugin (ADR-0120 §8) via same OIDC/JWKS interface |
| Opaque token store | Valkey (Redis-compatible) | Any Redis-compatible store; interface via NestJS `CacheModule` provider token `OPAQUE_TOKEN_STORE` |
| Workload identity issuer | SPIRE | Any SPIFFE-compliant CA; interface via Workload API UNIX socket |
| Introspection endpoint | CuraOS Auth `/auth/oauth2/introspect` | RFC 7662-compliant endpoint; configured via `AUTH_INTROSPECT_URL` env var per service |

---

## 12. Action Items

| Item | Owner | Priority | ADR |
|---|---|---|---|
| Implement `<cura-auth-widget>` Lit Web Component with step-up trigger | Auth team | High | ADR-0120 |
| Add `x-curaos-auth: step-up` OpenAPI extension to all sensitive endpoints | Auth + API teams | High | ADR-0103 |
| Deploy SPIRE server + agent DaemonSet; configure Kubernetes attestor | Platform/Ops | High | ADR-0109 |
| Configure APISIX jwt-auth plugin with Valkey JWKS cache + DPoP verification | Platform | High | ADR-0103 |
| Implement `POST /auth/oauth2/introspect` with SPIFFE allowlist enforcement | Auth team | High | ADR-0120 |
| Implement `POST /auth/step-up/begin` + `POST /auth/step-up/complete` WebAuthn flow | Auth team | High | ADR-0120 |
| Implement opaque token Valkey store with single-use Lua script | Auth team | High | This ADR |
| Implement `BreakGlassApprovalWorkflow` in Workflow Manager | Workflow team | High | ADR-0122 |
| Add NestJS `AuthenticatedUserGuard` reading APISIX `X-*` headers to shared NestJS platform lib | Platform | Medium | ADR-0100 |
| Create introspection allowlist config (`introspect-allowlist.yaml`) and mount as ConfigMap | Auth + Ops | Medium | This ADR |
| Add HIPAA `phi_audit_log` table to HealthStack overlay schema; wire to introspection audit | HealthStack team | High | ADR-0104 |
| Write Cilium NetworkPolicy for PHI namespace with SPIFFE ID enforcement | Platform/Ops | High | ADR-0109 |
| Connect-RPC client factory with SPIFFE Workload API cert auto-refresh | Platform | Medium | ADR-0103 |
| Implement `request.step_up` / `step_up.token` Temporal signal pair for long-running PHI workflows | Workflow team | Medium | ADR-0122 |

---

## 13. Open Questions

| # | Question | Impact | Status |
|---|---|---|---|
| OQ-1 | Should SMART-on-FHIR EHR-launch flows issue an opaque step-up token for the initial PHI access, or does the SMART JWT (with `patient` claim) suffice as the scope-bound token? | HealthStack clinical access model | Open — needs HealthStack overlay ADR |
| OQ-2 | SPIRE embedded etcd vs external etcd for SPIRE server HA. Embedded is simpler but adds state to `spire-system`. External reuses the cluster etcd if accessible. | Operational complexity | Open — defer to ops ADR |
| OQ-3 | For Ed25519 opt-in: does APISIX's jwt-auth plugin support EdDSA verification in the current stable release? If not, EdDSA support must be blocked until APISIX confirms. | Layer 1 algorithm opt-in | Open — needs APISIX version check |
| OQ-4 | Widget-in-third-party-site postMessage JWT flow: origin allowlist must be configurable per widget. Does Builder UI expose this as a config field in Widget config, or is it enforced at Auth? | ADR-0121c Widget isolation | Open — needs Widget ADR amendment |
| OQ-5 | Air-gap deployment: SPIRE server attestation requires Kubernetes API access. In fully offline clusters, is the Kubernetes SAT attestor reachable? Confirm with K3s/Talos home-lab profile. | Air-gap deployment model | Open — needs ops validation |

---

## 14. References

| Reference | URL / Location |
|---|---|
| RFC 9449 — OAuth 2.0 DPoP | https://datatracker.ietf.org/doc/html/rfc9449 |
| RFC 7662 — OAuth 2.0 Token Introspection | https://datatracker.ietf.org/doc/html/rfc7662 |
| RFC 7009 — OAuth 2.0 Token Revocation | https://datatracker.ietf.org/doc/html/rfc7009 |
| RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens | https://datatracker.ietf.org/doc/html/rfc9068 |
| SPIFFE/SPIRE specification | https://spiffe.io/docs/latest/spiffe-about/overview/ |
| SPIRE Kubernetes Quickstart | https://spiffe.io/docs/latest/try/getting-started-k8s/ |
| Cilium mTLS + SPIFFE integration | https://docs.cilium.io/en/stable/network/servicemesh/mutual-authentication/mutual-authentication/ |
| SimpleWebAuthn (ADR-0120) | https://simplewebauthn.dev/ |
| `jose` JWT library | https://github.com/panva/jose |
| Connect-RPC Node.js | https://connectrpc.com/docs/node/getting-started |
| ADR-0120 Foundation Auth | [0120-foundation-auth.md](0120-foundation-auth.md) |
| ADR-0103 API Surface | [0103-api-surface.md](0103-api-surface.md) |
| ADR-0109 Containers + Orchestration | [0109-containers-orchestration.md](0109-containers-orchestration.md) |
| ADR-0150 Baseline Alignment Rules | [0150-baseline-alignment-rules.md](0150-baseline-alignment-rules.md) |
| ADR-0151 Cross-Cluster Coherence (F-002) | [0151-cross-cluster-coherence.md](0151-cross-cluster-coherence.md) |
| ADR-0152 Tenant Routing Interceptor | [0152-minor-info-findings-resolutions.md](0152-minor-info-findings-resolutions.md) |

---

*Last updated: 2026-05-24. Author: CuraOS platform architecture team.*
