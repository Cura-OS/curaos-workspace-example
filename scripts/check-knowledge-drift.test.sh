#!/usr/bin/env bash
# Tests for scripts/check-knowledge-drift.sh (RP-61). Self-contained: gh stub
# on PATH, fixture workspace as a real git repo so the head_sha comparison
# runs for real, fixture AGENTS.md section 15 + rules dir + memory index.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-knowledge-drift.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BIN="$TMP/bin"
mkdir -p "$BIN" "$TMP/nohooks"

# gh stub: `gh search issues ... --json title,state,number,repository`
cat > "$BIN/gh" <<'STUB'
#!/usr/bin/env bash
if [ "${GH_STUB_FAIL:-0}" = "1" ]; then
  echo "gh: api unreachable" >&2
  exit 1
fi
printf '%s\n' "${GH_STUB_EPICS:-[]}"
STUB
chmod +x "$BIN/gh"

# live convention: Epic = tracker issue titled `[M<N>] ...`; stories are
# `[M<N>-S..]` and must NOT count as the Epic
EPICS_DEFAULT='[
  {"title":"[M9] Identity cluster epic","state":"CLOSED","number":23},
  {"title":"[M9-S9] M9 close-gate story (still HELD wording trap)","state":"OPEN","number":106},
  {"title":"[M11] Neutral services epic","state":"CLOSED","number":25},
  {"title":"[M16] Chart generator epic","state":"OPEN","number":536}
]'

mk_ws() {
  WS="$TMP/ws-$1"
  mkdir -p "$WS/ai/rules" "$WS/ai/curaos/docs" "$WS/mem"
  cat > "$WS/AGENTS.md" <<'EOF'
# AGENTS fixture

## 14. Filler

Not the rules section.

## 15. Workspace Rules

| Rule | File |
|---|---|
| Alpha | [curaos_alpha_rule.md](ai/rules/curaos_alpha_rule.md) |
| Beta | [curaos_beta_rule.md](ai/rules/curaos_beta_rule.md) |

## 16. After

Out of section.
EOF
  printf '# alpha rule\n' > "$WS/ai/rules/curaos_alpha_rule.md"
  printf '# beta rule\n' > "$WS/ai/rules/curaos_beta_rule.md"
  printf '# Memory Index fixture\n\n- M9 WAVE-DONE then M16 Epic open work\n' > "$WS/mem/MEMORY.md"
  git -C "$WS" init -q
  git -C "$WS" config core.hooksPath "$TMP/nohooks"
  git -C "$WS" add -A
  git -C "$WS" -c user.email=t@t -c user.name=t commit -qm fixture
  HEAD_SHA="$(git -C "$WS" rev-parse HEAD)"
  cat > "$WS/ai/curaos/docs/HANDOVER.md" <<EOF
---
goal: fixture
branch: main
head_sha: ${HEAD_SHA:0:12} (workspace repo, fixture)
next_action: none
---
body
EOF
}

run_drift() {
  PATH="$BIN:$PATH" \
  KNOWLEDGE_DRIFT_WS="$WS" \
  KNOWLEDGE_DRIFT_MEMORY_INDEX="$WS/mem/MEMORY.md" \
  GH_STUB_EPICS="${GH_STUB_EPICS:-$EPICS_DEFAULT}" \
  bash "$SCRIPT" "$@" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# 1. green path: index matches rules dir, claims match epics, head_sha matches
mk_ws green
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'knowledge stores reconcile' \
  && printf '%s' "$out" | grep -q 'check 1: AGENTS section 15 and .* reconcile (2 rule files' \
  && printf '%s' "$out" | grep -q 'M9: memory claim .* matches Epic state CLOSED' \
  && printf '%s' "$out" | grep -q 'check 3: HANDOVER head_sha .* matches HEAD' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "green path exits 0 with all three checks reconciled"
else
  nok "green path" "$out"
fi

# 2. rule file on disk but missing from AGENTS section 15 fails
mk_ws unindexed
printf '# gamma rule\n' > "$WS/ai/rules/curaos_gamma_rule.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'on disk but absent from AGENTS section 15: ai/rules/curaos_gamma_rule.md' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unindexed rule file drifts (the 44-vs-48 class)"
else
  nok "unindexed rule" "$out"
fi

# 3. section-15 link with no rule file on disk fails
mk_ws deadlink
rm "$WS/ai/rules/curaos_beta_rule.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'links rule file(s) that do not exist: ai/rules/curaos_beta_rule.md' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "dead section-15 rule link drifts"
else
  nok "dead rule link" "$out"
fi

# 4. memory claims OPEN-class state while the Epic is closed fails
mk_ws stalemem
printf '# Memory Index fixture\n\n- M11 still HELD pending activation\n' > "$WS/mem/MEMORY.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'DRIFT M11: memory claims' \
  && printf '%s' "$out" | grep -q 'but the Epic is CLOSED' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "stale memory milestone claim (M11 HELD vs closed Epic) drifts"
else
  nok "stale milestone claim" "$out"
fi

# 5. closed-class claim against an OPEN epic fails too
mk_ws earlyclaim
printf '# Memory Index fixture\n\n- M16 DONE and shipped\n' > "$WS/mem/MEMORY.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'DRIFT M16: memory claims' \
  && printf '%s' "$out" | grep -q 'but the Epic is OPEN' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "premature done-claim (M16 DONE vs open Epic) drifts"
else
  nok "premature done-claim" "$out"
fi

# 6. self-contradicting claims for one milestone drift without needing an epic
mk_ws contradict
printf '# Memory Index fixture\n\n- M9 WAVE-DONE\n- M9 still HELD\n' > "$WS/mem/MEMORY.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'memory index contradicts itself on M9' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "self-contradicting milestone claims drift"
else
  nok "contradicting claims" "$out"
fi

# 7. claim with no matching Epic is a note, not drift
mk_ws noepic
printf '# Memory Index fixture\n\n- M99 HELD forever\n' > "$WS/mem/MEMORY.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'no \[M99\] Epic found in the tracker repo' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "claim without a matching Epic notes as unverifiable, no drift"
else
  nok "no-epic claim" "$out"
fi

# 8. Epic probe failure fails closed; --skip-github bypasses only that leg
mk_ws ghdown
out="$(GH_STUB_FAIL=1 run_drift)"
if printf '%s' "$out" | grep -q 'Epic-state probe failed' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "Epic probe failure fails closed"
else
  nok "probe fail-closed" "$out"
fi
out="$(GH_STUB_FAIL=1 run_drift --skip-github)"
if printf '%s' "$out" | grep -q 'NOT reconciled against Epic states' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "--skip-github bypasses only the Epic leg"
else
  nok "--skip-github" "$out"
fi

# 9. probe truncation (result count >= limit) fails closed
mk_ws truncated
out="$(KNOWLEDGE_DRIFT_EPIC_LIMIT=3 run_drift)"
if printf '%s' "$out" | grep -q 'possible truncation, failing closed' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "Epic probe truncation fails closed"
else
  nok "probe truncation" "$out"
fi

# 10. stale HANDOVER head_sha fails
mk_ws stalesha
sed -i.bak 's/^head_sha: .*/head_sha: 0123abc0123a (stale fixture)/' "$WS/ai/curaos/docs/HANDOVER.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'does not match actual HEAD' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "stale HANDOVER head_sha drifts"
else
  nok "stale head_sha" "$out"
fi

# 11. missing/garbage head_sha fails closed
mk_ws nosha
sed -i.bak 's/^head_sha: .*/head_sha: not-a-sha/' "$WS/ai/curaos/docs/HANDOVER.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'not a 7-40 char hex SHA' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "non-hex head_sha fails closed"
else
  nok "non-hex head_sha" "$out"
fi

# 12. missing memory index is a vacuous note, not a failure
mk_ws nomem
rm "$WS/mem/MEMORY.md"
out="$(run_drift)"
if printf '%s' "$out" | grep -q 'memory index not found' \
  && printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "missing memory index notes vacuous pass"
else
  nok "missing memory index" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
