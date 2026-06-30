# ADR-0121c — CuraOS Widgets (Standalone Product)

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099](0099-charter-priorities-vision.md), [ADR-0100](0100-foundation-platform-runtime.md), [ADR-0121 Builder Suite](0121-foundation-builder.md), [ADR-0106 Frontend](0106-frontend.md), [ADR-0150 Baseline](0150-baseline-alignment-rules.md)

---

## 1. Context

**CuraOS Widgets** = sellable standalone product under Builder Suite. Embeddable forms / polls / calculators / charts / calendars / chat / FHIR-aware patient-facing surfaces for 3rd-party hosts. Replaces Typeform embed / Tally / Cognito Forms / Calendly embed + adds HealthStack-specific embeddable patient surfaces (appointment booker, symptom checker, intake widgets).

Max-scope per user direction: embeddable + marketplace + HealthStack-branded bundles. Three embed formats per publisher choice. Iframe + Shadow DOM isolation per widget. Hybrid marketplace + private + per-widget pricing.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **Scope (v1)** | Generic embeddable widgets + tenant widget marketplace + HealthStack patient-facing embeddable surfaces |
| **Embedding formats (publisher picks)** | Lit Web Components (default) + React component (npm) + script-tag auto-iframe (zero-config) |
| **Isolation (publisher picks per widget)** | Iframe + sandbox + CSP (HIPAA-safe; PHI widgets default) + Shadow DOM (light non-PHI widgets) |
| **Host-widget API** | postMessage with typed message schema (Zod-validated) for iframe; CustomEvent + attribute API for Shadow DOM |
| **Distribution model** | Hybrid: marketplace + private; per-widget pricing per publisher choice |
| **Monetization** | Free / Paid one-time / Subscription / Per-submission overage; Stripe Connect for paid widgets; CuraOS commission (20%) per ADR-0121b |
| **Marketplace tiers** | First-party + Certified + Community + Private (mirrors ADR-0121b Apps) |
| **HealthStack patient widgets** | FHIR-aware (Patient, Appointment, Observation, Consent, QuestionnaireResponse); SMART-on-FHIR scopes per ADR-0120; PHI-safe iframe default |
| **Per-tenant multi-tenancy** | Per-widget tenant context via signed JWT in postMessage handshake |
| **Build emission** | Codegen recipes (per ADR-0123): `widget.lit`, `widget.react`, `widget.iframe` |
| **Build output** | Versioned bundle in Harbor OCI; cosign-signed; CDN-distributable |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Tenant publisher in CuraOS Builder IDE                      │
│  - Widget canvas (GrapesJS Widget mode) + property panels    │
│  - Per-widget settings:                                       │
│    * Embed formats to emit (Lit / React / script-tag)        │
│    * Isolation mode (iframe / Shadow DOM)                    │
│    * Distribution (marketplace public / private)             │
│    * Pricing (free / paid / subscription / per-submission)   │
│  - FHIR-aware block library for HealthStack widgets          │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Widgets Build Service (NestJS sidecar)                      │
│  - Per chosen embed format, invokes Codegen recipe           │
│  - Lit format: Web Component bundle (vite + lit)             │
│  - React format: npm package + types                          │
│  - Script-tag: single .js loader that injects iframe         │
│  - All outputs cosign-signed + pushed to Harbor              │
└──────┬───────────────┬──────────────────┬────────────────────┘
       │               │                  │
       ▼               ▼                  ▼
┌──────────────┐ ┌───────────────┐ ┌─────────────────────────────┐
│ Lit Web      │ │ React npm     │ │ Script-tag loader           │
│ Component    │ │ package       │ │ <script src=".../widget.js">│
│ (any host)   │ │ (React hosts) │ │ </script>                   │
│              │ │               │ │ (auto-injects sandboxed     │
│              │ │               │ │  iframe)                    │
└──────────────┘ └───────────────┘ └─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Widget runtime in 3rd-party host page                       │
│  - Iframe (default) OR Shadow DOM                            │
│  - postMessage API for host ↔ widget communication           │
│  - Signed JWT in handshake for tenant context                │
│  - Telemetry beacon to CuraOS (anonymized; per-tenant opt-in)│
└──────────────────────────────────────────────────────────────┘
                             │
              ┌──────────────┼────────────────────┐
              │              │                    │
              ▼              ▼                    ▼
   ┌──────────────┐ ┌──────────────────┐ ┌──────────────────────┐
   │ CuraOS Auth  │ │ CuraOS Forms     │ │ CuraOS Workflow      │
   │ (ADR-0120)   │ │ (ADR-0121e)      │ │ Manager (ADR-0122)   │
   │              │ │ — Form widget    │ │ — Trigger on widget   │
   │ JWT for      │ │ submissions      │ │ submit                │
   │ tenant       │ │ → Forms API      │ │                       │
   └──────────────┘ └──────────────────┘ └──────────────────────┘
```

---

## 4. Embedding format details

### 4.1 Lit Web Components (default)

- Output: `<curaos-widget-{name}>` custom element
- One-line embed: `<script type="module" src="https://cdn.cura.os/widgets/{tenant}/{widget}-v{semver}.js"></script>` + `<curaos-widget-{name} tenant="..." config-url="..."></curaos-widget-{name}>`
- Standards-based; works in any host framework (React, Vue, Angular, vanilla, Astro, Next, anything)
- Shadow DOM isolation by default
- Smallest bundle (Lit ~6KB gzipped)

### 4.2 React component (npm)

- Output: `@curaos/widgets/{tenant}/{widget}` npm package
- Embed: `import { CuraOSAppointmentBooker } from '@curaos/widgets/...'` + `<CuraOSAppointmentBooker tenant="..." />`
- For React hosts wanting native component (no Web Component wrapper)
- Tree-shakeable; React refs/contexts work
- Tenant publishes package to npm public OR CuraOS private registry (Verdaccio per ADR-0110)

### 4.3 Script-tag auto-iframe (zero-config)

- Output: single self-contained `.js` loader script
- Embed: `<script src="https://cdn.cura.os/widgets/{tenant}/{widget}.js" data-config="..."></script>`
- Loader auto-injects iframe at script position
- Maximum isolation (iframe sandbox + CSP)
- Smallest customization; trade-off for max safety + zero-config
- Best for non-technical 3rd-party publishers (blog owners, hospital marketing sites)

---

## 5. Isolation modes (per-widget publisher choice)

### 5.1 Iframe + sandbox + CSP (HIPAA default)

- Iframe attributes: `sandbox="allow-scripts allow-forms allow-same-origin"` (configurable; PHI widgets typically omit `allow-same-origin`)
- CSP header: strict default-src + per-tenant whitelist for fonts/CDN
- Widget origin: `https://widgets.cura.os/t/{tenant}/{widget}/` (CuraOS-served, tenant subdomain)
- Host can only interact via postMessage with Zod-validated schema
- Widget cannot read host page DOM, cookies, localStorage
- **Use for:** any widget handling PHI (HealthStack patient surfaces), payment widgets, login widgets, anything that needs strict cross-origin isolation

### 5.2 Shadow DOM (light default)

- Web Component renders into Shadow Root
- Scoped CSS (host page styles don't leak in; widget styles don't leak out)
- Host can interact via attributes + CustomEvent
- Widget runs in same origin as host (more host-trust required)
- **Use for:** non-PHI widgets (chat, polls, charts, calculators, marketing widgets)

---

## 6. HealthStack widget library

Per ADR-0099 §15 patient-centric vision, HealthStack widget catalog (first-party + extensible):

| Widget | Purpose | FHIR scope |
|---|---|---|
| `appointment-booker` | Patient self-service appointment booking | `Appointment.write` + `Slot.read` + `Practitioner.read` |
| `symptom-checker` | LLM-assisted triage (with disclaimer); NOT autonomous | `Condition.read` (proposed; not committed) |
| `intake-form` | Pre-visit clinical intake (FHIR QuestionnaireResponse) | `Questionnaire.read` + `QuestionnaireResponse.write` |
| `consent-capture` | Patient consent signature + audit | `Consent.write` |
| `prescription-refill` | Patient self-service refill request | `MedicationRequest.write` |
| `lab-results-viewer` | Patient views their own lab results | `Observation.read` + `DiagnosticReport.read` |
| `care-plan-viewer` | Patient sees + acknowledges care plan tasks | `CarePlan.read` + `Task.write` |
| `chat-with-care-team` | Async messaging with care team | `Communication.write` |
| `vitals-self-report` | Patient logs at-home vitals | `Observation.write` |
| `payment-portal` | Co-pay / bill pay (NON-PHI billing data only) | N/A (billing service) |

All HealthStack widgets default to iframe + strict sandbox (HIPAA safe). Use SMART-on-FHIR launcher (per ADR-0120) for patient authentication.

---

## 7. Multi-tenant + signed handshake

Widget knows its tenant via signed JWT included in initial postMessage handshake:

```
host page → widget iframe: postMessage({ type: 'init', config: { tenantContextJWT: '...' } })
widget validates JWT signature against CuraOS Auth JWKS
widget loads tenant-specific config (theme, locale, FHIR endpoint, etc.)
widget responds: postMessage({ type: 'ready' })
```

JWT contains: `tenant_id`, `widget_id`, `widget_version`, `signed_origin` (allowed host domain), `expiry`. Host cannot fake tenant; widget cannot embed on unauthorized host.

---

## 8. Local + 3rd-party rule applied

| Area | Local default | 3rd-party (BYO) |
|---|---|---|
| Widget CDN distribution | CuraOS-managed nginx + reverse proxy | Cloudflare / Fastly / Bunny CDN |
| Widget bundle hosting | Harbor OCI registry (per ADR-0109) | npm public registry OR tenant private S3 |
| React component package | Verdaccio (per ADR-0110) | npm public registry |
| Widget marketplace search | OpenSearch self-hosted | Algolia (BYO) |
| Widget telemetry | Self-hosted Tempo + VictoriaMetrics + Loki (per ADR-0107) | Datadog RUM / Sentry / LogRocket |
| Payment processing | Stripe Connect (per ADR-0121b) | Adyen / Square / regional via plugin |
| LLM for symptom-checker widget | vLLM-hosted Qwen3 / DeepSeek / Med42 (per ADR-0114) | OpenAI / Anthropic via LiteLLM |
| FHIR backend for HealthStack widgets | HAPI FHIR self-hosted (per ADR-0115) | Medplum / Smile CDR / external EHR FHIR endpoint |

---

## 9. Marketplace tiers (mirrors ADR-0121b)

| Tier | Trust | Distribution |
|---|---|---|
| **First-party** | CuraOS-built + signed | Default-shown in marketplace; bundled with relevant tier subscriptions |
| **Certified** | Third-party + CuraOS security/accessibility audit + cosign-signed by CuraOS | Highlighted in search |
| **Community** | Tenant-published + self-signed by publisher | Caveat-warned in install flow |
| **Private** | Tenant-internal only; not in marketplace | Only installable within publisher tenant |

---

## 10. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | Widgets Build Service NestJS sidecar + Payload schema for widget definitions |
| M2 | Lit Web Components publish target (default format) |
| M3 | Iframe + sandbox isolation runtime + postMessage handshake protocol |
| M4 | Signed JWT tenant context + JWKS validation |
| M5 | Shadow DOM isolation runtime (for non-PHI widgets) |
| M6 | React component publish target (npm package output) |
| M7 | Script-tag auto-iframe loader |
| M8 | Widgets marketplace v0 (search, install, ratings, tiers) |
| M9 | Cosign signing + tier classification |
| M10 | Stripe Connect for paid widgets + revenue share |
| M11 | HealthStack widget library v0 (appointment-booker, intake-form, consent-capture) |
| M12 | Remaining HealthStack widgets (symptom-checker, prescription-refill, lab-results-viewer, care-plan-viewer, chat-with-care-team, vitals-self-report) |
| M13 | SMART-on-FHIR launcher integration per ADR-0120 |
| M14 | Telemetry beacon + tenant-opt-in analytics |
| M15 | CDN distribution + per-tenant subdomain |
| M16 | Codegen recipes (ADR-0123): `widget.lit`, `widget.react`, `widget.iframe`, `widget.healthstack-fhir` |
| M17 | Air-gap install bundle |
| M18 | v1 GA — sellable standalone |

---

## 11. Open questions

1. **Symptom-checker widget liability** — LLM-assisted triage carries legal risk. Likely disclaim "decision support only, not diagnosis"; FDA SaMD considerations per ADR-0115. May ship Certified-tier-only.
2. **postMessage performance at scale** — for high-frequency widgets (real-time chat, vitals streaming), postMessage overhead matters. Benchmark + maybe BroadcastChannel for same-origin cases.
3. **Cross-domain cookie handling** — third-party cookies dying. Use Storage Access API + Partitioned Cookies for iframe widgets that need persistence.
4. **Widget version pinning** — host pins `widget-v{semver}.js`; auto-update vs explicit upgrade flow. Likely explicit upgrade with optional auto-patch.
5. **Accessibility compliance per embed format** — script-tag iframe inherits iframe a11y limitations. Document host requirements (skip-links, focus management).

---

## 12. References

- [ADR-0121 Builder Suite umbrella](0121-foundation-builder.md)
- [ADR-0121a Sites](0121a-foundation-sites.md)
- [ADR-0121b Apps](0121b-foundation-apps.md)
- [ADR-0106 Frontend](0106-frontend.md)
- [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
- Lit Web Components: https://lit.dev/
- Web Components MDN: https://developer.mozilla.org/en-US/docs/Web/Web_Components
- Shadow DOM MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM
- iframe sandbox MDN: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox
- postMessage MDN: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
- Storage Access API: https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API
- SMART on FHIR App Launch: https://hl7.org/fhir/smart-app-launch/
- @medplum/react FHIR components: https://www.medplum.com/docs
