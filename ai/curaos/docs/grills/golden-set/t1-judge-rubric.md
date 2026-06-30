# T1 LLM-judge rubric (RP-58 pilot)

Explicit pass/fail criteria for the Tier-1 LLM judge, derived from the `just ci` check list and the T1 verification sequence in [[curaos-verification-stack-rule]]. Paired with a golden set of labeled PR states curated from the archived grill reports in [`ai/curaos/docs/grills/`](../README.md) so a judge model refresh can be checked for verdict drift before it gates anything.

- Rubric version: 1.0.0 (bump on any criterion change; record in `golden-set.json`)
- Judge pin: recorded in `golden-set.json` under `judge` (harness + model + pin date); re-pin on every model refresh per [[curaos-model-tiering-rule]]
- Runner: `bun scripts/check-golden-set.js` (integrity self-check) / `bun scripts/check-golden-set.js --verdicts <file>` (drift compare)

## Framing (binding)

- **Drift detector, NOT a benchmark.** Judge agreement stabilizes only with 100+ labels; this golden set (28 entries) detects gross verdict drift after a model or prompt refresh, nothing finer. Do not quote a golden-set agreement rate as judge quality.
- **Pin versions.** The judge model and the rubric version are recorded in `golden-set.json`. Changing either requires a fresh drift run; a drift failure after a model refresh blocks adopting the new judge pin, it does not retro-invalidate past verdicts.
- **Closed verdict vocabulary.** The judge emits exactly `pass` or `fail` per entry. Anything else is treated as divergent by the runner (fail-closed).

## Pass/fail criteria

The criteria are the `just ci` check list (workspace gate: docs + mirror + pins + test-js + test-sh; submodule repos run their own `ci.sh`) plus the T1 sequence per [[curaos-verification-stack-rule]] (git status + git diff --stat + bun run ci + gitleaks + bun audit + c7 docs lookup), restated as judgeable PR-level checks:

| ID | Criterion | `fail` when |
|---|---|---|
| R1 | Local CI green with pasted evidence | `just ci` / repo `ci.sh` stdout absent, failing, or claimed without the verbatim tail (local-CI-first rule); over-claimed green |
| R2 | Scope matches the declared task | git status / `git diff --stat` shows files outside the declared scope, or declared files untouched |
| R3 | No secrets | any gitleaks finding in the diff |
| R4 | Dependency hygiene | bun audit failure, unpinned or nonexistent (slopsquatted) package, unexplained lockfile drift |
| R5 | Test integrity | tests vacuous or fixture-faked so green proves nothing; coverage claims without runnable tests |
| R6 | Contract safety | API/event/data schema changed without version bump, forward migration, or deprecation path |
| R7 | PHI/tenant boundary | PHI/PII outside overlay schemas; neutral service storing subject data |
| R8 | Commit hygiene | non-conventional commit subjects; AI/tool attribution trailers |
| R9 | No em/en dashes | any em/en dash in code, docs, commits, or generated content |
| R10 | Evidence truthfulness | any claim contradicted by artifacts: dangling/unpushed submodule pointer, fabricated output, stale-tree review (the PR 205 class) |

**Verdict rule: `fail` when ANY criterion R1-R10 is violated at the reviewed state; `pass` otherwise.** One violation fails; there is no weighting and no conditional verdict at T1 (conditions belong to the T2 grill vocabulary).

## Label mapping from grill vocabulary

Golden-set labels come from the INITIAL grill verdict in the archived report. Re-grill outcomes never flip a label: a later APPROVE confirms fixes were required, so the initially reviewed state stays `fail`.

| Initial grill verdict | Label |
|---|---|
| PASS / APPROVE / ACCEPT | `pass` |
| BLOCK / REJECT / FAIL / MERGE-BLOCKED | `fail` |
| APPROVE-WITH-CONDITIONS / REQUEST-CHANGES / PROCEED | excluded (ambiguous for a binary judge) |
| Blocked-harness stubs (`GRILL: blocked-harness-unavailable`, no verdict) | excluded (no adversarial verdict to label) |
| Planning/endorsement reports without a PR under review | excluded (not a PR state) |

## Golden set

[`golden-set.json`](golden-set.json): 28 entries (16 `fail` / 12 `pass`) curated from the grills archive. Each entry carries the archived report filename (provenance), PR refs, milestone, label, the initial verdict string, and a one-line rationale naming the deciding finding. The set deliberately includes the canonical failure classes: fabricated evidence (workspace PR 205), faked test fixtures (m9-s2 slice 3), silent transactional degradation (PR 190), schema/DDL divergence (PR 193), and supply-chain pinning (m8 wave).

Curation rules (enforced by the runner self-check):

- 20 to 30 entries total; at least 5 per label class.
- Every `grill_report` must exist in `ai/curaos/docs/grills/` (non-stub, per the mapping table above).
- Unique ids; non-empty rationale and initial verdict per entry.
- `judge.model`, `judge.pinned_at`, `rubric_version`, and `divergence_threshold` must be present.

## Drift run protocol

1. Run the pinned-candidate judge over each entry's PR state (the diff at the initially grilled SHA where recorded, else the PR as the archived report describes it) with this rubric as the judging prompt.
2. Collect verdicts as JSON `{"<entry-id>": "pass" | "fail"}`.
3. `bun scripts/check-golden-set.js --verdicts <file>`; the runner exits nonzero when the divergence rate (disagreements + missing + unknown verdicts, over total) exceeds `divergence_threshold` (default 0.1). Missing and unknown verdicts count as divergent, fail-closed.
4. On failure: do NOT adopt the new judge pin; file the divergent entry list with the model-refresh issue.

## See also

- [Grills archive README](../README.md): report lifecycle, naming, fixture quarantine
- [[curaos-verification-stack-rule]]: 3-tier verification stack this rubric instantiates at T1
- [[curaos-local-ci-first-rule]]: why pasted local `just ci` stdout is the R1 evidence bar
- [[curaos-agent-eval-obs-rule]]: ground-truth eval + LLM-as-judge stack this pilot feeds
