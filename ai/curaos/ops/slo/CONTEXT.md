# CONTEXT — ops/slo (OpenSLO definitions)

AI-mirror node for `curaos/ops/slo/` (per workspace AGENTS.md §1 1:1 structural
mirror). Code + canonical docs live in the curaos repo:

- OpenSLO files: `curaos/ops/slo/<service>/_default.openslo.yaml` (2 SLOs each —
  availability + latency)
- Generation + metric contract: [`curaos/ops/observability/README.md`](../../../../curaos/ops/observability/README.md)
- Operator runbook (apply as Pyrra CRDs): [`../observability/m10-baseline.md`](../observability/m10-baseline.md)

## Decisions

- **OpenSLO `openslo/v1`** is the authoring format per [[curaos-slo-rule]]; Pyrra
  reads it natively. We store one `_default` template per service; tenant
  onboarding injects `tenant_id` + tier target (0.999 standard / 0.9999
  enterprise) and applies it as a Pyrra `ServiceLevelObjective` CRD.
- **Two indicators per service**: availability (non-5xx ratio of
  `http_requests_total`) + latency (p95 under budget via
  `http_server_duration_seconds`). The latency budget mirrors the k6 baseline
  HARD gate so config + load test assert the same number.
- **Generator-owned.** Emitted from
  `curaos/ops/observability/service-catalog.json` by `generate.ts`; edit the
  catalog/emitter, never a per-service SLO file (per [[curaos-generator-evolution-rule]]).

Issue: [curaos-ai-workspace#286](https://github.com/your-org/curaos-ai-workspace/issues/286).
