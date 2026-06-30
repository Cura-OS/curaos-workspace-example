#!/usr/bin/env bash
# tier-e-local.sh (RP-17): LOCAL Tier E security runner - the DEFAULT execution
# path for the nightly security tier per [[curaos-quality-gates-rule]] and
# [[curaos-local-ci-first-rule]]. GitHub Actions tier-e-nightly.yml is
# workflow_dispatch-only (billing exhausted), so Tier E runs LOCALLY via a
# cron or launchd schedule invoking this script (see
# scripts/install-tier-e-schedule.sh). `gh workflow run tier-e-nightly.yml`
# is reserved for approval-gated one-off workflow-body validation only.
#
# Gates (mirror curaos/ci-gates.yaml Tier E jobs; all four are blocking:false
# there, so FINDINGS record warn, but an unrunnable scanner FAILS CLOSED):
#   sast-deep          semgrep deep ruleset (local CodeQL substitute)
#   stryker-full       bunx stryker run --break-at 60 (GHA `|| true` parity)
#   sbom-cve           syft+grype when both installed, else osv-scanner
#   renovate-validate  renovate.json present + parses (--full-renovate for
#                      the real renovate-config-validator via bunx)
#
# Usage:
#   bash scripts/tier-e-local.sh [--target <dir>] [--state-dir <dir>]
#       [--skip <gate> --skip-reason "<why>"]... [--full-renovate]
#
# Env:
#   TIER_E_STATE_DIR       evidence root (default ~/.local/state/curaos/tier-e)
#   TIER_E_SEMGREP_CONFIG  space-separated semgrep configs
#                          (default "p/security-audit p/owasp-top-ten p/secrets")
#
# Evidence: <state-dir>/runs/<UTC-stamp>/ (per-gate logs + summary.json) and
# <state-dir>/latest.json, consumed by scripts/check-tier-e-freshness.sh
# (the wave-done stop-predicate "Tier E evidence newer than N days").
set -uo pipefail

GATE_NAMES="sast-deep stryker-full sbom-cve renovate-validate"

usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$REPO_DIR/curaos"
STATE_DIR="${TIER_E_STATE_DIR:-$HOME/.local/state/curaos/tier-e}"
FULL_RENOVATE=0
SKIP_SPEC=""   # newline-separated "gate<TAB>reason" records (bash-3.2 safe)

while [ $# -gt 0 ]; do
  case "$1" in
    --target)    TARGET="${2:?--target needs a directory}"; shift 2 ;;
    --state-dir) STATE_DIR="${2:?--state-dir needs a directory}"; shift 2 ;;
    --skip)
      gate="${2:?--skip needs a gate name}"; shift 2
      case " $GATE_NAMES " in
        *" $gate "*) : ;;
        *) echo "tier-e-local: unknown gate '$gate' (gates: $GATE_NAMES)" >&2; exit 2 ;;
      esac
      if [ "${1:-}" = "--skip-reason" ] && [ -n "${2:-}" ]; then
        SKIP_SPEC="${SKIP_SPEC}${gate}	${2}
"
        shift 2
      else
        # Fail closed: an unexplained skip leaves the security tier silently
        # un-run, which is the exact defect RP-17 remediates.
        echo "tier-e-local: --skip $gate requires --skip-reason \"<why>\"" >&2
        exit 2
      fi
      ;;
    --full-renovate) FULL_RENOVATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "tier-e-local: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "tier-e-local: jq missing; failing closed" >&2; exit 1; }
[ -d "$TARGET" ] || { echo "tier-e-local: target '$TARGET' is not a directory; failing closed" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$STATE_DIR/runs/$RUN_ID"
mkdir -p "$RUN_DIR" || { echo "tier-e-local: cannot create $RUN_DIR; failing closed" >&2; exit 1; }
GATES_FILE="$RUN_DIR/gates.json"
printf '[]' > "$GATES_FILE"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ANY_FAIL=0

record() { # record <gate> <pass|warn|skip|fail> <detail>
  jq --arg n "$1" --arg s "$2" --arg d "$3" \
    '. += [{name: $n, status: $s, detail: $d}]' \
    "$GATES_FILE" > "$GATES_FILE.tmp" && mv "$GATES_FILE.tmp" "$GATES_FILE"
  [ "$2" = "fail" ] && ANY_FAIL=1
  printf '  [%s] %-17s %s\n' "$2" "$1" "$3"
}

skip_reason() { # prints the reason if the gate is skipped; rc 1 otherwise
  printf '%s' "$SKIP_SPEC" | awk -F '\t' -v g="$1" '$1 == g { print $2; found = 1 } END { exit found ? 0 : 1 }'
}

echo "tier-e-local: target=$TARGET run=$RUN_ID"
echo "tier-e-local: evidence -> $RUN_DIR"

# ── Gate 1: sast-deep (semgrep deep ruleset = local CodeQL substitute) ───────
if reason="$(skip_reason sast-deep)"; then
  record sast-deep skip "$reason"
elif ! command -v semgrep >/dev/null 2>&1; then
  record sast-deep fail "semgrep not installed (brew install semgrep); cannot prove SAST ran - failing closed"
else
  SEMGREP_CONFIGS="${TIER_E_SEMGREP_CONFIG:-p/security-audit p/owasp-top-ten p/secrets}"
  set -- ;
  for c in $SEMGREP_CONFIGS; do set -- "$@" --config "$c"; done
  semgrep scan --metrics=off --error --quiet --json \
    --output "$RUN_DIR/sast-deep.json" "$@" "$TARGET" \
    > "$RUN_DIR/sast-deep.log" 2>&1
  rc=$?
  findings="$(jq -r '.results | length' "$RUN_DIR/sast-deep.json" 2>/dev/null || echo '?')"
  if [ $rc -eq 0 ]; then
    record sast-deep pass "semgrep [$SEMGREP_CONFIGS]: 0 findings"
  elif [ $rc -eq 1 ]; then
    record sast-deep warn "semgrep [$SEMGREP_CONFIGS]: $findings findings (blocking:false parity; see sast-deep.json)"
  else
    record sast-deep fail "semgrep errored (exit $rc); see sast-deep.log - failing closed"
  fi
fi

# ── Gate 2: stryker-full (full mutation suite) ───────────────────────────────
if reason="$(skip_reason stryker-full)"; then
  record stryker-full skip "$reason"
else
  has_stryker_config=0
  for f in stryker.config.json stryker.config.js stryker.config.cjs stryker.config.mjs stryker.conf.json stryker.conf.js; do
    [ -f "$TARGET/$f" ] && has_stryker_config=1 && break
  done
  if [ "$has_stryker_config" -eq 0 ]; then
    record stryker-full warn "no stryker config at target root (GHA parity: 'bunx stryker run --break-at 60 || true' errors instantly); real mutation scope tracked by the Tier E schedule-decision issue"
  elif ! command -v bun >/dev/null 2>&1; then
    record stryker-full fail "stryker config present but bun missing; cannot run mutation suite - failing closed"
  else
    (cd "$TARGET" && bunx stryker run --break-at 60) > "$RUN_DIR/stryker-full.log" 2>&1
    rc=$?
    if [ $rc -eq 0 ]; then
      record stryker-full pass "full mutation suite green (break-at 60)"
    else
      record stryker-full warn "stryker exit $rc (blocking:false '|| true' parity per ci-gates.yaml); see stryker-full.log"
    fi
  fi
fi

# ── Gate 3: sbom-cve (syft+grype preferred, osv-scanner fallback) ────────────
if reason="$(skip_reason sbom-cve)"; then
  record sbom-cve skip "$reason"
elif command -v syft >/dev/null 2>&1 && command -v grype >/dev/null 2>&1; then
  if syft "dir:$TARGET" -o "spdx-json=$RUN_DIR/sbom.spdx.json" > "$RUN_DIR/sbom-cve.log" 2>&1; then
    grype "sbom:$RUN_DIR/sbom.spdx.json" --fail-on high >> "$RUN_DIR/sbom-cve.log" 2>&1
    rc=$?
    if [ $rc -eq 0 ]; then
      record sbom-cve pass "syft SBOM + grype: no high+ CVEs"
    else
      record sbom-cve warn "grype exit $rc: high+ CVEs present (blocking:false parity); see sbom-cve.log"
    fi
  else
    record sbom-cve fail "syft SBOM generation errored; see sbom-cve.log - failing closed"
  fi
elif command -v osv-scanner >/dev/null 2>&1; then
  osv-scanner scan source --recursive --all-packages --format json \
    --output-file "$RUN_DIR/sbom-cve.osv.json" "$TARGET" \
    > "$RUN_DIR/sbom-cve.log" 2>&1
  rc=$?
  vulns="$(jq -r '[.results[]?.packages[]?.vulnerabilities[]?] | length' "$RUN_DIR/sbom-cve.osv.json" 2>/dev/null || echo '?')"
  if [ $rc -eq 0 ]; then
    record sbom-cve pass "osv-scanner: 0 known vulnerabilities (package inventory archived in sbom-cve.osv.json)"
  elif [ $rc -eq 1 ]; then
    record sbom-cve warn "osv-scanner: $vulns known vulnerabilities (blocking:false parity); see sbom-cve.osv.json"
  else
    record sbom-cve fail "osv-scanner errored (exit $rc); see sbom-cve.log - failing closed"
  fi
else
  record sbom-cve fail "neither syft+grype nor osv-scanner installed (brew install osv-scanner); failing closed"
fi

# ── Gate 4: renovate-validate (dep-update review config) ────────────────────
if reason="$(skip_reason renovate-validate)"; then
  record renovate-validate skip "$reason"
elif [ ! -f "$TARGET/renovate.json" ]; then
  record renovate-validate fail "renovate.json missing at target root; dep-update review unprovable - failing closed"
elif ! jq empty "$TARGET/renovate.json" > "$RUN_DIR/renovate-validate.log" 2>&1; then
  record renovate-validate fail "renovate.json unparseable; see renovate-validate.log - failing closed"
elif [ "$FULL_RENOVATE" -eq 1 ]; then
  if command -v bun >/dev/null 2>&1 \
    && (cd "$TARGET" && bunx --package renovate renovate-config-validator renovate.json) \
       > "$RUN_DIR/renovate-validate.log" 2>&1; then
    record renovate-validate pass "renovate-config-validator green"
  else
    record renovate-validate fail "renovate-config-validator failed (or bun missing); see renovate-validate.log"
  fi
else
  record renovate-validate pass "renovate.json present + parses (jq); run with --full-renovate for the full validator"
fi

# ── Summary + latest.json ────────────────────────────────────────────────────
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STATUS=completed
[ "$ANY_FAIL" -eq 1 ] && STATUS=failed
jq -n \
  --arg schema "1" \
  --arg run_id "$RUN_ID" \
  --arg started_at "$STARTED_AT" \
  --arg completed_at "$COMPLETED_AT" \
  --arg target "$TARGET" \
  --arg host "$(hostname 2>/dev/null || echo unknown)" \
  --arg runner "scripts/tier-e-local.sh" \
  --arg status "$STATUS" \
  --slurpfile gates "$GATES_FILE" \
  '{schema: ($schema | tonumber), run_id: $run_id, started_at: $started_at,
    completed_at: $completed_at, target: $target, host: $host,
    runner: $runner, gates: $gates[0], status: $status}' \
  > "$RUN_DIR/summary.json"
cp "$RUN_DIR/summary.json" "$STATE_DIR/latest.json"

echo "tier-e-local: status=$STATUS summary=$RUN_DIR/summary.json (latest.json updated)"
[ "$STATUS" = "completed" ]
