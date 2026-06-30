#!/usr/bin/env bash
# Tests for sweep-label-seed. Self-contained: a stub gh on PATH returns canned
# org-repo + per-repo label data or a forced API failure. Fixture covers a
# missing-label repo (org/drift lacks blocked + ready-for-agent) next to a
# fully-seeded repo (org/full).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/sweep-label-seed"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SEEDLOG="$TMP/seeds"
CALLLOG="$TMP/calls"
: > "$SEEDLOG"
: > "$CALLLOG"

cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$CALLLOG"
if [ "\${GH_STUB_FAIL:-0}" = "1" ]; then
  echo "REST read failed" >&2
  exit 1
fi

case "\$*" in
  *"orgs/your-org/repos"*)
    cat <<'JSON'
[
  [
    {"full_name": "org/full", "archived": false},
    {"full_name": "org/drift", "archived": false},
    {"full_name": "org/dead", "archived": true}
  ]
]
JSON
    ;;
  *"repos/org/full/labels"*)
    cat <<'JSON'
[
  [
    {"name": "needs-triage"}, {"name": "needs-info"}, {"name": "ready-for-agent"},
    {"name": "ready-for-human"}, {"name": "wontfix"}, {"name": "bug"},
    {"name": "enhancement"}, {"name": "foresight"}, {"name": "blocked"}
  ]
]
JSON
    ;;
  *"repos/org/drift/labels"*)
    cat <<'JSON'
[
  [
    {"name": "needs-triage"}, {"name": "needs-info"},
    {"name": "ready-for-human"}, {"name": "wontfix"}, {"name": "bug"},
    {"name": "enhancement"}, {"name": "foresight"}, {"name": "documentation"}
  ]
]
JSON
    ;;
  "label create"*)
    printf '%s\n' "\$*" >> "$SEEDLOG"
    ;;
  *)
    echo "unexpected gh call: \$*" >&2
    exit 2
    ;;
esac
STUB
chmod +x "$TMP/gh"

run() {
  PATH="$TMP:$PATH" bash "$SCRIPT" "$@" 2>&1
  rc=$?
  printf 'EXIT=%s\n' "$rc"
}

# 1. org-wide dry-run: the missing-label repo is reported, the seeded one is not, exit 3.
out="$(run)"
if printf '%s' "$out" | grep -q 'would-SEED  org/drift - ready-for-agent' \
  && printf '%s' "$out" | grep -q 'would-SEED  org/drift - blocked' \
  && ! printf '%s' "$out" | grep -q 'org/full' \
  && ! printf '%s' "$out" | grep -q 'org/dead' \
  && printf '%s' "$out" | grep -q 'EXIT=3'; then
  ok "dry-run reports missing canonical labels and exits 3"
else
  nok "dry-run missing labels" "$out"
fi

# 2. fully-seeded single repo: clean dry-run exits 0 (explicit --dry-run flag accepted).
out="$(run --dry-run --repo org/full)"
if printf '%s' "$out" | grep -q 'dry-run: 0 canonical label(s) missing' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "clean repo dry-run exits 0"
else
  nok "clean dry-run" "$out"
fi

# 3. --apply seeds exactly the missing labels with canonical color.
: > "$SEEDLOG"
out="$(run --apply --repo org/drift)"
if printf '%s' "$out" | grep -q 'SEED   org/drift - blocked' \
  && grep -q -- 'label create blocked --repo org/drift --color E99695' "$SEEDLOG" \
  && grep -q -- 'label create ready-for-agent --repo org/drift --color 0E8A16' "$SEEDLOG" \
  && ! grep -q -- 'label create needs-triage' "$SEEDLOG" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "apply seeds only the missing labels"
else
  nok "apply seeds" "$out seeds=$(cat "$SEEDLOG")"
fi

# 4. GitHub read failure exits 70 (fail closed, never a false clean pass).
out="$(PATH="$TMP:$PATH" GH_STUB_FAIL=1 bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'gh repos REST read failed' \
  && printf '%s' "$out" | grep -q 'EXIT=70'; then
  ok "GitHub read failure exits 70"
else
  nok "failure exits 70" "$out"
fi

# RP-07 alignment: reads must page (--paginate), never a fixed --limit cap
# that could silently truncate the repo or label set and false-pass the sweep.
: > "$CALLLOG"
out="$(run)"
if grep -q -- '--paginate' "$CALLLOG" && ! grep -q -- '--limit' "$CALLLOG"; then
  ok "reads use --paginate with no fixed --limit cap"
else
  nok "paginated read (no --limit)" "calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
