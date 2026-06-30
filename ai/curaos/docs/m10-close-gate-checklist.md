# M10 — Platform Shared Services + SDK Packages close-gate checklist

> Tracking: [your-org/curaos-ai-workspace#24](https://github.com/your-org/curaos-ai-workspace/issues/24) (M10 Epic).
> Close-gate Story: [your-org/curaos-ai-workspace#312](https://github.com/your-org/curaos-ai-workspace/issues/312) (M10-S9).
> Verification: `bash curaos/scripts/m10-verify.sh` (run from `curaos/` repo root — the same checkout as the workspace).
>
> M10 grows the **neutral platform-services tier** from the M6/M9 codegen mold —
> `notify-service` + `storage-service` + `search-service` + `settings-service` +
> `reports-service` + `calendar-core-service` + `tasks-core-service` — each with a
> TypeSpec-first REST + AsyncAPI contract (ADR-0103), plus 7 typed SDK packages
> (`@curaos/*-sdk`) generated from those contracts (zero hand-written transport
> code), a cross-service in-process integration matrix, and default-on
> observability (7 Grafana dashboards + a cluster rollup, 7 OpenSLO defs, 7 k6
> perf baselines). The SDKs are the seam every higher capability service consumes.

---

## Story / lane merge index

| Lane | Title | Issue | PR / merge | origin/main SHA | Status |
|------|-------|-------|------------|-----------------|--------|
| M10-S1 | `notify-service` scaffold + multi-channel delivery | [#271](https://github.com/your-org/curaos-ai-workspace/issues/271) | codegen scaffold + pointer bump | `36a0917` | ✅ closed |
| M10-S2 | `storage-service` scaffold + SeaweedFS blob + signed URLs | [#272](https://github.com/your-org/curaos-ai-workspace/issues/272) | codegen scaffold + pointer bump | `36a0917` | ✅ closed |
| M10-S3 | `search-service` scaffold + OpenSearch + ParadeDB | [#273](https://github.com/your-org/curaos-ai-workspace/issues/273) | codegen scaffold + pointer bump | `36a0917` | ✅ closed |
| M10-S4 | `settings-service` scaffold + settings + feature flags | [#274](https://github.com/your-org/curaos-ai-workspace/issues/274) | codegen scaffold + pointer bump | `bc44c87` | ✅ closed |
| M10-S5 | `reports-service` scaffold + Gotenberg PDF + Superset | [#275](https://github.com/your-org/curaos-ai-workspace/issues/275) | codegen scaffold + pointer bump | `2d2379e` | ✅ closed |
| M10-S6 | `calendar-core-service` scaffold + iCalendar VEVENT | [#276](https://github.com/your-org/curaos-ai-workspace/issues/276) | codegen scaffold + pointer bump | `fc4b57d` | ✅ closed |
| M10-S7 | `tasks-core-service` scaffold + FHIR Task lifecycle | [#277](https://github.com/your-org/curaos-ai-workspace/issues/277) | codegen scaffold + pointer bump | `fc4b57d` | ✅ closed |
| M10-S8a | `@curaos/notify-sdk` (first real SDK — sets the recipe) | [#278](https://github.com/your-org/curaos-ai-workspace/issues/278) | [curaos#177](https://github.com/your-org/curaos/pull/177) | `9e632e6` | ✅ closed |
| M10-S8.x | `gen:sdk` recipe emitter + notify-sdk smoke harden | [#308](https://github.com/your-org/curaos-ai-workspace/issues/308) | [curaos#178](https://github.com/your-org/curaos/pull/178) | `bcb93c3` | ✅ closed |
| M10-S8b | 6 SDK packages from service contracts | [#279-284](https://github.com/your-org/curaos-ai-workspace/issues/279) | [curaos#179](https://github.com/your-org/curaos/pull/179) | `8fbacd0` | ✅ closed |
| M10-S8.1 | cross-service integration matrix (in-process) | [#285](https://github.com/your-org/curaos-ai-workspace/issues/285) | [curaos#180](https://github.com/your-org/curaos/pull/180) | `edd5e5c` | ✅ closed |
| M10-S8.2 | observability dashboards + per-service perf baseline | [#286](https://github.com/your-org/curaos-ai-workspace/issues/286) | [curaos#181](https://github.com/your-org/curaos/pull/181) | `045251b` | ✅ closed |
| M10-S9 | M10 close-gate verify + Epic #24 DoD assessment | [#312](https://github.com/your-org/curaos-ai-workspace/issues/312) | this close-gate PR pair | `scripts/m10-verify.sh` | ✅ this gate |

(16 child Stories #271-286; #278-284 = the 7 SDK Stories, #285/#286 the capstone lanes. #308 is the in-lane recipe-emitter slice that hardened the `gen:sdk` recipe before the 6-SDK fan-out.)

---

## Operator-driven residuals (NOT in-session — by design)

These are the Epic-#24 DoD items that are LIVE/infra-gated. They are legitimately
`warn_check` in `m10-verify.sh` (the build-completeness items hard-PASS):

| Residual | State | Trigger |
|----------|-------|---------|
| 7 services healthy in a live dev cluster | Scaffolds + dashboards landed; the live health probe needs a deployed cluster. | Operator deploys the 7 services to a dev cluster + observes the dashboards green. |
| 7 SDKs PUBLISHED to Verdaccio (#307) | SDKs BUILD + are consumable via packed tarball (acceptance #2 met). Live `bun publish` returns `ENEEDAUTH` — no provisioned publisher credential in the local Verdaccio htpasswd. | Operator provisions a `curaos-ci`/`curaos-admin` publisher per [#307](https://github.com/your-org/curaos-ai-workspace/issues/307), then `bun publish`. |
| Real k6 perf soak + recorded p95 | Per-service `ops/perf/<svc>/baseline.ts` k6 drivers landed (HARD gate on `m10_<svc>_latency` p(95)). The real soak needs a k6 binary + deployed services. | Operator runs `PERF_RATE=… PERF_DURATION=… k6 run ops/perf/<svc>/baseline.ts`; JSON percentiles are the published evidence. |
| Real-infra integration run (PG + Redpanda + OpenSearch) | The in-process `m10-cross-service` harness is green (choreography matrix). The real-infra run needs live Postgres + Redpanda + OpenSearch. | Operator runs the harness against real infra per the harness README. |

---

## Verification command checklist (observed 2026-06-02)

| Check | Command | Expected | Observed |
|-------|---------|----------|----------|
| 7 service submodules registered | `grep -q backend/services/<svc> .gitmodules` ×7 | exit 0 | ✅ all 7 |
| 7 services scaffolded + `.tsp` contract | `[ -d …/src ] && [ -f …/specs/<name>.tsp ]` ×7 | exit 0 | ✅ all 7 (notify/storage/search/settings/reports/calendar/tasks) |
| 7 SDK packages present | `[ -d backend/packages/<sdk> ]` ×7 | exit 0 | ✅ all 7 |
| 7 SDK barrel exports (rest + client) | `grep "export \* from './rest'" + "export { client }"` ×7 | exit 0 | ✅ all 7 (createClient-configurable client) |
| 7 SDK typecheck green | `bun run typecheck` (tsc --noEmit) ×7 | exit 0 | ✅ all 7 |
| 7 Grafana dashboards + rollup | `[ -f ops/observability/dashboards/<svc>.json ]` + `m10-cluster-rollup.json` | exit 0 | ✅ 7 + rollup |
| 7 OpenSLO defs | `grep apiVersion: openslo/v1 ops/slo/<svc>/_default.openslo.yaml` ×7 | exit 0 | ✅ all 7 |
| 7 k6 perf baselines | `[ -f ops/perf/<svc>/baseline.ts ]` ×7 | exit 0 | ✅ all 7 |
| perf baseline-config unit bucket | `bun test ops/perf/lib/baseline-config.test.ts` | `0 fail` | ✅ 11 pass / 0 fail |
| cross-service integration harness | `cd test/integration/m10-cross-service && bun test` | `0 fail` | ✅ 10 pass / 3 skip / 0 fail (in-process) |
| dep-cruiser seam rules wired + clean | `grep no-cross-service-src-import …; bun run depcruise` | 0 errors | ✅ |
| ci-gates.yaml ↔ GH workflows in sync | `node scripts/check-ci-gates-sync.js` | exit 0 | ✅ 10 checks in sync |
| PR-containment (9 deliverables) | `git merge-base --is-ancestor <sha> origin/main` ×9 | all ancestors | ✅ `9e632e6`/`bcb93c3`/`8fbacd0`/`edd5e5c`/`045251b` + 4 pointer bumps |
| 16 child Stories terminal | `gh issue view <n> --json state` ×16 (#271-286) | CLOSED | ✅ all 16 |
| Doc graph clean | `bun scripts/check-doc-graph.js` | exit 0 | ✅ |
| ai/curaos mirror parity | `bash scripts/check-ai-mirror.sh` | exit 0 | ✅ 1:1 (7 services + 7 SDKs mirrored) |

**Close-gate result:** `bash curaos/scripts/m10-verify.sh` → **PASS: 127, FAIL: 0, WARN: 4** (exit 0).
The 4 WARNs are all expected — they are the 4 operator-driven residuals (live
cluster health, Verdaccio publish #307, real k6 soak, real-infra integration
run). `bun install --frozen-lockfile` was clean (PASS) this run; if it WARNs on a
future run that is pre-existing workspace drift tracked separately, NOT M10. The
checklist + HANDOVER + ISSUE-ROADMAP presence checks PASS once this close-gate PR
pair's workspace-branch docs land (they are `warn_check`, so they WARN only when
verified from a checkout that lacks the workspace branch).

---

## No-false-green proof (close-gate self-audit)

The gate is built to FAIL when it should — the build-completeness items are
PASS-gated; only LIVE/operator-driven or absent-from-a-bare-checkout items are
`warn_check`:

- **PR-containment is SHA-pinned** — each deliverable is checked by EXACT
  merge-commit SHA via `git merge-base --is-ancestor <sha> origin/main`, not a
  loose `(#NNN)` token. A non-ancestor or absent SHA → `FAIL`, exit 1.
  "Landed, not reverted" is proven jointly by SHA-ancestry + the artifact-presence
  checks (sections [3]-[6] confirm the deliverable's files are in the current
  `origin/main` tree).
- **Revert detection** — a `Revert "…<sha-prefix>"` subject on `origin/main` makes
  the matching `containment_check` FAIL.
- **All-skipped / zero-test false-green is closed** — the perf-config + integration
  test gates route through `is_green_test`, which requires exit 0 **AND** `0 fail`
  **AND** a positive pass count (`[1-9]… pass`). A suite that ran 0 tests or
  all-skipped → FAIL.
- **Scaffold completeness is hard-gated** — a populated service with no `src/` or
  no `specs/<name>.tsp` → FAIL (a defective scaffold cannot pass). A populated SDK
  whose `src/index.ts` is missing the REST barrel or the `client` export → FAIL.
- **Terminal-state needs `gh`** — when `gh` is unavailable the gate FAILs (not
  WARNs); a WARN-and-exit-0 would hide an open lane. The sweep covers all 16 child
  Stories (#271-286).
- **ai-mirror is hard-gated** — a missing ai-mirror trio for any M10 service/SDK →
  FAIL. (This gate caught the 6 SDK mirrors — calendar/reports/search/settings/
  storage/tasks — that landed in `curaos/` but were never mirrored to `ai/curaos/`;
  the close-gate PR fixes the drift.)

The 7 services' scaffold + contract, the 7 SDKs' barrel + typecheck, the
observability artifacts, the in-process integration harness, the dep-cruiser
boundary, PR-containment, terminal-state, doc-graph, and ai-mirror all
**hard-PASS** (never `warn_check`). Only genuinely-absent-from-a-bare-checkout or
operator-driven items use `warn_check` (frozen-lockfile drift, live cluster
health, Verdaccio publish #307, real k6 soak, real-infra integration run, the
workspace-branch docs).
