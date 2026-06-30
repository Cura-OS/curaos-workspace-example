#!/usr/bin/env bash
# Tests for check-tier-e-freshness.sh (RP-17 stop-predicate). Self-contained:
# fixtures in a throwaway TIER_E_STATE_DIR; includes the demanded stale-evidence
# fixture that MUST make the closeout check fail.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-tier-e-freshness.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STATE="$TMP/state"
mkdir -p "$STATE"

run() { # run [extra env assignments...]
  ( TIER_E_STATE_DIR="$STATE" "$@" bash "$SCRIPT" 2>&1 )
  printf 'EXIT=%s\n' "$?"
}

write_latest() { # write_latest <age-days> <status>
  jq -n --argjson age "$1" --arg status "$2" \
    '{schema: 1, run_id: "test-run", started_at: ((now - $age*86400 - 60) | todate),
      completed_at: ((now - $age*86400) | todate), target: "/tmp/x", host: "test",
      runner: "scripts/tier-e-local.sh", gates: [], status: $status}' \
    > "$STATE/latest.json"
}

# 1) missing evidence fails closed
rm -f "$STATE/latest.json"
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'no Tier E evidence'; then
  ok "missing latest.json exits 1 (fail closed)"
else
  nok "missing evidence" "$out"
fi

# 2) fresh completed evidence passes
write_latest 0 completed
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'OK: run test-run'; then
  ok "fresh completed evidence exits 0"
else
  nok "fresh evidence" "$out"
fi

# 3) STALE-EVIDENCE FIXTURE: 30-day-old run fails the closeout check
write_latest 30 completed
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'stale'; then
  ok "30-day-old evidence exits 1 (stale fixture fails the closeout check)"
else
  nok "stale evidence fixture" "$out"
fi

# 4) evidence exactly at the window boundary fails (newer-than semantics)
write_latest 7 completed
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'stale'; then
  ok "evidence aged exactly N days exits 1"
else
  nok "boundary age" "$out"
fi

# 5) failed run status fails even when fresh
write_latest 0 failed
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q "status is 'failed'"; then
  ok "fresh-but-failed run exits 1"
else
  nok "failed status" "$out"
fi

# 6) malformed JSON fails closed
printf '{not json' > "$STATE/latest.json"
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'not valid JSON'; then
  ok "malformed latest.json exits 1 (fail closed)"
else
  nok "malformed JSON" "$out"
fi

# 7) missing completed_at fails closed
jq -n '{status: "completed"}' > "$STATE/latest.json"
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'no completed_at'; then
  ok "missing completed_at exits 1 (fail closed)"
else
  nok "missing completed_at" "$out"
fi

# 8) widened window via TIER_E_MAX_AGE_DAYS accepts older evidence
write_latest 10 completed
out="$(run env TIER_E_MAX_AGE_DAYS=30)"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "TIER_E_MAX_AGE_DAYS=30 accepts 10-day-old evidence"
else
  nok "window override" "$out"
fi

# 9) non-numeric window fails closed
out="$(run env TIER_E_MAX_AGE_DAYS=soon)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'not a positive integer'; then
  ok "non-numeric TIER_E_MAX_AGE_DAYS exits 1 (fail closed)"
else
  nok "bad window value" "$out"
fi

# 10) future-dated evidence fails closed
write_latest -2 completed
out="$(run env)"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'in the future'; then
  ok "future completed_at exits 1 (fail closed)"
else
  nok "future timestamp" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
