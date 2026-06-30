// scripts/lib/golden-set.test.js
// RP-58: golden-set integrity self-check + judge-drift comparison.
// Runner: bun test. Offline: the only filesystem touched is the committed golden set,
// the grills archive (read-only existence checks), and a tmp dir for CLI runs.
const { test, expect, beforeEach, afterEach } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  MIN_ENTRIES,
  MAX_ENTRIES,
  MIN_PER_CLASS,
  normalizeVerdict,
  validateGoldenSet,
  compareVerdicts,
  evaluateDrift,
} = require("./golden-set.js");

const root = path.resolve(__dirname, "../..");
const goldenSetPath = path.join(root, "ai/curaos/docs/grills/golden-set/golden-set.json");
const archiveDir = path.join(root, "ai/curaos/docs/grills");
const cliPath = path.join(root, "scripts/check-golden-set.js");

const realSet = () => JSON.parse(fs.readFileSync(goldenSetPath, "utf8"));

function perfectVerdicts(set) {
  const verdicts = {};
  for (const entry of set.entries) verdicts[entry.id] = entry.label;
  return verdicts;
}

// Minimal healthy synthetic set for failure-mode fixtures (in-memory fs).
function syntheticSet() {
  const entries = [];
  for (let i = 0; i < MIN_ENTRIES; i += 1) {
    entries.push({
      id: `entry-${i}`,
      grill_report: `report-${i}.md`,
      prs: [`repo#${i}`],
      label: i % 2 === 0 ? "fail" : "pass",
      initial_verdict: i % 2 === 0 ? "BLOCK" : "PASS",
      rationale: "synthetic",
    });
  }
  return {
    rubric: "rubric.md",
    rubric_version: "1.0.0",
    judge: { harness: "claude-code", model: "claude-test-pin", pinned_at: "2026-06-10" },
    divergence_threshold: 0.1,
    entries,
  };
}

const fsAllExist = { existsSync: () => true };

// --- normalizeVerdict ---

test("normalizeVerdict maps grill vocabulary onto pass/fail and rejects the rest", () => {
  expect(normalizeVerdict("pass")).toBe("pass");
  expect(normalizeVerdict("APPROVE")).toBe("pass");
  expect(normalizeVerdict(" Accept ")).toBe("pass");
  expect(normalizeVerdict("fail")).toBe("fail");
  expect(normalizeVerdict("BLOCK")).toBe("fail");
  expect(normalizeVerdict("Merge-Blocked")).toBe("fail");
  expect(normalizeVerdict("REJECT")).toBe("fail");
  expect(normalizeVerdict("approve-with-conditions")).toBe(null);
  expect(normalizeVerdict("")).toBe(null);
  expect(normalizeVerdict(undefined)).toBe(null);
});

// --- validateGoldenSet: the committed golden set is the acceptance surface ---

test("committed golden set passes the structural self-check against the real archive", () => {
  const problems = validateGoldenSet(realSet(), { archiveDir, rootDir: root });
  expect(problems).toEqual([]);
});

test("committed golden set stays inside the 20-30 curation band with both classes covered", () => {
  const set = realSet();
  expect(set.entries.length).toBeGreaterThanOrEqual(MIN_ENTRIES);
  expect(set.entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
  const fails = set.entries.filter((entry) => entry.label === "fail").length;
  const passes = set.entries.filter((entry) => entry.label === "pass").length;
  expect(fails).toBeGreaterThanOrEqual(MIN_PER_CLASS);
  expect(passes).toBeGreaterThanOrEqual(MIN_PER_CLASS);
});

test("every committed entry cites a real, non-stub grill report", () => {
  const { isBlockedStubReport } = require("./grill-fixture-quarantine.js");
  for (const entry of realSet().entries) {
    const reportPath = path.join(archiveDir, entry.grill_report);
    expect(fs.existsSync(reportPath)).toBe(true);
    const content = fs.readFileSync(reportPath, "utf8");
    expect(isBlockedStubReport(content)).toBe(false);
  }
});

test("validateGoldenSet flags missing judge pin, bad threshold, and bad labels", () => {
  const set = syntheticSet();
  delete set.judge.model;
  set.divergence_threshold = 1.5;
  set.entries[0].label = "maybe";
  const problems = validateGoldenSet(set, { fsLike: fsAllExist, rootDir: "/r" });
  expect(problems.some((p) => p.includes("judge.model"))).toBe(true);
  expect(problems.some((p) => p.includes("divergence_threshold"))).toBe(true);
  expect(problems.some((p) => p.includes("entry-0"))).toBe(true);
});

test("validateGoldenSet flags counts outside the curation band and duplicate ids", () => {
  const small = syntheticSet();
  small.entries = small.entries.slice(0, 3);
  expect(
    validateGoldenSet(small, { fsLike: fsAllExist, rootDir: "/r" }).some((p) =>
      p.includes("curation band"),
    ),
  ).toBe(true);

  const dup = syntheticSet();
  dup.entries[1] = { ...dup.entries[1], id: dup.entries[0].id };
  expect(
    validateGoldenSet(dup, { fsLike: fsAllExist, rootDir: "/r" }).some((p) =>
      p.includes("duplicate entry id"),
    ),
  ).toBe(true);
});

test("validateGoldenSet flags a grill_report missing from the archive", () => {
  const set = syntheticSet();
  const fsOneMissing = {
    existsSync: (p) => !String(p).endsWith("report-0.md"),
  };
  const problems = validateGoldenSet(set, {
    fsLike: fsOneMissing,
    archiveDir: "/archive",
    rootDir: "/r",
  });
  expect(problems.some((p) => p.includes("not in archive: report-0.md"))).toBe(true);
});

// --- compareVerdicts / evaluateDrift ---

test("perfect agreement yields rate 0 and ok", () => {
  const set = syntheticSet();
  const result = evaluateDrift(set, perfectVerdicts(set));
  expect(result.rate).toBe(0);
  expect(result.agreed).toBe(set.entries.length);
  expect(result.ok).toBe(true);
});

test("missing and unknown verdicts count as divergent (fail-closed)", () => {
  const set = syntheticSet();
  const verdicts = perfectVerdicts(set);
  delete verdicts["entry-0"];
  verdicts["entry-1"] = "approve-with-conditions";
  const result = compareVerdicts(set, verdicts);
  expect(result.missing).toEqual(["entry-0"]);
  expect(result.unknown.length).toBe(1);
  expect(result.divergenceCount).toBe(2);
  expect(result.rate).toBeCloseTo(2 / set.entries.length, 10);
});

test("rate at the threshold passes; above the threshold fails", () => {
  const set = syntheticSet();
  // 20 entries, threshold 0.1: exactly 2 flips = rate 0.1 (ok), 3 flips = 0.15 (drift).
  const atThreshold = perfectVerdicts(set);
  atThreshold["entry-0"] = set.entries[0].label === "pass" ? "fail" : "pass";
  atThreshold["entry-1"] = set.entries[1].label === "pass" ? "fail" : "pass";
  expect(evaluateDrift(set, atThreshold).ok).toBe(true);

  const aboveThreshold = { ...atThreshold };
  aboveThreshold["entry-2"] = set.entries[2].label === "pass" ? "fail" : "pass";
  const result = evaluateDrift(set, aboveThreshold);
  expect(result.ok).toBe(false);
  expect(result.divergent.length).toBe(3);
});

test("threshold override beats the golden-set default", () => {
  const set = syntheticSet();
  const verdicts = perfectVerdicts(set);
  verdicts["entry-0"] = set.entries[0].label === "pass" ? "fail" : "pass";
  expect(evaluateDrift(set, verdicts).ok).toBe(true);
  expect(evaluateDrift(set, verdicts, 0.01).ok).toBe(false);
});

// --- CLI (acceptance: runner exits nonzero on divergence beyond threshold) ---

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-goldenset-"));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

test("CLI self-check exits 0 on the committed golden set", () => {
  const result = runCli([]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("golden set ok");
});

test("CLI exits 0 when judge verdicts match labels", () => {
  const verdictsPath = path.join(tmpDir, "verdicts.json");
  fs.writeFileSync(verdictsPath, JSON.stringify(perfectVerdicts(realSet())));
  const result = runCli(["--verdicts", verdictsPath]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("drift ok");
});

test("CLI exits nonzero when judge verdicts diverge beyond the threshold", () => {
  const set = realSet();
  const verdicts = perfectVerdicts(set);
  const flipCount = Math.floor(set.entries.length * set.divergence_threshold) + 1;
  for (const entry of set.entries.slice(0, flipCount)) {
    verdicts[entry.id] = entry.label === "pass" ? "fail" : "pass";
  }
  const verdictsPath = path.join(tmpDir, "verdicts.json");
  fs.writeFileSync(verdictsPath, JSON.stringify(verdicts));
  const result = runCli(["--verdicts", verdictsPath]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("GOLDEN-SET DRIFT");
});

test("CLI exits nonzero on a structurally broken golden set", () => {
  const broken = realSet();
  delete broken.judge;
  const brokenPath = path.join(tmpDir, "broken.json");
  fs.writeFileSync(brokenPath, JSON.stringify(broken));
  const result = runCli(["--golden-set", brokenPath]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("judge.model");
});

test("CLI rejects unknown arguments and bad thresholds with exit 2", () => {
  expect(runCli(["--nope"]).status).toBe(2);
  expect(runCli(["--threshold", "7"]).status).toBe(2);
});
