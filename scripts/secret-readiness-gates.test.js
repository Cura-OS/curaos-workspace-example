// scripts/secret-readiness-gates.test.js
// Regression guards for workspace-level PHI/secret readiness plumbing.
// Runner: bun test scripts/*.test.js (via `just test-js`).
const { test, expect } = require("bun:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function nonEmptyTrimmedLines(relativePath) {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

test("workspace lefthook gitleaks hook uses the modern staged scan command", () => {
  const lefthook = fs.readFileSync(path.join(root, "lefthook.yml"), "utf8");
  expect(lefthook).toContain("gitleaks git --staged --redact");
  expect(lefthook).not.toMatch(/run:\s*gitleaks (detect|protect) --staged/);
});

test("workspace .gitignore keeps local scratch artifacts out of accidental staging", () => {
  expect(nonEmptyTrimmedLines(".gitignore")).toContain(".scratch/");
});
