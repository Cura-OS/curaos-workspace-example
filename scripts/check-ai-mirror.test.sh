#!/usr/bin/env bash
# Tests for check-ai-mirror.sh (RP-08). Self-contained fixture workspaces via
# CHECK_AI_MIRROR_WS; asserts the compare set is derived (not hardcoded), so
# drift in a non-listed top-level dir (e.g. curaos/tools/) fails the check.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/check-ai-mirror.sh"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Aligned fixture: grouping dirs mirror 1:1; module internals diverge on
# purpose (src vs agents); submodule + artifact + ai-only-doc dirs ignored.
build_base() {
  local ws="$1"
  mkdir -p "$ws/curaos/backend/services/svc-a/src"
  mkdir -p "$ws/curaos/backend/packages/pkg-a/src"
  mkdir -p "$ws/curaos/ops/dev"
  mkdir -p "$ws/curaos/curaos-website/src"
  mkdir -p "$ws/curaos/node_modules/junk"
  mkdir -p "$ws/curaos/coverage/unit"
  mkdir -p "$ws/ai/curaos/backend/services/svc-a/agents"
  mkdir -p "$ws/ai/curaos/backend/packages/pkg-a"
  mkdir -p "$ws/ai/curaos/ops/dev"
  mkdir -p "$ws/ai/curaos/curaos-website/site-notes"
  mkdir -p "$ws/ai/curaos/docs/adr"
  mkdir -p "$ws/ai/curaos/research/topic"
  mkdir -p "$ws/ai/curaos/AGENTS-sections"
  cat > "$ws/curaos/.gitmodules" <<'GM'
[submodule "curaos-website"]
	path = curaos-website
	url = https://example.invalid/curaos-website.git
[submodule "backend/services/svc-a"]
	path = backend/services/svc-a
	url = https://example.invalid/svc-a.git
GM
}

run() {
  CHECK_AI_MIRROR_WS="$1" bash "$SCRIPT" 2>&1
  printf 'EXIT=%s\n' "$?"
}

# 1) aligned workspace passes; ignores + module/submodule leaves hold
WS1="$TMP/ws1"
build_base "$WS1"
out="$(run "$WS1")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:'; then
  ok "aligned fixture passes (ignores + module/submodule leaves)"
else
  nok "aligned fixture" "$out"
fi

# 2) acceptance fixture: drift in a top-level dir the old hardcoded list
#    never covered (curaos/tools/ with no ai twin) exits nonzero
WS2="$TMP/ws2"
build_base "$WS2"
mkdir -p "$WS2/curaos/tools/codegen"
out="$(run "$WS2")"
if printf '%s' "$out" | grep -q 'DRIFT: tools exists in curaos/ but not in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "seeded curaos/tools/ drift exits nonzero"
else
  nok "seeded tools drift" "$out"
fi

# 3) child-level drift inside a derived top-level dir is caught
WS3="$TMP/ws3"
build_base "$WS3"
mkdir -p "$WS3/curaos/tools/codegen" "$WS3/curaos/tools/generators"
mkdir -p "$WS3/ai/curaos/tools/codegen"
out="$(run "$WS3")"
if printf '%s' "$out" | grep -q 'DRIFT: tools/generators in curaos/ but missing in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "child drift in derived dir (tools/generators) exits nonzero"
else
  nok "child drift in derived dir" "$out"
fi

# 4) phantom ai-only top-level dir is caught
WS4="$TMP/ws4"
build_base "$WS4"
mkdir -p "$WS4/ai/curaos/phantom-dir"
out="$(run "$WS4")"
if printf '%s' "$out" | grep -q 'DRIFT: phantom-dir exists in ai/curaos/ but not in curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "ai-only phantom top-level dir exits nonzero"
else
  nok "phantom ai-only dir" "$out"
fi

# 5) missing tree fails closed
out="$(run "$TMP/nonexistent")"
if printf '%s' "$out" | grep -q 'ERROR: missing workspace root' \
  && printf '%s' "$out" | grep -q 'EXIT=2'; then
  ok "missing workspace root fails closed and names the root (exit 2)"
else
  nok "missing workspace" "$out"
fi

# 6) code-repo pollution guard: a planted ai-doc trio inside the code repo
#    (the exact curaos #1152/#1153 regression) trips the guard nonzero
WS6="$TMP/ws6"
build_base "$WS6"
mkdir -p "$WS6/curaos/ai/curaos/frontend/apps/foo-app"
: > "$WS6/curaos/ai/curaos/frontend/apps/foo-app/AGENTS.md"
: > "$WS6/curaos/ai/curaos/frontend/apps/foo-app/CONTEXT.md"
: > "$WS6/curaos/ai/curaos/frontend/apps/foo-app/Requirements.md"
out="$(run "$WS6")"
if printf '%s' "$out" | grep -q 'POLLUTION: curaos/ai/ agent-doc tree' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "planted code-repo ai/curaos trio trips guard (exit 1)"
else
  nok "code-repo ai-doc trio" "$out"
fi

# 7) stray agent-doc directly under a non-submodule code path is caught
WS7="$TMP/ws7"
build_base "$WS7"
: > "$WS7/curaos/ops/dev/AGENTS.md"
out="$(run "$WS7")"
if printf '%s' "$out" | grep -q 'POLLUTION: stray agent-doc' \
  && printf '%s' "$out" | grep -q 'ops/dev/AGENTS.md' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "stray agent-doc under a code path trips guard (exit 1)"
else
  nok "stray trio under code path" "$out"
fi

# 8) trio INSIDE a submodule leaf is NOT flagged (submodule internals pruned);
#    clean tree with no code-repo docs still passes
WS8="$TMP/ws8"
build_base "$WS8"
: > "$WS8/curaos/backend/services/svc-a/AGENTS.md"
out="$(run "$WS8")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'POLLUTION:'; then
  ok "submodule-internal doc not flagged; clean tree passes (exit 0)"
else
  nok "submodule doc false positive" "$out"
fi

# 9) planted ai/curaos/backend trio in the code repo trips the scoped guard
WS9="$TMP/ws9"
build_base "$WS9"
mkdir -p "$WS9/curaos/ai/curaos/backend/packages/foo-pkg"
: > "$WS9/curaos/ai/curaos/backend/packages/foo-pkg/AGENTS.md"
: > "$WS9/curaos/ai/curaos/backend/packages/foo-pkg/CONTEXT.md"
: > "$WS9/curaos/ai/curaos/backend/packages/foo-pkg/Requirements.md"
out="$(run "$WS9")"
if printf '%s' "$out" | grep -q 'POLLUTION: curaos/ai/ agent-doc tree' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "planted code-repo ai/curaos/backend trio trips guard (exit 1)"
else
  nok "code-repo backend trio" "$out"
fi

# 10) ai/curaos/docs/ in the code repo is the sanctioned doc-graph-append target
#     (curaos#1159) and does NOT trip the guard
WS10="$TMP/ws10"
build_base "$WS10"
mkdir -p "$WS10/curaos/ai/curaos/docs"
: > "$WS10/curaos/ai/curaos/docs/DOC-GRAPH.md"
out="$(run "$WS10")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'POLLUTION:'; then
  ok "code-repo ai/curaos/docs (doc-graph-append) allowed (exit 0)"
else
  nok "docs allowed exception" "$out"
fi

# 11) historical harness worktrees are operational state, not code-repo docs.
#     They may contain their own agent-doc trees and must not trip the purity guard.
WS11="$TMP/ws11"
build_base "$WS11"
mkdir -p "$WS11/curaos/.claude/worktrees/lane"
mkdir -p "$WS11/curaos/.scratch/worktrees/lane"
: > "$WS11/curaos/.claude/worktrees/lane/AGENTS.md"
: > "$WS11/curaos/.scratch/worktrees/lane/CONTEXT.md"
out="$(run "$WS11")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'POLLUTION:'; then
  ok "harness worktree agent docs are ignored (exit 0)"
else
  nok "harness worktree docs false positive" "$out"
fi

# 12) the tracked codegen __tests__ convention must be mirrorable despite the
#     general kebab-case policy.
WS12="$TMP/ws12"
build_base "$WS12"
mkdir -p "$WS12/curaos/tools/codegen/__tests__"
mkdir -p "$WS12/ai/curaos/tools/codegen/__tests__"
out="$(run "$WS12")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'snake_case'; then
  ok "tracked __tests__ convention is mirrorable (exit 0)"
else
  nok "tracked __tests__ mirror exception" "$out"
fi

# 13) the nested curaos checkout holder is local, untracked worktree state.
#     It may contain worktrees and agent docs, but is not a code mirror root.
WS13="$TMP/ws13"
build_base "$WS13"
git init -q "$WS13/curaos"
mkdir -p "$WS13/curaos/curaos/.worktrees/lane"
printf 'gitdir: /tmp/local-holder\n' > "$WS13/curaos/curaos/.worktrees/lane/.git"
: > "$WS13/curaos/curaos/.worktrees/lane/AGENTS.md"
out="$(run "$WS13")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'curaos exists in curaos/'; then
  ok "untracked nested curaos worktree holder is ignored (exit 0)"
else
  nok "nested curaos worktree holder false positive" "$out"
fi

# 14) a similarly named ordinary code directory remains a legitimate drift.
WS14="$TMP/ws14"
build_base "$WS14"
mkdir -p "$WS14/curaos/curaos/real-module"
out="$(run "$WS14")"
if printf '%s' "$out" | grep -q 'DRIFT: curaos exists in curaos/ but not in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "ordinary nested curaos directory remains a mirror drift"
else
  nok "ordinary nested curaos directory must not be ignored" "$out"
fi

# 15) a local holder that contains anything besides .worktrees is code-side
#     drift, even when its worktree entries carry valid .git markers.
WS15="$TMP/ws15"
build_base "$WS15"
git init -q "$WS15/curaos"
mkdir -p "$WS15/curaos/curaos/.worktrees/lane"
printf 'gitdir: /tmp/local-holder\n' > "$WS15/curaos/curaos/.worktrees/lane/.git"
: > "$WS15/curaos/curaos/README.md"
out="$(run "$WS15")"
if printf '%s' "$out" | grep -q 'DRIFT: curaos exists in curaos/ but not in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "holder with an additional code file remains a mirror drift"
else
  nok "holder with additional code must not be ignored" "$out"
fi

# 16) a gitignored build artifact left by a concurrent lane (e.g. a Playwright
#     test-results dir under tools/codegen/) must not false-flag as mirror
#     drift: the working tree is not the source of truth for this gate, git's
#     ignore rules are (observed: curaos/tools/codegen/test-results).
WS16="$TMP/ws16"
build_base "$WS16"
git init -q "$WS16/curaos"
printf 'tools/codegen/test-results/\n' > "$WS16/curaos/.gitignore"
mkdir -p "$WS16/curaos/tools/codegen/test-results/visual"
: > "$WS16/curaos/tools/codegen/test-results/visual/trace.zip"
mkdir -p "$WS16/ai/curaos/tools/codegen"
out="$(run "$WS16")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:'; then
  ok "gitignored build artifact does not false-flag as mirror drift (exit 0)"
else
  nok "gitignored artifact false-positive" "$out"
fi

# 17) an UNTRACKED, non-ignored doc dir (e.g. a freshly agent-written
#     AGENTS/CONTEXT/Requirements trio not yet `git add`ed) is still real
#     drift; only git-ignored paths are exempt, not merely untracked ones.
WS17="$TMP/ws17"
build_base "$WS17"
git init -q "$WS17/curaos"
mkdir -p "$WS17/curaos/tools/codegen"
out="$(run "$WS17")"
if printf '%s' "$out" | grep -q 'DRIFT: tools exists in curaos/ but not in ai/curaos/' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "untracked non-ignored dir remains real drift (exit 1)"
else
  nok "untracked non-ignored dir must still be caught" "$out"
fi

# 18) a tracked codegen fixture directory is structural source, so its AI
# projection keeps the conventional __fixtures__ spelling.
WS18="$TMP/ws18"
build_base "$WS18"
mkdir -p "$WS18/curaos/tools/codegen/src/__fixtures__"
mkdir -p "$WS18/ai/curaos/tools/codegen/src/__fixtures__"
out="$(run "$WS18")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'snake_case'; then
  ok "tracked codegen src __fixtures__ convention is mirrorable (exit 0)"
else
  nok "tracked codegen src __fixtures__ mirror exception" "$out"
fi

# 19) an UNPOPULATED curaos/ (linked worktree where the submodule was never
# checked out) is a checkout that cannot run this gate, not mirror drift. The
# directory exists but is empty, so every ai/curaos/ top-level dir used to be
# reported as "exists in ai/curaos/ but not in curaos/" and the gate failed
# with a long list of drift that says nothing about the mirror. It must refuse
# instead: no DRIFT lines, and an exit distinct from the drift verdict.
WS19="$TMP/ws19"
build_base "$WS19"
rm -rf "$WS19/curaos"
mkdir -p "$WS19/curaos"
out="$(run "$WS19")"
if printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:' \
  && ! printf '%s' "$out" | grep -q 'FAIL: '; then
  ok "unpopulated curaos/ refuses instead of reporting drift (exit 2)"
else
  nok "unpopulated curaos/ must refuse, not report drift" "$out"
fi

# 20) an unpopulated ai/curaos/ is the same class, from the other side.
WS20="$TMP/ws20"
build_base "$WS20"
rm -rf "$WS20/ai/curaos"
mkdir -p "$WS20/ai/curaos"
out="$(run "$WS20")"
if printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:'; then
  ok "unpopulated ai/curaos/ refuses instead of reporting drift (exit 2)"
else
  nok "unpopulated ai/curaos/ must refuse, not report drift" "$out"
fi

# 21) a curaos/ supplied as a SYMLINK to a populated checkout is populated.
# The pre-push gate exports the pushed commit with git-archive, which does not
# materialize gitlinks, then symlinks the real checkout back in. The emptiness
# probe used find without -L, which does not follow symlinks, so a correctly
# provisioned export read as empty and every workspace push was refused.
WS21="$TMP/ws21"
build_base "$WS21"
REALDIR="$TMP/ws21-real-curaos"
mv "$WS21/curaos" "$REALDIR"
ln -s "$REALDIR" "$WS21/curaos"
out="$(run "$WS21")"
if ! printf '%s' "$out" | grep -q 'is empty'; then
  ok "a symlinked curaos/ is not misread as empty"
else
  nok "a symlinked curaos/ must resolve through the symlink" "$out"
fi

# 22) V15-AI-MIRROR-GATE-FORKED-INTO-EXAMPLE-WORKSPACE: the example workspace needs a
#     sanitized-example skip (no curaos/ code submodule, so no ai/curaos/ mirror either).
#     That behavior belongs in the ONE canonical file behind an explicit opt-in, not in a
#     forked copy: without the flag, losing both trees must stay fail-closed, because the
#     real workspace must never pass this gate by having nothing left to compare.
WS22="$TMP/ws22"
mkdir -p "$WS22"
out="$(run "$WS22")"
if printf '%s' "$out" | grep -q 'EXIT=2'; then
  ok "both trees missing is fail-closed without the sanitized opt-in (exit 2)"
else
  nok "both trees missing must stay fail-closed" "$out"
fi
out="$(CHECK_AI_MIRROR_WS="$WS22" CURAOS_AI_MIRROR_SANITIZED=1 bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'sanitized example'; then
  ok "sanitized opt-in skips cleanly when there is nothing to mirror (exit 0)"
else
  nok "sanitized opt-in must skip cleanly" "$out"
fi

# 23) only ONE side missing is real drift even under the sanitized opt-in: the flag
#     licenses "nothing to check", never "half a mirror is fine".
WS23="$TMP/ws23"
mkdir -p "$WS23/ai/curaos/backend"
out="$(CHECK_AI_MIRROR_WS="$WS23" CURAOS_AI_MIRROR_SANITIZED=1 bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! printf '%s' "$out" | grep -q 'sanitized example'; then
  ok "sanitized opt-in still fails closed when only one side is present (exit 2)"
else
  nok "sanitized opt-in must not excuse a one-sided tree" "$out"
fi

# 24) under a git hook, git exports GIT_DIR/GIT_INDEX_FILE/GIT_WORK_TREE for the OUTER
#     repo, so every `git -C curaos` call here would resolve against that repo and
#     check-ignore the submodule's paths with the wrong ignore rules. A gitignored build
#     artifact would then read as mirror drift and the hook would refuse a clean commit.
#     The artifact sits one level ABOVE the deepest compared dir on purpose: an artifact
#     under a leaf the ai side does not descend into is never compared at all, so it
#     proves nothing about the ignore rules.
WS24="$TMP/ws24"
build_base "$WS24"
git init -q "$WS24/curaos"
printf 'tools/test-results/\n' > "$WS24/curaos/.gitignore"
mkdir -p "$WS24/curaos/tools/codegen"
mkdir -p "$WS24/curaos/tools/test-results/visual"
: > "$WS24/curaos/tools/test-results/visual/trace.zip"
mkdir -p "$WS24/ai/curaos/tools/codegen"
out="$(run "$WS24")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:'; then
  ok "a gitignored artifact beside a compared dir is not mirror drift (exit 0)"
else
  nok "gitignored artifact beside a compared dir" "$out"
fi
OUTER="$TMP/ws24-outer"
mkdir -p "$OUTER"
git init -q "$OUTER"
out="$(CHECK_AI_MIRROR_WS="$WS24" GIT_DIR="$OUTER/.git" GIT_WORK_TREE="$OUTER" GIT_INDEX_FILE="$OUTER/.git/index" bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:'; then
  ok "an exported hook git environment does not produce false mirror drift (exit 0)"
else
  nok "hook git environment must not leak into the submodule's ignore rules" "$out"
fi

# 25) a lane's linked worktree parked at an arbitrary code path is a DIFFERENT
#     repository's checkout, not code-repo pollution. Case 11 only covers the
#     .claude/.scratch worktree conventions, so a worktree parked elsewhere (seen
#     live at curaos/backend/services/<service>.<branch>/, which blocked every
#     workspace-root commit) was attributed to curaos. A checkout is recognized by
#     its own .git marker, the same primitive is_submodule already uses.
WS25="$TMP/ws25"
build_base "$WS25"
# Faithful to production: the worktree is excluded in the code repo's info/exclude, so the
# ignore-aware mirror comparator already skips it and only the filesystem walk below sees it.
git init -q "$WS25/curaos"
printf '/backend/services/svc-a.some-branch/\n' >> "$WS25/curaos/.git/info/exclude"
mkdir -p "$WS25/curaos/backend/services/svc-a.some-branch/docs"
printf 'gitdir: /elsewhere/.git/worktrees/lane\n' > "$WS25/curaos/backend/services/svc-a.some-branch/.git"
: > "$WS25/curaos/backend/services/svc-a.some-branch/CONTEXT.md"
: > "$WS25/curaos/backend/services/svc-a.some-branch/Requirements.md"
: > "$WS25/curaos/backend/services/svc-a.some-branch/docs/AGENTS.md"
out="$(run "$WS25")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && ! printf '%s' "$out" | grep -q 'POLLUTION:'; then
  ok "a nested checkout's own agent docs are not code-repo pollution (exit 0)"
else
  nok "nested checkout docs false positive" "$out"
fi

# 26) the guard still catches a real stray beside that nested checkout, so 25 did
#     not buy its pass by pruning the whole services/ subtree.
WS26="$TMP/ws26"
build_base "$WS26"
mkdir -p "$WS26/curaos/backend/services/svc-a.some-branch"
printf 'gitdir: /elsewhere/.git/worktrees/lane\n' > "$WS26/curaos/backend/services/svc-a.some-branch/.git"
: > "$WS26/curaos/backend/services/svc-a.some-branch/CONTEXT.md"
: > "$WS26/curaos/backend/services/CONTEXT.md"
out="$(run "$WS26")"
if printf '%s' "$out" | grep -q 'POLLUTION: stray agent-doc' \
  && printf '%s' "$out" | grep -q 'backend/services/CONTEXT.md' \
  && ! printf '%s' "$out" | grep -q 'svc-a.some-branch/CONTEXT.md' \
  && printf '%s' "$out" | grep -q 'EXIT=1'; then
  ok "a real stray beside a nested checkout is still caught (exit 1)"
else
  nok "stray beside nested checkout" "$out"
fi

# V15-PRECOMMIT-GATES-UNRUNNABLE-IN-A-LANE-WORKTREE: a linked worktree never has the
# curaos submodule materialized, so curaos/ is empty and the gate refused (case 19).
# The pinned gitlink IS readable there through the shared common gitdir, so the code
# side is resolved from the PINNED COMMIT instead, the way check-vendored-git-helpers.sh
# already does, and the gate renders a REAL verdict.
# Fixture: a workspace repo whose curaos/ is an empty directory plus a 160000 index
# entry, with the child repository's object store placed at .git/modules/curaos, which
# is exactly the shape a linked worktree sees.
build_pinned_ws() {
  local ws="$1" child="$2" extra="${3:-}" pin
  mkdir -p "$ws" "$child"
  /usr/bin/git -C "$ws" init -q
  mkdir -p "$ws/ai/curaos/backend/services/svc-a/agents" "$ws/ai/curaos/ops/dev"
  mkdir -p "$ws/ai/curaos/curaos-website/site-notes"
  /usr/bin/git -C "$child" init -q
  mkdir -p "$child/backend/services/svc-a/src" "$child/ops/dev"
  : > "$child/backend/services/svc-a/src/index.ts"
  : > "$child/ops/dev/compose.yaml"
  [ -n "$extra" ] && mkdir -p "$child/$extra" && : > "$child/$extra/keep.txt"
  cat > "$child/.gitmodules" <<'GM'
[submodule "backend/services/svc-a"]
	path = backend/services/svc-a
	url = https://example.invalid/svc-a.git
[submodule "curaos-website"]
	path = curaos-website
	url = https://example.invalid/curaos-website.git
GM
  /usr/bin/git -C "$child" add -A
  # A gitlink in the PINNED tree: a module leaf whose internals are never mirrored.
  # ls-tree reports it as objecttype commit, and .gitmodules is what makes it a leaf.
  /usr/bin/git -C "$child" update-index --add \
    --cacheinfo "160000,0000000000000000000000000000000000000001,curaos-website"
  /usr/bin/git -C "$child" -c user.email=t@example.invalid -c user.name=t commit -qm fixture
  pin="$(/usr/bin/git -C "$child" rev-parse HEAD)"
  mkdir -p "$ws/.git/modules"
  cp -R "$child/.git" "$ws/.git/modules/curaos"
  mkdir -p "$ws/curaos"
  /usr/bin/git -C "$ws" update-index --add --cacheinfo "160000,$pin,curaos"
}

# 27) empty curaos/ with a resolvable pin: a real PASS verdict, not a refusal.
WS27="$TMP/ws27"
build_pinned_ws "$WS27" "$TMP/ws27-child"
out="$(run "$WS27")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'pinned' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:' \
  && ! printf '%s' "$out" | grep -q 'cannot run the mirror gate'; then
  ok "unmaterialized curaos/ with a resolvable gitlink passes from the pinned tree"
else
  nok "pinned gitlink fallback must render a real pass" "$out"
fi

# 28) and the SAME fallback still reports real drift: the pinned tree carries a
#     top-level dir with no ai/curaos/ twin. Proves 27 is not a vacuous green.
WS28="$TMP/ws28"
build_pinned_ws "$WS28" "$TMP/ws28-child" "tools/codegen"
out="$(run "$WS28")"
if printf '%s' "$out" | grep -q 'EXIT=1' \
  && printf '%s' "$out" | grep -q 'DRIFT: tools exists in curaos/ but not in ai/curaos/'; then
  ok "pinned gitlink fallback still reports real drift (exit 1)"
else
  nok "pinned gitlink fallback must not pass vacuously" "$out"
fi

# 29) fail-closed: empty curaos/, gitlink pinned at a commit this checkout does not
#     have. Nothing to read, so the gate must still REFUSE, never pass.
WS29="$TMP/ws29"
build_pinned_ws "$WS29" "$TMP/ws29-child"
rm -rf "$WS29/.git/modules/curaos"
out="$(run "$WS29")"
if printf '%s' "$out" | grep -q 'EXIT=2' \
  && ! printf '%s' "$out" | grep -q 'DRIFT:' \
  && ! printf '%s' "$out" | grep -q 'OK: '; then
  ok "an unresolvable pin still refuses (exit 2), never a pass"
else
  nok "unresolvable pin must stay fail-closed" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
