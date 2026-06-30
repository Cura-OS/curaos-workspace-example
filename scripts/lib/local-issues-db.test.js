#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const localIssues = require("./local-issues-db.js");

function tempDb(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-issues-db-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, ".scratch/state/symphony-work/local-issues.sqlite");
}

function sqliteJson(dbPath, sql) {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" }).trim();
  return out ? JSON.parse(out) : [];
}

test("ensureDatabase creates the local Symphony issue schema and migration marker", (t) => {
  const dbPath = tempDb(t);

  localIssues.ensureDatabase({ dbPath });

  assert.ok(fs.existsSync(dbPath));
  const tables = sqliteJson(dbPath, "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").map((r) => r.name);
  assert.deepEqual(tables, [
    "evidence_refs",
    "local_issue_events",
    "local_issues",
    "reflections",
    "schema_migrations",
    "sync_outbox",
  ]);
  assert.ok(sqliteJson(dbPath, "pragma table_info(local_issues)").some((column) => column.name === "parent_id"));
  assert.deepEqual(sqliteJson(dbPath, "select id from schema_migrations order by id"), [
    { id: "001_initial_local_issues" },
    { id: "002_local_issue_parent_hierarchy" },
  ]);
});

test("local issue CRUD, events, reflections, evidence, and sync outbox are durable and idempotent", (t) => {
  const dbPath = tempDb(t);
  localIssues.ensureDatabase({ dbPath });

  const created = localIssues.createIssue({
    dbPath,
    id: "SAA-07",
    title: "Local SQLite issue database",
    body: "Persist local Symphony issues before GitHub sync.",
    status: "in_progress",
    priority: "high",
    ownerPath: "scripts/lib/local-issues-db.js",
    workflowName: "symphony-adoption",
    targetPhase: "phase-2",
  });
  assert.equal(created.id, "SAA-07");
  assert.equal(created.github_sync_status, "not_queued");
  assert.equal(created.parent_id, "");

  const child = localIssues.createIssue({
    dbPath,
    id: "SAA-07-A",
    title: "CLI parent wiring",
    status: "open",
    parentId: "SAA-07",
    ownerPath: "scripts/local-issues.js",
    workflowName: "symphony-adoption",
  });
  assert.equal(child.parent_id, "SAA-07");
  assert.throws(
    () => localIssues.createIssue({ dbPath, id: "ORPHAN", title: "Orphan child", parentId: "MISSING" }),
    /parent local issue not found: MISSING/,
  );

  const updated = localIssues.updateIssue({ dbPath, id: "SAA-07-A", status: "done", githubSyncStatus: "queued", parentId: "" });
  assert.equal(updated.status, "done");
  assert.equal(updated.github_sync_status, "queued");
  assert.equal(updated.parent_id, "");

  localIssues.appendEvent({ dbPath, issueId: "SAA-07", eventType: "red", payload: { command: "node --test", status: 1 }, actor: "test" });
  localIssues.appendReflection({
    dbPath,
    issueId: "SAA-07",
    worked: "sqlite schema persisted",
    failed: "none",
    decision: "keep GitHub explicit-only",
    followUp: "wire CLI",
    evidence: [{ command: "node --test scripts/lib/local-issues-db.test.js", exitCode: 0 }],
    syncNeeded: false,
  });
  localIssues.addEvidenceRef({
    dbPath,
    issueId: "SAA-07",
    kind: "test",
    command: "node --test scripts/lib/local-issues-db.test.js",
    path: "scripts/lib/local-issues-db.test.js",
    digest: "sha256:test",
    exitCode: 0,
  });

  const firstSync = localIssues.enqueueSync({
    dbPath,
    issueId: "SAA-07",
    syncKind: "pr",
    target: "github-pr",
    payload: { title: "docs: symphony" },
    plannedCommand: "gh pr create --fill",
  });
  const secondSync = localIssues.enqueueSync({
    dbPath,
    issueId: "SAA-07",
    syncKind: "pr",
    target: "github-pr",
    payload: { title: "docs: symphony" },
    plannedCommand: "gh pr create --fill",
  });
  assert.equal(secondSync.id, firstSync.id);

  assert.equal(localIssues.getIssue({ dbPath, id: "SAA-07-A" }).status, "done");
  assert.equal(localIssues.listIssues({ dbPath }).length, 2);
  assert.equal(localIssues.listEvents({ dbPath, issueId: "SAA-07" }).length, 1);
  assert.equal(localIssues.listReflections({ dbPath, issueId: "SAA-07" }).length, 1);
  assert.equal(localIssues.listEvidenceRefs({ dbPath, issueId: "SAA-07" }).length, 1);
  assert.equal(localIssues.listSyncOutbox({ dbPath }).length, 1);
  const summary = localIssues.exportMarkdownSummary({ dbPath });
  assert.match(summary, /SAA-07/);
  assert.match(summary, /SAA-07-A/);
  assert.match(summary, /Local SQLite issue database/);
  assert.match(summary, /explicit-only/);
});

test("local-issues CLI supports create, list, reflect, evidence, sync queue, and markdown export without GitHub", (t) => {
  const dbPath = tempDb(t);
  const marker = path.join(path.dirname(dbPath), "gh-called");
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "fake-gh-"));
  t.after(() => fs.rmSync(fakeBin, { recursive: true, force: true }));
  fs.writeFileSync(path.join(fakeBin, "gh"), `#!/usr/bin/env bash\necho called > ${JSON.stringify(marker)}\nexit 64\n`);
  fs.chmodSync(path.join(fakeBin, "gh"), 0o755);
  const cli = path.resolve(__dirname, "../local-issues.js");
  const env = { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };

  const createParent = spawnSync(process.execPath, [cli, "create", "--db", dbPath, "--id", "SAA-ROOT", "--title", "CLI parent", "--status", "open", "--owner-path", "docs/agents", "--workflow-name", "symphony-adoption", "--json"], { encoding: "utf8", env });
  assert.equal(createParent.status, 0, createParent.stderr || createParent.stdout);

  const create = spawnSync(process.execPath, [cli, "create", "--db", dbPath, "--id", "SAA-CLI", "--title", "CLI issue", "--status", "in_progress", "--parent-id", "SAA-ROOT", "--owner-path", "scripts/local-issues.js", "--workflow-name", "symphony-adoption", "--json"], { encoding: "utf8", env });
  assert.equal(create.status, 0, create.stderr || create.stdout);
  assert.equal(JSON.parse(create.stdout).id, "SAA-CLI");
  assert.equal(JSON.parse(create.stdout).parent_id, "SAA-ROOT");

  const reflect = spawnSync(process.execPath, [cli, "reflect", "--db", dbPath, "--id", "SAA-CLI", "--worked", "cli worked", "--failed", "none", "--decision", "local first", "--follow-up", "close", "--sync-needed", "false", "--json"], { encoding: "utf8", env });
  assert.equal(reflect.status, 0, reflect.stderr || reflect.stdout);

  const evidence = spawnSync(process.execPath, [cli, "evidence", "--db", dbPath, "--id", "SAA-CLI", "--kind", "test", "--command", "node --test", "--path", "scripts/lib/local-issues-db.test.js", "--exit-code", "0", "--json"], { encoding: "utf8", env });
  assert.equal(evidence.status, 0, evidence.stderr || evidence.stdout);

  const queue = spawnSync(process.execPath, [cli, "sync-queue", "--db", dbPath, "--id", "SAA-CLI", "--sync-kind", "pr", "--target", "github-pr", "--planned-command", "gh pr create --fill", "--payload-json", "{\"title\":\"CLI issue\"}", "--json"], { encoding: "utf8", env });
  assert.equal(queue.status, 0, queue.stderr || queue.stdout);

  const list = spawnSync(process.execPath, [cli, "list", "--db", dbPath, "--json"], { encoding: "utf8", env });
  assert.equal(list.status, 0, list.stderr || list.stdout);
  assert.deepEqual(JSON.parse(list.stdout).map((row) => row.id), ["SAA-ROOT", "SAA-CLI"]);

  const filteredList = spawnSync(process.execPath, [
    cli,
    "list",
    "--db",
    dbPath,
    "--workflow-name",
    "symphony-adoption",
    "--parent-id",
    "SAA-ROOT",
    "--limit",
    "1",
    "--json",
  ], { encoding: "utf8", env });
  assert.equal(filteredList.status, 0, filteredList.stderr || filteredList.stdout);
  assert.deepEqual(JSON.parse(filteredList.stdout).map((row) => row.id), ["SAA-CLI"]);

  const exportMd = spawnSync(process.execPath, [cli, "export-markdown", "--db", dbPath], { encoding: "utf8", env });
  assert.equal(exportMd.status, 0, exportMd.stderr || exportMd.stdout);
  assert.match(exportMd.stdout, /SAA-CLI/);
  assert.match(exportMd.stdout, /CLI issue/);
  assert.equal(fs.existsSync(marker), false, "CLI must not call gh for local operations");
});

test("local-issues CLI exits quietly when stdout pipe closes early", (t) => {
  const dbPath = tempDb(t);
  localIssues.ensureDatabase({ dbPath });
  for (let index = 0; index < 300; index += 1) {
    localIssues.createIssue({
      dbPath,
      id: `PIPE-${index}`,
      title: `Pipe issue ${index}`,
      status: "done",
      ownerPath: "scripts/local-issues.js",
      workflowName: "symphony-adoption",
    });
  }

  const cli = path.resolve(__dirname, "../local-issues.js");
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} list --db ${JSON.stringify(dbPath)} --json | head -c 1 >/dev/null`;
  const result = spawnSync("bash", ["-lc", command], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stderr, /EPIPE|Unhandled 'error'/);
});
