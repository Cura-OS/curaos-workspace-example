// scripts/lib/workflow-git.test.js
// RP-30: deterministic pointer-bump helper. Fixtures: three bare remotes
// (top -> mid -> leaf) plus a recursive working clone; a second leaf clone
// plays the merged-PR role by advancing leaf's origin default branch.
// Runner: bun test (just ci picks up scripts/lib/*.test.js).
// Note: config rides per-repo (git config --local) and per-command (-c),
// never env vars: bun's execFileSync without an explicit env option does not
// see runtime process.env mutations, so GIT_CONFIG_GLOBAL would be ignored
// by the git processes the helper under test spawns.
const { test, expect, beforeAll, afterAll } = require("bun:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const wg = require("./workflow-git.js");

let tmp;
let leafRemote;
let midRemote;
let topRemote;
let work;
let leafDev;
let noHooks;

function git(cwd, args) {
  return execFileSync("git", ["-c", "protocol.file.allow=always", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// Hermetic per-repo config: identity, no signing, hooks isolated from any
// user-level core.hooksPath.
function prep(repo) {
  git(repo, ["config", "user.name", "RP30 Test"]);
  git(repo, ["config", "user.email", "rp30@test.invalid"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  git(repo, ["config", "core.hooksPath", noHooks]);
}

function commitFile(repo, name, content, message) {
  fs.writeFileSync(path.join(repo, name), content);
  git(repo, ["add", name]);
  git(repo, ["commit", "-m", message]);
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-git-rp30-"));
  noHooks = path.join(tmp, "no-hooks");
  fs.mkdirSync(noHooks);

  leafRemote = path.join(tmp, "leaf.git");
  midRemote = path.join(tmp, "mid.git");
  topRemote = path.join(tmp, "top.git");
  for (const remote of [leafRemote, midRemote, topRemote]) git(tmp, ["init", "--bare", "-b", "main", remote]);

  const leafSeed = path.join(tmp, "leaf-seed");
  git(tmp, ["clone", leafRemote, leafSeed]);
  prep(leafSeed);
  git(leafSeed, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  commitFile(leafSeed, "a.txt", "a\n", "feat: seed leaf");
  git(leafSeed, ["push", "origin", "HEAD:main"]);

  const midSeed = path.join(tmp, "mid-seed");
  git(tmp, ["clone", midRemote, midSeed]);
  prep(midSeed);
  git(midSeed, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(midSeed, ["submodule", "add", leafRemote, "leaf"]);
  git(midSeed, ["commit", "-m", "feat: add leaf submodule"]);
  git(midSeed, ["push", "origin", "HEAD:main"]);

  const topSeed = path.join(tmp, "top-seed");
  git(tmp, ["clone", topRemote, topSeed]);
  prep(topSeed);
  git(topSeed, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(topSeed, ["submodule", "add", midRemote, "mid"]);
  git(topSeed, ["commit", "-m", "feat: add mid submodule"]);
  git(topSeed, ["push", "origin", "HEAD:main"]);

  work = path.join(tmp, "work");
  git(tmp, ["clone", "--recurse-submodules", topRemote, work]);
  prep(work);
  prep(path.join(work, "mid"));
  prep(path.join(work, "mid", "leaf"));

  leafDev = path.join(tmp, "leaf-dev");
  git(tmp, ["clone", leafRemote, leafDev]);
  prep(leafDev);
});

afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test("two-level pointer bump pins verified ancestors at both levels", () => {
  commitFile(leafDev, "b.txt", "b\n", "feat: advance leaf");
  git(leafDev, ["push", "origin", "HEAD:main"]);
  const leafTip = git(leafDev, ["rev-parse", "HEAD"]);

  const result = wg.bumpPointerChain(work, ["mid", "leaf"]);
  expect(result.reason).toBe("");
  expect(result.ok).toBe(true);
  expect(result.levels.length).toBe(2);

  // Deep level: mid pins leaf's new origin tip and pushed the bump commit.
  const midWork = path.join(work, "mid");
  expect(git(midWork, ["rev-parse", "HEAD:leaf"])).toBe(leafTip);
  expect(result.levels[1].sha).toBe(leafTip);
  expect(result.levels[1].committed).toBe(true);
  expect(result.levels[1].pushed).toBe(true);
  // rev-list verification: pinned gitlink is an ancestor of leaf origin/main.
  expect(git(path.join(midWork, "leaf"), ["rev-list", "--count", `origin/main..${leafTip}`])).toBe("0");

  // Top level: work pins mid's pushed bump commit; top commit stays local.
  const midTip = git(midRemote, ["rev-parse", "main"]);
  const pinnedMid = git(work, ["rev-parse", "HEAD:mid"]);
  expect(pinnedMid).toBe(midTip);
  expect(result.levels[0].committed).toBe(true);
  expect(result.levels[0].pushed).toBe(false);
  // rev-list verification at the top level too.
  expect(git(midWork, ["rev-list", "--count", `origin/main..${pinnedMid}`])).toBe("0");
});

test("stale-HEAD-without-fetch scenario is caught before anything is staged", () => {
  commitFile(leafDev, "c.txt", "c\n", "feat: advance leaf again");
  git(leafDev, ["push", "origin", "HEAD:main"]);

  const midWork = path.join(work, "mid");
  const before = git(midWork, ["rev-parse", "HEAD:leaf"]);
  // Direct single-level bump with NO fetch: local origin/main is stale.
  const result = wg.bumpSubmodulePointer(midWork, "leaf");
  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/stale origin\/main/);
  expect(result.reason).toMatch(/fetch every level/);
  // Nothing moved: pinned gitlink unchanged.
  expect(git(midWork, ["rev-parse", "HEAD:leaf"])).toBe(before);
});

test("chain run fetches all levels first and repairs the stale scenario; rerun is a no-op", () => {
  const result = wg.bumpPointerChain(work, ["mid", "leaf"]);
  expect(result.reason).toBe("");
  expect(result.ok).toBe(true);
  const leafTip = git(leafDev, ["rev-parse", "HEAD"]);
  expect(git(path.join(work, "mid"), ["rev-parse", "HEAD:leaf"])).toBe(leafTip);

  const rerun = wg.bumpPointerChain(work, ["mid", "leaf"]);
  expect(rerun.reason).toBe("");
  expect(rerun.ok).toBe(true);
  expect(rerun.levels[0].committed).toBe(false);
  expect(rerun.levels[1].committed).toBe(false);
});

test("refuses to bump across local-only commits in an intermediate level", () => {
  const midWork = path.join(work, "mid");
  commitFile(midWork, "local.txt", "local\n", "feat: local-only mid commit");
  const result = wg.bumpPointerChain(work, ["mid", "leaf"]);
  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/local commit/);
  expect(result.reason).toMatch(/refusing to discard/);
  // Cleanup: drop the local-only commit.
  git(midWork, ["checkout", "--detach", "origin/main"]);
});
