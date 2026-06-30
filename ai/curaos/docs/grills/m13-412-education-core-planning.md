# Adversarial Planning Review — Issue #412 [M13-S1] education-core-service

**Date:** 2026-06-04
**Reviewer:** Claude Code opposite-harness
**Routing:** adversarial-planning-reviewer / judgment / `claude-opus-4-7` / high / `ai/rules/curaos_model_tiering_rule.md`
**Issue:** [curaos-ai-workspace#412](https://github.com/your-org/curaos-ai-workspace/issues/412)

## 1. Missing Questions

- Tenancy schema strategy at PR1: research says in-memory adapters first with Drizzle/PG seam preserved; Requirements says PG schema-per-tenant. Decision: PR1 uses in-memory ports with disabled Drizzle/Postgres adapter seam.
- LRS analytics path scope: Debezium to ClickHouse CDC is deferred behind feature flag.
- Outbox dispatcher: writer and event-sink interface are in scope; external Kafka publisher wiring is a seam.
- AGS grade passback: S1 keeps launch/deep-link/record seams; full grade passback can follow.
- JWKS storage: S1 exposes JWKS and two-key rotation seam; Workflow Manager owns Temporal worker execution.
- xAPI validation library: Zod-first; external validator not adopted for v1 runtime.
- Activity Kit IR in backend: backend owns IR schema and manifest/export seams; React authoring packages stay out of backend runtime.

## 2. Docs / ADR Conflicts

- Critical H5P license drift: `Requirements.md` still described embedded MIT H5P. Issue body, `AGENTS.md`, `CONTEXT.md`, ADR-0207 correction, and research all require no embedded GPL H5P in core.
- Content priority drift: stale Requirements priority said H5P first. Current rule is xAPI-native, then cmi5, then LTI 1.3; H5P waits for BYO/LTI/sidecar/legal review.
- OSS Stack row drift: replace stale H5P row with Activity Kit and standards-first runtime dependencies.
- Event names need versioned `education.*.v1` namespace.
- Activity generator recipe is not present; if generator-evolution is triggered, file a critical follow-up or fold the mold.

## 3. Glossary Conflicts

- Distinguish `xAPI Activity` from `Education Activity Definition`.
- Keep `ContentBlock` as lesson placement wrapper that may reference an activity definition.
- Align `LTITool` and `LTILaunch` terminology with versioned launch events.
- Set verb-registry default mode explicitly.

## 4. Hidden Deps / Subtasks

- Generator-evolution gate can fire if this lane patches generated-service mold gaps. Owned paths make codegen template edits unlikely; file critical codegen follow-up if needed.
- Verify no in-flight generator/SDK barrier before broad downstream dispatch.
- Contracts/SDK package updates are outside owned paths; preserve event/spec seams and record follow-up if required.
- Add auto-decision log rows for auto-applied planning decisions.
- Refresh doc graph after Markdown edits.
- Fix Requirements H5P/event drift before code.
- Preserve rolling-update rule with `.v1` events and feature-flagged CDC.

## 5. Prototype Candidates

- xAPI Zod statement validation against representative ADL-style fixtures.
- LTI JWKS dual-key endpoint with `jose@6.2.3`.
- Activity Definition IR to SCORM/cmi5 import to xAPI outbox round trip.
- Drizzle xAPI table partitioning, deferred unless PG adapter becomes active.
- `scorm-again@3.0.5` completion-state mapping to xAPI.

## 6. Auto-Applied Decision Points

| # | Decision | Auto-applied answer | Source |
|---|---|---|---|
| D1 | H5P embedded in core | No. H5P remains optional sidecar/LTI/BYO only. | ADR-0207 correction, issue body, research |
| D2 | Content priority | xAPI-native > cmi5 > LTI 1.3; SCORM 2004 import-first; SCORM 1.2 import-only. | `CONTEXT.md`, ADR-0207 |
| D3 | Event naming | Versioned `education.*.v1` events. | research, rolling-update rule |
| D4 | xAPI validation | Local Zod-first; do not adopt `@learninglocker/xapi-validation` in v1 runtime. | research |
| D5 | Persistence PR1 | In-memory adapters behind ports; Drizzle/Postgres seam disabled until follow-up. | research |
| D6 | LRS analytics | PG/outbox first; ClickHouse CDC feature-flagged/deferred. | ADR-0113, research |
| D7 | Activity authoring deps | `@puckeditor/core@0.21.2` and `@craftjs/core@0.2.12` are frontend authoring deps only. | issue body, research |
| D8 | Activity IR | Backend exposes IR schemas, manifests, and export seams only. | research |
| D9 | JWKS | `jose@6.2.3`; two active Ed25519 keys; rotation seam registered. | `CONTEXT.md`, research |
| D10 | SCORM/cmi5 | `scorm-again@3.0.5`, `@xapi/cmi5@1.4.0`, `@xapi/xapi@3.0.3` seams. | research |
| D11 | Assessment/Rubric | Reference Forms-owned records by ID only. | Requirements, ADR-0121e |
| D12 | Codegen recipe gap | Add/follow up critical codegen work if this lane finds mold divergence. | generator-evolution rule |
| D13 | Local CI | Local gates from `ci-gates.yaml` are authoritative. | local-CI-first rule |
| D14 | Commit hygiene | Conventional commit only; no AI/tool trailers. | `AGENTS.md` |
| D15 | Verb registry default | `warn`, with tenant override `reject`, `warn`, or `coerce`. | Requirements and AGENTS |
| D16 | API exposure | REST first; preserve tRPC seam in docs, not runtime until package owner exists. | Requirements, owned-path limit |
| D17 | Migrations | Do not run irreversible schema migrations in PR1. | AGENTS/frontmatter, T3 gate |
| D18 | PR strategy | One Story PR for this owned worktree. | one-task prompt |
| D19 | Docs sync | Rewrite Requirements/CONTEXT stale H5P/event sections and refresh doc graph. | issue docs gate |
| D20 | Subtask partitioning | Single worktree serial implementation; no second branch. | swarm rule |

## 7. Genuine User-Escalation Candidates

None for in-scope decisions. Escalate only if implementation tries to run schema migrations, embed H5P, enable Debezium/ClickHouse, edit `ai/rules/**`, or create another worktree/branch.

## Verdict

Ready for one AFK implementation run after Requirements H5P/event drift is corrected. PR target: single service PR. Generator-evolution gate remains watch-listed.
