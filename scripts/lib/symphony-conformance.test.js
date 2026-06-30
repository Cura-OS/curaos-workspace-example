#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const conformance = require("./symphony-conformance.js");

const FULL_MAPPING = `---
name: fixture-flow
kind: atomic
version: 0.1.0
inputs: {}
outputs: {}
guarantees:
  idempotent: true
verification: T1
composes: []
symphony:
  tracker_adapter: github-explicit-sync
  trigger_mode: manual-orchestrator
  workspace_owner: workflow-owned-root
  workspace_lifecycle: local-state-retention
  hooks: workflow-defined
  agent_runner: [claude-workflow, agent-workflow-kit, hermes-native, codex-adapter, generic-playbook]
  prompt_inputs: contract-inputs
  strict_rendering: fail-closed
  state_model: local-sqlite-issue-plus-run-state-plus-github-labels
  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite
  retry_reconcile: executor-defined
  observability: local-events-evidence-and-logs
  safety_posture: curaos-t1-t2-t3
  github_sync: explicit-checkpoint-only
  validation: contract-verification-plus-closeout
  tdd_evidence: required-for-script-code-changes
---
# fixture-flow
`;

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "symphony-conf-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs/agents/workflows"), { recursive: true });
  return root;
}

function writePlaybook(root, name, content) {
  fs.writeFileSync(path.join(root, "docs/agents/workflows", `${name}.md`), content);
}

test("validatePlaybook accepts complete Symphony mapping and parses runner adapters", (t) => {
  const root = tempRoot(t);
  writePlaybook(root, "fixture-flow", FULL_MAPPING);

  const result = conformance.validatePlaybook(path.join(root, "docs/agents/workflows/fixture-flow.md"));

  assert.equal(result.ok, true, result.problems.join("\n"));
  assert.deepEqual(result.mapping.agent_runner, ["claude-workflow", "agent-workflow-kit", "hermes-native", "codex-adapter", "generic-playbook"]);
});

test("validatePlaybook fails closed on missing local_issue_db and TDD evidence mapping", (t) => {
  const root = tempRoot(t);
  const broken = FULL_MAPPING
    .replace("  local_issue_db: .scratch/state/symphony-work/local-issues.sqlite\n", "")
    .replace("  tdd_evidence: required-for-script-code-changes\n", "");
  writePlaybook(root, "fixture-flow", broken);

  const result = conformance.validatePlaybook(path.join(root, "docs/agents/workflows/fixture-flow.md"));

  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /missing symphony.local_issue_db/);
  assert.match(result.problems.join("\n"), /missing symphony.tdd_evidence/);
});

test("validatePlaybook rejects unknown runner adapters and non-explicit GitHub sync", (t) => {
  const root = tempRoot(t);
  const broken = FULL_MAPPING
    .replace("hermes-native", "mystery-runner")
    .replace("explicit-checkpoint-only", "heartbeat-sync");
  writePlaybook(root, "fixture-flow", broken);

  const result = conformance.validatePlaybook(path.join(root, "docs/agents/workflows/fixture-flow.md"));

  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /unknown symphony.agent_runner/);
  assert.match(result.problems.join("\n"), /github_sync must be explicit-checkpoint-only/);
});

test("checkAll skips README and HIERARCHY-DESIGN while reporting all reusable playbook problems", (t) => {
  const root = tempRoot(t);
  writePlaybook(root, "fixture-flow", FULL_MAPPING);
  writePlaybook(root, "broken-flow", FULL_MAPPING.replace("  workspace_owner: workflow-owned-root\n", ""));
  fs.writeFileSync(path.join(root, "docs/agents/workflows/README.md"), "# readme\n");
  fs.writeFileSync(path.join(root, "docs/agents/workflows/HIERARCHY-DESIGN.md"), "# design\n");

  const result = conformance.checkAll(root);

  assert.equal(result.ok, false);
  assert.deepEqual(result.results.map((row) => row.name).sort(), ["broken-flow", "fixture-flow"]);
  assert.match(result.problems.join("\n"), /broken-flow.md: missing symphony.workspace_owner/);
});

test("check-symphony-conformance CLI emits JSON and performs zero GitHub calls", (t) => {
  const root = tempRoot(t);
  writePlaybook(root, "fixture-flow", FULL_MAPPING);
  const marker = path.join(root, "gh-called");
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "fake-gh-"));
  t.after(() => fs.rmSync(fakeBin, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fakeBin, "gh"), `#!/usr/bin/env bash\necho called > ${JSON.stringify(marker)}\nexit 64\n`);
  fs.chmodSync(path.join(fakeBin, "gh"), 0o755);

  const cli = path.resolve(__dirname, "../check-symphony-conformance.js");
  const result = spawnSync(process.execPath, [cli, "--root", root, "--json"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.equal(fs.existsSync(marker), false, "conformance checker must not call gh");
});
