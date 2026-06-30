#!/usr/bin/env bash
# Tests for check-ai-mirror.sh (RP-08). Self-contained fixture workspaces via
# CHECK_AI_MIRROR_WS; asserts the compare set is derived (not hardcoded), so
# drift in a non-listed top-level dir (e.g. curaos/tools/) fails the check.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-ai-mirror.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Aligned fixture: grouping dirs mirror 1:1; module internals diverge on
# purpose (src vs agents); submodule + artifact + ai-only-doc dirs ignored.
build_base() {
  local ws="$1"
  mkdir -p "$ws/curaos/backend/services/svc-a/src"
  mkdir -p "$ws/curaos/backend/packages/pkg-a/src"
  mkdir -p "$ws/curaos/ops/dev"
  mkdir -p "$ws/curaos/curaos-website/src"
  mkdir -p "$ws/curaos/node_modules/junk"
  mkdir -p "$ws/curaos/coverage/unit"
  mkdir -p "$ws/curaos/ai/curaos"
  mkdir -p "$ws/ai/curaos/backend/services/svc-a/agents"
  mkdir -p "$ws/ai/curaos/backend/packages/pkg-a"
  mkdir -p "$ws/ai/curaos/ops/dev"
  mkdir -p "$ws/ai/curaos/curaos-website/site-notes"
  mkdir -p "$ws/ai/curaos/docs/adr"
  mkdir -p "$ws/ai/curaos/research/topic"
  mkdir -p "$ws/ai/curaos/AGENTS-sections"
  cat > "$ws/curaos/.gitmodules" <<'GM'
[submodule "curaos-website"]
	path = curaos-website
	url = https://example.invalid/curaos-website.git
[submodule "backend/services/svc-a"]
	path = backend/services/svc-a
	url = https://example.invalid/svc-a.git
GM
}

run() {
  CHECK_AI_MIRROR_WS="$1" bash "$SCRIPT" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# 1) aligned workspace passes; ignores + module/submodule leaves hold
WS1="$TMP/ws1"
build_base "$WS1"
out="$(run "$WS1")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:'; then
  ok "aligned fixture passes (ignores + module/submodule leaves)"
else
  nok "aligned fixture" "$out"
fi

# 2) acceptance fixture: drift in a top-level dir the old hardcoded list
#    never covered (curaos/tools/ with no ai twin) exits nonzero
WS2="$TMP/ws2"
build_base "$WS2"
mkdir -p "$WS2/curaos/tools/codegen"
out="$(run "$WS2")"
if printf '%s' "$out" | grep -q 'DRIFT: tools exists in curaos/ but not in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "seeded curaos/tools/ drift exits nonzero"
else
  nok "seeded tools drift" "$out"
fi

# 3) child-level drift inside a derived top-level dir is caught
WS3="$TMP/ws3"
build_base "$WS3"
mkdir -p "$WS3/curaos/tools/codegen" "$WS3/curaos/tools/generators"
mkdir -p "$WS3/ai/curaos/tools/codegen"
out="$(run "$WS3")"
if printf '%s' "$out" | grep -q 'DRIFT: tools/generators in curaos/ but missing in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "child drift in derived dir (tools/generators) exits nonzero"
else
  nok "child drift in derived dir" "$out"
fi

# 4) phantom ai-only top-level dir is caught
WS4="$TMP/ws4"
build_base "$WS4"
mkdir -p "$WS4/ai/curaos/phantom-dir"
out="$(run "$WS4")"
if printf '%s' "$out" | grep -q 'DRIFT: phantom-dir exists in ai/curaos/ but not in curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "ai-only phantom top-level dir exits nonzero"
else
  nok "phantom ai-only dir" "$out"
fi

# 5) missing tree fails closed
out="$(run "$TMP/nonexistent")"
if printf '%s' "$out" | grep -q 'ERROR: missing' \
  && printf '%s' "$out" | grep -q 'EXIT=2'; then
  ok "missing workspace fails closed (exit 2)"
else
  nok "missing workspace" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
