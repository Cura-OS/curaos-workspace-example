#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("check-docs runs the Symphony conformance gate after workflow sync", () => {
  const script = fs.readFileSync(path.resolve(__dirname, "check-docs.sh"), "utf8");
  const workflowSync = script.indexOf("node scripts/check-workflow-sync.js");
  const conformance = script.indexOf("node scripts/check-symphony-conformance.js");
  const sourceAudit = script.indexOf("node scripts/check-symphony-source-audit.js");
  assert.notEqual(workflowSync, -1, "check-docs must still run workflow sync");
  assert.notEqual(conformance, -1, "check-docs must run Symphony conformance");
  assert.notEqual(sourceAudit, -1, "check-docs must run persistent workflow source audit");
  assert.ok(conformance > workflowSync, "Symphony conformance should run after workflow sync");
  assert.ok(sourceAudit > conformance, "persistent source audit should run after Symphony conformance");
});
