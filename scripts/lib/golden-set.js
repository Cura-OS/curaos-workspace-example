// scripts/lib/golden-set.js
// RP-58: T1 LLM-judge golden-set integrity + drift comparison.
//
// The golden set (ai/curaos/docs/grills/golden-set/golden-set.json) freezes 20-30 labeled PR
// states curated from the grills archive; the rubric lives beside it (t1-judge-rubric.md).
// This lib backs scripts/check-golden-set.js:
// - validateGoldenSet: structural self-check (counts, labels, provenance files exist, judge pin).
// - compareVerdicts / evaluateDrift: compare a judge run against the labels. Missing or unknown
//   verdicts count as divergent (fail-closed). Drift, not benchmark: agreement only stabilizes
//   with 100+ labels, so the threshold catches gross verdict drift after a model refresh.

const MIN_ENTRIES = 20;
const MAX_ENTRIES = 30;
const MIN_PER_CLASS = 5;
const DEFAULT_THRESHOLD = 0.1;
const LABELS = ["pass", "fail"];

// Grill-vocabulary synonyms accepted from a judge run; anything else is unknown (divergent).
const PASS_SYNONYMS = ["pass", "approve", "accept"];
const FAIL_SYNONYMS = ["fail", "block", "reject", "merge-blocked"];

function normalizeVerdict(raw) {
  const v = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
  if (PASS_SYNONYMS.includes(v)) return "pass";
  if (FAIL_SYNONYMS.includes(v)) return "fail";
  return null;
}

// Structural self-check. Returns an array of problem strings; empty = healthy.
function validateGoldenSet(set, { archiveDir, rootDir, fsLike } = {}) {
  const fsImpl = fsLike || require("node:fs");
  const problems = [];
  if (!set || typeof set !== "object") return ["golden set is not an object"];

  if (!set.rubric_version) problems.push("missing rubric_version (pin required)");
  if (!set.judge || !set.judge.model) problems.push("missing judge.model pin");
  if (set.judge && !set.judge.pinned_at) problems.push("missing judge.pinned_at");
  const threshold = set.divergence_threshold;
  if (typeof threshold !== "number" || !(threshold > 0) || !(threshold < 1)) {
    problems.push("divergence_threshold must be a number in (0, 1)");
  }
  if (set.rubric && rootDir) {
    const rubricPath = `${rootDir}/${set.rubric}`;
    if (!fsImpl.existsSync(rubricPath)) problems.push(`rubric file missing: ${set.rubric}`);
  } else if (!set.rubric) {
    problems.push("missing rubric path");
  }

  const entries = Array.isArray(set.entries) ? set.entries : [];
  if (!Array.isArray(set.entries)) problems.push("entries must be an array");
  if (entries.length < MIN_ENTRIES || entries.length > MAX_ENTRIES) {
    problems.push(
      `entry count ${entries.length} outside curation band ${MIN_ENTRIES}-${MAX_ENTRIES}`,
    );
  }

  const seen = new Set();
  const perClass = { pass: 0, fail: 0 };
  for (const entry of entries) {
    const id = entry && entry.id;
    if (!id) {
      problems.push("entry with missing id");
      continue;
    }
    if (seen.has(id)) problems.push(`duplicate entry id: ${id}`);
    seen.add(id);
    if (!LABELS.includes(entry.label)) {
      problems.push(`${id}: label must be one of ${LABELS.join("/")}`);
    } else {
      perClass[entry.label] += 1;
    }
    if (!entry.initial_verdict) problems.push(`${id}: missing initial_verdict`);
    if (!entry.rationale) problems.push(`${id}: missing rationale`);
    if (!entry.grill_report) {
      problems.push(`${id}: missing grill_report provenance`);
    } else if (archiveDir && !fsImpl.existsSync(`${archiveDir}/${entry.grill_report}`)) {
      problems.push(`${id}: grill_report not in archive: ${entry.grill_report}`);
    }
  }
  for (const label of LABELS) {
    if (perClass[label] < MIN_PER_CLASS) {
      problems.push(`label class "${label}" has ${perClass[label]} entries; minimum ${MIN_PER_CLASS}`);
    }
  }
  return problems;
}

// Compare a judge run ({ "<entry-id>": "pass" | "fail" }) against the labels.
// Missing and unknown verdicts count toward the divergence rate (fail-closed).
function compareVerdicts(set, verdicts) {
  const entries = (set && Array.isArray(set.entries) && set.entries) || [];
  const map = verdicts && typeof verdicts === "object" ? verdicts : {};
  const divergent = [];
  const missing = [];
  const unknown = [];
  let agreed = 0;
  for (const entry of entries) {
    if (!(entry.id in map)) {
      missing.push(entry.id);
      continue;
    }
    const verdict = normalizeVerdict(map[entry.id]);
    if (verdict === null) {
      unknown.push({ id: entry.id, raw: map[entry.id] });
      continue;
    }
    if (verdict === entry.label) agreed += 1;
    else divergent.push({ id: entry.id, label: entry.label, verdict });
  }
  const total = entries.length;
  const divergenceCount = divergent.length + missing.length + unknown.length;
  return {
    total,
    agreed,
    divergent,
    missing,
    unknown,
    divergenceCount,
    rate: total ? divergenceCount / total : 1,
  };
}

// Drift evaluation: ok only when the divergence rate stays at or under the threshold.
function evaluateDrift(set, verdicts, thresholdOverride) {
  const threshold =
    typeof thresholdOverride === "number"
      ? thresholdOverride
      : typeof (set && set.divergence_threshold) === "number"
        ? set.divergence_threshold
        : DEFAULT_THRESHOLD;
  const comparison = compareVerdicts(set, verdicts);
  return { ...comparison, threshold, ok: comparison.rate <= threshold };
}

module.exports = {
  MIN_ENTRIES,
  MAX_ENTRIES,
  MIN_PER_CLASS,
  DEFAULT_THRESHOLD,
  normalizeVerdict,
  validateGoldenSet,
  compareVerdicts,
  evaluateDrift,
};
