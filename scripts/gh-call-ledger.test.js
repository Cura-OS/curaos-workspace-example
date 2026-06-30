// scripts/gh-call-ledger.test.js
// RP-36 / GRILL-011: the call ledger is the reproducible source of truth for GitHub-call counts.
// Locks: per-issue scenario = the committed 300-call baseline shape; batched scenario = <=2
// GraphQL calls for the SAME 100-issue read; compare verifies scenario identity; classification
// normalizes endpoints. Runner: bun test. Zero network (scenarios run against the stub gh).
const { test, expect } = require("bun:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LEDGER_BIN = path.join(ROOT, "scripts", "gh-call-ledger");
const BASELINE = path.join(ROOT, "scripts", "gh-call-ledger-baseline.json");
const ledger = require(LEDGER_BIN);

function runCli(args) {
  const run = spawnSync(process.execPath, [LEDGER_BIN, ...args], { encoding: "utf8", cwd: ROOT });
  return run;
}

// ============================ classification ============================

test("classify: graphql, normalized REST paths, and CLI read shapes", () => {
  expect(ledger.classify(["api", "graphql", "-f", "query=query{viewer{login}}"])).toEqual({ endpoint: "graphql", kind: "graphql" });
  expect(ledger.classify(["api", "repos/o/r/issues/12/parent"])).toEqual({ endpoint: "api repos/:owner/:repo/issues/:n/parent", kind: "rest" });
  expect(ledger.classify(["api", "--paginate", "repos/o/r/issues/7/sub_issues"])).toEqual({ endpoint: "api repos/:owner/:repo/issues/:n/sub_issues", kind: "rest" });
  expect(ledger.classify(["issue", "view", "9", "--repo", "o/r", "--json", "body"])).toEqual({ endpoint: "issue view --json", kind: "cli" });
  expect(ledger.classify(["issue", "view", "9", "-R", "o/r", "--comments"])).toEqual({ endpoint: "issue view --comments", kind: "cli" });
  expect(ledger.classify(["project", "item-list", "2", "--owner", "x", "--format", "json"])).toEqual({ endpoint: "project item-list", kind: "cli" });
});

// ============================ scenario: per-issue (baseline shape) ============================

test(
  "per-issue scenario reproduces the pre-batching pipeline: 300 calls, zero GraphQL",
  () => {
    const out = ledger.runScenario("per-issue");
    expect(out.totals).toEqual({ all: 300, graphql: 0, rest: 100, cli: 200 });
    expect(out.counts["issue view --json"]).toBe(100);
    expect(out.counts["api repos/:owner/:repo/issues/:n/parent"]).toBe(100);
    expect(out.counts["issue view --comments"]).toBe(100);
    expect(out.scenario).toMatchObject({ name: "issue-read-100", issueCount: 100, repoCount: 10, resolved: 100 });
  },
  120_000, // 300 sequential stub spawns; well beyond the 5s default
);

// ============================ scenario: batched (RP-36 acceptance) ============================

test("batched scenario drives the REAL batchIssueRead: <=2 GraphQL calls for the 100-issue read", () => {
  const out = ledger.runScenario("batched");
  expect(out.totals.graphql).toBeLessThanOrEqual(2); // RP-36 acceptance bound
  expect(out.totals.all).toBe(out.totals.graphql); // nothing but GraphQL on the batched path
  expect(out.scenario.resolved).toBe(100); // every issue resolved, none silently dropped
});

// ============================ committed baseline artifact + compare ============================

test("the committed baseline ledger artifact exists with its scenario recorded", () => {
  expect(fs.existsSync(BASELINE)).toBe(true);
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  expect(baseline.mode).toBe("per-issue");
  expect(baseline.totals.all).toBe(300);
  expect(baseline.scenario).toMatchObject({ name: "issue-read-100", issueCount: 100, repoCount: 10, wavePhases: ["triage-read"] });
});

test("CLI compare against the committed baseline reports the saving and exits 0 on scenario match", () => {
  const run = runCli(["scenario", "issue-read-100", "--mode", "batched", "--compare", BASELINE]);
  expect(run.status).toBe(0);
  // stdout carries two pretty-printed JSON documents (ledger, then compare); parse the last
  const lastBlockStart = run.stdout.lastIndexOf('{\n  "compare"');
  expect(lastBlockStart).toBeGreaterThan(-1);
  const compareBlock = JSON.parse(run.stdout.slice(lastBlockStart));
  expect(compareBlock.compare.sameScenario).toBe(true);
  expect(compareBlock.compare.graphqlCalls).toBeLessThanOrEqual(2);
  expect(compareBlock.compare.savedCalls).toBeGreaterThanOrEqual(298);
});

test("compareLedgers flags a scenario mismatch", () => {
  const a = { mode: "batched", totals: { all: 2, graphql: 2, rest: 0, cli: 0 }, scenario: { name: "issue-read-100", issueCount: 100, repoCount: 10 } };
  const b = { mode: "per-issue", totals: { all: 300, graphql: 0, rest: 100, cli: 200 }, scenario: { name: "issue-read-100", issueCount: 50, repoCount: 10 } };
  expect(ledger.compareLedgers(a, b).sameScenario).toBe(false);
});

// ============================ parse mode (run-log path) ============================

test("parse mode classifies a raw jsonl into the same ledger shape", () => {
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-parse-"));
  const raw = path.join(tmp, "raw.jsonl");
  fs.writeFileSync(raw, `${JSON.stringify(["api", "graphql", "-f", "query=q"])}\n${JSON.stringify(["api", "repos/o/r/issues/3"])}\n`);
  const run = runCli(["parse", raw]);
  expect(run.status).toBe(0);
  const out = JSON.parse(run.stdout);
  expect(out.totals).toEqual({ all: 2, graphql: 1, rest: 1, cli: 0 });
  fs.rmSync(tmp, { recursive: true, force: true });
});
