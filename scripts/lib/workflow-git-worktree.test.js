#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { isolatedLaneWorktreePath, safeWorktreeSlug } = require("./workflow-git.js");

test("workflow git helper derives isolated lane worktree paths safely", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-git-path-"));
  const slug = safeWorktreeSlug("your-org/curaos#123");
  assert.equal(slug, "cura-care-oriented-stack-curaos-123");
  assert.equal(
    isolatedLaneWorktreePath({ issue: "your-org/curaos#123", branch: "feat/cura-care-oriented-stack-curaos-123", repoRoot: root }),
    path.join(root, ".worktrees", "feat-cura-care-oriented-stack-curaos-123"),
  );
});

test("workflow git helper creates an isolated lane worktree from remote default", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-git-isolated-"));
  const remote = path.join(tmp, "remote.git");
  const primary = path.join(tmp, "primary");
  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  execFileSync("git", ["clone", remote, primary], { stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: primary });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: primary });
  fs.writeFileSync(path.join(primary, "README.md"), "hello\n");
  execFileSync("git", ["add", "README.md"], { cwd: primary });
  execFileSync("git", ["commit", "-m", "init"], { cwd: primary, stdio: "ignore" });
  execFileSync("git", ["branch", "-M", "main"], { cwd: primary });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: primary, stdio: "ignore" });
  execFileSync("git", ["remote", "set-head", "origin", "main"], { cwd: primary });

  const { createIsolatedLaneWorktree } = require("./workflow-git.js");
  const result = createIsolatedLaneWorktree({
    issue: "owner/repo#7",
    branch: "feat/owner-repo-7",
    repoRoot: primary,
    minFreeKb: 1,
  });

  assert.equal(result.branch, "feat/owner-repo-7");
  assert.equal(fs.existsSync(path.join(result.path, "README.md")), true);
  assert.equal(execFileSync("git", ["branch", "--show-current"], { cwd: result.path, encoding: "utf8" }).trim(), "feat/owner-repo-7");
});
