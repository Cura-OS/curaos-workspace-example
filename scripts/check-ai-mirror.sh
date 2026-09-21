#!/usr/bin/env bash
# check-ai-mirror.sh: verify ai/curaos/ layout mirrors curaos/ layout 1:1.
# Per workspace AGENTS.md section 1 structural mirror rule.
# RP-08: the compare set is DERIVED from the actual top-level dirs of both
# trees minus an ignore list; the old hardcoded 5-dir list let drift in any
# unlisted dir (e.g. curaos/tools/) pass as "OK 1:1".
# Exit 0 = aligned, nonzero = drift detected.
# CHECK_AI_MIRROR_WS overrides the workspace root (used by test fixtures).
#
# V15-AI-MIRROR-GATE-FORKED-INTO-EXAMPLE-WORKSPACE: this file is the ONE canonical
# implementation. curaos-workspace-example/scripts/check-ai-mirror.sh is a vendored
# byte-identical copy, kept honest by scripts/check-vendored-git-helpers.sh; it used to
# be a fork, and the fork had already drifted in behavior (it never gained the
# GIT_DIR/GIT_WORK_TREE unset below, nor the unmaterialized-checkout refusal). The two
# behaviors the example genuinely needs, and the workspace must never have, sit behind
# CURAOS_AI_MIRROR_SANITIZED=1 rather than in a second file.

set -u

# Under a git hook, git exports GIT_DIR/GIT_INDEX_FILE for the OUTER repo; the
# `git -C curaos` calls below would then resolve against the workspace repo and
# check-ignore the submodule's paths with the wrong ignore rules (false mirror
# drift on gitignored artifacts like tools/codegen/test-results). Force normal
# repo discovery for every git call this script makes.
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE

WS="${CHECK_AI_MIRROR_WS:-$(cd "$(dirname "$0")/.." && pwd)}"
REAL="$WS/curaos"
AI="$WS/ai/curaos"

if [ ! -d "$WS" ]; then
  echo "ERROR: missing workspace root $WS"
  exit 2
fi

# A sanitized example workspace ships without the private curaos/ code submodule, so it
# has no ai/curaos/ mirror either: there is nothing to compare and skipping is honest.
# This is opt-in (CURAOS_AI_MIRROR_SANITIZED=1) because the same condition in the real
# workspace means the checkout lost both trees, and the gate must never pass by having
# nothing left to check. Only ONE side present is real drift and stays fail-closed below,
# flag or no flag.
if [ "${CURAOS_AI_MIRROR_SANITIZED:-0}" != "0" ] && [ ! -d "$REAL" ] && [ ! -d "$AI" ]; then
  echo "check-ai-mirror: no curaos/ submodule and no ai/curaos/ mirror; nothing to check (sanitized example)"
  exit 0
fi

if [ ! -d "$REAL" ] || [ ! -d "$AI" ]; then
  echo "ERROR: missing $REAL or $AI"
  exit 2
fi

# An EMPTY side is an unmaterialized checkout, not mirror drift. In a linked
# worktree whose curaos submodule was never populated, curaos/ exists but holds
# nothing, so every ai/curaos/ top-level dir compares as "missing in curaos/"
# and the gate printed a long drift list that says nothing about the mirror.
# Refuse with the same exit 2 the missing-directory case uses: this checkout
# cannot run the gate, so it must not render a verdict either way.
is_empty_dir() {
  # -L follows the symlink. The pre-push gate exports the pushed commit with
  # git-archive, which does not materialize gitlinks, then symlinks the real
  # checkout back in. Without -L that provisioned export read as empty and the
  # gate refused every workspace push.
  [ -z "$(/usr/bin/find -L "$1" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]
}
for side in "$REAL" "$AI"; do
  if is_empty_dir "$side"; then
    echo "ERROR: $side is empty, so this checkout cannot run the mirror gate."
    echo "Fix:"
    echo "  materialize the declared submodules, or run in a checkout that already has them"
    exit 2
  fi
done

DRIFT=0

# Top-level dirs outside the structural twin comparison.
# curaos/ side: the code repo must hold NO agent docs at all (AGENTS.md
# section 1: curaos = code + README + CHANGELOG + build files ONLY). `ai` is
# excluded from the twin comparison only because the dedicated code-repo
# pollution guard below owns it: curaos/ai/curaos/{backend,frontend} agent-doc
# trios are a hard failure, while curaos/ai/curaos/docs is an allowed
# doc-graph-append exception (curaos#1159), not a silently-ignored twin. The rest
# are build/dependency/legal artifacts.
# LICENSES = top-level SPDX license texts; patches = bun dependency patch files
# - both pure artifacts (no agent docs), same category as coverage/node_modules.
# ai/curaos/ side: docs + research are sanctioned ai-only trees (AGENTS.md
# section 12); AGENTS-sections + agents are per-module doc subdirs per the
# agents-md-schema rule.
TOP_IGNORE='^(ai|coverage|node_modules|dist|build|out|docs|research|AGENTS-sections|agents|LICENSES|patches)$'
# Child dirs ignored at every depth (artifacts on the code side).
# fhir-fixtures = FHIR test fixtures under curaos/scripts/, sibling artifact
# category to coverage/dist (test data, not a doc-bearing module).
CHILD_IGNORE='^(node_modules|coverage|dist|build|out|fhir-fixtures)$'
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

# Direct child dirs (basename only), hidden dirs skipped, gitignored dirs
# excluded. A gitignored build artifact left on disk by a concurrent lane
# (e.g. tools/codegen/test-results) must not false-flag as mirror drift; the
# working tree is not the source of truth, git's ignore rules are (same
# git-first convention as check-doc-graph.js's `git ls-files`). Falls back to
# the raw walk when `git_root` is not an actual git repo (test fixtures build
# plain directory trees with no .git).
list_dirs() {
  local dir="$1" git_root="${2:-}"
  [ -d "$dir" ] || return 0
  local use_git=1
  if [ -n "$git_root" ] && /usr/bin/git -C "$git_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    use_git=0
  fi
  local rel="${dir#"$git_root"}"
  rel="${rel#/}"
  local kid
  while IFS= read -r kid; do
    [ -z "$kid" ] && continue
    if [ "$use_git" -eq 0 ]; then
      local relpath="$kid"
      [ -n "$rel" ] && relpath="$rel/$kid"
      /usr/bin/git -C "$git_root" check-ignore -q -- "$relpath" 2>/dev/null && continue
    fi
    printf '%s\n' "$kid"
  done < <((cd "$dir" && /usr/bin/find . -mindepth 1 -maxdepth 1 -type d 2>/dev/null) \
    | /usr/bin/sed 's|^\./||' | /usr/bin/grep -v '^\.' | /usr/bin/sort)
}

# `curaos/curaos/.worktrees` is the local holder for nested checkouts, not a
# mirrored code directory. Restrict the exception to that exact, untracked
# holder so an ordinary code-side `curaos/` directory still reports drift.
is_untracked_local_worktree_holder() {
  local subpath="$1" holder entry
  holder="$REAL/$subpath"
  [ "$subpath" = "curaos" ] \
    && [ -d "$holder/.worktrees" ] \
    && [ "$(/usr/bin/find "$holder" -mindepth 1 -maxdepth 1 -print 2>/dev/null | /usr/bin/awk 'END { print NR }')" = "1" ] \
    && ! /usr/bin/git -C "$REAL" ls-files --error-unmatch -- "$subpath" >/dev/null 2>&1 \
    || return 1
  while IFS= read -r entry; do
    [ -d "$entry" ] && [ -e "$entry/.git" ] || return 1
  done < <(/usr/bin/find "$holder/.worktrees" -mindepth 1 -maxdepth 1 -print 2>/dev/null)
  return 0
}

real_kids_of() {
  local subpath="$1" kid
  while IFS= read -r kid; do
    [ -z "$kid" ] && continue
    if [ -z "$subpath" ] && is_untracked_local_worktree_holder "$kid"; then continue; fi
    printf '%s\n' "$kid"
  done < <(list_dirs "$REAL/$subpath" "$REAL" | /usr/bin/grep -vE "$CHILD_IGNORE")
}
ai_kids_of() { list_dirs "$AI/$1" "$WS" | /usr/bin/grep -vE "$AI_DOC_DIRS"; }

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
TOP_SET="$({ real_kids_of ""; list_dirs "$AI" "$WS"; } | /usr/bin/sort -u | /usr/bin/grep -vE "$TOP_IGNORE")"
while IFS= read -r top; do
  [ -z "$top" ] && continue
  is_submodule "$top" && { check_pair_exists "$top"; continue; }
  recurse_dir "$top" 1
done <<< "$TOP_SET"

# Code-repo purity guard (AGENTS.md section 1: curaos = code only, NO agent
# docs). The FE new-app scaffold twice wrote AGENTS/CONTEXT/Requirements trios
# into the code repo (curaos #1152/#1153); the twin comparator ignores `ai`, so
# the gate never flagged it. Fail closed on either symptom.
echo ""
echo "=== Code-repo agent-doc pollution check ==="

# A) app/service agent-doc trios (AGENTS/CONTEXT/Requirements) wrongly checked
#    into the code repo under curaos/ai/curaos/{backend,frontend}/ (the exact
#    curaos #1152/#1153 FE/BE scaffold regression). Scoped to those two subtrees:
#    curaos/ai/curaos/docs/ is the sanctioned doc-graph-append target
#    (tools/codegen doc-graph-append.ts) and is an intentional code-repo exception
#    pending disposition on curaos#1159, so it is NOT flagged here.
POLLUTION_DOCS="$(/usr/bin/find "$REAL/ai/curaos/backend" "$REAL/ai/curaos/frontend" -type f \( -name AGENTS.md -o -name CONTEXT.md -o -name Requirements.md \) -print 2>/dev/null)"
if [ -n "$POLLUTION_DOCS" ]; then
  echo "POLLUTION: curaos/ai/ agent-doc tree in code-only repo (AGENTS.md section 1: curaos has no app/service agent docs; they belong in curaos-ai-workspace):"
  echo "$POLLUTION_DOCS"
  DRIFT=$((DRIFT+1))
fi

# B) stray AGENTS/CONTEXT/Requirements docs directly under a code path. Submodule
#    internals are separate repos (leaves here) and are pruned, along with the
#    ai/ tree (owned by check A) and build artifacts.
DOC_PRUNE=( -name .git -o -name .claude -o -name .scratch -o -name .worktrees -o -name node_modules -o -name coverage -o -name dist -o -name build -o -name out -o -name ai )
while IFS= read -r sm; do
  [ -z "$sm" ] && continue
  DOC_PRUNE+=( -o -path "$REAL/$sm" )
done <<< "$SUBMODULE_PATHS"
STRAY_DOCS="$(/usr/bin/find "$REAL" \( "${DOC_PRUNE[@]}" \) -prune -o -type f \( -name AGENTS.md -o -name CONTEXT.md -o -name Requirements.md \) -print 2>/dev/null)"
if [ -n "$STRAY_DOCS" ]; then
  echo "POLLUTION: stray agent-doc(s) under a code path in code-only repo:"
  echo "$STRAY_DOCS"
  DRIFT=$((DRIFT+1))
fi

# Snake_case ban check
echo ""
echo "=== Snake_case ban check ==="
# `tools/codegen/__tests__` and `tools/codegen/src/__fixtures__` are tracked
# conventional source directories. Their mirrors retain that spelling; all new
# workspace directories remain kebab-case.
SNAKE=$(/usr/bin/find "$AI" -maxdepth 6 -type d -name '*_*' ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/tools/codegen/__tests__' ! -path '*/tools/codegen/src/__fixtures__' 2>/dev/null | /usr/bin/grep -vE '/_planned/?$|/_planned/')
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
