#!/usr/bin/env bash
# Install (or uninstall) the inbox-sweep launchd LaunchAgent on macOS.
# Renders the plist template with this repo's absolute paths, drops it in
# ~/Library/LaunchAgents/, and bootstraps it so the sweep runs every 15 min
# independent of any Claude/agent session - the durable mechanical fix for the
# recurring merged-PR-notification leak.
#
# NOT INSTALLED BY POLICY: the user directed that this daemon stay NOT installed
# (AUTO-DECISION-LOG row 53, commit 6431927) - the designed path is the manual
# ordered sweep (milestone-orchestration-prompt §3.13, last-action ordering).
# This script is retained ONLY for a future explicit user decision to install;
# running it without that decision is a policy violation, not a fix.
#
# Usage:
#   scripts/install-sweep-daemon.sh            # install + load
#   scripts/install-sweep-daemon.sh --uninstall  # unload + remove
#
# macOS only (launchd). On Linux, use a systemd user timer or cron instead.
set -euo pipefail

LABEL="com.curaos.sweep-notifications"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_DIR}/scripts/${LABEL}.plist.template"
AGENT_DIR="${HOME}/Library/LaunchAgents"
DEST="${AGENT_DIR}/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

if [ "$(uname)" != "Darwin" ]; then
  echo "This installer is macOS-only (launchd). On Linux use a systemd user timer." >&2
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  rm -f "$DEST"
  echo "Uninstalled ${LABEL}."
  exit 0
fi

BASH_BIN="$(command -v bash)"
mkdir -p "$AGENT_DIR"
sed -e "s#@REPO_DIR@#${REPO_DIR}#g" -e "s#@BASH@#${BASH_BIN}#g" "$TEMPLATE" > "$DEST"

# Reload idempotently.
launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$DEST"
launchctl enable "${DOMAIN}/${LABEL}"

echo "Installed ${LABEL} -> ${DEST}"
echo "Runs sweep-pr-notifications --apply every 15 min (RunAtLoad fires now)."
echo "Log: ${REPO_DIR}/.scratch/sweep-daemon.log"
echo "Verify: launchctl print ${DOMAIN}/${LABEL} | grep -E 'state|last exit'"
