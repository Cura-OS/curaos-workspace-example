#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const audit = require("./symphony-source-audit.js");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "symphony-source-audit-"));
}

function write(root, rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function git(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

test("discovers persistent workflow .mjs and .workflow.ts sources while skipping generated sandboxes", () => {
  const root = tempRoot();
  try {
    write(root, "scripts/persisted-orchestrator.mjs", "// workflow-run adapter\n");
    write(root, "curaos/backend/services/workflow-core-service/src/temporal/example.workflow.ts", "export async function exampleWorkflow() {}\n");
    write(root, "curaos/.stryker-tmp/sandbox/scripts/persisted-orchestrator.mjs", "// workflow-run stale sandbox\n");
    write(root, ".worktrees/lane/curaos/backend/services/workflow-core-service/src/temporal/example.workflow.ts", "export async function staleWorkflow() {}\n");
    write(root, ".claude/worktrees/lane/scripts/workflows/stale.workflow.js", "// workflow-run stale lane\n");

    const rels = audit.discoverPersistentWorkflowSourceFiles(root).map((file) => path.relative(root, file));

    assert.deepEqual(rels.sort(), [
      "curaos/backend/services/workflow-core-service/src/temporal/example.workflow.ts",
      "scripts/persisted-orchestrator.mjs",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("discovers tracked and untracked audit files across root and nested git repos", () => {
  const root = tempRoot();
  try {
    git(root, ["init"]);
    write(root, "scripts/workflows/tracked.workflow.js", "// workflow-run tracked\n");
    write(root, "docs/agents/workflows/untracked.md", "# Untracked playbook\n");
    git(root, ["add", "scripts/workflows/tracked.workflow.js"]);

    const nested = path.join(root, "curaos");
    fs.mkdirSync(nested, { recursive: true });
    git(nested, ["init"]);
    write(root, "curaos/scripts/untracked-orchestration.mjs", "// Symphony runner adapter\n");
    write(root, "curaos/backend/services/workflow-core-service/src/temporal/tracked.workflow.ts", "export async function trackedWorkflow() {}\n");
    git(nested, ["add", "backend/services/workflow-core-service/src/temporal/tracked.workflow.ts"]);

    const rels = audit.discoverWorkspaceAuditFiles(root).map((file) => path.relative(root, file));

    assert.deepEqual(rels.sort(), [
      "curaos/backend/services/workflow-core-service/src/temporal/tracked.workflow.ts",
      "curaos/scripts/untracked-orchestration.mjs",
      "docs/agents/workflows/untracked.md",
      "scripts/workflows/tracked.workflow.js",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("flags unicode dashes in tracked and untracked markdown and workflow scripts", () => {
  const root = tempRoot();
  try {
    git(root, ["init"]);
    write(root, "docs/agents/workflows/tracked.md", "# Workflow\nBad \u2014 dash\n");
    write(root, "scripts/workflows/untracked.workflow.js", "// workflow-run \u2013 bad\n");
    git(root, ["add", "docs/agents/workflows/tracked.md"]);

    const result = audit.auditWorkspaceFiles({ root });

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.problems.map((problem) => `${problem.file}:${problem.rule}`).sort(),
      [
        "docs/agents/workflows/tracked.md:no-unicode-dash",
        "scripts/workflows/untracked.workflow.js:no-unicode-dash",
      ],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("flags unicode dashes in persistent workflow TypeScript and MJS source", () => {
  const root = tempRoot();
  try {
    write(root, "scripts/persisted-orchestrator.mjs", "const note = `Agent workflow \u2014 bad`;\n");
    write(root, "curaos/backend/services/workflow-core-service/src/temporal/patient.workflow.ts", "// Step 1 \u2013 bad\nexport async function patientWorkflow() {}\n");

    const result = audit.auditPersistentWorkflowSources({ root });

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.problems.map((problem) => `${problem.file}:${problem.rule}`).sort(),
      [
        "curaos/backend/services/workflow-core-service/src/temporal/patient.workflow.ts:no-unicode-dash",
        "scripts/persisted-orchestrator.mjs:no-unicode-dash",
      ],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("flags agent orchestration source that reintroduces blocked tracker policy", () => {
  const root = tempRoot();
  try {
    const blockedTracker = ["Lin", "ear"].join("");
    write(
      root,
      "scripts/persisted-orchestrator.mjs",
      `// Symphony agent workflow tracker adapter: ${blockedTracker}\nexport const tracker = '${blockedTracker}';\n`,
    );

    const result = audit.auditPersistentWorkflowSources({ root });

    assert.equal(result.ok, false);
    assert.equal(result.problems[0].rule, "no-linear-agent-tracker");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("accepts current source after replacing unicode dashes and keeping GitHub tracker explicit", () => {
  const root = tempRoot();
  try {
    write(
      root,
      "scripts/persisted-orchestrator.mjs",
      "// Symphony agent workflow tracker adapter: GitHub, sync explicit-only\nexport const tracker = 'GitHub';\n",
    );
    write(root, "curaos/backend/services/workflow-core-service/src/temporal/patient.workflow.ts", "// Step 1 - ok\nexport async function patientWorkflow() {}\n");

    const result = audit.auditPersistentWorkflowSources({ root });

    assert.equal(result.ok, true);
    assert.equal(result.problems.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
