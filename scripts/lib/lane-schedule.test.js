// scripts/lib/lane-schedule.test.js
// RP-51 scheduling policy: finish near-completion lanes first; FIFO within priority class,
// critical path first. Pure ordering math - no network, no fs.
// Runner: bun test.
const { test, expect } = require("bun:test");

const { priorityRank, orderLanes } = require("./lane-schedule.js");

test("priorityRank maps named classes and P-levels, unknown last", () => {
  expect(priorityRank("Critical")).toBe(0);
  expect(priorityRank("P0")).toBe(0);
  expect(priorityRank("high")).toBe(1);
  expect(priorityRank("P1")).toBe(1);
  expect(priorityRank("Medium")).toBe(2);
  expect(priorityRank("low")).toBe(3);
  expect(priorityRank("")).toBe(4);
  expect(priorityRank(undefined)).toBe(4);
  expect(priorityRank("weird")).toBe(4);
});

// RP-51 acceptance: a near-completion lane (open PR awaiting verify) is scheduled BEFORE a
// fresh lane of equal priority.
test("near-completion lane schedules before a fresh lane of equal priority", () => {
  const lanes = [
    { issue: "org/fresh#1", owned_root: "a" },
    { issue: "org/resume#2", owned_root: "b" },
  ];
  const ranked = [
    { issue: "org/fresh#1", criticalPathDepth: 0, priority: "High" },
    { issue: "org/resume#2", criticalPathDepth: 0, priority: "High" },
  ];
  const ordered = orderLanes(lanes, { ranked, nearCompletion: ["org/resume#2"] });
  expect(ordered.map((l) => l.issue)).toEqual(["org/resume#2", "org/fresh#1"]);
});

test("critical path orders first among fresh lanes; FIFO breaks equal-priority ties", () => {
  const lanes = [
    { issue: "org/a#1" }, // depth 0, High - FIFO position 0
    { issue: "org/b#2" }, // depth 3, Medium - critical path wins over priority class
    { issue: "org/c#3" }, // depth 0, High - FIFO position 2 (after a#1, same class+depth)
  ];
  const ranked = [
    { issue: "org/a#1", criticalPathDepth: 0, priority: "High" },
    { issue: "org/b#2", criticalPathDepth: 3, priority: "Medium" },
    { issue: "org/c#3", criticalPathDepth: 0, priority: "High" },
  ];
  const ordered = orderLanes(lanes, { ranked, nearCompletion: [] });
  expect(ordered.map((l) => l.issue)).toEqual(["org/b#2", "org/a#1", "org/c#3"]);
});

test("near-completion outranks critical path; priority class breaks depth ties", () => {
  const lanes = [
    { issue: "org/deep#1" }, // depth 5 but fresh
    { issue: "org/near#2" }, // depth 0, near completion
    { issue: "org/low#3" }, // depth 2, Low
    { issue: "org/high#4" }, // depth 2, Critical
  ];
  const ranked = [
    { issue: "org/deep#1", criticalPathDepth: 5, priority: "High" },
    { issue: "org/near#2", criticalPathDepth: 0, priority: "Low" },
    { issue: "org/low#3", criticalPathDepth: 2, priority: "Low" },
    { issue: "org/high#4", criticalPathDepth: 2, priority: "Critical" },
  ];
  const ordered = orderLanes(lanes, { ranked, nearCompletion: ["org/near#2"] });
  expect(ordered.map((l) => l.issue)).toEqual(["org/near#2", "org/deep#1", "org/high#4", "org/low#3"]);
});

test("ordering never changes membership and tolerates missing ranked rows", () => {
  const lanes = [{ issue: "org/x#9" }, { issue: "org/y#8" }];
  const ordered = orderLanes(lanes, { ranked: [], nearCompletion: ["org/y#8"] });
  expect(ordered).toHaveLength(2);
  expect(new Set(ordered.map((l) => l.issue))).toEqual(new Set(["org/x#9", "org/y#8"]));
  expect(ordered[0].issue).toBe("org/y#8");
  // input array untouched (orderLanes returns a NEW array)
  expect(lanes.map((l) => l.issue)).toEqual(["org/x#9", "org/y#8"]);
});

test("ref matching is case-insensitive and whitespace-tolerant", () => {
  const lanes = [{ issue: "Org/Repo#5" }, { issue: "org/other#6" }];
  const ordered = orderLanes(lanes, { ranked: [], nearCompletion: [" org/repo#5 "] });
  expect(ordered[0].issue).toBe("Org/Repo#5");
});
