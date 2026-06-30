#!/usr/bin/env bash
# Tests for check-submodule-pins.sh (RP-30). Self-contained: throwaway bare
# remote + parent repo with one submodule; a second clone advances the remote.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-submodule-pins.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Hermetic git config: identity, file-protocol submodules, main default
# branch, hooks isolated from any workspace hooksPath.
HOOKS="$TMP/no-hooks"
mkdir -p "$HOOKS"
cat > "$TMP/gitconfig" <<EOF
[user]
	name = RP30 Pins Test
	email = rp30-pins@test.invalid
[protocol "file"]
	allow = always
[init]
	defaultBranch = main
[core]
	hooksPath = $HOOKS
[commit]
	gpgsign = false
EOF
export GIT_CONFIG_GLOBAL="$TMP/gitconfig"
export GIT_CONFIG_SYSTEM=/dev/null

run() { # run <repo-dir>; prints script output then EXIT=<code>
  local out rc
  out="$(bash "$SCRIPT" "$1" 2>&1)"
  rc=$?
  printf '%s\nEXIT=%s\n' "$out" "$rc"
}

SUBREMOTE="$TMP/sub.git"
git init --bare -q "$SUBREMOTE"

SEED="$TMP/seed"
git clone -q "$SUBREMOTE" "$SEED" 2>/dev/null
printf 'a\n' > "$SEED/a.txt"
git -C "$SEED" add a.txt
git -C "$SEED" commit -qm "feat: seed sub"
git -C "$SEED" push -q origin HEAD:main

PARENT="$TMP/parent"
mkdir -p "$PARENT"
git -C "$PARENT" init -q
git -C "$PARENT" submodule add -q "$SUBREMOTE" sub 2>/dev/null
git -C "$PARENT" commit -qm "feat: add sub submodule"
SUB="$PARENT/sub"
OLD_TIP="$(git -C "$SUB" rev-parse HEAD)"

# 1) gitlink pinned at origin default tip passes
out="$(run "$PARENT")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'OK (1 gitlink pin(s) verified)'; then
  ok "pin at origin default tip exits 0"
else
  nok "pin at origin tip" "$out"
fi

# 2) gitlink pinned at a local-only commit (not on origin default) fails
printf 'local\n' > "$SUB/local.txt"
git -C "$SUB" add local.txt
git -C "$SUB" commit -qm "feat: local-only commit"
git -C "$PARENT" add sub
out="$(run "$PARENT")"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'not an ancestor of origin/main'; then
  ok "local-only pin exits 1 (not an ancestor of origin default)"
else
  nok "local-only pin rejected" "$out"
fi
# reset: back to the published tip
git -C "$SUB" checkout -q --detach "$OLD_TIP"
git -C "$PARENT" add sub

# 3) valid pin with a stale local tracking ref passes via the fetch retry
DEV="$TMP/dev"
git clone -q "$SUBREMOTE" "$DEV" 2>/dev/null
printf 'b\n' > "$DEV/b.txt"
git -C "$DEV" add b.txt
git -C "$DEV" commit -qm "feat: advance sub"
git -C "$DEV" push -q origin HEAD:main
NEW_TIP="$(git -C "$DEV" rev-parse HEAD)"
git -C "$SUB" fetch -q origin main
git -C "$SUB" checkout -q --detach "$NEW_TIP"
git -C "$PARENT" add sub
# simulate the stale-fetch state: rewind the tracking ref only
git -C "$SUB" update-ref refs/remotes/origin/main "$OLD_TIP"
out="$(run "$PARENT")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'OK (1 gitlink pin(s) verified)'; then
  ok "valid pin with stale tracking ref recovers via fetch retry"
else
  nok "stale tracking ref recovery" "$out"
fi

# 4) uninitialized gitlink (no submodule worktree) fails closed
git -C "$PARENT" update-index --add --cacheinfo "160000,$OLD_TIP,ghost"
out="$(run "$PARENT")"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'ghost.*not initialized'; then
  ok "uninitialized gitlink fails closed"
else
  nok "uninitialized gitlink" "$out"
fi
git -C "$PARENT" update-index --force-remove ghost

# 5) repo with no gitlinks passes
PLAIN="$TMP/plain"
mkdir -p "$PLAIN"
git -C "$PLAIN" init -q
printf 'x\n' > "$PLAIN/x.txt"
git -C "$PLAIN" add x.txt
git -C "$PLAIN" commit -qm "feat: plain repo"
out="$(run "$PLAIN")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'OK (no gitlinks in index)'; then
  ok "repo without gitlinks exits 0"
else
  nok "no gitlinks" "$out"
fi

printf 'check-submodule-pins.test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
