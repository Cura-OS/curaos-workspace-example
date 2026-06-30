# Telemetry Instrumentation Guide

This document centralizes the environment variables and SDK setup required for CuraOS services to emit metrics, traces, logs, and Sentry events. Use it as the source of truth when onboarding new services.

## Common Environment Variables

| Variable | Purpose |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | gRPC/HTTP endpoint for OpenTelemetry (e.g., `http://otel-collector.monitoring.svc.cluster.local:4317`) |
| `OTEL_EXPORTER_OTLP_HEADERS` | Extra headers if auth is required (bearer tokens, etc.) |
| `OTEL_RESOURCE_ATTRIBUTES` | Static attributes (`service.name`, `service.namespace`, `deployment.environment`) |
| `OTEL_METRICS_EXPORTER` | Set to `otlp` to enable metrics export |
| `OTEL_TRACES_SAMPLER` | Default sampling strategy (`parentbased_traceidratio`) |
| `SENTRY_DSN` | DSN issued by your Sentry deployment (self-hosted or SaaS) |
| `SENTRY_ENVIRONMENT` | Deployment environment (`dev`, `staging`, `prod`) |
| `SENTRY_RELEASE` | Version string for release tracking |

> Note: The default OTEL collector configuration does not forward spans to Sentry. Add a Sentry exporter to the collector (and update the traces pipeline) when you have a DSN available.

## Backend (NestJS)

1. Install packages:
   ```bash
   bun add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/auto-instrumentations-node @sentry/node
   ```
2. Bootstrap OTEL SDK in `main.ts` **before** app creation:
   ```typescript
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
   import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

   const sdk = new NodeSDK({
     traceExporter: new OTLPTraceExporter(),
     instrumentations: [getNodeAutoInstrumentations()],
   });
   sdk.start();
   ```
3. Set env vars: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES=service.name=<svc-name>,deployment.environment=<env>`.
4. For Sentry/GlitchTip, set `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` and call `Sentry.init({ dsn, tracesSampleRate: 1.0 })` in app bootstrap per [[curaos-error-tracking-rule]].

## Frontend (React Native / Next.js)

**React Native:**
- Install `@sentry/react-native`.
- Initialize in app entry:
  ```typescript
  import * as Sentry from '@sentry/react-native';
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'dev',
    tracesSampleRate: 1.0,
  });
  ```
- Add OTEL web SDK (`@opentelemetry/sdk-web`) pointed at `http://localhost:24318` (local) or the cluster collector (prod).

**Next.js:**
- Install `@sentry/nextjs` and run `bun x @sentry/wizard@latest -i nextjs`.
- Set `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` in `.env.local` / build env.
- OTLP: use `@opentelemetry/sdk-web` with `OTLPTraceExporter` pointed at the collector endpoint.

## Mock/Testing Environments

- Provide `SENTRY_DSN` only for integration testing; disable in unit tests.
- Use `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=local` for local runs.

## Validation Checklist

- Service emits metrics/traces/logs when hitting key endpoints.
- Sentry receives breadcrumbs and traces for exceptions.
- Grafana dashboards show the service-specific metrics.
- Prometheus alerts fire in dev when thresholds are intentionally violated.
