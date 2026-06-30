// scripts/lib/grill-fixture-quarantine.js
// RP-33: fixture-quarantine + archive-hygiene helpers for the opposite-harness grill archive.
//
// Policy (canonical doc: ai/curaos/docs/grills/README.md):
// - Real grill verdicts live in ai/curaos/docs/grills/ named <milestone-story>-pr<num>.md.
// - Synthetic/fixture exercises of the grill workflow (defect verification, stub runs) quarantine
//   under scripts/test-fixtures/grills/ and carry the GRILL-SYNTHETIC marker line; they must never
//   sit beside real verdicts (the issue-621 fixture class).
// - Blocked-harness STUBS (reports whose only content is the deterministic blocked-harness
//   evidence, no adversarial verdict) are measurable here so the milestone-wave verify leg can
//   report a stub ratio and alarm when merges proceed on blocked adversarial legs.
//
// MIRROR CONTRACT: SYNTHETIC_GRILL_MARKER + isSyntheticGrillSubject are textually identical to the
// inline copies in scripts/workflows/opposite-harness-grill.workflow.js (that file cannot require
// this lib: its source runs via `new Function` in the truth contract, where import.meta is
// unavailable). Keep them in lockstep.

const SYNTHETIC_GRILL_MARKER = "GRILL-SYNTHETIC: true";
const BLOCKED_GRILL_MARKER = "GRILL: blocked-harness-unavailable";
// Quarantine destination, relative to the resolved workspace root (scripts/lib/workspace-root.js).
const GRILL_QUARANTINE_RELATIVE_DIR = "scripts/test-fixtures/grills";

function isSyntheticGrillSubject(subject) {
  return /\bsynthetic\b/i.test(String(subject || ""));
}

// A report is synthetic when it carries the explicit marker, or when its deterministic
// blocked-report Subject: line matches the synthetic-subject backstop. Intentionally NOT keyed on
// the word "fixture": real wave subjects legitimately describe fixture-based tests.
function isSyntheticGrillReport(content) {
  const text = String(content || "");
  if (text.includes(SYNTHETIC_GRILL_MARKER)) return true;
  const subjectLine = text.match(/^Subject:\s*(.+)$/m);
  return Boolean(subjectLine) && isSyntheticGrillSubject(subjectLine[1]);
}

// Completed-adversarial evidence: a pinned reviewed commit or any verdict line/heading. A blocked
// stub that was later re-grilled to a real verdict appends these and stops counting as a stub.
function hasCompletedVerdict(content) {
  const text = String(content || "");
  return /GRILL-VERIFIED-SHA:/.test(text) || /verdict\s*:/i.test(text);
}

function isBlockedStubReport(content) {
  const text = String(content || "");
  return text.includes(BLOCKED_GRILL_MARKER) && !hasCompletedVerdict(text);
}

// Scan a grill archive directory (non-recursive; README.md excluded) and classify each report.
// Returns { total, blockedStubs, syntheticViolations, stubRatio }. blockedStubs feeds the
// milestone-wave stub-ratio metric + alarm (RP-33); syntheticViolations must stay empty for the
// live archive (fixtures belong under scripts/test-fixtures/grills/).
function scanGrillArchive(dir, fsLike) {
  const fsImpl = fsLike || require("node:fs");
  const names = fsImpl
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
  const blockedStubs = [];
  const syntheticViolations = [];
  for (const name of names) {
    const content = fsImpl.readFileSync(`${dir}/${name}`, "utf8");
    if (isBlockedStubReport(content)) blockedStubs.push(name);
    if (isSyntheticGrillReport(content)) syntheticViolations.push(name);
  }
  return {
    total: names.length,
    blockedStubs,
    syntheticViolations,
    stubRatio: names.length ? blockedStubs.length / names.length : 0,
  };
}

function quarantineViolations(dir, fsLike) {
  return scanGrillArchive(dir, fsLike).syntheticViolations;
}

module.exports = {
  SYNTHETIC_GRILL_MARKER,
  BLOCKED_GRILL_MARKER,
  GRILL_QUARANTINE_RELATIVE_DIR,
  isSyntheticGrillSubject,
  isSyntheticGrillReport,
  hasCompletedVerdict,
  isBlockedStubReport,
  scanGrillArchive,
  quarantineViolations,
};
