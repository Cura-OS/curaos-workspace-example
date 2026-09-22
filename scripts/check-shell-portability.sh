#!/usr/bin/env bash
# Refuses shell constructs that work on macOS and fail on the Linux CI runner.
#
# Both rules below are measured, not theoretical. Each shipped green from a macOS
# checkout and then broke every affected call on the runner:
#
#   1. `env -u VAR command prog` - `command` is a SHELL BUILTIN and env execs a
#      PROGRAM, so this asks the kernel for a binary named "command". macOS ships
#      /usr/bin/command so it resolves; the Linux runner has none and the call dies.
#      env never resolves shell functions anyway, so `command` guards nothing here.
#      Found in 8 scripts; the first was fixed alone and the other 7 kept failing.
#
#   2. `sed -i ''` - the BSD in-place form. GNU sed's -i takes its suffix ATTACHED,
#      so the empty string is consumed as the SCRIPT and the real script is then
#      read as a filename ("sed: can't read s/a/b/"). Took 8 of 21 cases down in
#      generate-rule-index.test.sh while all 21 passed locally.
#
# Portable replacements: drop `command` entirely, and write sed output to a temp
# file then mv it over the target (see the sedi helper in generate-rule-index.test.sh).
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# These two carry the banned constructs as DATA: this gate documents them above and
# its test feeds them as fixtures. Scanning them would make the gate fail on itself.
SELF_BASENAMES="check-shell-portability.sh check-shell-portability.test.sh"

findings=0

report() {
  findings=$((findings + 1))
  printf 'check-shell-portability: FAIL %s\n     %s\n' "$1" "$2"
}

# A file's code with comments blanked, one output line per input line so grep -n
# still reports real line numbers.
#
# Required, not cosmetic: the fix for each construct below carries a comment that
# NAMES the construct, and an earlier version of this gate flagged all 7 of those
# explanations as offences. A rule that cannot tell code from prose about code
# fails on its own documentation.
#
# The `#` must start the line or follow whitespace, which leaves ${var#pattern}
# alone. ponytail: not quote-aware, so a literal " #" inside a string is blanked
# too; that can only ever hide an offence inside a string, never invent one.
code_only() {
  sed -E 's/(^|[[:space:]])#.*$/\1/' "$1"
}

is_self() {
  local base
  base="$(basename "$1")"
  case " $SELF_BASENAMES " in
    *" $base "*) return 0 ;;
    *) return 1 ;;
  esac
}

# Shell sources: *.sh plus extensionless executables carrying a shell shebang.
while IFS= read -r file; do
  [ -f "$file" ] || continue
  if is_self "$file"; then continue; fi
  case "$file" in
    *.sh) ;;
    *)
      head -n 1 "$file" | grep -qE '^#!.*(bash|sh)$|^#!.*(bash|sh) ' || continue
      ;;
  esac

  # Any words may sit between `env` and `command`: flags take separate arguments
  # (`-u VAR`), and NAME=value pairs are legal there too, so an alternation over
  # those two shapes alone misses the real `env -u GITHUB_TOKEN command gh`.
  while IFS= read -r hit; do
    report "${file}:${hit%%:*}" "env cannot exec the shell builtin \`command\`; drop it: $(printf '%s' "${hit#*:}" | sed 's/^[[:space:]]*//')"
  done < <(code_only "$file" | grep -nE '(^|[[:space:]])env([[:space:]]+[^[:space:]]+)*[[:space:]]+command[[:space:]]+[^[:space:]]' 2>/dev/null)

  while IFS= read -r hit; do
    report "${file}:${hit%%:*}" "BSD-only \`sed -i ''\`; GNU sed reads the script as a filename: $(printf '%s' "${hit#*:}" | sed 's/^[[:space:]]*//')"
  done < <(code_only "$file" | grep -nE "sed[[:space:]]+(-[^[:space:]]+[[:space:]]+)*-i[[:space:]]+''" 2>/dev/null)
done < <(find "$ROOT/scripts" -type f 2>/dev/null | sort)

if [ "$findings" -ne 0 ]; then
  printf 'check-shell-portability: FAIL (%d non-portable construct(s))\n' "$findings"
  exit 1
fi

printf 'check-shell-portability ok: no macOS-only shell constructs under %s\n' "$ROOT/scripts"
