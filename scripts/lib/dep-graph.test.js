// scripts/lib/dep-graph.test.js
// RP-46 degrade-hardening tests for the dep-graph lib (quality-gates fail-closed class 5:
// silent-empty parse). Covers: stubbed edge-fetch failure => degraded:true + edge_fetch_failures>0
// in rank() output; transient retry seam (withRetry); per-run clean-result-only edge cache; and the
// end-to-end calibration skip (log untouched on a degraded run) via the exact executor call pattern
// (rank -> buildRecord -> appendRecord) used by wave-prioritize.workflow.js.
// Runner: bun test. Plain Node module under test (require()), tmpdir-backed log fixtures.
const { test, expect, beforeEach, afterEach } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dep = require("./dep-graph.js");
const cal = require("./dep-graph-calibration.js");

let tmpDir;
let logPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-depgraph-"));
  logPath = path.join(tmpDir, "dep-graph-calibration-log.json");
  dep.clearEdgeCache();
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

const K = (n) => `${dep.ORG}/curaos#${n}`;
const EMPTY_EDGES = Object.freeze({ blocking: [], subIssues: [], parent: null, failures: 0 });

// Chain fixture: 1 blocks 2, 2 blocks 3 (candidate 1 has reach 2); 4 is an isolated candidate.
function chainFetcher() {
  const edges = {
    [K(1)]: { blocking: [K(2)], subIssues: [], parent: null, failures: 0 },
    [K(2)]: { blocking: [K(3)], subIssues: [], parent: null, failures: 0 },
  };
  return (key) => edges[key] || EMPTY_EDGES;
}
const CANDIDATES = [
  { ref: "curaos#1", priority: "high", effort: "S" },
  { ref: "curaos#4", priority: "low", effort: "M" },
];

// ---- degrade surface through rank() ----

test("healthy run: rank() reports degraded:false and edge_fetch_failures:0", () => {
  const res = dep.rank(CANDIDATES, { fetcher: chainFetcher() });
  expect(res.degraded).toBe(false);
  expect(res.edge_fetch_failures).toBe(0);
  expect(res.ranked.length).toBe(2);
  expect(res.ranked[0].issue).toBe(K(1)); // chain head outranks the isolated candidate
  expect(res.ranked[0].unblockReach).toBe(2);
  expect(res.ranked.degraded).toBe(false); // bridging marker present on the rows array too
  expect(res.ranked.edgeFetchFailures).toBe(0);
});

test("a THROWING edge fetch yields degraded:true + edge_fetch_failures>0; ranking still completes", () => {
  const base = chainFetcher();
  const fetcher = (key) => {
    if (key === K(4)) throw new Error("HTTP 502 bad gateway");
    return base(key);
  };
  const res = dep.rank(CANDIDATES, { fetcher });
  expect(res.degraded).toBe(true);
  expect(res.edge_fetch_failures).toBeGreaterThan(0);
  // fail-soft: the degraded node still ranks (with empty edges), the wave is not thrown.
  expect(res.ranked.map((r) => r.issue).sort()).toEqual([K(1), K(4)].sort());
  expect(res.ranked.degraded).toBe(true);
  expect(res.ranked.edgeFetchFailures).toBe(res.edge_fetch_failures);
});

test("fetcher-REPORTED failures (counted partial fetch) aggregate into edge_fetch_failures", () => {
  const base = chainFetcher();
  const fetcher = (key) =>
    key === K(2) ? { blocking: [], subIssues: [], parent: null, failures: 2 } : base(key);
  const res = dep.rank(CANDIDATES, { fetcher });
  expect(res.degraded).toBe(true);
  expect(res.edge_fetch_failures).toBe(2);
});

test("bridging marker is non-enumerable: JSON shape and iteration of ranked are unchanged", () => {
  const base = chainFetcher();
  const fetcher = (key) => {
    if (key === K(4)) throw new Error("HTTP 502 bad gateway");
    return base(key);
  };
  const { ranked } = dep.rank(CANDIDATES, { fetcher });
  expect(Object.keys(ranked)).toEqual(["0", "1"]); // index keys only
  const parsed = JSON.parse(JSON.stringify(ranked));
  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed.degraded).toBeUndefined();
});

// ---- transient retry seam (RP-12 pattern) ----

test("withRetry recovers from one transient failure (one backoff wait, candidate not degraded)", () => {
  let calls = 0;
  const waits = [];
  const fn = () => {
    calls += 1;
    if (calls === 1) throw new Error("HTTP 502 bad gateway");
    return "ok";
  };
  const out = dep.withRetry(fn, { wait: (ms) => waits.push(ms) });
  expect(out).toBe("ok");
  expect(calls).toBe(2);
  expect(waits).toEqual([500]);
});

test("withRetry exhausts 3 attempts on a persistent transient failure, then throws", () => {
  let calls = 0;
  const waits = [];
  const fn = () => {
    calls += 1;
    throw new Error("HTTP 503 service unavailable");
  };
  expect(() => dep.withRetry(fn, { wait: (ms) => waits.push(ms) })).toThrow();
  expect(calls).toBe(dep.GH_ATTEMPTS);
  expect(waits).toEqual([500, 1000]); // linear backoff between the 3 attempts
});

test("withRetry does NOT retry client errors (404 throws on the first attempt, no wait)", () => {
  let calls = 0;
  const waits = [];
  const fn = () => {
    calls += 1;
    throw new Error("gh: Not Found (HTTP 404)");
  };
  expect(() => dep.withRetry(fn, { wait: (ms) => waits.push(ms) })).toThrow();
  expect(calls).toBe(1);
  expect(waits).toEqual([]);
});

test("isTransientGithubFailure classifies 5xx/gateway as transient and 404/422 as not", () => {
  expect(dep.isTransientGithubFailure("HTTP 502")).toBe(true);
  expect(dep.isTransientGithubFailure("bad gateway")).toBe(true);
  expect(dep.isTransientGithubFailure("gateway timeout")).toBe(true);
  expect(dep.isTransientGithubFailure("gh: No parent issue found (HTTP 404)")).toBe(false);
  expect(dep.isTransientGithubFailure("HTTP 422 validation failed")).toBe(false);
  expect(dep.isTransientGithubFailure("")).toBe(false);
});

// ---- per-run edge cache: clean results cached, failures never cached ----

test("createCachedFetcher caches CLEAN results across rank() runs (one underlying fetch per key)", () => {
  const counts = new Map();
  const base = chainFetcher();
  const counting = (key) => {
    counts.set(key, (counts.get(key) || 0) + 1);
    return base(key);
  };
  const cached = dep.createCachedFetcher(counting, new Map());
  dep.rank(CANDIDATES, { fetcher: cached });
  dep.rank(CANDIDATES, { fetcher: cached });
  for (const [key, n] of counts) expect({ key, n }).toEqual({ key, n: 1 });
});

test("createCachedFetcher does NOT cache failed results: a degraded fetch is retried next run", () => {
  let calls = 0;
  const fetcher = (key) => {
    if (key !== K(4)) return chainFetcher()(key);
    calls += 1;
    return calls === 1
      ? { blocking: [], subIssues: [], parent: null, failures: 1 } // first run: counted failure
      : EMPTY_EDGES; // second run: clean
  };
  const cached = dep.createCachedFetcher(fetcher, new Map());
  const first = dep.rank(CANDIDATES, { fetcher: cached });
  expect(first.degraded).toBe(true);
  const second = dep.rank(CANDIDATES, { fetcher: cached });
  expect(second.degraded).toBe(false); // refetched clean, NOT replayed from cache
  expect(calls).toBe(2);
  const third = dep.rank(CANDIDATES, { fetcher: cached });
  expect(third.degraded).toBe(false);
  expect(calls).toBe(2); // clean result now cached
});

// ---- acceptance: calibration log untouched on a degraded run (executor call pattern) ----

test("degraded run: buildRecord carries degraded:true via the ranked marker; appendRecord refuses; log untouched", () => {
  const base = chainFetcher();
  const fetcher = (key) => {
    if (key === K(4)) throw new Error("HTTP 502 bad gateway");
    return base(key);
  };
  // EXACT executor pattern (wave-prioritize.workflow.js): destructure ranked/weights, forward only those.
  const { ranked, weights } = dep.rank(CANDIDATES, { fetcher });
  const rec = cal.buildRecord({ ranked, weights, milestone: "M99", dispatchedAt: "2026-06-10T00:00:00Z" });
  expect(rec.degraded).toBe(true);
  expect(cal.appendRecord(rec, { logPath })).toBe(false);
  expect(fs.existsSync(logPath)).toBe(false); // calibration log untouched
});

test("degraded skip also honors the explicit degraded option and preserves an existing log byte-for-byte", () => {
  const clean = dep.rank(CANDIDATES, { fetcher: chainFetcher() });
  const goodRec = cal.buildRecord({ ranked: clean.ranked, weights: clean.weights, milestone: "M99" });
  expect(cal.appendRecord(goodRec, { logPath })).toBe(true);
  const before = fs.readFileSync(logPath, "utf8");
  const degradedRec = cal.buildRecord({ ranked: clean.ranked, weights: clean.weights, milestone: "M99", degraded: true });
  expect(degradedRec.degraded).toBe(true);
  expect(cal.appendRecord(degradedRec, { logPath })).toBe(false);
  expect(fs.readFileSync(logPath, "utf8")).toBe(before);
});

test("clean run: record has NO degraded field, appends fine, and validates", () => {
  const { ranked, weights } = dep.rank(CANDIDATES, { fetcher: chainFetcher() });
  const rec = cal.buildRecord({ ranked, weights, milestone: "M99" });
  expect(rec.degraded).toBeUndefined(); // log schema unchanged for clean runs
  expect(cal.validateRecord(rec).valid).toBe(true);
  expect(cal.appendRecord(rec, { logPath })).toBe(true);
  const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  expect(log.records.length).toBe(1);
  expect(log.records[0].degraded).toBeUndefined();
});

test("validateRecord rejects a non-boolean degraded field", () => {
  const { ranked, weights } = dep.rank(CANDIDATES, { fetcher: chainFetcher() });
  const rec = cal.buildRecord({ ranked, weights, milestone: "M99" });
  rec.degraded = "yes";
  const check = cal.validateRecord(rec);
  expect(check.valid).toBe(false);
  expect(check.errors.join("; ")).toContain("degraded must be a boolean");
});
