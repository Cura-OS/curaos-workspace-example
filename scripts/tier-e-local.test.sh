#!/usr/bin/env bash
# Tests for tier-e-local.sh (RP-17 local Tier E runner). Hermetic: scanners are
# PATH stubs in a throwaway bin dir; no network, no real scans, no writes
# outside mktemp dirs.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/tier-e-local.sh"
FRESHNESS="$DIR/check-tier-e-freshness.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fixture target: minimal repo shape with a valid renovate.json, no stryker
# config (the warn path; never invokes bun).
TARGET="$TMP/target"
mkdir -p "$TARGET"
printf '{"extends":["config:recommended"]}\n' > "$TARGET/renovate.json"
printf 'export const x = 1;\n' > "$TARGET/index.ts"

# Stub scanners. STUBS contains semgrep + osv-scanner; STUBS_NOSAST omits
# semgrep so `command -v semgrep` fails (PATH is restricted to system dirs,
# where semgrep never lives, plus the stub dir).
STUBS="$TMP/stubs"
STUBS_NOSAST="$TMP/stubs-nosast"
mkdir -p "$STUBS" "$STUBS_NOSAST"

make_semgrep() { # make_semgrep <dir> <exit-code> <findings-count>
  cat > "$1/semgrep" <<EOF
#!/bin/sh
# stub semgrep: writes a results JSON to the path after --output, exits $2
out=""
prev=""
for a in "\$@"; do
  if [ "\$prev" = "--output" ]; then out="\$a"; fi
  prev="\$a"
done
[ -n "\$out" ] && printf '{"results":[%s]}' '$3' > "\$out"
exit $2
EOF
  chmod +x "$1/semgrep"
}

cat > "$STUBS/osv-scanner" <<'EOF'
#!/bin/sh
# stub osv-scanner: writes an empty-results JSON to --output-file, exits 0
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "--output-file" ]; then out="$a"; fi
  prev="$a"
done
[ -n "$out" ] && printf '{"results":[]}' > "$out"
exit 0
EOF
chmod +x "$STUBS/osv-scanner"
cp "$STUBS/osv-scanner" "$STUBS_NOSAST/osv-scanner"
make_semgrep "$STUBS" 0 ""

# Restricted PATH: stubs first, then system dirs only (jq/date/awk/hostname
# live in /usr/bin; bash in /bin). Homebrew + user dirs excluded so real
# scanners never leak into the test.
SYSPATH="/usr/bin:/bin:/usr/sbin:/sbin"

run_tier_e() { # run_tier_e <stub-dir> <state-dir> [extra args...]
  local stubs="$1" state="$2"; shift 2
  ( PATH="$stubs:$SYSPATH" TIER_E_STATE_DIR="$state" \
    bash "$SCRIPT" --target "$TARGET" "$@" 2>&1 )
  printf 'EXIT=%s\n' "$?"
}

# 1) full run with stubbed scanners completes: pass/warn gates, no skips,
#    summary archived, latest.json status=completed
STATE1="$TMP/state1"
out="$(run_tier_e "$STUBS" "$STATE1")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'status=completed' \
  && [ -f "$STATE1/latest.json" ] \
  && [ "$(jq -r '.status' "$STATE1/latest.json")" = "completed" ] \
  && [ "$(jq -r '.gates | length' "$STATE1/latest.json")" = "4" ] \
  && [ "$(jq -r '.gates[] | select(.name=="sast-deep") | .status' "$STATE1/latest.json")" = "pass" ] \
  && [ "$(jq -r '.gates[] | select(.name=="stryker-full") | .status' "$STATE1/latest.json")" = "warn" ] \
  && [ "$(jq -r '.gates[] | select(.name=="sbom-cve") | .status' "$STATE1/latest.json")" = "pass" ] \
  && [ "$(jq -r '.gates[] | select(.name=="renovate-validate") | .status' "$STATE1/latest.json")" = "pass" ]; then
  ok "full stubbed run completes with archived 4-gate summary"
else
  nok "full stubbed run" "$out"
fi

# 2) the freshness stop-predicate accepts that fresh run
out="$( TIER_E_STATE_DIR="$STATE1" bash "$FRESHNESS" 2>&1; printf 'EXIT=%s\n' "$?" )"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "check-tier-e-freshness passes on the fresh archived run"
else
  nok "freshness integration" "$out"
fi

# 3) semgrep findings (exit 1) record warn, run still completes (blocking:false parity)
STATE3="$TMP/state3"
STUBS_FINDINGS="$TMP/stubs-findings"
mkdir -p "$STUBS_FINDINGS"
cp "$STUBS/osv-scanner" "$STUBS_FINDINGS/osv-scanner"
make_semgrep "$STUBS_FINDINGS" 1 '{"check_id":"x"}'
out="$(run_tier_e "$STUBS_FINDINGS" "$STATE3")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && [ "$(jq -r '.gates[] | select(.name=="sast-deep") | .status' "$STATE3/latest.json")" = "warn" ] \
  && jq -r '.gates[] | select(.name=="sast-deep") | .detail' "$STATE3/latest.json" | grep -q '1 findings'; then
  ok "semgrep findings record warn; run completes (blocking:false parity)"
else
  nok "findings warn path" "$out"
fi

# 4) missing semgrep binary FAILS CLOSED: gate fail, exit 1, status=failed
STATE4="$TMP/state4"
out="$(run_tier_e "$STUBS_NOSAST" "$STATE4")"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'status=failed' \
  && [ "$(jq -r '.gates[] | select(.name=="sast-deep") | .status' "$STATE4/latest.json")" = "fail" ]; then
  ok "missing semgrep fails closed (exit 1, status=failed archived)"
else
  nok "missing scanner fail-closed" "$out"
fi

# 5) the freshness stop-predicate REJECTS the failed run
out="$( TIER_E_STATE_DIR="$STATE4" bash "$FRESHNESS" 2>&1; printf 'EXIT=%s\n' "$?" )"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q "status is 'failed'"; then
  ok "check-tier-e-freshness rejects a failed run"
else
  nok "freshness rejects failed run" "$out"
fi

# 6) --skip without --skip-reason fails closed (exit 2, nothing archived)
STATE6="$TMP/state6"
out="$(run_tier_e "$STUBS" "$STATE6" --skip stryker-full)"
if printf '%s' "$out" | grep -q 'EXIT=2' \
  && printf '%s' "$out" | grep -q 'requires --skip-reason' \
  && [ ! -f "$STATE6/latest.json" ]; then
  ok "--skip without --skip-reason exits 2 (fail closed)"
else
  nok "unexplained skip" "$out"
fi

# 7) --skip with reason records the skip verbatim in the evidence
STATE7="$TMP/state7"
out="$(run_tier_e "$STUBS" "$STATE7" --skip stryker-full --skip-reason "lane constraint: target checkout is read-only")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && [ "$(jq -r '.gates[] | select(.name=="stryker-full") | .status' "$STATE7/latest.json")" = "skip" ] \
  && jq -r '.gates[] | select(.name=="stryker-full") | .detail' "$STATE7/latest.json" | grep -q 'read-only'; then
  ok "explained skip is archived verbatim"
else
  nok "explained skip" "$out"
fi

# 8) unknown gate name in --skip fails closed
out="$(run_tier_e "$STUBS" "$TMP/state8" --skip no-such-gate --skip-reason x)"
if printf '%s' "$out" | grep -q 'EXIT=2' \
  && printf '%s' "$out" | grep -q 'unknown gate'; then
  ok "unknown --skip gate exits 2"
else
  nok "unknown gate" "$out"
fi

# 9) missing renovate.json fails closed
STATE9="$TMP/state9"
TARGET_NORENO="$TMP/target-noreno"
mkdir -p "$TARGET_NORENO"
out="$( PATH="$STUBS:$SYSPATH" TIER_E_STATE_DIR="$STATE9" \
  bash "$SCRIPT" --target "$TARGET_NORENO" 2>&1; printf 'EXIT=%s\n' "$?" )"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && [ "$(jq -r '.gates[] | select(.name=="renovate-validate") | .status' "$STATE9/latest.json")" = "fail" ]; then
  ok "missing renovate.json fails closed"
else
  nok "missing renovate.json" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
