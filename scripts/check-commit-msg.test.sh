#!/usr/bin/env bash
# Tests for check-commit-msg.sh (RP-10). Invokes the hook script against
# fixture message files (never by committing).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-commit-msg.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

run_msg() {
  printf '%s\n' "$1" > "$TMP/msg"
  bash "$SCRIPT" "$TMP/msg" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# 1) acceptance: plain non-conventional subject is rejected
out="$(run_msg 'bad message')"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'not Conventional Commits'; then
  ok "'bad message' exits 1"
else
  nok "bad message" "$out"
fi

# 2) acceptance: valid conventional subject passes
out="$(run_msg 'fix(scope): valid subject')"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "'fix(scope): valid subject' passes"
else
  nok "valid conventional subject" "$out"
fi

# 3) scopeless + breaking-change marker forms pass
out="$(run_msg 'feat!: breaking change summary')"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "scopeless feat! passes"
else
  nok "scopeless feat!" "$out"
fi

# 4) unknown type is rejected
out="$(run_msg 'feature(scope): wrong type word')"
if printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unknown type 'feature' exits 1"
else
  nok "unknown type" "$out"
fi

# 5) acceptance: Co-authored-by trailer is rejected even with valid subject
out="$(run_msg 'fix(scope): valid subject

Co-authored-by: Some Agent <agent@example.invalid>')"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -qi 'banned AI/tool attribution'; then
  ok "Co-authored-by trailer exits 1"
else
  nok "Co-authored-by trailer" "$out"
fi

# 6) every other banned trailer is rejected (incl. Agent-* family)
for trailer in 'Generated-by: tool' 'AI-assisted-by: tool' 'Agent-ID: x1' \
  'Agent-Model: m1' 'Task-Issue: #5' 'Worktree: wt-1' 'agent-harness: x'; do
  out="$(run_msg "chore(scope): subject

$trailer")"
  if printf '%s' "$out" | grep -q 'EXIT=1' \
    && printf '%s' "$out" | grep -qi 'banned AI/tool attribution'; then
    ok "trailer '$trailer' exits 1"
  else
    nok "trailer $trailer" "$out"
  fi
done

# 7) comment lines are ignored; scissors section is not scanned
printf '%s\n' \
  'docs(scope): subject' \
  '' \
  '# Co-authored-by: commented out, must not trip the ban' \
  '# ------------------------ >8 ------------------------' \
  'Co-authored-by: below scissors, not part of the message' \
  > "$TMP/msg"
out="$(bash "$SCRIPT" "$TMP/msg" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "comments and scissors section are ignored"
else
  nok "comments/scissors" "$out"
fi

# 8) git porcelain subjects pass through
for subj in "Merge branch 'feat/x' into main" 'Revert "fix(scope): subject"' \
  'fixup! fix(scope): subject'; do
  out="$(run_msg "$subj")"
  if printf '%s' "$out" | grep -q 'EXIT=0'; then
    ok "porcelain subject passes: $subj"
  else
    nok "porcelain subject" "$out"
  fi
done

# 9) fail closed: missing arg + unreadable file + empty message
out="$(bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'failing closed'; then
  ok "missing message-file arg fails closed"
else
  nok "missing arg" "$out"
fi
out="$(bash "$SCRIPT" "$TMP/does-not-exist" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unreadable message file fails closed"
else
  nok "unreadable file" "$out"
fi
out="$(run_msg '# only comments
')"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'empty commit message'; then
  ok "empty message fails closed"
else
  nok "empty message" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
