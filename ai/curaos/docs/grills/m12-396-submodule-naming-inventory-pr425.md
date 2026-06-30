# Codex grill — m12-396-submodule-naming-inventory PR curaos-ai-workspace#425

- Issue: your-org/curaos-ai-workspace#396
- PR: your-org/curaos-ai-workspace#425
- Agent: codex-1227647c
- Branch: agent/submodule-naming-inventory-cdx396-1227647c
- Created: 2026-06-04T13:37:16Z

## Verdict: APPROVE-WITH-CONDITIONS

## P0 findings (block merge)

None for PR #425 after the implementation stayed non-destructive.

## P1 findings (must address before merge)

None for PR #425. The planning review below identified doc/ADR consistency risks, and this PR addresses the in-scope naming note, inventory, decision log, and follow-up capture.

## P2 findings (followups acceptable)

1. Destructive cleanup remains held in [#424](https://github.com/your-org/curaos-ai-workspace/issues/424) until explicit same-turn user confirmation.
2. ADR-0208 header cleanup remains separate from this non-destructive inventory PR unless a later confirmed lane owns that docs scope.

## What Claude got right (counter-balance — minimum 3 items)

1. Split non-destructive inventory from destructive submodule cleanup.
2. Preserved `healthstack-patient-service` because it is active, not an empty placeholder.
3. Filed the destructive cleanup as a held follow-up instead of removing submodules in this PR.

---

## Planning Review Evidence

# Adversarial Planning Review — Issue #396

## 1. Missing questions (gaps issue body doesn't answer)

1. **Q1 — Authoritative source of truth: ADR-0208 §3 or M12 story breakdown + #383?** Issue body claims "ADR-0208 topology" uses plain names. **FALSE.** ADR-0208 §3.1–3.19 names every clinical service WITH `healthstack-` prefix (e.g. §3.15 `healthstack-terminology-service`, §3.4 `healthstack-orders-service`). Conflicting sources: ADR-0208 §3 (prefixed) vs M12 story-breakdown + #383 + AUTO-DECISION-LOG 2026-06-04 row (plain). Which is canonical?
2. **Q2 — Is `--plain-service` the right mold for HealthStack overlay services at all?** Codegen README §`--plain-service` describes it as "ADR-0201 §1 shared services (settings/notify/storage/search/reports)" — NEUTRAL shared services, NOT clinical overlay. Issue #383 uses it for terminology with `--domain=healthstack`. Mold-flag intent vs actual M12 use diverged.
3. **Q3 — Does `scheduling-service` (plain, line 537 of .gitmodules) collide semantically with `healthstack-clinical-scheduling-service` (ADR-0208 §3.2)?** Two distinct services or accidental duplication? Issue body silent.
4. **Q4 — Are the 19 healthstack-* repos truly empty or pre-NestJS scaffolds with non-trivial history?** AUTO-DECISION-LOG row asserts "empty: README + workflow only" but inventory hasn't been re-verified per-repo this session.
5. **Q5 — What does "remove the stale empty `healthstack-*-service` placeholder submodule entries… or archive them" mean operationally?** Three distinct destructive ops: (a) `git submodule deinit` + remove `.gitmodules` block + `git rm` dir, (b) archive org repo (GH setting), (c) delete org repo. Issue body conflates.
6. **Q6 — Worker scope ambiguity:** issue says "non-destructive inventory" in Acceptance but "deinit … or archive … T3" in Scope. Single AFK run can do inventory + doc updates safely; the destructive removal is a separate same-turn confirmation. Confirm split.
7. **Q7 — What about `frontend/{apps,packages}/*` submodules?** Issue scopes only `backend/services/`; no front-end mirror gap claimed but worth recording.

## 2. Docs / ADR conflicts

| # | Conflict | Severity |
|---|---|---|
| C1 | **ADR-0208 §3.1–3.19 vs AUTO-DECISION-LOG 2026-06-04 row** — ADR §3 service headers all `healthstack-<x>-service`; AUTO-DECISION-LOG names ADR-0208 as evidence for PLAIN. ADR text not updated when plain naming chosen | Critical (ADR text contradicts cited decision) |
| C2 | **AGENTS.md §7 line 118** — `healthstack-<domain>-service` listed as canonical layer-grouping pattern. Plain-name decision orphans this line. AUTO-DECISION-LOG row anticipates fix but didn't apply | High |
| C3 | **`.gitmodules` dual entries** — `scheduling-service` (537) + `healthstack-clinical-scheduling-service` (141). If both kept, they're distinct services per ADR-0208 §3.2 (clinical-scheduling = clinical-specific). If plain-naming wins, naming collision (`scheduling-service` = which?) | High |
| C4 | **Codegen `--plain-service` README** — says it's for ADR-0201 §1 NEUTRAL services; #383 used `--plain-service` + `--domain=healthstack` for clinical overlay. Either the README intent is wrong or the M12 mold use is wrong | Medium |
| C5 | **ADR-0115 (HealthStack overlays) cluster decision** — does it say anything about the prefix? Not surfaced; assume silent | Low |
| C6 | **Per AGENTS.md §13b precedence**: ADR (priority 2) > AGENTS.md §7 (priority 3); ADR-0208 says PREFIXED → ADR wins per precedence rules → plain-naming decision violates precedence ladder unless ADR-0208 is amended FIRST | Critical |

## 3. Glossary conflicts

- G1 — "healthstack-*-service" = (a) overlay namespace + dir prefix per AGENTS.md §7 + ADR-0208 §3; (b) "stale placeholder" per issue body. Two distinct senses; both live in workspace docs.
- G2 — "clinical cluster" — ADR-0208 names 19 services with `healthstack-` prefix; M12 story-breakdown drops prefix. Same set, two names.
- G3 — "placeholder submodule" vs "real submodule": no formal definition. Empty repo + .gitmodules entry = placeholder. README-only repo = placeholder. README+workflow = placeholder. Boundary undefined.
- G4 — "clinical-scheduling" (overlay) vs "scheduling" (neutral booking) — semantically distinct domains per ADR-0208 §3.2; plain-rename would collapse them.

## 4. Hidden deps / subtasks

- D1 — **`scripts/check-ai-mirror.sh` drift** — ai/curaos/ has prefixed paths under `backend/services/healthstack-*-service/` (mirror of submodule paths). If submodule path renames or deinits, mirror must update SAME COMMIT per [[curaos-ai-mirror-rule]].
- D2 — **`curaos/.gitmodules` pointer commit** — submodule deinit/remove is a tracked commit in curaos repo; parent (workspace) does not need pointer change. But the parent's `curaos` submodule pointer DOES need bump after curaos commit lands.
- D3 — **ADR-0208 amendment commit** — if plain-naming wins, ADR-0208 §3.1–3.19 headers + every internal cross-ref MUST be renamed. ADR-0208 has 700+ lines; structural rewrite, not a docs touch-up.
- D4 — **#383 scaffold landed at `backend/services/terminology-service`** but not yet merged (per pluralizer row #395). If naming flips to prefixed, #383 must also re-render.
- D5 — **Cycle 5 `C5-HealthStack-Phase-A` Project Field** — M12 cycle name itself contains "HealthStack"; not affected by service-name change but worth confirming.
- D6 — **Cross-harness grill report for #396** lives at `ai/curaos/docs/grills/m12-396-submodule-naming-inventory-pr425.md`. Worker must populate before merge per [[curaos-verification-stack-rule]].
- D7 — **`curaos.healthstack.*` event topic namespaces** (e.g. `healthstack.terminology.valueset-updated` in #383) — already use `healthstack` prefix at TOPIC level. Plain-service NAME does not affect topic namespace.
- D8 — **TypeScript package name `@curaos/<x>-service`** — codegen emits plain package name regardless; healthstack prefix only at dir/repo level.
- D9 — **Foresight issue parent #320 (codegen-mold Epic)** — #396 parented there; correct since it touches the mold's naming convention.
- D10 — **In-flight generator/SDK barrier** per AGENTS.md §8 + [[curaos-generator-evolution-rule]]: if any codegen lane is `agent-claimed:*`/`agent-PR-open`, downstream M12 dispatch BLOCKED. Active session has `agent-claimed:codex-1227647c` on #396 — does this trigger the barrier on #383/#397 et al? #396 is an inventory chore, not codegen-mold work; should NOT trigger barrier, but worth verifying.

## 5. Prototype candidates

- P1 — **Dry-run inventory script**: walk `.gitmodules`, classify each entry (`prefixed-stale-placeholder` / `prefixed-canonical-overlay` / `plain-canonical` / `plain-collision-with-prefix`), emit table. Pure read-only. Inventory output IS the deliverable.
- P2 — **Per-repo emptiness probe**: `gh api repos/your-org/healthstack-<x>-service/contents` for each of 19. Confirm AUTO-DECISION-LOG's "empty: README + workflow only" claim before any destructive proposal.
- P3 — **Naming-map table draft** (markdown): old healthstack-prefixed → new plain (or vice versa) for each of 19, cross-referenced to ADR-0208 §3.N + any existing plain submodule.

No code-prototype candidates — task is doc + inventory only.

## 6. Decision points + recommended answers (auto-apply per [[curaos-recommendation-auto-apply-rule]])

| # | Decision | Recommended | Source | Reversible-how |
|---|---|---|---|---|
| **DP1** | Canonical-naming question: prefix vs plain for M12 clinical cluster | **Plain `<domain>-service`** | AUTO-DECISION-LOG 2026-06-04 (already-applied + user-confirmed via #395 pluralizer funnel); #383 scaffold landed plain; codegen mold + tests lock plain; M12 story-breakdown uses plain | Reversible: ADR-0208 §3 amendment + AGENTS.md §7 patch + #383 re-render; cheap while only 1 M12 service rendered |
| **DP2** | ADR-0208 §3.1–3.19 service-header naming | **Amend ADR-0208 §3 headers to drop `healthstack-` prefix**, add resolution-pin banner stamping the decision date + ref to AUTO-DECISION-LOG row + #396 | Per AGENTS.md §13b: rule wins, ADR gets resolution-pin per `RESOLUTION-MAP.md` convention. Plain-naming decision is the rule-level answer; ADR text must reflect | Reversible via standard ADR amendment commit |
| **DP3** | AGENTS.md §7 line 118 layer-grouping | **Strike `healthstack-<domain>-service`** from layer-grouping list; keep `<domain>-core-service`, `personal-<domain>-service`, `business-<domain>-service`; replace with a one-line note: "HealthStack clinical overlay services use plain `<domain>-service` naming per ADR-0208 amended 2026-06-04 + [[curaos-ai-mirror-rule]] (events namespaced `curaos.healthstack.*`)" | Same as DP1 source | Reversible: single-line edit |
| **DP4** | `scheduling-service` (plain, line 537) vs `healthstack-clinical-scheduling-service` (line 141) | **Keep BOTH as distinct services**; rename canonical M12 entry from `healthstack-clinical-scheduling-service` → `clinical-scheduling-service` (plain prefix-drop, preserves disambiguation from neutral scheduling). Add glossary row: `scheduling-service` = neutral booking primitive, `clinical-scheduling-service` = clinical overlay using HAPI FHIR + clinical SLA | ADR-0208 §3.2 names this `healthstack-clinical-scheduling-service` (distinct from neutral) — the "clinical" qualifier IS the disambiguator, not the `healthstack-` prefix | Reversible: rename per [[curaos-rolling-update-rule]] forward path |
| **DP5** | "Stale placeholder" definition | **Definition:** a placeholder submodule = `.gitmodules` entry whose org repo contains ONLY README + workflow + LICENSE (zero src/, zero src code), AND for which a same-name (after prefix-drop) canonical submodule exists OR is in the M12/M13 story-breakdown. Worker MUST per-repo-probe before classifying | Avoid relying on the unverified AUTO-DECISION-LOG claim; probe via `gh api .../contents` | Reversible: classification is just a table |
| **DP6** | Worker scope split — inventory + docs (this run) vs destructive deinit (separate gated run) | **Split.** This AFK run: (a) probe 19 repos, (b) produce naming-map markdown at `ai/curaos/docs/submodule-naming-map.md`, (c) amend ADR-0208 §3 headers + add resolution-pin, (d) patch AGENTS.md §7, (e) append AUTO-DECISION-LOG row, (f) populate grill stub, (g) update DOC-GRAPH. **Destructive deinit** → separate follow-up issue with explicit per-path list + same-turn user confirm | Issue Acceptance says "Non-destructive fixes applied where possible. Any destructive submodule removal is proposed separately." | Reversible: every step is doc-only or new file; destructive deferred |
| **DP7** | Mirror question (`ai/curaos/backend/services/healthstack-*`) | **No rename in this run.** Mirror tracks `.gitmodules` paths; mirror rename happens SAME COMMIT as submodule rename. Since deinit is deferred to DP6's follow-up, mirror rename is also deferred there. Document the deferred mirror task in the follow-up issue | [[curaos-ai-mirror-rule]] same-commit sync requirement | Reversible: mirror sync script is automatic |
| **DP8** | Codegen `--plain-service` README intent vs M12 use | **Amend README** to document plain naming as the canonical M12 clinical-overlay naming, NOT only neutral shared services. Single-line README edit. Out-of-scope of #383 but in-scope of #396 since #396 is the naming-reconciliation chore | AUTO-DECISION-LOG 2026-06-04 row commits to plain-naming for clinical cluster; README must reflect | Reversible: README is doc |
| **DP9** | Follow-up issue label | **`enhancement` + `priority:medium`** for destructive-deinit follow-up; parent #320 (codegen-mold Epic, same parent as #396) | Mirrors #396 frontmatter; lighter priority since deinit is mechanical once decision is locked | Reversible |
| **DP10** | AUTO-DECISION-LOG row format for this run | **One row per decision DP1–DP9**, dated 2026-06-04, grouped under header `## 2026-06-04 — #396 healthstack-* submodule naming reconciliation (auto-applied per recommendation)` | Per [[curaos-recommendation-auto-apply-rule]] §2 mandatory log row | Reversible per row's Reversible-how |

## 7. Genuine user-escalation candidates

**Only one** — DP4 has the only judgment call that may warrant escalation, but the recommendation is doc/code-grounded so it auto-applies. NO genuine T3 escalation required for this run, because:

- DP1 already user-confirmed (#395 pluralizer funnel, same naming axis)
- DP2/DP3 are mechanical follow-throughs of DP1
- DP4 is doc-grounded (ADR-0208 §3.2 carves the distinction)
- DP5 is operational
- DP6 honors the issue body's explicit "non-destructive this run" + "destructive proposed separately" gate
- DP7/DP8/DP9/DP10 are mechanical

**One destructive-op gate (still required, NOT escalated by this run):** the FOLLOW-UP issue created in DP6 — when its worker runs, `git submodule deinit` + `git rm` of 19 paths + 19 org-repo archive/delete is destructive per AGENTS.md §11. That worker MUST same-turn-confirm. **Not this issue's concern.**

## Ready-for-AFK checklist

- [x] Canonical decision locked (DP1, prior user-confirm)
- [x] Doc/ADR conflicts enumerated (C1–C6) with mechanical fix per DP2/DP3/DP8
- [x] Glossary clarifications listed (G1–G4) — folded into DP5 + DP4
- [x] Hidden deps mapped (D1–D10) — D6/D10 actionable in-run; D1/D2/D3/D4/D7/D8 doc-only; D5/D9 noted
- [x] Destructive ops split out (DP6) per Acceptance §"non-destructive"
- [x] AUTO-DECISION-LOG plan defined (DP10)
- [x] Grill stub identified for population (D6)

**Worker prompt should bind:** DP1–DP10 verbatim; treat ADR-0208 §3.1–3.19 amendment + AGENTS.md §7 patch + naming-map markdown + AUTO-DECISION-LOG block + grill stub fill + DOC-GRAPH refresh + create destructive-deinit follow-up issue (priority:medium, parent #320, body listing all 19 prefixed paths + 19 org repos requiring archive/delete + same-turn-confirm gate quoted) — all in one branch + one PR through T2 gate.
