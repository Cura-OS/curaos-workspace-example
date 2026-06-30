// scripts/lib/workspace-root.js
// RP-27: workspace-root resolution for artifact writers (grill verdicts, snapshots, mirror docs)
// and the RP-75 local-state GC. Artifact destinations MUST resolve from an ABSOLUTE workspace root,
// never the caller cwd and never `..`-relative hops, which escape linked worktrees into
// git-invisible paths (the .worktrees/ai/ stray-doc class: 6 mirror docs + 2 services landed
// git-invisible in one day).
//
// Resolution order:
// 1. WORKSPACE_ROOT env override (absolute + marker-validated).
// 2. git: `rev-parse --show-toplevel`, then climb `--show-superproject-working-tree` out of nested
//    submodule checkouts. A linked worktree of the workspace is a VALID root: its tracked
//    ai/curaos/docs/grills/ is the git-visible destination on that lane's branch.
// 3. startDir/cwd fallback for runs outside any marker-bearing git checkout (stub/test runs).
//
// Marker = AGENTS.md + ai/ both present: the workspace root carries both; submodule repos are
// code-only per [[curaos-repo-boundary-rule]] and carry neither, so a submodule toplevel can never
// be mistaken for the workspace root.
//
// MIRROR CONTRACT: workspaceRootMarker / gitPathOutput / resolveWorkspaceRoot are textually
// identical to the inline copies in scripts/workflows/opposite-harness-grill.workflow.js (the
// workflow cannot require this module: its source is executed via `new Function` in the truth
// contract, where import.meta is unavailable). Keep them in lockstep; the queued truth-contract
// test asserts extractFunction equality.
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { isAbsolute, resolve } = require("node:path");

function workspaceRootMarker(dir) {
  return Boolean(dir) && existsSync(`${dir}/AGENTS.md`) && existsSync(`${dir}/ai`);
}
function gitPathOutput(args, cwd) {
  try {
    // env snapshot at call time: under Bun, execFileSync without an explicit env uses the
    // process START env, silently dropping later process.env mutations (e.g. a test setting
    // GIT_CEILING_DIRECTORIES); Node inherits live. Spread keeps both runtimes consistent.
    return String(execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } })).trim();
  } catch {
    return "";
  }
}
function resolveWorkspaceRoot(env, startDir) {
  const override = env && typeof env === "object" && env.WORKSPACE_ROOT ? String(env.WORKSPACE_ROOT).trim() : "";
  if (override && isAbsolute(override) && workspaceRootMarker(override)) return resolve(override);
  let dir = gitPathOutput(["rev-parse", "--show-toplevel"], startDir);
  for (let hops = 0; dir && hops < 10; hops += 1) {
    const superproject = gitPathOutput(["rev-parse", "--show-superproject-working-tree"], dir);
    if (!superproject || superproject === dir) break;
    dir = superproject;
  }
  if (dir && isAbsolute(dir) && workspaceRootMarker(dir)) return resolve(dir);
  return resolve(startDir || ".");
}

module.exports = { workspaceRootMarker, gitPathOutput, resolveWorkspaceRoot };
