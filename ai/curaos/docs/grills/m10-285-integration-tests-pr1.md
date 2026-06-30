# Grill — M10 cross-service integration tests (#285), PR 1

- **Issue**: [curaos-ai-workspace#285](https://github.com/your-org/curaos-ai-workspace/issues/285)
- **Reviewer**: Codex (`gpt-5.5`, reasoning effort medium — see note) — opposite-harness adversarial planning grill
- **Scope**: working-tree plan for the in-process choreography harness + real-infra runbook
- **Verdict**: No blocking escalation. All findings carry recommendations and were auto-applied per [[curaos-recommendation-auto-apply-rule]].

## Reviewer reliability note (binding honesty)

The opposite-harness grill was **flaky** in this environment:
- `gpt-5.1-codex` (the configured grill model) is **rejected on this ChatGPT account** (`invalid_request_error: model not supported`).
- The account default `gpt-5.5` at `high` effort with the prompt passed as an argv arg **produced no output** across 3 attempts (empty last-message; session-hook interference).
- A minimal stdin probe returned `CODEX_OK`, isolating the failure to large-argv/high-effort runs.
- The grill finally succeeded via **stdin pipe at `medium` effort** (`cat prompt | codex exec -m gpt-5.5 -c model_reasoning_effort=medium --sandbox read-only -`), 3697-byte verdict.

Per the one-task prompt's stall fallback ("Codex stalls → default model effort high, else verify directly + orchestrator-verified note + OPEN PR anyway"), the grill DID land at medium effort and every finding was **independently verified directly against the repo docs** before applying — see the verification column below. Treat this as `GRILL: opposite-harness (medium, repo-verified)`.

## Findings + resolution

| # | Finding | Verified against | Resolution |
|---|---|---|---|
| F1 | Test header references `REAL-INFRA-RUNBOOK.md` but the file didn't exist | n/a (true) | **Created** `ai/curaos/test/integration/m10-cross-service/REAL-INFRA-RUNBOOK.md` + package `README.md`; both wired into doc-graph (0 unreachable). |
| F2 | Test comments say **OpenSearch**; ADR-0163 removed OpenSearch from v1 (PG-only search) | `RESOLUTION-MAP.md:58-59` ("ADR-0163 → PG-only search v1; OpenSearch removed from v1") | **Fixed** — test + runbook now say PG-native search (pgvector + tsvector + pg_trgm). |
| F3 | Runbook must say **Redpanda v24.3.1**, not Kafka/Strimzi-managed broker | `RESOLUTION-MAP.md:68` (RESOLVED-SHIPPED M9-S7 #104: Redpanda v24.3.1 is the deployed v1 broker; Strimzi = Connect-only) | **Fixed** — runbook + README name Redpanda v24.3.1 (Kafka-API-compatible), wire stays Apache-Kafka-portable. |
| F4 | Root workspace glob `test/integration/*` "already present" / stale step | working tree | True — the glob was added by THIS change; not a stale instruction, just the grill seeing the working tree. No action. |
| F5 | tasks barrel export gap | `tasks-core-service/src/index.ts` (only `TasksModule`+`TasksService`; 6 siblings export their event contract) | **Surfaced as FORESIGHT, not edited here.** Root-caused: the generator's default barrel (`post-scaffold-plan.ts barrelExportsForLayer`) emits only `{Module, Service}` by design — event-contract exports are domain-fill, and tasks-core's domain-fill omitted them (6 siblings added them). NOT a generator template defect. Editing it crosses the tasks-core submodule boundary (branch + PR + pointer bump = beyond this `test/integration/`-scoped task and a T3 pointer-bump trigger). Flow 6 instead drives the REAL `TasksService` (already barrel-exported) and pins the `task.status.changed` topic locally. The symmetry gap + the missing "service-with-event-producer ⇒ barrel re-exports its contract" generator snapshot are emitted as FORESIGHT for the orchestrator. |
| F6 | Add AI-mirror docs + refresh doc graph; run `just ci` (not only `bun run ci`) | AGENTS.md §8 + local-CI-first rule | **Done** — runbook under `ai/curaos/`, `bun scripts/check-doc-graph.js --write` + `bash scripts/check-docs.sh` green; full gate run via `just ci`. |

## Glossary (confirmed, no change needed)

- `calendar.event.created` = calendar VEVENT domain event (ADR-0203) — used correctly.
- `task.status.changed` = FHIR Task lifecycle (not the generic `curaos.core.tasks.updated.v1`) — used correctly.
- "wire envelope" = topic/key/value/headers JSON; producer classes are NOT the cross-service contract — harness honors this (audit leg reconstructed on the published contract, not via a foreign producer).

## User-escalation candidates

None. Reviewer: "None blocking. Current docs/code provide recommendations." Escalate only on `ai/rules/*` change, service-file deletion, destructive git, or making live-infra/T3 assertions part of CI — none of which this change does.
