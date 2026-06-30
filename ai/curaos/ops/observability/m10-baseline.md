# Runbook — M10 observability dashboards + per-service perf baseline

Operator runbook for the live half of issue
[curaos-ai-workspace#286](https://github.com/your-org/curaos-ai-workspace/issues/286)
(M10 Epic #24 acceptance #4 dashboards + #5 perf baseline). The **config** lands
in `curaos/ops/` and is validated in local CI; the steps below are **operator-driven**
against a live cluster/service and are NOT run by CI.

> Source of truth: `curaos/ops/observability/service-catalog.json`. Regenerate all
> artifacts with `bun ops/observability/generate.ts`; the `--check` flag is the
> CI drift guard.

## 1. Import Grafana dashboards

The 8 dashboard models live at `curaos/ops/observability/dashboards/`
(7 per-service + `m10-cluster-rollup.json`). Each declares a `${DS_PROMETHEUS}`
datasource input (Grafana prompts for the Prometheus/VictoriaMetrics datasource
on import).

```bash
# per service + the rollup
for f in curaos/ops/observability/dashboards/*.json; do
  curl -sf -X POST "$GRAFANA_URL/api/dashboards/import" \
    -H "Authorization: Bearer $GRAFANA_TOKEN" -H 'Content-Type: application/json' \
    --data "$(jq --arg ds "$PROM_DS_UID" '{dashboard:., inputs:[{name:"DS_PROMETHEUS",type:"datasource",pluginId:"prometheus",value:$ds}], overwrite:true}' "$f")"
done
```

Each per-service dashboard has 7 panels: request rate, error ratio (5xx),
latency p95 (D6 SLO), latency p99, consumer lag, DLQ rate, consumer processing
p95. The rollup has 5 cross-service panels. Panels query the OTel metric contract
documented in `curaos/ops/observability/README.md`.

## 2. Apply OpenSLO definitions as Pyrra CRDs

The `_default.openslo.yaml` files (`curaos/ops/slo/<service>/`) are `openslo/v1`
templates — 2 SLOs each (availability + latency). Per [[curaos-slo-rule]], tenant
onboarding copies a template, injects `tenant_id` + tier target (0.999 standard /
0.9999 enterprise), and applies it as a Pyrra `ServiceLevelObjective` CRD. Pyrra
reads OpenSLO natively.

```bash
# dry-run validate against the k3d cluster before applying (CI does the same)
for f in curaos/ops/slo/*/_default.openslo.yaml; do
  kubectl apply --dry-run=server -f "$f"
done
```

## 3. Run the k6 perf baselines (record the numbers)

The drivers (`curaos/ops/perf/<service>/baseline.ts`) use the
`constant-arrival-rate` executor and HARD-gate ONLY the D6-SLO-mapped p95 latency
metric. Run against a deployed service:

```bash
# smoke (fast — 50 req/s for 1m, the default)
PERF_BASE_URL=https://<service-host> k6 run curaos/ops/perf/<service>/baseline.ts
# soak (the authoritative SLO assertion — raise rate + duration)
PERF_RATE=500 PERF_DURATION=30m PERF_BASE_URL=https://<service-host> \
  k6 run curaos/ops/perf/<service>/baseline.ts
```

The JSON summary is archived to `ops/perf/<service>/results/baseline-<...>.json`
(override with `RESULTS_FILE`). Record the per-service p95 in the issue as the
acceptance-#5 baseline.

### Env knobs (per `ops/perf/lib/baseline-config.ts`)

| Env | Default | Meaning |
|---|---|---|
| `PERF_BASE_URL` / `BASE_URL` | `http://localhost:3000` | service base URL |
| `PERF_PROBE_PATH` | per-service health path | gated read endpoint |
| `PERF_RATE` | `50` | arrival rate (req per `PERF_TIME_UNIT`) |
| `PERF_DURATION` | `1m` | run duration (raise to `30m` for soak) |
| `P95_BUDGET_MS` | `200` | HARD-gate p95 budget (mirrors OpenSLO) |
| `RESULTS_FILE` | `ops/perf/<svc>/results/baseline-latest.json` | artifact path |

## 4. Honest CI vs live split

| Step | Gate | Where |
|---|---|---|
| Dashboard JSON parses + structural shape | local CI (config) | this PR |
| OpenSLO `openslo/v1` validity (2 SLO docs/service) | local CI (config) | this PR |
| Generator idempotent (`--check`) | local CI (config) | this PR |
| k6 driver shape + pure-config unit tests | local CI (`bun test`) | this PR |
| Dashboards imported into live Grafana | operator | this runbook §1 |
| OpenSLO applied as Pyrra CRDs | operator | this runbook §2 |
| k6 soak run + recorded p95 per service | operator | this runbook §3 |

k6 is not installed in the local gate; the existing `scripts/perf-smoke.sh`
WARN-skips (never false-greens). The M10 baselines are intentionally NOT wired
into that M9 login-perf blocking lane — see the FORESIGHT note on the issue about
extending the perf-smoke gate to loop M10 baselines once the services are
CI-deployable.
