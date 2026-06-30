#!/usr/bin/env bash
# check-tier-e-freshness.sh (RP-17): wave-done stop-predicate "Tier E evidence
# newer than N days" per [[curaos-quality-gates-rule]]. A milestone wave cannot
# settle to a terminal state while the local Tier E security tier evidence is
# missing, stale, failed, or unparseable (FAIL CLOSED on every one of those).
#
# Reads <state-dir>/latest.json written by scripts/tier-e-local.sh.
#
# Usage: bash scripts/check-tier-e-freshness.sh
# Env:
#   TIER_E_STATE_DIR      evidence root (default ~/.local/state/curaos/tier-e)
#   TIER_E_MAX_AGE_DAYS   freshness window in days (default 7)
#
# Exit 0 only when latest.json exists, parses, has status "completed", and its
# completed_at is newer than the window. Everything else exits 1.
set -uo pipefail

STATE_DIR="${TIER_E_STATE_DIR:-$HOME/.local/state/curaos/tier-e}"
MAX_AGE_DAYS="${TIER_E_MAX_AGE_DAYS:-7}"
LATEST="$STATE_DIR/latest.json"

fail() { echo "check-tier-e-freshness: FAIL: $1" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || fail "jq missing; failing closed"

case "$MAX_AGE_DAYS" in
  ''|*[!0-9]*) fail "TIER_E_MAX_AGE_DAYS='$MAX_AGE_DAYS' is not a positive integer; failing closed" ;;
esac
[ "$MAX_AGE_DAYS" -ge 1 ] || fail "TIER_E_MAX_AGE_DAYS must be >= 1; failing closed"

[ -f "$LATEST" ] \
  || fail "no Tier E evidence at $LATEST - run 'bash scripts/tier-e-local.sh' (the LOCAL default path; not gh workflow run)"

jq empty "$LATEST" 2>/dev/null \
  || fail "$LATEST is not valid JSON; failing closed"

status="$(jq -r '.status // empty' "$LATEST")"
[ "$status" = "completed" ] \
  || fail "latest Tier E run status is '${status:-missing}' (need 'completed'); re-run scripts/tier-e-local.sh"

completed_at="$(jq -r '.completed_at // empty' "$LATEST")"
[ -n "$completed_at" ] || fail "latest.json has no completed_at; failing closed"

age_days="$(jq -rn --arg ts "$completed_at" \
  '(now - ($ts | fromdateiso8601)) / 86400 | floor' 2>/dev/null)" \
  || fail "completed_at '$completed_at' is not ISO-8601 UTC; failing closed"
[ -n "$age_days" ] || fail "could not compute evidence age from '$completed_at'; failing closed"

if [ "$age_days" -lt 0 ]; then
  fail "completed_at '$completed_at' is in the future; clock or evidence is wrong - failing closed"
fi
if [ "$age_days" -ge "$MAX_AGE_DAYS" ]; then
  fail "Tier E evidence is stale: ${age_days}d old (window ${MAX_AGE_DAYS}d, completed_at $completed_at) - run 'bash scripts/tier-e-local.sh'"
fi

run_id="$(jq -r '.run_id // "unknown"' "$LATEST")"
echo "check-tier-e-freshness: OK: run $run_id completed $completed_at (${age_days}d old, window ${MAX_AGE_DAYS}d, status completed)"
