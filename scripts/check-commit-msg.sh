#!/usr/bin/env bash
# check-commit-msg.sh: commit-msg gate (RP-10, AGENTS.md section 8).
# 1) Subject must be Conventional Commits: type(scope)!: summary.
# 2) AI/tool attribution trailers are banned (one accountable author).
# Fail closed: a missing or unreadable message file blocks the commit.
set -uo pipefail

MSG_FILE="${1:-}"
if [ -z "$MSG_FILE" ] || [ ! -r "$MSG_FILE" ]; then
  echo "commit-msg: message file missing or unreadable; failing closed" >&2
  exit 1
fi

# Drop comment lines; stop at the verbose-mode scissors marker (the staged
# diff below it is not part of the message).
MSG="$(awk '/^# -+ >8 -+/ { exit } !/^#/ { print }' "$MSG_FILE")"

SUBJECT="$(printf '%s\n' "$MSG" | awk 'NF { print; exit }')"
if [ -z "$SUBJECT" ]; then
  echo "commit-msg: empty commit message; failing closed" >&2
  exit 1
fi

TYPES='feat|fix|docs|refactor|test|chore|perf|build|ci'
# Git porcelain subjects (merge/revert/autosquash) pass through untouched.
if ! printf '%s' "$SUBJECT" | grep -qE "^((${TYPES})(\([^)]+\))?!?: .+|Merge |Revert |fixup! |squash! )"; then
  echo "commit-msg: subject is not Conventional Commits (type(scope): imperative summary):" >&2
  echo "  $SUBJECT" >&2
  echo "  allowed types: feat fix docs refactor test chore perf build ci" >&2
  exit 1
fi

# AGENTS.md section 8 trailer ban; agent-[a-z-]+ also covers "similar"
# Agent-* trailers (Agent-ID, Agent-Model, ...).
BANNED='co-authored-by|generated-by|ai-assisted-by|agent-[a-z-]+|task-issue|worktree'
HITS="$(printf '%s\n' "$MSG" | grep -inE "^[[:space:]]*(${BANNED})[[:space:]]*:" || true)"
if [ -n "$HITS" ]; then
  echo "commit-msg: banned AI/tool attribution trailer(s) (AGENTS.md section 8, one accountable author):" >&2
  printf '%s\n' "$HITS" >&2
  exit 1
fi

exit 0
