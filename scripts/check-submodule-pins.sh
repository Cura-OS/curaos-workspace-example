#!/usr/bin/env bash
# check-submodule-pins.sh (RP-30): every gitlink recorded in the index must be
# an ancestor of (or equal to) its submodule's origin default branch tip.
# Catches the stale-HEAD / unpushed-submodule pointer-bump class before push:
# a pin that origin's default branch cannot reach is either a local-only
# commit or a stale-fetch artifact; both break consumers that clone fresh.
# Verification is rev-list based (same predicate as the pointer-bump helper in
# scripts/lib/workflow-git.js): zero commits in origin/<default>..<pin>.
# Fail-closed: anything unverifiable (uninitialized submodule, unresolvable
# default branch, missing ref or object after one fetch attempt) exits 1.
# Usage: check-submodule-pins.sh [repo-dir]   (default: current directory)
set -uo pipefail

# Git hooks export GIT_DIR (worktree-specific gitdir for linked worktrees);
# inherited, it overrides repo discovery for every nested `git -C <submodule>`
# call below, resolving the PARENT repo and failing the pin check closed on
# any push from a linked worktree. Each call passes an explicit path, so the
# inherited env is never the intent here.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX

REPO="${1:-.}"
FAILURES=0
CHECKED=0

fail() {
  FAILURES=$((FAILURES + 1))
  printf 'check-submodule-pins: %s\n' "$1" >&2
}

# Resolve the submodule's origin default branch: local origin/HEAD symref
# first, authoritative ls-remote --symref fallback.
default_branch() {
  local sub="$1" ref
  ref="$(git -C "$sub" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  case "$ref" in
    origin/*) printf '%s\n' "${ref#origin/}"; return 0 ;;
  esac
  git -C "$sub" ls-remote --symref origin HEAD 2>/dev/null \
    | sed -n 's|^ref: refs/heads/\(.*\)[[:space:]]\{1,\}HEAD$|\1|p' | head -n 1
}

# pin_ok <sub-dir> <branch> <sha>
# rc 0: pin is an ancestor of origin/<branch> (rev-list count = 0)
# rc 1: pin is NOT an ancestor (local-only or diverged commit)
# rc 2: unverifiable (missing tracking ref or missing object)
pin_ok() {
  local sub="$1" branch="$2" sha="$3" count
  git -C "$sub" rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null 2>&1 || return 2
  count="$(git -C "$sub" rev-list --count "refs/remotes/origin/$branch..$sha" 2>/dev/null)" || return 2
  [ "$count" = "0" ]
}

if ! git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1; then
  fail "not a git repository: $REPO"
  exit 1
fi

GITLINKS="$(git -C "$REPO" ls-files -s | awk -F'\t' '$1 ~ /^160000 / {print}')"

if [ -z "$GITLINKS" ]; then
  printf 'check-submodule-pins: OK (no gitlinks in index)\n'
  exit 0
fi

while IFS= read -r line; do
  [ -z "$line" ] && continue
  meta="${line%%$'\t'*}"
  sub_path="${line#*$'\t'}"
  sha="$(printf '%s' "$meta" | awk '{print $2}')"
  sub="$REPO/$sub_path"

  # The submodule worktree must be its own repo toplevel; an empty or missing
  # dir makes git resolve the PARENT repo, which would mis-verify the pin.
  sub_top="$(git -C "$sub" rev-parse --show-toplevel 2>/dev/null || true)"
  sub_phys="$(cd "$sub" 2>/dev/null && pwd -P || true)"
  if [ -z "$sub_top" ] || [ -z "$sub_phys" ] || [ "$sub_top" != "$sub_phys" ]; then
    fail "cannot verify $sub_path pin $sha: submodule not initialized (run git submodule update --init)"
    continue
  fi

  branch="$(default_branch "$sub")"
  if [ -z "$branch" ]; then
    fail "cannot resolve origin default branch for $sub_path"
    continue
  fi

  pin_ok "$sub" "$branch" "$sha"
  rc=$?
  if [ "$rc" != "0" ]; then
    # One refresh attempt: a stale local origin/<branch> must not fail a pin
    # that the real remote can serve. Offline keeps the local (failing)
    # verdict, which is the fail-closed direction.
    git -C "$sub" fetch --quiet origin "$branch" >/dev/null 2>&1 || true
    pin_ok "$sub" "$branch" "$sha"
    rc=$?
  fi
  case "$rc" in
    0) CHECKED=$((CHECKED + 1)) ;;
    1) fail "$sub_path pinned at $sha which is not an ancestor of origin/$branch (unpushed or stale pointer bump)" ;;
    *) fail "cannot verify $sub_path pin $sha against origin/$branch (missing ref or object after fetch attempt)" ;;
  esac
done <<< "$GITLINKS"

if [ "$FAILURES" -gt 0 ]; then
  printf 'check-submodule-pins: FAIL (%d problem(s); see lines above)\n' "$FAILURES" >&2
  exit 1
fi
printf 'check-submodule-pins: OK (%d gitlink pin(s) verified)\n' "$CHECKED"
exit 0
