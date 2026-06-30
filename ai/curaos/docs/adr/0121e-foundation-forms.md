# ADR-0121e — CuraOS Forms (Standalone + Embedded Product)

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099](0099-charter-priorities-vision.md), [ADR-0100](0100-foundation-platform-runtime.md), [ADR-0121 Builder Suite](0121-foundation-builder.md), [ADR-0121d Workflow Canvas](0121d-foundation-workflow-canvas.md), [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md), [ADR-0115 HealthStack](0115-healthstack-overlays.md), [ADR-0150 Baseline](0150-baseline-alignment-rules.md)

---

## 1. Context

**CuraOS Forms** = both an **embedded library** (used by Sites + Apps + Widgets + Workflow Canvas) AND a **standalone sellable product** (CuraOS Forms: Typeform / Google Forms / Cognito Forms class). Tenant builds forms, collects submissions, manages responses, integrates with workflows + external sinks + clinical FHIR Questionnaires.

Max-scope per user direction: Formily + Puck + SurveyJS + FHIR + AI-generated forms; all submission storage modes (PG + external sinks + FHIR/HL7v2); conditional logic + multi-step + e-sig + payments + offline mode.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **Distribution** | Dual — embedded library (`@curaos/forms` npm) + standalone product (CuraOS Forms SaaS / on-prem / air-gap) |
| **Form engines (unified)** | Formily (MIT) JSON-schema engine + Puck (MIT) visual canvas + SurveyJS (MIT) multi-step surveys + AI-generated forms (LLM via LiteLLM per ADR-0114) |
| **FHIR clinical forms** | `@aehrc/smart-forms-renderer` (Apache-2.0) for FHIR Questionnaire / QuestionnaireResponse — HealthStack overlay |
| **Submission storage (per-form choice)** | PG (per-tenant schema; default) + external sinks (Google Sheets / Airtable / Notion / Slack / any Activepieces piece) + FHIR HAPI FHIR + HL7v2 export + Kafka/NATS event |
| **Workflow integration** | On submit → Workflow Manager trigger (Temporal/Activepieces/cron per ADR-0122) + webhook + email notify |
| **Advanced features** | Conditional logic + multi-step / multi-page + skip-logic + calculated fields + file uploads (SeaweedFS per ADR-0101) + e-signature + payment fields + offline mode (PWA + PowerSync) |
| **E-signature** | Custom built on signature-pad (MIT) + cosign-like signature audit + 3rd-party (DocuSign / HelloSign BYO) per ADR-0150 §2 |
| **Payment fields** | Stripe Connect inline (per ADR-0121b) + 3rd-party (Adyen / Square via plugin) |
| **Offline mode** | PWA + IndexedDB + PowerSync (per ADR-0106) for resync on reconnect |
| **AI form generation** | Vercel AI SDK 6 + LiteLLM (per ADR-0114): "describe form" → emit Formily schema |
| **Multi-tenant isolation** | Per-tenant form library + per-tenant submission storage + per-tenant theme |
| **Audit** | Every form publish + every submission hash-chained per ADR-0104 |
| **Codegen recipes** | `form.formily-schema`, `form.fhir-questionnaire`, `form.runtime-react`, `form.runtime-lit`, `form.runtime-react-native` per ADR-0123 |
| **Render targets** | React (web) + Lit (widgets embed) + React Native (mobile) + Astro (static sites) — per ADR-0106 |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  CuraOS Forms UI (React+Next; embeddable or standalone)          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Form Builder Canvas (Puck + Formily + SurveyJS)             │ │
│  │ - Drag-drop field palette                                   │ │
│  │ - Field property panels (validation, conditional, calc)     │ │
│  │ - Multi-step / multi-page navigation builder                │ │
│  │ - FHIR Questionnaire mode (HealthStack overlay)             │ │
│  │ - AI fill: "create patient intake form for SMART-on-FHIR"   │ │
│  │ - Submission storage configurator                           │ │
│  │ - Workflow trigger configurator                             │ │
│  │ - Preview (with synthetic data; HIPAA-safe)                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             │ Save → Formily JSON schema +
                             │        Puck layout + workflow config
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Forms IR Store (NestJS + Payload CMS)                           │
│  - Per-tenant form library                                       │
│  - Version history + snapshots                                   │
│  - Marketplace (per ADR-0121b model)                             │
│  - Audit per edit                                                │
└──────────┬────────────────────────────────────┬─────────────────┘
           │                                    │
           │ Render (per target)                │ Compile (per submission storage)
           ▼                                    ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│  Form Runtime (per target)       │  │  Submission Service (NestJS)     │
│  - React (web)                   │  │  - PG per-tenant schema (default)│
│  - Lit (widgets)                 │  │  - External sinks (Activepieces) │
│  - React Native (mobile)         │  │  - FHIR HAPI FHIR                │
│  - Astro (static site)           │  │  - HL7v2 export                  │
│  - PWA + offline (PowerSync)     │  │  - Kafka/NATS event              │
└──────────────────────────────────┘  │  - Workflow trigger              │
                                      │  - Webhook delivery              │
                                      │  - Email notify                  │
                                      │  - Audit per submission          │
                                      └──────────────────────────────────┘
```

---

## 4. Form engines unified

| Engine | Role |
|---|---|
| **Formily (MIT)** | JSON-Schema-driven form engine; reactive form state; validation; conditional logic; calculated fields |
| **Puck (MIT)** | Drag-drop canvas for layout; field arrangement; multi-column / nested sections |
| **SurveyJS (MIT)** | Multi-step / multi-page survey runtime; survey-specific UX (progress bar, page navigation, conditional branching across pages) |
| **@aehrc/smart-forms-renderer (Apache-2.0)** | FHIR Questionnaire / QuestionnaireResponse rendering for HealthStack clinical forms |
| **LLM (Vercel AI SDK + LiteLLM)** | AI-generated form creation: text description → Formily schema |

CuraOS unifies these behind a single canvas + single IR. Form author works in unified UX; engine choice is mostly internal (Formily for everything by default; SurveyJS for survey-mode flag; FHIR renderer for clinical-mode flag).

---

## 5. Submission storage modes (per-form publisher choice)

| Mode | Backend |
|---|---|
| **PG per-tenant schema (default)** | Prisma model `submission_<form_id>` in tenant's PG schema; structured + queryable |
| **External sinks** | Activepieces piece-based routing (Google Sheets, Airtable, Notion, Slack, Excel, custom REST) |
| **FHIR HAPI FHIR** | `QuestionnaireResponse` resource POST to HAPI FHIR sidecar (HealthStack overlay) |
| **HL7v2 export** | ORU/ORM message conversion via NHapi for interop with legacy clinical systems |
| **Kafka / NATS event** | Submission published as event (`cura.forms.{form_id}.submitted`) for downstream consumers |
| **Webhook delivery** | Signed HMAC POST to tenant-configured URL with retry + idempotency |
| **Email notification** | Notify-service sends form summary to configured recipients |
| **File attachments** | Uploaded files stored in SeaweedFS (per ADR-0101); paths included in submission record |

Multiple modes can be configured per form (e.g., PG default + webhook to tenant CRM + FHIR for HealthStack).

---

## 6. Advanced features

### 6.1 Conditional logic + skip-logic

- Formily reactive expressions
- Per-field show/hide/disable based on other field values
- Per-step branching (skip step 3 if field A = "no")
- Visual rule builder in canvas

### 6.2 Multi-step / multi-page

- SurveyJS-class page navigation
- Progress bar (configurable)
- Save-and-resume (anonymous via cookie token; auth'd via user profile)
- Per-step validation

### 6.3 Calculated fields

- Formily reactive expressions
- Field value = expression of other fields
- Common patterns: BMI calc, age from DOB, totals, weighted scores

### 6.4 File uploads

- Multi-file upload (drag-drop)
- Per-file type + size validation
- Per-tenant SeaweedFS bucket (per ADR-0101)
- HIPAA-safe: PHI files encrypted at rest (server-side encryption); audit per access

### 6.5 E-signature

- Custom CuraOS signature module built on `signature_pad` (MIT)
- Touch + mouse + stylus support
- Captured as SVG + PNG; included in submission
- Audit: signature event hash-chained (per ADR-0104); cosign-style verification
- 3rd-party: DocuSign / HelloSign / Adobe Sign integration via plugin (BYO)
- Tenant can require: simple click-to-sign / drawn / typed / certified (3rd-party)

### 6.6 Payment fields

- Inline Stripe Elements via Stripe Connect (per ADR-0121b)
- Field types: one-time payment, subscription enrollment, donation, deposit
- Webhook on payment success → form submission + workflow trigger
- 3rd-party processors: Adyen / Square / Lemon Squeezy via plugin (BYO)

### 6.7 Offline mode

- PWA installable manifest
- IndexedDB local store (Dexie wrapper)
- PowerSync (per ADR-0106) for sync-on-reconnect
- Conflict resolution: last-write-wins for forms (submissions append-only)
- HealthStack patient/clinician mobile use case: collect intake in low-connectivity environments (rural clinic, ambulance)

---

## 7. Standalone product

CuraOS Forms sellable as standalone competing with:

- **Typeform / Tally / Cognito Forms** (visual form builders)
- **Google Forms / Microsoft Forms** (free generic)
- **Jotform / Formidable** (advanced features + integrations)
- **Hubspot Forms** (marketing automation embed)
- **Survicate / Survey Monkey** (survey-focused)
- **REDCap** (academic/clinical research forms)

CuraOS differentiator: unified form/survey/clinical paradigm + Codegen IR + on-prem/air-gap + FHIR-native HealthStack mode + offline PWA + per-tenant marketplace.

### Pricing tiers

| Tier | Includes | Pricing |
|---|---|---|
| **Free** | 3 forms, 100 submissions/mo, CuraOS branding | Free |
| **Pro** | Unlimited forms, 10k submissions/mo, custom branding, all advanced features (except e-sig + payments) | Per-tenant flat |
| **Business** | Above + e-signature, payment fields, external sink integrations, marketplace publish | Per-tenant + per-submission overage |
| **Clinical (HealthStack)** | Above + FHIR Questionnaire mode, HL7v2 export, SMART-on-FHIR launcher, HIPAA-grade audit | Healthcare-tier pricing |
| **Enterprise** | All + air-gap, custom integrations, dedicated support, SLA | Custom contract |

---

## 8. Local + 3rd-party rule applied

| Area | Local default | 3rd-party (BYO) |
|---|---|---|
| Form hosting | CuraOS-managed Next on K3s | Vercel / Netlify / customer K8s |
| Submission storage primary | PG (per ADR-0101) | External SQL / NoSQL (BYO via Activepieces) |
| External sink connectors | Activepieces pieces (per ADR-0122) | Direct REST (BYO via webhook config) |
| File storage | SeaweedFS (per ADR-0101) | AWS S3 / Backblaze B2 / Wasabi (BYO) |
| E-signature | CuraOS signature module (signature_pad) | DocuSign / HelloSign / Adobe Sign (BYO) |
| Payment processor | Stripe Connect (per ADR-0121b) | Adyen / Square / Lemon Squeezy / regional (BYO via plugin) |
| Email notification | Self-hosted Postfix + notify-service | SendGrid / Postmark / Mailgun (BYO) |
| Offline sync | PowerSync (per ADR-0106) | ElectricSQL / Couchbase Lite (BYO) |
| AI form generation | vLLM-hosted Qwen3 / DeepSeek (per ADR-0114) | OpenAI / Anthropic / Bedrock via LiteLLM (BYO) |

---

## 9. Multi-tenant + marketplace

- Per-tenant form library + per-tenant submission storage
- Form templates marketplace (mirrors ADR-0121b tiers: First-party + Certified + Community + Private)
- Tenant publishes form template; others install + customize
- Cosign-signed templates
- Revenue share for paid templates (Stripe Connect per ADR-0121b)
- HealthStack First-party templates: patient intake, consent, vitals self-report, pre-surgery checklist, medication reconciliation, etc.

---

## 10. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | `@curaos/forms` npm package skeleton (React+Next + Formily base) |
| M2 | Forms IR (JSON canonical schema) + Payload CMS storage |
| M3 | Puck canvas integration + drag-drop field palette |
| M4 | SurveyJS multi-step paradigm |
| M5 | Conditional logic + calculated fields (Formily reactive expressions) |
| M6 | File uploads + SeaweedFS integration |
| M7 | Submission Service (NestJS) + PG per-tenant schema storage |
| M8 | Webhook + email notify on submit |
| M9 | Workflow Manager trigger on submit (per ADR-0122) |
| M10 | External sinks via Activepieces (Google Sheets, Airtable, Notion, Slack) |
| M11 | E-signature module (signature_pad + audit) |
| M12 | Payment fields (Stripe Connect inline) |
| M13 | Offline mode (PWA + PowerSync) |
| M14 | FHIR Questionnaire mode (`@aehrc/smart-forms-renderer` integration) per ADR-0115 |
| M15 | HL7v2 export module |
| M16 | AI form generation (Vercel AI SDK + LiteLLM) |
| M17 | Render target recipes (Codegen ADR-0123): `form.runtime-react`, `form.runtime-lit`, `form.runtime-react-native`, `form.runtime-astro` |
| M18 | Marketplace v0 + cosign signing + tier classification |
| M19 | Standalone product UI (CuraOS Forms SaaS landing) |
| M20 | Pricing tiers + Stripe Connect billing |
| M21 | Air-gap install bundle |
| M22 | v1 GA — embedded library + standalone product both shipping |

---

## 11. Open questions

1. **Formily vs react-hook-form** — Formily is more powerful (reactive schema, dependent fields) but react-hook-form is simpler + more popular. Sticking with Formily for power; react-hook-form available via plugin per tenant choice.
2. **REDCap compatibility** — academic research uses REDCap heavily. Worth REDCap import/export module? Likely v2 add-on for clinical research customers.
3. **Form versioning + in-flight submissions** — if form schema changes mid-survey, what happens to in-flight responses? Likely pin schema version per submission.
4. **Save-and-resume tokens** — anonymous email-link (simplest) vs auth'd user profile vs both. Both.
5. **File scan on upload** — Trivy/ClamAV scan uploaded files (HIPAA)? Yes; pipeline with quarantine.
6. **GDPR submission deletion** — tenant must support DSAR; submission deletion cascades through PG + SeaweedFS + external sinks (audit but irrecoverable).

---

## 12. References

- [ADR-0121 Builder Suite umbrella](0121-foundation-builder.md)
- [ADR-0121a Sites](0121a-foundation-sites.md)
- [ADR-0121b Apps](0121b-foundation-apps.md)
- [ADR-0121c Widgets](0121c-foundation-widgets.md)
- [ADR-0121d Workflow Canvas](0121d-foundation-workflow-canvas.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0115 HealthStack](0115-healthstack-overlays.md)
- [ADR-0114 AI/Agent](0114-ai-agent-integration.md)
- [ADR-0150 Baseline](0150-baseline-alignment-rules.md)
- Formily: https://formilyjs.org/
- Puck: https://puckeditor.com/
- SurveyJS: https://surveyjs.io/
- @aehrc/smart-forms-renderer: https://github.com/aehrc/smart-forms
- signature_pad: https://github.com/szimek/signature_pad
- PowerSync: https://www.powersync.com/
- Vercel AI SDK 6: https://vercel.com/blog/ai-sdk-6
- REDCap: https://www.project-redcap.org/
- Stripe Elements: https://stripe.com/docs/payments/elements
- Stripe Connect: https://stripe.com/connect
