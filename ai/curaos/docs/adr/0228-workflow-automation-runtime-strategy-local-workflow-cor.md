# ADR-0228: Workflow automation runtime strategy (local workflow-core vs Windmill/Activepi

> Status: proposed. Source: XSRC external-source enrichment program (Phase 12). Full analysis: `.ai-analysis/` (git-ignored) + `ai/curaos/docs/external-source-enrichment/`.


**Status:** proposed
**Date:** 2026-06-29
**Series:** XSRC mining epic, Phase 12 (ADR drafting). Reaffirms / scopes a prior accepted decision against the external-source corpus.
**Supersedes / amends:** none. **Builds on (binding, higher precedence):**
- [ADR-0122 Foundation Workflow Manager](0122-foundation-workflow-manager.md) (Accepted)  -  engine stack already locked: Temporal + Activepieces + cron.
- [ADR-0204 Cluster: Workflow + Automation Overlays](0204-cluster-workflow-automation-overlays.md) (Accepted)  -  overlay services consume the manager, never embed engines.
- [ADR-0123 Foundation Codegen + Plugin](0123-foundation-codegen-plugin.md) (Accepted)  -  Flow IR -> Temporal TS / Activepieces JSON / NestJS-schedule emit.
- [ADR-0105 Workflow / BPM](0105-workflow-bpm.md) (Superseded by 0122).

**Governing rules (precedence #1, override any ADR per AGENTS §13b):**
- [[curaos-local-vs-3rdparty-rule]]  -  every integratable area ships a local/self-hosted default AND a 3rd-party BYO option.
- [[curaos-generator-evolution-rule]]  -  workflow shapes are emitted from the Flow IR codegen mold, not hand-built per service.
- [[curaos-reuse-dry-rule]]  -  one canonical owner (Workflow Manager); consumers link/extend.
- [[curaos-version-planning-rule]]  -  Target Version gates which mined deltas land in v1 vs forward.
- [[curaos-rolling-update-rule]]  -  forward migration of the existing stack, no parallel `-v2` engine.

---

## 1. Context

The XSRC mining epic catalogued **609 source features** across the cloned corpus; **82** fall under the `workflow-automation` taxonomy, condensed into **28 capability mappings** in `source-to-local-map.json` (domain `workflow-automation`). The dominant external systems for this domain are **Windmill, Activepieces, n8n, node-red, Frappe, EspoCRM** (`generated-analysis/source-feature-index.json`, `generated-analysis/source-workflow-index.json`).

This phase-12 ADR exists because the XSRC question template asks, per high-signal domain, whether to **run a third-party engine as a service** (clone-and-host Windmill, or stand up Activepieces as an external product) or to **keep the local first-party runtime** (`workflow-core-service` + `automation-core-service` over the CuraOS Workflow Manager). The workspace already answered the *engine pick* in ADR-0122; this ADR confirms that the freshly mined corpus contains **no evidence that overturns it**, scopes the **safe** mining harvest into the existing mold, and records the **license-driven rejection** of running Windmill (and of treating Activepieces as an externally operated service rather than an embedded library/sidecar).

### 1.1 What already exists locally (precedence #1 context)

ADR-0122 locked the runtime: **Temporal (MIT) durable execution + Activepieces CE (MIT) automation + @nestjs/schedule/Jobrunr cron**, one **Flow IR** authored in the reused Workflow Canvas, compiled by codegen (ADR-0123) to the three targets. ADR-0204 made `workflow-core-service` and `automation-core-service` **thin NestJS facades** over that manager; overlays (`business-*`, `personal-*`, `healthstack-*`) register templates and never embed an engine. The [[curaos-local-vs-3rdparty-rule]] table already names this area explicitly: *Workflow execution = Temporal self-hosted (local) | Temporal Cloud / Inngest / Trigger.dev (3rd-party)*; *BPM/automation = Activepieces self-hosted (local) | Zapier / Make / n8n Cloud (BYO key)*.

So the decision space is **not** open. This ADR is a **reaffirm-and-scope** record, not a re-pick. Per AGENTS §13b, the rule and the accepted ADR-0122 outrank any contrary re-proposal here.

---

## 2. Source evidence (cloned corpus + indices)

Counts: `source-feature-index.json` total **609** features, **82** under `workflow-automation`; `source-to-local-map.json` domain `workflow-automation` = **28** mappings; reuse-mode distribution across the full ledger (`code-reuse-ledger.json._computed`): `E:port-adapt` 99, `G:pattern-reference-only` 51, `D:api-adapter` 4, `C:run-as-background-service` 3, `H:reject` 6.

| Source system | License (`license-risk-register.json`) | Verdict | Reuse mode (`code-reuse-ledger.json`) | Cited source files |
|---|---|---|---|---|
| **Windmill** | AGPL-3.0 (+ EE) | **reference-only** | **G** pattern-reference-only | `backend/windmill-types/src/{flows,triggers,jobs,scripts,schedule,flow_status,runnable_settings}.rs`, `backend/windmill-queue/src/{jobs,workspace_fairness}.rs`, `backend/windmill-worker/src/{deno_executor,python_executor,ai_executor,job_logger}.rs`, `backend/windmill-common/src/secret_backend/{mod,resolver}.rs`, `backend/windmill-audit/src/audit_oss.rs`, `backend/windmill-api*/src/*` |
| **Activepieces** | MIT (+ some EE) | **safe-to-vendor** (avoid EE modules) | **E** port-adapt | `packages/core/piece-types/src/lib/{piece,trigger,agents,mcp-piece}.ts`, `packages/core/shared/src/lib/automation/{trigger,mcp/mcp}.ts`, `packages/pieces/core/{http,subflows,approval,forms}/src/index.ts`, `packages/core/execution/src/lib/{flow-run/flow-run,agents/mcp,workers/job-data}.ts`, `packages/server/api/src/app/{webhooks,flows/...,flows/flow/human-input/human-input.service}.ts`, `packages/web/src/app/builder/index.tsx` |
| **node-red** | Apache-2.0 | **safe-to-vendor** | **E** port-adapt | `@node-red/registry/lib/{registry,loader}.js`, `@node-red/runtime/lib/{flows/Flow,flows/Subflow,nodes/context/index,nodes/credentials,api/flows}.js`, `@node-red/nodes/core/{function/10-switch,common/25-catch,network/21-httpin}.js`, `@node-red/util/lib/hooks.js`, `@node-red/editor-client/src/js/red.js` |
| **n8n** | Sustainable Use License (source-available, NOT OSI) | **legal-review-required** | **H** reject (dependency) + **G** design-reference-only | `packages/nodes-base/nodes/{Schedule,Wait,Webhook,Code,ErrorTrigger,FormTrigger,ExecuteWorkflow}/*.node.ts`, `packages/workflow/src/workflow-expression.ts`, `packages/@n8n/db/src/entities/{workflow-history,execution-data,credentials-entity,project,folder}.ts` |
| **Frappe / ERPNext** | frappe=MIT / erpnext=GPL-3.0 | MIT primitives safe; GPL reference-only | **E** port-adapt + **A** copy-verbatim (MIT, attributed) | `frappe/workflow/doctype/{workflow/workflow,workflow_transition/...,workflow_document_state/...}.py`, `frappe/model/workflow.py`, `frappe/automation/doctype/{assignment_rule,auto_repeat}/*.py`, `frappe/integrations/doctype/webhook/webhook.py`, `frappe/utils/background_jobs.py` |
| **EspoCRM** | GPL-3.0 (some AGPL) | **reference-only** | **H/G** | `application/Espo/Core/Formula/Parser/Parser.php`, `application/Espo/Core/Formula/Manager.php` |

Key per-feature source signal (from the 28 mappings):
- **Engine-substitutable durable-exec features** (long-running pause/resume, state persistence, error/retry, deployment model, job-queue/fairness)  -  sourced chiefly from Windmill + n8n, the two **license-blocked** systems. Maturity locally is `stronger-than-source` or `present-strong` (Temporal already covers them). Evidence: `flow_status.rs`, `wait-tracker.ts`, `workspace_fairness.rs`.
- **Connector / piece / trigger / action catalog**  -  sourced chiefly from **Activepieces (MIT)** and **node-red (Apache-2.0)**, the two **safe-to-vendor** systems. These are the legitimate harvest. Evidence: `piece-types/src/lib/{piece,trigger}.ts`, `pieces/core/*`.
- **Absent capabilities to add** (AI/LLM step, MCP tooling, multi-language code-step, concurrency/debounce, expression engine, test/simulation mode)  -  all `port-adapt` against MIT/Apache sources, `generator_first_target: contract-typespec`.

---

## 3. Local evidence (inventory + mappings)

`local-project-inventory.json` (167 modules) confirms all targets already exist as real submodules: `workflow-core-service`, `automation-core-service`, `integrations-core-service`, `plugin-runtime-service`, `business-workflow-service`, `builder-core-service`.

Maturity from `source-to-local-map.json` / `gap-analysis.json` for the 28 workflow-automation mappings:
- **`stronger-than-source` / `present-strong` (engine-owned):** long-running workflows (`workflow-core-service/src/temporal/{sla-timer.workflow,patient-admission-saga,approval-signals}.ts`), human approval/suspend-resume (`temporal/{approval-signals,linear-review-approve.workflow}.ts`, `tasks/tasks.service.ts`, `inbox/inbox.controller.ts`), error/retry, state persistence, webhooks (`integrations-core-service/src/webhooks/{webhook-delivery.engine,webhook-signature,ssrf-guard,inbound-webhook}.ts`), audit (`automation-core-service/src/audit/audit-chain-hash.ts`), RBAC, deployment model, forms (`builder-core-service`), low-code builder.
- **`partial` (harvest target into the mold):** visual editor (`frontend/apps/workflow-designer/` + `workflow-core-service/specs/workflow.tsp`), trigger catalog, action catalog, job-queue, observability, plugin registry, API-triggered/sub-flow.
- **`present-weak`:** connector framework (`automation-core-service/src/connectors/{connector.types,connector-catalogue.fixture}.ts`  -  fixture, a data-truth gap), cron schedules, secrets/variables, workflow versioning.
- **`absent`:** AI/LLM step, MCP tooling, multi-language code-step (`plugin-runtime-service`, currently `stub`), concurrency/debounce, expression engine, test/simulation mode.

`gap-analysis.json` summary independently states CuraOS "owns a strong generator-first substrate" and that the connector catalogue is a **fixture** (data-truth violation) to be promoted to a real seeded registry. None of these gaps is an engine deficiency; every one is a **catalog/feature gap on top of the existing engine**.

---

## 4. Decision options

### Option A  -  Reaffirm the local first-party runtime; harvest catalog deltas into the existing mold (RECOMMENDED)
Keep `workflow-core-service` + `automation-core-service` over the ADR-0122 Workflow Manager (**Temporal + Activepieces CE embedded + cron**) as the single canonical owner. Mine the corpus for **completeness only**, porting the safe (MIT/Apache) connector/trigger/action/AI/MCP/code-step/expression/simulation shapes through the **Flow IR + codegen** mold and the connector SDK, replacing the connector **fixture** with a real seeded registry. Windmill/n8n contribute **design patterns only** (scheduling fairness, secret-backend resolver, pin-data/error-trigger UX). The 3rd-party leg of [[curaos-local-vs-3rdparty-rule]] stays a **provider abstraction** (Temporal Cloud / Inngest / Trigger.dev for execution; Zapier / Make / n8n Cloud via BYO tenant key for automation), not a code dependency.

### Option B  -  Run Windmill as the workflow service
Clone-and-host Windmill as the execution engine, expose it behind `workflow-core-service`.
**Blocked at the rule layer:** Windmill is **AGPL-3.0** (+ EE). `license-risk-register.json` verdict = **reference-only**: linking it into the networked multi-tenant SaaS forces AGPL source disclosure of every interacting service. Reuse mode **G**. Rejected on license; also duplicates a settled engine (violates [[curaos-reuse-dry-rule]] + [[curaos-rolling-update-rule]] no-parallel-engine).

### Option C  -  Run Activepieces as a standalone external service (out-of-process product)
Stand Activepieces up as its own operated product and integrate via API, rather than the ADR-0122 embedded-library/sidecar posture.
**Contradicts ADR-0122/0204** (Activepieces is the *embedded* automation engine inside one Workflow Manager, one editor, one Flow IR). A second operational surface fractures the single-canvas UX, duplicates RBAC/audit/tenancy, and re-opens the embed-vs-sidecar question already deferred-milestone in the Resolution Map. Partial validity: Activepieces is MIT and **safe-to-vendor**, so this is an operational/architecture rejection, not a license one.

### Option D  -  Build a fully bespoke engine from scratch
Reject all four corpora as anything but inspiration and write a new durable-execution + automation engine.
Violates the ponytail ladder and [[curaos-reuse-dry-rule]]: Temporal already gives `stronger-than-source` durability for free. No evidence justifies the cost.

---

## 5. Recommended option

**Option A.** It is the only option consistent with precedence-#1 sources ([[curaos-local-vs-3rdparty-rule]] + accepted ADR-0122/0204) and with the license register. The mined corpus changes **what catalog/features** flow in, not **which engine** runs them. Concretely:

1. **Engine unchanged**  -  Temporal + Activepieces CE (embedded/sidecar) + cron, one Flow IR, one Workflow Canvas (ADR-0122).
2. **Harvest only the safe sources**  -  port-adapt (mode E) from Activepieces (MIT) + node-red (Apache-2.0) + frappe MIT primitives; treat Windmill/n8n/EspoCRM as design-reference-only (mode G/H).
3. **Everything through the mold**  -  new trigger kinds, action/flow-control nodes, AI/LLM step, MCP step, multi-language code-step, expression engine, concurrency/debounce, simulation mode, versioning/restore enter via `*.tsp` contract + Flow IR codegen + connector SDK ([[curaos-generator-evolution-rule]]); no per-service hand-wiring.
4. **Promote the fixture**  -  `connector-catalogue.fixture.ts` becomes a real DB-seeded registry (data-truth, [[curaos-demo-sample-data-rule]]).
5. **Keep the 3rd-party leg as abstraction**  -  provider interfaces only; BYO Temporal Cloud / Inngest / Zapier-class via tenant config, never vendored.

### Person-centric lens application (BINDING)
Per `PERSON-CENTRIC-LENS.md`, every mapping already carries `person_centric_reshape` / `management_surface` / `person_surface` / `no_loss_check`. This ADR adopts them verbatim as acceptance criteria:
- **Management surface (no feature lost):** `workflow-designer` / `builder-studio` keep the full node-graph canvas, deploy-diff, versioning/restore, code/expression steps, MCP/AI config, connector marketplace + org OAuth vault, run/queue/fairness monitoring. Every source business/compliance capability is preserved or filed forward (`no_loss_check` per mapping).
- **Person surface (additive):** `personal-workflow` / `personal-automation` apps express the same engine as journey cards ("when a new lab result arrives, remind me"), a status timeline, "my connections" (consent-gated, revocable), "needs your okay" inbox items, and friendly run progress. The person owns their automations by default (`(tenant,user)` key).
- **Simplification, not subtraction:** org-centric editor UX from Windmill/n8n/node-red is *not* copied as the primary experience; their feature sets are. Code steps, MCP, and expression engine stay management-only (no-code person surface), so simplification never drops a required capability.

---

## 6. Consequences

**Positive**
- One canonical workflow owner; zero engine duplication; existing `stronger-than-source` durability retained.
- Clean license posture: only MIT/Apache code is vendored; AGPL/SUL stay reference-only.
- Generator-first harvest means each mined delta lands once in the mold and regenerates across core/personal/business + healthstack symmetry.
- The 28-mapping completeness backlog closes the `partial`/`weak`/`absent` gaps without re-architecting.

**Negative / cost**
- Porting Activepieces/node-red shapes by hand into the Flow IR + connector SDK is real work (mode E), spread across multiple Target Versions.
- Some Windmill/n8n niceties (workspace fairness algorithm, pin-data debug UX, expression function catalog) must be **re-implemented fresh** from the pattern, not copied  -  slower than vendoring would have been.
- Connector-fixture -> real-registry migration needs a seed + migration per [[curaos-demo-sample-data-rule]].

**Neutral**
- No change to ADR-0122/0204 decisions; this ADR only scopes the XSRC harvest against them. Resolution Map rows for "Workflow paradigm" / "Activepieces embed vs sidecar" are unaffected (the latter stays DEFERRED-MILESTONE).

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Accidental copy of Windmill/n8n source (license breach) | Med | Mode G/H tags in `code-reuse-ledger.json`; CI `gitleaks`/provenance check; reviewer asserts "pattern, not paste" on every workflow PR citing those systems. |
| Activepieces **EE** modules pulled in with the CE core | Med | Pin CE only; SBOM (`osv-scanner`) gate; deny-list EE package paths. |
| Connector fixture stays the runtime data plane | Med | Promote to seeded registry; data-truth gate blocks fixtures as demo/runtime data. |
| Feature loss while "simplifying" the person surface | Low | `no_loss_check` per mapping is a hard acceptance gate; management surface retains full capability. |
| Scope creep: re-litigating the engine instead of harvesting features | Low | Precedence note: ADR-0122 + rule bind; this ADR is reaffirm-only. |
| PHI leaking into workflow variables / queue / connectors | Med | Reference-only envelopes in queue; ConsentGuard + Presidio gate on AI/LLM step; PHI stays in overlay schema. |

---

## 8. License implications

- **Windmill  -  AGPL-3.0 (+EE): reference-only.** Network-copyleft would force source disclosure of interacting CuraOS services. **Must not** be vendored, linked, or run as the engine. Patterns (scheduling/fairness/approval/secret-backend/concurrency) may be re-implemented fresh.
- **n8n  -  Sustainable Use License (source-available, NOT OSI): legal-review-required / reject as dependency.** Restricts commercial/hosted/embedded use. **Cannot** be vendored, imported, copied, or hosted. Usable only as design reference for expression / pin-data / error-trigger / form-trigger *shapes*, implemented fresh.
- **Activepieces  -  MIT (CE) + some EE: safe-to-vendor.** CE core (createPiece framework, trigger/action/agent/MCP, registry) may be ported with attribution. **Avoid EE** modules (commercial license).
- **node-red  -  Apache-2.0: safe-to-vendor** with attribution (registry, context, credentials, switch/catch/httpin node patterns).
- **Frappe  -  MIT: safe (mode A/E with attribution)**; **ERPNext  -  GPL-3.0: reference-only**; **EspoCRM  -  GPL/AGPL: reference-only.**
- Attribution: vendored MIT/Apache snippets recorded in the NOTICE/attribution file alongside `license-risk-register.json` verdicts.

---

## 9. Validation needed

1. **License/provenance gate**  -  CI assertion that no Windmill/n8n/EspoCRM source is present in vendored paths; SBOM clean of Activepieces EE.
2. **Engine non-duplication test**  -  architecture test that `workflow-core-service` / `automation-core-service` remain thin facades (no embedded second engine), per ADR-0204 reverse-coupling guard.
3. **Contract + integration tests**  -  each mined delta (trigger/action/AI/MCP/code-step/expression/concurrency/simulation) lands with a `*.tsp` contract test + real-Postgres integration test, regenerated, not hand-written.
4. **Data-truth check**  -  connector registry served from DB seed, fixture removed from the runtime data plane; verified locally then live.
5. **Person/management dual-surface E2E**  -  for at least the connector and approval features, prove both the management graph surface and the person journey-card surface against real APIs (full-surface sweep).
6. **no_loss audit**  -  sign-off that every source business/compliance capability per mapping is preserved or filed-forward with a Target Version.

---

## 10. Implementation follow-up

- **Epic:** XSRC backlog epic  -  domain `workflow-automation` (Phase 13 blueprint/backlog output; tracker repo per AGENTS §10 local-issue hierarchy in `.scratch/state/symphony-work/local-issues.sqlite`, mirrored to the org tracker). This ADR is the decision record the epic's stories execute against.
- **Child stories (each generator-first, version-gated per [[curaos-version-planning-rule]]):**
  1. Promote connector catalogue fixture -> seeded registry (data-truth).
  2. Trigger-kind catalog completion via Flow IR contract (Activepieces/node-red port).
  3. Action + flow-control node completion (HTTP/loop/router/branch/delay/sub-flow).
  4. AI/LLM step + MCP step (consent-gated, PHI boundary)  -  `absent` -> add.
  5. Multi-language sandboxed code-step in `plugin-runtime-service` (`stub` -> real).
  6. Expression engine (port shape from EspoCRM/n8n, fresh impl).
  7. Concurrency limits + debounce (Windmill pattern, fresh).
  8. Test/simulation/pin-data mode in `workflow-designer`.
  9. Workflow versioning + draft + restore API.
  10. Secrets/variables vault formalized into contract (provider-abstracted).
- **Generator targets:** `curaos/tools/codegen/` Flow IR emitters, `@curaos/contracts` workflow/automation `*.tsp`, connector SDK. Per [[curaos-generator-evolution-rule]], every edge case folds back into the mold in-PR or as a `priority=critical` follow-up against the shared owner.
- **Resolution Map:** add a row  -  *"XSRC workflow-runtime (local vs Windmill/Activepieces-service)" -> RESOLVED-ADR -> ADR-0220 (reaffirms 0122; Windmill rejected on AGPL; Activepieces-as-external-service rejected on architecture)*. Once accepted, flip Status proposed -> accepted and refresh the doc graph (`bun scripts/check-doc-graph.js`) + AI mirror.

---

*Tech-agnostic note: engine product names (Temporal, Activepieces) appear here only because the per-module stack pick is already recorded in ADR-0122 / `Requirements.md`; the workspace `AGENTS.md` itself stays tech-agnostic. Rule precedence (#1) over this ADR (#2) holds per AGENTS §13b.*