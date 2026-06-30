#!/usr/bin/env bash
# scripts/m1-verify.sh - M1 workspace doctor.
#
# Verifies M1 scaffold per [[curaos-version-pinning-rule]] + [[curaos-ai-mirror-rule]] +
# [[curaos-repo-boundary-rule]] + [[curaos-quality-gates-rule]].
#
# Run from workspace root: bash scripts/m1-verify.sh

set -eo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE_ROOT"

PASS=0
FAIL=0
WARN=0

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  ✓ $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label"
    FAIL=$((FAIL + 1))
  fi
}

warn_check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  ✓ $label"
    PASS=$((PASS + 1))
  else
    echo "  ⚠ $label"
    WARN=$((WARN + 1))
  fi
}

echo "=== M1 workspace doctor ==="
echo ""

echo "[1/8] Runtime tools"
check "bun installed"           "command -v bun"
check "bun version matches"     "[ \"\$(bun --version)\" = '1.3.14' ]"
warn_check "node 22.x present"  "node --version | grep -q '^v22\\.'"
warn_check "just installed"     "command -v just"

echo ""
echo "[2/8] Workspace boundary ([[curaos-repo-boundary-rule]])"
check "no package.json at workspace root"  "! [ -f package.json ]"
check "no bun.lock at workspace root"      "! [ -f bun.lock ]"
check "no turbo.json at workspace root"    "! [ -f turbo.json ]"
check "no tsconfig.json at workspace root" "! [ -f tsconfig.json ]"
check "AGENTS.md present at root"          "[ -f AGENTS.md ]"
check "CLAUDE.md present at root"          "[ -f CLAUDE.md ]"
check "ai/ dir present"                    "[ -d ai ]"
check "curaos/ submodule present"          "[ -d curaos ]"

echo ""
echo "[3/8] curaos submodule M1 files"
check "curaos/package.json"          "[ -f curaos/package.json ]"
check "curaos/bun.lock"              "[ -f curaos/bun.lock ]"
check "curaos/turbo.json"            "[ -f curaos/turbo.json ]"
check "curaos/tsconfig.base.json"    "[ -f curaos/tsconfig.base.json ]"
check "curaos/lefthook.yml"          "[ -f curaos/lefthook.yml ]"
check "curaos/biome.json"            "[ -f curaos/biome.json ]"
check "curaos/.oxlintrc.json"        "[ -f curaos/.oxlintrc.json ]"
check "curaos/renovate.json"         "[ -f curaos/renovate.json ]"
check "curaos/.tool-versions"        "[ -f curaos/.tool-versions ]"
check "curaos/.bun-version"          "[ -f curaos/.bun-version ]"
check "curaos/.nvmrc"                "[ -f curaos/.nvmrc ]"
check "curaos/.dependency-cruiser.cjs" "[ -f curaos/.dependency-cruiser.cjs ]"
check "curaos/.gitleaks.toml"        "[ -f curaos/.gitleaks.toml ]"
check "@curaos/tsconfig shared pkg"  "[ -f curaos/backend/packages/tsconfig/package.json ]"
check "tools/generators present"     "[ -d curaos/tools/generators ]"
check "ops/dev/verdaccio config"     "[ -f curaos/ops/dev/verdaccio/docker-compose.yml ]"
check "ops/dev/k3d config"           "[ -f curaos/ops/dev/k3d/k3d-config.yaml ]"
check "Tier B fast-ci workflow"      "[ -f curaos/.github/workflows/tier-b-fast-ci.yml ]"
check "Tier C full-ci workflow"      "[ -f curaos/.github/workflows/tier-c-full-ci.yml ]"
check "Tier D slow-ci workflow"      "[ -f curaos/.github/workflows/tier-d-slow-ci.yml ]"
check "Tier E nightly workflow"      "[ -f curaos/.github/workflows/tier-e-nightly.yml ]"

echo ""
echo "[4/8] mise REMOVED (user preference)"
check ".mise.toml absent in curaos"      "! [ -f curaos/.mise.toml ]"
check "no mise refs in active config"    "! grep -rln '^\\s*mise:\\|jdx/mise\\|mise install' curaos/ 2>/dev/null"

echo ""
echo "[5/8] Workspace agent docs"
check "ai/rules/ present"                            "[ -d ai/rules ]"
check "ai/curaos/ mirror present"                    "[ -d ai/curaos ]"
check "ai/templates/service-skeleton (Copier)"       "[ -f ai/templates/service-skeleton/copier.yml ]"
check "ai/curaos/docs/adr/RESOLUTION-MAP.md"         "[ -f ai/curaos/docs/adr/RESOLUTION-MAP.md ]"
check "ai/curaos/docs/HANDOVER.md"                   "[ -f ai/curaos/docs/HANDOVER.md ]"

echo ""
echo "[6/8] ai mirror parity ([[curaos-ai-mirror-rule]])"
if [ -x scripts/check-ai-mirror.sh ]; then
  bash scripts/check-ai-mirror.sh >/dev/null 2>&1 && {
    echo "  ✓ ai/curaos/ mirrors curaos/ 1:1"
    PASS=$((PASS + 1))
  } || {
    echo "  ✗ mirror drift detected; run scripts/check-ai-mirror.sh"
    FAIL=$((FAIL + 1))
  }
else
  echo "  ⚠ scripts/check-ai-mirror.sh not executable"
  WARN=$((WARN + 1))
fi

echo ""
echo "[7/8] All 36+ workspace rules indexed"
RULE_COUNT=$(ls ai/rules/curaos_*.md 2>/dev/null | wc -l | tr -d ' ')
README_COUNT=$(grep -c '^| \[curaos_' ai/rules/README.md)
AGENTS_COUNT=$(grep -c '^| .*curaos_' AGENTS.md)
if [ "$RULE_COUNT" -eq "$README_COUNT" ] && [ "$AGENTS_COUNT" -ge "$RULE_COUNT" ]; then
  echo "  ✓ $RULE_COUNT rule files = $README_COUNT README rows; AGENTS.md §15 has $AGENTS_COUNT rows"
  PASS=$((PASS + 1))
else
  echo "  ✗ rule index drift: $RULE_COUNT files / $README_COUNT README / $AGENTS_COUNT AGENTS rows"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "[8/8] Bun install + tool checks (curaos/)"
cd curaos
warn_check "bun install (deps resolve)"  "bun install --frozen-lockfile --silent"
check "oxlint runs"                      "bunx oxlint --version | grep -q '1\\.66'"
check "biome runs"                       "bunx biome --version | grep -q '2\\.4'"
check "lefthook hooks installed"         "[ -e ~/.config/git/hooks/pre-commit ] || bunx lefthook dump 2>/dev/null | grep -q pre-commit"

cd ..

echo ""
echo "=== M1 doctor summary ==="
echo "  PASS:  $PASS"
echo "  WARN:  $WARN"
echo "  FAIL:  $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "❌ M1 incomplete; fix FAIL items before M2."
  exit 1
fi

echo ""
echo "✅ M1 scaffold verified. Next: M2 shared library bootstrap (@curaos/tenancy / audit-sdk / event-interceptors / providers stubs)."
