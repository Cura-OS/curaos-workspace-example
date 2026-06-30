// scripts/lib/grill-fixture-quarantine.test.js
// RP-33: grill artifact policy (path default, naming, fixture quarantine).
// Runner: bun test (just ci picks up scripts/lib/*.test.js).
const { test, expect } = require("bun:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  SYNTHETIC_GRILL_MARKER,
  BLOCKED_GRILL_MARKER,
  GRILL_QUARANTINE_RELATIVE_DIR,
  isSyntheticGrillSubject,
  isSyntheticGrillReport,
  isBlockedStubReport,
  scanGrillArchive,
  quarantineViolations,
} = require("./grill-fixture-quarantine.js");

const root = path.resolve(__dirname, "..", "..");
const workflowSource = fs.readFileSync(
  path.join(root, "scripts/workflows/opposite-harness-grill.workflow.js"),
  "utf8",
);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  expect(start).not.toBe(-1);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const BLOCKED_STUB = `# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe exited 1","evidence":"codex: command not found"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 30000
GRILL-REASON: probe exited 1

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: m11-s3 commerce events
`;

const REAL_VERDICT = `# Codex grill - m11-s3 PR curaos#494

## Verdict: PASS

GRILL-VERIFIED-SHA: ${"f".repeat(40)}

## What Claude got right (counter-balance - minimum 3 items)
1. a
2. b
3. c
`;

test("synthetic-subject backstop matches 'synthetic' only, never 'fixture' (the M16-S2 false-positive class)", () => {
  expect(isSyntheticGrillSubject("issue-621 synthetic empty-report-path regression")).toBe(true);
  expect(isSyntheticGrillSubject("SYNTHETIC probe exercise")).toBe(true);
  // Real wave subjects legitimately describe fixture-based tests; they are NOT synthetic runs.
  expect(isSyntheticGrillSubject("M16-S2 umbrella chart: a fixture integration test that scaffolds the audit trio")).toBe(false);
  expect(isSyntheticGrillSubject("m11-s3 commerce events")).toBe(false);
  expect(isSyntheticGrillSubject("")).toBe(false);
});

test("synthetic-report predicate keys on the marker or the blocked-report Subject line", () => {
  expect(isSyntheticGrillReport(`${BLOCKED_STUB}${SYNTHETIC_GRILL_MARKER}\n`)).toBe(true);
  expect(isSyntheticGrillReport(BLOCKED_STUB.replace("Subject: m11-s3 commerce events", "Subject: issue-621 synthetic empty-report-path regression"))).toBe(true);
  expect(isSyntheticGrillReport(BLOCKED_STUB)).toBe(false);
  expect(isSyntheticGrillReport(REAL_VERDICT)).toBe(false);
});

test("blocked-stub predicate: blocked marker without completed-verdict evidence", () => {
  expect(isBlockedStubReport(BLOCKED_STUB)).toBe(true);
  expect(isBlockedStubReport(REAL_VERDICT)).toBe(false);
  // A blocked stub later re-grilled to a real verdict (appended section) stops counting as a stub.
  expect(isBlockedStubReport(`${BLOCKED_STUB}\n## Re-grill verification\n\nVerdict: APPROVE\nGRILL-VERIFIED-SHA: ${"a".repeat(40)}\n`)).toBe(false);
});

test("scanGrillArchive classifies an archive and computes the stub ratio", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-grill-scan-"));
  try {
    fs.writeFileSync(path.join(tmp, "README.md"), "# readme\nGRILL: blocked-harness-unavailable example\n");
    fs.writeFileSync(path.join(tmp, "m1-s1-pr1.md"), REAL_VERDICT);
    fs.writeFileSync(path.join(tmp, "m1-s2-pr2.md"), BLOCKED_STUB);
    fs.writeFileSync(path.join(tmp, "stray-synthetic.md"), `${BLOCKED_STUB}${SYNTHETIC_GRILL_MARKER}\n`);
    const scan = scanGrillArchive(tmp);
    expect(scan.total).toBe(3); // README excluded
    expect(scan.blockedStubs).toEqual(["m1-s2-pr2.md", "stray-synthetic.md"]);
    expect(scan.syntheticViolations).toEqual(["stray-synthetic.md"]);
    expect(scan.stubRatio).toBeCloseTo(2 / 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("LIVE archive carries zero synthetic fixtures (issue-621 fixture quarantined to test-fixtures)", () => {
  const liveGrillsDir = path.join(root, "ai/curaos/docs/grills");
  expect(quarantineViolations(liveGrillsDir)).toEqual([]);
  // The relocated fixture sits in quarantine and self-describes with the marker.
  const fixture = fs.readFileSync(
    path.join(root, GRILL_QUARANTINE_RELATIVE_DIR, "issue-621-synthetic-empty-report.md"),
    "utf8",
  );
  expect(fixture.includes(SYNTHETIC_GRILL_MARKER)).toBe(true);
  expect(fixture.includes(BLOCKED_GRILL_MARKER)).toBe(true);
});

test("workflow inline quarantine helpers stay synced with this lib (mirror lockstep)", () => {
  const libSource = fs.readFileSync(path.join(__dirname, "grill-fixture-quarantine.js"), "utf8");
  expect(extractFunction(workflowSource, "isSyntheticGrillSubject")).toBe(
    extractFunction(libSource, "isSyntheticGrillSubject"),
  );
  const markerLine = `const SYNTHETIC_GRILL_MARKER = ${JSON.stringify(SYNTHETIC_GRILL_MARKER)};`;
  expect(workflowSource.includes(markerLine)).toBe(true);
  expect(libSource.includes(markerLine)).toBe(true);
  // Quarantine destination derives from the resolved workspace root in the workflow too.
  expect(workflowSource.includes(`resolve(\`\${workspaceRoot()}/${GRILL_QUARANTINE_RELATIVE_DIR}\`)`)).toBe(true);
});

// --- stub-run evidence (RP-33 acceptance) -------------------------------------------------------
// Run the workflow source the same way the truth contract does (new Function + fake process) from
// a marker-less tmp cwd, so workspaceRoot() falls back to the tmp dir and nothing touches the real
// archive.
async function stubRunWorkflow({ args, agent, execFileSync }) {
  const grill = workflowSource
    .replace(/^export const meta =/m, "const meta =")
    .replace(/^export default async function workflow/m, "async function workflow");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-grill-rp33-"));
  const originalCwd = process.cwd();
  const fakeProcess = {
    getBuiltinModule(name) {
      if (name === "node:child_process") return { execFileSync };
      if (name === "node:crypto") return crypto;
      if (name === "node:fs") return fs;
      if (name === "node:path") return path;
      throw new Error(`unexpected builtin ${name}`);
    },
  };
  try {
    process.chdir(tmp);
    const runner = new Function(
      "process",
      "args",
      "agent",
      "phase",
      "log",
      `return (async () => {\n${grill}\nreturn workflow({ args, agent, phase, log });\n})()`,
    );
    const result = await runner(fakeProcess, args, agent, () => {}, () => {});
    return { result, tmp: fs.realpathSync(tmp) };
  } finally {
    process.chdir(originalCwd);
  }
}

test("stub run: PR grill defaults to <subject-slug>-pr<num>.md under ai/curaos/docs/grills/", async () => {
  let written = "";
  const { result, tmp } = await stubRunWorkflow({
    args: { pr: "your-org/curaos#494", subject: "m11-s3 commerce events" },
    execFileSync: () => "OK\n", // probe passes; sha command runs inside the agent, not the executor
    agent: async (prompt) => {
      // The adversary writes to the path the prompt names; mirror that deterministically.
      const m = prompt.match(/WRITE a grill verdict to (\S+) /);
      written = m ? m[1] : "";
      fs.mkdirSync(path.dirname(written), { recursive: true });
      fs.writeFileSync(written, REAL_VERDICT);
      return { verdict: "pass", issues: [], report_path: written, verified_sha: "f".repeat(40) };
    },
  });
  try {
    expect(result.verdict).toBe("pass");
    expect(result.report_path).toBe(path.join(tmp, "ai/curaos/docs/grills/m11-s3-commerce-events-pr494.md"));
    expect(result.verified_sha).toBe("f".repeat(40));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("stub run: synthetic subject quarantines the blocked report under scripts/test-fixtures/grills/ with the marker", async () => {
  const { result, tmp } = await stubRunWorkflow({
    args: { subject: "issue-621 synthetic empty-report-path regression", probe_timeout_ms: 1 },
    execFileSync: () => {
      const err = new Error("probe boom");
      err.status = 1;
      throw err;
    },
    agent: async () => {
      throw new Error("agent must not run when the probe fails");
    },
  });
  try {
    expect(result.verdict).toBe("skipped-harness-unavailable");
    expect(result.grill).toBe("blocked-harness-unavailable");
    expect(result.report_path.startsWith(path.join(tmp, GRILL_QUARANTINE_RELATIVE_DIR) + path.sep)).toBe(true);
    const content = fs.readFileSync(result.report_path, "utf8");
    expect(content.includes(SYNTHETIC_GRILL_MARKER)).toBe(true);
    expect(isSyntheticGrillReport(content)).toBe(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("stub run: explicit synthetic=true quarantines even when the subject looks real", async () => {
  const { result, tmp } = await stubRunWorkflow({
    args: { subject: "m9-s2 identity dual-write", synthetic: true, probe_timeout_ms: 1 },
    execFileSync: () => {
      const err = new Error("probe boom");
      err.status = 1;
      throw err;
    },
    agent: async () => {
      throw new Error("agent must not run when the probe fails");
    },
  });
  try {
    expect(result.report_path.startsWith(path.join(tmp, GRILL_QUARANTINE_RELATIVE_DIR) + path.sep)).toBe(true);
    expect(fs.readFileSync(result.report_path, "utf8").includes(SYNTHETIC_GRILL_MARKER)).toBe(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("stub run: a real subject already carrying -pr<num> is not double-suffixed", async () => {
  const { result, tmp } = await stubRunWorkflow({
    args: { pr: "246", subject: "issue-317 codegen pr246", probe_timeout_ms: 1 },
    execFileSync: () => {
      const err = new Error("probe boom");
      err.status = 1;
      throw err;
    },
    agent: async () => {
      throw new Error("agent must not run when the probe fails");
    },
  });
  try {
    expect(result.report_path).toBe(path.join(tmp, "ai/curaos/docs/grills/issue-317-codegen-pr246.md"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
