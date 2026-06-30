---
name: curaos-local-vs-3rdparty-rule
title: Local vs 3rd-party provider
description: Cross-cutting rule - every integratable area in CuraOS must support BOTH local self-service AND 3rd party integration
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User-stated rule (2026-05-24, ADR re-evaluation phase):

**Every integratable area in CuraOS must offer BOTH:**
1. **Local / self-hosted / first-party** option (CuraOS-managed component) - the default for SaaS + on-prem + air-gap
2. **3rd-party / external / provider** integration option (BYO provider via config)

Apply to every relevant ADR + every relevant component.

**Examples (rule, not exhaustive list):**

| Area | Local option | 3rd-party option |
|---|---|---|
| AI / LLM | vLLM-hosted Qwen3/DeepSeek/Phi4 | OpenAI / Anthropic / Bedrock / Gemini via LiteLLM gateway |
| Auth federation | CuraOS Auth standalone | Tenant federates Azure AD / Okta / Google Workspace / etc. |
| Email delivery | Self-hosted Postfix/Haraka | SendGrid / Postmark / Mailgun / SES |
| SMS | (HIPAA: not used) | Twilio / Vonage (non-PHI flows) |
| Object storage | SeaweedFS self-hosted | AWS S3 / Backblaze B2 / Wasabi |
| Cache / KV | Valkey self-hosted | Redis Cloud / Upstash |
| Search | OpenSearch self-hosted | Algolia / Elastic Cloud |
| Vector DB | pgvector / Qdrant self-hosted | Pinecone / Weaviate Cloud / Qdrant Cloud |
| Workflow execution | Temporal self-hosted | Temporal Cloud / Inngest Cloud / Trigger.dev Cloud |
| BPM / automation | Activepieces self-hosted | Zapier / Make / n8n Cloud (if license permits via tenant key) |
| CDN / asset delivery | Self-hosted nginx + reverse proxy | Cloudflare / Fastly / Bunny CDN |
| Analytics / BI | Superset + ClickHouse self-hosted | Metabase Cloud / Mode / Looker |
| Observability - APM | Tempo + VictoriaMetrics + Loki self-hosted | Datadog / New Relic / Honeycomb |
| Observability - error tracking | GlitchTip self-hosted | Sentry / Bugsnag |
| Secrets | OpenBao self-hosted | HashiCorp Vault Cloud / AWS Secrets Manager (BYO) |
| Container registry | Harbor self-hosted | Docker Hub / GHCR / quay.io |
| Code repository | Gitea self-hosted | GitHub / GitLab / Bitbucket |
| CI/CD | GitHub Actions self-hosted runners (ARC) | GitHub-hosted runners / CircleCI / Buildkite |
| FHIR server | HAPI FHIR self-hosted (HealthStack) | Medplum Cloud / Smile CDR Cloud / external EHR's FHIR endpoint |
| Terminology | Snowstorm self-hosted | NLM Value Sets / external terminology service |
| DICOM PACS | dcm4chee self-hosted | DICOM cloud (Google Healthcare, AWS HealthImaging) |
| Real-time collab | Hocuspocus self-hosted | Liveblocks (commercial, BYO) |
| i18n TMS | Weblate self-hosted | Crowdin / Lokalise / Phrase |
| Newsletter / marketing | Listmonk self-hosted | Mailchimp / Brevo / ConvertKit |
| Payment processing | (out of scope?) | Stripe / Adyen / Square |
| File-collab | Nextcloud self-hosted | Dropbox / Google Drive / OneDrive |
| Chat | Mattermost / Rocket.Chat self-hosted | Slack / Microsoft Teams |

**Implementation pattern:** every CuraOS service exposes a **provider abstraction interface** (e.g., `LLMProvider`, `StorageProvider`, `EmailProvider`) with two default implementations:
- `CuraOSLocalProvider` (default; uses CuraOS-bundled OSS)
- `External3rdPartyProvider` (configurable per tenant; uses tenant-supplied credentials)

Tenant chooses per area via configuration (per ADR-0099 §11 config-driven). Plugin/sidecar architecture (per ADR-0123) lets tenants add custom provider implementations.

**Why:**
- SMB on-prem tenant: wants everything local (single binary install)
- SaaS small tenant: wants vendor-managed local CuraOS components (no third-party signups)
- SaaS enterprise tenant: wants to plug in their own cloud accounts (AWS S3, Datadog APM, etc.)
- Hybrid tenant: vendor SaaS control plane + customer cloud data plane
- Air-gap tenant: only local

**This is BOTH a modulith requirement AND a microservice requirement.** Same code, runtime config picks provider. Per ADR-0099 §5 two-mode runtime topology.

**Apply to:** every ADR re-evaluation + every new ADR + every implementation milestone. When evaluating any OSS dependency, ALWAYS ask "can tenants swap this with a 3rd-party provider via config?"
