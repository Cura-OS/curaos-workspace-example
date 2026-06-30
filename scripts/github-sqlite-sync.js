#!/usr/bin/env node
const sync = require("./lib/github-sqlite-sync.js");
const localIssues = require("./lib/local-issues-db.js");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return `Usage: node scripts/github-sqlite-sync.js [options]

Options:
  --db PATH              SQLite DB path (default: ${localIssues.DEFAULT_DB_RELATIVE})
  --org ORG              GitHub org (default: ${sync.DEFAULT_ORG})
  --snapshot-in PATH     Import an existing snapshot instead of calling GitHub
  --snapshot-out PATH    Write fetched snapshot (default: ${sync.DEFAULT_SNAPSHOT_PATH})
  --no-snapshot-out      Do not write the fetched snapshot
  --pull-only            Skip the default local-to-GitHub add pass
  --counts-only          Print current parity table counts without fetching
  --json                 Print JSON
`;
}

function print(value, asJson) {
  if (asJson) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === "string") process.stdout.write(value);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const asJson = Boolean(args.json);
  if (args.help || args.h) {
    print(usage(), false);
    return 0;
  }

  const dbPath = args.db || localIssues.defaultDbPath();
  if (args.countsOnly) {
    print(sync.parityCounts({ dbPath }), asJson || true);
    return 0;
  }

  const org = args.org || sync.DEFAULT_ORG;
  let snapshot = args.snapshotIn ? sync.readSnapshot(args.snapshotIn) : sync.fetchGithubSnapshot({ org });
  const dualSync = args.pullOnly ? { skipped: true, createdIssues: [], addedProjectItems: [] } : sync.pushLocalMissingToGithub({ dbPath, snapshot });
  if (!args.snapshotIn && (dualSync.createdIssues.length || dualSync.addedProjectItems.length)) {
    snapshot = sync.fetchGithubSnapshot({ org });
  }
  let snapshotPath = args.snapshotIn || "";
  if (!args.snapshotIn && args.snapshotOut !== false && args.noSnapshotOut !== true) {
    snapshotPath = args.snapshotOut || sync.DEFAULT_SNAPSHOT_PATH;
    sync.writeSnapshot(snapshot, snapshotPath);
  }
  const summary = sync.importSnapshotToSqlite({ dbPath, snapshot, snapshotPath });
  const counts = sync.parityCounts({ dbPath });
  print({ summary, dualSync, counts }, asJson || true);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
