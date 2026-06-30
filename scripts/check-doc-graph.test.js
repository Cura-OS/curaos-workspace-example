#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const sourceScriptPath = path.join(__dirname, "check-doc-graph.js");

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function initWorkspace(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "doc-graph-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  writeFile(tempRoot, "scripts/check-doc-graph.js", fs.readFileSync(sourceScriptPath, "utf8"));
  writeFile(tempRoot, "AGENTS.md", "# Workspace Root\n\nRoot graph node.\n");
  writeFile(tempRoot, "ai/curaos/AGENTS.md", "# Repo Contract\n\n[Workspace](../../AGENTS.md)\n");
  writeFile(tempRoot, "ai/curaos/docs/README.md", "# Docs\n\n[Repo Contract](../AGENTS.md)\n");
  writeFile(tempRoot, "ai/curaos/docs/DOC-GRAPH.md", "# Existing Graph\n\nPreserve me.\n");

  execFileSync("git", ["init"], { cwd: tempRoot, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Codex Test"], { cwd: tempRoot, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "codex@example.com"], { cwd: tempRoot, stdio: "ignore" });

  return tempRoot;
}

function hasUnpopulatedSubmodules(root) {
  const result = spawnSync("git", ["submodule", "status", "--recursive"], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) return false;
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .some((line) => line.startsWith("-"));
}

test("check mode fails closed when a declared submodule is unpopulated", (t) => {
  const tempRoot = initWorkspace(t);

  writeFile(
    tempRoot,
    ".gitmodules",
    ['[submodule "curaos"]', "\tpath = curaos", "\turl = git@github.com:your-org/curaos.git", ""].join(
      "\n",
    ),
  );
  fs.mkdirSync(path.join(tempRoot, "curaos"), { recursive: true });

  const result = spawnSync("node", ["scripts/check-doc-graph.js"], {
    cwd: tempRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOC-GRAPH check blocked: unpopulated submodule/);
  assert.match(result.stderr, /git submodule update --init/);
});

test("write mode fails closed when a declared submodule is unpopulated", (t) => {
  const tempRoot = initWorkspace(t);

  writeFile(
    tempRoot,
    ".gitmodules",
    ['[submodule "curaos"]', "\tpath = curaos", "\turl = git@github.com:your-org/curaos.git", ""].join(
      "\n",
    ),
  );
  fs.mkdirSync(path.join(tempRoot, "curaos"), { recursive: true });

  const before = fs.readFileSync(path.join(tempRoot, "ai/curaos/docs/DOC-GRAPH.md"), "utf8");
  const result = spawnSync("node", ["scripts/check-doc-graph.js", "--write"], {
    cwd: tempRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOC-GRAPH write blocked: unpopulated submodule/);
  assert.match(result.stderr, /curaos/);
  assert.equal(fs.readFileSync(path.join(tempRoot, "ai/curaos/docs/DOC-GRAPH.md"), "utf8"), before);
});

test("write mode succeeds when the declared submodule tree is populated", (t) => {
  const tempRoot = initWorkspace(t);

  writeFile(
    tempRoot,
    ".gitmodules",
    ['[submodule "curaos"]', "\tpath = curaos", "\turl = git@github.com:your-org/curaos.git", ""].join(
      "\n",
    ),
  );
  writeFile(tempRoot, "curaos/.git", "gitdir: ../.git/modules/curaos\n");
  writeFile(tempRoot, "curaos/README.md", "# CuraOS\n\n[Workspace](../AGENTS.md)\n");

  const result = spawnSync("node", ["scripts/check-doc-graph.js", "--write"], {
    cwd: tempRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /wrote ai\/curaos\/docs\/DOC-GRAPH\.md/);

  const graph = fs.readFileSync(path.join(tempRoot, "ai/curaos/docs/DOC-GRAPH.md"), "utf8");
  assert.match(graph, /Nodes: 4/);
  assert.match(graph, /\| \[curaos\/README\.md\]/);
});

test("write mode succeeds when a declared submodule has a .git marker but no README", (t) => {
  const tempRoot = initWorkspace(t);

  writeFile(
    tempRoot,
    ".gitmodules",
    ['[submodule "curaos"]', "\tpath = curaos", "\turl = git@github.com:your-org/curaos.git", ""].join(
      "\n",
    ),
  );
  writeFile(tempRoot, "curaos/.git", "gitdir: ../.git/modules/curaos\n");

  const result = spawnSync("node", ["scripts/check-doc-graph.js", "--write"], {
    cwd: tempRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /wrote ai\/curaos\/docs\/DOC-GRAPH\.md/);

  const graph = fs.readFileSync(path.join(tempRoot, "ai/curaos/docs/DOC-GRAPH.md"), "utf8");
  assert.match(graph, /Nodes: 3/);
  assert.doesNotMatch(graph, /curaos\/README\.md/);
});

test("workspace script stays green in the populated checkout", () => {
  if (hasUnpopulatedSubmodules(repoRoot)) return;

  const result = spawnSync("node", ["scripts/check-doc-graph.js"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /doc graph ok/);
});
