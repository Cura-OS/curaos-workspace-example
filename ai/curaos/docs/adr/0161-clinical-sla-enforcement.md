# ADR-0161 — Clinical SLA Enforcement for Tenant-Built Apps

**Status:** Accepted
**Date:** 2026-05-24
**Deciders:** Platform Architecture, HealthStack Lead, Security Lead
**Resolves:** ADR-0151 Finding F-012 (Tenant-built Apps clinical-grade SLA enforcement gap)
**Reinforces:** ADR-0099 §15 patient-centric priority ordering

---

## 1. Status

Accepted. Supersedes the ambiguous §7 isolation wording in ADR-0121b. Linked from ADR-0208
§F-012 and ADR-0109 §13. All three layers are adopted simultaneously per user decision on
2026-05-24.

---

## 2. Context

### 2.1 Problem statement

ADR-0121b (Foundation Apps) allows HealthStack tenants to build arbitrary internal tools and
marketplace apps that can bind to FHIR endpoints, CuraOS PG tables (including PHI schemas),
Kafka/NATS streams, and external REST APIs. ADR-0151 Finding F-012 identified this as a
**major gap**: nothing enforced clinical SLA or PHI access controls when a tenant-built app
issued FHIR queries. Specific risks:

1. **SLA degradation** — a poorly-written "Patient Intake Dashboard" app floods FHIR endpoints
   with N+1 queries, slowing clinical reads for all clinicians in the tenant.
2. **PHI leak** — app builder exports Patient records to unencrypted CSV; consent checks
   bypassed because app code issues raw PG queries against PHI schema.
3. **Scope bypass** — app accesses SMART scopes beyond what the installing admin granted,
   because no gateway enforcement existed.
4. **Runaway resource use** — one tenant's certified apps consume disproportionate cluster
   resources, starving other tenants' clinical services.

### 2.2 Governing principle

ADR-0099 §15 establishes the immutable priority ordering for HealthStack deployments:

> Patient experience = #1. Clinician experience = #2. Hospital admin = supporting tier.
> Admin-tier features MUST NOT degrade clinical quality or performance.

Tenant-built apps are by definition admin-tier capability. This ADR makes that priority order
mechanically enforceable, not merely aspirational.

### 2.3 Existing infrastructure available

- **Cilium** — eBPF-based CNI with L3/L4/L7 NetworkPolicy (ADR-0109)
- **APISIX** — API gateway with per-route plugin chain, rate limiting, upstream selectors
  (ADR-0109, ADR-0208)
- **Capsule** — K8s multi-tenancy operator with per-tenant namespace quota and RBAC projection
  (ADR-0109 §13)
- **Falco** — runtime syscall anomaly detection (ADR-0109)
- **Cosign** — supply-chain image signing (ADR-0109)
- **Presidio** — PII/PHI detection and redaction (Microsoft; used in PHI pipeline)
- **SMART-on-FHIR** — OAuth2 scope layer over FHIR (ADR-0115 §6, ADR-0120)
- **Audit interceptor** — `@healthstack/audit` NestJS interceptor writes hash-chained PHI audit
  log (ADR-0157, ADR-0208)

### 2.4 Decision

Adopt all three layers simultaneously:

- **Layer 1 (Hard separation)** — non-certified apps are network-blocked from direct access to
  HealthStack clinical services; all clinical data access must transit the FHIR proxy.
- **Layer 2 (Soft separation)** — certified apps get direct (but quota-enforced) access to
  HealthStack services, with K8s QoS priority always favouring clinical traffic.
- **Layer 3 (Certification)** — defines the process and tiers an app must pass before it is
  installable in a HealthStack tenant.
- **Layer 4 (Tenant controls)** — HealthStack tenant admins retain an allowlist and per-app
  scope-grant review step, supplementing platform-level enforcement.

---

## 3. Decision

### 3.1 Namespace topology

Four K8s namespaces govern app placement. Capsule TenantGateway projects RBAC and quota into
each:

| Namespace | Inhabitants | Network zone |
|---|---|---|
| `tier-clinical` | HealthStack clinical services (all `healthstack-*-service` pods) | Clinical zone — inbound from `tier-clinical` and `tier-app-certified` only |
| `tier-app-certified` | Apps holding a CuraOS-Certified or CuraOS-Verified-Clinical credential | App-certified zone — outbound to `tier-clinical` subject to quota |
| `tier-app` | All other tenant-built and marketplace apps | App zone — outbound to `tier-clinical` blocked; outbound to `fhir-proxy-service` allowed |
| `tier-platform` | `fhir-proxy-service`, APISIX, Valkey, audit sidecar | Platform zone — inbound from all; outbound to `tier-clinical` allowed |

Namespace assignment is immutable at install time; the Capsule operator rejects pods that
self-declare a different namespace than their signed credential permits.

### 3.2 Three-layer enforcement summary

| Layer | Mechanism | Who it protects |
|---|---|---|
| 1 — Hard separation | Cilium NetworkPolicy + APISIX route block | Clinical services from non-certified apps |
| 2 — Soft separation | Capsule quota + K8s QoS class + APISIX rate limit | Clinical services from certified-app overuse |
| 3 — Certification | Audit checklist + Cosign signature + recertification | HealthStack tenants from unsafe apps |
| 4 — Tenant controls | Admin allowlist + per-app scope grant | Individual tenant admin discretion |

---

## 4. Layer 1 — Hard separation (non-certified apps)

### 4.1 Network block

A Cilium `CiliumNetworkPolicy` (L3/L4) is applied cluster-wide:

```yaml
# cilium-policy-tier-app-block.yaml
apiVersion: "cilium.io/v2"
kind: CiliumNetworkPolicy
metadata:
  name: block-app-to-clinical
  namespace: tier-app
spec:
  endpointSelector: {}          # all pods in tier-app
  egressDeny:
    - toEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: tier-clinical
```

APISIX mirrors this at L7: any upstream selector targeting a `tier-clinical` service from a
`tier-app` origin returns HTTP 403 with body `{"error":"clinical-access-denied","code":"CAD-001"}`.

### 4.2 FHIR proxy as the only clinical data path

Apps in `tier-app` access clinical data exclusively through
`@curaos/fhir-proxy-service` (deployed in `tier-platform`). The proxy enforces, in order:

1. **SMART-on-FHIR scope validation** — verifies the app's access token carries the scopes
   declared at install time (e.g. `patient/*.read`, `user/Observation.read`). Excess scopes
   rejected with 403.
2. **Per-tenant + per-app rate limit** — default 100 req/min/app, configurable per tenant in
   APISIX plugin config. Burst headroom: 120 req/min for up to 10 s, then hard cap.
3. **PHI audit** — every request logged via `@healthstack/audit` interceptor to the
   hash-chained PHI audit trail (ADR-0157). Log record includes: `app_id`, `tenant_id`,
   `user_id`, FHIR resource type, FHIR resource ID, scopes presented, response HTTP status,
   latency ms, timestamp.
4. **PHI redaction** — if the granted scope is insufficient for a field returned by HAPI FHIR
   (e.g. app has `patient/Patient.read` but not `user/Patient.read` with `mrn` claim), Presidio
   NER redacts that field in the response JSON before returning to app. Redaction is logged.
5. **Return** — proxy returns the filtered FHIR Bundle/Resource to the app.

```
tier-app pod
  └─► APISIX (scope check + rate limit)
        └─► fhir-proxy-service (tier-platform)
              ├─► SMART scope validation
              ├─► PHI audit write
              └─► HAPI FHIR (tier-clinical)
                    └─► [response] → Presidio redact → app
```

### 4.3 Runtime enforcement

Falco rule detects any direct TCP connection from `tier-app` pod to `tier-clinical` pod (which
should be impossible post-Cilium but serves as defense-in-depth):

```yaml
- rule: direct_app_to_clinical_tcp
  desc: Non-certified app pod attempted direct TCP to clinical namespace
  condition: >
    evt.type in (connect, accept) and
    k8s.ns.name = "tier-app" and
    fd.rip in (tier-clinical-cidr)
  output: >
    Direct clinical access attempt (app=%k8s.pod.name tenant=%k8s.pod.labels.tenant_id)
  priority: CRITICAL
  tags: [clinical-sla, phi, security]
```

CRITICAL Falco alerts route to the security team PagerDuty channel within 60 s. The offending
pod is automatically cordoned via a Falco response plugin (kill pod + alert) so the violation
does not persist.

---

## 5. Layer 2 — Soft separation (certified apps)

### 5.1 Quota schema

Certified apps are assigned resource quotas enforced jointly by Capsule (namespace-level),
K8s LimitRange (pod-level), and APISIX (network-level). Defaults and overrides:

| Resource dimension | Default per certified app | Override scope | Hard ceiling |
|---|---|---|---|
| CPU request | 100 m | Tenant admin (≤ ceiling) | 500 m |
| CPU limit | 200 m | Tenant admin (≤ ceiling) | 1000 m |
| Memory request | 256 MiB | Tenant admin (≤ ceiling) | 1 GiB |
| Memory limit | 512 MiB | Tenant admin (≤ ceiling) | 2 GiB |
| Network egress | 1 MB/s | Tenant admin (≤ ceiling) | 10 MB/s |
| Concurrent FHIR requests | 50 | Tenant admin (≤ ceiling) | 200 |
| FHIR req/min | 500 | Tenant admin (≤ ceiling) | 2000 |
| Per-tenant aggregate CPU | 2000 m | Platform ops only | 4000 m |
| Per-tenant aggregate memory | 4 GiB | Platform ops only | 8 GiB |

Quotas are stored in a `ClinicalAppQuota` CRD (owner: Capsule). The APISIX plugin reads quota
values from this CRD via the APISIX Admin API at app install time and re-syncs on CRD update.

### 5.2 K8s QoS priority

Clinical-tier pods (`tier-clinical` namespace) MUST have:
- `resources.requests == resources.limits` → K8s **Guaranteed** QoS class.

Certified app pods (`tier-app-certified`) MUST have:
- `resources.requests` set but `limits` > `requests` → K8s **Burstable** QoS class.

Non-certified app pods (`tier-app`):
- No guarantee required → K8s **BestEffort** QoS class.

When the node runs out of memory or CPU, K8s evicts BestEffort first, then Burstable, then
Guaranteed. This means clinical services are the last to be evicted under any resource
pressure — including a runaway certified app hitting its burst ceiling.

Capsule admission webhook rejects any certified-app pod spec that declares
`requests == limits` for all resources (which would claim Guaranteed class and compete with
clinical pods on eviction priority). Rejection message: `ERR_CLINICAL_QOS_VIOLATION`.

### 5.3 DOS resilience

Under a certified-app DOS attempt (app floods FHIR calls up to its quota ceiling):

1. APISIX rate limiter returns 429 to the app once per-app concurrent limit (50 default) is
   reached. Clinical traffic on the same APISIX upstream is unaffected because the upstream
   selectors for clinical services route clinical requests through a separate APISIX route with
   higher priority weight.
2. K8s HPA for `fhir-proxy-service` scales out proxy replicas automatically (min 2, max 10).
   Clinical services do NOT scale in response to app load — they scale only on clinical traffic
   metrics (custom metric: `clinical_fhir_p95_latency_ms`).
3. Falco rule `certified_app_quota_breach` fires if an app exceeds its FHIR req/min quota for
   > 60 s continuously — triggers auto-suspend of the app's APISIX route and alert to tenant
   admin.

---

## 6. Layer 3 — Certification process

### 6.1 Certification tiers

| Tier | Installable in | Audit requirements | Signing authority |
|---|---|---|---|
| **Self-Certified Community** | Non-HealthStack tenants only | CI gates pass (Trivy, axe-core, Semgrep) + developer self-attestation | Cosign self-signed (developer key) |
| **CuraOS-Certified** | Any HealthStack tenant | All of above + CuraOS security audit + HIPAA review + accessibility manual review | Cosign CuraOS platform key |
| **CuraOS-Verified-Clinical** | FDA-regulated workflows (SaMD) | All of above + clinical SME review + FDA SaMD risk classification documented | Cosign CuraOS clinical key (separate key pair) |

Apps that handle PHI and target HealthStack tenants MUST reach at least CuraOS-Certified.

### 6.2 Certification checklist

Each item must be green before the app advances to the next tier.

#### Gate 1 — CI (automated, blocks all tiers)

| Check | Tool | Pass criterion |
|---|---|---|
| Container vulnerability scan | Trivy (CRITICAL = 0, HIGH ≤ 5 with mitigations) | Image scan green |
| Dependency vulnerability scan | Snyk (or equivalent) | No unpatched CVE CVSS ≥ 7.0 |
| SAST | Semgrep `auto` ruleset | Zero OWASP-class findings |
| Accessibility (automated) | axe-core CI (≥ 95% rule pass rate) | No critical/serious violations |
| SMART scope declaration | Schema validator against `smart-app-launch` spec | `scope` manifest well-formed |
| Image signed | Cosign verify (self-signed key minimum) | Signature present |

#### Gate 2 — CuraOS security audit (manual, required for CuraOS-Certified)

| Check | Reviewer | Evidence required |
|---|---|---|
| PHI handling pattern review | Security lead | Data flow diagram showing PHI never leaves app boundary unencrypted |
| Audit hook verification | Security lead | Smoke test confirms PHI audit log entries appear for every FHIR call |
| Encryption at rest/transit | Security lead | TLS 1.3 min; PHI fields encrypted in app local storage |
| BAA readiness | Legal/Compliance | App vendor signs or acknowledges BAA terms (ADR-0162) |
| Scope minimisation | Security lead | Declared SMART scopes are the minimum necessary for stated function |

#### Gate 3 — Accessibility manual review (required for CuraOS-Certified)

| Check | Reviewer | Standard |
|---|---|---|
| Keyboard navigation | Accessibility reviewer | WCAG 2.2 AA — all interactive elements reachable via keyboard |
| Screen reader compatibility | Accessibility reviewer | NVDA + JAWS + VoiceOver pass on key flows |
| Colour contrast | Accessibility reviewer | WCAG 2.2 AA (4.5:1 normal text, 3:1 large text) |
| Focus management | Accessibility reviewer | Focus visible and logical on modal open/close |

Per ADR-0106 accessibility commitments.

#### Gate 4 — Clinical safety review (required for CuraOS-Verified-Clinical)

| Check | Reviewer | Standard |
|---|---|---|
| Workflow safety analysis | Clinical SME | No app workflow can cause clinician to take unsafe action without a confirmation step |
| FDA SaMD risk classification | Clinical SME + Regulatory | IEC 62304 software class documented; if Class C, additional QMS evidence required |
| Clinical decision support hooks | Clinical SME | Any CDS output labelled clearly as advisory, not prescriptive |
| Cognitive load review | Clinical SME | ≤ 7 ± 2 data fields per primary screen (per ADR-0099 §15 clinician UX standard) |

Per ADR-0115 §SaMD considerations.

### 6.3 Certification workflow

```
Developer submits app to CuraOS Marketplace
  │
  ▼
Gate 1 CI (automated — pass/fail within 15 min)
  │ pass
  ▼
Developer selects target tier (Community / CuraOS-Certified / Verified-Clinical)
  │
  ├─[Community]──► Self-sign → publish to non-HealthStack marketplace
  │
  └─[CuraOS-Certified or above]──► CuraOS audit queue
        │
        ▼
      Gate 2 Security audit (target SLA: 10 business days)
        │ pass
        ▼
      Gate 3 Accessibility review (target SLA: 5 business days)
        │ pass
        │    [Verified-Clinical only]
        ├──► Gate 4 Clinical safety review (target SLA: 15 business days)
        │         │ pass
        │         └─► Cosign CuraOS-clinical-key → publish to regulated-workflow marketplace
        │
        └─► Cosign CuraOS-platform-key → publish to HealthStack marketplace
```

### 6.4 Recertification triggers

An existing certificate is **revoked** and recertification required when any of the following
occur:

| Trigger | Recertification scope |
|---|---|
| Annual review cycle | Full certification checklist |
| Major version bump (semver MAJOR) | Full certification checklist |
| Minor version bump (semver MINOR) that changes SMART scope manifest | Gate 1 + Gate 2 scope minimisation |
| CVE disclosed in app dependency (CVSS ≥ 7.0) | Gate 1 re-run; Gate 2 if PHI handling changed |
| HIPAA or GDPR regulation change affecting PHI handling | Gate 2 + BAA re-review |
| FDA SaMD classification change | Gate 4 full re-run |

The Marketplace registry tracks certificate expiry. Thirty days before expiry, the app's
listing is flagged `recertification-pending`. On expiry, the Capsule operator prevents new
installs; existing installs continue under a 30-day grace period, after which they are
suspended until recertification completes.

---

## 7. Layer 4 — Tenant-side controls

HealthStack tenant admins retain governance over which certified apps run in their tenant:

### 7.1 App allowlist

Tenant admin maintains an explicit allowlist in the CuraOS Admin UI. Default: empty (no apps
allowed until admin explicitly approves). Actions:

- **Allow** — app visible to tenant users, installable.
- **Suspend** — app hidden from tenant users; existing instances paused.
- **Block** — app removed from tenant; data export offered before purge.

Allowlist is stored in the tenant config record (neutral `tenancy-service`), not in the
HealthStack overlay, to preserve the neutral/vertical boundary.

### 7.2 Per-app scope grant review

Before an app is allowed in the tenant, the admin reviews the SMART scope manifest. The UI
presents:

- Scope string (e.g. `patient/Condition.read user/Observation.read`)
- Human-readable translation of each scope (generated from `smart-app-launch` spec labels)
- Last-used date for each scope (populated after first install)
- "Scope reduction" option — admin may grant a subset of declared scopes (app receives only
  granted scopes; if app requires a withheld scope, it gets 403 and must degrade gracefully)

Scope grant decisions are logged to the tenant audit trail (non-PHI audit, `tenancy-audit`
topic).

### 7.3 Audit visibility

Tenant admin has read access to:

- Per-app FHIR call volume (aggregated, non-PHI) — daily/weekly/monthly chart
- Per-app PHI audit log (filtered to tenant; PHI fields visible only to users with
  `phi-audit:read` permission)
- Per-app quota utilisation chart (CPU, memory, FHIR req/min)
- Alert history (quota breaches, Falco CRITICAL events, 429 rate-limit events)

---

## 8. SLA guarantees

The following SLAs apply to HealthStack tenants with the enforcement layers active.

| Scenario | Clinical service P95 latency | Clinical service availability |
|---|---|---|
| No apps installed | < 250 ms | 99.9% monthly |
| Non-certified apps installed (Layer 1 active — blocked from clinical services) | < 250 ms (unaffected — no direct path) | 99.9% (unaffected) |
| Certified apps installed, normal load (Layer 2 active — within quota) | < 300 ms (≤ 50 ms overhead from proxy hop on certified path) | 99.9% |
| Certified app DOS attempt (quota ceiling hit) | < 250 ms (clinical traffic QoS Guaranteed class isolates; app rate-limited at gateway) | 99.9% |
| Certified app quota breach (auto-suspend triggered at 60 s overrun) | < 250 ms restored within 90 s of breach detection | 99.9% |

**Measurement:** The `latency-sla` integration test suite (ADR-0208 §CI) runs P95 latency on
the canonical clinical path (patient lookup → encounter open → FHIR Observation write) under
three conditions: no apps, certified app at 50% quota, certified app at 100% quota. All three
must pass before a HealthStack release is promoted.

---

## 9. Patient-centric verification

Per ADR-0099 §15, the following enforcement checks are CI-gated for all Builder-generated and
marketplace apps targeting HealthStack tenants.

### 9.1 Patient experience SLA

| Check | Gate | Threshold |
|---|---|---|
| FHIR query response time (proxy round-trip) | Integration test | P95 ≤ 500 ms from app perspective (proxy overhead ≤ 250 ms beyond clinical-tier latency) |
| App render time on clinical workstation profile | Playwright benchmark | Time-to-interactive ≤ 2 s on reference hardware (4-core, 8 GiB RAM) |
| Language localisation | axe-core + i18n lint | `lang` attribute present; all user-visible strings in i18n catalogue |

### 9.2 Clinician experience SLA

| Check | Gate | Threshold |
|---|---|---|
| Fields per primary screen | `clinician-experience-lint` CI check | ≤ 7 ± 2 data entry fields per screen (Miller's Law; per ADR-0099 §15) |
| Keyboard-first UX | axe-core + manual | All primary clinical actions reachable without mouse |
| Undo support | Manual review for Verified-Clinical | Any destructive clinical action (delete note, cancel order) has undo or confirm-then-undo |
| Cognitive load index | `clinician-experience-lint` | Score ≤ 3 (0-5 scale; counts nested modals, required scroll, unlabelled icons) |

`clinician-experience-lint` is a CuraOS-internal ESLint + Playwright plugin that:
- Counts form fields per rendered route
- Detects missing `aria-label` on interactive elements
- Flags nested modal depth > 1
- Reports unlabelled icon buttons

**CI gate:** every Builder-generated app must pass `clinician-experience-lint` before it is
allowed to be published to a HealthStack tenant marketplace listing. Self-Certified Community
apps are exempt (they cannot be installed in HealthStack tenants anyway).

### 9.3 Admin tier constraint

Admin-tier app workflows (e.g. patient intake dashboards, billing reconciliation tools) MUST
NOT issue synchronous FHIR reads on the critical path of a clinician workflow. Detection:

- APISIX access log analysis identifies app FHIR calls that overlap in time with open
  clinician sessions for the same patient. If overlap rate > 10% of clinician session windows,
  the app is flagged for review.
- Flagged apps enter a 30-day remediation window; if unresolved, listing is suspended.

---

## 10. Amendments to existing ADRs

### ADR-0121b §7 — Per-app multi-tenant isolation

Replace existing text (which described isolation ambiguously as "per-tenant namespace per ADR-0109") with:

> **§7 Clinical SLA isolation (per ADR-0161)**
> Apps installed in HealthStack tenants operate under a three-layer enforcement regime
> defined in ADR-0161. Non-certified apps are network-isolated from all `tier-clinical`
> services via Cilium NetworkPolicy and APISIX route blocks; all clinical data access
> transits `fhir-proxy-service`. Certified apps operate in `tier-app-certified` namespace
> with Capsule quotas and K8s Burstable QoS, ensuring clinical Guaranteed-class pods are
> evicted last. Certification tiers (Community / CuraOS-Certified / CuraOS-Verified-Clinical)
> determine installability in HealthStack tenants; see ADR-0161 §6 for the full checklist.

### ADR-0208 §F-012 enforcement

Add to the existing SLA enforcement table (ADR-0208 §2.2):

| SLA | Mechanism | ADR |
|---|---|---|
| Admin-tier app traffic isolated from clinical-tier | Layer 1: Cilium NetworkPolicy + APISIX 403; Layer 2: Capsule quota + QoS | ADR-0161 |
| App FHIR access audited | `fhir-proxy-service` PHI audit on every proxy call | ADR-0161, ADR-0157 |
| App SMART scope enforced | `fhir-proxy-service` scope validation before upstream call | ADR-0161, ADR-0115 §6 |

Add cross-reference at heading: "Clinical SLA enforcement for tenant apps: see ADR-0161."

### ADR-0109 §13 — Tenant isolation

Add namespace entry to the namespace topology table:

| Namespace | Purpose | Capsule quota | Network zone |
|---|---|---|---|
| `tier-clinical` | HealthStack clinical services | Guaranteed QoS; no app traffic | Clinical zone (ADR-0161) |
| `tier-app-certified` | CuraOS-Certified apps in HealthStack tenants | Burstable; per-app quota from `ClinicalAppQuota` CRD | App-certified zone (ADR-0161) |
| `tier-app` | All other tenant apps | BestEffort; no direct clinical access | App zone (ADR-0161) |

### ADR-0099 §15 — Patient-centric enforcement table

Add row:

| Priority tier | Mechanism | Enforced by |
|---|---|---|
| Admin-tier apps never degrade clinical quality | Three-layer enforcement (network isolation, quota, certification) | ADR-0161 |
| Clinician UX cognitive load ≤ 7 ± 2 fields | `clinician-experience-lint` CI gate | ADR-0161 §9.2 |
| PHI audit on all app-driven FHIR reads | `fhir-proxy-service` mandatory audit | ADR-0161 §4.2 |

Add cross-reference: "Certification process for apps handling PHI: see ADR-0161 §6."

---

## 11. Action items

| # | Action | Owner | Target |
|---|---|---|---|
| A1 | Implement `ClinicalAppQuota` CRD + Capsule webhook | Platform/Infra | M-next |
| A2 | Implement `fhir-proxy-service` (scope validate + rate limit + audit + Presidio redact) | HealthStack | M-next |
| A3 | Author Cilium NetworkPolicy `block-app-to-clinical` + apply to all HealthStack clusters | Platform/Infra | M-next |
| A4 | Author APISIX route rules for clinical-access-denied 403 from `tier-app` | Platform/Infra | M-next |
| A5 | Author Falco rule `direct_app_to_clinical_tcp` + response plugin (kill pod) | Security | M-next |
| A6 | Build `ClinicalAppCertification` workflow in Workflow Manager (Gates 1–4 state machine) | Platform | M+1 |
| A7 | Build `clinician-experience-lint` ESLint + Playwright plugin | Frontend Platform | M+1 |
| A8 | Build tenant admin scope-grant review UI in CuraOS Admin | Frontend | M+1 |
| A9 | Write `latency-sla` integration test for three-scenario SLA validation | QA | M+1 |
| A10 | Amend ADR-0121b §7, ADR-0208 §F-012, ADR-0109 §13, ADR-0099 §15 as specified in §10 | Architecture | M-next |
| A11 | Draft ADR-0162 (BAA-ready PHI handling) — dependency for Gate 2 HIPAA review | Security/Legal | M+1 |

---

## 12. Open questions

| # | Question | Blocking | Owner |
|---|---|---|---|
| Q1 | Should `fhir-proxy-service` be a standalone NestJS service or an APISIX plugin (Wasm)? Wasm has lower latency; NestJS has richer Presidio integration. Recommend: NestJS service in `tier-platform`, co-located with APISIX via sidecar. | A2 | HealthStack lead |
| Q2 | Presidio redaction latency: Presidio NER is GPU-accelerated but adds ~20–80 ms per response. Does this keep proxy round-trip within the 250 ms overhead budget? Recommend: benchmark on reference dataset before M-next ship. | A2 | HealthStack lead |
| Q3 | Who issues the CuraOS clinical Cosign key pair, and what is the HSM/KMS custody plan for it? Recommend: OpenBao (ADR-0108) transit backend with dual-approval policy for signing operations. | A6 | Security lead |
| Q4 | Does the `ClinicalAppQuota` CRD need to be scoped per-app-per-tenant (matrix) or per-app (global)? Per-tenant gives finer control but multiplies CRD objects. Recommend: per-app-per-tenant with a per-tenant default CRD. | A1 | Platform/Infra |
| Q5 | FDA SaMD gate (Gate 4): does CuraOS have clinical SMEs on staff or does this require an external review contract? Timeline impact on CuraOS-Verified-Clinical tier. | A6 | Product / Clinical |

---

## 13. References

| Reference | Relevance |
|---|---|
| ADR-0099 §15 — Charter priorities and patient-centric vision | Immutable priority ordering this ADR makes mechanically enforceable |
| ADR-0109 — Containers and orchestration (Capsule, Cilium, Falco, Cosign) | Infrastructure enforcement mechanisms |
| ADR-0115 — HealthStack overlays (SMART-on-FHIR, SaMD) | Clinical auth scope layer; FDA SaMD considerations |
| ADR-0120 — Auth (Better Auth, SMART scopes, Cerbos) | SMART-on-FHIR token issuance and scope claim |
| ADR-0121b — Foundation Apps | ADR amended by this decision (§7 isolation) |
| ADR-0151 F-012 — Cross-cluster coherence scan | Finding this ADR resolves |
| ADR-0157 — PHI audit trail | Hash-chained audit log consumed by `fhir-proxy-service` |
| ADR-0162 — BAA-ready PHI handling (forthcoming) | HIPAA gate dependency for CuraOS-Certified apps |
| ADR-0208 — HealthStack cluster design (clinical services, SLA table) | ADR amended by this decision (§F-012 enforcement) |
| SMART App Launch 2.0 — HL7/HL7 FHIR | SMART scope specification for proxy enforcement |
| Presidio — Microsoft | PHI/PII NER detection and redaction engine |
| Capsule — Clastix | K8s multi-tenancy operator (namespace quota, RBAC projection) |
| Cilium — CNCF | eBPF CNI with L3/L4/L7 NetworkPolicy |
| Falco — CNCF | Runtime syscall anomaly detection |
| IEC 62304 — ISO/IEC | Medical device software lifecycle (SaMD classification) |
| WCAG 2.2 AA — W3C | Accessibility standard for Gate 3 review |
