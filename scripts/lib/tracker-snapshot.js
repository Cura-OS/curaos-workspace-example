// scripts/lib/tracker-snapshot.js
// RP-55 pilot: ONE tracker snapshot for the whole wave. A single refresh routine pulls open
// org issues + CuraOS Roadmap board items + the field map into a versioned JSON under
// `.cache/tracker/`, stamped with fetch time + the remaining quotas (RP-42 ledger read).
// Every converger/workflow READS the snapshot and issues only writes: dry-run phases become
// 100% API-free, and a wave can declare blocked-by-external from the stamped quotas BEFORE
// burning any of its own budget.
//
// Consumes the RP-38 board snapshot (gh-project.js boardSnapshot) for the board leg and the
// RP-42 budget ledger (gh-budget.js readBudgets) for the quota stamp; this module adds the
// open-issue enumeration + the composed, versioned, staleness-enforced artifact.
//
// Staleness contract (the acceptance "refusal" clause): loadTrackerSnapshot() THROWS
// TrackerSnapshotStaleError when the snapshot is missing, version-mismatched, or older than
// the TTL, unless the caller passes allowStale:true (which returns it marked stale:true).
// Refreshing is an explicit, separate act: a dry-run consumer can never silently fall
// through to live API calls.

const fs = require("node:fs");
const path = require("node:path");

const ghProject = require("./gh-project.js");
const ghBudget = require("./gh-budget.js");

const ROOT = path.resolve(__dirname, "..", "..");
const TRACKER_DIR = path.join(ROOT, ".cache", "tracker");
const TRACKER_SNAPSHOT = path.join(TRACKER_DIR, "tracker-snapshot.json");
const TRACKER_SNAPSHOT_VERSION = 1;
const TRACKER_SNAPSHOT_TTL_MS = 5 * 60_000; // aligned with BOARD_SNAPSHOT_TTL_MS (RP-38)
const SEARCH_NODE_CAP = 1000; // GitHub search returns at most 1000 nodes; past that = truncation

class TrackerSnapshotStaleError extends Error {
  constructor(message, { ageMs = null } = {}) {
    super(message);
    this.name = "TrackerSnapshotStaleError";
    this.code = "tracker-snapshot-stale";
    this.ageMs = ageMs;
  }
}

// ---- open-issue enumeration (cursor-paginated GraphQL search; fail-closed at the cap) ----
// Returns [{repo, number, state, title, url, labels[]}]. gql injectable for tests (the
// throttleContentOp nowMs pattern). Fails CLOSED when the org carries more open issues than
// the search node cap (RP-07 truncation class: a silently truncated issue list poisons every
// downstream dry-run).
function fetchOpenIssues({ gql = ghProject.graphql, org = ghProject.ORG, pageSize = 100 } = {}) {
  const issues = [];
  let after = null;
  for (;;) {
    const afterArg = after ? `,after:${JSON.stringify(after)}` : "";
    const doc = `query{search(query:${JSON.stringify(`org:${org} is:issue is:open`)},type:ISSUE,first:${pageSize}${afterArg}){issueCount pageInfo{hasNextPage endCursor} nodes{... on Issue{number state title url labels(first:100){nodes{name}} repository{nameWithOwner}}}}}`;
    const res = gql(doc);
    const search = res && res.data && res.data.search;
    if (!search) throw new Error("fetchOpenIssues: malformed search response");
    if (Number(search.issueCount) > SEARCH_NODE_CAP) {
      throw new Error(`fetchOpenIssues: ${search.issueCount} open issues exceed the ${SEARCH_NODE_CAP}-node search cap; refusing truncated snapshot`);
    }
    for (const node of search.nodes || []) {
      if (!node || !node.repository) continue;
      issues.push({
        repo: node.repository.nameWithOwner,
        number: Number(node.number),
        state: node.state,
        title: node.title,
        url: node.url,
        labels: node.labels && Array.isArray(node.labels.nodes) ? node.labels.nodes.map((n) => n && n.name).filter(Boolean) : [],
      });
    }
    if (!search.pageInfo || !search.pageInfo.hasNextPage) break;
    after = search.pageInfo.endCursor;
  }
  return issues;
}

// ---- the refresh routine (the ONLY network path in this module) ----
// Composes: board items (RP-38 boardSnapshot, forced refresh so the two legs are coherent),
// field map (forced refresh for the same reason), open issues (above), and the remaining
// quotas (RP-42 readBudgets; the wave declares blocked-by-external from this stamp before
// spending anything). All collaborators injectable for tests.
function refreshTrackerSnapshot({
  nowMs = Date.now(),
  snapshotPath = TRACKER_SNAPSHOT,
  gql = ghProject.graphql,
  ghFn = ghProject.gh,
  projectNumber = null,
  ensureProjectFn = ghProject.ensureProject,
  boardSnapshotFn = ghProject.boardSnapshot,
  fieldMapFn = ghProject.fieldMap,
  fetchOpenIssuesFn = fetchOpenIssues,
  readBudgetsFn = ghBudget.readBudgets,
} = {}) {
  const num = projectNumber === null || projectNumber === undefined ? ensureProjectFn() : projectNumber;
  const board = boardSnapshotFn({ refresh: true, projectNumber: num, ghFn, nowMs });
  const fields = fieldMapFn(num, { refresh: true });
  const openIssues = fetchOpenIssuesFn({ gql });
  const ledger = readBudgetsFn({ nowMs });
  const snapshot = {
    version: TRACKER_SNAPSHOT_VERSION,
    fetchedAtMs: nowMs,
    projectNumber: num,
    quotas: ledger && ledger.budgets ? ledger.budgets : null,
    openIssues,
    board: { items: board.items },
    fields,
  };
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

// ---- the read path (pure fs; ZERO network; refuses stale without refresh) ----
function loadTrackerSnapshot({ snapshotPath = TRACKER_SNAPSHOT, ttlMs = TRACKER_SNAPSHOT_TTL_MS, nowMs = Date.now(), allowStale = false } = {}) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch {
    throw new TrackerSnapshotStaleError(`tracker snapshot missing/unreadable at ${snapshotPath}; run refreshTrackerSnapshot() first`);
  }
  if (!raw || raw.version !== TRACKER_SNAPSHOT_VERSION) {
    throw new TrackerSnapshotStaleError(`tracker snapshot version ${raw && raw.version} != ${TRACKER_SNAPSHOT_VERSION}; refresh to regenerate`);
  }
  const fetchedAtMs = Number(raw.fetchedAtMs);
  if (!Number.isFinite(fetchedAtMs)) {
    throw new TrackerSnapshotStaleError("tracker snapshot carries no fetchedAtMs stamp; refresh to regenerate");
  }
  const ageMs = nowMs - fetchedAtMs;
  if (ageMs >= ttlMs && !allowStale) {
    throw new TrackerSnapshotStaleError(`tracker snapshot is stale (age ${Math.round(ageMs / 1000)}s >= ttl ${Math.round(ttlMs / 1000)}s); refusing without refresh`, { ageMs });
  }
  return { ...raw, ageMs, stale: ageMs >= ttlMs };
}

function invalidateTrackerSnapshot({ snapshotPath = TRACKER_SNAPSHOT } = {}) {
  fs.rmSync(snapshotPath, { force: true });
}

module.exports = {
  ROOT,
  TRACKER_DIR,
  TRACKER_SNAPSHOT,
  TRACKER_SNAPSHOT_VERSION,
  TRACKER_SNAPSHOT_TTL_MS,
  SEARCH_NODE_CAP,
  TrackerSnapshotStaleError,
  fetchOpenIssues,
  refreshTrackerSnapshot,
  loadTrackerSnapshot,
  invalidateTrackerSnapshot,
};
