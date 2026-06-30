#!/usr/bin/env bash
# Tests for generate-operator-queue (RP-52). Self-contained: a stub gh on PATH
# returns canned search pages (or forced failure / truncation). Fixture covers
# the four unblock-command resolution paths (explicit body line, GHCR keyword,
# cosign keyword, fallback), label dedupe, em-dash + pipe sanitizing, and the
# fail-closed exits (read failure, incomplete_results truncation).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/generate-operator-queue"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
CALLLOG="$TMP/calls"
: > "$CALLLOG"

# Fixture notes:
# - issue 618 carries BOTH labels (dedupe case) + GHCR keywords in the body.
# - issue 489 carries an explicit `Unblock:` body line (beats every heuristic)
#   plus a pipe in the title (table-escape case).
# - issue 12 hits the cosign keyword.
# - issue 77 hits nothing (fallback OPEN <url> case).
# - issue 618's title carries \u2014 (em dash, escape-encoded in the JSON so
#   this test file itself stays dash-free) to prove the no-dash sanitizing.
cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$CALLLOG"
if [ "\${GH_STUB_FAIL:-0}" = "1" ]; then
  echo "search read failed" >&2
  exit 1
fi
if [ "\${GH_STUB_EMPTY:-0}" = "1" ]; then
  echo '[{"total_count": 0, "incomplete_results": false, "items": []}]'
  exit 0
fi

case "\$*" in
  *"label:ready-for-human"*)
    if [ "\${GH_STUB_TRUNC:-0}" = "1" ]; then
      cat <<'JSON'
[{"total_count": 1200, "incomplete_results": true, "items": []}]
JSON
      exit 0
    fi
    cat <<'JSON'
[{"total_count": 3, "incomplete_results": false, "items": [
  {"number": 618,
   "title": "v1 image build blocked \u2014 GHCR push rejected",
   "html_url": "https://github.com/your-org/curaos/issues/618",
   "repository_url": "https://api.github.com/repos/your-org/curaos",
   "body": "docker push to ghcr.io returns 403; token lacks write:packages."},
  {"number": 489,
   "title": "OQ-05 benchmarks | operator run",
   "html_url": "https://github.com/your-org/curaos-ai-workspace/issues/489",
   "repository_url": "https://api.github.com/repos/your-org/curaos-ai-workspace",
   "body": "Unblock: just oq-05-bench\r\nGHCR mention here must NOT override the explicit line."},
  {"number": 12,
   "title": "provision signing keys",
   "html_url": "https://github.com/your-org/homelab/issues/12",
   "repository_url": "https://api.github.com/repos/your-org/homelab",
   "body": "need a cosign keypair stored in the vault"}
]}]
JSON
    ;;
  *"label:operator-blocked"*)
    cat <<'JSON'
[{"total_count": 2, "incomplete_results": false, "items": [
  {"number": 618,
   "title": "v1 image build blocked \u2014 GHCR push rejected",
   "html_url": "https://github.com/your-org/curaos/issues/618",
   "repository_url": "https://api.github.com/repos/your-org/curaos",
   "body": "docker push to ghcr.io returns 403; token lacks write:packages."},
  {"number": 77,
   "title": "misc operator step",
   "html_url": "https://github.com/your-org/curaos/issues/77",
   "repository_url": "https://api.github.com/repos/your-org/curaos",
   "body": "steps are written out in this body"}
]}]
JSON
    ;;
  *)
    echo "unexpected gh call: \$*" >&2
    exit 2
    ;;
esac
STUB
chmod +x "$TMP/gh"

OUT_DOC="$TMP/OPERATOR-QUEUE.md"

run() {
  PATH="$TMP:$PATH" bash "$SCRIPT" "$@" 2>&1
  rc=$?
  printf 'EXIT=%s\n' "$rc"
}

# 1. Happy path: doc written, deduped to 4 rows, counts line correct.
out="$(run --output "$OUT_DOC")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && [ -f "$OUT_DOC" ] \
  && grep -q 'deduped total: 4' "$OUT_DOC" \
  && grep -q '`ready-for-human` (3)' "$OUT_DOC" \
  && grep -q '`operator-blocked` (2)' "$OUT_DOC" \
  && [ "$(grep -c 'issues/618' "$OUT_DOC")" = "1" ]; then
  ok "doc written; both-label issue deduped; counts line correct"
else
  nok "happy path doc" "$out doc=$(cat "$OUT_DOC" 2>/dev/null)"
fi

# 2. Resolution order: explicit Unblock line beats the GHCR keyword heuristic.
if grep -q 'just oq-05-bench' "$OUT_DOC" \
  && ! grep -E 'oq-05-bench.*gh auth refresh|489.*gh auth refresh' "$OUT_DOC" >/dev/null; then
  ok "explicit Unblock: body line wins over keyword heuristics"
else
  nok "explicit unblock line" "$(grep 489 "$OUT_DOC")"
fi

# 3. GHCR keyword row carries the exact scope-refresh one-liner.
if grep -q 'gh auth refresh -h github.com -s write:packages,read:packages && scripts/preflight-credentials' "$OUT_DOC"; then
  ok "GHCR class resolves to the gh auth refresh + preflight one-liner"
else
  nok "ghcr command" "$(grep 618 "$OUT_DOC")"
fi

# 4. cosign keyword row carries the keypair one-liner.
if grep -q 'cosign generate-key-pair' "$OUT_DOC"; then
  ok "cosign class resolves to the keypair one-liner"
else
  nok "cosign command" "$(grep -n 12 "$OUT_DOC")"
fi

# 5. No-keyword issue falls back to OPEN <url>.
if grep -q 'OPEN https://github.com/your-org/curaos/issues/77 (steps in issue body)' "$OUT_DOC"; then
  ok "no-keyword issue falls back to OPEN <url>"
else
  nok "fallback command" "$(grep 77 "$OUT_DOC")"
fi

# 6. Sanitizing: em dash in a title becomes '-'; pipe in a title is escaped.
EMDASH="$(printf '\342\200\224')"
if ! grep -q "$EMDASH" "$OUT_DOC" \
  && grep -q 'v1 image build blocked - GHCR push rejected' "$OUT_DOC" \
  && grep -q 'OQ-05 benchmarks \\| operator run' "$OUT_DOC"; then
  ok "titles sanitized: em dash -> '-', pipes escaped for the table"
else
  nok "sanitizing" "$(grep -E '618|489' "$OUT_DOC")"
fi

# 7. Read failure exits 70 and leaves the existing doc untouched (fail closed).
printf 'SENTINEL existing doc\n' > "$OUT_DOC"
out="$(PATH="$TMP:$PATH" GH_STUB_FAIL=1 bash "$SCRIPT" --output "$OUT_DOC" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=70' \
  && grep -q 'SENTINEL existing doc' "$OUT_DOC"; then
  ok "gh read failure exits 70 and preserves the existing doc"
else
  nok "read failure fail-closed" "$out doc=$(cat "$OUT_DOC")"
fi

# 8. Truncated search (incomplete_results=true) exits 70: BLOCKED, never "empty".
out="$(PATH="$TMP:$PATH" GH_STUB_TRUNC=1 bash "$SCRIPT" --output "$OUT_DOC" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=70' \
  && printf '%s' "$out" | grep -qi 'truncated' \
  && grep -q 'SENTINEL existing doc' "$OUT_DOC"; then
  ok "truncated search exits 70 (BLOCKED, not empty) and preserves the doc"
else
  nok "truncation fail-closed" "$out"
fi

# 9. Empty queue renders the explicit zero-items line (a real, distinct state).
out="$(PATH="$TMP:$PATH" GH_STUB_EMPTY=1 bash "$SCRIPT" --output "$OUT_DOC" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -q 'Queue empty: 0 open operator items' "$OUT_DOC"; then
  ok "empty result set renders the explicit empty-queue line"
else
  nok "empty queue" "$out doc=$(cat "$OUT_DOC")"
fi

# 10. --stdout prints the doc without writing a file.
rm -f "$TMP/stdout-probe.md"
out="$(run --stdout)"
if printf '%s' "$out" | grep -q '# OPERATOR-QUEUE' \
  && printf '%s' "$out" | grep -q 'EXIT=0' \
  && [ ! -f "$DIR/../ai/curaos/docs/OPERATOR-QUEUE.md.tmp" ]; then
  ok "--stdout prints the doc"
else
  nok "--stdout" "$out"
fi

# 11. RP-05 alignment: reads page with GET + --paginate, no fixed --limit cap.
if grep -q -- '--paginate' "$CALLLOG" \
  && grep -q -- '-X GET' "$CALLLOG" \
  && ! grep -q -- '--limit' "$CALLLOG"; then
  ok "search reads use GET + --paginate with no --limit cap"
else
  nok "paginated GET read" "calls=$(cat "$CALLLOG")"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
