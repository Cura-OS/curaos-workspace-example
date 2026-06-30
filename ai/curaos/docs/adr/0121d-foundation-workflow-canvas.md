# ADR-0121d — CuraOS Workflow Canvas (Standalone + Embedded Product)

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099](0099-charter-priorities-vision.md), [ADR-0100](0100-foundation-platform-runtime.md), [ADR-0121 Builder Suite](0121-foundation-builder.md), [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md), [ADR-0114 AI/Agent](0114-ai-agent-integration.md), [ADR-0150 Baseline](0150-baseline-alignment-rules.md)

---

## 1. Context

**CuraOS Workflow Canvas** = both an **embedded library** (used inside Builder IDE + Workflow Manager + tenant Apps) AND a **standalone sellable product** (CuraOS Canvas: visual editor for workflows + diagrams + state machines + AI agent flows + decision tables — Lucidchart / Miro / draw.io class).

Max-scope per user direction: visual editor unifying Flow/DAG + State Machines + Forms + Decision Tables + Event Interceptors + Sequence/Architecture diagrams + Mind maps + AI agent flow editor.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **Distribution** | Dual — embedded library (`@curaos/canvas` npm) + standalone product (CuraOS Canvas SaaS / on-prem / air-gap) |
| **Paradigms (8)** | Flow/DAG (Reactflow/@xyflow/react) + State Machines (XState v5) + Forms (Formily sub-canvas) + Decision Tables (custom + emit Cerbos YAML) + Event-bus Interceptor flows + Sequence/Architecture diagrams (Mermaid/PlantUML render + edit) + Mind maps + AI agent flow editor (LangGraph.js visual UI) |
| **Collaboration modes (per flow choice)** | Real-time multi-author (Yjs + Hocuspocus per ADR-0121) + Human+AI collab (agents propose via MCP per ADR-0114) + Git-backed single-author w/ PR review |
| **Output / emit targets** | CuraOS IR (JSON canonical) → Codegen recipes (ADR-0123) emit: Temporal TS workflow + Activepieces flow + cron job + XState state machine + Cerbos YAML decision + NestJS interceptor + LangGraph agent + BPMN 2.0 XML (interop) + Mermaid/PlantUML diagram + PNG/SVG/PDF static export |
| **Canvas core library** | @xyflow/react (MIT) — base node-based editor |
| **State machine layer** | XState v5 (MIT) + @xstate/inspect |
| **Forms sub-canvas** | Formily (MIT) per ADR-0121e |
| **AI agent flow layer** | Custom CuraOS nodes wrapping LangGraph.js (MIT) primitives |
| **Diagram render** | Mermaid (MIT) + PlantUML (GPL — output only via plantuml-server) + ELK.js (EPL — layout) |
| **Real-time collab** | Yjs + Hocuspocus v4 (both MIT) per ADR-0121 |
| **AI collab** | MCP server exposing canvas state + edit ops to external agents per ADR-0114 + ADR-0123 |
| **Multi-tenant isolation** | Per-tenant project + per-tenant flow library + per-tenant component overlay |
| **Custom node SDK** | TypeScript SDK for tenants to author custom canvas nodes (per ADR-0123 plugin model) |
| **Plugin runtime for custom node logic** | WASM Component (sandboxed; per ADR-0123) + NestJS sidecar (heavy) + isolated-vm (simple JS rules) |
| **Versioning** | Semver per flow + git-backed history + replay-able snapshots |

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  CuraOS Canvas UI (React+Next; embeddable or standalone)           │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ @xyflow/react base canvas + CuraOS custom node library:       │ │
│  │   - Flow/DAG nodes (action, decision, parallel, merge, etc.)  │ │
│  │   - State machine nodes (XState wrapper)                      │ │
│  │   - Form sub-canvas nodes (Formily picker)                    │ │
│  │   - Decision table nodes (emit Cerbos YAML)                   │ │
│  │   - Event interceptor nodes (event-bus visualizer)            │ │
│  │   - Diagram nodes (Mermaid/PlantUML inline render)            │ │
│  │   - Mind map nodes                                            │ │
│  │   - AI agent flow nodes (LangGraph.js wrapper)                │ │
│  │ + Property panels (right side; per-node config)               │ │
│  │ + Component palette (left side; drag-drop)                    │ │
│  │ + Compile target picker (top toolbar)                         │ │
│  │ + AI fill / suggest (Vercel AI SDK + LiteLLM)                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Collaboration layer:                                              │
│  - Yjs CRDT + Hocuspocus WS (real-time multi-author)              │
│  - MCP server (AI agents read/edit canvas state)                  │
│  - Git backend (single-author + PR review mode)                   │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             │ Save → CuraOS IR (JSON)
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│  Canvas IR Store (NestJS + Payload CMS)                            │
│  - Per-tenant flow library                                         │
│  - Version history + snapshots + replay                            │
│  - Marketplace + tags + search (OpenSearch)                        │
│  - Audit per edit (hash-chain per ADR-0104)                        │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             │ Compile (Codegen ADR-0123)
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│  Emit targets (Codegen recipes):                                   │
│  - workflow.temporal-ts → Temporal TS SDK workflow                │
│  - workflow.activepieces-flow → Activepieces flow JSON            │
│  - workflow.cron → NestJS @nestjs/schedule job                    │
│  - state-machine.xstate → XState v5 machine definition            │
│  - decision.cerbos → Cerbos YAML policy                           │
│  - interceptor.nestjs → @curaos/event-interceptors module         │
│  - agent.langgraph → LangGraph.js agent graph (per ADR-0114)      │
│  - bpmn.xml → BPMN 2.0 XML (interop with legacy tools)            │
│  - diagram.mermaid → Mermaid source                               │
│  - diagram.plantuml → PlantUML source                             │
│  - export.png / .svg / .pdf → Static image / vector / PDF         │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Standalone product (CuraOS Canvas SaaS / on-prem)

Beyond embedded library use, CuraOS Canvas is a sellable standalone product competing with:

- **Lucidchart / Miro / Mural** (general diagramming + collaboration)
- **draw.io / diagrams.net** (open-source diagramming)
- **Whimsical** (flowcharts + mind maps + wireframes)
- **n8n / Activepieces UI** (workflow editor)
- **Zapier visual editor** (automation flow)
- **LangFlow / Flowise** (AI agent flow editor)

CuraOS differentiator: unified canvas for ALL these paradigms + Codegen IR-driven emit + per-tenant marketplace + on-prem/air-gap support + HealthStack-aware nodes.

### Pricing tiers

| Tier | Includes | Pricing |
|---|---|---|
| **Free** | 3 canvases, all paradigms, no marketplace publish | Free w/ CuraOS branding |
| **Pro** | Unlimited canvases, marketplace publish (community), real-time collab (up to 5 collaborators per canvas) | Per-seat |
| **Team** | Unlimited collaborators, AI fill, Git-backed VCS, custom node SDK | Per-tenant flat |
| **Enterprise** | Above + air-gap, certified marketplace tier, dedicated infra, custom emit targets | Custom contract |

---

## 5. Per-paradigm detail

### 5.1 Flow / DAG

- Base: @xyflow/react
- Nodes: Action, Decision, Parallel split, Parallel join, Loop, Subprocess, Wait, Timer, Signal, Error, Compensate, End
- Edge types: sequence, conditional, timer-based, signal-based
- Emit: Temporal TS / Activepieces / cron

### 5.2 State machines

- XState v5 + Stately Studio-class authoring
- Nodes: state, parallel state, history state, final state, transient state
- Guards + actions + invocations
- Emit: XState v5 machine definition

### 5.3 Forms sub-canvas

- Formily picker embedded as node inspector
- JSON Schema-driven; sub-canvas opens Formily editor
- Emit: Formily schema + React/Lit form runtime via ADR-0121e

### 5.4 Decision tables

- Custom CuraOS table component
- Rows = conditions; columns = actions
- Emit: Cerbos YAML policy (per ADR-0120)

### 5.5 Event interceptor flows

- Visualize event bus topology (Kafka topics, NATS subjects)
- Drop interceptor nodes on event paths
- Configure transform / veto / audit / retry per interceptor
- Emit: @curaos/event-interceptors NestJS module (per ADR-0123)

### 5.6 Sequence + architecture diagrams

- Mermaid + PlantUML inline render
- Can switch between flow and diagram views of same underlying IR (where possible)
- Static export (PNG / SVG / PDF) via puppeteer + Gotenberg (per ADR-0113)

### 5.7 Mind maps

- Tree-style layout (ELK.js layout engine)
- Nodes: idea, sub-idea, link to flow/state-machine/form
- Emit: Markdown outline / OPML / static image

### 5.8 AI agent flow editor

- LangGraph.js (MIT) primitives wrapped as custom nodes
- Nodes: prompt, tool, conditional router, sub-agent, memory, output
- Visual prompt composer + tool composition
- Tied to ADR-0114 vLLM/SGLang + LiteLLM gateway
- Per ADR-0099 §14 AI-agent-swarm dev model
- Emit: LangGraph.js agent graph + MCP server manifest

---

## 6. Collaboration modes (per-flow publisher choice)

### 6.1 Real-time multi-author (Yjs + Hocuspocus)

- Multiple users edit same canvas live
- Presence indicators (cursor + selection per user)
- CRDT-merged edits; no last-write-wins
- Per-tenant Hocuspocus namespace

### 6.2 Human+AI collab

- MCP server (per ADR-0114 + ADR-0123) exposes canvas state + edit operations
- External agents (Claude, Codex, Cursor) can read canvas + propose edits
- "Suggested edits" appear inline; human approves/rejects
- Audit per AI-proposed edit

### 6.3 Git-backed single-author + PR review

- Each canvas = git repo (per-tenant Gitea per ADR-0150 §2 or external GitHub/GitLab BYO)
- Commits per save
- PR-style review for shared canvases
- Diff visualization (node added/removed/changed)
- Lower complexity than real-time; async-friendly

---

## 7. Emit targets (Codegen recipes via ADR-0123)

| Recipe | Output | Use case |
|---|---|---|
| `workflow.temporal-ts` | Temporal TS workflow + activities | Long-running stateful workflows |
| `workflow.activepieces-flow` | Activepieces flow JSON | Tenant DIY automations |
| `workflow.cron` | NestJS @nestjs/schedule job | Time-triggered tasks |
| `state-machine.xstate` | XState v5 machine | Finite state UIs / pathways |
| `decision.cerbos` | Cerbos YAML policy | Authorization rules |
| `interceptor.nestjs` | @curaos/event-interceptors module | Event-bus interceptor |
| `agent.langgraph` | LangGraph.js agent graph | AI agent definition |
| `bpmn.xml` | BPMN 2.0 XML | Interop with legacy BPMN tools (read-only one-way export) |
| `diagram.mermaid` | Mermaid source | Markdown docs embedding |
| `diagram.plantuml` | PlantUML source | Architecture docs |
| `export.png` / `export.svg` / `export.pdf` | Static images | Documentation, presentations |
| `export.json-ir` | CuraOS IR (canonical JSON) | Backup / migrate / version |

All recipes use Codegen Engine + cookbook pattern per ADR-0123.

---

## 8. Local + 3rd-party rule applied

| Area | Local default | 3rd-party (BYO) |
|---|---|---|
| Canvas hosting (standalone) | CuraOS-managed Next on K3s | Vercel / Netlify / customer K8s |
| Real-time collab backend | Hocuspocus self-hosted | Liveblocks (commercial; BYO) |
| Git VCS backend (for git-collab mode) | Gitea self-hosted | GitHub / GitLab / Bitbucket (BYO) |
| AI fill provider | vLLM Qwen3/DeepSeek (per ADR-0114) | OpenAI / Anthropic via LiteLLM (BYO) |
| Diagram render engine | Mermaid + PlantUML server self-hosted | Kroki Cloud (BYO) |
| Search across canvases | OpenSearch self-hosted | Algolia (BYO) |
| PDF export | Gotenberg self-hosted (per ADR-0113) | PrinceXML (commercial; BYO) |

---

## 9. Multi-tenant + marketplace

- Per-tenant canvas library (private by default)
- Marketplace tiers mirror ADR-0121b (First-party / Certified / Community / Private)
- Tenant publishes canvas template; other tenants install + customize
- Cosign-signed templates
- Revenue share (Stripe Connect per ADR-0121b) for paid templates

---

## 10. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | @curaos/canvas npm package skeleton (React+Next + @xyflow/react base) |
| M2 | Flow/DAG paradigm + CuraOS custom node library (Action, Decision, etc.) |
| M3 | CuraOS IR (JSON canonical schema) + Payload CMS storage |
| M4 | Codegen recipe `workflow.temporal-ts` (canvas → Temporal TS) |
| M5 | Real-time collab (Yjs + Hocuspocus) |
| M6 | State machine paradigm (XState wrapper) + recipe `state-machine.xstate` |
| M7 | Decision table paradigm + recipe `decision.cerbos` |
| M8 | Event interceptor flows + recipe `interceptor.nestjs` |
| M9 | Forms sub-canvas integration (per ADR-0121e) |
| M10 | AI agent flow editor (LangGraph.js nodes) + recipe `agent.langgraph` |
| M11 | Sequence + architecture diagrams (Mermaid + PlantUML inline) |
| M12 | Mind maps (ELK.js layout) |
| M13 | Recipe `workflow.activepieces-flow` + `workflow.cron` |
| M14 | BPMN 2.0 XML export (interop) |
| M15 | Static export (PNG / SVG / PDF via Gotenberg) |
| M16 | AI collab (MCP server exposes canvas state) |
| M17 | Git-backed collab mode |
| M18 | Custom node SDK (WASM + NestJS sidecar + isolated-vm via ADR-0123) |
| M19 | Marketplace v0 + cosign signing + tier classification |
| M20 | Standalone product UI (CuraOS Canvas SaaS landing) |
| M21 | Pricing tiers + Stripe Connect (per ADR-0121b) |
| M22 | Air-gap install bundle |
| M23 | v1 GA — embedded library + standalone product both shipping |

---

## 11. Open questions

1. **PlantUML license** — GPL; safe to invoke as server, NOT to bundle source. Use plantuml-server container as sidecar.
2. **Real-time collab scale** — Hocuspocus per-tenant namespace; benchmark at 1k concurrent editors per canvas.
3. **AI collab approval UX** — auto-accept low-risk vs require human review for high-risk edits. Per-canvas policy.
4. **BPMN export fidelity** — round-trip BPMN ↔ CuraOS IR isn't possible (different expressive power). One-way export only.
5. **Decision table → Cerbos** — full Cerbos DSL coverage vs subset. Subset v1; full v2.
6. **Canvas templates monetization** — per-template one-time vs subscription. Per ADR-0121b model.
7. **Mind map → flow conversion** — automatic? Likely no; different paradigms.

---

## 12. References

- [ADR-0121 Builder Suite umbrella](0121-foundation-builder.md)
- [ADR-0121a Sites](0121a-foundation-sites.md)
- [ADR-0121b Apps](0121b-foundation-apps.md)
- [ADR-0121c Widgets](0121c-foundation-widgets.md)
- [ADR-0122 Workflow Manager](0122-foundation-workflow-manager.md)
- [ADR-0114 AI/Agent](0114-ai-agent-integration.md)
- [ADR-0123 Codegen+Plugin](0123-foundation-codegen-plugin.md)
- @xyflow/react: https://reactflow.dev/
- XState v5: https://stately.ai/docs/xstate
- Formily: https://formilyjs.org/
- LangGraph.js: https://github.com/langchain-ai/langgraphjs
- Yjs + Hocuspocus: https://docs.yjs.dev/ , https://tiptap.dev/docs/hocuspocus
- Mermaid: https://mermaid.js.org/
- PlantUML: https://plantuml.com/
- ELK.js: https://github.com/kieler/elkjs
- Cerbos: https://www.cerbos.dev/
- @nestjs/schedule: https://docs.nestjs.com/techniques/task-scheduling
- Gotenberg (PDF): https://gotenberg.dev/
