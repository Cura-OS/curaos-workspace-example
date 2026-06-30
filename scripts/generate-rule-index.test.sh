#!/usr/bin/env bash
# Tests for generate-rule-index.js (RP-26). Self-contained fixture tree via
# --root; never touches the real workspace files. Dash glyphs are produced
# from byte escapes only (never literals in source).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/generate-rule-index.js"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

EM="$(printf '\342\200\224')"

fixture() {
  # (Re)build a clean fixture root with two rules + marked index surfaces.
  rm -rf "$TMP/root"
  mkdir -p "$TMP/root/ai/rules"
  cat > "$TMP/root/ai/rules/curaos_alpha_rule.md" <<'MD'
---
name: curaos-alpha-rule
title: Alpha (first fixture rule)
description: Alpha rule description - canonical topic text for the index
---

# Alpha rule body
MD
  cat > "$TMP/root/ai/rules/curaos_beta_rule.md" <<'MD'
---
name: curaos-beta-rule
title: Beta (second fixture rule)
description: Beta rule description - more canonical topic text
---

# Beta rule body
MD
  cat > "$TMP/root/ai/rules/README.md" <<'MD'
# Fixture rules

<!-- BEGIN GENERATED: rule-index (node scripts/generate-rule-index.js --write) -->
<!-- END GENERATED: rule-index -->

Outro text stays untouched.
MD
  cat > "$TMP/root/AGENTS.md" <<'MD'
# Fixture AGENTS

## 15. Workspace Rules

<!-- BEGIN GENERATED: rule-index (node scripts/generate-rule-index.js --write) -->
<!-- END GENERATED: rule-index -->

Tail text stays untouched.
MD
}

run_check() {
  node "$SCRIPT" --root "$TMP/root" 2>&1
  printf 'EXIT=%s\n' "$?"
}
run_write() {
  node "$SCRIPT" --write --root "$TMP/root" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# 1) --write populates both regions from frontmatter
fixture
out="$(run_write)"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -q '| \[curaos_alpha_rule.md\](curaos_alpha_rule.md) | Alpha rule description - canonical topic text for the index |' "$TMP/root/ai/rules/README.md" \
  && grep -q '| Beta (second fixture rule) | \[curaos_beta_rule.md\](ai/rules/curaos_beta_rule.md) |' "$TMP/root/AGENTS.md"; then
  ok "--write generates README Topic row + AGENTS title row from frontmatter"
else
  nok "--write generates both surfaces" "$out"
fi

# 2) check passes right after a write
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=0' && printf '%s' "$out" | grep -q '2 rules + 0 path-scoped views in sync'; then
  ok "check passes when index matches frontmatter"
else
  nok "clean check passes" "$out"
fi

# 3) ACCEPTANCE FIXTURE: a README index row diverging from rule frontmatter
#    makes the drift check exit nonzero
sed -i '' 's/canonical topic text for the index/STALE hand-edited topic/' "$TMP/root/ai/rules/README.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'drifted from rule frontmatter'; then
  ok "README row drift exits nonzero"
else
  nok "README row drift detected" "$out"
fi

# 4) an AGENTS section-15 row diverging from frontmatter title exits nonzero
fixture; run_write > /dev/null
sed -i '' 's/Beta (second fixture rule)/Beta (stale title)/' "$TMP/root/AGENTS.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'AGENTS.md: rule index drifted'; then
  ok "AGENTS row drift exits nonzero"
else
  nok "AGENTS row drift detected" "$out"
fi

# 5) a new rule file missing from the index is drift too
fixture; run_write > /dev/null
cat > "$TMP/root/ai/rules/curaos_gamma_rule.md" <<'MD'
---
name: curaos-gamma-rule
title: Gamma (third fixture rule)
description: Gamma rule description
---

# Gamma rule body
MD
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "unindexed new rule exits nonzero"
else
  nok "unindexed new rule detected" "$out"
fi

# 6) missing frontmatter fails closed
fixture; run_write > /dev/null
printf '# bare rule, no frontmatter\n' > "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'no YAML frontmatter'; then
  ok "missing frontmatter exits nonzero"
else
  nok "missing frontmatter detected" "$out"
fi

# 7) missing description field fails closed
fixture; run_write > /dev/null
sed -i '' '/^description:/d' "$TMP/root/ai/rules/curaos_beta_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'frontmatter missing description'; then
  ok "missing description exits nonzero"
else
  nok "missing description detected" "$out"
fi

# 8) frontmatter name not matching the filename slug fails closed
fixture; run_write > /dev/null
sed -i '' 's/^name: curaos-alpha-rule$/name: curaos-wrong-rule/' "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q '!= filename slug'; then
  ok "name/filename mismatch exits nonzero"
else
  nok "name/filename mismatch detected" "$out"
fi

# 9) em dash in a description fails closed (curaos_no_em_dash_rule)
fixture; run_write > /dev/null
printf -- '---\nname: curaos-alpha-rule\ntitle: Alpha (first fixture rule)\ndescription: Alpha %s dashed description\n---\n\n# Alpha rule body\n' "$EM" > "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'em/en dash'; then
  ok "em dash in description exits nonzero"
else
  nok "em dash detected" "$out"
fi

# 10) missing markers fail closed
fixture; run_write > /dev/null
printf '# Fixture rules without markers\n' > "$TMP/root/ai/rules/README.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'markers missing'; then
  ok "missing markers exit nonzero"
else
  nok "missing markers detected" "$out"
fi

# 11) pipes in frontmatter are escaped so table rows stay intact
fixture
sed -i '' 's/^description: Alpha rule description - canonical topic text for the index$/description: Alpha rule description with a | pipe inside/' "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_write)"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -qF 'with a \| pipe inside |' "$TMP/root/ai/rules/README.md"; then
  ok "pipe in description is escaped in the generated cell"
else
  nok "pipe escaping" "$out"
fi

# 12) text outside the markers is never rewritten by --write
fixture; run_write > /dev/null
if grep -q 'Outro text stays untouched.' "$TMP/root/ai/rules/README.md" \
  && grep -q 'Tail text stays untouched.' "$TMP/root/AGENTS.md"; then
  ok "--write leaves text outside markers untouched"
else
  nok "outside-marker text preserved" "(marker bleed)"
fi

# --- RP-62/RP-63: path-scoped views + binding-core budget ---

VIEW="$TMP/root/.claude/rules/curaos-alpha-rule.mdc"

paths_fixture() {
  # Alpha gains paths + a fold; beta stays a plain indexed rule.
  fixture
  cat > "$TMP/root/ai/rules/curaos_alpha_rule.md" <<'MD'
---
name: curaos-alpha-rule
title: Alpha (first fixture rule)
description: Alpha rule description - canonical topic text for the index
paths:
  - "curaos/backend/**/schema.ts"
  - "curaos/backend/**/migrations/**"
---

# Alpha rule body

Binding line: always use the alpha pattern.

<!-- fold: rationale, non-binding -->

Rationale prose that must never reach the injected view.
MD
}

# 13) ACCEPTANCE FIXTURE (RP-62): --write generates a .mdc view carrying the
#     paths frontmatter + binding core only; rationale below the fold stays out
paths_fixture
out="$(run_write)"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && grep -q '^  - "curaos/backend/\*\*/schema.ts"$' "$VIEW" \
  && grep -q 'Binding line: always use the alpha pattern.' "$VIEW" \
  && grep -q 'source: ai/rules/curaos_alpha_rule.md' "$VIEW" \
  && ! grep -q 'Rationale prose' "$VIEW"; then
  ok "--write emits paths view with binding core only (no below-fold rationale)"
else
  nok "paths view generation" "$out"
fi
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=0' && printf '%s' "$out" | grep -q '2 rules + 1 path-scoped views in sync'; then
  ok "check passes when view matches binding core"
else
  nok "clean check passes with a view" "$out"
fi

# 14) hand-edited view is drift (canonical text lives in ai/rules/ only)
sed -i '' 's/always use the alpha pattern/HAND EDITED VIEW/' "$VIEW"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'rule view drifted'; then
  ok "hand-edited view exits nonzero"
else
  nok "view drift detected" "$out"
fi

# 15) a paths rule without a fold marker fails closed
paths_fixture
sed -i '' '/fold: rationale, non-binding/d' "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'no fold marker'; then
  ok "paths rule without fold marker exits nonzero"
else
  nok "missing fold detected" "$out"
fi

# 16) orphan generated view (source rule lost its paths) fails check;
#     --write removes it; a hand-written .mdc without the banner is untouched
paths_fixture; run_write > /dev/null
cat > "$TMP/root/ai/rules/curaos_alpha_rule.md" <<'MD'
---
name: curaos-alpha-rule
title: Alpha (first fixture rule)
description: Alpha rule description - canonical topic text for the index
---

# Alpha rule body
MD
printf -- '---\npaths:\n  - "x/**"\n---\nhand-written rule, no banner\n' > "$TMP/root/.claude/rules/handmade.mdc"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'orphan generated rule view' \
  && ! printf '%s' "$out" | grep -q 'handmade.mdc'; then
  ok "orphan generated view exits nonzero; hand-written .mdc ignored"
else
  nok "orphan view detected" "$out"
fi
out="$(run_write)"
if printf '%s' "$out" | grep -q 'EXIT=0' && [ ! -f "$VIEW" ] && [ -f "$TMP/root/.claude/rules/handmade.mdc" ]; then
  ok "--write removes the orphan view and keeps the hand-written .mdc"
else
  nok "orphan removal" "$out"
fi

# 17) ACCEPTANCE FIXTURE (RP-63): binding core over the 60-line budget WARNs
#     without affecting the exit code
fixture
{
  printf -- '---\nname: curaos-alpha-rule\ntitle: Alpha (first fixture rule)\ndescription: Alpha rule description - canonical topic text for the index\n---\n\n'
  for i in $(seq 1 65); do printf 'binding line %s\n' "$i"; done
} > "$TMP/root/ai/rules/curaos_alpha_rule.md"
run_write > /dev/null
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'rule-index WARN: ai/rules/curaos_alpha_rule.md: binding core 65 lines exceeds budget 60'; then
  ok "binding core over budget warns, exit stays 0"
else
  nok "size budget warn" "$out"
fi

# 18) lines below the fold do not count toward the budget
{
  printf -- '---\nname: curaos-alpha-rule\ntitle: Alpha (first fixture rule)\ndescription: Alpha rule description - canonical topic text for the index\n---\n\nshort binding core\n\n<!-- fold: rationale, non-binding -->\n\n'
  for i in $(seq 1 100); do printf 'rationale line %s\n' "$i"; done
} > "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=0' && ! printf '%s' "$out" | grep -q 'rule-index WARN'; then
  ok "below-fold rationale is excluded from the budget"
else
  nok "fold excludes rationale from budget" "$out"
fi

# 19) em dash in the binding core of a paths rule fails closed (it would ship
#     in the generated view)
paths_fixture
sed -i '' "s/always use the alpha pattern/always ${EM} use the alpha pattern/" "$TMP/root/ai/rules/curaos_alpha_rule.md"
out="$(run_check)"
if printf '%s' "$out" | grep -q 'EXIT=1' && printf '%s' "$out" | grep -q 'binding core contains an em/en dash'; then
  ok "em dash in paths-rule binding core exits nonzero"
else
  nok "em dash in binding core detected" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
