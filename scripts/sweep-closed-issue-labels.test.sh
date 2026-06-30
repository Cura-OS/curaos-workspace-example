#!/usr/bin/env bash
# Tests for sweep-closed-issue-labels. Self-contained: a stub gh on PATH
# returns canned search/issue-list data or a forced API failure.
#
# RP-37 coverage: the org-wide dry-run must use the SEARCH fast path (one
# search/issues call per stranded label, ledger printed, results deduped by
# repo#number) and fail closed on a truncated search (fetched < total_count).
# --apply and --deep must use the full REST enumeration (deep scan) so label
# mutations are never driven by the laggy search index.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/sweep-closed-issue-labels"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
EDITLOG="$TMP/edits"
CALLLOG="$TMP/calls"
: > "$EDITLOG"
: > "$CALLLOG"

# Stub gh:
#   search/issues  -> one page; the single item (org/r#10) carries 2 stranded
#                     labels so EVERY label search returns the same issue
#                     (exercises dedupe). GH_STUB_SEARCH_TOTAL overrides
#                     total_count (truncation fixture); GH_STUB_SEARCH_EMPTY=1
#                     returns zero results (clean-pass fixture).
#   orgs/<o>/repos -> one active repo (org/r) + one archived (skipped).
#   repos/<r>/issues -> closed issues: #10 stranded, #11 clean, #12 is a PR.
cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$CALLLOG"
if [ "\${GH_STUB_FAIL:-0}" = "1" ]; then
  echo "REST read failed" >&2
  exit 1
fi

case "\$*" in
  *search/issues*)
    if [ "\${GH_STUB_SEARCH_EMPTY:-0}" = "1" ]; then
      echo '[{"total_count": 0, "items": []}]'
    else
      cat <<JSON
[
  {
    "total_count": \${GH_STUB_SEARCH_TOTAL:-1},
    "items": [
      {
        "number": 10,
        "repository_url": "https://api.github.com/repos/org/r",
        "labels": [{"name": "bug"}, {"name": "agent-PR-open"}, {"name": "ready-for-agent"}]
      }
    ]
  }
]
JSON
    fi
    ;;
  *orgs/*/repos*)
    echo '[[{"full_name": "org/r", "archived": false}, {"full_name": "org/dead", "archived": true}]]'
    ;;
  *repos/org/r/issues*)
    cat <<'JSON'
[
  [
    {"number": 10, "labels": [{"name": "bug"}, {"name": "agent-PR-open"}, {"name": "ready-for-agent"}]},
    {"number": 11, "labels": [{"name": "enhancement"}, {"name": "done"}]},
    {"number": 12, "pull_request": {}, "labels": [{"name": "agent-PR-open"}]}
  ]
]
JSON
    ;;
  "issue edit"*)
    printf '%s\n' "\$*" >> "$EDITLOG"
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

# --- RP-37: org-wide dry-run uses the search fast path -----------------------
: > "$CALLLOG"
out="$(run)"
searches=$(grep -c 'search/issues' "$CALLLOG" || true)
strips=$(printf '%s\n' "$out" | grep -c 'would-STRIP' || true)
if [ "$searches" -eq 7 ] \
  && ! grep -q 'orgs/' "$CALLLOG" \
  && [ "$strips" -eq 1 ] \
  && printf '%s' "$out" | grep -q 'would-STRIP  org/r#10' \
  && printf '%s' "$out" | grep -q 'agent-PR-open ready-for-agent' \
  && printf '%s' "$out" | grep -q 'ledger: 7 search call(s)' \
  && printf '%s' "$out" | grep -q 'EXIT=3'; then
  ok "org dry-run: search fast path (7 calls, ledger, dedupe to 1 row, exit 3)"
else
  nok "org dry-run search path" "searches=$searches strips=$strips out=$out calls=$(cat "$CALLLOG")"
fi

# search queries must scope to the org + closed issues + one label each
if grep -q 'q=org:your-org is:issue is:closed label:"ready-for-agent"' "$CALLLOG" \
  && grep -q 'label:"agent-claimed:claude"' "$CALLLOG"; then
  ok "search queries carry org/is:issue/is:closed/label qualifiers"
else
  nok "search query shape" "calls=$(cat "$CALLLOG")"
fi

# --- RP-37: clean org dry-run exits 0 ----------------------------------------
out="$(GH_STUB_SEARCH_EMPTY=1 run)"
if printf '%s' "$out" | grep -q 'dry-run: 0 closed issue(s)' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "clean search dry-run exits 0"
else
  nok "clean search dry-run" "$out"
fi

# --- RP-37: truncated search fails closed (fetched < total_count) ------------
: > "$EDITLOG"
out="$(GH_STUB_SEARCH_TOTAL=9 run)"
if printf '%s' "$out" | grep -q 'TRUNCATED' \
  && printf '%s' "$out" | grep -q 'EXIT=70' \
  && [ ! -s "$EDITLOG" ]; then
  ok "truncated search fails closed (exit 70, zero mutations)"
else
  nok "truncated search" "$out"
fi

# --- RP-37: --apply uses the DEEP confirmation path, never search ------------
: > "$CALLLOG"
: > "$EDITLOG"
out="$(run --apply)"
if ! grep -q 'search/issues' "$CALLLOG" \
  && grep -q 'orgs/' "$CALLLOG" \
  && grep -q 'repos/org/r/issues' "$CALLLOG" \
  && printf '%s' "$out" | grep -q 'STRIP  org/r#10' \
  && grep -q -- '--remove-label agent-PR-open --remove-label ready-for-agent' "$EDITLOG" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "--apply confirms via deep REST enumeration (no search calls) then strips"
else
  nok "--apply deep confirmation" "$out calls=$(cat "$CALLLOG") edits=$(cat "$EDITLOG")"
fi

# --- RP-37: --deep dry-run forces the full enumeration (weekly backstop) -----
: > "$CALLLOG"
out="$(run --deep)"
if ! grep -q 'search/issues' "$CALLLOG" \
  && grep -q 'orgs/' "$CALLLOG" \
  && printf '%s' "$out" | grep -q 'would-STRIP  org/r#10' \
  && printf '%s' "$out" | grep -q 'EXIT=3'; then
  ok "--deep dry-run uses full enumeration (no search calls)"
else
  nok "--deep dry-run" "$out calls=$(cat "$CALLLOG")"
fi

# --- single-repo scope (REST enumeration, unchanged contract) -----------------
out="$(run --repo org/r)"
if printf '%s' "$out" | grep -q 'would-STRIP  org/r#10' \
  && printf '%s' "$out" | grep -q 'agent-PR-open ready-for-agent' \
  && printf '%s' "$out" | grep -q 'EXIT=3'; then
  ok "dry-run reports stranded labels and exits 3"
else
  nok "dry-run stranded labels" "$out"
fi

: > "$EDITLOG"
out="$(run --apply --repo org/r)"
if printf '%s' "$out" | grep -q 'STRIP  org/r#10' \
  && grep -q -- '--remove-label agent-PR-open --remove-label ready-for-agent' "$EDITLOG" \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "apply strips stranded labels"
else
  nok "apply strips" "$out edits=$(cat "$EDITLOG")"
fi

out="$(PATH="$TMP:$PATH" GH_STUB_FAIL=1 bash "$SCRIPT" --repo org/r 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'gh issues REST read failed' \
  && printf '%s' "$out" | grep -q 'EXIT=70'; then
  ok "GitHub read failure exits 70"
else
  nok "failure exits 70" "$out"
fi

# search read failure also fails closed (exit 70)
out="$(PATH="$TMP:$PATH" GH_STUB_FAIL=1 bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'gh search read failed' \
  && printf '%s' "$out" | grep -q 'EXIT=70'; then
  ok "search read failure exits 70"
else
  nok "search failure exits 70" "$out"
fi

# RP-07: the issues read must page (--paginate), never a fixed --limit cap
# that could silently truncate the closed-issue set and false-pass the sweep.
: > "$CALLLOG"
out="$(run --repo org/r)"
if grep -q -- '--paginate' "$CALLLOG" && ! grep -q -- '--limit' "$CALLLOG"; then
  ok "issues read uses --paginate with no fixed --limit cap"
else
  nok "paginated read (no --limit)" "calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
