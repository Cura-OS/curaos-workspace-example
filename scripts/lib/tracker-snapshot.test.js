// scripts/lib/tracker-snapshot.test.js
// RP-55 pilot acceptance: (a) converger dry-run reads complete against the snapshot with
// ZERO network calls (every collaborator is a counting stub; load issues none); (b) the
// staleness stamp is ENFORCED (refusal when older than TTL without refresh). Runner: bun test.
const { test, expect, beforeEach, afterEach } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tracker = require("./tracker-snapshot.js");

let tmpDir;
let snapshotPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-tracker-"));
  snapshotPath = path.join(tmpDir, "tracker-snapshot.json");
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// Counting stubs: every network-shaped collaborator increments a shared ledger so the tests
// can assert exactly which phase paid for calls (refresh) and which paid nothing (load).
function stubs(ledger) {
  return {
    ensureProjectFn: () => {
      ledger.calls += 1;
      return 7;
    },
    boardSnapshotFn: ({ refresh, projectNumber }) => {
      ledger.calls += 1;
      expect(refresh).toBe(true);
      expect(projectNumber).toBe(7);
      return { items: [{ id: "ITEM_1", title: "Story A", status: "Ready" }], path: "(stub)", fetchedAtMs: 1, fromCache: false };
    },
    fieldMapFn: (num, { refresh } = {}) => {
      ledger.calls += 1;
      expect(num).toBe(7);
      expect(refresh).toBe(true);
      return { Status: { id: "F_status", options: { Done: "opt_done" } } };
    },
    fetchOpenIssuesFn: () => {
      ledger.calls += 1;
      return [{ repo: "org/repo-a", number: 12, state: "OPEN", title: "Open story", url: "https://x", labels: ["ready-for-agent"] }];
    },
    readBudgetsFn: () => {
      ledger.calls += 1;
      return { fetchedAtMs: 1, graphqlProbe: "graphql", budgets: { core: { limit: 5000, remaining: 4000, resetAt: null }, graphql: { limit: 5000, remaining: 3000, resetAt: null }, search: { limit: 30, remaining: 30, resetAt: null } } };
    },
  };
}

// ============================ refresh composes the versioned snapshot ============================

test("refreshTrackerSnapshot writes versioned JSON stamped with fetch time + remaining quotas", () => {
  const ledger = { calls: 0 };
  const snap = tracker.refreshTrackerSnapshot({ nowMs: 5000, snapshotPath, ...stubs(ledger) });
  expect(ledger.calls).toBe(5); // project + board + fields + issues + quotas: the refresh pays
  expect(snap.version).toBe(tracker.TRACKER_SNAPSHOT_VERSION);
  expect(snap.fetchedAtMs).toBe(5000);
  expect(snap.projectNumber).toBe(7);
  expect(snap.quotas.graphql.remaining).toBe(3000); // the blocked-by-external pre-check stamp
  expect(snap.openIssues[0]).toEqual({ repo: "org/repo-a", number: 12, state: "OPEN", title: "Open story", url: "https://x", labels: ["ready-for-agent"] });
  expect(snap.board.items[0].id).toBe("ITEM_1");
  expect(snap.fields.Status.options.Done).toBe("opt_done");
  const onDisk = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  expect(onDisk.version).toBe(1);
  expect(onDisk.fetchedAtMs).toBe(5000);
});

// ============================ RP-55 acceptance: zero-network dry-run reads ============================

test("converger dry-run pattern: reads after one refresh complete with ZERO further network calls (ledger)", () => {
  const ledger = { calls: 0 };
  tracker.refreshTrackerSnapshot({ nowMs: 1000, snapshotPath, ...stubs(ledger) });
  const paidByRefresh = ledger.calls;

  // Two consecutive dry-run style reads: open-issue filter + board/field resolution, the
  // exact reads a converger needs. loadTrackerSnapshot has NO network-capable collaborator
  // (pure fs), and the stub ledger proves nothing else was invoked.
  const first = tracker.loadTrackerSnapshot({ snapshotPath, nowMs: 1000 + 60_000 });
  const ready = first.openIssues.filter((i) => i.labels.includes("ready-for-agent"));
  expect(ready.length).toBe(1);
  const second = tracker.loadTrackerSnapshot({ snapshotPath, nowMs: 1000 + 120_000 });
  expect(second.fields.Status.id).toBe("F_status");
  expect(second.board.items.length).toBe(1);

  expect(ledger.calls).toBe(paidByRefresh); // ZERO additional calls for both reads
});

// ============================ RP-55 acceptance: staleness refusal ============================

test("staleness stamp enforced: a read older than TTL refuses without refresh", () => {
  const ledger = { calls: 0 };
  tracker.refreshTrackerSnapshot({ nowMs: 1000, snapshotPath, ...stubs(ledger) });
  const expired = 1000 + tracker.TRACKER_SNAPSHOT_TTL_MS; // exactly at TTL = stale (>=)
  expect(() => tracker.loadTrackerSnapshot({ snapshotPath, nowMs: expired })).toThrow(tracker.TrackerSnapshotStaleError);
  try {
    tracker.loadTrackerSnapshot({ snapshotPath, nowMs: expired });
  } catch (error) {
    expect(error.code).toBe("tracker-snapshot-stale");
    expect(error.message).toContain("refusing without refresh");
  }
  // Explicit opt-in returns it MARKED stale (for declare-blocked-by-external reporting).
  const stale = tracker.loadTrackerSnapshot({ snapshotPath, nowMs: expired, allowStale: true });
  expect(stale.stale).toBe(true);
  // A refresh clears the refusal.
  tracker.refreshTrackerSnapshot({ nowMs: expired, snapshotPath, ...stubs(ledger) });
  const fresh = tracker.loadTrackerSnapshot({ snapshotPath, nowMs: expired + 1000 });
  expect(fresh.stale).toBe(false);
});

test("missing and version-mismatched snapshots refuse with the stale error class", () => {
  expect(() => tracker.loadTrackerSnapshot({ snapshotPath, nowMs: 1 })).toThrow(tracker.TrackerSnapshotStaleError);
  fs.writeFileSync(snapshotPath, JSON.stringify({ version: 99, fetchedAtMs: 1, openIssues: [] }));
  expect(() => tracker.loadTrackerSnapshot({ snapshotPath, nowMs: 2 })).toThrow(/version 99/);
  fs.writeFileSync(snapshotPath, JSON.stringify({ version: 1, openIssues: [] })); // no stamp
  expect(() => tracker.loadTrackerSnapshot({ snapshotPath, nowMs: 2 })).toThrow(/no fetchedAtMs stamp/);
});

test("invalidateTrackerSnapshot removes the snapshot so the next read refuses", () => {
  const ledger = { calls: 0 };
  tracker.refreshTrackerSnapshot({ nowMs: 1000, snapshotPath, ...stubs(ledger) });
  tracker.invalidateTrackerSnapshot({ snapshotPath });
  expect(() => tracker.loadTrackerSnapshot({ snapshotPath, nowMs: 1001 })).toThrow(/missing/);
});

// ============================ open-issue enumeration ============================

test("fetchOpenIssues paginates by cursor and flattens repo + labels", () => {
  const pages = [
    {
      data: {
        search: {
          issueCount: 3,
          pageInfo: { hasNextPage: true, endCursor: "C1" },
          nodes: [
            { number: 1, state: "OPEN", title: "A", url: "u1", labels: { nodes: [{ name: "bug" }] }, repository: { nameWithOwner: "org/r1" } },
            { number: 2, state: "OPEN", title: "B", url: "u2", labels: { nodes: [] }, repository: { nameWithOwner: "org/r2" } },
          ],
        },
      },
    },
    {
      data: {
        search: {
          issueCount: 3,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ number: 3, state: "OPEN", title: "C", url: "u3", labels: { nodes: [{ name: "ready-for-agent" }] }, repository: { nameWithOwner: "org/r1" } }],
        },
      },
    },
  ];
  const docs = [];
  const gql = (doc) => {
    docs.push(doc);
    return pages.shift();
  };
  const issues = tracker.fetchOpenIssues({ gql });
  expect(issues.length).toBe(3);
  expect(issues[2]).toEqual({ repo: "org/r1", number: 3, state: "OPEN", title: "C", url: "u3", labels: ["ready-for-agent"] });
  expect(docs.length).toBe(2);
  expect(docs[1]).toContain('after:"C1"'); // second page rode the cursor
});

test("fetchOpenIssues fails CLOSED past the search node cap (truncation class)", () => {
  const gql = () => ({ data: { search: { issueCount: tracker.SEARCH_NODE_CAP + 1, pageInfo: { hasNextPage: false }, nodes: [] } } });
  expect(() => tracker.fetchOpenIssues({ gql })).toThrow(/refusing truncated snapshot/);
});
