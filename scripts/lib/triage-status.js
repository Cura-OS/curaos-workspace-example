// triage-status - SINGLE owner of the triage->Project-Status derivation shared by the
// pm-triage-gate and milestone-wave executors (RP-20: the KEEP-IN-SYNC inline copies are the
// drift class; extraction is the guard).
//
// Consumption modes (dual-runtime constraint, workflow-defect #508):
//   - milestone-wave.workflow.js (default-export executor) lazy-requires this module via
//     createRequire(import.meta.url) inside the function body - a DIRECT import, no inline copy.
//   - pm-triage-gate.workflow.js is a Claude-style top-level body: its source also runs through
//     `new Function` harnesses where neither require() nor import.meta exists, so it keeps an
//     INLINE copy of both functions. That copy MUST stay byte-identical to the functions below;
//     scripts/workflow-truth-contract.test.js pins the equality (extractFunction) and executes
//     the behavior from THIS module.
//
// Pure functions, no side effects - safe to require from any workflow executor or script.

function statusFromTriage(triage) {
  if (!triage) return "";
  if (triage.has_blocked_marker === true || triage.blocker_kind === "real") return "Blocked";
  if (triage.state_label === "ready-for-agent" || triage.state_label === "ready-for-human") return "Ready";
  if (triage.has_foresight_marker === true) return "Backlog";
  if (triage.state_label === "needs-triage" || triage.state_label === "needs-info" || triage.state_label === "wontfix") return "Backlog";
  return "";
}

function projectFieldsForSync(triage) {
  const fields = { ...((triage && triage.project_fields) || {}) };
  const status = statusFromTriage(triage);
  if (status) fields.Status = status;
  return fields;
}

module.exports = { statusFromTriage, projectFieldsForSync };
