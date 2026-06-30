#!/usr/bin/env bash
# check-knowledge-drift.sh: GitOps-style reconciliation for prose knowledge
# stores (remediation RP-61; structurally parallel to check-ai-mirror.sh, but
# for claims instead of paths). Prose stores drift from reality silently; this
# gate compares three claim classes against their machine-checkable truth:
#
#   1. Rule index: every `ai/rules/curaos_*.md` file must be linked from the
#      workspace AGENTS.md section 15 table, and every section-15 link must
#      resolve to an existing rule file (the "44 vs 48 rules" drift class).
#   2. Milestone states: explicit milestone-state claims in the memory index
#      (MEMORY.md; forms like "M11 HELD", "M9 WAVE-DONE", "M14 done") must
#      agree with the corresponding GitHub Epic's open/closed state (the
#      session-28 "acted on stale memory" class). Epics are the tracker-repo
#      issues whose title starts with the exact bracket prefix `[M<N>]`
#      (stories are `[M<N>-S..]` and never match; there is NO `epic` label
#      in the live org, verified 2026-06-10). Open-class claims: HELD,
#      ACTIVE, "in flight". Closed-class claims: DONE, WAVE-DONE, CLOSED.
#      Conflicting claims for one milestone inside the index are drift on
#      their own. A claim with no matching Epic is a note (unverifiable,
#      pre-tracker history exists); a failed/truncated Epic probe FAILS
#      closed (RR-03 fail-open class).
#   3. HANDOVER head_sha: the frontmatter `head_sha` must be an ancestor-free
#      prefix match of the actual `git rev-parse HEAD` of the workspace repo
#      (the stale stop-state doc class).
#
# Usage: check-knowledge-drift.sh [--skip-github]
#   --skip-github   skip the Epic-state leg of check 2 (offline runs); every
#                   local comparison still gates.
#
# Env overrides (test fixtures + non-default layouts):
#   KNOWLEDGE_DRIFT_WS            workspace root (default: this script's parent)
#   KNOWLEDGE_DRIFT_AGENTS        AGENTS.md path (default: $WS/AGENTS.md)
#   KNOWLEDGE_DRIFT_RULES_DIR     rules dir (default: $WS/ai/rules)
#   KNOWLEDGE_DRIFT_HANDOVER      HANDOVER path (default:
#                                 $WS/ai/curaos/docs/HANDOVER.md)
#   KNOWLEDGE_DRIFT_MEMORY_INDEX  memory index path (default:
#                                 $HOME/.claude/projects/<dashed $WS>/memory/
#                                 MEMORY.md; missing = check 2 vacuous note)
#   KNOWLEDGE_DRIFT_ORG           GitHub org (default: your-org)
#   KNOWLEDGE_DRIFT_TRACKER_REPO  tracker repo holding the [M<N>] Epic issues
#                                 (default: curaos-ai-workspace)
#   KNOWLEDGE_DRIFT_REPO          git repo for the HEAD comparison (default: $WS)
#   KNOWLEDGE_DRIFT_EPIC_LIMIT    tracker issue-list limit; hitting it =
#                                 truncation, fail closed (default: 1000)
#   KNOWLEDGE_DRIFT_NODE          node binary (default: node)
#
# Exit: 0 = stores reconcile; 1 = drift or probe failure; 2 = usage/env error.
set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="${KNOWLEDGE_DRIFT_WS:-$(cd "$SELF_DIR/.." && pwd)}"
AGENTS="${KNOWLEDGE_DRIFT_AGENTS:-$WS/AGENTS.md}"
RULES_DIR="${KNOWLEDGE_DRIFT_RULES_DIR:-$WS/ai/rules}"
HANDOVER="${KNOWLEDGE_DRIFT_HANDOVER:-$WS/ai/curaos/docs/HANDOVER.md}"
MEMORY_INDEX="${KNOWLEDGE_DRIFT_MEMORY_INDEX:-$HOME/.claude/projects/$(printf '%s' "$WS" | tr '/' '-')/memory/MEMORY.md}"
ORG="${KNOWLEDGE_DRIFT_ORG:-your-org}"
TRACKER_REPO="${KNOWLEDGE_DRIFT_TRACKER_REPO:-curaos-ai-workspace}"
REPO="${KNOWLEDGE_DRIFT_REPO:-$WS}"
EPIC_LIMIT="${KNOWLEDGE_DRIFT_EPIC_LIMIT:-1000}"
NODE_BIN="${KNOWLEDGE_DRIFT_NODE:-node}"

SKIP_GITHUB=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-github) SKIP_GITHUB=1 ;;
    -h|--help) sed -n '2,/^# Exit:/p' "$0"; exit 0 ;;
    *) echo "check-knowledge-drift: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -f "$AGENTS" ] || { echo "check-knowledge-drift: missing $AGENTS" >&2; exit 2; }
[ -d "$RULES_DIR" ] || { echo "check-knowledge-drift: missing rules dir $RULES_DIR" >&2; exit 2; }
[ -f "$HANDOVER" ] || { echo "check-knowledge-drift: missing $HANDOVER" >&2; exit 2; }
command -v "$NODE_BIN" >/dev/null 2>&1 || { echo "check-knowledge-drift: node binary not found ($NODE_BIN)" >&2; exit 2; }

DRIFTS=0
ok() { printf 'ok    %s\n' "$1"; }
drift() { DRIFTS=$((DRIFTS + 1)); printf 'DRIFT %s\n' "$1"; }
hard_fail() { DRIFTS=$((DRIFTS + 1)); printf 'FAIL  %s\n' "$1"; }
note() { printf 'note  %s\n' "$1"; }

# --- Check 1: AGENTS section-15 rule links vs ai/rules/ files -----------------
# Section bounds: from the "## 15" heading to the next "## " heading (or EOF).
SECTION15="$(awk '/^## 15[. ]/ { inside = 1; next } inside && /^## / { exit } inside { print }' "$AGENTS")"
if [ -z "$SECTION15" ]; then
  hard_fail "check 1: AGENTS.md has no '## 15' section (cannot reconcile the rule index, failing closed)"
else
  INDEXED="$(printf '%s\n' "$SECTION15" | grep -oE 'ai/rules/curaos_[A-Za-z0-9_]+\.md' | sort -u)"
  ACTUAL="$(cd "$RULES_DIR" 2>/dev/null && ls curaos_*.md 2>/dev/null | sed 's|^|ai/rules/|' | sort -u)"
  MISSING_FROM_INDEX="$(comm -13 <(printf '%s\n' "$INDEXED") <(printf '%s\n' "$ACTUAL"))"
  MISSING_ON_DISK="$(comm -23 <(printf '%s\n' "$INDEXED") <(printf '%s\n' "$ACTUAL"))"
  if [ -n "$MISSING_FROM_INDEX" ]; then
    drift "check 1: rule file(s) on disk but absent from AGENTS section 15: $(printf '%s' "$MISSING_FROM_INDEX" | tr '\n' ' ')"
  fi
  if [ -n "$MISSING_ON_DISK" ]; then
    drift "check 1: AGENTS section 15 links rule file(s) that do not exist: $(printf '%s' "$MISSING_ON_DISK" | tr '\n' ' ')"
  fi
  if [ -z "$MISSING_FROM_INDEX" ] && [ -z "$MISSING_ON_DISK" ]; then
    RULE_COUNT="$(printf '%s\n' "$ACTUAL" | grep -c . || true)"
    ok "check 1: AGENTS section 15 and $RULES_DIR reconcile ($RULE_COUNT rule files, all indexed)"
  fi
fi

# --- Check 2: memory milestone-state claims vs GitHub Epic states -------------
if [ ! -f "$MEMORY_INDEX" ]; then
  note "check 2: memory index not found ($MEMORY_INDEX); milestone-state reconciliation vacuously satisfied"
else
  CLAIMS="$(grep -oiE 'M[0-9]+ (still )?(HELD|WAVE-DONE|DONE|CLOSED|ACTIVE|in flight)' "$MEMORY_INDEX" | sort -u || true)"
  if [ -z "$CLAIMS" ]; then
    ok "check 2: memory index carries no milestone-state claims (nothing to reconcile)"
  elif [ "$SKIP_GITHUB" = "1" ]; then
    note "check 2: --skip-github; $(printf '%s\n' "$CLAIMS" | grep -c .) milestone-state claim(s) NOT reconciled against Epic states"
  else
    # Epic source of truth: tracker-repo issues titled `[M<N>] ...` (live org
    # convention; no epic label exists). gh issue list accepts --state all.
    EPICS_JSON="$(env -u GITHUB_TOKEN gh issue list -R "$ORG/$TRACKER_REPO" --state all \
      --limit "$EPIC_LIMIT" --json title,state,number 2>&1)"
    EPICS_RC=$?
    if [ "$EPICS_RC" -ne 0 ]; then
      hard_fail "check 2: Epic-state probe failed (cannot reconcile milestone claims, failing closed): $(printf '%.120s' "$EPICS_JSON")"
    else
      CMP_OUT="$(CLAIMS_IN="$CLAIMS" EPICS_IN="$EPICS_JSON" EPIC_LIMIT_IN="$EPIC_LIMIT" "$NODE_BIN" -e '
        const claimsRaw = process.env.CLAIMS_IN || "";
        let epics;
        try { epics = JSON.parse(process.env.EPICS_IN || "[]"); }
        catch (e) { console.log(`FAIL Epic probe output unparseable: ${e.message}`); process.exit(0); }
        if (!Array.isArray(epics)) { console.log("FAIL Epic probe output is not an array"); process.exit(0); }
        const limit = Number(process.env.EPIC_LIMIT_IN);
        if (epics.length >= limit) { console.log(`FAIL Epic probe returned ${epics.length} >= limit ${limit}: possible truncation, failing closed`); process.exit(0); }
        // claim -> expected epic state
        const OPENW = ["HELD", "ACTIVE", "IN FLIGHT"];
        const CLOSEDW = ["WAVE-DONE", "DONE", "CLOSED"];
        const expect = new Map(); // n -> Set(expected)
        const claimText = new Map();
        for (const line of claimsRaw.split("\n")) {
          const m = line.match(/^M(\d+) (?:still )?(.+)$/i);
          if (!m) continue;
          const n = Number(m[1]);
          const word = m[2].toUpperCase();
          const exp = OPENW.includes(word) ? "OPEN" : CLOSEDW.includes(word) ? "CLOSED" : null;
          if (!exp) continue;
          if (!expect.has(n)) { expect.set(n, new Set()); claimText.set(n, []); }
          expect.get(n).add(exp);
          claimText.get(n).push(line.trim());
        }
        let bad = 0;
        for (const [n, exps] of [...expect.entries()].sort((a, b) => a[0] - b[0])) {
          const quoted = claimText.get(n).join(" / ");
          if (exps.size > 1) { console.log(`DRIFT memory index contradicts itself on M${n}: ${quoted}`); bad++; continue; }
          const expected = [...exps][0];
          // Epic = exact bracket title prefix [M<N>]; stories are [M<N>-S..] and never match.
          const matches = epics.filter((e) => new RegExp(`^\\[M${n}\\]`).test(e.title || ""));
          if (!matches.length) { console.log(`note  no [M${n}] Epic found in the tracker repo; memory claim unverifiable (${quoted})`); continue; }
          const actual = matches.some((e) => String(e.state).toUpperCase() === "OPEN") ? "OPEN" : "CLOSED";
          if (actual === expected) console.log(`ok    M${n}: memory claim (${quoted}) matches Epic state ${actual}`);
          else { console.log(`DRIFT M${n}: memory claims "${quoted}" but the Epic is ${actual} (stale-memory class; fix the memory index)`); bad++; }
        }
        if (!expect.size) console.log("ok    no classifiable milestone-state claims in the memory index");
      ' 2>&1)"
      printf '%s\n' "$CMP_OUT" | while IFS= read -r line; do printf '      %s\n' "$line"; done
      BAD_COUNT="$(printf '%s\n' "$CMP_OUT" | grep -cE '^(DRIFT|FAIL)' || true)"
      if [ "$BAD_COUNT" -gt 0 ]; then
        drift "check 2: $BAD_COUNT milestone-state claim(s) drift from GitHub Epic state (details above)"
      else
        ok "check 2: memory milestone-state claims reconcile with GitHub Epic states"
      fi
    fi
  fi
fi

# --- Check 3: HANDOVER head_sha vs actual HEAD ---------------------------------
RECORDED="$(sed -n 's/^head_sha:[[:space:]]*//p' "$HANDOVER" | head -1 | tr -d '"'"'" | awk '{ print $1 }')"
if [ -z "$RECORDED" ]; then
  hard_fail "check 3: HANDOVER.md has no head_sha frontmatter value (cannot reconcile, failing closed)"
elif ! printf '%s' "$RECORDED" | grep -qE '^[0-9a-f]{7,40}$'; then
  hard_fail "check 3: HANDOVER head_sha is not a 7-40 char hex SHA: $RECORDED"
elif ! ACTUAL="$(git -C "$REPO" rev-parse HEAD 2>&1)"; then
  hard_fail "check 3: cannot resolve HEAD in $REPO: $(printf '%.80s' "$ACTUAL")"
else
  case "$ACTUAL" in
    "$RECORDED"*)
      ok "check 3: HANDOVER head_sha $RECORDED matches HEAD $ACTUAL" ;;
    *)
      drift "check 3: HANDOVER head_sha $RECORDED does not match actual HEAD $ACTUAL in $REPO (stale stop-state; refresh HANDOVER at closeout)" ;;
  esac
fi

echo ""
if [ "$DRIFTS" -eq 0 ]; then
  echo "check-knowledge-drift: knowledge stores reconcile with git/GitHub state"
  exit 0
fi
echo "check-knowledge-drift: $DRIFTS drift(s)/failure(s) detected"
exit 1
