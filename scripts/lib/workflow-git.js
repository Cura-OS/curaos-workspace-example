const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = ".";

function runCommand(command, args, options = {}) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: options.cwd || ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: "", exitCode: 0 };
  } catch (error) {
    if (options.allowFailure) {
      return {
        ok: false,
        stdout: String(error.stdout || "").trim(),
        stderr: String(error.stderr || error.message || "").trim(),
        exitCode: typeof error.status === "number" ? error.status : -1,
      };
    }
    throw error;
  }
}

function git(args, options = {}) {
  return runCommand("git", args, options);
}

function gitIn(repoPath, args, options = {}) {
  return runCommand("git", args, { ...options, cwd: repoPath });
}

function hasDirtyStatus() {
  return git(["status", "--short"]).stdout.length > 0;
}

function stashIfDirty(message) {
  if (!hasDirtyStatus()) return false;
  git(["stash", "push", "-u", "-m", message]);
  return true;
}

function localBranchExists(branchName) {
  return git(["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], { allowFailure: true }).ok;
}

function remoteBranchExists(branchName) {
  const probe = git(["ls-remote", "--exit-code", "--heads", "origin", branchName], { allowFailure: true });
  if (probe.ok) return true;
  if (probe.exitCode === 2) return false;
  throw new Error(`remote branch probe failed: ${probe.stderr || "unknown error"}`);
}

function parseDefaultBranch(ref) {
  const match = /^origin\/(.+)$/.exec(ref);
  if (!match) throw new Error(`unexpected origin/HEAD format: ${ref || "<empty>"}`);
  return match[1];
}

function parseRemoteDefaultBranch(output) {
  const match = /^ref:\s+refs\/heads\/(.+)\s+HEAD$/m.exec(output);
  if (!match) throw new Error(`unexpected remote HEAD format: ${output || "<empty>"}`);
  return match[1];
}

function resolveDefaultBranchIn(repoPath) {
  const local = gitIn(repoPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { allowFailure: true });
  if (local.ok && local.stdout) return parseDefaultBranch(local.stdout);

  const remote = gitIn(repoPath, ["ls-remote", "--symref", "origin", "HEAD"], { allowFailure: true });
  if (remote.ok && remote.stdout) return parseRemoteDefaultBranch(remote.stdout);

  throw new Error(`unable to resolve default branch: ${local.stderr || remote.stderr || "missing origin/HEAD"}`);
}

function resolveDefaultBranch() {
  return resolveDefaultBranchIn(ROOT);
}

function remoteDefaultRef(defaultBranch) {
  return `origin/${defaultBranch}`;
}

function fetchDefaultBranch(defaultBranch) {
  git(["fetch", "origin", defaultBranch]);
}

function restoreDefaultBranch(message) {
  let stashed = false;
  try {
    const defaultBranch = resolveDefaultBranch();
    stashed = stashIfDirty(message);
    fetchDefaultBranch(defaultBranch);
    const checkout = git(["checkout", defaultBranch], { allowFailure: true });
    if (checkout.ok) {
      git(["pull", "--ff-only", "origin", defaultBranch]);
      const status = git(["status", "--short", "--branch"]).stdout;
      return { restored: status.startsWith(`## ${defaultBranch}`) && !hasDirtyStatus(), stashed, reason: "" };
    }
    git(["checkout", "--detach", remoteDefaultRef(defaultBranch)]);
    const status = git(["status", "--short", "--branch"]).stdout;
    return { restored: /^## HEAD \(no branch\)/.test(status) && !hasDirtyStatus(), stashed, reason: "" };
  } catch (error) {
    return { restored: false, stashed, reason: String(error.stderr || error.message || error) };
  }
}

function restoreSuffix(result) {
  if (result.restored === true) return result.stashed ? "; stashed residue and restored default branch" : "; restored default branch";
  return `; restore-default-branch-failed: ${result.reason || "unknown"}`;
}

function createAndCheckoutBranch(branchName) {
  let stashed = false;
  try {
    const defaultBranch = resolveDefaultBranch();
    stashed = stashIfDirty(`branch-create preflight ${branchName}`);
    fetchDefaultBranch(defaultBranch);
    if (localBranchExists(branchName)) return { branch: "", stashed, blocker: `local branch already exists: ${branchName}` };
    if (remoteBranchExists(branchName)) return { branch: "", stashed, blocker: `remote branch already exists: ${branchName}` };
    git(["checkout", "--no-track", "-b", branchName, remoteDefaultRef(defaultBranch)]);
    return { branch: branchName, stashed, blocker: "" };
  } catch (error) {
    return { branch: "", stashed, blocker: String(error.stderr || error.message || error) };
  }
}

// ---------------------------------------------------------------------------
// Deterministic submodule pointer bump (RP-30).
//
// Failure class: a pointer bump made from a stale clone (no fetch first) pins
// an old submodule SHA, or pins a local-only commit the submodule remote
// cannot serve. Both broke real waves (stale HEAD without `foreach git fetch`).
// The helper therefore:
//   1. fetches EVERY level first (bumpPointerChain phase 1),
//   2. bumps bottom-up so each parent pins a tip already on the submodule's
//      origin default branch (each non-top level pushes its bump),
//   3. verifies each level with git rev-list before committing: the staged
//      gitlink must be an ancestor of (or equal to) origin/<default>.
// scripts/check-submodule-pins.sh enforces the same rev-list predicate at the
// pre-push gate.
// ---------------------------------------------------------------------------

function remoteDefaultTip(repoPath, defaultBranch) {
  const probe = gitIn(repoPath, ["ls-remote", "origin", `refs/heads/${defaultBranch}`], { allowFailure: true });
  const sha = (probe.stdout.split(/\s+/)[0] || "").trim();
  if (!probe.ok || !/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new Error(`unable to read origin tip for ${defaultBranch} in ${repoPath}: ${probe.stderr || "empty ls-remote output"}`);
  }
  return sha;
}

// rev-list verification: zero commits reachable from the pinned SHA but not
// from origin/<default> means the pin is an ancestor of (or equal to) the tip.
function verifyPinnedAncestor(repoPath, sha, defaultBranch) {
  const ahead = gitIn(repoPath, ["rev-list", "--count", `refs/remotes/origin/${defaultBranch}..${sha}`], { allowFailure: true });
  if (!ahead.ok) return { ok: false, reason: `rev-list verification failed in ${repoPath}: ${ahead.stderr || "unknown error"}` };
  if (ahead.stdout !== "0") {
    return { ok: false, reason: `${sha} carries ${ahead.stdout} commit(s) unreachable from origin/${defaultBranch} in ${repoPath}` };
  }
  return { ok: true, reason: "" };
}

// P5c (issue #706): two-level submodule pointer-drift parser. `git submodule status --recursive`
// prefixes each line with a status char: " " in-sync, "-" not initialized, "+" the checked-out
// commit differs from the gitlink pinned in the superproject index (drift), "U" merge conflicts.
// Pure parser so the truth contract can pin the recursive (two-level) classification without git.
function parseSubmoduleDrift(statusOutput) {
  const lines = String(statusOutput || "").split(/\r?\n/).filter((l) => l.length > 0);
  const uninitialized = [];
  const drifted = [];
  const conflicted = [];
  for (const line of lines) {
    const marker = line[0];
    // status format: "<marker><sha> <path> (<describe>)"; the path is the 2nd whitespace token.
    const rest = line.slice(1).trim();
    const submodulePath = rest.split(/\s+/)[1] || rest.split(/\s+/)[0] || "";
    if (marker === "-") uninitialized.push(submodulePath);
    else if (marker === "+") drifted.push(submodulePath);
    else if (marker === "U") conflicted.push(submodulePath);
  }
  return { uninitialized, drifted, conflicted, clean: uninitialized.length === 0 && drifted.length === 0 && conflicted.length === 0 };
}

function submoduleJobCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8;
}

// P5c: hoist `git submodule update --init --recursive` to wave setup so pre-push typecheck hooks
// pass on uninitialized gitlinks (the class that forced `--no-verify`), then re-check two-level
// pointer drift via `git submodule status --recursive`. Returns a structured result; never throws
// (submodule-less checkouts return clean). Injectable git runner for the truth contract.
function initSubmodulesRecursive(gitDeps) {
  const run = (gitDeps && gitDeps.gitFn) || ((args) => git(args, { allowFailure: true }));
  const jobs = submoduleJobCount(gitDeps && gitDeps.submoduleJobs);
  const init = run(["-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive", "--jobs", String(jobs)]);
  const status = run(["submodule", "status", "--recursive"]);
  const drift = parseSubmoduleDrift(status && status.ok ? status.stdout : "");
  return {
    initialized: !!(init && init.ok),
    init_error: init && init.ok ? "" : (init && init.stderr) || "submodule update failed",
    ...drift,
  };
}

// Detach an intermediate level onto its fresh origin default tip so its bump
// commit fast-forwards on push. Refuses to discard local-only commits.
function alignToRemoteDefault(repoPath) {
  const defaultBranch = resolveDefaultBranchIn(repoPath);
  const tip = gitIn(repoPath, ["rev-parse", "--verify", `refs/remotes/origin/${defaultBranch}`]).stdout;
  const head = gitIn(repoPath, ["rev-parse", "HEAD"]).stdout;
  if (head === tip) return { ok: true, reason: "" };
  const localOnly = gitIn(repoPath, ["rev-list", "--count", `refs/remotes/origin/${defaultBranch}..HEAD`]).stdout;
  if (localOnly !== "0") {
    return { ok: false, reason: `${repoPath} carries ${localOnly} local commit(s) not on origin/${defaultBranch}; refusing to discard them` };
  }
  gitIn(repoPath, ["checkout", "--detach", tip]);
  return { ok: true, reason: "" };
}

// One level: pin <parentRepo>/<submodulePath> at the submodule's origin
// default tip, verify with rev-list, commit (pathspec-limited), optionally
// push the parent default branch. Freshness gate: the local remote-tracking
// ref must equal the authoritative ls-remote tip, which catches the
// stale-HEAD-without-fetch class before anything is staged.
function bumpSubmodulePointer(parentRepo, submodulePath, options = {}) {
  const push = options.push === true;
  const failure = (reason) => ({ ok: false, sha: "", committed: false, pushed: false, reason });
  try {
    const subRepo = path.join(parentRepo, submodulePath);
    const defaultBranch = resolveDefaultBranchIn(subRepo);
    const remoteTip = remoteDefaultTip(subRepo, defaultBranch);
    const tracking = gitIn(subRepo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${defaultBranch}`], { allowFailure: true });
    if (!tracking.ok || tracking.stdout !== remoteTip) {
      return failure(
        `stale origin/${defaultBranch} in ${submodulePath}: local ref ${tracking.stdout || "<missing>"} vs remote tip ${remoteTip}; fetch every level before bumping`,
      );
    }
    if (gitIn(subRepo, ["rev-parse", "HEAD"]).stdout !== remoteTip) {
      gitIn(subRepo, ["checkout", "--detach", remoteTip]);
    }
    gitIn(parentRepo, ["add", "--", submodulePath]);
    const staged = gitIn(parentRepo, ["rev-parse", `:${submodulePath}`]).stdout;
    if (staged !== remoteTip) {
      return failure(`staged gitlink ${staged || "<none>"} does not match verified tip ${remoteTip} for ${submodulePath}`);
    }
    const verified = verifyPinnedAncestor(subRepo, staged, defaultBranch);
    if (!verified.ok) return failure(verified.reason);
    const inHead = gitIn(parentRepo, ["rev-parse", "--verify", "--quiet", `HEAD:${submodulePath}`], { allowFailure: true });
    let committed = false;
    if (!inHead.ok || inHead.stdout !== remoteTip) {
      gitIn(parentRepo, ["commit", "-m", `chore(pointer): bump ${submodulePath} to ${remoteTip.slice(0, 12)}`, "--", submodulePath]);
      committed = true;
    }
    let pushed = false;
    if (push && committed) {
      const parentDefault = resolveDefaultBranchIn(parentRepo);
      gitIn(parentRepo, ["push", "origin", `HEAD:refs/heads/${parentDefault}`]);
      pushed = true;
    }
    return { ok: true, sha: remoteTip, committed, pushed, reason: "" };
  } catch (error) {
    return failure(String(error.stderr || error.message || error));
  }
}

// Whole chain, e.g. bumpPointerChain(workspaceRoot, ["curaos", "backend/services/x"]).
// Phase 1 fetches every level; phase 2 bumps bottom-up. Levels below the top
// push so the level above pins a tip its submodule remote can serve; the top
// commit stays local by default (it usually rides a PR branch).
function bumpPointerChain(topRepo, submodulePaths, options = {}) {
  const pushTop = options.pushTop === true;
  const levels = [];
  if (!Array.isArray(submodulePaths) || submodulePaths.length === 0) {
    return { ok: false, levels, reason: "submodulePaths must name at least one nested submodule path" };
  }
  try {
    const repos = [topRepo];
    for (const sub of submodulePaths) repos.push(path.join(repos[repos.length - 1], sub));
    for (const repo of repos) {
      gitIn(repo, ["fetch", "origin", resolveDefaultBranchIn(repo)]);
    }
    for (let i = submodulePaths.length - 1; i >= 0; i -= 1) {
      if (i > 0) {
        const aligned = alignToRemoteDefault(repos[i]);
        if (!aligned.ok) return { ok: false, levels, reason: `level ${i} (${submodulePaths[i]}): ${aligned.reason}` };
      }
      const result = bumpSubmodulePointer(repos[i], submodulePaths[i], { push: i > 0 || pushTop });
      if (!result.ok) return { ok: false, levels, reason: `level ${i} (${submodulePaths[i]}): ${result.reason}` };
      levels.unshift({
        parentRepo: repos[i],
        submodulePath: submodulePaths[i],
        sha: result.sha,
        committed: result.committed,
        pushed: result.pushed,
      });
    }
    return { ok: true, levels, reason: "" };
  } catch (error) {
    return { ok: false, levels, reason: String(error.stderr || error.message || error) };
  }
}

function safeWorktreeSlug(value) {
  return String(value || "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 96) || "lane";
}

function isolatedLaneWorktreePath({ issue, branch, repoRoot = ROOT }) {
  const name = safeWorktreeSlug(branch || issue);
  return path.join(repoRoot, ".worktrees", name);
}

function freeDiskKb(repoRoot) {
  const out = runCommand("df", ["-Pk", repoRoot], { allowFailure: true });
  if (!out.ok) return Number.POSITIVE_INFINITY;
  const line = out.stdout.split(/\r?\n/).filter(Boolean).at(-1) || "";
  const fields = line.trim().split(/\s+/);
  const available = Number(fields[3]);
  return Number.isFinite(available) ? available : Number.POSITIVE_INFINITY;
}

function createIsolatedLaneWorktree({ issue, branch, repoRoot = ROOT, minFreeKb = 1024 * 1024 }) {
  if (!branch || typeof branch !== "string") throw new Error("createIsolatedLaneWorktree requires branch");
  if (freeDiskKb(repoRoot) < minFreeKb) {
    return { branch: "", path: "", blocker: `insufficient disk space for worktree: need ${minFreeKb} KiB` };
  }
  const defaultBranch = resolveDefaultBranchIn(repoRoot);
  const worktreePath = isolatedLaneWorktreePath({ issue, branch, repoRoot });
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  const existing = gitIn(repoRoot, ["worktree", "list", "--porcelain"], { allowFailure: true }).stdout || "";
  if (existing.split(/\r?\n/).some((line) => line === `worktree ${worktreePath}`)) {
    return { branch: "", path: worktreePath, blocker: `worktree already exists: ${worktreePath}` };
  }
  if (gitIn(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }).ok) {
    return { branch: "", path: "", blocker: `local branch already exists: ${branch}` };
  }
  const remoteProbe = gitIn(repoRoot, ["ls-remote", "--exit-code", "--heads", "origin", branch], { allowFailure: true });
  if (remoteProbe.ok) return { branch: "", path: "", blocker: `remote branch already exists: ${branch}` };
  if (remoteProbe.exitCode !== 2) return { branch: "", path: "", blocker: `remote branch probe failed: ${remoteProbe.stderr || "unknown error"}` };
  gitIn(repoRoot, ["fetch", "--prune", "origin", defaultBranch]);
  gitIn(repoRoot, ["worktree", "add", worktreePath, "-b", branch, `origin/${defaultBranch}`]);
  return { branch, path: worktreePath, blocker: "" };
}

function isPrRef(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/.test(value);
}

function observedPrRef(value) {
  const ref = value && typeof value.pr === "string" ? value.pr.trim() : "";
  return isPrRef(ref) ? ref : "";
}

module.exports = {
  alignToRemoteDefault,
  bumpPointerChain,
  bumpSubmodulePointer,
  createAndCheckoutBranch,
  createIsolatedLaneWorktree,
  fetchDefaultBranch,
  git,
  gitIn,
  hasDirtyStatus,
  initSubmodulesRecursive,
  isolatedLaneWorktreePath,
  isPrRef,
  localBranchExists,
  observedPrRef,
  parseSubmoduleDrift,
  remoteDefaultRef,
  remoteDefaultTip,
  remoteBranchExists,
  resolveDefaultBranch,
  resolveDefaultBranchIn,
  restoreDefaultBranch,
  restoreSuffix,
  runCommand,
  safeWorktreeSlug,
  stashIfDirty,
  verifyPinnedAncestor,
};
