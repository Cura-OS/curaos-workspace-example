# ADR-0114: AI / Agent Integration Stack

> **✅ ACCEPTED WITH ADDENDUM** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: Spring AI → Vercel AI SDK 6 + LangChain.js; LangGraph4j → LangGraph.js (TS port); for NestJS host orchestration. vLLM + SGLang + Qwen3/DeepSeek/Phi4 (self-hosted models) + pgvector + Qdrant + LiteLLM gateway + MCP + Langfuse + Presidio all stand. Local + 3rd-party rule applies (OpenAI / Anthropic / Bedrock / Gemini via LiteLLM as 3rd-party options).
>
> **Open Questions resolution (2026-05-25):** MCP curated vs auto-expose → **RESOLVED-RULE** ([[curaos-mcp-stack-rule]] CLI-first + curated must-have list). LiteLLM gateway → **RESOLVED-RULE** ([[curaos-agent-eval-obs-rule]] DA11 — adopted w/ Presidio PHI scrub middleware + 4-threshold cost alerts; AMENDS DA9). Spring AI 2.0 migration → **N/A** (Spring not in stack). Clinical LoRA accuracy gate + MedNLP license + MCP SEP migration + speculative decoding → **DEFERRED-MILESTONE** (pre-HealthStack GA). See [RESOLUTION-MAP.md](RESOLUTION-MAP.md).


## Status

Proposed — pending user approval. Date: 2026-05-24.

---

## Context

CuraOS is a 91-service composable platform targeting cloud SaaS, on-premises, and air-gapped deployment
from a single artifact set. The platform will embed AI capabilities across every vertical and neutral
layer:

- **HealthStack clinical assistant** — encounter summarization, note drafting, differential suggestion
  (decision-support only, not autonomous), similar-case retrieval, FHIR-native context.
- **Document search and summarization** — across CONTEXT.md, ADRs, runbooks, tenant-uploaded docs.
- **Workflow co-pilot** — next-step suggestions inside BPM engine (ADR-0105 Temporal sagas).
- **Patient-facing symptom triage chatbot** — HIPAA constraints, required disclaimers, human escalation.
- **Education co-pilot** — course recommendations, study plan generation.
- **Business co-pilot** — CRM insights, sales summaries, procurement suggestions.
- **Audit-log triage** — anomaly detection, incident summarization.
- **Internal dev agent** — engineer productivity (overlap with Codex/Claude tooling, MCP servers).
- **Tenant admin agent** — helps admins configure flows and generate site via app builder.

These use cases share infrastructure (LLM serving, RAG, observability, PHI gating) but differ sharply
in isolation requirements, latency tolerance, and regulatory exposure. This ADR records decisions for
each layer of the AI stack.

### Hard constraints (all decisions must satisfy)

1. **Self-hosted primary.** Every component must be deployable on customer infrastructure with no
   external network calls. Air-gap profile must work with no outbound internet. Managed LLM providers
   (OpenAI, Anthropic, AWS Bedrock) are opt-in only — available to SaaS-tier tenants who accept the
   privacy trade-off and sign a BAA.
2. **HIPAA/PHI boundary.** PHI included in prompts and responses must be audited at the agent boundary.
   Per-tenant configuration governs whether PHI may leave the deployment perimeter. BAA gating is
   mandatory before any managed-LLM call that could carry PHI.
3. **GDPR erasure.** Right-to-erasure requests must propagate to: vector store (delete embeddings),
   prompt/trace logs, fine-tuned model artifact metadata. ML model full unlearning is infeasible at
   scale; mitigation is documented in the Consequences section.
4. **License compatibility.** All self-hosted components must be distributable to on-prem customers
   without per-node royalties. Apache 2.0, MIT, and BSD components are preferred. AGPL components are
   excluded from the on-prem distribution. Licenses with "non-commercial only" clauses (e.g., original
   Llama 2, Llama 3 base) are permitted only for internal inference — SaaS distribution requires
   Apache 2.0 or MIT open-weight models.
5. **Multi-tenant isolation.** A tenant's embeddings, prompt logs, fine-tuned LoRA adapters, and
   inference traces must not be accessible to any other tenant at any query path.
6. **Spring Boot / Kotlin primary runtime.** Per ADR-0100, the backend is Kotlin 2.0 + Spring Boot
   3.4. The AI integration layer must integrate idiomatically without introducing a second primary
   language runtime in the critical path.

### Already decided (upstream ADRs)

| Component | Decision | ADR |
|---|---|---|
| Primary database | PostgreSQL 17 with pgvector available | ADR-0101 |
| Event bus | Kafka primary, NATS secondary | ADR-0102 |
| API surface | Cosmo GraphQL federation | ADR-0103 |
| Identity | Keycloak 26+ | ADR-0104 |
| Workflow | Temporal (sagas) | ADR-0105 |
| Secrets | OpenBao | ADR-0108 |
| Observability | OpenTelemetry collector, Grafana stack | ADR-0107 |
| Backend runtime | Kotlin 2.0 + Spring Boot 3.4 + JVM 21 | ADR-0100 |

---

## Forces

- **91 services at varying AI exposure.** Not every service needs its own LLM integration. A shared
  AI gateway layer prevents 91 independent prompt-management solutions and 91 observability blind spots.
- **PHI redaction before managed-LLM calls is a hard requirement, not a best effort.** A missed SSN
  or patient name in an OpenAI call is a HIPAA breach. The redaction layer must be in the critical
  path, not an advisory step.
- **Cost asymmetry between on-prem and SaaS tenants.** Self-hosted open-weight models have zero
  per-token cost but non-trivial GPU infra cost; managed APIs have zero infra cost but significant
  per-token cost at scale. The stack must support both modes from one codebase, routing per tenant.
- **Clinical AI disclaimer requirements.** Every clinically-oriented response must include appropriate
  disclaimers, must cite sources, and must not present generated content as autonomous clinical
  decisions. This is a product and regulatory constraint, not just a UX preference.
- **Model versioning per tenant.** A tenant who fine-tuned a LoRA adapter on their clinical notes
  must continue to get that adapter even as the base model is upgraded. The serving layer must
  support multi-LoRA and adapter versioning.
- **GDPR 2025 enforcement priority.** The European Data Protection Board declared right-to-erasure
  its top enforcement priority for 2025. Vector database deletions must be API-accessible and
  auditable, not manual operations.
- **MCP de-facto standard.** As of early 2026, MCP has 97M monthly SDK downloads, is backed by the
  Linux Foundation (AAIF co-founded by Anthropic, OpenAI, Google, Microsoft, AWS), and 78% of
  enterprise AI teams report at least one MCP agent in production. CuraOS must support MCP both as
  a server (exposing services to external agents) and as a client (calling MCP tools from internal
  agents).

---

## Decision

### D1: LLM Serving (self-hosted)

**Decision: vLLM as primary; SGLang as secondary for RAG/prefix-heavy workloads.**

TGI is explicitly excluded. Hugging Face placed TGI in maintenance mode in December 2025, redirecting
teams to vLLM or SGLang.

**Rationale:**

| Framework | Throughput (Llama 3.3 70B, 100 req, H100) | Cold-start | Strengths | Weaknesses |
|---|---|---|---|---|
| **vLLM** | 2,400 tok/s | ~62 s | Widest model support (hundreds of architectures); Multi-LoRA; OpenAI-compatible API; Apache 2.0 | 8-13% lower throughput vs TRT-LLM at scale |
| **SGLang** | 2,460 tok/s | ~58 s | RadixAttention gives 29% throughput gain on prefix-sharing workloads (RAG, chatbots); structured output | Narrower model coverage; smaller community |
| **TensorRT-LLM** | 2,780 tok/s | 28 min compile | Best raw throughput (+13% at scale) | NVIDIA-only; long cold-start; single-model-per-build; complex ops |
| **Ollama** | Not benchmarked at scale | Fast | Developer laptops; easy | Not production-grade at multi-tenant scale |
| **llama.cpp server** | CPU-only viable | Fast | Air-gap CPU-only nodes; GGUF quantization | Single-threaded throughput ceiling |
| TGI | Maintenance mode | — | — | Excluded |

**Allocation by use case:**

- **vLLM** (primary): clinical assistant, business co-pilot, admin agent, dev agent — general
  multi-model serving, multi-LoRA support per tenant, OpenAI-compatible API endpoint.
- **SGLang** (secondary, opt-in): patient-facing chatbot, RAG document retrieval — workloads with
  large shared system-prompt prefixes where RadixAttention yields measurable gains.
- **TensorRT-LLM** (optional, NVIDIA-only infra): reserved for tenants who purchase dedicated GPU
  nodes and accept the compile-time overhead for maximum throughput on a single pinned model version.
  Not in the default deployment profile.
- **llama.cpp server** (CPU-only air-gap): for air-gapped deployments without GPU, serving quantized
  GGUF models (Q4_K_M or Q8_0). Acceptable only for lighter models (7B–13B) at reduced concurrency.

All self-hosted serving nodes expose an **OpenAI-compatible `/v1/chat/completions` and `/v1/embeddings`
endpoint.** The LLM gateway layer (D6) abstracts provider differences from application code.

**Multi-LoRA (tenant adapter isolation):**
vLLM's `--enable-lora` flag with `--max-loras N` supports concurrent LoRA adapter serving from a
single base model instance. Each tenant's fine-tuned adapter is loaded by adapter ID at request time.
Adapter IDs are scoped to tenant namespace and access-controlled via the gateway layer.

---

### D2: Open-Weight Model Families

**Decision: Qwen 3 (primary for multilingual + general); DeepSeek-R1-Distill variants (reasoning
tasks); Phi 4 (resource-constrained / edge); Granite 3 (clinical/enterprise fine-tuning base);
Gemma 3 (secondary multilingual).**

**License screen first:**

| Model family | License | SaaS distribution | Notes |
|---|---|---|---|
| Llama 3.x base | Meta Community License | Restricted (>700M MAU requires Meta approval) | Permitted for internal inference; SaaS distribution at scale needs Meta approval |
| Llama 3.3 70B Instruct | Meta Community License | Same caveat | Strong general-purpose; DeepSeek-R1-Distill-Llama-70B is MIT on top of this base |
| **Qwen 2.5 / Qwen 3** | **Apache 2.0** | **Yes** | Strong multilingual including Arabic, RTL; top MTEB scores |
| **DeepSeek-V3, R1** | **MIT** | **Yes (weights); check API ToS)** | DeepSeek-R1-Distill-Llama-70B is MIT |
| **Phi 4** | **MIT** | **Yes** | 14B, strong reasoning per parameter; CPU-feasible quantized |
| **Granite 3.x** | **Apache 2.0** | **Yes** | IBM; enterprise fine-tuning friendly; RAG-tuned variants |
| **Gemma 3** | **Gemma ToS (permissive for commercial)** | Yes, with attribution | Google; strong multilingual |
| Falcon | Apache 2.0 | Yes | Older; lower benchmark ceiling than Qwen 3 at equivalent size |
| Yi | Apache 2.0 | Yes | Older; superseded by Qwen 3 for multilingual |
| Med42 v2 70B | Meta Llama 2 derived | Non-commercial / research | 87.3% USMLE zero-shot with specialized prompting; cannot be distributed in SaaS without licensing |
| Meditron 70B | Llama 2 derived | Non-commercial | ~72% USMLE; same licensing constraint as Med42 |

**Clinical benchmark signal (2025–2026 peer-reviewed literature):**

- DeepSeek-R1 matched GPT-4o on clinical diagnosis and treatment recommendation tasks across 125 patient
  cases (Nature Medicine, 2025, PMC12353792). No statistically significant difference (P = 0.31 for
  diagnosis, P = 0.15 for treatment).
- DeepSeek-R1-70B and Qwen-3-32B ranked as leading open-source models for clinical note summarization
  on MIMIC-IV-Note (NCBI PMC12872987), alongside GPT-4o.
- Med42-v2 70B achieves 87.3% USMLE accuracy but carries a non-commercial license inherited from
  Llama 2 — cannot be the primary production model for SaaS distribution without a commercial
  agreement with M42.

**Model assignments by use case:**

| Use case | Primary model | Rationale |
|---|---|---|
| Clinical assistant (HealthStack) | Qwen 3 72B Instruct (Apache 2.0) | Redistributable; top clinical summarization; multilingual; fine-tunable |
| Patient chatbot | Qwen 3 32B or 14B | Smaller footprint; same multilingual/RTL support |
| Reasoning / differential diagnosis | DeepSeek-R1-Distill-Llama-70B (MIT) | MIT; reasoning-tuned; matched GPT-4o on clinical tasks |
| Document RAG / summarization | Granite 3.3 8B (Apache 2.0) | RAG-optimized IBM model; instruction-following; small footprint |
| Education + business co-pilot | Qwen 3 32B (Apache 2.0) | Multilingual; strong instruction following |
| Edge / CPU air-gap | Phi 4 14B Q4_K_M (MIT) | Best-in-class reasoning per parameter; fits 8GB VRAM quantized |
| Tenant fine-tuning base | Qwen 3 72B or Granite 3.3 8B | Apache 2.0 permits fine-tuned model redistribution |

**Multilingual / RTL requirement:**
Qwen 3 explicitly supports Arabic, Hebrew, and 29 other languages with strong RTL rendering. For
deployments in MENA or multilingual markets, Qwen 3 is the preferred base model.

**Clinical-specific fine-tunes (internal only, not SaaS-distributed):**
Med42-v2 70B (87.3% USMLE) and Meditron-70B (~72% USMLE) may be used in private on-prem deployments
for HealthStack tenants who accept the research-license constraint and run their own infrastructure.
These are never bundled in CuraOS SaaS artifacts.

---

### D3: Embedding Models

**Decision: Qwen3-Embedding-8B (primary, Apache 2.0); BGE-M3 (secondary, multilingual fallback);
domain-specific BioLORD or PubMedBERT for clinical vector stores.**

**Benchmark signal:**

| Model | MTEB score | License | Dimensions | Notes |
|---|---|---|---|---|
| **Qwen3-Embedding-8B** | **70.58** | Apache 2.0 | 4096 | Surpasses OpenAI (64.6), Google (68.3); multilingual; instruction-following |
| BGE-M3 | 63.0 | Apache 2.0 | 1024 | Hybrid dense+lexical retrieval; strong multilingual; smaller footprint |
| Qwen3-Embedding-0.6B | ~65 | Apache 2.0 | 1024 | Lightweight; acceptable for edge/CPU |
| nomic-embed-text v2 | ~67 | Apache 2.0 | 768 | Good general; smaller than Qwen3-8B |
| mxbai-embed-large | ~64 | Apache 2.0 | 1024 | Solid general-purpose |
| BioLORD-2023-M | Domain-tuned | Apache 2.0 | 768 | Medical/clinical domain; 10-15% gain on biomedical retrieval vs generalist |
| PubMedBERT (BERT base) | Domain-tuned | MIT | 768 | Clinical notes; low latency; small |
| Snowflake Arctic Embed | ~66 | Apache 2.0 | 1024 | Enterprise; strong on retrieval |
| Cohere embed-v3 | ~69 | Managed API | — | Best managed; no self-host |

**Assignment:**

- **General RAG** (documents, runbooks, admin knowledge base): Qwen3-Embedding-8B. Highest MTEB;
  Apache 2.0; self-hostable on the same vLLM inference node via the `/v1/embeddings` endpoint.
- **Multilingual / RTL corpus** (MENA deployments, multilingual patient-facing): BGE-M3. Explicit
  multi-lingual support with hybrid retrieval advantage.
- **Clinical vector store** (HealthStack encounter notes, FHIR document search): BioLORD-2023-M or
  PubMedBERT. Domain-specific embedding produces 10-15% precision gain on biomedical retrieval.
  Per-tenant clinical collections use this embedding model; general collections use Qwen3.
- **Edge / resource-constrained**: Qwen3-Embedding-0.6B. Fits CPU-only inference.

**Important:** All embedding models are versioned per collection. When a model is upgraded, existing
collections must be re-indexed. A migration job pattern (Kafka event-driven re-embedding) is defined
in the embedding versioning runbook.

---

### D4: Vector Database

**Decision: pgvector (primary, already on PG17) with pgvectorscale extension for >10M vector
collections; Qdrant (secondary, dedicated service) for high-throughput filtered search workloads
above 50M vectors.**

**Benchmark signal (2025–2026):**

| Dimension | pgvector 0.8 (HNSW) | Qdrant 1.12 | Milvus 2.5 |
|---|---|---|---|
| Scale sweet spot | <10M vectors | <100M vectors | >100M vectors, distributed |
| Recall @ 99% | Competitive with Qdrant at 1M scale (Supabase benchmark) | Excellent | Excellent |
| Filtered search | pgvectorscale needed for selective filters | ACORN algorithm (solved selective filter problem in 2025) | Strong |
| Concurrent load | Degrades under very high concurrency without pgvectorscale | Showed degradation under concurrent load in Reddit A/B (vs Milvus) | Best for large distributed |
| Ops overhead | Zero (already PG17) | Separate Kubernetes service | Large: Zookeeper/etcd + multiple components |
| License | Apache 2.0 (pgvector) | Apache 2.0 | Apache 2.0 |
| Multi-tenant isolation | RLS + HNSW index per schema | Collection per tenant or namespace | Collection per tenant |
| GDPR erasure | `DELETE` + `VACUUM`; vector removed from HNSW on next index rebuild (iterative scan available) | Point-level delete via API; immediate | Point-level delete |

**Allocation:**

- **pgvector (PG17) + pgvectorscale**: default for all tenants. Collections up to ~50M vectors per
  tenant stay in Postgres. Zero additional infrastructure for the majority of tenants.
- **Qdrant**: opt-in for HealthStack tenants with large clinical corpus (>50M embeddings) or who
  require sub-10ms P95 latency on filtered vector search. Deployed as a separate Kubernetes service
  in the tenant's namespace (on-prem) or as a dedicated pod group (SaaS).
- **Milvus**: not adopted. Operational complexity (Zookeeper, multiple components) not justified for
  current scale projections.

**Multi-tenant isolation in pgvector:**

Each tenant gets a dedicated PostgreSQL schema (per ADR-0101 schema-per-tenant). Vector tables live
inside the tenant schema. Row-Level Security policies enforce isolation at the database level.
RLS is applied with Transaction Pooling (never Statement Pooling — session variable leakage risk).
HNSW indexes are built per-schema.

**GDPR erasure procedure:**

1. Issue `DELETE FROM {tenant_schema}.embeddings WHERE source_document_id = $1`.
2. Run `VACUUM {tenant_schema}.embeddings` to reclaim storage.
3. For HNSW recall correctness, trigger an incremental re-index job (Kafka event `vector.erasure.completed`).
4. Emit a `gdpr.erasure.confirmed` audit event with document ID, tenant, timestamp, operator.
5. pgvector 0.8 iterative index scans ensure deleted vectors are not returned in ANN results before
   the index rebuild completes.

---

### D5: RAG / Agent Framework (Backend)

**Decision: Spring AI 1.1 (primary); LangGraph4j (secondary for complex stateful agent graphs).**

**Spring AI reached GA in May 2025 (1.0.0) and released 1.1.0 in November 2025** with MCP integration,
expanded provider support, and Advisor API for pre/post-processing chains. Spring AI 2.0 milestone
builds are already available as of early 2026.

**Comparison:**

| Framework | Runtime | License | Status | Notes |
|---|---|---|---|---|
| **Spring AI 1.1** | JVM (Spring Boot) | Apache 2.0 | GA, production-ready | Native Kotlin/Spring; VectorStore API; ChatClient; Advisor API; MCP client built-in |
| LangGraph4j | JVM | Apache 2.0 | Stable | Java port of LangGraph; graph-based stateful agent flows; StateGraph + persistence |
| LangChain4j | JVM | Apache 2.0 | Stable | Mature; lower-level; less opinionated than Spring AI |
| Haystack | Python | Apache 2.0 | Mature | Python-only; would introduce second primary runtime |
| LlamaIndex | Python | MIT | Mature | Python-only; same concern |
| DSPy | Python | MIT | Research-grade | Excellent for prompt programs; Python-only; separate orchestration service if used |

**Rationale for Spring AI 1.1:**

- Native Spring Boot integration: `@ChatClient`, `@VectorStore`, `Advisor` chain pattern, auto-wired
  model provider beans.
- Kotlin DSL is idiomatic; no language boundary in the critical path.
- VectorStore abstraction supports pgvector and Qdrant as pluggable backends — single application
  code, swappable at configuration time.
- Built-in MCP client support (1.1.0+): CuraOS agents can call external MCP tool servers without
  custom transport code.
- Evaluator API for prompt testing, compatible with Langfuse evaluation hooks.

**LangGraph4j usage (complex agents only):**

The Workflow co-pilot and multi-step clinical reasoning agent require stateful graph execution with:
branching, human-in-the-loop pause/resume, and rollback. LangGraph4j's `StateGraph` maps cleanly
onto Temporal sagas (ADR-0105): LangGraph4j handles the local graph state machine; Temporal handles
durable execution, retry, and long-running process lifecycle. This is a deliberate layering — do not
replace Temporal with LangGraph4j's built-in persistence.

**Python agent microservice (bounded):**

DSPy may be used in a dedicated Python microservice for prompt program optimization (few-shot example
selection, prompt auto-tuning) run offline or as a background job — not in the online request path.
This microservice exposes a simple REST/gRPC interface and is not part of the core serving path.

---

### D6: Managed LLM Gateway / Abstraction Layer

**Decision: LiteLLM Proxy (Apache 2.0) self-hosted as the AI gateway.**

**Comparison:**

| Option | License | Self-host | Multi-tenant | HIPAA notes |
|---|---|---|---|---|
| **LiteLLM Proxy** | Apache 2.0 | Yes | Virtual keys + Teams + Organizations | Enterprise: HIPAA/SOC2; OSS: self-document controls |
| OpenRouter | Managed | No | No | Sends data to managed service — excluded for PHI paths |
| Portkey | Managed / OSS | Partial | Yes | OSS version limited; primarily managed |
| Custom adapter in Spring AI | N/A | Yes | App-layer | High maintenance; duplicates LiteLLM functionality |

**LiteLLM Proxy provides:**

- Unified `v1/chat/completions` endpoint that routes to vLLM, SGLang, OpenAI, Anthropic, Bedrock,
  Azure OpenAI from a single configuration.
- Per-tenant **Virtual Keys** with spend limits, rate limits, and model access control.
- **PHI policy gate**: requests tagged `phi=true` (set by Presidio redaction layer, D12) are blocked
  from routing to any managed provider endpoint unless the tenant has a signed BAA on file and the
  tenant config flag `allow_phi_to_managed_llm = true`.
- Request/response logging to Langfuse (D8) via the `success_callback` hook.
- Load balancing across multiple vLLM replicas.
- Cost tracking per tenant, per model, per month — feeds billing pipeline.

**Self-hosted compliance notes:**

LiteLLM's enterprise offering carries HIPAA/SOC2 certifications. The self-hosted open-source version
requires the operator to document security controls independently. CuraOS's security documentation
will include the LiteLLM proxy deployment as a scoped component with: network isolation (internal
cluster only), mTLS for inter-service calls, audit log forwarding to OpenBao-backed immutable log
store, and no persistent plaintext storage of prompt content.

---

### D7: Tool Calling / Function Calling and MCP Strategy

**Decision: OpenAI function-call format (de-facto standard) for all agents; Model Context Protocol
(MCP) for external agent integration and cross-system tool exposure.**

**MCP adoption status (2026):**

MCP is now backed by the Linux Foundation (AAIF) with co-founders Anthropic, OpenAI, Block, and
support from Google, Microsoft, and AWS. As of March 2026, 97M monthly SDK downloads and 10,000+
public MCP servers. The 2026 MCP roadmap prioritizes enterprise readiness (audit trails, SSO auth,
horizontal scaling via Streamable HTTP).

**CuraOS MCP server strategy:**

CuraOS services are exposed as MCP servers so that external developer agents (Claude Code, Cursor,
Codex, Copilot Studio) can call CuraOS domain operations directly. Each neutral-core domain
(identity, tenancy, workflow, clinical, billing) exposes an MCP server with scoped tools:

```
curaos-identity-mcp:    get_tenant, list_roles, check_permission
curaos-workflow-mcp:    get_process_instance, advance_task, get_next_steps
curaos-clinical-mcp:    get_encounter_summary, search_similar_cases, draft_note
curaos-admin-mcp:       generate_site, configure_flow, list_modules
```

MCP servers run as lightweight Spring Boot sidecar services, or embedded in the primary service via
the Spring AI MCP server auto-configuration (1.1.0+). Per-tenant tool access is enforced by
Keycloak tokens validated at the MCP server boundary.

**CuraOS MCP client strategy:**

Internal agents (clinical assistant, workflow co-pilot, admin agent) use the Spring AI MCP client
to call external MCP tool servers — for example, a FHIR terminology MCP server, a drug-interaction
database MCP server, or a tenant-provisioned external EHR MCP server. Per-tenant configuration
controls which external MCP servers an agent may call.

**Function calling format:**

All LLM calls use OpenAI function-call JSON format, which vLLM, SGLang, and major managed providers
all support natively. Spring AI's `FunctionCallback` API handles registration and dispatch.

---

### D8: Prompt and Agent Observability

**Decision: Langfuse (MIT / Apache 2.0 self-hosted) as primary LLM observability platform.**

**Comparison:**

| Tool | License | Self-host | Compliance | Strengths |
|---|---|---|---|---|
| **Langfuse** | MIT (core) | Yes, Docker + ClickHouse | SOC 2 Type II, ISO 27001 (cloud); self-host: operator-documented | Prompt management; trace trees; eval API; ClickHouse for high-volume |
| Arize Phoenix | ELv2 (OSS) / Proprietary (AX) | Yes, limited feature parity | PCI DSS on AX cloud only | Deep agent evaluation; offline eval templates |
| Helicone | Apache 2.0 (OSS) | Yes | Operator-documented | Proxy-mode: zero SDK instrumentation; easiest setup |
| OpenLLMetry + OTEL | Apache 2.0 | Yes (via OTEL collector) | Operator-documented | Standard OTEL spans; integrates with existing Grafana stack (ADR-0107) |

**Decision rationale:**

Langfuse is chosen because: (a) full feature parity in self-hosted mode (Docker, ClickHouse backend);
(b) MIT license allows on-prem redistribution; (c) SOC 2 Type II and ISO 27001 on the cloud tier sets
a compliance baseline; (d) Prompt management, dataset versioning, and A/B eval are built-in;
(e) integrates with LiteLLM via `success_callback` — zero additional instrumentation in application code.

**OpenLLMetry supplement:**

For the spans that must flow into the existing OpenTelemetry collector (ADR-0107), OpenLLMetry is used
to emit standard OTEL spans from Spring AI `ChatClient` calls. These spans carry tenant ID, model ID,
and token counts — but no prompt content (PHI risk). Full prompt/response traces go only to Langfuse
(self-hosted, tenant-scoped).

**Multi-tenant trace isolation:**

Langfuse's dataset and trace APIs support `metadata.tenant_id` filtering. All trace submissions from
the LiteLLM gateway include `tenant_id` in the metadata. Langfuse projects are created per deployment
tier (one Langfuse project per CuraOS environment), and tenant filtering is enforced at the API layer.
For on-prem deployments, each tenant gets an isolated Langfuse instance or a dedicated Langfuse project
with API key scoped to their tenant namespace.

**PHI in traces:**

Prompt content logged to Langfuse passes through the PHI redaction layer (D12) first. Raw PHI is
never stored in Langfuse. The redacted prompt (with `[PHI_REDACTED]` tokens) is stored for debugging.
Original PHI-containing prompts are stored only in the HIPAA-audited prompt log store (encrypted,
OpenBao-managed keys, per-tenant).

---

### D9: Eval and Prompt Management

**Decision: Langfuse (integrated with D8) for production eval and prompt registry; Promptfoo (MIT)
for offline CI prompt regression testing.**

**Rationale:**

Langfuse's built-in Prompt Management UI supports:
- Versioned prompt templates with semantic versioning.
- A/B experiments: traffic split between prompt versions with evaluation metrics (BLEU, LLM-as-judge,
  custom rubrics).
- Dataset management: golden test cases per domain, replayable offline.

Promptfoo provides a CLI-native YAML-based prompt test runner suitable for CI gates:

```yaml
# promptfoo.yaml (example for clinical note drafting)
prompts:
  - draft-note-v1.txt
  - draft-note-v2.txt
providers:
  - id: vllm:qwen3-72b
    config:
      apiBaseUrl: http://vllm-service:8000/v1
tests:
  - vars:
      encounter_summary: "{{encounter}}"
    assert:
      - type: contains
        value: "disclaimer"
      - type: llm-rubric
        value: "Does not hallucinate medication names"
```

Promptfoo runs in CI (GitHub Actions / self-hosted runner) against the staging vLLM instance with
no PHI in test fixtures (synthetic data only).

**MLflow Tracing** is not adopted — overlaps with Langfuse and adds a second MLOps platform without
compensating benefit given the Spring AI + Langfuse integration already covers the use case.

---

### D10: Fine-Tuning / LoRA Training

**Decision: Axolotl (Apache 2.0) for multi-GPU production fine-tuning; Unsloth (Apache 2.0) for
single-GPU fast iteration.**

**Comparison:**

| Framework | License | Multi-GPU | Speed vs baseline | Clinical fine-tuning |
|---|---|---|---|---|
| **Axolotl** | Apache 2.0 | Yes | Moderate | Preferred for production multi-GPU LoRA runs |
| **Unsloth** | Apache 2.0 | No | 2-5x faster | Preferred for fast single-GPU iteration and prototyping |
| torchtune | BSD | Yes | Moderate | Lower-level; less ecosystem |
| LLaMA-Factory | Apache 2.0 | Yes | Moderate | Strong UI; good alternative if Axolotl proves complex |
| OpenPipe | Managed | N/A | — | Excluded: managed-only, PHI risk |

**Fine-tuning workflow:**

1. Tenant submits anonymized clinical corpus (PHI-stripped by Presidio, D12) to the fine-tuning
   pipeline via the tenant admin portal.
2. A Temporal workflow (ADR-0105) orchestrates: data validation → Axolotl training job (Kubernetes
   Job on GPU node) → LoRA adapter artifact stored in OpenBao-managed S3-compatible storage →
   adapter registered in the tenant's model registry → vLLM reloaded with new adapter ID.
3. LoRA adapters are namespaced by `tenant_id/model_id/adapter_version`. Cross-tenant access is
   impossible by construction (separate filesystem paths, Kubernetes RBAC).
4. GDPR: If a tenant exits, the Axolotl-produced adapter artifacts are deleted as part of the
   tenant offboarding Temporal workflow. Base model weights are shared and not deleted.
5. Axolotl in February 2025 added optimized LoRA/QLoRA kernels (SwiGLU, GEGLU Triton kernels)
   inspired by Unsloth, closing the single-GPU speed gap.

---

### D11: Inference Acceleration

**Decision: GPU-first (NVIDIA CUDA); AMD ROCm as tier-2 option; llama.cpp GGUF for CPU-only air-gap.**

**Quantization strategy:**

| Quantization | Use case | Quality trade-off |
|---|---|---|
| FP16 / BF16 | Full-precision serving (A100/H100 with enough VRAM) | No degradation |
| Q8_0 (GGUF) | CPU-only; near-lossless | < 1% quality loss on benchmarks |
| Q4_K_M (GGUF) | CPU-only edge / laptop | ~2-3% quality loss; 4x memory reduction |
| AWQ (vLLM native) | GPU; 4-bit with weight quantization | < 1% loss; 2x memory reduction; faster |
| GPTQ | GPU; post-training quantization | ~1% loss; slightly lower throughput than AWQ |

**vLLM handles AWQ and GPTQ natively.** For air-gap CPU-only deployments, llama.cpp server with
GGUF Q8_0 (preferred) or Q4_K_M (constrained memory) is the serving path.

**Speculative decoding:**

vLLM supports speculative decoding with a small draft model. For clinical chatbot workloads (largely
predictable phrasing, short responses), a Phi 4 Mini draft model with Qwen 3 72B verifier can yield
~1.5-2x throughput improvement with no quality regression. This is an opt-in optimization, enabled
per vLLM deployment configuration.

**Batching:**

vLLM's continuous batching is default-on. PagedAttention manages KV cache. No custom batching
implementation required.

---

### D12: PHI Redaction at Agent Boundary

**Decision: Microsoft Presidio (MIT) as the primary PHI redaction engine, deployed as a shared
service; enhanced with domain-specific NER (spaCy clinical model or John Snow Labs MedNLP for
high-sensitivity deployments).**

**Comparison:**

| Option | License | Accuracy (clinical PHI) | Notes |
|---|---|---|---|
| **Presidio** | MIT | Moderate out-of-box; improvable with custom recognizers | Open-source; extensible; Python service; misses contextual PHI without custom recognizers |
| John Snow Labs MedNLP | Commercial | High (purpose-built clinical NER) | More accurate on clinical text; paid license; recommended for high-stakes HealthStack tenants |
| AWS Comprehend Medical | Managed | High | Managed API; sends PHI to AWS — excluded for on-prem / air-gap |
| Regex + spaCy | MIT | Low standalone | Useful as a supplementary layer |

**Architecture:**

Presidio runs as a dedicated `phi-redactor-service` (Python FastAPI, MIT). It is in the **synchronous
request path** for all prompts routed to managed LLM providers. For self-hosted LLM calls that stay
within the perimeter, redaction is applied **only if** the tenant's PHI policy requires it (configurable).

Presidio limitations acknowledged:
- Rule-based and shallow ML pipelines can miss contextual PHI (e.g., "Dr. Lee" vs. a last name).
- No guarantee of 100% recall. Residual-risk disclaimer is part of the tenant BAA.
- Mitigation: custom recognizers for FHIR resource types (patient names, MRNs, SSNs, dates of birth,
  device IDs), augmented with a domain-specific NER pass for HealthStack tenants.

**PHI policy gate in LiteLLM:**

```
request metadata → phi_classifier middleware → set phi_risk_level (none/low/high)
                                             → if high AND provider == managed AND tenant.baa == false
                                             → block; return 403 with audit event
                                             → if high AND provider == managed AND tenant.baa == true
                                             → redact via Presidio; log redaction audit event; forward
                                             → if self-hosted vLLM
                                             → apply redaction if tenant.redact_on_prem == true
```

**Audit events** for every redaction decision (redacted, blocked, passed) are emitted to Kafka topic
`ai.phi.audit` and forwarded to the HIPAA audit log store.

---

### D13: Hybrid (Self-Hosted + Managed) Routing Policy

**Decision: Per-tenant routing configuration stored in Keycloak tenant attributes; enforced by
LiteLLM gateway routing rules; PHI gate is always-on regardless of route.**

**Routing tiers:**

| Tier | Config | LLM route | PHI handling |
|---|---|---|---|
| Air-gap on-prem | `llm_provider = self_hosted_only` | vLLM/llama.cpp only | PHI never leaves perimeter |
| Standard on-prem | `llm_provider = self_hosted_only` | vLLM only | PHI never leaves perimeter |
| SaaS (no BAA) | `llm_provider = self_hosted_preferred` | vLLM primary; managed as fallback for non-PHI | PHI blocked from managed; non-PHI may route to managed |
| SaaS (BAA signed) | `llm_provider = managed_permitted; baa = true` | vLLM or managed per model config | PHI redacted before managed; audit log required |
| SaaS premium (BAA + consent) | `llm_provider = managed_preferred; baa = true` | Managed primary (OpenAI/Anthropic/Bedrock) | Presidio redaction; audit log |

**Managed provider BAA status (2026):**

- **OpenAI API**: BAA available via `baa@openai.com`; API services only; ChatGPT web is never HIPAA-compliant.
- **Anthropic API (Claude)**: BAA available for Enterprise customers; Claude for Healthcare launched May 2025.
- **AWS Bedrock**: BAA covered under AWS Business Associate Agreement; HIPAA-eligible service.
- **Azure OpenAI**: BAA covered under Microsoft HIPAA BAA; HIPAA-eligible.

**Cost-aware routing:**

For SaaS tenants with managed LLM access, LiteLLM's cost-tracking model can route based on:
- Token budget remaining in billing period → fall back to self-hosted vLLM if budget exceeded.
- Latency SLA → prefer managed provider during vLLM capacity constraints.
- Model capability requirements → route reasoning tasks to DeepSeek R1 (self-hosted) or o3 (managed,
  BAA required).

---

### D14: Per-Tenant Isolation in Shared Vector Store

**Decision: Schema-per-tenant in pgvector (aligned with ADR-0101 data isolation); collection-per-tenant
in Qdrant (for high-volume HealthStack tenants); separate Qdrant cluster per enterprise on-prem tenant.**

**Isolation model comparison:**

| Approach | Isolation level | Ops cost | GDPR erasure |
|---|---|---|---|
| RLS rows in shared table | Logical | Low | DELETE + VACUUM; risk of misconfigured policy |
| Schema-per-tenant HNSW | Strong | Medium | DROP SCHEMA (full erasure); VACUUM per-table |
| Collection-per-tenant (Qdrant) | Strong | Medium | Collection delete API; clean |
| Separate cluster per tenant | Strongest | High | Cluster teardown |

**Decision:**

1. **pgvector, all tenants by default:** Each tenant's schema in PG17 contains its own embedding
   tables. HNSW index is built per tenant. RLS enforces cross-tenant read prevention with row-level
   policies as a defense-in-depth layer. Transaction Pooling only (no statement pooling). pgvectorscale
   is installed for tenants exceeding 10M vectors.

2. **Qdrant, HealthStack enterprise tenants:** Tenants with large clinical corpora (>50M embeddings)
   or sub-10ms P95 filter-search SLA get a dedicated Qdrant collection. Collection naming convention:
   `{tenant_id}_{domain}_{embedding_model_version}`.

3. **Separate Qdrant cluster, enterprise on-prem:** On-prem enterprise customers with their own
   hardware get a dedicated Qdrant deployment scoped to their Kubernetes namespace. No shared
   infrastructure with SaaS tenants.

**Embedding model versioning:**

Collections are versioned by embedding model: `{tenant_id}_{domain}_qwen3-8b_v1`. When an embedding
model is upgraded, a new parallel collection is built incrementally and swapped via LiteLLM routing
configuration — zero-downtime re-indexing. Old collection is retained for 30 days then deleted.

---

### D15: MCP Server Strategy (detailed)

**Decision: Spring AI MCP Server auto-configuration for all CuraOS domain services; MCP transport
via Streamable HTTP (SSE + POST); per-tenant MCP tool access controlled by Keycloak scopes.**

**CuraOS as MCP server (exposing tools to external agents):**

Each domain service can expose an MCP server endpoint at `/mcp`. Spring AI 1.1.0's MCP server
auto-configuration generates the tool manifest from `@Tool`-annotated methods. The manifest is
served at `/mcp/capabilities` and tools are invoked via `/mcp/invoke`.

**MCP gateway pattern:**

Rather than every service independently handling MCP auth and routing, a dedicated `curaos-mcp-gateway`
service aggregates tool registrations from domain services and exposes a single MCP endpoint to
external agents. This gateway:
- Validates OAuth2/OIDC tokens from Keycloak.
- Enforces per-tenant, per-tool access control from Keycloak resource scopes.
- Logs all tool invocations to the audit trail (Kafka topic `mcp.tool.audit`).
- Rate-limits per API key and tenant.

**CuraOS as MCP client (consuming external tools in agent flows):**

Spring AI's `McpClient` (1.1.0+) connects to external MCP servers configured per tenant:

```kotlin
// Spring AI McpClient configuration (per tenant, loaded from tenant config)
val mcpClient = McpClient.sync(transport)
    .toolCallTimeout(Duration.ofSeconds(10))
    .build()
val tools = mcpClient.listTools().tools
```

External MCP servers a tenant may configure: FHIR server MCP, drug database MCP, lab system MCP,
external EHR MCP. All external MCP tool calls are proxied through the PHI gate (D12) if the tool
return value may contain PHI.

**Auth (aligned with MCP 2026 roadmap):**

SEP-1932 (DPoP) and SEP-1933 (Workload Identity Federation) are tracked. Until these are finalized,
CuraOS MCP servers use Bearer tokens (JWT from Keycloak) validated on every tool invocation.

---

### D16: Agentic Frameworks for Autonomous Flows

**Decision: Spring AI ChatClient + Advisor API (simple RAG chains, single-turn agents); LangGraph4j
StateGraph (complex stateful multi-step agents); Temporal (durable long-running agent processes).
Do not adopt CrewAI, AutoGen, or SmolAgents in the production stack.**

**Framework comparison (2026):**

| Framework | Runtime | License | Production maturity | Notes |
|---|---|---|---|---|
| **Spring AI** | JVM | Apache 2.0 | GA (1.1) | Native Spring Boot; single-turn + RAG chains |
| **LangGraph4j** | JVM | Apache 2.0 | Stable | Stateful graph; human-in-the-loop; maps to Temporal |
| LangGraph (Python) | Python | MIT | Very mature | Gold standard; Python only |
| CrewAI | Python | MIT | Solid | Role-based; fast setup; Python only; limited stateful control |
| AutoGen | Python | MIT | Maintenance mode | Microsoft shifting to broader Agent Framework |
| SmolAgents | Python | Apache 2.0 | Research-grade | HuggingFace; small/fast; not production-tested at scale |
| PydanticAI | Python | MIT | Emerging | Strong typing; Python only |

**Layer assignment:**

1. **Spring AI ChatClient + Advisor**: all single-turn and simple RAG use cases (document search,
   encounter summarization, basic chatbot turn). Zero additional framework overhead.
2. **LangGraph4j StateGraph**: workflow co-pilot (multi-step BPM suggestion), clinical reasoning
   agent (differential generation → evidence retrieval → ranking), admin configuration agent
   (multi-step form filling). StateGraph nodes map to Temporal activity definitions.
3. **Temporal sagas (ADR-0105)**: durable execution container for all long-running agent processes.
   LangGraph4j executes within a Temporal activity; Temporal provides retry, visibility, and
   cross-service coordination. This is the integration contract — LangGraph4j is not a Temporal
   replacement.

**Autonomy boundary (clinical):**

Clinical agents are decision-support only. Every clinical agent response includes:
- Source citation (FHIR document ID, publication DOI, or encounter reference).
- Mandatory disclaimer: "This output is decision support only and does not constitute clinical advice.
  Verify with a licensed clinician before acting."
- Confidence signal where the model provides it.
- Human-in-the-loop step for any suggestion that would modify a clinical record.

---

### D17: Clinical-Specific Models and Fine-Tunes

**Decision: Use Apache 2.0 / MIT base models (Qwen 3, DeepSeek-R1-Distill) with HealthStack-specific
LoRA fine-tuning as the production path. Med42-v2 and Meditron are permitted only for private on-prem
tenants who accept the research license.**

**Clinical model benchmark summary (2025–2026):**

| Model | USMLE accuracy | License | SaaS distributable | Notes |
|---|---|---|---|---|
| Med42-v2 70B | 87.3% (max, specialized prompting) | Llama 2 derived | No | Best-in-class clinical; non-commercial restriction |
| DeepSeek-R1-70B | ~72-73% (anesthesiology exam) | MIT | Yes | Matches GPT-4o on clinical decision tasks |
| Qwen-3-32B | Leading MIMIC-IV summarization | Apache 2.0 | Yes | Top open-source for clinical note summarization |
| Meditron-70B | ~72% USMLE | Llama 2 derived | No | Med42 predecessor; same license concern |
| GPT-4o | Clinical benchmark baseline | Proprietary | Managed API + BAA | Reference comparison |

**Production path:**

1. Start with Qwen 3 72B Instruct (zero-shot) as the clinical assistant base.
2. Create a HealthStack clinical LoRA adapter: fine-tune on FHIR-structured synthetic clinical
   notes, ICD-10 coding examples, clinical guideline excerpts (copyright-clear sources).
3. Evaluate LoRA adapter using Promptfoo (D9) against a clinical golden dataset (MIMIC-IV synthetic
   or institutional retrospective with IRB approval and full de-identification).
4. For on-prem HealthStack tenants who want maximum clinical accuracy and accept the Llama 2 research
   license: optionally deploy Med42-v2 70B as an alternative model selection in the tenant config.
5. MedQA / USMLE benchmark must be run on every fine-tuned adapter release to detect regression.

**FHIR-aware context injection:**

The clinical assistant agent retrieves structured FHIR resources (Patient, Encounter, Condition,
Medication, DiagnosticReport) from the FHIR server via the `curaos-clinical-mcp` tool server and
formats them into a structured prompt context block before the LLM call. This is RAG over structured
FHIR data, not free-text retrieval.

---

### D18: Disclaimer and Safety Framework

**Decision: Mandatory disclaimer injection at agent boundary; hallucination detection via citation
requirement + LLM-as-judge; content filtering via LlamaGuard 3 (Meta, Llama 3 license) or
ShieldGemma (Google, Gemma license).**

**Disclaimer injection:**

All clinical, patient-facing, and triage agent responses have a disclaimer appended by the Advisor
layer (Spring AI Advisor API) — not by the LLM. The LLM cannot be instructed to remove the disclaimer:

```
[CuraOS Clinical Decision Support — For informational purposes only. This output does not 
constitute medical advice. Always consult a qualified healthcare professional before making 
clinical decisions.]
```

Patient-facing chatbot additionally includes: "If you are experiencing a medical emergency, call
emergency services immediately."

**Hallucination detection:**

- **Citation requirement**: clinical agent prompts instruct the model to cite sources for every claim.
  An Advisor post-processor checks that the response contains at least one citation token. Responses
  without citations are flagged and optionally rejected.
- **LLM-as-judge**: Langfuse evaluations run a judge model (smaller, faster) against a rubric:
  "Does this response make claims not supported by the provided context?" Flagged responses are
  quarantined for human review.
- **Confidence threshold**: if the model supports it (DeepSeek-R1 returns reasoning traces; logprobs
  available from vLLM), responses with high token uncertainty trigger a human-review flag rather than
  direct display.

**Content filtering:**

- **LlamaGuard 3** (Meta, Llama 3 Community License): classifies inputs and outputs against harm
  categories (medical misinformation, self-harm encouragement). Runs as a fast inference sidecar
  (~8B parameters; ~10ms overhead).
- **ShieldGemma** (Google): alternative for deployments where the Gemma commercial license is preferred.

Content filter is in the **synchronous path** for patient-facing chatbot. For internal clinical
assistant (authenticated clinician user), it runs async and flags rather than blocks (to avoid
adding latency to clinical workflows).

**Autonomy boundary policy (enforced, not aspirational):**

| Action | Permitted | Requires human confirmation |
|---|---|---|
| Summarize encounter notes | Yes | No |
| Draft a clinical note for review | Yes | Yes (clinician reviews before saving) |
| Suggest differential diagnosis list | Yes (decision support) | Yes (clinician confirms) |
| Automatically write to patient record | No | Blocked |
| Order a lab or medication | No | Blocked |
| Triage symptom severity → escalation recommendation | Yes | Yes (human confirms escalation) |

---

## Consequences

### Positive

- **Spring AI 1.1 + LangGraph4j + Temporal**: all JVM, all Apache 2.0, native Spring Boot integration.
  No second primary runtime in the online path. Kotlin developers can contribute to agent logic without
  learning Python.
- **vLLM + LiteLLM**: OpenAI-compatible API surface everywhere. Spring AI's model provider abstraction
  switches between self-hosted vLLM and managed OpenAI/Anthropic/Bedrock via a single configuration
  property. No application code changes when routing changes.
- **Qwen 3 (Apache 2.0) + DeepSeek-R1-Distill (MIT)**: fully redistributable base models for SaaS.
  Clinical benchmark performance matches GPT-4o on key tasks. Multilingual and RTL support included.
- **pgvector primary**: zero additional infrastructure for the majority of tenants. Tenant isolation
  via schema-per-tenant aligns with ADR-0101. GDPR erasure via SQL DELETE + VACUUM is fully auditable.
- **LiteLLM PHI gate**: PHI policy enforcement is centralized in the gateway, not scattered across
  91 services. A single configuration change can update the PHI routing policy for all tenants.
- **Langfuse self-hosted**: MIT license, full feature parity in self-hosted mode, ClickHouse backend
  for high-volume trace storage. SOC 2 / ISO 27001 on cloud tier sets compliance baseline.
- **MCP as first-class citizen**: CuraOS services are MCP servers out of the box. External developer
  agents (Claude Code, Cursor, Copilot Studio) can call CuraOS domain operations without custom
  integrations. Spring AI 1.1 MCP client handles external tool consumption.
- **Mandatory disclaimer + citation enforcement via Advisor**: safety constraints are code, not
  prompt instructions. An adversarial prompt cannot remove the disclaimer because it is appended
  after the LLM call by the Advisor post-processor.

### Negative / Risks

- **GPU infra cost for self-hosted.** Running Qwen 3 72B at production concurrency requires H100 or
  A100 GPUs. For small on-prem tenants, Phi 4 14B quantized may be the only feasible option, with
  corresponding quality trade-offs. Mitigation: tiered model selection per deployment size.
- **vLLM multi-tenant isolation is logical, not physical.** Multiple tenants share GPU compute on
  a single vLLM instance. Isolation is at the API key + LoRA adapter level, not GPU-level. For
  regulated tenants requiring physical compute isolation, a dedicated vLLM replica per tenant is
  required (higher infra cost).
- **GDPR erasure in fine-tuned models is unsolvable cleanly.** When a tenant's data contributed to
  a LoRA adapter, deleting that adapter removes the fine-tuning artifact but does not guarantee
  the base model has not memorized training examples. Full retraining on erasure is infeasible at
  scale. Mitigation: document this residual risk in the tenant DPA (Data Processing Agreement);
  require tenant data to be de-identified before contributing to fine-tuning; retain audit records
  of what data was used in each training run.
- **Presidio recall is not 100%.** For managed LLM calls carrying potential PHI, residual-risk
  disclosure must be in the tenant BAA. High-sensitivity HealthStack tenants should use John Snow
  Labs MedNLP or similar medical NER with higher clinical PHI recall.
- **Spring AI 2.0 migration.** The 2.0 milestone is already building as of early 2026. Breaking
  changes are expected. Mitigation: pin to Spring AI 1.1.x for the initial production release and
  schedule migration to 2.0.x for the next major platform version.
- **LangGraph4j community vs Python LangGraph.** LangGraph4j is the Java port; community size is
  smaller than the Python original. Bug fixes may lag. Mitigation: design the StateGraph layer as
  a thin orchestration shim over Temporal activities — if LangGraph4j is abandoned, the Temporal
  activities survive unchanged.
- **Med42-v2 license constraint.** The highest-accuracy clinical model (87.3% USMLE) cannot be
  distributed in CuraOS SaaS without a commercial agreement with M42. The Qwen 3 + clinical LoRA
  path must be validated to reach acceptable accuracy before GA of HealthStack. Set accuracy
  acceptance threshold at >80% USMLE in zero-shot evaluation.
- **MCP spec still stabilizing.** SEP-1932 (DPoP auth) and SEP-1933 (workload identity) are in
  review but not finalized. CuraOS MCP servers will use Bearer/JWT until these land, then migrate.
  Track AAIF working group releases.

---

## Alternatives Considered and Rejected

### LLM Serving

- **TGI (HuggingFace Text Generation Inference):** Placed in maintenance mode December 2025.
  Rejected.
- **Ollama:** Excellent for developer laptops and single-model single-tenant. Not production-grade
  for multi-tenant shared inference at scale. Not rejected for dev tooling — only for production.
- **LM Studio:** Commercial desktop application. Not a server runtime. Rejected.

### Vector Database

- **Milvus:** Operational complexity (Zookeeper, multiple separate components) not justified given
  current scale projections. Rejected without prejudice — re-evaluate if any tenant reaches >500M
  vectors.
- **Chroma:** Good for prototyping; no production-grade multi-tenant support. Rejected.
- **LanceDB:** Embedded; no server mode suitable for multi-service access. Rejected.
- **Weaviate:** BSD license; production-viable; rejected because pgvector covers the use case at
  current scale and Qdrant covers the high-throughput case with a simpler operational profile.
- **Marqo:** Managed-oriented; limited self-host path. Rejected.
- **Vespa.ai:** Powerful for hybrid search at scale; operational complexity comparable to Milvus.
  Rejected at current scale.

### Framework

- **LangChain4j:** Mature JVM framework; lower-level than Spring AI; requires more boilerplate for
  Spring Boot integration. Spring AI 1.1 supersedes it for new Spring Boot projects. Rejected as
  primary; may be used indirectly via Spring AI internals.
- **Haystack / LlamaIndex / DSPy:** Python-only. Introduce a second primary runtime in the online
  path. Rejected as framework choices. DSPy retained as an offline prompt optimization tool.

### Observability

- **Helicone:** Excellent as a drop-in proxy; weaker self-hosted story vs Langfuse; less feature
  parity for prompt management. Rejected as primary; acceptable as a fallback if Langfuse
  deployment proves complex in a specific on-prem environment.
- **Arize Phoenix:** Better for offline eval workflows; limited self-hosted feature parity vs
  Arize AX cloud; ELv2 license. Rejected as primary.
- **MLflow Tracing:** Overlap with Langfuse; requires additional MLOps platform adoption. Rejected.

### Agentic Frameworks

- **CrewAI:** Python-only; role-based abstraction is appealing but JVM portability is required.
  Rejected.
- **AutoGen:** Microsoft shifted to maintenance mode. Rejected.
- **SmolAgents:** Research-grade; not production-tested at scale. Rejected.
- **PydanticAI:** Python-only; strong typing but same runtime boundary problem. Rejected.

### PHI Redaction

- **AWS Comprehend Medical:** Managed API; sends PHI to AWS. Excluded for on-prem and air-gap.
  Acceptable only as an optional augmentation for SaaS tenants with AWS BAA.
- **Custom regex only:** Insufficient recall for clinical PHI. Rejected as sole mechanism.

---

## Integration Map

This ADR integrates with every other foundational ADR:

| ADR | Integration point |
|---|---|
| ADR-0100 (Backend Runtime) | Spring AI 1.1 is native Spring Boot / Kotlin. All AI integration code in Kotlin. |
| ADR-0101 (Data Layer) | pgvector on PG17; schema-per-tenant for embedding isolation; RLS for defense-in-depth. |
| ADR-0102 (Event Messaging) | Kafka topics: `ai.phi.audit`, `vector.erasure.completed`, `gdpr.erasure.confirmed`, `mcp.tool.audit`, `ai.agent.trace`. |
| ADR-0103 (API Surface) | Cosmo GraphQL: AI agent capabilities exposed via federated subgraph `ai-subgraph`. MCP gateway as separate non-GraphQL endpoint. |
| ADR-0104 (Identity) | Keycloak: tenant config attributes for LLM routing policy, BAA flag, PHI consent; MCP tool access resource scopes. |
| ADR-0105 (Workflow/BPM) | Temporal sagas wrap LangGraph4j StateGraph; fine-tuning pipeline as Temporal workflow; agent long-running processes as Temporal workflows. |
| ADR-0107 (Observability) | OpenLLMetry emits OTEL spans (no PHI) to existing collector; Langfuse receives full traces (redacted PHI). |
| ADR-0108 (Security/Secrets) | OpenBao: encryption keys for PHI-containing prompt logs; LoRA adapter artifact signing; tenant-scoped API keys for LiteLLM virtual keys. |
| ADR-0109 (Containers) | vLLM and SGLang on GPU node pools; phi-redactor-service sidecar; Qdrant as Kubernetes StatefulSet; LiteLLM as Kubernetes Deployment. |

---

## New Kafka Topics Introduced

| Topic | Producer | Consumer | Retention | Notes |
|---|---|---|---|---|
| `ai.phi.audit` | phi-redactor-service | HIPAA audit log service | 7 years | Every PHI gate decision |
| `vector.erasure.completed` | vector store service | HNSW index rebuild job | 30 days | Triggers re-index after DELETE |
| `gdpr.erasure.confirmed` | data-rights service | Audit, compliance reporting | 7 years | Final erasure confirmation |
| `mcp.tool.audit` | curaos-mcp-gateway | Audit log service | 7 years | Every MCP tool invocation |
| `ai.agent.trace` | Spring AI agents | Langfuse ingest adapter | 90 days | Agent step traces (redacted) |
| `ai.finetuning.job` | tenant admin service | Fine-tuning Temporal worker | 30 days | Fine-tuning job trigger events |

---

## New Services Introduced

| Service | Tech | Role |
|---|---|---|
| `vllm-service` | vLLM, Python | Primary LLM inference; OpenAI-compatible API |
| `sglang-service` | SGLang, Python | Secondary LLM inference; RAG/prefix-heavy workloads |
| `llm-gateway` | LiteLLM Proxy | Routing, PHI gate, cost tracking, multi-tenant virtual keys |
| `phi-redactor-service` | Presidio, FastAPI | PHI detection and redaction; synchronous gate |
| `embedding-service` | vLLM `/v1/embeddings` | Embedding generation; co-located with vLLM |
| `vector-store-service` | Spring Boot + pgvector/Qdrant | Vector CRUD, tenant isolation, erasure API |
| `ai-agent-service` | Spring Boot + Spring AI + LangGraph4j | Agent orchestration; RAG chains; tool dispatch |
| `curaos-mcp-gateway` | Spring Boot | MCP tool aggregator, auth, rate limiting |
| `langfuse` | Langfuse self-hosted | LLM observability, prompt management, eval |
| `finetuning-worker` | Axolotl + Temporal worker | LoRA training jobs; adapter lifecycle |

---

## Compliance Checklist

| Requirement | Mechanism | Status |
|---|---|---|
| HIPAA: PHI audit trail | `ai.phi.audit` Kafka topic → immutable log store (OpenBao-encrypted) | Designed |
| HIPAA: BAA gating | Keycloak tenant attribute `baa_signed`; LiteLLM routing rule | Designed |
| HIPAA: PHI encryption at rest | OpenBao-managed keys; prompt logs encrypted before storage | Designed |
| GDPR Art. 17 (erasure) | Vector DELETE + VACUUM + `gdpr.erasure.confirmed` audit; LoRA adapter deletion in offboarding workflow | Designed |
| GDPR Art. 17 (model memorization) | Documented residual risk in DPA; de-identification required before fine-tuning input | Documented |
| GDPR: data minimization | Prompt logs stored in redacted form; raw PHI logs retained only for audit duration then purged | Designed |
| Multi-tenant isolation | Schema-per-tenant pgvector; collection-per-tenant Qdrant; namespace-per-tenant LoRA adapters; Keycloak-enforced MCP tool scopes | Designed |
| Clinical disclaimer | Spring AI Advisor post-processor appends disclaimer; cannot be bypassed by LLM | Designed |
| Hallucination mitigation | Citation requirement; LLM-as-judge eval; human confirmation for record writes | Designed |
| License compliance | Apache 2.0 / MIT models only for SaaS distribution; Llama-derived clinical models on-prem only | Designed |

---

## Decision Summary Table

| Sub-decision | Choice | License | Rationale |
|---|---|---|---|
| LLM serving (primary) | vLLM | Apache 2.0 | Widest model support; Multi-LoRA; OpenAI API |
| LLM serving (secondary) | SGLang | Apache 2.0 | RadixAttention for RAG/prefix workloads |
| LLM serving (CPU/air-gap) | llama.cpp server | MIT | GGUF quantization; zero GPU requirement |
| General LLM (SaaS base) | Qwen 3 72B Instruct | Apache 2.0 | Redistributable; multilingual; top clinical summarization |
| Reasoning LLM | DeepSeek-R1-Distill-Llama-70B | MIT | Matches GPT-4o on clinical tasks; redistributable |
| Edge LLM | Phi 4 14B | MIT | Best reasoning/parameter ratio; CPU-feasible quantized |
| Fine-tuning base | Qwen 3 72B / Granite 3.3 8B | Apache 2.0 | Redistribution-friendly; fine-tune artifacts distributable |
| Embedding (primary) | Qwen3-Embedding-8B | Apache 2.0 | MTEB 70.58; multilingual; self-hostable |
| Embedding (multilingual) | BGE-M3 | Apache 2.0 | Hybrid dense+lexical; 100+ languages |
| Embedding (clinical) | BioLORD-2023-M | Apache 2.0 | 10-15% domain gain on biomedical retrieval |
| Vector DB (primary) | pgvector (PG17) | Apache 2.0 | Already in stack; schema-per-tenant isolation |
| Vector DB (high-scale) | Qdrant | Apache 2.0 | >50M vectors; ACORN filtered search; clean erasure API |
| RAG / agent framework | Spring AI 1.1 | Apache 2.0 | Native Spring Boot; GA; MCP client built-in |
| Complex stateful agents | LangGraph4j | Apache 2.0 | Graph-based; human-in-loop; maps onto Temporal |
| LLM gateway | LiteLLM Proxy | Apache 2.0 | Unified routing; PHI gate; multi-tenant virtual keys |
| Tool calling | OpenAI function format + MCP | Open spec | De-facto standard; Spring AI FunctionCallback |
| LLM observability | Langfuse (self-hosted) | MIT | Full self-hosted parity; SOC2/ISO27001; ClickHouse |
| Prompt eval (CI) | Promptfoo | MIT | YAML-native; CLI; CI-friendly |
| Fine-tuning (multi-GPU) | Axolotl | Apache 2.0 | Multi-GPU LoRA; production-grade |
| Fine-tuning (iteration) | Unsloth | Apache 2.0 | 2-5x faster single-GPU; prototyping |
| Quantization (GPU) | AWQ (vLLM native) | Apache 2.0 | Near-lossless; 2x memory reduction |
| Quantization (CPU) | GGUF Q8_0 / Q4_K_M | MIT | llama.cpp; air-gap compatible |
| PHI redaction | Presidio | MIT | Open-source; extensible; in critical path |
| PHI redaction (clinical high-sens.) | John Snow Labs MedNLP | Commercial | Higher clinical NER recall; on-prem enterprise |
| Safety / content filter | LlamaGuard 3 | Llama 3 license | Input/output harm classification |
| Disclaimer injection | Spring AI Advisor post-processor | N/A | Code-enforced; LLM cannot bypass |
| Clinical fine-tunes (SaaS) | Custom LoRA on Qwen 3 | Apache 2.0 | Redistributable; validated against USMLE |
| Clinical fine-tunes (on-prem) | Med42-v2 70B (optional) | Llama 2 research | 87.3% USMLE; on-prem only; tenant-accepted license |

---

## Open Questions (require follow-up decisions)

1. **Clinical LoRA accuracy gate.** Acceptance threshold set at >80% USMLE zero-shot. Measurement
   methodology (dataset, evaluation harness) must be defined before HealthStack GA. Owner: HealthStack
   team + AI Platform team.
2. **MCP SEP-1932 / SEP-1933 migration timeline.** Track AAIF working group. No hard deadline yet.
   Owner: API Platform team.
3. **Spring AI 2.0 migration plan.** 2.0 milestone builds exist; breaking changes expected. Schedule
   migration assessment for Q3 2026. Owner: Backend Platform team.
4. **John Snow Labs MedNLP commercial license cost.** Must be evaluated before HealthStack GA for
   enterprise on-prem tier pricing. Owner: Procurement + Legal.
5. **Speculative decoding activation.** Phi 4 Mini as draft model for Qwen 3 72B verifier — validate
   1.5-2x throughput claim on production-representative clinical workloads before enabling. Owner:
   Infra team.
6. **IRB / de-identification process for tenant fine-tuning corpus.** HealthStack tenants who submit
   clinical data for LoRA fine-tuning must follow a documented de-identification protocol. Legal and
   compliance sign-off required before the fine-tuning pipeline accepts HealthStack data. Owner:
   Legal + Clinical Informatics.

---

*ADR-0114 — AI / Agent Integration Stack — CuraOS — 2026-05-24*
