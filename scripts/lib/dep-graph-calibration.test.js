// scripts/lib/dep-graph-calibration.test.js
// Tests for the calibration data-collection hook + analysis skeleton (issue #208 slice).
// Runner: bun test. Plain Node module under test (require()), tmpdir-backed log fixtures.
const { test, expect, beforeEach, afterEach } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cal = require("./dep-graph-calibration.js");

let tmpDir;
let logPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-cal-"));
  logPath = path.join(tmpDir, "dep-graph-calibration-log.json");
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ---- a well-formed dispatch record (no outcome yet - backfilled at wave-close) ----
function sampleRanked() {
  return [
    {
      issue: "your-org/curaos-ai-workspace#1",
      score: 0.7421,
      unblockReach: 12,
      criticalPathDepth: 4,
      priority: "high",
      effort: "m",
    },
    {
      issue: "your-org/curaos-ai-workspace#2",
      score: 0.3,
      unblockReach: 3,
      criticalPathDepth: 1,
      priority: "low",
      effort: "s",
    },
  ];
}
const sampleWeights = { unblock: 0.5, cp: 0.3, prio: 0.15, effort: 0.05 };

// ============================ buildRecord (record shape) ============================

test("buildRecord captures one schema-valid record per ranked candidate", () => {
  const rec = cal.buildRecord({
    ranked: sampleRanked(),
    weights: sampleWeights,
    milestone: "M9",
    dispatchedAt: "2026-06-12T14:03:00Z",
  });
  expect(rec.schemaVersion).toBe(1);
  expect(rec.milestone).toBe("M9");
  expect(rec.dispatchedAt).toBe("2026-06-12T14:03:00Z");
  expect(rec.waveId).toBe("M9-2026-06-12T14:03:00Z");
  expect(rec.weights).toEqual(sampleWeights);
  expect(rec.candidates).toHaveLength(2);
  const c0 = rec.candidates[0];
  expect(c0.issue).toBe("your-org/curaos-ai-workspace#1");
  expect(c0.rankAtDispatch).toBe(1); // 1-based
  expect(c0.score).toBe(0.7421);
  expect(c0.unblockReachAtDispatch).toBe(12);
  expect(c0.criticalPathDepth).toBe(4);
  expect(c0.priority).toBe("high");
  expect(c0.effort).toBe("m");
  expect(rec.candidates[1].rankAtDispatch).toBe(2);
  // outcome is NOT set at dispatch time (backfilled at wave close)
  expect(rec.outcome).toBeUndefined();
});

test("validateRecord accepts a well-formed record and rejects malformed", () => {
  const good = cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt: "2026-06-12T14:03:00Z" });
  expect(cal.validateRecord(good).valid).toBe(true);

  const bad = { schemaVersion: 1, milestone: "M9" }; // missing waveId/dispatchedAt/weights/candidates
  const res = cal.validateRecord(bad);
  expect(res.valid).toBe(false);
  expect(res.errors.length).toBeGreaterThan(0);
});

// ============================ appendRecord (append-not-rewrite, fail-soft) ============================

test("appendRecord creates the log file when absent", () => {
  expect(fs.existsSync(logPath)).toBe(false);
  const rec = cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt: "2026-06-12T14:03:00Z" });
  const ok = cal.appendRecord(rec, { logPath });
  expect(ok).toBe(true);
  expect(fs.existsSync(logPath)).toBe(true);
  const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  expect(Array.isArray(log.records)).toBe(true);
  expect(log.records).toHaveLength(1);
  expect(log.schemaVersion).toBe(1);
});

test("appendRecord APPENDS - never rewrites prior records", () => {
  const r1 = cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt: "2026-06-12T14:03:00Z" });
  const r2 = cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt: "2026-06-13T09:00:00Z" });
  cal.appendRecord(r1, { logPath });
  cal.appendRecord(r2, { logPath });
  const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  expect(log.records).toHaveLength(2);
  expect(log.records[0].dispatchedAt).toBe("2026-06-12T14:03:00Z");
  expect(log.records[1].dispatchedAt).toBe("2026-06-13T09:00:00Z");
});

test("appendRecord is fail-soft: returns false on an unwritable path, never throws", () => {
  const badPath = path.join(tmpDir, "no-such-dir", "nested", "log.json");
  let result;
  expect(() => {
    result = cal.appendRecord(
      cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt: "2026-06-12T14:03:00Z" }),
      { logPath: badPath, mkdir: false },
    );
  }).not.toThrow();
  expect(result).toBe(false);
});

test("appendRecord rejects a malformed record fail-soft (warns, returns false, does not write)", () => {
  const ok = cal.appendRecord({ schemaVersion: 1 }, { logPath });
  expect(ok).toBe(false);
  expect(fs.existsSync(logPath)).toBe(false);
});

// ============================ analyze (insufficient-data skeleton) ============================

function writeLog(records) {
  fs.writeFileSync(logPath, JSON.stringify({ schemaVersion: 1, records }, null, 2));
}
function recWithOutcome(dispatchedAt, freedCounts) {
  const rec = cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt });
  rec.outcome = {
    windowClosedAt: dispatchedAt,
    freed: rec.candidates.map((c, i) => ({ issue: c.issue, freedCount: freedCounts[i] })),
  };
  return rec;
}

test("analyze returns insufficient-data with zero complete waves", () => {
  writeLog([]);
  const res = cal.analyze({ logPath });
  expect(res.status).toBe("insufficient-data");
  expect(res.wavesWithOutcome).toBe(0);
  expect(res.recommendation).toBeUndefined();
});

test("analyze counts only waves WITH a backfilled outcome and stays insufficient below 3", () => {
  // 2 with outcome, 1 dispatch-only (no outcome)
  const withOutcome = [
    recWithOutcome("2026-06-01T00:00:00Z", [12, 3]),
    recWithOutcome("2026-06-02T00:00:00Z", [9, 1]),
  ];
  const dispatchOnly = cal.buildRecord({ ranked: sampleRanked(), weights: sampleWeights, milestone: "M9", dispatchedAt: "2026-06-03T00:00:00Z" });
  writeLog([...withOutcome, dispatchOnly]);
  const res = cal.analyze({ logPath });
  expect(res.status).toBe("insufficient-data");
  expect(res.wavesWithOutcome).toBe(2);
  expect(res.recommendation).toBeUndefined();
});

test("analyze with >=3 complete waves computes Pearson + Spearman and NEVER mutates DEFAULT_WEIGHTS", () => {
  const waves = [
    recWithOutcome("2026-06-01T00:00:00Z", [12, 3]),
    recWithOutcome("2026-06-02T00:00:00Z", [9, 1]),
    recWithOutcome("2026-06-03T00:00:00Z", [11, 2]),
  ];
  writeLog(waves);
  const res = cal.analyze({ logPath });
  expect(res.status).toBe("ok");
  expect(res.wavesWithOutcome).toBe(3);
  expect(typeof res.correlation.pearson).toBe("number");
  expect(typeof res.correlation.spearman).toBe("number");
  // skeleton MUST NOT mutate DEFAULT_WEIGHTS - recommendation is advisory only
  const dg = require("./dep-graph.js");
  expect(dg.DEFAULT_WEIGHTS).toEqual({ unblock: 0.5, cp: 0.3, prio: 0.15, effort: 0.05 });
});

// ============================ sizing signal (RP-47 documented expectation) ============================

test("analyze with >=3 complete waves emits the throughput sizing signal", () => {
  // dispatched per wave = 2 (sampleRanked); freed per wave = 15, 10, 13 -> median 13
  const waves = [
    recWithOutcome("2026-06-01T00:00:00Z", [12, 3]),
    recWithOutcome("2026-06-02T00:00:00Z", [9, 1]),
    recWithOutcome("2026-06-03T00:00:00Z", [11, 2]),
  ];
  writeLog(waves);
  const res = cal.analyze({ logPath });
  expect(res.status).toBe("ok");
  expect(res.sizing).toEqual({
    medianDispatchedPerWave: 2,
    medianFreedPerWave: 13,
    suggestedWaveSize: 2,
  });
});

test("analyze below 3 complete waves emits NO sizing signal", () => {
  writeLog([recWithOutcome("2026-06-01T00:00:00Z", [12, 3])]);
  const res = cal.analyze({ logPath });
  expect(res.status).toBe("insufficient-data");
  expect(res.sizing).toBeUndefined();
});

test("median averages the middle pair on even-length input and ignores non-finite values", () => {
  expect(cal.median([1, 2, 3, 4])).toBe(2.5);
  expect(cal.median([3, 1, 2])).toBe(2);
  expect(cal.median([])).toBe(0);
  expect(cal.median([5, NaN, 7])).toBe(6);
});

test("analyze on a missing log file is fail-soft → insufficient-data(0)", () => {
  const res = cal.analyze({ logPath: path.join(tmpDir, "does-not-exist.json") });
  expect(res.status).toBe("insufficient-data");
  expect(res.wavesWithOutcome).toBe(0);
});

// ============================ pearson / spearman primitives ============================

test("pearson is 1.0 for a perfectly correlated series and -1.0 for inverse", () => {
  expect(cal.pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  expect(cal.pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
});

test("spearman is 1.0 for a monotonic-but-nonlinear series", () => {
  expect(cal.spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 6);
});
