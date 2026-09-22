# CuraOS workspace merge gate (local-CI-first; remediation plan RP-01).
# `just ci` is THE merge gate for this repo: docs gates + all JS + shell suites.

set shell := ["bash", "-euo", "pipefail", "-c"]

default: ci

# Full local CI gate: every suite must pass.
ci: docs mirror pins shell-portability test-js test-sh
    @echo "workspace ci: ALL GATES GREEN"

# Doc graph + workflow sync + portability (fails closed on any drift).
docs:
    bash scripts/check-docs.sh

# Shell constructs that pass on macOS and fail on the Linux CI runner. Distinct from
# check-workflow-portability.js, which covers the JS workflow executors. Added after
# two such defects shipped green from a macOS checkout: `env -u VAR command gh` in 8
# scripts (env execs a program, `command` is a shell builtin, and macOS happens to
# ship /usr/bin/command) and BSD-only `sed -i ''` in 8 places in one test, which took
# 8 of its 21 cases down on the runner while all 21 passed locally. Its own suite
# (check-shell-portability.test.sh) proves it catches both and passes the portable forms.
shell-portability:
    bash scripts/check-shell-portability.sh

# ai/curaos <-> curaos 1:1 structural mirror.
mirror:
    # This example workspace ships without the private curaos/ submodule, so it has no
    # ai/curaos/ mirror to compare. The canonical gate skips that case only when the
    # example opts in; in the real workspace the same condition means the checkout lost
    # both trees and must fail closed. See scripts/check-ai-mirror.sh.
    CURAOS_AI_MIRROR_SANITIZED=1 bash scripts/check-ai-mirror.sh

# Pin integrity. Submodule pointers (RP-30): every gitlink in the index must be
# an ancestor of its submodule's origin default branch. Toolchain: every
# oven-sh/setup-bun step must name an exact bun-version, or a hosted run silently
# executes the suite on a runtime the local gate never saw. Reaches pre-push via
# .githooks/pre-push -> just ci (the workspace pre-push gate per RP-01).
pins:
    bash scripts/check-submodule-pins.sh
    bash scripts/check-actions-bun-pin.sh

# JS suites (bun runs both bun:test and node:test files). Explicit workspace
# globs: a bare `bun test scripts/` substring-matches curaos/scripts/ inside
# the submodule and bleeds out of repo scope.
#
# --timeout raises bun's 5000ms per-test DEFAULT for the whole suite. Several
# cases here drive real subprocesses (sqlite3 per row, PATH stubs per gh call),
# and a subprocess cost that is invisible on one host can dominate on another.
# The runner is NOT uniformly slower than a laptop: measured, it ran the slowest
# gh-project case in 114ms against 11s here, so "the runner is slower" is the
# wrong model and was removed from this comment. What actually varies is which
# subprocess is cheap where. 30s is a real bound, not a blanket excuse: a
# genuinely hung test still fails. A file that must stay fast declares its own
# TIGHTER budget and that wins over this flag: scripts/lib/gh-project.test.js
# calls setDefaultTimeout(5000) so a slow stub can never hide under this floor
# again. A single case needing longer declares its own budget too (bun:test
# takes a positional number, node:test takes `{ timeout }`; a positional number
# on a node:test case is SILENTLY IGNORED).
test-js:
    bun test --timeout 30000 scripts/*.test.js scripts/lib/*.test.js

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
