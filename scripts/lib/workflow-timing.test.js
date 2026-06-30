#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { classifyWorkflowError, createWorkflowTimer } = require("./workflow-timing.js");

test("workflow timer records successful phases as append-only JSONL", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-timing-"));
  const outputPath = path.join(tmp, "timings.jsonl");
  const ticks = [1000, 1350];
  const timer = createWorkflowTimer({
    workflow: "pr-verify-merge",
    subject: "owner/repo#7",
    outputPath,
    nowMs: () => ticks.shift(),
  });

  const result = await timer.phase("local-gate", async () => "ok", {
    headSha: "a".repeat(40),
    idleReason: "none",
  });

  assert.equal(result, "ok");
  const rows = fs.readFileSync(outputPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workflow, "pr-verify-merge");
  assert.equal(rows[0].subject, "owner/repo#7");
  assert.equal(rows[0].phase, "local-gate");
  assert.equal(rows[0].head_sha, "a".repeat(40));
  assert.equal(rows[0].duration_ms, 350);
  assert.equal(rows[0].status, "ok");
  assert.equal(rows[0].idle_reason, "none");
});

test("workflow timer records failed phases and rethrows the original error", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-timing-"));
  const outputPath = path.join(tmp, "timings.jsonl");
  const ticks = [2000, 2300];
  const timer = createWorkflowTimer({
    workflow: "milestone-wave",
    subject: "active",
    outputPath,
    nowMs: () => ticks.shift(),
  });
  const error = new Error("GraphQL quota exhausted");

  await assert.rejects(
    () => timer.phase("project-scan", async () => {
      throw error;
    }),
    error,
  );

  const row = JSON.parse(fs.readFileSync(outputPath, "utf8").trim());
  assert.equal(row.status, "failed");
  assert.equal(row.duration_ms, 300);
  assert.equal(row.error_class, "github-quota");
});

test("workflow error classifier groups idle and external wait causes", () => {
  assert.equal(classifyWorkflowError(new Error("GraphQL quota exhausted")), "github-quota");
  assert.equal(classifyWorkflowError(new Error("blocked-harness-unavailable")), "harness-unavailable");
  assert.equal(classifyWorkflowError(new Error("review-settle wait timeout")), "external-review-wait");
  assert.equal(classifyWorkflowError(new Error("other")), "unknown");
});
