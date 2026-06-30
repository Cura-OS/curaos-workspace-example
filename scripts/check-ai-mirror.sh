#!/usr/bin/env bash
# check-ai-mirror.sh: verify ai/curaos/ layout mirrors curaos/ layout 1:1.
# Per workspace AGENTS.md section 1 structural mirror rule.
# RP-08: the compare set is DERIVED from the actual top-level dirs of both
# trees minus an ignore list; the old hardcoded 5-dir list let drift in any
# unlisted dir (e.g. curaos/tools/) pass as "OK 1:1".
# Exit 0 = aligned, nonzero = drift detected.
# CHECK_AI_MIRROR_WS overrides the workspace root (used by test fixtures).

set -u

WS="${CHECK_AI_MIRROR_WS:-$(cd "$(dirname "$0")/.." && pwd)}"
REAL="$WS/curaos"
AI="$WS/ai/curaos"

if [ ! -d "$REAL" ] || [ ! -d "$AI" ]; then
  echo "ERROR: missing $REAL or $AI"
  exit 2
fi

DRIFT=0

# Top-level dirs outside the structural mirror.
# curaos/ side: ai = the code repo's own in-repo agent mirror; the rest are
# build/dependency artifacts. ai/curaos/ side: docs + research are sanctioned
# ai-only trees (AGENTS.md section 12); AGENTS-sections + agents are per-module
# doc subdirs per the agents-md-schema rule.
TOP_IGNORE='^(ai|coverage|node_modules|dist|build|out|docs|research|AGENTS-sections|agents)$'
# Child dirs ignored at every depth (artifacts on the code side).
CHILD_IGNORE='^(node_modules|coverage|dist|build|out)$'
# ai-side doc subdirs allowed inside any mirrored dir without a code twin.
AI_DOC_DIRS='^(agents|AGENTS-sections)$'
MAX_DEPTH=4

# Code-repo submodule roots are module leaves: their internals (src/, etc.)
# sit below mirror granularity and are never compared.
SUBMODULE_PATHS=""
if [ -f "$REAL/.gitmodules" ]; then
  SUBMODULE_PATHS="$(/usr/bin/git config -f "$REAL/.gitmodules" --get-regexp 'submodule\..*\.path' 2>/dev/null | /usr/bin/awk '{print $2}')"
fi

is_submodule() {
  local subpath="$1"
  [ -e "$REAL/$subpath/.git" ] && return 0
  printf '%s\n' "$SUBMODULE_PATHS" | /usr/bin/grep -Fxq "$subpath"
}

# Direct child dirs (basename only), hidden dirs skipped.
list_dirs() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  (cd "$dir" && /usr/bin/find . -mindepth 1 -maxdepth 1 -type d 2>/dev/null) \
    | /usr/bin/sed 's|^\./||' | /usr/bin/grep -v '^\.' | /usr/bin/sort
}

real_kids_of() { list_dirs "$REAL/$1" | /usr/bin/grep -vE "$CHILD_IGNORE"; }
ai_kids_of() { list_dirs "$AI/$1" | /usr/bin/grep -vE "$AI_DOC_DIRS"; }

# Presence-only pair check (submodule leaves: internals are not mirrored).
check_pair_exists() {
  local subpath="$1"
  if [ ! -d "$REAL/$subpath" ] && [ ! -d "$AI/$subpath" ]; then return 0; fi
  if [ ! -d "$REAL/$subpath" ]; then
    echo "DRIFT: $subpath exists in ai/curaos/ but not in curaos/"
    DRIFT=$((DRIFT+1))
  elif [ ! -d "$AI/$subpath" ]; then
    echo "DRIFT: $subpath exists in curaos/ but not in ai/curaos/"
    DRIFT=$((DRIFT+1))
  fi
}

# Compare direct children of one subpath across both trees.
compare_dir() {
  local subpath="$1"
  local real_dir="$REAL/$subpath"
  local ai_dir="$AI/$subpath"

  if [ ! -d "$real_dir" ] && [ ! -d "$ai_dir" ]; then return 0; fi

  if [ ! -d "$real_dir" ]; then
    echo "DRIFT: $subpath exists in ai/curaos/ but not in curaos/"
    DRIFT=$((DRIFT+1))
    return
  fi

  if [ ! -d "$ai_dir" ]; then
    echo "DRIFT: $subpath exists in curaos/ but not in ai/curaos/"
    DRIFT=$((DRIFT+1))
    return
  fi

  local real_kids ai_kids
  real_kids="$(real_kids_of "$subpath")"
  ai_kids="$(ai_kids_of "$subpath")"

  local only_real only_ai
  only_real=$(/usr/bin/comm -23 <(echo "$real_kids") <(echo "$ai_kids"))
  only_ai=$(/usr/bin/comm -13 <(echo "$real_kids") <(echo "$ai_kids"))

  if [ -n "$only_real" ]; then
    while IFS= read -r kid; do
      [ -z "$kid" ] && continue
      echo "DRIFT: $subpath/$kid in curaos/ but missing in ai/curaos/"
      DRIFT=$((DRIFT+1))
    done <<< "$only_real"
  fi

  if [ -n "$only_ai" ]; then
    while IFS= read -r kid; do
      [ -z "$kid" ] && continue
      echo "DRIFT: $subpath/$kid in ai/curaos/ but missing in curaos/"
      DRIFT=$((DRIFT+1))
    done <<< "$only_ai"
  fi
}

# Compare a subpath, then descend into children present on BOTH sides.
# A child is a leaf (no descent) when the code side is a submodule root or
# the ai side has no non-doc subdirs (module internals are not mirrored).
recurse_dir() {
  local subpath="$1" depth="$2"
  compare_dir "$subpath"
  [ "$depth" -ge "$MAX_DEPTH" ] && return 0
  [ -d "$REAL/$subpath" ] && [ -d "$AI/$subpath" ] || return 0
  local kid
  while IFS= read -r kid; do
    [ -z "$kid" ] && continue
    [ -d "$REAL/$subpath/$kid" ] && [ -d "$AI/$subpath/$kid" ] || continue
    is_submodule "$subpath/$kid" && continue
    [ -n "$(ai_kids_of "$subpath/$kid")" ] || continue
    recurse_dir "$subpath/$kid" $((depth + 1))
  done <<< "$(ai_kids_of "$subpath")"
}

echo "=== curaos AI mirror doctor ==="

# Derived compare set: union of top-level dirs on both sides minus ignores.
TOP_SET="$({ list_dirs "$REAL"; list_dirs "$AI"; } | /usr/bin/sort -u | /usr/bin/grep -vE "$TOP_IGNORE")"
while IFS= read -r top; do
  [ -z "$top" ] && continue
  is_submodule "$top" && { check_pair_exists "$top"; continue; }
  recurse_dir "$top" 1
done <<< "$TOP_SET"

# Snake_case ban check
echo ""
echo "=== Snake_case ban check ==="
SNAKE=$(/usr/bin/find "$AI" -maxdepth 6 -type d -name '*_*' ! -path '*/node_modules/*' ! -path '*/.git/*' 2>/dev/null | /usr/bin/grep -vE '/_planned/?$|/_planned/')
if [ -n "$SNAKE" ]; then
  echo "DRIFT: snake_case dirs found in ai/curaos/ (kebab-case only):"
  echo "$SNAKE"
  DRIFT=$((DRIFT+1))
fi

# Forbidden wrappers + staging
echo ""
echo "=== Forbidden wrapper / staging dirs check ==="
WRAPS=$(/usr/bin/find "$AI" "$REAL" -maxdepth 6 -type d \( -name 'curaos-apps' -o -name 'cura_os' -o -name 'cura_os_healthstack' -o -name '_planned' -o -name '_staging' \) 2>/dev/null)
if [ -n "$WRAPS" ]; then
  echo "DRIFT: forbidden wrapper/staging dirs:"
  echo "$WRAPS"
  DRIFT=$((DRIFT+1))
fi

echo ""
if [ "$DRIFT" -eq 0 ]; then
  echo "OK: ai/curaos/ mirrors curaos/ 1:1."
  exit 0
else
  echo "FAIL: $DRIFT drift(s) detected. Per workspace AGENTS.md section 1: fix mirror, then commit."
  exit 1
fi
