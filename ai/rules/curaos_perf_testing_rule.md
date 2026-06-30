---
name: curaos-perf-testing-rule
title: Perf testing (k6 TS primary)
description: Perf/load testing - k6 TypeScript primary (smoke PR + soak nightly; thresholds gate ONLY SLO-mapped metrics); Gatling complex-chain opt-in; Vegeta CLI one-off; wrk + JMeter banned
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, after Decision-8 walkthrough - grounded in D0 orchestration + D3 CNI + D6 SLO mgmt):

## The rule

**k6 (TypeScript) is the primary HTTP/gRPC/WebSocket load testing tool.** Smoke on PR + soak nightly. Thresholds as CI gates ONLY for metrics mapped to D6 Pyrra SLOs (avoid false-positive flake).

| Use case | Tool |
|---|---|
| Smoke perf on PR (1 min, 10 VUs, warnings only) | **k6** |
| Soak nightly (30 min, 100-1000 VUs, SLO threshold gates) | **k6** |
| Tenant onboarding load (concurrent tenant provisioning at scale) | **k6 + K6 Operator on K3s** (per [[curaos-orchestration-rule]]) |
| Browser-level full page load assertion | **k6 + xk6-browser** (or Playwright separately for functional E2E) |
| One-off CLI HTTP smoke | **Vegeta** (single binary, no scripting) |
| Complex scenario chains (per-service opt-in) | **Gatling** (justify in service `Requirements.md`) |
| Per-service function-level CLI benchmark | **hyperfine** (already in fulcrum rules) |

## Threshold strategy (avoid CI flake)

Per research 07 §8 caveat: "k6 thresholds produce false positives as hard blockers - use as investigative warnings except for explicit regression gates."

**Rule**:
- **Smoke (PR)**: warnings only on most metrics; HARD gate only on metrics mapped to D6 Pyrra SLOs (availability, p95 latency for SLO-targeted endpoints)
- **Soak (nightly)**: HARD gate on all SLO-mapped metrics; investigative warnings on others
- **Don't threshold** non-SLO metrics in CI (e.g., individual operation timings, internal recording metrics) - they flake; trigger investigation via Grafana review instead

## Banned

- wrk / wrk2 as primary (Lua scripting + no scenario richness; OK for micro-benchmark only)
- Apache JMeter (XML scenarios; verbose; agent-unfriendly)
- Tests w/ thresholds on non-SLO metrics gating CI (false positives flake CI per research caveat)
- Load tests against prod cluster (use prod-shadow staging K3s; never load prod)
- Hardcoded credentials/PHI in test scenarios (use Synthea-generated synthetic data per research 05)

<!-- fold: rationale, non-binding -->

## Why k6 (vs Gatling / Locust / Vegeta / wrk / JMeter)

| Capability | k6 | Gatling | Locust | Vegeta | wrk/wrk2 | JMeter |
|---|---|---|---|---|---|---|
| TypeScript-native (per [[curaos-bun-primary-rule]] adjacent ecosystem) | yes (v1.0 May 2025) | no (Scala DSL) | no (Python) | no | no (Lua) | no (XML) |
| Setup complexity | low (single binary) | medium | medium | very low | low | very high |
| K6 Operator on K8s (per [[curaos-orchestration-rule]] D0) | yes (distributed runs as K8s CRDs) | yes (FrontLine commercial) | partial (master/workers) | manual | manual | manual |
| gRPC + WebSocket native | yes | partial | manual | no | no | partial |
| Browser load (full page) | yes (xk6-browser) | partial | partial | no | no | partial |
| Threshold pass/fail CI gate | yes (`thresholds` config) | yes (assertions) | yes | manual | manual | yes |
| Streams to VictoriaMetrics + Grafana (per D-future obs) | yes native | partial | manual | manual | manual | partial |
| Agent training data 2025-2026 | high + growing | medium (Scala niche) | high (Python) | medium | low | high (stale) |
| Codegen recipe friendliness (per ADR-0123) | excellent (TS scenario template) | medium (Scala DSL) | medium (Python class) | brittle (single URL) | low (Lua) | very low |
| OSS license | AGPL | Apache + commercial | MIT | MIT | Apache | Apache |
| Self-hosted + air-gap (per AGENTS.md §4 + [[curaos-orchestration-rule]] Zarf) | yes | yes | yes | yes | yes | yes |
| 2025-2026 momentum | very high (Grafana Labs invest; TS v1.0) | stable | stable | stable | stable | declining |

## k6 TypeScript scenario pattern

```ts
// ops/perf/identity-service/smoke.ts
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Options } from 'k6/options';

export const options: Options = {
  scenarios: {
    auth_smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '1m',
    },
  },
  thresholds: {
    // Map to D6 Pyrra SLO target (99.9% < 200ms); fail PR if exceeded
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const res = http.post(`${__ENV.IDENTITY_URL}/auth/token`, {
    email: __ENV.TEST_EMAIL,
    password: __ENV.TEST_PASSWORD,
  }, {
    tags: { tenant_id: 'load-test-tenant' },  // matches D6 per-tenant SLO label
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'access_token present': (r) => r.json('access_token') !== undefined,
  });
  sleep(1);
}
```

Per-service smoke scenarios live at `ops/perf/<service>/smoke.ts`; soak scenarios at `ops/perf/<service>/soak.ts`.

## K6 Operator on K3s (per [[curaos-orchestration-rule]])

Distributed runs as `TestRun` CRDs:

```yaml
apiVersion: k6.io/v1alpha1
kind: TestRun
metadata:
  name: tenant-onboarding-soak-2026-05-25
  namespace: perf-tests
spec:
  parallelism: 8
  script:
    configMap:
      name: tenant-onboarding-soak-scenario
      file: scenario.ts
  arguments: --tag environment=staging
  runner:
    image: ghcr.io/grafana/k6-operator:latest
    resources:
      limits:
        cpu: 2000m
        memory: 1Gi
```

Runs on ephemeral K3s worker pods → simulates 10K+ concurrent users from inside cluster → tests scale realistically.

## Per-service AGENTS.md frontmatter

```yaml
perf:
  framework: k6
  smoke_path: ops/perf/<service>/smoke.ts
  soak_path: ops/perf/<service>/soak.ts
  thresholds:
    smoke:
      http_req_duration: 'p(95)<200'
      http_req_failed: 'rate<0.001'
    soak:
      http_req_duration: 'p(95)<150'
      http_req_failed: 'rate<0.0001'
  slo_mapped_metrics: [http_req_duration, http_req_failed]  # ONLY these gate CI
```

## CI integration

```yaml
# .github/workflows/perf-smoke.yml (PR)
on: pull_request
jobs:
  perf-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - run: k6 run --quiet ops/perf/${{ matrix.service }}/smoke.ts

# .github/workflows/perf-soak.yml (nightly)
on:
  schedule:
    - cron: '0 3 * * *'  # 03:00 UTC nightly
jobs:
  perf-soak:
    runs-on: self-hosted-k3s
    steps:
      - uses: actions/checkout@v4
      - run: kubectl apply -f ops/perf/<service>/k6-operator-run.yaml
```

## Local + 3rd-party rule compliance

Per [[curaos-local-vs-3rdparty-rule]]:
- Local (default): k6 CLI on dev laptop; K6 Operator on K3s for distributed
- 3rd-party (optional): k6 Cloud / Grafana Cloud k6 - via env var `K6_CLOUD_TOKEN` (tenant brings); used for large-scale runs > local K3s capacity
- Self-hosted dashboard: stream k6 metrics to VictoriaMetrics (per D-future obs); Grafana dashboards visualize

## Modulith ↔ standalone compliance

Per [[curaos-modulith-standalone-rule]]:
- Standalone clone: per-service `ops/perf/` ships w/ repo; `bunx k6 run smoke.ts` works locally w/ dev infra Compose (per D0)
- Modulith: same; Turborepo orchestrates per-service smoke runs in CI matrix
- Prod: K6 Operator on prod-shadow K3s cluster (NOT prod itself); never run load against prod

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first | k6 CLI + K6 Operator on K3s; cloud opt-in only |
| AGENTS.md §4 air-gap | k6 binary Zarf-bundled (per D0); K6 Operator Helm chart air-gap installable |
| AGENTS.md §6 NFR performance + reliability | SLO regression gates per D6 Pyrra; soak validates pre-deploy |
| [[curaos-orchestration-rule]] (D0) | K6 Operator on K3s; ephemeral worker pods |
| [[curaos-cni-rule]] (D3) | k6 runners get CiliumNetworkPolicy allowing access to target services; FQDN egress for cloud-side runs if any |
| [[curaos-postgres-rule]] (D4) | Perf tests use ephemeral test DB via CNPG Database CRD; tear down after run |
| [[curaos-slo-rule]] (D6) | Thresholds map to Pyrra SLO indicators; perf gates align w/ prod SLOs |
| [[curaos-bun-primary-rule]] | `bunx k6 run ...` for local CLI; CI installs k6 via setup-k6-action |
| [[curaos-ai-mirror-rule]] | ops/perf/<service>/*.ts mirrored under curaos/ops + ai/curaos/ops |

## Agentic-tool friendliness

Why k6 wins for AI agents specifically:
- TypeScript scenarios (v1.0+) → agents write w/ type-safety (per [[curaos-validation-rule]] Zod schemas reusable in test fixtures)
- Threshold syntax declarative → agents map to SLOs unambiguously
- K6 Operator CRD model → agents apply via `kubectl apply` (CLI-first per [[curaos-mcp-stack-rule]])
- Output JSON structured → agents diagnose failures w/o log spelunking
- Native gRPC + WebSocket + browser → one tool covers most CuraOS API surfaces
- Codegen recipe ergonomic → per ADR-0123 emits per-service smoke + soak templates from service spec
- Docs at grafana.com/docs/k6 excellent; agents answer most questions one round-trip

## How to apply

- Every service emits `ops/perf/<service>/smoke.ts` + `ops/perf/<service>/soak.ts` via Codegen recipe
- Service AGENTS.md frontmatter declares `perf:` block as above
- CI workflow: `perf-smoke.yml` (PR, ~1 min) + `perf-soak.yml` (nightly, ~30 min)
- K6 Operator deployed via ArgoCD ApplicationSet to staging cluster; prod-shadow cluster mirrors prod config for full-scale soak
- Grafana dashboard per service shows historical k6 runs + SLO trend
- AI-doc per service `ai/curaos/backend/services/<svc>/CONTEXT.md` references perf scenarios + threshold rationale

## ADRs queued

Per digest §6:
- **ADR-0143 (NEW, perf testing)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §6 NFR performance subsection to link this rule + D6 [[curaos-slo-rule]]
