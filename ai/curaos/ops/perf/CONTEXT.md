# CONTEXT — ops/perf (per-service k6 perf baselines)

AI-mirror node for `curaos/ops/perf/` (per workspace AGENTS.md §1 1:1 structural
mirror). Code + canonical docs live in the curaos repo:

- Layout + threshold strategy + run instructions: [`curaos/ops/perf/README.md`](../../../../curaos/ops/perf/README.md)
- Generated drivers: `curaos/ops/perf/<service>/baseline.ts` (one per M10 service)
- Pure, unit-tested config: `curaos/ops/perf/lib/baseline-config.ts` (+ `.test.ts`)
- Operator runbook (live runs): [`../observability/m10-baseline.md`](../observability/m10-baseline.md)

## Decisions

- **Central, not per-submodule.** The 7 M10 platform services share one generic
  GET-probe baseline, so the drivers live centrally under `curaos/ops/perf/`
  (one branch, one PR, zero submodule churn). `identity-service` keeps its
  DPoP-coupled `login-baseline.ts` in-submodule because it needs the service's
  own ES256 signing helpers — that coupling does not generalize.
- **Generator-owned.** Drivers are emitted from
  `curaos/ops/observability/service-catalog.json` by `generate.ts`; edit the
  catalog/emitter, never a per-service driver (per [[curaos-generator-evolution-rule]]).
- **Threshold contract** ([[curaos-perf-testing-rule]]): HARD-gate ONLY the
  D6-SLO-mapped p95 latency metric; everything else is investigative.

Issue: [curaos-ai-workspace#286](https://github.com/your-org/curaos-ai-workspace/issues/286).
