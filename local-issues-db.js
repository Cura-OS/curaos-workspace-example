const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_DB_RELATIVE = ".scratch/state/symphony-work/local-issues.sqlite";
const MIGRATION_IDS = ["001_initial_local_issues", "002_local_issue_parent_hierarchy"];
const MIGRATION_ID = MIGRATION_IDS[0];

function defaultDbPath(root = process.cwd()) {
  return path.join(root, DEFAULT_DB_RELATIVE);
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`invalid numeric SQLite value: ${value}`);
  return String(n);
}

function now() {
  return new Date().toISOString();
}

function stableStringify(value) {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function toJson(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  return stableStringify(value);
}

function payloadHash(value) {
  return crypto.createHash("sha256").update(toJson(value)).digest("hex");
}

function runSql(dbPath, sql) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  execFileSync("sqlite3", ["-cmd", ".timeout 5000", dbPath], { input: sql, encoding: "utf8" });
}

function queryRows(dbPath, sql) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const out = execFileSync("sqlite3", ["-json", "-cmd", ".timeout 5000", dbPath, sql], { encoding: "utf8" }).trim();
  return out ? JSON.parse(out) : [];
}

function hasColumn(dbPath, table, column) {
  return queryRows(dbPath, `PRAGMA table_info(${table})`).some((row) => row.name === column);
}

function markMigration(dbPath, id) {
  runSql(dbPath, `INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (${sqlString(id)}, ${sqlString(now())});`);
}

function ensureDatabase({ dbPath = defaultDbPath() } = {}) {
  runSql(dbPath, `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_issues (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  owner_path TEXT NOT NULL DEFAULT '',
  workflow_name TEXT NOT NULL DEFAULT '',
  target_phase TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  github_repo TEXT NOT NULL DEFAULT '',
  github_issue_number INTEGER,
  github_sync_status TEXT NOT NULL DEFAULT 'not_queued'
);
CREATE TABLE IF NOT EXISTS local_issue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES local_issues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'local'
);
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES local_issues(id) ON DELETE CASCADE,
  worked TEXT NOT NULL DEFAULT '',
  failed TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  sync_needed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES local_issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  digest TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES local_issues(id) ON DELETE CASCADE,
  sync_kind TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  payload_hash TEXT NOT NULL,
  planned_command TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  result_handle TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  synced_at TEXT,
  UNIQUE(issue_id, sync_kind, target, payload_hash)
);
`);
  markMigration(dbPath, MIGRATION_IDS[0]);
  if (!hasColumn(dbPath, "local_issues", "parent_id")) {
    runSql(dbPath, "ALTER TABLE local_issues ADD COLUMN parent_id TEXT NOT NULL DEFAULT '';");
  }
  markMigration(dbPath, MIGRATION_IDS[1]);
  return { dbPath, migration: MIGRATION_IDS[MIGRATION_IDS.length - 1], migrations: MIGRATION_IDS };
}

function mustIssueId(id) {
  if (!id || !String(id).trim()) throw new Error("issue id is required");
  return String(id).trim();
}

function normalizeParentId(parentId) {
  if (parentId === undefined || parentId === null || parentId === "") return "";
  return mustIssueId(parentId);
}

function assertParentIssue({ dbPath, issueId, parentId }) {
  const parent = normalizeParentId(parentId);
  if (!parent) return "";
  if (parent === issueId) throw new Error(`local issue cannot be its own parent: ${issueId}`);
  const rows = queryRows(dbPath, `SELECT id FROM local_issues WHERE id = ${sqlString(parent)} LIMIT 1`);
  if (!rows.length) throw new Error(`parent local issue not found: ${parent}`);
  return parent;
}

function getIssue({ dbPath = defaultDbPath(), id }) {
  ensureDatabase({ dbPath });
  return queryRows(dbPath, `SELECT * FROM local_issues WHERE id = ${sqlString(mustIssueId(id))} LIMIT 1`)[0] || null;
}

function createIssue({
  dbPath = defaultDbPath(),
  id,
  parentId = "",
  title,
  body = "",
  status = "open",
  priority = "normal",
  ownerPath = "",
  workflowName = "",
  targetPhase = "",
  githubRepo = "",
  githubIssueNumber = null,
  githubSyncStatus = "not_queued",
}) {
  ensureDatabase({ dbPath });
  const issueId = mustIssueId(id);
  if (!title || !String(title).trim()) throw new Error("issue title is required");
  const parent = assertParentIssue({ dbPath, issueId, parentId });
  const stamp = now();
  runSql(dbPath, `
INSERT INTO local_issues (
  id, parent_id, title, body, status, priority, owner_path, workflow_name, target_phase,
  created_at, updated_at, github_repo, github_issue_number, github_sync_status
) VALUES (
  ${sqlString(issueId)}, ${sqlString(parent)}, ${sqlString(title)}, ${sqlString(body)}, ${sqlString(status)}, ${sqlString(priority)},
  ${sqlString(ownerPath)}, ${sqlString(workflowName)}, ${sqlString(targetPhase)}, ${sqlString(stamp)}, ${sqlString(stamp)},
  ${sqlString(githubRepo)}, ${sqlNumber(githubIssueNumber)}, ${sqlString(githubSyncStatus)}
)
ON CONFLICT(id) DO UPDATE SET
  parent_id = excluded.parent_id,
  title = excluded.title,
  body = excluded.body,
  status = excluded.status,
  priority = excluded.priority,
  owner_path = excluded.owner_path,
  workflow_name = excluded.workflow_name,
  target_phase = excluded.target_phase,
  updated_at = excluded.updated_at,
  github_repo = excluded.github_repo,
  github_issue_number = excluded.github_issue_number,
  github_sync_status = excluded.github_sync_status;
`);
  return getIssue({ dbPath, id: issueId });
}

const ISSUE_UPDATE_COLUMNS = {
  title: "title",
  parentId: "parent_id",
  body: "body",
  status: "status",
  priority: "priority",
  ownerPath: "owner_path",
  workflowName: "workflow_name",
  targetPhase: "target_phase",
  githubRepo: "github_repo",
  githubIssueNumber: "github_issue_number",
  githubSyncStatus: "github_sync_status",
};

function updateIssue({ dbPath = defaultDbPath(), id, ...updates }) {
  ensureDatabase({ dbPath });
  const issueId = mustIssueId(id);
  if (!getIssue({ dbPath, id: issueId })) throw new Error(`local issue not found: ${issueId}`);
  const sets = [];
  for (const [key, column] of Object.entries(ISSUE_UPDATE_COLUMNS)) {
    if (updates[key] === undefined) continue;
    const rawValue = key === "parentId" ? assertParentIssue({ dbPath, issueId, parentId: updates[key] }) : updates[key];
    const value = column === "github_issue_number" ? sqlNumber(rawValue) : sqlString(rawValue);
    sets.push(`${column} = ${value}`);
  }
  if (!sets.length) return getIssue({ dbPath, id: issueId });
  sets.push(`updated_at = ${sqlString(now())}`);
  runSql(dbPath, `UPDATE local_issues SET ${sets.join(", ")} WHERE id = ${sqlString(issueId)};`);
  return getIssue({ dbPath, id: issueId });
}

function listIssues({ dbPath = defaultDbPath(), status = null, workflowName = null, targetPhase = null, parentId = null, limit = null } = {}) {
  ensureDatabase({ dbPath });
  const clauses = [];
  if (status) clauses.push(`status = ${sqlString(status)}`);
  if (workflowName) clauses.push(`workflow_name = ${sqlString(workflowName)}`);
  if (targetPhase) clauses.push(`target_phase = ${sqlString(targetPhase)}`);
  if (parentId !== null && parentId !== undefined) clauses.push(`parent_id = ${sqlString(parentId)}`);
  const limitClause = limit === null || limit === undefined || limit === "" ? "" : ` LIMIT ${sqlNumber(limit)}`;
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return queryRows(dbPath, `SELECT * FROM local_issues ${where} ORDER BY created_at, id${limitClause}`);
}

function appendEvent({ dbPath = defaultDbPath(), issueId, eventType, payload = {}, actor = "local" }) {
  ensureDatabase({ dbPath });
  const id = mustIssueId(issueId);
  if (!getIssue({ dbPath, id })) throw new Error(`local issue not found: ${id}`);
  runSql(dbPath, `
INSERT INTO local_issue_events (issue_id, event_type, payload_json, created_at, actor)
VALUES (${sqlString(id)}, ${sqlString(eventType || "event")}, ${sqlString(toJson(payload || {}))}, ${sqlString(now())}, ${sqlString(actor || "local")});
`);
  return queryRows(dbPath, "SELECT * FROM local_issue_events ORDER BY id DESC LIMIT 1")[0];
}

function listEvents({ dbPath = defaultDbPath(), issueId }) {
  ensureDatabase({ dbPath });
  return queryRows(dbPath, `SELECT * FROM local_issue_events WHERE issue_id = ${sqlString(mustIssueId(issueId))} ORDER BY id`);
}

function appendReflection({ dbPath = defaultDbPath(), issueId, worked = "", failed = "", decision = "", followUp = "", evidence = [], syncNeeded = false }) {
  ensureDatabase({ dbPath });
  const id = mustIssueId(issueId);
  if (!getIssue({ dbPath, id })) throw new Error(`local issue not found: ${id}`);
  runSql(dbPath, `
INSERT INTO reflections (issue_id, worked, failed, decision, follow_up, evidence_json, sync_needed, created_at)
VALUES (${sqlString(id)}, ${sqlString(worked)}, ${sqlString(failed)}, ${sqlString(decision)}, ${sqlString(followUp)}, ${sqlString(toJson(evidence || []))}, ${syncNeeded ? 1 : 0}, ${sqlString(now())});
`);
  return queryRows(dbPath, "SELECT * FROM reflections ORDER BY id DESC LIMIT 1")[0];
}

function listReflections({ dbPath = defaultDbPath(), issueId }) {
  ensureDatabase({ dbPath });
  return queryRows(dbPath, `SELECT * FROM reflections WHERE issue_id = ${sqlString(mustIssueId(issueId))} ORDER BY id`);
}

function addEvidenceRef({ dbPath = defaultDbPath(), issueId, kind, command = "", path: evidencePath = "", digest = "", exitCode = null }) {
  ensureDatabase({ dbPath });
  const id = mustIssueId(issueId);
  if (!getIssue({ dbPath, id })) throw new Error(`local issue not found: ${id}`);
  runSql(dbPath, `
INSERT INTO evidence_refs (issue_id, kind, command, path, digest, exit_code, created_at)
VALUES (${sqlString(id)}, ${sqlString(kind || "evidence")}, ${sqlString(command)}, ${sqlString(evidencePath)}, ${sqlString(digest)}, ${sqlNumber(exitCode)}, ${sqlString(now())});
`);
  return queryRows(dbPath, "SELECT * FROM evidence_refs ORDER BY id DESC LIMIT 1")[0];
}

function listEvidenceRefs({ dbPath = defaultDbPath(), issueId }) {
  ensureDatabase({ dbPath });
  return queryRows(dbPath, `SELECT * FROM evidence_refs WHERE issue_id = ${sqlString(mustIssueId(issueId))} ORDER BY id`);
}

function enqueueSync({ dbPath = defaultDbPath(), issueId, syncKind, target = "", payload = {}, plannedCommand = "" }) {
  ensureDatabase({ dbPath });
  const id = mustIssueId(issueId);
  if (!getIssue({ dbPath, id })) throw new Error(`local issue not found: ${id}`);
  const hash = payloadHash(payload || {});
  runSql(dbPath, `
INSERT OR IGNORE INTO sync_outbox (issue_id, sync_kind, target, payload_hash, planned_command, status, created_at)
VALUES (${sqlString(id)}, ${sqlString(syncKind || "sync")}, ${sqlString(target)}, ${sqlString(hash)}, ${sqlString(plannedCommand)}, 'queued', ${sqlString(now())});
`);
  return queryRows(dbPath, `SELECT * FROM sync_outbox WHERE issue_id = ${sqlString(id)} AND sync_kind = ${sqlString(syncKind || "sync")} AND target = ${sqlString(target)} AND payload_hash = ${sqlString(hash)} LIMIT 1`)[0];
}

function listSyncOutbox({ dbPath = defaultDbPath(), status = null } = {}) {
  ensureDatabase({ dbPath });
  const where = status ? `WHERE status = ${sqlString(status)}` : "";
  return queryRows(dbPath, `SELECT * FROM sync_outbox ${where} ORDER BY id`);
}

function exportMarkdownSummary({ dbPath = defaultDbPath() } = {}) {
  ensureDatabase({ dbPath });
  const issues = listIssues({ dbPath });
  const rows = ["# Local Symphony Issues", "", `Database: ${dbPath}`, "", "| ID | Parent | Status | Title | GitHub sync |", "|---|---|---|---|---|"];
  for (const issue of issues) rows.push(`| ${issue.id} | ${issue.parent_id || ""} | ${issue.status} | ${issue.title} | ${issue.github_sync_status} |`);
  rows.push("", "## Reflections");
  for (const issue of issues) {
    for (const reflection of listReflections({ dbPath, issueId: issue.id })) {
      rows.push("", `### ${issue.id}`);
      rows.push(`- Worked: ${reflection.worked}`);
      rows.push(`- Failed: ${reflection.failed}`);
      rows.push(`- Decision: ${reflection.decision}`);
      rows.push(`- Follow-up: ${reflection.follow_up}`);
      rows.push(`- Sync needed: ${reflection.sync_needed ? "yes" : "no"}`);
    }
  }
  return `${rows.join("\n")}\n`;
}

module.exports = {
  DEFAULT_DB_RELATIVE,
  MIGRATION_ID,
  MIGRATION_IDS,
  defaultDbPath,
  ensureDatabase,
  createIssue,
  updateIssue,
  getIssue,
  listIssues,
  appendEvent,
  listEvents,
  appendReflection,
  listReflections,
  addEvidenceRef,
  listEvidenceRefs,
  enqueueSync,
  listSyncOutbox,
  exportMarkdownSummary,
  payloadHash,
};
