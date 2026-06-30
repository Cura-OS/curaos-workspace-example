# CuraOS workspace merge gate (local-CI-first; remediation plan RP-01).
# `just ci` is THE merge gate for this repo: docs gates + all JS + shell suites.

set shell := ["bash", "-euo", "pipefail", "-c"]

default: ci

# Full local CI gate: every suite must pass.
ci: docs mirror pins test-js test-sh
    @echo "workspace ci: ALL GATES GREEN"

# Doc graph + workflow sync + portability (fails closed on any drift).
docs:
    bash scripts/check-docs.sh

# ai/curaos <-> curaos 1:1 structural mirror.
mirror:
    bash scripts/check-ai-mirror.sh

# Submodule pointer integrity (RP-30): every gitlink in the index must be an
# ancestor of its submodule's origin default branch. Reaches pre-push via
# .githooks/pre-push -> just ci (the workspace pre-push gate per RP-01).
pins:
    bash scripts/check-submodule-pins.sh

# JS suites (bun runs both bun:test and node:test files). Explicit workspace
# globs: a bare `bun test scripts/` substring-matches curaos/scripts/ inside
# the submodule and bleeds out of repo scope.
test-js:
    bun test scripts/*.test.js scripts/lib/*.test.js

# AGENTS.md schema gate alone (RP-14); also runs inside `just docs` via check-docs.sh.
agents-schema:
    node scripts/check-agents-schema.js

# Shell suites; set -e aborts on the first failing suite.
test-sh:
    for t in scripts/*.test.sh; do echo "== $t"; bash "$t"; done

# Incremental mutation testing over the committed workflow executors (RP-60).
# Opt-in pre-milestone-release check; NOT part of the default `just ci` gate
# (command-runner mutation across 19 executors runs minutes-to-hours; ci stays
# fast). Config: stryker.conf.json (incremental state under gitignored
# .cache/). Extra args pass through, e.g.:
#   just mutate --mutate "scripts/workflows/lens-review.workflow.js"
#   just mutate --force            # rebuild the incremental baseline
#   just mutate --dryRunOnly       # validate setup without mutating
mutate *args:
    bun install --frozen-lockfile
    bun x stryker run stryker.conf.json {{args}}

# Install fail-closed git hooks (tracked .githooks/ stubs resolve lefthook at run time).
hooks:
    git config --local core.hooksPath .githooks
    @echo "hooksPath -> .githooks (fail-closed stubs)"
