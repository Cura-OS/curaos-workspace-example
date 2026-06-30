> **PLANNED — `ops/monitoring/` scaffolding not yet committed to the `curaos` submodule.** Paths under `ops/monitoring/`, `ops/k8s/`, and `ops/argocd/` referenced below are the **target layout**; commands referencing those paths are not yet runnable as written. Once the monitoring scaffold lands in `curaos/ops/`, this banner should be removed.

> **Error tracker:** per [[curaos-error-tracking-rule]], the mandated choice is **GlitchTip** (prod self-hosted) + **Sentry SaaS** (dev). References below to `getsentry/self-hosted` describe the GlitchTip-compatible pattern; self-hosted Sentry is not the rule's choice.

# Monitoring Stack

This guide explains how to run the local monitoring toolchain (Grafana LGTM + OpenTelemetry Collector + GlitchTip/Sentry) and carry the same pattern into production.

## Components

| Service | Purpose |
| --- | --- |
| Prometheus | Metrics storage, alerting, and scrape target for application metrics |
| Alertmanager | Prometheus alert delivery (configure receivers for paging/email/chat) |
| Loki | Aggregated structured logs and exception payloads |
| Tempo | Distributed tracing backend compatible with OpenTelemetry and Grafana |
| Grafana | Unified dashboards, log search, traces, and alert management (dashboards auto-provisioned from `ops/monitoring/grafana/dashboards`) |
| OpenTelemetry Collector | Common ingestion point for traces/metrics/logs from services and clients |
| Promtail | Ships container logs from Docker to Loki |
| GlitchTip (prod) / Sentry SaaS (dev) | Error/exception tracking and release health per [[curaos-error-tracking-rule]]. GlitchTip is Sentry-API-compatible; local dev may use Sentry SaaS DSN instead. |
| Argo CD (future) | GitOps deployment manager for the platform and monitoring stack |

## Local Quickstart

1. Make sure the base stack network exists:
   ```bash
   docker network create curaos || true
   ```
2. Copy `ops/monitoring/.env.example` to `ops/monitoring/.env`, then populate (or leave blank) `SENTRY_DSN`.
3. Boot the platform stack and monitoring services:
   ```bash
   docker compose -f docker-compose.yml up -d
   docker compose -f docker-compose.monitoring.yml up -d
   ```
4. (Optional) If you need self-hosted Sentry, execute the helper script which wraps the official `getsentry/self-hosted` project (dev mode uses port 9002; `--live` starts the full stack):
   ```bash
   ./ops/monitoring/setup-self-hosted-sentry.sh          # dev mode (minimal docker-compose)
   ./ops/monitoring/setup-self-hosted-sentry.sh --live   # full stack
   ./ops/monitoring/setup-self-hosted-sentry.sh --dsn <dsn-from-ui>
   # Optional: choose another release (default 25.9.0)
   ./ops/monitoring/setup-self-hosted-sentry.sh --version 25.8.0
   docker compose -f docker-compose.monitoring.yml restart otel-collector
   ```

5. Access key UIs:
   - Grafana: http://localhost:3000 (default creds `admin` / `admin`)
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093
- Tempo API: http://localhost:3200
- Loki API: http://localhost:3100
- OTLP HTTP endpoint (host): `http://localhost:24318`
- OTLP gRPC is available to containers inside the `curaos` network at `otel-collector:4317`

## Instrumenting Services

- **Backend (NestJS):**
  - Install `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-grpc`; bootstrap the OTEL SDK in `main.ts` before app creation.
  - Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317`, `OTEL_RESOURCE_ATTRIBUTES=service.name=<svc>,deployment.environment=<env>`.
  - Emit structured JSON logs via the NestJS logger; Promtail captures container stdout and ships to Loki.
  - Provide `SENTRY_DSN` to the GlitchTip (prod) or Sentry SaaS (dev) SDK (`@sentry/node`) per [[curaos-error-tracking-rule]].
  - See `docs/ops/instrumentation.md` for full env var reference and SDK bootstrap snippet.
- **Frontend (React Native / Next.js):**
  - React Native: `@sentry/react-native` init + OTEL web SDK pointed at the collector.
  - Next.js: `@sentry/nextjs` init + `@opentelemetry/sdk-web` with OTLP HTTP exporter (`http://localhost:24318` local; cluster endpoint in prod).
  - Set `SENTRY_DSN` via build-time env; swap to GlitchTip DSN in prod.
- **Audit/Workflow Services:** expose domain metrics (`*_total`, `*_active`, `*_failures_total`) so dashboards/alerts have signal.
- **Sentry/GlitchTip DSN:** after creating a project, copy the DSN into `ops/monitoring/.env` (derived from `.env.example`) and restart the OTEL collector.

## Dashboards & Alerts

- Grafana auto-loads dashboards from `ops/monitoring/grafana/dashboards/`.
- Prometheus loads alerting rules from `ops/monitoring/prometheus-rules/`; extend these files per environment.
- Alertmanager comes with a stub config—wire Slack/PagerDuty by editing `ops/monitoring/alertmanager/config.yml`.

## Production Notes

- Deploy the same monitoring stack via Helm charts or Argo CD. Recommended charts:
  - [`grafana/loki-stack`](https://github.com/grafana/helm-charts)
  - [`grafana/tempo`](https://github.com/grafana/helm-charts)
  - [`prometheus-community/kube-prometheus-stack`](https://github.com/prometheus-community/helm-charts)
  - [`open-telemetry/opentelemetry-collector`](https://github.com/open-telemetry/opentelemetry-helm-charts)
  - [`sentry-kubernetes`](https://github.com/sentry-kubernetes/charts) for self-hosted Sentry
- Use object storage (S3/MinIO) for Loki/Tempo in production and managed databases for Sentry dependencies.
- Integrate Alertmanager with paging (Opsgenie, PagerDuty, MS Teams, Slack) by editing `ops/monitoring/alertmanager/config.yml`.
- Manage everything declaratively through Argo CD (namespaces: `monitoring`, `observability`, `sentry`).

## Deploying to Kubernetes

- Apply the kustomize bases for a dev cluster:
  ```bash
  kubectl apply -k ops/k8s/monitoring/overlays/dev
  ```
- Register the Argo CD application (`ops/argocd/monitoring-app.yaml`) once overlays are ready; Argo will track the `ops/k8s/monitoring` directory.
- Deploy self-hosted Sentry separately (Helm or official Compose) and surface the DSN to applications through secrets.

## Next Steps

- Add Grafana dashboards (workflow throughput, audit ingest, identity success/failure rates).
- Define Prometheus recording rules and alert policies for key SLIs (API latency, audit ingest failures, Kafka consumer lag). Place them under `ops/monitoring/prometheus-rules/`.
- Instrument services with the Sentry SDK for breadcrumbs, release tracking, and user feedback (see `docs/ops/instrumentation.md`).
- Document service-specific telemetry env vars (`OTEL_*`, `SENTRY_DSN`) inside each module's README.
- Implement Argo CD manifests (`ops/k8s/monitoring`) so the GitOps application defined in `ops/argocd/monitoring-app.yaml` syncs the stack automatically.
