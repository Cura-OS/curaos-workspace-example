# Runbook — identity-service login-latency baseline (M9-S8 #105)

> Issue: [your-org/curaos-ai-workspace#105](https://github.com/your-org/curaos-ai-workspace/issues/105)
> Scenario: `curaos/backend/services/identity-service/ops/perf/identity-service/login-baseline.ts`
> SLO ("SLO" here = **Service Level Objective**, not SAML Single Logout): login **P95 < 250 ms**
> (Keycloak 26.4 class), 1000 logins/sec via k6 `constant-arrival-rate`.
> Rule basis: [[curaos-perf-testing-rule]] · Research:
> [research/2026-06-01-m9-s8-login-baseline-research.md](../research/2026-06-01-m9-s8-login-baseline-research.md)

## TL;DR — one command

```bash
# From the curaos/ repo root, against a deployed identity-service:
IDENTITY_BASE_URL=http://localhost:3000 \
LOGIN_TENANT_SLUG=alpha \
LOGIN_REGISTRATION_TOKEN=alpha-registration-token \
just identity-login-baseline
```

This runs the k6 driver, archives the JSON summary to
`backend/services/identity-service/ops/perf/identity-service/results/login-baseline-<UTC-stamp>.json`,
and **propagates k6's exit code** — non-zero when the HARD cold-gate `p(95)<250`,
`dropped_iterations==0`, or `checks>0.99` gate is breached.

Equivalent without `just`:

```bash
bash backend/services/identity-service/scripts/login-baseline.sh
```

Raw k6 invocation (from the service dir):

```bash
cd backend/services/identity-service
IDENTITY_BASE_URL=http://localhost:3000 LOGIN_TENANT_SLUG=alpha \
LOGIN_REGISTRATION_TOKEN=alpha-registration-token \
RESULTS_FILE=ops/perf/identity-service/results/login-baseline-$(date -u +%Y%m%dT%H%M%SZ).json \
k6 run ops/perf/identity-service/login-baseline.ts
```

## Prerequisites

- **k6 installed** — `k6 --version` must succeed. Install:
  <https://grafana.com/docs/k6/latest/set-up/install-k6/>. The wrapper `k6 --version`-gates and
  exits `127` with an install hint if absent.
- **A deployed, reachable identity-service** with `/auth/register` + `/auth/login` live, the target
  tenant seeded, and a valid registration token for that tenant.
- `CURAOS_AUTH_PUBLIC_ORIGIN` on the server MUST equal `IDENTITY_BASE_URL` when the service is behind
  a proxy — the DPoP `htu` the driver signs must match what the server expects (else login 400s).

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `IDENTITY_BASE_URL` / `BASE_URL` | `http://localhost:3000` | Service base URL (`IDENTITY_BASE_URL` wins; `BASE_URL` is the divergence-driver convention fallback). Trailing slash stripped. |
| `LOGIN_TENANT_SLUG` | `alpha` | Primary tenant slug (also accepts `STAGING_TENANT_SLUG` / `M3_TENANT_SLUG`). |
| `LOGIN_TENANT_SLUGS` | the single slug | CSV spread list for cold/warm round-robin. Burst always uses the FIRST slug. |
| `LOGIN_REGISTRATION_TOKEN` | `alpha-registration-token` | Tenant registration token (also `STAGING_*` / `M3_*`). |
| `LOGIN_PASSWORD` | `Password123!` | Synthetic password (12-char min). NEVER a real credential. |
| `LOGIN_RATE` | `1000` | Target logins/sec (the arrival rate). |
| `LOGIN_TIME_UNIT` | `1s` | Window the rate applies over. |
| `LOGIN_DURATION` | `1m` | Measured-pass duration (each of cold/warm/burst). |
| `LOGIN_PRE_ALLOCATED_VUS` | `= LOGIN_RATE` | VUs allocated up front (floored to rate). |
| `LOGIN_MAX_VUS` | `ceil(preAllocated*1.5)` | VU ceiling (floored to preAllocated). |
| `USER_POOL_SIZE` | `2000` | Synthetic users pre-registered in setup (split cold/warm). Large so cold VUs hit distinct users, sidestepping any per-account throttle. |
| `RUN_WARM` / `RUN_BURST` | on | Set to `0` to skip the warm / burst pass. |
| `RESULTS_FILE` | stamped default | Override the JSON artifact path. |

## What it measures — three staggered passes

1. **`login_cold`** (startTime `0s`) → Trend **`m9_login_latency_cold`** — **THIS IS THE CI GATE**
   (`p(95)<250`). Fresh synthetic users never logged in: the worst case a real first-login user hits
   (DB rows not yet in the PG buffer cache, argon2 verify path cold, JWT signer primed only at
   startup).
2. **`login_warm`** (startTime `70s`) → Trend `m9_login_latency_warm` — **warning-only**. A user pool
   logged in ONCE in `setup()` (the primer) re-logs in, so the service/DB/refresh-session working set
   is warm. Reported for the cold-vs-warm delta. NOTE (per the service README "Storage boundary
   note"): in this shell `LoginLockoutStore` + `DpopReplayStore` are **in-memory defaults**; warmth
   here is the process/DB working set, NOT a pre-claimed DPoP-replay entry. Every login signs a
   **fresh** DPoP proof (new `jti`), so the active replay store never rejects a measured request.
3. **`tenant_burst`** (startTime `140s`) → Trend `m9_login_latency_burst` — **warning-only**. Every
   login concentrated on ONE tenant slug (vs the round-robin spread of cold/warm), stressing a single
   tenant's hot path.

### Gate strategy ([[curaos-perf-testing-rule]] §"Threshold strategy")

HARD gates (k6 exits non-zero on breach):
- `m9_login_latency_cold: p(95)<250` — the D6 Service Level Objective.
- `dropped_iterations: count==0` — scenario validity (the arrival rate was sustainable).
- `checks: rate>0.99` — scenario validity (logins overwhelmingly returned 201).

WARNING-only (`abortOnFail:false`, never flake the gate): `m9_login_latency_warm`,
`m9_login_latency_burst`.

## Cold-vs-warm method (defensible gate choice)

The passes are **staggered** (cold first, warm after a 10 s settle past cold's 1 m, burst last) so
cache state is unambiguous: cold runs against the never-touched pool, warm against the
pre-logged-in pool. **The cold pass is the published gate** — the conservative worst case. Warm/burst
quantify the cache + per-tenant-contention deltas but do not gate, so a hot-path optimisation regress
shows up as a warning, not a CI failure.

## Artifact

`handleSummary` writes the full k6 metric set to the `RESULTS_FILE` path (default
`ops/perf/identity-service/results/login-baseline-<UTC-stamp>.json`). The `results/` dir is tracked
(`.gitkeep`); the `*.json` runs are gitignored (`backend/services/identity-service/.gitignore`).
Attach the JSON + the stdout summary block (COLD/WARM/BURST p95) to the issue as the M9 evidence.

## Version state of record (this baseline)

- **identity-service** commit: `a07812c5eac0d61045354a5a02f9f17048f9ffe7`
- **@curaos/auth-sdk** version: `0.0.0` (pre-v1)
- **identity-service** package version: `0.0.0`
- Blocker **#99** (Diamond rolling migration): **CLOSED 2026-05-31T14:00:27Z** — baseline numbers
  are now meaningful (the "do not publish before #99 closes" condition is satisfied).
- When you run the real baseline, RECORD the deployed identity-service image/commit + auth-sdk
  version + the reference environment (CPU, PG, Valkey, network, `IDENTITY_DIAMOND_MODE`) alongside
  the artifact — P95 < 250 ms is only meaningful against a named reference environment.

## Reproducibility / DPoP reuse

The driver REUSES `signDpopProof` + `calculateJwkThumbprint` from
`scripts/m3-perf-baseline.js` by import (same pattern as `divergence-traffic.ts`) — ES256 DPoP proof
construction is **not** reimplemented. The k6-free config helpers
(`ops/perf/identity-service/login-baseline-config.ts`) are unit-tested under `bun test`
(`test/ops/perf/login-baseline-config.test.ts`).

## CI note

k6 is not part of the service `bun run ci` aggregate gate (no k6 binary in the default lane). The
scenario is still validated there by oxlint (covers `ops/`), a `bun build` transpile-check, and the
config-module unit tests.

**k6 is now wired into CI lanes (curaos#262):**

- **PR-time SMOKE** — the `perf-smoke` job in `curaos/ci-gates.yaml` (tier B, `blocking:false`,
  warnings-only) runs `curaos/scripts/perf-smoke.sh`: a short, low-VU login run (`RUN_WARM=0
  RUN_BURST=0`, reduced rate/duration). It `command -v k6`-gates + checks the scenario + probes
  `/healthz`; when k6 / the scenario / a live service is absent it WARN-SKIPs (exit non-zero →
  ci-local records WARN, never a silent PASS, and `blocking:false` keeps the merge gate untouched).
  `just perf-smoke`.
- **HARD cold-gate SOAK** — `.github/workflows/perf-soak.yml` (`workflow_dispatch` only, GitHub
  Actions billing-gated per [[curaos-local-ci-first-rule]]) installs k6 via
  `grafana/setup-k6-action` (SHA-pinned), boots an ephemeral identity-service from the
  `ops/dev/divergence-staging` compose, and runs `curaos/scripts/perf-soak-ci.sh` — the full
  1000-VU cold pass. k6 exits non-zero on a breached `m9_login_latency_cold p(95)<250` /
  validity gate, so the cold-gate step is reported FAILED on a breach with the JSON artifact +
  p95 summary captured. The `perf-soak` job in `ci-gates.yaml` (`partial-mirror`) shares the
  `bash scripts/perf-soak-ci.sh` command verbatim so `check-ci-gates-sync.js` stays IN SYNC; the
  GH-only boot/teardown/k6-install steps live in its `cloud-only:` allowlist. `just perf-soak`.

The operator-driven `just identity-login-baseline` run remains the way to capture the
named-reference-environment evidence for the issue; the SOAK lane is the automated cold-gate.
