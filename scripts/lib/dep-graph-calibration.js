// scripts/lib/dep-graph-calibration.js
// Calibration feedback loop for the wave-prioritize unblock-leverage blend (issue #208 slice).
//
// PURPOSE: close the loop on the weighted blend in dep-graph.js (DEFAULT_WEIGHTS, user decision
// 2026-05-29). The blend weights are unvalidated guesses; this module makes them MEASURABLE:
//   1. data collection - buildRecord() + appendRecord() write one append-only dispatch record per
//      wave-prioritize run to scripts/lib/dep-graph-calibration-log.json. Called from the
//      wave-prioritize executor AFTER dep-graph.js returns `ranked`/`weights`. Append is fail-soft
//      (same contract as the lib's edge-fetch: warn, never throw the wave).
//   2. outcome backfill - at wave close, each record's `outcome` block is filled with the actual
//      per-issue freedCount (blocked dependents freed within the wave window). See backfill-outcome.js
//      + the `## Calibration` section of docs/agents/workflows/wave-prioritize.md.
//   3. analysis - analyze() reads the log and, for runs WITH a backfilled outcome, computes Pearson +
//      Spearman correlation between predicted rankAtDispatch / score and the realized freedCount.
//
// SKELETON SCOPE (this PR, pre-data): with < 3 complete waves analyze() returns
// { status: "insufficient-data", wavesWithOutcome: <n> } and recommends NOTHING. The weight-RECOMMENDER
// (coarse grid search over {unblock,cp,prio,effort}, > 0.05 correlation-delta acceptance gate) activates
// only once >= 3 complete waves exist - that work is data-blocked and lands in a follow-up.
//
// HARD RULE: this module NEVER writes dep-graph.js DEFAULT_WEIGHTS. A weight change is a T3 (HITL) user
// decision of the same class as the original 2026-05-29 blend decision (per
// ai/rules/curaos_verification_stack_rule.md) - analyze() emits an advisory recommendation only; a human
// applies it via a follow-up T3-gated PR.
//
// LOG SCHEMA (schemaVersion 1) - one record per wave-prioritize run:
//   { schemaVersion, waveId:"<milestone>-<iso8601>", milestone, dispatchedAt:<iso8601>,
//     weights:{unblock,cp,prio,effort},
//     candidates:[{ issue, rankAtDispatch(1-based), score, unblockReachAtDispatch, criticalPathDepth,
//                   priority, effort }],
//     outcome?:{ windowClosedAt:<iso8601>, freed:[{ issue, freedCount }] } }   // backfilled at wave close
// The log file is { schemaVersion: 1, records: [ <record>, ... ] } - append-never-rewrite.

const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;
const DEFAULT_LOG_PATH = path.join(__dirname, "dep-graph-calibration-log.json");

// ---- build one dispatch record from the lib's ranked[] + applied weights ----
// ranked rows come verbatim from dep-graph.js rank(): { issue, score, unblockReach, criticalPathDepth,
// priority, effort, breakdown }. We capture the calibration-relevant fields (NOT the full breakdown blob)
// plus the 1-based rankAtDispatch derived from array order.
// DEGRADE GUARD (RP-46): a rank() run with edge-fetch failures undercounts unblockReach, so its
// predictions must never enter the calibration data set. The degrade signal arrives either as the
// explicit `degraded` option or as the non-enumerable `ranked.degraded` marker dep-graph.js stamps on
// the rows array (the wave-prioritize executor forwards only `ranked`). Degraded records carry
// degraded:true and appendRecord refuses them.
function buildRecord({ ranked, weights, milestone, dispatchedAt, degraded }) {
  const at = dispatchedAt || new Date().toISOString();
  const ms = milestone || "unknown";
  const isDegraded = degraded === true || (Array.isArray(ranked) && ranked.degraded === true);
  const candidates = (Array.isArray(ranked) ? ranked : []).map((r, i) => ({
    issue: r.issue,
    rankAtDispatch: i + 1, // 1-based index in `ranked`
    score: r.score,
    unblockReachAtDispatch: r.unblockReach,
    criticalPathDepth: r.criticalPathDepth,
    priority: r.priority ?? null,
    effort: r.effort ?? null,
  }));
  const rec = {
    schemaVersion: SCHEMA_VERSION,
    waveId: `${ms}-${at}`,
    milestone: ms,
    dispatchedAt: at,
    weights: { ...weights },
    candidates,
  };
  if (isDegraded) rec.degraded = true; // absent on clean runs: log schema unchanged for them
  return rec;
}

// ---- validate a record against the schemaVersion-1 shape (used by BOTH the hook + the reader) ----
function validateRecord(rec) {
  const errors = [];
  if (!rec || typeof rec !== "object") return { valid: false, errors: ["record is not an object"] };
  if (rec.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  for (const k of ["waveId", "milestone", "dispatchedAt"]) {
    if (typeof rec[k] !== "string" || !rec[k]) errors.push(`${k} must be a non-empty string`);
  }
  if (!rec.weights || typeof rec.weights !== "object") errors.push("weights must be an object");
  if (!Array.isArray(rec.candidates) || rec.candidates.length === 0) {
    errors.push("candidates must be a non-empty array");
  } else {
    rec.candidates.forEach((c, i) => {
      if (!c || typeof c !== "object") { errors.push(`candidates[${i}] not an object`); return; }
      if (typeof c.issue !== "string" || !c.issue) errors.push(`candidates[${i}].issue must be a non-empty string`);
      if (!Number.isInteger(c.rankAtDispatch) || c.rankAtDispatch < 1) errors.push(`candidates[${i}].rankAtDispatch must be a 1-based integer`);
      if (typeof c.score !== "number") errors.push(`candidates[${i}].score must be a number`);
      if (typeof c.unblockReachAtDispatch !== "number") errors.push(`candidates[${i}].unblockReachAtDispatch must be a number`);
      if (typeof c.criticalPathDepth !== "number") errors.push(`candidates[${i}].criticalPathDepth must be a number`);
    });
  }
  // degraded is OPTIONAL (stamped only by a degraded rank() run, RP-46); validate type when present.
  if (rec.degraded !== undefined && typeof rec.degraded !== "boolean") {
    errors.push("degraded must be a boolean when present");
  }
  // outcome is OPTIONAL (backfilled later); validate only when present.
  if (rec.outcome !== undefined) {
    if (!rec.outcome || typeof rec.outcome !== "object") errors.push("outcome must be an object when present");
    else if (!Array.isArray(rec.outcome.freed)) errors.push("outcome.freed must be an array when outcome is present");
  }
  return { valid: errors.length === 0, errors };
}

// ---- append one record to the log (create-if-absent, append-never-rewrite, FAIL-SOFT) ----
// Returns true on a successful append, false on any failure (malformed record OR fs error). NEVER throws
// - the wave must not die because a calibration log write failed (same fail-soft as the lib's edge-fetch).
function appendRecord(rec, { logPath = DEFAULT_LOG_PATH, mkdir = true } = {}) {
  try {
    // RP-46 degrade guard: a record built from a degraded rank() run (edge-fetch failures => undercounted
    // unblockReach) must never enter the calibration data set. Skip BEFORE any fs touch: log untouched.
    if (rec && rec.degraded === true) {
      console.warn("[dep-graph-calibration] skipping append: dispatch record marked degraded (edge-fetch failures during rank); calibration log untouched");
      return false;
    }
    const check = validateRecord(rec);
    if (!check.valid) {
      console.warn(`[dep-graph-calibration] refusing to append malformed record: ${check.errors.join("; ")}`);
      return false;
    }
    let log = { schemaVersion: SCHEMA_VERSION, records: [] };
    if (fs.existsSync(logPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(logPath, "utf8"));
        if (parsed && Array.isArray(parsed.records)) log = parsed;
      } catch (e) {
        console.warn(`[dep-graph-calibration] existing log unparseable, refusing to overwrite: ${e.message}`);
        return false; // never clobber an unparseable existing log - that would lose history
      }
    } else if (mkdir) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
    }
    log.records.push(rec);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
    return true;
  } catch (e) {
    console.warn(`[dep-graph-calibration] append failed (fail-soft, wave continues): ${e.message}`);
    return false;
  }
}

// ---- load the log fail-soft → { schemaVersion, records:[] } (missing/unparseable => empty) ----
function loadLog(logPath = DEFAULT_LOG_PATH) {
  try {
    if (!fs.existsSync(logPath)) return { schemaVersion: SCHEMA_VERSION, records: [] };
    const parsed = JSON.parse(fs.readFileSync(logPath, "utf8"));
    if (parsed && Array.isArray(parsed.records)) return parsed;
  } catch (e) {
    console.warn(`[dep-graph-calibration] could not read log (${e.message}); treating as empty`);
  }
  return { schemaVersion: SCHEMA_VERSION, records: [] };
}

// ---- a wave is "complete" when it carries a backfilled outcome with at least one freed entry ----
function hasOutcome(rec) {
  return !!(rec && rec.outcome && Array.isArray(rec.outcome.freed) && rec.outcome.freed.length > 0);
}

// ---- Pearson product-moment correlation. Returns 0 for a degenerate (constant) input. ----
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

// ---- fractional ranks (average ties), then Pearson over ranks = Spearman's rho ----
function rankVector(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank for the tie group
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}
function spearman(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  return pearson(rankVector(xs.slice(0, n)), rankVector(ys.slice(0, n)));
}

// ---- median (sizing primitive): even-length input averages the middle pair ----
function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---- sizing signal (documented expectation, remediation RP-47): with >= 3 complete waves analyze()
// emits a throughput-based wave-sizing signal alongside correlation. Per complete wave:
// dispatched = candidates.length, freed = sum of outcome.freed[].freedCount. suggestedWaveSize is the
// median dispatched count across complete waves - the calibration-throughput input that sizes drafted
// story sets (consumed by the pre-breakdown trigger, RP-48). Advisory only, like everything analyze()
// emits: it never gates dispatch and never writes weights.
function sizingSignal(completeWaves) {
  const dispatched = completeWaves.map((w) => (Array.isArray(w.candidates) ? w.candidates.length : 0));
  const freed = completeWaves.map((w) =>
    w.outcome.freed.reduce((sum, f) => sum + (Number.isFinite(f && f.freedCount) ? f.freedCount : 0), 0));
  return {
    medianDispatchedPerWave: median(dispatched),
    medianFreedPerWave: median(freed),
    suggestedWaveSize: median(dispatched),
  };
}

// ---- flatten complete waves into paired (predictor, freedCount) series across all candidates ----
function pairedSeries(completeWaves) {
  const rank = [], score = [], freed = [];
  for (const w of completeWaves) {
    const freedByIssue = new Map(w.outcome.freed.map((f) => [f.issue, f.freedCount]));
    for (const c of w.candidates) {
      if (!freedByIssue.has(c.issue)) continue;
      rank.push(c.rankAtDispatch);
      score.push(c.score);
      freed.push(freedByIssue.get(c.issue));
    }
  }
  return { rank, score, freed };
}

// ---- main entry: read the log, gate on >= 3 complete waves, compute correlation (skeleton) ----
// < 3 complete waves => { status:"insufficient-data", wavesWithOutcome } (recommends nothing).
// >= 3 complete waves => { status:"ok", wavesWithOutcome, correlation:{pearson,spearman},
//                          sizing:{medianDispatchedPerWave,medianFreedPerWave,suggestedWaveSize},
//                          recommendation }.
// The weight-RECOMMENDER (grid search + > 0.05-delta acceptance gate) is intentionally NOT implemented in
// this skeleton - it is data-blocked until >= 3 real waves exist. analyze() NEVER writes DEFAULT_WEIGHTS.
function analyze({ logPath = DEFAULT_LOG_PATH } = {}) {
  const log = loadLog(logPath);
  const complete = (log.records || []).filter(hasOutcome);
  const wavesWithOutcome = complete.length;
  if (wavesWithOutcome < 3) {
    return { status: "insufficient-data", wavesWithOutcome };
  }
  // score/rank are inverse predictors of freedCount: a LOW rank (1 = first) and a HIGH score should both
  // correlate with a HIGH freedCount. We report rank-vs-freed and score-vs-freed; a well-calibrated blend
  // makes score-vs-freed POSITIVE and rank-vs-freed NEGATIVE.
  const { rank, score, freed } = pairedSeries(complete);
  const correlation = {
    pearson: pearson(score, freed),
    spearman: spearman(score, freed),
    rankVsFreedPearson: pearson(rank, freed),
    rankVsFreedSpearman: spearman(rank, freed),
  };
  return {
    status: "ok",
    wavesWithOutcome,
    correlation,
    sizing: sizingSignal(complete),
    // Recommendation is advisory + NOT computed by this skeleton. The grid-search recommender + the
    // > 0.05 correlation-delta acceptance gate are data-blocked follow-up work; until they land,
    // analyze() reports correlation only and recommends nothing.
    recommendation: null,
    note: "skeleton: correlation reported; weight-recommender (grid search + >0.05-delta gate) is data-blocked follow-up. DEFAULT_WEIGHTS changes are T3 (HITL) - never auto-applied.",
  };
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_LOG_PATH,
  buildRecord,
  validateRecord,
  appendRecord,
  loadLog,
  hasOutcome,
  pearson,
  spearman,
  rankVector,
  median,
  sizingSignal,
  pairedSeries,
  analyze,
};
