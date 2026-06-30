// lane-schedule.js - RP-51 dispatch scheduling policy: finish near-completion lanes first.
//
// Selective pampering: COMPLETING a lane frees capacity and unblocks dependents faster than
// starting another parallel lane, so a lane that is already near completion (an open PR awaiting
// verify, or board Status In Progress / In Review from a previous pass) schedules BEFORE a fresh
// lane of equal priority. Ordering within the collision-safe lane set only - this module never
// adds or removes lanes, never gates dispatch, and never overrides the wave-prioritize collision
// partition (membership stays exactly what partitionLanes emitted).
//
// Ordering criteria (stable):
//   1. near-completion lanes first (caller-supplied refs; deterministic board/PR evidence),
//   2. critical path first (deepest criticalPathDepth from the ranked rows),
//   3. priority class (Critical/P0 .. Low/P3, unknown last),
//   4. FIFO within the same priority class (original partition order = leverage order).
//
// Consumed by scripts/workflows/wave-prioritize.workflow.js (lane ordering) whose ordered lanes
// feed scripts/workflows/milestone-wave.workflow.js's serial dispatch loop.

const PRIORITY_RANKS = new Map([
  ["critical", 0], ["p0", 0],
  ["high", 1], ["p1", 1],
  ["medium", 2], ["p2", 2],
  ["low", 3], ["p3", 3],
]);

function priorityRank(priority) {
  const key = String(priority || "").trim().toLowerCase();
  return PRIORITY_RANKS.has(key) ? PRIORITY_RANKS.get(key) : 4;
}

function normalizeRefSet(refs) {
  const out = new Set();
  for (const ref of Array.isArray(refs) ? refs : []) {
    const key = String(ref || "").trim().toLowerCase();
    if (key) out.add(key);
  }
  return out;
}

function issuesForLane(lane) {
  if (!lane || typeof lane !== "object") return [];
  const issues = Array.isArray(lane.issues) && lane.issues.length ? lane.issues : [lane.issue];
  return [...new Set(issues.filter(Boolean).map((issue) => String(issue).toLowerCase()))];
}

// orderLanes(lanes, { ranked, nearCompletion }) -> NEW array, same members, scheduled order.
// lanes: [{issue, ...}] from the collision partition (already leverage-ordered = FIFO baseline).
// ranked: rank() rows ({issue, criticalPathDepth, priority}) supplying depth + priority class.
// nearCompletion: issue refs with deterministic near-completion evidence (open PR awaiting
// verify / board In Progress / In Review).
function orderLanes(lanes, { ranked = [], nearCompletion = [] } = {}) {
  const rows = Array.isArray(lanes) ? lanes : [];
  const near = normalizeRefSet(nearCompletion);
  const rankedByIssue = new Map();
  for (const row of Array.isArray(ranked) ? ranked : []) {
    if (row && row.issue) rankedByIssue.set(String(row.issue).toLowerCase(), row);
  }
  const keyed = rows.map((lane, index) => {
    const issueKeys = issuesForLane(lane);
    const rankedRows = issueKeys.map((issueKey) => rankedByIssue.get(issueKey) || {});
    return {
      lane,
      index, // FIFO tiebreaker: original partition (leverage) order
      nearCompletion: issueKeys.some((issueKey) => near.has(issueKey)) ? 0 : 1,
      criticalPathDepth: Math.max(0, ...rankedRows.map((row) => Number.isFinite(row.criticalPathDepth) ? row.criticalPathDepth : 0)),
      priorityRank: Math.min(4, ...rankedRows.map((row) => priorityRank(row.priority))),
    };
  });
  keyed.sort((a, b) =>
    (a.nearCompletion - b.nearCompletion)
    || (b.criticalPathDepth - a.criticalPathDepth)
    || (a.priorityRank - b.priorityRank)
    || (a.index - b.index));
  return keyed.map((k) => k.lane);
}

module.exports = { priorityRank, orderLanes };
