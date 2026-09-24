#!/usr/bin/env bash
# Tests for check-shell-portability.sh. Fixture trees only; never reads the real
# scripts/ directory, so the gate's verdict here does not depend on whether the
# repository happens to be clean today.
#
# Each case asserts on what the gate DID: its exit status and the finding it
# printed. The negative cases are the ones that matter: a gate that flags nothing
# passes a clean tree for the wrong reason, and this class already shipped twice.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$DIR/check-shell-portability.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Build a fixture tree holding one script with the given body.
fixture() {
  local name="$1"
  local body="${2:-}"
  # Declared separately: referencing $name inside the same `local` that declares it
  # is not reliable, and an empty root here would send the gate at the REAL scripts
  # directory (its default argument) and at `rm -rf` outside the fixture tree.
  local root="$TMP/$name"
  if [ -z "$name" ]; then echo "fixture needs a name" >&2; return 1; fi
  rm -rf "$root"
  mkdir -p "$root/scripts"
  printf '#!/usr/bin/env bash\n%s\n' "$body" > "$root/scripts/subject.sh"
  printf '%s' "$root"
}

# The two banned constructs, assembled so this file does not contain either one
# literally: the gate skips its own test by name, and a reader should not have to
# trust that skip for the test to be meaningful.
BANNED_ENV="env -u GITHUB_TOKEN $(printf 'command') gh \"\$@\""
BANNED_SEDI="sed -i $(printf "''") 's/a/b/' \"\$f\""

root="$(fixture env-command "gh() { $BANNED_ENV; }")"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -ne 0 ]; then ok "env + command builtin is rejected"; else nok "env + command builtin is rejected" "gate exited 0; output: $out"; fi
case "$out" in
  *"shell builtin"*) ok "the env finding names the cause" ;;
  *) nok "the env finding names the cause" "output: $out" ;;
esac
case "$out" in
  *"subject.sh:2"*) ok "the env finding carries file and line" ;;
  *) nok "the env finding carries file and line" "output: $out" ;;
esac

root="$(fixture bsd-sedi "f=/tmp/x; $BANNED_SEDI")"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -ne 0 ]; then ok "BSD-only in-place sed is rejected"; else nok "BSD-only in-place sed is rejected" "gate exited 0; output: $out"; fi
case "$out" in
  *"GNU sed reads the script as a filename"*) ok "the sed finding names the cause" ;;
  *) nok "the sed finding names the cause" "output: $out" ;;
esac

# Prose ABOUT the construct is not the construct. Every fix for these two carries a
# comment naming what it replaced, and an earlier version of this gate reported all 7
# of those explanations as offences, so this is pinned rather than assumed.
root="$(fixture commented "$(printf '# do not write %s here\ngh() { env -u GITHUB_TOKEN gh "$@"; }   # %s was the bug\n' "$BANNED_ENV" "$BANNED_ENV")")"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -eq 0 ]; then ok "a comment naming the construct is not flagged"; else nok "a comment naming the construct is not flagged" "gate exited $status; output: $out"; fi

# ${var#pattern} must survive comment blanking, or the gate corrupts real code lines
# before matching them and stops seeing offences that sit after one.
root="$(fixture param-expansion "$(printf 'x=a/b; echo "${x#a/}"\ngh() { %s; }\n' "$BANNED_ENV")")"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -ne 0 ]; then ok "an offence after a \${var#pattern} line is still caught"; else nok "an offence after a \${var#pattern} line is still caught" "gate exited 0; output: $out"; fi

# Negative controls. Each is the PORTABLE form of a rejected construct, plus the
# shapes that merely look similar, so the gate cannot pass by flagging everything.
root="$(fixture portable "$(printf 'gh() { env -u GITHUB_TOKEN gh "$@"; }\nsed "s/a/b/" in > out && mv out in\ncommand -v gh >/dev/null\nsed -i.bak "s/a/b/" file\n')")"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -eq 0 ]; then ok "the portable forms, plain \`command -v\`, and sed -i.bak all pass"; else nok "the portable forms, plain \`command -v\`, and sed -i.bak all pass" "gate exited $status; output: $out"; fi

# A file with no shell shebang and no .sh suffix is not shell source and must be
# left alone, or the gate starts reporting findings in data files.
root="$(fixture non-shell "")"
rm -f "$root/scripts/subject.sh"
printf '%s\n' "$BANNED_ENV" > "$root/scripts/notes.txt"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -eq 0 ]; then ok "a non-shell file is not scanned"; else nok "a non-shell file is not scanned" "gate exited $status; output: $out"; fi

# Non-vacuous: an empty tree must not be reported as a pass earned by finding
# nothing to look at. The gate is allowed to pass, but the fixtures above prove it
# can fail, which is what makes that pass meaningful.
root="$(fixture empty "")"
rm -f "$root/scripts/subject.sh"
out="$(bash "$GATE" "$root" 2>&1)"
status=$?
if [ "$status" -eq 0 ]; then ok "an empty tree passes"; else nok "an empty tree passes" "gate exited $status; output: $out"; fi

printf '\nPASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
