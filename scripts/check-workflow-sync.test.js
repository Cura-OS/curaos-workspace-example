#!/usr/bin/env node
// Fixture tests for the check-workflow-sync gate, focused on the RP-19 reverse pass:
// every scripts/workflows/*.workflow.js executor needs a paired playbook at
// docs/agents/workflows/<name>.md OR an explicit INTERNAL_EXECUTORS allowlist entry.
// Run: node scripts/check-workflow-sync.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const sourceScriptPath = path.join(__dirname, "check-workflow-sync.js");
const gateSource = fs.readFileSync(sourceScriptPath, "utf8");

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

// Copy the gate into a temp root so its __dirname-relative root resolution points at the fixture.
// `allowlist` entries replace the copied source's INTERNAL_EXECUTORS set. The committed gate keeps
// the allowlist in-file, but fixtures must stay isolated from production internal executors.
function initFixture(t, { allowlist = [] } = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-sync-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  let source = gateSource;
  const pattern = /const INTERNAL_EXECUTORS = new Set\(\[[\s\S]*?\]\);/;
  assert.ok(pattern.test(source), "INTERNAL_EXECUTORS Set marker must exist in the gate source");
  source = source.replace(pattern, `const INTERNAL_EXECUTORS = new Set(${JSON.stringify(allowlist)});`);
  writeFile(tempRoot, "scripts/check-workflow-sync.js", source);
  return tempRoot;
}

function runGate(root) {
  return spawnSync("node", ["scripts/check-workflow-sync.js"], { cwd: root, encoding: "utf8" });
}

const FIXTURE_EXECUTOR = `export const meta = { name: "fixture-scan", phases: [] };
const CONTRACT = {
  name: "fixture-scan",
  kind: "atomic",
  version: "0.1.0",
  inputs: {},
  outputs: {},
  guarantees: { idempotent: true },
  verification: "T1",
  composes: [],
};
export default async function workflow() { return {}; }
`;

const FIXTURE_PLAYBOOK = `---
name: fixture-scan
kind: atomic
version: 0.1.0
inputs:
outputs:
guarantees:
  idempotent: true
verification: T1
composes: []
---

# fixture-scan
`;

test("reverse pass: executor with neither playbook nor allowlist entry fails the gate", (t) => {
  const root = initFixture(t);
  writeFile(root, "scripts/workflows/fixture-scan.workflow.js", FIXTURE_EXECUTOR);
  fs.mkdirSync(path.join(root, "docs/agents/workflows"), { recursive: true });
  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture-scan\.workflow\.js: executor has NO playbook/);
  assert.match(result.stderr, /NO INTERNAL_EXECUTORS allowlist entry/);
});

test("reverse pass: executors exist but the playbook dir is missing entirely - still fails (no fail-open)", (t) => {
  const root = initFixture(t);
  writeFile(root, "scripts/workflows/fixture-scan.workflow.js", FIXTURE_EXECUTOR);
  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /executor has NO playbook/);
});

test("pairing: executor + matching playbook passes", (t) => {
  const root = initFixture(t);
  writeFile(root, "scripts/workflows/fixture-scan.workflow.js", FIXTURE_EXECUTOR);
  writeFile(root, "docs/agents/workflows/fixture-scan.md", FIXTURE_PLAYBOOK);
  const result = runGate(root);
  assert.equal(result.status, 0, `expected green gate, got:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /workflow-sync ok: fixture-scan/);
  assert.match(result.stdout, /1 in sync, 0 problem\(s\)/);
});

test("reverse pass: allowlisted executor without playbook passes and is reported as internal", (t) => {
  const root = initFixture(t, { allowlist: ["fixture-scan"] });
  writeFile(root, "scripts/workflows/fixture-scan.workflow.js", FIXTURE_EXECUTOR);
  fs.mkdirSync(path.join(root, "docs/agents/workflows"), { recursive: true });
  const result = runGate(root);
  assert.equal(result.status, 0, `expected green gate, got:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /fixture-scan \(internal executor, allowlisted - no playbook required\)/);
});

test("reverse pass: allowlist entry alongside an existing playbook is stale and fails", (t) => {
  const root = initFixture(t, { allowlist: ["fixture-scan"] });
  writeFile(root, "scripts/workflows/fixture-scan.workflow.js", FIXTURE_EXECUTOR);
  writeFile(root, "docs/agents/workflows/fixture-scan.md", FIXTURE_PLAYBOOK);
  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale allowlist entry/);
});

test("reverse pass: allowlist entry naming a non-existent executor fails", (t) => {
  const root = initFixture(t, { allowlist: ["ghost-executor"] });
  writeFile(root, "scripts/workflows/fixture-scan.workflow.js", FIXTURE_EXECUTOR);
  writeFile(root, "docs/agents/workflows/fixture-scan.md", FIXTURE_PLAYBOOK);
  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /INTERNAL_EXECUTORS entry "ghost-executor" names no existing executor/);
});

test("forward pass still binds: playbook whose executor lacks a CONTRACT fails", (t) => {
  const root = initFixture(t);
  writeFile(
    root,
    "scripts/workflows/fixture-scan.workflow.js",
    'export const meta = { name: "fixture-scan", phases: [] };\nexport default async function workflow() { return {}; }\n',
  );
  writeFile(root, "docs/agents/workflows/fixture-scan.md", FIXTURE_PLAYBOOK);
  const result = runGate(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no `export const CONTRACT = \{\.\.\.\}`/);
});

test("empty tree (no playbooks, no executors) is the only green no-op", (t) => {
  const root = initFixture(t);
  const result = runGate(root);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no workflow playbooks or executors yet - nothing to check/);
});
