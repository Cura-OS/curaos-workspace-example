# ADR-0154 — Provider Abstraction Convention

**Status:** Accepted
**Date:** 2026-05-24
**Resolves:** [ADR-0151 Finding F-005 (Major) — Provider abstraction naming inconsistency across ADRs](0151-cross-cluster-coherence.md)
**Parent ADRs:** [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md) · [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md) · [ADR-0209 Frontend Packages + Backend Libs](0209-cluster-frontend-packages-backend-libs.md)

---

## Executive Summary

ADR-0150 §2 mandates that every integratable area in every CuraOS NestJS service expose **both** a local/self-hosted default and a configurable 3rd-party implementation. ADR-0151 F-005 identified that no ADR specified the naming convention, package location, DI wiring, or runtime-selection mechanism for these "provider abstractions" — leaving each service team to invent their own naming and creating collision risk.

This ADR fixes that gap completely. It defines:

1. **Interface naming convention** — `<Domain>Provider` (interfaces) + `<Domain><Variant>Provider` (implementations).
2. **Base contract** — shared `CuraOSProvider<TConfig>` base interface all providers implement.
3. **Package structure** — `@curaos/providers` (base + registry) + per-domain `@curaos/<domain>-provider` packages.
4. **NestJS DI wiring** — injection token pattern + `ProviderModule` factory per domain.
5. **Config shape** — per-tenant YAML/JSON config selects primary + optional fallback per domain.
6. **Observability + health requirements** — every provider emits OTel spans + health signal.
7. **Zod validation** — every provider config schema is a Zod object validated at bootstrap.
8. **Canonical inventory** — all ~33 provider domains across CuraOS, each with interface name, local default, 3rd-party options, and source ADRs.

---

## 1. Convention

### 1.1 Interface Naming

| Element | Pattern | Example |
|---|---|---|
| Provider interface | `<Domain>Provider` | `LLMProvider`, `StorageProvider`, `EmailProvider` |
| Local implementation | `<Domain>LocalProvider` | `LLMLocalProvider`, `StorageLocalProvider` |
| External/3rd-party implementation | `<Domain><VendorName>Provider` | `LLMOpenAIProvider`, `StorageS3Provider` |
| DI injection token | `<DOMAIN>_PROVIDER` (SCREAMING_SNAKE) | `LLM_PROVIDER`, `STORAGE_PROVIDER` |
| NestJS module | `<Domain>ProviderModule` | `LLMProviderModule`, `StorageProviderModule` |

**Rules:**

- `Provider` suffix always — never `Service`, `Adapter`, `Gateway`, or `Client` for the swappable abstraction layer.
- Implementation class names must include both the domain and the variant (local or vendor name). `CuraOSLocalProvider` and `External3rdPartyProvider` (mentioned in ADR-0150 §2) are retired in favour of this explicit naming — they were placeholders.
- Vendor name in implementation class name must match the vendor's canonical short name (e.g., `OpenAI`, `Anthropic`, `Twilio`, `Stripe`, `SendGrid`).
- When a local default wraps an OSS product, use the OSS product name: `StorageSeaweedFSProvider`, not `StorageLocalProvider`, unless the local default is a CuraOS-native implementation with no external dependency (then `Local` is fine).

### 1.2 Base Contract

Every provider interface extends `CuraOSProvider<TConfig>` exported from `@curaos/providers`.

```typescript
// @curaos/providers — base.ts

import { z } from 'zod';
import { Span } from '@opentelemetry/api';

/**
 * Base interface all CuraOS provider implementations must satisfy.
 * TConfig = Zod-inferred config type for this provider variant.
 */
export interface CuraOSProvider<TConfig extends Record<string, unknown>> {
  /** Provider identity — used in logs, traces, and health responses. */
  readonly providerName: string;         // e.g. 'openai', 'seaweedfs', 'postfix'
  readonly providerType: 'local' | 'external' | 'custom';

  /** Validate and store config at module-init time. Throws ZodError on bad config. */
  init(config: TConfig): Promise<void>;

  /** Release connections / subscriptions. Called on module destroy. */
  dispose(): Promise<void>;

  /** Liveness probe — returns true if the provider is reachable. */
  healthCheck(): Promise<ProviderHealthResult>;

  /** Declarative capability tags — used by ProviderRegistry for capability-gated feature flags. */
  capabilities(): ProviderCapability[];
}

export interface ProviderHealthResult {
  healthy: boolean;
  latencyMs?: number;
  detail?: string;
}

export type ProviderCapability =
  | 'streaming'
  | 'batch'
  | 'async'
  | 'phi-safe'        // provider has BAA / data residency guarantees
  | 'air-gap'         // provider works without external network
  | 'hipaa-baa'
  | string;           // extensible
```

Every **domain interface** declares its operational methods on top of this base:

```typescript
// Example: @curaos/storage-provider — interface.ts
import { CuraOSProvider } from '@curaos/providers';
import { z } from 'zod';

export const StorageProviderConfigSchema = z.object({
  endpoint: z.string().url(),
  bucket:   z.string().min(1),
  accessKeySecret: z.string().optional(), // OpenBao path
  region:   z.string().optional(),
});
export type StorageProviderConfig = z.infer<typeof StorageProviderConfigSchema>;

export interface StorageProvider extends CuraOSProvider<StorageProviderConfig> {
  presignUpload(key: string, ttlSeconds: number): Promise<string>;
  presignDownload(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  headObject(key: string): Promise<StorageObjectMeta | null>;
}
```

### 1.3 Config Shape

Per-tenant provider selection lives in `settings-service` under key `providers.<domain>`. The canonical serialisation format is YAML; the JSON equivalent is accepted at runtime.

```yaml
# tenant.providers.yaml  (stored in settings-service, validated at service bootstrap)

llm:
  primary: local-vllm
  fallback: openai          # optional; activated on primary unhealthy
  providers:
    local-vllm:
      endpoint: http://vllm:8000
      model: qwen3-72b
    openai:
      api_key_secret: openbao://tenants/{tenant_id}/openai/key
      model: gpt-4o
      org_id_secret: openbao://tenants/{tenant_id}/openai/org

storage:
  primary: seaweedfs
  providers:
    seaweedfs:
      endpoint: http://seaweedfs:9333
      bucket: curaos-{tenant_id}
    s3:
      endpoint: https://s3.amazonaws.com
      bucket: curaos-{tenant_id}
      access_key_secret: openbao://tenants/{tenant_id}/aws/s3-key
      region: us-east-1

email:
  primary: postfix
  providers:
    postfix:
      host: postfix
      port: 587
    sendgrid:
      api_key_secret: openbao://tenants/{tenant_id}/sendgrid/key
```

**Rules:**

- `primary` is required. `fallback` is optional.
- Every secret reference uses OpenBao path format (`openbao://<path>`). No plaintext secrets in provider config.
- `{tenant_id}` is a runtime substitution token resolved by `@curaos/tenancy` `TenantContextService`.
- Config is loaded once at NestJS bootstrap via `ProviderModule.forRootAsync()`. Hot-reload is not supported; a pod restart is required to pick up new provider config.
- Unknown provider names (not registered in `ProviderRegistry`) cause a fatal bootstrap error, not a silent fallback.

### 1.4 SDK Pattern — `@curaos/*-provider` npm Packages

```
@curaos/providers                        ← base interface, ProviderRegistry, ProviderModule factory
@curaos/llm-provider                     ← LLMProvider interface + Zod config schema
  @curaos/llm-provider-vllm              ← LLMvLLMProvider (local default)
  @curaos/llm-provider-openai            ← LLMOpenAIProvider
  @curaos/llm-provider-anthropic         ← LLMAnthropicProvider
  @curaos/llm-provider-litellm           ← LLMLiteLLMProvider (proxy for Bedrock/Gemini/etc.)
@curaos/storage-provider                 ← StorageProvider interface + Zod config schema
  @curaos/storage-provider-seaweedfs     ← StorageSeaweedFSProvider (local default)
  @curaos/storage-provider-s3            ← StorageS3Provider (AWS S3 / Backblaze / Wasabi)
@curaos/email-provider                   ← EmailProvider interface
  @curaos/email-provider-postfix         ← EmailPostfixProvider (local default)
  @curaos/email-provider-sendgrid        ← EmailSendGridProvider
  @curaos/email-provider-postmark        ← EmailPostmarkProvider
  @curaos/email-provider-mailgun         ← EmailMailgunProvider
@curaos/sms-provider                     ← SMSProvider interface (no local default)
  @curaos/sms-provider-twilio            ← SMSTwilioProvider
  @curaos/sms-provider-vonage            ← SMSVonageProvider
@curaos/push-provider                    ← PushProvider interface
  @curaos/push-provider-expo             ← PushExpoProvider (local default)
  @curaos/push-provider-onesignal        ← PushOneSignalProvider
  @curaos/push-provider-fcm              ← PushFCMProvider
@curaos/cache-provider                   ← CacheProvider interface
  @curaos/cache-provider-valkey          ← CacheValkeyProvider (local default)
  @curaos/cache-provider-upstash         ← CacheUpstashProvider
@curaos/search-provider                  ← SearchProvider interface
  @curaos/search-provider-opensearch     ← SearchOpenSearchProvider (local default)
  @curaos/search-provider-meilisearch    ← SearchMeilisearchProvider
  @curaos/search-provider-algolia        ← SearchAlgoliaProvider
  @curaos/search-provider-typesense      ← SearchTypesenseProvider
@curaos/vector-provider                  ← VectorProvider interface
  @curaos/vector-provider-pgvector       ← VectorPgvectorProvider (local default)
  @curaos/vector-provider-qdrant         ← VectorQdrantProvider
  @curaos/vector-provider-pinecone       ← VectorPineconeProvider
@curaos/workflow-provider                ← WorkflowProvider interface
  @curaos/workflow-provider-temporal     ← WorkflowTemporalProvider (local default)
  @curaos/workflow-provider-temporal-cloud ← WorkflowTemporalCloudProvider
  @curaos/workflow-provider-inngest      ← WorkflowInngestProvider
@curaos/automation-provider              ← AutomationProvider interface
  @curaos/automation-provider-activepieces ← AutomationActivepiecesProvider (local default)
  @curaos/automation-provider-zapier     ← AutomationZapierProvider
  @curaos/automation-provider-make       ← AutomationMakeProvider
@curaos/schedule-provider                ← ScheduleProvider interface
  @curaos/schedule-provider-nestjs       ← ScheduleNestJSProvider (local default; @nestjs/schedule + BullMQ)
@curaos/cdn-provider                     ← CDNProvider interface
  @curaos/cdn-provider-nginx             ← CDNNginxProvider (local default)
  @curaos/cdn-provider-cloudflare        ← CDNCloudflareProvider
  @curaos/cdn-provider-bunny             ← CDNBunnyProvider
@curaos/analytics-provider               ← AnalyticsProvider interface
  @curaos/analytics-provider-clickhouse  ← AnalyticsClickHouseProvider (local default)
  @curaos/analytics-provider-snowflake   ← AnalyticsSnowflakeProvider
  @curaos/analytics-provider-bigquery    ← AnalyticsBigQueryProvider
@curaos/tracing-provider                 ← TracingProvider interface
  @curaos/tracing-provider-tempo         ← TracingTempoProvider (local default)
  @curaos/tracing-provider-datadog       ← TracingDatadogProvider
  @curaos/tracing-provider-honeycomb     ← TracingHoneycombProvider
@curaos/metrics-provider                 ← MetricsProvider interface
  @curaos/metrics-provider-victoriametrics ← MetricsVictoriaMetricsProvider (local default)
  @curaos/metrics-provider-datadog       ← MetricsDatadogProvider
  @curaos/metrics-provider-newrelic      ← MetricsNewRelicProvider
@curaos/logs-provider                    ← LogsProvider interface
  @curaos/logs-provider-loki             ← LogsLokiProvider (local default)
  @curaos/logs-provider-opensearch       ← LogsOpenSearchProvider
  @curaos/logs-provider-datadog          ← LogsDatadogProvider
@curaos/secrets-provider                 ← SecretsProvider interface
  @curaos/secrets-provider-openbao       ← SecretsOpenBaoProvider (local default)
  @curaos/secrets-provider-vault-cloud   ← SecretsVaultCloudProvider
  @curaos/secrets-provider-aws-sm        ← SecretsAWSSecretsManagerProvider
@curaos/registry-provider                ← RegistryProvider interface
  @curaos/registry-provider-harbor       ← RegistryHarborProvider (local default)
  @curaos/registry-provider-ghcr         ← RegistryGHCRProvider
@curaos/repo-provider                    ← RepoProvider interface
  @curaos/repo-provider-gitea            ← RepoGiteaProvider (local default)
  @curaos/repo-provider-github           ← RepoGitHubProvider
  @curaos/repo-provider-gitlab           ← RepoGitLabProvider
@curaos/ci-runner-provider               ← CIRunnerProvider interface
  @curaos/ci-runner-provider-arc         ← CIRunnerARCProvider (local default; GitHub ARC)
  @curaos/ci-runner-provider-github      ← CIRunnerGitHubHostedProvider
  @curaos/ci-runner-provider-circleci    ← CIRunnerCircleCIProvider
@curaos/fhir-provider                    ← FHIRProvider interface
  @curaos/fhir-provider-hapi             ← FHIRHAPIProvider (local default; JVM sidecar)
  @curaos/fhir-provider-medplum         ← FHIRMedplumProvider
  @curaos/fhir-provider-smile-cdr        ← FHIRSmileCDRProvider
@curaos/terminology-provider             ← TerminologyProvider interface
  @curaos/terminology-provider-snowstorm ← TerminologySnowstormProvider (local default)
  @curaos/terminology-provider-nlm       ← TerminologyNLMProvider
@curaos/pacs-provider                    ← PACSProvider interface
  @curaos/pacs-provider-dcm4chee         ← PACSDcm4cheeProvider (local default)
  @curaos/pacs-provider-google-health    ← PACSGoogleHealthcareProvider
  @curaos/pacs-provider-aws-health       ← PACSAWSHealthImagingProvider
@curaos/collab-provider                  ← CollabProvider interface
  @curaos/collab-provider-hocuspocus     ← CollabHocuspocusProvider (local default)
  @curaos/collab-provider-liveblocks     ← CollabLiveblocksProvider
@curaos/tms-provider                     ← TMSProvider interface (Translation Management System)
  @curaos/tms-provider-weblate           ← TMSWeblateProvider (local default)
  @curaos/tms-provider-crowdin           ← TMSCrowdinProvider
  @curaos/tms-provider-lokalise          ← TMSLokaliseProvider
@curaos/mt-provider                      ← MTProvider interface (Machine Translation)
  @curaos/mt-provider-helsinki           ← MTHelsinkiNLPProvider (local default; NLLB)
  @curaos/mt-provider-deepl              ← MTDeepLProvider
  @curaos/mt-provider-google             ← MTGoogleTranslateProvider
@curaos/payment-provider                 ← PaymentProvider interface (no local default — regulated)
  @curaos/payment-provider-stripe        ← PaymentStripeProvider
  @curaos/payment-provider-adyen         ← PaymentAdyenProvider
  @curaos/payment-provider-square        ← PaymentSquareProvider
  @curaos/payment-provider-lemon-squeezy ← PaymentLemonSqueezyProvider
@curaos/esign-provider                   ← ESignProvider interface
  @curaos/esign-provider-curaos          ← ESignCuraOSProvider (local default; esign-core-service)
  @curaos/esign-provider-docusign        ← ESignDocuSignProvider
  @curaos/esign-provider-adobe-sign      ← ESignAdobeSignProvider
  @curaos/esign-provider-hellosign       ← ESignHelloSignProvider
@curaos/offline-sync-provider            ← OfflineSyncProvider interface
  @curaos/offline-sync-provider-powersync ← OfflineSyncPowerSyncProvider (local default)
  @curaos/offline-sync-provider-electric ← OfflineSyncElectricSQLProvider
@curaos/geocoding-provider               ← GeocodingProvider interface
  @curaos/geocoding-provider-nominatim   ← GeocodingNominatimProvider (local default)
  @curaos/geocoding-provider-mapbox      ← GeocodingMapboxProvider
  @curaos/geocoding-provider-google      ← GeocodingGoogleMapsProvider
@curaos/routing-provider                 ← RoutingProvider interface
  @curaos/routing-provider-graphhopper   ← RoutingGraphHopperProvider (local default)
  @curaos/routing-provider-osrm          ← RoutingOSRMProvider (local secondary)
  @curaos/routing-provider-mapbox        ← RoutingMapboxProvider
@curaos/document-collab-provider         ← DocumentCollabProvider interface
  @curaos/document-collab-provider-collabora ← DocumentCollabCollaboraProvider (local default; MPL-2.0)
  @curaos/document-collab-provider-onlyoffice ← DocumentCollabOnlyOfficeProvider (opt-in tenant AGPL sidecar)
@curaos/procurement-provider             ← ProcurementProvider interface
  @curaos/procurement-provider-curaos    ← ProcurementCuraOSProvider (local default; procure-service)
  @curaos/procurement-provider-erpnext   ← ProcurementERPNextProvider (HealthStack hospital-admin opt-in)
@curaos/inventory-provider               ← InventoryProvider interface
  @curaos/inventory-provider-curaos      ← InventoryCuraOSProvider (local default; inventory-service)
  @curaos/inventory-provider-erpnext     ← InventoryERPNextProvider (HealthStack hospital-admin opt-in)
@curaos/webhook-provider                 ← WebhookProvider interface
  @curaos/webhook-provider-curaos        ← WebhookCuraOSProvider (local default; self-hosted HMAC retry queue)
  @curaos/webhook-provider-hookdeck      ← WebhookHookdeckProvider
  @curaos/webhook-provider-svix          ← WebhookSvixProvider
```

All packages published to Verdaccio (`@curaos/*` scope) per ADR-0209 §4.5. All packages follow the ADR-0209 §4.4 semver + deprecation policy.

### 1.5 Per-Tenant Override Mechanism

**NestJS DI wiring pattern** (using `LLMProviderModule` as example):

```typescript
// @curaos/llm-provider — llm-provider.module.ts
import { Module, DynamicModule } from '@nestjs/common';
import { LLM_PROVIDER } from './injection-tokens';
import { TenantConfigService } from '@curaos/tenancy';

@Module({})
export class LLMProviderModule {
  static forRootAsync(): DynamicModule {
    return {
      module: LLMProviderModule,
      providers: [
        {
          provide: LLM_PROVIDER,
          inject: [TenantConfigService],
          useFactory: async (tenantConfig: TenantConfigService) => {
            const cfg = await tenantConfig.get('providers.llm');
            return ProviderRegistry.resolve('llm', cfg);
          },
        },
      ],
      exports: [LLM_PROVIDER],
    };
  }
}
```

**ProviderRegistry** (in `@curaos/providers`):

```typescript
// @curaos/providers — registry.ts
export class ProviderRegistry {
  private static map = new Map<string, Map<string, () => CuraOSProvider<any>>>();

  static register(domain: string, variantName: string, factory: () => CuraOSProvider<any>): void {
    if (!this.map.has(domain)) this.map.set(domain, new Map());
    this.map.get(domain)!.set(variantName, factory);
  }

  static resolve(domain: string, config: { primary: string; providers: Record<string, unknown> }): CuraOSProvider<any> {
    const factory = this.map.get(domain)?.get(config.primary);
    if (!factory) throw new Error(`No provider registered for domain '${domain}' variant '${config.primary}'`);
    const provider = factory();
    provider.init(config.providers[config.primary] as any); // Zod validation inside init()
    return provider;
  }
}
```

Each implementation package self-registers at import time:

```typescript
// @curaos/llm-provider-openai — index.ts
import { ProviderRegistry } from '@curaos/providers';
import { LLMOpenAIProvider } from './llm-openai.provider';
ProviderRegistry.register('llm', 'openai', () => new LLMOpenAIProvider());
```

**Fallback activation:** `ProviderModule` wraps every provider call in a health-gated proxy. If `primary` returns `healthy: false` on startup, and `fallback` is configured, the proxy routes to the fallback instance. No conditional branching in business logic — business logic depends only on the interface.

### 1.6 Observability Requirements

Every provider implementation must:

1. **Wrap every external call in an OTel span** with attributes:
   - `provider.domain` (e.g., `llm`)
   - `provider.name` (e.g., `openai`)
   - `provider.type` (`local` | `external` | `custom`)
   - `provider.variant` (e.g., `gpt-4o`)
2. **Record errors** as OTel span events with `error.type` and `error.message`.
3. **Emit a VictoriaMetrics counter** `curaos_provider_calls_total{domain, variant, status}` on every call.
4. **Expose `/health/providers`** endpoint via `@curaos/core` health module — aggregates `healthCheck()` results from all active providers.
5. **Log structured JSON** on init, dispose, health-check failure, and fallback activation. Fields: `provider_domain`, `provider_name`, `provider_type`, `tenant_id`.

### 1.7 Zod Validation per Provider Config

Every `@curaos/<domain>-provider` package exports a `<Domain>ProviderConfigSchema` Zod schema. The `init()` method of every implementation parses its own config sub-object against a narrower Zod schema and throws `ZodError` with full path on validation failure. Validation failures are fatal at bootstrap — the service pod does not start.

```typescript
// Pattern inside every implementation's init():
async init(rawConfig: unknown): Promise<void> {
  const config = LLMOpenAIConfigSchema.parse(rawConfig); // throws ZodError if invalid
  this.apiKey = await this.secretsProvider.resolve(config.apiKeySecret);
  // ... connect
}
```

Secret values are **never stored in config objects** after resolution — resolved to memory only during `init()` and stored in private fields. Config objects persisted to logs or traces must redact secret fields.

---

## 2. Canonical Provider Inventory

All provider domains across CuraOS, assigned canonical interface names, local defaults, 3rd-party options, and source ADRs.

| # | Interface | Domain | Local default | 3rd-party options | Implementing service(s) | Source ADRs |
|---|---|---|---|---|---|---|
| 1 | `LLMProvider` | Large-language model inference | `LLMvLLMProvider` (Qwen3-72B / DeepSeek-R2 / Phi-4 via vLLM) | `LLMOpenAIProvider` / `LLMAnthropicProvider` / `LLMLiteLLMProvider` (Bedrock/Gemini proxy) | ai-agent-service, reports-service, any service using AI features | ADR-0114, ADR-0150 |
| 2 | `StorageProvider` | Object / blob storage | `StorageSeaweedFSProvider` (SeaweedFS; S3-compatible API) | `StorageS3Provider` (AWS S3 / Backblaze B2 / Wasabi) | storage-service | ADR-0101, ADR-0201, ADR-0150 |
| 3 | `EmailProvider` | Transactional email delivery | `EmailPostfixProvider` (Postfix + Haraka relay) | `EmailSendGridProvider` / `EmailPostmarkProvider` / `EmailMailgunProvider` | notify-service | ADR-0201, ADR-0150 |
| 4 | `SMSProvider` | SMS delivery (non-PHI only; BAA required for PHI tenants) | **None** — HIPAA risk; disabled by default | `SMSTwilioProvider` / `SMSVonageProvider` | notify-service | ADR-0201, ADR-0150 |
| 5 | `PushProvider` | Mobile push notifications | `PushExpoProvider` (Expo Push Notifications OSS) | `PushOneSignalProvider` / `PushFCMProvider` (BYO FCM credentials) | notify-service | ADR-0201, ADR-0106, ADR-0150 |
| 6 | `WebhookProvider` | Outbound webhook delivery (tenant-registered endpoints) | `WebhookCuraOSProvider` (self-hosted HMAC-SHA256 signed retry queue; BullMQ + exponential backoff) | `WebhookHookdeckProvider` / `WebhookSvixProvider` | notify-service | ADR-0201, ADR-0150 |
| 7 | `CacheProvider` | Hot cache + pub/sub | `CacheValkeyProvider` (Valkey; Redis-compatible) | `CacheUpstashProvider` (serverless Redis) | All services via `@curaos/core` | ADR-0101, ADR-0150 |
| 8 | `SearchProvider` | Full-text + hybrid vector search | `SearchOpenSearchProvider` (OpenSearch self-hosted) | `SearchAlgoliaProvider` / `SearchMeilisearchProvider` / `SearchTypesenseProvider` | search-service | ADR-0101, ADR-0201, ADR-0150 |
| 9 | `VectorProvider` | Vector embeddings store + ANN search | `VectorPgvectorProvider` (pgvector in PG17; primary) + `VectorQdrantProvider` (Qdrant; dedicated vector DB) | `VectorPineconeProvider` / `VectorWeaviateProvider` | ai-agent-service, search-service (hybrid) | ADR-0101, ADR-0114, ADR-0150 |
| 10 | `WorkflowProvider` | Durable workflow / saga execution engine | `WorkflowTemporalProvider` (Temporal self-hosted; TS SDK) | `WorkflowTemporalCloudProvider` / `WorkflowInngestProvider` / `WorkflowTriggerDevProvider` | workflow-core-service, all workflow overlay services | ADR-0122, ADR-0150, ADR-0204 |
| 11 | `AutomationProvider` | No-code / low-code automation runtime | `AutomationActivepiecesProvider` (Activepieces CE MIT; self-hosted) | `AutomationZapierProvider` / `AutomationMakeProvider` / `AutomationN8nCloudProvider` | automation-core-service | ADR-0122, ADR-0150, ADR-0204 |
| 12 | `ScheduleProvider` | Cron + deferred job scheduling | `ScheduleNestJSProvider` (`@nestjs/schedule` + BullMQ; no 3rd-party typically needed) | — (cron API itself is local; provider exists for testability and alternative queue backends) | All services needing scheduled jobs | ADR-0122, ADR-0150 |
| 13 | `CDNProvider` | Static asset + media CDN | `CDNNginxProvider` (self-hosted nginx with cache headers) | `CDNCloudflareProvider` / `CDNFastlyProvider` / `CDNBunnyProvider` | storage-service, sites-service | ADR-0121a, ADR-0121c, ADR-0150 |
| 14 | `AnalyticsProvider` | OLAP + reporting datastore | `AnalyticsClickHouseProvider` (ClickHouse + Superset self-hosted) | `AnalyticsSnowflakeProvider` / `AnalyticsBigQueryProvider` / `AnalyticsDatabricksProvider` | reports-service, analytics pipeline | ADR-0113, ADR-0150 |
| 15 | `TracingProvider` | Distributed trace sink | `TracingTempoProvider` (Grafana Tempo self-hosted) | `TracingDatadogProvider` / `TracingHoneycombProvider` / `TracingGrafanaCloudProvider` | `@curaos/observability` lib; all services | ADR-0107, ADR-0150 |
| 16 | `MetricsProvider` | Time-series metrics sink | `MetricsVictoriaMetricsProvider` (VictoriaMetrics self-hosted) | `MetricsDatadogProvider` / `MetricsNewRelicProvider` / `MetricsGrafanaCloudProvider` | `@curaos/observability` lib; all services | ADR-0107, ADR-0150 |
| 17 | `LogsProvider` | Structured log sink | `LogsLokiProvider` (Grafana Loki self-hosted) | `LogsOpenSearchProvider` / `LogsDatadogProvider` / `LogsSumoLogicProvider` | `@curaos/observability` lib; all services | ADR-0107, ADR-0150 |
| 18 | `SecretsProvider` | Secrets vault (dynamic leases + rotation) | `SecretsOpenBaoProvider` (OpenBao v2.x; namespaces GA in v2.3.1) | `SecretsVaultCloudProvider` (HCP Vault) / `SecretsAWSSecretsManagerProvider` | `@curaos/secrets` lib; all services | ADR-0108, ADR-0150 |
| 19 | `RegistryProvider` | OCI container + artifact registry | `RegistryHarborProvider` (Harbor self-hosted) | `RegistryGHCRProvider` / `RegistryQuayProvider` / `RegistryECRProvider` | CI/CD pipeline; ADR-0110 toolchain | ADR-0109, ADR-0150 |
| 20 | `RepoProvider` | Git repository hosting | `RepoGiteaProvider` (Gitea self-hosted) | `RepoGitHubProvider` / `RepoGitLabProvider` / `RepoBitbucketProvider` | CI/CD pipeline tooling | ADR-0150 |
| 21 | `CIRunnerProvider` | CI job execution runner | `CIRunnerARCProvider` (GitHub Actions Runner Controller self-hosted) | `CIRunnerGitHubHostedProvider` / `CIRunnerCircleCIProvider` / `CIRunnerBuildkiteProvider` | CI/CD pipeline; ADR-0110 | ADR-0110, ADR-0150 |
| 22 | `FHIRProvider` | FHIR R4/R5 server (HealthStack overlay only) | `FHIRHAPIProvider` (HAPI FHIR 8.x; JVM sidecar; one pod per tenant per ADR-0151 F-004 direction) | `FHIRMedplumProvider` / `FHIRSmileCDRProvider` / external EHR FHIR endpoint | healthstack-* services via `@curaos/fhir-client` | ADR-0115, ADR-0150, ADR-0208 |
| 23 | `TerminologyProvider` | Clinical terminology server (SNOMED CT / LOINC / ICD) (HealthStack only) | `TerminologySnowstormProvider` (Snowstorm; JVM sidecar) | `TerminologyNLMProvider` (NLM VSAC + FHIR terminology) | healthstack-terminology-service | ADR-0115, ADR-0150 |
| 24 | `PACSProvider` | DICOM PACS / medical imaging (HealthStack only) | `PACSDcm4cheeProvider` (dcm4chee; JVM sidecar) | `PACSGoogleHealthcareProvider` / `PACSAWSHealthImagingProvider` | healthstack-imaging-service | ADR-0115, ADR-0150 |
| 25 | `CollabProvider` | Real-time document collaboration (CRDT / Yjs) | `CollabHocuspocusProvider` (Hocuspocus self-hosted; Yjs WebSocket server) | `CollabLiveblocksProvider` | Builder IDE (ADR-0121), personal-notes-service | ADR-0121, ADR-0150 |
| 26 | `TMSProvider` | Translation management system | `TMSWeblateProvider` (Weblate self-hosted) | `TMSCrowdinProvider` / `TMSLokaliseProvider` / `TMSPhraseProvider` | i18n pipeline; locale-service | ADR-0112, ADR-0150 |
| 27 | `MTProvider` | Machine translation engine | `MTHelsinkiNLPProvider` (Helsinki-NLP OPUS-MT / NLLB self-hosted) | `MTDeepLProvider` / `MTGoogleTranslateProvider` | i18n pipeline; translation-service | ADR-0112, ADR-0150 |
| 28 | `PaymentProvider` | Payment gateway (no local default — regulated; always 3rd-party BYO) | **None** — PCI-DSS scope; self-hosted payment processing is not viable default | `PaymentStripeProvider` (Stripe Connect) / `PaymentAdyenProvider` / `PaymentSquareProvider` / `PaymentLemonSqueezyProvider` | commerce-core-service | ADR-0121b, ADR-0121e, ADR-0202, ADR-0150 |
| 29 | `ESignProvider` | Electronic signature primitives | `ESignCuraOSProvider` (esign-core-service; signature_pad + @signpdf/signpdf + xadesjs; MIT-only stack) | `ESignDocuSignProvider` / `ESignAdobeSignProvider` / `ESignHelloSignProvider` | esign-core-service, business-esign-service | ADR-0121e, ADR-0205, ADR-0150 |
| 30 | `OfflineSyncProvider` | Client-side offline data sync (Postgres-backed) | `OfflineSyncPowerSyncProvider` (PowerSync JS SDK) | `OfflineSyncElectricSQLProvider` / `OfflineSyncCouchbaseLiteProvider` | All React Native / mobile packages via `@curaos/offline-sync` | ADR-0106, ADR-0150 |
| 31 | `GeocodingProvider` | Address → coordinates + reverse geocoding | `GeocodingNominatimProvider` (Nominatim + OSM extract; air-gap safe) | `GeocodingMapboxProvider` / `GeocodingGoogleMapsProvider` | geospatial-core-service | ADR-0206, ADR-0150 |
| 32 | `RoutingProvider` | Point-to-point routing + distance matrix | `RoutingGraphHopperProvider` (GraphHopper; custom vehicle profiles) + `RoutingOSRMProvider` (OSRM; high-throughput distance matrix) | `RoutingMapboxProvider` / `RoutingGoogleMapsDirectionsProvider` | geospatial-core-service | ADR-0206, ADR-0150 |
| 33 | `DocumentCollabProvider` | Office document collaboration plugin (WOPI) | `DocumentCollabCollaboraProvider` (Collabora Online MPL-2.0; WOPI sidecar) | `DocumentCollabOnlyOfficeProvider` (opt-in AGPL; tenant accepts AGPL terms) | document-core-service | ADR-0205, ADR-0150 |
| 34 | `ProcurementProvider` | Purchase request / PO / supplier lifecycle | `ProcurementCuraOSProvider` (procure-service NestJS native) | `ProcurementERPNextProvider` (ERPNext Frappe REST bridge; HealthStack hospital-admin opt-in; GPLv3 sidecar) | procure-service | ADR-0202, ADR-0150 |
| 35 | `InventoryProvider` | SKU master + stock levels + lot/serial/expiry tracking | `InventoryCuraOSProvider` (inventory-service NestJS native) | `InventoryERPNextProvider` (ERPNext bridge; HealthStack hospital-admin opt-in) | inventory-service | ADR-0202, ADR-0150 |

**Notes on special cases:**

- **SMSProvider (row 4):** No local default because self-hosting an SMS carrier gateway (SS7 / SIP trunk) is outside CuraOS scope. PHI tenants must have a BAA with the chosen SMS vendor before enabling.
- **PaymentProvider (row 28):** No local default is by design. PCI-DSS scope makes a self-hosted payment processor a non-starter for the platform tier. Tenants select and own their payment vendor relationship.
- **VectorProvider (row 9):** Two local implementations coexist — `VectorPgvectorProvider` for moderate scale (< 10M vectors, co-located with PG17) and `VectorQdrantProvider` for high-throughput RAG workloads. Both are "local defaults"; tenant config selects which. No 3rd-party required for the default air-gap deployment profile.
- **RoutingProvider (row 32):** Two local implementations coexist — GraphHopper (custom profiles, primary) and OSRM (distance-matrix throughput, secondary). Tenant config may activate both simultaneously for different use cases within geospatial-core-service.
- **DocumentCollabProvider (row 33):** OnlyOffice implementation is flagged `providerType: 'custom'` due to AGPL licensing. The `ProviderRegistry` will refuse to activate it unless `feature_flags.document_collab_onlyoffice_accepted=true` is explicitly set in tenant settings (requires tenant legal acknowledgement flow).

---

## 3. Amendments to Existing ADRs

The following ADRs reference provider-like concepts using non-canonical names or omit the provider interface entirely. This ADR supersedes those local descriptions. No full rewrite of those ADRs is required; this section constitutes an addendum each ADR inherits.

| ADR | Non-canonical reference (now retired) | Canonical replacement per ADR-0154 |
|---|---|---|
| ADR-0150 §2 | `CuraOSLocalProvider`, `External3rdPartyProvider` | See §1.1 naming convention above; these were placeholder names |
| ADR-0150 §2 | Examples only (`LLMProvider`, `StorageProvider`, `EmailProvider`) — no spec | Full inventory in §2 of this ADR; §1.1–1.7 is the spec |
| ADR-0201 §2.6 | `CuraOSLocal<Provider>`, `External<Provider>` — used inconsistently | Replace with `<Domain><Variant>Provider` pattern per §1.1 |
| ADR-0201 §3.1.2 | "Local default | 3rd-party BYO" table in notify-service (unnamed provider classes) | `EmailProvider` / `PushProvider` / `SMSProvider` / `WebhookProvider` per §2 rows 3–6 |
| ADR-0201 §3.2.2 | "Local default | 3rd-party BYO" table in storage-service (unnamed) | `StorageProvider` per §2 row 2 |
| ADR-0114 | LLM integration described as "vLLM + LiteLLM gateway" — no interface name | `LLMProvider` per §2 row 1; `LLMLiteLLMProvider` wraps all proxy targets |
| ADR-0115 | "Local default | 3rd-party option" rows for FHIR/Terminology/PACS — no interface names | `FHIRProvider` / `TerminologyProvider` / `PACSProvider` per §2 rows 22–24 |
| ADR-0107 | Observability backends described as infrastructure choices — no provider interface | `TracingProvider` / `MetricsProvider` / `LogsProvider` per §2 rows 15–17; wired via `@curaos/observability` lib |
| ADR-0108 | "OpenBao … HashiCorp Vault Cloud / AWS Secrets Manager (BYO)" — no provider interface | `SecretsProvider` per §2 row 18; wired via `@curaos/secrets` lib |
| ADR-0112 | "Weblate … Crowdin / Lokalise … Helsinki-NLP … DeepL" — no interface names | `TMSProvider` / `MTProvider` per §2 rows 26–27 |
| ADR-0205 §2 | "Local + 3rd-party: Local: Collabora Online CE; 3rd-party: DocuSign / Adobe Sign" — no interface | `DocumentCollabProvider` per §2 row 33; `ESignProvider` per §2 row 29 |
| ADR-0206 §2 | Geocoding/Routing described as sidecar choices — no interface names | `GeocodingProvider` / `RoutingProvider` per §2 rows 31–32 |
| ADR-0202 §2.2 | "`ErpNextBridgeProvider` (implements standard `ProcurementProvider` / `InventoryProvider` interfaces)" — named correctly in intent but not canonicalised | Canonicalised as `ProcurementERPNextProvider` + `InventoryERPNextProvider` per §2 rows 34–35; interface names `ProcurementProvider` + `InventoryProvider` confirmed |
| ADR-0121 / ADR-0121a–e | `CollabProvider` not defined for Builder collab (Hocuspocus mentioned but no interface) | `CollabProvider` per §2 row 25 |
| ADR-0106 | PowerSync mentioned as offline sync choice — no interface name | `OfflineSyncProvider` per §2 row 30 |
| ADR-0113 | ClickHouse / Snowflake / BigQuery as analytics options — no interface | `AnalyticsProvider` per §2 row 14 |

---

## 4. Action Items

These are platform-team deliverables, not user tasks.

| Item | Deliverable | Depends on | Priority |
|---|---|---|---|
| A-1 | Create `@curaos/providers` npm package (base interface + `ProviderRegistry` + `ProviderModule` factory) | ADR-0209 lib scaffold recipe (ADR-0123) | P0 — blocks all provider implementations |
| A-2 | Create `@curaos/<domain>-provider` interface + Zod schema packages for all 35 domains | A-1 | P0 |
| A-3 | Create `@curaos/<domain>-provider-<variant>` implementation packages for all local defaults first | A-2 | P0 (local defaults) / P1 (3rd-party) |
| A-4 | Wire `@curaos/secrets` to `SecretsOpenBaoProvider` (SecretsProvider); make it the first implementation as it's a dependency of every other provider's `init()` | A-1, A-2 | P0 — critical-path |
| A-5 | Wire `@curaos/observability` tracing/metrics/logs libs to `TracingProvider` / `MetricsProvider` / `LogsProvider` | A-1, A-2 | P0 |
| A-6 | Add `lib.nestjs-provider` codegen recipe (ADR-0123) to scaffold new `@curaos/<domain>-provider` + implementation boilerplate | A-1 | P1 |
| A-7 | Add `curaos_provider_calls_total` VictoriaMetrics counter + Grafana dashboard panel "Provider call rate by domain/variant/status" | A-3 | P1 |
| A-8 | Add `/health/providers` endpoint to `@curaos/core` health module aggregating all registered providers' `healthCheck()` | A-3 | P1 |
| A-9 | Add lint rule to `@curaos/eslint-config`: provider implementation class name must match `<Domain><Variant>Provider` pattern (AST check via `@typescript-eslint/naming-convention`) | A-2 | P2 |
| A-10 | Add integration test scaffold: for each provider implementation, a `<variant>.integration-spec.ts` that mounts the provider against a Docker-started local instance (Testcontainers) | A-3 | P2 |

---

## 5. Open Questions

| # | Question | Owner | Status |
|---|---|---|---|
| OQ-1 | Should `ScheduleProvider` (row 12) also abstract BullMQ queue backends (e.g., allow Upstash Redis instead of local Valkey as queue backend), or is `CacheProvider` the correct abstraction level for that? | Platform team | Open |
| OQ-2 | `VectorProvider` has two local defaults (pgvector + Qdrant). Should the config allow specifying both simultaneously (with domain-specific routing logic), or is only one active at a time per tenant? Current proposal: both active, `VectorProviderRouter` selects by namespace tag on the embedding. | AI/data team | Open |
| OQ-3 | `DocumentCollabOnlyOfficeProvider` requires a tenant legal acknowledgement flow before activation. Where does that acknowledgement gate live — `settings-service` feature flag + manual operator confirmation, or a formal audit event in `audit-service`? | Platform / Legal | Open |
| OQ-4 | `PaymentProvider` has no local default. Does this mean that tenants in the no-payment profile simply have no `PaymentProvider` bound at DI bootstrap? Or should there be a `PaymentNoOpProvider` that returns 501 on all calls to prevent DI injection errors in services that optionally use payment? | Commerce team | Open |
| OQ-5 | `FHIRProvider` implementations wrap a JVM sidecar (HAPI / Medplum). Should the `FHIRProvider` interface model the JVM sidecar lifecycle (boot, readiness) or only the FHIR REST operations? Lifecycle management likely belongs in the Kubernetes Operator / Helm chart, not the NestJS provider. | HealthStack team | Open |

---

## 6. References

- [ADR-0099 Charter & Vision](0099-charter-priorities-vision.md)
- [ADR-0100 Foundation Platform Runtime](0100-foundation-platform-runtime.md)
- [ADR-0101 Data Layer](0101-data-layer.md)
- [ADR-0106 Frontend Stack](0106-frontend.md)
- [ADR-0107 Observability](0107-observability.md)
- [ADR-0108 Security + Secrets](0108-security-secrets.md)
- [ADR-0109 Containers + Orchestration](0109-containers-orchestration.md)
- [ADR-0110 CI/CD + Release](0110-cicd-release.md)
- [ADR-0112 i18n + Localization](0112-i18n-localization.md)
- [ADR-0113 Analytics + Reporting](0113-analytics-reporting.md)
- [ADR-0114 AI + Agent Integration](0114-ai-agent-integration.md)
- [ADR-0115 HealthStack Overlays](0115-healthstack-overlays.md)
- [ADR-0120 Foundation Auth](0120-foundation-auth.md)
- [ADR-0121 Foundation Builder Suite](0121-foundation-builder.md)
- [ADR-0121a Foundation Sites](0121a-foundation-sites.md)
- [ADR-0121b Foundation Apps](0121b-foundation-apps.md)
- [ADR-0121c Foundation Widgets](0121c-foundation-widgets.md)
- [ADR-0121e Foundation Forms](0121e-foundation-forms.md)
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0123 Foundation Codegen + Plugin](0123-foundation-codegen-plugin.md)
- [ADR-0150 Baseline Alignment Rules](0150-baseline-alignment-rules.md)
- [ADR-0151 Cross-Cluster Coherence (F-005)](0151-cross-cluster-coherence.md)
- [ADR-0200 Cluster: Identity + Party + Org + Audit](0200-cluster-identity-party-org-audit.md)
- [ADR-0201 Cluster: Platform Shared Services](0201-cluster-platform-shared-services.md)
- [ADR-0202 Cluster: Commerce + Sales + Procurement + Inventory](0202-cluster-commerce-sales-procurement-inventory.md)
- [ADR-0204 Cluster: Workflow + Automation Overlays](0204-cluster-workflow-automation-overlays.md)
- [ADR-0205 Cluster: Documents + E-sign + CRM + HR + Business](0205-cluster-docs-esign-crm-donation-hr-business.md)
- [ADR-0206 Cluster: Fleet + Geospatial + Site + Conversion + Integrations](0206-cluster-fleet-geospatial-site-conversion-integrations.md)
- [ADR-0208 Cluster: HealthStack Clinical Services](0208-cluster-healthstack-clinical-services.md)
- [ADR-0209 Cluster: Frontend Packages + Backend Libs](0209-cluster-frontend-packages-backend-libs.md)
