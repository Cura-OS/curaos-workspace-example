#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { evaluateSpeedup, readTimingJsonl, summarizeTimingRecords } = require("./check-workflow-speedup.js");

function writeJsonl(rows) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-speedup-"));
  const file = path.join(tmp, "timings.jsonl");
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return file;
}

test("summarizes workflow timing JSONL by workflow and phase", () => {
  const file = writeJsonl([
    { workflow: "pr-verify-merge", phase: "local-gate", duration_ms: 100, status: "ok" },
    { workflow: "pr-verify-merge", phase: "local-gate", duration_ms: 300, status: "ok" },
    { workflow: "pr-verify-merge", phase: "grill", duration_ms: 900, status: "failed" },
  ]);

  const summary = summarizeTimingRecords(readTimingJsonl(file));

  assert.equal(summary.total_duration_ms, 1300);
  assert.equal(summary.by_phase["pr-verify-merge:local-gate"].count, 2);
  assert.equal(summary.by_phase["pr-verify-merge:local-gate"].avg_duration_ms, 200);
  assert.equal(summary.by_phase["pr-verify-merge:grill"].failed, 1);
});

test("evaluates the required two-times speedup against a baseline", () => {
  assert.deepEqual(evaluateSpeedup({ baselineMs: 1200, actualMs: 500, requiredSpeedup: 2 }), {
    ok: true,
    speedup: 2.4,
    required_speedup: 2,
  });
  assert.deepEqual(evaluateSpeedup({ baselineMs: 1200, actualMs: 800, requiredSpeedup: 2 }), {
    ok: false,
    speedup: 1.5,
    required_speedup: 2,
  });
});

test("malformed timing JSONL fails closed", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-speedup-"));
  const file = path.join(tmp, "bad.jsonl");
  fs.writeFileSync(file, "{\"workflow\":\"x\"}\nnot-json\n");

  assert.throws(() => readTimingJsonl(file), /malformed timing jsonl/);
});
