# M9 — Identity/Party/Org/Audit Generated Cluster close-gate checklist

> Tracking: [your-org/curaos-ai-workspace#23](https://github.com/your-org/curaos-ai-workspace/issues/23) (M9 Epic).
> Close-gate Story: [your-org/curaos-ai-workspace#106](https://github.com/your-org/curaos-ai-workspace/issues/106) (M9-S9).
> Verification: `bash curaos/scripts/m9-verify.sh` (run from `curaos/` repo root — the same checkout as the workspace).
>
> M9 grows the first **generated neutral cluster** — `identity-service` +
> `party-core-service` + `org-core-service` + `audit-core-service` — from the
> M6 codegen mold, adds the M3 Diamond audit model to `identity-service` via a
> rolling migration (read/write-both → cutover), choreographs a cross-cluster
> event chain (create org → invite → accept → role grant → durable audit), wires
> a Debezium WAL-CDC outbox path behind a default-off flag, and lands a k6
> 1000-login P95 < 250 ms baseline. The dep-cruiser **cluster boundary CI**
> (vertical → neutral, never reverse) is the structural guard for the seam.

---

## Story / lane merge index

| Lane | Title | Issue | PR / merge | origin/main SHA | Status |
|------|-------|-------|------------|-----------------|--------|
| M9-S1 | Spike: generated cluster topology | [#98](https://github.com/your-org/curaos-ai-workspace/issues/98) | spike (findings) | n/a | ✅ closed |
| M9-S2 | Diamond model in `identity-service` via rolling migration | [#99](https://github.com/your-org/curaos-ai-workspace/issues/99) | identity-service `#51`/`#52`/`#53`/`#241`/`#243` + parent pointer bumps | lineage on `identity-service` main; pointers `#252`/`#253`/`#254` | ✅ closed (Phase D accepted local-staging green per maintainer 2026-05-31) |
| M9-S2 follow-up | Durable audit-divergence ledger (offset re-derive + Postgres) | [#202](https://github.com/your-org/curaos-ai-workspace/issues/202) | identity-service `#243` ledger-authoritative gate | folded into #99 lineage | ✅ closed |
| M9-S2 decision | Define M3 multi-role backfill semantics | [#161](https://github.com/your-org/curaos-ai-workspace/issues/161) | decision (no code) | n/a | ✅ closed |
| M9-S3 | `party-core-service` scaffold via codegen | [#100](https://github.com/your-org/curaos-ai-workspace/issues/100) | codegen `--write` + pointer | populated on main | ✅ closed |
| M9-S4 | `org-core-service` scaffold via codegen | [#101](https://github.com/your-org/curaos-ai-workspace/issues/101) | codegen `--write` + pointer | populated on main | ✅ closed |
| M9-S5 | `audit-core-service` scaffold + hybrid Kafka tiered retention | [#102](https://github.com/your-org/curaos-ai-workspace/issues/102) | [curaos#247](https://github.com/your-org/curaos/pull/247) + [curaos#249](https://github.com/your-org/curaos/pull/249) | `fcfe15d` / `72544ae` | ✅ closed |
| M9-S5.1 | `healthstack-patient-service`: port durable audit-outbox (retire per-resource lock) | [#124](https://github.com/your-org/curaos-ai-workspace/issues/124) | curaos pointer bump `#124` | `43f962c` | ✅ closed |
| M9-S5.x | Codegen: fold durable audit-outbox into service templates | [#155](https://github.com/your-org/curaos-ai-workspace/issues/155) | [curaos#255](https://github.com/your-org/curaos/pull/255) | `fd6b23d` | ✅ closed |
| M9-S5.x | Codegen: fold Phase-A `IdentityCoreModule` patterns into trio | [#153](https://github.com/your-org/curaos-ai-workspace/issues/153) | curaos `#126` | `3f1032b` | ✅ closed |
| M9-S6 | Cross-cluster event chain (org → invite → accept → role → audit) | [#103](https://github.com/your-org/curaos-ai-workspace/issues/103) | invited.v1 `#257` + accepted.v1 `#258` + chain E2E `#259` | `ec6689e` / `65cd02d` / `02e13ed` | ✅ closed |
| M9-S7 | Debezium WAL CDC outbox migration (default-off flag) | [#104](https://github.com/your-org/curaos-ai-workspace/issues/104) | [curaos#160](https://github.com/your-org/curaos/pull/160) + flag [curaos#159](https://github.com/your-org/curaos/pull/159) + identity-service `#70` | `5b714bc` / `647558b` | ✅ closed |
| M9-S8 | k6 baseline 1000 concurrent logins P95 < 250 ms | [#105](https://github.com/your-org/curaos-ai-workspace/issues/105) | [curaos#158](https://github.com/your-org/curaos/pull/158) + identity-service `#69` | `d9b04e7` | ✅ closed |
| M9-S9 | M9 close-gate verify + dep-cruiser cluster boundary CI | [#106](https://github.com/your-org/curaos-ai-workspace/issues/106) | this close-gate PR pair | `scripts/m9-verify.sh` | ✅ this gate |

---

## Operator-driven residuals (NOT in-session — by design)

| Residual | State | Trigger |
|----------|-------|---------|
| Phase-D live staging divergence signal (#99) | Accepted on local-staging gauge (`auth-diamond-divergence == 0`) per maintainer directive 2026-05-31; logged in `adr/AUTO-DECISION-LOG.md`. A production-shaped staging deploy is still the canonical signal. | Operator runs `runbooks/staging-divergence-deploy.md` when staging access exists. |
| Debezium CDC cutover (#104) | Infra landed; **default `poller`**, Debezium path OFF. Strimzi Connect + EventRouter SMT wired, parallel-run-proven required before flip. | Operator runs `runbooks/m9-s7-debezium-cutover.md`, telemetry-gated. |
| k6 1000-VU live run (#105) | Scenario + HARD cold gate (`m9_login_latency_cold: p(95)<250`) landed + unit-tested. The real 1000-VU run needs a deployed service + k6 binary. | Operator runs `scripts/login-baseline.sh` / `just identity-login-baseline`; JSON percentiles are the published evidence. |
| Crash-lost-fact bounded residual (#244) | Foresight follow-up (audit-outbox for the crash-during-drain window). | Tracked separately; not an M9 close blocker. |

---

## Verification command checklist (observed 2026-06-01)

| Check | Command | Expected | Observed |
|-------|---------|----------|----------|
| Cluster submodules registered | `grep -q identity-service .gitmodules && … party/org/audit` | exit 0 | ✅ |
| 4 cluster services tests green | `bun test` per service | `0 fail` | ✅ identity 477 / party 60 / org 87 / audit 39, all 0 fail |
| M3 auth flows — no regression | `bun test test/integration/m3/auth-flow.test.ts` | `0 fail` | ✅ 5 pass / 0 fail |
| Diamond mode + divergence checker present | `[ -f …/diamond-mode.ts ] && [ -d …/divergence ]` | exit 0 | ✅ |
| invited.v1 / accepted.v1 contract tests | `bun test invited-event.contract.test.ts accepted-event.contract.test.ts` | `0 fail` | ✅ 12 pass / 0 fail |
| Audit envelope (SHA-256 hash-chain + PHI scrub) | `grep -q previousHash audit-event.schema.ts` | exit 0 | ✅ |
| Cross-cluster event chain E2E | `bun test cross-cluster-chain-e2e.test.ts` | `0 fail` | ✅ 5 pass / 0 fail (in-process) |
| k6 cold HARD gate present | `grep -q m9_login_latency_cold …; grep 250 login-baseline.ts` | exit 0 | ✅ (live run operator-driven) |
| dep-cruiser cluster boundary rules wired | `grep -q no-neutral-capability-to-vertical .dependency-cruiser.cjs` | exit 0 | ✅ (+ `no-cross-service-src-import`, `no-neutral-to-vertical`) |
| dep-cruiser boundary CI clean | `bun run depcruise` | 0 errors | ✅ (warnings = pre-existing orphans only) |
| Generator-evolution: `CURAOS_OUTBOX_RELAY` fold-back | `grep -rq CURAOS_OUTBOX_RELAY tools/codegen/templates` | exit 0 | ✅ trio (core/personal/business) + snapshot test |
| Codegen template suite green | `cd tools/codegen && bun test` | `0 fail` | ✅ 376 pass / 0 fail / 10 snapshots |
| PR-containment (8 deliverables) | `git log origin/main` token + no-revert | all present | ✅ `#247`/`#249`/`#259`/`#160`/`#159`/`#158`/`#124`/`#255` |
| 6 lanes + decision terminal | `gh issue view <n> --json state` | CLOSED | ✅ `#99`/`#102`/`#103`/`#104`/`#105`/`#124`/`#161` |
| Doc graph clean | `bun scripts/check-doc-graph.js` | exit 0 | ✅ |
| ai/curaos mirror parity | `bash scripts/check-ai-mirror.sh` | exit 0 | ✅ 1:1 |

**Close-gate result:** `bash curaos/scripts/m9-verify.sh` → **PASS: 60, FAIL: 0, WARN: 3** (exit 0).
The 3 WARNs are all expected: (1) `bun install --frozen-lockfile` — pre-existing workspace lockfile drift tracked separately, NOT M9; (2) `k6` binary absent — the live 1000-VU run is operator-driven; (3) this checklist's presence check (lands via the workspace branch in the same PR pair).

---

## No-false-green proof (close-gate self-audit)

The gate is adversarially proven (cross-harness Codex grill, then negative-tested) to FAIL when it should. Hardened after the grill — `grills/m9-s9-106-close-gate.md`:

- **PR-containment is SHA-pinned** — each lane deliverable is checked by EXACT merge-commit SHA via `git merge-base --is-ancestor <sha> origin/main`, not a loose `(#NNN)` token. (The token form was ambiguous: `(#124)` matches BOTH the healthstack audit-outbox pointer AND an unrelated identity bump ending `(#40) (#124)`.) A non-ancestor or absent SHA → `FAIL`, exit 1 (negative-tested with `deadbeef…`). "Landed, not reverted" is proven jointly by SHA-ancestry + the artifact-presence checks (sections [3]-[9] confirm the deliverable's files are in the current `origin/main` tree).
- **Revert detection** — a `Revert "…<sha-prefix>"` subject on `origin/main` makes the matching `containment_check` FAIL.
- **All-skipped / zero-test false-green is closed** — every hard test gate (4 services, M3, contract, E2E, codegen) routes through `is_green_test`, which requires exit 0 **AND** `0 fail` **AND** a positive pass count (`[1-9]… pass`). A suite that ran 0 tests or all-skipped → FAIL (negative-tested). Postgres tests that skip on an unset `CURAOS_*_DATABASE_URL` alongside a positive pass count are correctly green.
- **k6 threshold is the exact literal** `p(95)<250` (a bare `250` in a comment does not satisfy the gate).
- **Terminal-state needs `gh`** — when `gh` is unavailable the gate FAILs (not WARNs); a WARN-and-exit-0 would hide an open lane. The sweep covers all lanes incl. party/org scaffolds (#100/#101).

The four services' unit tests, the in-process E2E chain, the contract tests, the dep-cruiser boundary, PR-containment, and terminal-state all **hard-PASS** (never `warn_check`). Only genuinely-absent-from-a-bare-checkout or operator-driven items use `warn_check` (frozen-lockfile drift, k6 binary, unpopulated submodules, workspace doc scripts).
