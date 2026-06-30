// scripts/lib/merge-hygiene.test.js
// RP-21: mergeCleanVerdict matrix - the consolidated safe-to-merge-clean predicate must
// reproduce BOTH consumers' decision tables exactly: pr-verify-merge (attended) and the
// milestone-wave verify leg (unattended; thread problems hard-block). Cross-file equality
// pins live in scripts/workflow-truth-contract.test.js (queued, migration-lane-owned).
// Runner: bun test (just test-js).
const { test, expect } = require("bun:test");

const { ghPrCommand, isBlockedHarnessUnavailable, grillShaMismatch, mergeCleanVerdict } = require("./merge-hygiene.js");

const CLEAN = {
  lensBlock: false,
  lensChanges: false,
  grillVerdict: "merge-ok",
  grillBlockedHarnessUnavailable: false,
  grillShaBlocked: false,
  checksGreen: true,
  threadsResolved: true,
  needsHumanOpen: false,
  unattended: false,
};

test("mergeCleanVerdict: clean gate is merge-ok in both attended and unattended modes", () => {
  expect(mergeCleanVerdict(CLEAN)).toBe("merge-ok");
  expect(mergeCleanVerdict({ ...CLEAN, unattended: true })).toBe("merge-ok");
});

test("mergeCleanVerdict: hard-block signals block regardless of everything else", () => {
  for (const hard of [
    { lensBlock: true },
    { grillVerdict: "block" },
    { grillBlockedHarnessUnavailable: true },
    { grillShaBlocked: true },
    { checksGreen: false },
  ]) {
    expect(mergeCleanVerdict({ ...CLEAN, ...hard })).toBe("block");
    expect(mergeCleanVerdict({ ...CLEAN, unattended: true, ...hard })).toBe("block");
  }
});

test("mergeCleanVerdict: attended path downgrades thread problems to changes-requested (pr-verify-merge table)", () => {
  expect(mergeCleanVerdict({ ...CLEAN, threadsResolved: false })).toBe("changes-requested");
  expect(mergeCleanVerdict({ ...CLEAN, needsHumanOpen: true })).toBe("changes-requested");
  expect(mergeCleanVerdict({ ...CLEAN, lensChanges: true })).toBe("changes-requested");
  expect(mergeCleanVerdict({ ...CLEAN, grillVerdict: "issues-found" })).toBe("changes-requested");
});

test("mergeCleanVerdict: unattended path hard-blocks unresolved/needs-human threads (milestone-wave table)", () => {
  expect(mergeCleanVerdict({ ...CLEAN, unattended: true, threadsResolved: false })).toBe("block");
  expect(mergeCleanVerdict({ ...CLEAN, unattended: true, needsHumanOpen: true })).toBe("block");
  // non-thread soft signals stay changes-requested even unattended
  expect(mergeCleanVerdict({ ...CLEAN, unattended: true, lensChanges: true })).toBe("changes-requested");
  expect(mergeCleanVerdict({ ...CLEAN, unattended: true, grillVerdict: "issues-found" })).toBe("changes-requested");
});

test("mergeCleanVerdict fails closed on missing/unknown gate fields", () => {
  expect(mergeCleanVerdict()).toBe("block"); // checksGreen unproven
  expect(mergeCleanVerdict({})).toBe("block");
  // checksGreen proven but threads unproven: never merge-ok
  expect(mergeCleanVerdict({ checksGreen: true })).toBe("changes-requested");
  expect(mergeCleanVerdict({ checksGreen: true, unattended: true })).toBe("block");
});

// ---- regression coverage for the pre-existing helpers this module owns ----

test("ghPrCommand handles owner/repo#N and bare N, throws on malformed refs", () => {
  expect(ghPrCommand("view", "o-rg/re.po#12")).toBe("gh pr view 12 --repo o-rg/re.po");
  expect(ghPrCommand("merge", "7")).toBe("gh pr merge 7");
  expect(() => ghPrCommand("view", "not-a-ref")).toThrow(/invalid PR ref/);
});

test("isBlockedHarnessUnavailable and grillShaMismatch keep their fail-closed shapes", () => {
  expect(isBlockedHarnessUnavailable({ grill: "blocked-harness-unavailable" })).toBe(true);
  expect(isBlockedHarnessUnavailable({ verdict: "skipped-harness-unavailable" })).toBe(true);
  expect(isBlockedHarnessUnavailable({ verdict: "merge-ok" })).toBe(false);
  expect(isBlockedHarnessUnavailable(null)).toBe(false);
  const sha = "a".repeat(40);
  expect(grillShaMismatch({ verified_sha: sha }, sha.toUpperCase())).toBe(false);
  expect(grillShaMismatch({ verified_sha: sha }, "b".repeat(40))).toBe(true);
  expect(grillShaMismatch({}, sha)).toBe(true);
  expect(grillShaMismatch({ verified_sha: "short" }, sha)).toBe(true);
});
