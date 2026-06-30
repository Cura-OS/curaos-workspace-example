const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const localIssues = require("./local-issues-db.js");
const ghProject = require("./gh-project.js");

const GITHUB_PARITY_MIGRATION = "003_github_parity_mirror";
const DEFAULT_ORG = "your-org";
const DEFAULT_SNAPSHOT_PATH = ".scratch/state/symphony-work/github-parity-snapshot.json";

function now() {
  return new Date().toISOString();
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\u0000", "").replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  const n = Number(value);
  if (!Number.isFinite(n)) return "NULL";
  return String(n);
}

function sqlBool(value) {
  return value ? "1" : "0";
}

function jsonText(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function refFor(repo, number) {
  if (!repo || !number) return "";
  return `${repo}#${Number(number)}`;
}

function localIssueId(ref) {
  return ref ? `GH:${ref}` : "";
}

function runSql(dbPath, sql) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  execFileSync("sqlite3", [dbPath], { input: sql, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}

function queryRows(dbPath, sql) {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }).trim();
  return out ? JSON.parse(out) : [];
}

function ensureGithubMirrorTables({ dbPath = localIssues.defaultDbPath() } = {}) {
  localIssues.ensureDatabase({ dbPath });
  runSql(dbPath, `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS github_sync_runs (
  run_id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  status TEXT NOT NULL,
  repo_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  project_count INTEGER NOT NULL DEFAULT 0,
  project_field_count INTEGER NOT NULL DEFAULT 0,
  project_item_count INTEGER NOT NULL DEFAULT 0,
  hierarchy_available INTEGER NOT NULL DEFAULT 0,
  snapshot_path TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS github_repos (
  name_with_owner TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  is_private INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  pushed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  sync_run_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS github_issues (
  ref TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  node_id TEXT NOT NULL DEFAULT '',
  database_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  state_reason TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  labels_json TEXT NOT NULL DEFAULT '[]',
  assignees_json TEXT NOT NULL DEFAULT '[]',
  milestone_json TEXT NOT NULL DEFAULT 'null',
  parent_ref TEXT NOT NULL DEFAULT '',
  sub_issues_json TEXT NOT NULL DEFAULT '[]',
  project_items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  closed_at TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  sync_run_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS github_issues_repo_idx ON github_issues(repo);
CREATE INDEX IF NOT EXISTS github_issues_state_idx ON github_issues(state);
CREATE INDEX IF NOT EXISTS github_issues_parent_idx ON github_issues(parent_ref);
CREATE TABLE IF NOT EXISTS github_issue_comments (
  comment_id INTEGER PRIMARY KEY,
  issue_ref TEXT NOT NULL,
  repo TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  node_id TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  sync_run_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS github_issue_comments_issue_ref_idx ON github_issue_comments(issue_ref);
CREATE TABLE IF NOT EXISTS github_projects (
  project_number INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  closed INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}',
  sync_run_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS github_project_fields (
  project_number INTEGER NOT NULL,
  field_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  data_type TEXT NOT NULL DEFAULT '',
  options_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT NOT NULL DEFAULT '{}',
  sync_run_id TEXT NOT NULL,
  PRIMARY KEY(project_number, field_id)
);
CREATE TABLE IF NOT EXISTS github_project_items (
  project_number INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  issue_ref TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  repo TEXT NOT NULL DEFAULT '',
  number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  target_version TEXT NOT NULL DEFAULT '',
  curaos_milestone TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  issue_kind TEXT NOT NULL DEFAULT '',
  cycle TEXT NOT NULL DEFAULT '',
  initiative TEXT NOT NULL DEFAULT '',
  effort TEXT NOT NULL DEFAULT '',
  module TEXT NOT NULL DEFAULT '',
  fields_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT NOT NULL DEFAULT '{}',
  sync_run_id TEXT NOT NULL,
  PRIMARY KEY(project_number, item_id)
);
CREATE INDEX IF NOT EXISTS github_project_items_issue_ref_idx ON github_project_items(issue_ref);
INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (${sqlString(GITHUB_PARITY_MIGRATION)}, ${sqlString(now())});
`);
  return { dbPath, migration: GITHUB_PARITY_MIGRATION };
}

function normalizedKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function itemField(item, fieldName) {
  const wanted = normalizedKey(fieldName);
  for (const [key, value] of Object.entries(item || {})) {
    if (normalizedKey(key) === wanted && value !== null && value !== undefined) return String(value);
  }
  const fields = item && item.fields && typeof item.fields === "object" ? item.fields : {};
  for (const [key, value] of Object.entries(fields)) {
    if (normalizedKey(key) === wanted && value !== null && value !== undefined) return String(value);
  }
  return "";
}

function repoFromContent(content, item) {
  const repo = content && (content.repository || content.repositoryName || content.repositoryNameWithOwner);
  const fallback = item && (item.repository || item.repo);
  return String(repo || fallback || "").replace(/^https:\/\/github\.com\//, "");
}

function projectItemIssueRef(item) {
  const content = item && item.content ? item.content : {};
  const repo = repoFromContent(content, item);
  const number = content.number || item.number;
  return content.type === "Issue" && repo && number ? refFor(repo, number) : "";
}

function projectItemFields(item) {
  if (item && item.fields && typeof item.fields === "object" && !Array.isArray(item.fields)) return item.fields;
  const skip = new Set(["id", "content", "repository", "repo", "number", "title", "url", "type"]);
  const fields = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (skip.has(key)) continue;
    if (value === null || value === undefined || typeof value === "object") continue;
    fields[key] = value;
  }
  return fields;
}

function normalizeRepo(raw) {
  const nameWithOwner = raw.nameWithOwner || raw.fullName || raw.full_name || "";
  return {
    nameWithOwner,
    name: raw.name || nameWithOwner.split("/").pop() || "",
    url: raw.url || raw.html_url || (nameWithOwner ? `https://github.com/${nameWithOwner}` : ""),
    isPrivate: Boolean(raw.isPrivate ?? raw.private),
    isArchived: Boolean(raw.isArchived ?? raw.archived),
    pushedAt: raw.pushedAt || raw.pushed_at || "",
    updatedAt: raw.updatedAt || raw.updated_at || "",
    raw,
  };
}

function normalizeIssue(raw, repo, batchRecord = {}) {
  const labels = Array.isArray(raw.labels)
    ? raw.labels.map((label) => (typeof label === "string" ? label : label && label.name)).filter(Boolean)
    : [];
  const assignees = Array.isArray(raw.assignees)
    ? raw.assignees.map((assignee) => (typeof assignee === "string" ? assignee : assignee && assignee.login)).filter(Boolean)
    : [];
  const parent = batchRecord.parent || raw.parent || null;
  const subIssues = Array.isArray(batchRecord.subIssues) ? batchRecord.subIssues : Array.isArray(raw.subIssues) ? raw.subIssues : [];
  return {
    repo,
    number: Number(raw.number),
    nodeId: batchRecord.id || raw.node_id || raw.nodeId || raw.id || "",
    databaseId: batchRecord.databaseId || raw.database_id || raw.databaseId || null,
    title: batchRecord.title || raw.title || "",
    body: batchRecord.body !== undefined ? batchRecord.body : raw.body || "",
    state: batchRecord.state || raw.state || "",
    stateReason: raw.state_reason || raw.stateReason || "",
    url: raw.html_url || raw.url || "",
    author: raw.user?.login || raw.author?.login || raw.author || "",
    labels: batchRecord.labels && batchRecord.labels.length ? batchRecord.labels : labels,
    assignees,
    createdAt: raw.created_at || raw.createdAt || "",
    updatedAt: raw.updated_at || raw.updatedAt || "",
    closedAt: raw.closed_at || raw.closedAt || "",
    milestone: raw.milestone || null,
    parent,
    subIssues,
    raw,
  };
}

function normalizeComment(raw, repo, issueNumber) {
  const number = Number(raw.issueNumber || issueNumber);
  return {
    repo: raw.repo || repo || "",
    issueNumber: number,
    id: Number(raw.id),
    nodeId: raw.node_id || raw.nodeId || "",
    author: raw.user?.login || raw.author?.login || raw.author || "",
    body: raw.body || "",
    url: raw.html_url || raw.url || "",
    createdAt: raw.created_at || raw.createdAt || "",
    updatedAt: raw.updated_at || raw.updatedAt || "",
    raw,
  };
}

function normalizeProject(raw) {
  return {
    number: Number(raw.number),
    id: raw.id || "",
    title: raw.title || "",
    url: raw.url || "",
    closed: Boolean(raw.closed),
    raw,
  };
}

function normalizeProjectField(raw, projectNumber) {
  const options = {};
  if (Array.isArray(raw.options)) {
    for (const option of raw.options || []) {
      if (option && option.name) options[option.name] = option.id || option.name;
    }
  } else if (raw.options && typeof raw.options === "object") {
    Object.assign(options, raw.options);
  }
  return {
    projectNumber: Number(projectNumber),
    id: raw.id || raw.name || "",
    name: raw.name || "",
    dataType: raw.type || raw.dataType || "",
    options,
    raw,
  };
}

function normalizeProjectItem(raw, projectNumber) {
  const content = raw.content || {};
  const issueRef = raw.issueRef || projectItemIssueRef(raw);
  const repo = issueRef ? issueRef.replace(/#\d+$/, "") : repoFromContent(content, raw);
  const number = content.number || raw.number || null;
  const fields = projectItemFields(raw);
  return {
    projectNumber: Number(projectNumber),
    id: raw.id || "",
    contentType: content.type || raw.contentType || raw.type || "",
    issueRef,
    repo,
    number: number === null || number === undefined || number === "" ? null : Number(number),
    title: content.title || raw.title || "",
    url: content.url || raw.url || "",
    fields,
    status: itemField({ ...raw, fields }, "Status"),
    targetVersion: itemField({ ...raw, fields }, "Target Version"),
    curaosMilestone: itemField({ ...raw, fields }, "CuraOS Milestone"),
    priority: itemField({ ...raw, fields }, "Priority"),
    issueKind: itemField({ ...raw, fields }, "Issue Kind"),
    cycle: itemField({ ...raw, fields }, "Cycle"),
    initiative: itemField({ ...raw, fields }, "Initiative"),
    effort: itemField({ ...raw, fields }, "Effort"),
    module: itemField({ ...raw, fields }, "Module"),
    raw,
  };
}

function fetchJsonPages(args) {
  const pages = ghProject.gh(["api", "--paginate", "--slurp", ...args], { json: true });
  if (!Array.isArray(pages)) throw new Error(`expected paginated JSON array for gh api ${args.join(" ")}`);
  return pages.flatMap((page) => (Array.isArray(page) ? page : [page])).filter(Boolean);
}

function fetchRepos({ org = DEFAULT_ORG, limit = 1000 } = {}) {
  const data = ghProject.gh(["repo", "list", org, "--limit", String(limit), "--json", "nameWithOwner,name,url,isPrivate,isArchived,pushedAt,updatedAt"], { json: true });
  if (!Array.isArray(data)) throw new Error("gh repo list returned a non-array payload");
  if (data.length >= limit) throw new Error(`repo list reached limit ${limit}; refusing truncated sync`);
  return data.map(normalizeRepo).filter((repo) => repo.nameWithOwner);
}

function fetchIssuesForRepo(repo) {
  const rawIssues = fetchJsonPages([`repos/${repo}/issues?state=all&per_page=100`])
    .filter((issue) => issue && !issue.pull_request && Number.isFinite(Number(issue.number)));
  return rawIssues;
}

function fetchCommentsForIssue(repo, issueNumber) {
  const rawComments = fetchJsonPages([`repos/${repo}/issues/${Number(issueNumber)}/comments?per_page=100`]);
  return rawComments.map((comment) => normalizeComment(comment, repo, issueNumber)).filter((comment) => Number.isFinite(comment.id));
}

function fetchProjects({ org = DEFAULT_ORG, limit = 100 } = {}) {
  const list = ghProject.gh(["project", "list", "--owner", org, "--format", "json", "--limit", String(limit)], { json: true });
  const projects = Array.isArray(list.projects) ? list.projects : [];
  if (projects.length >= limit) throw new Error(`project list reached limit ${limit}; refusing truncated sync`);
  return projects.map((project) => {
    const number = Number(project.number);
    if (!Number.isFinite(number)) return normalizeProject(project);
    try {
      const view = ghProject.gh(["project", "view", String(number), "--owner", org, "--format", "json"], { json: true });
      return normalizeProject({ ...project, ...view, number });
    } catch {
      return normalizeProject(project);
    }
  }).filter((project) => Number.isFinite(project.number));
}

function fetchProjectFields(projectNumber, { org = DEFAULT_ORG } = {}) {
  const raw = ghProject.gh(["project", "field-list", String(projectNumber), "--owner", org, "--format", "json", "--limit", "100"], { json: true });
  return (raw.fields || []).map((field) => normalizeProjectField(field, projectNumber));
}

function fetchProjectItems(projectNumber, { org = DEFAULT_ORG, limit = 1000 } = {}) {
  const raw = ghProject.gh(["project", "item-list", String(projectNumber), "--owner", org, "--format", "json", "--limit", String(limit)], { json: true });
  const items = Array.isArray(raw.items) ? raw.items : [];
  if (items.length >= limit) throw new Error(`project ${projectNumber} item-list reached limit ${limit}; refusing truncated sync`);
  return items.map((item) => normalizeProjectItem(item, projectNumber));
}

function fetchIssueBatchDetails(issueRefs, { hierarchyAvailable = null } = {}) {
  if (!issueRefs.length) return new Map();
  const issueInputs = issueRefs.map((issue) => ({ repo: issue.repo, number: issue.number }));
  const includeHierarchy = hierarchyAvailable === null || hierarchyAvailable === undefined ? undefined : hierarchyAvailable;
  return ghProject.batchIssueRead(issueInputs, { includeHierarchy });
}

function fetchGithubSnapshot({ org = DEFAULT_ORG } = {}) {
  const fetchedAt = now();
  const repos = fetchRepos({ org });
  const issueShells = [];
  for (const repo of repos) {
    const rawIssues = fetchIssuesForRepo(repo.nameWithOwner);
    for (const raw of rawIssues) issueShells.push({ repo: repo.nameWithOwner, raw });
  }
  const hierarchyAvailable = ghProject.probeIssueHierarchyFields({ refresh: true });
  const batch = fetchIssueBatchDetails(issueShells.map((item) => ({ repo: item.repo, number: item.raw.number })), { hierarchyAvailable });
  const issues = issueShells.map(({ repo, raw }) => normalizeIssue(raw, repo, batch.get(refFor(repo, raw.number)) || {}));
  const comments = [];
  for (const { repo, raw } of issueShells) {
    if (Number(raw.comments || 0) <= 0) continue;
    for (const comment of fetchCommentsForIssue(repo, raw.number)) comments.push(comment);
  }
  const projects = fetchProjects({ org });
  const projectFields = [];
  const projectItems = [];
  for (const project of projects) {
    for (const field of fetchProjectFields(project.number, { org })) projectFields.push(field);
    for (const item of fetchProjectItems(project.number, { org })) projectItems.push(item);
  }
  return { org, fetchedAt, hierarchyAvailable, repos, issues, comments, projects, projectFields, projectItems };
}

function runIdFor(snapshot) {
  return `github-parity-${String(snapshot.fetchedAt || now()).replace(/[^0-9TZ]/g, "")}`;
}

function projectItemsByIssue(projectItems) {
  const map = new Map();
  for (const item of projectItems || []) {
    if (!item.issueRef) continue;
    if (!map.has(item.issueRef)) map.set(item.issueRef, []);
    map.get(item.issueRef).push({
      projectNumber: item.projectNumber,
      itemId: item.id,
      status: item.status || "",
      targetVersion: item.targetVersion || "",
      curaosMilestone: item.curaosMilestone || "",
      priority: item.priority || "",
      issueKind: item.issueKind || "",
      cycle: item.cycle || "",
      initiative: item.initiative || "",
      effort: item.effort || "",
      module: item.module || "",
    });
  }
  return map;
}

function localGithubIssuePushCandidates({ dbPath = localIssues.defaultDbPath() } = {}) {
  ensureGithubMirrorTables({ dbPath });
  return queryRows(dbPath, `
SELECT * FROM local_issues
WHERE id NOT LIKE 'GH:%'
  AND github_repo <> ''
  AND github_issue_number IS NULL
  AND github_sync_status IN ('queued', 'missing_remote', 'local_only', 'sync_needed')
ORDER BY created_at, id;
`);
}

function createGithubIssueFromLocal(row, { ghFn = ghProject.gh } = {}) {
  const throttle = ghProject.throttleContentOp(Date.now());
  if (!throttle.allowed) throw new Error(`content rate cap (${throttle.reason}); retry in ${Math.ceil(throttle.waitMs / 1000)}s`);
  return ghFn(["api", "-X", "POST", `repos/${row.github_repo}/issues`, "-f", `title=${row.title}`, "-f", `body=${row.body || row.title || row.id}`], { json: true });
}

function localProjectItemPushCandidates({ dbPath = localIssues.defaultDbPath(), snapshot } = {}) {
  ensureGithubMirrorTables({ dbPath });
  const live = new Set((snapshot.projectItems || []).map((item) => {
    const normalized = normalizeProjectItem(item, item.projectNumber);
    return `${normalized.projectNumber}:${normalized.issueRef}`;
  }));
  return queryRows(dbPath, "SELECT * FROM github_project_items WHERE issue_ref <> '' ORDER BY project_number, item_id")
    .filter((row) => !live.has(`${row.project_number}:${row.issue_ref}`));
}

function addProjectItemFromLocal(row, { dbPath = localIssues.defaultDbPath(), ghFn = ghProject.gh, addItemFn = ghProject.addItem } = {}) {
  const project = queryRows(dbPath, `SELECT * FROM github_projects WHERE project_number = ${sqlNumber(row.project_number)} LIMIT 1`)[0];
  let projectId = project && project.project_id;
  if (!projectId) {
    const view = ghFn(["project", "view", String(row.project_number), "--owner", DEFAULT_ORG, "--format", "json"], { json: true });
    projectId = view.id;
  }
  if (!projectId) throw new Error(`project id unavailable for project ${row.project_number}`);
  const issue = queryRows(dbPath, `SELECT * FROM github_issues WHERE ref = ${sqlString(row.issue_ref)} LIMIT 1`)[0];
  let contentId = issue && issue.node_id;
  if (!contentId) {
    const [owner, nameAndNumber] = String(row.issue_ref).split("/");
    const [name, number] = String(nameAndNumber || "").split("#");
    const liveIssue = ghFn(["api", `repos/${owner}/${name}/issues/${number}`], { json: true });
    contentId = liveIssue.node_id;
  }
  if (!contentId) throw new Error(`issue node id unavailable for ${row.issue_ref}`);
  return addItemFn(projectId, contentId);
}

function pushLocalMissingToGithub({ dbPath = localIssues.defaultDbPath(), snapshot, createIssueFn = createGithubIssueFromLocal, addProjectItemFn = addProjectItemFromLocal } = {}) {
  const createdIssues = [];
  for (const row of localGithubIssuePushCandidates({ dbPath })) {
    const created = createIssueFn(row);
    const number = Number(created.number);
    if (!Number.isFinite(number)) throw new Error(`created issue for ${row.id} did not return a number`);
    localIssues.updateIssue({ dbPath, id: row.id, githubIssueNumber: number, githubSyncStatus: "mirrored" });
    localIssues.appendEvent({ dbPath, issueId: row.id, eventType: "github-created", payload: { repo: row.github_repo, number, url: created.html_url || created.url || "" }, actor: "github-sqlite-sync" });
    createdIssues.push({ id: row.id, repo: row.github_repo, number, url: created.html_url || created.url || "" });
  }

  const addedProjectItems = [];
  if (snapshot) {
    for (const row of localProjectItemPushCandidates({ dbPath, snapshot })) {
      const itemId = addProjectItemFn(row, { dbPath });
      addedProjectItems.push({ projectNumber: row.project_number, issueRef: row.issue_ref, itemId });
    }
  }
  return { createdIssues, addedProjectItems };
}

function importSnapshotToSqlite({ dbPath = localIssues.defaultDbPath(), snapshot, snapshotPath = "" }) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("snapshot is required");
  ensureGithubMirrorTables({ dbPath });
  const stamp = now();
  const runId = runIdFor(snapshot);
  const repos = (snapshot.repos || []).map(normalizeRepo).filter((repo) => repo.nameWithOwner);
  const projects = (snapshot.projects || []).map(normalizeProject).filter((project) => Number.isFinite(project.number));
  const projectFields = (snapshot.projectFields || []).map((field) => normalizeProjectField(field, field.projectNumber)).filter((field) => Number.isFinite(field.projectNumber) && field.id);
  const projectItems = (snapshot.projectItems || []).map((item) => normalizeProjectItem(item, item.projectNumber)).filter((item) => Number.isFinite(item.projectNumber) && item.id);
  const comments = (snapshot.comments || []).map((comment) => normalizeComment({ ...(comment.raw || {}), ...comment }, comment.repo, comment.issueNumber)).filter((comment) => comment.repo && Number.isFinite(comment.issueNumber) && Number.isFinite(comment.id));
  const issueProjectItems = projectItemsByIssue(projectItems);
  const issues = (snapshot.issues || [])
    .map((issue) => normalizeIssue({ ...(issue.raw || {}), ...issue }, issue.repo, issue))
    .filter((issue) => issue.repo && Number.isFinite(Number(issue.number)));

  const statements = [];
  statements.push("PRAGMA foreign_keys = ON;");
  statements.push("BEGIN IMMEDIATE;");
  statements.push("DELETE FROM github_project_items;");
  statements.push("DELETE FROM github_project_fields;");
  statements.push("DELETE FROM github_projects;");
  statements.push("DELETE FROM github_issue_comments;");
  statements.push("DELETE FROM github_issues;");
  statements.push("DELETE FROM github_repos;");
  statements.push("DELETE FROM local_issues WHERE id LIKE 'GH:%';");
  const summary = {
    runId,
    org: snapshot.org || DEFAULT_ORG,
    fetchedAt: snapshot.fetchedAt || stamp,
    importedAt: stamp,
    repos: repos.length,
    issues: issues.length,
    comments: comments.length,
    projects: projects.length,
    projectFields: projectFields.length,
    projectItems: projectItems.length,
    hierarchyAvailable: Boolean(snapshot.hierarchyAvailable),
    snapshotPath,
  };
  statements.push(`INSERT OR REPLACE INTO github_sync_runs (run_id, org, fetched_at, imported_at, status, repo_count, issue_count, project_count, project_field_count, project_item_count, hierarchy_available, snapshot_path, summary_json) VALUES (${sqlString(runId)}, ${sqlString(summary.org)}, ${sqlString(summary.fetchedAt)}, ${sqlString(stamp)}, 'completed', ${repos.length}, ${issues.length}, ${projects.length}, ${projectFields.length}, ${projectItems.length}, ${sqlBool(summary.hierarchyAvailable)}, ${sqlString(snapshotPath)}, ${sqlString(jsonText(summary))});`);

  for (const repo of repos) {
    statements.push(`INSERT INTO github_repos (name_with_owner, name, url, is_private, is_archived, pushed_at, updated_at, raw_json, sync_run_id) VALUES (${sqlString(repo.nameWithOwner)}, ${sqlString(repo.name)}, ${sqlString(repo.url)}, ${sqlBool(repo.isPrivate)}, ${sqlBool(repo.isArchived)}, ${sqlString(repo.pushedAt)}, ${sqlString(repo.updatedAt)}, ${sqlString(jsonText(repo.raw || repo))}, ${sqlString(runId)});`);
  }

  const issueRefs = new Set(issues.map((issue) => refFor(issue.repo, issue.number)));
  for (const issue of issues) {
    const ref = refFor(issue.repo, issue.number);
    const parentRef = issue.parent && issue.parent.repo && issue.parent.number ? refFor(issue.parent.repo, issue.parent.number) : "";
    const subIssues = (issue.subIssues || []).map((sub) => refFor(sub.repo, sub.number)).filter(Boolean);
    const pitems = issueProjectItems.get(ref) || [];
    statements.push(`INSERT INTO github_issues (ref, repo, number, node_id, database_id, title, body, state, state_reason, url, author, labels_json, assignees_json, milestone_json, parent_ref, sub_issues_json, project_items_json, created_at, updated_at, closed_at, raw_json, sync_run_id) VALUES (${sqlString(ref)}, ${sqlString(issue.repo)}, ${sqlNumber(issue.number)}, ${sqlString(issue.nodeId)}, ${sqlNumber(issue.databaseId)}, ${sqlString(issue.title)}, ${sqlString(issue.body)}, ${sqlString(issue.state)}, ${sqlString(issue.stateReason)}, ${sqlString(issue.url)}, ${sqlString(issue.author)}, ${sqlString(jsonText(issue.labels || []))}, ${sqlString(jsonText(issue.assignees || []))}, ${sqlString(jsonText(issue.milestone || null))}, ${sqlString(parentRef)}, ${sqlString(jsonText(subIssues))}, ${sqlString(jsonText(pitems))}, ${sqlString(issue.createdAt)}, ${sqlString(issue.updatedAt)}, ${sqlString(issue.closedAt)}, ${sqlString(jsonText(issue.raw || issue))}, ${sqlString(runId)});`);
    statements.push(`INSERT INTO local_issues (id, parent_id, title, body, status, priority, owner_path, workflow_name, target_phase, created_at, updated_at, github_repo, github_issue_number, github_sync_status) VALUES (${sqlString(localIssueId(ref))}, '', ${sqlString(issue.title)}, ${sqlString(issue.body)}, ${sqlString(String(issue.state || '').toLowerCase())}, 'normal', ${sqlString(issue.repo)}, 'github-mirror', ${sqlString(pitems.map((item) => item.status).filter(Boolean).join(','))}, ${sqlString(issue.createdAt || stamp)}, ${sqlString(issue.updatedAt || stamp)}, ${sqlString(issue.repo)}, ${sqlNumber(issue.number)}, 'mirrored');`);
    if (parentRef && issueRefs.has(parentRef)) {
      statements.push(`UPDATE local_issues SET parent_id = ${sqlString(localIssueId(parentRef))} WHERE id = ${sqlString(localIssueId(ref))};`);
    }
  }

  for (const comment of comments) {
    const issueRef = refFor(comment.repo, comment.issueNumber);
    statements.push(`INSERT INTO github_issue_comments (comment_id, issue_ref, repo, issue_number, node_id, author, body, url, created_at, updated_at, raw_json, sync_run_id) VALUES (${sqlNumber(comment.id)}, ${sqlString(issueRef)}, ${sqlString(comment.repo)}, ${sqlNumber(comment.issueNumber)}, ${sqlString(comment.nodeId)}, ${sqlString(comment.author)}, ${sqlString(comment.body)}, ${sqlString(comment.url)}, ${sqlString(comment.createdAt)}, ${sqlString(comment.updatedAt)}, ${sqlString(jsonText(comment.raw || comment))}, ${sqlString(runId)});`);
  }

  for (const project of projects) {
    statements.push(`INSERT INTO github_projects (project_number, project_id, title, url, closed, raw_json, sync_run_id) VALUES (${sqlNumber(project.number)}, ${sqlString(project.id)}, ${sqlString(project.title)}, ${sqlString(project.url)}, ${sqlBool(project.closed)}, ${sqlString(jsonText(project.raw || project))}, ${sqlString(runId)});`);
  }
  for (const field of projectFields) {
    statements.push(`INSERT INTO github_project_fields (project_number, field_id, name, data_type, options_json, raw_json, sync_run_id) VALUES (${sqlNumber(field.projectNumber)}, ${sqlString(field.id)}, ${sqlString(field.name)}, ${sqlString(field.dataType)}, ${sqlString(jsonText(field.options || {}))}, ${sqlString(jsonText(field.raw || field))}, ${sqlString(runId)});`);
  }
  for (const item of projectItems) {
    statements.push(`INSERT INTO github_project_items (project_number, item_id, issue_ref, content_type, repo, number, title, url, status, target_version, curaos_milestone, priority, issue_kind, cycle, initiative, effort, module, fields_json, raw_json, sync_run_id) VALUES (${sqlNumber(item.projectNumber)}, ${sqlString(item.id)}, ${sqlString(item.issueRef)}, ${sqlString(item.contentType)}, ${sqlString(item.repo)}, ${sqlNumber(item.number)}, ${sqlString(item.title)}, ${sqlString(item.url)}, ${sqlString(item.status)}, ${sqlString(item.targetVersion)}, ${sqlString(item.curaosMilestone)}, ${sqlString(item.priority)}, ${sqlString(item.issueKind)}, ${sqlString(item.cycle)}, ${sqlString(item.initiative)}, ${sqlString(item.effort)}, ${sqlString(item.module)}, ${sqlString(jsonText(item.fields || {}))}, ${sqlString(jsonText(item.raw || item))}, ${sqlString(runId)});`);
  }
  statements.push("COMMIT;");
  runSql(dbPath, statements.join("\n"));
  return summary;
}

function writeSnapshot(snapshot, snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  return snapshotPath;
}

function readSnapshot(snapshotPath) {
  return JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
}

function parityCounts({ dbPath = localIssues.defaultDbPath() } = {}) {
  ensureGithubMirrorTables({ dbPath });
  const rows = queryRows(dbPath, `
SELECT 'repos' as name, count(*) as count from github_repos
UNION ALL SELECT 'issues', count(*) from github_issues
UNION ALL SELECT 'comments', count(*) from github_issue_comments
UNION ALL SELECT 'projects', count(*) from github_projects
UNION ALL SELECT 'project_fields', count(*) from github_project_fields
UNION ALL SELECT 'project_items', count(*) from github_project_items
UNION ALL SELECT 'local_github_issues', count(*) from local_issues where id like 'GH:%'
ORDER BY name;
`);
  return Object.fromEntries(rows.map((row) => [row.name, row.count]));
}

module.exports = {
  DEFAULT_ORG,
  DEFAULT_SNAPSHOT_PATH,
  GITHUB_PARITY_MIGRATION,
  ensureGithubMirrorTables,
  importSnapshotToSqlite,
  pushLocalMissingToGithub,
  localGithubIssuePushCandidates,
  localProjectItemPushCandidates,
  createGithubIssueFromLocal,
  addProjectItemFromLocal,
  fetchGithubSnapshot,
  fetchRepos,
  fetchIssuesForRepo,
  fetchCommentsForIssue,
  fetchProjects,
  fetchProjectFields,
  fetchProjectItems,
  normalizeRepo,
  normalizeIssue,
  normalizeComment,
  normalizeProject,
  normalizeProjectField,
  normalizeProjectItem,
  refFor,
  localIssueId,
  writeSnapshot,
  readSnapshot,
  parityCounts,
};
