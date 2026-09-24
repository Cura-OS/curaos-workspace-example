#!/usr/bin/env bash
# Tests for check-actions-bun-pin.sh. Every case EXECUTES the checker against a fixture
# workflow tree and asserts on the resulting exit status, never on the text of the real
# .github/workflows/docs.yml (a text assertion would pass against a workflow that no
# runner ever accepts).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-actions-bun-pin.sh"
ROOT="$(cd "$DIR/.." && pwd)"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fixture workflow. $1 = directory, $2 = the `with:` block to attach to the setup-bun
# step (empty string means no `with:` at all, i.e. the unpinned defect).
fixture() {
  mkdir -p "$1"
  {
    printf 'name: CI\non:\n  pull_request: {}\n\njobs:\n  ci:\n    runs-on: self-hosted\n    steps:\n'
    printf '      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5\n'
    printf '        with:\n          persist-credentials: false\n'
    printf '      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2\n'
    if [ -n "$2" ]; then printf '%s\n' "$2"; fi
    printf '      - name: Run the declared workspace gate\n        run: just ci\n'
  } > "$1/docs.yml"
}

run() {
  bash "$SCRIPT" "$1" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# 1) WITH the pin: exit 0.
fixture "$TMP/pinned" '        with:
          bun-version: 1.3.14'
out="$(run "$TMP/pinned")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a setup-bun step carrying an exact bun-version passes"
else
  nok "pinned fixture passes" "$out"
fi

# 2) WITHOUT the pin: non-zero. This is the defect the gate exists for: setup-bun with no
#    bun-version input silently installs whatever bun is newest on the day the run happens.
fixture "$TMP/unpinned" ''
out="$(run "$TMP/unpinned")"
if ! printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a setup-bun step with no bun-version input fails closed"
else
  nok "unpinned fixture fails" "$out"
fi

# 3) A pin is only a pin if it names one version. Every floating form must fail.
for floating in latest canary '1.x' '^1.3.14' '~1.3.14' '""'; do
  fixture "$TMP/float" "        with:
          bun-version: $floating"
  out="$(run "$TMP/float")"
  if ! printf '%s' "$out" | grep -q 'EXIT=0'; then
    ok "floating bun-version '$floating' fails closed"
  else
    nok "floating '$floating' rejected" "$out"
  fi
done

# 4) Quoting is a YAML choice, not a pin strength, so a quoted exact version passes.
fixture "$TMP/quoted" '        with:
          bun-version: "1.3.14"'
out="$(run "$TMP/quoted")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a quoted exact bun-version passes"
else
  nok "quoted pin passes" "$out"
fi

# 5) The pin must belong to the setup-bun step. A bun-version sitting on a DIFFERENT step
#    is not a pin, and a checker that greps the whole file would call this green.
fixture "$TMP/wrongstep" '      - name: unrelated
        with:
          bun-version: 1.3.14'
out="$(run "$TMP/wrongstep")"
if ! printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a bun-version on a different step does not satisfy the setup-bun step"
else
  nok "per-step scoping" "$out"
fi

# 6) Fail closed on an unreadable target: a missing workflow directory must never be
#    reported as "nothing to check, all good".
out="$(run "$TMP/does-not-exist")"
if ! printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a missing workflow directory fails closed"
else
  nok "missing dir fails closed" "$out"
fi

# 7) A workflow tree with no setup-bun step at all is legitimately green.
mkdir -p "$TMP/nobun"
printf 'name: CI\non:\n  pull_request: {}\njobs:\n  ci:\n    runs-on: self-hosted\n    steps:\n      - run: echo hi\n' > "$TMP/nobun/x.yml"
out="$(run "$TMP/nobun")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a workflow tree with no setup-bun step passes"
else
  nok "no setup-bun passes" "$out"
fi

# 8) The gate is only worth anything if it is pointed at this repo's REAL workflows, so
#    run it exactly as `just pins` does, with no argument.
out="$( (cd "$ROOT" && bash "$SCRIPT" 2>&1); printf 'EXIT=%s\n' "$?" )"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "this repository's own .github/workflows passes the gate"
else
  nok "real workflows pass" "$out"
fi

# 9) FAIL-OPEN REGRESSION. `uses:` may carry an ordinary quoted scalar. The matcher only
#    accepted the unquoted spelling, so a quoted step with NO bun-version at all was never
#    counted and the gate printed "0 setup-bun step(s) pinned" and exit 0: green on the exact
#    defect it exists to catch. The quoted step must be found and must fail.
qi=0
for q in '"' "'"; do
  qi=$((qi+1))
  d="$TMP/quoted$qi"
  mkdir -p "$d"
  {
    printf 'name: CI\non:\n  pull_request: {}\n\njobs:\n  ci:\n    runs-on: self-hosted\n    steps:\n'
    printf '      - uses: %soven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6%s\n' "$q" "$q"
    printf '      - name: Run the declared workspace gate\n        run: just ci\n'
  } > "$d/docs.yml"
  out="$(run "$d")"
  if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'declares no bun-version'; then
    ok "a ${q}-quoted uses: with no bun-version is caught, not skipped"
  else
    nok "quoted uses: is caught" "$out"
  fi
done

# 10) FAIL-CLOSED REGRESSION. A `with:` block may carry a YAML block scalar whose lines are
#     list items. Treating every indented "- " as a new step ended the record before the
#     bun-version line, so a CORRECTLY pinned workflow was rejected by its own gate. Only a
#     sibling or shallower list item may end a step record.
fixture "$TMP/blockscalar" '        with:
          registries: |
            - https://example.invalid
          bun-version: 1.3.14'
out="$(run "$TMP/blockscalar")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "a block scalar carrying list items does not split the step record"
else
  nok "block scalar does not split the record" "$out"
fi

# 11) The boundary relaxation must not let a NEIGHBOURING step supply the pin: the record
#     still ends at a sibling list item, so an unpinned step followed by a pinned one fails.
d="$TMP/neighbour"
mkdir -p "$d"
{
  printf 'name: CI\non:\n  pull_request: {}\n\njobs:\n  ci:\n    runs-on: self-hosted\n    steps:\n'
  printf '      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6\n'
  printf '      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd\n'
  printf '        with:\n          bun-version: 1.3.14\n'
} > "$d/docs.yml"
out="$(run "$d")"
if printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "a pin on the NEXT step still does not count for an unpinned setup-bun step"
else
  nok "neighbour pin does not leak" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
