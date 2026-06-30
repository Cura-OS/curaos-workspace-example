# CONTEXT - ops/observability/dashboards (Grafana dashboard models)

AI-mirror node for `curaos/ops/observability/dashboards/` (per workspace
AGENTS.md section 1 1:1 structural mirror). Code + canonical docs live in the
curaos repo:

- Dashboard models: `curaos/ops/observability/dashboards/*.json` (7 per-service
  + `m10-cluster-rollup.json`); each declares a `${DS_PROMETHEUS}` datasource
  input for import-time binding.
- Metric contract + generation: [`curaos/ops/observability/README.md`](../../../../../curaos/ops/observability/README.md)
- Operator runbook (live Grafana import): [`../m10-baseline.md`](../m10-baseline.md)

## Decisions

- **Generator-owned.** Dashboards are emitted from
  `curaos/ops/observability/service-catalog.json` by `generate.ts`; edit the
  catalog/emitter, never a dashboard JSON by hand (per
  [[curaos-generator-evolution-rule]]). The `--check` flag is the CI drift guard.
- **Panel contract.** Each per-service dashboard carries 7 panels (request rate,
  5xx error ratio, latency p95/p99, consumer lag, DLQ rate, consumer processing
  p95); the rollup carries 5 cross-service panels.

Issue: [curaos-ai-workspace#286](https://github.com/your-org/curaos-ai-workspace/issues/286).
