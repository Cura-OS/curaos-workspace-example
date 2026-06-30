// scripts/lib/workspace-root.test.js
// RP-27: workspace-root resolution for artifact writers. Fixture: a workspace-shaped top repo
// (AGENTS.md + ai/ marker) with a submodule, plus a linked worktree of the top repo carrying its
// own submodule checkout (the nested-worktree case that previously escaped into git-invisible
// paths). Runner: bun test (just ci picks up scripts/lib/*.test.js).
const { test, expect, beforeAll, afterAll } = require("bun:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { resolveWorkspaceRoot, workspaceRootMarker } = require("./workspace-root.js");

let tmp;
let noHooks;
let subRemote;
let top;
let topSub;
let wt;
let wtSub;
let plainDir;

function git(cwd, args) {
  return execFileSync("git", ["-c", "protocol.file.allow=always", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// Hermetic per-repo config: identity, no signing, hooks isolated from any user-level
// core.hooksPath (global hooks made each fixture commit slow enough to trip the hook timeout).
function prep(repo) {
  git(repo, ["config", "user.name", "RP-27 Fixture"]);
  git(repo, ["config", "user.email", "rp27@example.invalid"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  git(repo, ["config", "core.hooksPath", noHooks]);
}

function real(p) {
  return fs.realpathSync(p);
}

let priorCeiling;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-root-"));
  // TMPDIR may live INSIDE a git checkout (codex grill round 3 ran with a
  // workspace-local TMPDIR and the plain-dir fallback test resolved the host
  // workspace root instead of startDir). Ceiling git discovery at the fixture
  // base: repos created UNDER tmp still resolve; nothing above tmp ever does.
  priorCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = tmp;
  noHooks = path.join(tmp, "no-hooks");
  fs.mkdirSync(noHooks);
  subRemote = path.join(tmp, "sub-remote.git");
  top = path.join(tmp, "top");
  wt = path.join(tmp, "wt");
  plainDir = path.join(tmp, "plain");
  fs.mkdirSync(plainDir, { recursive: true });

  // Bare submodule remote seeded via a throwaway clone.
  git(tmp, ["init", "--bare", "-b", "main", subRemote]);
  const seed = path.join(tmp, "seed");
  git(tmp, ["clone", subRemote, seed]);
  prep(seed);
  fs.writeFileSync(path.join(seed, "code.txt"), "code\n");
  git(seed, ["add", "code.txt"]);
  git(seed, ["commit", "-m", "test: seed submodule"]);
  git(seed, ["branch", "-M", "main"]);
  git(seed, ["push", "-u", "origin", "main"]);

  // Workspace-shaped top repo: AGENTS.md + ai/ marker + the submodule at code/.
  fs.mkdirSync(path.join(top, "ai"), { recursive: true });
  git(tmp, ["init", top]);
  prep(top);
  fs.writeFileSync(path.join(top, "AGENTS.md"), "# fixture workspace\n");
  fs.writeFileSync(path.join(top, "ai", ".keep"), "");
  git(top, ["add", "."]);
  git(top, ["commit", "-m", "test: workspace marker"]);
  git(top, ["submodule", "add", subRemote, "code"]);
  git(top, ["commit", "-m", "test: add submodule"]);
  topSub = path.join(top, "code");

  // Linked worktree of the workspace, with its own submodule checkout (the nested case).
  git(top, ["worktree", "add", "-b", "rp27-lane", wt]);
  git(wt, ["submodule", "update", "--init"]);
  wtSub = path.join(wt, "code");
});

afterAll(() => {
  if (priorCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = priorCeiling;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("marker accepts the workspace shape and rejects code-only checkouts", () => {
  expect(workspaceRootMarker(top)).toBe(true);
  expect(workspaceRootMarker(wt)).toBe(true);
  expect(workspaceRootMarker(topSub)).toBe(false);
  expect(workspaceRootMarker(plainDir)).toBe(false);
  expect(workspaceRootMarker("")).toBe(false);
});

test("resolves the workspace root from inside a submodule checkout", () => {
  expect(real(resolveWorkspaceRoot({}, topSub))).toBe(real(top));
});

test("resolves the linked worktree root from inside its nested submodule checkout", () => {
  // The nested-worktree acceptance case: a lane running inside wt/code must land on wt (its
  // tracked ai/ tree is git-visible on the lane branch), never escape via `../` into tmp.
  expect(real(resolveWorkspaceRoot({}, wtSub))).toBe(real(wt));
  expect(real(resolveWorkspaceRoot({}, wt))).toBe(real(wt));
});

test("WORKSPACE_ROOT env override wins when marker-valid and is ignored otherwise", () => {
  expect(real(resolveWorkspaceRoot({ WORKSPACE_ROOT: top }, plainDir))).toBe(real(top));
  // Non-marker override is ignored; resolution falls through to git/startDir.
  expect(real(resolveWorkspaceRoot({ WORKSPACE_ROOT: plainDir }, wtSub))).toBe(real(wt));
  // Relative override is ignored (absolute-only).
  expect(real(resolveWorkspaceRoot({ WORKSPACE_ROOT: "relative/path" }, wtSub))).toBe(real(wt));
});

test("falls back to startDir outside any marker-bearing git checkout", () => {
  expect(real(resolveWorkspaceRoot({}, plainDir))).toBe(real(plainDir));
});

test("resolved roots are absolute and carry no .. segments", () => {
  for (const dir of [topSub, wtSub, plainDir]) {
    const resolved = resolveWorkspaceRoot({}, dir);
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved.split(path.sep)).not.toContain("..");
  }
});

test("grill workflow stub-run from a worktree writes its report under that root's ai/curaos/docs/grills/ (RP-27 acceptance)", async () => {
  const workflowPath = path.resolve(__dirname, "../workflows/opposite-harness-grill.workflow.js");
  const mod = await import(pathToFileURL(workflowPath).href);
  const originalCwd = process.cwd();
  try {
    // Run from INSIDE the linked worktree's submodule checkout: the worst historical case.
    process.chdir(wtSub);
    const result = await mod.default({
      args: {
        subject: "rp-27 worktree stub-run",
        // 1ms probe budget forces the deterministic blocked-report writer path: the EXECUTOR
        // (not an agent) writes the artifact, which is exactly the writer under test.
        probe_timeout_ms: 1,
      },
      agent: async () => ({ verdict: "pass", issues: [], report_path: "" }),
      phase: () => {},
      log: () => {},
    });
    const grillsDir = path.join(real(wt), "ai", "curaos", "docs", "grills");
    expect(real(path.dirname(result.report_path))).toBe(grillsDir);
    expect(path.basename(result.report_path)).toMatch(/^rp-27-worktree-stub-run-[a-f0-9]{12}\.md$/);
    expect(fs.existsSync(result.report_path)).toBe(true);
    // The report must NOT have landed relative to the cwd (wt/code) or escaped above wt.
    expect(fs.existsSync(path.join(wtSub, "ai"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, "ai"))).toBe(false);
  } finally {
    process.chdir(originalCwd);
  }
});
