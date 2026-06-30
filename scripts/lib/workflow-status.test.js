// scripts/lib/workflow-status.test.js
// RP-56 pilot: WORKFLOW-STATUS table parser + validator + live-table check.
// Runner: bun test (just test-js globs scripts/lib/*.test.js).
// The live-table block is the in-suite gate: docs/agents/WORKFLOW-STATUS.md
// must carry one valid row per committed executor in scripts/workflows/.
// The stale-ok acceptance (open workflow-defect issue + "ok" row fails) is
// covered here at the unit level AND queued for scripts/workflow-truth-contract.test.js
// (integration-queue rp-56) since that file belongs to another lane.
const { test, expect } = require("bun:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseStatus,
  parseWorkflowStatusTable,
  validateWorkflowStatus,
} = require("./workflow-status.js");

const root = path.resolve(__dirname, "..", "..");
const tablePath = path.join(root, "docs/agents/WORKFLOW-STATUS.md");
const executorDir = path.join(root, "scripts/workflows");

function liveExecutors() {
  return fs
    .readdirSync(executorDir)
    .filter((f) => f.endsWith(".workflow.js"))
    .map((f) => f.replace(/\.workflow\.js$/, ""))
    .sort();
}

function table(rows) {
  return [
    "| Workflow | Status | Last verified | Notes |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");
}

const URL_A = "https://github.com/your-org/curaos-ai-workspace/issues/508";

// ── parseStatus ──────────────────────────────────────────────────────────────

test("parseStatus accepts the three-status grammar and rejects everything else", () => {
  expect(parseStatus("ok")).toEqual({ kind: "ok", url: null });
  expect(parseStatus(`degraded:${URL_A}`)).toEqual({ kind: "degraded", url: URL_A });
  expect(parseStatus(`broken:${URL_A}`)).toEqual({ kind: "broken", url: URL_A });
  expect(parseStatus("broken").kind).toBe("broken");
  expect(parseStatus("`ok`").kind).toBe("ok");
  expect(parseStatus("OK").kind).toBe("invalid");
  expect(parseStatus("green").kind).toBe("invalid");
  expect(parseStatus("").kind).toBe("invalid");
  expect(parseStatus(undefined).kind).toBe("invalid");
});

// ── parseWorkflowStatusTable ─────────────────────────────────────────────────

test("parseWorkflowStatusTable parses rows, strips backticks, stops at table end", () => {
  const md = [
    "# heading",
    "",
    "prose before",
    "",
    table([
      "| `breakdown` | ok | 2026-06-10 | a note |",
      `| lens-review | degraded:${URL_A} | 2026-06-10 | |`,
    ]),
    "",
    "| stray | ok | 2026-06-10 | row after a break is NOT part of the table |",
  ].join("\n");
  const rows = parseWorkflowStatusTable(md);
  expect(rows.length).toBe(2);
  expect(rows[0]).toMatchObject({
    workflow: "breakdown",
    statusKind: "ok",
    defectIssueUrl: null,
    lastVerified: "2026-06-10",
    notes: "a note",
  });
  expect(rows[1]).toMatchObject({
    workflow: "lens-review",
    statusKind: "degraded",
    defectIssueUrl: URL_A,
  });
});

test("parseWorkflowStatusTable returns [] when no status table exists", () => {
  expect(parseWorkflowStatusTable("# nothing here")).toEqual([]);
  expect(parseWorkflowStatusTable("")).toEqual([]);
});

// ── validateWorkflowStatus ───────────────────────────────────────────────────

function rowsFor(md) {
  return parseWorkflowStatusTable(md);
}

test("a complete, defect-free table validates clean", () => {
  const rows = rowsFor(table(["| a | ok | 2026-06-10 | |", "| b | ok | 2026-06-10 | |"]));
  expect(validateWorkflowStatus(rows, { executors: ["a", "b"] })).toEqual([]);
});

test("RP-56 acceptance: an ok row for a workflow with an open defect issue fails stale-ok", () => {
  const rows = rowsFor(table(["| a | ok | 2026-06-10 | |"]));
  const violations = validateWorkflowStatus(rows, {
    executors: ["a"],
    openDefects: { a: URL_A },
  });
  expect(violations.map((v) => v.kind)).toEqual(["stale-ok"]);
  expect(violations[0].message).toContain(URL_A);
});

test("an authoritative defect set fails degraded/broken rows whose defect is closed", () => {
  const rows = rowsFor(table([`| a | degraded:${URL_A} | 2026-06-10 | |`]));
  // Non-authoritative (no live query ran): row is trusted.
  expect(validateWorkflowStatus(rows, { executors: ["a"] })).toEqual([]);
  // Authoritative empty set: the closeout forgot to flip the row back.
  const violations = validateWorkflowStatus(rows, {
    executors: ["a"],
    openDefects: {},
    defectsAuthoritative: true,
  });
  expect(violations.map((v) => v.kind)).toEqual(["stale-defect"]);
});

test("degraded/broken rows require a full GitHub issue URL", () => {
  const rows = rowsFor(
    table([
      "| a | degraded:#508 | 2026-06-10 | |",
      "| b | broken | 2026-06-10 | |",
    ]),
  );
  const kinds = validateWorkflowStatus(rows, { executors: ["a", "b"] }).map((v) => v.kind);
  expect(kinds).toEqual(["missing-defect-url", "missing-defect-url"]);
});

test("missing executors, unknown rows, duplicates, bad status, bad date all fail", () => {
  const rows = rowsFor(
    table([
      "| ghost | ok | 2026-06-10 | no executor file |",
      "| dup | ok | 2026-06-10 | |",
      "| dup | ok | 2026-06-10 | duplicate |",
      "| bad-status | green | 2026-06-10 | |",
      "| bad-date | ok | June 10 | |",
    ]),
  );
  const violations = validateWorkflowStatus(rows, {
    executors: ["missing-executor", "dup", "bad-status", "bad-date"],
  });
  const kinds = violations.map((v) => v.kind).sort();
  expect(kinds).toEqual(
    [
      "duplicate-row",
      "invalid-date",
      "invalid-status",
      "missing-row",
      "unknown-workflow",
    ].sort(),
  );
});

// ── live table gate ──────────────────────────────────────────────────────────

test("live WORKFLOW-STATUS.md covers every committed executor with valid rows", () => {
  const executors = liveExecutors();
  expect(executors.length).toBeGreaterThan(0);
  const rows = parseWorkflowStatusTable(fs.readFileSync(tablePath, "utf8"));
  const violations = validateWorkflowStatus(rows, { executors });
  expect(violations).toEqual([]);
  expect(rows.map((r) => r.workflow).sort()).toEqual(executors);
});

// ── standalone checker CLI ───────────────────────────────────────────────────

function runChecker(args) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(root, "scripts/check-workflow-status.js"), ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      code: error.status,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

test("check-workflow-status.js exits 0 against the live tree", () => {
  const result = runChecker([]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("workflow status ok");
});

test("check-workflow-status.js exits 1 with stale-ok when a defect set names an ok workflow", () => {
  const executors = liveExecutors();
  const defectsFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "rp56-")),
    "defects.json",
  );
  fs.writeFileSync(defectsFile, JSON.stringify({ [executors[0]]: URL_A }));
  const result = runChecker(["--defects-json", defectsFile]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("stale-ok");
  expect(result.stderr).toContain(executors[0]);
});
