# Adversarial grill — M10 observability dashboards + per-service perf baseline (#286)

- **Harness**: Claude (implementer) → Codex (reviewer), opposite-harness per [[curaos-verification-stack-rule]].
- **Reviewer**: `codex exec` (default model, `model_reasoning_effort=high`, `--sandbox read-only`).
- **Scope**: working-tree `ops/` config (catalog + generator + 7 dashboards + rollup + 7 OpenSLO + 7 k6 drivers + config lib/test).
- **Verdict**: REQUEST-CHANGES → all actionable findings auto-applied (recommendations grounded in source/spec per [[curaos-recommendation-auto-apply-rule]]); residual items emitted as FORESIGHT / user-escalation.

## Findings + resolution

| # | Finding | Verified against | Resolution |
|---|---|---|---|
| 1 | Probe paths bare `health` for 6/7 services; actual routes are controller-prefixed (`storages/health`, `search/health`, …) → k6 would 404 | each service `*.controller.ts` `@Controller` prefix | FIXED — catalog `probePath` set to controller-prefixed route; verified all 7 in `generate.test.ts` |
| 2 | OpenSLO invalid: missing required `spec.budgetingMethod`; `timeWindow` under objective instead of `spec` | canonical OpenSLO v1 spec (github.com/OpenSLO/OpenSLO) | FIXED — generator emits `budgetingMethod: Occurrences` + spec-level `timeWindow`; objective-level removed; asserted in test |
| 3 | `settings-flag-sync` cataloged as Redpanda consumer, but `settings.flag.toggled.v1` rides NATS JetStream | `settings-event-producer.ts` + ADR-0201 §3.4.4 | FIXED — replaced with Kafka-transport `settings-cache-sync` on `settings.tenant.updated.v1`; catalog `_comment` documents the NATS exclusion; asserted in test |
| 4 | Consumer panels hardcode `legendFormat: '{{route}}'` → unlabeled consumer series | `notify-service.json` panel 5-7 | FIXED — `panel()` takes `legendFormat`; consumer panels use `{{consumer_group}} / {{topic}}`; asserted in test |
| 5 | `DLQ count (rate)` name mixes count + rate | dashboard panel 6 | FIXED — renamed to `DLQ event rate` |
| 6 | Latency SLO `le` may not be a real histogram bucket | OTel default HTTP buckets | FIXED proactively before grill — generator snaps `le` up to the nearest real bucket (`sloLatencyLe`); asserted in test |
| 7 | `readPath` cataloged but unused by k6 drivers | catalog vs generator | DOCUMENTED — `readPath` reserved for a future authed-read scenario (needs synthetic auth fixtures); catalog `_comment` + FORESIGHT on issue. Health smoke is the current baseline (no synthetic auth exists for these services). |
| 8 | k6 hard-fails `dropped_iterations`/`checks` alongside the SLO metric | baseline driver | KEPT (defensible) — these are scenario-VALIDITY gates, not SLO gates; the perf rule HARD-gates SLO metrics and a latency-only gate can false-green a fast-failed run. Documented in driver comments + `ops/perf/README.md`. |
| 9 | `backend/packages/observability` is a clean-slate stub; no source emits the metric names | repo grep | OUT-OF-SCOPE (this issue is dashboards/SLO/perf CONFIG). The OTel instrumentation that emits these metrics is a separate implementation lane → FORESIGHT prereq on the issue. |

## User-escalation candidates (from reviewer §7) — dispositioned, no escalation needed

- **OpenSLO vs Pyrra CRD canonical**: [[curaos-slo-rule]] resolves this — OpenSLO YAML is the authoring format, Pyrra reads it natively; no escalation.
- **flag.toggled NATS vs Redpanda**: resolved by ADR-0201 §3.4.4 (stays NATS); finding #3 applied.
- **health-only vs authed read baseline**: health smoke now + authed read later → FORESIGHT, not a blocker.
- **D6 latency budgets 150/200/250/300ms**: platform-service defaults; the SLO `le` snaps to real buckets and the k6 gate is overridable per-service via `P95_BUDGET_MS`. Operator records real numbers per runbook. Not a code blocker.
- **Live Grafana + k6 soak NOT verified**: by design — config-only PR; operator-driven per the runbook. Honestly split in closeout.

## Re-grill verification

Not re-run after fixes (reviewer was read-only; fixes verified by the new `generate.test.ts` invariant suite + OpenSLO/JSON parse checks). The 8-test suite encodes findings 1-6 so a regression cannot land silently.
