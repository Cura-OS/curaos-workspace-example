#!/usr/bin/env node
// RP-56 pilot: WORKFLOW-STATUS table parser + validator.
//
// The table lives at docs/agents/WORKFLOW-STATUS.md and carries one row per
// committed executor in scripts/workflows/. Status grammar:
//   ok                      no known open workflow-defect issue
//   degraded:<issue-url>    usable with a known open defect (issue URL required)
//   broken:<issue-url>      do not dispatch (issue URL required)
// The workflow-defect closeout updates the row in the same change that opens
// or closes the defect issue. The truth-contract gate fails a stale "ok" on a
// defect-tagged workflow (violation kind "stale-ok").

const ISSUE_URL_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function splitRow(line) {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseStatus(raw) {
  const status = String(raw || "").replace(/`/g, "").trim();
  if (status === "ok") return { kind: "ok", url: null };
  if (status.startsWith("degraded:")) {
    return { kind: "degraded", url: status.slice("degraded:".length) };
  }
  if (status === "broken") return { kind: "broken", url: null };
  if (status.startsWith("broken:")) {
    return { kind: "broken", url: status.slice("broken:".length) };
  }
  return { kind: "invalid", url: null };
}

// Returns [{workflow, status, statusKind, defectIssueUrl, lastVerified, notes}]
// from the first markdown table whose header row starts with "| Workflow |".
function parseWorkflowStatusTable(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const rows = [];
  let inTable = false;
  for (const line of lines) {
    if (!inTable) {
      if (/^\|\s*Workflow\s*\|/i.test(line)) inTable = true;
      continue;
    }
    if (!line.trim().startsWith("|")) break;
    // Header separator row: pipes, colons, spaces, hyphens only.
    if (/^[|\s:-]+$/.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length < 3) continue;
    const [workflow, status, lastVerified, notes = ""] = cells;
    const parsed = parseStatus(status);
    rows.push({
      workflow: workflow.replace(/`/g, "").trim(),
      status: status.replace(/`/g, "").trim(),
      statusKind: parsed.kind,
      defectIssueUrl: parsed.url,
      lastVerified,
      notes,
    });
  }
  return rows;
}

// openDefects: { [workflowName]: "<open defect issue url>" }. When
// defectsAuthoritative is true the set is treated as the complete live
// defect set, so degraded/broken rows WITHOUT an open defect also fail
// (the closeout forgot to flip the row back to ok).
function validateWorkflowStatus(rows, options) {
  const { executors = [], openDefects = {}, defectsAuthoritative = false } = options || {};
  const violations = [];
  const seen = new Map();

  for (const row of rows) {
    if (seen.has(row.workflow)) {
      violations.push({
        kind: "duplicate-row",
        workflow: row.workflow,
        message: `duplicate WORKFLOW-STATUS row for ${row.workflow}`,
      });
      continue;
    }
    seen.set(row.workflow, row);
  }

  const executorSet = new Set(executors);
  for (const executor of executors) {
    if (!seen.has(executor)) {
      violations.push({
        kind: "missing-row",
        workflow: executor,
        message: `executor ${executor} has no WORKFLOW-STATUS row`,
      });
    }
  }

  for (const [workflow, row] of seen) {
    if (!executorSet.has(workflow)) {
      violations.push({
        kind: "unknown-workflow",
        workflow,
        message: `${workflow} has a status row but no executor at scripts/workflows/${workflow}.workflow.js`,
      });
    }
    if (row.statusKind === "invalid") {
      violations.push({
        kind: "invalid-status",
        workflow,
        message: `${workflow} status "${row.status}" must be ok, degraded:<issue-url>, or broken:<issue-url>`,
      });
    }
    if (
      (row.statusKind === "degraded" || row.statusKind === "broken") &&
      !ISSUE_URL_RE.test(row.defectIssueUrl || "")
    ) {
      violations.push({
        kind: "missing-defect-url",
        workflow,
        message: `${workflow} ${row.statusKind} status requires a full GitHub issue URL (got "${row.defectIssueUrl || ""}")`,
      });
    }
    if (!DATE_RE.test(row.lastVerified || "")) {
      violations.push({
        kind: "invalid-date",
        workflow,
        message: `${workflow} last-verified "${row.lastVerified || ""}" must be YYYY-MM-DD`,
      });
    }
    if (row.statusKind === "ok" && openDefects[workflow]) {
      violations.push({
        kind: "stale-ok",
        workflow,
        message: `${workflow} is "ok" but has an open workflow-defect issue: ${openDefects[workflow]}`,
      });
    }
    if (
      defectsAuthoritative &&
      (row.statusKind === "degraded" || row.statusKind === "broken") &&
      !openDefects[workflow]
    ) {
      violations.push({
        kind: "stale-defect",
        workflow,
        message: `${workflow} is "${row.statusKind}" but no open workflow-defect issue exists; flip the row back to ok`,
      });
    }
  }

  return violations;
}

module.exports = {
  ISSUE_URL_RE,
  DATE_RE,
  parseStatus,
  parseWorkflowStatusTable,
  validateWorkflowStatus,
};
