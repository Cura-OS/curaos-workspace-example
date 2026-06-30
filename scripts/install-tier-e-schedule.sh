#!/usr/bin/env bash
# Install (or uninstall) the nightly LOCAL Tier E security schedule (RP-17).
# This is the DEFAULT Tier E execution path per
# ai/rules/curaos_quality_gates_rule.md + [[curaos-local-ci-first-rule]]:
# GitHub Actions tier-e-nightly.yml is workflow_dispatch-only (billing
# exhausted), so the security tier runs locally on a schedule.
#
# macOS: renders scripts/com.curaos.tier-e-nightly.plist.template with this
# repo's absolute paths, drops it in ~/Library/LaunchAgents/, and bootstraps
# it (nightly 03:00; launchd coalesces a slept-through interval into one run
# on wake). Linux: prints the equivalent cron line instead.
#
# Enabling the recurring schedule follows the seeded schedule-decision issue;
# this installer is the mechanism, not the approval.
#
# Usage:
#   scripts/install-tier-e-schedule.sh              # install + load (macOS)
#   scripts/install-tier-e-schedule.sh --uninstall  # unload + remove
#   scripts/install-tier-e-schedule.sh --cron-line  # print the cron alternative
set -euo pipefail

LABEL="com.curaos.tier-e-nightly"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_DIR}/scripts/${LABEL}.plist.template"
AGENT_DIR="${HOME}/Library/LaunchAgents"
DEST="${AGENT_DIR}/${LABEL}.plist"
DOMAIN="gui/$(id -u)"
STATE_DIR="${TIER_E_STATE_DIR:-$HOME/.local/state/curaos/tier-e}"
CRON_LINE="0 3 * * * /bin/bash ${REPO_DIR}/scripts/tier-e-local.sh --target ${REPO_DIR}/curaos >> ${STATE_DIR}/cron.log 2>&1"

if [ "${1:-}" = "--cron-line" ]; then
  echo "$CRON_LINE"
  exit 0
fi

if [ "$(uname)" != "Darwin" ]; then
  echo "This installer is macOS-only (launchd). On Linux add this cron line (crontab -e):" >&2
  echo "  $CRON_LINE" >&2
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  rm -f "$DEST"
  echo "Uninstalled ${LABEL}."
  exit 0
fi

BASH_BIN="$(command -v bash)"
mkdir -p "$AGENT_DIR" "$STATE_DIR"
sed -e "s#@REPO_DIR@#${REPO_DIR}#g" \
    -e "s#@BASH@#${BASH_BIN}#g" \
    -e "s#@STATE_DIR@#${STATE_DIR}#g" \
    "$TEMPLATE" > "$DEST"

# Reload idempotently.
launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$DEST"
launchctl enable "${DOMAIN}/${LABEL}"

echo "Installed ${LABEL} -> ${DEST}"
echo "Runs scripts/tier-e-local.sh --target ${REPO_DIR}/curaos nightly at 03:00."
echo "Evidence: ${STATE_DIR}/latest.json + ${STATE_DIR}/runs/<UTC-stamp>/"
echo "Logs: ${STATE_DIR}/launchd.out / launchd.err"
echo "Verify: launchctl print ${DOMAIN}/${LABEL} | grep -E 'state|last exit'"
echo "Freshness gate: bash scripts/check-tier-e-freshness.sh"
