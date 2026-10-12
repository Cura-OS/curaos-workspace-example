#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
node scripts/check-public-docs.js
bun scripts/check-doc-graph.js
node scripts/check-agents-schema.js --mode=fail
node scripts/generate-rule-index.js
