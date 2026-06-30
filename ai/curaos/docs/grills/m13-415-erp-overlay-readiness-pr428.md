# Codex grill — m13-415-erp-overlay-readiness PR curaos-ai-workspace#428

Date: 2026-06-04
Agent: codex-a7c02ce8
Harness: Claude CLI, opposite-harness read-only readiness review
Issue: https://github.com/your-org/curaos-ai-workspace/issues/415
PR: https://github.com/your-org/curaos-ai-workspace/pull/428

Research: `ai/curaos/docs/research/2026-06-04-m13-erp-overlay-readiness.md`
Grill report: `ai/curaos/docs/grills/m13-415-erp-overlay-readiness-pr428.md`

## Verdict: APPROVE-WITH-CONDITIONS

## P0 findings (block merge)

None for PR #428 when the lane stays docs-only and does not implement ERPNext bridge code.

## P1 findings (must address before merge)

1. ERPNext bridge implementation is out of scope for #415 while `RESOLUTION-MAP.md` keeps hospital admin integration `DEFERRED-V2`; PR #428 must remain docs/readiness/follow-up tracking only.
2. Destructive `procure-service` submodule removal requires explicit user confirmation and must not happen in PR #428.

## P2 findings (followups acceptable)

1. `procurement-core-service#3` and `inventory-core-service#2` track optional ERPNext mirror provider seams behind legal/V2 gates.
2. `curaos-ai-workspace#426` tracks clean-slate `procure-service` overlay disposition.
3. `curaos-ai-workspace#427` tracks missing personal/business sales, inventory, and procurement overlay scoping.

## What Claude got right (counter-balance — minimum 3 items)

1. Identified the `RESOLUTION-MAP.md` Q7 conflict before bridge code could enter M13.
2. Separated destructive submodule cleanup from reversible docs/tracker repair.
3. Required atomic follow-up issues instead of hiding ERPNext legal/V2 work inside a readiness PR.

## 1. Missing questions

- **Scope mode unstated.** Issue body never says "docs-only repair" vs "implement bridge". Research §"Recommended Actions" leans docs-only + atomic-followups; verification list only mentions doc graph + export tests + `.gitmodules`. No code-change verification listed. Ambiguous for AFK.
- **`procure-service` disposition.** Submodule exists w/ pointer `90a4041` + `README` "clean slate". Research says "tracker gap, not code change". Is the overlay required for M13 acceptance, or deferred to a foresight issue? No answer.
- **EducationStack siblings of #415 under epic #27.** Epic #27 scope-in lists `student-service` + `course-authoring-service`. Where are those child Stories? Not in scan. If #415 is the only M13 child, demo acceptance ("Health + Edu + ERP coexist") cannot close from #415 alone.
- **`commerce-core` "intact" definition.** Acceptance says "public event exports stay intact". Means (a) run `test/public-export-surface.test.ts` only, or (b) plus event-emission integration tests against W2 consumers? Ambiguous.
- **Bridge legal gate.** ERPNext GPLv3 confirmed. What sign-off artifact records legal review activation? Not specified. Affects whether bridge implementation can land at all in M13.
- **Sidecar reconcile SLO.** Acceptance demands "queue/reconcile" on failures. No target lag, retry-budget, or alarm threshold defined. Cannot write Temporal cron without it.

## 2. Docs / ADR conflicts

- **ADR-0202+ vs ERPNext bridge.** `RESOLUTION-MAP.md:33` Q7 = "Hospital admin integration (ERPNext) → DEFERRED-V2. Generic ERP services (ADR-0202+) cover v1; ERPNext wrap = v2/v3". Research treats bridge as in-scope (optional, gated). **Direct conflict** w/ Resolution Map per §13b precedence (rule>ADR>map). If V2/V3, then #415 must NOT implement bridge code; must only repair docs + file atomic followups. Resolve before implement.
- **ADR-0154 unread by research.** Research cites `ADR-0154` in Requirements docs verbatim but never opens `ai/curaos/docs/adr/0154-provider-abstraction-convention.md`. Provider seam contract may already constrain `ErpNextBridgeProvider` shape — implementer would re-invent.
- **`commerce-core-service/Requirements.md:41,50,86,127`** + **`CONTEXT.md:10,84`** + **`Requirements-raw.md:19,39,51`** still reference `sales-service` + `inventory-service`. Conflicts with current tracked submodules `sales-core-service` + `inventory-core-service`. Same issue in `business-shop-service/Requirements.md:17,27,28,52,60` + `Requirements-raw.md:35`. Doc repair scope is bigger than research's "several owned docs" wave-handle.

## 3. Glossary conflicts

- **`sales-service` ⇄ `sales-core-service`** — research acknowledges. Compounding: `sales-core-service/AGENTS.md:21,74,75` declares its overlays as `personal-sales-service` + `business-sales-service` — neither submodule exists in `.gitmodules`. Either AGENTS.md is forecasting future services, or naming drifted again. Same shape for `inventory-core-service/AGENTS.md:74,75` → `personal-inventory-service` / `business-inventory-service`.
- **`inventory-service` ⇄ `inventory-core-service`** — same as above.
- **`procure-service` ⇄ `procurement-core-service`** — research notes both exist. The submodule named `procure-service` is the legacy clean-slate name; `procurement-core-service` is current owner. Multi-vertical naming ambiguity: is `procure-service` the future "business-procurement overlay" or dead?
- **`ErpNextBridgeProvider`** — appears only in **inventory + procure** docs. **`procurement-core-service` docs lack any bridge provider name.** Glossary asymmetry — research surfaces but doesn't pin canonical name.
- **Unleash flag `erp-next-bridge`** vs ADR-0154 provider abstraction. No rule confirms `erp-next-bridge` as canonical flag slug; flag-registry not checked.

## 4. Hidden deps / subtasks

- **Roadmap mirror lag.** `ISSUE-ROADMAP.md:30,185` lists M13 as `Blocked`. #415 is In Progress per heartbeat comment. Mirror needs row insert + M13 status flip. Per acceptance §9 of workspace AGENTS, mirror update is part of DoD.
- **Auto-decision-log row** required per orchestrator instruction here ("record each as `(auto-applied per recommendation)` + a row in ai/curaos/docs/adr/AUTO-DECISION-LOG.md"). Implementer must append, not just inline-cite.
- **Doc-graph re-run.** Research lists `bun scripts/check-doc-graph.js` — but every markdown file added (new research, new followups) needs DOC-GRAPH.md sync per [[curaos-doc-graph-rule]]. Hidden cost = ≥6 doc edits if all stale-name docs touched.
- **`.gitmodules` audit.** Acceptance says "verify `.gitmodules` and AI mirror consistency". `procure-service` is in `.gitmodules` but has 40B README. Audit may flag it as orphan — implementer must decide remove vs keep.
- **Per-rule [[curaos-rolling-update-rule]]**: any rename of `sales-service`→`sales-core-service` in docs must NOT introduce parallel paths. Doc-only rename is fine; **service-code rename forbidden** (existing service stays, no `-v2`).
- **`personal-sales-service` + `business-sales-service` + `personal-inventory-service` + `business-inventory-service` + `personal-procurement-service` + `business-procurement-service`** referenced in `*-core-service/AGENTS.md` as overlays but absent from `.gitmodules`. Six potential foresight issues per [[curaos-foresight-rule]].
- **`procure-service` overlay** — if kept, needs Requirements + CONTEXT + AGENTS rewrite from clean-slate. Foresight-staging candidate.
- **Frappe-JS-SDK + axios dep additions** would touch package.json + lockfile; gated by [[curaos-version-pinning-rule]] (exact pin + Renovate). Not in #415 scope if docs-only.

## 5. Prototype candidates

- **`ErpNextBridgeProvider` integration spike** (separate repo, separate issue). Throwaway prototype against `frappe-js-sdk@1.13.0` to validate: REST `/api/resource/{doctype}` create+update for `Purchase Order` + `Stock Entry`, capture failure-mode payloads, time Temporal reconcile cron. Validates research's mapping before any service-code lands. Owns: `procurement-core-service` or scratch overlay; out of #415 scope.
- **Public-export contract diff** prototype: snapshot `Commerce_ALL_TOPICS` pre- and post-doc-rename to assert zero binary surface drift even when names rename in docs only. Quick `bun test` against `public-export-surface.test.ts` is enough — no separate prototype needed.
- **Doc-graph dry-run** with renamed names to confirm `check-doc-graph.js` still resolves. Trivial; run inline.

## 6. Decision points + recommended answers (auto-apply)

| # | Decision | Recommended answer (sourced) | Implementer action |
|---|---|---|---|
| D1 | Scope mode for #415: docs-repair vs bridge implementation | **Docs-repair + atomic followup issues only.** Sources: `RESOLUTION-MAP.md:33` (Q7 DEFERRED-V2); research §"Recommended Actions" lines 137-143; issue body has no acceptance bullet demanding bridge code. | Limit #415 PR to docs/mirror/tracker edits; file atomic implementation issues per D4-D7. Record `(auto-applied per recommendation)` + AUTO-DECISION-LOG row. |
| D2 | Canonical service names | **`commerce-core-service` / `procurement-core-service` / `sales-core-service` / `inventory-core-service`** are tracker truth. Source: `curaos/.gitmodules` submodule list (cross-checked). `sales-service` / `inventory-service` / `procure-service` references in `commerce-core-service/{Requirements,CONTEXT,Requirements-raw}.md` + `business-shop-service/{Requirements,Requirements-raw}.md` must rewrite. | Sed-rename in docs only. No code rename. Per [[curaos-rolling-update-rule]] — no parallel paths. Auto-apply. |
| D3 | `procure-service` submodule fate | **Keep submodule pointer, defer overlay scoping.** Source: research line 71 "clean slate"; pointer `90a4041` exists in `.gitmodules`. Removal = destructive op requiring user confirm per §11. | Leave `.gitmodules` unchanged; file foresight issue "scope procure-service overlay (business-procurement)" against `curaos-ai-workspace`. Auto-apply. |
| D4 | `ErpNextBridgeProvider` for `procurement-core-service` | **File atomic implementation issue against `procurement-core-service` repo, label `enhancement` + `blocked` (waiting on legal + V2 gate per Q7).** Source: research §"Gaps Found" #3. | Create issue, link to #415 + #27, do not implement. Auto-apply. |
| D5 | `ErpNextBridgeProvider` for `inventory-core-service` | **Same as D4 against `inventory-core-service` repo.** | Same shape. Auto-apply. |
| D6 | Stale references to `personal-*` / `business-*` overlays in core AGENTS.md | **Foresight-staged.** Source: [[curaos-foresight-rule]]; not in M13 scope per epic #27. | File 1 foresight tracker issue per missing overlay (or one rollup) labeled `foresight` + staged in Backlog. Auto-apply. |
| D7 | Roadmap mirror update | **Insert #415 row under M13; keep M13 epic #27 status as is until child closure.** Source: `ISSUE-ROADMAP.md:30,185`; DoD §9. | Edit `ISSUE-ROADMAP.md` + refresh `DOC-GRAPH.md`; run `bun scripts/check-doc-graph.js`. Auto-apply. |
| D8 | `commerce-core-service` public-export verification | **Run `bun test test/public-export-surface.test.ts` only (local-CI tier per [[curaos-local-ci-first-rule]]).** Source: research line 84-92; acceptance bullet 4. | Paste verbatim test output in PR per local-CI rule. Auto-apply. |
| D9 | Bridge legal gate documentation | **Cite ERPNext GPLv3 + ADR-0154 in followup issue bodies; do NOT activate legal review here.** Source: research line 60. | Implementation issues (D4/D5) carry "legal-review-required" note. Auto-apply. |
| D10 | Grill report population | **Populate `ai/curaos/docs/grills/m13-415-erp-overlay-readiness-pr428.md` from this review.** Source: an empty/non-PR-numbered report violates [[curaos-verification-stack-rule]] T2. | Write the PR-numbered grill report at end of implementation pass. Auto-apply. |

## 7. Genuine user-escalation candidates

- **E1. Re-open / supersede `RESOLUTION-MAP.md:33` Q7 DEFERRED-V2 if user wants bridge to land in M13.** Reversal of a documented deferral = scope expansion beyond issue body acceptance. Per §11 boundary "never start unapproved scope". Ask before flipping. *(If user confirms, then D1/D4/D5 invert and #415 expands.)*
- **E2. Delete or unlink `procure-service` submodule.** Destructive submodule deinit per §11 + [[curaos-recommendation-auto-apply-rule]] destructive-confirm carve-out. Requires explicit confirm. Default = keep, file foresight (D3).
- **E3. Cross-vertical M13 acceptance gap.** Epic #27 acceptance demands 3 verticals + demo. #415 alone cannot satisfy. User decision: spawn EducationStack child Stories (`student-service`, `course-authoring-service`) NOW or accept M13 closing in waves. Scope beyond #415 — ask.

## Verdict

**#415 should be DOCS-ONLY + atomic-followup issues for this lane.** Bridge code is blocked by `RESOLUTION-MAP.md:33` (DEFERRED-V2) until user reverses E1. Implementer MUST NOT touch service code under owned paths beyond docs/AGENTS/Requirements/CONTEXT. Public-export test stays a verification check only. Grill report `ai/curaos/docs/grills/m13-415-erp-overlay-readiness-pr428.md` MUST be populated before PR merge per [[curaos-verification-stack-rule]].

Two unresolved scope questions (E1 + E3) materially change the lane shape; everything else auto-applies per item 6.
