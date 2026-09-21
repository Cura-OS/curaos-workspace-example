#!/usr/bin/env bash
# check-actions-bun-pin.sh: every oven-sh/setup-bun step must declare an EXACT bun-version.
#
# The action reference itself is SHA-pinned, which pins the action's code and nothing else:
# with no `bun-version` input the action defaults to "latest" and downloads whatever bun was
# released most recently. A hosted run then executes the suite on a runtime the local gate
# never saw, so a green local `just ci` stops predicting the hosted result, which is the one
# property this repo's local-CI-first gate is built on. Observed: a hosted run logged
# "Downloading a new version of Bun: bun-v1.4.2" and "bun test v1.4.2" while the branch was
# developed and proven green against the version recorded in .github/workflows/docs.yml.
#
# Pin source per curaos_version_pinning_rule: exact versions, no range modifiers, no floating
# tags. "latest" and "canary" are explicitly not pins.
#
# Usage: check-actions-bun-pin.sh [workflow-dir-or-file]   (default: .github/workflows)
# Fail closed: an unreadable target exits 1 rather than reporting nothing to check.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT/.github/workflows}"

shopt -s nullglob
if [ -f "$TARGET" ]; then
  FILES=("$TARGET")
elif [ -d "$TARGET" ]; then
  FILES=("$TARGET"/*.yml "$TARGET"/*.yaml)
else
  echo "actions-bun-pin: $TARGET is neither a file nor a directory; failing closed" >&2
  exit 1
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "actions-bun-pin: no workflow files under $TARGET"
  exit 0
fi

BAD=0
STEPS=0
for f in "${FILES[@]}"; do
  out="$(awk -v file="$f" '
    # A step record runs from its "- " list-item line to the next one. Anything the record
    # does not contain is not part of that step, so a bun-version declared on a neighbouring
    # step never counts as a pin for this one.
    function flush(   i, nl, L, v, found) {
      if (buf ~ /uses:[ \t]*oven-sh\/setup-bun@/) {
        steps += 1
        found = 0
        nl = split(buf, L, "\n")
        for (i = 1; i <= nl; i++) {
          if (match(L[i], /^[ \t]*bun-version:[ \t]*/)) {
            v = substr(L[i], RSTART + RLENGTH)
            sub(/[ \t]*#.*$/, "", v)
            sub(/[ \t]+$/, "", v)
            gsub(/^["'"'"']|["'"'"']$/, "", v)
            found = 1
            break
          }
        }
        if (!found || v == "") {
          printf "actions-bun-pin: %s: the oven-sh/setup-bun step declares no bun-version input; it will install whatever bun is newest, so a green local gate stops predicting this run\n", file
          bad += 1
        } else if (v !~ /^v?[0-9]+\.[0-9]+\.[0-9]+$/) {
          printf "actions-bun-pin: %s: bun-version \"%s\" is not an exact version; floating tags and range modifiers are not pins\n", file, v
          bad += 1
        }
      }
      buf = ""
    }
    /^[ \t]*-[ \t]/ { flush() }
    { buf = buf "\n" $0 }
    END { flush(); printf "STEPS=%d BAD=%d\n", steps, bad }
  ' "$f")" || {
    echo "actions-bun-pin: failed to read $f; failing closed" >&2
    exit 1
  }
  # Last line is the tally; everything before it is a problem report.
  tally="$(printf '%s\n' "$out" | tail -n 1)"
  printf '%s\n' "$out" | sed '$d' | grep . >&2
  s="${tally#STEPS=}"; s="${s%% *}"
  STEPS=$((STEPS + s))
  BAD=$((BAD + ${tally##*BAD=}))
done

if [ "$BAD" -gt 0 ]; then
  echo "actions-bun-pin: $BAD setup-bun step(s) without an exact bun-version (curaos_version_pinning_rule)" >&2
  exit 1
fi
echo "actions-bun-pin: $STEPS setup-bun step(s) pinned to an exact version"
