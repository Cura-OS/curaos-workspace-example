#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${GITHUB_ACTIONS:-}" == "true" \
  && "${DOC_GRAPH_ALLOW_MISSING_PRIVATE_SUBMODULES:-}" == "1" \
  && ! -f "curaos/README.md" ]]; then
  echo "doc graph skipped: private curaos submodule unavailable in GitHub Actions checkout"
  exit 0
fi

bun scripts/check-doc-graph.js
node scripts/check-workflow-sync.js
node scripts/check-symphony-conformance.js
node scripts/check-symphony-source-audit.js
node scripts/check-workflow-portability.js
# RP-14: AGENTS.md schema gate, fail-closed (codex G-01). NEW violations exit 1;
# the legacy allowlist (scripts/check-agents-schema-allowlist.txt) keeps known
# pre-migration modules passing until the RP-15 migration drains it (ratchet).
node scripts/check-agents-schema.js --mode=fail
# RP-26: rule index (ai/rules/README.md table + AGENTS.md section 15 table) is
# generated from rule frontmatter; fails on drift, missing frontmatter, or
# em/en dashes. Refresh via: node scripts/generate-rule-index.js --write
node scripts/generate-rule-index.js
