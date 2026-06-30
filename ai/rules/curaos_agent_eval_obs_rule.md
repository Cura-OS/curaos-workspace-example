---
name: curaos-agent-eval-obs-rule
title: Agent eval + observability (DeepEval + Langfuse v3 + LiteLLM + Presidio)
description: Agent eval + observability - DeepEval (Apache 2.0; pytest-native; per-PR CI gate; 50+ metrics; 14 safety scanners) + Langfuse v3 self-hosted (MIT; Next.js+Postgres+ClickHouse+MinIO+Redis fits CuraOS K3s+CNPG+MinIO existing stack per [[curaos-postgres-rule]]; per-trace cost attribution; OTel native; prompt registry built-in; HIPAA-safe); LiteLLM proxy w/ Presidio MIT PHI scrub middleware (mandatory technical control NOT process control; 50+ recognizers + MedicalNERRecognizer + GPU GLiNER/ONNX air-gap) + 4-threshold cost alerts (75/90/95/100% per-tenant daily budget) OVERRIDES DA9 no-cost-gateway-for-dev; A/B testing via Langfuse prompt registry labels production/canary 10% traffic split + bootstrap CI on per-case delta; full automated continuous improvement loop (production traces → Presidio scrub → HDBSCAN failure clustering → root cause triage → prompt iteration → DeepEval CI gate → 7-day canary → statistical compare → ship → re-lock baseline; weekly cadence for solo dev); per-run trace schema w/ gen_ai.* OTel conventions
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

Grounded in [[curaos-cli-agents-rule]] DA1 + [[curaos-mcp-stack-rule]] DA3 + [[curaos-context-engineering-rule]] DA4 + [[curaos-model-tiering-rule]] DA5 + [[curaos-verification-stack-rule]] DA6 + [[curaos-swarm-collaboration-rule]] DA9.

## The rule

Five locked components + DA9 cost gateway amendment:

1. **DeepEval as CI eval gate** (Apache 2.0; pytest-native; per-PR; 50+ metrics; 14 safety scanners)
2. **Langfuse v3 self-hosted** (MIT; fits CuraOS K3s+CNPG+MinIO stack; per-trace cost attribution; HIPAA-safe)
3. **LiteLLM proxy w/ Presidio PHI scrub middleware + 4-threshold cost alerts** - OVERRIDES DA9 no-cost-gateway-for-dev
4. **A/B testing via Langfuse prompt registry labels** (production/canary 10% traffic split; bootstrap CI on per-case delta)
5. **Full automated continuous improvement loop** (production traces → cluster → triage → prompt → eval → canary → ship)

## DA9 amendment (locked here): LiteLLM proxy adopted

Per user combined answer "1+4" on DA11b:
- **DA9 said:** NO cost control gateway for dev (LiteLLM proxy NOT adopted)
- **DA11 overrides:** LiteLLM proxy ADOPTED w/ Presidio PHI scrub middleware + 4-threshold cost alerts (75/90/95/100% per-tenant daily budget)
- **Per-tenant cost attribution still deferred** per DA5 (product concern v2/v3) but 4-threshold alerts active

### Why amendment

- Presidio PHI scrub at proxy = technical control (HIPAA-required NOT process control)
- 4-threshold cost alerts = visibility now (not deferred); doesn't require per-tenant attribution
- Single proxy = PHI scrub + cost alerts + Langfuse trace integration in one layer

## Banned

- Cloud observability for HealthStack PHI w/o BAA (Braintrust, LangSmith cloud, Helicone cloud)
- PromptFoo cloud / post-OpenAI-acquisition (use OSS archived only for red-team)
- Lunary (GitHub repo deleted Dec 2025; verify supply chain before adopting)
- Skipping Presidio at LiteLLM proxy (process control via SDK-level scrub insufficient for HIPAA)
- Logging raw prompt text / raw tool arguments for HealthStack PHI spans (log hashes only)
- Using same model family as both agent + judge for safety-critical rubrics (self-enhancement bias; use cross-vendor judge per [[curaos-verification-stack-rule]] cross-model verifier requirement)
- Coverage % alone as eval gate (use floor + paired-delta + safety-flip three-gate per Future AGI 2026)
- Eval gate w/o golden set (must have 100-300 cases per route)
- Auto-routing all evals to frontier judge (NLI local rubrics first; frontier judge only on uncertain 0.3-0.7 range; 5-10% sampling at production scale)
- Inventing custom OTel namespaces (use `gen_ai.*` v1.38.0+ semantic conventions)
- A/B test early termination on promising results (peeking problem; use sequential testing w/ SPRT OR Bayesian posterior w/ min sample 200 per variant)
- Real PHI in eval datasets (use Patient-Zero arxiv 2509.11078 OR ASQ-PHI synthetic data; no de-identification pipeline risks)
- Skipping HDBSCAN failure clustering (weekly cadence essential for continuous improvement loop)

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| DeepEval CI gate | Apache 2.0; pytest-native (`deepeval test run`); 50+ metrics; 14 safety scanners; free self-hosted; per-PR gate w/ exit-code-1 blocks promotion |
| Langfuse v3 self-hosted | MIT; OTel native (any OTel-instrumented agent exports w/o SDK changes); fits CuraOS K3s+CNPG+MinIO+Redis existing stack per [[curaos-postgres-rule]]; per-trace cost calculated at ingestion for Anthropic + OpenAI; multi-tenant SSO v3.156+ |
| Self-hosted vs cloud economics | Self-host wins above ~10M traces/month ($3-4K/mo infra vs $199-300/mo Langfuse Cloud Pro); HIPAA requires self-host for PHI |
| Presidio MIT | 50+ built-in recognizers + MedicalNERRecognizer (clinical entity detection 2024+) + GPU acceleration GLiNER/Transformers (4-10× speedup) + ONNX Runtime support for air-gapped deployment per [[curaos-airgap-rule]]; detects all 18 PHI identifiers under HIPAA Safe Harbor |
| Presidio at LiteLLM proxy | Technical control NOT process control (mandatory for HIPAA); intercepts every request before model + scrubs every response before logging; zero agent-code changes via litellm middleware |
| HDBSCAN failure clustering | Future AGI Error Feed pattern: cluster production failures on embeddings; weekly cadence surfaces dominant failure modes for prompt iteration |
| Bootstrap CI on per-case delta | Tighter than aggregate comparison; eliminates between-example variance; statistical rigor for canary graduation |
| Sonnet 4.6 vs Opus 4.6 parity | SWE-bench 79.6% vs 80.8%; OSWorld 72.5% vs 72.7% at ~60% lower output cost; default Sonnet; Opus escape hatch for hardest 5-10% per [[curaos-model-tiering-rule]] |
| Haiku routing ≥90% pass rate | 60-80% cost cut on eligible routes (classification, extraction, simple summarization) per [[curaos-model-tiering-rule]] |

## 1. DeepEval (CI eval gate)

### Setup

```bash
bun add -g deepeval @deepeval/runner
```

### pytest-native usage

```python
# tests/agent_evals/test_identity_service.py
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    SafetyMetric,
    PromptInjectionMetric,
)

def test_identity_service_login_intent():
    test_case = LLMTestCase(
        input="Login with email user@example.com",
        actual_output=agent.run(input),
        expected_output="JWT token returned",
        retrieval_context=["auth.service.ts impl"],
    )
    assert_test(test_case, [
        AnswerRelevancyMetric(threshold=0.85),
        FaithfulnessMetric(threshold=0.90),
        SafetyMetric(threshold=0.95),
        PromptInjectionMetric(threshold=0.99),
    ])
```

### CI invocation

```yaml
# .github/workflows/agent-evals.yml
on: [pull_request]
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bunx deepeval test run tests/agent_evals/
        env:
          DEEPEVAL_API_KEY: ${{ secrets.DEEPEVAL_API_KEY }}
```

Exit code 1 if any metric below threshold → blocks merge.

### Three-gate regression suite (per Future AGI 2026)

Per-route eval suite (100-300 cases) - 3 independent gates; any violation blocks promotion:

1. **Floor threshold**: per-route mean score drops below pinned floor (Groundedness ≥0.85; AnswerRefusal ≥0.90; citation validity ≥0.99 on compliance routes)
2. **Paired-delta CI**: bootstrap CI on per-case score differences sits entirely below zero on any metric (tighter than aggregate)
3. **Safety flip**: any safety-critical rubric (PromptInjectionDetection, DataPrivacyCompliance) changes any case pass→fail = instant block regardless of overall score

### Golden set composition (locked: 100-300 cases per route)

- ~60% production happy-path queries (sampled + scrubbed from real traces)
- ~20% edge cases (length extremes, multilingual, ambiguous inputs)
- ~10% refusal cases (out-of-scope, PHI requests, policy violations)
- ~10% historical incident failures (agent bugs caught in production; NEVER age out)

Stratify by `intent × persona` matrix; ≥3 cases per cell.

### Cost control: NLI rubrics + frontier-judge sampling

- **NLI-backed local rubrics** (DeepEval GEval w/ local NLI model) run on ALL cases first → catches 60-70% of failures at near-zero token cost
- **Frontier judge** (Sonnet/Opus) only on cases NLI flags as uncertain (score in 0.3-0.7 range) → saves ~80% judge token cost
- Production-scale sampling: 5-10% of passing traces for judge eval (statistical process control), NOT 100%

## 2. Langfuse v3 (self-hosted observability)

### Architecture (fits existing CuraOS infra)

```
Langfuse Web (Next.js)
  + Async Worker (Node.js)
  + Redis/Valkey queue
  + PostgreSQL (transactional)    ← via CNPG per [[curaos-postgres-rule]]
  + ClickHouse (OLAP)              ← per Langfuse v3 architecture
  + S3/MinIO (event persistence)  ← MinIO per [[curaos-airgap-rule]]
```

All traces write to S3 first, then workers process into ClickHouse - prevents bottlenecks during traffic spikes + enables trace replay.

### Deployment (K3s + Helm per [[curaos-orchestration-rule]])

```bash
helm install langfuse langfuse/langfuse \
  --namespace observability \
  --set postgres.external.enabled=true \
  --set postgres.external.uri="postgresql://langfuse:pwd@cnpg-langfuse-rw.observability:5432/langfuse" \
  --set clickhouse.external.enabled=true \
  --set s3.external.enabled=true \
  --set s3.external.endpoint="minio.observability:9000" \
  --set redis.external.enabled=true
```

**Production rule:** run Postgres + ClickHouse + Redis + MinIO as HA services outside chart (in-chart subcharts single-replica, smoke-test only).

### Per-tenant cost attribution (deferred per DA5 but ready)

Tag every trace w/ `metadata.tenant_id` + `metadata.agent_id` + `metadata.task_type` + `metadata.module`:

```python
langfuse.trace(
    metadata={
        "tenant_id": "tenant-abc",
        "agent_id": "claude-swarm-13",
        "task_type": "patient-intake-summary",
        "module": "identity-service",
        "task_issue": "#412",
    }
)
```

Rollup queries (when v2/v3 product enables per-tenant pricing):

```
GET /api/public/metrics/daily?groupBy=metadata.tenant_id
GET /api/public/metrics/daily?groupBy=metadata.agent_id
GET /api/public/metrics/daily?groupBy=metadata.module
```

### Self-hosting economics

- Medium-scale (~1M traces/month): $3-4K/month infra + ops vs Langfuse Cloud Pro $199-300/month
- Self-host wins above ~10M traces/month
- Solo-dev HIPAA workload: self-host mandatory regardless (PHI cannot leave infra)

## 3. LiteLLM proxy w/ Presidio + 4-threshold cost alerts (OVERRIDES DA9)

### Why amendment from DA9

Per user combined answer "1+4" on DA11b:
- DA9 said "no cost control gateway for development" but DA11 user adopts LiteLLM proxy NOW for Presidio PHI scrub (mandatory) + 4-threshold cost alerts (visibility w/o per-tenant attribution)
- Per-tenant cost attribution remains deferred per DA5 (product concern v2/v3)
- Single LiteLLM proxy provides: PHI scrub + cost alerts + Langfuse trace integration in one layer

### LiteLLM proxy setup

```yaml
# litellm-config.yaml
model_list:
  - model_name: claude-sonnet-4-6
    litellm_params:
      model: anthropic/claude-sonnet-4-6
      api_key: ${ANTHROPIC_API_KEY}

  - model_name: gpt-5.5
    litellm_params:
      model: openai/gpt-5.5
      api_key: ${OPENAI_API_KEY}

litellm_settings:
  callbacks: ["langfuse", "presidio"]
  presidio:
    operators:
      DEFAULT: { type: "replace", new_value: "[REDACTED]" }
      US_SSN: { type: "mask", masking_char: "*" }
      MEDICAL_RECORD: { type: "redact" }
    recognizers:
      - name: MedicalNERRecognizer
        gpu_acceleration: true  # GLiNER for 4-10x speedup
  langfuse:
    public_key: ${LANGFUSE_PUBLIC_KEY}
    secret_key: ${LANGFUSE_SECRET_KEY}
    host: https://langfuse.observability.svc.cluster.local
  budget:
    soft_budget_alerts:
      - threshold: 0.75
        target: slack
        channel: "#ops-cost-alerts"
      - threshold: 0.90
        target: pagerduty
        severity: P3
      - threshold: 0.95
        target: pagerduty
        severity: P2
    hard_budget_cap:
      threshold: 1.00
      action: 429
      ticket_target: github
      repo: cura-care-oriented-stack/ops
```

### 4-threshold cost alerts (LOCKED)

| Threshold | Action |
|---|---|
| **75%** daily budget | Soft alert → Slack `#ops-cost-alerts` |
| **90%** | Constrained mode → downgrade tier (per [[curaos-model-tiering-rule]] DA5 budget-overrun fallback) → PagerDuty P3 |
| **95%** | Final warning → on-call notified → PagerDuty P2 |
| **100%** | HARD CAP → gateway returns 429 → auto-ticket → PagerDuty P1 |

### Presidio PHI scrub middleware (LOCKED mandatory technical control)

- Intercepts every LLM request BEFORE reaching model
- Scrubs every response BEFORE logging to Langfuse
- 50+ built-in recognizers + `MedicalNERRecognizer` (clinical entity detection 2024+)
- GPU acceleration via GLiNER/Transformers (4-10× speedup)
- ONNX Runtime support for air-gapped deployment per [[curaos-airgap-rule]]
- Detects all 18 PHI identifiers under HIPAA Safe Harbor standard
- Audit log: structured (user identity, UTC timestamp, model version, policy version, entity types detected, redaction actions) to Loki + Grafana per [[curaos-error-tracking-rule]]
- Post-hoc scrubbing of already-logged traces = process control (NOT sufficient for HIPAA); Presidio at proxy = technical control (mandatory)

## 4. Per-run trace schema (locked: gen_ai.* OTel conventions)

Each agent run produces root span:

```
trace_id: <uuid>
  span: agent_run (root)
    agent_id: "healthstack-triage-v2"
    task_type: "patient-intake-summary"
    model: "claude-sonnet-4-6"
    tenant_id: "tenant-abc"
    user_id: "worker-id-123"     # healthcare worker NOT patient ID
    input_tokens: 4200
    output_tokens: 380
    cache_hit_tokens: 3100
    cost_usd: 0.0047
    latency_ms: 1840
    status: "success" | "partial" | "error" | "timeout"

    span: tool_call (child, per tool use)
      tool_name: "fhir_patient_lookup"
      arguments_hash: <sha256>     # NEVER log raw args if PHI possible
      duration_ms: 340
      retry_count: 0
      error: null

    span: llm_generation (child, per model call)
      model: "claude-sonnet-4-6"
      prompt_version: "v1.4.2"
      input_tokens: 4200
      output_tokens: 380
      ttfb_ms: 820
      total_ms: 1650
      finish_reason: "end_turn"
```

### Instrumentation rules

- NEVER log raw prompt text or raw tool arguments in HealthStack spans - log hashes + scrubbed summaries only
- Always propagate `trace_id` across agent handoffs so multi-agent fan-out collapses into single root trace
- Tag every span w/ `service.name` (microservice), `agent.id` (agent definition version), `tenant_id`
- Use `gen_ai.*` OTel semantic conventions; do NOT invent custom namespaces

### OpenTelemetry GenAI v1.38.0+ migration (mandatory)

OTel GenAI Semantic Conventions v1.38.0 (late 2025) DEPRECATED `gen_ai.prompt` + `gen_ai.completion` raw attributes in favor of structured events. New code MUST use structured events.

OpenLLMetry instrumentation may be donated to OTel project directly; if accepted = becomes official OTel package.

## 5. Prompt versioning + registry

### Git-based + Langfuse prompt registry

- Store prompts as files in `ai/prompts/<service>/<agent>/<version>.md` or YAML (`version`, `model`, `system`, `user_template`, `eval_suite_ref`)
- SemVer: MAJOR breaking changes; MINOR new features; PATCH wording refinements
- Each prompt file commits alongside eval baseline
- CI on `prompts/**` path change runs paired regression suite before merge
- Langfuse prompt registry stores versioned prompts w/ labels (`production`, `staging`, `canary`)
- Agents fetch at runtime: `langfuse.get_prompt(name="triage-summary", label="production")` - cache read NOT file read
- Zero-downtime rollback: flip `production` label to prior version; agents pick up within Redis TTL (~60s)

## 6. A/B testing (locked: Langfuse prompt registry labels)

### Label-based traffic split

```python
# 10% traffic to canary
import random
label = "canary" if random.random() < 0.10 else "production"
prompt = langfuse.get_prompt(name="triage-summary", label=label)
```

### Statistical stopping rules

- Do NOT end A/B tests early on promising early results (peeking problem)
- Sequential testing w/ SPRT OR Bayesian posterior w/ min sample 200 per variant per eval metric
- For cost comparisons: Wilcoxon signed-rank test on paired per-trace costs (same input to both variants) - controls for input complexity variance
- Graduate canary → production when bootstrap CI on per-case delta sits entirely above baseline on all rubrics

### 2026 Claude routing heuristic (per [[curaos-model-tiering-rule]] DA5)

- Default: Sonnet 4.6 for all agent workloads
- Opus 4.8 escape hatch: hardest 5-10% of requests (prompt length > threshold, multi-file scope, reasoning depth flag); Fable 5 reserved for adversarial-gate judging, not routine routing
- Haiku routing: if Haiku passes route-specific rubric on ≥90% of tasks in eval suite → route those to Haiku (60-80% cost cut)
- Re-evaluate monthly as model versions advance

## 7. Continuous improvement loop (locked: full automated)

```
[Production Traces]
       │
       ▼ (Langfuse export + Presidio scrub at LiteLLM proxy)
[Failure Cluster Analysis] ← HDBSCAN on embeddings (Future AGI Error Feed pattern)
       │
       ▼ (identify dominant failure modes by error tag)
[Root Cause Triage]
       │ hallucination → improve retrieval grounding
       │ wrong_tool → fix tool descriptions + add few-shot examples
       │ partial_completion → restructure task decomposition
       ▼
[Prompt Iteration] ← edit prompt file in git, bump version
       │
       ▼ (CI triggers on prompts/** path change)
[Regression Suite] ← DeepEval against golden set
       │ floor threshold check
       │ paired-delta CI check
       │ safety flip check
       ▼ (all gates green)
[Staging Canary] ← Langfuse label "canary", 10% traffic
       │
       ▼ (7-day eval period; ≥200 traces per variant)
[Statistical Comparison] ← Langfuse metrics API; Bayesian posterior
       │
       ▼ (canary ≥ production on all rubrics)
[Production Promotion] ← flip Langfuse prompt label to "production"
       │
       ▼
[New Baseline Locked] ← regenerate baseline JSON in git
```

### Cadence for solo-dev + swarm

- **Daily**: review Langfuse cost dashboard; check failure rate alerts
- **Weekly**: HDBSCAN failure cluster analysis on past week's scrubbed error traces; add top-3 failure clusters as new golden set cases; review human feedback ratio per route
- **Per PR**: DeepEval regression suite in CI (blocks merge if floor/paired-delta/safety-flip violated)
- **Per model release**: Inspect AI capability eval suite against new model; compare to baseline before routing production traffic
- **Monthly**: re-evaluate model routing heuristics (Haiku vs Sonnet vs Opus split) against accumulated eval data

## 8. Error taxonomy (locked)

Closed label set; apply consistently:

| Error Type | Definition | Detection |
|---|---|---|
| `hallucination` | Agent asserts fact not grounded in context | LLM-as-judge faithfulness rubric |
| `wrong_tool` | Agent called tool not appropriate for task | Tool selection accuracy metric; human audit |
| `tool_failure` | Tool returned error/empty; agent didn't recover | Span status + retry count |
| `partial_completion` | Agent stopped before fully done | Finish reason `max_tokens` OR task completion score < threshold |
| `regression_introduced` | Agent's output broke downstream contract or test | CI gate failure post-deployment |
| `prompt_injection` | Agent manipulated by adversarial input in tool output | Dedicated injection scanner |
| `context_overflow` | Agent dropped earlier context; inconsistent multi-turn | Context window util > 90% + coherence score drop |
| `latency_timeout` | Agent exceeded SLO wall time | Span duration vs SLO threshold |
| `policy_violation` | Agent produced output violating safety/compliance | Safety rubric fail |

Tag every error span w/ ONE primary error type. Aggregate by type per agent per week to identify dominant failure mode.

## 9. Multi-agent traces

Per agent handoff: parent injects `trace_id` + `span_id` into handoff payload. Child agent creates span as child of parent's handoff span. Both agents' execution collapses into single root trace.

### Fan-out cost rollup (Langfuse auto)

```
root_trace (200-agent swarm task)
  ├── orchestrator_agent (Sonnet 4.6)   cost: $0.012
  ├── specialist_agent[0..5] (Haiku)    cost: $0.002 × 6 = $0.012
  └── synthesis_agent (Sonnet 4.6)      cost: $0.008
Total: $0.032 per orchestrated task
```

Export `GET /api/public/traces?rootOnly=true&metadata.tenant_id=X` for per-orchestration cost.

## 10. Alerts (locked)

| Alert | Trigger | Channel | Severity |
|---|---|---|---|
| Agent failure rate | error_rate > 5% over 5 min rolling | PagerDuty | P2 |
| Agent timeout rate | p95 latency > 15s for any route | PagerDuty | P2 |
| Daily cost overrun | per-tenant cost > 2× 7-day average | Slack `#ops-alerts` | P3 |
| Absolute cost cap (75/90/95/100%) | per-tenant daily budget thresholds | Slack/PagerDuty escalating | P3→P1 |
| PHI detection in trace | Presidio finds PHI in logged span | PagerDuty | P1 (immediate incident) |
| Eval regression | CI eval gate fails on main branch | Slack `#dev` + GitHub PR comment | P2 |
| Safety rubric flip | Any safety score transitions pass→fail | PagerDuty | P1 |
| Judge disagreement rate | >20% multi-judge disagreement on sample | Slack `#eval-review` | P3 |

Implementation: Langfuse emits Prometheus metrics → scrape via Prometheus running in K3s alongside app → route alerts via Alertmanager to PagerDuty + Slack.

## Tooling stack summary (LOCKED for CuraOS continuous improvement loop)

| Stage | Tool | License | Deploy |
|---|---|---|---|
| Trace collection | Langfuse v3 | MIT | Self-hosted K3s |
| PHI scrub | Presidio (LiteLLM middleware) | MIT | Self-hosted sidecar |
| Failure clustering | HDBSCAN via scikit-learn + Langfuse export | BSD | Self-hosted |
| CI eval gate | DeepEval | Apache 2.0 | Self-hosted pytest |
| Capability eval (pre-promotion) | Inspect AI | MIT | Self-hosted |
| Trace-linked eval experiments | Arize Phoenix (pairs w/ Langfuse) | EL 2.0 | Self-hosted optional |
| Prompt registry | Langfuse built-in | MIT | Self-hosted |
| Model routing + A/B | LiteLLM proxy | MIT | Self-hosted |
| Metrics / alerts | Prometheus + Alertmanager + Grafana | Apache 2.0 | Per [[curaos-slo-rule]] |
| Synthetic dataset gen | Phoenix cookbook + GPT-4.1 API | mixed | GPT-4.1 cloud (no PHI in eval data; use Patient-Zero arxiv 2509.11078 / ASQ-PHI synthetic instead) |
| Human feedback | Langfuse score API | MIT | Self-hosted |
| Red-team adversarial | LangWatch Scenario | OSS | Self-hosted |

## HealthStack PHI workloads (self-hosted only)

Per [[curaos-error-tracking-rule]] + [[curaos-cli-agents-rule]] DA1:
- ANY agent processing HealthStack clinical data MUST route through self-hosted infrastructure only
- Stack: self-hosted Langfuse + self-hosted LiteLLM proxy + Presidio sidecar
- Cloud observability platforms (Braintrust, LangSmith cloud, Helicone cloud) MUST NOT receive HealthStack traces even scrubbed unless BAA in place + HIPAA-certified
- Future AGI + Arize AX Enterprise have HIPAA BAA available if cloud routing becomes necessary

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter (self-hosted first) | Langfuse + Presidio + LiteLLM all self-hosted MIT/Apache 2.0; HealthStack PHI cannot leave infra |
| AGENTS.md §6 NFR (observability + reliability) | Per-trace cost + latency + token; failure rate + timeout alerts; eval regression gates |
| AGENTS.md §10 (agent operating rules) | Verifier sub-agents per [[curaos-verification-stack-rule]] tracked via Langfuse trace |
| AGENTS.md §11 (boundaries + approvals) | T3 HITL decisions logged to Langfuse audit; PHI scrub mandatory at proxy |
| [[curaos-cli-agents-rule]] | Per-CLI cost + latency tracked separately; Pi/Codex/Claude all instrumented |
| [[curaos-mcp-stack-rule]] | Memory MCPs banned (file-based + Langfuse trace storage sufficient) |
| [[curaos-context-engineering-rule]] | BATS budget regime + cache hit rate tracked in Langfuse |
| [[curaos-model-tiering-rule]] | Per-tier cost rollup via Langfuse metadata; routing heuristic re-evaluated monthly w/ eval data |
| [[curaos-verification-stack-rule]] | Eval regression suite integrated as T2 PR gate; trace link in PR description |
| [[curaos-quality-gates-rule]] | DeepEval CI gate parallels Stryker mutation + Semgrep PR-level gates |
| [[curaos-swarm-collaboration-rule]] | **AMENDED:** LiteLLM proxy adopted (overrides DA9 no-cost-gateway-for-dev); 4-threshold alerts active; per-tenant cost attribution still deferred per DA5 |
| [[curaos-error-tracking-rule]] | Presidio scrub at LiteLLM proxy = mandatory technical control for PHI per error-tracking rule |
| [[curaos-slo-rule]] | Prometheus alerts scrape Langfuse metrics for SLO rollup |
| [[curaos-postgres-rule]] | Langfuse Postgres via CNPG |
| [[curaos-airgap-rule]] | Presidio ONNX Runtime supports air-gap; LiteLLM + Langfuse self-hostable |
| [[curaos-memory-agents-sync-rule]] | This rule mirrors byte-identical |

## Agentic-tool friendliness

Why DeepEval + Langfuse + LiteLLM + Presidio wins:

- **DeepEval pytest-native** = agents run evals same way they run unit tests; familiar CI pattern
- **Langfuse OTel native** = any OTel-instrumented agent exports w/o SDK changes
- **Per-trace cost attribution** = agents (or orchestrator) see cost in real-time; route to cheaper tier when threshold crossed
- **LiteLLM proxy single layer** = PHI scrub + cost alerts + Langfuse trace in one config
- **Presidio at proxy** = HIPAA technical control NOT process control; zero agent-code changes
- **4-threshold cost alerts** = visibility w/o per-tenant attribution complexity
- **Langfuse prompt registry** = zero-downtime prompt rollback via label flip; A/B testing via labels
- **Full automated continuous improvement loop** = closes feedback loop from production → improvement → ship w/o manual quarterly review
- **NLI + sampling cost control** = eval cost stays bounded even at production scale (5-10% sampling)
- **Patient-Zero / ASQ-PHI synthetic data** = HealthStack eval w/o real PHI; no de-identification pipeline needed
- **gen_ai.* OTel conventions** = interpretable by any OTel backend; future-proof

## How to apply

- Workspace setup:
  - K3s namespace `observability`
  - Helm install: Langfuse v3 + Presidio sidecar + LiteLLM proxy
  - Postgres via CNPG `Database` CRD per [[curaos-postgres-rule]]
  - MinIO + ClickHouse + Redis as HA services outside Helm chart (per Langfuse production rule)
- Per-service:
  - All LLM calls route through LiteLLM proxy (`OPENAI_API_BASE=http://litellm.observability:4000`)
  - Tag every trace w/ `metadata.tenant_id` + `metadata.agent_id` + `metadata.task_type` + `metadata.module` + `metadata.task_issue`
  - Use `gen_ai.*` OTel semantic conventions (v1.38.0+; structured events not deprecated raw attributes)
  - HealthStack PHI sessions: NEVER log raw prompt text or raw tool arguments; log hashes + scrubbed summaries only
- CI integration:
  - `.github/workflows/agent-evals.yml` runs DeepEval per PR; exit code 1 blocks merge
  - Per-route eval suite at `tests/agent_evals/<service>/<route>.py`
  - Golden sets at `ai/curaos/evals/<service>/golden-set.json` (versioned in git; immutable once human-signed-off)
- Weekly cadence:
  - HDBSCAN failure cluster analysis on past week's scrubbed traces
  - Add top-3 failure clusters as new golden set cases
  - Review per-route eval scores; iterate prompts where score drops
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate to memory + ai/rules/ + AGENTS.md §15

## ADRs

Cross-ref RESOLUTION-MAP.md for agent-eval ADR status. ADR-0160 covers AI token quota tracking (separate topic); ADR-0158 covers air-gap bundle SLA (separate topic). ADR cross-refs for this rule are tracked in `ai/curaos/docs/adr/RESOLUTION-MAP.md`.
