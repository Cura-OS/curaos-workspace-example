#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateSemgrepJson,
  findingTouchesChangedLine,
  normalizeSeverity,
} = require("./local-review-signal.js");

test("local review signal treats unavailable Semgrep as advisory when not required", () => {
  const signal = evaluateSemgrepJson("", {
    required: false,
    changedLines: new Map(),
  });

  assert.equal(signal.verdict, "unavailable");
  assert.equal(signal.blocking, false);
  assert.equal(signal.findings.length, 0);
});

test("local review signal fails closed on malformed Semgrep output when required", () => {
  const signal = evaluateSemgrepJson("not-json", {
    required: true,
    changedLines: new Map(),
  });

  assert.equal(signal.verdict, "block");
  assert.equal(signal.blocking, true);
  assert.equal(signal.findings[0].severity, "critical");
});

test("high or critical Semgrep findings on changed lines block", () => {
  const semgrep = JSON.stringify({
    results: [
      {
        check_id: "typescript.express.security.audit",
        path: "src/app.ts",
        start: { line: 42 },
        extra: { severity: "ERROR", message: "unsafe request handling" },
      },
    ],
  });
  const changedLines = new Map([["src/app.ts", [{ start: 40, end: 45 }]]]);

  const signal = evaluateSemgrepJson(semgrep, { required: true, changedLines });

  assert.equal(signal.verdict, "block");
  assert.equal(signal.blocking, true);
  assert.equal(signal.findings[0].source, "semgrep");
});

test("low and medium Semgrep findings stay advisory", () => {
  const semgrep = JSON.stringify({
    results: [
      {
        check_id: "style.low",
        path: "src/app.ts",
        start: { line: 42 },
        extra: { severity: "INFO", message: "style issue" },
      },
    ],
  });
  const changedLines = new Map([["src/app.ts", [{ start: 40, end: 45 }]]]);

  const signal = evaluateSemgrepJson(semgrep, { required: true, changedLines });

  assert.equal(signal.verdict, "advisory");
  assert.equal(signal.blocking, false);
  assert.equal(normalizeSeverity("WARNING"), "medium");
  assert.equal(findingTouchesChangedLine({ path: "src/app.ts", line: 10 }, changedLines), false);
});
