// scripts/lib/gc-evidence-guard.test.js
// RP-27: GC fail-closed on evidence. These fixtures mirror the RP-75 acceptance shapes (a
// .scratch file containing VERDICT: and a non-worktree dir under .worktrees/ must each block the
// GC) so gc-local-state.sh can consume the predicates unchanged. Runner: bun test.
const { test, expect } = require("bun:test");

const {
  gcBlockers,
  normalizedPath,
  scratchEvidenceBlockers,
  strayWorktreeBlockers,
} = require("./gc-evidence-guard.js");

test("a .scratch file matching VERDICT: blocks the GC", () => {
  const blockers = scratchEvidenceBlockers([
    { path: ".scratch/x", content: "## Verdict block\nVERDICT: BLOCK\n" },
  ]);
  expect(blockers).toEqual([{ path: ".scratch/x", reason: "scratch-evidence-verdict" }]);
});

test("non-evidence .scratch files pass; non-.scratch paths are out of scope", () => {
  expect(scratchEvidenceBlockers([{ path: ".scratch/cache/items.json", content: "{\"a\":1}" }])).toEqual([]);
  // VERDICT: outside .scratch is governed by its own home (ai/curaos/docs/grills/), not this guard.
  expect(scratchEvidenceBlockers([{ path: "ai/curaos/docs/grills/m9-s2-pr88.md", content: "VERDICT: PASS" }])).toEqual([]);
  expect(scratchEvidenceBlockers([])).toEqual([]);
  expect(scratchEvidenceBlockers(undefined)).toEqual([]);
});

test("an unreadable .scratch candidate blocks the GC (fail closed on uncertainty)", () => {
  expect(scratchEvidenceBlockers([{ path: ".scratch/evidence/raw.md", content: null }])).toEqual([
    { path: ".scratch/evidence/raw.md", reason: "scratch-candidate-unreadable" },
  ]);
  expect(scratchEvidenceBlockers([{ path: "/abs/ws/.scratch/y" }])).toEqual([
    { path: "/abs/ws/.scratch/y", reason: "scratch-candidate-unreadable" },
  ]);
});

test("a non-worktree dir under .worktrees/ blocks the GC", () => {
  const blockers = strayWorktreeBlockers(
    "/ws/.worktrees",
    ["ai", "agent-a1"],
    ["/ws/.worktrees/agent-a1"],
  );
  expect(blockers).toEqual([{ path: "/ws/.worktrees/ai", reason: "non-worktree-dir-under-worktrees" }]);
});

test("registered worktrees pass; an empty .worktrees/ has nothing to block", () => {
  expect(strayWorktreeBlockers("/ws/.worktrees", ["agent-a1"], ["/ws/.worktrees/agent-a1"])).toEqual([]);
  expect(strayWorktreeBlockers("/ws/.worktrees", [], ["/ws/.worktrees/agent-a1"])).toEqual([]);
  expect(strayWorktreeBlockers("/ws/.worktrees", undefined, [])).toEqual([]);
});

test("a missing worktree registry blocks every entry (fail closed, never delete-all)", () => {
  const blockers = strayWorktreeBlockers("/ws/.worktrees", ["ai", "agent-a1"], undefined);
  expect(blockers).toEqual([
    { path: "/ws/.worktrees/ai", reason: "worktree-registry-unavailable" },
    { path: "/ws/.worktrees/agent-a1", reason: "worktree-registry-unavailable" },
  ]);
});

test("gcBlockers aggregates both evidence classes for the gc-local-state.sh gate", () => {
  const blockers = gcBlockers({
    scratchCandidates: [
      { path: ".scratch/x", content: "VERDICT: BLOCK" },
      { path: ".scratch/cache/ok.json", content: "{}" },
    ],
    worktreesRoot: "/ws/.worktrees",
    worktreeEntries: ["ai", "agent-a1"],
    registeredWorktrees: ["/ws/.worktrees/agent-a1"],
  });
  expect(blockers).toEqual([
    { path: ".scratch/x", reason: "scratch-evidence-verdict" },
    { path: "/ws/.worktrees/ai", reason: "non-worktree-dir-under-worktrees" },
  ]);
  expect(gcBlockers()).toEqual([]);
  expect(gcBlockers({})).toEqual([]);
});

test("paths normalize separators and trailing slashes before matching", () => {
  expect(normalizedPath(".scratch\\grills\\raw.md/")).toBe(".scratch/grills/raw.md");
  expect(scratchEvidenceBlockers([{ path: ".scratch\\grills\\raw.md", content: "VERDICT: PASS" }])).toEqual([
    { path: ".scratch/grills/raw.md", reason: "scratch-evidence-verdict" },
  ]);
  expect(strayWorktreeBlockers("/ws/.worktrees/", ["ai/"], ["/ws/.worktrees/ai"])).toEqual([]);
});
