// scripts/lib/gc-evidence-guard.js
// RP-27 convention (GC fail-closed on evidence), consumed by RP-75's scripts/gc-local-state.sh:
// garbage collection of local state FAILS (exit nonzero) instead of deleting whenever a candidate
// may be the only record of a verdict or an unmerged artifact tree. Deleting evidence is
// unrecoverable; a failed GC is a one-line fix. Fail closed on uncertainty too: unreadable
// candidates and a missing worktree registry block the GC.
//
// The two evidence classes this guard encodes (both burned us):
// - .scratch files matching VERDICT: are grill-verdict evidence (the P0-verdict class that died in
//   worktree cleanups); they must be PROMOTED to ai/curaos/docs/grills/, never GC'd.
// - Non-worktree dirs under .worktrees/ are stray escaped artifact trees (the .worktrees/ai/
//   class); they need a human diff + disposition, never silent deletion.

function normalizedPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function joinedEntryPath(rootDir, entry) {
  const name = normalizedPath(entry);
  return rootDir ? `${rootDir}/${name}` : name;
}

// candidates: [{ path, content }] where content is the file's text, or null/undefined when the
// caller could not read it. Only paths under a .scratch segment are in scope; everything else is
// governed by its own retention rule.
function scratchEvidenceBlockers(candidates) {
  const blockers = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const file = normalizedPath(candidate && candidate.path);
    if (!file || !/(^|\/)\.scratch(\/|$)/.test(file)) continue;
    if (candidate.content === null || candidate.content === undefined) {
      blockers.push({ path: file, reason: "scratch-candidate-unreadable" });
    } else if (/VERDICT:/.test(String(candidate.content))) {
      blockers.push({ path: file, reason: "scratch-evidence-verdict" });
    }
  }
  return blockers;
}

// entries: directory names directly under worktreesRoot. registeredWorktrees: absolute worktree
// paths from `git worktree list --porcelain` (every level); a non-array registry means the listing
// failed, which blocks every entry rather than treating them all as strays to delete.
function strayWorktreeBlockers(worktreesRoot, entries, registeredWorktrees) {
  const rootDir = normalizedPath(worktreesRoot);
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return [];
  if (!Array.isArray(registeredWorktrees)) {
    return list.map((entry) => ({ path: joinedEntryPath(rootDir, entry), reason: "worktree-registry-unavailable" }));
  }
  const registered = new Set(registeredWorktrees.map((p) => normalizedPath(p)));
  return list
    .map((entry) => joinedEntryPath(rootDir, entry))
    .filter((full) => !registered.has(full))
    .map((full) => ({ path: full, reason: "non-worktree-dir-under-worktrees" }));
}

// Single gate for gc-local-state.sh: a nonempty result means the GC must exit nonzero WITHOUT
// deleting anything, printing each {path, reason} so the operator can promote or dispose first.
function gcBlockers({ scratchCandidates, worktreesRoot, worktreeEntries, registeredWorktrees } = {}) {
  return [
    ...scratchEvidenceBlockers(scratchCandidates),
    ...strayWorktreeBlockers(worktreesRoot, worktreeEntries, registeredWorktrees),
  ];
}

module.exports = { normalizedPath, scratchEvidenceBlockers, strayWorktreeBlockers, gcBlockers };
