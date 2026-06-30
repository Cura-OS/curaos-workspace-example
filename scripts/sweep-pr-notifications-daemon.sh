#!/usr/bin/env bash
# Daemon wrapper for sweep-pr-notifications: runs the sweep --apply on a timer,
# independent of any Claude/agent session. This is the DURABLE mechanical fix
# for the recurring "merged-PR notifications pile up" leak - it does not depend
# on an orchestrator remembering to call the sweep. Installed as a launchd
# LaunchAgent (macOS) via scripts/install-sweep-daemon.sh.
#
# Logs each run (timestamp + sweep stderr) to .scratch/sweep-daemon.log under
# the repo so the drain is auditable. Exits 0 always (a held notification is the
# point, not an error).
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SWEEP="${REPO_DIR}/scripts/sweep-pr-notifications"
LOG_DIR="${REPO_DIR}/.scratch"
LOG="${LOG_DIR}/sweep-daemon.log"

mkdir -p "$LOG_DIR"
# Keep the log bounded (last ~500 lines).
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 1000 ]; then
  tail -n 400 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

{
  echo "===== $(date '+%Y-%m-%dT%H:%M:%S%z') sweep run ====="
  # sweep already wraps gh in `env -u GITHUB_TOKEN gh` for the narrow-token workaround.
  bash "$SWEEP" --apply 2>&1
} >> "$LOG" 2>&1

exit 0
