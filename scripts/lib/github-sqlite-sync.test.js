#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const sync = require("./github-sqlite-sync.js");
const localIssues = require("./local-issues-db.js");

function tempDb(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "github-sqlite-sync-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, ".scratch/state/symphony-work/local-issues.sqlite");
}

function sqliteJson(dbPath, sql) {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" }).trim();
  return out ? JSON.parse(out) : [];
}

test("importSnapshotToSqlite mirrors GitHub repos, issues, projects, fields, items, and local issue rows", (t) => {
  const dbPath = tempDb(t);
  const snapshot = {
    org: "your-org",
    fetchedAt: "2026-06-28T00:00:00.000Z",
    repos: [
      { nameWithOwner: "your-org/repo-a", name: "repo-a", url: "https://github.com/your-org/repo-a", isPrivate: false, isArchived: false, pushedAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-02T00:00:00Z" },
    ],
    issues: [
      {
        repo: "your-org/repo-a",
        number: 1,
        nodeId: "I_1",
        databaseId: 101,
        title: "Parent story",
        body: "parent body",
        state: "OPEN",
        stateReason: "",
        url: "https://github.com/your-org/repo-a/issues/1",
        author: "mona",
        labels: ["enhancement", "ready-for-agent"],
        assignees: ["hubot"],
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-02T00:00:00Z",
        closedAt: "",
        milestone: null,
        parent: null,
        subIssues: [{ repo: "your-org/repo-a", number: 2 }],
        raw: { number: 1, title: "Parent story" },
      },
      {
        repo: "your-org/repo-a",
        number: 2,
        nodeId: "I_2",
        databaseId: 102,
        title: "Child task",
        body: "child body",
        state: "CLOSED",
        stateReason: "completed",
        url: "https://github.com/your-org/repo-a/issues/2",
        author: "mona",
        labels: ["bug", "wontfix"],
        assignees: [],
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-02T00:00:00Z",
        closedAt: "2026-06-03T00:00:00Z",
        milestone: { title: "legacy" },
        parent: { repo: "your-org/repo-a", number: 1 },
        subIssues: [],
        raw: { number: 2, title: "Child task" },
      },
    ],
    comments: [
      {
        repo: "your-org/repo-a",
        issueNumber: 1,
        id: 9001,
        nodeId: "IC_1",
        author: "octocat",
        body: "comment body",
        url: "https://github.com/your-org/repo-a/issues/1#issuecomment-9001",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
        raw: { id: 9001 },
      },
    ],
    projects: [
      { number: 2, id: "PVT_2", title: "CuraOS Roadmap", url: "https://github.com/orgs/your-org/projects/2", closed: false, raw: { number: 2 } },
    ],
    projectFields: [
      { projectNumber: 2, id: "F_status", name: "Status", dataType: "ProjectV2SingleSelectField", options: { Ready: "opt_ready" }, raw: { name: "Status" } },
    ],
    projectItems: [
      { projectNumber: 2, id: "PVTI_1", contentType: "Issue", issueRef: "your-org/repo-a#1", repo: "your-org/repo-a", number: 1, title: "Parent story", url: "https://github.com/your-org/repo-a/issues/1", fields: { Status: "Ready", "Target Version": "v1" }, raw: { id: "PVTI_1" } },
    ],
  };

  const summary = sync.importSnapshotToSqlite({ dbPath, snapshot });

  assert.equal(summary.repos, 1);
  assert.equal(summary.issues, 2);
  assert.equal(summary.comments, 1);
  assert.equal(summary.projects, 1);
  assert.equal(summary.projectItems, 1);
  assert.equal(sqliteJson(dbPath, "select count(*) as n from github_issues")[0].n, 2);
  assert.equal(sqliteJson(dbPath, "select count(*) as n from github_issue_comments")[0].n, 1);
  assert.equal(sqliteJson(dbPath, "select count(*) as n from github_project_items")[0].n, 1);
  assert.equal(sqliteJson(dbPath, "select parent_ref from github_issues where ref='your-org/repo-a#2'")[0].parent_ref, "your-org/repo-a#1");
  assert.equal(sqliteJson(dbPath, "select parent_id from local_issues where id='GH:your-org/repo-a#2'")[0].parent_id, "GH:your-org/repo-a#1");
  assert.equal(sqliteJson(dbPath, "select title, github_sync_status from local_issues where id='GH:your-org/repo-a#1'")[0].github_sync_status, "mirrored");
});

test("importSnapshotToSqlite clears stale mirror rows on each full sync", (t) => {
  const dbPath = tempDb(t);
  sync.importSnapshotToSqlite({
    dbPath,
    snapshot: {
      org: "your-org",
      fetchedAt: "2026-06-28T00:00:00.000Z",
      repos: [{ nameWithOwner: "your-org/repo-a", name: "repo-a" }],
      issues: [{ repo: "your-org/repo-a", number: 1, title: "Old", state: "OPEN", labels: [], assignees: [], raw: {} }],
      projects: [],
      projectFields: [],
      projectItems: [],
    },
  });
  sync.importSnapshotToSqlite({
    dbPath,
    snapshot: {
      org: "your-org",
      fetchedAt: "2026-06-28T00:01:00.000Z",
      repos: [{ nameWithOwner: "your-org/repo-b", name: "repo-b" }],
      issues: [{ repo: "your-org/repo-b", number: 7, title: "New", state: "OPEN", labels: [], assignees: [], raw: {} }],
      projects: [],
      projectFields: [],
      projectItems: [],
    },
  });

  assert.deepEqual(sqliteJson(dbPath, "select ref from github_issues order by ref"), [{ ref: "your-org/repo-b#7" }]);
  assert.deepEqual(sqliteJson(dbPath, "select id from local_issues where id like 'GH:%' order by id"), [{ id: "GH:your-org/repo-b#7" }]);
});

test("pushLocalMissingToGithub creates queued local issues in GitHub before the pull mirror", (t) => {
  const dbPath = tempDb(t);
  sync.ensureGithubMirrorTables({ dbPath });
  localIssues.createIssue({
    dbPath,
    id: "LOCAL-1",
    title: "Local queued issue",
    body: "Create me remotely",
    status: "open",
    githubRepo: "your-org/repo-a",
    githubSyncStatus: "queued",
  });
  const calls = [];
  const result = sync.pushLocalMissingToGithub({
    dbPath,
    snapshot: { projectItems: [] },
    createIssueFn: (row) => {
      calls.push(row.id);
      return { number: 33, html_url: "https://github.com/your-org/repo-a/issues/33" };
    },
  });

  assert.deepEqual(calls, ["LOCAL-1"]);
  assert.deepEqual(result.createdIssues, [{ id: "LOCAL-1", repo: "your-org/repo-a", number: 33, url: "https://github.com/your-org/repo-a/issues/33" }]);
  assert.equal(localIssues.getIssue({ dbPath, id: "LOCAL-1" }).github_issue_number, 33);
  assert.equal(localIssues.getIssue({ dbPath, id: "LOCAL-1" }).github_sync_status, "mirrored");
});
